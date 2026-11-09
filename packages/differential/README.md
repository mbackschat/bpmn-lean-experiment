# Differential comparator

`@bpmn-lean/differential` compares canonical scenario results (`contracts/schemas/canonical-result.schema.json`) without accessing engines, Temporal, files or databases: exact structural comparison that reports the first typed disagreement in outcome, trace length, observation kind or observation value. Open waits compare in the schema's canonical order; a command's `code` and a state's non-root `scopes` compare only between the two kernels, since retained CIB Seven evidence lies outside that observation boundary.

## Targets

Cases are discovered, never registered: every `*scenario.json` under `scenarios/` and `test/fixtures/` ([discovery](test/scenario-discovery.ts)). A single-instance scenario carries retained CIB Seven evidence when a `<stem>cibseven-evidence.json` lies beside it, bound to the exact scenario and profile bytes.

- The [kernel oracle](test/kernel-behavior-oracle.integration-test.ts) runs every discovered scenario and population scenario through Lean `kernelRun` and the TypeScript kernel and requires equal whole results, then requires each retained CIB result to equal the kernel's. `./scripts/pnpm.sh run test:pipeline` runs it under the deadline [`scripts/pipeline-budget.ts`](../../scripts/pipeline-budget.ts) derives from the discovered scenario count.
- The [Temporal host target](test/temporal-host-target.temporal-test.ts) runs every discovered single-instance scenario through `@bpmn-lean/temporal-host`'s scenario runner on an ephemeral server and requires the kernel's result. It needs a Temporal server, so only the hosted lane runs it.
- The live CIB Seven engine reproduces every retained result in the runtime lane's oracle script (`scripts/test-cibseven-oracle.sh`), not here.

## Quick start

```sh
./scripts/pnpm.sh run test:differential
```
