import * as fs from "node:fs/promises";
import * as path from "node:path";
import { repositoryRoot, StackDefinition } from "../registry";
import { SyncReport, withManagedNote, writeManagedFile } from "../managed";

export { MANAGED_MARKER } from "../managed";

/**
 * `stack.yaml` is installer-side metadata, not agent-facing guidance, so it stays out
 * of the bundle. Everything else ships — including the quality-gate templates, which
 * the printed setup instructions tell the developer to copy.
 */
const EXCLUDED_BUNDLE_ENTRIES = new Set(["stack.yaml"]);

export function buildPathRewrites(bundledRoot: string): Array<[RegExp, string]> {
  return [
    [/(?<![\w/-])personas\//g, `${bundledRoot}/personas/`],
    [/(?<![\w/-])core\//g, `${bundledRoot}/core/`],
    [/(?<![\w/-])stacks\/([\w-]+)\//g, `${bundledRoot}/stacks/$1/`],
  ];
}

export function rewritePaths(content: string, bundledRoot: string): string {
  return buildPathRewrites(bundledRoot).reduce(
    (result, [pattern, replacement]) => result.replace(pattern, replacement),
    content,
  );
}

/**
 * Copies the knowledge base into the target project. Content is rewritten the same way
 * workflows are: references inside these documents are repository-root-relative at
 * source, so without rewriting an agent following `core/patterns/...` from a bundled
 * file looks in the wrong place.
 */
export async function bundleKnowledgeBase(
  targetProjectRoot: string,
  bundledRoot: string,
  stacks: StackDefinition[],
  report: SyncReport,
): Promise<void> {
  const repositoryRootDir = repositoryRoot();
  const copyJobs = [
    { source: path.join(repositoryRootDir, "core"), destination: path.join(targetProjectRoot, bundledRoot, "core") },
    {
      source: path.join(repositoryRootDir, "personas"),
      destination: path.join(targetProjectRoot, bundledRoot, "personas"),
    },
    ...stacks.map((stack) => ({
      source: path.join(repositoryRootDir, "stacks", stack.id),
      destination: path.join(targetProjectRoot, bundledRoot, "stacks", stack.id),
    })),
  ];

  for (const job of copyJobs) {
    await syncManagedDirectory(job.source, job.destination, bundledRoot, report);
  }
}

async function syncManagedDirectory(
  source: string,
  destination: string,
  bundledRoot: string,
  report: SyncReport,
): Promise<void> {
  const entries = await fs.readdir(source, { withFileTypes: true });
  await fs.mkdir(destination, { recursive: true });

  for (const entry of entries) {
    if (EXCLUDED_BUNDLE_ENTRIES.has(entry.name)) continue;
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);

    if (entry.isDirectory()) {
      await syncManagedDirectory(sourcePath, destinationPath, bundledRoot, report);
      continue;
    }
    const content = rewritePaths(await fs.readFile(sourcePath, "utf8"), bundledRoot);
    await writeManagedFile(destinationPath, withManagedNote(content, destinationPath), report);
  }
}export function templateWorkflows(content: string, stacks: StackDefinition[], bundledRoot: string): string {
  const planDocs: string[] = [];
  const testDocs: string[] = [];

  for (const stack of stacks) {
    if (stack.structureDoc) {
      planDocs.push(`   - \`${bundledRoot}/stacks/${stack.id}/${stack.structureDoc}\``);
    }
    for (const doc of stack.conventionsDocs ?? []) {
      if (doc.includes("test")) {
        testDocs.push(`\`${bundledRoot}/stacks/${stack.id}/${doc}\``);
      } else {
        planDocs.push(`   - \`${bundledRoot}/stacks/${stack.id}/${doc}\``);
      }
    }
  }

  const planReplacement = planDocs.length > 0
    ? planDocs.join("\n")
    : `   - \`${bundledRoot}/core/principles/clean-code.md\``;
  const testReplacement = testDocs.length > 0
    ? testDocs.join(", ")
    : "the active stack test conventions";

  return content
    .replace(/\{\{STACK_PLAN_CONVENTIONS\}\}/g, planReplacement)
    .replace(/\{\{STACK_TESTING_CONVENTIONS\}\}/g, testReplacement);
}

export async function syncWorkflows(
  targetProjectRoot: string,
  workflowsDir: string,
  bundledRoot: string,
  stacks: StackDefinition[],
  report: SyncReport,
): Promise<void> {
  const source = path.join(repositoryRoot(), "workflows");
  const destination = path.join(targetProjectRoot, workflowsDir);
  await fs.mkdir(destination, { recursive: true });

  const workflowFiles = (await fs.readdir(source)).filter((name) => name.endsWith(".md"));
  for (const name of workflowFiles) {
    let content = await fs.readFile(path.join(source, name), "utf8");
    content = templateWorkflows(content, stacks, bundledRoot);
    content = rewritePaths(content, bundledRoot);
    const destinationPath = path.join(destination, name);
    await writeManagedFile(destinationPath, withManagedNote(content, destinationPath), report);
  }
}

export interface RuleSpec {
  fileName: string;
  description: string;
  body: string;
  /**
   * Present on stack rules, absent on the always-on principles rule. Carried here rather
   * than looked up by the emitters: re-deriving the stack from the file name meant a
   * missing match produced a rule with no globs, which installs cleanly and then never
   * activates. Making the data flow one-way removes the failure instead of guarding it.
   */
  globs?: string[];
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
  const lines = [
    `# code-forge ${stack.id} stack`,
    "",
    "These conventions apply to all matching files:",
    "",
  ];
  if (stack.structureDoc) {
    lines.push(`- \`${bundledRoot}/stacks/${stack.id}/${stack.structureDoc}\` — layered layout and placement rules`);
  }
  const descriptions: Record<string, string> = {
    "conventions.md": "dependency injection, Lombok, configuration decision tree, mappers",
    "libraries.md": "HTTP clients, logging, boilerplate policy",
    "data-access.md": "repository vs dynamic aggregation decisions",
    "communication.md": "inter-service mechanism selection and reliability defaults",
    "testing.md": "test naming and structure",
  };
  for (const doc of stack.conventionsDocs ?? []) {
    const desc = descriptions[doc] ? ` — ${descriptions[doc]}` : "";
    lines.push(`- \`${bundledRoot}/stacks/${stack.id}/${doc}\`${desc}`);
  }
  return lines.join("\n");
}

export function buildRuleSpecs(stacks: StackDefinition[], bundledRoot: string): RuleSpec[] {
  return [
    {
      fileName: "code-forge-principles",
      description: "Clean-code principles: naming without abbreviations, why-only comments, SOLID discipline.",
      body: coreRuleBody(bundledRoot),
    },
    ...stacks.map((stack) => {
      if (stack.ruleGlobs.length === 0) {
        throw new Error(`Stack "${stack.id}" declares no ruleGlobs, so its rule would never activate.`);
      }
      return {
        fileName: `code-forge-${stack.id}`,
        description: `${stack.id} conventions: package structure, configuration sweep, mappers, testing.`,
        body: stackRuleBody(stack, bundledRoot),
        globs: stack.ruleGlobs,
      };
    }),
  ];
}

/**
 * Manual setup, returned rather than printed so the caller can show it after the file
 * summary. pom.xml is never edited automatically: it is the one file in a service where
 * an unexpected rewrite costs more than the automation saves.
 */
export function qualityGateInstructions(stacks: StackDefinition[], bundledRoot: string): string[] {
  const notes: string[] = [];
  for (const stack of stacks) {
    if (!stack.qualityGates || Object.keys(stack.qualityGates).length === 0) continue;
    const gatesDir = `${bundledRoot}/stacks/${stack.id}/quality-gates`;
    const lines = [
      `Quality gates for ${stack.id} — one-time setup:`,
      "",
    ];
    if (stack.id === "java-spring") {
      lines.push(
        `1. Copy these out of the knowledge base:`,
        `   - ${gatesDir}/archunit-rules.java`,
        `       -> src/test/java/<your base package>/architecture/ArchitectureTest.java`,
        `       (rename the file, then set the analyzed package and layer packages)`,
        `   - ${gatesDir}/checkstyle.xml              -> project root`,
        `   - ${gatesDir}/checkstyle-suppressions.xml -> project root`,
        `2. Add to pom.xml — snippets in ${bundledRoot}/stacks/java-spring/maven-snippets.xml:`,
        `   - dependency: com.tngtech.archunit:archunit-junit5 (test scope)`,
        `   - plugin:     maven-checkstyle-plugin, with the Checkstyle version pinned`,
        "",
        `The copies at your project root are outside the knowledge base, so \`update\` will not`,
        `touch them — delete their marker comment and treat them as yours, or re-copy after an`,
        `update to pick up changes.`,
        "",
      );
    }
    lines.push(`Gate commands used by /implement:`);
    for (const [gateName, gateCmd] of Object.entries(stack.qualityGates)) {
      lines.push(`   ${(gateName + ":").padEnd(14)} ${gateCmd}`);
    }
    notes.push(lines.join("\n"));
  }
  return notes;
}
