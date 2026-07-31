# Embedded Sub-Process Error propagation proposal

## Status

**Retained bounded follow-on proposal; implementation is not authorized and its representation must rebase after ordinary embedded Sub-Process completion closes.**

This is the first exceptional-exit follow-on after the [ordinary embedded Sub-Process completion specification](EMBEDDED-SUBPROCESS-COMPLETION-SPEC.md). It selects one normal embedded Sub-Process whose only reachable terminal result is an exact-code Error End Event caught by one interrupting boundary Error Event attached to that Sub-Process. It establishes regional cancellation and direct-parent Error propagation over the implemented ordinary-scope foundation; it does not establish Event Sub-Process behavior.

The owner question and semantic discriminator remain useful, but the `ScopeDefinition`, `EnterScopeOperation`, runtime ownership, and atomic versioning sketches below predate the ordinary-completion selection. They are provisional until rebased on that capsule's implemented names and invariants. Do not implement this document as written.

## Owner question

May the project implement the smallest standards-only nested-scope discriminator in which completing one child User Task reaches an Error End Event, propagation selects the exact matching boundary Error on the directly enclosing embedded Sub-Process, interruption removes a still-active sibling User Task and every other runtime owner inside that scope occurrence, and only an outer recovery User Task remains observable?

Approval authorizes only the source profile, semantic rules, representation replacement, and evidence boundary in this proposal. It does not authorize CIB compatibility, A12 unchanged-model adoption, normal Sub-Process completion, arbitrary nesting, or Event Sub-Processes.

## Product claim

In product terms, the capsule establishes:

> When one running embedded work region ends with a modeled BPMN Error, can the engine route that Error to the exact handler on the directly enclosing region, discard unfinished work owned by that region, continue at one outer recovery task, and preserve the same result durably through Temporal replay?

The closest unsupported claim is ordinary completion of an embedded Sub-Process after all child tokens and Activities finish. That lifecycle is intentionally not hidden inside this capsule.

The known eventual consumers are the Process Execution Conformance roadmap and the later A12 adoption lane. The A12 corpus contains Error End Events, but no unchanged A12 model is claimed by this source profile and the corpus has not established a Sub-Process denominator.

## Why this is the first exceptional follow-on

The existing boundary-error capsule proves a matching Error result attached directly to a Task in one flat Process. It explicitly excludes Error End Events, nested propagation, and general cancellation. After ordinary child entry, ownership, and quiescent completion are established, this discriminator adds exactly the missing exceptional distinctions: one modeled Error throw, direct-parent catcher selection, and cancellation by runtime ownership.

A single sequential child would not separate scope interruption from ordinary token replacement. The second live child User Task is required because its disappearance at the public observation boundary proves regional cancellation. An outer recovery User Task is required because it keeps the Process live long enough for a fresh stale-child command to establish state-preserving refusal.

An Event Sub-Process is not included. Boundary handlers execute outside the attached Sub-Process, while Event Sub-Processes execute in the enclosing context and have a distinct activation and lifetime account. Combining both handler loci would prevent this capsule from identifying which scope relation or cancellation rule caused a failure.

## Normative basis

BPMN 2.0.2 Clause 10.3.5 defines an embedded Sub-Process as an Activity containing Flow Elements and as a contextual scope for visibility, events, exception handling, and compensation.

Clause 13.3.4 states that a Sub-Process is instantiated when reached by a Sequence Flow token and that its elements then behave as in a normal Process. It also states that a Sub-Process instance normally completes only when no token remains inside it and none of its Activities remains active. This capsule uses the instantiation rule but does not select the normal-completion rule because its admitted child graph has no reachable ordinary completion.

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
     boundary Error ScopedFailure
       -> outer User Task Recover
       -> outer None End Event
