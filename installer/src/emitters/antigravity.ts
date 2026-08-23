import * as fs from "node:fs/promises";
import * as path from "node:path";
import { repositoryRoot, StackDefinition } from "../registry";

const BUNDLED_ROOT = ".agents/code-forge";
const RULES_DIR = ".agents/rules";
const WORKFLOWS_DIR = ".agents/workflows";

const MANAGED_HEADER = [
  "<!--",
  "  managed by code-forge — edits to this file will be overwritten by `code-forge update`.",
  "  To customize, copy this file and remove the managed marker.",
  "-->",
  "",
].join("\n");

const PATH_REWRITES: Array<[RegExp, string]> = [
  [/personas\//g, `${BUNDLED_ROOT}/personas/`],
  [/(?<![\w/-])core\//g, `${BUNDLED_ROOT}/core/`],
  [/stacks\/([\w-]+)\//g, `${BUNDLED_ROOT}/stacks/$1/`],
];

interface RuleSpec {
  fileName: string;
  trigger: "always_on" | "model_decision" | "glob";
  globs?: string[];
  description: string;
  body: string;
}

export async function emit(targetProjectRoot: string, stacks: StackDefinition[]): Promise<void> {
  const repositoryRootDir = repositoryRoot();
  await bundleKnowledgeBase(repositoryRootDir, targetProjectRoot, stacks);
  await emitRules(targetProjectRoot, stacks);
  await emitWorkflows(repositoryRootDir, targetProjectRoot);
  printQualityGateInstructions(stacks);
}

async function bundleKnowledgeBase(repositoryRootDir: string, targetProjectRoot: string, stacks: StackDefinition[]): Promise<void> {
  const copyJobs: Array<{ source: string; destination: string }> = [
    { source: path.join(repositoryRootDir, "core"), destination: path.join(targetProjectRoot, BUNDLED_ROOT, "core") },
    { source: path.join(repositoryRootDir, "personas"), destination: path.join(targetProjectRoot, BUNDLED_ROOT, "personas") },
    ...stacks.map((stack) => ({
      source: path.join(repositoryRootDir, "stacks", stack.id),
      destination: path.join(targetProjectRoot, BUNDLED_ROOT, "stacks", stack.id),
    })),
  ];

  for (const job of copyJobs) {
    await copyManagedDirectory(job.source, job.destination, new Set(["quality-gates", "maven-snippets.xml", "stack.yaml"]));
  }
}

async function copyManagedDirectory(source: string, destination: string, excluded: Set<string>): Promise<void> {
  const entries = await fs.readdir(source, { withFileTypes: true });
  await fs.mkdir(destination, { recursive: true });
  for (const entry of entries) {
    if (excluded.has(entry.name)) continue;
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      await copyManagedDirectory(sourcePath, destinationPath, excluded);
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

async function emitRules(targetProjectRoot: string, stacks: StackDefinition[]): Promise<void> {
  const rulesDir = path.join(targetProjectRoot, RULES_DIR);
  await fs.mkdir(rulesDir, { recursive: true });

  const rules: RuleSpec[] = [
    {
      fileName: "code-forge-principles.md",
      trigger: "always_on",
      description: "Clean-code principles: naming without abbreviations, why-only comments, SOLID discipline.",
      body: [
        "# code-forge principles",
        "",
        "Apply these to every change you write:",
        "",
        "- Follow ../code-forge/core/principles/solid.md — single responsibility first, constructor injection only.",
        "- Follow ../code-forge/core/principles/clean-code.md — no abbreviations, no unnecessary comments, code reads like a story.",
        "- Score your own output against ../code-forge/core/review-checklist.md before reporting completion.",
        "",
        "Pattern guides load on demand when relevant:",
        "",
        "- ../code-forge/core/patterns/strategy-map-registry.md — replace type-switching dispatch",
        "- ../code-forge/core/patterns/observer-events.md — decouple side effects from core flow",
        "- ../code-forge/core/patterns/combinator-validators.md — compose conditional request validation",
        "- ../code-forge/core/patterns/decorator-proxy.md — wrap cross-cutting concerns",
      ].join("\n"),
    },
    ...stacks.map((stack) => ({
      fileName: `code-forge-${stack.id}.md`,
      trigger: "glob" as const,
      globs: stack.ruleGlobs,
      description: `${stack.id} conventions: package structure, configuration sweep, mappers, testing.`,
      body: [
        `# code-forge ${stack.id} stack`,
        "",
        "These conventions apply to all matching files:",
        "",
        `- ../code-forge/stacks/${stack.id}/package-structure.md — layered layout and placement rules`,
        `- ../code-forge/stacks/${stack.id}/conventions.md — dependency injection, Lombok, configuration decision tree, mappers`,
        `- ../code-forge/stacks/${stack.id}/libraries.md — HTTP clients, logging, boilerplate policy`,
        `- ../code-forge/stacks/${stack.id}/data-access.md — repository vs dynamic aggregation decisions`,
        `- ../code-forge/stacks/${stack.id}/communication.md — inter-service mechanism selection and reliability defaults`,
        `- ../code-forge/stacks/${stack.id}/testing.md — test naming and structure`,
      ].join("\n"),
    })),
  ];

  for (const rule of rules) {
    const frontmatter = ["---", `trigger: ${rule.trigger}`, ...(rule.globs ? [`globs: ${JSON.stringify(rule.globs)}`] : []), "---", ""].join("\n");
    const content = `${MANAGED_HEADER}${frontmatter}${rule.body}\n`;
    await fs.writeFile(path.join(rulesDir, rule.fileName), content);
  }
}

async function emitWorkflows(repositoryRootDir: string, targetProjectRoot: string): Promise<void> {
  const workflowsSource = path.join(repositoryRootDir, "workflows");
  const workflowsTarget = path.join(targetProjectRoot, WORKFLOWS_DIR);
  await fs.mkdir(workflowsTarget, { recursive: true });

  const workflowFiles = (await fs.readdir(workflowsSource)).filter((name) => name.endsWith(".md"));
  for (const name of workflowFiles) {
    const content = await fs.readFile(path.join(workflowsSource, name), "utf8");
    await fs.writeFile(path.join(workflowsTarget, name), MANAGED_HEADER + rewritePaths(content));
  }
}

function rewritePaths(content: string): string {
  return PATH_REWRITES.reduce((result, [pattern, replacement]) => result.replace(pattern, replacement), content);
}

function printQualityGateInstructions(stacks: StackDefinition[]): void {
  if (!stacks.some((stack) => stack.id === "java-spring")) return;

  console.log(`
Quality gates for java-spring (manual setup — pom.xml is never edited automatically):

1. Copy quality-gate templates into your service:
   - archunit-rules.java -> src/test/java/<your base package>/ArchitectureTest.java
     (adjust the analyzed package and layer definitions)
   - checkstyle.xml      -> project root
2. Add to pom.xml (snippets in .agents/code-forge/stacks/java-spring/maven-snippets.xml):
   - dependency: com.tngtech.archunit:archunit-junit5
   - plugin:     maven-checkstyle-plugin bound to check

Gate commands used by /implement:
   compile:      mvn -q compile
   architecture: mvn -q test -Dtest=ArchitectureTest
   style:        mvn -q checkstyle:check
   full:         mvn -q verify
`);
}
