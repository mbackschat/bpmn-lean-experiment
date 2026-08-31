# Message key correlation proposal

## Status

Lifecycle: draft
Review: pending

## Question and bounded outcome

What is the smallest standards-only mechanism that routes one payload-bearing Message to exactly one already-waiting Process instance by a BPMN `CorrelationKey`, while retaining direct subscription addressing unchanged and refusing zero or ambiguous matches without letting the host choose a winner?

This capsule proposes one context-backed, single-property key for one non-instantiating Intermediate Catch Message Event. One earlier directly addressed payload Message initializes a non-empty string in one Process `Property`; the later Message extracts the same kind of value from its payload, compares it with the current Property value through one `CorrelationSubscription`, and advances exactly one matching Process instance. The first Message reuses the implemented [Message payload catch mediation specification](MESSAGE-PAYLOAD-CATCH-MEDIATION-SPEC.md). The second reuses its scalar payload domain for correlation only and declares no catch `DataOutput`, so its payload is not written into Process scope.

The new requirement is `BPMN-MESSAGE-CORRELATION-01`. Its disposition remains `unsupported` until this capsule is implemented and closure-reviewed. Existing `BPMN-MESSAGE-CATCH-01`, `BPMN-MESSAGE-PAYLOAD-CATCH-01`, `BPMN-BOUNDARY-MESSAGE-01`, and `BPMN-RECEIVE-TASK-01` meanings remain unchanged.

## Normative account and selected interpretation

BPMN 2.0.2 Clause 8.4.2 defines correlation as runtime association of a Message with an ongoing Conversation between particular Process instances. In key-based correlation, the first Message populates a Conversation's `CorrelationKey` from payload `CorrelationPropertyRetrievalExpression`s; a later Message derives the same key and MUST match the initialized Conversation key. The clause explicitly applies every Send/Receive Task statement to Message catch/throw Events as well.

Context-based correlation is layered on key-based correlation. A Process `CorrelationSubscription` binds every `CorrelationProperty` of one key to a `FormalExpression` over Process context, and the current Process values dynamically determine the matching criterion. Clause 9 and Table 9.1 make Conversation information part of a Process's definitional Collaboration, while Table 10.1 connects the Process to that Collaboration and owns its correlation subscriptions.

The machine-readable anchors are `Collaboration-correlationKeys`, `ConversationNode-correlationKeys`, `CorrelationKey-correlationPropertyRef`, `CorrelationProperty-correlationPropertyRetrievalExpression`, `CorrelationPropertyRetrievalExpression-messagePath`, `CorrelationPropertyRetrievalExpression-messageRef`, `Process-correlationSubscriptions`, `CorrelationSubscription-correlationKeyRef`, `CorrelationSubscription-correlationPropertyBinding`, `CorrelationPropertyBinding-dataPath`, `CorrelationPropertyBinding-correlationPropertyRef`, and `Process-definitionalCollaborationRef`, together with their `tCorrelation*` and `tProcess` XSD declarations.

The standard leaves expression language and value equality to the selected profile. This capsule selects one deliberately tiny expression language and one scalar key domain rather than silently importing XPath, JUEL, JSONPath, Java equality, or CIB API criteria. It also selects fail-closed exact-cardinality routing: exactly one current candidate commits; zero or more than one reject the publication with no Process-state change. The standard expects a key to identify a distinct Conversation and elsewhere states that key-based correlation has at most one active receive for a key, but it does not license this engine to arbitrate when admitted runtime facts contradict that expectation.

## Required, optional, and excluded scope

**Required source:** one private executable Process; one definitional Collaboration with exactly one external Participant and one Process-owning Participant; exactly two Message Flows from the external Participant to two sequential Intermediate Catch Message Events; one Conversation containing both Participants and both Message Flows; one Conversation-owned `CorrelationKey`; one root `CorrelationProperty`; one Process `CorrelationSubscription`; one Process `Property`; one root scalar `ItemDefinition`; one root Message, Interface, and Operation chain reused by both catches; and the control flow `None Start -> directly addressed payload catch -> correlated payload catch -> User Task -> None End`.

**Required correlation shape:** the key contains exactly the one CorrelationProperty; that property has exactly one retrieval expression for the reused Message; the Process subscription references that key and has exactly one binding referencing the same property; the retrieval `messagePath` and binding `dataPath` use the exact language URI and syntax below; the first catch's direct output writes the payload into the bound Process Property; the second catch has no `DataOutput`, `OutputSet`, or data association.

