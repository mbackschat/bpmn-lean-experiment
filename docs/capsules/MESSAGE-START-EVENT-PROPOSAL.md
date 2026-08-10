# Message Start Event proposal

## Status

**Independent cold proposal review returned required edits; the corrected proposal is awaiting the same reviewer's audit. Not owner-approved and not implemented.** This proposal selects one top-level, payload-free Message Start Event that instantiates one private executable Process through an exact resolved Message, Interface, and Operation channel. It does not select Message broker routing, buffering, correlation keys, payload mapping, multiple Start Events, Message Flow execution, Event Sub-Process start, CIB Seven Message Start compatibility, or the BPM platform's public message-ingress API.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `8bd3fe9` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |

## Question

May one external Message trigger instantiate one new top-level Process through one exact Message Start Event, bind the complete BPMN Interface Operation and input Message identity before instance creation, and then enter the existing sequential User Task lifecycle without inventing a running Message subscription or Temporal Signal?

The recommendation is **yes, under the exact source, semantic, hosting, and evidence boundary below**. The selected mechanism is resolved Message-triggered Process instantiation. It is distinct from delivering a Message to an already running subscription and from an untriggered manual Process start.

## Selection basis

[PLAN.md](../PLAN.md#ordered-work) places Message Start Event next in M2. The [minimal engine research](../research/MINIMAL-USEFUL-BPMN-ENGINE-RESEARCH.md#41-message-start-event) identifies it as an essential Process start mechanism and separately records the broader product questions of routing, tenant isolation, correlation, buffering, time-to-live, definition-version selection, and idempotency. This capsule answers only the BPMN semantic question and the smallest durable host refinement.

The existing [Intermediate Catch Message specification](INTERMEDIATE-CATCH-MESSAGE-SPEC.md) already owns an exact operation-addressed Message channel and a running-instance subscription lifecycle. Reusing that channel representation is correct. Reusing its `awaitMessage` operation or `deliverMessage` stimulus would be wrong because no Process instance or subscription exists before a top-level Start Event is triggered.

The existing manual `startProcess` stimulus and `initiate` operation remain byte-for-byte unchanged. Adding an optional trigger field to either would turn two different admission rules into a mode bag and would invalidate the frozen pre-M2 compiler preservation baseline. This proposal instead adds separate closed variants and shares only their genuinely identical root-occurrence and outgoing-token mechanics.

## Normative basis

BPMN 2.0.2 is the semantic authority for this standards-only capsule.

- Clause 10.5.2 states that each Start Event is independent, that triggering a Start Event generates a new Process instance, and that the trigger generates one token for each outgoing Sequence Flow.
- Clause 10.5.2 and Table 10.84 define a top-level Message Start Event as one Start Event with one MessageEventDefinition whose Message arrival triggers Process instantiation.
- Clause 10.5.2 and Table 10.87 state that a Start Event has no incoming Sequence Flow, is the source of Sequence Flow, and that `isInterrupting` applies only to Event Sub-Process Start Events.
- Clauses 8.4.11 and 8.5 plus Clause 10.5.5 and Table 10.99 define Message, Interface, Operation, `messageRef`, `operationRef`, and the executable-Process requirement that both references be supplied.
- Clause 13.2 retains the Process token and completion account after the Start Event has produced its outgoing token.
- Clause 13.5.1 gives the Process-level Start Event execution context. The selected top-level account is not the Event Sub-Process account in Table 10.86.

The official CMOF and XSD `StartEvent`, `CatchEvent`, `MessageEventDefinition`, `Message`, `Interface`, `Operation`, `SequenceFlow`, `isInterrupting`, `messageRef`, `operationRef`, and `inMessageRef` facts constrain source structure. The XSD permits optional references at the generic serialization layer, while Table 10.99 requires them for an executable Process. Source admission follows the executable semantic requirement.

The standard allows multiple Start Events, multiple outgoing Sequence Flows, definitional Collaboration and Message Flows, Event Sub-Process starts, Message payloads, and broader routing. This profile defers those conforming cases. Its checked node, IL operation, and stimulus retain exact Start Event and channel identity, so they do not erase the distinctions a later routing capsule needs. The current runtime nevertheless remains single-start-only: broadening admission to multiple Message Start operations first requires a pending selected-start or operation identity in runtime state plus explicit closure and choice proofs. The existing `initiationPending` boolean is insufficient for that broader case.

The proposal adds `BPMN-MESSAGE-START-01` to the [BPMN requirement ledger](../BPMN-REQUIREMENT-LEDGER.md). It remains `unsupported` until implementation and closure evidence graduate this proposal.

## Selected account and rejected alternatives

The representative model is:

```text
Message Start Event -> User Task -> None End Event
```

One resolved external Message trigger creates one semantic Process instance, commits the trigger command, and reaches exactly one fresh User Task occurrence. Completing that occurrence reaches the existing None End completion.

The competing accounts are:

1. **Treat Message Start as `deliverMessage` to a synthetic subscription.** Rejected. A top-level Start Event has no running Process instance or active subscription before the trigger.
2. **Treat every Message Start as manual `startProcess`.** Rejected. That erases the Message, Interface Operation, and Start Event identity, so the wrong Message or operation could instantiate the Process.
3. **Add an optional trigger to `startProcess` or `initiate`.** Rejected. It changes every existing serialized value, creates conditional validation inside one shape, and breaks the frozen preservation obligation without semantic need.
4. **Use Temporal Signal-With-Start or Update-With-Start as the semantic definition.** Rejected. Those are host convenience protocols, not BPMN Start Event meaning, and they would make a Temporal transport choice part of the semantic contract.
5. **Resolve the external Message to an exact definition and Start Event before semantic execution, then use a distinct closed Message-start stimulus.** Selected.

The primary negative keeps `messageId` and `interfaceId` fixed but changes `interfaceOperationId`. It must reject with exact state preservation and zero Temporal Workflow starts. This kills message-name-only and Message-ID-only admission.

## Exact source profile

One immutable standards-only profile is proposed as `bpmn-2.0.2-message-start-event-draft`. It admits one BPMN document with:

- one private executable top-level Process;
- one Message Start Event, one User Task, one None End Event, and two distinct Sequence Flows in one finite acyclic line;
- no incoming Sequence Flow and exactly one conditionless outgoing Sequence Flow on the Start Event;
- exactly one inline MessageEventDefinition on that Start Event;
- one Message root with no `itemRef`;
- one Interface root containing exactly one Operation;
- a MessageEventDefinition whose `messageRef` resolves to that Message and whose `operationRef` resolves to that Operation;
- an Operation whose `inMessageRef` resolves to the same Message;
- no `outMessageRef`, error reference, implementation reference, referenced EventDefinition, `parallelMultiple`, data output, output set, Data Association, payload, parser warning, extension element, additional root element, or foreign executable content;
- no explicit `isInterrupting`. The attribute is irrelevant for a top-level Start Event; the profile rejects it rather than assigning it a top-level meaning;
- arbitrary well-formed source identifiers. No fixture ID or product name participates in admission.

The profile capability fixes the exact node and operation multiset. Reusable graph admission retains distinct identities, reference closure, producer and consumer ownership, legal arity, reachability, co-reachability, whole-graph acyclicity, finite closure, and one root-scope completion.

Ordinary-producer negatives must reject each independent source defect before checked projection: a required reference is missing or unresolved; the MessageEventDefinition and Operation resolve different input Messages; the EventDefinition is referenced, repeated, or combined through `parallelMultiple`; the Start Event has an incoming flow, zero or multiple outgoing flows, or a conditional outgoing flow; the Start Event is nested in an Event Sub-Process or another non-top-level scope; `isInterrupting` is explicit; payload structure is present; or the document has an extra root, a second definition, or multiple or mixed Start Events. These source-chain and topology negatives are separate from a runtime trigger carrying the wrong channel.

No fifth compilation-dispatch path is added. The new profile uses the existing generic structural compiler path and adds one exact Start Event projection beside the existing None Start projection. Product-specific mapped readers, overlay readers, and payload-free Service Task dispatch remain unchanged.

Message Flow and Participant are not required to identify the sender in this slice. Table 10.84 says the sender can be identified through a Message Flow; it does not make that optional notation the only Message Start instantiation mechanism. A later Collaboration capsule may admit and retain that structure without changing the exact channel or start semantics selected here.

## Checked graph and lowering

The checked graph gains a closed node alternative:

```ts
type CheckedMessageStartEvent = DeepReadonly<{
  kind: CheckedNodeKind.MessageStartEvent;
  id: string;
  channel: Extract<
    MessageChannel,
    { kind: typeof MessageChannelKind.OperationMessage }
  >;
}>;
```

Source admission validates the complete MessageEventDefinition to Interface Operation to input Message chain before constructing the node. The private moddle graph remains inside `@bpmn-lean/bpmn-source`.

The node lowers to a separate operation:

```ts
type InitiateMessageOperation = OperationBase & DeepReadonly<{
  kind: SemanticOperationKind.InitiateMessage;
  channel: Extract<
    MessageChannel,
    { kind: typeof MessageChannelKind.OperationMessage }
  >;
  outputs: [string, ...string[]];
}>;
```

`origin.elementId` is the exact Start Event identity. The reusable operation has a nonempty collection of distinct output control places, no input, no wait, no subscription, no payload, no variable patch, and no transport field. Lowering derives the canonical-ID-sorted outputs solely from validated checked Sequence Flow endpoints and copies the exact checked channel. The selected profile requires exactly one output. Later standards coverage may admit several outputs and produce one token on each without changing this representation or reinterpreting the one-output programs accepted here. A source mutation that keeps the Message ID fixed while replacing the Interface Operation must change both the checked channel and lowered operation.

The existing `initiate` operation remains the untriggered None Start mechanism. The shared internal helper may create the root-owned output token for either operation only after its corresponding external start admission has set `initiationPending`; the two operation discriminants and their admission rules remain exhaustive and separate.

This representation preserves the identities needed by the broader BPMN account, but the current execution state does not yet select among several start operations. Multiple Start Events can later use multiple identity-bearing operations only after runtime state gains a pending selected-start or operation identity and the new capsule proves unambiguous closure and routing choice. A router may then resolve one external publication to one or more exact `(definition, startEventId, channel)` targets and create a distinct semantic instance for each target. This capsule admits exactly one start operation and target, so the existing boolean initiation flag is sound here and no current wire redesign is required.

## Trigger stimulus and runtime semantics

The external semantic input is a resolved trigger, not the product's eventual broker publication API:

```ts
type TriggerMessageStartStimulus = DeepReadonly<{
  kind: StimulusKind.TriggerMessageStart;
  commandId: string;
  processId: string;
  instanceId: string;
  startEventId: string;
  channel: Extract<
    MessageChannel,
    { kind: typeof MessageChannelKind.OperationMessage }
  >;
}>;
```

The exact Start Event identity is material. It lets later routing distinguish two independent Start Events that use the same Message channel without changing this stimulus, but multiple-start execution still requires the pending runtime-selection mechanism above. The product-facing publication, tenant, definition-version selection, buffering, time-to-live, and fanout contract remain outside the semantic core.

The stimulus commits if and only if:

- the runtime is `notStarted`;
- `processId` equals the program Process ID;
- exactly one root definition scope exists for that Process;
- exactly one `initiateMessage` operation has `origin.elementId = startEventId`;
- the supplied complete channel equals that operation's channel;
- the selected profile and program admit Message Start execution.

Commit creates one root scope occurrence owned by `instanceId`, sets activation `1`, creates an empty Process-variable scope, changes the Process to `running`, and sets the existing private `initiationPending` flag. Exact-one start-operation admission makes that boolean sufficient for this profile. Internal closure has the exact two-step trace `initiateMessage` followed by `awaitUserTask`: the committed state enables exactly one `initiateMessage`; its successor enables exactly one `awaitUserTask`; and the next state is internally stable, `running`, exposes exactly one User Task wait, and satisfies the existing stable-state resumability predicate. The longest reachable closure is therefore `2`, within the production limit `8`; the same representative command with test closure limit `1` must report the over-limit discriminator.

The message trigger carries no `initialVariables` and no payload. Message item definitions, catch data output, data mapping, and any non-BPMN platform start variables require a separate proposition. Empty variables are a semantic result of this profile, not an alias for an omitted payload field.

No active Message subscription is created before or after commit. Canonical observation publishes the same existing Process status, root-owned control consequences, and downstream User Task occurrence as the corresponding None Start program after its own initiation. It publishes no broker address, Message receipt, Start Event subscription, Temporal Workflow ID, or host acknowledgement.

## Stable semantic rules

| Rule ID | Proposition |
|---|---|
| `MSTART-SOURCE-01` | The selected executable source contains one top-level Message Start Event whose sole inline MessageEventDefinition resolves one exact Interface Operation and its matching input Message, with `0 -> 1` conditionless Sequence Flow arity and no payload or Event Sub-Process property. |
| `MSTART-TRIGGER-01` | From `notStarted`, a resolved trigger commits only when Process ID, Start Event ID, and the complete operation-addressed channel equal the admitted `initiateMessage` operation. |
| `MSTART-FLOW-01` | After a committed trigger, `initiateMessage` clears initiation pending and produces exactly one token on each distinct output, all owned by the fresh root scope occurrence, without creating a Message subscription or changing variables. The selected profile admits exactly one output. |
| `MSTART-CLOSURE-01` | The representative committed trigger has the exact internal trace `initiateMessage -> awaitUserTask`: each unstable prefix has exactly one enabled internal operation, the longest closure is `2 <= 8`, limit `1` reports over-limit, and the final stable `running` state has exactly one User Task wait and is resumable. |
| `MSTART-REFUSE-01` | Wrong start kind, Process ID, Start Event ID, any channel component, profile, root binding, or a non-`notStarted` state rejects and returns the exact input runtime state by identity. |
| `MSTART-INSTANCE-01` | Two separately admitted resolved triggers with distinct semantic instance IDs create distinct root scope occurrences and cannot alias one semantic Process instance. Reuse of one semantic instance address creates no second Workflow while its prior execution is running or retained by Temporal. |
| `MSTART-OBSERVE-01` | After initiation and internal closure, the representative Message Start program exposes exactly the same downstream User Task and Process-variable observation as its corresponding None Start program, apart from the deliberately distinct definition and semantic instance identities. |

`MSTART-TRIGGER-01` and `MSTART-FLOW-01` are vendor-neutral BPMN rules. Exact operation-addressed resolution is a permitted bounded operational detail that preserves all source distinctions required by Table 10.99. Workflow addressing, duplicate-start behavior, and service acknowledgements are host policy, not BPMN facts.

## Lean lane, laws, non-laws, and witnesses

The Lean lane is **proved**. New cohesive owners hold Message Start admission and transition facts; the existing large execution owner receives only exhaustive dispatch/import changes.

The required proved facts are:

- exact checked-node and program admission for one Message Start Event and one complete operation-addressed channel;
- lowering preserves Start Event ID, all three channel components, and the complete canonical distinct outgoing control-place list;
- the Message-start evaluator is sound with respect to its declarative relation;
- accepted trigger admission creates one root occurrence and preserves empty variables;
- `initiateMessage` produces one root-owned token per output and no subscription, while the selected profile proves exact-one output;
- the exact closure enables one `initiateMessage`, then one `awaitUserTask`, reaches one stable resumable User Task wait in two steps within limit `8`, and reports over-limit at limit `1`;
- wrong Process, Start Event, Message, Interface, or Interface Operation identity rejects with exact state preservation;
- a manual start cannot start a Message-start program and a Message trigger cannot start a None-start program;
- after initiation, equivalent one-output Message and None start programs have the same control-state shape under an explicit identity-renaming relation;
- distinct supplied instance IDs produce distinct root occurrence ownership.

The nearest checked non-law is channel equality by Message ID alone. Two channels with the same Message and Interface IDs but different Interface Operation IDs are not equal and do not admit the same trigger.

The full BPMN proposition that one external Message may match several definitions or several independent Start Events is deliberately open because it belongs to definition routing and fanout, not one-instance execution. The chosen exact Start Event selector preserves the routing distinction, while multiple-start execution additionally requires a pending selected-start or operation identity and its closure and choice proofs.

## Temporal hosting and refinement preflight

The finite conformance host uses the existing direct Temporal Workflow start path:

1. The caller resolves exact definition bytes, profile, Process ID, Start Event ID, complete channel, and a fresh semantic instance ID before host start.
2. Semantic execution admission checks the exact `triggerMessageStart` and program pair.
3. The separate Temporal host-capability predicate checks the program's reachable waits. The representative program reaches only one ordinary User Task Update wait.
4. Only an admitted pair calls `client.start`, passing the trigger as Workflow input and deriving the Workflow ID from the semantic instance ID with `REJECT_DUPLICATE`.
5. Temporal Service acceptance makes the start durable even when no Worker is polling. A later compatible Worker replays the start input, runs semantic closure, and exposes the User Task.

Durable ingress is the Workflow start input. The adapter does not use Signal, Signal-With-Start, Update, Update-With-Start, Schedule, Activity, Child Workflow, Timer, or cancellation for Message Start. `client.start` success means the Temporal Service created the Workflow; it does not claim that a Worker has completed semantic initiation.

Ordering is fixed: exact source/profile and semantic/host admission precede the one Workflow start. The start input precedes all later command handlers. There is no race with a pre-existing Process because this profile creates a new semantic instance.

Deduplication is bounded to the semantic instance address and Temporal retention. Reusing that address cannot create a second Workflow under `REJECT_DUPLICATE` while the prior execution is running or retained. After retention removes the execution, the address is indistinguishable from one never used; preventing resurrection then requires a later durable tombstone or product router. Exact external publication retry, tenant-aware idempotency keys, definition-version routing, buffering, and fanout belong to that later BPM platform ingress increment and must not be inferred from this host witness.

If Temporal accepts `client.start` but the caller loses the response, the current client cannot recover the exact `Started` result. A retry while the execution is retained may return a duplicate-start or deadline infrastructure failure even though creation succeeded. This is an infrastructure ambiguity, not a semantic rejection or an exact start acknowledgement. The later product ingress contract must own result recovery or an idempotent receipt before it claims retry-transparent publication.

The smallest live witness starts while the Worker is absent, then starts the Worker, observes the exact first User Task, completes it, reaches the terminal receipt, inspects history, and replays it. Event History must contain Workflow start and the later Update path but no Signal event. A test-owned host mutation that routes the trigger through Signal-With-Start must fail the no-Signal history discriminator. A separate fake-client mutation that ignores `interfaceOperationId` must call `client.start` for the primary wrong-channel negative and therefore fail the zero-start assertion.

## Rule-to-evidence matrix

| Rule | Source/profile | Lean | TypeScript core | Temporal | Negative or mutation |
|---|---|---|---|---|---|
| `MSTART-SOURCE-01` | Exact BPMN fixture, strict reference closure, profile capability, XML validation | Exact decoder/admission and lowering facts | Independent compiler projection | Pre-start compiled artifact | Missing or unresolved reference; extra root or second definition; payload; explicit `isInterrupting`; mismatched input Message; referenced, repeated, or parallel Event Definition; incoming, zero, multiple, or conditional outgoing flow; non-top-level placement; multiple or mixed starts |
| `MSTART-TRIGGER-01` | Checked channel and origin bind the IL operation | Declarative trigger relation and evaluator soundness | Independent start admission | Zero host starts before exact admission | Same Message and Interface, wrong Interface Operation |
| `MSTART-FLOW-01` | Complete validated outgoing Sequence Flow set; selected profile cardinality one | Root-owner per-output token theorem and selected exact-one corollary | Independent internal transition | First stable User Task after Worker absence | Mutation drops, duplicates, or redirects an output, creates a subscription, or uses manual initiate |
| `MSTART-CLOSURE-01` | Exact linear checked graph and selected cardinalities | Exact two-step closure, enabled-count, limit, and resumability facts | Exact trace and enabled-count assertions; production limit `8`; limit-`1` negative | First stable User Task after Worker absence | Extra enabled operation, stranded stable state, or closure longer than two |
| `MSTART-REFUSE-01` | Profile and exact references | Exact-state refusal theorems | Runtime identity assertions | Wrong trigger makes zero Workflow starts | Wrong kind, Process, Start Event, each channel component, repeated state |
| `MSTART-INSTANCE-01` | One exact target per admitted fixture | Distinct root-owner theorem | Two fresh-state executions | Distinct Workflow IDs; running-or-retained duplicate address creates no second Workflow | Instance-ID reuse and target alias mutation |
| `MSTART-OBSERVE-01` | Message-start and None-start twin fixtures | Explicit post-initiation relation | Canonical projection equality | Worker-absence start, completion, history, replay | Signal-With-Start history mutation |

No CIB result is used as semantic evidence. The registered scenario is answer-free, declares `cib: null`, and participates in the Lean, TypeScript, and Temporal targets. One isolated differential mutation changes the Interface Operation while retaining the Message ID so the comparator must report the declared channel disagreement.

The runnable product example uses a second closed configuration variant for Message start. Existing manual-start example JSON remains byte-identical. A single exhaustive config-to-start constructor validates either the existing `{ instanceId, initialVariables }` manual shape or the new exact `{ instanceId, startEventId, channel }` Message-start shape after compilation; it never infers Message start from an optional field or silently rewrites manual start.

## Runtime-only and synthetic constructs

| Construct | Derivation and owner | Public projection | Lifecycle invariant |
|---|---|---|---|
| `initiationPending` | Existing semantic-core private state set only by accepted start admission | None | Sound only because this profile admits exactly one start operation; multiple-start admission first requires a pending selected-start or operation identity |
| resolved `startEventId` | Copied from the checked BPMN node through IL origin and supplied by the pre-start router | Present only in the immutable program/stimulus evidence, not canonical state | Must match exactly before instance creation; never rewritten by Temporal |
| root scope occurrence | Existing semantic runtime identity constructed from definition scope, supplied semantic instance ID, and activation `1` | Consequences appear through existing instance-owned waits and state | Exactly one root occurrence for the admitted instance |
| Temporal Workflow ID | Collision-resistant encoding of semantic instance ID in the production client | None | Non-reusable while the prior execution is running or retained; post-retention prevention requires a later durable tombstone or router |

There is no synthetic Message subscription, broker record, correlation key, or delivery receipt in the semantic runtime.

## Layer ownership

- BPMN source owns exact XML structure, Message/Interface/Operation reference closure, Start Event arity, and checked projection.
- The checked graph owns source element and channel identity without moddle objects.
- Semantic Process IL owns the distinct Message-triggered initiation operation and control-place endpoint.
- Lean owns the declarative relation, evaluator soundness, refusal, identity, and post-initiation laws.
- The pure TypeScript semantic core independently realizes the same reviewed account.
- Temporal owns durable Workflow creation, Workflow addressing, Worker absence, history, and replay without defining BPMN Message Start meaning.
- The BPM platform later owns external publication, tenant and definition-version routing, buffering, idempotency, fanout, and its public API.
- CIB Seven is not selected as an oracle for this standards-only mechanism.

## Required, optional, and excluded

Required for closure:

- exact source admission and lowering for the selected profile;
- separate checked node, IL operation, and trigger stimulus without changing existing serialized values;
- strict TypeScript and Lean wire decoding;
- independent Lean and TypeScript semantics plus evaluator soundness;
- exact wrong-channel and cross-kind refusal with state identity;
- exact two-step closure, one enabled operation at each unstable prefix, limit-`1` over-limit evidence, and a final stable resumable User Task wait;
- registered answer-free scenario, product example, differential case, live Temporal Worker-absence/history/replay evidence, and meaningful mutations;
- the frozen cyclic baseline and every pre-existing scenario projection unchanged.

Optional after this capsule, but not part of it:

- the BPM platform's public message publication route and durable router;
- definition-version selection and tenant partitioning;
- exact retry recovery through a product idempotency key or durable start receipt.

Excluded:

- Message payload, ItemDefinition, data output, Data Association, or initial-variable injection;
- correlation keys, business keys, global subscription search, broker buffering, time-to-live, broadcast, unmatched-message policy, or one-to-many routing;
- multiple or mixed Start Events, multiple outgoing Sequence Flows, Parallel Multiple, or conditional start;
- Collaboration, Participant execution, Message Flow execution, Send Task, throw Message Event, or outbound Message commitment;
- Event Sub-Process start, interruption, boundary Event, scope cancellation, compensation, or migration;
- Call Activity, a callable or additional Process root, and global callable-Process invocation;
- Timer, Signal, Conditional, Error, Escalation, Compensation, Multiple, or Parallel Multiple Start Events;
- CIB Seven Message Start compatibility, A12 adoption, and Product 2 API implementation;
- Signal-With-Start, Update-With-Start, Continue-As-New, Search Attributes, Schedule, Child Workflow, or Activity hosting.

## CIB relationship

The on-demand CIB gate answers no to all five selection questions for Message Start itself: the BPMN choice is not materially ambiguous in the selected slice, no Camunda extension is involved, no CIB observation is required to define the outcome, no selected CIB configuration changes it, and the downstream blocker is the standards mechanism plus a later platform router rather than CIB behavior.

No new CIB relationship, probe, profile delta, or retained result is created. The profile may continue to name existing `CIB-AGR-0001` and `CIB-OP-0001` only for the already established trailing User Task mechanism. The Message Start scenario has `cib: null`, so those relationships are not evidence for Message Start.

## Preservation obligation and common-mode risks

The exact preservation claim is: every source/profile/scenario registration present in immutable pre-M2 baseline `7529150bf3a83de7e36734cf8d401924a0811b7d` retains its exact source bytes, profile bytes, admission result, checked graph, lowered program, scenario projection, and registry origin. The committed cyclic-control-flow baseline fixture and verifier remain read-only and must pass unchanged. The new profile is an additive post-baseline registration.

The primary common-mode risks are:

- source and lowering both reuse one stale fixture channel;
- Lean and TypeScript both compare Message ID but omit Interface Operation ID;
- manual and Message start collapse to one optional-mode shape;
- the Temporal client starts before semantic admission or turns the trigger into a Signal;
- source projection and lowering agree on an internally inconsistent MessageEventDefinition, Operation, and input-Message chain;
- the boolean pending flag is treated as sufficient after multiple start operations become admissible;
- Workflow-address reuse is claimed beyond Temporal retention or accepted-but-response-lost is misreported as semantic rejection;
- a scenario fixture and its expected projection share one faulty Start Event ID constant;
- a registered profile lands without its scenario, product example, or differential inventory entry.

Separating evidence uses independently constructed source twins, direct program values, exact state-identity negatives, checked-to-IL drift mutations, a fake client start counter, no-Signal live history, and the immutable baseline oracle. A comparator-side mutation alone does not establish that the producer preserved the channel; the source-to-checked-to-IL mutation must pass through the ordinary producer path.

The nearest realistic unsupported claim is a publication that matches two independent Message Start Events, possibly across definition versions, and must create the correct set of new Process instances exactly once. The current resolved-target stimulus preserves the information needed by that future router, but the current runtime retains only a boolean initiation flag. That future capsule must add pending selected-start or operation identity before multiple-start admission and must prove its routing, closure, and choice policy.

## Versioning consequences

Pre-release replace-in-place policy applies. The checked-node, Semantic Process operation, and stimulus unions widen atomically across strict JSON Schemas, Lean and TypeScript decoders, exhaustive switches, admission, lowering, scenario sequencing, protocol, Workflow, client, runner, artifact consistency, profile/scenario registries, and evidence.

Existing `startProcess`, `initiate`, runtime state, canonical observations, Message subscription commands, and all pre-existing artifacts gain no field and retain exact serialized bytes. The additive variants do not require a compatibility reader. No retained cross-version Temporal history corpus exists, so cross-version replay remains unclaimed.

### Owners this implementation grows

The owner inventory is mechanically derived with `node scripts/what-binds.ts`; the figures below are current at proposal preparation and are rechecked by [document reviewability](../../scripts/document-reviewability.test.ts). A fresh Red measurement governs extraction before implementation.

| Owner | Headroom to 600 nonblank lines | Consequence |
|---|---:|---|
| [semantic stimulus contract](../../packages/semantic-core/src/contract.ts) | 373 | Add one closed start variant and widen the union without changing the existing start shape. |
| [checked-process contract](../../packages/semantic-core/src/checked-process-contract.ts) | 385 | Add one identity-and-channel Start Event alternative. |
| [Semantic Process contract](../../packages/semantic-core/src/semantic-process-contract.ts) | 231 | Add one channel-bound initiation operation. |
| [semantic command admission](../../packages/semantic-core/src/semantic-command-admission.ts) | 330 | Dispatch to a new cohesive Message-start owner; do not place the full mechanism in this switch. |
| [Semantic Process admission](../../packages/semantic-core/src/semantic-process-admission.ts) | 285 | Accept the exact start-stimulus union and keep cross-kind pairing fail closed. |
| [operation admission](../../packages/semantic-core/src/semantic-process-operation-admission.ts) | 150 | Validate one complete channel and a canonical nonempty distinct output list, while profile capability enforces exact-one; extract first if the fresh measurement would cross 600. |
| [graph admission](../../packages/semantic-core/src/semantic-process-graph-admission.ts) | 122 | Recognize the new root operation with the existing finite graph laws; extract first if the fresh measurement would cross 600. |
| [profile capability](../../packages/semantic-core/src/semantic-process-profile.ts) | 80 | Add the exact registered profile only while a fresh measurement keeps this owner at or below 600; otherwise split its existing checked/program capability responsibilities first. |
| [graph policy](../../packages/semantic-core/src/semantic-process-graph-policy.ts) | 540 | Assign the new profile the existing whole-graph acyclic policy. |
| [runtime dispatcher](../../packages/semantic-core/src/semantic-process-runtime.ts) | 246 | Add one arm delegating to the shared root-token helper. |
| [stimulus validation and identity](../../packages/semantic-core/src/stimulus.ts) | 277 | Validate and compare every resolved-target field exactly. |
| [scenario admission](../../packages/semantic-core/src/scenario.ts) | 203 | Admit either closed start kind only in the first position. |
| [root-definition selection](../../packages/bpmn-source/src/root-definition-selection.ts) | 344 | Reuse the existing exact operation-message root selection without a second reference inventory. |
| [projected flow-element keys](../../packages/bpmn-source/src/projected-flow-element-keys.ts) | 345 | Add a Message Start shape without weakening plain None Start projection. |
| [checked-element projection](../../packages/bpmn-source/src/checked-element-projection.ts) | 228 | Dispatch exact Message Start projection through a new cohesive source owner. |
| [checked process admission](../../packages/bpmn-source/src/checked-process-admission.ts) | 242 | Admit the widened checked-node family only through the selected profile and delegate generic topology to the graph owner. |
| [checked graph admission](../../packages/bpmn-source/src/checked-process-graph-admission.ts) | 287 | Recognize Message Start as a root `0 -> 1` node under existing graph laws. |
| [Semantic Process lowering](../../packages/bpmn-source/src/semantic-process-lowering.ts) | 71 | Extract Message Start lowering before editing if the fresh Red measurement would cross 600; never compress or mix source projection into this owner. |
| [intermediate Message source](../../packages/bpmn-source/src/intermediate-catch-message-source.ts) | 532 | Extract the shared operation-message EventDefinition projection only after the new Message Start source is the second semantic user. |
| [contract artifact consistency](../../scripts/contract-artifact-consistency.ts) | 23 | This owner cannot safely absorb another independent operation family. Extract cohesive start-operation binding before adding the checked-to-IL channel/origin/output rule. |
| [contract artifact projection](../../scripts/contract-artifacts.ts) | 37 | Extract cohesive start-stimulus and start-operation projection before growth; preserve every existing artifact shape. |
| [contract artifact cases](../../scripts/contract-artifact-cases.ts) | 405 | Register the new normative-only scenario without changing CIB evidence projection. |
| [differential pipeline cases](../../packages/differential/test/pipeline-cases.ts) | 36 | Put the new Message Start case in a cohesive capsule-owned case module and register it from this near-limit catalog rather than embedding it here. |
| [Temporal protocol contracts](../../packages/temporal-adapter/protocol/src/contracts.ts) | 418 | Widen the exact Workflow-start input type without exposing SDK types. |
| [Temporal command identity](../../packages/temporal-adapter/protocol/src/command-identity.ts) | 456 | Include every new stimulus field in canonical identity. |
| [Temporal host admission](../../packages/temporal-adapter/protocol/src/host-admission.ts) | 400 | Classify `initiateMessage` as passive internal initiation and retain wait-set checks. |
| [Temporal process client](../../packages/temporal-adapter/client/src/process-client.ts) | 135 | Widen the concrete start input and preserve pre-start admission; extract Message-start client logic first if fresh measurement would cross 600. |
| [Workflow implementation](../../packages/temporal-adapter/workflow/src/workflow-implementation.ts) | 48 | Only widen the initial input contract. Any behavioral growth requires extracting an existing lifecycle responsibility before crossing 600. |
| [Workflow export](../../packages/temporal-adapter/workflow/src/workflows.ts) | 561 | Widen the exact start-input type only. |
| [testkit scenario admission](../../packages/temporal-adapter/testkit/src/scenario-admission.ts) | 580 | Widen the typed pre-start boundary to the closed process-start union. |
| [testkit Workflow start](../../packages/temporal-adapter/testkit/src/runner-workflow-start.ts) | 556 | Pass either admitted start variant to the same concrete Workflow start path. |
| [scenario sequencing](../../packages/temporal-adapter/testkit/src/scenario-stimulus-sequencing.ts) | 559 | Treat both start variants as first-only inputs. |
| [runner support](../../packages/temporal-adapter/testkit/src/runner-support.ts) | 191 | Construct and execute the registered resolved trigger without a product router. |
| [runnable MVP config](../../packages/temporal-adapter/runner/cli/runnable-mvp-config.ts) | 443 | Add a second closed Message-start config arm while preserving every existing manual config byte and avoiding optional trigger fields. |
| [runnable MVP execution](../../packages/temporal-adapter/runner/cli/runnable-mvp.ts) | 247 | Use one exhaustive compiled-program/config-to-start constructor before the existing admission and client path. |
| [product example guard](../../packages/temporal-adapter/testkit/test/product-example-configs.test.ts) | 447 | Build the exact start variant for each registered example so a Message Start profile cannot be tested through manual start. |
| [Lean scenario wire contract](../../BpmnSemantics/Scenario.lean) | 397 | Add the exact `triggerMessageStart` stimulus and command identity fields. |
| [Lean semantic contract](../../BpmnSemantics/SemanticProcessContract.lean) | 146 | Add the checked node and IL operation only while the owner remains below 600. |
| [Lean checked-process admission](../../BpmnSemantics/SemanticProcess/CheckedProcessAdmission.lean) | 300 | Validate the exact checked Message Start node and complete operation-addressed channel. |
| [Lean checked-graph validation](../../BpmnSemantics/SemanticProcess/CheckedGraphValidation.lean) | 474 | Add node identity, `0 -> 1` arity, closed start-family discovery, and acyclic-policy classification. |
| [Lean profile admission](../../BpmnSemantics/SemanticProcess/ProfileAdmission.lean) | 306 | Own the selected profile's exact checked-node, operation, and exact-one output cardinalities. |
| [Lean program structural validation](../../BpmnSemantics/SemanticProcess/ProgramStructuralValidation.lean) | 306 | Validate the closed start-operation family, canonical nonempty distinct outputs, and exact root ownership independently of profile cardinality. |
| [Lean graph validation](../../BpmnSemantics/SemanticProcess/GraphValidation.lean) | 183 | Add the new start operation's outputs, scope ownership, and reachability to existing finite graph laws. |
| [Lean transition dispatcher](../../BpmnSemantics/SemanticProcess/Transition.lean) | 294 | Delegate one exhaustive `initiateMessage` arm to the new cohesive Message Start relation and evaluator. |
| [Lean execution](../../BpmnSemantics/SemanticProcess/Execution.lean) | 59 | Do not add Message-start proofs here; add only exhaustive dispatch/imports to a new cohesive `MessageStart.lean` owner. |
| [Lean lowering](../../BpmnSemantics/SemanticProcess/Lowering.lean) | 106 | Add exact channel/origin/output lowering and its preservation bridge. |
| [Lean scenario admission](../../BpmnSemantics/SemanticProcess/Scenario.lean) | 307 | Close the existing cross-target gap by requiring exactly one supported start variant at index zero and only non-start stimuli afterward, matching TypeScript and the schema. |
| [Lean checked-process decoder](../../BpmnSemantics/SemanticProcessJson/CheckedProcess.lean) | 376 | Decode the exact closed Message Start node. |
| [Lean program decoder](../../BpmnSemantics/SemanticProcessJson/Program.lean) | 179 | Decode the exact closed `initiateMessage` operation. |
| [Lean scenario decoder](../../BpmnSemantics/SemanticProcessJson/Scenario.lean) | 505 | Decode the new first stimulus and reject missing, extra, or malformed fields. |
| [Lean JSON executable](../../BpmnSemantics/SemanticProcessJsonMain.lean) | 301 | Encode the trigger and discover Process identity through either closed start variant. |
| [Lean Semantic Process umbrella](../../BpmnSemantics/SemanticProcess.lean) | 578 | Import the new independently buildable Message Start mechanism only. |
| [Lean conformance executable](../../BpmnSemantics/ConformanceMain.lean) | 586 | Import the new Message Start conformance evidence into the maintained conformance target. |
| [Lean checked-source decomposition experiment](../../BpmnSemantics/Experiments/CheckedSourceDecomposition.lean) | 435 | Reject Message Start explicitly so the frozen experiment does not acquire a new production source mechanism. |
| [Lean checked-source transition experiment](../../BpmnSemantics/Experiments/CheckedSourceTransition.lean) | 298 | Reject the new checked node and stimulus explicitly in the experiment evaluator. |
| [Lean checked-source graph experiment](../../BpmnSemantics/Experiments/CheckedSourceGraph.lean) | 517 | Reject Message Start in the frozen arity and root predicates. |
| [Lean checked-source chain experiment](../../BpmnSemantics/Experiments/CheckedSourceChain.lean) | 408 | Keep the supported-chain classification exhaustive and reject Message Start. |
| [Lean checked-source coverage experiment](../../BpmnSemantics/Experiments/CheckedSourceCoverage.lean) | 352 | Keep coverage proofs exhaustive without claiming Message Start support. |
| [Lean checked-source scenario experiment](../../BpmnSemantics/Experiments/CheckedSourceScenario.lean) | 457 | Classify the new stimulus command identity and reject execution through the frozen experiment. |

Strict [checked-process schema](../../contracts/schemas/checked-process.schema.json), [Semantic Process schema](../../contracts/schemas/semantic-process.schema.json), and [scenario schema](../../contracts/schemas/scenario.schema.json) change atomically but are not hand-written source headroom owners.

The six experiment owners above are the complete repository-built fail-closed surface found by the checked-node and stimulus discriminant sweep. They do not gain Message Start semantics. `CheckedSourceFrontier` and `CheckedSourceCorrespondence` do not exhaust either widened union and remain unchanged.

The profile, scenario, BPMN fixture, and runnable example are new registered artifacts. [profiles/README.md](../../profiles/README.md), [scenarios/README.md](../../scenarios/README.md), [semantic-core README](../../packages/semantic-core/README.md), [BPMN-source README](../../packages/bpmn-source/README.md), [Temporal-adapter README](../../packages/temporal-adapter/README.md), [wire-contract README](../../contracts/README.md), the [profile-parameterized admission specification](../PROFILE-PARAMETERIZED-ADMISSION-SPEC.md), and the [runnable MVP specification](../RUNNABLE-TEMPORAL-MVP-SPEC.md) update atomically with implementation. [Call Activity lowering](../../packages/bpmn-source/src/call-activity-lowering.ts), the handle-free [definition-start client](../../packages/temporal-adapter/client/src/definition-start-client.ts), and Product 2's manual definition-start surface remain unchanged because the exact Message Start profile excludes Call Activity, callable or additional Process roots, and Product 2 ingress.

The complete `what-binds` rerun also reaches the Java [closed scenario stimulus union](../../runners/cibseven/src/main/java/org/bpmnlean/cibseven/ScenarioProtocol.java) and [CIB scenario runner](../../runners/cibseven/src/main/java/org/bpmnlean/cibseven/CibSevenScenarioRunner.java), at 598/600 and 577/600 nonblank lines. They remain unchanged and fail closed for `triggerMessageStart`; the registered Message Start scenario declares `cib: null`, so no CIB runner decodes or executes it. Their [CIB runner registry](../../runners/cibseven/README.md) and [runner registry](../../runners/README.md) therefore remain unchanged. Any future CIB Message Start relationship must open a separate capsule and cohesive Java extraction rather than widening these near-limit owners incidentally.

Existing focused test owners also change where their exact inventories widen:

| Test owner | Headroom to 600 nonblank lines | Obligation |
|---|---:|---|
| [projected flow-element keys](../../packages/bpmn-source/test/projected-flow-element-keys.test.ts) | 157 | Register the new exact projector in the closed production key-owner matrix. |
| [checked graph admission characterization](../../packages/bpmn-source/test/checked-process-graph-admission.test.ts) | 444 | Lock the exact root `0 -> 1` Message Start shape and reject the nearest incoming, arity, condition, placement, and mixed-start violations. |
| [definition artifact negatives](../../scripts/contract-definition-artifacts.test.ts) | 125 | Reject checked-to-IL drift in Start Event ID, every output, and every channel component. |
| [artifact projection oracle](../../scripts/contract-artifact-projections.test.ts) | 14 | Extract a cohesive Message-start projection oracle before adding the new scenario; do not grow this near-limit owner in place. |
| [command identity](../../packages/temporal-adapter/testkit/test/command-identity.test.ts) | 411 | Lock canonical identity over every Message-start trigger field. |
| [product example configs](../../packages/temporal-adapter/testkit/test/product-example-configs.test.ts) | 447 | Construct and admit the correct closed start variant for every example. |
| [runnable MVP](../../packages/temporal-adapter/testkit/test/runnable-mvp.test.ts) | 404 | Lock strict Message-start config validation while preserving the old manual branch. |
| [external Temporal runtime](../../packages/temporal-adapter/testkit/test/external-temporal-runtime.test.ts) | 466 | Keep its existing fixture explicitly manual-start after the config union widens. |

### Guards and oracles

| Guard or oracle | Obligation |
|---|---|
| [document reviewability](../../scripts/document-reviewability.test.ts) | Recompute every owner figure and require this proposal in both registries. |
| [requirement ledger consistency](../../scripts/requirement-ledger-consistency.test.ts) | Keep `BPMN-MESSAGE-START-01`, its disposition, and capsule citation aligned. |
| [contract schema coverage](../../scripts/contract-schema-coverage.test.ts), [contract artifacts](../../scripts/contract-artifacts.test.ts), and [artifact projection oracle](../../scripts/contract-artifact-projections.test.ts) | Cover each new exact union arm, preserve the ordinary projector path, and reject missing, extra, or malformed channel and start fields. |
| [definition artifact consistency](../../scripts/contract-definition-artifacts.test.ts) | Bind checked Start Event origin/channel/output to the lowered operation and reject drift in each component. |
| [projected flow-element keys](../../packages/bpmn-source/test/projected-flow-element-keys.test.ts) | Keep the new Start Event projector in the mechanically closed shared-key consumer inventory. |
| [frozen cyclic baseline](../../packages/bpmn-source/test/cyclic-control-flow-preservation.test.ts) | Preserve every baseline source, profile, admission, checked, IL, and registry-origin value exactly while permitting only additions. |
| [product example configs](../../packages/temporal-adapter/testkit/test/product-example-configs.test.ts), [capsule roundtrip](../../scripts/capsule-roundtrip.test.ts), and [differential pipeline](../../packages/differential/test/pipeline.test.ts) | Land profile, scenario, example, targets, and exact ordered inventories atomically. |
| [host admission](../../packages/temporal-adapter/testkit/test/host-admission.test.ts) | Admit the selected passive downstream wait and reject cross-kind or unsupported host shapes before Workflow start. |
| [Temporal package boundary](../../scripts/temporal-package-boundary.test.ts) | Keep SDK client, Workflow, Worker, runner, and testkit dependencies in their owned packages. |
| [platform product boundary](../../scripts/platform-product-boundary.test.ts) | Keep the semantic capsule in Product 1 and expose no private engine value through Product 2. |
| [A12 boundary](../../scripts/a12-boundary.test.ts) and [A12 preservation](../../scripts/a12-preservation.test.ts) | Keep A12 source, decisions, profiles, and adoption evidence outside this standards-only mechanism. |
| [BPMN XML validation](../../scripts/bpmn-xml-validation.test.ts) and [BPMN corpus policy](../../scripts/bpmn-corpus-policy.test.ts) | Validate the source fixture and retain the pinned normative corpus. |
| [normative reference resolution](../../scripts/normative-reference-resolution.test.ts) | Resolve every named clause, table, CMOF, and XSD anchor. |
| [source hygiene](../../scripts/source-hygiene.test.ts), [Lean source contracts](../../scripts/lean-source-contracts.test.ts), and [what-binds](../../scripts/what-binds.test.ts) | Keep cohesive owners under the review target and preserve exhaustive guards and registries. |
| [pre-release architecture](../../scripts/pre-release-architecture.test.ts) | Prevent optional trigger bags, topology-specific runtime dispatch, compatibility readers, or a second semantic core. |
| [semantic review packet](../../scripts/semantic-review-packet.test.ts) | Bind proposal, checkpoint, and closure review evidence to exact immutable targets and routed owner sections. |
| [Markdown links](../../scripts/markdown-links.test.ts) | Resolve every owner, guard, requirement, and evidence link. |

## Epistemic closure and cost boundary

Closure may establish only the exact one-target, payload-free top-level Message Start profile, its independent Lean and TypeScript semantics, and its direct Temporal Workflow-start refinement. It does not establish a broker, global router, definition subscription, tenant policy, general BPMN Message correlation, CIB compatibility, or full Process Execution Conformance.

The nearest realistic counterexample is one external publication matching two Message Start Events that share a Message but differ by Interface Operation or definition version. A router that chooses one by Message ID alone would lose a standards-visible distinction. The exact resolved `startEventId` and complete channel keep this counterexample representable and force the later routing capsule to decide fanout explicitly.

Meaningful mutations are: compare only Message ID; accept an inconsistent source Message/Operation chain; accept manual start for a Message-start program; lower a stale operation channel; treat a boolean pending flag as a start selector after multiple operations become admissible; create a synthetic subscription; send Signal-With-Start; start Temporal before admission; claim a retained duplicate guarantee after retention; reset or alias the supplied instance ID; and omit one atomic registration. Each must reach a public, semantic, artifact, or durable-history discriminator.

At closure, [CAPSULE-COST-LEDGER.md](../CAPSULE-COST-LEDGER.md) records commit-bounded code and documentation churn against the resumption-bounded cyclic-control-flow capsule, the nearest completed increment that changed checked source, IL, Lean, TypeScript, schemas, registered evidence, and Temporal hosting.

## Stop conditions

Stop and return to research or owner decision if:

- the standard requires one selected top-level Message Start source field to have incompatible meanings in the same profile;
- exact Message, Interface Operation, and Start Event identity cannot survive source, checked graph, IL, stimulus, and pre-start host admission;
- implementation requires modifying existing `startProcess` or `initiate` serialized values rather than adding closed variants;
- a future conforming multiple-Start or fanout case would require reinterpreting an already admitted single-target model;
- the Temporal host cannot durably create the Process while the Worker is absent without using a Signal as semantic ingress;
- wrong-channel or cross-kind refusal cannot be established before Workflow start;
- the frozen baseline changes, the source-to-IL preservation oracle becomes self-referential, or an atomic registration guard cannot accept exactly one profile and scenario;
- any A12 or unreviewed CIB product behavior becomes necessary to define the standards mechanism;
- an owner would cross 600 nonblank lines without a cohesive extraction, or the first Lean change cannot pass the standing one-CPU, no-swap, 3 GiB resource audit.

## Owner decisions after review

Owner approval is requested for these exact decisions:

1. Select one payload-free, top-level, operation-addressed Message Start Event with exact `0 -> 1` arity and the linear User Task witness.
2. Add separate `MessageStartEvent`, `InitiateMessage`, and `TriggerMessageStart` variants while preserving existing None Start values byte-for-byte.
3. Require the resolved stimulus to carry exact Process ID, semantic instance ID, Start Event ID, and the complete Interface/Operation/Message channel.
4. Use direct Temporal Workflow start as durable host ingress, with no Signal-With-Start or Update-With-Start.
5. Keep external publication, definition routing, tenant policy, buffering, idempotency, and fanout in the later BPM platform increment.
6. Use a proved Lean lane and require a conditional semantic checkpoint before registered scenario and live Temporal evidence work.
7. Keep Message Start standards-only with no new CIB relationship or A12 dependency.
