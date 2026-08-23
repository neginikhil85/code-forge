import * as fs from "node:fs/promises";
import * as path from "node:path";
import { repositoryRoot, StackDefinition } from "../registry";
import {
  MANAGED_HEADER,
  RuleSpec,
  buildRuleSpecs,
  bundleKnowledgeBase,
  printQualityGateInstructions,
  rewritePaths,
} from "./shared";

const BUNDLED_ROOT = ".cursor/code-forge";
const RULES_DIR = ".cursor/rules";
const COMMANDS_DIR = ".cursor/commands";

export async function emit(targetProjectRoot: string, stacks: StackDefinition[]): Promise<void> {
  await bundleKnowledgeBase(targetProjectRoot, BUNDLED_ROOT, stacks);
  await emitRules(targetProjectRoot, stacks);
  await emitCommands(targetProjectRoot);
  printQualityGateInstructions(stacks);
}

async function emitRules(targetProjectRoot: string, stacks: StackDefinition[]): Promise<void> {
  const rulesDir = path.join(targetProjectRoot, RULES_DIR);
  await fs.mkdir(rulesDir, { recursive: true });

  for (const rule of buildRuleSpecs(stacks, BUNDLED_ROOT)) {
    await fs.writeFile(
      path.join(rulesDir, `${rule.fileName}.mdc`),
      `${MANAGED_HEADER}${frontmatter(rule, stacks)}${rule.body}\n`,
    );
  }
}

function frontmatter(rule: RuleSpec, stacks: StackDefinition[]): string {
  if (rule.fileName === "code-forge-principles") {
    return ["---", `description: ${rule.description}`, "alwaysApply: true", "---", ""].join("\n");
  }
  const stackId = rule.fileName.replace("code-forge-", "");
  const stack = stacks.find((candidate) => candidate.id === stackId);
  return [
    "---",
    `description: ${rule.description}`,
    "globs:",
    ...(stack?.ruleGlobs.map((glob) => `  - "${glob}"`) ?? []),
    "alwaysApply: false",
    "---",
    "",
  ].join("\n");
}

async function emitCommands(targetProjectRoot: string): Promise<void> {
  const workflowsSource = path.join(repositoryRoot(), "workflows");
  const commandsTarget = path.join(targetProjectRoot, COMMANDS_DIR);
  await fs.mkdir(commandsTarget, { recursive: true });

  const workflowFiles = (await fs.readdir(workflowsSource)).filter((name) => name.endsWith(".md"));
  for (const name of workflowFiles) {
    const content = await fs.readFile(path.join(workflowsSource, name), "utf8");
    await fs.writeFile(path.join(commandsTarget, name), MANAGED_HEADER + rewritePaths(content, BUNDLED_ROOT));
  }
}
