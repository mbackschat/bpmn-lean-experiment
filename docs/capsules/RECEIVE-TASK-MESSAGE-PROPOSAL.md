# Message-addressed Receive Task proposal

## Status

**Draft for independent review and owner approval. No Receive Task source or execution support is implemented.**

## Exact question

Should the project admit one private executable root Process whose exact checked node-kind multiset is one None Start Event, one Message-addressed Receive Task, and one None End Event, connected by two ordinary Sequence Flows, and execute that Receive Task by reusing the existing payload-free Message subscription, delivery, refusal, observation, Temporal Signal, result-recovery, and replay mechanisms?

The recommended answer is yes, with the direct Message reference represented explicitly rather than forced into the Interface/Operation address required by the implemented [Intermediate Catch Message specification](INTERMEDIATE-CATCH-MESSAGE-SPEC.md). The first source witness matches the compact CIB Seven `2.2.0` precedent: None Start → Receive Task → None End, plus one root Message.

This is a BPMN Activity/source proposition over an already implemented semantic wait mechanism. It does not add a new semantic transition family, Message-routing service, human-task product, or Collaboration model.

## Normative basis

BPMN 2.0.2 Clause 10 and Table 10.10 define a Receive Task as a Task that waits for a Message from an external Participant and completes when that Message is received. Clause 13.3.3 states that activation waits for the associated Message and that Message arrival completes the Activity. The `ReceiveTask` CMOF and XSD permit optional `messageRef` and `operationRef` properties and default `instantiate` to false. The selected profile uses the direct `messageRef` form and excludes `operationRef` and instantiation.

