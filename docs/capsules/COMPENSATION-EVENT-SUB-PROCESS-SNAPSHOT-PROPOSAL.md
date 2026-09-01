# Compensation Event Sub-Process snapshot proposal

## Status

Lifecycle: draft
Review: pending

## Question and bounded outcome

What is the smallest standards-only hidden-state account that preserves the complete completion-time data context of one Process or embedded Sub-Process occurrence for its declared Compensation Event Sub-Process, distinguishes provisional ownership from a usable completed snapshot, purges every unsuccessful parent occurrence, and refuses bounded growth before changing semantic state?

This proposal selects parent-context representation, complete parent-occurrence identity, reservation, successful-completion promotion, unsuccessful disposal, capacity, and containing-scope lifetime. It selects no throw Compensation Event, handler activation, context restoration, handler completion or failure, dependency order, recursive compensation, Transaction, Cancel Event, source profile, CIB behavior, public command, or Temporal effect.

The reviewed requirement will be `BPMN-COMPENSATION-EVENT-SUB-PROCESS-SNAPSHOT-01`. It remains `unsupported` until a source profile, trigger/handler semantics, differential evidence, durable refinement, and public capability close an end-to-end slice.

## Normative account and selected interpretation

BPMN 2.0.2 Clause 13.5.5 distinguishes a Compensation Event Sub-Process from an associated boundary Compensation Activity. The Event Sub-Process is contained in a Process or Sub-Process, accesses data that is part of that parent, becomes enabled exactly when the parent Activity reaches `Completed`, and then keeps a completion-time snapshot for later restoration. Only successfully completed Activities are compensable; compensation of a failed Activity is an empty operation.

Clause 13.5.5 also requires a separate snapshot for each loop or Multi-Instance parent instance. Clause 10.7.2 separately says that the boundary compensation handler of a Multi-Instance Sub-Process is invoked once per instance. This proposal therefore keys every reservation and promoted snapshot by complete runtime parent occurrence, but does not admit a loop or Multi-Instance Sub-Process and does not select handler multiplicity. The representation can broaden to those parents without changing the identity or context shape selected here.

Clause 13.5.4 says an ordinary Event Sub-Process runs in its live parent's context and can retain access while an interrupting handler completes. That is a different lifetime: a Compensation Event Sub-Process uses a frozen context after successful parent completion. A live `ScopedVariables` alias, a pointer to mutable Process bindings, or a copy taken at parent entry would all implement the wrong rule.

Clause 10.4.1 ties each Data Object's lifecycle to its parent Process or Sub-Process and limits access to that parent, its sibling Flow Elements, and their children. Clause 10.3.5 makes a Sub-Process a contextual scope. The snapshot must consequently represent the complete ordered Process/Sub-Process context path visible to the parent, not selected Task DataInputs, Task DataOutputs, current Activity-local scopes, or the entire runtime variable store.

The current executable data representation has one Process-owned binding collection and occurrence-owned Activity-local collections. It has no Sub-Process-owned data collection. For the first checkpoint, a parent-context frame for the root occurrence contains the exact Process bindings and each admitted direct child-parent frame is empty. This is complete only for the proposal-defined Program, which asserts no Sub-Process-local binding shape; no source compiler may emit the declaration until source admission can prove that fact. The snapshot type already carries an ordered frame per occurrence in the complete root-to-parent context path, so later scope-local data support fills the existing frames rather than changing the meaning of an earlier admitted Program.

The machine-readable anchors are `SubProcess.triggeredByEvent`, `StartEvent.isInterrupting`, `CompensateEventDefinition`, `Activity.isForCompensation`, `DataObject`, `DataObjectReference`, and their containment relationships. The machine-readable model contains no `SubProcess.compensable` property despite the prose reference in Clause 13.5.5; the implicit-compensation and cancellation issues recorded by OMG remain excluded rather than resolved here.

## Required, optional, and excluded scope

