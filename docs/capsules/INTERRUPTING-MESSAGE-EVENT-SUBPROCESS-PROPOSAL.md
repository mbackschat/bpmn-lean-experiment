# Interrupting Message Event Sub-Process proposal

## Status

Lifecycle: implementation-in-progress
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

Quantified laws establish exact listener issuance and binding, no handler before triggering, atomic all-region withdrawal with outside/context/counter frames, exact fresh handler creation, stale-identity refusal under explicit uniqueness, passive-listener expiry and token-free child disposal. Conclusions cannot be premises disguised as successful successor construction. Existing generic predicates and predecessor theorem propositions retain their meanings, except for the scoped domain corrections in the [child-entry amendment](#child-entry-assurance-amendment) and [foreign-runtime amendment](#foreign-runtime-assurance-amendment). Extend field frames where the new collection requires them.

Bound the effort to three cohesive new law owners of at most 800 nonblank lines each: registration/binding, interruption/framing, and completion/refusal. One additional conformance owner, also at most 800, checks independently stated source/Program discrimination, complete scheduled traces, every reached validity prefix and E1/E2 expectations. Runtime helpers remain separate from proofs. This proves the named local laws and checks the bounded composed executions; it claims no universal reachable-state preservation, arbitrary-graph progress, fairness or cross-language equivalence theorem. Reassess before exceeding the bound or changing the lane. Lean remains serialized at one CPU and 3 GiB without extra swap; the deferred cold aggregate investigation is not reopened by this proposal.

### Child-entry assurance amendment

The original proposal was independently approved at `3404ddb0`; that review remains the authority for the unchanged BPMN account. This amendment changes only the proof domain described below and requires its own proposal review before the helper correction. The current receipt records this amended target, not a withdrawal of the original semantic approval. Existing uncommitted implementation remains outside this documentation-only review target.

#### Contract and necessity

The existing [`child_entry_census`](../../BpmnSemantics/SemanticProcess/ScopeCreationLifecycleStructuralValidity.lean) concludes exactly one ordinary entry operation from Program admission, absent Compensation snapshots and a nested definition. The approved Message Event Sub-Process is nested, has no Compensation snapshots, and enters through its declaration with zero ordinary entry operations. Admission of that handler therefore invalidates the helper's former domain. This is a proof-domain correction; the Message handler account, ordinary scope execution and generic validity predicates keep their selected meanings.

Require an actual entry witness for the definition in `child_entry_census`: an operation belonging to `program.operations` whose `enteredChildScopeId?` is `some definition.id`. Retain the existing premises and exact-one conclusion. The additional premise establishes existence of an ordinary, bounded or monitored entry, not uniqueness, successful execution or successor validity. Do not substitute a global absence-of-Message-declarations premise: an ordinary scope's census depends on its own entry, not on whether another scope is an Event Sub-Process.

Preserve the complete theorem propositions of all three current consumers:

- `prepareInternalScopeCreation_child_excludes_bounded_entry` in [scope-creation structural validity](../../BpmnSemantics/SemanticProcess/ScopeCreationLifecycleStructuralValidity.lean).
- `created_bindings` in the same [scope-creation owner](../../BpmnSemantics/SemanticProcess/ScopeCreationLifecycleStructuralValidity.lean).
- `prepared_bounded_scope_preserves_structural_program_validity` in [bounded-scope projection](../../BpmnSemantics/SemanticProcess/InternalBoundedScopeProjection.lean).

Each consumer must derive the entry witness from its existing operation membership and definition binding. No caller may assume the census conclusion, successor validity or a new profile exclusion. This amendment authorizes only the helper proposition change; no new law module, wider assurance lane, BPMN capability, representation or hosting claim is selected.

#### Acceptance and exclusions

The existing single conformance owner must check both complete admission of the application-withdrawal Program and its nested handler's zero ordinary entries while Compensation snapshots are absent. These facts separate the amended domain from the old implication. Compile the corrected helper and all three consumers, retaining their proposition text, then include them in the affected semantic-checkpoint gate. Keep the three-law-owner and one-conformance-owner bounds, one Lean process tree, one CPU and 3 GiB without extra swap.

Reject a fabricated handler entry, rejection of the approved Message profile, an assumed exact-one result, weakening of the three consumer propositions, or suppressing any validity check. The independent review evaluates this amendment against the complete capsule; the subsequent semantic checkpoint must verify the implementation and separating witnesses. Cold aggregate resource acceptance and live hosting remain deferred.

### Foreign-runtime assurance amendment

The Message account at `3404ddb0` and child-entry amendment at `45a9eb4c` retain their recorded approvals. This additional amendment requires independent proposal approval before changing the structured-composition frame. The isolated kernel witness at `/tmp/imes-domain-probe-corrected` establishes that the existing `ForeignRuntimeEmpty` and `TaskLifetimeShape` admit an ordinary task state carrying a foreign Message listener, while actual command admission rejects every completion. Its Program is well formed, has a successful composition analysis and satisfies the helper's remaining ownership and nonempty-wait premises.

Extend the family-specific [`ForeignRuntimeEmpty`](../../BpmnSemantics/SemanticProcess/StructuredCompositionLifecycleProofs.lean) with `state.eventSubProcessMessageSubscriptions = []`. This explicitly strengthens the expanded predicate used by `LifecycleFrame` and the arbitrary-state helper [`exact_task_lifetime_has_admitted_completion`](../../BpmnSemantics/SemanticProcess/StructuredCompositionProgressProofs.lean). The resulting establishment and preservation propositions concern this stronger frame; unchanged declaration text alone is not proposition preservation. This is the only additional predecessor-domain exception beyond the child-entry amendment. Keep generic runtime validity predicates unchanged.

Preserve the complete premises and completion conclusion of `reached_task_has_admitted_completion`, deriving the stronger frame along actual committed-start reachability. Preserve the premises of `committed_start_has_lifecycle_frame`, `reached_state_has_lifecycle_frame` and the Transaction start laws. No caller may assume listener absence, successful completion or successor validity merely to recover these guarantees.

As an integration prerequisite, both accounts' Message-family admission gate must reject declarations as well as listeners on foreign profiles, with the complete predecessor state unchanged. An actually committed ordinary start then supplies declaration absence without a new well-formedness premise. The selected Message profile continues to validate its complete declaration graph. Keep raw start construction and unrelated failure classifications unchanged; malformed declarations must neither be silently ignored nor become a committed foreign listener.

The existing conformance owner must retain the ordinary-task state discriminator, positive ordinary and Message starts, and foreign-declaration start refusals on two predecessor profiles. The TypeScript gate needs the corresponding independent discriminators. Compile the stronger frame's establishment and preservation proofs and the unchanged reachable completion theorem. Retain three new law owners and one conformance owner, each within 800 nonblank lines; this amendment selects no additional BPMN behavior, assurance programme, live hosting or cold resource investigation.

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
| [IL contract](../../packages/semantic-core/src/semantic-process-contract.ts) | 116 | Keep declaration details in one family owner. |
| [Runtime state](../../packages/semantic-core/src/semantic-process-state.ts) | 344 | Add the distinct parent-listener collection without duplicating it. |
| [Scope runtime](../../packages/semantic-core/src/semantic-process-scope-runtime.ts) | 532 | Preserve ordinary completion while withdrawing passive owned listeners. |
| [Root initialization](../../packages/semantic-core/src/semantic-process-triggered-start.ts) | 579 | Delegate atomic parent registration to the family owner. |
| [Checked graph](../../packages/semantic-core/src/checked-process-contract.ts) | 385 | Retain exact source ownership and entry flow. |
| [Open-set projection](../../packages/semantic-core/src/flow-node-occurrence-open-set.ts) | 12 | Add only a narrow hook to a cohesive family projection owner. |
| [Lifecycle projection](../../packages/semantic-core/src/flow-node-occurrence-lifecycle.ts) | 26 | Delegate cancellation and handler facts without generic state differencing. |
| [Host admission](../../packages/temporal-adapter/protocol/src/host-admission.ts) | 384 | Keep hosted capability closed until its own qualification passes. |
| [Lean state](../../BpmnSemantics/SemanticProcess/RuntimeState.lean) | 27 | Keep subscription types/runtime helpers in a cohesive family owner. |
| [Lean completion](../../BpmnSemantics/SemanticProcess/ScopeCompletion.lean) | 587 | Preserve ordinary-child continuation and add exact passive expiry. |
| [Lean cancellation](../../BpmnSemantics/SemanticProcess/ScopeCancellation.lean) | 543 | Classify the new collection in every removal path. |

### Atomic consumers and guards

Required guards include [schema coverage](../../scripts/contract-schema-coverage.test.ts), [definition artifacts](../../scripts/contract-definition-artifacts.test.ts), [projected source keys](../../packages/bpmn-source/test/projected-flow-element-keys.test.ts), [runtime removal completeness](../../scripts/runtime-collection-removal-completeness.test.ts), [operation consumers](../../scripts/semantic-operation-consumer-census.test.ts), [internal commutation](../../scripts/internal-commutation-census.test.ts), [canonical ordering](../../scripts/canonical-ordering.test.ts), [source hygiene](../../scripts/source-hygiene.test.ts) and [Lean cost](../../scripts/lean-module-cost.test.ts). Use red/green separating witnesses, focused then affected-package gates, bounded Lean elaboration and independent semantic-checkpoint review. Skip local performance tests.

The private profile is `bpmn-2.0.2-interrupting-message-event-subprocess-draft`. Before public support, register its whole model, exact scenarios/profile/pipeline binding, capability restrictions, generated corpus map and About disclosure atomically after live hosting passes. Closure separately reconciles the requirement disposition, evidence maps and cost against the existing Message-boundary and repeatable-subscription capsules. No public profile, corpus coverage or hosted support is claimed by this proposal.

## Implementation progress

[`implementation-status-owner:ENGINE-SEMANTIC-FAMILY`](../ENGINE-SEMANTIC-FAMILY-IMPLEMENTATION-MAP.md#interrupting-message-event-sub-process) owns the exact private implementation and absence boundary.

Uncommitted work on 2026-10-03 implements source/IL admission, parent listener registration, regional interruption, passive expiry, token-free handler completion and E1/E2 publication in TypeScript. Both scheduling modes validate every reached prefix, both initial task-arm orders, exact 4/1/3 startup/delivery/handler-completion fuel and one-less-fuel rollback without publication. Continuation decoding preserves dormant and consumed-listener phases; host admission explicitly refuses this private profile pending its separate qualification.

The aggregate TypeScript runtime gate now enforces the family validator, including missing/duplicate listeners and counters, wrong ownership/channel, simultaneous handler/listener, surviving ordinary work, orphan handlers and ordinary-Message identity aliases. The separating red showed that direct command refusal alone did not establish generic state validity; the corrected aggregate gate and the full semantic-core suite pass.

Lean's three approved local law owners now compile: [registration/binding](../../BpmnSemantics/SemanticProcess/InterruptingMessageEventSubProcessRegistrationLaws.lean), [interruption/framing](../../BpmnSemantics/SemanticProcess/InterruptingMessageEventSubProcessInterruptionLaws.lean), and [completion/refusal](../../BpmnSemantics/SemanticProcess/InterruptingMessageEventSubProcessCompletionLaws.lean). They connect explicit declarative relations to the family helpers and establish listener issuance, fresh-child selection, regional withdrawal, outside Task/listener preservation, Process-data/history frames, token-free child disposal and passive expiry. Lean now dispatches token-free handler completion and selects its child-only lifecycle terminal. Process-start admission installs the parent listener without creating a handler; a kernel witness connects that committed state to the declarative registration relation. The family state validator rejects altered pre-start state, missing listeners during ordinary work, duplicate issuance history and simultaneous listener/handler phases, alongside the unchanged generic invariant. Direct Message admission now consumes the listener, cancels both live ordinary tasks and their Activity records, retains the parent and creates only the handler entry token; the successor passes family and generic validity. The independent handler open projection and candidate lifecycle fold pass dormant/triggered/completed-state checks and reject orphan handlers and mismatched successors. Scheduled startup, withdrawal and handler completion now pass with respectively five, two and four aligned transition/lifecycle entries. E1 now exposes the dormant parent listener without an active child wait. The bounded matrix checks both scheduling modes, both task-arm orders, both ordinary completion orders, withdrawal before or after either task, both final-completion/Message races, exact fuel and atomic one-less-fuel rollback, every replayed prefix, and strict replay. Invalid, future, foreign, wrong-channel, payload-bearing and stale commands preserve state and publish nothing. These are bounded execution checks, not a complete checkpoint or full-library result.

Lean now also passes complete checked-source admission, independent Program-profile admission, source-to-IL lowering and complete Program structural/graph admission. The [single conformance owner](../../BpmnSemantics/InterruptingMessageEventSubProcessConformance.lean) distinguishes declaration-owned entry and token-free completion, rejects injected declarations on older profiles, shared ordinary-task outputs, wrong handler ownership and ordinary-child completion, and retains the ordinary-profile control. These admission checks remain separate from the bounded runtime matrix above. The reviewed child-entry amendment and all three consumers compile with the consumer propositions unchanged; the generic initialization proof also compiles after deriving the existing snapshot fact through the extended admission conjunction and proving the singleton Message-counter order. The earlier failed proof gate remains retained. The existing task-completion equality proposition also compiles unchanged after a local phase-frame law relates task-wait removal to its successor token.

The [source-bound comparison](../../packages/differential/test/interrupting-message-event-subprocess-lean-core.integration-test.ts) checks independent Lean lowering and complete E1/E2 equality across five schedules, including stale-command refusal and replay. Its red result separated a missing handler open-occurrence dispatch in the Lean JSON emitter; the corrected emitter passes. This comparison supplies finite cross-language evidence without a correspondence theorem.

The initial full-library gate exposed nine predecessor proof-script failures; their focused correction passes 304 jobs (`/tmp/imes-proof-consumers-corrected`). The next complete gate remains failed at `/tmp/imes-library-corrected`: child-completion framing, composition closure and Transaction initialization were its three failed modules. The child-completion frame now permits passive-listener expiry, and composition closure compiles (`/tmp/imes-frame-consumers`); that receipt still fails in the downstream composition lifecycle owner. Transaction initialization now derives declaration absence from its existing well-formedness and profile assumptions, with no changed proposition.

The foreign-declaration start discriminator fails as intended in `/tmp/imes-foreign-declaration-lean-red`. Both accounts now reject foreign declarations at the existing family gate, before start construction, preserving the complete predecessor state. TypeScript's direct runtime validator also failed the separating test before correction (`/tmp/imes-foreign-declaration-ts-red`). Its corrected complete core passes 1,524 tests, and harness types pass. Lean passes the bounded conformance owner and Transaction proof together in `/tmp/imes-foreign-declaration-lean-green` (332 jobs, 1,923,620,864-byte cgroup peak, zero limit/OOM events, pressure or swap). The stronger composition frame is verified separately below.

The reviewed stronger frame is implemented: committed foreign-profile starts establish declaration absence, admitted composition steps and completions preserve listener absence, and the existing reachable-task completion and bounded scheduled-closure declarations remain unchanged. The focused progress gate passes all 260 jobs (`/tmp/imes-frame-progress-green`), at 310,124,544-byte cgroup peak with zero limit/OOM events, pressure or swap. The retained conformance discriminator proves that an injected listener leaves ordinary task lifetime and ownership intact but violates the strengthened frame and rejects every completion without mutation (`/tmp/imes-frame-discriminator`, 281 jobs, 1,743,171,584-byte peak, zero limit/OOM events, pressure or swap). TypeScript independently checks ordinary and data-bearing completions against their valid predecessors; the complete core passes 1,525 tests and harness types pass. The complete library and separately gated experiment now pass as recorded below; independent checkpoint approval is recorded below.

The final integration correction preserves Transaction command/start and reachable-phase propositions by separating unchanged-state family rejection from admitted dispatch. Regional completion's exact record-update laws now include expiry of listeners owned by the completed scope; the dependent completion/completion, return/completion and completion/cancellation laws prove those filters commute. No additional predecessor-domain premise was introduced. `/tmp/imes-complete-proof-integration` passes the complete 732-job library and 283-job checked-source experiment under one CPU, 3 GiB and no additional swap, with 678,731,776-byte cgroup peak and zero limit/OOM events, pressure or swap. All 759 current Lean/build inputs match the mounted snapshot. Earlier failed integration receipts remain retained.

The four changed conformance source owners have fresh memory measurements in [the cost record](../../scripts/lean-module-cost.ts), bound to exact mounted bytes and completed receipts: `/tmp/imes-activity-issuing-cost`, `/tmp/imes-sequential-binding-cost`, `/tmp/imes-metadata-warm-cost` and `/tmp/imes-frame-discriminator`. Each compiles only its target against warm dependencies under one CPU, 3 GiB and no additional swap, with zero limit/OOM events. The four measured dependency closures and build inputs remain byte-identical: 78, 270, 288 and 286 inputs respectively, checked after the final integration corrections. This is individual target evidence; cold aggregate resource acceptance remains deferred.

Current separately asserted receipts:

| Gate | Result | Receipt |
|---|---|---|
| Semantic core, including foreign declarations and listener-contaminated task states | 1,525 passed | `/tmp/imes-frame-core-complete` |
| Complete infrastructure and harness types | 626 passed | `/tmp/imes-final-infrastructure-loopback` |
| Protocol | 145 passed | `/tmp/imes-protocol-final` |
| Platform publication reader | 18 passed | `/tmp/imes-platform-publication-tests` |
| Source hygiene, removal and ordering | 35 passed | `/tmp/imes-publication-hygiene` |
| Focused core/protocol test types | Passed | `/tmp/imes-runtime-invariant-types` |
| Three local Lean law owners and Program operation decoder | Passed, 38 build jobs | `/tmp/imes-lean-local-laws-complete` |
| Complete source/Program admission, lowering and proof-contract counterexample | Passed, 67 build jobs; bounded cgroup peak 742,244,352 bytes, no pressure/OOM/swap | `/tmp/imes-program-admission-green` |
| Publication/schema coverage and Lean source contracts | 27 passed | `/tmp/imes-admission-source-guards` |
| Ordinary-entry helper and three unchanged consumer propositions | Passed, 197 build jobs | `/tmp/imes-child-entry-consumers-fifth` |
| Handler completion dispatch and child-only lifecycle candidate | Passed, 153 build jobs; bounded peak 1,550,512,128 bytes, no pressure/OOM/swap | `/tmp/imes-completion-publication-green` |
| Start registration, declarative registration bridge and family/generic state checks | Passed, 156 build jobs; bounded peak 946,290,688 bytes, no pressure/OOM/swap | `/tmp/imes-start-registration-green` |
| Generic initialization proof after listener registration | Passed, 127 build jobs | `/tmp/imes-start-proof-correction` |
| Direct Message ingress after four explicit startup choices, both-task cancellation and successor validity | Passed, 157 build jobs; bounded peak 896,114,688 bytes, no pressure/OOM/swap | `/tmp/imes-message-delivery-green` |
| Lean source contracts, module bounds, runtime removal, plan and RC guards | 62 passed | `/tmp/imes-lean-ingress-source-guards` |
| Independent handler projection and lifecycle fold | Passed, 158 build jobs; bounded peak 942,338,048 bytes, no pressure/OOM/swap | `/tmp/imes-handler-lifecycle-green` |
| Completion-position proof and scheduled-trace dependency closure | Passed, 243 build jobs; predecessor completion proposition preserved | `/tmp/imes-scheduled-prerequisites-frame` |
| Scheduled startup, withdrawal and handler completion with aligned publications | Passed, 267 build jobs; bounded peak 1,036,079,104 bytes, no pressure/OOM/swap | `/tmp/imes-scheduled-publication-green` |
| Lifecycle candidate/projection independence guard, including the new family owner | 19 passed | `/tmp/imes-candidate-independence-green` |
| Complete bounded Lean scheduling, refusal, prefix validity, replay and E1/E2 matrix | Passed, 275 build jobs; bounded peak 1,729,949,696 bytes, no pressure/OOM/swap | `/tmp/imes-e1-and-schedule-matrix-green` |
| Lean JSON interpreter publication dispatch | Passed, 278 build jobs | `/tmp/imes-json-publication-hook` |
| Source-bound independent lowering and five Lean/core E1/E2 schedules | Passed on current sources and rebuilt TypeScript, pinned Node 24.18.0, one CPU/3 GiB; 263,856,128-byte peak, zero limit/OOM events, pressure or swap | `/tmp/imes-bounded-parity` |
| Complete Lean library and checked-source experiment | Passed, 732 and 283 jobs | `/tmp/imes-complete-proof-integration` |
| Complete Product 1 harness types | Passed | `/tmp/imes-foreign-listener-types-corrected` |
| Assurance reachability, frozen experiment census, scope-entry regression and Lean test-lane guards | 21 passed | `/tmp/imes-import-and-scope-consumers-green` |

The earlier publication-coverage failure remains retained at `/tmp/imes-publication-schema-green` (provisional name, failed verdict). Its missing operation encoding and decoding arms are now present; the green source guard is not execution evidence for that operation. The complete proof-consumer gate and independent semantic-checkpoint review are green. Registration and hosting remain separate deferred qualification lanes. The infrastructure sandbox run `/tmp/imes-final-infrastructure-practical` failed only because loopback binding was denied; the permission-enabled run above passes the unchanged test. No performance, cold aggregate resource or live hosting qualification was run.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `21f47214` | `fork-turns-none` | `approve` | `not-required` |
| Semantic checkpoint | `c2132704` | `fork-turns-none` | `approve` | `not-required` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |

The independent review of `21f47214` approved the foreign-runtime amendment without findings. Packet `13ebf7f4bf52fa003c115f1919f200a9505cafa7dd6fc5da38004144fc2ffcef` binds the proposal target; 54 documentation guards and two assurance-lane guards pass. The reviewer checked the frozen diagnostic predicate copies against the target. This approves the scoped proof-domain correction, not the unfinished implementation or a reachable-deadlock claim.

The independent semantic-checkpoint review of `c2132704` approved without required findings. Packet `e850c4f14a7f2f3be14fdf8084875dfe9105ce21bf8d6bf87dbc90382e34928d` binds the target and baseline `4826c2c0`. The reviewer passed 109 focused tests and 126 guards, exercised outside-region/data/history preservation and identity-exhaustion refusal, verified the retained complete Lean/parity receipts and byte-compared their frozen inputs. No additional Lean probe was needed. The advisory invariant-map summary correction changes no semantic claim. This approves the bounded private account only; registration, CIB comparison, corpus/platform support and production hosting/replay closure remain outside.
