# Embedded Sub-Process Error propagation proposal

## Status

**Rebased bounded owner-review proposal; implementation is not authorized.**

This is the first exceptional-exit follow-on after the implemented [ordinary embedded Sub-Process completion specification](EMBEDDED-SUBPROCESS-COMPLETION-SPEC.md). It selects one normal embedded Sub-Process whose only reachable child result is an exact-code Error End Event caught by one interrupting boundary Error Event attached to that Sub-Process. It establishes regional cancellation and direct-parent Error propagation by reusing the current definition-scope, runtime-occurrence, ownership, normal-completion, and passive Temporal foundations; it does not establish Event Sub-Process behavior.

The representation and versioning boundary below is rebased on commit `a59f8a3`. `DefinitionScope`, `enterScope`, `reachNoneEnd`, `completeScope`, operation/control-place ownership, scope occurrences, scope-owned tokens and waits, quiescent normal completion, and multiple passive User Task hosting are implemented prerequisites rather than work in this proposal.

## Owner question

May the project implement the smallest standards-only nested-scope discriminator in which completing one child User Task reaches an Error End Event, propagation selects the exact matching boundary Error on the directly enclosing embedded Sub-Process, interruption removes a still-active sibling User Task and every other runtime owner inside that scope occurrence, and only an outer recovery User Task remains observable?

Approval authorizes only the source profile, semantic rules, additive Error definition boundary, atomic pre-release replacement, and evidence boundary in this proposal. It does not widen the implemented ordinary-completion profile and does not authorize A12 unchanged-model adoption, arbitrary nesting, or Event Sub-Processes.

The recommended evidence selection is a CIB Seven `2.2.0` public-lifecycle agreement lane because that release is the current BPMN breadth baseline. Approval includes the bounded phase-zero probe and, only if it agrees at the selected public boundary, same-change relationship registration and retained evidence. The owner may approve the vendor-neutral capsule while explicitly declining that optional compatibility lane without changing BPMN meaning.

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

Admission extends the profile-parameterized gate; it must not add a named whole-topology predicate or another production disjunct.

The profile capability owns exact source-node and Semantic Process operation multisets plus the already implemented maximum definition-scope depth of one child below the Process scope. Reusable scoped-graph validation owns distinct identities, legal source containment, same-scope Sequence Flow ownership, exact reference resolution, source-scope reachability and co-reachability, acyclicity, producer/consumer discipline, and the implemented parent input/output relation of the embedded Sub-Process. The new generic Error validation owns boundary attachment, direct-parent scope agreement, exact Error reference/code agreement, one matching handler, and the exceptional graph edge from `throwError` to the boundary output.

The validator treats normal Sequence Flow and Error propagation as different edge kinds. It must not manufacture an ordinary Sequence Flow across the Sub-Process boundary or count the boundary handler as a child-flow node.

Declaration order is not semantics. Focused source, Lean, and TypeScript checks must cover both orders of the fork's outgoing Sequence Flow declarations, both orders of the two child User Task node declarations, and both orders together. Those programs must have the same enabled wait multiset and the same Trigger Error result.

The capsule-local preservation gate must execute Trigger-first and Sibling-first schedules and establish that every reachable stable state under the selected profile is terminal or has at least one explicit User Task resumption surface; no reachable stable running state may retain a token or active scope without an interaction. It must also establish that closure never chooses between multiple enabled internal operations by program list order and that the child's existing `completeScope` operation never competes with or precedes the enabled Error throw.

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

The public User Task occurrence shape remains unchanged. Under this exact profile there is one child scope occurrence, all BPMN element identifiers are document-unique, and no repeated or concurrent occurrence of the same User Task element is admitted, so the current process-instance, element, and activation tuple remains complete for callers. Repeated, multi-instance, or recursively nested scopes reopen the public identity contract.

No pending Error is a stable or public state. Executing the enabled `throwError` operation resolves the selected direct-parent handler, cancels the child region, and emits the boundary output within one internal closure. The declarative account may factor throw, propagation, catch, and cancellation into named propositions, but the executable evaluator must not persist or expose a half-propagated Error.

## Stable semantic rules

Implemented rules `SUBPROC-ENTER-01`, `SUBPROC-WAIT-01`, `SUBPROC-END-01`, and `SUBPROC-QUIESCE-01` remain the scope-entry, two-child-wait, None-End, and normal-quiescence prerequisites. This capsule neither renames nor reimplements them.

