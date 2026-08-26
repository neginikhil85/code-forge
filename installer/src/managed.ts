import * as fs from "node:fs/promises";
import * as path from "node:path";

/**
 * Ownership marker. Its presence in a file is the contract: code-forge owns this
 * file and `code-forge update` may replace it. Remove the marker and the file
 * becomes yours — update leaves it alone from then on.
 */
export const MANAGED_MARKER = "managed by code-forge";

const MANAGED_NOTE_LINES = [
  `${MANAGED_MARKER} — replaced by \`code-forge update\`.`,
  "To customize: delete this marker block and update will never touch the file again.",
];

/**
 * A `<!-- -->` block is only valid in markdown, HTML and XML. Prepending one to a
 * `.java` file produces a file that does not compile, which is why the quality-gate
 * templates used to be excluded from the bundle rather than marked.
 */
function managedNoteFor(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case ".java":
      return `${MANAGED_NOTE_LINES.map((line) => `// ${line}`).join("\n")}\n`;
    case ".yml":
    case ".yaml":
    case ".properties":
      return `${MANAGED_NOTE_LINES.map((line) => `# ${line}`).join("\n")}\n`;
    default:
      return `<!--\n${MANAGED_NOTE_LINES.map((line) => `  ${line}`).join("\n")}\n-->\n`;
  }
}

/**
 * Prefixes that must keep their position at byte 0 of the file. YAML frontmatter is
 * only recognized when `---` is the very first byte, and an XML declaration is only
 * legal as the first thing in the document — so the marker goes after them, not before.
 */
const POSITION_LOCKED_PREFIXES = [/^---\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n/, /^<\?xml[^>]*\?>[ \t]*\r?\n?/];

export function withManagedNote(content: string, filePath: string): string {
  if (content.includes(MANAGED_MARKER)) return content;

  const note = managedNoteFor(filePath);
  for (const pattern of POSITION_LOCKED_PREFIXES) {
    const match = pattern.exec(content);
    if (!match) continue;
    const prefix = match[0].endsWith("\n") ? match[0] : `${match[0]}\n`;
    return `${prefix}${note}${content.slice(match[0].length)}`;
  }
  return `${note}${content}`;
}

/**
 * Serializes a string as a double-quoted YAML scalar. Emitting descriptions bare is
 * what made the generated rule frontmatter unparseable: any value containing `": "`
 * reads as a nested mapping, and a bare ` #` starts a comment.
 */
export function yamlScalar(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function frontmatterBlock(entries: Array<[string, string]>): string {
  return ["---", ...entries.map(([key, value]) => `${key}: ${value}`), "---", ""].join("\n");
}

export interface SyncReport {
  written: string[];
  updated: string[];
  unchanged: string[];
  preserved: string[];
  /** Managed files deleted because the source content no longer produces them. */
  removed: string[];
  /** Non-fatal problems worth surfacing: a failed prune, a skipped directory. */
  warnings: string[];
  /**
   * Manual follow-up printed after the file summary. Printing setup steps from inside
   * the copy loop scrolled them off the top before the developer saw what changed.
   */
  setupNotes: string[];
}

export function createSyncReport(): SyncReport {
  return { written: [], updated: [], unchanged: [], preserved: [], removed: [], warnings: [], setupNotes: [] };
}

async function readIfExists(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    const failure = error as NodeJS.ErrnoException;
    if (failure.code === "ENOENT") return null;
    // Node's EISDIR and EACCES messages do not always name the path.
    throw new Error(`Cannot read ${filePath} (${failure.code ?? failure.message}).`, { cause: error });
  }
}

/**
 * Replaces a file's contents without ever leaving it half-written. A truncated write is
 * the one failure the marker contract cannot survive: if the interruption lands before
 * the marker, the next `update` reads the wreckage as a file the developer adopted and
 * refuses to repair it. Rename is atomic on both POSIX and Windows.
 *
 * Some synced filesystems refuse rename-over-existing, so a direct write is kept as a
 * fallback — worse guarantees, but better than failing the install.
 */
