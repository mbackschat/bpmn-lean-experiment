# Intermediate Catch Message proposal

## Status and owner decision

**Draft proposal — owner approval required before implementation.** This capsule selects one directly addressed, payload-free Intermediate Catch Message Event in normal flow. It does not select an Intermediate Throw Message Event, Collaboration, Message Flow, BPMN CorrelationKey, CIB message-name/business-key behavior, or A12 façade compatibility.

The proposed discriminator is:

```text
None Start Event
  → payload-free Intermediate Catch Message Event
  → User Task
  → None End Event
```

The trailing User Task is an already implemented mechanism. It keeps the semantic Process and Temporal Workflow live after the message is consumed so a second command with a fresh command ID can establish semantic stale refusal rather than only a post-closure transport result.

Approval would establish the design boundary and authorize red/green implementation of this exact capsule. It would not approve any excluded message behavior.

## Exact question

The capsule asks:

> In one admitted acyclic single-token Process, can activation of a payload-free Intermediate Catch Message Event create one Process-owned subscription, can an external input addressed by its complete subscription occurrence and exact source channel consume it once, and can Temporal durably deliver and replay that input without defining BPMN matching or consumption?

The closest unsupported claim is key-based correlation of an otherwise unaddressed Message to one Process instance. This proposal deliberately does not make that claim.

## Why this is catch-only

BPMN 2.0.2 requires a Message Flow to connect separate Pools and prohibits one between objects in the same Pool. A true modeled throw/catch pair therefore introduces at least two Participants, two Process instances, Collaboration and Message Flow structure, outbound-message commitment, cross-Workflow routing, and delivery-failure semantics.

Combining those concerns with the first subscription transition would make the capsule a Collaboration and multi-instance routing capsule rather than the smallest Message Event lifecycle. This proposal selects the catching shape and treats the external sender as ingress outside the admitted Process. An Intermediate Throw Message Event remains the next distinct proposition after direct subscription and consumption are closed.

## Normative basis

The normative source is BPMN 2.0.2:

- Clause 8.4.2 defines correlation as runtime association of a Message with a particular Process instance and notes that correlation is especially useful when infrastructure does not already provide instance routing. It also states that message catch and throw Events behave like receive and send Tasks with respect to correlation.
- Clauses 8.4.11 and 8.5 define Message, Interface, and Operation. A Message may omit `itemRef`; an Operation has exactly one input Message; and executable Message Events require `messageRef` and `operationRef`.
- Clause 9.4 requires Message Flows to connect separate Participants and prohibits Message Flow within one Pool.
- Clauses 10.5 and 10.5.1 distinguish catching and throwing Events, classify Messages as published triggers generated outside the receiving Pool, and use correlation when a Message must reach a particular Process instance.
- Clause 10.5.4 states that a catching Intermediate Event in normal flow retains its token until the trigger occurs and then continues along its outgoing Sequence Flow.
- Clause 10.5.5 and Table 10.99 define MessageEventDefinition and its `messageRef` and `operationRef`.

The official CMOF and XSD establish the relevant Process, IntermediateCatchEvent, MessageEventDefinition, Message, Interface, and Operation associations. They do not select a runtime router, a transport acknowledgement, a duplicate-delivery contract, or an engine-specific business-key API.

## Selected source profile

The admitted document must contain exactly:

- one executable private Process;
- one none Start Event;
- one Intermediate Catch Event with one contained MessageEventDefinition;
- one User Task;
- one none End Event;
- three Sequence Flows forming the stated linear topology;
- one Message root with no `itemRef`;
- one Interface root with one Operation;
- a MessageEventDefinition whose `messageRef` resolves to that Message and whose `operationRef` resolves to that Operation;
- an Operation whose `inMessageRef` resolves to the same Message, with no `outMessageRef`, errors, or implementation reference;
- no data inputs, data outputs, Data Associations, parser warnings, extension elements, expressions, additional Flow Nodes, or additional root elements.

