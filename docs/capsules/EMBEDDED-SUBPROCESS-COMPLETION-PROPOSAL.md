# Ordinary embedded Sub-Process completion proposal

## Status

**Selected bounded proposal; implementation is not authorized until owner approval.**

This proposal is the first normal nested-execution-scope capsule. It selects one ordinary embedded Sub-Process at one child level, with two concurrent child User Tasks, normal child End Events, quiescent child-scope completion, and one outer User Task after the Sub-Process.

## Owner question

May the project implement the smallest reusable execution-scope foundation in which entering one ordinary embedded Sub-Process creates a child scope, two child User Tasks remain owned by it, completing only one branch cannot exit it, completing both branches removes the child occurrence and activates exactly one outer User Task, and Temporal preserves that lifecycle through Worker replacement and replay?

Approval authorizes only the source profile, semantic rules, atomic representation replacement, optional bounded CIB agreement evidence, and evidence boundary below. It does not authorize arbitrary nesting, Event Sub-Processes, boundary handling, Error propagation, multi-instance, Call Activity, transactions, compensation, child-local data, public scope-tree projection, or a multi-task dummy actor in the runnable MVP.

## Product claim

In product terms, the capsule establishes:

> Can the engine enter a modeled embedded work region, keep all unfinished work inside that region, leave it only after every child path has ended, and then continue the enclosing Process exactly once?

The closest unsupported claim is exceptional exit from that region through a modeled boundary handler. The retained [Error-propagation proposal](SUBPROCESS-ERROR-PROPAGATION-PROPOSAL.md) owns that later extension.

The known eventual consumers are the BPMN Process Execution Conformance roadmap, CIB Seven breadth compatibility, Event Sub-Process and multi-instance foundations, and later A12 adoption. No unchanged A12 model is claimed here.

## Why this is next

The [CIB Seven breadth inventory](../research/CIB-SEVEN-BPMN-BREADTH-RESEARCH.md) finds ordinary embedded Sub-Processes in 265 of 1,144 pinned core BPMN fixture files. CIB's own basic public-service test observes entry, child task activation, child-scope destruction, and Process completion.

Normal completion must precede Error propagation because both require the same definition-scope, runtime-occurrence, and ownership foundation. An error-only representation with no normal output would force a second breaking replacement as soon as ordinary completion is added.

One sequential child task is insufficient: completing it cannot distinguish correct quiescent completion from an implementation that exits on the first child End Event. Two parallel child branches without an inner join force the semantic core to retain the child occurrence after the first End and to complete it only after the second.

## Normative basis

BPMN 2.0.2 Clause 10.3.5 defines an embedded Sub-Process as an Activity containing Flow Elements and as a contextual scope for visibility, events, exception handling, and compensation.

Clause 13.3.4 states that a Sub-Process is instantiated when reached by a Sequence Flow token and that its contained elements behave as in a normal Process. A Sub-Process instance completes only when no token remains inside it and none of its Activities remains active; completion then continues through the Sub-Process's outgoing Sequence Flow.

The None Start Event supplies the child entry, Parallel Gateway divergence offers one token on each outgoing Sequence Flow, User Tasks wait for completion, and None End Events consume their arriving token without a result. The root None End Event completes the Process only after the enclosing flow reaches it.

## CIB Seven classification

No CIB relationship identifier is selected yet. The pinned `SubProcessTest#testSimpleSubProcess` is an exact candidate normative-agreement precedent, but it is source-test evidence rather than a retained project observation and it does not exercise the two-child quiescence discriminator.

If owner approval includes CIB breadth evidence, implementation must add a reviewed normative-agreement entry to the [CIB–BPMN relationship register](../CIB-BPMN-RELATION-REGISTER.md) in the same change that first names it from a profile. The project must then use a project-authored fixture, public CIB services, both child-completion orders, content-bound retained evidence, and an independently perturbed premature-exit mutation. Until then, the capsule makes only a vendor-neutral BPMN claim.

