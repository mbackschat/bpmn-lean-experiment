# Inclusive Gateway selected-branch synchronization proposal

## Status

**Owner-approved on 2026-08-02 after the independent proposal review passed required edits and correction audit `0b52d15`. Implementation is authorized within the exact proposal boundary.**

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `16904dd` | `external-fresh-session` | `approve-with-required-edits` | `0b52d15` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |

This receipt follows the [independent cold-review gate](../TESTING-SPEC.md#independent-cold-review-gate). Immutable proposal target `16904dd` predates transition baseline `b361681`, so its external fresh-session review remains valid; the same reviewer passed correction audit `0b52d15` without a material redesign. Every later review target uses the same-model/same-effort `fork-turns-none` rule.

## Exact question

Should the project admit one structured acyclic Inclusive Gateway split/join region that evaluates exactly two Simple Boolean conditions, activates every true conditional branch or one default branch when neither is true, and synchronizes all and only the branches selected for that split occurrence?

The recommended answer is yes. The slice adds a reusable multi-selection transition and selected-set synchronization state. It does not reinterpret the existing single-output `choose` or all-input `synchronize` operations, and it does not claim general Inclusive Gateway topology.

## Required proposition

BPMN 2.0.2 Clause 10.6.3 requires a diverging Inclusive Gateway to evaluate every outgoing condition and traverse every Sequence Flow whose condition is true. A default Flow is used only when none is true; omitting the default in that state causes an exception.

Clause 13.4.3 and Table 13.3 define the converging Gateway by the tokens that have arrived and the paths on which another token can still reach the join. Table 13.3 identifies Structured Synchronizing Merge (WCP-7) as a supported pattern. The first profile selects an interpretation for exactly that closed acyclic pattern: an active User Task consumes its branch control token and retains branch liveness as an Activity wait, so a literal control-place-only transcription of Table 13.3 would release too early. The occurrence-owned selected set preserves that otherwise-erased liveness and is exactly the set of join inputs that can still contribute in this topology. This is a bounded runtime interpretation of the normative rule, not a claim to implement its general nonlocal reachability predicate.

The mandated OMG issue audit consulted the registered BPMN 2.0.2 issue view and [BPMN21-450](https://issues.omg.org/issues/BPMN21-450) on 2026-08-02. The issue remains open, is marked `Implementation work Blocked`, and has no approved disposition; it reports that the synchronization description and cross-reference are insufficient. No resolved issue therefore supersedes Table 13.3 or selects a general algorithm. This proposal answers only the WCP-7 structured case above and requires the issue disposition to be rechecked before closure.

This is a vendor-neutral BPMN account. It reuses the implemented [Simple Boolean expression language](../SIMPLE-BOOLEAN-EXPRESSION-DECISION.md). No CIB Seven relationship, CIB expression meaning, or CIB evaluator algorithm is selected. The pinned CIB Inclusive Gateway tests remain probe seeds in [breadth research](../research/CIB-SEVEN-BPMN-BREADTH-RESEARCH.md#proto-mvp-ordering-after-receive-task), not compatibility evidence.

## Exact source profile

The admitted document contains exactly one self-contained `Definitions` and one private Process with explicit `isExecutable="true"`. The Process contains:

- one None Start Event;
- one Inclusive Gateway whose one incoming and three outgoing Sequence Flows derive `Diverging`, with exactly two conditional outgoing Sequence Flows and one distinct conditionless default Sequence Flow named by its `default` reference;
- three distinct User Tasks, one on each branch, each with exactly one incoming and one outgoing Sequence Flow;
- one Inclusive Gateway whose three incoming and one outgoing Sequence Flow derive `Converging`;
- one None End Event; and
- no other Flow Node or executable definition.

`Definitions.expressionLanguage` is exactly `urn:bpmn-lean:expression:simple-boolean:v1`. Both conditional Flows contain one admitted BPMN `tFormalExpression`; neither has a per-expression language override. The default has no condition. The representative fixture uses `isPresent("takeA")` and `isPresent("takeB")`, but the profile admits any two independently valid Simple Boolean v1 bodies.

All nodes and Sequence Flows belong to the root definition scope. Every reference resolves, every branch runs directly from the split through its User Task to the join, and the graph is acyclic, reachable, and co-reachable. There is no alternate entry, exit, cross-branch Flow, nested scope, boundary Event, loop characteristic, or additional incoming Flow at either Gateway. For each Gateway, `gatewayDirection` may be omitted, `unspecified`, or equal to the direction derived from this admitted arity; an opposite direction and the `mixed` literal are rejected because the admitted arity is not mixed. This follows the CMOF default and the implemented Parallel and Exclusive Gateway admission convention while retaining topology-derived direction as the authority. Source admission tests must distinguish omitted, `unspecified`, matching, opposite, and `mixed` forms rather than proving only the representative omission.

XML declaration order and Gateway incoming/outgoing reference order are non-semantic. Admission and lowering preserve each Sequence Flow identity while canonicalizing contract collections. Candidate evaluation order is non-semantic because Table 13.3 explicitly permits any evaluation order and every expression is pure, total after admission, and evaluated against the same committed Process bindings.

## Semantic rules

### `IGW-EVALUATE-01` — evaluate every candidate from one state

When one token reaches the divergent operation, evaluate both admitted candidate expressions against the same complete committed Process-scope bindings. A true result for one candidate does not suppress evaluation or selection of the other.

### `IGW-SELECT-01` — activate the complete true subset

Consume exactly one input token and produce exactly one token on every candidate output whose condition is true. When at least one condition is true, produce no token on the default output.

### `IGW-DEFAULT-01` — select the default only for the empty true subset

When both conditions are false, consume exactly one input token and produce exactly one token on the default output. The required default keeps the missing-default exception outside this slice.

### `IGW-TRACK-01` — retain the occurrence's expected join inputs

The divergent firing atomically records the nonempty set of join-input Flow identities corresponding to the selected outputs. The record is owned by the current semantic scope occurrence and the paired split identity. The admitted acyclic profile permits at most one live record with that owner and split identity.

### `IGW-JOIN-READY-01` — wait for all and only selected arrivals

The paired converging operation is enabled only when its live selection record exists and one owner-matching token is present on every recorded input. Model inputs absent from the record do not block the join. One selected arrival cannot release a two-selected occurrence.

### `IGW-JOIN-CONSUME-01` — consume the selected set exactly once

One converging firing consumes exactly one owner-matching token from every recorded input, removes that selection record, and produces exactly one token on the join output. It consumes no token from an unselected input and cannot fire again for the removed record.

## Checked graph and Semantic Process contract

The checked graph adds closed divergent and convergent Inclusive Gateway node variants. The divergent node retains exactly two candidate Flow IDs and one default Flow ID. The convergent node retains the paired divergent Gateway ID. Existing checked conditions and Sequence Flow origins remain unchanged. Pairing is structural: for each split output, the admitted graph has exactly one path through that branch's User Task to exactly one input of the paired join. A split or join for which that correspondence is absent, ambiguous, or points to another branch is rejected.

The Semantic Process contract adds two reusable operation variants:

```ts
type InclusiveCandidate = DeepReadonly<{
  condition: SimpleBooleanExpression;
  output: string;
  expectedJoinInput: string;
  origin: BpmnSequenceFlowOrigin;
}>;

type SelectManyOperation = DeepReadonly<
  OperationBase & {
    kind: "selectMany";
    input: string;
    candidates: [InclusiveCandidate, InclusiveCandidate];
    defaultBranch: {
      output: string;
      expectedJoinInput: string;
      origin: BpmnSequenceFlowOrigin;
    };
    selectionKey: string;
  }
>;

type SynchronizeSelectedOperation = DeepReadonly<
  OperationBase & {
    kind: "synchronizeSelected";
    inputs: [string, string, string];
    output: string;
    selectionKey: string;
  }
>;
```

`selectMany` is multi-output conditional selection plus creation of one expected-input set. `synchronizeSelected` consumes the expected subset for the matching owner and key. Neither operation contains an Inclusive Gateway mode flag or calls a topology-specific evaluator. Lowering derives each candidate or default `output` from its own split Sequence Flow, derives that entry's `expectedJoinInput` by following that same branch through its sole User Task to the paired join input, and derives `selectionKey` from the paired divergent Gateway's BPMN element ID. `selectMany.candidates` is canonically sorted by `origin.elementId`; it does not inherit `choose.candidates` declaration order. `synchronizeSelected.inputs` is likewise in canonical Sequence Flow ID order.

Standalone program admission requires the three candidate/default `expectedJoinInput` values to be distinct, to equal the `synchronizeSelected.inputs` set, and to share the exact nonempty key used by the paired operations. Checked-definition binding additionally requires every `expectedJoinInput` to equal the join input structurally reachable from that entry's own `output` in the checked graph and requires `selectionKey` to equal the paired split ID. A seeded permutation that swaps two branch-to-join-input pairings while preserving the same set and key must remain structurally well-formed as a program shape but fail checked-definition binding and Lean lowering equality.

The existing `choose` contract remains first-true and single-output. The existing `synchronize` contract remains ready only when every declared input has a token. Reusing either with weakened meaning is outside the proposal.

Lean independently lowers the checked graph into these operations and requires exact equality with the received program before execution. The TypeScript source compiler and semantic core remain separate transcriptions of the reviewed account.

## Runtime-only selection record

The runtime adds one hidden collection:

```ts
type SelectedBranchSet = DeepReadonly<{
  owner: ScopeOccurrenceId;
  selectionKey: string;
  expectedInputs: [string] | [string, string];
}>;
```

The collection is not a public BPMN object and is not projected into canonical state. It is derived only from an admitted `selectMany` firing, owned by one live scope occurrence, and removed only by the matching `synchronizeSelected` firing or existing owner-scope interruption. The atomic runtime replacement must extend every existing owner-scope interruption cleanup to remove all records owned by the interrupted occurrence, even though this source profile cannot reach that path. Expected inputs are stored in canonical Sequence Flow ID order. The collection itself is ordered canonically by owner Process instance, definition-scope ID, activation, and then `selectionKey`, even though the first profile permits at most one record. Source order and evaluator iteration order therefore cannot affect state equality or replay.

The default branch creates a singleton record. One true candidate creates a singleton record. Two true candidates create a two-input record. An empty record is impossible. The first profile's acyclicity makes `(owner, selectionKey)` a complete live occurrence identity; repeated activation would require a separately reviewed activation identity and is excluded. A matching `synchronizeSelected` without a live record is disabled, and source/program admission excludes an unpaired join that could rely on that state.

A live selected-branch record blocks quiescence of its owner scope. Both Lean and TypeScript must extend their closed quiescence predicates, and a synthetic otherwise-quiescent scope with one owned record must remain non-quiescent. The admitted root path removes its record at the paired join before Process completion, but that reachability fact does not justify allowing a later scope or cancellation capsule to complete around a live record.

Public stable observation remains unchanged. It exposes the resulting User Task waits, not the hidden split record or partial join tokens. Stable-state resumability continues to depend on the remaining public wait; a hidden selection record alone is never progress evidence.

## Separating witnesses and proof boundary

The answer-free scenario family uses one definition and three initial-binding cases:

| Case | Initial bindings | Stable state after start | Required completion behavior |
|---|---|---|---|
| one true | `takeA` present, `takeB` absent | only User Task A | completing A reaches Process completion; absent B/default inputs do not block |
| both true | `takeA` and `takeB` present | User Tasks A and B | completing either first leaves only the other wait; completion occurs only after both |
| none true | both absent | only the default User Task | completing the default reaches Process completion |

Both A-then-B and B-then-A are required and must end in the same canonical completed state. Reversing candidate declaration and reference order must preserve every canonical observation for the same bindings.

The longest start closure is three internal steps for the one-true and default cases (`initiate`, `selectMany`, one `awaitUserTask`) and four for the both-true case (`initiate`, `selectMany`, two `awaitUserTask` activations). The four-step case must succeed below `semanticProcessClosureLimit = 8`, while the same case under limit 3 must report closure-bound exhaustion rather than publish a stable state. After the final selected User Task completes, terminal closure is exactly three internal steps: `synchronizeSelected`, `reachNoneEnd`, and root `completeScope`.

After the both-true `selectMany` firing, exactly the two distinct `awaitUserTask` operations are enabled. This is the existing approved independent two-task shape—distinct inputs, outputs, and task IDs—but it is newly data-dependent. Lean and TypeScript must enumerate the same two-operation set and execute both activation orders from that exact state, producing equal runtime states and canonical observations; neither source order nor the TypeScript evaluator's first enabled operation may become a semantic choice.

The two nearest wrong accounts are separately checked: waiting for every model input strands the one-true and default cases, while releasing on the first arrived selected input completes the both-true case too early. Erasing the stored expected set or replacing `selectMany` with first-true `choose` must make a seeded differential or Temporal bypass witness diverge at a stable canonical observation.

The Lean lane requires a declarative relation distinct from the evaluator, evaluator soundness for both new operations, a quantified selection-membership law under valid unique bindings, a join-readiness law over a nonempty expected subset, and an exact-consumption/removal law. Finite fixtures establish the three bounded traces and the two concrete non-laws; they do not establish general Inclusive Gateway completeness, arbitrary-graph reachability, liveness, or cross-implementation equivalence.

## Temporal hosting/refinement preflight

The finite profile needs no new host ingress, Timer, Signal, Activity, Child Workflow, effect, or cancellation mechanism. Process start installs the initial bindings, User Task completions use the existing content-bound Update path, and all Inclusive selection/join work remains pure semantic-core state inside the Workflow.

Semantic admission and Temporal host-capability admission remain separate. This exact profile passes host capability because it contains no Timer or effect wait, but `selectMany` is a token-splitting operation. Implementation must replace the current `Duplicate`-only split test with an exhaustive operation-kind classification that recognizes both `duplicate` and `selectMany` and fails compilation when another operation kind is added without a decision. Negative programs combining `selectMany` with an `awaitTimer` or `awaitEffect` must be rejected before Workflow start as `concurrentHostDrivenWaits`; this class guard is required even though those combinations remain outside this capsule.

The state relation pairs the admitted immutable program and complete semantic runtime state—including hidden selected-branch records—with the Workflow's committed in-memory state. Query publishes only the existing canonical observation. No Workflow handler, `Promise` race, array order, or Event History order may decide which branches were selected or whether the join is ready.

The smallest refinement witness starts the both-true case, observes A and B, commits one completion, observes only the sibling, stops the Worker, starts a replacement Worker, commits the sibling completion, observes terminal state, and replays the disposable history. The one-true and default cases establish that unselected inputs do not block. Concurrent A/B submissions may commit in either semantic order but must reach the same terminal state. Duplicate and stale completions reuse the current result-ledger and state-preserving refusal contracts.

A bypass that drops one expected input or advances the join after the first selected completion must diverge from the canonical intermediate state. A candidate-selection mutation that replaces the complete true subset with one candidate must diverge immediately in `activeWaits` and `openUserTasks`. A host-admission mutation that omits `selectMany` from token-split classification must make the Timer/effect negative program admit and therefore fail its guard.

## Evidence and layer ownership

| Rule | Normative/profile review | Lean | CIB Seven | Independent TypeScript | Temporal refinement | Negative or mutation guard |
|---|---|---|---|---|---|---|
| `IGW-EVALUATE-01` | Clauses 10.6.3 and 13.4.3 plus Simple Boolean v1 | quantified same-bindings/all-candidates law | deliberately absent | independent all-candidate evaluation | no host evaluation | first-true substitution changes both-true observation |
| `IGW-SELECT-01` / `IGW-DEFAULT-01` | Table 13.3 and required-default profile | relation/evaluator soundness, closure bound, independent activation orders, and three traces | deliberately absent | exact subset/default traces, closure bound, and independent activation orders | exact initial Query for all three cases plus split-aware host admission | dropped branch, forced-default, closure-limit, and host-classification mutations |
| `IGW-TRACK-01` | bounded WCP-7 runtime interpretation | creation/ownership, canonical order, and quiescence invariant | deliberately absent | hidden record lifecycle and quiescence guard | replay preserves committed selection | selected-set erasure, pairing permutation, and premature-quiescence mutations |
| `IGW-JOIN-READY-01` / `IGW-JOIN-CONSUME-01` | bounded consequence of Table 13.3 | readiness, consumption, removal, and two non-laws | deliberately absent | both orders and partial state | Worker replacement after first completion | all-input and first-arrival wrong accounts |

All six rules belong to the vendor-neutral BPMN/profile layer. CIB fixture prevalence only ordered the capsule and supplies no rule or evidence lane. No A12 source, identity, model shape, or adoption claim enters this proposal.

## Required, optional, and excluded surface

Required are the exact source profile and direction controls; branch-local split/join derivation and binding; canonical contract and runtime ordering; the two new generic operations; one hidden selected-set collection that blocks quiescence and is removed on owner interruption; unchanged canonical observation; the closure-limit and both-order witnesses; exhaustive token-split host admission; Lean soundness and useful laws; independent TypeScript behavior; Temporal replacement/replay; the complete artifact-registry and differential-catalog roundtrip; and meaningful subset/join mutations.

Optional after this capsule is closed is a separately registered CIB Seven agreement probe over an exact project-owned fixture. It may claim only public branch/wait/completion facts that the probe observes and must not make CIB JUEL truth or its internal graph algorithm evidence for Simple Boolean semantics.

Excluded are general Table 13.3 graph analysis; arbitrary, unstructured, nested, mixed, or repeated Inclusive Gateways; Inclusive merge without its paired admitted split; more or fewer candidates; no-default exception; conditional default; expression languages beyond Simple Boolean v1; data writes; loops and Multi-Instance; scopes, boundary Events, compensation, or cancellation; Message/Timer/effect races; CIB compatibility; A12 adoption; BPMN conformance; and production history compatibility.

## Versioning and assurance boundary

This is a pre-release additive contract change but still replaces the one current checked-node, Semantic Process operation, runtime-state, decoder, schema, semantic and host admission, exhaustive-switch, artifact-registry, and differential-catalog representations atomically. The profile, answer-free scenarios, evidence routes, and seeded mutations join the complete registry/catalog roundtrip in the same change. No optional mode bag, legacy reader, format counter, compatibility branch, Workflow patch, migration function, or retained Event History is permitted. Histories created by the gate are replayed and discarded in that gate.

The exact claim, if implemented and closed, is limited to all-true/default branching and occurrence-specific synchronization in the admitted one-region topology. The nearest unsupported claim is the general Inclusive Gateway reachability rule when tokens can approach a join through unstructured, nested, repeated, or externally entered paths.

The main common-mode risk is shared source/lowering structure: Lean, TypeScript, and Temporal can all agree on a wrongly paired split/join mapping. The branch-local structural pairing rule, a same-set wrong-pairing definition-binding negative, independent Lean lowering, declaration-order permutation, exact checked-to-program equality, the one-true versus both-true versus default discriminator, and selected-set erasure mutations are therefore mandatory. Closed-enumeration erosion is the second risk: exhaustive host split classification and selection-aware scope quiescence must fail if the new construct is omitted. Temporal remains a refinement of the TypeScript core, not another semantic authority.

Closure requires the epistemic review and commit-bounded cost record defined by the [capsule policy](README.md#required-capsule-structure). The Exclusive Gateway has no clean measured baseline and the Parallel Gateway has no cost-ledger row, so neither may be compared by impression. Compare the measured increment with the recorded Embedded Sub-Process Error propagation increment, the nearest recorded capsule that added a checked node and transition family across source, Lean, the semantic core, Temporal, differential evidence, and closure review.

## Owner decision requested

After independent proposal review, approve or reject these choices together:

1. the exact structured two-condition-plus-default split, three User Task branches, paired join, and None End source profile;
2. the six `IGW-*` rules and selected-set specialization of the general Inclusive Gateway join requirement;
3. additive generic `selectMany` and `synchronizeSelected` operations plus one hidden owner-scoped selected-branch collection, with branch-local structural pairing, canonical ordering, selection-aware scope quiescence, exhaustive token-split host classification, and no change to `choose`, `synchronize`, or public observation;
4. a standards-first Lean/TypeScript/Temporal target set with no CIB relationship or evidence lane in the first capsule; and
5. the exact exclusions and atomic pre-release replacement policy above.

Implementation may proceed within the exact approved boundary. Its semantic-checkpoint and closure reviews use context-cold same-effort sub-agents under the current policy.
