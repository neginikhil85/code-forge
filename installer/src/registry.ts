import * as path from "node:path";

export interface StackDefinition {
  id: string;
  sourceDir: string;
  ruleGlobs: string[];
}

export interface IdeEmitter {
  id: string;
  emit: (repositoryRoot: string, targetProjectRoot: string, stacks: StackDefinition[]) => Promise<void>;
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

export function resolveStacks(stackIds: string[]): StackDefinition[] {
  const unknown = stackIds.filter((id) => !(id in availableStacks));
  if (unknown.length > 0) {
    throw new Error(`Unknown stack(s): ${unknown.join(", ")}. Available: ${Object.keys(availableStacks).join(", ")}`);
  }
  return stackIds.map((id) => availableStacks[id]);
}
