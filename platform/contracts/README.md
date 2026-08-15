# Platform public contracts

`@bpmn-lean/platform-contracts` owns Product 2's transport-visible HTTP and event shapes. It provides strict route builders, request and response types, canonical encoders, and recursive decoders without service implementation or BPMN interpretation.

## What you can do

Build or decode public definition, start, schedule, Message publication, Process search, human-work, incident, committed-execution, flow-node-metrics, and operator-audit requests and results. The decoders fail closed on malformed JSON, duplicate keys, unknown fields, noncanonical identities or ordering, and private host facts.

## Quick start

```sh
./scripts/pnpm.sh --filter @bpmn-lean/platform-contracts test
```

## Learn more

- [Architecture](../../docs/ARCHITECTURE.md#public-contracts) owns the package boundary and dependency direction.
- [Platform proposal](../../docs/BPM-PLATFORM-PROPOSAL.md) owns the definition and start contract.
- [Human-work specification](../../docs/BPM-PLATFORM-HUMAN-WORK-SPEC.md) owns task discovery, claim, completion, and audit behavior.
- [Incident-operations specification](../../docs/BPM-PLATFORM-INCIDENT-OPERATIONS-SPEC.md) owns incident resources and actions.
- [Process-instance search specification](../../docs/BPM-PLATFORM-PROCESS-INSTANCE-SEARCH-SPEC.md), [committed-execution publication specification](../../docs/capsules/COMMITTED-EXECUTION-PUBLICATION-SPEC.md), and [flow-node occurrence metrics specification](../../docs/capsules/FLOW-NODE-OCCURRENCE-METRICS-SPEC.md) own the Operations contracts.
- [Operator history and audit export specification](../../docs/BPM-PLATFORM-OPERATOR-HISTORY-AUDIT-EXPORT-SPEC.md) owns the independently ordered Work and incident-action export contract.
- [Implementation map](../../docs/IMPLEMENTATION-MAP.md) records the exact current public surface.
