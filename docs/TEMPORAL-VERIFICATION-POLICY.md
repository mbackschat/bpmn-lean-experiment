# Temporal verification policy

## Status

Implemented mandatory evidence procedure for hosting and replay. [The testing entry point](TESTING-SPEC.md) owns cadence and selection; [the lifecycle specification](TEMPORAL-PROCESS-LIFECYCLE-SPEC.md) owns behavior and [the test evidence map](TEMPORAL-TEST-EVIDENCE-MAP.md) owns exact witness locations. This policy does not expand an implemented feature or profile claim.

## Current Temporal gate

```sh
./scripts/pnpm.sh run test:temporal
```

The complete feature-by-feature witness, mutation, durable-history, and replay inventory for this gate is maintained in the [Temporal test evidence map](TEMPORAL-TEST-EVIDENCE-MAP.md).

The optional `test:timer-time-skipping` command runs the same exact timer result and durable-history assertion on Temporal's time-skipping test server. It is calibration only and is excluded from `verify.sh`; it cannot replace or weaken the full-server duration, Worker absence, history, replay, or cleanup evidence.

## History and refinement acceptance

No Event History fixture is committed during pre-release, and no legacy IL reader or general format migration path exists. The only permitted Workflow patch is exact `bpmn-workflow-chain-v1` enrollment with stable protocol identity: direct two-argument starts remain outside it, while Product 1 starts use the exact production Initial host envelope. Disposable replay evidence is not an immutable deployment/history baseline.

The [Temporal witness and mutation inventory](TEMPORAL-TEST-EVIDENCE-MAP.md#temporal-witness-and-mutation-inventory) is the sole detailed owner for count/byte rollover, separate-argument continuation accounting, Run capacity, paired publication selection, recovery/terminal capacity and native-deployment witnesses. Its exact-fit, overflow, identity-first recovery, failure-before-mutation, privacy, durable-history and replay discriminators remain required; moving their inventory does not broaden a semantic claim. New coverage updates that map and its executable witness together rather than copying the inventory here.

Run high-volume recovery capacity as a separate sequential child of `test:temporal`, preserving the production bound without starving concurrent millisecond-deadline probes. Lowered pure bounds can separate ordering but cannot substitute for production live capacity evidence. Test-owned padding must leave the registered BPMN source, selected profile, compiled operations and CIB claim unchanged.

The callback-based deployment-admission witness establishes sequencing and patch-marker replay only, never production routing or legacy-conversion permission. Native deployment acceptance also requires shared-correlation, future Schedule dispatch and closure review under [the deployment repair](TEMPORAL-WORKER-DEPLOYMENT-REPAIR-SPEC.md); completed replay alone is insufficient.

When the owner approves the first immutable deployment/history baseline, retained histories and compatibility paths must be introduced through red replay tests with explicit provenance, version markers, support windows, and removal criteria.
