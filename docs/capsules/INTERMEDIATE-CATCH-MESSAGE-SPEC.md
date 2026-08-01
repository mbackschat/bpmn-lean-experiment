# Intermediate Catch Message specification

## Status

**Implemented evidence-closed draft contract.** This capsule selects one directly addressed, payload-free Intermediate Catch Message Event in normal flow. It does not select an Intermediate Throw Message Event, Collaboration, Message Flow, BPMN CorrelationKey, CIB message-name/business-key behavior, or A12 façade compatibility.

The discriminator is:

```text
None Start Event
  → payload-free Intermediate Catch Message Event
  → User Task
  → None End Event
```

The trailing User Task is an already implemented mechanism. It keeps the semantic Process and Temporal Workflow live after the message is consumed so a second command with a fresh command ID can establish semantic stale refusal rather than only a post-closure transport result.

## Exact claim

In product terms, the capsule establishes:

> May a client that already knows one running Process instance and the exact open Message subscription deliver one payload-free Message that resumes only that subscription once, with wrong or repeated deliveries leaving Process state unchanged and Temporal preserving delivery across Worker loss and replay?

The known eventual consumer is the A12 Workflows `ProcessEngineClient` send-message façade and the eight retained A12 models containing Message Event Definitions. This first lower-layer slice does not yet satisfy that façade: message-name/business-key routing, modeled throw, payloads, CIB compatibility, and the A12 adapter contract remain separate work.

The closest unsupported claim is key-based correlation of an otherwise unaddressed Message to one Process instance. This specification deliberately does not make that claim.

## Why this is catch-only

BPMN 2.0.2 requires a Message Flow to connect separate Pools and prohibits one between objects in the same Pool. A true modeled throw/catch pair therefore introduces at least two Participants, two Process instances, Collaboration and Message Flow structure, outbound-message commitment, cross-Workflow routing, and delivery-failure semantics.

Combining those concerns with the first subscription transition would make the capsule a Collaboration and multi-instance routing capsule rather than the smallest Message Event lifecycle. This specification selects the catching shape and treats the external sender as ingress outside the admitted Process. An Intermediate Throw Message Event remains the next distinct proposition after direct subscription and consumption are closed.

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

The admitted document must contain this exact source-node and root-definition multiset:

- one executable private Process;
- one none Start Event;
- one Intermediate Catch Event with one contained MessageEventDefinition;
- one User Task;
- one none End Event;
- three Sequence Flows forming one finite acyclic linear graph;
- one Message root with no `itemRef`;
- one Interface root with one Operation;
- a MessageEventDefinition whose `messageRef` resolves to that Message and whose `operationRef` resolves to that Operation;
- an Operation whose `inMessageRef` resolves to the same Message, with no `outMessageRef`, errors, or implementation reference;
- no data inputs, data outputs, Data Associations, parser warnings, extension elements, expressions, additional Flow Nodes, or additional root elements.

Reusable checked-source graph validation, not a named topology predicate, must establish distinct identities, exact legal arities, one Start, at least one End, reference integrity, reachability, co-reachability, acyclicity, and the current producer/consumer discipline. The profile capability supplies only the exact node-kind and lowered-operation multisets. Those facts admit both linear mechanism orders: Message then User Task, selected by the end-to-end discriminator above, and User Task then Message, required as a focused admission and preservation witness. Production admission must not recognize either complete model path as a special shape.

The profile rejects omitted or unresolved Message/Interface Operation references even if a permissive engine would deploy them. It also rejects Message payload structure, referenced EventDefinitions, Message Start or End Events, Intermediate Throw Events, boundary Events, multiple EventDefinitions, Message Flow, Participant, Collaboration, CorrelationKey, CorrelationSubscription, Receive Task, Send Task, and repeated activation.

The direct-address restriction is profile narrowing, not a claim that BPMN CorrelationKey is invalid or unnecessary in broader models.

## Checked source and Semantic Process definition

The checked graph retains the complete source channel needed to distinguish two otherwise identical subscriptions:

```ts
type MessageChannel = DeepReadonly<
  | {
      kind: "operationMessage";
      interfaceId: string;
      interfaceOperationId: string;
      messageId: string;
    }
  | {
      kind: "directMessage";
      messageId: string;
    }
>;

type CheckedIntermediateCatchMessageEvent = DeepReadonly<{
  kind: "intermediateCatchMessageEvent";
  id: string;
  channel: MessageChannel;
}>;
```

This implemented capsule always produces the `operationMessage` arm. The later owner-approved [Receive Task capsule](RECEIVE-TASK-MESSAGE-PROPOSAL.md) atomically widened the one current wire contract with the `directMessage` arm while preserving this capsule's exact meaning. `interfaceOperationId` always denotes the BPMN `Interface.operation` identity. It is not a Semantic Process operation ID, a transport operation, or an effect descriptor operation.

Source admission validates the payload-free Message and the complete MessageEventDefinition → BPMN Interface Operation → input Message reference chain before constructing this node. The private moddle graph does not cross the `@bpmn-lean/bpmn-source` boundary.

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
  message: {
    elementId: string;
    channel: MessageChannel;
  };
}>;
```

`awaitMessage` means “consume one input token and create one subscription for an exact channel.” It does not encode throwing, routing across Processes, boundary interruption, payload mapping, or key extraction as dormant options.

The redundant `message.elementId` is the Intermediate Catch Event identity used to construct the runtime occurrence. Checked-source validation requires the Event's `operationMessage` discriminant plus all three channel identifiers to be nonempty in their separate domains. Reusable `awaitMessage` program validation instead accepts exactly one complete closed channel arm, requires `message.elementId` to be nonempty and equal `origin.elementId`, requires the input and output control places to exist and differ, and requires the channel to equal the checked node's resolved channel under exact lowering equality.

The new operation passes the [Semantic Process IL growth stop](../SEMANTIC-PROCESS-IL-SPEC.md#growth-across-bpmn-event-diversity) because a named A12 send-message consumer and a concrete Temporal Signal refinement risk require a subscription lifecycle not represented by an existing operation. `awaitUserTask` lacks a definition-bound Message channel and represents human task completion; `awaitEffect` commits outbound host work and result handling rather than passive inbound delivery. Reusing either would erase the discriminator that the semantic core must check. A generic Event operation remains rejected.

The lowering-side discriminator uses two separately admitted source fixtures that hold the Catch Event ID and Sequence Flows fixed while replacing the sole Interface/Operation/Message chain and repointing both EventDefinition references. The checked channel and `awaitMessage.message.channel` must remain `operationMessage` and change to the replacement `(interfaceId, interfaceOperationId, messageId)` triple; a stale or fixture-constant lowerer must fail exact Lean lowering equality and the source mutation test. A separate hostile source containing both chains remains rejected by the exact root-definition multiset.

The admitted program contains exactly one `initiate`, one `awaitMessage`, one `awaitUserTask`, one `reachNoneEnd`, and one root `completeScope`. Profile-parameterized capability admits that multiset; reusable graph facts determine whether Message or User Task occurs first. Capability tests must reject an unknown profile, an existing profile, and every changed cardinality without adding a whole-program execution-surface predicate.

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

The caller supplies both fields. `subscriptionId` is the correlation selector: it names the exact semantic Process instance and subscription occurrence, and the production client derives the existing collision-resistant Workflow address from its Process-instance component. `channel` is a caller-supplied definition-consistency assertion copied from the public subscription, not a second correlation key. Wrong-component witnesses are synthetic test inputs over those caller-supplied fields; none is a channel value invented by Temporal or the semantic core.

This is infrastructure-assisted instance routing in the bounded BPMN account. It is not BPMN key-based or context-based correlation, message-name matching, broadcast, or a global search over subscriptions.

## Payload boundary

The Message carries no payload. The source Message omits `itemRef`; the Operation has only the matching input Message; the Event has no data output or Data Association; and `DeliverMessageStimulus` has no payload field.

An omitted payload and a JSON `null`, empty object, empty string, or Process-variable patch are not aliases. Any later payload proposition must select ItemDefinition, wire value types, catch Data Association, variable scope, validation failure, and versioning as a separate capsule or approved expansion.

## Stable semantic rules

### `MSG-WAIT-01` — activate one Process-owned subscription

When `awaitMessage` has one input token and no subscription for that activation exists, it consumes exactly one token and creates exactly one subscription with the complete occurrence identity and definition-resolved channel in `awaitMessage.message`.

Internal closure stops at the subscription. It does not create the output token or advance the trailing User Task.

This is a vendor-neutral BPMN rule.

### `MSG-DELIVER-01` — correlate and consume the exact subscription once

A `deliverMessage` stimulus commits if and only if the Process is running, its complete `subscriptionId` directly addresses one active subscription, its caller-supplied channel equals that subscription's channel, and the active subscription channel still equals the admitted `awaitMessage.message.channel` for that element. The full identity performs correlation; the two channel equalities establish definition consistency and do not perform a global channel lookup.

Commit removes that subscription, creates one token on the operation output, and resumes internal closure. In the admitted topology closure creates the trailing User Task occurrence and stops there.

The one-to-one direct-address match is a selected project profile rule over the vendor-neutral catch/consume mechanism. It does not generalize BPMN CorrelationKey.

### `MSG-REFUSE-01` — reject wrong and stale delivery without state change

A delivery with a different Process instance, Event element, activation ordinal, Interface, Interface Operation, or Message rejects with exact committed-state preservation.

A well-formed delivery applied before the addressed subscription is active rejects under the same no-active-subscription rule. In the supported production path no Workflow exists before Process start. A Signal accepted immediately after Workflow creation is queued after the already enqueued start stimulus, so the Message-first profile activates its subscription before that delivery reaches the core; the reverse User-Task-first profile rejects a delivery attempted while the User Task is still open because its Message subscription does not yet exist.

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

Canonical `activeWaits` ordering becomes User Task, Message, Timer, then effect by semantic kind, followed by Unicode scalar-value element-ID order within each kind. This inserts Message without changing the relative order of any existing kind pair.

## Owner-decision 6 ordering reopen

Adding Message changes the closed wait-kind domain and therefore triggers owner decision 6 even though the selected graph never exposes mixed waits. Implementation must replace Lean's current within-kind program-order premise with an explicit element-ID sort, matching the TypeScript and CIB projectors. An order-coincidence theorem is not selected because it would preserve the fragile ID-sorted-program premise that this domain change is required to reopen.

The synthetic Lean and TypeScript projection fixture must contain one wait of each of the four kinds with element IDs chosen so a global element-ID sort disagrees with the selected semantic-kind order. A second same-kind pair in reverse storage/program order must establish within-kind element-ID sorting rather than only the four-kind rank.

`PAR-PROJECT-01` remains the owner of the canonical `activeWaits` grouping and `(kind, elementId)` order. Its proposition does not change, but its evidence row and synthetic lock must be restated over the new four-member kind domain. The Message capsule adds no parallel behavior and makes no claim about concurrent Message waits.

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
- any mismatch in the six address/definition components rejects with exact state preservation;
- a consumed subscription cannot be consumed again under a fresh command ID;
- the start closure requires exactly two internal steps, fails at a one-step limit, and remains below the configured closure limit;
- the post-message closure requires exactly one internal step;
- every stable running state in the admitted program exposes exactly one resumption surface;
- no admitted state enables more than one internal operation.

The reverse User-Task-then-Message program is a required focused witness under the same profile capability. Its start closure exposes only the User Task, exact task completion exposes only the Message subscription, exact Message delivery terminates, each automatic boundary stays within the same closure limit, no stable state enables multiple internal operations, and every stable running state has exactly one public resumption surface. These are admission and preservation checks, not a second end-to-end scenario or a second semantic account.

The nearest checked non-law is “Message identity alone selects a subscription.” Two states with the same Message ID but a different subscription activation or BPMN Interface Operation must not be treated as the same delivery target.

The exact source-to-result claim at risk is that generic graph admission plus the profile multiset lowers either legal order to the same mechanism sequence dictated by its Sequence Flows, and that closure stops at the first reachable external wait rather than advancing through it. The reference-chain lowering discriminator, both-order closure witnesses, operation-array permutation check, closure-bound failures, single-enabledness checks, and synthetic stranded-token rejection form the targeted preservation gate. It remains narrower than universal source-to-run preservation.

## Temporal hosting and refinement preflight

### Durable ingress and acknowledgement

The production adapter adds one typed Signal carrying exactly `DeliverMessageStimulus`. Signal is selected because message arrival is asynchronous ingress; Service acknowledgement means only that Temporal accepted the Signal for the addressed Workflow, not that BPMN correlation committed.

The supported project client accepts `unknown`, validates the closed stimulus shape and addressed Process instance before calling Temporal, and rejects malformed input as typed adapter request failure `BpmnMessageIngressInvalid` without sending a Signal. A malformed payload introduced by raw Temporal access, an incompatible deployment, or corrupt history is outside the supported producer boundary and is an infrastructure/replay incompatibility, never `CommandOutcome.Rejected`.

The synchronous Signal handler receives only the validated closed shape. For a new command ID it records the exact accepted stimulus and enqueues it. For an exact duplicate it leaves the first record and queue unchanged. Reuse of an accepted command ID with different well-formed content records `BpmnCommandIdentityConflict` as an adapter request failure for that attempted content without throwing from the Signal handler, failing a Workflow Task, or applying a semantic transition. The existing single main Workflow loop remains the only caller of the pure semantic core and the only mutator of committed semantic state.

Signal-With-Start is excluded. The Process must already have been admitted and started. The Workflow enqueues the start stimulus before registering handlers, so any Signal accepted immediately after start is ordered after semantic start input.

### Semantic result and lifecycle resolution

Signal acknowledgement does not return `ProcessCommandResult`. The project `submitMessageDelivery` client sends the Signal and then resolves the exact accepted stimulus through a new read-only message-delivery-result Query backed by the Workflow's durable accepted-stimulus/result ledger. While processing is pending the Query returns `pending`; after the main loop records the command observation it returns the exact semantic outcome. The client then returns the existing `ProcessCommandResultKind.Semantic` envelope. `MSG-REFUSE-01` is therefore publicly distinguishable from Signal acceptance while the Workflow remains live.

```ts
type MessageDeliveryResolution = DeepReadonly<
  | {
      kind: "pending";
      stimulus: DeliverMessageStimulus;
    }
  | {
      kind: "semantic";
      stimulus: DeliverMessageStimulus;
      outcome: CommandOutcome;
    }
  | {
      kind: "requestFailure";
      stimulus: DeliverMessageStimulus;
      failure: "commandIdentityConflict";
    }
