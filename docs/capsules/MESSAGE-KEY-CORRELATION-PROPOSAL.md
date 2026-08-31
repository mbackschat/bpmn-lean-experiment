# Message key correlation proposal

## Status

Lifecycle: draft
Review: pending

## Prior review

The first immutable proposal target `716b6bb8` received a context-cold `reject` verdict. Its bounded BPMN interpretation and `CIB-LIM-0002` classification were accepted, but its definition-local global address, non-linearized query fanout, incomplete result/retry contract, and missing internal-commutation census ownership required a material redesign. This target therefore returns to a new cold proposal review rather than a warm correction audit.

## Question and bounded outcome

What is the smallest standards-only mechanism that routes one payload-bearing Message to exactly one already-waiting Process instance within one immutable semantic definition by a BPMN `CorrelationKey`, while retaining direct subscription addressing unchanged and refusing zero or ambiguous matches without letting the host choose a winner?

This capsule proposes one context-backed, single-property key for one non-instantiating Intermediate Catch Message Event. One earlier directly addressed payload Message initializes a non-empty string in one Process `Property`; the later Message extracts the same kind of value from its payload, compares it with the current Property value through one `CorrelationSubscription`, and advances exactly one matching Process instance. The first Message reuses the implemented [Message payload catch mediation specification](MESSAGE-PAYLOAD-CATCH-MEDIATION-SPEC.md). The second reuses its scalar payload domain for correlation only and declares no catch `DataOutput`, so its payload is not written into Process scope.

The new requirement is `BPMN-MESSAGE-CORRELATION-01`. Its disposition remains `unsupported` until this capsule is implemented and closure-reviewed. Existing `BPMN-MESSAGE-CATCH-01`, `BPMN-MESSAGE-PAYLOAD-CATCH-01`, `BPMN-BOUNDARY-MESSAGE-01`, and `BPMN-RECEIVE-TASK-01` meanings remain unchanged.

## Normative account and selected interpretation

BPMN 2.0.2 Clause 8.4.2 defines correlation as runtime association of a Message with an ongoing Conversation between particular Process instances. In key-based correlation, the first Message populates a Conversation's `CorrelationKey` from payload `CorrelationPropertyRetrievalExpression`s; a later Message derives the same key and MUST match the initialized Conversation key. The clause explicitly applies every Send/Receive Task statement to Message catch/throw Events as well.

Context-based correlation is layered on key-based correlation. A Process `CorrelationSubscription` binds every `CorrelationProperty` of one key to a `FormalExpression` over Process context, and the current Process values dynamically determine the matching criterion. Clause 9 and Table 9.1 make Conversation information part of a Process's definitional Collaboration, while Table 10.1 connects the Process to that Collaboration and owns its correlation subscriptions.

The machine-readable anchors are `Collaboration-correlationKeys`, `ConversationNode-correlationKeys`, `CorrelationKey-correlationPropertyRef`, `CorrelationProperty-correlationPropertyRetrievalExpression`, `CorrelationPropertyRetrievalExpression-messagePath`, `CorrelationPropertyRetrievalExpression-messageRef`, `Process-correlationSubscriptions`, `CorrelationSubscription-correlationKeyRef`, `CorrelationSubscription-correlationPropertyBinding`, `CorrelationPropertyBinding-dataPath`, `CorrelationPropertyBinding-correlationPropertyRef`, and `Process-definitionalCollaborationRef`, together with their `tCorrelation*` and `tProcess` XSD declarations.

The standard leaves expression language and value equality to the selected profile. This capsule selects one deliberately tiny expression language and one scalar key domain rather than silently importing XPath, JUEL, JSONPath, Java equality, or CIB API criteria. It also selects fail-closed exact-cardinality routing: exactly one current candidate commits; zero or more than one reject the publication with no Process-state change. The standard expects a key to identify a distinct Conversation and elsewhere states that key-based correlation has at most one active receive for a key, but it does not license this engine to arbitrate when admitted runtime facts contradict that expectation.

## Required, optional, and excluded scope

**Required source:** one private executable Process; one definitional Collaboration with exactly one external Participant and one Process-owning Participant; exactly two Message Flows from the external Participant to two sequential Intermediate Catch Message Events; one Conversation containing both Participants and both Message Flows; one Conversation-owned `CorrelationKey`; one root `CorrelationProperty`; one Process `CorrelationSubscription`; one Process `Property`; one root scalar `ItemDefinition`; one root Message, Interface, and Operation chain reused by both catches; and the control flow `None Start -> directly addressed payload catch -> correlated payload catch -> User Task -> None End`. Every global correlation address is scoped to the complete immutable semantic-definition identity, the Process id, the resolved Message channel, and the CorrelationKey id.

**Required correlation shape:** the key contains exactly the one CorrelationProperty; that property has exactly one retrieval expression for the reused Message; the Process subscription references that key and has exactly one binding referencing the same property; the retrieval `messagePath` and binding `dataPath` use the exact language URI and syntax below; the first catch's direct output writes the payload into the bound Process Property; the second catch has no `DataOutput`, `OutputSet`, or data association.

**Optional:** human-readable `name` values only. They carry no identity or matching authority.

