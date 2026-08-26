import * as assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { after, describe, it } from "node:test";
import { MANAGED_MARKER } from "../managed";
import { install, listFilesRecursively, makeTempProject, parseFrontmatter, read } from "./helpers";

const IDE_LAYOUTS = [
  {
    ide: "antigravity",
    bundledRoot: ".agents/code-forge",
    rulesDir: ".agents/rules",
    principlesRule: ".agents/rules/code-forge-principles.md",
    stackRule: ".agents/rules/code-forge-java-spring.md",
    workflowDir: ".agents/workflows",
  },
  {
    ide: "cursor",
    bundledRoot: ".cursor/code-forge",
    rulesDir: ".cursor/rules",
    principlesRule: ".cursor/rules/code-forge-principles.mdc",
    stackRule: ".cursor/rules/code-forge-java-spring.mdc",
    workflowDir: ".cursor/commands",
  },
] as const;

const WORKFLOW_NAMES = ["build.md", "implement.md", "plan.md", "review.md"];

const temporaryProjects: string[] = [];

async function freshInstall(ide: string, label: string): Promise<string> {
  const projectRoot = await makeTempProject(label);
  temporaryProjects.push(projectRoot);
  await install(projectRoot, ide);
  return projectRoot;
}

after(async () => {
  await Promise.all(temporaryProjects.map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

for (const layout of IDE_LAYOUTS) {
  const activationFiles = [
    layout.principlesRule,
    layout.stackRule,
    ...WORKFLOW_NAMES.map((name) => `${layout.workflowDir}/${name}`),
  ];

  describe(`${layout.ide} emitter`, () => {
    it("opens every activation file with frontmatter at byte 0 that parses as a mapping", async () => {
      const projectRoot = await freshInstall(layout.ide, `${layout.ide}-frontmatter`);

      for (const relativePath of activationFiles) {
        const raw = await read(projectRoot, relativePath);
        assert.match(
          raw,
          /^---\r?\n/,
          `${relativePath} must start with "---" — a comment before it hides the frontmatter from the IDE`,
        );
        const frontmatter = parseFrontmatter(raw);
        assert.equal(typeof frontmatter.description, "string", `${relativePath} needs a description`);
        assert.ok((frontmatter.description as string).length > 0);
      }
    });

    it("keeps the colon in rule descriptions by quoting the scalar", async () => {
      const projectRoot = await freshInstall(layout.ide, `${layout.ide}-descriptions`);

      for (const relativePath of [layout.principlesRule, layout.stackRule]) {
        const raw = await read(projectRoot, relativePath);
        const description = parseFrontmatter(raw).description as string;
        assert.match(description, /: /, "the descriptions under test are the ones that broke YAML parsing");
        assert.match(raw.split(/\r?\n/)[1], /^description: "/, `${relativePath} must quote its description`);
      }
    });

    it("marks the always-on rule as always-on and scopes the stack rule by glob", async () => {
      const projectRoot = await freshInstall(layout.ide, `${layout.ide}-activation`);
      const principles = parseFrontmatter(await read(projectRoot, layout.principlesRule));
      const stack = parseFrontmatter(await read(projectRoot, layout.stackRule));

      if (layout.ide === "antigravity") {
        assert.equal(principles.trigger, "always_on");
        assert.equal(stack.trigger, "glob");
      } else {
        assert.equal(principles.alwaysApply, true);
        assert.equal(stack.alwaysApply, false);
      }
      assert.deepEqual(stack.globs, ["**/*.java", "**/pom.xml", "**/application*.yml"]);
    });

    it("delivers the quality-gate templates the setup instructions tell you to copy", async () => {
      const projectRoot = await freshInstall(layout.ide, `${layout.ide}-gates`);
      const installed = await listFilesRecursively(projectRoot);
      const gatesDir = `${layout.bundledRoot}/stacks/java-spring/quality-gates`;

      for (const relativePath of [
        `${gatesDir}/archunit-rules.java`,
        `${gatesDir}/checkstyle.xml`,
        `${gatesDir}/checkstyle-suppressions.xml`,
        `${layout.bundledRoot}/stacks/java-spring/maven-snippets.xml`,
      ]) {
        assert.ok(installed.includes(relativePath), `${relativePath} was promised by the CLI but never written`);
      }
      assert.ok(
        !installed.some((relativePath) => relativePath.endsWith("stack.yaml")),
        "stack.yaml is installer metadata and should stay out of the target project",
      );
    });

    /**
     * The original defect was setup instructions naming paths that were never installed.
     * Rather than restate the expected list, every bundled path the notes mention is
     * resolved against what actually landed.
     */
    it("only names paths in its setup notes that it really installed", async () => {
      const projectRoot = await makeTempProject(`${layout.ide}-notes`);
      temporaryProjects.push(projectRoot);
      const report = await install(projectRoot, layout.ide);

      const notes = report.setupNotes.join("\n");
      assert.ok(notes.includes("mvn -q verify"), "the gate commands are the point of the notes");

      const cited = [...notes.matchAll(new RegExp(`${layout.bundledRoot}/[\\w./-]+`, "g"))].map((m) => m[0]);
      assert.ok(cited.length >= 4, `expected the notes to cite bundled templates, saw ${cited.length}`);
      for (const relativePath of cited) {
        await fs.access(path.join(projectRoot, relativePath));
      }
    });

    it("comments the managed marker in a syntax each file type actually supports", async () => {
      const projectRoot = await freshInstall(layout.ide, `${layout.ide}-marker`);

      const javaTemplate = await read(
        projectRoot,
        `${layout.bundledRoot}/stacks/java-spring/quality-gates/archunit-rules.java`,
      );
      assert.ok(javaTemplate.startsWith("// "), "a <!-- --> block in a .java file does not compile");
      assert.ok(!javaTemplate.includes("<!--"));

      const checkstyle = await read(
        projectRoot,
        `${layout.bundledRoot}/stacks/java-spring/quality-gates/checkstyle.xml`,
      );
      assert.ok(checkstyle.startsWith("<?xml "), "the XML declaration must stay the first thing in the document");
      assert.ok(checkstyle.includes(MANAGED_MARKER));

      const markdown = await read(projectRoot, `${layout.bundledRoot}/core/principles/solid.md`);
      assert.ok(markdown.startsWith("<!--"));
    });

    it("resolves every bundled path reference from the project root", async () => {
      const projectRoot = await freshInstall(layout.ide, `${layout.ide}-refs`);
      const markdownFiles = (await listFilesRecursively(projectRoot)).filter((name) => name.endsWith(".md"));
      const unresolved: string[] = [];

      for (const relativePath of markdownFiles) {
        const raw = await read(projectRoot, relativePath);
        for (const match of raw.matchAll(
          /`((?:core|personas|stacks|workflows|patterns|principles|quality-gates)\/[\w./-]*)`/g,
        )) {
          unresolved.push(`${relativePath} -> ${match[1]}`);
        }
      }
      assert.deepEqual(
        unresolved,
        [],
        "these references were not rewritten to the bundled root, so an agent following them looks in the wrong place",
      );
    });

    it("rewrites references to the bundled root and every rewritten target exists", async () => {
      const projectRoot = await freshInstall(layout.ide, `${layout.ide}-rewrites`);
      const markdownFiles = (await listFilesRecursively(projectRoot)).filter(
        (name) => name.endsWith(".md") || name.endsWith(".mdc"),
      );
      const pattern = new RegExp(`\`(${layout.bundledRoot}/[\\w./-]*\\.(?:md|xml|java))\``, "g");
      const missing: string[] = [];
      const citingFiles = new Set<string>();

      for (const relativePath of markdownFiles) {
        for (const match of (await read(projectRoot, relativePath)).matchAll(pattern)) {
          citingFiles.add(relativePath);
          try {
            await fs.access(path.join(projectRoot, match[1]));
          } catch {
            missing.push(`${relativePath} -> ${match[1]}`);
          }
        }
      }
      assert.deepEqual(missing, [], "dangling references in installed content");

      // Every rule and workflow exists to point the agent at bundled guidance. One that
      // cites nothing means the rewrite or the template produced an empty instruction.
      // `build.md` is the exception by design: it chains the other three commands and
      // introduces no guidance of its own, so it is checked for that delegation instead.
      const mustCite = activationFiles.filter((name) => !name.endsWith("/build.md"));
      for (const relativePath of mustCite) {
        assert.ok(citingFiles.has(relativePath), `${relativePath} cites no bundled file, so it guides nothing`);
      }
      const chain = await read(projectRoot, `${layout.workflowDir}/build.md`);
      for (const command of ["/plan", "/implement", "/review"]) {
        assert.ok(chain.includes(command), `build.md chains the other workflows, so it must name ${command}`);
      }
    });

    it("is idempotent — a second install reports no changes and leaves bytes identical", async () => {
      const projectRoot = await freshInstall(layout.ide, `${layout.ide}-idempotent`);
      const before = await snapshot(projectRoot);

      const report = await install(projectRoot, layout.ide);

      assert.deepEqual(await snapshot(projectRoot), before);
      assert.deepEqual(report.written, []);
      assert.deepEqual(report.updated, []);
      assert.deepEqual(report.removed, []);
      assert.equal(
        report.unchanged.length,
        Object.keys(before).length,
        "every installed file should be accounted for as already current",
      );
    });

    it("restores an edited file that still carries the marker", async () => {
      const projectRoot = await freshInstall(layout.ide, `${layout.ide}-restore`);
      const target = path.join(projectRoot, `${layout.workflowDir}/plan.md`);
      const original = await fs.readFile(target, "utf8");
      await fs.writeFile(target, `${original}\nDRIFTED\n`);

      const report = await install(projectRoot, layout.ide);

      assert.equal(await fs.readFile(target, "utf8"), original);
      assert.ok(report.updated.includes(target));
    });

    it("never touches a file whose managed marker was removed", async () => {
      const projectRoot = await freshInstall(layout.ide, `${layout.ide}-adopted`);
      const target = path.join(projectRoot, `${layout.bundledRoot}/core/principles/solid.md`);
      const adopted = "# my own principles\n";
      await fs.writeFile(target, adopted);

      const report = await install(projectRoot, layout.ide);

      assert.equal(await fs.readFile(target, "utf8"), adopted, "removing the marker must opt the file out of updates");
      assert.ok(report.preserved.includes(target));
      assert.ok(!report.updated.includes(target));
      assert.ok(!report.removed.includes(target), "an adopted file must never be pruned either");
    });

    it("deletes a managed file the current content no longer produces", async () => {
      const projectRoot = await freshInstall(layout.ide, `${layout.ide}-prune`);
      const retired = path.join(projectRoot, `${layout.bundledRoot}/core/principles/retired.md`);
      await fs.writeFile(retired, `<!--\n  ${MANAGED_MARKER} — replaced by \`code-forge update\`.\n-->\n# gone\n`);

      const report = await install(projectRoot, layout.ide);

      assert.ok(report.removed.includes(retired), "a renamed or deleted source document must not linger forever");
      await assert.rejects(fs.access(retired));
    });

    it("leaves an unmanaged stray file alone during pruning", async () => {
      const projectRoot = await freshInstall(layout.ide, `${layout.ide}-stray`);
      const mine = path.join(projectRoot, `${layout.bundledRoot}/core/MY-NOTES.md`);
      await fs.writeFile(mine, "# notes I dropped in here\n");

      const report = await install(projectRoot, layout.ide);

      assert.deepEqual(report.removed, [], "pruning must only ever remove files code-forge marked as its own");
      assert.equal(await fs.readFile(mine, "utf8"), "# notes I dropped in here\n");
    });

    it("retires a stack's files and rule when the stack is no longer installed", async () => {
      const projectRoot = await freshInstall(layout.ide, `${layout.ide}-drop-stack`);

      const report = await install(projectRoot, layout.ide, []);

      assert.ok(report.removed.includes(path.join(projectRoot, layout.stackRule)), "the stack rule must stop activating");
      assert.ok(
        report.removed.some((filePath) => filePath.includes("java-spring")),
        "the stack's guidance must not stay readable after removal",
      );
      await assert.rejects(fs.access(path.join(projectRoot, `${layout.bundledRoot}/stacks`)));
      await fs.access(path.join(projectRoot, `${layout.bundledRoot}/core/review-checklist.md`));
      await fs.access(path.join(projectRoot, layout.principlesRule));
    });

    it("templates active stack conventions into emitted workflows without leaving raw tokens", async () => {
      const projectRoot = await freshInstall(layout.ide, `${layout.ide}-workflow-templates`);

      const planWorkflow = await read(projectRoot, `${layout.workflowDir}/plan.md`);
      assert.ok(!planWorkflow.includes("{{STACK_PLAN_CONVENTIONS}}"), "plan workflow must interpolate the stack tokens");
      assert.ok(planWorkflow.includes(`${layout.bundledRoot}/stacks/java-spring/package-structure.md`));
      assert.ok(planWorkflow.includes(`${layout.bundledRoot}/stacks/java-spring/conventions.md`));

      const implementWorkflow = await read(projectRoot, `${layout.workflowDir}/implement.md`);
      assert.ok(!implementWorkflow.includes("{{STACK_TESTING_CONVENTIONS}}"), "implement workflow must interpolate the stack tokens");
      assert.ok(implementWorkflow.includes(`${layout.bundledRoot}/stacks/java-spring/testing.md`));
    });
  });
}

it("gives both IDEs the same knowledge base under their own roots", async () => {
  const antigravity = await freshInstall("antigravity", "layout-antigravity");
  const cursor = await freshInstall("cursor", "layout-cursor");

  const antigravityFiles = await listFilesRecursively(antigravity);
  const cursorFiles = await listFilesRecursively(cursor);

  assert.ok(antigravityFiles.every((name) => name.startsWith(".agents/")));
  assert.ok(cursorFiles.every((name) => name.startsWith(".cursor/")));

  const knowledgeBase = (files: string[], root: string): string[] =>
    files.filter((name) => name.startsWith(`${root}/`)).map((name) => name.slice(root.length + 1));

  assert.deepEqual(
    knowledgeBase(antigravityFiles, ".agents/code-forge"),
    knowledgeBase(cursorFiles, ".cursor/code-forge"),
    "the two IDEs must receive the same documents, only under different roots",
  );
  assert.ok(knowledgeBase(antigravityFiles, ".agents/code-forge").length > 0, "the comparison must not be vacuous");
});

async function snapshot(projectRoot: string): Promise<Record<string, string>> {
  const entries: Record<string, string> = {};
  for (const relativePath of await listFilesRecursively(projectRoot)) {
    entries[relativePath] = await read(projectRoot, relativePath);
  }
  return entries;
}