**Optional:** human-readable `name` values only. They carry no identity or matching authority.

**Excluded:** a second key, property, binding, retrieval expression, Message type, Conversation, or correlated catch; composite, null, empty, Boolean, integer, list, structured, or collection keys; wildcard or uninitialized matching; a Process-context change while the correlated wait is active; payload flow out of the second catch; optional or while-executing outputs; Message Start, Receive Task, boundary, throw, or End correlation; Message Flow transport execution; Collaboration or Participant execution; modeled send; buffering; broadcast; predicate correlation; multiple matches; correlation to Process definitions; multi-tenant, version, business-key, or local-variable selection; CIB API correlation criteria; and Product 2 routing or persistence.

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

The checked graph adds a distinct correlated Message catch node carrying the resolved channel, key identity, correlation-property identity, payload selector, and Process-property selector. The Semantic Process program adds a distinct correlated wait operation. Neither is an optional field on the existing direct Message arms: old checked graphs, programs, direct stimuli, enabled interactions, and their serialized bytes remain unchanged.

The correlated wait contributes to the existing generic open-Message wait projection, but it does not publish a direct `deliverMessage` or `deliverPayloadMessage` interaction. It publishes a new global correlated-payload interaction identified by channel and CorrelationKey, with no target Process or subscription supplied by the caller. A separate exact candidate query returns the current engine-owned locator and match facts needed by the router: semantic Process-instance identity, subscription occurrence identity, channel, key id, property id, and current non-empty string key. Those are derived only from the immutable program and committed runtime state.

## Global command and runtime contract

The public global command is conceptually:

```ts
type PublishCorrelatedMessage = Readonly<{
  commandId: string;
  channel: MessageChannel;
  payload: Readonly<{ kind: "string"; value: string }>;
}>;
```

The caller supplies no Process-instance or subscription identity. A pure matcher extracts the payload key, filters current candidate facts by exact channel, CorrelationKey identity, complete key shape, and exact value equality, then returns `noMatch`, `unique(candidate)`, or `ambiguous`. Candidate order is irrelevant, and no canonical sort becomes a tie-breaker.

`noMatch` and `ambiguous` are typed `rejected` command results and preserve every Process instance exactly. `unique` permits a content-bound target delivery carrying the original command id, payload, selected subscription occurrence, and explicit durable ingress ordinal. The target Process independently rechecks the current operation, occurrence, channel, key identity, payload extraction, Property binding, and equality before it atomically withdraws the subscription and adds the outgoing token. A stale or changed target rejects; the router MUST NOT rematch the same command to another candidate.

The committed global result identifies the selected semantic Process instance and subscription occurrence. It exposes no Temporal Workflow, Run, Event History, Search Attribute, directory row, or platform identity. A retry with the same command id and byte-identical content returns the retained result; the same id with different channel or payload rejects as a content collision.

## Stable semantic rules and separating witnesses

| Rule | Statement | Required evidence |
|---|---|---|
| `MCORR-SOURCE-01` | The definitional Collaboration, Conversation, both Message Flows, key, property, subscription, binding, Message, and Process Property form the exact resolved identity graph above | Official-XSD validation; source and checked-graph positives; one mutation for every reference, containment, cardinality, and endpoint |
| `MCORR-EXTRACT-01` | The exact `payload` path extracts one non-empty string from the Message and no other expression or value kind is admitted | Independent TypeScript and Lean path decoders; boundary-space, alternate-language, empty, null, kind, and normalization negatives |
| `MCORR-CONTEXT-01` | The exact `property:<id>` path reads the current value of the resolved Process Property, which was initialized by the first direct payload Message | A two-stage instance witness; name-versus-id and wrong-Property mutations; a law that candidate projection follows the current committed binding |
| `MCORR-MATCH-01` | A candidate matches only when channel, key identity, complete shape, and exact extracted value all agree | Pure finite matcher in Lean and TypeScript; channel, key-id, value, and partial-key negatives |
| `MCORR-UNIQUE-01` | Exactly one match selects that candidate; zero and multiple matches reject without changing any Process | Two-instance unique, zero-match, and duplicate-key schedules; permutation invariance; wrong lexical-first mutation |
| `MCORR-DELIVER-01` | The selected Process revalidates and atomically consumes only the selected correlated subscription, writes no payload value, and follows its outgoing flow | Per-instance transition relation and evaluator bridge; non-target preservation; stale and changed-value refusal |
| `MCORR-DIRECT-01` | Existing direct-address profiles neither publish the correlated interaction nor accept the global correlated command | Byte-identical old artifacts and direct-profile negative commands across source, Lean, core, and Temporal |
| `MCORR-ORDER-01` | Durable ingress order is an explicit input; one publication settles before the next is matched, and a stale selected target is never silently rematched | Concurrent-publication witness with distinct ingress ordinals, target-result deduplication, Worker replacement, and replay |

