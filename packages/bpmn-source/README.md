# BPMN source ingestion

`@bpmn-lean/bpmn-source` turns untrusted BPMN XML into the project-owned checked graph and immutable Semantic Process program consumed by the [TypeScript semantic core](../semantic-core/README.md). It preserves exact source identity, validates bounded input, normalizes diagnostics, and keeps raw parser objects private.

## What you can do

Compile exact BPMN bytes under an explicit semantic profile and handle either an admitted program or a deterministic list of located admission diagnostics.

```ts
const compilation = await compileBpmnToSemanticProcess({
  bytes,
  sourceId: scenario.bpmn.id,
  expectedSha256: scenario.bpmn.sha256,
  semanticProfile: scenario.profile,
  sourceOverlay: null,
  limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 },
});
```

The package also exposes an optional pinned MIWG observation lane for source-interchange research. External MIWG files remain outside the repository.

[Concrete Lean fixture binding](test/lean-fixture-bindings.integration-test.ts) compiles the retained sequential, parallel, and cyclic sources and compares their complete checked graphs and Programs with the authored Lean fixtures. It also compares the six corresponding sequential and parallel Scenario documents, including stimuli, observations, and provenance. `test:lean-fixture-bindings:built` runs after restored Lean and TypeScript outputs in the complete verification gate; synthetic countermodels and arbitrary-schedule theorems have no corresponding Scenario binding.

The registered [portable-handoff profile](../../profiles/bpmn-2.0.2-portable-business-values-handoff-draft/README.md) reuses that Property and User Task projection under the BPMN default expression language and additionally requires exactly three declared Properties. The registered [structured-composition profile](../../profiles/bpmn-2.0.2-structured-process-composition-draft/README.md) reuses the structural compiler and [scalar interface projector](src/activity-data-input-output-projection.ts) for acyclic serial and paired Exclusive composition. The [capsule](../../docs/capsules/STRUCTURED-PROCESS-COMPOSITION-PROPOSAL.md) owns exact start requirements, task-output admission, hosting evidence and remaining Closure obligations.

The private [sequential MI Sub-Process compiler](src/multi-instance-scope-source-compiler.ts) composes exact declaration reading, scoped graph ownership, body/parent control-burst checks and data admission. It reuses the existing named Service bindings and their explicit `asyncBefore="true"` source restriction, without claiming async-before equivalence. The private profile routes through normal exact-byte compilation dispatch and source-overlay admission; public execution registration remains closed, and the remaining boundary belongs to the [capsule](../../docs/capsules/SEQUENTIAL-MULTI-INSTANCE-SUBPROCESS-PROPOSAL.md).

The [required scalar interface reader](src/scalar-io-specification.ts) retains exact owner, port and set identities for the [Call data work](../../docs/capsules/CALL-ACTIVITY-DATA-BOUNDARIES-PROPOSAL.md). The existing composed-task projector shares that reader while retaining its own profile restrictions. The [Call data projector](src/call-data-source.ts) binds caller associations to the Call ports and checks correspondence with the separately owned called interface. The registered Call data reader admits the complete supplier model with exact serial topology and typed Process-interface Task endpoints, and binds both lowered Call halves. Independent Lean admission, scalar execution and Lean/TypeScript/Temporal comparison pass; public registration is implemented. Independent closure remains rejected after a post-completion publication failure; public qualification remains open. The existing exact-source cardinality guard rejects parser-overwritten extra interfaces.

The private [interrupting Message Event Sub-Process reader](src/interrupting-message-event-subprocess-source.ts) admits one parallel application-review Process and its dormant withdrawal handler. Its [lowerer](src/interrupting-message-event-subprocess-lowering.ts) retains the declaration-owned entry and token-free handler completion. The [approved proposal](../../docs/capsules/INTERRUPTING-MESSAGE-EVENT-SUBPROCESS-PROPOSAL.md) owns the bounded account; source admission alone establishes no execution or hosting result.

## Quick start

Run the focused compiler gate:

```sh
./scripts/pnpm.sh run test:bpmn-source
```

## Learn more