**Required representation:** one optional Program declaration with canonical explicit parent/handler pairs and count/byte limits; one optional hidden RuntimeState collection; complete parent and containing occurrence identity; an ordered immutable context-frame snapshot; and distinct provisional and promoted record arms.

**Required lifecycle:** reserve one provisional record atomically with each selected parent occurrence; promote only from the exact live provisional record when ordinary scope completion selects that occurrence; capture its complete context from the deciding pre-state; refuse count or byte overflow before completion mutation; purge provisional state on failure, early completion, interruption, or cancellation; keep a promoted child snapshot only while its exact containing root occurrence remains live; and retain a promoted root snapshot in the terminal semantic state for later parent-host integration.

**Required forward-compatible restriction:** a declaring Program has one parentless root. A selected parent is that root or one directly contained embedded Sub-Process definition. Each handler is a distinct immediate child definition scope of its parent, is not reachable through an ordinary `enterScope` or `enterBoundedScope` operation, and is selected at most once. A selected non-root parent is entered by exactly one current `enterScope` or `enterBoundedScope` operation. Repetition of a selected definition, nested selected parents, called Processes, loop and Multi-Instance Sub-Processes, and profile-enabled incident cancellation are not admitted by this checkpoint.

**Optional:** the Program declaration and RuntimeState collection are optional. Programs without the declaration require field absence and preserve existing bytes. A declaration may select only the root, only one or more distinct direct child parents, or both, subject to canonical order and the restriction above.

**Excluded:** Task-I/O-derived or publication-derived snapshots; Activity-local binding capture; source lowering; registered profiles; repeated, loop, or Multi-Instance Sub-Processes; more than one Compensation Event Sub-Process for one parent; arbitrary nesting; Call Activity ownership transfer; ordinary or interrupting Event Sub-Process execution; Compensation throw targeting; handler enablement, restoration, execution, completion, failure, cancellation, recursion, and ordering; boundary Compensation Activity records; implicit/default compensation; Transaction and Cancel semantics; CIB compatibility; public observation; Product 2; and live Temporal hosting.

## Program contract

The Semantic Process Program gains one optional declaration:

```ts
type CompensationEventSubProcessSnapshotTarget = DeepReadonly<{
  parentScopeId: string;
  handlerScopeId: string;
}>;

type CompensationEventSubProcessSnapshotDeclaration = DeepReadonly<{
  targets: CompensationEventSubProcessSnapshotTarget[];
  limits: {
    maxRecords: number;
    maxCanonicalBytes: number;
  };
}>;

type SemanticProcessProgram = DeepReadonly<{
  // existing required fields remain unchanged
  compensationEventSubProcessSnapshots?: CompensationEventSubProcessSnapshotDeclaration;
}>;
```

Targets are non-empty, canonically ordered by `parentScopeId` then `handlerScopeId`, and unique by both parent and handler. Each identity is a non-empty well-formed wire string. `parentScopeId` resolves to the unique root or one immediate child of it. `handlerScopeId` resolves to one distinct immediate child of the selected parent and has no ordinary scope-entry operation. A non-root parent has exactly one ordinary entry operation, restricted to the current `enterScope` or `enterBoundedScope` families. The root is identified by its null parent and `originElementId === processId`, never by array position.

The declaration is a proposal-defined semantic Program fact. Its validator proves closed shape, definition ancestry, unique entry, and exclusion of handler entry; it does not pretend to prove that arbitrary BPMN XML contains a Compensation Start Event. A later source compiler may emit a target only after parser-graph identity proves `triggeredByEvent=true`, a Compensation Start Event, exact containment, and the selected parent-data restriction.

`maxRecords` is a positive safe integer and counts provisional plus promoted records. `maxCanonicalBytes` is a safe integer from two through 65,536 inclusive and bounds the exact canonical JSON encoding of the complete record collection. A profile may select a smaller maximum to reserve headroom. The existing 65,536-byte complete `RuntimeState` limit remains a separate secondary bound; neither number is inferred from Temporal Event History or the two-mebibyte trace budget.

