# Inclusive Gateway selected-branch synchronization proposal

## Status

**Draft proposal. Not owner-approved; no implementation is authorized. Awaiting independent external proposal review.**

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `not-recorded` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |

This receipt follows the [independent cold-review gate](../TESTING-SPEC.md#independent-cold-review-gate). The proposal target will be recorded in a docs-only follow-up before the external fresh-session handoff.

## Exact question

Should the project admit one structured acyclic Inclusive Gateway split/join region that evaluates exactly two Simple Boolean conditions, activates every true conditional branch or one default branch when neither is true, and synchronizes all and only the branches selected for that split occurrence?

The recommended answer is yes. The slice adds a reusable multi-selection transition and selected-set synchronization state. It does not reinterpret the existing single-output `choose` or all-input `synchronize` operations, and it does not claim general Inclusive Gateway topology.

## Required proposition

BPMN 2.0.2 Clause 10.6.3 requires a diverging Inclusive Gateway to evaluate every outgoing condition and traverse every Sequence Flow whose condition is true. A default Flow is used only when none is true; omitting the default in that state causes an exception.

Clause 13.4.3 and Table 13.3 define the converging Gateway by the tokens that have arrived and the paths on which another token can still reach the join. The first profile specializes that rule to one closed acyclic split/join region. In this topology, the split's selected branch set is exactly the set of join inputs that can still contribute to that occurrence. Remembering that set therefore implements the bounded normative result without claiming the general nonlocal reachability rule.

This is a vendor-neutral BPMN account. It reuses the implemented [Simple Boolean expression language](../SIMPLE-BOOLEAN-EXPRESSION-DECISION.md). No CIB Seven relationship, CIB expression meaning, or CIB evaluator algorithm is selected. The pinned CIB Inclusive Gateway tests remain probe seeds in [breadth research](../research/CIB-SEVEN-BPMN-BREADTH-RESEARCH.md#proto-mvp-ordering-after-receive-task), not compatibility evidence.

## Exact source profile

The admitted document contains exactly one self-contained `Definitions` and one private Process with explicit `isExecutable="true"`. The Process contains:

- one None Start Event;
- one Inclusive Gateway with explicit `gatewayDirection="Diverging"`, one incoming Sequence Flow, exactly two conditional outgoing Sequence Flows, and one distinct conditionless default Sequence Flow named by its `default` reference;
- three distinct User Tasks, one on each branch, each with exactly one incoming and one outgoing Sequence Flow;
- one Inclusive Gateway with explicit `gatewayDirection="Converging"`, exactly the three branch inputs, and one outgoing Sequence Flow;
- one None End Event; and
- no other Flow Node or executable definition.

`Definitions.expressionLanguage` is exactly `urn:bpmn-lean:expression:simple-boolean:v1`. Both conditional Flows contain one admitted BPMN `tFormalExpression`; neither has a per-expression language override. The default has no condition. The representative fixture uses `isPresent("takeA")` and `isPresent("takeB")`, but the profile admits any two independently valid Simple Boolean v1 bodies.

All nodes and Sequence Flows belong to the root definition scope. Every reference resolves, every branch runs directly from the split through its User Task to the join, and the graph is acyclic, reachable, and co-reachable. There is no alternate entry, exit, cross-branch Flow, nested scope, boundary Event, loop characteristic, or additional incoming Flow at either Gateway.

XML declaration order and Gateway incoming/outgoing reference order are non-semantic. Admission and lowering preserve each Sequence Flow identity while canonicalizing contract collections. Candidate evaluation order is immaterial because every expression is pure, total after admission, and evaluated against the same committed Process bindings.

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

The checked graph adds closed divergent and convergent Inclusive Gateway node variants. The divergent node retains exactly two candidate Flow IDs and one default Flow ID. The convergent node retains the paired divergent Gateway ID. Existing checked conditions and Sequence Flow origins remain unchanged.

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

`selectMany` is multi-output conditional selection plus creation of one expected-input set. `synchronizeSelected` consumes the expected subset for the matching owner and key. Neither operation contains an Inclusive Gateway mode flag or calls a topology-specific evaluator. Program admission requires the three candidate/default `expectedJoinInput` values to be distinct, to equal the `synchronizeSelected.inputs` set, and to share one nonempty selection key.

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

The collection is not a public BPMN object and is not projected into canonical state. It is derived only from an admitted `selectMany` firing, owned by one live scope occurrence, and removed only by the matching `synchronizeSelected` firing or existing owner-scope interruption. Expected inputs are stored in canonical Sequence Flow ID order, so source order and evaluator iteration order cannot affect equality or replay.

The default branch creates a singleton record. One true candidate creates a singleton record. Two true candidates create a two-input record. An empty record is impossible. The first profile's acyclicity makes `(owner, selectionKey)` a complete live occurrence identity; repeated activation would require a separately reviewed activation identity and is excluded.

Public stable observation remains unchanged. It exposes the resulting User Task waits, not the hidden split record or partial join tokens. Stable-state resumability continues to depend on the remaining public wait; a hidden selection record alone is never progress evidence.

## Separating witnesses and proof boundary

The answer-free scenario family uses one definition and three initial-binding cases:

| Case | Initial bindings | Stable state after start | Required completion behavior |
|---|---|---|---|
| one true | `takeA` present, `takeB` absent | only User Task A | completing A reaches Process completion; absent B/default inputs do not block |
| both true | `takeA` and `takeB` present | User Tasks A and B | completing either first leaves only the other wait; completion occurs only after both |
| none true | both absent | only the default User Task | completing the default reaches Process completion |

Both A-then-B and B-then-A are required and must end in the same canonical completed state. Reversing candidate declaration and reference order must preserve every canonical observation for the same bindings.

The two nearest wrong accounts are separately checked: waiting for every model input strands the one-true and default cases, while releasing on the first arrived selected input completes the both-true case too early. Erasing the stored expected set or replacing `selectMany` with first-true `choose` must make a seeded differential or Temporal bypass witness diverge at a stable canonical observation.

The Lean lane requires a declarative relation distinct from the evaluator, evaluator soundness for both new operations, a quantified selection-membership law under valid unique bindings, a join-readiness law over a nonempty expected subset, and an exact-consumption/removal law. Finite fixtures establish the three bounded traces and the two concrete non-laws; they do not establish general Inclusive Gateway completeness, arbitrary-graph reachability, liveness, or cross-implementation equivalence.

## Temporal hosting/refinement preflight

The finite profile needs no new host ingress, Timer, Signal, Activity, Child Workflow, effect, or cancellation mechanism. Process start installs the initial bindings, User Task completions use the existing content-bound Update path, and all Inclusive selection/join work remains pure semantic-core state inside the Workflow.

The state relation pairs the admitted immutable program and complete semantic runtime state—including hidden selected-branch records—with the Workflow's committed in-memory state. Query publishes only the existing canonical observation. No Workflow handler, `Promise` race, array order, or Event History order may decide which branches were selected or whether the join is ready.

The smallest refinement witness starts the both-true case, observes A and B, commits one completion, observes only the sibling, stops the Worker, starts a replacement Worker, commits the sibling completion, observes terminal state, and replays the disposable history. The one-true and default cases establish that unselected inputs do not block. Concurrent A/B submissions may commit in either semantic order but must reach the same terminal state. Duplicate and stale completions reuse the current result-ledger and state-preserving refusal contracts.

A bypass that drops one expected input or advances the join after the first selected completion must diverge from the canonical intermediate state. A candidate-selection mutation that replaces the complete true subset with one candidate must diverge immediately in `activeWaits` and `openUserTasks`.

## Evidence and layer ownership

| Rule | Normative/profile review | Lean | CIB Seven | Independent TypeScript | Temporal refinement | Negative or mutation guard |
|---|---|---|---|---|---|---|
| `IGW-EVALUATE-01` | Clauses 10.6.3 and 13.4.3 plus Simple Boolean v1 | quantified same-bindings/all-candidates law | deliberately absent | independent all-candidate evaluation | no host evaluation | first-true substitution changes both-true observation |
| `IGW-SELECT-01` / `IGW-DEFAULT-01` | Table 13.3 and required-default profile | relation/evaluator soundness and three traces | deliberately absent | exact subset/default traces | exact initial Query for all three cases | dropped branch and forced-default mutations |
| `IGW-TRACK-01` | bounded structured-profile specialization | creation/ownership invariant | deliberately absent | hidden record lifecycle | replay preserves committed selection | selected-set erasure mutation |
| `IGW-JOIN-READY-01` / `IGW-JOIN-CONSUME-01` | bounded consequence of Table 13.3 | readiness, consumption, removal, and two non-laws | deliberately absent | both orders and partial state | Worker replacement after first completion | all-input and first-arrival wrong accounts |

All six rules belong to the vendor-neutral BPMN/profile layer. CIB fixture prevalence only ordered the capsule and supplies no rule or evidence lane. No A12 source, identity, model shape, or adoption claim enters this proposal.

## Required, optional, and excluded surface

Required are the exact source profile, the two new generic operations, one hidden selected-set collection, unchanged canonical observation, the three scenario cases, both two-branch completion orders, Lean soundness and useful laws, independent TypeScript behavior, Temporal replacement/replay, and meaningful subset/join mutations.

Optional after this capsule is closed is a separately registered CIB Seven agreement probe over an exact project-owned fixture. It may claim only public branch/wait/completion facts that the probe observes and must not make CIB JUEL truth or its internal graph algorithm evidence for Simple Boolean semantics.

Excluded are general Table 13.3 graph analysis; arbitrary, unstructured, nested, mixed, or repeated Inclusive Gateways; Inclusive merge without its paired admitted split; more or fewer candidates; no-default exception; conditional default; expression languages beyond Simple Boolean v1; data writes; loops and Multi-Instance; scopes, boundary Events, compensation, or cancellation; Message/Timer/effect races; CIB compatibility; A12 adoption; BPMN conformance; and production history compatibility.

## Versioning and assurance boundary

This is a pre-release additive contract change but still replaces the one current checked-node, Semantic Process operation, runtime-state, decoder, schema, admission, and exhaustive-switch representations atomically. No optional mode bag, legacy reader, format counter, compatibility branch, Workflow patch, migration function, or retained Event History is permitted. Histories created by the gate are replayed and discarded in that gate.

The exact claim, if implemented and closed, is limited to all-true/default branching and occurrence-specific synchronization in the admitted one-region topology. The nearest unsupported claim is the general Inclusive Gateway reachability rule when tokens can approach a join through unstructured, nested, repeated, or externally entered paths.

The main common-mode risk is shared source/lowering structure: Lean, TypeScript, and Temporal can all agree on a wrongly paired split/join mapping. Independent Lean lowering, declaration-order permutation, exact checked-to-program equality, the one-true versus both-true versus default discriminator, and selected-set erasure mutations are therefore mandatory. Temporal remains a refinement of the TypeScript core, not another semantic authority.

Closure requires the epistemic review and commit-bounded cost record defined by the [capsule policy](README.md#required-capsule-structure). It must compare the measured increment with the Exclusive Gateway and Parallel Gateway capsules because this slice reuses one mechanism from each while adding occurrence-owned join state.

## Owner decision requested

After independent proposal review, approve or reject these choices together:

1. the exact structured two-condition-plus-default split, three User Task branches, paired join, and None End source profile;
2. the six `IGW-*` rules and selected-set specialization of the general Inclusive Gateway join requirement;
3. additive generic `selectMany` and `synchronizeSelected` operations plus one hidden owner-scoped selected-branch collection, without changing `choose`, `synchronize`, or public observation;
4. a standards-first Lean/TypeScript/Temporal target set with no CIB relationship or evidence lane in the first capsule; and
5. the exact exclusions and atomic pre-release replacement policy above.

Implementation may begin only after an external fresh-session proposal review is approved, any required corrections pass the same-thread audit, and explicit owner approval is recorded in this Status section.