## Selected source profile

The project-authored MIT fixture has this topology:

```text
outer None Start Event
  -> ordinary embedded Sub-Process
       inner None Start Event
         -> Parallel Gateway fork
              -> User Task Child A -> child None End A
              -> User Task Child B -> child None End B
  -> outer User Task After Scope
  -> outer None End Event
```

The document contains exactly one executable private Process, one ordinary embedded Sub-Process whose `triggeredByEvent` is absent or false, one outer and one inner None Start Event, one diverging Parallel Gateway, two child User Tasks with distinct document-unique identifiers, two child None End Events, one outer User Task, one outer None End Event, and the exact Sequence Flows shown above.

The profile rejects a Sub-Process without one normal outgoing Sequence Flow, Event Sub-Processes, more than one Sub-Process, nesting below the selected child, boundary Events, Error or other EventDefinitions, child joins, additional starts, implicit or absent child Ends, Terminate End Events, data, variables, expressions, extension elements, parser warnings, Call Activities, transactions, compensation, loops, multi-instance, ad-hoc behavior, conditional flow, and repeated element identifiers.

## Admission account

Admission extends the implemented profile-parameterized gate. It must not add a named whole-topology predicate or another production disjunct.

The profile capability owns the exact source-node and Semantic Process operation multisets and a maximum definition-scope depth of one child below the root. Generic scoped-graph validation owns distinct identity, legal containment, same-scope Sequence Flow endpoints, exact scope references, source entry, reachability, co-reachability, acyclicity, producer/consumer discipline, and the parent input/output relation of the embedded Sub-Process.

The profile requires both child branches to be structurally capable of reaching their own None End Event. That fact is not sufficient for runtime progress; the capsule-local preservation gate separately enumerates reachable stable states and rejects any nonterminal quiescent state with retained runtime ownership.

Declaration order is not semantics. Source, Lean, and TypeScript checks cover both declarations of the fork outputs, both child-node orders, and both together. They also cover Child A then Child B and Child B then Child A command schedules.

## Checked source and Semantic Process definition

The checked graph adds explicit definition containment. Each Flow Node and Sequence Flow belongs to either the root definition scope or the child definition scope. The embedded Sub-Process node belongs to the root and references the child definition; contained nodes do not become root siblings during normalization.

The Semantic Process definition adds the minimum reusable distinctions forced by normal nested completion:

```ts
type DefinitionScope = DeepReadonly<{
  id: string;
  parentScopeId: string | null;
  originElementId: string;
}>;

type EnterScopeOperation = DeepReadonly<{
  kind: "enterScope";
  id: string;
  input: string;
  childEntry: string;
  childScopeId: string;
}>;

type ReachNoneEndOperation = DeepReadonly<{
  kind: "reachNoneEnd";
  id: string;
  input: string;
  scopeId: string;
}>;

type CompleteScopeOperation = DeepReadonly<{
  kind: "completeScope";
  id: string;
  scopeId: string;
  parentOutput: string | null;
}>;
```

These are contract sketches, not permission to copy unchecked names or shapes. Exact fields may change before approval only if the semantic distinctions remain explicit and the proposal is amended before implementation.

Every control place and operation belongs to one definition scope. `enterScope` consumes the root token, creates one child occurrence, and marks the child entry. `reachNoneEnd` consumes one token in its owning scope; it does not complete a scope merely because one branch reached an End. `completeScope` is enabled only when the selected active scope occurrence owns no token, User Task occurrence, wait, or other runtime work. Child completion removes that occurrence and emits exactly one parent output; root completion sets Process status to completed and has no parent output.

Replacing the root-specific interpretation of None End with scope-aware end consumption is required by the first child graph with two independently ending paths. `completeScope` is required by both root and child completion and is not a fixture-topology selector. No dormant generic Event, catcher, or cancellation union is added.

## Runtime state, identity, and ownership