## Runtime context and lifecycle contract

Runtime state gains one optional collection:

```ts
type CompensationParentContextFrame = DeepReadonly<{
  owner: ScopeOccurrenceId;
  bindings: VariableBinding[];
}>;

type CompensationParentContextSnapshot = DeepReadonly<{
  frames: CompensationParentContextFrame[];
}>;

enum CompensationParentContextRetentionKind {
  Provisional = "provisional",
  Promoted = "promoted",
}

type CompensationParentContextRetention =
  | DeepReadonly<{
      kind: CompensationParentContextRetentionKind.Provisional;
      parent: RuntimeScopeOccurrence;
      handlerScopeId: string;
    }>
  | DeepReadonly<{
      kind: CompensationParentContextRetentionKind.Promoted;
      parent: RuntimeScopeOccurrence;
      handlerScopeId: string;
      snapshot: CompensationParentContextSnapshot;
    }>;

type RuntimeState = DeepReadonly<{
  // existing fields remain unchanged
  compensationParentContextRetentions?: CompensationParentContextRetention[];
}>;
```

`parent.id` is the complete semantic occurrence identity: Process instance, parent definition scope, and activation. `parent.parent` preserves the exact containing occurrence when the completed parent is removed from the live occurrence tree. Definition identity alone, loop index alone, current Workflow or Run ID, host task identity, and collection order cannot substitute for it.

A snapshot's `frames` are the exact live definition-scope ancestry from root occurrence through the selected parent occurrence, ordered outermost to innermost. Every frame carries complete occurrence identity and canonical bindings. The first frame always owns the root occurrence and copies current Process bindings. At this checkpoint every non-root frame is empty because no admitted Program represents Sub-Process-local data. Activity-local scopes are excluded even if an unrelated concurrent Activity remains live elsewhere: they are not Process/Sub-Process context frames and copying them would violate occurrence isolation.

The collection is canonically ordered by complete parent occurrence identity and then handler identity; a record never moves because its arm changes. A declaring running state has exactly one provisional record for every live selected parent occurrence and at most one record for each parent/handler pair. A promoted child record's `parent.parent` names its live root retention owner. A promoted root record has `parent.parent === null` and is valid only in the matching completed Process state. Provisional records never survive after their parent occurrence leaves the live tree.

## Reservation, promotion, purge, and capacity

Parent entry first computes the fresh `RuntimeScopeOccurrence` and matching provisional record from the same pre-state. It computes prospective record count and canonical bytes, then either commits both atomically or refuses without issuing the scope activation, token, deadline, Activity occurrence, or any other entry mutation. Root start follows the same rule. Reservation stores no data snapshot: Clause 13.5.5 selects completion-time data, so an entry-time copy would be stale and continuously mirroring mutable data would create a second authority.

Ordinary `completeScope` selects one exact live quiescent occurrence. Before removing it or producing a parent token, promotion requires exactly one matching provisional record, derives the complete occurrence path from the pre-state, captures each context frame from the same pre-state, replaces the provisional arm with the promoted arm, and checks exact prospective bytes. Count is unchanged at promotion. Byte overflow, missing or duplicate reservation, broken ancestry, incomplete context, or invalid state refuses the complete transition with exact pre-state preservation.

The successful root path keeps its promoted root snapshot when setting Process control to `completed`; it does not erase the collection merely because the root occurrence leaves the live tree. A later trigger/handler capsule must define who can consume that terminal snapshot. Until then no external command reaches it and it remains hidden committed state.

Every non-successful exit removes the matching provisional record in the same regional cancellation transition that removes the parent occurrence. Current direct Error propagation and interrupting bounded-scope Timer routes exercise failure and interruption. The pure lifecycle classifier also has an `earlyCompletion` arm with the same purge result, but no Multi-Instance Sub-Process producer is admitted; integrating such a producer requires the separately reviewed multiplicity account. A mutation that promotes any failed, early, interrupted, or cancelled occurrence must fail.

