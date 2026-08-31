# Interrupting Activity boundary Message specification

## Status

Lifecycle: implemented
Review: closure-approved

## Question and bounded outcome

What is the smallest standards-only slice in which one payload-free interrupting Message Boundary Event is attached to one User Task, the task and Message subscription are armed as one Activity occurrence, and whichever exact input wins withdraws the losing wait and follows only its own route?

The bounded standards-only account is implemented, independently closure-reviewed, evidence-closed, and graduated. Exact source admission, checked-graph and Semantic Process IL representation, proved Lean semantics, the independently written TypeScript core, occurrence publication, both answer-free schedules, retained-corpus binding, capability disclosure, Product 2 About disclosure, and real-service Temporal refinement agree without selecting CIB behavior. The Temporal witness covers both winners after forced Continue-As-New and Worker replacement, stale Signal refusal with stable published state, exact typed coalescence failure, history mechanism exclusions, replay of every Run, and exclusion of ledger-suppressed Message callbacks from semantic races.

## Selection basis

`EVENT-SUBSCRIPTIONS` needs a subscription-lifetime increment before general correlation. Directly addressed Message delivery already exists, while the interrupting Activity-boundary Timer account already establishes Activity-owned handler lifetime and cancellation. Combining those existing mechanisms isolates the new proposition: a Message subscription whose lifetime is owned by an Activity occurrence and competes with that Activity's normal completion.

The pinned CIB Seven breadth corpus contains interrupting Message Boundary Events on User Tasks, but prevalence is only a scheduling signal. This specification selects no CIB relationship and uses no CIB result as BPMN meaning. A later implementation must stop and open a phase-zero CIB probe if it discovers that an engine-specific observation is required.

General BPMN Message correlation is deliberately not selected. Clause 8.4.2's key and context correlation accounts require `CorrelationKey`, `CorrelationProperty`, retrieval expressions, Message-shape values, and Process data bindings. This slice instead admits a caller that already knows the Process instance and exact open subscription; direct addressing is a profile restriction, not the general meaning of Message correlation.

## Normative basis and interpretation

BPMN 2.0.2 is the sole semantic authority for this specification. The local normative corpus and its provenance are registered by [the BPMN 2.0.2 reference README](../reference/bpmn-2.0.2/README.md).

- Clauses 8.4.2, 8.4.11, and 8.5 own Message correlation concepts and the `Message`/`Interface`/`Operation` definition chain.
- Clauses 10.5.5 and 10.5.6, Tables 10.90–10.92 and 10.99, CMOF `BoundaryEvent`/`MessageEventDefinition`, and XSD `tBoundaryEvent`/`tMessageEventDefinition` own the catch position, `attachedToRef`, `cancelActivity`, `messageRef`, and `operationRef`.
- Clause 13.3.2 owns the User Task Activity lifecycle.
- Clause 13.5.3 owns Boundary Event occurrence consumption, cancellation of the attached Activity when `cancelActivity` is true, and continuation on the Boundary Event's Sequence Flow. It also states that boundary Message correlation follows the same behavior as Receive Task correlation.

