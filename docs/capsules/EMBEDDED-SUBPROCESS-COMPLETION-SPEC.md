# Ordinary embedded Sub-Process completion specification

## Status

**Implemented bounded specification; the semantic profile remains pre-release draft.**

This specification owns the first normal nested-execution-scope capsule: one ordinary embedded Sub-Process at one child level, two concurrent child User Tasks, normal child End Events, quiescent child-scope completion, and one outer User Task after the Sub-Process.

## Established product question

May the project implement the smallest reusable execution-scope foundation in which entering one ordinary embedded Sub-Process creates a child scope, two child User Tasks remain owned by it, completing only one branch cannot exit it, completing both branches removes the child occurrence and activates exactly one outer User Task, and Temporal preserves that lifecycle through Worker replacement and replay?

The implemented boundary includes only the source profile, semantic rules, atomic representation replacement, bounded CIB agreement evidence, and evidence boundary below. It does not include arbitrary nesting, Event Sub-Processes, boundary handling, Error propagation, multi-instance, Call Activity, transactions, compensation, child-local data, public scope-tree projection, or a multi-task dummy actor in the runnable MVP.

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

Registered agreement [`CIB-AGR-0007`](../CIB-BPMN-RELATION-REGISTER.md#cib-agr-0007--ordinary-embedded-sub-process-quiescent-completion) records bounded normative agreement with CIB Seven `2.2.0`. The project-authored fixture is executed through public runtime and task services in both child-completion orders; after the first completion only the sibling remains, after the second only `UserTask_AfterScope` remains, and completing it ends the Process. Content-bound retained evidence and a premature-exit mutation protect that observation.

The agreement does not make the pinned engine's internal scope representation authoritative and does not extend beyond the exact profile. The project-specific semantic occurrence identity and stale-command refusals remain operational mappings under `CIB-OP-0001`.

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
}>;

