import * as path from "node:path";
import { StackDefinition } from "../registry";
import {
  SyncReport,
  createSyncReport,
  pruneManagedFiles,
  withManagedNote,
  writeManagedFile,
  yamlScalar,
} from "../managed";
import { RuleSpec, buildRuleSpecs, bundleKnowledgeBase, qualityGateInstructions, syncWorkflows } from "./shared";

const BUNDLED_ROOT = ".cursor/code-forge";
const RULES_DIR = ".cursor/rules";
const COMMANDS_DIR = ".cursor/commands";

/** Everything code-forge may delete stale managed files from. Keep in sync with the constants above. */
export const OWNED_DIRECTORIES = [BUNDLED_ROOT, RULES_DIR, COMMANDS_DIR];

export async function emit(targetProjectRoot: string, stacks: StackDefinition[]): Promise<SyncReport> {
  const report = createSyncReport();
  await bundleKnowledgeBase(targetProjectRoot, BUNDLED_ROOT, stacks, report);
  await emitRules(targetProjectRoot, stacks, report);
  await syncWorkflows(targetProjectRoot, COMMANDS_DIR, BUNDLED_ROOT, stacks, report);
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

  for (const rule of buildRuleSpecs(stacks, BUNDLED_ROOT)) {
    const filePath = path.join(rulesDir, `${rule.fileName}.mdc`);
    await writeManagedFile(filePath, withManagedNote(`${frontmatter(rule)}${rule.body}\n`, filePath), report);
  }
}

/**
 * Cursor keys activation off `alwaysApply` plus `globs`. Globs are emitted as a block
 * sequence with each entry quoted, because a bare `**\/*.java` in flow style is not a
 * valid YAML scalar.
 */
function frontmatter(rule: RuleSpec): string {
  const entries = rule.globs
    ? ["globs:", ...rule.globs.map((glob) => `  - ${yamlScalar(glob)}`), "alwaysApply: false"]
    : ["alwaysApply: true"];

  return ["---", `description: ${yamlScalar(rule.description)}`, ...entries, "---", ""].join("\n");
}