- `SUBERR-THROW-01` — completing Trigger Error consumes only that exact active task occurrence and reaches one Error throw with code `ScopedFailure`; the Error End Event produces no normal outgoing token.
- `SUBERR-PROPAGATE-01` — the thrown Error selects the exact matching handler attached to the directly enclosing admitted Sub-Process; no evaluator-list or source-declaration order participates in the choice.
- `SUBERR-INTERRUPT-01` — catching the Error removes every token, wait, and runtime owner in the child scope occurrence, including Sibling Work, removes the child occurrence, and produces exactly one token on the boundary route in the parent scope.
- `SUBERR-NORMAL-01` — under Trigger-first and Sibling-first schedules the child `completeScope` operation never emits the structurally present normal parent output; the normal outer End is unreachable.
- `SUBERR-OBSERVE-01` — after propagation the public observation contains only Recover as an active User Task, contains no Sibling Work wait or interaction, remains `running`, and has not reached the normal outer End.
- `SUBERR-REFUSE-01` — completing the former Sibling Work occurrence after interruption is rejected with exact committed-state preservation while Recover remains active.
- `SUBERR-COMPLETE-01` — completing Recover follows the recovered outer None End Event and completes the Process.
- `SUBERR-ADMIT-01` — a missing, catch-all, nonmatching, multiply matching, or non-direct handler is an admission rejection; the selected runtime never assigns semantics to an unresolved Error.
- `SUBERR-PRESERVE-01` — all admitted declaration permutations and both child-command orders retain the same Error result, remain within the closure limit, expose a User Task at every stable running state, and never require evaluator-order choice among enabled internal operations.

All nine new rules belong to the vendor-neutral BPMN layer. The recommended CIB lane may calibrate their selected public lifecycle but cannot supply their meaning. This proposal selects no downstream A12 rule.

## Commands and observations

The capsule adds no public stimulus kind. It reuses exact User Task completion for Trigger Error, stale Sibling Work, and Recover.

Three answer-free schedules divide the lifecycle at the existing rule that a scenario stops after its first rejected command:

1. start, observe Trigger Error and Sibling Work together, complete Trigger Error, observe only Recover, complete Recover, and observe Process completion through the recovered End;
2. start, complete Sibling Work first, observe only Trigger Error, complete Trigger Error, observe only Recover, complete Recover, and require the same final result without reaching the normal End;
3. start, complete Trigger Error, observe only Recover, attempt the previously observed Sibling Work occurrence with a fresh command identifier, and require semantic rejection with exact state preservation while Recover remains active.

Canonical Process status, variables, active waits, and enabled interactions retain their current shapes. The public cancellation discriminator is the removal of Sibling Work and its later exact refusal, not a new host-cancellation flag or trace field.

## Lean account

Lean extends the existing declarative `OperationStep` relation with Error propagation separately from the executable evaluator. The existing scope-entry and normal-completion clauses remain unchanged. Every evaluator-produced `throwError` transition requires a checked soundness theorem with exact scope, occurrence ownership, attachment, and code hypotheses.

The useful laws are:

- exact direct-parent matching is unique under the admitted handler hypotheses;
- Error propagation removes all and only runtime owners in the interrupted child subtree;
- Error propagation emits only the boundary output in the parent scope;
- the structurally present child `completeScope` is disabled before the throw and cannot emit the normal parent output after the atomic interruption;
- fork and node declaration permutation preserves the two child waits and the propagated result;
- every reachable stable state of the admitted program is terminal or User Task resumable.

The nearest plausible checked non-law is global cancellation: interrupting one child scope does not permit removal of an unrelated root-owned task occurrence. A finite counterexample must keep such a root occurrence while canceling the child subtree. This is a semantic negative witness, not an additionally admitted source topology.

No theorem claims arbitrary nesting, general Error-handler search, unmatched-Error behavior, a new normal Sub-Process rule beyond the implemented prerequisite, general graph liveness, or equivalence between the source compiler and Lean.

## Temporal hosting and refinement preflight

The durable ingress remains User Task Update. The capsule adds no Signal, Timer, Activity, Child Workflow, CancellationScope, Promise race, retry policy, payload router, or external-effect lifecycle.

After start, the semantic core returns two passive User Task waits. The current host-capability vocabulary already admits concurrent passive User Task interactions; nested semantic ownership does not make them host-driven waits. Completing Trigger Error is one Update whose pure semantic closure performs throw, direct-parent catch, child-region cancellation, and recovery-task activation before the result is committed.

