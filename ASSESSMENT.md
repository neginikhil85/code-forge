# code-forge — Engineering Assessment

**Date:** 2026-08-26 · **Version reviewed:** v0.1.0 · **Method:** full content read, plus compiled the installer and ran it against throwaway target projects. Claims below are marked *verified* (I ran it) or *high confidence* (reasoned from knowledge — no network access in this environment to check third-party docs). No files in the repo were modified.

---

## Verdict

The idea is sound and the content is genuinely good. The delivery layer has a handful of defects that stop the framework from delivering most of its value, and one that destroys user edits.

The three that matter: **the always-on principles rule almost certainly never activates**, **the quality-gate templates are never delivered to the target project**, and **`update` silently overwrites local customizations despite the docs promising it won't**. All three are shallow fixes — a day or two of work, not a redesign.

What lands correctly today: the four slash commands, the bundled knowledge base, and the path rewriting inside workflows. What's lost: the always-on rule, the glob-scoped stack rule, and the mechanical gates. So an install isn't worthless — but the enforcement spine of the design isn't running, and nothing in the output tells you that. Silent failure is the worst mode for this class of tool.

One line: the thinking is at v0.9, the plumbing is at v0.3.

---

## What's genuinely strong

**The content is the product, and the content is good.** This is the hard-to-copy part, and it's done well. It's specific where most "AI coding standards" repos are vague:

- `solid.md` ranks principles *by how often generated code violates them* and gives a decomposition order (validator → mapper → client → events). Written for the real failure modes of a generator, not copied from a textbook.
- `clean-code.md` uses a bad/good naming table instead of adjectives, and enumerates the four *justified* comment categories rather than saying "comment well."
- `conventions.md` has a real numbered decision tree for config placement with a hard threshold ("scattered `@Value`s are a violation once the count reaches two").
- Every pattern guide carries **Anti-patterns** and **Review signals**, including when *not* to apply the pattern ("pays off from three variants onward"). That restraint is what stops an agent pattern-spamming simple code.
- `review-checklist.md` is one shared artifact consumed by both the self-review loop and the reviewer persona. One rubric, two consumers.

**Three architectural decisions I'd defend in review:**

1. **Diff-scoped review with a non-blocking tech-debt appendix.** Stops the reviewer ballooning every change into a refactor. Applied consistently across checklist, persona, and workflow.
2. **Thin pointer rules + bundled knowledge base.** Rule files stay small so always-on context cost is low; detail loads on demand. Correct instinct for context budget.
3. **Mechanical gates behind the prompts.** ArchUnit and Checkstyle exist because prompting can't *guarantee* structure. Recognizing that prompts need external enforcement is the most mature idea here.

**The honesty contract** — "never claim quality you did not verify," the iteration-exhausted reporting path, the `[Yes/No/Cancel]` prompt that offers planning rather than refusing — is unusually well thought through. Most frameworks let the agent declare success.

---

## Blocking defects

### 1. `update` destroys local customizations — the docs promise the opposite

`docs/getting-started.md:39` states: *"Only files carrying the managed-by marker are overwritten; your local customizations are never touched."*

That guarantee is not implemented. `copyManagedDirectory` (`shared.ts:66`) calls `fs.copyFile` unconditionally, and `prependManagedHeader` only skips *adding* the marker — it never checks whether the file diverged. Both emitters `writeFile` unconditionally too.

**Verified:** I added `MY LOCAL CUSTOMIZATION - DO NOT LOSE` to an installed `solid.md` and `plan.md`, ran `update`, and both were silently overwritten. Exit 0, "Updated managed files."

This is the one defect that loses user work, so it's first. Either honor the marker (skip files whose marker was removed, and warn on modified-but-still-marked files) or correct the documentation. The design intent in `MANAGED_HEADER` — "To customize, copy this file and remove the managed marker" — is the right model; it just isn't enforced.

### 2. Rule frontmatter is malformed — the always-on rule almost certainly never loads

Two independent bugs stack.

