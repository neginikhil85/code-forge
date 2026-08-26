import * as path from "node:path";
import { StackDefinition } from "../registry";
import {
  SyncReport,
  createSyncReport,
  frontmatterBlock,
  pruneManagedFiles,
  withManagedNote,
  writeManagedFile,
  yamlScalar,
} from "../managed";
import { RuleSpec, buildRuleSpecs, bundleKnowledgeBase, qualityGateInstructions, syncWorkflows } from "./shared";

const BUNDLED_ROOT = ".agents/code-forge";
const RULES_DIR = ".agents/rules";
const WORKFLOWS_DIR = ".agents/workflows";

/** Everything code-forge may delete stale managed files from. Keep in sync with the constants above. */
export const OWNED_DIRECTORIES = [BUNDLED_ROOT, RULES_DIR, WORKFLOWS_DIR];

interface AntigravityRuleSpec extends RuleSpec {
  trigger: "always_on" | "model_decision" | "glob";
}

export async function emit(targetProjectRoot: string, stacks: StackDefinition[]): Promise<SyncReport> {
  const report = createSyncReport();
  await bundleKnowledgeBase(targetProjectRoot, BUNDLED_ROOT, stacks, report);
  await emitRules(targetProjectRoot, stacks, report);
  await syncWorkflows(targetProjectRoot, WORKFLOWS_DIR, BUNDLED_ROOT, stacks, report);
  await pruneManagedFiles(targetProjectRoot, OWNED_DIRECTORIES, report);
  report.setupNotes.push(...qualityGateInstructions(stacks, BUNDLED_ROOT));
  return report;
}

async function emitRules(
  targetProjectRoot: string,
  stacks: StackDefinition[],
  report: SyncReport,
): Promise<void> {
  const rulesDir = path.join(targetProjectRoot, RULES_DIR);

  for (const rule of withAntigravityActivation(buildRuleSpecs(stacks, BUNDLED_ROOT))) {
    const frontmatter = frontmatterBlock([
      ["description", yamlScalar(rule.description)],
      ["trigger", rule.trigger],
      ...(rule.globs ? ([["globs", JSON.stringify(rule.globs)]] as Array<[string, string]>) : []),
    ]);
    const filePath = path.join(rulesDir, `${rule.fileName}.md`);
    await writeManagedFile(filePath, withManagedNote(`${frontmatter}${rule.body}\n`, filePath), report);
  }
}

/**
 * Principles are unconditional; stack conventions cost context on files they cannot apply
 * to, so they load only when a matching file is in play.
 */
function withAntigravityActivation(rules: RuleSpec[]): AntigravityRuleSpec[] {
  return rules.map((rule) => ({ ...rule, trigger: rule.globs ? ("glob" as const) : ("always_on" as const) }));
}