**Excluded:** a second key, property, binding, retrieval expression, Message type, Conversation, or correlated catch; composite, null, empty, Boolean, integer, list, structured, or collection keys; wildcard or uninitialized matching; a Process-context change or another candidate-withdrawing command while the correlated wait is active; payload flow out of the second catch; optional or while-executing outputs; Message Start, Receive Task, boundary, throw, or End correlation; Message Flow transport execution; Collaboration or Participant execution; modeled send; buffering; broadcast; predicate correlation; multiple matches; cross-definition matching even when every model-local id is equal; correlation to Process definitions rather than instances; multi-tenant, version, business-key, or local-variable selection; CIB API correlation criteria; and Product 2 routing or persistence.

## Exact expression and value subset

The language URI is `urn:bpmn-lean:correlation-scalar-path:v1`. Its grammar has two context-specific forms and no general expression AST:

```text
messagePath ::= "payload"
dataPath    ::= "property:" BpmnElementId
```

The source reader requires exact character content with no trimming, Unicode normalization, entity-expanded alias, variable lookup, method call, navigation, predicate, or fallback. `payload` selects the complete delivered scalar payload. `property:<id>` resolves `<id>` by BPMN identity to the one Process-owned Property declared by this profile; a name match is invalid.

Both extracted values must be `VariableValue.String` with a non-empty value within the existing canonical scalar-size bound. Equality is exact Unicode scalar-value sequence equality without locale, case folding, trimming, or normalization. Empty and null do not represent the standard's temporary correlate-any initialization: this profile ensures that the direct first Message has populated the Property before the correlated wait can arm, so every publicly routable candidate has one complete key value.

The first direct Message simultaneously satisfies the key-initialization account and the already-reviewed catch-output association. Both derivations read the same payload, and the context binding reads the Property written by that association. The bounded representation therefore needs no second hidden copy of the key. Later pure key-based correlation without a `CorrelationSubscription`, different payload shapes, or a mutable active context may add explicit correlation-instance state without changing any model admitted here.

## Source, checked graph, and Semantic Process contract

Admission resolves every reference by parser-graph identity: Process to definitional Collaboration, Participants to Process, Message Flows to their endpoints and Message, Conversation to Participants and Message Flows, key to property, retrieval expression to Message, subscription to key, binding to property, and data path to the Process Property. The root Message's `itemRef`, the first catch's `DataOutput.itemSubjectRef`, and the optional `CorrelationProperty.type` when present must resolve to the same scalar ItemDefinition. The exact `operationRef` is the schema-defined child QName element, never an attribute.

The checked graph adds a distinct correlated Message catch node carrying the resolved channel, key identity, correlation-property identity, payload selector, and Process-property selector. The Semantic Process program adds a distinct `awaitCorrelatedPayloadMessage` operation. Neither is an optional field on the existing direct Message arms: old checked graphs, programs, direct stimuli, enabled interactions, and their serialized bytes remain unchanged.

The correlated wait contributes to the existing generic open-Message wait projection, but it does not publish a direct `deliverMessage` or `deliverPayloadMessage` interaction. It publishes a new global correlated-payload interaction carrying the complete `CorrelatedMessageAddress` below, with no target Process or subscription supplied by the caller. A separate adapter-private exact candidate Query returns the current engine-owned match fact: the same address, semantic Process-instance identity, subscription occurrence identity, correlation-property identity, Process-property identity, and current non-empty string key. Those values are derived only from the immutable program and committed runtime state; no directory row, Workflow identity, or caller value can manufacture them.

## Global command and runtime contract

The public definition-scoped address and command are conceptually:

```ts
type CorrelatedMessageAddress = DeepReadonly<{
  definition: SemanticProcessIdentity;
  processId: string;
  channel: MessageChannel;
  correlationKeyId: string;
}>;

type PublishCorrelatedMessage = Readonly<{
  commandId: string;
  address: CorrelatedMessageAddress;
  payload: Readonly<{ kind: "string"; value: string }>;
}>;
```

`SemanticProcessIdentity` contributes compiler, semantic profile, exact source id and SHA-256, and exact source-overlay identity; `processId` completes the immutable semantic-definition address. Two definitions whose Process, Interface, Operation, Message, and CorrelationKey ids are textually equal but whose source digest, profile, or overlay differs therefore have different addresses and different durable ingress Workflows. The caller supplies no Process-instance or subscription identity.

A pure matcher accepts one command address and a finite vector of exact candidate facts. It refuses any fact whose complete address differs, extracts the payload key, filters the remaining facts by complete key shape and exact value equality, then returns `noMatch`, `unique(candidate)`, or `ambiguous`. Candidate order is irrelevant, and no canonical sort becomes a tie-breaker. The cross-definition same-local-ids witness is mandatory: publishing to definition A must not inspect, select, or expose definition B's candidate.

`noMatch` and `ambiguous` are typed semantic rejections and preserve every Process instance exactly. `unique` permits one content-bound target delivery carrying the original command id, complete address, payload, selected subscription occurrence, and explicit durable ingress ordinal. The target Process independently rechecks the definition, Process, current operation, occurrence, channel, key identity, payload extraction, Property binding, and equality before it atomically withdraws the subscription and adds the outgoing token. A stale or changed target returns a target-identified semantic rejection; the ingress quarantines the inconsistent locator and MUST NOT rematch the same command to another candidate.

