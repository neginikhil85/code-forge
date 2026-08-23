import * as fs from "node:fs/promises";
import * as path from "node:path";
import { repositoryRoot, StackDefinition } from "../registry";

export const MANAGED_HEADER = [
  "<!--",
  "  managed by code-forge — edits to this file will be overwritten by `code-forge update`.",
  "  To customize, copy this file and remove the managed marker.",
  "-->",
  "",
].join("\n");

const EXCLUDED_BUNDLE_ENTRIES = new Set(["quality-gates", "maven-snippets.xml", "stack.yaml"]);

export interface BundledLocations {
  bundledRoot: string;
  rulesDir: string;
  workflowsDir: string;
}

export function buildPathRewrites(bundledRoot: string): Array<[RegExp, string]> {
  return [
    [/personas\//g, `${bundledRoot}/personas/`],
    [/(?<![\w/-])core\//g, `${bundledRoot}/core/`],
    [/stacks\/([\w-]+)\//g, `${bundledRoot}/stacks/$1/`],
  ];
}

export function rewritePaths(content: string, bundledRoot: string): string {
  return buildPathRewrites(bundledRoot).reduce(
    (result, [pattern, replacement]) => result.replace(pattern, replacement),
    content,
  );
}

export async function bundleKnowledgeBase(
  targetProjectRoot: string,
  bundledRoot: string,
  stacks: StackDefinition[],
): Promise<void> {
  const repositoryRootDir = repositoryRoot();
  const copyJobs = [
    { source: path.join(repositoryRootDir, "core"), destination: path.join(targetProjectRoot, bundledRoot, "core") },
    { source: path.join(repositoryRootDir, "personas"), destination: path.join(targetProjectRoot, bundledRoot, "personas") },
    ...stacks.map((stack) => ({
      source: path.join(repositoryRootDir, "stacks", stack.id),
      destination: path.join(targetProjectRoot, bundledRoot, "stacks", stack.id),
    })),
  ];

  for (const job of copyJobs) {
    await copyManagedDirectory(job.source, job.destination);
  }
}

async function copyManagedDirectory(source: string, destination: string): Promise<void> {
  const entries = await fs.readdir(source, { withFileTypes: true });
  await fs.mkdir(destination, { recursive: true });
  for (const entry of entries) {
    if (EXCLUDED_BUNDLE_ENTRIES.has(entry.name)) continue;
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      await copyManagedDirectory(sourcePath, destinationPath);
    } else {
      await fs.copyFile(sourcePath, destinationPath);
      await prependManagedHeader(destinationPath);
    }
  }
}

async function prependManagedHeader(filePath: string): Promise<void> {
  const content = await fs.readFile(filePath, "utf8");
  if (content.includes("managed by code-forge")) return;
  await fs.writeFile(filePath, MANAGED_HEADER + content);
}

export interface RuleSpec {
  fileName: string;
  description: string;
  body: string;
}

export function coreRuleBody(bundledRoot: string): string {
  return [
    "# code-forge principles",
    "",
    "Apply these to every change you write:",
    "",
    `- Read and follow \`${bundledRoot}/core/principles/solid.md\` — single responsibility first, constructor injection only.`,
    `- Read and follow \`${bundledRoot}/core/principles/clean-code.md\` — no abbreviations, no unnecessary comments, code reads like a story.`,
    `- Score your own output against \`${bundledRoot}/core/review-checklist.md\` before reporting completion.`,
    "",
    "Pattern guides load on demand when relevant:",
    "",
    `- \`${bundledRoot}/core/patterns/strategy-map-registry.md\` — replace type-switching dispatch`,
    `- \`${bundledRoot}/core/patterns/observer-events.md\` — decouple side effects from core flow`,
    `- \`${bundledRoot}/core/patterns/combinator-validators.md\` — compose conditional request validation`,
    `- \`${bundledRoot}/core/patterns/decorator-proxy.md\` — wrap cross-cutting concerns`,
  ].join("\n");
}

export function stackRuleBody(stack: StackDefinition, bundledRoot: string): string {
  return [
    `# code-forge ${stack.id} stack`,
    "",
    "These conventions apply to all matching files:",
    "",
    `- \`${bundledRoot}/stacks/${stack.id}/package-structure.md\` — layered layout and placement rules`,
    `- \`${bundledRoot}/stacks/${stack.id}/conventions.md\` — dependency injection, Lombok, configuration decision tree, mappers`,
    `- \`${bundledRoot}/stacks/${stack.id}/libraries.md\` — HTTP clients, logging, boilerplate policy`,
    `- \`${bundledRoot}/stacks/${stack.id}/data-access.md\` — repository vs dynamic aggregation decisions`,
    `- \`${bundledRoot}/stacks/${stack.id}/communication.md\` — inter-service mechanism selection and reliability defaults`,
    `- \`${bundledRoot}/stacks/${stack.id}/testing.md\` — test naming and structure`,
  ].join("\n");
}

export function buildRuleSpecs(stacks: StackDefinition[], bundledRoot: string): RuleSpec[] {
  return [
    {
      fileName: "code-forge-principles",
      description: "Clean-code principles: naming without abbreviations, why-only comments, SOLID discipline.",
      body: coreRuleBody(bundledRoot),
    },
    ...stacks.map((stack) => ({
      fileName: `code-forge-${stack.id}`,
      description: `${stack.id} conventions: package structure, configuration sweep, mappers, testing.`,
      body: stackRuleBody(stack, bundledRoot),
    })),
  ];
}

export function printQualityGateInstructions(stacks: StackDefinition[]): void {
  if (!stacks.some((stack) => stack.id === "java-spring")) return;

  console.log(`
Quality gates for java-spring (manual setup — pom.xml is never edited automatically):

1. Copy quality-gate templates into your service:
   - archunit-rules.java -> src/test/java/<your base package>/ArchitectureTest.java
     (adjust the analyzed package and layer definitions)
   - checkstyle.xml      -> project root
2. Add to pom.xml (snippets in the bundled maven-snippets.xml):
   - dependency: com.tngtech.archunit:archunit-junit5
   - plugin:     maven-checkstyle-plugin bound to check

Gate commands used by /implement:
   compile:      mvn -q compile
   architecture: mvn -q test -Dtest=ArchitectureTest
   style:        mvn -q checkstyle:check
   full:         mvn -q verify
`);
}
