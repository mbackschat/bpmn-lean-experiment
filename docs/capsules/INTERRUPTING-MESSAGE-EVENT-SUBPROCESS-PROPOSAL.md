# Interrupting Message Event Sub-Process proposal

## Status

Lifecycle: owner-approved
Review: approved

## Question and boundary

Can one parent-owned Message subscription interrupt all remaining ordinary work in a Process, create one Event Sub-Process handler, and retain the parent context until that handler finishes without inventing a normal parent continuation?

This is the third owner-selected semantic increment in [PLAN](../PLAN.md#ordered-work), outside frozen MUE acceptance. Private Lean/TypeScript semantics precede live hosting and public registration. Independent proposal approval is required before implementation; the [subscription specification](REPEATABLE-EVENT-SUBSCRIPTIONS-SPEC.md) does not already admit Event Sub-Processes.

## Source basis and interpretation

The pinned [Markdown specification and normative artifacts](../reference/bpmn-2.0.2/README.md#reading-workflow) are the primary sources. Clause 10.3.5 makes an Event Sub-Process dormant outside normal Sequence Flow, with exactly one triggered Start Event and no incoming or outgoing parent flows. Clause 10.5.2, Tables 10.86 and 10.87, supplies Message Start and `isInterrupting`; CMOF/XSD default that attribute to true and `SubProcess.triggeredByEvent` to false. Clauses 13.2, 13.3.2 and 13.5.4 govern quiescence, interruption, preserved context and handler completion.

The issue audit on 2026-10-03 consulted OMG's HTML records. Resolved [BPMN2-169](https://issues.omg.org/issues/BPMN2-169) distinguishes immediate interruption of ordinary work from retirement of the parent after the handler ends. Resolved [BPMN2-201](https://issues.omg.org/issues/BPMN2-201) connects Message Event Sub-Process correlation to Receive Tasks; this proposal selects exact occurrence addressing, not key or predicate correlation. Open [BPMN21-234](https://issues.omg.org/issues/BPMN21-234) concerns Multiple triggers and [BPMN21-236](https://issues.omg.org/issues/BPMN21-236) concerns omitted trigger classifications; neither selects additional triggers here.

Clause 13.3.2's nested-termination sentence excludes Ready/Active work literally, conflicting with its lifecycle and interruption account. Reuse the reviewed [Sub-Process interruption interpretation](SUBPROCESS-BOUNDARY-TIMER-SPEC.md): interrupt all non-final ordinary work, including active User Tasks. Preserve the enclosing context while the handler runs. This is a standard-internal interpretation, not a CIB deviation.

The pinned [CIB Seven source](../SOURCES.md#cib-seven) supplies an independent practical comparison. `BpmnParse.parseScopeStartEvent` assigns the event scope to the handler's containing flow scope; `EventSubProcessStartEventActivityBehavior` delegates interruption to the enclosing Activity's start behavior. `MessageEventSubprocessTest.testInterruptingUnderProcessDefinition` checks parent subscription, normal-completion cleanup, handler execution and final cleanup. These inspected sources are not executed compatibility evidence. No new CIB relationship is selected; any later profile may reuse `CIB-AGR-0001` and `CIB-OP-0001` only for their existing User Task claims under the [relationship register](../CIB-BPMN-RELATION-REGISTER.md).

The new requirement is `BPMN-INTERRUPTING-MESSAGE-EVENT-SUBPROCESS-01`. It remains unsupported in the [requirement ledger](../BPMN-REQUIREMENT-LEDGER.md) until the complete bounded capability closes.

## Required, optional and excluded scope

Required: one private executable root Process with None Start → diverging Parallel Gateway → two ordinary User Tasks, each ending at its own None End. Start requires empty initial bindings and the exact pristine initial runtime state. The same Process contains exactly one Event Sub-Process whose body is Message Start → ordinary withdrawal User Task → None End. The Event Sub-Process has no parent Sequence Flow and no attached Boundary Event. All IDs are arbitrary valid globally distinct identities; exact ownership and references determine meaning. The two ordinary branches make scope-wide interruption observable independently of a single-task boundary handler.

The handler uses one inline MessageEventDefinition and the existing fully resolved operation-addressed Message/Interface/Operation channel, without payload. `triggeredByEvent="true"` is required; omitted or explicit `isInterrupting="true"` selects interruption. Parser-lossy Boolean lexemes retain the existing refusal policy; valid-but-deferred spellings are not alternative BPMN meanings.

Optional: display names and unordered declaration permutations. Neither can affect execution. Both ordinary task completion orders and Message delivery before either task completes or after either one completes must execute.

Excluded: non-interrupting or repeated handlers, another parent or handler topology, nested parents, multiple handlers, another trigger, rethrow, boundary Events, loops, Multi-Instance, Call Activities, Compensation, Transactions, effects, Timers, data mediation, Process Properties or new initial bindings, expressions, payload, key/global correlation, buffering, modeled sending, Message Flows, CIB subscription compatibility and platform workflows. These are admission restrictions, not the general meaning of Event Sub-Processes. The representation preserves parent/handler separation so later admission can broaden without reinterpreting this slice.

## Public contract

Start commits both ordinary tasks and one exact Message interaction. The handler has no runtime scope or executing flow-node occurrence yet. An accepted delivery consumes that subscription, cancels every remaining ordinary task/token in the root region, creates one fresh child handler scope, and reaches the withdrawal task in one atomic command closure. Already completed task history remains completed. No ordinary task can subsequently complete or resume a cancelled path.

Completing both ordinary branches without a Message completes the Process and withdraws the dormant subscription. Completing the withdrawal task closes the handler without producing a parent token, then retires the enclosing Process. While the handler runs, the existing coarse Process status remains Running; only handler work is enabled. Its final Completed status means execution has ended under the existing observation vocabulary, not that interrupted ordinary work succeeded. No new public Activity-state claim equates this coarse status to the standard's Terminating state.

Use the existing payload-free `deliverMessage` and exact subscription/channel identity, not the top-level `triggerMessageStart` command. Premature, stale, wrong-owner, wrong-channel, payload-bearing and second deliveries reject with complete state preservation and no publication. Task completion and Message delivery are ordered semantic inputs: completion of the last ordinary task first makes the Message stale; Message first makes the old completion stale. There is no BPMN priority rule or automatic retry.

E1 retains the exact Message interaction and command result. E2 publishes only executing flow nodes: dormant registration creates no child scope, handler Activity or waiting child Start occurrence. Triggering publishes cancellation of the live ordinary occurrences, creation of the handler scope and instantaneous Message Start, followed by the handler task. Handler completion retires its exact scope and task; normal completion without a trigger invents no handler lifecycle. The pure semantic accounts own these facts; Temporal and the platform may not derive them by state differencing.

## Representation and lifetime

Use one immutable declaration family rather than treating the dormant handler as an ordinary child or inventing a Sequence Flow. The checked form retains the Sub-Process and Start identities, containing/handler definition scopes, resolved channel, interruption and exact handler entry Sequence Flow. Independent lowering resolves that flow to a child-owned control place. The proposed IL declaration is:

```ts
type InterruptingMessageEventSubProcess = Readonly<{
  parentScopeId: string;
  handlerScopeId: string;
  elementId: string;
  startEventId: string;
  channel: MessageChannel;
  childEntry: string;
}>;

type EventSubProcessMessageSubscription = Readonly<{
  id: MessageSubscriptionId;
  owner: ScopeOccurrenceId;
  channel: MessageChannel;
}>;
```

Program `interruptingMessageEventSubProcesses` is an optional collection present exactly for this profile, with one declaration. RuntimeState `eventSubProcessMessageSubscriptions` is absent before start and on pre-existing profiles; successful start installs it and every subsequent state, including terminal state, retains the collection with zero or one live subscription. Lean carries the corresponding explicit lists with empty defaults. Each subscription has exactly one declaring Start, exact parent owner and exact channel. Dormant registration creates no handler scope or child token and has no duplicate mutable registration. Reuse the Message activation counter and require occurrence uniqueness across both ordinary Message waits and these subscriptions. Canonical ordering uses the existing complete occurrence identity.

A separate collection is selected because the existing Message wait requires a normal-flow output and is projected as an executing flow-node occurrence. A dormant parent listener has neither fact. It still publishes through the existing Message-interaction vocabulary; it is not a second transport or public command. Extend [runtime declaration binding](../RUNTIME-STATE-INVARIANT-SPEC.md#contract) with an explicit declaration-owned parent-listener case rather than weakening the declaring-operation scope equation for existing waits.

Arm the subscription atomically with creation of its parent scope. This profile creates only the hosting root; it does not add an always-enabled registration operation that could re-arm after delivery. Select exact identity, declaration, channel, fresh child occurrence and capacity from the predecessor before mutation. Triggering composes [retained-root regional cleanup](../../packages/semantic-core/src/semantic-process-scope-cancellation.ts) with fresh child creation, in that order, and preserves Process context and logical time. It never decreases a high-water counter; fresh child issuance advances only its own counter. Cleanup cannot delete the newly created handler or rewind historical completion counts. General data access and nested-parent activation remain unadmitted.

Dormant subscriptions are passive lifetime registrations, not work preventing natural completion. Ordinary scope completion withdraws its owned dormant subscriptions atomically after all ordinary work and live child scopes quiesce. Add a distinct `completeEventSubProcess` operation for handler completion: it requires exact declared live child/parent ownership and child quiescence, removes only the handler scope, and emits no parent token. Preserve existing `completeScope` root/ordinary-child meaning. Host cancellation and generic regional/instance removal must clear the new collection by exact ownership.

The family validator must reject non-pristine pre-start state, absent required storage, storage on another profile, duplicate/undeclared subscriptions, a missing listener while ordinary work is active, wrong parent/channel, simultaneous listener and active handler, ordinary work surviving alongside the interrupting handler, orphan or duplicate handler scopes, and aliasing across Message identities. Both command boundaries and continuation restore enforce the family account alongside existing predicates; finite admitted traces establish validity at every internal prefix. No general cross-language predicate-equivalence claim is selected.

## Rules and separating witnesses

| Rule | Required result | Nearest wrong account |
|---|---|---|
| `IMES-ARM-01` | One parent-owned listener exists before any handler scope. | Eager handler/task creation, child-owned dormant listener, duplicate arming. |
| `IMES-TRIGGER-01` | One delivery replaces all remaining ordinary work with one child handler. | Cancel only one task, create the handler before cleanup, retain an ordinary token. |
| `IMES-CONTEXT-01` | Parent context, counters and completed history survive interruption. | Reset the root or erase already completed work. |
| `IMES-EXPIRE-01` | Ordinary quiescence withdraws the listener and completes. | A dormant subscription prevents completion or survives terminal state. |
| `IMES-CLOSE-01` | Handler quiescence closes only that child without a continuation token. | Ordinary-child output is required or fabricated; parent retires while the handler is active. |
| `IMES-REFUSE-01` | Invalid/stale delivery and cancelled-task completion preserve complete state and publish nothing. | Channel-only matching, second handler, partial cancellation before refusal. |
| `IMES-OBSERVE-01` | Exact E1 interactions and E2 lifecycles distinguish dormant listening, interruption and handler work. | Premature Start/handler occurrence, missing cancellation or fabricated successful ordinary completion. |
| `IMES-CLOSURE-01` | Accepted commands settle within the unchanged internal bound. | Startup omits a branch, handler completion deadlocks, or insufficient fuel publishes a partial change. |

Use a project-authored application-review model with parallel eligibility and document checks and a withdrawal handler. Retain both normal completion orders, withdrawal before any completion, withdrawal after either completion, both last-completion/Message schedules, stale commands, wrong identity/channel, alpha-renamed IDs and malformed source/Program ownership. Constructed-state probes additionally preserve a distinct outside region and nonempty parent context without claiming those are admitted source compositions.

Start has initiation, fork and two task arms; Message delivery reaches one handler task; handler completion has End, handler closure and root closure. Verify actual scheduled counts and the complete initial two-offer frontier in both accounts, all eligible arm orders and canonical publication, plus one-less-fuel atomic refusal. Keep the existing eight-operation limit; finite source size alone is not a closure argument.

## Lean assurance lane

Lane shape: proved

Evidence: reuse [regional cancellation](../../BpmnSemantics/SemanticProcess/ScopeCancellation.lean), [scope completion](../../BpmnSemantics/SemanticProcess/ScopeCompletion.lean) and existing [execution assembly](../../BpmnSemantics/SemanticProcess/Execution.lean). New declarative relations and evaluator-soundness bridges must cover parent registration, Message interruption and no-continuation handler completion.

Quantified laws establish exact listener issuance and binding, no handler before triggering, atomic all-region withdrawal with outside/context/counter frames, exact fresh handler creation, stale-identity refusal under explicit uniqueness, passive-listener expiry and token-free child disposal. Conclusions cannot be premises disguised as successful successor construction. Existing generic predicates and predecessor theorem propositions retain their meanings; extend field frames where the new collection requires them.

Bound the effort to three cohesive new law owners of at most 800 nonblank lines each: registration/binding, interruption/framing, and completion/refusal. One additional conformance owner, also at most 800, checks independently stated source/Program discrimination, complete scheduled traces, every reached validity prefix and E1/E2 expectations. Runtime helpers remain separate from proofs. This proves the named local laws and checks the bounded composed executions; it claims no universal reachable-state preservation, arbitrary-graph progress, fairness or cross-language equivalence theorem. Reassess before exceeding the bound or changing the lane. Lean remains serialized at one CPU and 3 GiB without extra swap; the deferred cold aggregate investigation is not reopened by this proposal.

## Temporal hosting and refinement preflight

Durable ingress is the existing content-bound start, User Task completion and direct Message Update path. The live population is two passive tasks plus a Message listener, or one handler task. No Timer, Activity effect, Child Workflow, retry policy or physical clock is required. [Host admission](../../packages/temporal-adapter/protocol/src/host-admission.ts) already distinguishes passive populations from managed Timer/effect concurrency, but the new profile must remain explicitly unavailable until its complete state/publication consumers and hosting witness pass.

The refinement relation preserves the declaration, parent listener, handler scope, cancelled/remaining work, context, counters, E1/E2 publications and command recovery exactly across Worker replacement, replay and Continue-As-New. Preserve accepted command order and content-bound deduplication: retrying one accepted delivery recovers its result; a distinct second delivery rejects. Do not inherit the repeatable-Timer profile's completion-first readiness rule. Rollover must fence and settle accepted handlers and carry the complete new collection under unchanged byte/count limits; omission or contradictory owner/channel data rejects restore.

The smallest live witness starts with both tasks and the listener, forces continuation and Worker replacement, delivers withdrawal with response-loss recovery, verifies both tasks cancelled and one handler, then completes it and replays every Run. A separate normal path proves subscription expiry, and both final-task/Message orders prove the race boundary. Host termination never fabricates handler completion or a BPMN Message. These are deferred closure obligations; source/Lean/core acceptance is not hosted qualification.

## Versioning consequences

Apply the [pre-release evolution policy](../PROJECT-DESIGN.md#pre-release-evolution-policy): migrate changed current contracts and every producer/consumer atomically, without legacy readers, compatibility branches or a durable-history promise. Existing source/profile meanings and retained CIB results remain unchanged.

The proposed additions bind source admission, checked/IL declarations, both decoders/lowerings, root initialization, Message projection/delivery, cancellation, completion, runtime validity, internal scheduling, E1/E2 publication and strict continuation together. [Shared contracts](../../contracts/README.md), [source ownership](../../packages/bpmn-source/README.md), [core ownership](../../packages/semantic-core/SOURCE-MAP.md), [IL](../SEMANTIC-PROCESS-IL-SPEC.md) and [Temporal ownership](../../packages/temporal-adapter/SOURCE-MAP.md) must be reconciled in the same implementation. `completeEventSubProcess` requires every strict operation-kind consumer to migrate, including Product 2's enum reader; it adds no platform workflow.

`what-binds` was run on 2026-10-03 against `575b2163`. Re-run it on concrete added/grown paths before editing; no new limit exception is authorized.

### Owners this implementation grows

| Owner | Remaining headroom to the 800-line review target | Constraint |
|---|---|---|
| [IL contract](../../packages/semantic-core/src/semantic-process-contract.ts) | 143 | Keep declaration details in one family owner. |
| [Runtime state](../../packages/semantic-core/src/semantic-process-state.ts) | 355 | Add the distinct parent-listener collection without duplicating it. |
| [Scope runtime](../../packages/semantic-core/src/semantic-process-scope-runtime.ts) | 553 | Preserve ordinary completion while withdrawing passive owned listeners. |
| [Root initialization](../../packages/semantic-core/src/semantic-process-triggered-start.ts) | 582 | Delegate atomic parent registration to the family owner. |
| [Checked graph](../../packages/semantic-core/src/checked-process-contract.ts) | 397 | Retain exact source ownership and entry flow. |
| [Open-set projection](../../packages/semantic-core/src/flow-node-occurrence-open-set.ts) | 20 | Add only a narrow hook to a cohesive family projection owner. |
| [Lifecycle projection](../../packages/semantic-core/src/flow-node-occurrence-lifecycle.ts) | 45 | Delegate cancellation and handler facts without generic state differencing. |
| [Host admission](../../packages/temporal-adapter/protocol/src/host-admission.ts) | 427 | Keep hosted capability closed until its own qualification passes. |
| [Lean state](../../BpmnSemantics/SemanticProcess/RuntimeState.lean) | 56 | Keep subscription types/runtime helpers in a cohesive family owner. |
| [Lean completion](../../BpmnSemantics/SemanticProcess/ScopeCompletion.lean) | 630 | Preserve ordinary-child continuation and add exact passive expiry. |
| [Lean cancellation](../../BpmnSemantics/SemanticProcess/ScopeCancellation.lean) | 555 | Classify the new collection in every removal path. |

### Atomic consumers and guards

Required guards include [schema coverage](../../scripts/contract-schema-coverage.test.ts), [definition artifacts](../../scripts/contract-definition-artifacts.test.ts), [projected source keys](../../packages/bpmn-source/test/projected-flow-element-keys.test.ts), [runtime removal completeness](../../scripts/runtime-collection-removal-completeness.test.ts), [operation consumers](../../scripts/semantic-operation-consumer-census.test.ts), [internal commutation](../../scripts/internal-commutation-census.test.ts), [canonical ordering](../../scripts/canonical-ordering.test.ts), [source hygiene](../../scripts/source-hygiene.test.ts) and [Lean cost](../../scripts/lean-module-cost.test.ts). Use red/green separating witnesses, focused then affected-package gates, bounded Lean elaboration and independent semantic-checkpoint review. Skip local performance tests.

The private profile is `bpmn-2.0.2-interrupting-message-event-subprocess-draft`. Before public support, register its whole model, exact scenarios/profile/pipeline binding, capability restrictions, generated corpus map and About disclosure atomically after live hosting passes. Closure separately reconciles the requirement disposition, evidence maps and cost against the existing Message-boundary and repeatable-subscription capsules. No public profile, corpus coverage or hosted support is claimed by this proposal.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `3404ddb0` | `fork-turns-none` | `approve` | `not-required` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