Temporal must not model the BPMN child scope as a Temporal Child Workflow or use Temporal cancellation as semantic evidence. The complete Semantic Process definition and runtime state, including child scope ownership, remain Workflow state interpreted by the pure core.

The focused refinement witness requires Worker loss after the initial two-task state, Trigger Error completion after replacement, exact recovery of the committed Update result, stale Sibling Work semantic refusal while Recover remains active, completion in a non-refusal execution, fetched-history replay, and a bypass mutation that fabricates the post-cancellation result without invoking the semantic core. The complete pipeline additionally executes the Sibling-first schedule.

The state relation preserves root definition identity, semantic Process instance identity, the one child scope occurrence while active, exact User Task occurrences, tokens, Process variables, Process status, and command-result classification. Temporal Workflow ID, Run ID, Update ID, replay task, and history Event identity remain host facts.

Delivery ordering is explicit in each retained scenario: one completes Trigger Error first and one completes Sibling Work first. Both sequential orders must reach the same recovery result. Concurrently submitted child Updates remain excluded; Temporal may serialize them, but this capsule does not claim a BPMN fairness or race rule for that schedule.

The zero-Signal invariant remains unchanged. The history witness requires User Task Update events and no Signal, Timer, Activity, or Child Workflow events. Existing pre-release histories are produced and replayed inside one disposable gate; no durable baseline or Workflow patch marker is introduced.

The pre-start host-capability predicate must classify this profile as passive multi-User-Task ingress, classify `throwError` as internal semantic closure, and avoid treating nested ownership as a concurrent host-driven Timer or effect. Defensive Workflow assertions for impossible scope or wait shapes remain infrastructure failures and must be unreachable for admitted programs.

## CIB Seven `2.2.0` evidence option

The five on-demand questions have this disposition:

1. the selected direct-parent, exact-code, single-handler proposition has no material BPMN choice requiring CIB to decide its meaning;
2. the admitted source contains no `camunda:*` extension;
3. a bounded CIB Seven `2.2.0` public-lifecycle claim is recommended because that release is the current BPMN breadth baseline;
4. public deployment, runtime, and task services can observe the selected task set and Process completion without contributing a host-specific fact to canonical semantics;
5. A12 Error End occurrences remain prioritization anchors, not an unchanged-model claim.

If the owner includes this option, implementation begins with a phase-zero probe of the exact project-authored source. It must cover Trigger-first and Sibling-first schedules, require only Recover after the Error, prove that the normal outer End was not taken through public Process/task state, and require Process completion after Recover. If CIB agrees, the same implementation change adds a confirmed relation entry, a profile reference to that registered identifier, answer-free target scenarios, content-bound retained evidence, an existing-projector fidelity audit, an evidence-replacement route, and a sibling-retention or wrong-route mutation. No profile artifact may use an unregistered placeholder identifier.

If CIB rejects the source, exposes a materially different public result, or requires an extension/configuration choice, semantic implementation stops before CIB enters the target set and the finding is classified in the relation register. The owner then decides whether to proceed standards-only or amend the compatibility boundary. The existing flat Task-attached `CIB-AGR-0005`, its caught-path mapping extension, and ordinary-scope `CIB-AGR-0007` do not authorize a nested propagation claim.

## Runtime-only and synthetic constructs

| Construct | Derivation and need | Owner and lifecycle | Public projection |
|---|---|---|---|
| Scope occurrence | Existing construct derived from the root Process occurrence, definition scope, and activation; reused to identify the cancellation region | Semantic core; created by implemented `SUBPROC-ENTER-01`, normally removed by `SUBPROC-QUIESCE-01`, exceptionally removed by `SUBERR-INTERRUPT-01` | Not projected directly |
| Scope ownership on tokens and waits | Existing construct derived from immutable definition scope and active occurrence; reused to cancel by region rather than element name | Semantic core; exists exactly while the owned runtime item exists | Reflected only through surviving active waits and interactions |
| Exceptional propagation edge | Derived from Error End reference, direct enclosing scope, boundary attachment, and exact Error reference/code | Checked definition; immutable for the Process definition | Not projected |
| Root-owned handler token | Produced by the matched boundary route after child cancellation | Semantic core; persists until Recover activates | Projected through Recover after closure |
| Normal parent-output token | Existing `completeScope` output retained as a structural counterpath | Never produced in an admitted execution; a checked negative witness fails if it appears | Its effects would be visible as the wrong terminal route |
| Unrelated-root cancellation counterexample | Test-authored state proving interruption is regional rather than global | Lean and TypeScript test only; never admitted or persisted | None |

