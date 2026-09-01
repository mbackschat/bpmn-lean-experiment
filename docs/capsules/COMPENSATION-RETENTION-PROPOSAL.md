# Compensation retention proposal

## Status

Lifecycle: draft
Review: pending

## Question and bounded outcome

What is the smallest standards-only runtime representation that preserves every completed Activity occurrence a later global Compensation Event could target, including one immutable parent-Activity data snapshot per Multi-Instance iteration, until the owning scope closes, while refusing bounded growth before any completion commits?

This proposal selects a hidden root-Process completion register and its lifetime. It does not select a compensation handler, trigger, execution order, Transaction, Cancel Event, error-triggered default, CIB behavior, public command, or Temporal effect. The representation must support both a later `activityRef`-targeted form and the later global form without reinterpretation, but neither form is executable in this checkpoint.

The new reviewed requirement is `BPMN-COMPENSATION-RETENTION-01`. Its disposition remains `unsupported` until the approved semantic checkpoint is implemented; `BPMN-MECH-COMPENSATION-01` remains unsupported after that checkpoint because handler execution, ordering, cancellation, and Transactions stay absent.

## Normative account and selected interpretation

BPMN 2.0.2 Clause 13.5.5 permits compensation only for completed Activities. When an Activity completes, the operational account requires a snapshot of the data associated with the parent Activity to be retained for later use. Loop and Multi-Instance Activities require one separate snapshot per instance. Clauses 10.7.2 and 13.5.5 make a throwing Compensation Event with no `activityRef` compensate all completed Activities in the current Sub-Process or, at the global level, the entire Process.

Default compensation follows the dependency order of the original Activities, described as reverse execution order where that order is total. Sequential Multi-Instance instances therefore compensate in reverse completion order, while parallel instances may compensate concurrently. This proposal records a total completion ordinal only as immutable occurrence chronology and canonical storage order. It does not incorrectly define that ordinal as the future dependency relation.

