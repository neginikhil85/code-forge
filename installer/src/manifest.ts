import * as fs from "node:fs/promises";
import * as path from "node:path";

export const MANIFEST_FILE = ".code-forge.json";

export interface InstallManifest {
  version: string;
  ide: string;
  stacks: string[];
}

export function manifestPath(targetProjectRoot: string): string {
  return path.join(targetProjectRoot, MANIFEST_FILE);
}

export async function readManifest(targetProjectRoot: string): Promise<InstallManifest | null> {
  try {
    const parsed = JSON.parse(await fs.readFile(manifestPath(targetProjectRoot), "utf8")) as Partial<InstallManifest>;
    if (typeof parsed.ide !== "string" || !Array.isArray(parsed.stacks)) return null;
    return { version: parsed.version ?? "0.0.0", ide: parsed.ide, stacks: parsed.stacks };
  } catch {
    return null;
  }
}

export async function writeManifest(targetProjectRoot: string, manifest: InstallManifest): Promise<void> {
  await fs.mkdir(targetProjectRoot, { recursive: true });
  const sorted: InstallManifest = { ...manifest, stacks: [...new Set(manifest.stacks)].sort() };
  await fs.writeFile(manifestPath(targetProjectRoot), `${JSON.stringify(sorted, null, 2)}\n`);
}

/**
 * Resolves which stacks an `init` should install.
 *
 * An explicit `--stack` is authoritative, including for removal. The flag's *default*
 * value is not: without this distinction, re-running plain `init` on a project silently
 * retired every stack added later with `add-stack`, and once pruning exists that means
 * deleting their files.
 */
export function mergeStackSelection(
  installed: string[] | null,
  requested: string[],
  requestedExplicitly: boolean,
): string[] {
  if (requestedExplicitly || installed === null) return [...new Set(requested)];
  return [...new Set([...installed, ...requested])];
}

/**
 * `update` and `add-stack` must act on what is actually installed. Inferring from
 * flag defaults instead is how a Cursor project ended up with a stray `.agents/`
 * tree while the `.cursor/` files it meant to refresh went stale.
 */
export async function requireManifest(targetProjectRoot: string, command: string): Promise<InstallManifest> {
  const manifest = await readManifest(targetProjectRoot);
  if (manifest) return manifest;
  throw new Error(
    `No ${MANIFEST_FILE} found in ${targetProjectRoot}, so \`${command}\` cannot tell which IDE or stacks were installed.\n` +
      `Run \`code-forge init --ide <ide> --stack <stacks...> --dir ${targetProjectRoot}\` first.`,
  );
}
