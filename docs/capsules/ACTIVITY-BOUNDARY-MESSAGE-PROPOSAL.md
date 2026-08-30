# Interrupting Activity boundary Message proposal

## Status

Lifecycle: draft
Review: pending

## Question

What is the smallest standards-only slice in which one payload-free interrupting Message Boundary Event is attached to one User Task, the task and Message subscription are armed as one Activity occurrence, and whichever exact input wins withdraws the losing wait and follows only its own route?

## Selection basis

`EVENT-SUBSCRIPTIONS` needs a subscription-lifetime increment before general correlation. Directly addressed Message delivery already exists, while the interrupting Activity-boundary Timer account already establishes Activity-owned handler lifetime and cancellation. Combining those existing mechanisms isolates the new proposition: a Message subscription whose lifetime is owned by an Activity occurrence and competes with that Activity's normal completion.

The pinned CIB Seven breadth corpus contains interrupting Message Boundary Events on User Tasks, but prevalence is only a scheduling signal. This proposal selects no CIB relationship and uses no CIB result as BPMN meaning. A later implementation must stop and open a phase-zero CIB probe if it discovers that an engine-specific observation is required.

General BPMN Message correlation is deliberately not selected. Clause 8.4.2's key and context correlation accounts require `CorrelationKey`, `CorrelationProperty`, retrieval expressions, Message-shape values, and Process data bindings. This slice instead admits a caller that already knows the Process instance and exact open subscription; direct addressing is a profile restriction, not the general meaning of Message correlation.

## Normative basis and interpretation

BPMN 2.0.2 is the sole semantic authority for this proposal. The local normative corpus and its provenance are registered by [the BPMN 2.0.2 reference README](../reference/bpmn-2.0.2/README.md).

- Clauses 8.4.2, 8.4.11, and 8.5 own Message correlation concepts and the `Message`/`Interface`/`Operation` definition chain.
- Clauses 10.5.5 and 10.5.6, Tables 10.90–10.92 and 10.99, CMOF `BoundaryEvent`/`MessageEventDefinition`, and XSD `tBoundaryEvent`/`tMessageEventDefinition` own the catch position, `attachedToRef`, `cancelActivity`, `messageRef`, and `operationRef`.
- Clause 13.3.2 owns the User Task Activity lifecycle.
- Clause 13.5.3 owns Boundary Event occurrence consumption, cancellation of the attached Activity when `cancelActivity` is true, and continuation on the Boundary Event's Sequence Flow. It also states that boundary Message correlation follows the same behavior as Receive Task correlation.