The engine operation returns one exhaustive resolution union whose tags keep semantic, capacity, and infrastructure outcomes distinct:

```ts
type CorrelatedMessageTarget = DeepReadonly<{
  processInstanceId: string;
  subscriptionId: MessageSubscriptionId;
}>;

type CorrelatedMessagePublishResult = DeepReadonly<{
  kind: "semantic";
  commandId: string;
  address: CorrelatedMessageAddress;
  ingressOrdinal: number;
  outcome:
    | { kind: "committed"; target: CorrelatedMessageTarget }
    | { kind: "rejectedNoMatch" }
    | { kind: "rejectedAmbiguous" }
    | { kind: "rejectedTarget"; target: CorrelatedMessageTarget };
}>;

type CorrelatedMessagePublishResolution =
  | CorrelatedMessagePublishResult
  | DeepReadonly<{
      kind: "capacity";
      commandId: string;
      address: CorrelatedMessageAddress;
      ingressOrdinal: null;
      failure: {
        kind: "publicationQueue" | "resultLedger";
        configuredBound: number;
        observedValue: number;
      };
    }>
  | DeepReadonly<{
      kind: "infrastructureIndeterminate";
      commandId: string;
      address: CorrelatedMessageAddress;
      ingressOrdinal: number | null;
      phase:
        | "ingressResolution"
        | "candidateFanout"
        | "targetDelivery"
        | "resultRecovery";
      target: CorrelatedMessageTarget | null;
    }>;
```

Every previously unseen, well-formed publication that fits the ingress ledger receives exactly one positive safe-integer ordinal before candidate acquisition; every semantic result carries it. Publication queue or result-ledger capacity is a nonsemantic resolution before ordinal allocation. Malformed address or payload throws `BpmnCorrelatedMessageIngressInvalid` before Signal submission. Reuse of one command id with different address or payload records durable `commandIdentityConflict`, throws `BpmnCorrelatedMessageIdentityConflict`, allocates no new ordinal, and leaves the first record unchanged. Query, Worker, Activity, transport, failed-ingress-Workflow, and client-deadline failures return `infrastructureIndeterminate`, never a semantic outcome. That arm reports the already assigned ordinal and selected target only when the private status Query has established them; exact retry continues the same retained command, ordinal, phase, and target and may later return its final semantic result. Candidate-registration capacity remains a separately typed Process-command host failure because it occurs before the global publication operation exists.

The complete command identity is the canonical encoding of command id, complete address, and payload. An exact repeated Signal is coalesced, and a retry first resolves the ingress result/status Query before another Signal. A retained semantic result returns byte-identically across Worker replacement and Continue-As-New. A pending unique delivery retries only the retained target. The result exposes no Temporal Workflow, Run, Event History, Search Attribute, directory row, or platform identity.

## Stable semantic rules and separating witnesses

| Rule | Statement | Required evidence |
|---|---|---|
| `MCORR-SOURCE-01` | The definitional Collaboration, Conversation, both Message Flows, key, property, subscription, binding, Message, and Process Property form the exact resolved identity graph above | Official-XSD validation; source and checked-graph positives; one mutation for every reference, containment, cardinality, and endpoint |
| `MCORR-EXTRACT-01` | The exact `payload` path extracts one non-empty string from the Message and no other expression or value kind is admitted | Independent TypeScript and Lean path decoders; boundary-space, alternate-language, empty, null, kind, and normalization negatives |
| `MCORR-CONTEXT-01` | The exact `property:<id>` path reads the current value of the resolved Process Property, which was initialized by the first direct payload Message | A two-stage instance witness; name-versus-id and wrong-Property mutations; a law that candidate projection follows the current committed binding |
| `MCORR-ADDRESS-01` | Global matching and target delivery use the complete immutable definition, Process, channel, and CorrelationKey address; model-local ids alone never cross a definition boundary | Two exact definitions with equal local ids and different source SHA-256 values; address-digest, profile, overlay, and Process-id omission mutations |
| `MCORR-MATCH-01` | A candidate matches only when channel, key identity, complete shape, and exact extracted value all agree | Pure finite matcher in Lean and TypeScript; channel, key-id, value, and partial-key negatives |
| `MCORR-UNIQUE-01` | Exactly one match selects that candidate; zero and multiple matches reject without changing any Process | Two-instance unique, zero-match, and duplicate-key schedules; permutation invariance; wrong lexical-first mutation |
| `MCORR-DELIVER-01` | The selected Process revalidates and atomically consumes only the selected correlated subscription, writes no payload value, and follows its outgoing flow | Per-instance transition relation and evaluator bridge; non-target preservation; stale and changed-value refusal |
| `MCORR-DIRECT-01` | Existing direct-address profiles neither publish the correlated interaction nor accept the global correlated command | Byte-identical old artifacts and direct-profile negative commands across source, Lean, core, and Temporal |
| `MCORR-SNAPSHOT-01` | Registration completion and one ingress-held scan barrier make every exact candidate Query refer to one stable complete vector; one missing, failed, malformed, or changed Query is infrastructure-indeterminate, never an absent candidate | Pending-registration, omitted-locator, Query-failure, candidate-change, and non-atomic-fanout mutations plus Worker replacement |
| `MCORR-ORDER-01` | Durable ingress order is an explicit input; one publication settles before the next is matched, and a stale selected target is never silently rematched | Concurrent-publication witness with distinct ingress ordinals, target-result deduplication, same-target indeterminate recovery, Worker replacement, and replay |

