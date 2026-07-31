# Embedded Sub-Process Error propagation specification

## Status

**Implemented evidence-closed draft contract.**

This is the first exceptional-exit follow-on after the implemented [ordinary embedded Sub-Process completion specification](EMBEDDED-SUBPROCESS-COMPLETION-SPEC.md). It selects one normal embedded Sub-Process whose only reachable child result is an exact-code Error End Event caught by one interrupting boundary Error Event attached to that Sub-Process. It establishes regional cancellation and direct-parent Error propagation by reusing the current definition-scope, runtime-occurrence, ownership, normal-completion, and passive Temporal foundations; it does not establish Event Sub-Process behavior.

`DefinitionScope`, `enterScope`, `reachNoneEnd`, `completeScope`, operation/control-place ownership, scope occurrences, scope-owned tokens and waits, quiescent normal completion, and multiple passive User Task hosting remain implemented prerequisites rather than Error-specific mechanisms.

## Product boundary

This specification owns the smallest standards-only nested-scope discriminator in which completing one child User Task reaches an Error End Event, propagation selects the exact matching boundary Error on the directly enclosing embedded Sub-Process, interruption removes a still-active sibling User Task and every other runtime owner inside that scope occurrence, and only an outer recovery User Task remains observable.

The contract includes only the source profile, semantic rules, additive Error definition boundary, atomic pre-release replacement, and evidence boundary below. It does not widen the implemented ordinary-completion profile and does not authorize A12 unchanged-model adoption, arbitrary nesting, or Event Sub-Processes.

The selected CIB Seven `2.2.0` public-lifecycle lane agrees in both command orders and is classified as `CIB-AGR-0008`. Three answer-free schedules and their content-bound retained evidence join the capsule only at the unchanged public boundary; the stale schedule's host-task refusal mapping is separately classified by `CIB-OP-0001`, and CIB does not define vendor-neutral meaning.

## Product claim

In product terms, the capsule establishes:

> When one running embedded work region ends with a modeled BPMN Error, can the engine route that Error to the exact handler on the directly enclosing region, discard unfinished work owned by that region, continue at one outer recovery task, and preserve the same result durably through Temporal replay?

The closest unsupported claim is Error-handler search beyond one exact matching boundary attached to the directly enclosing Sub-Process. Catch-all matching, more than one candidate handler, propagation across another enclosing scope, and unresolved Error behavior remain unselected.

The known eventual consumers are the Process Execution Conformance roadmap and the later A12 adoption lane. The A12 corpus contains Error End Events, but no unchanged A12 model is claimed by this source profile and the corpus has not established a Sub-Process denominator.

## Why this is the first exceptional follow-on

The existing boundary-error capsule proves a matching Error result attached directly to a Task in one flat Process. It explicitly excludes Error End Events, nested propagation, and general cancellation. Ordinary child entry, ownership, and quiescent completion are now implemented. This discriminator therefore adds only the missing exceptional distinctions: one modeled Error throw, direct-parent catcher selection, and cancellation by runtime ownership.

A single sequential child would not separate scope interruption from ordinary token replacement. The second live child User Task is required because its disappearance at the public observation boundary proves regional cancellation. An outer recovery User Task is required because it keeps the Process live long enough for a fresh stale-child command to establish state-preserving refusal.

An Event Sub-Process is not included. Boundary handlers execute outside the attached Sub-Process, while Event Sub-Processes execute in the enclosing context and have a distinct activation and lifetime account. Combining both handler loci would prevent this capsule from identifying which scope relation or cancellation rule caused a failure.

## Normative basis

BPMN 2.0.2 Clause 10.3.5 defines an embedded Sub-Process as an Activity containing Flow Elements and as a contextual scope for visibility, events, exception handling, and compensation.

Clause 13.3.4 states that a Sub-Process is instantiated when reached by a Sequence Flow token and that its elements then behave as in a normal Process. It also states that a Sub-Process instance normally completes only when no token remains inside it and none of its Activities remains active. The implemented scope foundation owns both rules. This capsule preserves that account while proving that the selected Error path interrupts the child occurrence before its structurally present normal continuation can become reachable.

Clause 10.5.1 states that a propagated trigger is forwarded from its throw location to the innermost enclosing scope instance with an attached Event able to catch it. Error triggers are critical and suspend execution at the throw location. If no catching Event exists, the Error is unresolved.

The Error Event Definition rule requires an Error End Event in an executable Process to supply an error code. A boundary Error with a code catches only a matching Error, while a boundary Error without a code catches any Error.

