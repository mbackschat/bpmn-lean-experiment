# Web application implementation index

This is a contributor and agent index for the web package. Human orientation and commands belong in the [README](README.md); normative behavior belongs in the linked specifications.

## Boundary

The web app consumes only public Product 2 HTTP contracts. It does not import platform services, repositories, engine representations, Temporal APIs, or Event History. Public decoders reject unknown, duplicate, private, status-inconsistent, and identity-drifting responses before data becomes current UI state.

## Feature map

| Surface | Main source owners | Contract |
|---|---|---|
| Definitions and exact-version start | `definitions-api.ts`, `definition-workspace.tsx`, `exact-definition.ts` | [Platform proposal](../../../docs/BPM-PLATFORM-PROPOSAL.md) |
| Diagram presentation and download | `definition-diagram.tsx`, `bpmn-viewer.ts`, `definition-presentation-api.ts` | [Diagram presentation decision](../../../docs/BPMN-DIAGRAM-PRESENTATION-DECISION.md) |
| Human Work | `work-inbox-panel.tsx`, `work-task-detail-workspace.tsx`, `work-completion-operation.ts`, `work-tasks-api.ts` | [Human-work specification](../../../docs/BPM-PLATFORM-HUMAN-WORK-SPEC.md) |
| Process search and committed execution | `process-instance-search-panel.tsx`, `process-execution-api.ts`, `process-instance-execution-detail.tsx` | [Process-instance search specification](../../../docs/BPM-PLATFORM-PROCESS-INSTANCE-SEARCH-SPEC.md) and [committed-execution publication specification](../../../docs/capsules/COMMITTED-EXECUTION-PUBLICATION-SPEC.md) |
| Incidents and audit | `incidents-panel.tsx`, `incident-detail-load.tsx`, `incident-action-operation.ts`, `incident-audit-panel.tsx` | [Incident-operations specification](../../../docs/BPM-PLATFORM-INCIDENT-OPERATIONS-SPEC.md) |
| Flow-node metrics | `flow-node-metrics-panel.tsx`, `flow-node-metrics-load.ts`, `flow-node-metric-overlay.ts` | [Flow-node occurrence metrics specification](../../../docs/capsules/FLOW-NODE-OCCURRENCE-METRICS-SPEC.md) |

## Human Work invariants

- Claiming is explicit platform authorization state. Navigation never claims a task.
- An unclaimed row exposes Claim but no task-detail or completion control.
- Completion request construction requires the current published claim and uses its exact generation.
- A valid 4xx Work response is a definite refusal and clears retry state. Transport loss, malformed responses after possible transmission, and explicit indeterminate results retain the exact immutable operation for retry.
- Committed completion returns to the refreshed collection. Rejected and uncertain outcomes remain in detail with explicit focus.

## Diagram boundary

The viewer consumes only digest-bound public presentation. Source-authored Diagram Interchange is labeled as source layout; generated layout is a derived portable copy. Execution markers include exact published Sequence Flows and active waits, never inferred scope containers. Missing rendered elements are reported honestly.

## Browser evidence

The fixed-fixture [UI-quality harness](../../../showcase/platform-ui-quality/README.md) runs the production build in headless Chromium at 1280 and 1600 pixels. Real-host milestone showcases compose the production platform server, Temporal Worker, and public browser client for complete user journeys. Unit and package tests remain the fast diagnostic layer; the [testing specification](../../../docs/TESTING-SPEC.md) owns the exact gate selection.