Clause 8.4.2 applies the same correlation concepts to Message Catch Events and Receive Tasks. Closed OMG issue [BPMN2-201](https://issues.omg.org/issues/BPMN2-201) clarifies that Message Intermediate Catch Events use the same correlation behavior as Receive Tasks, while [BPMN2-222](https://issues.omg.org/issues/BPMN2-222) corrects the Receive Task `operationRef` wording. Those corrections support reusing the subscription mechanism without inventing an Operation where the source has none.

The exact profile does not decide the general meaning of the Receive Task `implementation` attribute. It requires that attribute to be omitted and makes no transport-implementation claim. General Web Service binding, implementation selection, and the open issue around this attribute remain outside the capsule.

## Selected source profile

The vendor-neutral source profile contains:

- exactly one BPMN `Definitions` document with one private `Process` whose `isExecutable` value is explicitly true;
- exactly one root `Message` with a nonempty ID and no `itemRef`; its name may be absent for vendor-neutral execution, while the optional CIB lane requires a nonempty name because CIB exposes that name in its public Message subscription;
- no root Interface and therefore no Interface Operation, and no root Error, Signal, Escalation, Collaboration, or other executable definition;
- one None Start Event, one Receive Task, one None End Event, and two unconditional Sequence Flows in the root Process;
- a Receive Task with exactly one incoming and one outgoing Sequence Flow, a resolved `messageRef` to the sole root Message, omitted `operationRef`, omitted `implementation`, omitted `instantiate` or its normalized false value, and no I/O specification, DataInput, DataOutput, Data Association, loop characteristics, ResourceRole, extension element, or boundary Event;
- no alternative start, branch, repetition, nested scope, or modeled sender.

Admission is node-kind plus profile multiset plus generic graph facts. It must not add a predicate for the literal Start → Receive Task → End topology. The checked-source capability owns the exact node-kind multiset and Receive Task property restrictions; reusable graph validation owns identifiers, references, arity, ownership, reachability, co-reachability, acyclicity, and Sequence Flow producer/consumer facts.

Declaration order is not semantics. Reordering the root Process and Message declarations, the three FlowNode declarations, the two Sequence Flow declarations, the Process `flowElement` references, and the Receive Task incoming/outgoing reference declarations must preserve the same checked graph, lowered program, stable Message wait, and completed result. One combined representative permutation is sufficient; this is not a theorem over every XML serialization.

## Closed Message-address representation

The current `MessageChannel` requires an Interface, Interface Operation, and Message triple and therefore cannot represent the selected direct `ReceiveTask.messageRef` honestly. The proposal replaces it atomically with this closed union while retaining the existing field name `channel`:

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

This shape is the smallest complete representation because two implemented source consumers require different definition paths with the same runtime subscription and delivery contract. Making Interface fields optional would create illegal mixed shapes and weak compiler errors. Inventing an Interface or Operation for Receive Task would assert definitions absent from the source. Renaming `channel` to `address` would add contract churn without changing the selected distinction, so it is not proposed.

## Checked source and lowering

Add a distinct closed checked node variant:

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

The lowering discriminator holds FlowNode and Sequence Flow IDs fixed while changing the root Message ID and the Receive Task `messageRef`; the checked direct channel and lowered `awaitMessage.message.channel` must change together. A second source mutation replaces the Receive Task with an Intermediate Catch Message Event while preserving the graph IDs; it must produce the existing `operationMessage` arm only when the complete Interface → Operation → Message chain is present. These cases distinguish source-kind-aware lowering from a fixture constant or optional-field account.

The frozen checked-source experiment modules must add an exhaustive `receiveTask` arm that explicitly reports the variant unsupported in that lane. They must not acquire provisional Receive Task semantics.

## Semantic Process admission

The selected program has one root definition scope and this exact operation-kind multiset:

- one `initiate`;
- one `awaitMessage`;
- one `reachNoneEnd`;
- one `completeScope`.

The profile capability table owns that multiset. The reusable Semantic Process graph validator owns one rooted scope, exact operation/place ownership, one root initiation and completion, one producer and consumer per control place, arity, reachability, co-reachability, and acyclicity. No whole-program execution-surface predicate is added.

Operation-payload validation must accept the two exact `MessageChannel` arms and reject an unknown discriminant, missing required arm field, extraneous Interface field on `directMessage`, and empty identity. The Receive Task capability must reject every added or removed operation, every existing profile ID, and an unknown profile.

The targeted preservation gate establishes only the admitted fixture and its representative declaration permutation:

- start closure executes `initiate` and `awaitMessage`, then stops at exactly one Message subscription;
- a one-step closure limit reports internal-step-bound exhaustion, while the configured limit reaches the wait;
- no checked stable state has more than one enabled internal operation;
- the stable running prefix has exactly one explicit Message resumption surface;
- exact delivery removes the subscription, executes `reachNoneEnd` and `completeScope`, and produces the terminal completed state within the configured closure limit;
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

A delivery with the wrong Process instance, Receive Task element, activation, channel discriminant, or Message ID rejects with exact committed-state preservation. A well-formed delivery before an active subscription exists rejects. A fresh command targeting the consumed subscription rejects at the semantic core, though a post-terminal Temporal call remains the adapter-owned `processClosed` result under the existing lifecycle contract.

Identical-command replay and command-ID/content conflicts retain their existing Temporal classifications. No new outcome arm is added.

### `RECV-OBSERVE-01` — expose the existing Message resumption surface

The stable Receive Task wait projects one `activeWait` with semantic kind `message`, one `openMessageSubscriptions` entry, and one enabled `deliverMessage` interaction with the complete occurrence and `directMessage` channel. User Task, Timer, and effect waits are empty. After exact delivery the selected Process is completed and the Message surfaces are empty.

The eleven top-level canonical observation fields, wait-kind enum, occurrence identity, command result, and Process status are unchanged. Only the nested closed Message channel acquires its required discriminant.

## Declarative relation, evaluator, and laws

This capsule introduces no runtime-transition family. Lean's existing `MessageDeliveryStep`, executable `deliverMessage`, and `deliverMessage_sound` theorem remain the owning relation, evaluator, and soundness bridge. The internal `awaitMessage` activation case likewise remains owned by Semantic Process transition semantics. Implementation specializes those definitions to the `directMessage` arm; it does not add renamed duplicate relations.

The Lean lane must add useful specialized laws with exact hypotheses:

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

## Temporal hosting and refinement preflight

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

## Optional CIB Seven `2.2.0` agreement lane

The recommendation is to include the CIB lane because CIB Seven `2.2.0` executable breadth is the owner's selected near-term ordering baseline and its Receive Task public subscription is a new compatibility claim not covered by the standards-only Intermediate Catch Message capsule. CIB remains evidence, not semantic authority.

Phase zero must run before relationship registration, profile artifact authoring, or semantic implementation. Deploy one project-authored MIT fixture matching the selected source, start it through CIB public services, observe exactly one Message event subscription tied to the Receive Task, deliver with `messageEventReceived(subscription.eventName, subscription.executionId)`, observe the subscription removed, and observe the Process completed. The optional lane requires a nonempty root Message name solely so CIB's public delivery API has an observable event name.

If phase zero agrees, add the next available normative-agreement relationship for “Message-addressed Receive Task waits and completes after public Message delivery” and, if retained canonical projection maps CIB's execution/subscription identity to the semantic occurrence, the next available permitted-operational-detail relationship for that mapping. Assign identifiers only when the register entries and verifier evidence land; do not put placeholders in a profile. If CIB disagrees, stop, classify the difference, and do not change vendor-neutral meaning.

The retained CIB producer may expose raw Process-instance count and the live Message subscription's activity ID, event name, and generated execution ID. Canonical `messageId`, Process-instance identity, and activation remain profile/adapter-derived or adapter-decided unless a public CIB API independently exposes them. A seeded raw-event-name or subscription-removal mutation must reach a classified canonical field or the verifier must reject the evidence directly. No hidden execution tree, transaction microstep, subscription-table row, or Message-ID/name equivalence is claimed.

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
| `RECV-ADDRESS-01` | Clause 10 Receive Task plus exact direct-Message source profile | Independent checked-node lowering equality preserves `directMessage` | Source projection and lowering preserve changed Message reference | Raw event name observed; canonical Message ID honestly classified | Signal payload and ledger retain the direct arm | Same `messageId` under `operationMessage` rejects; source replacement must change the lowered arm |
| `RECV-WAIT-01` | Clauses 10 and 13.3.3 | Existing activation semantics specialized to exact direct subscription | Independent start closure and subscription projection | Public subscription exists after Process start | Query before delivery exposes the direct wait | Auto-completion or dropped-subscription mutations diverge before delivery |
| `RECV-COMPLETE-01` | Clause 13.3.3 plus existing direct-address profile | Existing `MessageDeliveryStep`, evaluator, soundness, and exact fixture result | Independent exact delivery and Process completion | Public delivery removes subscription and completes Process | Worker-absent Signal, result recovery, terminal receipt, replay | Removed/changed Signal history or retained subscription must fail |
| `RECV-REFUSE-01` | Existing direct-address and one-consumption restriction | Wrong kind, wrong Message, early, and consumed controls preserve state at their valid boundary | Independent refusal and state preservation | Not claimed beyond phase-zero ordering | Malformed/conflict classifications and wrong-kind live control | Matcher that compares only `messageId` accepts the separating case |
| `RECV-OBSERVE-01` | Existing eleven-field observation profile | Exact direct subscription/interaction projection | Independent canonical projection | Nested fields receive explicit fidelity labels if lane lands | Query and terminal receipt derive from committed core state | Comparator/projector mutation changes or erases a public field |

Lean and TypeScript consume the same TypeScript-produced checked source and program artifact. Lean re-lowers the checked graph independently but does not parse BPMN XML. CIB deploys the exact source bytes but does not inspect the checked graph. The paired Message-reference/source-kind mutations and artifact-roundtrip equality are therefore mandatory controls for the shared XML-producer risk; agreement among execution targets alone cannot detect a shared source projection defect.

## Atomic versioning consequences

Implementation is one pre-release replacement of the current Message-address representation. It must update all producers and consumers in one change, with no optional compatibility arm, format counter, fallback reader, or Workflow patch branch.

The atomic set includes:

- `MessageChannel` in TypeScript and Lean, including exact decoders/encoders, equality, definition matching, runtime waits, stimuli, enabled interactions, and observation projection;
- the checked-process, Semantic Process, and scenario JSON Schemas, all answer-free scenarios and expected results containing Message channels, profile/source hashes, and artifact-roundtrip cases;
- the existing Intermediate Catch Message checked node, source projector, profile, lowering, Lean/TypeScript fixtures, pipeline mutation, and specification, with every existing channel rewritten explicitly as `operationMessage`;
- the new Receive Task checked node, source admission, root-definition selection, exact lowering, profile capability, focused rejection/permutation tests, and frozen-experiment exhaustive unsupported arms;
- Lean `SemanticProcessContract`, runtime/JSON support, lowering, Message relation/evaluator consumers, conformance fixtures, and umbrella build targets;
- TypeScript semantic contracts, operation/stimulus admission, message evaluator, runtime projection, focused tests, and compile-time immutability/exhaustiveness checks;
- Temporal command-identity encoding, Signal validation, message result ledger and receipt, Workflow/client tests, host-capability classification, exact-history checks, replay, and semantic/history bypass controls;
- the differential catalog, scenario/profile/result artifacts, target arithmetic, meaningful direct-kind mutation, and declared-target pipeline registration;
- the Java CIB protocol/projector, retained raw evidence, fidelity table and schema-depth guard if the owner includes the optional CIB lane; existing CIB evidence with empty Message collections changes only if the current schema or producer output requires replacement;
- [SEMANTIC-PROCESS-IL-SPEC.md](../SEMANTIC-PROCESS-IL-SPEC.md), [PROFILE-PARAMETERIZED-ADMISSION-SPEC.md](../PROFILE-PARAMETERIZED-ADMISSION-SPEC.md), [TEMPORAL-PROCESS-LIFECYCLE-SPEC.md](../TEMPORAL-PROCESS-LIFECYCLE-SPEC.md), [TESTING-SPEC.md](../TESTING-SPEC.md), the BPMN and CIB ledgers/registers, documentation registries, [IMPLEMENTATION-MAP.md](../IMPLEMENTATION-MAP.md), [PLAN.md](../PLAN.md), and this proposal's graduation to `-SPEC`;
- the artifact catalog, inbound document links, source-hygiene/doc-fragment guards, capsule cost ledger, and exact implementation counts.

The eleven top-level canonical state fields, `WaitKind`, `StimulusKind`, `CommandOutcome`, `ProcessStatus`, `ProcessCommandResult`, runtime-state collections, and Temporal transport family remain unchanged. Only the nested Message channel and closed checked-node union change. If implementation discovers that one of those claimed-unchanged surfaces must widen, stop and return the new product decision to the owner.

No immutable release/profile or retained production Event History baseline exists. The current pre-release replace-in-place policy applies: disposable gates start clean state, replay histories created during the same gate, and discard them afterward.

No dependency addition, removal, upgrade, vendoring, or A12 source use is required.

## Exclusions and re-open conditions

This capsule excludes:

- Receive Task without `messageRef`, including CIB's legacy `signal(executionId)` path;
- `operationRef`, non-default `implementation`, `instantiate=true`, Process instantiation, Message Start behavior, and pre-activation buffering;
- Message payload, `itemRef`, I/O specifications, DataInput/DataOutput, Data Associations, variable writes, and form or simulated-human input;
- Message name matching as vendor-neutral identity, CorrelationKey, CorrelationSubscription, business-key/global correlation, broadcast, multiple subscriptions, and races;
- Collaboration, Participant, Message Flow, Conversation, Send Task, modeled Message throw, Intermediate Throw Message, End/Boundary/Event-SubProcess Message Events, and event-based Gateway;
- loops, Multi-Instance, repeated activation, Sub-Process combinations, cancellation, compensation, and concurrent commands;
- CIB addressless compatibility, A12 façade adoption, human resources, UI, forms, Tasklist, and identity/authorization;
- general Receive Task support, general Message support, BPMN Process Execution Conformance, and broad CIB compatibility.

Reopen this contract when a concrete consumer requires any excluded surface, a second direct-Message consumer needs more address information, CIB phase zero disagrees, a payload requires an approved data/mapping proposition, multiple subscriptions require scheduler/correlation semantics, or durable production histories make the channel replacement a migration rather than a pre-release atomic change.

## Planned epistemic closure

Before graduation, record:

1. the exact established claim—one non-instantiating direct-Message Receive Task waits and completes through reused Message semantics—and the nearest unsupported claim, addressless or operation-addressed Receive Task;
2. the shared XML producer risk and the paired source-kind/reference discriminator;
3. that every canonical observation depends only on admitted definition, runtime state, and explicit stimulus, never future commands, host IDs, or expected output;
4. the same-Message-ID/wrong-channel-kind non-law as the nearest realistic counterexample;
5. that pre-wait and post-delivery discriminators are public, while CIB execution IDs and transport microsteps are not semantic facts;
6. that Lean contributes the reused quantified delivery soundness theorem plus exact specialized laws, without inflating concrete fixtures into general liveness;
7. distinct BPMN, CIB, Lean, TypeScript, Temporal, projection, and mutation claims;
8. the pre-release history policy and one meaningful mutation for every new evidence projection;
9. feedback timing, server/port cleanup, duplicated builds, artifact coupling, documentation placement, and removable process weight;
10. a commit-bounded code/document delta against the implemented Intermediate Catch Message capsule as the nearest same-layer comparison, with one repeated process weight removed if this reuse capsule is not materially cheaper;
11. whether the result changes the next CIB-ordered capsule ranking;
12. an independent review of the normative account, address replacement, CIB fidelity boundary, and Temporal witness before owner approval.

## Owner decision requested

Approve or reject these product choices together:

1. admit the exact non-instantiating, payload-free, direct-Message Receive Task slice and represent Message channels as the closed `operationMessage | directMessage` union above;
2. reuse `awaitMessage`, `deliverMessage`, the existing canonical Message resumption surface, and Temporal Signal/result-ledger mechanism rather than add a Receive-Task-specific runtime transition;
3. include the recommended CIB Seven `2.2.0` phase-zero and retained normative-agreement/operational-mapping lane if the probe agrees;
4. apply the atomic pre-release replacement and exclusions exactly as stated.

The known eventual consumer is the BPMN engine's CIB Seven breadth roadmap. This capsule does not claim that A12 currently contains or requires Receive Task, and it does not add a downstream product adapter.

Implementation may begin only after independent review corrections and explicit owner approval are recorded. The implementation baseline for cost measurement is the final approved proposal commit, not this draft's first commit.
