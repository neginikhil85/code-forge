import * as path from "node:path";
import * as antigravityEmitter from "./emitters/antigravity";
import * as cursorEmitter from "./emitters/cursor";

export interface StackDefinition {
  id: string;
  sourceDir: string;
  ruleGlobs: string[];
}

export interface IdeEmitter {
  id: string;
  emit: (targetProjectRoot: string, stacks: StackDefinition[]) => Promise<void>;
}

const REPOSITORY_ROOT = path.resolve(__dirname, "..", "..");

export function repositoryRoot(): string {
  return process.env.CODE_FORGE_ROOT ?? REPOSITORY_ROOT;
}

export const availableStacks: Record<string, StackDefinition> = {
  "java-spring": {
    id: "java-spring",
    sourceDir: "stacks/java-spring",
    ruleGlobs: ["**/*.java", "**/pom.xml", "**/application*.yml"],
  },
};

export const availableIdes: Record<string, IdeEmitter> = {
  antigravity: { id: "antigravity", emit: antigravityEmitter.emit },
  cursor: { id: "cursor", emit: cursorEmitter.emit },
};

export function resolveIde(ideId: string): IdeEmitter {
  const emitter = availableIdes[ideId];
  if (!emitter) {
    throw new Error(`Unsupported IDE "${ideId}". Available: ${Object.keys(availableIdes).join(", ")}`);
  }
  return emitter;
}

export function resolveStacks(stackIds: string[]): StackDefinition[] {
  const unknown = stackIds.filter((id) => !(id in availableStacks));
  if (unknown.length > 0) {
    throw new Error(`Unknown stack(s): ${unknown.join(", ")}. Available: ${Object.keys(availableStacks).join(", ")}`);
  }
  return stackIds.map((id) => availableStacks[id]);
}
