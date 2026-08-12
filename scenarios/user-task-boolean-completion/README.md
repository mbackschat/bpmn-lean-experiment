# Boolean User Task completion scenario

The [answer-free scenario](scenario.json) reuses the byte-identical [sequential User Task source](../user-task-discovery-completion/process.bpmn). It starts with one string and one explicit null Process binding, completes the exact active occurrence with primitive Boolean `true`, string, and null bindings, and reaches ordinary Process completion.

The target contains no expected result. [Retained CIB evidence](cibseven-evidence.json) is a separate content-bound artifact, while Lean, the TypeScript semantic core, the differential pipeline, and Temporal derive their observations independently. The [Boolean Process-data proposal](../../docs/capsules/BOOLEAN-PROCESS-DATA-PROPOSAL.md) owns the selected value domain and excludes Boolean Process Start, effects, mappings, and expression routing.