The profile rejects omitted or unresolved Message/Operation references even if a permissive engine would deploy them. It also rejects Message payload structure, referenced EventDefinitions, Message Start or End Events, Intermediate Throw Events, boundary Events, multiple EventDefinitions, Message Flow, Participant, Collaboration, CorrelationKey, CorrelationSubscription, Receive Task, Send Task, and repeated activation.

The direct-address restriction is profile narrowing, not a claim that BPMN CorrelationKey is invalid or unnecessary in broader models.

## Checked source and Semantic Process definition

The checked graph retains the complete source channel needed to distinguish two otherwise identical subscriptions:

```ts
type MessageChannel = DeepReadonly<{
  interfaceId: string;
  operationId: string;
  messageId: string;
}>;

type CheckedIntermediateCatchMessageEvent = DeepReadonly<{
  kind: "intermediateCatchMessageEvent";
  id: string;
  channel: MessageChannel;
}>;
```

Source admission validates the payload-free Message and the complete MessageEventDefinition → Operation → input Message reference chain before constructing this node. The private moddle graph does not cross the `@bpmn-lean/bpmn-source` boundary.

The source node lowers to a reusable wait operation:

```ts
type AwaitMessageOperation = DeepReadonly<{
  kind: "awaitMessage";
  id: string;
  origin: {
    kind: "bpmnElement";
    elementId: string;
  };
  input: string;
  output: string;
  channel: MessageChannel;
}>;
```

`awaitMessage` means “consume one input token and create one subscription for an exact channel.” It does not encode throwing, routing across Processes, boundary interruption, payload mapping, or key extraction as dormant options.

The admitted program contains `initiate`, `awaitMessage`, `awaitUserTask`, and `terminate`. The profile-parameterized admission capability must authorize exactly one operation of each kind and reject every additional or simultaneously enabled internal operation.

## Subscription identity, correlation input, and scope

The subscription is a runtime occurrence:

```ts
type MessageSubscriptionId = OccurrenceId;

type OpenMessageSubscription = DeepReadonly<{
  id: MessageSubscriptionId;
  channel: MessageChannel;
}>;
```

Its identity is the existing complete occurrence triple `(processInstanceId, elementId, activation)`. The first and only admitted activation has ordinal `1`.

The semantic Process instance owns the subscription at Process scope. The semantic core creates it when `awaitMessage` fires and removes it only when an eligible message input commits. A Temporal Workflow ID, Run ID, Signal Event ID, caller address, CIB execution ID, and external broker identity never enter semantic identity.

The selected correlation input is direct subscription addressing:

```ts
type DeliverMessageStimulus = DeepReadonly<{
  kind: "deliverMessage";
  commandId: string;
  subscriptionId: MessageSubscriptionId;
  channel: MessageChannel;
}>;
```

The caller names the exact semantic Process instance through `subscriptionId.processInstanceId`; the production client derives the existing collision-resistant Workflow address from that semantic identity. The core still checks the full occurrence and channel against committed subscription state.

This is infrastructure-assisted instance routing in the bounded BPMN account. It is not BPMN key-based or context-based correlation, message-name matching, broadcast, or a global search over subscriptions.

## Payload boundary

The Message carries no payload. The source Message omits `itemRef`; the Operation has only the matching input Message; the Event has no data output or Data Association; and `DeliverMessageStimulus` has no payload field.

An omitted payload and a JSON `null`, empty object, empty string, or Process-variable patch are not aliases. Any later payload proposition must select ItemDefinition, wire value types, catch Data Association, variable scope, validation failure, and versioning as a separate capsule or approved expansion.

## Stable semantic rules

### `MSG-WAIT-01` — activate one Process-owned subscription

When `awaitMessage` has one input token and no subscription for that activation exists, it consumes exactly one token and creates exactly one subscription with the complete occurrence identity and source channel.

Internal closure stops at the subscription. It does not create the output token or advance the trailing User Task.

This is a vendor-neutral BPMN rule.

### `MSG-DELIVER-01` — correlate and consume the exact subscription once

A `deliverMessage` stimulus commits if and only if the Process is running and its complete subscription identity and channel equal one active subscription.

