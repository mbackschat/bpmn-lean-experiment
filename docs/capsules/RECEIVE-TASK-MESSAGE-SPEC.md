# Message-addressed Receive Task specification

## Status

**Implemented and evidence-closed after independent proposal, semantic-checkpoint, closure, and correction-audit review. This specification owns the exact direct-Message Receive Task source, semantic, CIB, differential, and Temporal boundary below.**

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `ed8596d` | `external-fresh-session` | `approve-with-required-edits` | `2f39cc2` |
| Semantic checkpoint | `7226733` | `fork-turns-none` | `approve-with-required-edits` | `5a74bad` |
| Closure | `3881a7a` | `external-fresh-session` | `approve-with-required-edits` | `f5f9caf` |

The proposal review and its correction audit are complete. The semantic checkpoint review of immutable target `7226733` approved the checkpoint with required edits, and the same reviewer passed correction audit target `5a74bad`. The external fresh-session closure review of immutable target `3881a7a` approved the account with required edits, and the same reviewer passed correction audit target `f5f9caf`. The full reports remain external handoff evidence; this receipt records only the repository lifecycle facts required by [the independent cold-review gate](../TESTING-SPEC.md#independent-cold-review-gate).

## Contract

The project admits one private executable root Process whose exact checked node-kind multiset is one None Start Event, one Message-addressed Receive Task, and one None End Event, connected by two ordinary Sequence Flows. It executes that Receive Task by reusing the existing payload-free Message subscription, delivery, refusal, observation, Temporal Signal, result-recovery, and replay mechanisms. The direct Message reference remains explicit rather than being forced into the Interface/Operation address required by the implemented [Intermediate Catch Message specification](INTERMEDIATE-CATCH-MESSAGE-SPEC.md).

This is a BPMN Activity/source proposition over an already implemented semantic wait mechanism. It does not add a new semantic transition family, Message-routing service, human-task product, or Collaboration model.

## Normative basis

BPMN 2.0.2 Clause 10 and Table 10.10 define a Receive Task as a Task that waits for a Message from an external Participant and completes when that Message is received. Clause 13.3.3 states that activation waits for the associated Message and that Message arrival completes the Activity. The `ReceiveTask` CMOF and XSD permit optional `messageRef` and `operationRef` properties and default `instantiate` to false. The selected profile uses the direct `messageRef` form and excludes `operationRef` and instantiation.

Clause 8.4.2 applies the same correlation concepts to Message Catch Events and Receive Tasks. Closed OMG issue [BPMN2-201](https://issues.omg.org/issues/BPMN2-201) clarifies that Message Intermediate Catch Events use the same correlation behavior as Receive Tasks, while [BPMN2-222](https://issues.omg.org/issues/BPMN2-222) corrects the Receive Task `operationRef` wording. Those corrections support reusing the subscription mechanism without inventing an Operation where the source has none.

The profile admits a source document that omits the Receive Task `implementation` attribute. Omission is not neutral: `tReceiveTask/@implementation` defaults to `##WebService` in the BPMN XSD, and Table 10.10 names Web service as the default technology. The installed `bpmn-moddle@10.0.0` Receive Task descriptor does not materialize that default, so checked-source admission can verify only that the raw attribute is absent. The profile records the resulting `##WebService` meaning explicitly but deliberately does not realize or claim Web-service transport; Temporal Signal is the bounded project host for the selected semantic Message input. This is a profile limitation, not evidence that the default is absent. Non-default implementation values and general Web-service binding remain outside the capsule.

## Selected source profile

The vendor-neutral source profile contains:

- exactly one BPMN `Definitions` document with one private `Process` whose `isExecutable` value is explicitly true;
- exactly one root `Message` with a nonempty ID, a nonempty name, and no `itemRef`; the name requirement belongs to the selected CIB-backed target because CIB exposes that name in its public Message subscription, while vendor-neutral identity remains the Message ID;
- no root Interface and therefore no Interface Operation, and no root Error, Signal, Escalation, Collaboration, or other executable definition;
- one None Start Event, one Receive Task, one None End Event, and two unconditional Sequence Flows in the root Process;
- a Receive Task with exactly one incoming and one outgoing Sequence Flow, a resolved `messageRef` to the sole root Message, omitted `operationRef`, a raw omitted `implementation` whose normative default is recorded as `##WebService`, omitted `instantiate` or its normalized false value, and no I/O specification, DataInput, DataOutput, Data Association, loop characteristics, ResourceRole, extension element, or boundary Event;
- no alternative start, branch, repetition, nested scope, or modeled sender.

Admission is node-kind plus profile multiset plus generic graph facts. It must not add a predicate for the literal Start → Receive Task → End topology. The checked-source capability owns the exact node-kind multiset and Receive Task property restrictions; reusable graph validation owns identifiers, references, arity, ownership, reachability, co-reachability, acyclicity, and Sequence Flow producer/consumer facts.

Declaration order is not semantics. Reordering the root Process and Message declarations, the three FlowNode declarations, the two Sequence Flow declarations, the Process `flowElement` references, and the Receive Task incoming/outgoing reference declarations must preserve the same checked graph, lowered program, stable Message wait, and completed result. One combined representative permutation is sufficient; this is not a theorem over every XML serialization.

## Profile identity and declared targets

The selected profile ID is `cibseven-2.2.0-message-addressed-receive-task-draft`. Its declared targets are CIB Seven `2.2.0` at revision `834a9874760de8a0107f7c1b32806e37f17fb017`, Lean, TypeScript, and Temporal. BPMN meaning remains owned by this OMG-grounded specification; the CIB relationship classifies only the bounded observed agreement.

The required root Message name is a source-admission fact only: lowering never places it in the checked graph, Semantic Process program, runtime state, or canonical observation. This deliberate information boundary is why the CIB lane classifies canonical `messageId` as adapter-decided rather than deriving it from CIB's public subscription name.

## Closed Message-address representation

`MessageChannel` is this closed union, retaining the field name `channel`:

```ts
const MessageChannelKind = {
  OperationMessage: "operationMessage",
  DirectMessage: "directMessage",
} as const;

type MessageChannel = DeepReadonly<
  | {
      kind: typeof MessageChannelKind.OperationMessage;
      interfaceId: string;
      interfaceOperationId: string;
      messageId: string;
    }
  | {
      kind: typeof MessageChannelKind.DirectMessage;
      messageId: string;
    }
>;
```

The implemented Intermediate Catch Message source always produces `operationMessage`. The selected Receive Task source always produces `directMessage`. Neither arm has optional fields, and no decoder infers an arm from missing data. Equality remains exact structural equality over the selected discriminant and all arm fields.

`messageId` is the BPMN root Message identity. It is not a Message name, broker topic, CIB subscription name, business key, correlation key, Workflow ID, or transport operation. The Process instance and exact runtime occurrence remain selected by `subscriptionId`; `channel` remains a caller-supplied definition-consistency assertion rather than a global lookup key.

This shape is the smallest complete representation because the implemented Intermediate Catch Message and Receive Task consumers require different definition paths with the same runtime subscription and delivery contract. Making Interface fields optional would create illegal mixed shapes and weak compiler errors. Inventing an Interface or Operation for Receive Task would assert definitions absent from the source.

## Checked source and lowering

Checked source uses a distinct closed node variant:

```ts
type CheckedReceiveTaskNode = DeepReadonly<{
  kind: "receiveTask";
  id: string;
  channel: {
    kind: "directMessage";
    messageId: string;
  };
}>;
```

The checked node retains the BPMN Activity kind and its resolved direct Message identity. It does not retain raw moddle objects or invent an EventDefinition.

Lowering reuses the existing `awaitMessage` operation:

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

For Receive Task, both `origin.elementId` and `message.elementId` are the Receive Task ID, and `message.channel` is the checked node's `directMessage` arm. Existing operation validation continues to require the two element IDs to agree, distinct owned input/output control places, and exact nonempty arm fields.

No new Semantic Process operation is justified. Receive Task activation consumes one input token, creates one passive definition-addressed subscription, waits, consumes that subscription after exact delivery, and emits one output token—the same semantic lifecycle already represented by `awaitMessage` and `deliverMessage`. The source kind remains available in the checked graph and exact lowering proof, while the IL carries only the reusable execution distinction. A Receive-Task-specific operation would duplicate an evaluator and fail the [Semantic Process IL stop criterion](../SEMANTIC-PROCESS-IL-SPEC.md#growth-across-bpmn-event-diversity).

The lowering discriminator holds FlowNode and Sequence Flow IDs fixed within the Receive Task profile while changing the root Message ID and the Receive Task `messageRef`; the checked direct channel and lowered `awaitMessage.message.channel` must change together. The source-kind discriminator is a cross-profile pair over the two separately admitted fixtures: the existing Intermediate Catch Message scenario under `bpmn-2.0.2-intermediate-catch-message-draft` must lower its complete Interface → Operation → Message chain to `operationMessage`, while the new Receive Task fixture under its selected profile must lower the direct Message reference to `directMessage`. Each graph must reject under the other's profile before lowering. These cases distinguish source-kind-aware profile selection and lowering from a fixture constant, optional-field account, or impossible same-shape mutation.

The frozen checked-source experiment modules contain an exhaustive `receiveTask` arm that explicitly reports the variant unsupported in that lane. They have no provisional Receive Task semantics.

## IL reuse classification and erased distinctions

The [IL growth rule](../SEMANTIC-PROCESS-IL-SPEC.md#growth-across-bpmn-event-diversity) is discharged as follows:

| Distinction | Selected Receive Task value | Preservation or deliberate erasure |
|---|---|---|
| Trigger source | External BPMN Message | Preserved by `directMessage.messageId` |
| Direction | Inbound/catching | Preserved by passive `awaitMessage` plus external `deliverMessage`; no outbound intent exists |
| BPMN locus | Activity rather than Intermediate Catch Event | Preserved in checked source and exact lowering, deliberately erased from the IL and public wait projection |
| Interruption | None in ordinary Sequence Flow | No distinction is needed in the admitted graph; boundary attachment and interruption are rejected |
| Scope ownership | One root Process occurrence | Preserved by the existing scope-owned Message wait |
| Subscription cardinality | Exactly one activation and one live subscription | Preserved by profile cardinality, activation identity, and runtime wait state |
| Correlation | Direct complete occurrence plus definition-consistency channel | Preserved by `subscriptionId` and structural channel equality; key/name/global correlation is rejected |
| Payload/data | No ItemDefinition, Data Output, or Data Association | Absence is preserved by source rejection and no payload field; Receive Task data transfer is excluded |

The reused IL therefore cannot distinguish a stable Receive Task wait from a stable Intermediate Catch Message wait except through their element identities and channel arms; both project as `WaitKind.Message`. Inside this capsule that erasure is unobservable because Activity-only lifecycle features—boundary attachment, loop or Multi-Instance characteristics, compensation, data output, instantiation, and Activity-kind-specific public observation—are all rejected. Any consumer needing one of those distinctions reopens the IL decision before admission widens.

The [IL specification](../SEMANTIC-PROCESS-IL-SPEC.md) records the direct-Message Receive Task mapping, defines `awaitMessage` in terms of Message-wait element identity rather than Catch Event identity, and admits the closed `operationMessage | directMessage` channel with exact nonempty fields.

## Semantic Process admission

The selected program has one root definition scope and this exact operation-kind multiset:

- one `initiate`;
- one `awaitMessage`;
- one `reachNoneEnd`;
- one `completeScope`.

The profile capability table owns that multiset. The reusable Semantic Process graph validator owns one rooted scope, exact operation/place ownership, one root initiation and completion, one producer and consumer per control place, arity, reachability, co-reachability, and acyclicity. No whole-program execution-surface predicate is added.

Operation-payload validation accepts the two exact `MessageChannel` arms and rejects an unknown discriminant, missing required arm field, extraneous Interface field on `directMessage`, and empty identity. The Receive Task capability rejects every added or removed operation, every existing profile ID, and an unknown profile.

The targeted preservation gate establishes only the admitted fixture and its representative declaration permutation:

- start closure executes `initiate` and `awaitMessage`, then stops at exactly one Message subscription;
- a one-step closure limit reports internal-step-bound exhaustion, while the configured limit reaches the wait;
- no checked stable state has more than one enabled internal operation;
- the stable running prefix has exactly one explicit Message resumption surface;
- exact delivery requires exactly two internal steps—`reachNoneEnd` then `completeScope`—and produces the terminal completed state; a one-step post-delivery limit reports internal-step-bound exhaustion;
- a synthetic stranded-token state is not resumable and is not confused with the checked prefix.

This is not arbitrary serial admission, a universal liveness theorem, or proof that every valid Receive Task Process progresses.

## Stable semantic rules

### `RECV-ADDRESS-01` — preserve the direct Message definition

An admitted Receive Task resolves exactly one direct root Message reference into a `directMessage` channel. The checked node and lowered `awaitMessage` operation preserve that exact Message ID without synthesizing Interface or Operation identities.

This is a vendor-neutral source/profile rule.

### `RECV-WAIT-01` — activation creates one passive subscription

When control reaches the Receive Task, the reused `awaitMessage` transition consumes one input token and creates exactly one Process-owned subscription whose element ID is the Receive Task ID and whose channel is the admitted direct Message channel. Internal closure stops at that wait; activation does not complete the Receive Task or emit its outgoing token.

This is a vendor-neutral BPMN Activity rule specialized through the existing Message wait relation.

### `RECV-COMPLETE-01` — exact delivery completes the Activity

A `deliverMessage` stimulus commits under the existing `MSG-DELIVER-01` conditions: its complete subscription occurrence directly selects the active wait, its caller channel equals that wait's channel, and the wait still agrees with the admitted program definition. Commit removes the wait and emits the Receive Task output token exactly once. In the selected process, internal closure then reaches the None End Event and completes the Process.

This is the vendor-neutral receive/complete proposition plus the existing project direct-address profile restriction. It is not name-based or global correlation.

### `RECV-REFUSE-01` — wrong, early, and consumed deliveries preserve state

A delivery with the wrong Process instance, Receive Task element, activation, channel discriminant, or Message ID rejects with exact committed-state preservation. A well-formed delivery before an active subscription exists rejects. A fresh command targeting the consumed subscription rejects at the semantic core. This selected topology completes immediately after delivery, so no Temporal witness can expose that semantic stale result while the Workflow remains live; a post-terminal Temporal call instead returns the adapter-owned `processClosed` result under the existing lifecycle contract.

Identical-command replay and command-ID/content conflicts retain their existing Temporal classifications. No new outcome arm is added.

### `RECV-OBSERVE-01` — expose the existing Message resumption surface

The stable Receive Task wait projects one `activeWait` with semantic kind `message`, one `openMessageSubscriptions` entry, and one enabled `deliverMessage` interaction with the complete occurrence and `directMessage` channel. User Task, Timer, and effect waits are empty. After exact delivery the selected Process is completed and the Message surfaces are empty.

The eleven top-level canonical observation fields, wait-kind enum, occurrence identity, command result, and Process status are unchanged. Only the nested closed Message channel acquires its required discriminant.

## Declarative relation, evaluator, and laws

This capsule introduces no runtime-transition family. Lean's existing `MessageDeliveryStep`, executable `deliverMessage`, and `deliverMessage_sound` theorem remain the owning relation, evaluator, and soundness bridge. The internal `awaitMessage` activation case likewise remains owned by Semantic Process transition semantics. Implementation specializes those definitions to the `directMessage` arm; it does not add renamed duplicate relations.

The Lean lane provides specialized laws with exact hypotheses:

- admitted Receive Task lowering preserves the direct Message arm;
- start closure reaches exactly the direct Receive Task subscription;
- exact direct delivery reaches the terminal result;
- changing only the channel kind or Message ID preserves state through refusal;
- the existing `deliverMessage_sound` theorem applies to the successful direct arm.

The nearest checked non-law is that equal `messageId` does not make `operationMessage` and `directMessage` equal. A synthetic active direct subscription paired with an operation-addressed delivery carrying the same Message ID must reject. This catches an implementation that erases the discriminant and matches only `messageId`.

Concrete fixture theorems and `by decide` checks do not establish general Receive Task liveness, source-to-run preservation, or completeness of the delivery relation.

## Runtime-only and synthetic constructs

| Construct | Source or derivation | Creation, ownership, and removal invariant | Public projection |
|---|---|---|---|
| Direct Message channel | Resolved `ReceiveTask.messageRef` to the sole admitted root Message | Immutable checked graph/program value; never created from CIB or Temporal identifiers | Subscription and enabled interaction |
| Message subscription occurrence | Reused `awaitMessage` activation plus semantic Process instance | Created once for the admitted activation, owned by the root scope occurrence, removed only by exact committed delivery or enclosing-scope cancellation outside this profile | `activeWaits`, `openMessageSubscriptions`, and `enabledInteractions` |
| Message activation counter | Existing per-element semantic counter | Incremented on activation and monotonic; direct delivery does not reset it | Activation component of the subscription ID |
| Control token and root scope occurrence | Existing Process start and graph lowering | Root-owned; the delivery emits one output token, None End consumes it, and root completion removes live execution state while monotonic counters remain | Status and derived waits, not raw token/scope state |
| CIB execution/subscription IDs | CIB runtime public service, optional lane only | Engine-created and consumed by the CIB runner; never enter semantic identity | Raw evidence only; occurrence mapping is adapter-decided |
| Temporal Signal and message result record | Existing adapter transport and content-bound command identity | Signal accepted by Temporal, applied once by the core, first semantic result retained in the ledger/receipt | Command result and history evidence, never BPMN state |
| Wrong-kind and stranded states | Test-authored synthetic inputs | Never emitted by the admitted scenario; used only to distinguish erased channel kind and token-without-resumption accounts | Refusal/result witnesses only |

No new runtime-state collection, counter, queue, global subscription index, broker buffer, or host scheduler is added.

## Temporal hosting and refinement

The state relation is unchanged: the Workflow contains the admitted immutable Semantic Process program plus the serializable semantic-core runtime state, and every public Query/result is derived from committed core state. The new checked source kind is erased only after exact lowering into the already related `awaitMessage` operation; the `directMessage` discriminant remains in program and runtime state.

Durable ingress is the existing Message Signal carrying `commandId`, complete `subscriptionId`, and the closed channel. The current boundary classifies malformed Signal payloads as adapter request failures and a reused command ID with different content as `BpmnCommandIdentityConflict`; neither becomes a `ProcessCommandResult`. Exact semantic refusal is retained in the message result Query and terminal receipt where the existing lifecycle permits it.

The wait is passive. The Workflow schedules no Timer, Activity, Child Workflow, cancellation command, or outbound Message. Host admission classifies `awaitMessage` as passive external ingress, so the one-wait shape is admitted without widening the concurrent host-driven-wait predicate. The Workflow loop waits on its existing condition until a Signal arrives.

Ordering remains explicit. Workflow start applies the start stimulus before processing queued Message Signals. A Signal sent while the Worker is absent remains durably recorded and is processed after a replacement Worker replays start and reconstructs the direct subscription. A client call before Workflow creation is an adapter/transport `processUnknown` case, not a queued BPMN Message or semantic result.

Deduplication remains content-bound to the complete delivery stimulus, including the channel discriminant and arm fields. Repeating the same command ID and identical direct delivery returns the first result; reusing the ID with an operation-addressed or different direct channel conflicts before semantic application. Concurrent delivery semantics remain excluded.

The smallest refinement witness is:

1. start the admitted Receive Task Process and observe exactly one direct Message subscription;
2. stop the Worker;
3. deliver the exact Message Signal while no Worker is polling;
4. start a replacement Worker and recover the committed result through the existing message result/terminal receipt path;
5. assert completed canonical state, exactly one accepted direct delivery, no Timer, Activity, Child Workflow, or cancellation events, and exactly the expected Signal history;
6. replay the fetched history against the replacement Worker bundle.

A focused malformed/wrong-kind control runs while the subscription is live and must leave it unchanged. A semantic-core bypass that auto-completes or erases the direct channel must diverge at the pre-delivery Query or delivery result; a history mutation that removes or changes the Signal must fail the exact history assertion. The Workflow receives no expected trace or verifier output.

This witness rechecks information preservation across a breaking nested wire change. It does not count as a second semantic derivation of Message delivery and does not establish external-broker, cross-Workflow, broadcast, or global-correlation behavior.

Testing rule R8 applies to every approved Signal-bearing Message path: all non-Message paths retain zero Signal Events, while each Message path asserts its own exact, mutation-sensitive Signal sequence. Existing zero-Signal assertions on Update-driven paths remain unchanged.

## CIB Seven `2.2.0` agreement lane

The selected profile retains a CIB Seven `2.2.0` lane because its Receive Task public subscription is a compatibility claim not covered by the standards-only Intermediate Catch Message capsule. CIB remains evidence, not semantic authority. The project-authored fixture exposes exactly one Message event subscription with the expected Receive Task activity ID and Message name plus nonempty execution and Process-instance identities; `messageEventReceived(subscription.eventName, subscription.executionId)` removes the subscription and completes the Process. The profile's required nonempty root Message name exists solely so CIB's public delivery API has an observable event name.

`CIB-AGR-0009` owns the observed agreement that a Message-addressed Receive Task waits and completes after public Message delivery. `CIB-OP-0005` owns the retained adapter mapping from the public CIB subscription to the semantic occurrence and direct channel; it does not promote the generated CIB execution ID or the Message name to semantic identity.

The retained CIB producer may expose raw Process-instance count and the live Message subscription's activity ID, event name, and generated execution ID. Canonical `messageId`, Process-instance identity, and activation remain profile/adapter-derived or adapter-decided unless a public CIB API independently exposes them. Seeded Receive Task element-ID, canonical Message-ID, and subscription-removal mutations must reach classified canonical fields or make the verifier reject the evidence. Raw event-name fidelity is owned by the live CIB probe and gateway cross-check against the deployed model, not by a retained-evidence mutation. No hidden execution tree, transaction microstep, subscription-table row, or Message-ID/name equivalence is claimed.

The five on-demand questions are answered explicitly:

| Question | Disposition |
|---|---|
| Does BPMN leave a material choice that the profile adopts from CIB? | No. Direct occurrence addressing and exact channel consistency are project restrictions; CIB does not choose them. |
| Does source use a selected CIB extension? | No. The fixture is BPMN-only. |
| Does a compatibility claim need a pinned separating observation? | Yes if the optional lane is included: public Message-subscription creation, consumption, and Process completion are the claimed agreement. |
| Can a CIB host mechanism or configuration change the bounded public result? | Yes for the optional lane: CIB's Receive Task behavior creates the public Message subscription consumed by `messageEventReceived`; that fact must be observed rather than inferred from XML. |
| Does an A12 requirement require a new CIB contract? | No. Receive Task is selected from CIB breadth, not from an A12 form, Tasklist, human-resource, or façade requirement. |

Pre-activation CIB delivery is excluded. The phase-zero runner starts the Process and observes the subscription before sending. It does not infer buffering, start correlation, or unmatched-message behavior.

## Evidence matrix

| Rule | BPMN/profile | Lean | TypeScript | CIB option | Temporal | Negative witness and mutation |
|---|---|---|---|---|---|---|
| `RECV-ADDRESS-01` | Clause 10 Receive Task plus exact direct-Message source profile | Implemented checked-node lowering equality preserves `directMessage` | Implemented source projection and lowering preserve a changed Message reference | Retained raw subscription observes the event name; `CIB-OP-0005` owns adapter-decided canonical Message ID | Exact direct channel is present in the live Query, Signal, result ledger, terminal receipt, and replayed history | Same `messageId` under `operationMessage` rejects; source replacement and the seeded differential arm substitution change the public channel |
| `RECV-WAIT-01` | Clauses 10 and 13.3.3 | Implemented exact two-step start closure and direct subscription | Implemented independent start closure and subscription projection | Retained public subscription exists after Process start | Exact Query exposes one direct subscription before delivery and reconstructs it after Worker replacement | Auto-completion or a dropped subscription disagrees before delivery |
| `RECV-COMPLETE-01` | Clause 13.3.3 plus existing direct-address profile | Implemented `MessageDeliveryStep` specialization, soundness, and exact two-step completion | Implemented independent exact delivery and Process completion | Retained public delivery removes the subscription and completes the Process | Worker-absence delivery, committed result recovery, terminal receipt, exact Signal history, and replay are implemented | Exact result rejects a retained subscription or incomplete closure; removing a Signal fails the history assertion |
| `RECV-REFUSE-01` | Existing direct-address and one-consumption restriction | Implemented wrong-kind, wrong-Message, early, and consumed controls | Implemented independent refusal and state preservation | Pre-activation and unmatched delivery remain unclaimed | Malformed direct ingress emits no Signal; a live operation-addressed delivery with the same Message ID rejects and preserves the direct wait | Matcher comparing only `messageId` accepts the checked wrong-kind case; test-only channel erasure exposes an operation-addressed wait and rejects the exact direct delivery |
| `RECV-OBSERVE-01` | Existing eleven-field observation profile | Implemented exact direct subscription/interaction projection | Implemented independent canonical projection | Retained raw-to-canonical direct subscription and interaction projection is implemented and mutation-guarded | The live Query and completed receipt pin the direct waiting and empty terminal projections; Timer, Activity, Child Workflow, and cancellation history remain absent | Schema, semantic, differential, Query, and history guards reject changed, mixed, removed, or erased public channel facts |

Lean and TypeScript consume the same TypeScript-produced checked source and program artifact. Lean re-lowers the checked graph independently but does not parse BPMN XML. CIB deploys the exact source bytes but does not inspect the checked graph. The paired Message-reference/source-kind mutations and artifact-roundtrip equality are therefore mandatory controls for the shared XML-producer risk; agreement among execution targets alone cannot detect a shared source projection defect.

## Versioning contract

The pre-release repository has one current Message-address representation across every producer and consumer. It has no optional compatibility arm, format counter, fallback reader, or Workflow patch branch. TypeScript, Lean, the checked-process, Semantic Process and scenario schemas, Java, artifacts, retained evidence, differential comparison, and Temporal command identity all use the same closed discriminated union.

The eleven top-level canonical state fields, `WaitKind`, `StimulusKind`, `CommandOutcome`, `ProcessStatus`, `ProcessCommandResult`, runtime-state collections, and Temporal transport family remain unchanged. Only the nested Message channel and closed checked-node union differ from the earlier operation-only representation.

No immutable release/profile or retained production Event History baseline exists. The current pre-release replace-in-place policy applies: disposable gates start clean state, replay histories created during the same gate, and discard them afterward.

## Exclusions and re-open conditions

This capsule excludes:

- Receive Task without `messageRef`, including CIB's legacy `signal(executionId)` path;
- `operationRef`, realizing the default `##WebService` transport, every non-default `implementation`, `instantiate=true`, Process instantiation, Message Start behavior, and pre-activation buffering;
- Message payload, `itemRef`, I/O specifications, DataInput/DataOutput, Data Associations, variable writes, and form or simulated-human input;
- Message name matching as vendor-neutral identity, CorrelationKey, CorrelationSubscription, business-key/global correlation, broadcast, multiple subscriptions, and races;
- Collaboration, Participant, Message Flow, Conversation, Send Task, modeled Message throw, Intermediate Throw Message, End/Boundary/Event-SubProcess Message Events, and event-based Gateway;
- loops, Multi-Instance, repeated activation, Sub-Process combinations, cancellation, compensation, and concurrent commands;
- CIB addressless compatibility, A12 façade adoption, human resources, UI, forms, Tasklist, and identity/authorization;
- general Receive Task support, general Message support, BPMN Process Execution Conformance, and broad CIB compatibility.

Reopen this contract when a concrete consumer requires any excluded surface, a second direct-Message consumer needs more address information, a selected CIB revision disagrees, a payload requires an approved data/mapping proposition, multiple subscriptions require scheduler/correlation semantics, or durable production histories make the channel replacement a migration rather than a pre-release atomic change.

## Epistemic closure

The implemented claim is exact: one non-instantiating, payload-free Receive Task addressed by one direct root Message creates one passive subscription and completes after one exact occurrence-and-channel delivery through the reused Message transition and Temporal Signal lifecycle. Addressless or operation-addressed Receive Task, Web-service realization, payload, correlation, repetition, and other Message loci remain the nearest unsupported claims.

Lean, the TypeScript core, Temporal, and CIB share the project-authored XML fixture only at declared boundaries. Lean and Temporal consume the TypeScript-produced checked graph/program, so the Message-reference mutation, a genuinely reordered source fixture, cross-profile source rejection, checked node-kind/channel-arm constraints, and Lean re-lowering are the controls against shared source projection error. CIB independently deploys the exact XML but its public API exposes Message name and host execution identity rather than the project Message ID; `CIB-OP-0005` makes that adapter decision explicit instead of pretending the lane is independent at that field.

Every canonical observation is derived from admitted definition data, committed runtime state, and the explicit start/delivery inputs. Future scenario commands, expected results, generated CIB execution IDs, Temporal Workflow/Run IDs, and transport microsteps do not enter semantic state. The nearest counterexample is the same Message ID under `operationMessage`: Lean and TypeScript reject it against the direct wait, the live Temporal control preserves the wait, and the differential mutation replaces the complete arm and is detected at the first closed-union field difference.

The reusable quantified Lean delivery-soundness theorem permits evaluator-produced delivery transitions under exact hypotheses; the Receive Task module adds bounded fixture-specific closure and observation laws without claiming universal liveness. Normative interpretation, CIB compatibility, Lean semantics, independent TypeScript behavior, Temporal refinement, raw-to-canonical projection, and seeded mutation remain distinct lanes.