>;

type MessageDeliveryRecord = Exclude<
  MessageDeliveryResolution,
  { kind: "pending" }
>;
```

The completed Process receipt gains a required `messageDeliveryRecords` collection containing each accepted exact Message stimulus and either its first semantic outcome or its typed identity-conflict request failure. Records preserve accepted Signal history order; exact duplicates add no record. This host ledger is deterministic under replay but is not canonical BPMN state or trace. It is required because the reverse User-Task-then-Message order can close on Message delivery before a result Query succeeds. On closed-execution resolution, the client validates the receipt and returns the retained semantic result for the exact stimulus, rethrows the recorded `BpmnCommandIdentityConflict` for conflicting content, returns `processClosed` only when no record exists for a distinct command, and returns `processUnknown` only when neither execution nor receipt is retained.

Malformed input never enters `messageDeliveryRecords`. Exact duplicate Signals reuse the first record. A Signal accepted by Temporal but not yet processed may produce a transient `pending`; client deadline or Service unavailability remains infrastructure failure. The diagnostic trace Query remains harness-only and is not the production result API.

### Wait, ordering, duplicates, and closure

The subscription remains semantic-core state. Temporal stores only the Workflow state and durable Signal Event needed to reconstruct it.

Signals are serialized in their durable Workflow-history order and enter the semantic core as explicit ordered stimuli. The exact profile has one subscription and no message race. Concurrent routing, fairness, global matching, and selection among multiple subscriptions are excluded.

Two identical Signal deliveries with the same command ID and content are coalesced through the accepted-stimulus and Message result ledger. Two different command IDs are two semantic attempts: the first eligible delivery can commit and a later one must reject as stale if the Workflow remains live.

After the valid delivery, the existing User Task Update completes the Process. A Signal addressed only after Workflow closure is a Temporal closed-Workflow transport result, not a fabricated semantic stale rejection.

No timer, Activity, external effect, cancellation scope, retry policy, or Continue-As-New path is added. Temporal may retry Workflow Tasks and replay the Signal Event; neither creates another semantic delivery.

### Host-capability obligation

The host predicate classifies Message subscriptions as passive external ingress, in the same scheduling class as User Task Updates, not as host-driven Timer/effect work. It must add `awaitMessage` to that explicit vocabulary rather than rely on the absence of a Timer/effect case.

For Message then User Task, the reachable wait sets are exactly one passive Message subscription followed by one passive User Task. For User Task then Message, they are the same two singleton passive wait sets in reverse order. Pre-start host admission must accept both graph orders through the same operation multiset and generic graph facts. The generic Signal handler wakes the main loop without a timer/effect scheduler branch; no mixed or multiple wait set becomes reachable in this capsule. The runtime invariant throw remains defensive only.

### R8 Signal-history amendment

The 2026-07-31 owner approval explicitly narrows decision R8's zero-Signal assertion. `test:temporal` must continue to require zero Signal Events for every existing Update-, Timer-, and Activity-driven scenario. The Message histories must instead contain exactly the submitted Message Signal Events with exact payload/content binding, including Worker-down delivery, stale fresh-command delivery, exact duplicate, and identity-conflicting attempts; malformed client input produces none. Missing, extra, or payload-substituted Signal history must fail a seeded history mutation. This is an amendment to R8, not an inference from choosing Signal.

### Smallest live-history witness

The live witness must:

1. start the exact admitted Process and observe one open Message subscription;
2. stop the Worker;
3. deliver one exact Signal while no Worker polls;
4. start a replacement Worker and require result resolution to return the matching semantic commit into the trailing User Task state;
5. send a fresh-command stale delivery for the consumed subscription and require result resolution to return semantic rejection with unchanged User Task state;
6. repeat the original Signal and require the first committed result without another transition;
7. reuse the original command ID with a different well-formed channel and require `BpmnCommandIdentityConflict` without a Workflow Task failure or semantic transition;
8. reject malformed client input before Signal submission and require no corresponding Signal Event;
9. complete the User Task through the existing Update path;
10. capture the disposable history, require exactly the submitted Signal Events and command/result reconciliation, replay it, and clean the server.

The nearest adapter counterexample is a handler that advances the Process solely because the Signal addressed the Workflow, without checking the committed subscription channel and occurrence through the semantic core. A wrong-channel Signal must remain durably accepted by Temporal yet semantically rejected, separating transport acceptance from BPMN delivery.

A separate focused reverse-order witness completes the leading User Task, observes the Message subscription, delivers the matching Signal that closes the Process, and recovers its semantic result from the completed receipt. That witness is required to prove the broader profile and host predicate do not depend on the primary scenario's trailing User Task remaining live.

## CIB Seven classification

No message-specific CIB relationship is selected and CIB is not a target for this capsule. The proposed message rules derive from BPMN plus an explicit project direct-address restriction; they make no claim about CIB message-name, business-key, execution-tree, or `RuntimeService` correlation behavior.

The trailing User Task reuses existing `CIB-AGR-0001` and `CIB-OP-0001` only for its already established wait and occurrence premise. A future standards-only profile artifact may name those existing relationships while its declared target set excludes CIB message execution.

Pinned CIB message evidence is therefore not a prerequisite for this direct-addressed standards slice. It becomes mandatory before selecting any CIB-dependent message rule or compatibility claim, including message-name/business-key matching, correlation to one versus all executions, variable payload delivery, unmatched-message failure, transaction timing, modeled throw behavior, or A12 send-message façade results. That later work must add the smallest relationship-register entry, probe, fidelity classification, and mutation together; this proposal supplies no placeholder ID.

The five on-demand CIB conditions from the compatibility-scope decision are disposed explicitly:

| On-demand condition | Disposition for this capsule |
|---|---|
| BPMN leaves a material operational choice and the selected profile adopts CIB's choice | No. Direct full-subscription addressing is an explicit project restriction; no CIB choice is adopted. |
| Source uses a selected `camunda:*` extension | No. The admitted source is BPMN-only and rejects extension elements. |
| A behavioral compatibility claim needs a pinned separating observation | No. CIB Message execution is absent from the declared target set and no compatibility claim is made. |
| A CIB host mechanism or configuration can change the bounded public result | No. Temporal Signal is the selected project host; no CIB job, transaction, or RuntimeService behavior enters the result. |
| An A12 adoption requirement cannot be expressed through an already selected CIB contract | Not yet. The A12 send-message façade is the known eventual consumer, but this standards slice deliberately does not claim its message-name/business-key/payload contract. Reopen CIB and A12 evidence before that adapter is selected. |

Pre-activation delivery also adds no CIB question: pure semantic delivery with no active addressed subscription rejects, the supported Message-first Workflow orders start before Signal processing, the reverse profile can reject while its leading User Task remains open, and delivery to a nonexistent pre-start Workflow is an adapter `processUnknown`/transport classification rather than a CIB or BPMN result.

## Evidence matrix

| Rule | BPMN/profile | Lean | TypeScript | CIB | Temporal | Negative witness and mutation |
|---|---|---|---|---|---|---|
| `MSG-WAIT-01` | Clauses 10.5.1 and 10.5.4 plus exact source profile | Declarative activation, evaluator, soundness, and exact wait law | Independent activation and projection | Not claimed | Query observes the core-owned wait before delivery | Mutation drops or changes the projected channel and the comparator must disagree |
| `MSG-DELIVER-01` | Clause 8.4.2 plus direct-address and definition-consistency profile restriction | Exact-address relation, channel-consistency invariant, evaluator, and consumption law | Independent exact address/definition check and consumption | Not claimed | Durable Signal reaches only the core queue; restart and result resolution preserve the committed result | Wrong-channel Signal is transport-accepted but semantically rejected |
| `MSG-REFUSE-01` | Direct-address and one-consumption profile | Quantified mismatch/pre-activation/stale state-preservation law | Full mismatch, pre-activation, stale, duplicate-content, and identity-conflict cases | Not claimed | Message result Query/receipt distinguishes semantic refusal; malformed and identity-conflicting inputs retain adapter classifications | Mutation matches by Message ID alone and must accept a case the real account rejects |
| `MSG-OBSERVE-01` | Observation profile plus `PAR-PROJECT-01` | Exact canonical subscription/interaction projection and four-kind element-sorted lock | Independent canonical projection and ordering | Not claimed | Query/history/result reconciliation and replay | Comparator mutation removes the subscription, leaves it visible after consumption, or globally sorts waits by element ID |

Lean, TypeScript, and Temporal all consume the one TypeScript-produced checked graph and Semantic Process program. Lean independently recomputes checked-graph-to-program lowering but does not parse BPMN XML, so agreement cannot detect a shared XML-to-checked-channel defect. Source mutation tests must separately reject an inconsistent `operationRef`, inconsistent `inMessageRef`, added `itemRef`, unresolved QName, and extra root-definition chain. The paired valid-chain discriminator must additionally prove that checked projection and lowering preserve the resolved replacement triple rather than a fixture-constant value.

## Versioning consequences

This capsule was implemented as one breaking pre-release contract replacement. It adds one checked node kind, one Semantic Process operation kind, one stimulus kind, one runtime wait and activation counter, one member of the closed `activeWait.kind` enum, one required `openMessageSubscriptions` state field, one enabled-interaction variant, one Message Signal, one result Query, and required Message delivery records in the completed receipt.

The semantic profile, answer-free scenario, checked graph, Semantic Process program, canonical result, all JSON Schemas, Lean decoders/encoders, TypeScript producers/consumers, Java CIB projector, differential pipeline, Temporal Signal/Query/client/receipt contracts, fixtures, and tests changed atomically. [PROFILE-PARAMETERIZED-ADMISSION-SPEC.md](../PROFILE-PARAMETERIZED-ADMISSION-SPEC.md) owns the new capability and both-order preservation evidence; [TEMPORAL-PROCESS-LIFECYCLE-SPEC.md](../TEMPORAL-PROCESS-LIFECYCLE-SPEC.md) owns asynchronous Signal result resolution, receipt recovery, malformed/conflict classification, and the R8 amendment; the pre-start host-capability predicate classifies Message as passive ingress; [SEMANTIC-PROCESS-IL-SPEC.md](../SEMANTIC-PROCESS-IL-SPEC.md) owns the operation, well-formedness, lowering, runtime, and supported/absent boundaries; and the `PAR-PROJECT-01` evidence row names the four-kind sorted lock.

Adding required `openMessageSubscriptions` changes the canonical state denominator from ten to eleven top-level fields. All ten retained CIB evidence envelopes must gain the empty field through the explicit `./scripts/pnpm.sh run replace:cib-evidence` command after the Java projector emits it. The canonical CIB fidelity table and schema-depth guard must change from their reviewed ten-field denominator to the complete eleven-field denominator and classify the empty Message collection and every nested Message field honestly. Ordinary verification must never rewrite those artifacts.

The existing `CommandOutcome` arms and `ProcessCommandResult` union remain unchanged, but the completed receipt does change by gaining the Message delivery ledger used for Signal-result recovery. Signal delivery adds no suspended semantic outcome and no core resume entry point: the Process is already represented as running with a public subscription, and the ordinary Workflow loop resumes when input arrives. `BpmnMessageIngressInvalid` and `BpmnCommandIdentityConflict` remain adapter request failures outside `CommandOutcome`.

The owner explicitly amended R8 from a universal zero-Signal assertion to zero Signal Events for every pre-existing path plus exact, mutation-sensitive Signal Events for the Message path.

No legacy reader, optional compatibility field, format counter, Workflow patch branch, or retained history is permitted before an immutable baseline exists. No dependency addition, removal, upgrade, vendoring, or license-bound source is required.

## Maintained, optional, and excluded

Maintained requirements:

- node-kind/profile-multiset admission plus generic graph validation for both legal mechanism orders, with exact source admission and lowering for the payload-free catch;
- complete occurrence identity, caller-supplied definition consistency, operation-payload element identity, and the reference-selection lowering discriminator;
- one-consumption, wrong/stale refusal, duplicate-content behavior, and public subscription projection;
- declarative Lean relation, evaluator soundness, useful laws, and checked non-law;
- independent TypeScript behavior;
- targeted both-order closure, multiple-enabledness, resumability, stranded-state, four-kind ordering, and passive-ingress host-admission checks;
- durable Signal ingress, malformed/conflicting request classification, result Query/receipt recovery, Worker absence, live stale refusal, duplicate delivery, exact Signal history, replay, cleanup, and meaningful semantic/history mutations;
- atomic eleven-field canonical replacement, retained CIB evidence replacement, fidelity/guard update, lifecycle/admission/IL specification updates, and the owner-approved R8 amendment.

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
