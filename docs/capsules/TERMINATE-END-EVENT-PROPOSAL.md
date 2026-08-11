# Terminate End Event proposal

## Status

**Proposal correction under independent review.** The owner-approved first green semantic checkpoint is independently approved after correction audit `d7140a9`, but it implements only omission of `triggeredByEvent`. Registration exposed a material source-profile correction: omission and the parser-safe XSD-false values `false` and `0` should select the same ordinary embedded Sub-Process. That correction is proposed here, is not implemented by the approved checkpoint, and receives renewed owner approval only after its proposal review closes. A new first-green admission/profile checkpoint and cold semantic-checkpoint review must close before registration, differential, or live Temporal evidence resumes. The profile is not registered or evidence-closed. This proposal selects one exact Terminate End Event in one ordinary embedded Sub-Process and the reusable containing-scope termination operation needed by that witness. It does not select Event Sub-Process termination, Transaction cancellation, compensation, Call Activity propagation, terminate-all extension behavior, Product 2 cancellation, CIB compatibility evidence, or another BPMN End Event family.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `26758d0` | `fork-turns-none` | `approve-with-required-edits` | `64ab573` |
| Semantic checkpoint | `6e6a3da` | `fork-turns-none` | `approve-with-required-edits` | `d7140a9` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |

## Question

May one Terminate End Event atomically clear every live owner in its containing scope occurrence, then reuse ordinary scope completion so a nested Sub-Process continues once while a root Process completes?

The recommendation is **yes, under the exact source, scope, runtime, proof, and evidence boundary below**. The reusable representation records containing-scope termination, not whole-Process termination. Root completion and nested continuation are consequences of the selected scope occurrence's existing `completeScope` operation.

## Selection basis

