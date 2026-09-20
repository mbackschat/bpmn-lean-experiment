# Internal regional ownership closure proposal

## Status

Lifecycle: draft
Review: pending

## Question and boundary

What predecessor-only condition lets regional preparation refuse a removal that would strand a retained Activity body, attached handler, or Event-Based Gateway member?

This amendment belongs to [Internal Commutation](INTERNAL-COMMUTATION-PROPOSAL.md). It selects a condition on the private preparation of Return, Complete, Error, and Terminate, without changing their raw operations, `RuntimeState`, source admission, profiles, public observations, or Temporal capability. It does not strengthen the global runtime validator or claim complete regional preservation by itself.

The basis is project ownership: [`AOO-BODY-01`, `AOO-OWN-01`, and `AOO-ATTACH-01`](ACTIVITY-OCCURRENCE-OWNERSHIP-SPEC.md#stable-semantic-rules), together with the existing [race association predicate](../BpmnSemantics/SemanticProcess/EventBasedGateway.lean). No BPMN interpretation or CIB relationship is selected. A new transition relation or evaluator soundness bridge is unnecessary because no runtime transition family changes.

## Reproduced mechanism

Existing predicates establish that references resolve in the predecessor. The removal operations independently decide which records and targets survive. They do not establish that a retained source record cannot reference a removed target.

The following constructed states reproduced that gap on 2026-09-20. Their Programs are structurally valid, their predecessor runtime-defect lists are empty, and their predecessors are projectable. This is state-level evidence, not a claim that a registered profile reaches these states.

| Selected operation | Predecessor addition | Observed removal consequence |
|---|---|---|
| Return | An outside-owned Activity with a distinct issued identity and a child-scope body naming the quiescent called root | Call cleanup retains the Activity by owner instance and removes its body; `activityOccurrenceBodyAbsent` results |
| Ordinary Complete | A parent-owned Activity with a distinct issued identity, no handlers, and the exact ordinary child as its body | Ordinary completion removes the child without the bounded-scope Activity withdrawal; `activityOccurrenceBodyAbsent` results |
| Terminate | A parent-owned child-body Activity lists the Timer of an independently owned live event race | Cancellation withdraws the listed Timer while retaining the race by its owner |

The second case has the correct direct parent, so adding only a child-parent check does not fix the mechanism. The race case concerns the separately enforced association/projectability contract: TypeScript's `runtimeStateDefects` does not itself include race associations, whereas Lean's aggregate does. These predicates must not be reported as interchangeable.

The raw owners are [Call cleanup](../packages/semantic-core/src/semantic-process-call-runtime.ts), [scope completion](../packages/semantic-core/src/semantic-process-scope-runtime.ts), [bounded completion withdrawal](../packages/semantic-core/src/semantic-process-bounded-scope-runtime.ts), and [scope cancellation](../packages/semantic-core/src/semantic-process-scope-cancellation.ts). The missing guarantee is common to their retained references, not a special property of one operation name.

## Selected preparation contract

`REG-OWN-CLOSE-01`: regional preparation succeeds only when every live body or handler reference of a retained Activity, and both wait references of a retained event race, excludes the exact predecessor targets selected for deletion.

Resolve the existing exact operation selection first. Derive retention masks for scopes, Activity records, User Task waits, Message waits, Timer waits, and event races from that selection and the predecessor. No mask may be obtained by running an operation, comparing states, or validating a speculative successor.

| Selection | Masks must agree with the existing operation |
|---|---|
| Return | Complete forward called-instance closure; scope-owned work and Activity records use their actual owner-instance filters |
| Complete | The selected scope removal and the existing bounded-completion withdrawal, including its exact Activity and deadline when present |
| Error | Selected attached subtree and transitively called instances; remove the selected root; withdraw Activities by owner or child body and their tagged handlers |
| Terminate | The same content cancellation with the selected scope retained; End-count increment is outside the reference masks |

For each retained Activity record, examine every task in its singular or parallel body, or its exact child-scope occurrence. Examine every attached handler in its tagged family. Every matching predecessor target must be retained by its family mask. Apply the same test to every Message and Timer target matched by each retained event race. Compare complete occurrence identity, including Process instance and activation; scope identity also includes definition scope. Preserve list multiplicity and the distinction between a User Task, Message, Timer, and scope target.

This condition does not replace predecessor validity: liveness and exact-census predicates still establish that a referenced target exists with the required multiplicity. Nor does it require every retained wait or scope to be claimed. Standalone catches, ordinary User Tasks, empty-handler monitored Activities, and whole removed ownership components remain permitted. A removed source record imposes no survival requirement on its former targets.

Preparation returns its existing refusal result on a closure violation. It neither repairs the state nor changes raw sequential execution. The eventual production batching integration must retain the existing command rollback contract when a candidate is unavailable; no fallback may treat a refused preparation as an accepted batch member.

`REG-OWN-FRAME-01`: pair preservation must establish this complete closure condition again after the independent member. Every deciding reference census must either have its reads protected by the existing typed footprint or have a proved frame under that other operation. Omitting the new condition from retained-preparation equality, ignoring it after the first step, or declaring all record writes globally conflicting does not discharge this obligation. Valid disjoint regional and mixed pairs must remain batchable.

## Required and excluded work

Required are independently written Lean and TypeScript mask/closure predicates, agreement with the actual removal fields, refusal of the reproduced cases, derived retained-body/handler/race preservation from predecessor validity, and complete preparation/pair-frame integration. The mask account is a private proof and preparation boundary; it is not a second runtime evaluator or a universal graph schema.

The cross-target contract is the same reference criterion. TypeScript's retained `operationId` is not an additional deciding field: Lean's Activity record does not carry it. A target may decompose its validator differently, but neither may silently add a source-declaration or profile restriction.

Excluded are a global Activity-to-Program completeness rule, availability of every called-instance declaration, new Activity-body or handler kinds, changed cancellation lifetimes, snapshot admission, new Compensation compositions, scheduled-choice admission, and a full aggregate-preservation claim based on this condition alone. The [runtime invariant's called-definition boundary](RUNTIME-STATE-INVARIANT-SPEC.md) remains open. The separately recorded bounded-Terminate retained-body liveness gap also remains open: ownership closure does not require a missing Activity record to exist.

No optional extension is selected.

## Assurance and separating evidence

Lean lane: **proved**, bounded to reference-mask agreement, closure-derived body/handler/race survival, and preservation of this preparation condition under the independent regional and already admitted mixed operation families. If a frame cannot be derived, record the exact unresolved family; do not substitute a successor-validity premise or silently reject every pair of that family.

| Rule or claim | Required evidence |
|---|---|
| `REG-OWN-CLOSE-01` | Separate Lean and TypeScript Return and ordinary-Complete negatives; exact precondition siblings; refusal before raw application |
| Tagged handler and race references | Independent Timer and Message negatives; validate the actual association and open-set projection rather than only TypeScript's defect list |
| No over-refusal | Ordinary Return/Complete, bounded completion, whole removed races, standalone waits, empty-handler records, distinct activations, and disjoint multi-record positives |
| Actual masks | Quantified field equalities against each unchanged raw operation, including retain/remove root and bounded withdrawal |
| `REG-OWN-FRAME-01` | Both execution orders for regional pairs and mixed pairs; exact retained-preparation equality, canonical final state, and accepted publication |
| Conservation | Complete semantic-core gate and the existing registered preservation/publication evidence; no new profile or corpus capability |

Mutations must omit the child-body edge, omit each tagged handler/race edge, drop Process instance or activation from comparison, confuse retained-root Terminate with root removal, and omit the closure recheck after the first independent step. At least one positive must fail a blanket refusal or one-record restriction. Finite cases do not establish the quantified frame law.

The nearest unsupported claim is complete regional well-formedness preservation: controller completeness, incident/Call associations, historical Compensation validity, and remaining lifecycle predicates still require their own derivations. Historical Compensation references must not be treated as live Activity or race edges. The principal common-mode risk is deriving both masks and their oracle from one filtering helper; field agreement must compare against the actual operation definitions.

## Consumers, versioning, and gates

The existing owners are [regional footprint vocabulary](../packages/semantic-core/src/internal-transition-footprint.ts), [Return preparation](../packages/semantic-core/src/internal-transition-return-preparation.ts), [completion preparation](../packages/semantic-core/src/internal-transition-scope-completion-preparation.ts), [Error preparation](../packages/semantic-core/src/internal-transition-error-preparation.ts), [Terminate preparation](../packages/semantic-core/src/internal-transition-termination-preparation.ts), [Lean cancellation](../BpmnSemantics/SemanticProcess/ScopeCancellation.lean), and [Lean Call operations](../BpmnSemantics/SemanticProcess/CallActivity.lean). New private closure owners carry the shared criterion; existing owners receive only necessary integration. Run `node scripts/what-binds.ts` on concrete implementation paths before growth and obey its source-owner bounds.

Applicable constraints include the [operation/field census](../scripts/internal-commutation-census.test.ts), [removal completeness guard](../scripts/runtime-collection-removal-completeness.test.ts), [Activity writer census](../scripts/activity-occurrence-writer-census.test.ts), [default Lean reachability guard](../scripts/lean-import-boundaries.test.ts), [source hygiene](../scripts/source-hygiene.test.ts), [documentation reviewability](../scripts/document-reviewability.test.ts), and [independent-review policy](../scripts/independent-review-policy.test.ts). Existing public schema, source admission, writer classifications, and reference evidence must remain unchanged; a required change there reopens scope before implementation.

Use narrow Lean and focused TypeScript gates during development, then complete affected-package gates under [the verification policy](TESTING-SPEC.md#three-level-verification-policy). First new kernel-decided witnesses run under the existing 3 GiB resource bound before broad verification. The proposal review precedes implementation; the first green semantic checkpoint precedes dependent batching integration. Closure records costs against the nearest regional proof/preparation checkpoint in [the cost ledger](CAPSULE-COST-LEDGER.md) and folds the stable rule into the Internal Commutation owner.

This private, pre-release preparation change introduces no serialized field or versioned artifact and requires no durable-history migration. Existing command/continuation validators remain in place. Temporal ingress, waits, timers, effects, ordering, deduplication, replay, and publication are unchanged; this amendment adds no hosting lane or admission capability. Existing replay and complete integration gates remain obligations of regional production integration, not evidence already supplied by this proposal.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `not-recorded` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