When a containing root occurrence is removed, regional cancellation removes all provisional descendants and every promoted child record whose preserved `parent.parent` is that root. Normal root close removes promoted child records unless the root itself is selected; when selected, its successful promotion and the still-promoted direct child records remain together for the later recursive-trigger account. This is storage lifetime only and selects no recursion or handler order.

Canonical bytes are the UTF-8 length of the exact canonical JSON record-array encoding, including arm tag, complete parent/containing identities, handler identity, frame owners, bindings, values, keys, punctuation, and JSON escaping. Object keys use Unicode scalar-value order and arrays use the canonical orders above. No cached, stored, caller-supplied, host-reported, or publication-reconstructed size fact is authoritative.

Capacity refusal is a typed private semantic rejection naming record count or canonical bytes, the configured bound, and the observed prospective value. The enclosing entry or completion must stage this result before changing the complete state. The host may separately refuse a semantically valid candidate under the existing complete committed-state capacity class.

## Stable semantic rules and separating witnesses

`CESPS-TARGET-01`: only an explicitly declared parent/Compensation-Event-Sub-Process pair can reserve or promote context; ordinary Event Sub-Processes and handler-free parents do not qualify.

`CESPS-OCCURRENCE-01`: each concurrent or repeated parent instance has a distinct record keyed by complete `ScopeOccurrenceId`; definition identity or array position never aliases two instances.

`CESPS-CONTEXT-01`: promotion captures the exact root-to-parent Process/Sub-Process context from the deciding pre-state, with canonical bindings and no Activity-local, public, platform, or host-derived data.

`CESPS-SUCCESS-01`: only ordinary successful parent completion changes a matching provisional record to promoted; the record remains in the same canonical identity position.

`CESPS-PURGE-01`: failure, early completion, interruption, and cancellation remove the exact provisional record and never leave a promoted snapshot for that parent occurrence.

`CESPS-CAPACITY-01`: count or exact canonical-byte refusal preserves the complete pre-state before any parent-entry or parent-completion mutation.

`CESPS-LIFETIME-01`: a promoted child snapshot survives unrelated work and Continue-As-New while its exact containing root lives, then is removed with that root unless the root's own selected successful snapshot retains the direct-child set for the later recursive-trigger account.

`CESPS-COMPAT-01`: every Program without the declaration and every state under it omit the optional field, preserving existing canonical bytes and behavior.

The context discriminator runs two direct child parents under one root while an unrelated Activity-local scope remains live in the root. The first parent completes with Process binding `amount=A`; the binding then changes to `amount=B` before the second completes. Their snapshots retain `A` and `B` respectively and contain no unrelated Activity scope. Mutations that copy live `ScopedVariables`, capture at entry, retain a reference to Process bindings, or key by definition all fail.

The lifecycle discriminator covers root reservation, child reservation, ordinary promotion, direct Error failure, bounded-scope Timer interruption, and a pure early-completion disposition. Adversarial same-definition occurrences prove that purging one cannot remove or promote the other. The root-close cases distinguish unselected-root disposal from selected-root terminal retention.

Capacity covers empty minimum, exact-fit and one-over reservation, exact-fit and one-over promotion, escaped and non-ASCII values, and whole-state equality after refusal. A mutation that checks after token, activation, deadline, Activity-record, occurrence, context, or control mutation must fail.

## Lean assurance lane

Lane shape: **proved** for the representation, validation, reservation, capture, promotion, purge, capacity, and exact first-checkpoint lifecycle integrations.

Lean defines the same declaration, targets, context frames, record union, canonical order and encoder, state validator, reservation/promotion/purge results, root start, ordinary child/root completion composition, and regional cancellation filtering. Required laws prove declaration and state census closure; complete-identity separation; root-to-parent frame ancestry; snapshot immutability; no Activity-local capture; success-only promotion; exact unsuccessful purge; count/byte refusal with complete-state preservation; old-byte omission at the strict JSON boundary; and start, completion, and cancellation frame properties.

