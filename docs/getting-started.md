# Getting Started

## Install into a Spring Boot service

From this repository:

```
cd installer
npm install && npm run build
node dist/cli.js init --ide antigravity --stack java-spring --dir <path-to-your-service>   # or --ide cursor
```

What lands in your service depends on the IDE:

| IDE | Knowledge base | Rules | Slash commands |
|---|---|---|---|
| Antigravity | `.agents/code-forge/` | `.agents/rules/` — principles `always_on`, java-spring glob-scoped | `.agents/workflows/` |
| Cursor | `.cursor/code-forge/` | `.cursor/rules/*.mdc` — principles `alwaysApply`, java-spring globs | `.cursor/commands/` |

Both install the same four commands: `/plan`, `/implement`, `/review`, `/build`.

Then complete the printed quality-gate setup once (ArchUnit test + Checkstyle plugin).

## Daily usage

- `/plan <task>` — design first; approve or annotate the generated document until it says approved.
- `/implement [task]` — codes it; offers planning for big un-planned work, light-mode for small fixes.
- `/review` — adversarial audit before merge.
- `/build <idea>` — all three chained through approval gates.

## Maintenance

After editing content in this repository, refresh any consuming project:

```
node dist/cli.js update --dir <path-to-your-service>
```

Only files carrying the managed-by marker are overwritten; your local customizations are never touched.
