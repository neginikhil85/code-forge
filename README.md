# code-forge

A context-engineering framework that drives IDE chat agents to produce clean, maintainable, loosely coupled code — every cycle, without the developer memorizing rules.

Supported IDEs: **Antigravity**, **Cursor** (Claude Code and Copilot planned).
## How it works

Three user-facing commands, one mental model:

| Command | What it does |
|---|---|
| `/plan <task>` | Low-level code design: package structure, API contracts, config/constants sweep, inter-service communication decisions. Approval-gated. |
| `/implement [task]` | Codes against conventions, then runs an adversarial self-review loop until quality gates pass. Offers inline planning for non-trivial work without an approved plan; light-mode for trivial fixes. |
| `/review` | Fresh-context adversarial audit of the current diff. Report-first with refactor suggestions. |
| `/build <idea>` | Convenience alias: plan → approval → implement → review in one chain. |

Everything else (patterns, personas, quality gates, stacks) is invisible machinery.

## Structure

```
core/       Language-agnostic principles, patterns, and the shared review checklist
personas/   Architect, Implementer, Clean-Code-Reviewer role definitions
stacks/     Per-language convention packs (java-spring first)
workflows/  Command definitions emitted per IDE
installer/  CLI that emits rules/workflows into target projects, plus its test suite
```

## Getting started

```
cd installer
npm install && npm test
node dist/cli.js init --ide antigravity --stack java-spring --dir <path-to-your-service>   # or --ide cursor
```

Then complete the printed quality-gate setup (ArchUnit test + Checkstyle plugin) once per service. See `docs/getting-started.md` for details, including the managed-file contract that governs what `update` will and will not overwrite.

## Status

v0.1.0 — the installer is covered by tests that assert the emitted rules activate, the
quality-gate templates are delivered, every bundled reference resolves, workflows dynamically
template active stack conventions, and files you have adopted survive an `update`.

The package is configured for distribution (`npm pack` / `npx code-forge init`).

What has **not** been validated yet: the Checkstyle config has not been run through a real
`mvn checkstyle:check`, the ArchUnit template has not been compiled against a real service,
and nothing here has been dogfooded on production code. Treat the content as considered and
the enforcement as unproven.

Roadmap:
- Run the quality gates against a real Spring Boot service and fix what they reject
- Dogfood tuning against real Spring Boot services
- Additional IDE emitters (Claude Code, Copilot)
- typescript-react stack pack