Commit removes that subscription, creates one token on the operation output, and resumes internal closure. In the admitted topology closure creates the trailing User Task occurrence and stops there.

The one-to-one direct-address match is a selected project profile rule over the vendor-neutral catch/consume mechanism. It does not generalize BPMN CorrelationKey.

### `MSG-REFUSE-01` — reject wrong and stale delivery without state change

A delivery with a different Process instance, Event element, activation ordinal, interface, operation, or Message rejects with exact committed-state preservation.

A fresh command ID targeting an already consumed subscription is stale and rejects with exact state preservation while the trailing User Task keeps the Process live.

Repeating the identical command ID with the identical stimulus is a transport duplicate: the adapter returns or records the first semantic result without applying a second core transition. Reusing the command ID with different content is the existing non-semantic command-identity conflict.

### `MSG-OBSERVE-01` — expose the complete resumption surface

The stable message-wait state projects:

- `status: "running"`;
- one active wait with `kind: "message"` and multiplicity `1`;
- one `openMessageSubscriptions` entry with the complete occurrence identity and channel;
- one enabled `deliverMessage` interaction with the same occurrence identity and channel;
- no open User Task, timer, or effect.

After a matching delivery commits, no message subscription or message interaction remains and the existing trailing User Task projection is the only resumption surface.

Canonical `activeWaits` ordering becomes User Task, Message, Timer, then effect by semantic kind, followed by element identity within each kind. This inserts Message without changing the relative order of any existing kind pair.

## Runtime-only and synthetic constructs

| Construct | Source or derivation | Owner and lifecycle | Public projection |
|---|---|---|---|
| Control places | Deterministic lowering of the three Sequence Flows | Immutable Semantic Process program | Not directly public |
| Message channel | Resolved Interface, Operation, and Message IDs from admitted source | Immutable checked graph and program | Open subscription and enabled interaction |
| Subscription occurrence | `awaitMessage` activation plus semantic Process instance | Semantic runtime; removed on matching delivery | `activeWaits`, `openMessageSubscriptions`, and `enabledInteractions` |
| Activation ordinal | Per-element semantic activation count | Semantic runtime | Subscription occurrence identity |
| Signal Event and Workflow address | Temporal Service and adapter | Host transport/history only | Refinement evidence, never canonical semantic state |
| Command result ledger | Accepted command content and first semantic outcome | Temporal adapter for one Run under the existing pre-release lifecycle | Command observation; not BPMN state |

No global subscription registry, broker queue, correlation index, or outbound-message intent is introduced.

## Lean and executable obligations

The new runtime family requires a declarative `ProgramStep` case distinct from the executable evaluator. Every evaluator-produced subscription activation and delivery transition must have a checked soundness proof into that relation.

The minimum useful laws are:

- exact `awaitMessage` activation creates one subscription and preserves its complete channel;
- exact matching delivery consumes that one subscription and opens the trailing User Task;
- any mismatch in the six address/channel components rejects with exact state preservation;
- a consumed subscription cannot be consumed again under a fresh command ID;
- the start closure requires exactly two internal steps, fails at a one-step limit, and remains below the configured closure limit;
- the post-message closure requires exactly one internal step;
- every stable running state in the admitted program exposes exactly one resumption surface;
- no admitted state enables more than one internal operation.

The nearest checked non-law is “Message identity alone selects a subscription.” Two states with the same Message ID but a different subscription activation or Operation must not be treated as the same delivery target.

The targeted preservation gate must also retain an executable synthetic stranded-token rejection so admission cannot mistake non-terminal quiescence without an ingress surface for progress.

## Temporal hosting and refinement preflight

### Durable ingress and acknowledgement

The production adapter adds one typed Signal carrying exactly `DeliverMessageStimulus`. Signal is selected because message arrival is asynchronous ingress; Service acknowledgement means only that Temporal accepted the Signal for the addressed Workflow, not that BPMN correlation committed.

The synchronous Signal handler validates the closed wire shape and command-identity reuse, then enqueues the stimulus. It does not inspect or mutate semantic subscription state. The existing single main Workflow loop remains the only caller of the pure semantic core and the only mutator of committed semantic state.