`MANAGED_HEADER` is prepended *before* the YAML frontmatter (`antigravity.ts:44`, `cursor.ts:31`), so emitted files begin:

```
<!--
  managed by code-forge — ...
-->
---
description: ...
trigger: always_on
---
```

**Verified:** all 12 emitted files (6 per IDE) start with `<!--`, not `---`.

Second, independently: both rule descriptions contain an unquoted `": "` (`shared.ts:122`, `:127`) — e.g. `description: Clean-code principles: naming without abbreviations...`. That is invalid YAML. **Verified** on all four emitted rule files:

```
ScannerError: mapping values are not allowed here
```

The workflow files parse (their descriptions use em-dashes, not colons) but still have the byte-0 problem.

**Impact (high confidence, not directly testable here):** frontmatter parsers conventionally require the `---` delimiter at byte 0, so `trigger: always_on` and `alwaysApply: true` are very likely ignored — meaning the rule meant to apply to *every* change doesn't load, and the glob-scoped stack rule doesn't either. Worth confirming in five minutes by checking whether the IDE lists the principles rule as "Always."

Note the commands still work: both IDEs dispatch slash commands by filename, so `/plan` etc. register regardless.

**Fix:** frontmatter first, managed marker as a comment *after* it; quote the descriptions or drop the colons.

### 3. Quality-gate templates are never delivered

`EXCLUDED_BUNDLE_ENTRIES` (`shared.ts:13`) excludes `quality-gates`, `maven-snippets.xml`, and `stack.yaml`. Meanwhile `printQualityGateInstructions` (`shared.ts:139-144`) tells the user to copy `archunit-rules.java` and `checkstyle.xml`, and refers to "snippets in the bundled maven-snippets.xml."

**Verified:** searching both installed targets for `archunit*`, `checkstyle*`, `maven-snippets*`, `stack.yaml`, `quality-gates` returns zero hits, while the CLI prints the copy instructions verbatim. It tells you to copy files it never wrote.