```

The embedded Sub-Process has no normal outgoing Sequence Flow. Its Trigger Error branch always reaches the Error End Event; its Sibling Work branch may finish first but cannot make the child scope complete while Trigger Error remains active. Every complete admitted command schedule therefore either waits at one or both child tasks or eventually takes the Error boundary route.

The document contains exactly:

- one executable private Process;
- one normal embedded Sub-Process with `triggeredByEvent` absent or false;
- one outer and one inner None Start Event;
- one Parallel Gateway with one incoming and two outgoing Sequence Flows;
- two child User Tasks with distinct element identifiers;
- one child None End Event;
- one Error End Event containing one ErrorEventDefinition;
- one interrupting boundary Error Event attached to the embedded Sub-Process and containing one ErrorEventDefinition;
- one outer recovery User Task and one outer None End Event;
- one root Error with exact nonempty code `ScopedFailure` referenced by both ErrorEventDefinitions;
- the exact Sequence Flows shown above;
- no normal Sub-Process outgoing Sequence Flow, data, variables, expressions, payload, extension elements, parser warnings, or additional root element.

The profile rejects catch-all Error boundaries, nonmatching Error references or codes, more than one handler, more than one Sub-Process, nested Sub-Processes, non-interrupting Error notation, a boundary attached to any element other than the selected Sub-Process, Event Sub-Processes, Call Activities, transactions, compensation, loops, multi-instance, ad-hoc behavior, conditional flow, and every non-Error EventDefinition.

## Admission account

Admission extends the profile-parameterized gate; it must not add a named whole-topology predicate or another production disjunct.

The profile capability owns exact source-node and Semantic Process operation multisets plus the maximum admitted scope depth of one child below the Process scope. Reusable scoped-graph validation owns distinct identities, legal source containment, Flow ownership, boundary attachment, exact reference resolution, source-scope reachability and co-reachability, acyclicity, producer/consumer discipline, and the exceptional propagation edge from the Error End Event to the attached boundary handler.

The validator treats normal Sequence Flow and Error propagation as different edge kinds. It must not manufacture an ordinary Sequence Flow across the Sub-Process boundary or count the boundary handler as a child-flow node.

Declaration order is not semantics. Focused source, Lean, and TypeScript checks must cover both orders of the fork's outgoing Sequence Flow declarations, both orders of the two child User Task node declarations, and both orders together. Those programs must have the same enabled wait multiset and the same Trigger Error result.

The capsule-local preservation gate must establish that every reachable stable state under the selected profile is terminal or has at least one explicit User Task resumption surface; no reachable stable running state may retain a token or active scope without an interaction. It must also establish that closure never chooses between multiple enabled internal operations by program list order.

## Checked source and Semantic Process definition

The checked graph adds explicit source containment and boundary attachment. A Sub-Process node owns its child flow graph; a boundary Error belongs to the parent flow scope and refers to its attached Sub-Process. The source representation must not flatten either relation into element-name conventions.

The Semantic Process definition adds the minimum reusable distinctions forced by this consumer:

```ts
type ScopeDefinition = DeepReadonly<{
  id: string;
  parentScopeId: string;
  origin: {
    kind: "bpmnElement";
    elementId: string;
  };
}>;

type EnterScopeOperation = DeepReadonly<{
  kind: "enterScope";
  id: string;
  input: string;
  childEntry: string;
  scopeId: string;
  origin: {
    kind: "bpmnElement";
    elementId: string;
  };
}>;

type ThrowErrorOperation = DeepReadonly<{
  kind: "throwError";
  id: string;
  input: string;
  error: {
    elementId: string;
    code: string;
  };
  throwingScopeId: string;
  origin: {
    kind: "bpmnElement";
    elementId: string;
  };
}>;

