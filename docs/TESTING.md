# Testing

The current test estate covers only the Phase 0 Lean contract vocabulary. It supplies no BPMN or compatibility evidence.

## Red/green workflow

For each semantic capsule:

1. add the smallest executable example that separates the intended rule from a realistic wrong account;
2. run the focused target and confirm failure for the intended missing or incorrect behavior;
3. implement the semantic root rather than a case-specific patch;
4. rerun the focused target;
5. run the complete applicable gate;
6. update [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md) with the exact semantic, proof, and external-evidence boundary.

The first scaffold capsule followed this workflow: the conformance module imported an absent contract, the red run failed on that missing semantic owner, and the green run passed only after the outcome vocabulary was implemented.

## Current gate

```sh
lake build
lake test
git diff --check
git status --short
```

`lake test` elaborates the separating examples through the `checkConformance` executable and must remain dependency-free in Phase 0.

## Evidence lanes

No single external suite proves the project goal. Every release claim must name the lane that produced each result and retain the boundaries between them.

| Lane | Reused input | What passage can establish | What it cannot establish |
|---|---|---|---|
| Normative coverage | BPMN 2.0.2 clauses, figures, XSD/CMOF, and issue dispositions | Every applicable Process Execution requirement has an explicit implementation and evidence disposition | Agreement with CIB or durability on Temporal |
| Interchange | BPMN MIWG reference models, attribute matrix, and cross-tool results | XML, namespaces, references, DI, extension preservation, import, and eventual round-trip behavior | Execution semantics |
| CIB compatibility | Pinned CIB Java assertion/fixture pairs exercised through public services | Agreement with the declared CIB release and observation boundary | OMG conformance |
| Historical cross-engine | Independently reviewed Betsy cases | Portable black-box separating examples and known engine disagreements | Current-engine support or an OMG TCK result |
| Lean semantics | Executable examples, proofs, and bounded exploration | The profile’s independent operational account and proved invariants | External implementation agreement |
| TypeScript differential | Neutral scenarios compared with Lean and CIB | Reducer agreement within the declared profile | Temporal refinement |
| Temporal refinement | Adapter observations, retained-history replay, duplicate delivery, and fault injection | Durable implementation preserves reducer-visible semantics under the tested refinement contract | Unsupported BPMN or CIB behavior |

## CIB corpus adoption

The pinned CIB core corpus contains 1,808 explicit tests and 1,144 BPMN fixtures. A CIB test is reusable only as an assertion/fixture pair: XML alone does not state the expected behavior.

Adopt it through this pipeline:

1. Inventory the Java test method, fixture path, commands, clock/job inputs, and public observations at CIB Seven `v2.2.0`.
2. Prefer the 498 core fixtures without actual vendor-prefixed elements or attributes.
3. Justify the intended behavior independently from BPMN 2.0.2 and record any specification ambiguity or CIB-specific choice.
4. Re-author the smallest neutral scenario that distinguishes the intended behavior from a realistic wrong result.
5. Preserve the original CIB revision, Java test path, fixture path, and license attribution as provenance.
6. Keep vendor extensions, history projections, listener ordering, job semantics, incidents, and persistence behavior in a separately versioned CIB compatibility layer.

The first extraction families are conditional/default/uncontrolled sequence flow; exclusive, inclusive, parallel, and event-based gateways; multi-instance and Sub-Process scope; call Activities; and error, escalation, message, signal, timer, conditional, and compensation Events.

The oracle harness should follow CIB’s own strongest testing pattern: deploy a fixture, invoke public services, control the clock and job executor explicitly, read normalized public runtime/task/history views only when they belong to the profile, verify process completion, and enforce cleanup plus a clean database.

## MIWG adoption

Run the 21 pinned reference models first as import fixtures. Each result must distinguish XML/schema acceptance, reference resolution, semantic normalization, DI retention, unsupported execution features, and deployment validation. An import pass must never imply that the model was admitted for execution.

If export is added, implement MIWG round-trip and cross-tool procedures against a semantic normalized model plus an explicit preservation policy. Byte equality is not the contract, and diagram screenshots are not execution traces.

## External benchmark discipline

Betsy and other engines are discovery sources. Before a case enters the neutral suite, remove obsolete installer assumptions and engine-specific transforms, identify the BPMN clause being tested, and make the expected observation independent of any one product API.

## Future gates

A CIB oracle gate must pin executable artifacts and configuration, control logical time and scheduling, verify isolation and cleanup, and distinguish deployment or command semantics from harness failure.

A future TypeScript gate must follow the global JavaScript/TypeScript long-running-command guidance, use pnpm, and test the reducer without CIB Seven or Temporal dependencies.

A future Temporal gate must include retained-history replay, duplicate delivery, timer, message, cancellation, retry-separation, Continue-As-New, and reducer-refinement checks. Passing Temporal tests must never substitute for reducer-versus-Lean or reducer-versus-CIB differential evidence.