async function writeFileAtomically(filePath: string, content: string): Promise<void> {
  const temporaryPath = `${filePath}.code-forge-tmp`;
  try {
    await fs.writeFile(temporaryPath, content);
    await fs.rename(temporaryPath, filePath);
  } catch {
    await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
    await fs.writeFile(filePath, content);
  }
}

/**
 * Writes a file code-forge owns, honoring the marker contract. A file whose marker
 * has been removed is treated as adopted by the developer and is never overwritten.
 */
export async function writeManagedFile(
  filePath: string,
  desiredContent: string,
  report: SyncReport,
): Promise<void> {
  const existing = await readIfExists(filePath);

  if (existing === null) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await writeFileAtomically(filePath, desiredContent);
    report.written.push(filePath);
    return;
  }
  if (!existing.includes(MANAGED_MARKER)) {
    report.preserved.push(filePath);
    return;
  }
  if (existing === desiredContent) {
    report.unchanged.push(filePath);
    return;
  }
  await writeFileAtomically(filePath, desiredContent);
  report.updated.push(filePath);
}

/**
 * Deletes managed files under the directories code-forge owns that this run did not
 * produce. Without it nothing is ever retired: renaming a source document leaves the
 * old name installed forever, and dropping a stack leaves its guidance active in every
 * project that ever installed it — the agent keeps reading rules that no longer exist
 * upstream.
 *
 * Only files still carrying the marker are removed, so anything the developer adopted
 * survives. That is the same contract `update` already honors for overwriting.
 */
export async function pruneManagedFiles(
  targetProjectRoot: string,
  ownedDirectories: string[],
  report: SyncReport,
): Promise<void> {
  const touched = new Set([...report.written, ...report.updated, ...report.unchanged, ...report.preserved]);

  for (const relativeDirectory of ownedDirectories) {
    await pruneDirectory(path.join(targetProjectRoot, relativeDirectory), touched, report);
  }
}

/** Returns true when the directory holds nothing this run wants to keep. */
async function pruneDirectory(directory: string, touched: Set<string>, report: SyncReport): Promise<boolean> {
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    report.warnings.push(`Could not scan ${directory} for stale files.`);
    return false;
  }

  let disposable = true;
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      if (await pruneDirectory(entryPath, touched, report)) {
        await fs.rmdir(entryPath).catch(() => undefined);
      } else {
        disposable = false;
      }
      continue;
    }
    if (touched.has(entryPath) || !entry.isFile()) {
      disposable = false;
      continue;
    }

    const existing = await readIfExists(entryPath);
    if (existing === null || !existing.includes(MANAGED_MARKER)) {
      disposable = false;
      continue;
    }
    try {
      await fs.rm(entryPath);
      report.removed.push(entryPath);
    } catch {
      disposable = false;
      report.warnings.push(`Could not delete the stale managed file ${entryPath} — remove it by hand.`);
    }
  }
  return disposable;
}

export function describeSyncReport(report: SyncReport, targetProjectRoot: string): string {
  const relative = (filePath: string): string => path.relative(targetProjectRoot, filePath) || filePath;

  const counts = [
    `${report.written.length} added`,
    `${report.updated.length} updated`,
    `${report.unchanged.length} unchanged`,
    `${report.preserved.length} preserved`,
    `${report.removed.length} removed`,
  ].join(", ");

  const lines = [`Files: ${counts}`];

  if (report.preserved.length > 0) {
    // Deliberately describes what was observed rather than why: a file can also lose its
    // marker to a bad merge, and claiming the developer adopted it would be a guess.
    lines.push("", "No `managed by code-forge` marker — left untouched:");
    for (const filePath of report.preserved) lines.push(`  ${relative(filePath)}`);
  }
  if (report.removed.length > 0) {
    lines.push("", "Removed — no longer part of the installed content:");
    for (const filePath of report.removed) lines.push(`  ${relative(filePath)}`);
  }
  if (report.warnings.length > 0) {
    lines.push("", ...report.warnings.map((warning) => `Warning: ${warning}`));
  }
  return lines.join("\n");
}
