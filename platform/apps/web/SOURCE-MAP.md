# Web application source map

This contributor map points from Product 2 surfaces to their main source owners. Human orientation and commands start in the [README](README.md); behavior and evidence remain in the linked specifications.

| Surface | Main source owners | Contract owner |
|---|---|---|
| Application shell, navigation, and loading boundaries | `app.tsx`, `app-shell.tsx`, `deferred-definition-workspace.tsx`, `deferred-operations-workspace.tsx`, `web-bundle-boundaries.test.ts` | [UI design specification](../../../docs/BPM-PLATFORM-UI-DESIGN-SPEC.md) and [architecture](../../../docs/ARCHITECTURE.md#user-interface) |
| Definitions and exact-version start | `definitions-api.ts`, `definition-workspace.tsx`, `deferred-definition-workspace.tsx`, `exact-definition.ts` | [Platform proposal](../../../docs/BPM-PLATFORM-PROPOSAL.md) |
| Diagram presentation and download | `definition-diagram.tsx`, `bpmn-viewer-contract.ts`, `bpmn-viewer.ts`, `bpmn-js-factory.ts`, `definition-presentation-api.ts` | [Diagram presentation decision](../../../docs/BPMN-DIAGRAM-PRESENTATION-DECISION.md) |
| Human Work | `work-inbox-panel.tsx`, `work-task-detail-workspace.tsx`, `work-completion-operation.ts`, `work-tasks-api.ts` | [Human-work specification](../../../docs/BPM-PLATFORM-HUMAN-WORK-SPEC.md) |
| Process search and committed execution | `deferred-operations-workspace.tsx`, `process-instance-search-panel.tsx`, `process-execution-api.ts`, `process-instance-execution-detail.tsx` | [Process-instance search specification](../../../docs/BPM-PLATFORM-PROCESS-INSTANCE-SEARCH-SPEC.md) and [committed-execution publication specification](../../../docs/capsules/COMMITTED-EXECUTION-PUBLICATION-SPEC.md) |
| Process operator history and canonical audit download | `operator-audit-api.ts`, `process-operator-history.tsx`, `process-instance-execution-detail.tsx` | [Operator history and audit export specification](../../../docs/BPM-PLATFORM-OPERATOR-HISTORY-AUDIT-EXPORT-SPEC.md) |
| Incidents and audit | `incidents-panel.tsx`, `incident-detail-load.tsx`, `incident-action-operation.ts`, `incident-audit-panel.tsx` | [Incident-operations specification](../../../docs/BPM-PLATFORM-INCIDENT-OPERATIONS-SPEC.md) |
| Flow-node metrics | `flow-node-metrics-panel.tsx`, `flow-node-metrics-load.ts`, `flow-node-metric-overlay.ts` | [Flow-node occurrence metrics specification](../../../docs/capsules/FLOW-NODE-OCCURRENCE-METRICS-SPEC.md) |
| Version and capability disclosure | `capabilities-panel.tsx`, `model-corpus/mvp-capabilities.ts`, `vite.config.ts` | [UI design specification](../../../docs/BPM-PLATFORM-UI-DESIGN-SPEC.md) and [executable model corpus research](../../../docs/research/EXECUTABLE-BPMN-MODEL-CORPUS-RESEARCH.md) |

Tests under [`test/`](test/) mirror the source owners above. End-to-end browser evidence is owned by the [UI-quality harness](../../../showcase/platform-ui-quality/README.md).