The canonical command observation records committed or rejected semantic processing. A caller requiring that result must read an authoritative application projection or the existing diagnostic trace Query after processing; this capsule does not mislabel Signal acceptance as `committed`.

Signal-With-Start is excluded. The Process must already have been admitted and started. The Workflow enqueues the start stimulus before registering handlers, so any Signal accepted immediately after start is ordered after semantic start input.

### Wait, ordering, duplicates, and closure

The subscription remains semantic-core state. Temporal stores only the Workflow state and durable Signal Event needed to reconstruct it.

Signals are serialized in their durable Workflow-history order and enter the semantic core as explicit ordered stimuli. The exact profile has one subscription and no message race. Concurrent routing, fairness, global matching, and selection among multiple subscriptions are excluded.

Two identical Signal deliveries with the same command ID and content are coalesced through the existing accepted-stimulus and result ledger. Two different command IDs are two semantic attempts: the first eligible delivery can commit and a later one must reject as stale if the Workflow remains live.

After the valid delivery, the existing User Task Update completes the Process. A Signal addressed only after Workflow closure is a Temporal closed-Workflow transport result, not a fabricated semantic stale rejection.

No timer, Activity, external effect, cancellation scope, retry policy, or Continue-As-New path is added. Temporal may retry Workflow Tasks and replay the Signal Event; neither creates another semantic delivery.

### Host-capability obligation

The newly reachable wait sets are exactly one Message subscription before delivery and exactly one User Task after delivery. Pre-start host admission must accept both and reject every mixed or multiple host-wait shape outside the profile.

The generic Signal handler can wake the main loop without a timer/effect scheduler branch. The runtime invariant throw remains defensive only; typed pre-start admission must establish the reachable wait-set contract before Workflow start.

### Smallest live-history witness

The live witness must:

1. start the exact admitted Process and observe one open Message subscription;
2. stop the Worker;
3. deliver one exact Signal while no Worker polls;
4. start a replacement Worker and require the matching command to commit into the trailing User Task state;
5. send a fresh-command stale delivery for the consumed subscription and require semantic rejection with unchanged User Task state;
6. repeat the original Signal and require the first committed result without another transition;
7. complete the User Task through the existing Update path;
8. capture the disposable history, require the Signal Event and command observations, replay it, and clean the server.

The nearest adapter counterexample is a handler that advances the Process solely because the Signal addressed the Workflow, without checking the committed subscription channel and occurrence through the semantic core. A wrong-channel Signal must remain durably accepted by Temporal yet semantically rejected, separating transport acceptance from BPMN delivery.

## CIB Seven classification

No message-specific CIB relationship is selected and CIB is not a target for this capsule. The proposed message rules derive from BPMN plus an explicit project direct-address restriction; they make no claim about CIB message-name, business-key, execution-tree, or `RuntimeService` correlation behavior.

The trailing User Task reuses existing `CIB-AGR-0001` and `CIB-OP-0001` only for its already established wait and occurrence premise. A future standards-only profile artifact may name those existing relationships while its declared target set excludes CIB message execution.

Pinned CIB message evidence is therefore not a prerequisite for this direct-addressed standards slice. It becomes mandatory before selecting any CIB-dependent message rule or compatibility claim, including message-name/business-key matching, correlation to one versus all executions, variable payload delivery, unmatched-message failure, transaction timing, modeled throw behavior, or A12 send-message façade results. That later work must add the smallest relationship-register entry, probe, fidelity classification, and mutation together; this proposal supplies no placeholder ID.

## Evidence matrix