No synthetic Temporal cancellation or CIB execution-tree identity enters the semantic contract.

## Evidence matrix

| Rule | BPMN/profile | Lean | TypeScript core | Temporal | Negative witness or mutation | Optional CIB `2.2.0` |
|---|---|---|---|---|---|---|
| Implemented `SUBPROC-ENTER-01` and `SUBPROC-WAIT-01` prerequisites | Clause 13.3.4 plus exact one-child profile | unchanged entry relation and two-wait laws | unchanged entry and wait behavior | persisted/replayed child occurrence and two passive Updates | scope-foundation regression gates | initial two public tasks |
| `SUBERR-THROW-01` | Error End code and no normal output | throw premise in propagation relation | independent throw evaluation | Trigger Update invokes core closure | wrong Error reference/code admission rejection | Trigger completion as public ingress only |
| `SUBERR-PROPAGATE-01` | innermost direct-parent exact handler | uniqueness and evaluator soundness | independent handler resolution | committed Trigger result recovers after Worker loss | missing, catch-all, non-direct, and duplicate-handler rejection | only Recover remains |
| `SUBERR-INTERRUPT-01` | interrupting boundary cancellation | subtree-removal law and global-cancellation non-law | exact owner removal | post-Update Workflow state | bypass mutation and unrelated-root counterexample | Sibling Work disappears |
| `SUBERR-NORMAL-01` | exceptional route supersedes normal completion | normal-output absence in both orders | same checked absence | no normal terminal state in either trace | forced-normal-output mutation | normal outer End remains untaken |
| `SUBERR-OBSERVE-01` | boundary exception flow | concrete post-catch state | canonical post-catch state | Query after Trigger Update | sibling-retention or wrong-route mutation | public task/Process state if selected |
| `SUBERR-REFUSE-01` | selected operational refusal | stale child command preserves state | same refusal and preservation | fresh stale Update result | changed-state rejection mutation | not claimed; project occurrence policy |
| `SUBERR-COMPLETE-01` | outer User Task and recovered None End | exact completion witness | exact completion witness | completion and history replay | wrong recovery occurrence refusal | Process completion after Recover |
| `SUBERR-ADMIT-01` | selected narrowing | program rejection | source/program rejection | typed pre-start rejection | every excluded handler shape | exact fixture deploys if selected |
| `SUBERR-PRESERVE-01` | declaration-order neutrality and selected progress | permutation, enabledness, closure, and resumability laws | matching exhaustive checks | every wait set passes passive host admission | smaller closure bound and stranded-state witnesses | both command orders if selected |

The shared XML-to-checked-source producer remains the principal correlation risk. Lean begins from the checked graph and independently checks lowering; it does not provide a second XML parser. Source-containment, attachment, and Error-reference mutations are therefore consistency guards, not a falsely independent source lane.

## Versioning consequences

The existing `DefinitionScope`, checked node/Sequence Flow ownership arrays, Semantic Process operation/control-place ownership arrays, `enterScope`, `reachNoneEnd`, `completeScope`, scope occurrence, owned token/wait fields, runtime-state wire shape, public observation, public User Task identity, stimulus union, command-result union, and outcome union remain unchanged.

Adding checked Error nodes, a checked boundary attachment, and `throwError` widens closed definition unions. It adds no required top-level field to either definition object, but exhaustive readers, schemas, validators, lowering, and evaluators still change together. Under the pre-release policy this is a breaking representation change and must replace every current producer and consumer atomically if approved.

The atomic change includes:

- checked BPMN node and graph contracts, the new boundary-attachment facts, validators, JSON Schema, source compiler, CMOF/XSD manifest facts, and source fixtures;
- Semantic Process definition contracts, the operation union and nested resolved handler, validation, exceptional graph edges, lowering, JSON Schema, TypeScript readers, Lean readers, and contract artifacts;
- pure regional-cancellation evaluation, the declarative Lean relation, executable Lean evaluator, and operation soundness bridge without changing the runtime-state representation;
- profile capability tables, scoped generic graph facts, targeted closure/enabledness/resumability gate, and architecture guard against topology predicates;
- all exhaustive switches, closed-kind guards, deep-readonly compile checks, artifact generators, scenario runners, differential comparators, verifiers, and mutations affected by the replaced unions;
- the new answer-free scenarios and verifier-only expected results;
- Temporal Workflow state, Query and Update integration, pre-start host-capability predicate, restart/replay/bypass tests, exact Event History assertions, and production lifecycle documentation;
- [Semantic Process IL](../SEMANTIC-PROCESS-IL-SPEC.md), [profile-parameterized admission](../PROFILE-PARAMETERIZED-ADMISSION-SPEC.md), [Temporal lifecycle](../TEMPORAL-PROCESS-LIFECYCLE-SPEC.md), the [BPMN requirement ledger](../BPMN-REQUIREMENT-LEDGER.md), [testing specification](../TESTING-SPEC.md), [implementation map](../IMPLEMENTATION-MAP.md), and [plan](../PLAN.md).