The primary whole-model witness is `correlated-settlement-confirmation`. Two instances of the same exact model receive different settlement references through their first directly addressed payload subscriptions. One later global publication carries the first reference and advances only that instance to `ReviewSettlement`; the other remains at its correlated wait. A zero-match schedule leaves both waiting. An ambiguous schedule initializes both with the same reference and requires both to remain waiting. A second definition reuses every relevant local id under a different source digest and proves that its equal-valued candidate is not in the addressed population.

The nearest realistic wrong implementation filters by Message channel and takes the lexically first Process identity. It passes every singleton case and fails only the duplicate-key schedule, so that schedule is mandatory rather than an optional robustness check. A second realistic defect keys the ingress by the model-local Message and CorrelationKey ids; it passes every one-definition schedule and fails only the cross-definition same-id witness.

## Lean assurance lane

The lane is declared **proved** for the bounded per-instance transition and finite-population matcher. The pure matcher theorems cover complete-address isolation, permutation invariance, exact no-match, unique-match soundness and completeness, ambiguous preservation, and the non-law that lexical candidate order may select a winner. The per-instance theorems cover exact path evaluation, candidate-projection correctness, target revalidation, subscription withdrawal finality, no payload write, outgoing-token production, refusal preservation, runtime-state well-formedness, and unchanged non-target instances.

The evaluator-soundness bridge remains a bridge rather than a separate evidence lane. The global proof ranges over a finite list of published candidate facts and Process states; it does not claim discovery completeness for Temporal. Discovery completeness is the distinct host-refinement obligation below.

## Internal operation-family classification