Kernel-decided witnesses cover two differently valued parent occurrences, unrelated concurrent Activity-local data, Error failure, Timer interruption, exact capacity boundaries, and root lifetime. The current model cannot execute a Multi-Instance Sub-Process early-completion route, so Lean proves the pure early disposition only and makes no producer or multiplicity claim.

If the Lean account cannot express the same canonical frame order and byte measure, or if promotion cannot be composed with scope completion without duplicating quiescence, the proposal returns to review. Implementation may not weaken the claim to a finite fixture or caller-supplied snapshot.

## Internal operation-family classification

Root start is external initiation and current child entry/completion routes are internal operations. Reservation adds a write to the complete parent-occurrence retention atom; promotion reads the parent occurrence, context path, Process bindings, and exact retention record and writes that record. Regional purge writes every retention record owned by the removed region. The internal-commutation census must classify the new optional RuntimeState collection and the preparation footprints must prevent a batch from commuting parent entry, completion, data mutation, or cancellation across a shared context or retention owner.

No snapshot record enables an operation, affects quiescence, or enters public publication. A future trigger operation will reopen both the enabled-frontier and footprint accounts.

## CIB Seven relationship boundary

This is a standards-only proposal. No CIB probe, profile rule, or relationship identifier is selected. The existing CIB relationship register contains no Compensation Event Sub-Process relationship that could authorize an implementation choice, and `CIB-AGR-0007` explicitly does not cover child-local data, Event Sub-Processes, or compensation.

## Temporal hosting and refinement preflight

This checkpoint adds no durable ingress, wait, timer, Activity effect, cancellation scope, Signal, Update, Query, public projection, or host scheduler. The production Workflow remains the only committed-state owner and must carry the optional collection byte-for-byte as ordinary private core state. Event History, Workflow Task order, Run identity, Search Attributes, publication rows, and Product 2 state cannot construct, repair, or discard a snapshot.

The refinement relation pairs live host state with the latest byte-identical committed core `RuntimeState`. Workflow Tasks, retries, Worker replacement, replay, Timer bookkeeping, and Continue-As-New stutter on the new hidden collection unless an accepted semantic entry, completion, or cancellation transition changes it. Continue-As-New changes only the host envelope and is never disposal.

Core count/byte overflow is semantic rejection with exact pre-state. A promoted candidate can separately exceed the existing complete committed-state bound, which remains a host capacity refusal and cannot be relabeled as semantic rejection. Continuation validation must bind field presence to the Program declaration and retain both provisional and promoted arms exactly.

The smallest later executable refinement witness starts a selected direct child, forces Continue-As-New while its record is provisional, replaces the Worker, completes it after a Process-data mutation, forces another continuation, and verifies the promoted snapshot remains byte-identical through replay. Separate Error and Timer schedules prove exact purge and no recovery resurrection. A selected-root schedule proves terminal retention without making a closed-process command reachable. Handler triggering and restoration require the next semantic capsule and another host preflight.

## Evidence strategy

| Claim | Lean | TypeScript core | Temporal | Discriminator |
|---|---|---|---|---|
| Target and occurrence identity | Closed declaration/state predicates and uniqueness laws | Strict validators and exact occurrence lookup | Carried only | Two same-definition occurrences |
| Complete context | Root-to-parent frame derivation and capture laws | Canonical frame capture from pre-state | Carried only | A/B completion with unrelated local scope |
| Success-only promotion | Completion composition and preservation | Exact `completeScope` staging | Carried only | Entry-copy and live-alias mutations |
| Unsuccessful purge | Regional-removal laws and pure early disposition | Error, Timer, cancellation filters and early classifier | Carried only | Promote-on-failure/early/interruption |
| Atomic capacity | Exact count/byte refusal theorems | Escaped/non-ASCII fit and overflow with whole-state equality | Complete-state class remains separate | Any pre-refusal state mutation |
| Lifetime | Root/child close frame laws | Selected/unselected root-close cases | Continuation witness later | Continue-As-New disposal mutation |
| Compatibility | Omitted declaration and strict-decoder fixtures | Exact old Program/state bytes | Existing histories unchanged | Emitted empty field under old Program |