CMOF and XSD make `attachedToRef` an Activity reference and make `cancelActivity` default to `true`. The selected XML omits `cancelActivity`, so omission resolves to the interrupting value. [OMG issue BPMN21-227](https://issues.omg.org/issues/BPMN21-227) records the prose defect that speaks of the attribute as unset rather than set to false; this specification follows the machine-readable default and reads that prose as “not set to true.”

[OMG issue BPMN2-201](https://issues.omg.org/issues/BPMN2-201) confirms that a Message Boundary Event uses the Receive Task correlation account. This specification preserves that general account as conforming but deferred and admits only exact subscription addressing.

[OMG issue BPMN2-223](https://issues.omg.org/issues/BPMN2-223) leaves pre-wait Message persistence outside the standard's settled semantics. This profile does not buffer a Message delivered before the Activity subscription exists: the delivery is rejected with exact state preservation. That is a bounded profile choice and not a claim that BPMN generally loses such Messages.

The reviewed ledger requirement is `BPMN-BOUNDARY-MESSAGE-01`. Its disposition is `supported` only for this exact bounded slice. The broad `BPMN-MECH-EVENT-01` family remains unsupported after this bounded closure.

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

Admission compares the exact checked-node and operation multisets, resolved references, attachment, generic graph reachability, and a profile-local exact topology predicate. The topology predicate must remain fixture-ID-independent: cardinalities, attachment, and reachability alone also admit a graph that reaches a follow-on task before the host and therefore arms the boundary Message subscription late.

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

The implemented representation replaces that field atomically with a closed discriminated handler-family list in both Lean and TypeScript:

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

## Epistemic closure and reopen conditions

Established before implementation: BPMN admits an interrupting Message Boundary Event on an Activity; omitted `cancelActivity` resolves to true; Message Boundary correlation shares the Receive Task account; direct subscription addressing, existing task completion, and Activity-owned Timer cancellation already exist as separate reviewed mechanisms.

Established by implementation and closure evidence: the selected source is admitted, the new operation is well formed, the handler-family migration preserves every Timer family, Lean/core transitions implement the rules, public occurrence projection is exact, the Temporal host fails closed while settling both co-ready callers, ledger-suppressed deliveries do not become semantic contenders, and both registered schedules agree across Lean, the core, and Temporal.

The nearest unsupported claim is key-based Message correlation across Process instances. This capsule must not make its direct address look like a BPMN correlation key or a global Message broker.

The primary common-mode risks are copying Timer-boundary cancellation without withdrawing the Message-specific wait, copying Intermediate Message delivery without canceling the Activity body, and letting SDK callback order choose the winner. The cross-language handler discriminator also creates a schema/common-constructor risk that the artifact and writer guards must seed independently.

The nearest realistic counterexample is one Worker activation containing the exact Message Signal and exact task-completion Update for the same Activity. The core defines two valid sequential schedules with different routes, so the host has no evidence for a portable winner and must fail closed.

Reopen the account if general correlation becomes necessary, if one Activity may own more than one Message handler, if a Message handler may be non-interrupting, if handler arming is not atomic with the body, if subscription delivery carries payload, if a nested Activity host is selected, or if Temporal cannot preserve the coalescing distinction across replay and continuation.

## Closure cost

The immutable implementation range `79406df6..0b3c3cda` adds `7669` and removes `756` nonblank code lines, and adds `112` and removes `72` nonblank documentation lines. The nearest same-mechanism comparator is the interrupting Activity boundary Timer at `+5521/-838` code and `+363/-31` documentation: code additions rose by `2148`, about 39%, while documentation additions fell by `251`, about 69%. The increase pays for replacing Timer-only Activity-handler ownership across its complete producer/consumer census, the complete admission, default-exclusion, evidence, and product-example registrations, and continuation-safe fail-closed scheduling that excludes ledger-suppressed retries and identity conflicts from semantic races. The reusable code-axis weight removed in the range is Message-first runner batching: `StimulusOrder` now drives completion, Message, and Timer inputs from the declared answer-free schedule, so a later mixed-ingress family does not need another family-specific runner path. No semantic or evidence lane is removed to manufacture a lower figure. [The capsule cost ledger](../CAPSULE-COST-LEDGER.md) owns the reproducible measurement.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `7efbf69a` | `fork-turns-none` | `approve-with-required-edits` | `1949fb45, 76181f8a` |
| Semantic checkpoint | `bbd2801a` | `fork-turns-none` | `approve-with-required-edits` | `c4de0166` |
| Closure | `c8b3c1ec` | `fork-turns-none` | `approve-with-required-edits` | `af3712c5` |

The cold proposal review required six corrections: close the public stimulus domain, use deep immutability, state the exact conditional Lean theorem, finalize the profile and failure identities, complete the producer/consumer/guard inventory, and route the Product 2 capability owner. The same reviewer closed five findings at `1949fb45` and approved the exact 75-path migration census at `76181f8a`; neither round changed the selected behavior, public observation, exclusions, or evidence strategy.

The context-cold semantic-checkpoint review targeted `bbd2801a` and required the official XSD form for `operationRef`, placement of the checked Message Boundary Event arm in the node schema union, exact fixture-independent host-first topology in every independent checked/program admission path, and complete assurance-map routing in the review packet. The same reviewer approved correction target `c4de0166` with all four findings closed and no change to the selected account, public contract, exclusions, or evidence strategy; the concurrent clean-target gate passed with output SHA-256 `20be938a4adfa15d361de9a7f53f6a828a96772486ba6e67bd3dfb697f99dc73`.

The context-cold closure review targeted `c8b3c1ec` and required ledger-suppressed Message callbacks to be excluded from Message/completion contention and the cost endpoint to include the complete closure correction range. The same reviewer approved correction target `af3712c5` with both findings closed, both callback orders covered for wrong-channel and wrong-subscription retries, the genuine exact race still fail-closed, and the cost arithmetic reproduced. The complete clean-target pre-push gate passed at `af3712c5` after the sandbox-only loopback refusal was retried in the authorized host environment.
