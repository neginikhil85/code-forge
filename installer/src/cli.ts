#!/usr/bin/env node
import { Command } from "commander";
import { availableStacks, resolveStacks } from "./registry";
import * as antigravity from "./emitters/antigravity";

const program = new Command();

program.name("code-forge").description("Installs code-forge conventions and workflows into IDE agent projects.").version("0.1.0");

program
  .command("init")
  .description("Install code-forge into a project")
  .option("--ide <ide>", "target IDE", "antigravity")
  .option("--stack <stacks...>", "convention stacks to install", ["java-spring"])
  .option("--dir <path>", "target project directory", ".")
  .action(async (options: { ide: string; stack: string[]; dir: string }) => {
    if (options.ide !== "antigravity") {
      console.error(`Unsupported IDE "${options.ide}". Available: antigravity`);
      process.exitCode = 1;
      return;
    }
    const stacks = resolveStacks(options.stack);
    await antigravity.emit(options.dir, stacks);
    console.log(`Installed code-forge (${stacks.map((stack) => stack.id).join(", ")}) for ${options.ide} into ${options.dir}`);
    console.log("Restart the agent panel so the new rules and workflows are picked up.");
  });

program
  .command("add-stack")
  .description("Install an additional convention stack into a project already initialized by code-forge")
  .argument("<stacks...>")
  .option("--dir <path>", "target project directory", ".")
  .action(async (stackIds: string[], options: { dir: string }) => {
    const stacks = resolveStacks(stackIds);
    await antigravity.emit(options.dir, stacks);
    console.log(`Added stack(s) ${stackIds.join(", ")} into ${options.dir}`);
  });

program
  .command("update")
  .description("Re-sync managed code-forge files after core content changes")
  .option("--stack <stacks...>", "convention stacks to re-sync", Object.keys(availableStacks))
  .option("--dir <path>", "target project directory", ".")
  .action(async (options: { stack: string[]; dir: string }) => {
    const stacks = resolveStacks(options.stack);
    await antigravity.emit(options.dir, stacks);
    console.log(`Updated managed files in ${options.dir}`);
  });

program.parseAsync().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