[PLAN.md](../PLAN.md#ordered-work) selects Terminate End after the cyclic-control-flow, Message Start, and Timer Start increments. It is explicitly required by the M2 exit gate, appears more often than the remaining configured generic Task in the pinned CIB breadth corpus, and opens the reusable scope-cancellation mechanism needed by later standard coverage. A platform scheduling, message-ingress, or search increment cannot substitute for the missing BPMN termination rule.

The existing [ordinary embedded Sub-Process completion specification](EMBEDDED-SUBPROCESS-COMPLETION-SPEC.md) already owns quiescent child completion and exactly-once parent continuation. The [Sub-Process Error propagation specification](SUBPROCESS-ERROR-PROPAGATION-SPEC.md) and the three boundary-Timer specifications already own regional cancellation of live scope subtrees. Terminate End reuses those genuinely identical ownership facts while keeping its trigger and continuation semantics separate.

## Normative basis

BPMN 2.0.2 is the semantic authority for this standards-only capsule.

- Clause 10.5.6 states that a Terminate End Event terminates every remaining active Activity within the Process.
- Clause 13.2 states that a Process instance completes when no token remains and no Activity is active, and that a token reaching a Terminate End Event abnormally terminates the entire Process.
- Clause 13.3.4 defines an embedded Sub-Process as a contained flow scope whose normal completion continues through the Sub-Process's outgoing Sequence Flow.
- Clause 13.5.6 states directly that a Terminate End Event inside a Sub-Process terminates only that Sub-Process instance and does not affect a higher-level Sub-Process or Process instance.
- Table 12.22 identifies a Terminate End Event as an End Event containing one TerminateEventDefinition.

The normative CMOF and XSD `EndEvent`, `ThrowEvent`, `TerminateEventDefinition`, `FlowElementsContainer`, `SubProcess`, and `SequenceFlow` facts constrain source structure. `TerminateEventDefinition` carries no additional properties. The diagram marker does not add runtime data.

The standard permits Terminate End at root Process scope and at nested flow scopes, including richer concurrent descendants than the representative profile. The checked and IL representations retain only the End Event identity, its consumed input, and the definition scope it terminates. Later standards coverage can admit additional topologies, wait families, and scope depths without reinterpreting a model accepted here.

The proposal adds `BPMN-TERMINATE-END-01` to the [BPMN requirement ledger](../BPMN-REQUIREMENT-LEDGER.md). It remains `unsupported` until implementation and closure evidence graduate this proposal.

- Ledger citation lock for `BPMN-TERMINATE-END-01`: Clauses 10.5.6, 13.2, 13.3.4, and 13.5.6 plus Table 12.22

The future profile and all three registered scenarios must carry that same complete normative citation set, including Clause 13.5.6 rather than inferring nested non-interference from the representative topology.

## CIB relationship

No new CIB relationship, probe, profile delta, or retained result is selected. The pinned CIB implementation cancels concurrent executions in the current flow scope before ending that scope, which agrees with the normative account, but the standard is sufficiently precise and the project does not need CIB-specific public evidence to choose the semantics. Registered scenarios therefore have `cib: null`.

The future profile reuses `CIB-AGR-0001`, `CIB-AGR-0002`, `CIB-AGR-0003`, `CIB-AGR-0007`, and `CIB-OP-0001` only for the already-reviewed sequential User Task, active-task, parallel, ordinary Sub-Process completion, and occurrence-mapping surfaces. None of those relationships is Terminate evidence, and no new Terminate relationship is added.

The CIB source remains selection research only. It is not semantic authority, a runtime dependency, or a reason to copy PVM cancellation machinery. If implementation uncovers an observable CIB result that differs from this account, work stops for classification before any compatibility profile is added.

## Selected account and rejected alternatives

The representative model is:

```text
None Start -> Embedded Sub-Process -> Outer User Task -> None End

Embedded Sub-Process:
  None Start -> Parallel fork
    branch 1: Trigger User Task -> Terminate End
    branch 2: Sibling User Task -> None End
```

Initial closure exposes the Trigger and Sibling User Tasks. Completing Trigger first consumes its token, atomically cancels Sibling and every other live owner in that child occurrence, records the Terminate End occurrence, and completes the child through the existing parent continuation. Only Outer is then enabled. Completing Sibling first reaches its ordinary child End, but the child stays live while Trigger remains active; completing Trigger later produces the same Outer wait. A stale Sibling command after Trigger-first termination rejects with exact state preservation. Completing Outer finishes the root Process normally.

The competing accounts are:

1. **Terminate the root Process regardless of placement.** Rejected. It contradicts the containing-scope account and makes nested Terminate unusable for ordinary Sub-Process continuation.
2. **Lower Terminate End directly to the Sub-Process outgoing place.** Rejected. It duplicates the producer already owned by `completeScope`, weakens exactly-once continuation, and couples one End Event to its parent's topology.
3. **Remove the selected scope occurrence together with its contents.** Rejected. The existing completion operation then has no live occurrence to complete and cannot distinguish nested continuation from root completion.
4. **Mark the scope terminated and expose a stable intermediate state.** Rejected. Termination and scope completion are one internal closure. No public half-terminated Process state is introduced.
5. **Atomically clear the selected occurrence's live subtree, retain only that now-quiescent occurrence, and immediately reuse `completeScope`.** Selected.

The primary semantic negative applies a global-cancellation mutation to the nested witness. It wrongly completes the root instead of publishing Outer. A second negative removes only the Trigger token and leaves Sibling live, proving that consuming the incoming token is not regional termination.

## Exact source profile

One immutable standards-only profile is proposed as `bpmn-2.0.2-terminate-end-event-draft`. It admits one BPMN document with:

- one private executable top-level Process;
- one ordinary embedded Sub-Process on the root line, followed by one Outer User Task and one root None End Event;
- one child None Start Event, one parallel fork, one Trigger User Task, one Sibling User Task, one child None End Event, and one Terminate End Event;
- exactly one inline TerminateEventDefinition on the Terminate End Event;
- exactly one conditionless incoming Sequence Flow and no outgoing Sequence Flow on each End Event;
- exactly the topology shown above, with distinct canonical Sequence Flow identities and one level of embedded scope;
- the ordinary embedded Sub-Process may omit `triggeredByEvent` or use the parser-safe XSD-false values `false` or `0`; all three select the same structural source projection, while their distinct exact XML bytes retain distinct source digests;
- no referenced EventDefinition, second EventDefinition, payload, data input, input set, Data Association, extension element, parser warning, additional root element, Event Sub-Process, Transaction, boundary Event, Call Activity, loop, compensation, or foreign executable content;
- arbitrary well-formed source identifiers. No fixture identity or product name participates in admission.

Missing, repeated, referenced, extra-property, wrong-kind, wrongly placed, incoming-arity, outgoing-flow, nested-scope, true-valued Event-Sub-Process `triggeredByEvent`, or mixed-End-definition mutations reject. Canonical `true` and parser-hostile but XSD-valid `1` are independent negatives. The existing raw Boolean-lexeme guard rejects other parser-ambiguous encodings before moddle projection. XSD-valid encodings beyond the exact parser-safe `false` and `0` values remain conforming but explicitly deferred rather than being reinterpreted by this bounded profile. Omitted, `false`, and `0` inputs produce equal checked structural projections and executable IL structures after excluding source identity, while exact bytes and their `sourceSha256` values remain distinct and correct. A root-level exact Terminate End remains conforming but deferred from source-profile registration; the generic checked and IL representation must still support a direct root witness.

The profile capability fixes the exact node and operation multiset. Reusable graph admission retains reference closure, producer and consumer ownership, legal arity, reachability, co-reachability, whole-graph acyclicity, one root completion, and one child completion. The existing compilation dispatches remain unchanged.

## Checked graph and lowering

The checked graph gains one closed node alternative:

```ts
type CheckedTerminateEndEvent = DeepReadonly<{
  kind: CheckedNodeKind.TerminateEndEvent;
  id: string;
}>;
```

The node has exactly one input and no output. Raw moddle objects remain inside `@bpmn-lean/bpmn-source`. A cohesive source reader owns exact TerminateEventDefinition cardinality and placement; the shared End Event projector delegates without weakening None End or Error End admission.

The checked node lowers to one operation:

```ts
type TerminateScopeOperation = OperationBase & DeepReadonly<{
  kind: SemanticOperationKind.TerminateScope;
  input: string;
  scopeId: string;
}>;
```

`origin.elementId` is the exact Terminate End Event identity. `input` comes only from the validated incoming Sequence Flow endpoint. `scopeId` is the exact checked containing definition scope. The operation has no output because the existing `completeScope` operation exclusively owns nested parent continuation and root completion.

The operation-scope inventory must agree with `scopeId`. Graph admission gives `terminateScope` one ordinary incoming control edge and one synthetic completion edge to the matching `completeScope`, analogous to the existing `reachNoneEnd -> completeScope` relationship. `completeScope`, `reachNoneEnd`, Error propagation, and boundary cancellation retain their serialized values and behavior.

## Runtime semantics

`terminateScope` is enabled if and only if:

- the Process is running;
- exactly one token is offered on `input`;
- that token's owner is one live scope occurrence whose definition scope equals `scopeId`;
- exactly one matching live selected occurrence exists;
- the operation's checked program and profile admit Terminate End.

One committed internal step:

1. consumes the offered input token;
2. identifies the selected occurrence by the exact token owner and definition scope;
3. removes every other live runtime owner in that occurrence and every descendant occurrence, including control tokens, User Task, Message, Timer, effect, branch-selection, event-race, called-Process descendant, and Activity-local state covered by the shared regional-cancellation owner;
4. retains the selected occurrence itself with its parent link and Process identity;
5. preserves unrelated parent and sibling-scope state, Process variables, monotonic activation counters, and existing end history;
6. increments the existing aggregate `endOccurrences` count once, while the operation origin retains the exact triggering End Event identity;
7. returns no token and exposes no public termination record.

The selected occurrence is now quiescent, so the next unique internal step is its existing `completeScope`. For a nested occurrence, that removes the child and produces exactly one parent-owned token on the existing Sub-Process output. For a root occurrence, it completes the Process. No new completion branch or parent-output logic is added to termination.

The cancellation primitive is reusable across root and nested occurrences. It does not encode the representative topology or assume User Task is the only wait family. If a runtime owner family cannot be classified as inside or outside the selected occurrence subtree, implementation stops rather than leaving it live silently.

Canonical observation publishes only the resulting existing state: Trigger and Sibling before termination, Outer after nested termination, or completed Process after root termination. It publishes no token positions, cancellation list, terminated-scope flag, Event History fact, or Temporal identity.

## Stable semantic rules

| Rule ID | Proposition |
|---|---|
| `TEND-SOURCE-01` | The selected source has one exact nested Terminate End Event with one inline empty TerminateEventDefinition, `1 -> 0` Sequence Flow arity, and no payload, reference, extension, or unsupported scope property. Omitted, `false`, and `0` `triggeredByEvent` values select equal structural projections with distinct exact source identities; true-valued `true` and `1` reject as Event Sub-Processes. |
| `TEND-LOWER-01` | Lowering preserves End Event identity, exact incoming control place, and exact containing definition scope while producing no continuation output. |
| `TEND-REGION-01` | Firing `terminateScope` consumes its one offered token, removes every other live owner in the selected scope-occurrence subtree, retains the selected occurrence quiescent, preserves unrelated state and monotonic history, and increments the existing aggregate `endOccurrences` count once while retaining the exact End Event only in operation origin. |
| `TEND-NESTED-01` | Terminating the representative child scope enables its existing `completeScope`, which continues the parent exactly once and leaves Outer as the only enabled interaction. |
| `TEND-ROOT-01` | Applying the same operation to a root occurrence enables its existing root `completeScope`, which completes the Process without a parent token. |
| `TEND-REFUSE-01` | Missing, stale, wrong-owner, wrong-scope, zero-token, multi-token, or non-running inputs yield no successor and preserve the exact input state. A stale cancelled User Task command is rejected with exact committed-state preservation. |
| `TEND-OBSERVE-01` | Nested termination publishes Outer and no Sibling; root termination publishes completed Process. No termination, token, scope, or host-private field is added to canonical observation. |
| `TEND-CLOSURE-01` | Start closure has exactly five operations with one approved order-invariant pair of enabled User Task awaits; Trigger completion closes in exactly three operations `terminateScope -> completeScope(child) -> awaitUserTask(Outer)`; Sibling-first completion reaches a stable Trigger wait; Outer completion closes in exactly two operations; each exact limit succeeds, each one-smaller limit fails, and every stable running state exposes a User Task resumption. |
| `TEND-HOST-01` | Existing User Task Updates durably refine the selected source scenario; BPMN regional termination is computed only by the semantic core, never by Temporal cancellation or Event History inference. |

All rules are vendor-neutral BPMN rules except `TEND-HOST-01`, which is a refinement constraint.

## Lean lane, laws, non-laws, and witnesses

The Lean lane is **proved**. New cohesive owners hold termination state transformation, transition semantics, fixtures, and conformance facts. Existing near-limit runtime, execution, lowering, and umbrella owners receive only extracted shared mechanics, exhaustive dispatch, or imports.

Required proved facts are:

- exact checked-node and program admission, `1 -> 0` arity, containing-scope binding, and endpoint-only lowering;
- declarative `terminateScope` relation, executable evaluator, and evaluator soundness;
- complete runtime-owner removal for the selected occurrence subtree, including called-Process descendants and Activity-local state, with selected-root retention;
- preservation of unrelated parent owners, Process variables, activation counters, prior End occurrences, and parent links;
- exact aggregate `endOccurrences + 1`, exact triggering identity in operation origin, and no continuation token from `terminateScope`;
- quiescence of the retained occurrence and immediate enablement of its unique matching `completeScope`;
- nested continuation exactly once and root completion with no parent output;
- exact refusal with state identity for zero, multiple, stale, wrong-owner, and wrong-scope offers;
- exact start, Trigger-first, Sibling-first, stale-command, Outer-completion, and root synthetic witnesses;
- exact closure lengths and one-smaller failures, the two-await order-invariance proposition, unique post-trigger closure, and stable User Task resumption;
- strict checked/program decoding for exact, missing, extra, malformed, empty, duplicate-key, wrong-kind, and cross-scope values;
- explicit fail-closed cases in every frozen CheckedSource experiment that exhaustively consumes the widened node or operation unions.

Checked non-laws are:

- regional cancellation does not prove compensation, Transaction Cancel, Event Sub-Process interruption, or Call Activity propagation policy;
- the representative User Task waits do not limit the reusable cancellation function to User Tasks;
- nested continuation does not mean Terminate End directly emits a parent token;
- root and nested witnesses do not prove arbitrary scope depth or every conforming concurrent topology;
- evaluator soundness does not imply Temporal cancellation, delivery fairness, or liveness outside the finite scenario.

The first Lean semantic change must repeat the existing one-CPU, no-swap, 3 GiB Linux admission audit before further proof growth. macOS uses Docker only for the hard process-tree memory limit; native Linux may use equivalent cgroup controls directly.

## Temporal hosting and refinement preflight

No new durable ingress, wait, Timer, Signal, Activity, Child Workflow, CancellationScope, or Workflow cancellation mechanism is required. Existing User Task Updates drive Trigger, Sibling, and Outer. The Workflow delegates internal closure to the pure semantic core.

The preserved relation equates each admitted command and committed canonical state with direct semantic-core execution. Temporal Event History may prove delivery and replay, but it cannot define which BPMN scope terminates or which owners disappear.

The smallest live witness is:

1. compile and start the exact nested scenario through the existing Workflow-start path;
2. Query the published Trigger and Sibling interactions;
3. complete Trigger through an Update and await its committed result;
4. stop and replace the Worker immediately after that commit;
5. recover the result and Query only Outer;
6. send a fresh command against the captured Sibling occurrence and prove semantic rejection plus byte-identical canonical state;
7. complete Outer and obtain the exact terminal result;
8. fetch history, assert no Signal, Timer, Activity, Child Workflow, cancellation-request, or cancellation-completion event family, and replay exactly.

Delivery ordering remains command order at the existing Update boundary. Occurrence identity provides deduplication and stale refusal. Update retry and accepted-but-response-lost handling remain host outcomes already owned by the User Task lifecycle. No cancellation command or separate acknowledgement is introduced.

A test-owned semantic mutation must replace regional termination with global termination or incomplete local clearing and reach a durable public discriminator. The preferred mutation globally removes the root occurrence, producing completed Process where production publishes Outer. Merely asserting that a stale command rejects is insufficient because unmodified production code already proves that negative.

Because this capsule adds no host mechanism, it does not justify a second general Temporal architecture. A dedicated live witness is still required at closure because scope cancellation materially changes the durable semantic state and replayed result.

## Rule-to-evidence matrix

| Rule | BPMN/profile evidence | Lean | TypeScript | Temporal | Separating negative or mutation |
|---|---|---|---|---|---|
| `TEND-SOURCE-01` | Exact XSD-valid nested source, omitted/`false`/`0` default equivalence, and malformed-source matrix | Exact checked admission | Equal structural checked/IL projection with distinct source identities | Exact compiled program and bytes | Definition cardinality, reference, payload, placement, arity, canonical-true, and parser-hostile-`1` mutations |
| `TEND-LOWER-01` | Validated endpoints and scope forest | Exact checked-to-IL equality | Independent lowering equality | Compiled program identity | Input, scope, origin, and synthetic-output drift |
| `TEND-REGION-01` | Containing-scope normative account | Relation, evaluator soundness, owner-family removal and preservation laws | Independent state transformation and mutation | Query after committed Update | Global cancellation and incomplete-clearing mutations |
| `TEND-NESTED-01` | Embedded Sub-Process continuation | Exact child completion and one parent token | Independent exact state | Only Outer after Worker replacement | Direct parent-output and double-completion mutations |
| `TEND-ROOT-01` | Root Process termination | Synthetic root theorem | Independent root witness | Not a separate host mechanism | Nested-as-root and parent-token mutations |
| `TEND-REFUSE-01` | Exact occurrence and scope identity | No-successor and state-identity theorems | No-successor and state-identity tests | Stale Sibling rejects after replacement | Wrong owner, scope, multiplicity, and activation independently varied |
| `TEND-OBSERVE-01` | Public BPMN outcome | Exact canonical projection facts | Complete observation assertions | Trigger/Sibling, Outer-only, and terminal Queries | Termination-record, Sibling-leak, and premature-root-completion mutations |
| `TEND-CLOSURE-01` | Finite selected topology | Exact traces, limits, enabledness, order invariance, stable waits | Independent traces and overflow checks | Stable waits at both resumptions | Skip termination, extra enabled operation, reversed await order, and hidden stable-wait mutations |
| `TEND-HOST-01` | No host-defined semantic claim | Direct result is reference | Direct result and mutation oracle | Update, Worker replacement, history inspection, and replay | Test-owned global-cancellation bundle |

Three standards-only answer-free scenarios cover Trigger-first success, Sibling-first success, and stale Sibling rejection. The rejection is separate because ordinary scenario execution terminates at the first semantic rejection. All have `cib: null`. Differential evidence compares Lean, TypeScript, and Temporal without a CIB claim.

## Runtime-only and synthetic constructs

| Construct | Derivation and owner | Public projection | Lifecycle invariant |
|---|---|---|---|
| selected scope occurrence | Exact owner of the offered Terminate input token plus `scopeId` | None | Retained only until immediate `completeScope`; never a stable half-terminated state. |
| subtree-membership relation | Existing scope-occurrence parent graph plus called-Process ownership | None | Decides every live runtime owner consistently across cancellation families. |
| synthetic completion edge | Program graph relation from `terminateScope` to the matching `completeScope` | None | Used only for admission, closure, and graph laws; no control token is created. |
| aggregate End occurrence counter | Existing monotonic private `endOccurrences` scalar | Existing behavior only | Increments exactly once even though live regional owners are removed; exact End identity remains in operation origin rather than this counter. |
| Temporal Workflow/Run identity and Event History | Existing host lifecycle | None in semantic state | Used for durable addressing and replay, never scope selection or cancellation meaning. |

## Layer ownership

- BPMN source admission owns exact TerminateEventDefinition shape, placement, and Sequence Flow arity.
- Checked source owns End Event and containing-scope identity.
- Semantic Process IL owns the consumed input and selected definition scope, with no continuation output.
- Lean and the pure TypeScript semantic core independently own regional termination, scope completion composition, and exact refusal.
- Temporal owns durable command delivery, Worker replacement, result recovery, and replay without defining cancellation.
- Product 2 consumes only existing public interaction and state contracts and gains no cancellation surface here.
- CIB Seven is not a selected oracle for this standards-only slice.
- A12 remains outside the repository's product and licence boundary.

## Required, optional, and excluded

Required:

- exact nested Terminate End source admission and a reusable root-capable checked/IL representation;
- one no-output `terminateScope` operation composed with unchanged `completeScope`;
- complete selected-subtree owner removal, selected-occurrence retention, unrelated-state preservation, and End-history increment;
- proved Lean relation, evaluator soundness, exact closures, order-invariance, refusal, and strict-wire facts;
- independent TypeScript semantics and meaningful global/incomplete cancellation mutations;
- three registered answer-free standards scenarios with no CIB target;
- one live Temporal Worker-replacement, stale-refusal, history, and replay witness;
- frozen pre-M2 preservation and atomic catalog guards.

Optional only if it adds no semantic or public claim:

- a diagnostic listing private owner families removed by a test-only direct runtime witness;
- a second root-level source fixture after the generic root theorem is already green.

Excluded:

- Event Sub-Process start or termination, Transaction Cancel, compensation, escalation, Error, terminate-all extensions, and boundary-event semantics;
- Call Activity propagation, parent termination, multi-instance cancellation, arbitrary nesting, and arbitrary graph topology;
- a public cancel command, termination receipt, token/scope projection, or deleted-work audit log;
- Temporal cancellation APIs, CancellationScope, Child Workflow cancellation, Signal, Timer, Activity, or Event History-derived BPMN meaning;
- Product 2 cancellation API, authorization, UI, or operator policy;
- CIB compatibility evidence or relationship changes;
- A12 source, behavior, terminology, or dependency;
- configured generic Task, Product 2 scheduling, message ingress, instance search, or another M2 family.

## Preservation obligation and common-mode risks

Every source/profile/scenario registration present in immutable pre-M2 baseline `7529150bf3a83de7e36734cf8d401924a0811b7d` retains exact source bytes, profile bytes, admission result, checked graph, lowered program, scenario projection, and registry origin. The cyclic-control-flow preservation fixture remains read-only. Terminate End is additive.

Primary common-mode risks are:

- source and lowering both hard-code the representative fixture's scope or IDs;
- Lean and TypeScript both remove only tokens while leaving waits or called descendants live;
- both interpreters treat nested termination as root completion;
- termination directly emits the parent output and races or duplicates `completeScope`;
- the selected occurrence is removed too early or exposed as a stable half-terminated state;
- counters, the prior aggregate End count, parent work, or Process variables are erased with live regional owners;
- the Temporal witness uses Workflow cancellation or only reasserts production's stale-command behavior;
- profile, scenarios, schemas, experiments, and differential inventories land non-atomically.

Separating evidence uses independent direct checked/program values, exact root and nested witnesses, an independently constructed runtime state containing every owner family, state-identity negatives, checked-to-IL drift mutations, a test-owned global-cancellation semantic bundle, Worker replacement, history-family exclusion, replay, and the frozen baseline oracle.

The nearest realistic unsupported claim is Terminate End inside a called child Process whose normal Call Activity return must be distinguished from parent termination. That requires the complete Call Activity and scope-termination composition account. This proposal neither blocks nor silently decides it.

## Versioning consequences

Pre-release replace-in-place policy applies. Checked-node and Semantic Process operation unions widen atomically across strict JSON Schemas, Lean and TypeScript decoders, exhaustive switches, source projection, admission, lowering, graph validation, runtime execution, profile/scenario registries, Temporal host admission, artifact consistency, experiments, and evidence.

Existing None End, Error End, `reachNoneEnd`, `completeScope`, regional Error/Timer cancellation, runtime state, canonical observations, and all pre-existing artifacts gain no field and retain exact serialized bytes. No retained cross-version Temporal history corpus exists, so cross-version replay remains unclaimed.

The semantic checkpoint uses a separate runtime-frozen `SemanticCheckpointProfileId.TerminateEnd` catalog entry rather than product-registering the profile early. Graduation atomically moves the same literal into `SemanticProfileId`, removes the checkpoint-only catalog, and adds the required runnable product example. This preserves the current product-profile and product-example guards without hiding an implementation prerequisite.

### Owners this implementation grows

The owner inventory is mechanically derived with `node scripts/what-binds.ts`; [document reviewability](../../scripts/document-reviewability.test.ts) rechecks each figure. A fresh Red measurement governs extraction before implementation.

| Owner | Headroom to 600 nonblank lines | Consequence |
|---|---:|---|
| [semantic-core public exports](../../packages/semantic-core/src/index.ts) | 559 | Export closed Terminate contracts and cohesive owners only. |
| [checked-process contract](../../packages/semantic-core/src/checked-process-contract.ts) | 365 | Add the identity-only checked Terminate End variant. |
| [Semantic Process contract](../../packages/semantic-core/src/semantic-process-contract.ts) | 201 | Add the no-output `terminateScope` operation. |
| [operation admission](../../packages/semantic-core/src/semantic-process-operation-admission.ts) | 133 | Validate input, scope, and canonical identity or delegate before the limit. |
| [graph admission](../../packages/semantic-core/src/semantic-process-graph-admission.ts) | 99 | Add the synthetic completion edge through a cohesive extracted owner if fresh growth approaches the limit. |
| [profile capability](../../packages/semantic-core/src/semantic-process-profile.ts) | 35 | Split the catalog/capability responsibility before profile growth crosses 600. |
| [runtime dispatcher](../../packages/semantic-core/src/semantic-process-runtime.ts) | 233 | Add only one delegated operation arm. |
| [scope cancellation](../../packages/semantic-core/src/semantic-process-scope-cancellation.ts) | 484 | Own shared subtree classification and selected-root-retaining cancellation. |
| [projected flow-element keys](../../packages/bpmn-source/src/projected-flow-element-keys.ts) | 323 | Add the exact Terminate End projection key set consumed by the shared projector guard. |
| [checked-element projection](../../packages/bpmn-source/src/checked-element-projection.ts) | 219 | Delegate exact Terminate End projection without changing None/Error branches. |
| [checked-process admission](../../packages/bpmn-source/src/checked-process-admission.ts) | 149 | Add exact profile multiset and scope policy. |
| [checked graph admission](../../packages/bpmn-source/src/checked-process-graph-admission.ts) | 280 | Recognize Terminate End as a `1 -> 0` sink. |
| [Terminate End source reader](../../packages/bpmn-source/src/terminate-end-event-source.ts) | 530 | Resolve omission and parser-safe false values to the ordinary Sub-Process proposition while retaining the Event Sub-Process exclusion. |
| [Semantic Process lowering](../../packages/bpmn-source/src/semantic-process-lowering.ts) | 58 | Delegate to a new cohesive Terminate lowering owner. |
| [contract artifact consistency](../../scripts/contract-artifact-consistency.ts) | 0 | Extract an End/termination consistency owner before adding semantic checks. |
| [contract artifact projection](../../scripts/contract-artifacts.ts) | 16 | Add only an exhaustive classifier arm; extract any new projection responsibility. |
| [contract artifact cases](../../scripts/contract-artifact-cases.ts) | 397 | Register standards-only scenarios with no CIB target. |
| [bounded CMOF calibration](../../scripts/check-bpmn-semantic-process-metamodel.ts) | 340 | Verify the newly consumed normative `TerminateEventDefinition` class before source admission uses it. |
| [differential pipeline cases](../../packages/differential/test/pipeline-cases.ts) | 28 | Put cases in a capsule-owned module and add only catalog registration. |
| [Temporal host admission](../../packages/temporal-adapter/protocol/src/host-admission.ts) | 397 | Classify `terminateScope` as a passive internal operation. |
| [test mutation Workflows](../../packages/temporal-adapter/testkit/src/branch-bypass-mutation-workflows.ts) | 512 | Add a cohesive global-cancellation mutation or extract a termination mutation owner. |
| [Lean semantic contract](../../BpmnSemantics/SemanticProcessContract.lean) | 122 | Add checked and IL variants without widening old values. |
| [Lean checked admission](../../BpmnSemantics/SemanticProcess/CheckedProcessAdmission.lean) | 286 | Validate exact checked shape. |
| [Lean checked graph](../../BpmnSemantics/SemanticProcess/CheckedGraphValidation.lean) | 466 | Add `1 -> 0` arity and scope ownership. |
| [Lean profile admission](../../BpmnSemantics/SemanticProcess/ProfileAdmission.lean) | 256 | Own exact selected node and operation multiset. |
| [Lean structural admission](../../BpmnSemantics/SemanticProcess/ProgramStructuralValidation.lean) | 293 | Validate generic input, scope, and no-output structure. |
| [Lean graph validation](../../BpmnSemantics/SemanticProcess/GraphValidation.lean) | 162 | Add the synthetic completion edge and reachability. |
| [Lean runtime state](../../BpmnSemantics/SemanticProcess/RuntimeState.lean) | 160 | Extract reusable scope cancellation before semantic growth. |
| [Lean Error propagation](../../BpmnSemantics/SemanticProcess/ErrorPropagation.lean) | 447 | Preserve existing cancellation laws through the extracted primitive. |
| [Lean scenario projection](../../BpmnSemantics/SemanticProcess/Scenario.lean) | 287 | Classify the new operation as owning no public wait definition. |
| [Lean transition dispatch](../../BpmnSemantics/SemanticProcess/Transition.lean) | 267 | Add only one delegated relation/evaluator arm. |
| [Lean execution](../../BpmnSemantics/SemanticProcess/Execution.lean) | 48 | Add no proofs; only import or exhaustive dispatch after extraction. |
| [Lean lowering](../../BpmnSemantics/SemanticProcess/Lowering.lean) | 76 | Delegate to a new cohesive Terminate lowering owner. |
| [Lean checked decoder](../../BpmnSemantics/SemanticProcessJson/CheckedProcess.lean) | 357 | Decode the exact checked node. |
| [Lean program decoder](../../BpmnSemantics/SemanticProcessJson/Program.lean) | 147 | Decode the exact operation. |
| [Lean Semantic Process umbrella](../../BpmnSemantics/SemanticProcess.lean) | 571 | Import independently buildable owners only. |
| [Lean conformance executable](../../BpmnSemantics/ConformanceMain.lean) | 583 | Import conformance evidence only. |
| [Lean library umbrella](../../BpmnSemantics.lean) | 574 | Import the public conformance module only. |
| [checked-source decomposition experiment](../../BpmnSemantics/Experiments/CheckedSourceDecomposition.lean) | 429 | Reject the new node explicitly. |
| [checked-source transition experiment](../../BpmnSemantics/Experiments/CheckedSourceTransition.lean) | 287 | Reject the new node and operation explicitly. |
| [checked-source graph experiment](../../BpmnSemantics/Experiments/CheckedSourceGraph.lean) | 514 | Reject Terminate End in frozen sink and graph predicates. |
| [checked-source chain experiment](../../BpmnSemantics/Experiments/CheckedSourceChain.lean) | 405 | Keep supported-chain classification exhaustive and fail closed. |
| [checked-source coverage experiment](../../BpmnSemantics/Experiments/CheckedSourceCoverage.lean) | 349 | Keep coverage proofs exhaustive without claiming support. |
| [checked-source frontier experiment](../../BpmnSemantics/Experiments/CheckedSourceFrontier.lean) | 329 | Add an explicit fail-closed arm if its exhaustive consumer widens. |
| [checked-source correspondence experiment](../../BpmnSemantics/Experiments/CheckedSourceCorrespondence.lean) | 419 | Preserve exhaustive source/program correspondence classification. |

The bounded [CMOF manifest](../../packages/bpmn-source/src/bpmn-2.0.2-semantic-process-metamodel.json) adds `TerminateEventDefinition` together with the calibration owner above. Strict [checked-process schema](../../contracts/schemas/checked-process.schema.json) and [Semantic Process schema](../../contracts/schemas/semantic-process.schema.json) change atomically but are not hand-written source headroom owners. New cohesive source, lowering, semantic runtime, Lean cancellation, relation, fixture, and conformance owners start below the 600-line threshold and are inventoried before their Red.

Existing focused test owners also change where their exhaustive inventories widen:

| Test owner | Headroom to 600 nonblank lines | Obligation |
|---|---:|---|
| [projected flow-element keys](../../packages/bpmn-source/test/projected-flow-element-keys.test.ts) | 154 | Register the exact projector in the closed consumer matrix. |
| [checked graph admission](../../packages/bpmn-source/test/checked-process-graph-admission.test.ts) | 312 | Lock `1 -> 0`, nested scope, and synthetic completion edges. |
| [Terminate End source characterization](../../packages/bpmn-source/test/terminate-end-event-source.test.ts) | 383 | Lock omitted/`false`/`0` structural equivalence, distinct source identity, and true-valued lexical negatives before registration. |
| [metamodel-default admission](../../packages/bpmn-source/test/metamodel-default-admission.test.ts) | 436 | Retain registry-wide omitted/default equivalence as the graduation oracle. |
| [definition artifact negatives](../../scripts/contract-definition-artifacts.test.ts) | 61 | Reject origin, input, scope, and output drift. |
| [host admission](../../packages/temporal-adapter/testkit/test/host-admission.test.ts) | 30 | Extract a termination characterization owner rather than crowding this test. |
| [product examples](../../packages/temporal-adapter/testkit/test/product-example-configs.test.ts) | 429 | Require at least one runnable example when the checkpoint-only profile graduates. |
| [pipeline catalog](../../packages/differential/test/pipeline-catalog.test.ts) | 295 | Lock additive profiles, cases, standards-only targets, and mutations. |

The seven experiment owners above are the current repository-built exhaustive consumers found by the checked-node and operation discriminant sweep. No experiment gains Terminate semantics. The implementation repeats the sweep after the unions widen and treats any new consumer as part of the same atomic change.

The profile, three scenarios, BPMN fixture, runnable product example, and differential cases are one atomic registration. The [shared-contract registry](../../contracts/README.md), [semantic-core registry](../../packages/semantic-core/README.md), [BPMN-source registry](../../packages/bpmn-source/README.md), [differential registry](../../packages/differential/README.md), [Temporal adapter registry](../../packages/temporal-adapter/README.md), [profiles registry](../../profiles/README.md), [scenarios registry](../../scenarios/README.md), [profile-parameterized admission](../PROFILE-PARAMETERIZED-ADMISSION-SPEC.md), [Semantic Process IL](../SEMANTIC-PROCESS-IL-SPEC.md), [Temporal lifecycle specification](../TEMPORAL-PROCESS-LIFECYCLE-SPEC.md), [implementation map](../IMPLEMENTATION-MAP.md), [testing specification](../TESTING-SPEC.md), and [plan](../PLAN.md) update atomically at closure.

### Guards and oracles

| Guard or oracle | Obligation |
|---|---|
| [document reviewability](../../scripts/document-reviewability.test.ts) | Recompute every owner figure and require proposal routing. |
| [requirement ledger consistency](../../scripts/requirement-ledger-consistency.test.ts) | Keep `BPMN-TERMINATE-END-01`, citations, disposition, and capsule aligned. |
| [contract schema coverage](../../scripts/contract-schema-coverage.test.ts) and [contract artifacts](../../scripts/contract-artifacts.test.ts) | Cover every new union arm and reject malformed exact shapes. |
| [definition artifact consistency](../../scripts/contract-definition-artifacts.test.ts) | Bind End Event origin, input, containing scope, and absent output to lowering. |
| [projected keys](../../packages/bpmn-source/test/projected-flow-element-keys.test.ts) | Close the shared projection consumer inventory. |
| [Terminate source characterization](../../packages/bpmn-source/test/terminate-end-event-source.test.ts) and [metamodel-default admission](../../packages/bpmn-source/test/metamodel-default-admission.test.ts) | Separate raw Boolean-lexeme safety from resolved false-value equivalence, preserve exact source digests, and keep registration-wide defaults aligned. |
| [frozen cyclic baseline](../../packages/bpmn-source/test/cyclic-control-flow-preservation.test.ts) | Preserve every pre-M2 source, profile, checked, IL, and registry-origin value. |
| [product examples](../../packages/temporal-adapter/testkit/test/product-example-configs.test.ts), [capsule roundtrip](../../scripts/capsule-roundtrip.test.ts), and [differential pipeline](../../packages/differential/test/pipeline.test.ts) | Land profile, runnable example, scenarios, targets, and ordered inventories atomically. |
| [host admission](../../packages/temporal-adapter/testkit/test/host-admission.test.ts) | Admit passive termination closure and reject unsupported host shapes. |
| [Temporal package boundary](../../scripts/temporal-package-boundary.test.ts) | Keep Workflow, Worker, runner, and testkit dependencies in owned packages. |
| [platform boundary](../../scripts/platform-product-boundary.test.ts) | Keep Product 2 outside private checked, IL, runtime, and cancellation values. |
| [A12 boundary](../../scripts/a12-boundary.test.ts) and [A12 preservation](../../scripts/a12-preservation.test.ts) | Keep A12 outside this standards-only mechanism. |
| [BPMN XML validation](../../scripts/bpmn-xml-validation.test.ts) and [corpus policy](../../scripts/bpmn-corpus-policy.test.ts) | Validate the fixture and retain the pinned normative corpus. |
| [bounded CMOF calibration](../../scripts/check-bpmn-semantic-process-metamodel.ts) | Derive `TerminateEventDefinition` identity from the pinned normative CMOF instead of accepting a hand-entered type string. |
| [normative references](../../scripts/normative-reference-resolution.test.ts) | Resolve every named clause, table, CMOF, and XSD anchor. |
| [source hygiene](../../scripts/source-hygiene.test.ts), [Lean contracts](../../scripts/lean-source-contracts.test.ts), and [what-binds](../../scripts/what-binds.test.ts) | Keep cohesive owners, exhaustive switches, and registries within bounds. |
| [pre-release architecture](../../scripts/pre-release-architecture.test.ts) | Prevent public termination bags, Event History semantics, and a second semantic core. |
| [semantic review packet](../../scripts/semantic-review-packet.test.ts) | Bind each governed review to immutable targets and routed sections. |
| [Markdown links](../../scripts/markdown-links.test.ts) | Resolve every owner, guard, requirement, and evidence link. |

## Epistemic closure and cost boundary

Closure may establish only one exact nested Terminate End profile, its reusable root-capable containing-scope operation, independent Lean and TypeScript semantics, registered answer-free evidence, and existing-Update Temporal refinement. It does not establish arbitrary nesting, every runtime owner family not yet represented by the project, Call Activity propagation, compensation, Transaction cancellation, CIB compatibility, Product 2 cancellation, or full Process Execution Conformance.

The nearest realistic counterexample is a Terminate End in a called child Process with concurrent parent work. A wrong implementation might cancel the parent or fail to return the Call Activity. That composition is deferred and must be specified before admission.

Meaningful mutations are: terminate the root instead of the containing scope; remove only tokens; retain one wait family; erase unrelated parent work or Process variables; emit the parent token directly; remove the selected occurrence before `completeScope`; skip the aggregate End-count increment; expose a stable half-terminated state; infer cancellation from Event History; and omit one atomic registration. Each must reach a semantic, public, artifact, proof, or durable-host discriminator.

At closure, [CAPSULE-COST-LEDGER.md](../CAPSULE-COST-LEDGER.md) records commit-bounded code and documentation churn against Sub-Process Error propagation, the nearest completed increment that changed checked source, regional cancellation, Lean, TypeScript, strict wires, registered evidence, and Temporal Worker-replacement hosting.

## Stop conditions

Stop and return to research or owner decision if:

- normative scope ownership cannot be represented without treating nested Terminate as root termination;
- implementation requires direct parent-output production from `terminateScope` or changing existing `completeScope` values;
- any live runtime owner family cannot be classified and removed or preserved through one shared scope-subtree relation;
- selected-root retention creates a publicly observable half-terminated stable state;
- the same representation cannot support both the nested witness and a direct root theorem without reinterpretation;
- exact End Event, input, and scope identity cannot survive source, checked graph, IL, Lean, TypeScript, and artifact checks;
- Temporal hosting requires Workflow cancellation, Signal, Timer, Activity, Child Workflow, or Event History-derived BPMN meaning;
- the meaningful global/incomplete cancellation mutation cannot reach a public durable discriminator;
- the frozen baseline changes or atomic registration guards cannot accept exactly one profile and three scenarios;
- any A12 or unreviewed CIB behavior becomes necessary;
- an owner would cross 600 nonblank lines without a cohesive extraction, or the first Lean change cannot pass the one-CPU, no-swap, 3 GiB resource audit.

## Owner decisions after review

Owner approval is requested for these exact decisions:

1. Select the nested parallel Trigger/Sibling witness and a reusable root-capable containing-scope termination operation.
2. Add identity-only `TerminateEndEvent` and no-output `TerminateScope` variants while preserving existing End, cancellation, and completion values byte-for-byte.
3. Retain the selected occurrence quiescent after regional clearing and require immediate existing `completeScope` closure, with no public intermediate state.
4. Admit omitted `triggeredByEvent` plus exact parser-safe XSD-false `false` and `0` as structurally equivalent ordinary Sub-Processes with distinct exact source identities; reject true-valued `true` and `1`, and defer other parser-ambiguous XSD encodings.
5. Register three standards-only answer-free scenarios with `cib: null` for Trigger-first, Sibling-first, and stale-Sibling behavior.
6. Use existing User Task Updates and one live Worker-replacement/replay witness, with no Temporal cancellation mechanism.
7. Use a proved Lean lane and require a conditional semantic checkpoint before registered evidence and live Temporal work.
8. Keep Event Sub-Process, Transaction, compensation, Call Activity propagation, Product 2 cancellation, CIB compatibility, and A12 outside the capsule.