The primary whole-model witness is `correlated-settlement-confirmation`. Two instances of the same model receive different settlement references through their first directly addressed payload subscriptions. One later global publication carries the first reference and advances only that instance to `ReviewSettlement`; the other remains at its correlated wait. A zero-match schedule leaves both waiting. An ambiguous schedule initializes both with the same reference and requires both to remain waiting.

The nearest realistic wrong implementation filters by Message channel and takes the lexically first Process identity. It passes every singleton case and fails only the duplicate-key schedule, so that schedule is mandatory rather than an optional robustness check.

## Lean assurance lane

The lane is declared **proved** for the bounded per-instance transition and finite-population matcher. The pure matcher theorems cover permutation invariance, exact no-match, unique-match soundness and completeness, ambiguous preservation, and the non-law that lexical candidate order may select a winner. The per-instance theorems cover exact path evaluation, candidate-projection correctness, target revalidation, subscription withdrawal finality, no payload write, outgoing-token production, refusal preservation, runtime-state well-formedness, and unchanged non-target instances.

The evaluator-soundness bridge remains a bridge rather than a separate evidence lane. The global proof ranges over a finite list of published candidate facts and Process states; it does not claim discovery completeness for Temporal. Discovery completeness is the distinct host-refinement obligation below.

## CIB Seven relationship boundary

`CIB-LIM-0002` is the applicable classified relationship. Pinned CIB Seven `2.2.0` parses the modeled correlation elements through its Model API but does not execute their retrieval or Process-context bindings; only separate public API criteria select a waiting instance. The phase-zero probe is a negative calibration witness, not a CIB semantic target, and no CIB result enters this capsule's agreement matrix.

## Temporal hosting and refinement preflight

The current adapter addresses one known Process Workflow and can Query its waits; it has no engine-owned global correlation directory. Product 2's Process registrations are platform state and cannot select BPMN meaning. Temporal Event History and Search Attributes are likewise excluded as semantic authorities.

The required new host capability is an engine-owned durable correlation ingress. It serializes locator activation, global publications, and retained results, assigns each accepted publication a monotone ingress ordinal, and invokes the pure exact-cardinality matcher over current candidate-query facts. The ingress is discovery and ordering infrastructure only: it cannot manufacture a candidate, compare by a different value rule, or choose among ambiguous candidates.

Registration is completion-gated. A Process command that reaches a correlated wait stages its next semantic state, durably registers the candidate locator, receives the directory acknowledgement, then publishes and completes that state. A publication ordered before this completion may legitimately see no candidate; once the Process command completes, discovery cannot omit its live candidate. Withdrawal may lag because a stale directory entry is safe only when the ingress exact-Queries every discovered target and filters entries whose current published candidate fact is absent or changed before matching.

The ingress settles one publication before matching the next. It sends the uniquely selected target a content-bound delivery carrying the ingress ordinal and waits for the target's retained semantic result. Two concurrent publications therefore become explicit ordered inputs; the first committed delivery removes the subscription before the second match, rather than allowing Temporal callback order to choose a hidden winner. If cancellation or another command closes the selected wait after matching, the target rejects and the ingress returns that rejection without retargeting.

There is no Activity, timer, or external effect. Process cancellation and ordinary completion withdraw the candidate logically; stale discovery records remain harmless because exact target Queries filter them. Command deduplication binds command id, channel, payload, and ingress ordinal; a target result ledger makes delivery retry-safe. The directory carries its next ordinal, active locator superset, in-flight delivery, and retained bounded results across Continue-As-New. The Process Workflow carries its pending registration and correlated command result through its existing continuation state. Replay must reproduce locator order, match decision, target, and result without network or platform reads inside Workflow code.

The smallest executable refinement witness starts two Process Workflows, drives both through the first direct payload catch with different keys, replaces the Process Worker and correlation-ingress Worker, publishes one matching global Message, and observes only the selected Process at `ReviewSettlement`. It then proves zero and ambiguous rejection, duplicate command recovery, two concurrent publications with explicit ordinals and one settlement, a stale-target no-rematch case, forced continuation of both Workflow kinds, complete history replay, and cleanup.