CMOF and XSD make `attachedToRef` an Activity reference and make `cancelActivity` default to `true`. The selected XML omits `cancelActivity`, so omission resolves to the interrupting value. [OMG issue BPMN21-227](https://issues.omg.org/issues/BPMN21-227) records the prose defect that speaks of the attribute as unset rather than set to false; this proposal follows the machine-readable default and reads that prose as “not set to true.”

[OMG issue BPMN2-201](https://issues.omg.org/issues/BPMN2-201) confirms that a Message Boundary Event uses the Receive Task correlation account. This proposal preserves that general account as conforming but deferred and admits only exact subscription addressing.

[OMG issue BPMN2-223](https://issues.omg.org/issues/BPMN2-223) leaves pre-wait Message persistence outside the standard's settled semantics. This profile does not buffer a Message delivered before the Activity subscription exists: the delivery is rejected with exact state preservation. That is a bounded profile choice and not a claim that BPMN generally loses such Messages.

The new ledger requirement is `BPMN-BOUNDARY-MESSAGE-01`. It remains `unsupported` while this proposal is unimplemented and must advance only with the closure evidence required below. The broad `BPMN-MECH-EVENT-01` family remains unsupported after this bounded slice.

## Selected source profile

One new immutable standards-only profile, registered identity `bpmn-2.0.2-activity-boundary-message-draft`, admits this shape class:

```text
None Start → Review User Task ──normal──→ Normal follow-on User Task → None End A
                      │
          (interrupting payload-free Message Boundary Event)
                      │
                      └──boundary──→ Boundary follow-on User Task → None End B
```

The exact source contract is:

- one private executable Process;
- one None Start Event;
- one host User Task with exactly one incoming and one normal outgoing Sequence Flow;
- one Boundary Event whose `attachedToRef` resolves to that User Task, whose `cancelActivity` attribute is omitted, and which contains exactly one Message Event Definition;
- one normal follow-on User Task, one boundary follow-on User Task, and two None End Events;
- exactly five Sequence Flows: Start to host, host to normal follow-on, normal follow-on to its End, boundary to boundary follow-on, and boundary follow-on to its End;
- one payload-free Message root, one Interface root, and one Operation whose input Message is that same Message;
- Message Event Definition `messageRef` and `operationRef` values that resolve to the same Message/Operation chain;
- no parser warning, extension, item definition, payload association, data object, expression, Collaboration, Participant, Message Flow, additional event definition, additional boundary handler, loop, Multi-Instance characteristic, or nested scope.

Admission compares the exact checked-node and operation multisets, resolved references, attachment, and generic graph reachability. It must not special-case one fixture's ids or preserve a whole-model topology predicate after the generic facts above settle the selected class.

The omitted `cancelActivity` lexeme is the only admitted form for this capsule. Explicit `true` is conforming but deferred so source bytes and default handling have one exact witness. Every false lexeme is rejected.

The Message carries no `itemRef`, the Event owns no `DataOutput`, and delivery uses the existing payload-free `DeliverMessage` arm. The implemented payload-catch specification remains byte-identical and is neither widened nor reinterpreted.

## Checked graph and Semantic Process IL

The checked graph adds one closed node arm rather than a nullable attachment on every catch Event:

```ts
type MessageBoundaryEventNode = DeepReadonly<{
  kind: CheckedNodeKind.MessageBoundaryEvent;
  id: string;
  attachedToRef: string;
  interruption: BoundaryInterruption.Interrupting;
  channel: OperationMessageChannel;
  outputFlowId: string;
}>;
```

The Semantic Process IL adds one operation arm rather than widening `AwaitBoundedUserTaskOperation`:

```ts
type AwaitMessageBoundedUserTaskOperation = OperationBase & DeepReadonly<{
  kind: SemanticOperationKind.AwaitMessageBoundedUserTask;
  input: string;
  task: {
    elementId: string;
    name: string | null;
    output: string;
  };
  boundaryMessage: {
    elementId: string;
    channel: OperationMessageChannel;
    output: string;
    origin: BpmnSequenceFlowOrigin;
  };
}>;
```

`input` is the host Activity's incoming control place. `task.output` is the normal outgoing control place. `boundaryMessage.output` is the Boundary Event's outgoing control place, and the two outputs must be distinct. `boundaryMessage.elementId` is both the BPMN Boundary Event identity and the element identity of its open Message subscription.

The existing Timer-bounded operation stays byte-identical. Message and Timer are separate operation arms because their external trigger, channel contract, public wait, and Temporal readiness primitive differ even though both interrupt the same Activity shape.

## Runtime ownership representation

Current Activity occurrence records name only `attachedTimers`. That representation was sound while Timer was the only attached handler family that produced a wait; a Message handler makes the family-specific field false as a complete ownership account.

This proposal replaces that field atomically with a closed discriminated handler-family list in both Lean and TypeScript:

```ts
enum ActivityHandlerKind {
  Timer = "timer",
  Message = "message",
}

type ActivityHandlerOccurrence =
  | DeepReadonly<{ kind: ActivityHandlerKind.Timer; occurrence: TimerOccurrenceId }>
  | DeepReadonly<{ kind: ActivityHandlerKind.Message; occurrence: MessageSubscriptionId }>;

type ActivityOccurrence = DeepReadonly<{
  id: ActivityOccurrenceId;
  owner: ScopeOccurrenceId;
  operationId: string;
  body: ActivityBody;
  attachedHandlers: ActivityHandlerOccurrence[];
}>;
```

Lean adds the analogous inductive sum and list. The discriminator is load-bearing even though Timer and Message occurrence identifiers share one wire shape: well-formedness must resolve a Timer arm only in Timer waits and a Message arm only in Message subscriptions.

A second sibling `attachedMessages` list is rejected because each future handler family would multiply Activity-record fields and every withdrawal traversal. An independent Message wait paired to a task by matching counters is rejected because it recreates the ownership coincidence the Activity occurrence record removed. A second Activity record is rejected because one body would then have two owners.

The migration is behavior-preserving for all existing Timer families. It changes pre-release runtime-state bytes, schemas, codecs, fixtures, Lean constructors, and publication helpers atomically; no legacy reader or compatibility shim is required. Existing Timer program bytes and public observations remain unchanged.

## Stable semantic rules

`ABMSG-ARM-01` — When one token reaches `AwaitMessageBoundedUserTask`, the transition consumes that token and atomically creates exactly one Activity occurrence, one User Task wait, and one payload-free Message subscription. Both waits share the Activity's scope owner, the Activity record owns the task as its body and the subscription as a Message handler, and all three identities advance their own high-water counters.

`ABMSG-COMPLETE-01` — Exact completion of the live host User Task with `submittedValues: []` removes the task wait, its owned Message subscription, and the Activity occurrence in one committed transition, produces control only on `task.output`, and creates no Boundary Event occurrence.

`ABMSG-INTERRUPT-01` — Exact delivery to the live owned subscription consumes that subscription, cancels the host User Task and Activity occurrence in the same committed transition, and produces control only on `boundaryMessage.output`.

`ABMSG-REFUSE-01` — A payload-free delivery with a wrong subscription identity or channel, any `DeliverPayloadMessage` delivery against this payload-free subscription, a completion with a wrong task identity or non-empty `submittedValues`, or either losing stimulus after the competing transition is rejected and preserves the complete runtime state byte-for-byte.

`ABMSG-OBSERVE-01` — Stable arming publishes the host User Task and open Message subscription separately. It does not publish the Boundary Event as an open flow-node occurrence. Message victory cancels the host task and starts/completes the Boundary Event in the same committed transition before publishing the boundary follow-on task; task victory completes the host task without creating a Boundary Event occurrence.

## State, command, and observation distinctions

Source bytes, checked graph identity, immutable IL, runtime ownership, external stimuli, committed state, and public observation remain separate contracts.

The open Message subscription is a semantic fact keyed by subscription identity and operation-addressed channel. The Temporal Signal callback that carries a delivery is transport state and is not a committed subscription or a semantic victory.

The empty-submission User Task completion Update and payload-free Message Signal are explicit competing inputs. A non-empty completion and every payload-bearing Message delivery are refused rather than projected into an unmodeled data contract. Semantic state contains no implicit scheduler order, wall clock, Workflow Task identity, Event History position, or Run ID.

The Boundary Event is a Flow Node but an armed subscription is not a running Boundary Event occurrence. `ABMSG-OBSERVE-01` distinguishes handler readiness from trigger occurrence so E2 publication cannot invent a long-running boundary-node duration.

The distinct normal and boundary follow-on User Tasks are the public route discriminator. End Event identity is not used as the only discriminator because terminal element identity is absent from the canonical stable observation.

## Declarative Lean account

The Lean lane is `proved`. It adds a declarative arming relation and a two-constructor victory relation independently of the executable evaluator.

The arming relation states the consumed input token, exact task/subscription/Activity records, owner equality, distinct outputs, and counter successors. The victory relation has one completion constructor and one Message-delivery constructor; each names the exact losing wait withdrawal and selected route.

Each evaluator arm requires a soundness bridge from the evaluator-produced successor to the corresponding relation constructor. Dispatcher selection and constructor selection are checked separately so “the evaluator returned this state” is not mistaken for the semantic proposition.

Required laws are:

- atomic arming creates exactly one task, one Message subscription, and one Activity record and preserves unrelated runtime collections;
- task victory withdraws the complete owned pair and produces only the normal route;
- Message victory withdraws the complete owned pair and produces only the boundary route;
- every issued task, subscription, and Activity identity is above its predecessor high-water mark, and every untouched counter is preserved;
- wrong task identity, non-empty task submission, wrong subscription identity, wrong channel, and payload-bearing delivery are refused with exact state preservation;
- final owned-handler withdrawal is proved under the existing explicit wait-identity uniqueness and runtime-state well-formedness hypotheses.

Preservation of those uniqueness and well-formedness hypotheses across every reachable transition remains outside this capsule and stays an open runtime-invariant obligation. The `proved` lane therefore claims the conditional final-withdrawal theorem and does not weaken it to an implementation-time alternative.

The nearest realistic checked non-law is commutation: completion followed by delivery and delivery followed by completion select different routes, so these inputs do not commute. In each sequential order the second stimulus is stale and must be rejected. No logical-time, fairness, liveness, or general correlation theorem is claimed.

## Separating witnesses

One project-authored whole model uses a credible business narrative: an applicant may withdraw an application while a reviewer User Task is active. The normal follow-on records review completion; the boundary follow-on records withdrawal handling.

Two answer-free schedules use the exact same source bytes:

1. Complete the review task with `submittedValues: []`. Assert that only the normal follow-on task is open, deliver the now-stale withdrawal Message while that follow-on keeps the Process open, assert rejection and exact stable-state preservation, then complete the normal follow-on with an empty submission.
2. Deliver the payload-free withdrawal Message. Assert that only the boundary follow-on task is open, complete the now-stale review task with `submittedValues: []` while that follow-on keeps the Process open, assert rejection and exact stable-state preservation, then complete the boundary follow-on with an empty submission.

Focused source and semantic negatives cover a wrong channel, delivery before arming, non-empty completion values, a `DeliverPayloadMessage` stimulus against the open payload-free subscription, `cancelActivity="false"`, a payload-bearing source Message, an inconsistent Message/Operation chain, a wrong `attachedToRef`, and an extra Boundary Event.

Seeded mutations must include at least one instance of each mechanism defect: retain the losing subscription or task, route Message victory to the normal output, omit or misclassify the Activity handler owner, and publish a Boundary Event occurrence merely because its subscription is open.

## CIB classification

No normative-agreement, interpretation, extension, configuration, limitation, or deviation entry is selected. Pinned CIB source inspection establishes only that the model family is practically relevant and implementable by an established engine. The standards-only profile has a nullable CIB target and no retained CIB answer.

If implementation needs CIB to choose correlation, subscription timing, cancellation ordering, observation, or host scheduling, that is a stop condition. The missing choice must be classified in the [CIB–BPMN relationship register](../CIB-BPMN-RELATION-REGISTER.md) before the capsule proceeds.

## Temporal hosting and refinement preflight

Durable ingress is the existing payload-free Message Signal and the existing content-bound User Task completion Update with `submittedValues: []`. The Signal handler may accept and ledger a delivery before the semantic core commits it; acceptance is not Message victory. The Update resolves from its existing command result path. A payload-bearing Signal or non-empty completion reaches semantic admission and is refused with exact state preservation.

The intended production lifecycle hosts both waits inside one Workflow. It adds no Temporal Activity, Child Workflow, BPMN timer, cancellation command, or external effect. BPMN interruption is the pure core transition that withdraws the task, subscription, and Activity record.

The Temporal adapter adds one Message/Update boundary-readiness scheduler using the existing activation-tagged batching mechanism. It records an exact Message callback only while committed state contains the matching Message-bounded Activity and records an exact completion callback only for that same owned pair.

After one activation drain, a batch with only one relevant input is submitted to the core. A batch containing both Message delivery and task completion for the same Activity has no portable BPMN winner and must fail closed with the exact distinct nonretryable identity `bpmnMessageBoundedActivitySchedulerUnavailableFailureType = "BpmnMessageBoundedActivitySchedulerUnavailable"`. It must not inherit the SDK's Signal-before-Update job sorting as semantic priority.

The smallest coalescing witness accepts both Signal and Update while no Worker is polling, starts a replacement Worker so both callbacks share one Workflow activation, and proves the Workflow fails closed without a semantic winner. Both client calls must settle rather than hang; the Workflow result/history must retain the typed failure identity. The Update client is not required to receive that exact type unless the live witness proves the SDK exposes it there.

Sequential refinement witnesses cover both victories under Worker replacement. Message accepted while the Worker is absent must survive recovery and win. Task completion must withdraw the Message subscription, after which a later stale Signal reaches the core while the normal follow-on keeps the Workflow open and is rejected without changing state.

Continue-As-New carries committed `RuntimeState`, including the handler-family Activity record, open Message subscription, counters, and the existing Message-result ledger. No pending Signal or Update callback crosses a run boundary. Replay must reconstruct the same selected semantic transition and public observation without reading Event History as BPMN data.

Delivery ordering outside one coalesced activation remains server arrival order presented through the adapter's explicit readiness batches. Deduplication reuses the existing Message ledger and content-bound Update identity. Retry belongs to Temporal transport and does not create a second BPMN occurrence.

## Rule-to-evidence matrix

| Rule | BPMN/profile evidence | Lean evidence | TypeScript evidence | Temporal evidence | Negative or mutation evidence |
|---|---|---|---|---|---|
| `ABMSG-ARM-01` | exact source, resolved attachment, omitted-true default, checked/IL binding | declarative arming relation, evaluator soundness, atomicity and counter laws | independent arming evaluator and exact collection delta | stable Query after Worker replacement | premature delivery, wrong attachment, missing owner mutation |
| `ABMSG-COMPLETE-01` | User Task lifecycle plus handler lifetime | empty-submission completion constructor and complete-withdrawal law | task-victory evaluator admits only `submittedValues: []` | accepted empty Update, replacement Worker, stale later Signal | retained-subscription, boundary-route, and non-empty-submission mutations |
| `ABMSG-INTERRUPT-01` | Clause 13.5.3 and distinct boundary Sequence Flow | Message-victory constructor and route law | delivery evaluator reusing `DeliverMessage` | accepted Signal, replacement Worker, replay | retained-task and normal-route mutations |
| `ABMSG-REFUSE-01` | bounded direct-address and payload-free profile | quantified identity, channel, non-empty-submission, and payload-delivery refusal laws | wrong/stale identity, channel, completion-value, and `DeliverPayloadMessage` tests | stale and wrong-shape Signal/Update paths settle through the public host contract | state-changing refusal mutations |
| `ABMSG-OBSERVE-01` | Boundary Event occurrence versus subscription readiness | transition-derived occurrence facts | E1/E2 lifecycle and stable observation | canonical Query and history/replay witness | open-boundary-publication mutation |

The standards, Lean, TypeScript, and Temporal columns are separate claims. The registered differential target set is Lean, semantic core, and Temporal; CIB remains null. Agreement does not turn the TypeScript implementation into a proof or Temporal history into semantic authority.

## Runtime-only and synthetic constructs

| Construct | Derivation and owner | Public projection | Lifecycle invariant |
|---|---|---|---|
| `ActivityOccurrenceId` | semantic core allocates from the Activity element high-water mark | existing Activity-derived occurrence projections only | created with body and handler; removed with body completion or interruption |
| `ActivityHandlerOccurrence.Message` | exact Message subscription identity created by `ABMSG-ARM-01` | no new wrapper; the underlying subscription appears in `openMessages` | resolves to exactly one live Message subscription owned by exactly one Activity record |
| operation-addressed channel | resolved from Message Event Definition, Operation, and input Message | existing `deliverMessage` interaction channel | immutable for the subscription lifetime |
| activation-tagged readiness batch | Temporal Workflow activation tag plus adapter queue | not a BPMN observation | drained once; simultaneous relevant Signal/Update fails closed |
| Message result ledger entry | existing durable Signal-result recovery owner | transport receipt only | content-bound, carried across continuation, never interpreted as semantic state |

No synthetic construct becomes a BPMN id. A handler discriminator classifies a project-owned runtime owner, not a new modeled Event type.

## Layer ownership

`@bpmn-lean/bpmn-source` owns raw moddle containment, reference resolution, default interpretation, checked-node projection, and strict source admission. Raw moddle values do not cross that package.

The checked graph and Semantic Process IL own immutable resolved meaning. The pure semantic core owns arming, victory, refusal, ownership, stable observation, and publication. Lean independently owns the declarative relations, evaluator, bridges, and laws over the same reviewed account.

The Temporal adapter owns Signal/Update transport, activation batching, coalescing failure, recovery, replay, and Continue-As-New carry. It does not choose a BPMN winner when both inputs are co-ready.

The scenario, profile, differential, and retained corpus owners bind evidence to exact source bytes. Product 2 consumes only the resulting published task/subscription/occurrence contract; this capsule adds no platform-specific data shape or UI behavior.

## Required, optional, and excluded scope

Required: the exact source profile, checked node, distinct IL operation, handler-family Activity ownership migration, proved Lean lane, independent TypeScript evaluator, E1/E2 publication, two same-source schedules, registered standards-only differential evidence, retained whole model, fail-closed live coalescing witness, Worker replacement, Continue-As-New, replay, and same-change capability disclosure.

Optional only if it stays non-authoritative: a diagnostic CIB breadth note or a visualization of the retained model. Neither may become a target or enter the semantic matrix.

Excluded: payload, `DataOutput`, `DataAssociation`, `ItemDefinition`, key correlation, context correlation, `CorrelationKey`, `CorrelationProperty`, expression evaluation, Conversation, Collaboration execution, Participant routing, Message Flow execution, modeled throw, multiple subscriptions, multiple Boundary Events, non-interrupting Message boundaries, Signal boundaries, Event Sub-Processes, Sub-Process hosts, Multi-Instance hosts, loop/repetition, and all CIB compatibility claims.

## Versioning consequences

This is an additive profile and operation but an atomic pre-release runtime-state representation migration. Existing scenario/profile/program bytes remain unchanged. Runtime-state schemas, TypeScript and Lean constructors, wire fixtures, codecs, Activity ownership predicates, Timer-family writers/readers, publication, state well-formedness, and adapter continuation state move together from `attachedTimers` to `attachedHandlers`; no mixed-version runtime state is admitted.

The `what-binds` inventory requires the following executable guards and focused oracles: [document reviewability](../../scripts/document-reviewability.test.ts), [requirement-ledger consistency](../../scripts/requirement-ledger-consistency.test.ts), [independent review policy](../../scripts/independent-review-policy.test.ts), [contract artifact projections](../../scripts/contract-artifact-projections.test.ts), [contract schema coverage](../../scripts/contract-schema-coverage.test.ts), [execution-publication contract coverage](../../scripts/execution-publication-contract-coverage.test.ts), [canonical ordering](../../scripts/canonical-ordering.test.ts), [BPMN corpus policy](../../scripts/bpmn-corpus-policy.test.ts), [Activity occurrence joins](../../scripts/activity-occurrence-join.test.ts), [Activity occurrence writer census](../../scripts/activity-occurrence-writer-census.test.ts), [runtime collection-removal completeness](../../scripts/runtime-collection-removal-completeness.test.ts), [source hygiene](../../scripts/source-hygiene.test.ts), [projected flow-element keys](../../packages/bpmn-source/test/projected-flow-element-keys.test.ts), [host admission](../../packages/temporal-adapter/testkit/test/host-admission.test.ts), [product example configs](../../packages/temporal-adapter/testkit/test/product-example-configs.test.ts), [pipeline catalog](../../packages/differential/test/pipeline-catalog.test.ts), [BPMN XML validation](../../scripts/bpmn-xml-validation.test.ts), [semantic review packet](../../scripts/semantic-review-packet.test.ts), [capsule cost](../../scripts/capsule-cost.test.ts), [Lean source contracts](../../scripts/lean-source-contracts.test.ts), [internal commutation census](../../scripts/internal-commutation-census.test.ts), [activation readiness](../../packages/temporal-adapter/testkit/test/host-readiness-mechanism.test.ts), and the [SDK activation premise witness](../../packages/temporal-adapter/testkit/test/event-race-sdk-activation-premise.test.ts).

### Owners this implementation grows

The reviewability threshold is 800 nonblank lines. Each figure is the mechanically measured remaining headroom at proposal time; the guard recomputes it.

| Owner | Headroom | Structural condition |
|---|---:|---|
| [`checked-process-contract.ts`](../../packages/semantic-core/src/checked-process-contract.ts) | 469 | add one closed checked-node arm; extract first only if the edit would cross 800 nonblank lines |
| [`checked-element-projection.ts`](../../packages/bpmn-source/src/checked-element-projection.ts) | 358 | add Boundary Message projection and reference checks; extract first only if the edit would cross 800 |
| [`compilation-dispatch.ts`](../../packages/bpmn-source/src/compilation-dispatch.ts) | 496 | register exact source compilation for the new profile; extract first only if the edit would cross 800 |
| [`semantic-process-lowering.ts`](../../packages/bpmn-source/src/semantic-process-lowering.ts) | 210 | add one lowering dispatch and keep family logic outside this owner if the edit would cross 800 |
| [`semantic-process-contract.ts`](../../packages/semantic-core/src/semantic-process-contract.ts) | 258 | add one operation kind and union arm; extract first only if the edit would cross 800 |
| [`semantic-profile-catalog.ts`](../../packages/semantic-core/src/semantic-profile-catalog.ts) | 729 | add the exact registered profile identity; extract first only if the edit would cross 800 |
| [`checked-process-profile-shape.ts`](../../packages/semantic-core/src/checked-process-profile-shape.ts) | 518 | add the exact checked-node multiset; extract first only if the edit would cross 800 |
| [`semantic-program-profile-shape.ts`](../../packages/semantic-core/src/semantic-program-profile-shape.ts) | 501 | add the exact operation multiset; extract first only if the edit would cross 800 |
| [`semantic-process-operation-admission.ts`](../../packages/semantic-core/src/semantic-process-operation-admission.ts) | 139 | add exact operation well-formedness; extract family validation before an edit that would cross 800 |
| [`semantic-process-graph-admission.ts`](../../packages/semantic-core/src/semantic-process-graph-admission.ts) | 212 | classify the new operation's input and outputs generically; extract first only if the edit would cross 800 |
| [`activity-occurrence.ts`](../../packages/semantic-core/src/activity-occurrence.ts) | 587 | replace Timer-only attachment helpers with handler-family helpers; extract first only if the edit would cross 800 |
| [`runtime-state-well-formedness.ts`](../../packages/semantic-core/src/runtime-state-well-formedness.ts) | 145 | resolve each handler discriminator to the matching wait family; extract handler-family validation before an edit that would cross 800 |
| [`semantic-command-admission.ts`](../../packages/semantic-core/src/semantic-command-admission.ts) | 417 | route empty completion and both Message stimulus arms to exact admission/refusal; extract first only if the edit would cross 800 |
| [`semantic-process-runtime.ts`](../../packages/semantic-core/src/semantic-process-runtime.ts) | 176 | add dispatch only; the new family runtime belongs in a new owner, and any edit that would cross 800 requires extraction first |
| [`flow-node-occurrence-lifecycle.ts`](../../packages/semantic-core/src/flow-node-occurrence-lifecycle.ts) | 200 | add the host-task and triggered Boundary Event lifecycle; extract first only if the edit would cross 800 |
| [`flow-node-occurrence-publication-completeness.ts`](../../packages/semantic-core/src/flow-node-occurrence-publication-completeness.ts) | 319 | add the new operation to complete E1/E2 publication census; extract first only if the edit would cross 800 |
| [`RuntimeState.lean`](../../BpmnSemantics/SemanticProcess/RuntimeState.lean) | 252 | replace the Timer-only field with the handler-family sum/list; extract first only if the edit would cross 800 |
| [`Lowering.lean`](../../BpmnSemantics/SemanticProcess/Lowering.lean) | 189 | add independent checked-to-IL lowering; extract first only if the edit would cross 800 |
| [`ProfileAdmission.lean`](../../BpmnSemantics/SemanticProcess/ProfileAdmission.lean) | 102 | add the exact profile multiset; extract the new profile predicate before an edit that would cross 800 |
| [`ProgramStructuralValidation.lean`](../../BpmnSemantics/SemanticProcess/ProgramStructuralValidation.lean) | 201 | add exact operation structural validation; extract first only if the edit would cross 800 |
| [`GraphValidation.lean`](../../BpmnSemantics/SemanticProcess/GraphValidation.lean) | 60 | add only dispatcher coverage; extract the family graph rules before any edit that would cross 800 |
| [`RuntimeStateWellFormed.lean`](../../BpmnSemantics/SemanticProcess/RuntimeStateWellFormed.lean) | 126 | resolve handler-family ownership; extract the new handler predicates before an edit that would cross 800 |
| [`Scenario.lean`](../../BpmnSemantics/SemanticProcess/Scenario.lean) | 275 | decode and execute the two answer-free schedules; extract first only if the edit would cross 800 |
| [`TransitionTrace.lean`](../../BpmnSemantics/SemanticProcess/TransitionTrace.lean) | 232 | classify the new operation and transition traces; extract first only if the edit would cross 800 |
| [`FlowNodeOccurrenceLifecycle.lean`](../../BpmnSemantics/SemanticProcess/FlowNodeOccurrenceLifecycle.lean) | 170 | add the matching Lean occurrence lifecycle; extract first only if the edit would cross 800 |
| [`Transition.lean`](../../BpmnSemantics/SemanticProcess/Transition.lean) | 354 | add the new dispatcher arm; family relations and laws belong in new modules if this owner would cross 800 |
| [`SemanticProcessJson/Program.lean`](../../BpmnSemantics/SemanticProcessJson/Program.lean) | 147 | decode the new operation and migrated handler-family state; extract the operation decoder before an edit that would cross 800 |
| [`contracts.ts`](../../packages/temporal-adapter/protocol/src/contracts.ts) | 579 | add the exact nonretryable failure identity; extract first only if the edit would cross 800 |
| [`workflow-continuation.ts`](../../packages/temporal-adapter/protocol/src/workflow-continuation.ts) | 282 | validate carried handler-family runtime state and profile identity; extract first only if the edit would cross 800 |
| [`workflow-command-ingress.ts`](../../packages/temporal-adapter/workflow/src/workflow-command-ingress.ts) | 418 | route exact Signal/Update callbacks to the new scheduler; extract first only if the edit would cross 800 |
| [`workflow-host-readiness.ts`](../../packages/temporal-adapter/workflow/src/workflow-host-readiness.ts) | 551 | register the new host-readiness owner; extract first only if the edit would cross 800 |
| [`activation-tagged-readiness.ts`](../../packages/temporal-adapter/workflow/src/activation-tagged-readiness.ts) | 723 | reuse without semantic-family logic; it grows only if the generic contract proves insufficient, which is a redesign stop |
| [`runner.ts`](../../packages/temporal-adapter/testkit/src/runner.ts) | 260 | drive both winner schedules, both stale refusals, and the coalescing witness; extract the family runner before an edit that would cross 800 |

### Complete `attachedTimers` migration census

At correction target `1949fb45`, `rg -l "attachedTimers" BpmnSemantics packages scripts contracts model-corpus profiles scenarios --glob '*.{ts,lean,json,md}'` returns exactly the 75 existing producers, consumers, and test oracles below. Every entry must either move to the discriminated handler representation or, for an oracle, assert the migrated contract. A post-migration zero-result run for production uses plus an updated positive oracle census separates complete replacement from a renamed subset.

| Area | Exact current paths |
|---|---|
| Lean semantic sources | [`ActivityBodyClaimWriterPreservation.lean`](../../BpmnSemantics/SemanticProcess/ActivityBodyClaimWriterPreservation.lean), [`ActivityBodyTurnover.lean`](../../BpmnSemantics/SemanticProcess/ActivityBodyTurnover.lean), [`ActivityBodyTurnoverPreservation.lean`](../../BpmnSemantics/SemanticProcess/ActivityBodyTurnoverPreservation.lean), [`ActivityDataInput.lean`](../../BpmnSemantics/SemanticProcess/ActivityDataInput.lean), [`ActivityDataOutput.lean`](../../BpmnSemantics/SemanticProcess/ActivityDataOutput.lean), [`ActivityOccurrence.lean`](../../BpmnSemantics/SemanticProcess/ActivityOccurrence.lean), [`BoundedScope.lean`](../../BpmnSemantics/SemanticProcess/BoundedScope.lean), [`BoundedScopeArming.lean`](../../BpmnSemantics/SemanticProcess/BoundedScopeArming.lean), [`BoundedTask.lean`](../../BpmnSemantics/SemanticProcess/BoundedTask.lean), [`InternalCommutationRuntimePreservation.lean`](../../BpmnSemantics/SemanticProcess/InternalCommutationRuntimePreservation.lean), [`MessagePayloadPreservation.lean`](../../BpmnSemantics/SemanticProcess/MessagePayloadPreservation.lean), [`MonitoredTask.lean`](../../BpmnSemantics/SemanticProcess/MonitoredTask.lean), [`ParallelMultiInstanceProgramBindingFacts.lean`](../../BpmnSemantics/SemanticProcess/ParallelMultiInstanceProgramBindingFacts.lean), [`ParallelMultiInstanceRuntimeStateClosingProgressPreservation.lean`](../../BpmnSemantics/SemanticProcess/ParallelMultiInstanceRuntimeStateClosingProgressPreservation.lean), [`ParallelMultiInstanceRuntimeStateClosingSelection.lean`](../../BpmnSemantics/SemanticProcess/ParallelMultiInstanceRuntimeStateClosingSelection.lean), [`ParallelMultiInstanceRuntimeStateClosingTerminalPreservation.lean`](../../BpmnSemantics/SemanticProcess/ParallelMultiInstanceRuntimeStateClosingTerminalPreservation.lean), [`ParallelMultiInstanceRuntimeStateEntryPreservation.lean`](../../BpmnSemantics/SemanticProcess/ParallelMultiInstanceRuntimeStateEntryPreservation.lean), [`ParallelMultiInstanceRuntimeStatePreservation.lean`](../../BpmnSemantics/SemanticProcess/ParallelMultiInstanceRuntimeStatePreservation.lean), [`ParallelMultiInstanceRuntimeWellFormedness.lean`](../../BpmnSemantics/SemanticProcess/ParallelMultiInstanceRuntimeWellFormedness.lean), [`ParallelMultiInstanceTransition.lean`](../../BpmnSemantics/SemanticProcess/ParallelMultiInstanceTransition.lean), [`RuntimeState.lean`](../../BpmnSemantics/SemanticProcess/RuntimeState.lean), [`RuntimeStateWellFormed.lean`](../../BpmnSemantics/SemanticProcess/RuntimeStateWellFormed.lean), [`RuntimeStateWellFormedInitialization.lean`](../../BpmnSemantics/SemanticProcess/RuntimeStateWellFormedInitialization.lean), [`ScopeCancellation.lean`](../../BpmnSemantics/SemanticProcess/ScopeCancellation.lean), [`SequentialMultiInstanceLaws.lean`](../../BpmnSemantics/SemanticProcess/SequentialMultiInstanceLaws.lean), [`SequentialMultiInstanceRewrite.lean`](../../BpmnSemantics/SemanticProcess/SequentialMultiInstanceRewrite.lean), [`SequentialMultiInstanceTransition.lean`](../../BpmnSemantics/SemanticProcess/SequentialMultiInstanceTransition.lean), and [`WaitActivation.lean`](../../BpmnSemantics/SemanticProcess/WaitActivation.lean) |
| Lean conformance oracles | [`ActivityBodyClaimUniquenessConformance.lean`](../../BpmnSemantics/ActivityBodyClaimUniquenessConformance.lean), [`RuntimeStateActivityConformance.lean`](../../BpmnSemantics/RuntimeStateActivityConformance.lean), [`SequentialMultiInstanceConformance.lean`](../../BpmnSemantics/SequentialMultiInstanceConformance.lean), and [`TerminateEndEventConformance.lean`](../../BpmnSemantics/TerminateEndEventConformance.lean) |
| Semantic-core production sources | [`activity-occurrence.ts`](../../packages/semantic-core/src/activity-occurrence.ts), [`flow-node-occurrence-parallel-multi-instance-publication.ts`](../../packages/semantic-core/src/flow-node-occurrence-parallel-multi-instance-publication.ts), [`flow-node-occurrence-publication-completeness.ts`](../../packages/semantic-core/src/flow-node-occurrence-publication-completeness.ts), [`flow-node-occurrence-publication-external-completeness.ts`](../../packages/semantic-core/src/flow-node-occurrence-publication-external-completeness.ts), [`flow-node-occurrence-retained-pairing.ts`](../../packages/semantic-core/src/flow-node-occurrence-retained-pairing.ts), [`internal-transition-activity-association.ts`](../../packages/semantic-core/src/internal-transition-activity-association.ts), [`internal-transition-footprint-ordering.ts`](../../packages/semantic-core/src/internal-transition-footprint-ordering.ts), [`parallel-multi-instance-binding.ts`](../../packages/semantic-core/src/parallel-multi-instance-binding.ts), [`runtime-state-well-formedness.ts`](../../packages/semantic-core/src/runtime-state-well-formedness.ts), [`semantic-process-activity-arming.ts`](../../packages/semantic-core/src/semantic-process-activity-arming.ts), [`semantic-process-activity-data-input-runtime.ts`](../../packages/semantic-core/src/semantic-process-activity-data-input-runtime.ts), [`semantic-process-activity-data-output-runtime.ts`](../../packages/semantic-core/src/semantic-process-activity-data-output-runtime.ts), [`semantic-process-bounded-scope-runtime.ts`](../../packages/semantic-core/src/semantic-process-bounded-scope-runtime.ts), [`semantic-process-bounded-task-runtime.ts`](../../packages/semantic-core/src/semantic-process-bounded-task-runtime.ts), [`semantic-process-monitored-task-runtime.ts`](../../packages/semantic-core/src/semantic-process-monitored-task-runtime.ts), [`semantic-process-parallel-multi-instance-runtime.ts`](../../packages/semantic-core/src/semantic-process-parallel-multi-instance-runtime.ts), [`semantic-process-scope-cancellation.ts`](../../packages/semantic-core/src/semantic-process-scope-cancellation.ts), [`semantic-process-sequential-multi-instance-runtime.ts`](../../packages/semantic-core/src/semantic-process-sequential-multi-instance-runtime.ts), and [`sequential-multi-instance-binding.ts`](../../packages/semantic-core/src/sequential-multi-instance-binding.ts) |
| Semantic-core test and type oracles | [`activity-body-turnover.test.ts`](../../packages/semantic-core/test/activity-body-turnover.test.ts), [`activity-occurrence.test.ts`](../../packages/semantic-core/test/activity-occurrence.test.ts), [`flow-node-occurrence-publication-completeness.test.ts`](../../packages/semantic-core/test/flow-node-occurrence-publication-completeness.test.ts), [`internal-commutation-activity-arming.test.ts`](../../packages/semantic-core/test/internal-commutation-activity-arming.test.ts), [`internal-commutation-bounded-scope.test.ts`](../../packages/semantic-core/test/internal-commutation-bounded-scope.test.ts), [`internal-commutation-parallel-multi-instance.test.ts`](../../packages/semantic-core/test/internal-commutation-parallel-multi-instance.test.ts), [`internal-commutation-region-conflict.test.ts`](../../packages/semantic-core/test/internal-commutation-region-conflict.test.ts), [`internal-commutation-sequential-multi-instance.test.ts`](../../packages/semantic-core/test/internal-commutation-sequential-multi-instance.test.ts), [`monitored-task-fixture.ts`](../../packages/semantic-core/test/monitored-task-fixture.ts), [`parallel-multi-instance-entry.test.ts`](../../packages/semantic-core/test/parallel-multi-instance-entry.test.ts), [`parallel-multi-instance-preservation.test.ts`](../../packages/semantic-core/test/parallel-multi-instance-preservation.test.ts), [`sequential-multi-instance-controller.test.ts`](../../packages/semantic-core/test/sequential-multi-instance-controller.test.ts), [`sequential-multi-instance-entry.test.ts`](../../packages/semantic-core/test/sequential-multi-instance-entry.test.ts), [`sequential-multi-instance-iteration.test.ts`](../../packages/semantic-core/test/sequential-multi-instance-iteration.test.ts), [`terminate-end-event.test.ts`](../../packages/semantic-core/test/terminate-end-event.test.ts), and [`activity-occurrence.type-test.ts`](../../packages/semantic-core/type-test/activity-occurrence.type-test.ts) |
| Temporal production and test consumers | [`workflow-continuation.ts`](../../packages/temporal-adapter/protocol/src/workflow-continuation.ts), [`workflow-publication-segments.ts`](../../packages/temporal-adapter/protocol/src/workflow-publication-segments.ts), [`workflow-continuation-state.test.ts`](../../packages/temporal-adapter/testkit/test/workflow-continuation-state.test.ts), [`bounded-deadline-scheduler.ts`](../../packages/temporal-adapter/workflow/src/bounded-deadline-scheduler.ts), [`flow-node-occurrence-publication-state.ts`](../../packages/temporal-adapter/workflow/src/flow-node-occurrence-publication-state.ts), [`bounded-deadline-record-pairing.test.ts`](../../packages/temporal-adapter/workflow/test/bounded-deadline-record-pairing.test.ts), and [`retained-pairing-agreement.test.ts`](../../packages/temporal-adapter/workflow/test/retained-pairing-agreement.test.ts) |
| Cross-layer migration guard | [`activity-occurrence-join.test.ts`](../../scripts/activity-occurrence-join.test.ts) |

New family-specific runtime, Lean relation/law, source-admission helper, and Temporal readiness-scheduler files must be routed through their package and implementation-map registries before use. Any censused owner whose nonblank size grows is rerun through `what-binds` before that edit, and no production consumer may retain a Timer-only ownership claim.

## Epistemic closure and reopen conditions

Established before implementation: BPMN admits an interrupting Message Boundary Event on an Activity; omitted `cancelActivity` resolves to true; Message Boundary correlation shares the Receive Task account; direct subscription addressing, existing task completion, and Activity-owned Timer cancellation already exist as separate reviewed mechanisms.

Not established: the selected source is admitted, the new operation is well formed, handler-family migration preserves every Timer family, Lean/core transitions implement the rules, public occurrence projection is exact, the Temporal host can fail closed while settling both callers, or the registered targets agree. Those remain evidence obligations, not inferred feasibility.

The nearest unsupported claim is key-based Message correlation across Process instances. This capsule must not make its direct address look like a BPMN correlation key or a global Message broker.

The primary common-mode risks are copying Timer-boundary cancellation without withdrawing the Message-specific wait, copying Intermediate Message delivery without canceling the Activity body, and letting SDK callback order choose the winner. The cross-language handler discriminator also creates a schema/common-constructor risk that the artifact and writer guards must seed independently.

The nearest realistic counterexample is one Worker activation containing the exact Message Signal and exact task-completion Update for the same Activity. The core defines two valid sequential schedules with different routes, so the host has no evidence for a portable winner and must fail closed.

Reopen the account if general correlation becomes necessary, if one Activity may own more than one Message handler, if a Message handler may be non-interrupting, if handler arming is not atomic with the body, if subscription delivery carries payload, if a nested Activity host is selected, or if Temporal cannot preserve the coalescing distinction across replay and continuation.

## Closure cost

No closure cost is claimed at proposal time. At closure, [`capsule-cost.ts`](../../scripts/capsule-cost.ts) must measure one immutable implementation range and compare it with the interrupting Activity boundary Timer increment because that is the nearest change across source, Lean, core, publication, and Temporal host readiness.

## Stage boundary

The first green Lean and semantic-core target is a mandatory semantic checkpoint because this capsule adds a transition family, changes Activity ownership representation, and changes a proof boundary. No Temporal or publication implementation may cross that checkpoint before its independent review is approved.

Closure requires every evidence lane and guard named above, the complete applicable gate on a clean committed target, an exact reflection/cost record, and an independent closure review. The proposal may graduate to `-SPEC` only after the reviewed current contract and all evidence owners agree.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `7efbf69a` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
