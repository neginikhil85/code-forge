import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import { SyncReport } from "../managed";
import { resolveIde, resolveStacks } from "../registry";

/**
 * Content root, three levels up from `dist/tests`. Tests run against the real content
 * tree on purpose: a snapshot test over fixtures would not have caught the reference
 * and delivery defects these tests exist to prevent.
 */
export const CONTENT_ROOT = path.resolve(__dirname, "..", "..", "..");

const CLI_ENTRY = path.resolve(__dirname, "..", "cli.js");

export async function makeTempProject(label: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), `code-forge-${label}-`));
}

/** Runs an emitter directly, with the content root pinned. */
export async function install(
  targetProjectRoot: string,
  ideId: string,
  stackIds: string[] = ["java-spring"],
): Promise<SyncReport> {
  process.env.CODE_FORGE_ROOT = CONTENT_ROOT;
  return resolveIde(ideId).emit(targetProjectRoot, resolveStacks(stackIds));
}

export interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Runs the built CLI as a child process. Calling the emitters directly cannot cover the
 * argument handling, manifest ordering and default-flag logic that live in cli.ts — which
 * is exactly where the "update re-syncs the wrong IDE" bug lived.
 */
export async function runCli(args: string[], env: Record<string, string> = {}): Promise<CliResult> {
  try {
    const { stdout, stderr } = await promisify(execFile)(process.execPath, [CLI_ENTRY, ...args], {
      env: { ...process.env, CODE_FORGE_ROOT: CONTENT_ROOT, ...env },
      maxBuffer: 10 * 1024 * 1024,
    });
    return { exitCode: 0, stdout, stderr };
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string };
    return { exitCode: failure.code ?? 1, stdout: failure.stdout ?? "", stderr: failure.stderr ?? "" };
  }
}

export async function listFilesRecursively(root: string): Promise<string[]> {
  const found: string[] = [];
  async function walk(directory: string): Promise<void> {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(entryPath);
      else found.push(path.relative(root, entryPath).split(path.sep).join("/"));
    }
  }
  await walk(root);
  return found.sort();
}

export function read(targetProjectRoot: string, relativePath: string): Promise<string> {
  return fs.readFile(path.join(targetProjectRoot, relativePath), "utf8");
}

export type FrontmatterValue = string | string[] | boolean;

/**
 * Strict parser for the exact YAML subset the emitters produce. Hand-rolled because the
 * installer has no YAML dependency and adding one would let the test pass against a
 * parser more forgiving than the IDEs'.
 *
 * It throws on anything it does not recognize — notably an unquoted scalar containing
 * `": "`, which is how the malformed rule descriptions shipped unnoticed.
 *
 * CRLF is accepted. A Windows checkout produces it, and rejecting it would fail CI for a
 * reason unrelated to what these tests are checking. What is *not* relaxed: the opening
 * `---` must still be at byte 0.
 */
export function parseFrontmatter(raw: string): Record<string, FrontmatterValue> {
  const opening = /^---\r?\n/.exec(raw);
  if (!opening) {
    throw new Error(`frontmatter must open with "---" at byte 0, found ${JSON.stringify(raw.slice(0, 12))}`);
  }
  const body = raw.slice(opening[0].length);
  const closing = /(?:^|\r?\n)---[ \t]*(?:\r?\n|$)/.exec(body);
  if (!closing) throw new Error("frontmatter block is never closed by a line containing only ---");

  const parsed: Record<string, FrontmatterValue> = {};
  let openSequenceKey: string | null = null;

  for (const line of body.slice(0, closing.index).split(/\r?\n/)) {
    if (line.trim().length === 0) continue;

    if (line.startsWith("  - ")) {
      if (openSequenceKey === null) throw new Error(`sequence item with no preceding key: ${line}`);
      (parsed[openSequenceKey] as string[]).push(parseScalarAsString(line.slice(4).trim()));
      continue;
    }

    const keyed = /^([A-Za-z_][\w-]*):(.*)$/.exec(line);
    if (!keyed) throw new Error(`not a "key: value" line: ${JSON.stringify(line)}`);

    const [, key, rest] = keyed;
    if (key in parsed) throw new Error(`duplicate key "${key}"`);
    const value = rest.trim();

    if (value.length === 0) {
      parsed[key] = [];
      openSequenceKey = key;
      continue;
    }
    openSequenceKey = null;
    parsed[key] = parseScalar(value);
  }
  return parsed;
}

function parseScalar(value: string): FrontmatterValue {
  if (value === "true") return true;
  if (value === "false") return false;
  if (value.startsWith("[")) {
    const items: unknown = JSON.parse(value);
    if (!Array.isArray(items) || items.some((item) => typeof item !== "string")) {
      throw new Error(`flow sequence must contain only strings: ${value}`);
    }
    return items as string[];
  }
  return parseScalarAsString(value);
}

function parseScalarAsString(value: string): string {
  if (value.startsWith('"')) {
    const decoded: unknown = JSON.parse(value);
    if (typeof decoded !== "string") throw new Error(`not a string scalar: ${value}`);
    return decoded;
  }
  if (value.includes(": ")) {
    throw new Error(`unquoted scalar contains ": ", which YAML reads as a nested mapping: ${value}`);
  }
  // ` #` opens a comment in real YAML, silently truncating the value. Workflow frontmatter
  // is passed through verbatim, so a description written with a `#` would arrive here.
  if (/\s#/.test(value)) {
    throw new Error(`unquoted scalar contains " #", which YAML reads as a trailing comment: ${value}`);
  }
  if (/^[-?:,[\]{}#&*!|>'"%@`]/.test(value)) {
    throw new Error(`unquoted scalar starts with a YAML indicator character: ${value}`);
  }
  return value;
}

/**
 * Expands `(?i:...)` modifier groups, which Java supports and JavaScript does not, into
 * per-character classes so the Checkstyle patterns can be exercised here. Letters inside
 * the group become `[aA]`; metacharacters are left alone.
 *
 * The translation is only sound for plain alternations of letters. `\d` would become
 * `\[dD]` and `[a-z]` would become `[[aA]-[zZ]]`, so both are rejected outright rather
 * than silently producing a pattern that differs from what Checkstyle will run.
 */
export function javaRegexToJs(pattern: string): string {
  const marker = "(?i:";
  const start = pattern.indexOf(marker);
  if (start === -1) return pattern;

  let depth = 1;
  let cursor = start + marker.length;
  while (cursor < pattern.length && depth > 0) {
    const character = pattern[cursor];
    if (character === "\\") {
      cursor += 2;
      continue;
    }
    if (character === "(") depth += 1;
    else if (character === ")") depth -= 1;
    if (depth === 0) break;
    cursor += 1;
  }
  if (depth !== 0) throw new Error(`unbalanced (?i: group in ${pattern}`);

  const raw = pattern.slice(start + marker.length, cursor);
  if (/[\\[]/.test(raw)) {
    throw new Error(
      `cannot faithfully translate escapes or character classes inside (?i:...): ${JSON.stringify(raw)}. ` +
        "Rewrite the Checkstyle pattern using plain letter alternations, or verify it against real Java instead.",
    );
  }
  const inner = raw.replace(/[a-zA-Z]/g, (letter) => `[${letter.toLowerCase()}${letter.toUpperCase()}]`);
  return javaRegexToJs(`${pattern.slice(0, start)}(?:${inner})${pattern.slice(cursor + 1)}`);
}
