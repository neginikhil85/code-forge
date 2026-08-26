import * as assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { describe, it } from "node:test";
import { CONTENT_ROOT, javaRegexToJs } from "./helpers";

const GATES_DIR = path.join(CONTENT_ROOT, "stacks", "java-spring", "quality-gates");
const CHECKSTYLE_CONFIG = path.join(GATES_DIR, "checkstyle.xml");

/**
 * Checkstyle itself is not available here, so these tests cover what is checkable
 * offline, and the naming patterns are where nearly all the value is. Two generations of
 * this config shipped broken: the first rejected `main`, `id` and `i` because it used a
 * length floor, the second rejected `generateReport` and `repositories` because its
 * abbreviation guards matched mid-segment.
 *
 * The identifier tables below are therefore written from real Spring code, never read off
 * the regex — reading it off the regex is precisely how the second bug survived review.
 *
 * Still requires a real `mvn checkstyle:check` before trusting the gate end to end.
 */
async function config(): Promise<string> {
  return fs.readFile(CHECKSTYLE_CONFIG, "utf8");
}

function modulesIn(xml: string): string[] {
  return [...xml.matchAll(/<module\s+name="([^"]+)"/g)].map((match) => match[1]);
}

function formatFor(xml: string, moduleName: string): RegExp {
  const block = new RegExp(`<module\\s+name="${moduleName}">([\\s\\S]*?)</module>`).exec(xml);
  assert.ok(block, `no <module name="${moduleName}"> block in checkstyle.xml`);
  const format = /<property\s+name="format"\s+value="([^"]+)"\s*\/>/.exec(block[1]);
  assert.ok(format, `${moduleName} declares no format property`);
  return new RegExp(javaRegexToJs(format[1]));
}

/** Modules that only initialize at Checker level; nesting them under TreeWalker is a hard failure. */
const CHECKER_ONLY_MODULES = ["LineLength", "FileTabCharacter", "SuppressionFilter", "SuppressWarningsFilter"];

