# Repeatable Event subscription lifetime proposal

## Status

Lifecycle: draft
Review: pending

## Question and boundary

How do the selected RC Message and Timer subscriptions remain available for the lifetime of their catching locus, allow overlapping non-interrupting handler work, resolve completion/trigger races explicitly, and disappear with exactly the scope or Activity that owns them?

This proposal owns the subscription-lifetime account required by [the RC content boundary](../PLAN.md#mue-release-candidate-critical-path). It is not implementation authority yet. The [open design obligations](#open-design-obligations) must close before proposal review; in particular, a root-only repeated-handler example cannot substitute for the selected catch, Activity-boundary, and nested-cleanup boundary. Existing profiles and their same-activation refusals remain unchanged.

The [dependency findings](../INTERNAL-COMMUTATION-PROPOSAL.md#subscription-dependency-findings) establish the starting point: exact Activity ownership already exists; ordinary User Task identities can distinguish overlapping handler instances; the one-shot Timer owner cannot directly replace a fired identity; and the current rollover fence prevents continuation while that owner remains armed. These are implementation constraints, not a selected scheduling policy.

## Normative basis and compatibility

[BPMN 2.0.2](https://www.omg.org/spec/BPMN/2.0.2/PDF), with locally verified provenance in [the reference owner](../reference/bpmn-2.0.2/README.md), supplies the semantic basis. Clause 13.5.2 makes a normal-flow catch consume an occurrence and continue. Clause 13.5.3 distinguishes interrupting and non-interrupting boundaries. Table 10.91 permits concurrent instances of a non-interrupting handler; Table 10.101 distinguishes duration, date, and recurring-interval Timer expressions. Clause 13.2 governs completion in the presence of remaining work. The existing [Sub-Process Timer account](SUBPROCESS-BOUNDARY-TIMER-SPEC.md) owns the reviewed nested-cancellation interpretation; this proposal must preserve it.

Repeated boundary triggering is different from repeatedly entering a normal-flow catch. A normal-flow catch consumes its current wait; another control-flow arrival creates another wait. A non-interrupting boundary remains associated with its still-active host and may produce another handler path without completing the earlier path.

No CIB compatibility relationship or oracle result is selected. Existing key-correlation and payload profiles retain their own contracts. A new requirement for a CIB-specific delivery, buffering, expression, or race rule must return to [the relationship register](../CIB-BPMN-RELATION-REGISTER.md), rather than becoming implicit policy here.

## Required surface and source admission

The scope is the selected RC capability, not a new general BPMN profile:

| Locus | Required lifetime obligation | Existing contract retained |
|---|---|---|
| Intermediate Catch Message and Message-addressed Receive Task | One wait per reached occurrence, exact consumption, fresh identity on later arming, complete owner cleanup | [Intermediate catch](INTERMEDIATE-CATCH-MESSAGE-SPEC.md), [Receive Task](RECEIVE-TASK-MESSAGE-SPEC.md), and separately selected payload/correlation accounts |
| Intermediate Catch Timer | One exact deadline per reached occurrence, stale-fire refusal, withdrawal with its owner | [Intermediate Timer](INTERMEDIATE-CATCH-TIMER-SPEC.md) |
| Message boundary on an admitted Activity host | Interrupting victory withdraws the host; non-interrupting delivery preserves the subscription and can create overlapping paths | [Current User Task boundary](ACTIVITY-BOUNDARY-MESSAGE-SPEC.md); other host kinds require an explicit admission decision |
| Timer boundary on an admitted Activity host | Preserve one-shot interruption/monitoring, add recurring non-interrupting firing with exact successor identity and deadline | [User Task interruption](ACTIVITY-BOUNDARY-TIMER-SPEC.md), [monitoring](NON-INTERRUPTING-BOUNDARY-TIMER-SPEC.md), and [Sub-Process interruption](SUBPROCESS-BOUNDARY-TIMER-SPEC.md) |
| Subscription inside an admitted embedded scope | Normal host completion withdraws future triggers without cancelling already spawned sibling paths; regional cancellation removes all work in the cancelled region and preserves outside work | [Activity ownership](../ACTIVITY-OCCURRENCE-OWNERSHIP-SPEC.md) and [Terminate](TERMINATE-END-EVENT-SPEC.md) |

Source admission must use the existing profile-parameterized graph validation, with explicit mechanism/cardinality capabilities. It must not add another whole-topology disjunct. The final admission table must name host kinds, scope depth, boundary multiplicity, recurring expression grammar, allowed handler paths, and every concurrent Timer/Message/effect wait shape. The presence of an existing operation in the IL does not grant source or Temporal admission.

The proposed first recurrence grammar is `timeCycle` containing `R/PT1S`, with no `timeDate` or `timeDuration` sibling. This isolates recurrence using the existing duration magnitude; it does not claim general ISO-8601 expression support. Finite recurrence counts, calendar arithmetic, expressions, multiple boundaries on one host, and recurrence on a Timer Start are not silently selected. Whether this expression boundary and the final host/graph capabilities discharge the full RC row is an explicit proposal-review question, not inferred from a passing witness.

## Proposed lifetime and identity contract

`ESL-OWN-01` — Reuse the existing Activity record as the ownership edge between an exact body and its attached waits. A firing never reconstructs ownership from equal activation ordinals. The record persists while its body remains live, including after a one-shot handler has been consumed.

`ESL-MESSAGE-01` — A non-interrupting Message boundary keeps one subscription identity for the lifetime of its host occurrence. Each distinct accepted Message command consumes one Message occurrence, produces one boundary-path token, and leaves the subscription available. Two distinct commands targeting that live subscription may both commit while the first handler path remains active. Reusing a command identity with identical content follows the existing command-recovery contract; it is not a second Message occurrence. Conflicting content remains an identity conflict. A delivery after withdrawal is stale and preserves semantic state.

This choice avoids requiring callers to rediscover a new subscription between every pair of Messages. It also avoids making two already accepted, distinct deliveries compete for a one-shot subscription accidentally. Normal-flow Message catches and interrupting boundaries retain their consuming behavior. Payload and key-correlation bindings cannot be inherited by the new boundary arm without their own explicit source and data account.

`ESL-TIMER-01` — Each recurring firing consumes its exact Timer occurrence and atomically installs the next occurrence while preserving the host. The successor draws a fresh Timer activation from the existing high-water counter and replaces the old tagged attachment in the same Activity record. Its logical deadline is the preceding deadline plus the admitted period, not the time at which handler work finishes. The old firing identity cannot fire the successor. Overflow or capacity refusal rolls back the complete command, including the new path and replacement wait.

`ESL-SPAWN-01` — Every committed non-interrupting trigger produces one token on its boundary Sequence Flow. Handler paths use ordinary occurrence allocation and token multiplicity; they do not reuse the host's task identity or overwrite an earlier handler occurrence. Handler completion does not close the subscription or complete the host.

`ESL-CLOSE-01` — Normal host completion atomically withdraws its remaining attached subscriptions and retires its Activity record. Already spawned paths live in their declared containing scope and remain runnable. Process or Sub-Process completion still requires all remaining work to quiesce.

`ESL-CANCEL-01` — Cancelling a region withdraws every subscription and spawned path owned inside that region, plus attached waits whose Activity body is removed even when the wait itself is parent-owned. Work outside that ownership closure survives. Cancellation never rewinds activation counters. Removing an inner region is not permission to cancel a handler path already running outside that region.

## Commands and publication

The semantic core continues to receive an explicit ordered sequence of stimuli. Completion then trigger and trigger then completion are distinct valid schedules; the first can prevent handler creation, while the second can leave a handler running after host completion. They are a checked non-law of commutation, not candidates for independent batching.

The final new-profile host contract must choose an explicit linearization for competing ingress, including a co-ready completion and trigger. The existing fail-closed same-activation policy is not changed by this draft. SDK callback order, Signal-before-Update sorting, and lexicographic command IDs are not adopted as a winner by accident.

Publication keeps three facts distinct: the open subscription, the instantaneous caught Boundary Event, and the handler's ordinary running occurrences. The [current Message occurrence tests](../../packages/semantic-core/test/activity-boundary-message-occurrence.test.ts) already distinguish the wait anchor from the transition anchor. For the proposed repeated Message arm, the subscription wait remains open across deliveries while each committed delivery receives a distinct transition-anchored event occurrence. Timer replacement publishes the successor open deadline, and each caught event remains instantaneous. A retry, stale callback, or rolled-back command creates no new committed occurrence or publication revision.

## Temporal hosting and refinement preflight

Message ingress uses the existing content-bound Signal/result recovery path and task completion uses the existing Update path. Neither transport acceptance nor a native Timer callback is a semantic commit. No Temporal Activity, Child Workflow, external effect, or new message broker is required solely to repeat a boundary handler.

The state relation must bind committed semantic state, command recovery, publication, and each managed native Timer to its exact live semantic Timer identity. A firing handoff has three distinct states: the old callback is reconciled; the semantic successor wait exists; and a native Timer for that successor is installed. Only the first and third are host facts. There must be no externally visible semantic gap between consumption and replacement.

The proposed host handoff clears the reconciled old native owner before installing its successor, retaining the owner's stale-callback suppression. A requested Continue-As-New may occur at that intervening host checkpoint only after accepted ingress and callbacks are settled. The committed successor wait must cross the Run boundary, so rollover cannot discard the next occurrence or reapply the prior firing.

A host due-time binding is a candidate for preserving the physical remaining delay through that checkpoint. It must be derived from replay-safe Workflow time, bound to exact semantic identity and logical deadline, and validated on restoration. It is private hosting metadata, never a BPMN variable or published fact. Its wire owner, budget, malformed-input rejection, and behavior for an already overdue successor remain open below. Merely restarting a full period in each successor Run does not establish this relation.

The smallest real-service witness must fire at least twice while the host and first handler remain active, replace the Worker, force continuation between firings, recover a retried command, then complete the host and prove that future triggers stop while both spawned paths can finish. A nested cancellation witness must independently preserve outside work. Replay covers every Run, and native Timer cancellation must not become a BPMN cancellation fact.

## Reachable scheduling obligations

These are obligations to derive from the final admitted graph, not assertions that a constructed state is source-reachable:

| Frontier | Required classification |
|---|---|
| Another trigger while an earlier handler waits | External trigger commits first; ensuing ordinary handler arming must issue a distinct occurrence and preserve all existing work |
| Host completion versus its next trigger | Dependent external choice; never an internal commutation law |
| Handler arming alongside an independently marked ordinary branch | Reuse the accepted ordinary-arming account if its exact ownership and snapshot hypotheses hold |
| Composite host arming alongside independent work | Reopen only the composite family actually reachable under the selected admission; a one-path legacy-profile exclusion is insufficient |
| Handler termination, child quiescence, and containing-region cancellation | Classify exact read/write and ownership overlap; do not infer independence from different element IDs |
| Multiple tokens for one handler operation | Preserve multiplicity and sequential fresh allocation; do not treat one operation offered twice as two disjoint prepared operations |

For every allowed wait-set shape, the final account must establish a resumption surface, bounded internal closure, and separate Temporal host admission. Snapshot and Transaction combinations remain unresolved in [the RC assessment](../INTERNAL-COMMUTATION-PROPOSAL.md#rc-admission-dependency-assessment); this draft neither excludes them from RC nor opens a generic family-pair proof programme.

## Lean assurance lane

Lane shape: proved

Evidence: the planned lane extends the independently stated lifetime relations represented today by [Message-boundary laws](../../BpmnSemantics/SemanticProcess/MessageBoundedTaskLaws.lean), [monitored Timer semantics](../../BpmnSemantics/SemanticProcess/MonitoredTask.lean), and [regional cancellation](../../BpmnSemantics/SemanticProcess/ScopeCancellation.lean). Those files are existing prerequisites, not evidence that repetition is implemented. No new theorem is claimed by this draft.

Required quantified propositions are exact body/owner preservation through a non-interrupting trigger; fresh Timer replacement without reissuing an identity; preservation of arbitrarily many already spawned handler occurrences; complete withdrawal of future subscriptions on host completion; and exact removal of the cancelled ownership closure with an outside-frame law. Hypotheses name well-formed predecessor ownership, live identity uniqueness, admitted definition binding, and capacity; they may not assume the desired successor validity or removal result. Each new transition family requires a declarative relation, executable evaluator, and explicit dispatcher/constructor soundness bridge.

Finite Lean/core schedules separately check source-to-result publication, both completion/trigger orders, repeated Messages to one subscription, stale Timer identity, and nested cleanup. They cannot replace the quantified multiplicity or cancellation laws. The lane does not claim general fairness, a global reachable-state preservation theorem, or a Temporal liveness theorem. The effort bound and exact evidence-module split must be fixed with the admission/frontier account before review; an unaffordable law becomes an explicit reviewed open boundary, never an undocumented weakening.

## Separating evidence and common-mode risks

| Rule | Deciding positive and negative | Independent evidence required |
|---|---|---|
| `ESL-OWN-01` | Host, handler, and Activity counters deliberately differ; a missing or multiply claimed attachment refuses | Source binding, Lean relation, core validity, publication completeness |
| `ESL-MESSAGE-01` | Two distinct commands to the same live subscription create two paths; retrying one command creates none | Lean/core execution, public recovery, Worker replacement and replay |
| `ESL-TIMER-01` | Two firings produce fresh identities and fixed logical spacing; the first identity cannot fire again | Lean counter/deadline law, core mutation, durable handoff and continuation witness |
| `ESL-SPAWN-01` | The second handler starts before the first completes; either completion order preserves the host | Quantified frame law plus whole-model Lean/core/publication schedules |
| `ESL-CLOSE-01` | Host completion removes the live subscription and leaves two spawned paths | Exact state and E1/E2 publication in both semantic accounts and the live host |
| `ESL-CANCEL-01` | Nested cancellation removes inside work and parent-owned attachments, retaining an outside sibling | Quantified ownership-closure law, source-reachable nested witness, replay |

Required mutations retain a stale attachment, reuse a Timer identity, replace a Message subscription after each delivery, delete a running handler on normal host completion, retain a cancelled nested wait, reset the next Timer's delay at rollover, and let callback order select a winner. The common-mode risk is copying a one-shot victory transition into the repeat path and obtaining agreement because both targets accidentally consume the same long-lived subscription.

No CIB column is claimed. Registered profiles, answer-free scenarios, retained whole business models, capability/restriction rows, generated corpus coverage, and Product 2 disclosures are required at capability closure. A private fixture does not satisfy those obligations. Broader event families, new Task subclasses, new Multi-Instance hosts, and Event Sub-Processes are excluded from this proposal; the separate selected Compensation/Transaction work remains required for RC.

## Open design obligations

1. Close the exact graph/host/cardinality and Timer-expression admission table across the required loci, including a source-reachable nested cancellation and an outside-work discriminator. Derive its complete frontier and wait-set inventory using existing graph validation; do not substitute a flat demonstration or invent a second graph framework.
2. Select the new-profile ingress linearization and prove it is implementable against the pinned SDK's accepted Signal/Update and activation behavior. Account for duplicates, identity conflicts, unrelated commands, completion that internally cancels a region, and every accepted caller's settlement. A deterministic but arbitrary winner is not approved merely because it is easy to code.
3. Settle the private due-time continuation representation, overdue behavior, callback drain, and finite capacity outcome without changing old-profile timer timing or recovery. The state relation must cover both replacement before native arming and continuation while a successor wait exists.
4. Bind the exact IL/wire additions, every producer and consumer, the reachable-frontier proof list, and the proved lane's effort bound. Only then request independent proposal review and select production work.

These are outstanding design work, not requests for owner permission and not reasons to mark the active goal blocked.

## Versioning consequences

Use additive semantic-profile and operation admission. Preserve existing profile bytes, consuming Message semantics, one-shot Timer semantics, coalescence refusals, public scheduling refusal, and the [pinned deployment/history contract](../TEMPORAL-PROCESS-LIFECYCLE-SPEC.md#workflow-chain-production-contract). A new continuation field requires an explicit protocol/version decision and exact incoming validation before implementation; this draft authorizes no mixed-version fallback.

The initial owner inventory was derived with [what-binds](../../scripts/what-binds.ts). The implementation must satisfy [schema coverage](../../scripts/contract-schema-coverage.test.ts), [artifact projections](../../scripts/contract-artifact-projections.test.ts), [Activity joins](../../scripts/activity-occurrence-join.test.ts), [writer census](../../scripts/activity-occurrence-writer-census.test.ts), [collection-removal completeness](../../scripts/runtime-collection-removal-completeness.test.ts), [operation census](../../scripts/semantic-operation-consumer-census.test.ts), [commutation census](../../scripts/internal-commutation-census.test.ts), [publication coverage](../../scripts/execution-publication-contract-coverage.test.ts), [canonical ordering](../../scripts/canonical-ordering.test.ts), [host admission](../../packages/temporal-adapter/testkit/test/host-admission.test.ts), [corpus policy](../../scripts/bpmn-corpus-policy.test.ts), [reviewability](../../scripts/document-reviewability.test.ts), and [independent review policy](../../scripts/independent-review-policy.test.ts). The complete expansion-specific consumer inventory remains obligation 4, rather than being asserted complete by this initial list.

### Owners this implementation grows

| Existing owner | Measured headroom before the 800-line review target |
|---|---:|
| [RuntimeState](../../packages/semantic-core/src/semantic-process-state.ts) | 363 |
| [Activity occurrence](../../packages/semantic-core/src/activity-occurrence.ts) | 568 |
| [Monitored Task runtime](../../packages/semantic-core/src/semantic-process-monitored-task-runtime.ts) | 540 |
| [Message-bounded Task runtime](../../packages/semantic-core/src/semantic-process-message-bounded-task-runtime.ts) | 525 |
| [Durable Timer owner](../../packages/temporal-adapter/workflow/src/durable-timer-owner.ts) | 697 |
| [Workflow continuation](../../packages/temporal-adapter/workflow/src/workflow-chain-continuation.ts) | 104 |
| [Message boundary source](../../packages/bpmn-source/src/message-boundary-event-source.ts) | 724 |
| [Timer boundary source](../../packages/bpmn-source/src/timer-boundary-event-source.ts) | 693 |
| [Lean monitored Task](../../BpmnSemantics/SemanticProcess/MonitoredTask.lean) | 254 |
| [Lean Message-bounded Task](../../BpmnSemantics/SemanticProcess/MessageBoundedTask.lean) | 361 |

The continuation owner needs a cohesive extraction only if its planned growth exceeds the measured 104-line margin. These figures constrain planning; they are not permission to move behavior into an unrelated helper. New cohesive owners and the complete wire/publication migration must be named before implementation. Closure cost is measured against the current Message-boundary and non-interrupting Timer increments in [the cost ledger](../CAPSULE-COST-LEDGER.md).

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `not-recorded` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