The first green semantic checkpoint contains optional Program/RuntimeState contracts, strict shared and Lean readers, declaration/state validation, pure reservation/capture/promotion/purge, exact byte measurement, old-byte omission, root start, exact current `enterScope`/`enterBoundedScope`, ordinary completion, Error and Timer regional removal integration, commutation census/footprints, and the proved Lean laws. It contains no source shape, registered profile, scenario, corpus, CIB runner, handler, Temporal behavior, public capability, or Product 2 claim.

## Runtime-only inventory and layer ownership

| Construct | Derivation and owner | Public projection | Lifecycle |
|---|---|---|---|
| Snapshot target | Immutable Program declaration; later source compiler proves Compensation Event Sub-Process provenance | None | Program lifetime |
| Provisional record | Exact parent occurrence created by root or child entry | None | Entry until success promotion or unsuccessful purge |
| Context frame | Exact live root-to-parent scope occurrence plus bindings captured from pre-state | None | Immutable inside promoted snapshot |
| Promoted snapshot | Exact parent/handler record owned by containing root or terminal selected root | None | Successful completion until containing lifetime or later handler consumption |
| Capacity detail | Pure staged result | Existing semantic rejection only | Never retained |

The BPMN/profile layer owns handler provenance, parent-data admission, and limits. Lean owns the formal account; TypeScript independently realizes it. Temporal carries committed state without deriving semantic facts. Publication and Product 2 own nothing here.

## Versioning consequences

This is a pre-release additive Program/RuntimeState contract. No current source profile emits it, so existing source, checked graphs, Programs, states, commands, observations, scenarios, histories, and public bytes remain unchanged. Strict Program/state readers and exhaustive RuntimeState consumers change only after approval.

The `what-binds` inventory requires [contract schema coverage](../../scripts/contract-schema-coverage.test.ts), [contract definition artifacts](../../scripts/contract-definition-artifacts.test.ts), [internal-commutation census](../../scripts/internal-commutation-census.test.ts), [runtime collection-removal completeness](../../scripts/runtime-collection-removal-completeness.test.ts), [source hygiene](../../scripts/source-hygiene.test.ts), [document reviewability](../../scripts/document-reviewability.test.ts), and the applicable registries. Source owners are [the TypeScript Program contract](../../packages/semantic-core/src/semantic-process-contract.ts), [TypeScript RuntimeState](../../packages/semantic-core/src/semantic-process-state.ts), [TypeScript well-formedness](../../packages/semantic-core/src/runtime-state-well-formedness.ts), [TypeScript scope runtime](../../packages/semantic-core/src/semantic-process-scope-runtime.ts), [TypeScript scope cancellation](../../packages/semantic-core/src/semantic-process-scope-cancellation.ts), [the Program schema](../../contracts/schemas/semantic-process.schema.json), [the Lean Program contract](../../BpmnSemantics/SemanticProcessContract.lean), [Lean RuntimeState](../../BpmnSemantics/SemanticProcess/RuntimeState.lean), [Lean well-formedness](../../BpmnSemantics/SemanticProcess/RuntimeStateWellFormed.lean), [Lean scope completion](../../BpmnSemantics/SemanticProcess/ScopeCompletion.lean), [Lean scope cancellation](../../BpmnSemantics/SemanticProcess/ScopeCancellation.lean), and [the strict Lean Program decoder](../../BpmnSemantics/SemanticProcessJson/Program.lean). New TypeScript contracts and behavior belong in focused snapshot modules registered by the semantic-core package guide and source map; new Lean declaration, transition, JSON, and conformance modules carry the corresponding account.

