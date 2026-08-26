import * as fs from "node:fs";
import * as path from "node:path";
import * as yaml from "js-yaml";
import * as antigravityEmitter from "./emitters/antigravity";
import * as cursorEmitter from "./emitters/cursor";
import { SyncReport } from "./managed";

export interface StackDefinition {
  id: string;
  name?: string;
  sourceDir: string;
  ruleGlobs: string[];
  ruleActivation?: string;
  qualityGates?: Record<string, string>;
  structureDoc?: string;
  conventionsDocs?: string[];
}

interface StackYamlSchema {
  id: string;
  name?: string;
  file_globs?: string[];
  rule_activation?: string;
  quality_gates?: Record<string, string>;
  packages?: {
    root?: string;
    structure_doc?: string;
  };
  conventions_docs?: string[];
}

export interface IdeEmitter {
  id: string;
  /** Project-relative directories this emitter writes into. Used to name orphans when switching IDEs. */
  ownedDirectories: string[];
  emit: (targetProjectRoot: string, stacks: StackDefinition[]) => Promise<SyncReport>;
}

/**
 * Directories that must exist for a path to be a usable code-forge checkout. Validated
 * eagerly so a misconfigured root fails with an explanation rather than an ENOENT
 * from deep inside a copy loop.
 */
const REQUIRED_ROOT_ENTRIES = ["core", "personas", "stacks", "workflows"];

export function repositoryRoot(): string {
  if (process.env.CODE_FORGE_ROOT) {
    const root = process.env.CODE_FORGE_ROOT;
    const missing = REQUIRED_ROOT_ENTRIES.filter((entry) => !fs.existsSync(path.join(root, entry)));
    if (missing.length > 0) {
      throw new Error(
        `code-forge content root "${root}" (from CODE_FORGE_ROOT) is missing: ${missing.join(", ")}.\n` +
          `Point CODE_FORGE_ROOT at a code-forge checkout containing ${REQUIRED_ROOT_ENTRIES.join(", ")}.`,
      );
    }
    return root;
  }

  const candidateRoots = [
    path.resolve(__dirname, "..", "content"),
    path.resolve(__dirname, "..", ".."),
  ];

  for (const candidate of candidateRoots) {
    const missing = REQUIRED_ROOT_ENTRIES.filter((entry) => !fs.existsSync(path.join(candidate, entry)));
    if (missing.length === 0) return candidate;
  }

  const primary = candidateRoots[1];
  const missing = REQUIRED_ROOT_ENTRIES.filter((entry) => !fs.existsSync(path.join(primary, entry)));
  throw new Error(
    `code-forge content root "${primary}" (from the installer location) is missing: ${missing.join(", ")}.\n` +
      `Point CODE_FORGE_ROOT at a code-forge checkout containing ${REQUIRED_ROOT_ENTRIES.join(", ")}.`,
  );
}

export function loadAvailableStacks(contentRoot?: string): Record<string, StackDefinition> {
  const root = contentRoot ?? repositoryRoot();
  const stacksDir = path.join(root, "stacks");
  const stacks: Record<string, StackDefinition> = {};

  if (!fs.existsSync(stacksDir)) return stacks;

  for (const entry of fs.readdirSync(stacksDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const stackYamlPath = path.join(stacksDir, entry.name, "stack.yaml");
    if (!fs.existsSync(stackYamlPath)) continue;

    try {
      const raw = fs.readFileSync(stackYamlPath, "utf8");
      const data = yaml.load(raw) as StackYamlSchema | null | undefined;
      if (data && typeof data.id === "string") {
        stacks[data.id] = {
          id: data.id,
          name: data.name ?? data.id,
          sourceDir: `stacks/${data.id}`,
          ruleGlobs: Array.isArray(data.file_globs) ? data.file_globs : [],
          ruleActivation: data.rule_activation ?? "glob",
          qualityGates: typeof data.quality_gates === "object" && data.quality_gates !== null ? data.quality_gates : undefined,
          structureDoc: data.packages?.structure_doc,
          conventionsDocs: Array.isArray(data.conventions_docs) ? data.conventions_docs : [],
        };
      }
    } catch (error) {
      console.warn(`Warning: Could not parse ${stackYamlPath}: ${error}`);
    }
  }

  return stacks;
}

export const availableStacks: Record<string, StackDefinition> = new Proxy({}, {
  get(_target, prop) {
    if (typeof prop === "string") {
      return loadAvailableStacks()[prop];
    }
    return undefined;
  },
  has(_target, prop) {
    if (typeof prop === "string") {
      return prop in loadAvailableStacks();
    }
    return false;
  },
  ownKeys() {
    return Object.keys(loadAvailableStacks());
  },
  getOwnPropertyDescriptor(_target, prop) {
    if (typeof prop === "string" && prop in loadAvailableStacks()) {
      return {
        enumerable: true,
        configurable: true,
        value: loadAvailableStacks()[prop],
      };
    }
    return undefined;
  },
});

export const availableIdes: Record<string, IdeEmitter> = {
  antigravity: {
    id: "antigravity",
    ownedDirectories: antigravityEmitter.OWNED_DIRECTORIES,
    emit: antigravityEmitter.emit,
  },
  cursor: {
    id: "cursor",
    ownedDirectories: cursorEmitter.OWNED_DIRECTORIES,
    emit: cursorEmitter.emit,
  },
};

export function resolveIde(ideId: string): IdeEmitter {
  const emitter = availableIdes[ideId];
  if (!emitter) {
    throw new Error(`Unsupported IDE "${ideId}". Available: ${Object.keys(availableIdes).join(", ")}`);
  }
  return emitter;
}

export function resolveStacks(stackIds: string[]): StackDefinition[] {
  const stacks = loadAvailableStacks();
  const unknown = stackIds.filter((id) => !(id in stacks));
  if (unknown.length > 0) {
    throw new Error(`Unknown stack(s): ${unknown.join(", ")}. Available: ${Object.keys(stacks).join(", ")}`);
  }
  return stackIds.map((id) => stacks[id]);
}