Runtime state contains one root scope occurrence and, while the Sub-Process is active, one child scope occurrence derived from the semantic Process instance, Sub-Process element identifier, and activation ordinal. Every token and User Task occurrence records its owning scope occurrence internally.

The child occurrence owns Child A, Child B, all child tokens, and all internal closure state below it. After both child Ends consume their tokens, child completion removes that occurrence and creates only the parent output token. The outer User Task belongs to the root occurrence.

Activity-local variable scopes remain distinct from execution-scope occurrences. This capsule adds no child-local variable binding, input/output mapping, or public nested data projection.

Public User Task occurrence identity remains unchanged because the profile admits one occurrence of one Sub-Process and document-unique User Task elements. Repeated or concurrent activation of the same child element, loops, multi-instance, and arbitrary nesting reopen the public identity contract.

## Stable semantic rules

- `SUBPROC-ENTER-01` — consuming the root token at the admitted embedded Sub-Process creates exactly one child scope occurrence and exactly one child-entry token owned by it.
- `SUBPROC-WAIT-01` — child closure exposes exactly Child A and Child B as active User Task occurrences owned by the child scope, independent of declaration order.
- `SUBPROC-END-01` — completing one child task and reaching its None End consumes only that branch's token; it neither completes the child scope nor emits the parent output while sibling work remains.
- `SUBPROC-QUIESCE-01` — an active child scope completes exactly when it owns no token, active wait, User Task occurrence, or other runtime work; completion removes the occurrence and emits exactly one parent output.
- `SUBPROC-OBSERVE-01` — after only one child completion the sibling is the sole active interaction and the outer task is absent; after both completions the child interactions are absent and After Scope is the sole active interaction.
- `SUBPROC-REFUSE-01` — a fresh command for a completed child occurrence is rejected with exact committed-state preservation, both before and after child-scope completion.
- `SUBPROC-COMPLETE-01` — completing After Scope reaches the root None End, quiescently completes the root scope, and completes the Process exactly once.
- `SUBPROC-ADMIT-01` — invalid containment, scope crossing, absent child End, extra child runtime mechanisms, repeated identifiers, or a profile-multiset mismatch is rejected before Workflow start.

All eight rules belong to the vendor-neutral BPMN layer. A later registered CIB agreement may calibrate the same public lifecycle without becoming semantic authority.

## Commands and observations

The capsule adds no public stimulus kind. It reuses exact User Task completion for Child A, Child B, stale child attempts, and After Scope.

The primary answer-free schedules are:

1. start, observe Child A and Child B, complete Child A, observe only Child B, refuse a fresh stale Child A command with state preservation, complete Child B, observe only After Scope, refuse a fresh stale Child B command with state preservation, complete After Scope, and observe completion;
2. repeat with Child B before Child A and require the same canonical state after both child completions and the same final result.

Canonical Process status, variables, active waits, enabled interactions, command outcomes, and trace records retain their current shapes. Definition and runtime scope trees are internal evidence, not public observations. The public discriminator is the absence of After Scope after the first child End and its unique presence after the second.

## Lean account

Lean adds declarative scope-entry, None-End consumption, and scope-completion relations distinct from executable closure. Every evaluator-produced transition in those families has a soundness theorem with exact definition-scope, runtime-ownership, and quiescence hypotheses.

The useful laws are:

- entry creates one fresh child occurrence and preserves unrelated root-owned state;
- one child End cannot emit the parent output while the sibling task remains active;
- child completion is enabled exactly under the admitted no-owned-runtime-work predicate;
- child completion removes all and only the completed occurrence and emits one root-owned output;
- A-then-B and B-then-A reach the same canonical post-child state;
- root completion cannot be triggered by a child None End;
- every reachable stable state in the admitted profile is terminal or exposes at least one User Task interaction.

The nearest plausible checked non-law is premature scope exit: reaching one child End does not imply that the child scope completes. A finite counterexample retains the sibling task and proves the parent output absent. A second negative witness shows that a child None End cannot complete the root Process.

