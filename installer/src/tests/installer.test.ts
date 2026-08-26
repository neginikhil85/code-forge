import * as assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { after, describe, it } from "node:test";
import { createSyncReport, describeSyncReport, withManagedNote, yamlScalar } from "../managed";
import {
  manifestPath,
  mergeStackSelection,
  readManifest,
  requireManifest,
  writeManifest,
} from "../manifest";
import { loadAvailableStacks, repositoryRoot, resolveIde, resolveStacks } from "../registry";
import { CONTENT_ROOT, listFilesRecursively, makeTempProject, runCli } from "./helpers";

const temporaryProjects: string[] = [];

async function tempProject(label: string): Promise<string> {
  const projectRoot = await makeTempProject(label);
  temporaryProjects.push(projectRoot);
  return projectRoot;
}

after(async () => {
  process.env.CODE_FORGE_ROOT = CONTENT_ROOT;
  await Promise.all(temporaryProjects.map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("managed note placement", () => {
  it("goes after YAML frontmatter so the delimiter stays at byte 0", () => {
    const withNote = withManagedNote('---\ndescription: "x"\n---\n# body\n', "rule.md");
    assert.ok(withNote.startsWith('---\ndescription: "x"\n---\n'));
    assert.match(withNote, /^---\n[\s\S]*?\n---\n<!--/);
  });

  it("goes after CRLF frontmatter too", () => {
    const withNote = withManagedNote('---\r\ndescription: "x"\r\n---\r\n# body\r\n', "rule.md");
    assert.ok(withNote.startsWith('---\r\ndescription: "x"\r\n---\r\n'));
    assert.match(withNote, /^---\r\n[\s\S]*?\r\n---\r\n<!--/);
  });

  it("goes after the XML declaration", () => {
    const withNote = withManagedNote('<?xml version="1.0"?>\n<module/>\n', "checkstyle.xml");
    assert.ok(withNote.startsWith('<?xml version="1.0"?>\n'));
    assert.match(withNote, /^<\?xml[^\n]*\n<!--/);
  });

  it("uses line comments for Java so the template still compiles", () => {
    const withNote = withManagedNote("package com.example;\n", "Rules.java");
    assert.ok(withNote.startsWith("// managed by code-forge"));
    assert.ok(!withNote.includes("<!--"));
  });

  it("uses hash comments for YAML", () => {
    assert.ok(withManagedNote("id: java-spring\n", "stack.yaml").startsWith("# managed by code-forge"));
  });

  it("is not applied twice", () => {
    const once = withManagedNote("# body\n", "notes.md");
    assert.equal(withManagedNote(once, "notes.md"), once);
  });
});

describe("yamlScalar", () => {
  it("quotes values so an embedded colon cannot be read as a nested mapping", () => {
    assert.equal(yamlScalar("Clean-code principles: no abbreviations."), '"Clean-code principles: no abbreviations."');
  });

  it("escapes quotes and backslashes", () => {
    assert.equal(yamlScalar('say "hi"'), '"say \\"hi\\""');
    assert.equal(yamlScalar("a\\b"), '"a\\\\b"');
  });
});

describe("sync report", () => {
  it("lists what it removed and what it declined to touch, not just counts", () => {
    const report = createSyncReport();
    report.preserved.push(path.join("/project", "core", "adopted.md"));
    report.removed.push(path.join("/project", "core", "retired.md"));
    report.warnings.push("could not delete something");

    const described = describeSyncReport(report, "/project");

    assert.match(described, /0 added, 0 updated, 0 unchanged, 1 preserved, 1 removed/);
    assert.match(described, /adopted\.md/);
    assert.match(described, /retired\.md/);
    assert.match(described, /Warning: could not delete something/);
  });
});

describe("stack selection", () => {
  it("keeps stacks added later when init runs with the default flag", () => {
    assert.deepEqual(mergeStackSelection(["java-spring", "typescript-react"], ["java-spring"], false), [
      "java-spring",
      "typescript-react",
    ]);
  });

  it("treats an explicit --stack as authoritative, including for removal", () => {
    assert.deepEqual(mergeStackSelection(["java-spring", "typescript-react"], ["java-spring"], true), ["java-spring"]);
  });

  it("uses the request as-is on a first install", () => {
    assert.deepEqual(mergeStackSelection(null, ["java-spring", "java-spring"], false), ["java-spring"]);
  });
});

describe("install manifest", () => {
  it("records the IDE and stacks so update does not have to guess", async () => {
    const projectRoot = await tempProject("manifest-roundtrip");
    await writeManifest(projectRoot, { version: "0.1.0", ide: "cursor", stacks: ["java-spring", "java-spring"] });

    const manifest = await readManifest(projectRoot);

    assert.deepEqual(manifest, { version: "0.1.0", ide: "cursor", stacks: ["java-spring"] });
  });

  it("returns null rather than throwing on a missing or malformed manifest", async () => {
    const projectRoot = await tempProject("manifest-missing");
    assert.equal(await readManifest(projectRoot), null);

    await fs.writeFile(manifestPath(projectRoot), "{ not json");
    assert.equal(await readManifest(projectRoot), null);

    await fs.writeFile(manifestPath(projectRoot), '{"ide":"cursor"}');
    assert.equal(await readManifest(projectRoot), null, "a manifest without stacks is not usable");
  });

  it("fails with an actionable message when a command needs a manifest that is absent", async () => {
    const projectRoot = await tempProject("manifest-required");
    await assert.rejects(() => requireManifest(projectRoot, "update"), /code-forge init --ide/);
  });
});

/**
 * These drive the built CLI as a child process. The bug this suite exists for — `update`
 * re-syncing a Cursor project as an Antigravity one — lived in argument handling, so a
 * test that called the emitters directly could never have caught it.
 */
describe("cli", () => {
  it("re-syncs from the manifest without asking for flags, and never injects the other IDE", async () => {
    const projectRoot = await tempProject("cli-update-fidelity");

    const initialized = await runCli(["init", "--ide", "cursor", "--stack", "java-spring", "--dir", projectRoot]);
    assert.equal(initialized.exitCode, 0, initialized.stderr);

    const updated = await runCli(["update", "--dir", projectRoot]);
    assert.equal(updated.exitCode, 0, updated.stderr);
    assert.match(updated.stdout, /cursor: java-spring/);

    const installed = await listFilesRecursively(projectRoot);
    assert.ok(installed.includes(".code-forge.json"));
    assert.ok(
      !installed.some((name) => name.startsWith(".agents/")),
      "re-syncing must not inject the other IDE's directory tree",
    );
    assert.ok(installed.some((name) => name.startsWith(".cursor/rules/")));
  });

  it("refuses to update or add a stack in a directory it never initialized", async () => {
    for (const args of [["update"], ["add-stack", "java-spring"]]) {
      const projectRoot = await tempProject(`cli-uninitialized-${args[0]}`);

      const result = await runCli([...args, "--dir", projectRoot]);

      assert.equal(result.exitCode, 1);
      assert.match(result.stderr, /No \.code-forge\.json found/);
      assert.deepEqual(await listFilesRecursively(projectRoot), [], "a refused command must write nothing");
    }
  });

  it("prints the setup notes after the file summary, not before it", async () => {
    const projectRoot = await tempProject("cli-note-order");

    const result = await runCli(["init", "--dir", projectRoot]);

    assert.equal(result.exitCode, 0, result.stderr);
    const summaryAt = result.stdout.indexOf("Files: ");
    const notesAt = result.stdout.indexOf("Quality gates for java-spring");
    assert.ok(summaryAt >= 0 && notesAt >= 0, result.stdout);
    assert.ok(summaryAt < notesAt, "setup steps printed first scroll off the top before the summary appears");
  });

  it("names the leftover directories when the project switches IDE", async () => {
    const projectRoot = await tempProject("cli-switch-ide");
    await runCli(["init", "--ide", "cursor", "--dir", projectRoot]);

    const result = await runCli(["init", "--ide", "antigravity", "--dir", projectRoot]);

    assert.equal(result.exitCode, 0, result.stderr);
    assert.match(result.stderr, /previously initialized for cursor/);
    for (const directory of [".cursor/code-forge", ".cursor/rules", ".cursor/commands"]) {
      assert.ok(result.stderr.includes(directory), `the warning must name ${directory} so it can be acted on`);
    }
  });

  it("records the install before writing files, so a failed run is still repairable", async () => {
    // A content root that passes the existence check but holds no stack: emit fails
    // partway, exactly like an interrupted or permission-denied run.
    const brokenRoot = await tempProject("cli-broken-root");
    for (const entry of ["core", "personas", "stacks", "workflows"]) {
      await fs.mkdir(path.join(brokenRoot, entry), { recursive: true });
    }
    const projectRoot = await tempProject("cli-manifest-first");

    const result = await runCli(["init", "--dir", projectRoot], { CODE_FORGE_ROOT: brokenRoot });

    assert.equal(result.exitCode, 1, "a missing stack directory must fail loudly");
    assert.equal(
      (await readManifest(projectRoot))?.ide,
      "antigravity",
      "without a manifest, the `update` that would repair this half-install refuses to run",
    );
  });

  it("removes a stack's files on remove-stack and rejects one that is not installed", async () => {
    const projectRoot = await tempProject("cli-remove-stack");
    await runCli(["init", "--ide", "antigravity", "--dir", projectRoot]);

    const unknown = await runCli(["remove-stack", "rust-axum", "--dir", projectRoot]);
    assert.equal(unknown.exitCode, 1);
    assert.match(unknown.stderr, /is installed/);

    const removed = await runCli(["remove-stack", "java-spring", "--dir", projectRoot]);
    assert.equal(removed.exitCode, 0, removed.stderr);

    const installed = await listFilesRecursively(projectRoot);
    assert.ok(!installed.some((name) => name.includes("java-spring")), installed.join(", "));
    assert.ok(installed.includes(".agents/rules/code-forge-principles.md"), "the core rule must survive");
    assert.deepEqual((await readManifest(projectRoot))?.stacks, []);
  });
});

describe("registry", () => {
  it("loads stack metadata dynamically from stack.yaml", () => {
    const stacks = loadAvailableStacks();
    assert.ok("java-spring" in stacks);
    const spring = stacks["java-spring"];
    assert.equal(spring.id, "java-spring");
    assert.equal(spring.name, "Java Spring Boot");
    assert.deepEqual(spring.ruleGlobs, ["**/*.java", "**/pom.xml", "**/application*.yml"]);
    assert.equal(spring.structureDoc, "package-structure.md");
    assert.ok(spring.qualityGates && "compile" in spring.qualityGates);
    assert.ok(spring.conventionsDocs && spring.conventionsDocs.includes("conventions.md"));
  });

  it("names the supported IDEs when given an unknown one", () => {
    assert.throws(() => resolveIde("vscode"), /Unsupported IDE "vscode".*antigravity, cursor/s);
  });

  it("names the unknown stacks it was given", () => {
    assert.throws(() => resolveStacks(["java-spring", "rust-axum"]), /rust-axum/);
  });

  it("explains itself when the content root does not hold a code-forge checkout", async () => {
    const empty = await tempProject("bad-root");
    process.env.CODE_FORGE_ROOT = empty;
    try {
      assert.throws(() => repositoryRoot(), /CODE_FORGE_ROOT.*missing: core, personas, stacks, workflows/s);
    } finally {
      process.env.CODE_FORGE_ROOT = CONTENT_ROOT;
    }
  });
});
