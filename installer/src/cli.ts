#!/usr/bin/env node
import { Command } from "commander";
import * as fs from "node:fs";
import * as path from "node:path";
import { describeSyncReport } from "./managed";
import { MANIFEST_FILE, mergeStackSelection, readManifest, requireManifest, writeManifest } from "./manifest";
import { IdeEmitter, StackDefinition, availableIdes, resolveIde, resolveStacks } from "./registry";

const VERSION = "0.1.0";

/**
 * `code-forge init | head` closes the pipe early; without this the process dies on an
 * unhandled EPIPE with a stack trace, which reads like a bug in the installer. The error
 * arrives as a stream event, so `parseAsync().catch()` structurally cannot see it.
 */
function ignoreBrokenPipe(stream: NodeJS.WriteStream): void {
  stream.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EPIPE") process.exit(0);
    throw error;
  });
}
ignoreBrokenPipe(process.stdout);
ignoreBrokenPipe(process.stderr);

const program = new Command();

program
  .name("code-forge")
  .description("Installs code-forge conventions and workflows into IDE agent projects.")
  .version(VERSION);

/**
 * Records the install before writing a single file. Writing it afterwards meant a run that
 * failed partway left a project full of managed files and no manifest, so the `update`
 * that would have repaired it refused to run.
 */
async function install(
  emitter: IdeEmitter,
  stackIds: string[],
  targetProjectRoot: string,
): Promise<void> {
  await writeManifest(targetProjectRoot, {
    version: VERSION,
    ide: emitter.id,
    stacks: stackIds,
  });

  const stacks = resolveStacks(stackIds);
  const report = await emitter.emit(targetProjectRoot, stacks);
  console.log(describeSyncReport(report, targetProjectRoot));
  for (const note of report.setupNotes) console.log(`\n${note}`);
}

/** Names the directories a previous IDE left behind, so the warning is actionable. */
function orphanedDirectoriesFrom(previousIde: string, currentIde: string, targetProjectRoot: string): string[] {
  const previous = availableIdes[previousIde];
  if (!previous || previousIde === currentIde) return [];

  const current = new Set(availableIdes[currentIde]?.ownedDirectories ?? []);
  return previous.ownedDirectories
    .filter((directory) => !current.has(directory))
    .filter((directory) => fs.existsSync(path.join(targetProjectRoot, directory)));
}

program
  .command("init")
  .description("Install code-forge into a project")
  .option("--ide <ide>", "target IDE (antigravity, cursor)", "antigravity")
  .option("--stack <stacks...>", "convention stacks to install", ["java-spring"])
  .option("--dir <path>", "target project directory", ".")
  .action(async (options: { ide: string; stack: string[]; dir: string }, command: Command) => {
    const emitter = resolveIde(options.ide);
    const existing = await readManifest(options.dir);

    const stackIds = mergeStackSelection(
      existing?.stacks ?? null,
      options.stack,
      command.getOptionValueSource("stack") === "cli",
    );

    await install(emitter, stackIds, options.dir);

    console.log(
      `\nInstalled code-forge (${stackIds.join(", ")}) for ${emitter.id} into ${options.dir}`,
    );
    console.log("Restart the agent panel so the new rules and workflows are picked up.");

    // Printed last: this used to scroll away above twenty lines of file output.
    const orphaned = existing ? orphanedDirectoriesFrom(existing.ide, emitter.id, options.dir) : [];
    if (orphaned.length > 0) {
      console.warn(
        `\nThis project was previously initialized for ${existing?.ide}. Its files are still in place\n` +
          `and its rules will keep activating alongside the ${emitter.id} ones. Delete these to switch cleanly:\n` +
          orphaned.map((directory) => `  ${directory}`).join("\n"),
      );
    }
  });

program
  .command("add-stack")
  .description("Install an additional convention stack into a project already initialized by code-forge")
  .argument("<stacks...>")
  .option("--dir <path>", "target project directory", ".")
  .action(async (stackIds: string[], options: { dir: string }) => {
    const manifest = await requireManifest(options.dir, "add-stack");
    const emitter = resolveIde(manifest.ide);

    // Installs the union, not just the new stacks: emitting one stack in isolation would
    // make the pruning pass treat every already-installed stack as stale.
    const merged = [...new Set([...manifest.stacks, ...stackIds])];
    await install(emitter, merged, options.dir);

    console.log(`\nAdded stack(s) ${stackIds.join(", ")} for ${manifest.ide} into ${options.dir}`);
  });

program
  .command("update")
  .description("Re-sync managed code-forge files after core content changes")
  .option("--dir <path>", "target project directory", ".")
  .action(async (options: { dir: string }) => {
    const manifest = await requireManifest(options.dir, "update");
    const emitter = resolveIde(manifest.ide);

    await install(emitter, manifest.stacks, options.dir);
    console.log(`\nUpdated managed files in ${options.dir} (${manifest.ide}: ${manifest.stacks.join(", ")})`);
  });

program
  .command("remove-stack")
  .description("Stop installing a convention stack and delete its managed files")
  .argument("<stacks...>")
  .option("--dir <path>", "target project directory", ".")
  .action(async (stackIds: string[], options: { dir: string }) => {
    const manifest = await requireManifest(options.dir, "remove-stack");
    const remaining = manifest.stacks.filter((id) => !stackIds.includes(id));

    if (remaining.length === manifest.stacks.length) {
      throw new Error(
        `None of "${stackIds.join(", ")}" is installed. ${MANIFEST_FILE} lists: ${manifest.stacks.join(", ")}.`,
      );
    }
    // The pruning pass does the deletion: anything the remaining stacks do not produce
    // and still carries the marker goes.
    await install(resolveIde(manifest.ide), remaining, options.dir);
    console.log(`\nRemoved stack(s) ${stackIds.join(", ")} from ${options.dir}`);
  });

program.parseAsync().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