No theorem claims arbitrary nesting, source-compiler correspondence, general graph liveness, fairness under concurrent callers, public scope-tree equivalence, or complete correspondence between Lean and TypeScript.

## Temporal hosting and refinement preflight

The durable ingress remains User Task Update. The capsule adds no Signal, Timer, Activity, Child Workflow, CancellationScope, Promise race, retry policy, payload router, external effect, or host callback.

The semantic core returns two passive child User Task waits. The existing host-capability predicate must classify that wait set as multiple same-kind passive interactions, not as a host-driven timer/effect ambiguity. Nested semantic ownership remains Workflow state interpreted by the pure core and must not be represented by a Temporal Child Workflow.

The smallest refinement witness starts the Process, observes both child tasks, completes one, loses the Worker, starts a replacement, verifies the committed first result and remaining child task, completes the second, observes the outer task, completes it, fetches history, and replays it in the same disposable gate.

The bypass mutation fabricates After Scope while one child task remains or drops the sibling outside `applyStimulus`. Canonical trace comparison and the retained semantic Update result must reject that history even though the final Process could otherwise appear completable.

The state relation preserves admitted definition identity, semantic Process instance identity, root and child scope occurrences, exact User Task occurrences, token ownership, variables, Process status, command-result classification, and canonical trace. Temporal Workflow ID, Run ID, Update ID, replay task, and history Event identity remain host facts.

The history-shape assertion requires zero Signals, Timers, Activities, Child Workflows, and cancellation events. Worker replacement and replay are durability evidence, not BPMN semantics.

## Targeted preservation gate

The admission widening must execute all reachable command prefixes of both child-completion orders for the finite selected profile and establish:

- every stable running state exposes at least one User Task interaction;
- no nonterminal quiescent state retains a token or active scope occurrence;
- internal closure never selects among multiple enabled operations by definition-list order;
- closure remains within the declared bound;
- both source-node and Sequence Flow declaration orders preserve enabled wait multisets and canonical results;
- completing one branch preserves the other branch's exact occurrence;
- child completion removes only child-owned runtime state and emits exactly one root-owned output;
- the adapter host-capability predicate accepts every reachable wait set independently of semantic admission.

These are capsule-local executable preservation claims, not a universal theorem for every future nested topology.

## Runtime-only and synthetic constructs

The child scope occurrence is runtime-only. It is derived deterministically from admitted definition identity, parent occurrence, Sub-Process element identifier, and activation ordinal; it owns child tokens and waits; it is not publicly projected; and it is removed only by checked child completion in this capsule.

The root scope occurrence is runtime-only and owns the enclosing Process work. It exists from Process start through Process completion and is never confused with Temporal Workflow identity.

Control-place identifiers and operation identifiers remain compiler-synthetic, definition-owned, deterministic, and absent from public BPMN observations. No expected answer, scenario command, CIB runtime identifier, or Temporal identifier participates in their derivation.

## Evidence matrix

| Rule | BPMN/profile | Lean relation/law | CIB | TypeScript | Temporal | Negative/mutation |
|---|---|---|---|---|---|---|
| `SUBPROC-ENTER-01` | Clause 13.3.4 and exact source profile | entry relation and fresh-child law | optional registered agreement | independent entry and ownership tests | start trace and replay | flattening mutation |
| `SUBPROC-WAIT-01` | child topology | fork/wait and permutation laws | both waits through public tasks if selected | both declaration orders | two passive Updates | wait-drop mutation |
| `SUBPROC-END-01` | None End semantics | premature-exit non-law | first completion leaves sibling if selected | first-completion discriminator | committed first Update survives restart | early-output mutation |
| `SUBPROC-QUIESCE-01` | Sub-Process completion clause | exact quiescence and ownership laws | second completion exits if selected | both orders reach one outer output | replacement, second Update, replay | one-End completion mutation |
| `SUBPROC-OBSERVE-01` | selected public boundary | canonical-state examples | public task set if selected | answer-free scenarios | trace projection | fabricated outer wait |
| `SUBPROC-REFUSE-01` | exact occurrence policy | state-preservation example | project operational detail only | stale-child refusals | retained Update results | stale acceptance mutation |
| `SUBPROC-COMPLETE-01` | root None End | root/child distinction law | Process completion if selected | exactly-once completion | final result and replay | child-End root-termination mutation |
| `SUBPROC-ADMIT-01` | exact source profile | decoder/profile rejection | deployment quadrant only if selected | source and semantic admission tests | zero connection on rejection | admission-bypass mutation |