The machine-readable anchors are optional `CompensateEventDefinition-activityRef`, `Activity-isForCompensation`, `BoundaryEvent`, `EventSubProcess`, `Transaction`, and their `t*` XSD declarations. `CompensateEventDefinition.activityRef` has lower bound zero, so retention cannot depend on an Activity-local handler declaration. The [retention experiment](../experiments/COMPENSATION-RETENTION-EXPERIMENT.md#retention-is-scope-decided-not-declaration-decided) supplies the separating global-form witness.

The prose `SubProcess.compensable` attribute has no CMOF or XSD property; official issue [BPMN21-167](https://issues.omg.org/issues/BPMN21-167) records the inconsistency. Issues [BPMN21-403](https://issues.omg.org/issues/BPMN21-403) and [BPMN21-404](https://issues.omg.org/issues/BPMN21-404) leave implicit compensation and cancellation open, while closed issue [BPMN2-188](https://issues.omg.org/issues/BPMN2-188) preserves the completed-only premise. This proposal depends on none of the unsettled behavior.

## Required, optional, and excluded scope

**Required representation:** one optional Program declaration selecting exactly one parentless definition scope whose origin is the Program's root Process; one runtime register owned by the live occurrence of that scope; one immutable completion record per retained ordinary Activity or Multi-Instance iteration; positive contiguous completion ordinals; exact copied input and output bindings; canonical order; exact scope-close disposal; and count plus canonical-byte refusal before mutation.

**Required forward-compatible boundary:** the first declaration admits only a flat root Process. A Program carrying it is invalid if it has another parentless or nested definition scope, a called Process, a `terminateScope` operation, or a profile that enables root cancellation. This prevents a child close or excluded terminal path from disposing records the global form can still reach. Later scope work may add explicit compensation ownership without reinterpreting an admitted Program.

**Optional:** the entire declaration and runtime collection are optional at the shared wire boundary. Programs with no declaration require the fields to be absent. Programs with the declaration require the runtime collection to be present, including an empty array before start and after terminal scope closure.

**Excluded:** BPMN source admission; a registered semantic profile; handler attachment; Compensation Boundary Events; Compensation Event Sub-Processes; `isForCompensation`; throw Events; `activityRef`; `waitForCompletion`; snapshot restoration; handler failure; recursive compensation; dependency-graph execution; Transaction and Cancel semantics; nested or called scopes; standard loops; concurrent repetition outside the implemented Multi-Instance families; public projection; CIB compatibility; Product 2; and every Temporal hosting claim beyond the preflight below.

## Program and runtime contract

The Semantic Process Program gains one optional declaration:

```ts
type CompensationRetentionDeclaration = DeepReadonly<{
  definitionScopeId: string;
  limits: {
    maxRecords: number;
    maxCanonicalBytes: number;
  };
}>;

type SemanticProcessProgram = DeepReadonly<{
  // existing required fields remain unchanged
  compensationRetention?: CompensationRetentionDeclaration;
}>;
```

`definitionScopeId` must resolve to the unique parentless `DefinitionScope`, and that scope's `originElementId` must equal `processId`. Both limits are positive safe integers. `maxCanonicalBytes` cannot exceed 65,536, but a later profile must select a lower value when its other maximum state components require headroom. The existing exact 65,536-byte committed-`RuntimeState` host bound remains an independent secondary check over the complete successor state.

Runtime state gains one optional canonically ordered collection:

```ts
type CompletedActivityOccurrenceId = DeepReadonly<{
  activity: ActivityOccurrenceId;
  instance:
    | { kind: "single" }
    | { kind: "multiInstance"; index: number };
}>;

type ParentActivityDataSnapshot = DeepReadonly<{
  inputs: VariableBinding[];
  outputs: VariableBinding[];
}>;

type CompensationRetentionRecord = DeepReadonly<{
  id: CompletedActivityOccurrenceId;
  completionOrdinal: number;
  snapshot: ParentActivityDataSnapshot;
}>;

type CompensationScopeRetention = DeepReadonly<{
  owner: ScopeOccurrenceId;
  nextCompletionOrdinal: number;
  records: CompensationRetentionRecord[];
}>;

type RuntimeState = DeepReadonly<{
  // existing fields remain unchanged
  compensationRetentions?: CompensationScopeRetention[];
}>;
```

The `single` and `multiInstance` arms prevent an ordinary completion from aliasing iteration zero. The outer identity distinguishes repeated activations. A Multi-Instance `index` is the zero-based model collection index, not a task activation, completion position, Workflow identity, or host attempt.

`nextCompletionOrdinal` starts at one and advances once per accepted record. It is independent of `records.length` so later record removal cannot reuse chronology. At this checkpoint, records are ascending and their ordinals are exactly `1 .. nextCompletionOrdinal - 1`.

## Parent-Activity data snapshot

The snapshot is the complete Activity-local data context at completion, partitioned into declared input and output identities rather than flattened into one namespace. Each list is sorted by binding name, names are unique within the list, values are deep-copied, and no later Process or command mutation can change them. The separation preserves an equal DataInput/DataOutput name without collision and gives a future Compensation Event Sub-Process the parent Activity's completion-time values.

An ordinary Activity with no admitted data has two empty lists. A direct-input Activity copies its occurrence-local bindings into `inputs`. A direct-output Activity records the validated submitted DataOutput in `outputs` before its association writes Process scope and before the local scope is removed. An Activity carrying both directions later combines the two without changing this representation.

For sequential and parallel Multi-Instance, each completed inner instance receives one distinct `multiInstance(index)` record. Its `inputs` contains the direct loop DataInput binding for that index and its `outputs` contains the accepted loop DataOutput binding. Duplicated collection values remain duplicated records because identity is occurrence plus index, never value equality.

The Process variable map is not copied wholesale. It is container context, not data associated with one parent Activity, and copying it into every record would install unrelated mutable Process data as compensation input while multiplying the bounded state cost. A later nested Sub-Process proposal must decide its parent-Activity snapshot from that Activity's exact local input/output context before admitting a Compensation Event Sub-Process.

## Retention transition, capacity, and refusal

The shared pure insertion operation takes the Program declaration, current register, candidate identity, and exact snapshot. It first rejects a duplicate complete identity. It then stages the record with `completionOrdinal = nextCompletionOrdinal`, canonicalizes both binding lists, appends it to the ordinal-ordered register, and computes the prospective count and prospective canonical bytes.

The byte measure is the UTF-8 length of the exact canonical JSON encoding of the prospective `records` array, including identity, discriminator, optional index, ordinal, bindings, values, punctuation, and escaping. Object keys use Unicode scalar-value order; arrays retain declared order. No stored or caller-supplied byte fact is authoritative. Lean and TypeScript share non-ASCII, escaped-string, exact-fit, and one-byte-over fixtures.

If the prospective record count exceeds `maxRecords` or the exact byte measure exceeds `maxCanonicalBytes`, insertion returns a typed private refusal naming `records` or `canonicalBytes`, the configured bound, and observed value. The enclosing completion transition maps that result to semantic rejection with exact pre-state preservation. It must perform no token, wait, Activity, variable, output-association, activation, occurrence-publication, or flow-node-publication mutation before insertion succeeds.

The existing 65,536-byte complete-state check runs after evaluation but before successor installation. Other state can make it refuse a candidate that passed retention limits. That host outcome remains distinct and does not relax the profile bounds.

## Lifetime, canonical order, and scope close

The first successful start of a declaring Program creates exactly one register owned by the fresh root `ScopeOccurrenceId`. No register exists for a different definition or scope occurrence. Retained records do not keep a scope non-quiescent, enable a transition, or appear in public stable-state observation.

Every normal root-scope completion atomically removes the register owned by that exact scope occurrence while preserving every other runtime collection. Under the one-root restriction, terminal state therefore carries `compensationRetentions: []`. Cancellation and Terminate disposal are excluded from this checkpoint because selecting their compensation consequence belongs to the next cancellation risk band.

Register order is by owner identity, although the first checkpoint permits one register. Record order is strictly ascending completion ordinal. Snapshot bindings use the existing code-point canonical name order. Canonical storage never defines future compensation precedence; later dependency analysis may select reverse, concurrent, or targeted subsets without changing retained record identity or chronology.

## Stable semantic rules and separating witnesses

`CRET-SCOPE-01`: a Program declares retention for exactly its unique flat root Process scope; no Activity-local handler decides membership.

`CRET-IDENTITY-01`: every accepted ordinary or Multi-Instance completion record has one unique `CompletedActivityOccurrenceId`; equal data never merges occurrences.

`CRET-SNAPSHOT-01`: a record owns an immutable deep copy of the exact parent Activity inputs and outputs available at that completion, with one record per Multi-Instance index.

`CRET-ORDER-01`: accepted records receive positive contiguous, never-reused completion ordinals and are stored in ascending ordinal order; the ordinal is chronology, not the future dependency order.

`CRET-CAPACITY-01`: count or canonical-byte overflow rejects before any part of the Activity completion mutates, preserving the exact pre-state.

`CRET-LIFETIME-01`: records survive unrelated completions and Continue-As-New while their owning root scope remains open, and exact root scope close removes all and only that register.

`CRET-COMPAT-01`: a Program without the declaration and every state produced under it omit the new optional fields, preserving their existing canonical bytes.

The smallest positive witness starts one flat root scope, records ordinary Activity A with one input, records sequential Multi-Instance Activity B at indices zero and one with equal values but distinct outputs, and records parallel Multi-Instance Activity C at indices zero and one in the opposite completion order. It proves five identities, ordinals `1..5`, per-index snapshots, and storage order independent of data equality or Multi-Instance collection order.

The global-form negative witness gives Activity A no attached compensation handler. A handler-decided implementation drops A and fails `CRET-SCOPE-01`. The multiplicity mutation merges B's equal values and fails `CRET-IDENTITY-01`. The ordering mutation sorts C by index and fails `CRET-ORDER-01` when index one completes first.

The capacity witnesses use an exact-fit candidate followed by one candidate that crosses only `maxRecords`, and another exact-fit candidate followed by one escaped or non-ASCII value that crosses only `maxCanonicalBytes`. Each compares the entire returned state with the pre-state. The disposal witness holds a record while unrelated root work remains live, then proves the record disappears only with exact root scope closure.

The nearest checked non-law is that removing the Activity-local variable scope preserves all runtime state. Under a declaring Program, successful completion removes that live scope and adds an immutable retention record in the same atomic transition. The narrower no-compensation family laws remain valid because their Programs omit the declaration.

## Lean assurance lane

Lane shape: **proved** for the representation and lifecycle propositions the first checkpoint implements.

The Lean account defines the same declaration, identity discriminator, snapshot, register, exact canonical-byte measure, insertion result, start initialization, and root-scope disposal. The executable evaluator has a declarative relation and a constructor-selection soundness bridge.

The required proved laws are: successful insertion adds exactly one unique identity with the prior `nextCompletionOrdinal`, preserves every prior record and snapshot, increments the ordinal once, and retains canonical order; duplicate, count, and byte refusal return exact pre-state; start creates exactly the declared root register; and scope close removes exactly the matching register while preserving unrelated state. State-level single, sequential, and parallel fixtures are executable witnesses, not substitutes for those laws.

Completeness of later handler selection, dependency order, cancellation, liveness, TypeScript equivalence, and Temporal refinement are not implied. If an exact Lean JSON-byte measure cannot match the declared canonical encoder for the admitted `VariableValue` domain, the proposal must return to review; the implementation may not weaken the byte rule to an escape-blind approximation or caller-supplied size.

## Internal operation-family classification

The existing independent frontier contains only eligible internal arming operations. Retention insertion occurs on external completion commands, and root register creation or disposal occurs at start or scope close, so no current unordered pair reads or writes this collection. The exhaustive RuntimeState census must nevertheless classify `compensationRetentions` explicitly as absent from current eligible footprints.

A later internal operation that can complete an Activity, or any future batch containing two completion producers in one scope, must reopen the footprint account. The shared register and ordinal are one write conflict even when Activity identities differ; the implementation must not infer commutation from distinct waits alone.

## CIB Seven relationship boundary

This is a standards-only hidden representation and selects no CIB Seven behavior, probe, profile rule, or CIB–BPMN relationship identifier. No source shape is admitted and no target runner can observe the register. Pinned CIB may become a later ordering or lifecycle oracle only after the applicable standard account and observation boundary are reviewed.

## Temporal hosting and refinement preflight

The first checkpoint adds no durable ingress, wait, timer, Activity effect, cancellation action, Query, Signal, Update, public projection, or host scheduler. The production Workflow's single main loop remains the only owner of committed `RuntimeState`; accepted completion candidates carry the new field through the existing candidate installation path without an `await` between semantic evaluation and commit.

Ordering is the semantic core's explicit completion ordinal. Temporal Workflow Task order, Activity attempt order, Event History position, Run ID, and Worker timing never create or repair it. Duplicate completion commands are already rejected by exact current semantic occurrence identity; retention adds no host deduplication rule.

The continuation codec must validate presence against the Program declaration and preserve the complete register byte-for-byte across Continue-As-New. Continue-As-New cannot dispose or compact records. The existing 65,536-byte committed-state candidate check and 448 KiB aggregate continuation check remain after the new profile limits; Worker replacement and replay reconstruct the field solely from committed Workflow state.

The smallest later executable refinement witness keeps one declaring Process open after at least one ordinary and two Multi-Instance completions, forces Continue-As-New and Worker replacement, observes the unchanged private register through a test-only exact state boundary, completes the root scope, and replays every Run. Omission, changed identity, changed snapshot, changed ordinal, and premature disposal are required mutations. No live host claim is made until a profile and completion producer exist.

## Evidence strategy

| Claim | Lean | TypeScript semantic core | Temporal | Negative or mutation evidence |
|---|---|---|---|---|
| Declaration and old-byte compatibility | Strict Program decoding and omission fixture | JSON Schema, admission, and exact old artifact bytes | Continuation presence validation later | Added default or emitted empty field changes old bytes |
| Unique ordinary and per-index identities | Relation, evaluator, uniqueness law | Pure insertion and state validation | Carried only | Equal-value index merge and single/index-zero alias |
| Exact parent-Activity snapshot | Deep-copy relation and fixtures | Independent clone, input/output partition, and producer census later | Carried only | Post-completion source mutation or dropped output |
| Contiguous chronology | Insertion and preservation laws | Pure insertion and adversarial completion order | Carried only | Sort by element/index or reuse `records.length` |
| Atomic capacity refusal | Count/byte refusal laws | Exact-fit/overflow and whole-state equality | Complete-state bound remains separate | Mutate token, output, publication, or ordinal before refusal |
| Root lifetime and disposal | Start/disposal relation and exact-frame laws | Runtime validation plus start/close tests | Continuation witness later | Premature quiescence disposal or retained terminal register |
| No-compensation compatibility | Omitted Lean Program declaration | Existing Program/state fixtures byte-identical | Existing histories replay unchanged | Optional field emitted under an old Program |

The checkpoint gate covers strict shared and Lean Program wires, state validation, pure TypeScript tests, narrow Lean builds, schema artifacts, commutation census, collection-removal completeness, and the complete semantic-core package gate. It claims no scenario, CIB, differential, Temporal, corpus, Product 2, or public capability evidence.

## Runtime-only inventory and layer ownership

| Construct | Derivation and owner | Public projection | Lifecycle invariant |
|---|---|---|---|
| Retention declaration | Program/profile contract; source compiler emits it only in a later reviewed profile | None | Absent for every current profile; exactly one flat root scope when present |
| Completed Activity identity | Semantic Activity occurrence plus explicit single/per-index discriminator | None | Unique inside the owning register and immutable after insertion |
| Parent-Activity data snapshot | Deep copy of exact completion-time input/output bindings | None | Immutable until the owning scope closes |
| Completion ordinal | Semantic core register counter | None | Positive, contiguous, never reused; chronology only |
| Compensation scope register | Runtime state owned by one live root `ScopeOccurrenceId` | None | Created at start, ignored by quiescence, carried through continuation, removed at exact root close |
| Capacity refusal detail | Pure insertion result | Existing semantic rejection only | Produced before successor mutation and never retained |

The BPMN/profile layer owns whether the enclosing scope requires retention and its explicit limits. Lean is the formal authority for the selected hidden semantic state and lifecycle. The TypeScript semantic core independently realizes it. Temporal carries and bounds committed state without deriving any compensation fact. Publication and Product 2 own nothing in this account.

## Versioning consequences

This is a pre-release additive Program and RuntimeState representation. Existing source, checked graphs, Programs, states, commands, interactions, observations, and scenario bytes remain unchanged because no current profile emits the declaration and optional state is forbidden under those Programs. The first checkpoint changes strict Program readers and runtime validators but no BPMN XML reader or lowerer.

The `what-binds` inventory requires at least [contract schema coverage](../../scripts/contract-schema-coverage.test.ts), [contract definition artifacts](../../scripts/contract-definition-artifacts.test.ts), [internal commutation census](../../scripts/internal-commutation-census.test.ts), [runtime collection-removal completeness](../../scripts/runtime-collection-removal-completeness.test.ts), [source hygiene](../../scripts/source-hygiene.test.ts), and [document reviewability](../../scripts/document-reviewability.test.ts). Focused TypeScript and Lean tests must lock the exact contracts; the complete affected package gate follows integration.

The source owners the checkpoint grows are [the TypeScript Program contract](../../packages/semantic-core/src/semantic-process-contract.ts), [TypeScript RuntimeState](../../packages/semantic-core/src/semantic-process-state.ts), [TypeScript runtime-state well-formedness](../../packages/semantic-core/src/runtime-state-well-formedness.ts), [TypeScript scope runtime](../../packages/semantic-core/src/semantic-process-scope-runtime.ts), [TypeScript command admission](../../packages/semantic-core/src/semantic-command-admission.ts), [TypeScript triggered start](../../packages/semantic-core/src/semantic-process-triggered-start.ts), [the shared Program schema](../../contracts/schemas/semantic-process.schema.json), [the Lean Program contract](../../BpmnSemantics/SemanticProcessContract.lean), [Lean RuntimeState](../../BpmnSemantics/SemanticProcess/RuntimeState.lean), [Lean runtime-state well-formedness](../../BpmnSemantics/SemanticProcess/RuntimeStateWellFormed.lean), [Lean scope completion](../../BpmnSemantics/SemanticProcess/ScopeCompletion.lean), and [the strict Lean Program decoder](../../BpmnSemantics/SemanticProcessJson/Program.lean).

### Owners this implementation grows

The 800-nonblank-line soft target is the extraction threshold and 1,200 lines is the hard ceiling. These figures are mechanically rechecked. New retention contracts, algorithms, validation predicates, and proofs belong in new focused modules registered by [the semantic-core source map](../../packages/semantic-core/SOURCE-MAP.md), [the semantic-core package guide](../../packages/semantic-core/README.md), and the Lean module graph.

| Owner | Current headroom | Structural condition |
|---|---:|---|
| [TypeScript Program contract](../../packages/semantic-core/src/semantic-process-contract.ts) | 212 | add only the optional declaration reference; extract before the edit would cross 800 |
| [TypeScript RuntimeState](../../packages/semantic-core/src/semantic-process-state.ts) | 384 | add only the optional collection reference; retention types belong in a new contract owner |
| [TypeScript runtime-state well-formedness](../../packages/semantic-core/src/runtime-state-well-formedness.ts) | 116 | add only one delegated validator hook; extract before the edit would cross 800 |
| [TypeScript scope runtime](../../packages/semantic-core/src/semantic-process-scope-runtime.ts) | 564 | route exact root disposal only; retention filtering belongs in the new owner |
| [TypeScript command admission](../../packages/semantic-core/src/semantic-command-admission.ts) | 394 | no producer integration at the first checkpoint; later completion arms must delegate before any existing mutation |
| [TypeScript triggered start](../../packages/semantic-core/src/semantic-process-triggered-start.ts) | 632 | initialize the one root register only |
| [Lean Program contract](../../BpmnSemantics/SemanticProcessContract.lean) | 120 | add only the optional declaration and referenced type; extract before the edit would cross 800 |
| [Lean RuntimeState](../../BpmnSemantics/SemanticProcess/RuntimeState.lean) | 234 | add only the collection and initialization reference; retention structures belong in a new module |
| [Lean runtime-state well-formedness](../../BpmnSemantics/SemanticProcess/RuntimeStateWellFormed.lean) | 104 | add only one delegated predicate; extract before the edit would cross 800 |
| [Lean scope completion](../../BpmnSemantics/SemanticProcess/ScopeCompletion.lean) | 697 | add exact register disposal and update its preservation frame |
| [Strict Lean Program decoder](../../BpmnSemantics/SemanticProcessJson/Program.lean) | 125 | decode only the optional declaration through a new focused decoder; extract before the edit would cross 800 |

No size exception is requested. New owners are `packages/semantic-core/src/compensation-retention-contract.ts`, `packages/semantic-core/src/compensation-retention.ts`, `packages/semantic-core/src/compensation-retention-state-validation.ts`, `packages/semantic-core/test/compensation-retention.test.ts`, `BpmnSemantics/SemanticProcess/CompensationRetention.lean`, and `BpmnSemantics/CompensationRetentionConformance.lean`. If implementation discovers another exhaustive RuntimeState consumer, it joins the same atomic checkpoint rather than receiving a default arm.

Same-change documentation owners are this capsule, [the requirement ledger](../BPMN-REQUIREMENT-LEDGER.md), [Semantic Process IL](../SEMANTIC-PROCESS-IL-SPEC.md), applicable detail maps routed by [`implementation-status-router`](../IMPLEMENTATION-MAP.md), the package registries, [PLAN](../PLAN.md), and the review receipt. No durable history is emitted at this checkpoint, so the existing pre-release replay policy requires only that old histories and Program artifacts remain readable and byte-identical; the later profile/host slice must add its new-history boundary before deployment.

## Epistemic closure and reopen conditions

Established by the proposal basis: only completed Activities are compensable; global compensation makes retention scope-decided; Multi-Instance requires a separate per-instance snapshot; hidden semantic state is the correct dependency direction; retention charges the 65,536-byte committed-state budget; and Continue-As-New carries rather than sheds it.

Not yet established: an approved representation; executable Program/state contracts; exact Lean and TypeScript byte-measure agreement; completion-producer integration; source admission; any compensation trigger or handler; dependency-order execution; cancellation; Transaction behavior; CIB agreement; Temporal refinement; public capability; corpus coverage; Product 2; or closure evidence.

The principal common-mode risk is recording only what current fixtures expose. Explicit single/per-index identity, input/output partition, and scope ownership counter it. Chronology is not dependency order. The host byte check cannot replace the pure account's count and retained-record byte bounds.

The nearest realistic unsupported counterexample is a nested compensable Sub-Process whose completed child Activity must remain available to a global Process-level throw after the child scope has closed. The flat-root admission restriction rejects that model rather than disposing the record incorrectly. Reopen before nested scopes, Call Activity, standard loops, concurrent repetition, a Compensation Event Sub-Process, targeted/global triggers, cancellation, Transactions, or a new `VariableValue` arm that lacks an exact canonical-byte rule.

## Closure cost

No closure cost is claimed at proposal time. Closure must measure one immutable range with [`capsule-cost.ts`](../../scripts/capsule-cost.ts), compare representation and proof cost with the nearest cross-cutting RuntimeState increment, and report producer, Temporal, profile, and evidence slices separately rather than hiding them as one compensation feature.

## Stage boundary

The first green representation checkpoint contains the optional Program declaration, optional RuntimeState register, strict shared and Lean readers, exact pure insertion and byte refusal, well-formedness, root start/close lifecycle, old-byte compatibility, single and Multi-Instance state witnesses, and the proved Lean laws above. It includes no completion producer, source profile, trigger, handler, Temporal host behavior, public capability, scenario, corpus, Product 2, or closure claim.

That first green target is a mandatory semantic checkpoint. No existing Activity-completion family may begin retaining records until its independent checkpoint review is approved. The next producer slice must enumerate every ordinary, data-bearing, effect, sequential Multi-Instance, and parallel Multi-Instance successful completion path, reproduce one omitted-family mutation, and preserve the pre-mutation rule of `CRET-CAPACITY-01` atomically.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `not-recorded` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