| Rule | BPMN/profile | Lean | TypeScript | CIB | Temporal | Negative witness and mutation |
|---|---|---|---|---|---|---|
| `MSG-WAIT-01` | Clauses 10.5.1 and 10.5.4 plus exact source profile | Declarative activation, evaluator, soundness, and exact wait law | Independent activation and projection | Not claimed | Query observes the core-owned wait before delivery | Mutation drops or changes the projected channel and the comparator must disagree |
| `MSG-DELIVER-01` | Clause 8.4.2 plus direct-address profile restriction | Exact-match relation, evaluator, and consumption law | Independent exact match and consumption | Not claimed | Durable Signal reaches only the core queue; restart and replay preserve the committed result | Wrong-channel Signal is transport-accepted but semantically rejected |
| `MSG-REFUSE-01` | Direct-address and one-consumption profile | Quantified mismatch/stale state-preservation law | Full mismatch, stale, duplicate-content, and identity-conflict cases | Not claimed | Fresh stale Signal rejects while Workflow is live; duplicate Signal reuses the first result | Mutation matches by Message ID alone and must accept a case the real account rejects |
| `MSG-OBSERVE-01` | Observation profile | Exact canonical subscription/interaction projection | Independent canonical projection and ordering | Not claimed | Query/history/result reconciliation and replay | Comparator mutation removes the subscription or leaves it visible after consumption |

Lean, TypeScript, and Temporal all consume the one TypeScript-produced checked graph and Semantic Process program. Lean independently recomputes checked-graph-to-program lowering but does not parse BPMN XML, so agreement cannot detect a shared XML-to-checked-channel defect. Source mutation tests must separately reject a changed `operationRef`, changed `inMessageRef`, added `itemRef`, and unresolved QName.

## Versioning consequences

Implementation is a breaking pre-release contract replacement. It adds one checked node kind, one Semantic Process operation kind, one stimulus kind, one runtime wait and activation counter, one wait kind, one required `openMessageSubscriptions` state field, and one enabled-interaction variant.

The semantic profile, answer-free scenario, checked graph, Semantic Process program, canonical result, all JSON Schemas, Lean decoders/encoders, TypeScript producers/consumers, differential pipeline, Temporal Signal contract, fixtures, and tests must change atomically. No legacy reader, optional compatibility field, format counter, Workflow patch branch, or retained history is permitted before an immutable baseline exists.

The existing five-arm `CommandOutcome` and completed Process receipt remain unchanged. Signal delivery adds no suspended outcome and no resume entry point: the Process is already represented as running with a public subscription, and the ordinary Workflow loop resumes when input arrives.

No dependency addition, removal, upgrade, vendoring, or license-bound source is required.

## Required, optional, and excluded

Required for capsule closure:

- exact source admission and lowering for the selected payload-free catch shape;
- complete occurrence and channel identity;
- one-consumption, wrong/stale refusal, duplicate-content behavior, and public subscription projection;
- declarative Lean relation, evaluator soundness, useful laws, and checked non-law;
- independent TypeScript behavior;
- targeted closure, multiple-enabledness, resumability, and host-admission checks;
- durable Signal ingress, Worker absence, live stale refusal, duplicate delivery, history, replay, cleanup, and a meaningful mutation.

Optional after this capsule, under separate approval:

- a payload-bearing catch using an approved data and mapping contract;
- key-based correlation or a global subscription index;
- a modeled Intermediate Throw Message Event and outbound-message intent;
- CIB compatibility and A12 façade adoption evidence.

Excluded:

- Collaboration, Participant, Message Flow, Conversation, CorrelationKey, and CorrelationSubscription;
- Message Start, End, boundary, event-subprocess, Multiple, and Parallel Multiple Events;
- Receive Task, Send Task, event-based Gateway, races, broadcast, and multiple live subscriptions;
- payloads, variables, Data Associations, correlation expressions, and business keys;
- cross-Workflow send, child Workflow, Nexus, external broker, Continue-As-New, and retained production histories;
- BPMN Process Execution Conformance, broad Message Event support, CIB message compatibility, and A12 adoption coverage.

## Approval test

Owner approval should answer one question: is direct complete-subscription addressing an acceptable first standards slice, with BPMN key correlation and modeled throw explicitly deferred?

If yes, implementation begins from this proposal under red/green TDD and the complete atomic contract boundary above. If no, do not edit production semantics; replace this proposal with the chosen correlation and catch/throw boundary first.
