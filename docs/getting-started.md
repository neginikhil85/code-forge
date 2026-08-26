# Getting Started

## Install into a Spring Boot service

From this repository:

```
cd installer
npm install && npm test
node dist/cli.js init --ide antigravity --stack java-spring --dir <path-to-your-service>   # or --ide cursor
```

`npm test` type-checks, builds, and verifies the emitted output. Use `npm run build` if you
only want the build.

What lands in your service depends on the IDE:

| IDE | Knowledge base | Rules | Slash commands |
|---|---|---|---|
| Antigravity | `.agents/code-forge/` | `.agents/rules/` — principles `always_on`, java-spring glob-scoped | `.agents/workflows/` |
| Cursor | `.cursor/code-forge/` | `.cursor/rules/*.mdc` — principles `alwaysApply`, java-spring globs | `.cursor/commands/` |

Both install the same four commands: `/plan`, `/implement`, `/review`, `/build`.

`init` also writes `.code-forge.json` at the root of your service, recording the IDE and
stacks it installed. `update` and `add-stack` read it, so you never have to repeat those
flags — and cannot accidentally re-sync a Cursor project as an Antigravity one. Commit it.

Then complete the printed quality-gate setup once. The ArchUnit test and Checkstyle
templates are installed under `<knowledge base>/stacks/java-spring/quality-gates/`, with
the pom.xml snippets alongside them in `maven-snippets.xml`. Expect real violations on the
first `mvn verify` — fix them or add narrow entries to `checkstyle-suppressions.xml`
rather than relaxing the thresholds.

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

## The managed-file contract

Every file code-forge writes carries a `managed by code-forge` marker, commented in that
file's own syntax. The marker is the contract:

- **Marker present** — code-forge owns the file. `update` restores it, discarding local
  edits. This is what keeps a project in sync with the repository.
- **Marker removed** — the file is yours. `update` never writes to it again, and reports
  it as `preserved` so you can see what was skipped.

So to customize a bundled document, delete its marker block and edit freely. To go back to
the shipped version, delete the file and run `update`.

Every run prints a summary — `Files: 3 added, 1 updated, 21 unchanged, 1 preserved` —
followed by the path of anything it left alone.

Adding a stack later:

```
node dist/cli.js add-stack <stack-id> --dir <path-to-your-service>
```

`add-stack` requires an existing `.code-forge.json`; it will not silently perform a first
install. Removing a stack is not yet automated — delete its directory under the knowledge
base and its rule file by hand, then edit `.code-forge.json`.
