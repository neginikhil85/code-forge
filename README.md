# code-forge

A context-engineering framework that drives IDE chat agents (Antigravity, Cursor, Claude Code, Copilot) to produce clean, maintainable, loosely coupled code — every cycle, without the developer memorizing rules.

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
installer/  CLI that emits rules/workflows into target projects
```

## Getting started

```
cd installer
npm install && npm run build
node dist/cli.js init --ide antigravity --stack java-spring --dir <path-to-your-service>
```

Then complete the printed quality-gate setup (ArchUnit test + Checkstyle plugin) once per service. See `docs/getting-started.md` for details.

## Status

v0.1.0 — usable end to end: core content, personas, java-spring pack, quality-gate templates, workflows, and a working Antigravity installer.

Roadmap:
- Dogfood tuning against real Spring Boot services
- Additional IDE emitters (Cursor, Claude Code, Copilot)
- typescript-react stack pack