`awaitCorrelatedPayloadMessage` enters the **ordinary wait arming** criterion in the mandatory [complete operation-family census](../INTERNAL-COMMUTATION-PROPOSAL.md#complete-operation-family-census). Its footprint reads `runtimeControl(instance)`, the exact scope occurrence and input token, the Message activation counter, absence of the exact Message wait and untagged open-wait anchor, and `processVariable(propertyId)` at the resolved non-empty String value. It writes the consumed token, next Message activation, exact correlated Message wait, and derived open-wait anchor. Its normal committed-transition and lifecycle publications remain paired, and its additional current candidate projection contributes a `correlationCandidate(completeAddress, subscriptionOccurrence, correlationPropertyId, processPropertyId)` publication atom; the key value is protected by the Process-variable read rather than duplicated into RuntimeState.

Shared reads of the same Process Property are permitted, but any Process-variable write conflicts with this arming operation. Two candidate projections with distinct subscription occurrences may coexist even when their key values are equal, because ambiguity is decided later by the population matcher; equal occurrence/publication identity still conflicts. The first semantic checkpoint must update the normative census table, the exhaustive TypeScript classifier in [`internal-commutation-census.ts`](../../packages/semantic-core/src/internal-commutation-census.ts), the exhaustive Lean classifier in [`InternalCommutationCensus.lean`](../../BpmnSemantics/SemanticProcess/InternalCommutationCensus.lean), and the correlated operation's preparation/footprint oracle atomically. Leaving the operation merely unsupported by the footprint helper is not a valid classification.

## CIB Seven relationship boundary

`CIB-LIM-0002` is the applicable classified relationship. Pinned CIB Seven `2.2.0` parses the modeled correlation elements through its Model API but does not execute their retrieval or Process-context bindings; only separate public API criteria select a waiting instance. The phase-zero probe is a negative calibration witness, not a CIB semantic target, and no CIB result enters this capsule's agreement matrix.

## Temporal hosting and refinement preflight

The current adapter addresses one known Process Workflow and can Query its waits; Workflow code cannot obtain a query-capable external Workflow handle. Product 2 registrations, Temporal Event History, Visibility, Memo, and Search Attributes therefore cannot supply candidate facts. This capsule adds one engine-owned correlation-ingress Workflow per complete `CorrelatedMessageAddress`, one Process candidate Query, and two bounded Activities implemented by the Worker with its private `WorkflowClient`: exact candidate fanout and content-bound target delivery/result recovery. Neither Activity is a BPMN external effect.

### Registration and the candidate-completeness barrier

The correlated profile permits exactly one candidate per Process instance, and the candidate's bound Property cannot change while the correlated wait is active. The only admitted transition that withdraws it is the uniquely selected correlated delivery; another candidate-changing command, Process-context update, host cancellation, or independently completing route is outside this profile. Host termination or an unavailable Process Workflow is infrastructure failure, never candidate absence.

When the first direct payload command would arm the correlated wait, the Process Workflow keeps the core successor and E1/E2 batch staged. A content-bound registration Activity asks the exact address's ingress to prepare one transaction containing the complete candidate fact and private Process locator. The ingress admits the transaction only when its count and canonical-byte capacities fit, records it as pending, and blocks candidate scans until it is resolved. Capacity refusal preserves the exact Process pre-state and publication, records no `ProcessCommandResult`, and makes the existing Message client throw `BpmnCorrelationCandidateCapacityExhausted`; it is a host-capacity failure rather than a semantic result. After prepare succeeds, the Process installs the staged semantic state and publication, making its exact candidate Query return that fact, then the Activity finalizes the same transaction. Finalization atomically moves the fact from pending to active; only its acknowledgement lets the direct Message command complete. Exact retries of prepare or finalize return the retained transaction state, and changed content under one transaction id is a nonretryable identity conflict.

A scan starts only when no registration transaction is pending. It installs one ingress-held scan barrier before any network I/O; a later registration may be queued but cannot finalize until that barrier clears. Since an active candidate cannot otherwise change under this profile, the barrier linearizes the candidate vector before fanout even though the individual Queries are non-atomic. A Process state committed before registration finalization cannot be omitted because the pending transaction blocks the scan; after the opening command completes, its finalized active entry must be queried.

The fanout Activity Queries every active locator for the exact address and expected subscription occurrence and returns the complete canonical vector. Any missing Workflow, closed Workflow, timeout, unavailable Worker, malformed response, absent expected candidate, changed address, changed occurrence, or aggregate-byte overflow makes the whole publication infrastructure-indeterminate. The Activity never converts one failure or null response into candidate absence, and the ingress does not invoke the matcher on a partial vector. Retries query the same barrier-held active set.

### Publication, reservation, and target settlement

The canonical typed-tuple encoding of the complete address is SHA-256 hashed into `bpmn-correlation-sha256:<digest>`. The public client starts that Workflow id with `REJECT_DUPLICATE` when it is absent and otherwise validates an unconditional exact-address/configuration echo Query; an already-existing divergent or failed Workflow is infrastructure failure. No Update-With-Start, Workflow-id reuse, definition registry, or Product 2 row participates. This lets a valid definition address with no Process candidates still produce semantic `rejectedNoMatch` rather than address-unknown.

The public client then sends one content-bound `bpmn-publish-correlated-message` Signal and polls a private identity-bound status/result Query. Signal handling validates and coalesces exact content but only the ingress main loop assigns ordinals, runs Activities, invokes the pure matcher, and records final results. The main loop settles one publication before matching the next, so Signal callback order cannot itself choose a BPMN winner.

After complete fanout, `noMatch` or `ambiguous` records the matching semantic result and releases the barrier without touching a Process. `unique` records the exact selected candidate as the sole in-flight reservation and keeps the barrier. The target-delivery Activity uses the existing retained-Update-first Process resolver with a new content-bound correlated-delivery stimulus. It may deliver only to that Process Workflow and must recover or retry the same target after response loss. A committed target result removes the exact active locator, records the global result, and releases the barrier. A target semantic rejection records `rejectedTarget`, never rematches, quarantines the inconsistent locator, and makes later publications fail infrastructure preflight until the inconsistency is repaired. `processClosed`, `processUnknown`, malformed recovery, or a target transport failure is infrastructure-indeterminate and likewise cannot be recast as no-match, rejection, or permission to retarget.

An Activity has a five-second start-to-close timeout and three attempts per resolver cycle. Exhaustion leaves the command, ordinal, barrier, and any selected target pending; it produces no semantic result. After a deterministic one-second host backoff, the ingress resumes the same phase. At a stable point with no Activity scheduled it may Continue-As-New while carrying that in-flight state, so persistent infrastructure failure blocks later publication rather than manufacturing uniqueness. A replay or Worker replacement must reproduce the exact active-set digest, phase, ordinal, selected target, and result without a network or platform read inside Workflow code.

### Exact capacity and continuation contract

The new protocol owner defines and checks these production ceilings before a value crosses its boundary: 128 active-plus-pending candidate transactions and 64 KiB canonical bytes for that combined set; one in-flight publication; 64 queued publication Signals and 256 KiB for their canonical bytes; 64 KiB for each Activity request or result; 512 retained publication results and 96 KiB for their canonical bytes; 192 KiB for any status, result, or candidate-fanout Query response; 448 KiB for the complete correlation-ingress Continue-As-New argument aggregate; and 128 ingress Runs. The existing 128 KiB command and 20 KiB binding/value ceilings still apply. Exact-fit and one-over tests cover every count and byte bound. Candidate registration capacity fails before Process commit; publication queue or result capacity fails before ordinal assignment; query and target capacity after ordinal assignment remains infrastructure-indeterminate on that same ordinal and target.

Continue-As-New carries the complete address, next ordinal, active and pending registration records, queued commands, in-flight phase and selected target, quarantine state, retained results, and exact capacity configuration. It never resets an ordinal, forgets an accepted command id, reopens a finalized registration, or clears a selected target. The Process Workflow carries a staged registration transaction and correlated target result through its existing continuation envelope and cannot roll over between local semantic commit and registration finalization. The ingress never continues while an Activity is scheduled, but it may continue between failed resolver cycles with the unresolved phase intact.

The smallest executable refinement witness starts two Process Workflows, drives both through the first direct payload catch with different keys, replaces the Process Worker and correlation-ingress Worker, publishes one matching global Message, and observes only the selected Process at `ReviewSettlement`. It also proves zero and ambiguous rejection; two equal-local-id definitions isolated by source digest; one failed candidate Query that cannot create false uniqueness; registration stalled across a publication; exact candidate and result capacity; duplicate and conflicting command recovery; two concurrent publications with explicit ordinals and one settlement; target-response loss with same-target recovery and no rematch; forced continuation of both Workflow kinds in pending and settled states; complete history replay; and explicit test-owned cleanup of every Process and ingress Workflow. Production retirement of an idle definition ingress remains excluded.

## Evidence strategy

| Claim | Independent evidence |
|---|---|
| Normative and source account | BPMN 2.0.2 Clause 8.4.2, Clause 9, Tables 8.31–8.35, 9.1, 9.10, and 10.1, plus exact CMOF/XSD anchors |
| Expression and value subset | Independent exact decoders in Lean and TypeScript with whitespace, language, identity, type, empty, and normalization controls |
| Checked graph and lowering | Source fixtures and independently authored expected checked/IL artifacts, old-profile refusals, complete reference/cardinality mutations, and official XSD validation |
| Per-instance semantics | Lean transition/evaluator bridge and TypeScript transition tests for candidate projection, exact delivery, no-write, withdrawal, stale refusal, and preservation |
| Global matching | Independently written Lean and TypeScript finite matchers with full-definition address isolation, zero, unique, duplicate, order-permutation, and lexical-first mutation cases |
| Cross-instance behavior | New closed engine-population scenario contract with answer-free unique, zero, and ambiguous schedules; no existing single-instance scenario shape is widened |
| CIB relationship | `CIB-LIM-0002`, its schema-valid phase-zero fixture, public-service ambiguity/criterion probe, and pinned source inspection; no CIB target verdict |
| Durable refinement | Real-service definition-addressed ingress, staged prepare/finalize registration, scan barrier, all-or-infrastructure exact Query Activity, same-target delivery Activity/result recovery, explicit capacity, concurrent ordering, quarantine/no-rematch, Worker replacement, pending and settled continuation, history, replay, and cleanup |
| Whole-model reach | One credible project-owned settlement-confirmation model, exact pipeline binding, generated corpus map, canonical capability row, and Product 2 About-page disclosure |

Required mutations select the first candidate, compare names instead of ids, drop source digest/profile/overlay/Process identity from the global address, compare locale/case/normalized strings, extract a Property name instead of the resolved id, accept an empty or null key, finalize registration before the Process candidate Query is current, scan while a registration is pending, omit one locator, treat one failed or null Query as absence, treat ambiguity as broadcast, rematch after target rejection or indeterminate delivery, deduplicate different address or payload content, allocate another ordinal on retry, reset an ordinal or target across continuation, let a direct profile publish the correlated interaction, omit the correlated operation from either internal-commutation census, omit its Process-variable read or candidate-publication atom, or write the follow-up payload into Process scope.

## Runtime-only inventory and layer ownership

| Construct | Derivation and owner | Public projection | Lifecycle invariant |
|---|---|---|---|
| Correlated candidate fact | Pure projection from one correlated wait, its immutable complete address, and current Process Property | Adapter-private exact per-Process candidate Query; no Event History or platform row | Present exactly while the committed correlated wait and complete non-empty key are current |
| Registration transaction | Temporal ingress record derived from one staged candidate fact and private Process locator | Never a semantic observation or matching authority | Pending blocks scans; active only after the Process Query is current; completion of the opening command implies active registration |
| Scan barrier and active locator set | Temporal ingress snapshot over every finalized registration for one exact address | Private status only | No pending registration enters or leaves the vector; every active locator must return its exact candidate or the publication remains infrastructure-indeterminate |
| Ingress ordinal | Monotone value assigned once by the durable correlation ingress after result-ledger capacity passes | Returned with every semantic global result and exposed on an established pending status | Orders publications explicitly; never reused, reassigned on retry, or derived from Workflow/Run identity |
| In-flight routed delivery | Durable host record binding publication content, vector digest, selected target, phase, and pending result | Recoverable private command status only | Retried only to the same target; never rematched; carried through continuation |
| Quarantined locator | Fail-closed host record for a target that contradicted the exact queried candidate | Infrastructure status only | Excluded from semantic matching by blocking the complete address, never by silently dropping one candidate |

The BPMN/profile layer owns source shape, path language, key domain, complete global address, matching equality, and exact-cardinality refusal. Lean is the formal authority for the finite matcher and per-instance transition; the TypeScript core independently realizes that account. Temporal owns registration completeness, snapshot linearization, explicit ingress order, query and target Activities, delivery, result recovery, quarantine, capacity, and continuation without defining a BPMN winner. Product 2 consumes the resulting engine command and observations but owns none of their selection facts.

## Versioning consequences

This is a pre-release additive profile and transition family. Existing direct Message artifacts stay byte-identical. New closed arms are required for the correlated checked node, Semantic Process operation, per-target delivery, global interaction, complete definition address, global command/result, candidate query, host registration transaction, and engine-population scenario; no optional field or default widens an old semantic arm. Product 1 gains new definition-correlation capability and publication operations without adding a locator field to an existing Process command. Durable Workflow history gains new correlation-ingress and Process-registration patches before deployment under the existing pre-release replay policy; no compatibility reader accepts a history created before those required fields.

The `what-binds` inventory requires at least [contract schema coverage](../../scripts/contract-schema-coverage.test.ts), [execution-publication contract coverage](../../scripts/execution-publication-contract-coverage.test.ts), [internal commutation census](../../scripts/internal-commutation-census.test.ts), [runtime collection-removal completeness](../../scripts/runtime-collection-removal-completeness.test.ts), [canonical ordering](../../scripts/canonical-ordering.test.ts), [experiment union coverage](../../scripts/lean-import-boundaries.test.ts), [Lean source contracts](../../scripts/lean-source-contracts.test.ts), [source hygiene](../../scripts/source-hygiene.test.ts), [requirement-ledger consistency](../../scripts/requirement-ledger-consistency.test.ts), [model-corpus policy](../../scripts/bpmn-corpus-policy.test.ts), [Temporal package boundaries](../../scripts/temporal-package-boundary.test.ts), [Workflow semantic authority](../../scripts/workflow-occurrence-semantic-authority.test.ts), [test selection coverage](../../scripts/test-selection-coverage.test.ts), [semantic review packets](../../scripts/semantic-review-packet.test.ts), and [document reviewability](../../scripts/document-reviewability.test.ts).

The source owners the implementation grows include [the public semantic contract](../../packages/semantic-core/src/contract.ts), [the checked graph contract](../../packages/semantic-core/src/checked-process-contract.ts), [the Semantic Process contract](../../packages/semantic-core/src/semantic-process-contract.ts), [source compilation dispatch](../../packages/bpmn-source/src/compilation-dispatch.ts), [Semantic Process lowering](../../packages/bpmn-source/src/semantic-process-lowering.ts), [semantic runtime dispatch](../../packages/semantic-core/src/semantic-process-runtime.ts), [scenario projection](../../packages/semantic-core/src/scenario.ts), [the Lean Semantic Process contract](../../BpmnSemantics/SemanticProcessContract.lean), [Lean profile admission](../../BpmnSemantics/SemanticProcess/ProfileAdmission.lean), [Lean transition dispatch](../../BpmnSemantics/SemanticProcess/Transition.lean), the [internal-commutation account](../INTERNAL-COMMUTATION-PROPOSAL.md#complete-operation-family-census) and both exhaustive census implementations, Product 1's [engine API](../../packages/engine-api/README.md), every Temporal package routed by the [adapter source map](../../packages/temporal-adapter/SOURCE-MAP.md), [Process Workflow command ingress](../../packages/temporal-adapter/workflow/src/workflow-command-ingress.ts), [Process Workflow implementation](../../packages/temporal-adapter/workflow/src/workflow-implementation.ts), [Process continuation](../../packages/temporal-adapter/protocol/src/workflow-continuation.ts), and [Worker runtime composition](../../packages/temporal-adapter/worker/src/external-temporal-runtime.ts).

### Owners this implementation grows

The 800-nonblank-line soft target is the extraction threshold and 1,200 lines is the hard ceiling. These headroom figures are mechanically rechecked. New correlation-specific source, matcher, Lean relation/law, engine-population scenario, Temporal ingress, and client files must be registered in their package source maps rather than accumulated in dispatch owners.

| Owner | Current headroom | Structural condition |
|---|---:|---|
| [Lean ProfileAdmission](../../BpmnSemantics/SemanticProcess/ProfileAdmission.lean) | 20 | extract the profile-family predicate before adding this profile because the complete arm cannot safely fit the measured margin |
| [Lean SemanticProcessContract](../../BpmnSemantics/SemanticProcessContract.lean) | 123 | add only closed contract arms; extract correlation support types first if the edit would cross 800 |
| [TypeScript semantic runtime dispatch](../../packages/semantic-core/src/semantic-process-runtime.ts) | 165 | add dispatch only; correlation behavior belongs in a new family owner |
| [TypeScript lowering](../../packages/bpmn-source/src/semantic-process-lowering.ts) | 166 | add dispatch and construction only; source correlation validation belongs in a new owner |
| [TypeScript scenario projection](../../packages/semantic-core/src/scenario.ts) | 213 | add the correlated interaction projection only; engine-population execution belongs in a new owner |
| [TypeScript Semantic Process contract](../../packages/semantic-core/src/semantic-process-contract.ts) | 236 | add one operation arm and referenced correlation contract; extract first if the edit would cross 800 |
| [TypeScript public contract](../../packages/semantic-core/src/contract.ts) | 363 | add closed public arms without changing existing direct Message shapes |
| [Workflow command ingress](../../packages/temporal-adapter/workflow/src/workflow-command-ingress.ts) | 403 | route target delivery only; global correlation ingress belongs in new Workflow owners |
| [Lean Transition](../../BpmnSemantics/SemanticProcess/Transition.lean) | 343 | add one dispatcher constructor; matcher and laws belong in new modules |
| [TypeScript checked graph contract](../../packages/semantic-core/src/checked-process-contract.ts) | 457 | add one correlated catch arm and referenced correlation contract |
| [TypeScript compilation dispatch](../../packages/bpmn-source/src/compilation-dispatch.ts) | 496 | dispatch to a new exact source reader; do not place validation logic here |
| [TypeScript internal-commutation census](../../packages/semantic-core/src/internal-commutation-census.ts) | 671 | add the exact ordinary-wait classification only; footprint logic belongs in the correlated family owner |
| [Lean internal-commutation census](../../BpmnSemantics/SemanticProcess/InternalCommutationCensus.lean) | 668 | add the matching exhaustive constructor classification only |
| [Engine API index](../../packages/engine-api/src/index.ts) | 673 | export new bounded definition-correlation and publication owners only |
| [Temporal protocol index](../../packages/temporal-adapter/protocol/src/index.ts) | 775 | export one new bounded protocol owner only |
| [Temporal client index](../../packages/temporal-adapter/client/src/index.ts) | 793 | export one new bounded client owner only |
| [Temporal Workflow index](../../packages/temporal-adapter/workflow/src/index.ts) | 765 | export the new ingress Workflow and Process-candidate Query owner only |
| [Temporal Worker index](../../packages/temporal-adapter/worker/src/index.ts) | 796 | export one bounded correlation-Activity owner only |
| [Temporal Worker runtime](../../packages/temporal-adapter/worker/src/external-temporal-runtime.ts) | 621 | compose the private WorkflowClient-backed Activities; Activity logic belongs in the new owner |
| [Process continuation](../../packages/temporal-adapter/protocol/src/workflow-continuation.ts) | 276 | carry the staged registration and correlated result inside the existing envelope; extract if the edit would cross 800 |
| [Process Workflow implementation](../../packages/temporal-adapter/workflow/src/workflow-implementation.ts) | 220 | call the new registration and target-delivery owners only; no correlation algorithm belongs here |

No size exception is requested. New source files own the correlation source reader, pure matcher, per-instance transition, population scenario, definition-correlation API, public publication API, protocol/codec/capacity contract, client, ingress Workflow, Process registration/query adapter, Worker Activities, and real-service witness. Same-change owners are this capsule, the [requirement ledger](../BPMN-REQUIREMENT-LEDGER.md), [Semantic Process IL specification](../SEMANTIC-PROCESS-IL-SPEC.md), the [internal-commutation proposal](../INTERNAL-COMMUTATION-PROPOSAL.md), applicable detail maps routed by [`implementation-status-router`](../IMPLEMENTATION-MAP.md), the engine API README, semantic-core and Temporal package source maps, Lean module graph, scenario/profile/corpus registries, generated corpus map, canonical capability catalog, Product 2 About-page disclosure, capsule cost ledger, and [PLAN](../PLAN.md).

## Epistemic closure and reopen conditions

Established before implementation: the normative key/context account and exact machine-readable shape; direct payload extraction and Process-Property writing; direct Message subscription identity/lifetime; per-instance payload delivery and Temporal Signal recovery; CIB's modeled-correlation limitation; the SDK boundary requiring client-backed Activities for cross-Workflow Queries and Updates; and feasibility of a durable engine-owned, query-validated ingress without Event History or platform authority.

Not established: source admission, checked/IL representation, exact path decoders, finite matcher proofs, cross-instance harness, adapter-private candidate Query, durable registration completeness, barrier-linearized fanout, global command recovery, capacity fit, or live Temporal refinement. Those remain executable obligations.

The principal common-mode risk is treating a durable directory as the semantic database. The design forbids that: finalized records provide bounded discovery only, the scan barrier and completion-gated registration establish a stable complete set, every active entry must return its exact current Process fact, any discrepancy blocks the whole address, the pure matcher decides exact cardinality, and target delivery revalidates. The second risk is hidden concurrency ordering; the durable ingress ordinal and settle-before-next rule make it an explicit input.

The nearest unsupported claim is correlation whose first Message initializes hidden key state without a Process `CorrelationSubscription`, followed by mutable active context, composite keys, or another Message/Event locus. None is implied by this single-property context-backed slice.

Reopen before admitting another key/property/expression/value kind, an active context update or independent candidate-withdrawal path, uninitialized wildcard matching, another Message type or correlated locus, instantiation, broadcast, buffering, Message Flow execution, Product 2 routing state, a directory index as authority, a retry that can retarget, idle-ingress retirement, or a production partitioning scheme that cannot preserve the same pure match and explicit order.

## Closure cost

No closure cost is claimed at proposal time. At closure, [`capsule-cost.ts`](../../scripts/capsule-cost.ts) must measure one immutable range and compare it with the Message payload catch increment for source/data breadth and the Activity boundary Message increment for durable Message scheduling. The correlation ingress is reported separately inside the same capsule range rather than hidden as generic infrastructure.

## Stage boundary

The first green source/checked/IL plus Lean/core finite-matcher, per-instance transition, complete-address contract, and internal-commutation census/footprint target is a mandatory semantic checkpoint. No Temporal correlation-ingress, engine API/global client, Product 2 binding, retained corpus registration, or closure status may cross that checkpoint before its independent review is approved.

Closure requires the unique, zero, ambiguous, cross-definition, pending-registration, failed-fanout, exact-capacity, concurrent, stale/quarantine, same-target recovery, continuation, replay, and mutation evidence named above; complete applicable gates on a clean committed target; reflection and cost records; and independent closure review. The proposal graduates to `-SPEC` only after those owners agree.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `01c7c4f7` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