## Evidence strategy

| Claim | Independent evidence |
|---|---|
| Normative and source account | BPMN 2.0.2 Clause 8.4.2, Clause 9, Tables 8.31–8.35, 9.1, 9.10, and 10.1, plus exact CMOF/XSD anchors |
| Expression and value subset | Independent exact decoders in Lean and TypeScript with whitespace, language, identity, type, empty, and normalization controls |
| Checked graph and lowering | Source fixtures and independently authored expected checked/IL artifacts, old-profile refusals, complete reference/cardinality mutations, and official XSD validation |
| Per-instance semantics | Lean transition/evaluator bridge and TypeScript transition tests for candidate projection, exact delivery, no-write, withdrawal, stale refusal, and preservation |
| Global matching | Independently written Lean and TypeScript finite matchers with zero, unique, duplicate, order-permutation, and lexical-first mutation cases |
| Cross-instance behavior | New closed engine-population scenario contract with answer-free unique, zero, and ambiguous schedules; no existing single-instance scenario shape is widened |
| CIB relationship | `CIB-LIM-0002`, its schema-valid phase-zero fixture, public-service ambiguity/criterion probe, and pinned source inspection; no CIB target verdict |
| Durable refinement | Real-service durable ingress, registration completion gate, exact target Queries, content-bound delivery/result recovery, concurrent ordering, stale no-rematch, Worker replacement, continuation, history, replay, and cleanup |
| Whole-model reach | One credible project-owned settlement-confirmation model, exact pipeline binding, generated corpus map, canonical capability row, and Product 2 About-page disclosure |

Required mutations select the first candidate, compare names instead of ids, compare locale/case/normalized strings, extract a Property name instead of the resolved id, accept an empty or null key, omit one locator, trust a stale locator without Query, treat ambiguity as broadcast, rematch after stale rejection, deduplicate different payloads, reverse two ingress ordinals, let a direct profile publish the correlated interaction, or write the follow-up payload into Process scope.

## Runtime-only inventory and layer ownership

| Construct | Derivation and owner | Public projection | Lifecycle invariant |
|---|---|---|---|
| Correlated candidate fact | Pure projection from one correlated wait, its immutable operation, and current Process Property | Exact per-Process candidate Query; no Event History or platform row | Present exactly while the committed correlated wait and complete non-empty key are current |
| Durable locator | Temporal ingress discovery record derived from the published candidate identity | Never a semantic observation or matching authority | May overinclude stale entries; MUST NOT omit a candidate after its opening command completes |
| Ingress ordinal | Monotone value assigned by the durable correlation ingress | Returned with the global command result and carried to target delivery | Orders publications explicitly; never reused or derived from Workflow/Run identity |
| In-flight routed delivery | Durable host record binding publication content, selected target, and pending result | Recoverable command status only | Retried only to the same target; never rematched |

The BPMN/profile layer owns source shape, path language, key domain, matching equality, and exact-cardinality refusal. Lean is the formal authority for the finite matcher and per-instance transition; the TypeScript core independently realizes that account. Temporal owns durable discovery, explicit ingress order, delivery, result recovery, and continuation without defining a BPMN winner. Product 2 consumes the resulting engine command and observations but owns none of their selection facts.

## Versioning consequences

This is a pre-release additive profile and transition family. Existing direct Message artifacts stay byte-identical. New closed arms are required for the correlated checked node, Semantic Process operation, per-target delivery, global interaction, global command/result, candidate query, and engine-population scenario; no optional field or default widens an old arm. Durable Workflow history gains new correlation-ingress and Process patches before deployment under the existing pre-release replay policy.

The `what-binds` inventory requires at least [contract schema coverage](../../scripts/contract-schema-coverage.test.ts), [execution-publication contract coverage](../../scripts/execution-publication-contract-coverage.test.ts), [internal commutation census](../../scripts/internal-commutation-census.test.ts), [runtime collection-removal completeness](../../scripts/runtime-collection-removal-completeness.test.ts), [canonical ordering](../../scripts/canonical-ordering.test.ts), [experiment union coverage](../../scripts/lean-import-boundaries.test.ts), [Lean source contracts](../../scripts/lean-source-contracts.test.ts), [source hygiene](../../scripts/source-hygiene.test.ts), [requirement-ledger consistency](../../scripts/requirement-ledger-consistency.test.ts), [model-corpus policy](../../scripts/bpmn-corpus-policy.test.ts), [Temporal package boundaries](../../scripts/temporal-package-boundary.test.ts), [Workflow semantic authority](../../scripts/workflow-occurrence-semantic-authority.test.ts), [test selection coverage](../../scripts/test-selection-coverage.test.ts), [semantic review packets](../../scripts/semantic-review-packet.test.ts), and [document reviewability](../../scripts/document-reviewability.test.ts).