- [Business mapping reader](src/business-task-mapping-source.ts) owns the shared literal/reference mapping syntax and exact Service-profile spelling restrictions.
- [MI Sub-Process declarations](src/multi-instance-subprocess-source.ts) share collection/item, completion-variable and body-input parsing across sequential and parallel modes. Private parallel source compilation checks the complete graph and data policy; public byte compilation and execution remain unavailable; the [parallel capsule](../../docs/capsules/PARALLEL-MULTI-INSTANCE-SUBPROCESS-PROPOSAL.md#private-source-compilation) owns that boundary.
- [Parallel Service mapping inputs](test/parallel-scope-output-mapping-fixture.ts) compile single-target, distinct-source and shared-source output mappings for the private Lean/core command comparison.
- [Sequential Service mapping inputs](test/sequential-scope-output-mapping-fixture.ts) compile the same mapping shapes for repeated-body turnover and exact-result refusal checks.

- [Business-task source reader](src/serial-business-task-source.ts) shares exact-overlay, named-handler and mapping projection across [serial composition](../../docs/capsules/SERIAL-BUSINESS-TASK-COMPOSITION-PROPOSAL.md), [mixed-task branching/rework](../../docs/capsules/MIXED-TASK-CONTROL-FLOW-PROPOSAL.md) and [attached business Error recovery](../../docs/capsules/MIXED-TASK-BUSINESS-ERROR-PROPOSAL.md). Each private profile retains its graph admission and qualification boundary.
- [Nested scope-data source reader](src/nested-scope-data-source.ts) reads serial embedded Sub-Process scopes and their `camunda:inputOutput` locals for the [nested scope data specification](../../docs/capsules/NESTED-EMBEDDED-SCOPE-DATA-SPEC.md), and the root-path Call's `camunda:in`/`camunda:out` mappings for the [Call variable mapping account](../../docs/capsules/CALL-VARIABLE-MAPPING-SPEC.md); independent checked admission decides the result.

- [BPMN XML ingestion decision](../../docs/BPMN-XML-INGESTION-DECISION.md) owns the trust, parser, and source-preservation boundary.
- [Semantic Process IL specification](../../docs/SEMANTIC-PROCESS-IL-SPEC.md) owns the checked graph and lowering contracts.
- [Profile-parameterized admission specification](../../docs/PROFILE-PARAMETERIZED-ADMISSION-SPEC.md) owns profile capability and admission behavior.
- [Parallel User Task metadata composition specification](../../docs/capsules/PARALLEL-USER-TASK-METADATA-COMPOSITION-SPEC.md) owns the exact closure-reviewed two-task source restriction.
- [Structured Human Work specification](../../docs/BPM-PLATFORM-STRUCTURED-HUMAN-WORK-SPEC.md) owns the M6 candidate-group projection and execution-neutral Rendering preservation boundary.
- [Sequential Multi-Instance specification](../../docs/capsules/SEQUENTIAL-MULTI-INSTANCE-SPEC.md) owns the exact registered source, checked graph, lowering, and runtime contract.
- [Interrupting Activity boundary Message specification](../../docs/capsules/ACTIVITY-BOUNDARY-MESSAGE-SPEC.md) owns the omission-only Message handler source shape and its atomic Activity lowering.
- [Message payload catch mediation specification](../../docs/capsules/MESSAGE-PAYLOAD-CATCH-MEDIATION-SPEC.md) owns the exact Event DataOutput source chain, checked node, and lowered IL boundary.
- [Message key correlation specification](../../docs/capsules/MESSAGE-KEY-CORRELATION-SPEC.md) owns the exact definitional Collaboration, context-backed key source graph, correlated checked node, and lowered IL boundary.
- [Activity data-input/output mediation specification](../../docs/capsules/ACTIVITY-DATA-INPUT-OUTPUT-MEDIATION-SPEC.md) owns the exact claim-assessment source, parser-identity association checks, distinct composed checked node, and one-operation lowering boundary.
- [Compensation source and lowering proposal](../../docs/capsules/COMPENSATION-SOURCE-LOWERING-PROPOSAL.md) owns the exact checkpoint-only travel-booking source, checked declaration, deterministic existing-Program lowering, and host-refusal boundary. The [trigger and handler proposal](../../docs/capsules/COMPENSATION-TRIGGER-HANDLER-PROPOSAL.md), [Event Sub-Process snapshot proposal](../../docs/capsules/COMPENSATION-EVENT-SUB-PROCESS-SNAPSHOT-PROPOSAL.md), and [boundary-handler retention proposal](../../docs/capsules/COMPENSATION-BOUNDARY-HANDLER-RETENTION-PROPOSAL.md) retain runtime meaning; product registration and live hosting remain separate reviewed work.
- [`implementation-status-owner:ENGINE-CONTRACTS-SOURCE`](../../docs/ENGINE-CONTRACTS-AND-SOURCE-IMPLEMENTATION-MAP.md) records the exact accepted and rejected surface.
- [Executable model corpus](../../model-corpus/README.md) exercises this production compiler against retained and external whole models.

Run the optional MIWG lane with `./scripts/pnpm.sh run test:miwg` after provisioning the registered research checkout.