type InterruptingErrorHandler = DeepReadonly<{
  attachedScopeId: string;
  boundaryElementId: string;
  errorElementId: string;
  code: string;
  output: string;
}>;
```

These are minimal contract sketches, not permission to copy them without the compile-time and JSON-boundary audit. Exact names may change during implementation only if the semantic distinctions remain explicit and the proposal is updated before approval or the approved contract is amended atomically.

`enterScope` and ordinary child ownership will be inherited from the approved normal-completion foundation rather than introduced here. `throwError` is justified by the first modeled Error result whose meaning is propagation rather than completion of an external effect. Neither operation may become a selector for the fixture topology or a dormant generic Event union.

The immutable program associates every control place and operation with one definition scope. The direct handler table associates the child definition scope with one Error boundary route in its parent. Program validation requires every referenced scope, place, origin, handler, Error identity, and code to agree and rejects a handler cycle or an attachment outside the direct parent.

The admitted exceptional fixture still has no reachable normal child completion because Trigger Error remains active until it reaches `throwError`. The implementation must nevertheless reuse the ordinary capsule's general scope-completion representation and prove that the exceptional route cancels the active occurrence before normal completion can emit its parent output. It must not retain this proposal's earlier error-only no-output representation as a parallel scope account.

## Runtime and identity

Runtime state adds an explicit scope occurrence derived from the parent Process occurrence, the admitted Sub-Process element identifier, and its activation ordinal. Tokens and User Task occurrences carry their owning scope occurrence internally. The root Process scope and one child occurrence are the only admitted scope cardinalities.

The child occurrence owns both child task occurrences, child control tokens, and any internal closure state created below it. The outer recovery User Task belongs to the root Process scope. Interruption removes only state owned by the selected child occurrence or a descendant; the root Process state and the handler output survive.

The public User Task occurrence shape remains unchanged. Under this exact profile there is one child scope occurrence, all BPMN element identifiers are document-unique, and no repeated or concurrent occurrence of the same User Task element is admitted, so the current process-instance, element, and activation tuple remains complete for callers. Repeated, multi-instance, or recursively nested scopes reopen the public identity contract.

No pending Error is a stable or public state. Executing the enabled `throwError` operation resolves the selected direct-parent handler, cancels the child region, and emits the boundary output within one internal closure. The declarative account may factor throw, propagation, catch, and cancellation into named propositions, but the executable evaluator must not persist or expose a half-propagated Error.

## Stable semantic rules

- `SUBERR-ENTER-01` — consuming the outer token at the admitted embedded Sub-Process creates exactly one child scope occurrence and one child-entry token owned by it.
- `SUBERR-WAIT-01` — child closure exposes exactly the Trigger Error and Sibling Work User Task occurrences, both owned by the child scope; fork declaration order does not change the enabled multiset.
- `SUBERR-THROW-01` — completing Trigger Error consumes only that exact active task occurrence and reaches one Error throw with code `ScopedFailure`; the Error End Event produces no normal outgoing token.
- `SUBERR-PROPAGATE-01` — the thrown Error selects the exact matching handler attached to the directly enclosing admitted Sub-Process; no evaluator-list or source-declaration order participates in the choice.
- `SUBERR-INTERRUPT-01` — catching the Error removes every token, wait, and runtime owner in the child scope occurrence, including Sibling Work, removes the child occurrence, and produces exactly one token on the boundary route in the parent scope.
- `SUBERR-OBSERVE-01` — after propagation the public observation contains only Recover as an active User Task, contains no Sibling Work wait or interaction, remains `running`, and exposes no normal Sub-Process route.
- `SUBERR-REFUSE-01` — completing the former Sibling Work occurrence after interruption is rejected with exact committed-state preservation while Recover remains active.
- `SUBERR-COMPLETE-01` — completing Recover follows the outer None End Event and completes the Process.
- `SUBERR-ADMIT-01` — a missing, catch-all, nonmatching, multiply matching, or non-direct handler is an admission rejection; the selected runtime never assigns semantics to an unresolved Error.

All nine rules belong to the vendor-neutral BPMN layer. This proposal selects no CIB overlay and no downstream A12 rule.

## Commands and observations

The capsule adds no public stimulus kind. It reuses exact User Task completion for Trigger Error, stale Sibling Work, and Recover.

The primary answer-free schedule is:

1. start the Process and observe Trigger Error and Sibling Work active together;
2. complete Trigger Error and observe only Recover;
3. attempt to complete the previously observed Sibling Work occurrence with a fresh command identifier and require semantic rejection with exact state preservation;
4. complete Recover and observe Process completion.

Canonical Process status, variables, active waits, and enabled interactions retain their current shapes. The public cancellation discriminator is the removal of Sibling Work and its later exact refusal, not a new host-cancellation flag or trace field.

## Lean account

Lean adds a declarative scope-entry relation and a declarative Error-propagation relation distinct from the executable evaluator. Every produced entry and propagation transition requires a checked soundness theorem with exact scope, ownership, attachment, and code hypotheses.

The useful laws are:

- scope entry creates one fresh child occurrence and preserves root-owned runtime state;
- exact direct-parent matching is unique under the admitted handler hypotheses;
- Error propagation removes all and only runtime owners in the interrupted child subtree;
- Error propagation emits only the boundary output in the parent scope;
- fork and node declaration permutation preserves the two child waits and the propagated result;
- every reachable stable state of the admitted program is terminal or User Task resumable.

The nearest plausible checked non-law is global cancellation: interrupting one child scope does not permit removal of an unrelated root-owned task occurrence. A finite counterexample must keep such a root occurrence while canceling the child subtree. This is a semantic negative witness, not an additionally admitted source topology.

No theorem claims arbitrary nesting, general Error-handler search, unmatched-Error behavior, normal Sub-Process completion, general graph liveness, or equivalence between the source compiler and Lean.

## Temporal hosting and refinement preflight

The durable ingress remains User Task Update. The capsule adds no Signal, Timer, Activity, Child Workflow, CancellationScope, Promise race, retry policy, payload router, or external-effect lifecycle.

After start, the semantic core returns two passive User Task waits. The current host-capability vocabulary already admits concurrent passive User Task interactions; nested semantic ownership does not make them host-driven waits. Completing Trigger Error is one Update whose pure semantic closure performs throw, direct-parent catch, child-region cancellation, and recovery-task activation before the result is committed.

Temporal must not model the BPMN child scope as a Temporal Child Workflow or use Temporal cancellation as semantic evidence. The complete Semantic Process definition and runtime state, including child scope ownership, remain Workflow state interpreted by the pure core.

The refinement witness requires Worker loss after the initial two-task state, Trigger Error completion after replacement, exact recovery of the committed Update result, stale Sibling Work semantic refusal while Recover remains active, completion, fetched-history replay, and a bypass mutation that fabricates the post-cancellation result without invoking the semantic core.

The state relation preserves root definition identity, semantic Process instance identity, the one child scope occurrence while active, exact User Task occurrences, tokens, Process variables, Process status, and command-result classification. Temporal Workflow ID, Run ID, Update ID, replay task, and history Event identity remain host facts.

Delivery ordering is explicit: the retained scenario completes Trigger Error before any Sibling Work completion. Concurrent child completions and the reverse command order are excluded from the product claim. Temporal may serialize concurrently submitted Updates, but this capsule does not claim a BPMN fairness or race rule for them.

The zero-Signal invariant remains unchanged. The history witness requires User Task Update events and no Signal, Timer, Activity, or Child Workflow events. Existing pre-release histories are produced and replayed inside one disposable gate; no durable baseline or Workflow patch marker is introduced.

The pre-start host-capability predicate must classify this profile as passive multi-User-Task ingress and must inspect nested ownership without treating it as a concurrent host-driven Timer or effect. Defensive Workflow assertions for impossible scope or wait shapes remain infrastructure failures and must be unreachable for admitted programs.

## CIB on-demand disposition

The five CIB questions are all answered no for this capsule:

1. the selected direct-parent, exact-code, single-handler proposition has no material BPMN choice requiring a compatibility decision;
2. admitted source contains no `camunda:*` extension;
3. no CIB compatibility claim is made;
4. no CIB configuration or host behavior contributes to the canonical result;
5. the A12 Error End occurrences are prioritization anchors, not an unchanged-model blocker claimed by this profile.

No CIB relationship identifier, Java projector change, retained CIB evidence, or replacement command is added. The existing flat Task-attached `CIB-AGR-0005` and caught-path mapping extension do not authorize a nested propagation claim. A later CIB or A12 adoption capsule must first add the smallest classified relationship and evidence that its exact source requires.

## Runtime-only and synthetic constructs

| Construct | Derivation and need | Owner and lifecycle | Public projection |
|---|---|---|---|
| Scope occurrence | Derived from the root Process occurrence, Sub-Process element, and activation; required to identify the cancellation region | Semantic core; created by `SUBERR-ENTER-01`, removed by `SUBERR-INTERRUPT-01` | Not projected directly |
| Scope ownership on tokens and waits | Derived from immutable definition scope and active occurrence; required to cancel by region rather than element name | Semantic core; exists exactly while the owned runtime item exists | Reflected only through surviving active waits and interactions |
| Exceptional propagation edge | Derived from Error End reference, direct enclosing scope, boundary attachment, and exact Error reference/code | Checked definition; immutable for the Process definition | Not projected |
| Root-owned handler token | Produced by the matched boundary route after child cancellation | Semantic core; persists until Recover activates | Projected through Recover after closure |
| Unrelated-root cancellation counterexample | Test-authored state proving interruption is regional rather than global | Lean and TypeScript test only; never admitted or persisted | None |

No synthetic Temporal cancellation or CIB execution-tree identity enters the semantic contract.

## Evidence matrix

| Rule | BPMN/profile | Lean | TypeScript core | Temporal | Negative witness or mutation | CIB |
|---|---|---|---|---|---|---|
| `SUBERR-ENTER-01` | Clause 13.3.4 plus exact one-child profile | entry relation, evaluator, soundness, freshness law | independent entry transition | persisted/replayed child occurrence | wrong scope/cardinality rejection | not claimed |
| `SUBERR-WAIT-01` | Parallel fork plus scoped ownership | two-wait and permutation laws | two-wait and permutation checks | two passive Updates available after restart | swapped flow/node declaration order | not claimed |
| `SUBERR-THROW-01` | Error End code and no normal output | throw premise in propagation relation | independent throw evaluation | Trigger Update invokes core closure | wrong Error reference/code admission rejection | not claimed |
| `SUBERR-PROPAGATE-01` | innermost direct-parent exact handler | uniqueness and evaluator soundness | independent handler resolution | committed Trigger result recovers after Worker loss | missing, catch-all, non-direct, duplicate handler rejection | not claimed |
| `SUBERR-INTERRUPT-01` | interrupting boundary cancellation | subtree-removal law and global-cancellation non-law | exact owner removal | post-Update Workflow state | bypass mutation and unrelated-root counterexample | not claimed |
| `SUBERR-OBSERVE-01` | boundary exception flow | concrete post-catch state | canonical post-catch state | Query after Trigger Update | sibling-retention mutation | not claimed |
| `SUBERR-REFUSE-01` | selected operational refusal | stale child command preserves state | same refusal and preservation | fresh stale Update result | changed-state rejection mutation | not claimed |
| `SUBERR-COMPLETE-01` | outer User Task and None End | exact completion witness | exact completion witness | completion and history replay | wrong recovery occurrence refusal | not claimed |
| `SUBERR-ADMIT-01` | selected narrowing | program rejection | source/program rejection | typed pre-start rejection | every excluded handler shape | not claimed |

The shared XML-to-checked-source producer remains the principal correlation risk. Lean begins from the checked graph and independently checks lowering; it does not provide a second XML parser. Source-containment, attachment, and Error-reference mutations are therefore consistency guards, not a falsely independent source lane.

## Versioning consequences

This section is provisional until the ordinary embedded Sub-Process capsule closes. Rebase it on the then-current checked-source, Semantic Process definition, runtime ownership, schema, host-capability, and evidence contracts; remove every replacement already completed by that foundation and keep only the additive Error propagation, handler, cancellation, and observation consequences.

This is a breaking pre-release representation change and must replace every current producer and consumer atomically if approved.

The atomic change includes:

- checked BPMN node and graph contracts, validators, JSON Schema, source compiler, CMOF/XSD manifest facts, and source fixtures;
- Semantic Process definition contracts, operation union, scope/handler tables, validation, lowering, JSON Schema, TypeScript readers, Lean readers, and contract artifacts;
- runtime-state ownership, scope occurrence representation, pure evaluator, declarative Lean relations, executable Lean evaluator, and serialization boundaries;
- profile capability tables, scoped generic graph facts, targeted closure/enabledness/resumability gate, and architecture guard against topology predicates;
- all exhaustive switches, closed-kind guards, deep-readonly compile checks, artifact generators, scenario runners, differential comparators, verifiers, and mutations affected by the replaced unions;
- the new answer-free scenario and verifier-only expected result;
- Temporal Workflow state, Query and Update integration, pre-start host-capability predicate, restart/replay/bypass tests, exact Event History assertions, and production lifecycle documentation;
- [Semantic Process IL](../SEMANTIC-PROCESS-IL-SPEC.md), [profile-parameterized admission](../PROFILE-PARAMETERIZED-ADMISSION-SPEC.md), [Temporal lifecycle](../TEMPORAL-PROCESS-LIFECYCLE-SPEC.md), the [BPMN requirement ledger](../BPMN-REQUIREMENT-LEDGER.md), [testing specification](../TESTING-SPEC.md), [implementation map](../IMPLEMENTATION-MAP.md), and [plan](../PLAN.md).

The current eleven-field canonical observation denominator, closed `activeWait.kind` values, fidelity table and schema-depth guard, Java CIB projector, retained CIB evidence, and CIB replacement command remain unchanged because this capsule adds no observation field, wait kind, or CIB target. Their guards must nevertheless prove that no accidental scope field or CIB claim was introduced.

No legacy reader, compatibility switch, migration function, Workflow patch branch, retained Event History, or embedded format counter is added under the pre-release policy.

## Required, optional, and excluded work

Required work is the exact profile, scoped checked graph, `enterScope` and `throwError` semantics, runtime ownership, direct-parent exact handler, regional cancellation, public sibling-removal and stale-refusal witnesses, Lean soundness and laws, independent TypeScript behavior, targeted preservation gate, Temporal restart/replay/bypass evidence, and same-change documentation closure.

No optional implementation is selected. If work uncovers a genuinely material normative ambiguity, implementation stops; a separately authorized read-only CIB probe cannot enter the target set or change semantics without a relationship classification and owner amendment.

Excluded work is normal Sub-Process completion, normal outgoing Sequence Flow from the Sub-Process, arbitrary or recursive nesting, multiple scope occurrences, multiple or catch-all handlers, unmatched-Error runtime behavior, Error payload/data mapping, Intermediate Throw Error, Service Task faults, Event Sub-Processes, boundary handlers on other Activity kinds, Call Activities, transactions, compensation, termination, escalation, non-interrupting handlers, multi-instance, loops, concurrent command semantics, CIB compatibility, A12 façade adoption, and public scope-tree observation.

## Acceptance and stop conditions

Implementation may begin only after the owner approves this exact product claim, standards-only target, error-only Sub-Process source shape, internal scope occurrence with unchanged public task identity, atomic throw/catch/cancel closure, and complete pre-release replacement list.

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
- implementation would silently establish normal Sub-Process completion, unmatched-Error behavior, Event Sub-Process semantics, or another excluded proposition.

## Re-open conditions

Open a separate capsule when a consumer requires ordinary Sub-Process completion, an outer normal route, a second nesting level, repeated or multi-instance scope occurrences, multiple handler search, catch-all matching, unresolved Error observation, Event Sub-Processes, scope-local variables, compensation, or a CIB/A12 compatibility overlay.