Clause 10.5 event handling states that an interrupting boundary Event terminates the associated Activity and produces a token on its exception flow. Its Error-handler account says that a boundary Error continues through its outgoing Sequence Flow and that the parent Activity is canceled when that flow is followed.

Clause 13.5.3 states that boundary handling consumes the Event, cancels the attached Activity when `cancelActivity` is set, and follows the boundary Sequence Flow. Error Events cannot be non-interrupting.

Official OMG issues [BPMN21-211](https://issues.omg.org/issues/BPMN21-211), [BPMN21-227](https://issues.omg.org/issues/BPMN21-227), and [BPMN21-436](https://issues.omg.org/issues/BPMN21-436) remain reasons not to generalize Error consistency, `cancelActivity` wording, or catcher scope. They do not change the selected direct-parent, exact-code, single-handler proposition.

## Selected source profile

The project-authored MIT fixture has this semantic topology:

```text
outer None Start Event
  -> embedded Sub-Process
       inner None Start Event
         -> Parallel Gateway fork
              -> User Task Trigger Error -> Error End Event ScopedFailure
              -> User Task Sibling Work -> inner None End Event
     normal outgoing Sequence Flow -> outer None End Event Normal
     boundary Error ScopedFailure
       -> outer User Task Recover
       -> outer None End Event Recovered
```

The embedded Sub-Process retains one normal outgoing Sequence Flow so the current `completeScope` contract and generic source graph remain unchanged. Its Trigger Error branch always reaches the Error End Event; its Sibling Work branch may finish first but cannot make the child scope quiescent while Trigger Error remains active. The normal outer End is therefore a checked negative path: every complete admitted command schedule takes the Error boundary route and never reaches it.

The document contains exactly:

- one executable private Process;
- one normal embedded Sub-Process with `triggeredByEvent` absent or false;
- one outer and one inner None Start Event;
- one Parallel Gateway with one incoming and two outgoing Sequence Flows;
- two child User Tasks with distinct element identifiers;
- one child None End Event;
- one Error End Event containing one ErrorEventDefinition;
- one interrupting boundary Error Event attached to the embedded Sub-Process and containing one ErrorEventDefinition;
- one outer recovery User Task, one recovered outer None End Event, and one distinct normal outer None End Event;
- one root Error with exact nonempty code `ScopedFailure` referenced by both ErrorEventDefinitions;
- the exact Sequence Flows shown above;
- no data, variables, expressions, payload, extension elements, parser warnings, or additional root element.

The profile rejects an absent normal Sub-Process output, catch-all Error boundaries, nonmatching Error references or codes, more than one handler, more than one Sub-Process, nested Sub-Processes, non-interrupting Error notation, a boundary attached to any element other than the selected Sub-Process, Event Sub-Processes, Call Activities, transactions, compensation, loops, multi-instance, ad-hoc behavior, conditional flow, and every non-Error EventDefinition.

## Admission account

Admission extends the profile-parameterized gate without a named whole-topology predicate or another production disjunct.

The profile capability owns exact source-node and Semantic Process operation multisets plus the already implemented maximum definition-scope depth of one child below the Process scope. Reusable scoped-graph validation continues to own distinct identities, legal source containment, same-scope Sequence Flow ownership, exact reference resolution, acyclicity, producer/consumer discipline, and the implemented parent input/output relation of the embedded Sub-Process. Its generic node-kind-driven progress account widens in both TypeScript and Lean: the per-scope exit class becomes None End Event or Error End Event, and a boundary Error receives one parent-local exceptional reachability edge from its attached Sub-Process node. The Error End has one incoming and no outgoing Sequence Flow; the boundary Error has no incoming and one outgoing Sequence Flow. Checked-node identity and arity switches add both explicit kinds.

The validator treats normal Sequence Flow and Error propagation as different edge kinds. The parent-local attachment edge exists only for checked reachability/co-reachability and never becomes an ordinary Sequence Flow or crosses definition scopes. The child Error End counts as a child scope exit, while the boundary handler remains a parent-scope node. The existing `normalizedFlowSource` special case remains scoped to the inline Service Task `CheckedBpmnErrorRoute`; the new explicit boundary node's exceptional edge is constructed separately.

Declaration order is not semantics. One focused source mutation simultaneously reorders the inherited fork outputs, child User Tasks, child Sequence Flows, and outer Sequence Flow references plus the new Error End among child Flow Elements, boundary Error among parent Flow Elements, two outer None End Events, and root Error among root elements. That combined representative produces the same checked nodes and lowered program. The separate finite Lean and TypeScript schedule checks preserve the enabled wait multiset and Trigger Error result under their selected program operation orders; no test or theorem exhausts all source-declaration permutations.

The capsule-local preservation gate executes Trigger-first and Sibling-first schedules and establishes that every reachable stable state under the selected profile is terminal or has at least one explicit User Task resumption surface; no reachable stable running state retains a token or active scope without an interaction. It also establishes that closure never chooses between multiple enabled internal operations by program list order and that the child's existing `completeScope` operation never competes with or precedes the enabled Error throw.

## Checked source and Semantic Process definition

The current checked graph already owns explicit definition containment: the embedded Sub-Process node belongs to the root and names its child scope, while child nodes and Sequence Flows belong to that child. This capsule adds explicit Error End and boundary Error node variants. The Error End belongs to the child; the boundary Error belongs to the parent, names the attached Sub-Process node, and retains its exact ErrorEventDefinition, root Error, code, and outgoing Sequence Flow. Neither attachment nor containment may be inferred from element-name conventions.

The current Semantic Process definition already owns `DefinitionScope`, `enterScope`, `reachNoneEnd`, `completeScope`, and exact operation/control-place scope maps. This capsule adds only the following semantic distinctions:

```ts
type ErrorReference = DeepReadonly<{
  errorDefinitionId: string;
  errorElementId: string;
  code: string;
}>;

type ThrowErrorOperation = DeepReadonly<{
  kind: "throwError";
  id: string;
  input: string;
  error: ErrorReference;
  handler: InterruptingErrorHandler;
  origin: {
    kind: "bpmnElement";
    elementId: string;
  };
}>;

type InterruptingErrorHandler = DeepReadonly<{
  attachedScopeId: string;
  code: string;
  output: string;
  origin: {
    kind: "bpmnElement";
    boundaryEventId: string;
    errorDefinitionId: string;
    errorElementId: string;
    sequenceFlowId: string;
  };
}>;
```

`ErrorReference` is a named concept with two concrete consumers: the checked Error End node and `throwError`. The checked boundary node retains the same Error identity plus attachment and output facts; lowering produces one `InterruptingErrorHandler`. This does not widen the existing Service Task `BpmnErrorRoute`, whose Activity-result and mapping lifecycle remains a separate flat-Activity mechanism.

`throwError` is justified under the Semantic Process IL growth rule by the first modeled Error result whose observable meaning is propagation and regional cancellation rather than None-End consumption, normal scope completion, or completion of an external effect. None of the existing operations can preserve the Error identity and cancellation discriminator. It is not a selector for the fixture topology and does not introduce a dormant generic Event union. Its input place and operation owner determine the active throwing scope occurrence; `throwingScopeId` is therefore not duplicated on the operation.

The exact resolved handler is nested in `throwError`; this capsule does not add a program-wide handler registry after one consumer. Checked-source admission establishes the unique direct match, lowering retains that result, and Semantic Process validation requires the operation owner, attached child scope, Error identity/code, parent-owned output, and origins to agree. It rejects a handler cycle, normal-flow treatment of the boundary node, or attachment outside the direct parent. A lowering-side mutation that changes only the handler output or attached scope must remain structurally decodable but fail Lean's exact lowering-equality check.

The admitted exceptional fixture has a structurally valid normal child continuation because the existing child `completeScope` requires a parent output. It has no reachable normal child completion: Trigger Error remains active until it reaches `throwError`, and the throw atomically cancels the child occurrence before its normal `completeScope` can emit that parent output. No second error-only scope account, nullable child output, or replacement of the current scope representation is permitted.

## Runtime and identity

Runtime state already contains a root occurrence and an explicit child scope occurrence derived from the parent Process occurrence, the admitted Sub-Process definition scope, and its activation ordinal. Tokens and User Task occurrences already carry their owning scope occurrence internally. This capsule adds no runtime-state field; the root Process scope and one child occurrence remain the only admitted scope cardinalities.

The child occurrence owns both child task occurrences, child control tokens, and any internal closure state created below it. The outer recovery User Task belongs to the root Process scope. Interruption removes only state owned by the selected child occurrence or a descendant; the root Process state and the handler output survive.

Activation counters and `endOccurrences` are monotonic historical runtime facts rather than scope-owned live work. Regional cancellation preserves every task, Message, Timer, effect, and scope activation counter and preserves `endOccurrences`. The Trigger-first post-catch state therefore retains `endOccurrences = 0`, while the Sibling-first post-catch state retains `endOccurrences = 1`; both pure implementations assert those exact internal values. Their canonical public Error result remains equal, but the full internal runtime states are deliberately not claimed equal.

The public User Task occurrence shape remains unchanged. Under this exact profile there is one child scope occurrence, all BPMN element identifiers are document-unique, and no repeated or concurrent occurrence of the same User Task element is admitted, so the current process-instance, element, and activation tuple remains complete for callers. Repeated, multi-instance, or recursively nested scopes reopen the public identity contract.

No pending Error is a stable or public state. Executing the enabled `throwError` operation resolves the selected direct-parent handler, cancels the child region, and emits the boundary output within one internal closure. The declarative account may factor throw, propagation, catch, and cancellation into named propositions, but the executable evaluator must not persist or expose a half-propagated Error.

## Stable semantic rules

Implemented rules `SUBPROC-ENTER-01`, `SUBPROC-WAIT-01`, `SUBPROC-END-01`, and `SUBPROC-QUIESCE-01` remain the scope-entry, two-child-wait, None-End, and normal-quiescence prerequisites. This capsule neither renames nor reimplements them.

- `SUBERR-THROW-01` — completing Trigger Error consumes only that exact active task occurrence and reaches one Error throw with code `ScopedFailure`; the Error End Event produces no normal outgoing token.
- `SUBERR-PROPAGATE-01` — the thrown Error selects the exact matching handler attached to the directly enclosing admitted Sub-Process; no evaluator-list or source-declaration order participates in the choice.
- `SUBERR-INTERRUPT-01` — catching the Error removes every scope-owned token, wait, and live runtime owner in the child scope occurrence, including Sibling Work, removes the child occurrence, preserves the monotonic activation and End counters, and produces exactly one token on the boundary route in the parent scope.
- `SUBERR-NORMAL-01` — under Trigger-first and Sibling-first schedules the child `completeScope` operation never emits the structurally present normal parent output; the normal outer End is unreachable.
- `SUBERR-OBSERVE-01` — after propagation the public observation contains only Recover as an active User Task, contains no Sibling Work wait or interaction, remains `running`, and has not reached the normal outer End.
- `SUBERR-REFUSE-01` — completing the former Sibling Work occurrence after interruption is rejected with exact committed-state preservation while Recover remains active.
- `SUBERR-COMPLETE-01` — completing Recover follows the recovered outer None End Event and completes the Process.
- `SUBERR-ADMIT-01` — a missing, catch-all, nonmatching, multiply matching, or non-direct handler is an admission rejection; the selected runtime never assigns semantics to an unresolved Error.
- `SUBERR-PRESERVE-01` — the selected combined representative declaration reordering preserves the lowered program, and both child-command orders retain the same canonical Error result, remain within the closure limit, expose a User Task at each checked stable running state, and never require evaluator-order choice among enabled internal operations; this is finite observation-level evidence, not a quantified declaration-permutation or full runtime-state equality theorem.

All nine new rules belong to the vendor-neutral BPMN layer. The selected CIB lane calibrates their public lifecycle but cannot supply their meaning. This specification selects no downstream A12 rule.

## Commands and observations

The capsule adds no public stimulus kind. It reuses exact User Task completion for Trigger Error, stale Sibling Work, and Recover.

Three answer-free schedules divide the lifecycle at the existing rule that a scenario stops after its first rejected command:

1. start, observe Trigger Error and Sibling Work together, complete Trigger Error, observe only Recover, complete Recover, and observe Process completion through the recovered End;
2. start, complete Sibling Work first, observe only Trigger Error, complete Trigger Error, observe only Recover, complete Recover, and require the same final result without reaching the normal End;
3. start, complete Trigger Error, observe only Recover, attempt the previously observed Sibling Work occurrence with a fresh command identifier, and require semantic rejection with exact state preservation while Recover remains active.

Canonical Process status, variables, active waits, and enabled interactions retain their current shapes. The public cancellation discriminator is the removal of Sibling Work and its later exact refusal, not a new host-cancellation flag or trace field.

## Lean account

Lean extends the existing declarative `OperationStep` relation with Error propagation separately from the executable evaluator. The existing scope-entry and normal-completion clauses remain unchanged. Every evaluator-produced `throwError` transition requires a checked soundness theorem with exact scope, occurrence ownership, attachment, and code hypotheses.

The checked Lean evidence is deliberately split by strength:

- the checked-definition Boolean validator requires exactly one direct-parent exact-code match, while the exact fixture and two handler mutations are finite `by decide` definition-binding witnesses rather than a quantified uniqueness theorem;
- quantified theorems preserve every monotonic runtime-history collection, remove each User Task wait in the interrupted subtree, and preserve each unrelated User Task wait;
- one finite synthetic cross-kind inventory checks descendant occurrences, tokens, Message, Timer, effect and Activity-local owners, parent work, the boundary output, and monotonic history together;
- exact schedule witnesses show that child `completeScope` cannot compete with the enabled throw, the normal parent output remains absent, both child-command orders reach the same public recovery observation with different End histories, the stale sibling preserves state, and Recover completes;
- one combined representative source reordering preserves the checked nodes and lowered program; Lean proves no quantified XML declaration-permutation proposition;
- concrete checked prefixes establish the closure, unique-enabledness, and User Task resumability obligations; Lean proves no general reachable-state liveness theorem for this profile.

The nearest plausible checked non-law is global cancellation: interrupting one child scope does not permit removal of an unrelated root-owned task occurrence. A finite counterexample keeps such a root occurrence while canceling the child subtree. This is a semantic negative witness, not an additionally admitted source topology.

No theorem claims arbitrary nesting, general Error-handler search, quantified handler uniqueness beyond checked admission, all-kind regional cancellation beyond the finite inventory, all declaration permutations, unmatched-Error behavior, a new normal Sub-Process rule beyond the implemented prerequisite, general graph liveness, or equivalence between the source compiler and Lean.

## Temporal hosting and refinement preflight

The durable ingress remains User Task Update. The capsule adds no Signal, Timer, Activity, Child Workflow, CancellationScope, Promise race, retry policy, payload router, or external-effect lifecycle.

After start, the semantic core returns two passive User Task waits. The current host-capability vocabulary already admits concurrent passive User Task interactions; nested semantic ownership does not make them host-driven waits. Completing Trigger Error is one Update whose pure semantic closure performs throw, direct-parent catch, child-region cancellation, and recovery-task activation before the result is committed.

Temporal must not model the BPMN child scope as a Temporal Child Workflow or use Temporal cancellation as semantic evidence. The complete Semantic Process definition and runtime state, including child scope ownership, remain Workflow state interpreted by the pure core.

The focused refinement witness commits the Trigger Error Update, then stops the Worker immediately after that new throw/catch/cancel transition. A replacement Worker recovers the accepted Update result and the post-cancellation wait set containing only Recover before it receives the fresh stale Sibling Work command and Recover completion. The gate then fetches and replays history. Its bypass mutation fabricates the exact same post-cancellation public prefix without advancing semantic state; the next stale Sibling Work Update therefore commits against the retained pre-throw child state and produces a durable canonical suffix different from the genuine rejection with preserved Recover state. The complete pipeline additionally executes the Sibling-first schedule. The predecessor's replacement-before-second-child evidence remains the inherited scope-foundation gate and is not duplicated here.

The state relation preserves root definition identity, semantic Process instance identity, the one child scope occurrence while active, exact User Task occurrences, tokens, Process variables, Process status, and command-result classification. Temporal Workflow ID, Run ID, Update ID, replay task, and history Event identity remain host facts.

Delivery ordering is explicit in each retained scenario: one completes Trigger Error first and one completes Sibling Work first. Both sequential orders reach the same recovery result. Concurrently submitted child Updates remain excluded; Temporal may serialize them, but this capsule does not claim a BPMN fairness or race rule for that schedule.

The zero-Signal invariant remains unchanged. The history witness requires User Task Update events and no Signal, Timer, Activity, or Child Workflow events. Existing pre-release histories are produced and replayed inside one disposable gate; no durable baseline or Workflow patch marker is introduced.

The pre-start host-capability predicate classifies this profile as passive multi-User-Task ingress, classifies `throwError` as internal semantic closure, and does not treat nested ownership as a concurrent host-driven Timer or effect. Defensive Workflow assertions for impossible scope or wait shapes remain infrastructure failures and are unreachable for admitted programs.

## Selected CIB Seven `2.2.0` evidence lane

The five on-demand questions have this disposition:

1. the selected direct-parent, exact-code, single-handler proposition has no material BPMN choice requiring CIB to decide its meaning;
2. the admitted source contains no `camunda:*` extension;
3. the owner selected a bounded CIB Seven `2.2.0` public-lifecycle claim because that release is the current BPMN breadth baseline;
4. public deployment, runtime, and task services can observe the selected task set and Process completion without contributing a host-specific fact to canonical semantics;
5. A12 Error End occurrences remain prioritization anchors, not an unchanged-model claim.

The exact project-authored source and retained Trigger-first and Sibling-first schedules execute against CIB Seven `2.2.0`. In both orders CIB exposes only Recover while the Process remains running after the Error and reports Process completion only after Recover. This establishes selection of the recovery route at the unchanged public boundary under registered agreement `CIB-AGR-0008`; it does not establish that no additional hidden normal-path microstep occurred. The stale schedule reuses that recovery-state prefix under `CIB-AGR-0008`, while mapping the no-longer-live generated task and its host refusal to the project semantic occurrence/result belongs to `CIB-OP-0001`. The immutable profile references both relationships, the target scenarios remain answer-free, retained evidence is content-bound, the unchanged Java projector remains fidelity-classified, evidence replacement is explicit, and a raw sibling-retention mutation proves the projection detects the lifecycle claim.

## Runtime-only and synthetic constructs

| Construct | Derivation and need | Owner and lifecycle | Public projection |
|---|---|---|---|
| Scope occurrence | Existing construct derived from the root Process occurrence, definition scope, and activation; reused to identify the cancellation region | Semantic core; created by implemented `SUBPROC-ENTER-01`, normally removed by `SUBPROC-QUIESCE-01`, exceptionally removed by `SUBERR-INTERRUPT-01` | Not projected directly |
| Scope ownership on tokens and waits | Existing construct derived from immutable definition scope and active occurrence; reused to cancel by region rather than element name | Semantic core; exists exactly while the owned runtime item exists | Reflected only through surviving active waits and interactions |
| Activation counters and `endOccurrences` | Existing monotonic historical facts not owned by a live scope; required for fresh occurrence identity and internal execution accounting | Semantic core; preserved by interruption, with exact Trigger-first `0` and Sibling-first `1` post-catch End counts asserted independently in Lean and TypeScript | Not projected; their deliberate difference prevents a full-runtime-state equality claim between command orders |
| Exceptional propagation edge | Derived from Error End reference, direct enclosing scope, boundary attachment, and exact Error reference/code | Checked definition; immutable for the Process definition | Not projected |
| Root-owned handler token | Produced by the matched boundary route after child cancellation | Semantic core; persists until Recover activates | Projected through Recover after closure |
| Normal parent-output token | Existing `completeScope` output retained as a structural counterpath | Never produced in an admitted execution; a checked negative witness fails if it appears | Its effects would be visible as the wrong terminal route |
| Unrelated-root cancellation counterexample | Test-authored state proving interruption is regional rather than global | Lean and TypeScript test only; never admitted or persisted | None |

No synthetic Temporal cancellation or CIB execution-tree identity enters the semantic contract.

## Evidence matrix

| Rule | BPMN/profile | Lean | TypeScript core | Temporal | Negative witness or mutation | Selected CIB `2.2.0` |
|---|---|---|---|---|---|---|
| Implemented `SUBPROC-ENTER-01` and `SUBPROC-WAIT-01` prerequisites | Clause 13.3.4 plus exact one-child profile | unchanged entry relation and two-wait laws | unchanged entry and wait behavior | persisted/replayed child occurrence and two passive Updates | scope-foundation regression gates | initial two public tasks |
| `SUBERR-THROW-01` | Error End code and no normal output | throw premise in propagation relation | independent throw evaluation | Trigger Update invokes core closure | wrong Error reference/code admission rejection | Trigger completion as public ingress only |
| `SUBERR-PROPAGATE-01` | innermost direct-parent exact handler selected during checked-source admission/lowering | exact definition-binding witness, handler-mutation inequality, and evaluator soundness | independent program validation of the nested handler | committed Trigger result recovers after post-throw Worker loss | missing, catch-all, non-direct, duplicate-handler, handler-output, and attached-scope rejection | only Recover remains |
| `SUBERR-INTERRUPT-01` | interrupting boundary cancellation | quantified User Task/history preservation laws, finite cross-kind inventory, and global-cancellation non-law | exact owner removal and counter preservation | replacement Worker recovers post-cancellation state; retained-state bypass diverges on the next stale command | stale-suffix bypass and unrelated-root counterexample | Sibling Work disappears |
| `SUBERR-NORMAL-01` | exceptional route supersedes normal completion | exact normal-output absence in both schedules | same checked absence | no normal terminal state in either trace | wrong-route projection mutation plus handler-output admission mutation | only Recover remains while the Process is running; hidden microstep absence is not claimed |
| `SUBERR-OBSERVE-01` | boundary exception flow | concrete post-catch state | canonical post-catch state | Query after Trigger Update | sibling-retention or wrong-route mutation | selected public task/Process state |
| `SUBERR-REFUSE-01` | selected operational refusal | stale child command preserves state | same refusal and preservation | fresh stale Update result | changed-state rejection mutation | recovery prefix under `CIB-AGR-0008`; host-task refusal mapping under `CIB-OP-0001` |
| `SUBERR-COMPLETE-01` | outer User Task and recovered None End | exact completion witness | exact completion witness | completion and history replay | wrong recovery occurrence refusal | Process completion after Recover |
| `SUBERR-ADMIT-01` | selected narrowing | program rejection | source/program rejection | typed pre-start rejection | every excluded handler shape | exact fixture deployment in phase zero |
| `SUBERR-PRESERVE-01` | one combined representative declaration reordering and selected progress | exact-schedule enabledness, closure, resumability, and order-specific End-count witnesses | matching finite schedule checks | every selected wait set passes passive host admission | smaller closure bound and stranded-state witnesses | both command orders |

The shared XML-to-checked-source producer remains the principal correlation risk. Lean begins from the checked graph and independently checks lowering; it does not provide a second XML parser. Source-containment, attachment, and Error-reference mutations are therefore consistency guards, not a falsely independent source lane.

## Versioning consequences

The existing `DefinitionScope`, checked node/Sequence Flow ownership arrays, Semantic Process operation/control-place ownership arrays, `enterScope`, `reachNoneEnd`, `completeScope`, scope occurrence, owned token/wait fields, runtime-state wire shape, public observation, public User Task identity, stimulus union, command-result union, and outcome union remain unchanged.

Checked Error nodes, a checked boundary attachment, and `throwError` widen the closed definition unions. They add no top-level field to either definition object, but exhaustive readers, schemas, validators, lowering, and evaluators changed together under the pre-release atomic-replacement policy.

The atomic change includes:

- checked BPMN node and graph contracts, the new boundary-attachment facts, node-kind-driven scope exits, parent-local exceptional reachability edge, validators, JSON Schema, source compiler, CMOF/XSD manifest facts, and source fixtures;
- Semantic Process definition contracts, the operation union and nested resolved handler, validation, exceptional graph edges, lowering, JSON Schema, TypeScript readers, Lean readers, and contract artifacts;
- pure regional-cancellation evaluation, the declarative Lean relation, executable Lean evaluator, and operation soundness bridge without changing the runtime-state representation;
- profile capability tables, scoped generic graph facts, targeted closure/enabledness/resumability gate, and architecture guard against topology predicates;
- all exhaustive switches, closed-kind guards, deep-readonly compile checks, artifact generators, scenario runners, differential comparators, verifiers, and mutations affected by the replaced unions;
- the new answer-free scenarios and verifier-only expected results;
- Temporal Workflow state, Query and Update integration, pre-start host-capability predicate, restart/replay/bypass tests, exact Event History assertions, and production lifecycle documentation;
- this specification, the capsule and documentation registries, every inbound link including the ordinary-completion specification and CIB breadth research, [Semantic Process IL](../SEMANTIC-PROCESS-IL-SPEC.md), [profile-parameterized admission](../PROFILE-PARAMETERIZED-ADMISSION-SPEC.md), [Temporal lifecycle](../TEMPORAL-PROCESS-LIFECYCLE-SPEC.md), the [BPMN requirement ledger](../BPMN-REQUIREMENT-LEDGER.md), [testing specification](../TESTING-SPEC.md), [implementation map](../IMPLEMENTATION-MAP.md), [plan](../PLAN.md), and the CIB relation register.

The current eleven-field canonical observation denominator, closed `activeWait.kind` values, fidelity table and schema-depth guard, Java CIB projector, and retained CIB evidence shapes remain unchanged because this capsule adds no observation field or wait kind. Their guards prove that no accidental scope/Error field or unsupported CIB claim was introduced. The selected CIB lane's Java fixture/runner, current projector audit, artifact registration, retained evidence, fidelity coverage, and replacement-command route join the same atomic change without changing the canonical schema.

No legacy reader, compatibility switch, migration function, Workflow patch branch, retained Event History, or embedded format counter is added under the pre-release policy.

## Implemented and excluded surface

The implemented surface is the exact profile, checked Error nodes and boundary attachment, generic checked-graph progress widening, `throwError`, direct-parent exact handler, regional cancellation over the existing runtime ownership with monotonic counter preservation, public sibling-removal and stale-refusal witnesses, recovery-route selection without hidden-normal-microstep claims, Lean soundness and laws, independent TypeScript behavior, targeted preservation gate, post-throw Temporal restart/replay/bypass evidence, and the selected CIB Seven `2.2.0` agreement lane.

No optional implementation is selected. The CIB Seven `2.2.0` lane is part of the closed target set under registered lifecycle agreement `CIB-AGR-0008` and stale host-task mapping `CIB-OP-0001`; neither can change vendor-neutral semantics.

Excluded work is any widening or reimplementation of ordinary Sub-Process completion beyond the structurally present negative route, arbitrary or recursive nesting, multiple scope occurrences, multiple or catch-all handlers, unmatched-Error runtime behavior, Error payload/data mapping, Intermediate Throw Error, Service Task faults, Event Sub-Processes, boundary handlers on other Activity kinds, Call Activities, transactions, compensation, termination, escalation, non-interrupting handlers, multi-instance, loops, concurrent command semantics, CIB compatibility beyond the selected lane, A12 façade adoption, and public scope-tree observation.

## Closure reflection and cost

The exact established claim is direct-parent exact-code Error propagation with regional cancellation; general handler search remains unsupported. The shared XML compiler and canonical projection remain the principal correlated assumptions: Lean independently re-lowers the checked graph but does not parse XML, while CIB independently executes exact XML only at its declared public boundary. Canonical results depend only on admitted definition/runtime state and explicit User Task commands. The unrelated-root global-cancellation non-law and unreachable-normal-route witness are retained, and sibling disappearance plus state-preserving stale refusal separate the chosen account at the public boundary. Normative review, selected CIB behavior, Lean laws, TypeScript correspondence, and Temporal refinement remain distinct claims.

Wrong-route and sibling-retention projection mutations fail as required. The handler-output mutation fails definition binding. The semantic-core bypass matches the genuine recovery prefix but fails at the next stale-command state/result discriminator. Histories are disposable pre-release artifacts, the public contract is unchanged, the CIB runner and Temporal server clean up, and the ordinary Temporal host reuses one bundle across initial, replacement, and replay Workers. The source-hygiene red gate exposed two oversized generic owners during closure; the repeated weight was removed by extracting typed Semantic Process operation admission in TypeScript and Error definition admission/lowering in Lean. The complete gate then exposed stale exhaustive checked-node readers in the frozen experiment; each reader now rejects both Error variants explicitly, so the ordinary transitive build guards atomic replacement without enlarging the experiment's claims. The implementation baseline is commit `be7845d`; the exact committed nonblank churn and comparison with ordinary embedded Sub-Process completion are recorded in the [capsule cost ledger](../CAPSULE-COST-LEDGER.md).

## Re-open conditions

Return to owner review if:

- a valid admitted execution can normally quiesce inside the child scope;
- direct-parent exact matching cannot avoid selecting by source or evaluator list order;
- regional cancellation cannot be stated without deleting unrelated root-owned state;
- the source compiler needs a complete-model topology predicate;
- the targeted gate finds a reachable non-terminal quiescent state with runtime owners and no resumption surface;
- Temporal requires a new transport, Child Workflow, CancellationScope, concurrent host-driven scheduler, or host-defined semantic outcome;
- public User Task identity is ambiguous under the admitted one-scope cardinality;
- a CIB or A12 fact becomes necessary to decide BPMN meaning;
- the breaking replacement cannot update all current producers and consumers atomically;
- implementation would alter the existing normal Sub-Process account, silently establish unmatched-Error behavior, Event Sub-Process semantics, or another excluded proposition.

## Separate follow-on capsules

Open a separate capsule when a consumer requires a second nesting level, repeated or multi-instance scope occurrences, multiple-handler search, catch-all matching, unresolved Error observation, Event Sub-Processes, scope-local variables, compensation, CIB behavior beyond the selected public lane, or an A12 compatibility overlay. Re-open the existing ordinary-completion specification rather than this capsule if a consumer changes its normal scope lifecycle.