The current eleven-field canonical observation denominator, closed `activeWait.kind` values, fidelity table and schema-depth guard, Java CIB projector, and existing retained CIB evidence shapes remain unchanged because this capsule adds no observation field or wait kind. Their guards must nevertheless prove that no accidental scope/Error field or unsupported CIB claim was introduced. If the optional CIB lane is selected after a green phase-zero probe, its Java fixture/runner, current projector audit, artifact registration, retained evidence, fidelity coverage, and replacement-command route join the same atomic change without changing the canonical schema.

No legacy reader, compatibility switch, migration function, Workflow patch branch, retained Event History, or embedded format counter is added under the pre-release policy.

## Required, optional, and excluded work

Required work is the exact profile, checked Error nodes and boundary attachment, `throwError`, direct-parent exact handler, regional cancellation over the existing runtime ownership, public sibling-removal, normal-route-absence and stale-refusal witnesses, Lean soundness and laws, independent TypeScript behavior, targeted preservation gate, Temporal restart/replay/bypass evidence, and same-change documentation closure.

Recommended optional work is the bounded CIB Seven `2.2.0` phase-zero and normative-agreement lane above. It enters the target set only after a confirmed relationship is registered in the same change and cannot change vendor-neutral semantics. No other optional implementation is selected.

Excluded work is any widening or reimplementation of ordinary Sub-Process completion beyond the structurally present negative route, arbitrary or recursive nesting, multiple scope occurrences, multiple or catch-all handlers, unmatched-Error runtime behavior, Error payload/data mapping, Intermediate Throw Error, Service Task faults, Event Sub-Processes, boundary handlers on other Activity kinds, Call Activities, transactions, compensation, termination, escalation, non-interrupting handlers, multi-instance, loops, concurrent command semantics, CIB compatibility beyond the explicitly selected optional lane, A12 façade adoption, and public scope-tree observation.

## Required closure reflection and cost

Before graduation, the separate epistemic-closure review must restate that the exact established claim is direct-parent exact-code Error propagation with regional cancellation, while general handler search is unsupported. It must audit the shared XML compiler and canonical projection as the main correlated assumptions; prove canonical results depend only on admitted definition/runtime state and explicit User Task commands; retain the unrelated-root global-cancellation non-law and the unreachable-normal-route witness; confirm that sibling disappearance and stale refusal are public discriminators; and keep normative, optional CIB, Lean, TypeScript, and Temporal claims separate.

The closure must require meaningful wrong-route, sibling-retention, and semantic-core-bypass mutations, confirm disposable pre-release histories and the unchanged public contract, inspect probe cleanup and duplicate builds, and decide whether the result changes the next CIB-breadth capsule. Before implementation starts, record its baseline commit. At closure, add the exact boundary and nonblank code/documentation churn to the [capsule cost ledger](../CAPSULE-COST-LEDGER.md) and compare it with ordinary embedded Sub-Process completion. This follow-on should be materially smaller because it reuses definition scopes, runtime ownership, normal completion, passive multi-task hosting, artifact discovery, and shared Worker bundles; if it is not, identify and remove one repeated process weight before the next capsule.

## Acceptance and stop conditions

Implementation may begin only after the owner approves this exact product claim, the structurally present but unreachable normal route, internal scope occurrence with unchanged public task identity, atomic throw/catch/cancel closure, complete pre-release replacement list, and inclusion or exclusion of the recommended CIB Seven `2.2.0` evidence lane.

Stop and return to owner review if:

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

## Re-open conditions

Open a separate capsule when a consumer requires a second nesting level, repeated or multi-instance scope occurrences, multiple-handler search, catch-all matching, unresolved Error observation, Event Sub-Processes, scope-local variables, compensation, CIB behavior beyond the selected public lane, or an A12 compatibility overlay. Re-open the existing ordinary-completion specification rather than this capsule if a consumer changes its normal scope lifecycle.