The architecture and style gates in `implement.md` are unreachable as a result. (`compile` and `verify` still run — they don't depend on the templates.)

### 4. The Checkstyle config can't initialize, and needs rethinking once it can

Two module errors — **high confidence, not verified** (no network to reach Checkstyle docs, no Checkstyle jar available; please confirm with `mvn checkstyle:check`):

- `<module name="ClassName">` (line 16) is not a Checkstyle module. The type-naming check is `TypeName`.
- `allowMissingPropertyJavadoc` (line 31) is not a `JavadocType` property. (It historically belonged to `JavadocMethod` and moved to `MissingJavadocMethod` in Checkstyle 8.20.)

Either produces `cannot initialize module TreeWalker`, so `checkstyle:check` never reaches your code.

**Once those are fixed**, the minimum-length regexes reject idiomatic Java. **Verified** by testing the actual patterns from the file:

| Module | Pattern | Rejects |
|---|---|---|
| `MethodName` | `^[a-z][a-zA-Z0-9]{4,}(_[a-zA-Z0-9]+)?$` | `main`, `run`, `get`, `set`, `save`, `test`, `of` |
| `ClassName`/`TypeName` | `^[A-Z][a-zA-Z0-9]{4,}$` | `User`, `Item`, `Role`, `Cart`, `Tag`, `Page`, `Task`, `Rule` |
| `MemberName` | `^[a-z][a-zA-Z0-9]{3,}$` | `id`, `key`, `url`, `uri`, `sku` |
| `ParameterName` | `^[a-z][a-zA-Z0-9]{2,}$` | `id`, `to`, `at` |
| `LocalVariableName` | `^[a-z][a-zA-Z0-9]{2,}$` | `i`, `j`, `n` |

`main` and `id` alone break every Spring Boot service on the first run; `i`/`j` break most loops.

Length is the wrong mechanism for "no abbreviations" anyway — it can't distinguish `usrSvc` from `userService`, which is the actual target. Prefer `AbbreviationAsWordInName` plus an explicit banned-substring list via `IllegalIdentifierName`, and leave judgment to the reviewer, exactly as the file's own comment says it intends.

---

## Correctness and design issues

**5. `update` silently writes to the wrong IDE.** `docs/getting-started.md:36` documents `node dist/cli.js update --dir <path>` with no `--ide`, but the flag defaults to `antigravity` (`cli.ts:39`). **Verified:** running the documented command against a Cursor install created 22 files under `.agents/` while the 22 files under `.cursor/` — the ones the user meant to refresh — were left stale. Exit 0, reports success.

Root cause: nothing records what was installed. **Write an install manifest** (`.code-forge.json`: ide, stacks, version) at `init` and have `update` read it and ignore the flags. That also fixes `update` re-syncing *all* stacks regardless of what's present (`cli.ts:40`), and never pruning a stack you removed.

**6. Path rewriting is applied to workflows but not to bundled content.** `rewritePaths` runs in `emitWorkflows`/`emitCommands` but not in `copyManagedDirectory`. **Verified broken** in installed output:

- `patterns/strategy-map-registry.md` — `solid.md:19` (also missing its `core/` prefix at source, so rewriting alone wouldn't fix it)
- `quality-gates/` — `package-structure.md`
- `core/patterns/combinator-validators.md` — `libraries.md`

None resolve from the project root or from the file's own directory.

The regex approach is also fragile going forward. `stacks/<x>/` and `personas/` are unanchored global replaces (`shared.ts:21-27`) that would rewrite those strings inside prose or code blocks; `core/` at least has a lookbehind guard. No false rewrites occur in the four current workflows — I diffed source against emitted output and every substitution was correct — so this is latent risk, not a present bug. Scope replacement to backticked paths, or move to explicit tokens (`{{FORGE_ROOT}}`) resolved at emit time.

**7. Multi-stack support is structurally absent despite being the roadmap.** `workflows/plan.md:15-18` and `implement.md:22` hardcode `stacks/java-spring/...` — the only five such references in the content. Install a future `typescript-react` pack and the workflows still point at Java. Workflows need the active stack templated in.

**8. `stack.yaml` is dead metadata.** **Verified:** nothing reads it — the sole repo-wide reference is the exclusion set at `shared.ts:13`, and no YAML parser is even a dependency. Its globs duplicate `registry.ts:22-28`; its gate commands duplicate `shared.ts:147-151`. Two facts, two copies each, already free to drift. Either make `stack.yaml` the source of truth — which is what turns "add a stack" into a data change instead of a code change — or delete it.

**9. ArchUnit template.** `.consideringOnlyDependenciesInLayers()` (line 25) filters out dependencies whose *target* sits outside the declared layers, so the model is narrower than `package-structure.md`'s 15 packages implies: a `mapper → repository` dependency is still caught, but nothing constrains who may depend on `mapper`/`validator`/`clients`, or where those may point outside the three layers. `package-structure.md`'s claim that the dependency direction is "enforced mechanically by ArchUnit" overstates what these six rules cover. Worth verifying the template compiles and that each rule actually fires against a sample service — several are easy to write and hard to notice failing open.

---

## Gaps for credibility as a product

**No tests, no CI, no linter.** **Verified:** no test or spec files, no `test` script, no `.github/`, no ESLint/Prettier/editorconfig. For a tool whose entire pitch is enforcing quality gates, that's the credibility problem — and it's *why* defects 1, 2, 3, and 5 exist. A single snapshot test asserting "every emitted rule file starts with `---` and parses as YAML" catches the most severe one. Start there.

**Distribution is broken for the documented install path.** `package.json` has a `bin` but no `files` or `prepublishOnly`. **Verified:** `npm pack --dry-run` publishes 12 files, all under `installer/` — `core/`, `personas/`, `stacks/`, and `workflows/` are absent from the tarball entirely. So `npm i -g` ships a CLI with no content, independent of the `repositoryRoot()` (`registry.ts:16`) path assumption that also breaks there. Clone-and-build is fine for dogfooding, but `npx code-forge init` is what makes this adoptable.

**Error handling is thin.** Exit codes are correct (**verified** `1` on all three failure paths). But a wrong `CODE_FORGE_ROOT` leaks `ENOENT: ... scandir '/tmp/nope/core'` instead of "code-forge root not found at X." `cli.ts:50` does `error.message`, which prints `undefined` for a thrown non-Error and would `TypeError` into an unhandled rejection (exit **0**) for a thrown `null` — latent only, since no current path throws a non-Error.

**No preflight or postflight validation.** `add-stack` on a never-initialized project silently performs a full 22-file install (**verified**, exit 0), despite its help text saying "already initialized by code-forge." And nothing validates that emitted YAML parses — the check that would have caught defect 2. Re-running `init` is byte-identical, which is good (**verified** idempotent).

**Unverifiable claims in the README.** `README.md:41` says "usable end to end" and "a working Antigravity installer." It compiles and exits 0, but the always-on rule doesn't load and the gates aren't delivered. Not dishonest — untested. Worth softening until a test proves it.

**Smaller content gaps:** `docs/design/<feature>.md` has no `<feature>` derivation rule and no collision handling — two features could overwrite each other's plans. `implement.md`'s trivial-scope test ("≤ 2 files touched") is evaluated *before* implementation, when the file count isn't known yet; make it an estimate explicitly. Personas and workflows duplicate substantial prose (`implementer.md` routing vs `implement.md` routing, reviewer report format twice) — two places to drift; make the workflow a pointer to the persona.

**One content inconsistency worth resolving:** `observer-events.md` calls mappers statically (`UserRequestMapper.toEntity(request)`) while `conventions.md` mandates constructor injection and `package-structure.md` places mappers as classes. Static mappers can't be mocked, which collides with `testing.md`'s "mock at repository/client/publisher boundaries." Pick one — injected `@Component` mappers or static utilities — and say so, or agents will resolve it differently every time.

---

## Recommended order

**Make it correct (~1 day, unblocks everything):**

1. Honor the managed marker in `update`, or fix `getting-started.md:39`. *Stops losing user work.*
2. Fix rule frontmatter — `---` at byte 0, quote descriptions. *Highest value in the repo.*
3. Stop excluding `quality-gates/` and `maven-snippets.xml` from the bundle.
4. Fix `checkstyle.xml`: `ClassName`→`TypeName`, drop the bad Javadoc property, replace length regexes with `AbbreviationAsWordInName` + banned list. Then actually run `mvn checkstyle:check` against a real service.

**Make it trustworthy (~2 days):**

5. Install manifest (`.code-forge.json`); `update` reads it instead of defaulting to antigravity.
6. Snapshot tests on emitter output: frontmatter at byte 0, YAML parses, expected file set present, no unresolvable relative refs, idempotent re-run, customized files preserved. GitHub Actions running build + tests.
7. Apply path rewriting to bundled content, scoped to backticked paths; fix `solid.md:19`'s missing `core/` prefix.
8. Verify the ArchUnit template compiles and that each rule fires against a sample service.

**Make it scale (then, and only then, add stacks):**

9. Template the active stack into workflows; remove hardcoded `java-spring`.
10. Make `stack.yaml` the single source of truth for globs and gate commands.
11. Add `files` + `prepublishOnly` and package the content directories so `npx code-forge` works.

---

## Closing

Defects 1–4 are the difference between a strong README and a working tool, and they're all shallow. The reason I'd push hard on the tests in step 6 isn't process hygiene — it's that every blocking defect here is one a single snapshot test would have caught, and this tool's whole premise is that quality needs mechanical enforcement rather than good intentions. Right now code-forge doesn't apply its own thesis to itself. Fixing that is both the cheapest work available and the most on-brand.

Fix the plumbing and this is genuinely useful. The hard part — knowing what good code looks like and encoding it so an agent can act on it — is already done.