### Owners this implementation grows

| Existing owner | Current headroom | Structural condition |
|---|---:|---|
| [TypeScript Program contract](../../packages/semantic-core/src/semantic-process-contract.ts) | 210 | add only the optional declaration reference; extract before crossing 800 |
| [TypeScript RuntimeState](../../packages/semantic-core/src/semantic-process-state.ts) | 381 | add only the optional collection reference; new types live elsewhere |
| [TypeScript well-formedness](../../packages/semantic-core/src/runtime-state-well-formedness.ts) | 95 | add one delegated validator hook; extract before crossing 800 |
| [TypeScript scope runtime](../../packages/semantic-core/src/semantic-process-scope-runtime.ts) | 556 | compose reservation/promotion without duplicating scope selection or quiescence |
| [TypeScript scope cancellation](../../packages/semantic-core/src/semantic-process-scope-cancellation.ts) | 616 | delegate region-owned snapshot filtering |
| [Lean Program contract](../../BpmnSemantics/SemanticProcessContract.lean) | 106 | add only the optional declaration reference; extract before crossing 800 |
| [Lean RuntimeState](../../BpmnSemantics/SemanticProcess/RuntimeState.lean) | 217 | add only the collection reference and focused initialization hook |
| [Lean well-formedness](../../BpmnSemantics/SemanticProcess/RuntimeStateWellFormed.lean) | 101 | add one delegated predicate; extract before crossing 800 |
| [Lean scope completion](../../BpmnSemantics/SemanticProcess/ScopeCompletion.lean) | 694 | compose promotion and update frame laws |
| [Lean scope cancellation](../../BpmnSemantics/SemanticProcess/ScopeCancellation.lean) | 646 | delegate record filtering and prove regional ownership |
| [Strict Lean Program decoder](../../BpmnSemantics/SemanticProcessJson/Program.lean) | 116 | delegate the optional field to a focused decoder; extract before crossing 800 |

No size exception is requested. Expected focused owners are `packages/semantic-core/src/compensation-event-sub-process-snapshot-contract.ts`, `packages/semantic-core/src/compensation-event-sub-process-snapshot.ts`, `packages/semantic-core/src/compensation-event-sub-process-snapshot-state-validation.ts`, their tests, `BpmnSemantics/SemanticProcess/CompensationEventSubProcessSnapshotDeclaration.lean`, `BpmnSemantics/SemanticProcess/CompensationEventSubProcessSnapshot.lean`, a focused JSON decoder, and one conformance target. Root integration owns shared contracts, state, schema, lifecycle composition, registries, maps, PLAN, and review receipts.

## Epistemic closure and reopen conditions

Selected here: exact occurrence identity, explicit handler provenance, completion-time rather than entry-time capture, root-to-parent context frames, provisional reservation, success-only promotion, unsuccessful purge, containing-root lifetime, canonical byte capacity, old-byte omission, and Temporal carry-only refinement.

Still open: executable source provenance; Sub-Process-local data representation; loop and Multi-Instance Sub-Process multiplicity; nested and called ownership; trigger target selection; restoration semantics; handler identity, scheduling, order, failure, cancellation, and consumption; implicit/default compensation; Transactions; CIB agreement; live host refinement; public capability; and closure evidence.

Reopen before admitting a second handler for one parent, a selected parent below one direct child, repeated/loop/Multi-Instance parent activation, called Process transfer, any non-empty Sub-Process data frame, ordinary Event Sub-Process state reuse, handler triggering/restoration, or a capacity encoder that differs between Lean and TypeScript.

## Stage boundary

The mandatory first green semantic checkpoint is the complete representation and current-route lifecycle slice named in the evidence strategy. It must be independently reviewed before source, trigger, handler, restoration, or Temporal work begins. The next risk band after that checkpoint is deterministic compensation trigger/order/cancellation, not capability packaging.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `not-recorded` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
