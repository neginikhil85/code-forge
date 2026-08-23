import * as fs from "node:fs/promises";
import * as path from "node:path";
import { repositoryRoot, StackDefinition } from "../registry";
import {
  MANAGED_HEADER,
  RuleSpec,
  buildPathRewrites,
  buildRuleSpecs,
  bundleKnowledgeBase,
  printQualityGateInstructions,
} from "./shared";

const BUNDLED_ROOT = ".agents/code-forge";
const RULES_DIR = ".agents/rules";
const WORKFLOWS_DIR = ".agents/workflows";

interface AntigravityRuleSpec extends RuleSpec {
  trigger: "always_on" | "model_decision" | "glob";
  globs?: string[];
}

export async function emit(targetProjectRoot: string, stacks: StackDefinition[]): Promise<void> {
  await bundleKnowledgeBase(targetProjectRoot, BUNDLED_ROOT, stacks);
  await emitRules(targetProjectRoot, stacks);
  await emitWorkflows(targetProjectRoot);
  printQualityGateInstructions(stacks);
}

async function emitRules(targetProjectRoot: string, stacks: StackDefinition[]): Promise<void> {
  const rulesDir = path.join(targetProjectRoot, RULES_DIR);
  await fs.mkdir(rulesDir, { recursive: true });

  const rules = withAntigravityActivation(buildRuleSpecs(stacks, BUNDLED_ROOT), stacks);

  for (const rule of rules) {
    const frontmatter = [
      "---",
      `description: ${rule.description}`,
      `trigger: ${rule.trigger}`,
      ...(rule.globs ? [`globs: ${JSON.stringify(rule.globs)}`] : []),
      "---",
      "",
    ].join("\n");
    await fs.writeFile(path.join(rulesDir, `${rule.fileName}.md`), `${MANAGED_HEADER}${frontmatter}${rule.body}\n`);
  }
}

function withAntigravityActivation(rules: RuleSpec[], stacks: StackDefinition[]): AntigravityRuleSpec[] {
  return rules.map((rule) => {
    if (rule.fileName === "code-forge-principles") {
      return { ...rule, trigger: "always_on" as const };
    }
    const stackId = rule.fileName.replace("code-forge-", "");
    const stack = stacks.find((candidate) => candidate.id === stackId);
    return { ...rule, trigger: "glob" as const, globs: stack?.ruleGlobs };
  });
}

async function emitWorkflows(targetProjectRoot: string): Promise<void> {
  const repositoryRootDir = path.join(repositoryRoot(), "workflows");
  const workflowsTarget = path.join(targetProjectRoot, WORKFLOWS_DIR);
  await fs.mkdir(workflowsTarget, { recursive: true });

  const workflowFiles = (await fs.readdir(repositoryRootDir)).filter((name) => name.endsWith(".md"));
  for (const name of workflowFiles) {
    const content = await fs.readFile(path.join(repositoryRootDir, name), "utf8");
    const rewritten = buildPathRewrites(BUNDLED_ROOT).reduce(
      (result, [pattern, replacement]) => result.replace(pattern, replacement),
      content,
    );
    await fs.writeFile(path.join(workflowsTarget, name), MANAGED_HEADER + rewritten);
  }
}