Shared fixture construction, common canonical projection, and correlated CIB source precedent remain common-mode risks. Neutral scenario inputs contain no expected answer; Lean and TypeScript are implemented separately; retained CIB evidence, if selected, uses public services and a separately owned projector; and Temporal bypass mutations prove that the hosted result passed through the semantic core.

## Versioning consequences

This is a pre-release breaking replacement of internal definition and runtime contracts. Implementation must atomically replace checked-source scope containment and schema validation; source normalization and lowering; Semantic Process definition schemas and TypeScript/Lean/Java decoders; operation and control-place scope ownership; root-specific None-End handling; runtime state, token, and wait ownership; executable closure; declarative Lean relations and laws; all exhaustive switches and ten-field or nested-fidelity guards affected by the new shapes; profile validators; target scenarios and retained expected results; differential projection; CIB Java fixture/projector code if the agreement lane is selected; Temporal serialization, host-capability checks, trace comparison, bypass mutation, replay tests, and Workflow inputs containing the executable definition; the Semantic Process IL specification; the production lifecycle specification if its state relation needs clarification; the implementation map; testing guide; and plan.

The public Process observation, User Task occurrence, stimuli, command result, runnable-MVP configuration, and CIB fidelity table remain unchanged. If implementation discovers that any of those must widen, it stops and returns the new product decision to the owner instead of silently broadening this approval.

No compatibility reader, migration path, Workflow patch marker, or retained old history is added under the current pre-release policy.

## Required, optional, and excluded work

Required work is the vendor-neutral source, definition, runtime, Lean, TypeScript, targeted-preservation, differential, and Temporal-refinement closure for the exact profile.

Optional work, selected only if owner approval says yes, is a CIB Seven `2.2.0` normative-agreement lane with a newly registered relationship, public-service projection, both completion orders, retained content-bound evidence, and a meaningful early-exit mutation.

Excluded work is every feature named in the owner-question exclusion, plus UI, forms, task list, human identity, assignment, authorization, multi-task dummy-actor scheduling, Collaboration, Choreography, A12 source reuse, and any CIB internal PVM algorithm in the semantic core.

## Acceptance and stop conditions

The capsule closes only when every rule has its required evidence lane, the nearest non-law is executable, the targeted preservation and host-capability gates cover all reachable selected wait sets, both completion orders and declaration permutations agree, the Temporal history proves semantic-core passage and replay, source and admission claims remain exact, and the implementation map states the nearest unsupported claim.

Stop and return to owner review if normal child completion requires a public scope tree, if the exact profile cannot avoid repeated occurrence identity, if the host needs Child Workflows or cancellation to preserve the public result, if CIB differs at the selected public boundary, if quiescence cannot be checked without topology-specific runtime code, or if the representation adds a generic construct without a second current consumer.

Before graduation, record nonblank code and document deltas from an exact baseline and compare them with the previous scope-changing capsule. If the cost is not lower, remove one concrete process or harness duplication before choosing the next breadth capsule.

## Re-open conditions

Re-open the semantic boundary for arbitrary nesting, multiple concurrent occurrences, loops or multi-instance, child-local variables and mappings, implicit child completion without explicit End Events, Terminate End, boundary Events, Error or escalation propagation, Event Sub-Processes, Call Activities, transactions, compensation, public scope-tree observation, or multi-caller fairness.