describe("checkstyle.xml", () => {
  it("is well-formed enough to locate its modules and closes every tag", async () => {
    const xml = await config();
    const opened = (xml.match(/<module\s/g) ?? []).length;
    const closed = (xml.match(/<\/module>/g) ?? []).length;
    const selfClosed = (xml.match(/<module[^>]*\/>/g) ?? []).length;
    assert.equal(opened, closed + selfClosed, "unbalanced <module> tags");
    assert.ok(xml.startsWith('<?xml version="1.0"?>'));
    assert.ok(xml.includes('<module name="Checker">'));
    assert.ok(xml.includes('<module name="TreeWalker">'));
  });

  /**
   * `ClassName` is not a Checkstyle module at all — the real one is `TypeName`. The other
   * historical failure was a real module (`JavadocType`) configured with a property it
   * does not have, which also aborts initialization. Both kill the whole run, so the two
   * shapes of mistake are checked separately.
   */
  it("does not reference a module that does not exist", async () => {
    const declared = modulesIn(await config());
    assert.ok(!declared.includes("ClassName"), "ClassName is not a Checkstyle module; TypeName is");
    assert.ok(declared.includes("TypeName"));
  });

  it("does not configure a module with a property it does not accept", async () => {
    const xml = await config();
    assert.ok(
      !xml.includes("allowMissingPropertyJavadoc"),
      "JavadocType has no allowMissingPropertyJavadoc property — an unknown property aborts the whole run",
    );
  });

  it("keeps Checker-only modules outside TreeWalker", async () => {
    const xml = await config();
    const treeWalkerStart = xml.indexOf('<module name="TreeWalker">');
    for (const name of CHECKER_ONLY_MODULES) {
      const at = xml.indexOf(`<module name="${name}"`);
      if (at === -1) continue;
      assert.ok(at < treeWalkerStart, `${name} must be declared at Checker level, not inside TreeWalker`);
    }
  });

  it("provides an escape hatch instead of forcing threshold changes", async () => {
    const xml = await config();
    const declared = modulesIn(xml);
    assert.ok(declared.includes("SuppressionFilter"));
    assert.ok(declared.includes("SuppressWarningsFilter"));
    assert.ok(declared.includes("SuppressWarningsHolder"), "the filter does nothing without the holder");
    assert.match(xml, /name="optional"\s+value="true"/, "a project with no suppression file must still run");
  });

  it("ships the suppression file it points at, covering what the gate cannot judge", async () => {
    const suppressions = await fs.readFile(path.join(GATES_DIR, "checkstyle-suppressions.xml"), "utf8");
    const referenced = /<property\s+name="file"\s+value="([^"]+)"/.exec(await config());
    assert.ok(referenced?.[1].endsWith("checkstyle-suppressions.xml"));

    // includeTestSourceDirectory is on, so without these the first `mvn verify` drowns in
    // MagicNumber hits on assertion literals and ConstantName hits on ArchUnit's fields.
    assert.match(suppressions, /ArchitectureTest/);
    assert.match(suppressions, /ConstantName/);
    assert.match(suppressions, /MagicNumber/);
    assert.match(suppressions, /src/);
  });

  /**
   * ArchUnit's idiom is `static final ArchRule someRuleName`, which ConstantName rejects.
   * The suppression above is the fix; this asserts the two files still agree about the
   * file name that carries them.
   */
  it("suppresses ConstantName for the file the ArchUnit template becomes", async () => {
    const suppressions = await fs.readFile(path.join(GATES_DIR, "checkstyle-suppressions.xml"), "utf8");
    const template = await fs.readFile(path.join(GATES_DIR, "archunit-rules.java"), "utf8");
    assert.match(template, /class ArchitectureTest/, "the suppression is keyed to this class name");
    assert.match(template, /static final ArchRule [a-z]/, "the camelCase fields are what needs suppressing");
    assert.ok(suppressions.includes("ArchitectureTest"));
  });

  it("does not import a type that only exists with an optional starter on the classpath", async () => {
    const template = await fs.readFile(path.join(GATES_DIR, "archunit-rules.java"), "utf8");
    assert.ok(
      !/^import .*MongoTemplate;$/m.test(template),
      "importing MongoTemplate breaks compilation for every service without spring-data-mongodb",
    );
    assert.match(template, /"org\.springframework\.data\.mongodb\.core\.MongoTemplate"/, "reference it by name instead");
  });

  /**
   * Real identifiers from Spring services and the JDK. Anything here that the gate rejects
   * is a false positive that will make a developer disable the gate.
   */
  const accepted: Record<string, string[]> = {
    MethodName: [
      "main",
      "run",
      "get",
      "set",
      "save",
      "of",
      "toString",
      "calculateTotal",
      "generateReport",
      "shouldReject_whenBlank",
      "findAllByStatus",
      "describeContents",
      "approve",
      "respond",
      "requireNonNull",
    ],
    TypeName: [
      "User",
      "Item",
      "Role",
      "Cart",
      "Page",
      "Address",
      "Repository",
      "Attribute",
      "Calculator",
      "ReportController",
      "ResponseAdvice",
      "RequestFilter",
      "ContextHolder",
      "PropertySource",
      "ObjectMapper",
    ],
    MemberName: [
      "id",
      "key",
      "url",
      "uri",
      "sku",
      "userService",
      "orderRepositories",
      "reportId",
      "properties",
      "descriptions",
      "totals",
      "amounts",
    ],
    ParameterName: ["id", "to", "at", "request", "userId", "reports", "attributes", "responses", "context"],
    LocalVariableName: [
      "i",
      "j",
      "n",
      "total",
      "error",
      "frequency",
      "numeric",
      "descending",
      "object",
      "reporting",
      "repositories",
      "attract",
      "calculus",
      "interval",
      "approval",
      "requested",
      "temporary",
      "counter",
      "index",
    ],
    ConstantName: ["log", "logger", "serialVersionUID", "MAX_RETRIES", "DEFAULT"],
  };

  /** The abbreviations the clean-code rules exist to stamp out. */
  const rejected: Record<string, string[]> = {
    MethodName: ["calcTotal", "getUsrSvc", "loadCfg", "buildMsg", "nextIdx", "getAttrs", "getRepo", "parseAddr"],
    TypeName: ["UsrDto", "SvcFactory", "CfgLoader", "MsgHandler", "UserRepo", "AddrBook", "RespWrapper", "CtxHolder"],
    MemberName: ["usrService", "svcClient", "cfgValue", "msgText", "idxPointer", "descText", "propMap"],
    ParameterName: ["usr", "svc", "cfg", "msg", "qty", "amt", "req", "resp", "desc", "ctx", "obj"],
    LocalVariableName: ["tmp", "idx", "calcResult", "pwdHash", "btnLabel", "userMgr", "totCount", "cnt", "props"],
    ConstantName: ["maxRetries", "Max_Retries", "someRule"],
  };

  for (const [moduleName, identifiers] of Object.entries(accepted)) {
    it(`${moduleName} accepts idiomatic Java identifiers`, async () => {
      const pattern = formatFor(await config(), moduleName);
      for (const identifier of identifiers) {
        assert.match(identifier, pattern, `${moduleName} must not reject "${identifier}"`);
      }
    });
  }

  for (const [moduleName, identifiers] of Object.entries(rejected)) {
    it(`${moduleName} rejects compressed identifiers`, async () => {
      const pattern = formatFor(await config(), moduleName);
      for (const identifier of identifiers) {
        assert.doesNotMatch(identifier, pattern, `${moduleName} must reject "${identifier}"`);
      }
    });
  }

  /**
   * The mechanism, stated as a property rather than as config shape: a banned trigram is
   * only banned where a camelCase segment ends with it. That single rule is what lets
   * `getRepo` fail while `repositories` passes, and it is the invariant to preserve if the
   * token list ever changes.
   */
  it("bans a trigram only where it ends a camelCase segment", async () => {
    const pattern = formatFor(await config(), "LocalVariableName");
    for (const [banned, allowed] of [
      ["repo", "reporter"],
      ["attr", "attraction"],
      ["calc", "calculation"],
      ["addr", "addressing"],
      ["desc", "descendant"],
      ["resp", "respond"],
      ["req", "request"],
      ["prop", "property"],
      ["obj", "objective"],
      ["tot", "total"],
    ]) {
      assert.doesNotMatch(banned, pattern, `"${banned}" ends a segment, so it must be rejected`);
      assert.match(allowed, pattern, `"${allowed}" continues past the trigram, so it must be accepted`);
    }
    assert.doesNotMatch("getAttrs", pattern, "a trailing plural must not smuggle an abbreviation through");
    assert.match("attributes", pattern, "but a real plural must still pass");
  });

  it("constrains names by shape rather than by length", async () => {
    const xml = await config();
    for (const moduleName of Object.keys(accepted)) {
      const source = formatFor(xml, moduleName).source;
      assert.doesNotMatch(source, /\{\d+,\}/, `${moduleName} still uses a minimum-length quantifier`);
    }
    assert.ok(xml.includes('<module name="AbbreviationAsWordInName">'), "consecutive capitals need their own check");
  });

  it("keeps the five name patterns in sync, since Checkstyle cannot share one", async () => {
    const xml = await config();
    const guards = ["TypeName", "MethodName", "MemberName", "ParameterName", "LocalVariableName"].map((moduleName) => {
      const guard = /^\^\(\?!\.\*\(\?:.*?\)s\?\(\?!\[a-z\]\)\)/.exec(formatFor(xml, moduleName).source);
      assert.ok(guard, `${moduleName} does not use the shared abbreviation guard`);
      return guard[0];
    });
    assert.equal(new Set(guards).size, 1, `the name patterns have drifted apart: ${new Set(guards).size} variants`);
  });
});

describe("maven-snippets.xml", () => {
  it("pins the Checkstyle engine, not just the plugin", async () => {
    const snippets = await fs.readFile(path.join(CONTENT_ROOT, "stacks", "java-spring", "maven-snippets.xml"), "utf8");
    assert.match(snippets, /<artifactId>checkstyle<\/artifactId>\s*<version>\d+\.\d+/);
    assert.match(snippets, /<violationSeverity>error<\/violationSeverity>/);
    assert.match(snippets, /<failOnViolation>true<\/failOnViolation>/);
    assert.match(snippets, /<artifactId>archunit-junit5<\/artifactId>/);
  });
});