The source owners the implementation grows include [the public semantic contract](../../packages/semantic-core/src/contract.ts), [the checked graph contract](../../packages/semantic-core/src/checked-process-contract.ts), [the Semantic Process contract](../../packages/semantic-core/src/semantic-process-contract.ts), [source compilation dispatch](../../packages/bpmn-source/src/compilation-dispatch.ts), [Semantic Process lowering](../../packages/bpmn-source/src/semantic-process-lowering.ts), [semantic runtime dispatch](../../packages/semantic-core/src/semantic-process-runtime.ts), [scenario projection](../../packages/semantic-core/src/scenario.ts), [the Lean Semantic Process contract](../../BpmnSemantics/SemanticProcessContract.lean), [Lean profile admission](../../BpmnSemantics/SemanticProcess/ProfileAdmission.lean), [Lean transition dispatch](../../BpmnSemantics/SemanticProcess/Transition.lean), and [Workflow command ingress](../../packages/temporal-adapter/workflow/src/workflow-command-ingress.ts).

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

No size exception is requested. Same-change owners are this capsule, the [requirement ledger](../BPMN-REQUIREMENT-LEDGER.md), [Semantic Process IL specification](../SEMANTIC-PROCESS-IL-SPEC.md), applicable detail maps routed by [`implementation-status-router`](../IMPLEMENTATION-MAP.md), contract and package source maps, scenario/profile/corpus registries, generated corpus map, canonical capability catalog, Product 2 About-page disclosure, capsule cost ledger, and [PLAN](../PLAN.md).

## Epistemic closure and reopen conditions

Established before implementation: the normative key/context account and exact machine-readable shape; direct payload extraction and Process-Property writing; direct Message subscription identity/lifetime; per-instance payload delivery and Temporal Signal recovery; CIB's modeled-correlation limitation; and feasibility of a durable engine-owned, query-validated ingress without Event History or platform authority.

Not established: source admission, checked/IL representation, exact path decoders, finite matcher proofs, cross-instance harness, public candidate query, durable registration completeness, global command recovery, or live Temporal refinement. Those remain executable obligations.

The principal common-mode risk is treating a durable directory as the semantic database. The design forbids that: directory rows are a discovery superset, every candidate is re-read from current published Process facts, the pure matcher decides exact cardinality, and target delivery revalidates. The second risk is hidden concurrency ordering; the durable ingress ordinal and settle-before-next rule make it an explicit input.

The nearest unsupported claim is correlation whose first Message initializes hidden key state without a Process `CorrelationSubscription`, followed by mutable active context, composite keys, or another Message/Event locus. None is implied by this single-property context-backed slice.

Reopen before admitting another key/property/expression/value kind, an active context update, uninitialized wildcard matching, another Message type or correlated locus, instantiation, broadcast, buffering, Message Flow execution, Product 2 routing state, a directory index as authority, a retry that can retarget, or a production partitioning scheme that cannot preserve the same pure match and explicit order.

## Closure cost

No closure cost is claimed at proposal time. At closure, [`capsule-cost.ts`](../../scripts/capsule-cost.ts) must measure one immutable range and compare it with the Message payload catch increment for source/data breadth and the Activity boundary Message increment for durable Message scheduling. The correlation ingress is reported separately inside the same capsule range rather than hidden as generic infrastructure.

## Stage boundary

The first green source/checked/IL plus Lean/core finite-matcher and per-instance-transition target is a mandatory semantic checkpoint. No Temporal correlation-ingress, public global client, Product 2 binding, retained corpus registration, or closure status may cross that checkpoint before its independent review is approved.

Closure requires the unique, zero, ambiguous, concurrent, stale, recovery, continuation, replay, and mutation evidence named above; complete applicable gates on a clean committed target; reflection and cost records; and independent closure review. The proposal graduates to `-SPEC` only after those owners agree.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `not-recorded` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