type CompleteScopeOperation = DeepReadonly<{
  kind: "completeScope";
  id: string;
  scopeId: string;
  parentOutput: string | null;
}>;
```

These are the implemented distinctions. Scope ownership for `reachNoneEnd` is supplied by the program's exact operation-ownership relation rather than duplicated on the operation itself.

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

All eight rules belong to the vendor-neutral BPMN layer. Registered agreement `CIB-AGR-0007` calibrates the same public lifecycle without becoming semantic authority.

## Commands and observations

The capsule adds no public stimulus kind. It reuses exact User Task completion for Child A, Child B, stale child attempts, and After Scope.

The four answer-free schedules divide the lifecycle at the existing rule that a scenario stops after its first rejected command:

1. start, observe Child A and Child B, complete Child A, observe only Child B, complete Child B, observe only After Scope, complete After Scope, and observe completion;
2. repeat with Child B before Child A and require the same canonical state after both child completions and the same final result;
3. complete Child A, then refuse a fresh stale Child A command while Child B remains active with exact state preservation;
4. complete Child A and Child B, then refuse a fresh stale Child A command after child-scope completion while After Scope remains active with exact state preservation.

Canonical Process status, variables, active waits, enabled interactions, command outcomes, and trace records retain their current shapes. Definition and runtime scope trees are internal evidence, not public observations. The public discriminator is the absence of After Scope after the first child End and its unique presence after the second.

## Lean account

Lean defines declarative operation steps for scope entry, None-End consumption, and scope completion separately from executable firing. General theorem `fire_sound` proves every evaluator-produced operation transition belongs to that relation, while `completeScopeState_refuses_nonquiescent` proves a uniquely identified live scope cannot complete when it still owns runtime work.

The capsule-specific checked consequences are:

- start creates one child occurrence alongside the root occurrence and exposes both child waits;
- one child End cannot emit the parent output while the sibling task remains active;
- the general nonquiescence theorem refuses child completion while owned runtime work remains;
- successful child completion removes the child occurrence and emits the root-owned parent continuation;
- A-then-B and B-then-A reach the same canonical post-child state;
- root completion cannot be triggered by a child None End;
- every reachable stable state in the admitted profile is terminal or exposes at least one User Task interaction.

The nearest plausible checked non-law is premature scope exit: reaching one child End does not imply that the child scope completes. A finite counterexample retains the sibling task and proves the parent output absent. A second negative witness shows that a child None End cannot complete the root Process.

No theorem claims arbitrary nesting, source-compiler correspondence, general graph liveness, fairness under concurrent callers, public scope-tree equivalence, or complete correspondence between Lean and TypeScript.

## Temporal hosting and refinement preflight

The durable ingress remains User Task Update. The capsule adds no Signal, Timer, Activity, Child Workflow, CancellationScope, Promise race, retry policy, payload router, external effect, or host callback.

The semantic core returns two passive child User Task waits. The existing host-capability predicate must classify that wait set as multiple same-kind passive interactions, not as a host-driven timer/effect ambiguity. Nested semantic ownership remains Workflow state interpreted by the pure core and must not be represented by a Temporal Child Workflow.

The refinement witness starts the Process, observes both child tasks, completes one, stops the Worker, starts a replacement, verifies the retained committed first result and remaining child task, completes the second, observes the outer task, completes it, fetches history, and replays it in the same disposable gate.

The bypass mutation fabricates After Scope while one child task remains or drops the sibling outside `applyStimulus`. Canonical trace comparison and the retained semantic Update result must reject that history even though the final Process could otherwise appear completable.

The state relation preserves admitted definition identity, semantic Process instance identity, root and child scope occurrences, exact User Task occurrences, token ownership, variables, Process status, command-result classification, and canonical trace. Temporal Workflow ID, Run ID, Update ID, replay task, and history Event identity remain host facts.

The history-shape assertion observes zero Signals, Timers, Activities, Child Workflows, and cancellation events. Worker replacement and replay are durability evidence, not BPMN semantics.

## Targeted preservation gate

The admission widening executes the selected reachable completion prefixes in both child-completion orders and establishes:

- every stable running state exposes at least one User Task interaction;
- no nonterminal quiescent state retains a token or active scope occurrence;
- internal closure never selects among multiple enabled operations by definition-list order;
- closure remains within the declared bound;
- both source-node and Sequence Flow declaration orders preserve enabled wait multisets and canonical results;
- completing one branch preserves the other branch's exact occurrence;
- child completion removes only child-owned runtime state and emits exactly one root-owned output;
- the adapter host-capability predicate accepts every reachable wait set independently of semantic admission.

The source gate separately permutes fork outputs, child declarations, and child Sequence Flow declarations together and requires identical lowered operations and ownership. The host-capability gate repeats its classification with reversed Semantic Process operation order. These are capsule-local executable preservation claims, not a universal theorem for every future nested topology.

## Runtime-only and synthetic constructs

The child scope occurrence is runtime-only. It is derived deterministically from admitted definition identity, parent occurrence, Sub-Process element identifier, and activation ordinal; it owns child tokens and waits; it is not publicly projected; and it is removed only by checked child completion in this capsule.

The root scope occurrence is runtime-only and owns the enclosing Process work. It exists from Process start through Process completion and is never confused with Temporal Workflow identity.

Control-place identifiers and operation identifiers remain compiler-synthetic, definition-owned, deterministic, and absent from public BPMN observations. No expected answer, scenario command, CIB runtime identifier, or Temporal identifier participates in their derivation.

## Evidence matrix

| Rule | BPMN/profile | Lean relation/law | CIB | TypeScript | Temporal | Negative/mutation |
|---|---|---|---|---|---|---|
| `SUBPROC-ENTER-01` | Clause 13.3.4 and exact source profile | `OperationStep.enterScope`, `fire_sound`, and `start_enters_one_child_scope_and_opens_both_tasks` | `CIB-AGR-0007` initial public tasks | Scoped lowering and runtime entry tests | Start trace in the four-target pipeline and restart witness | Event Sub-Process and cross-scope-flow rejection |
| `SUBPROC-WAIT-01` | Exact child topology and generic scoped graph | Concrete two-wait observation plus operation soundness | Both public child tasks in all four retained artifacts | Source declaration permutation and runtime prefix gates | Two passive User Task Updates with zero host-driven history | Premature outer-task mutation |
| `SUBPROC-END-01` | None End consumption | `first_child_end_does_not_complete_scope` | First completion leaves exactly the sibling | First-completion discriminator in both orders | First committed Update survives Worker replacement | Scope-bypass Workflow fabricates the outer task and differs canonically |
| `SUBPROC-QUIESCE-01` | Clause 13.3.4 | `completeScopeState_refuses_nonquiescent` and both-order observation theorem | Second completion exposes exactly the outer task | Both orders reach one equal parent state | Replacement, second Update, replay, and passive-history assertion | Stranded child token cannot complete or resume |
| `SUBPROC-OBSERVE-01` | Selected public boundary | Exact child, sibling, parent, and completed observations | Content-bound public task queries | Four answer-free scenarios through the differential pipeline | Query trace and Update evidence | Retained CIB and differential early-exit mutations |
| `SUBPROC-REFUSE-01` | Exact occurrence policy | `stale_child_completion_preserves_state` | Two retained project-mapped stale refusals | Stale state-preservation test and scenario agreement | Live Workflow stale results agree in the pipeline | Removing the live sibling fails evidence projection |
| `SUBPROC-COMPLETE-01` | Root None End | `outer_task_completes_root_scope` | Completing the outer task ends the Process | Root scope empties exactly once | Three Updates complete before Workflow completion; replay passes | Child End cannot complete the root in the checked witness |
| `SUBPROC-ADMIT-01` | Exact source profile | Checked decoder/profile binding and graph validation | Exact fixture deployment only | Generic scope validation, profile multiset, and negative source variants | Host capability admits original and reversed operation orders | Event scope, scope crossing, profile drift, and definition mutation reject |

Shared fixture construction, common canonical projection, and correlated CIB source precedent remain common-mode risks. Neutral scenario inputs contain no expected answer; Lean and TypeScript are implemented separately; retained CIB evidence uses public services and a separately owned projector; and the Temporal scope-bypass mutation proves canonical agreement rejects a hosted result fabricated outside the semantic core.

## Versioning consequences

This capsule is a pre-release breaking replacement of internal definition and runtime contracts. The same change atomically replaces checked-source scope containment and schema validation; source normalization and lowering; Semantic Process definition schemas and TypeScript/Lean decoders; operation and control-place scope ownership; root-specific None-End handling; runtime state, token, and wait ownership; executable closure; declarative Lean relations and laws; affected exhaustive switches and contract guards; profile validation; target scenarios and retained expected results; differential projection; CIB public-service fixtures; Temporal serialization, host-capability checks, trace comparison, bypass mutation, replay tests, and Workflow inputs containing the executable definition; and the owning specifications and status documents.

The public Process observation, User Task occurrence, stimuli, command result, runnable-MVP configuration, and CIB fidelity table remain unchanged.

No compatibility reader, migration path, Workflow patch marker, or retained old history is added under the current pre-release policy.

## Implemented and excluded work

Implemented work is the vendor-neutral source, definition, runtime, Lean, TypeScript, targeted-preservation, differential, and Temporal-refinement closure for the exact profile plus the selected CIB Seven `2.2.0` normative-agreement lane.

Excluded work is every feature named in the established product-question boundary, plus UI, forms, task list, human identity, assignment, authorization, multi-task dummy-actor scheduling, Collaboration, Choreography, A12 source reuse, and any CIB internal PVM algorithm in the semantic core.

## Acceptance and stop conditions

The capsule is closed because every rule has its required evidence lane, the nearest non-law is executable, the targeted preservation and host-capability gates cover the selected reachable wait sets, both completion orders and declaration permutations agree, the Temporal history proves semantic-core passage and replay, and source and admission claims remain exact.

Stop and return to owner review if normal child completion requires a public scope tree, if the exact profile cannot avoid repeated occurrence identity, if the host needs Child Workflows or cancellation to preserve the public result, if CIB differs at the selected public boundary, if quiescence cannot be checked without topology-specific runtime code, or if the representation adds a generic construct without a second current consumer.

The exact implementation boundary is `5b34977..a59f8a3`. Hand-written code adds 5,266 and removes 1,698 nonblank lines, while documentation adds 283 and removes 158. The maintained comparison belongs in the [capsule cost ledger](../CAPSULE-COST-LEDGER.md).

## Re-open conditions

Re-open the semantic boundary for arbitrary nesting, multiple concurrent occurrences, loops or multi-instance, child-local variables and mappings, implicit child completion without explicit End Events, Terminate End, boundary Events, Error or escalation propagation, Event Sub-Processes, Call Activities, transactions, compensation, public scope-tree observation, or multi-caller fairness.
