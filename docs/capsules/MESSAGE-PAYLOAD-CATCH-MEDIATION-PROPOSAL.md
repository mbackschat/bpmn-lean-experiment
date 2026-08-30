# Message payload catch mediation proposal

## Status

Lifecycle: draft
Review: pending

## Question and bounded outcome

What is the smallest standards-only mechanism that lets one Intermediate Catch Message Event carry one delivered payload value into Process scope through a declared catch Data Association, without selecting `ItemDefinition` structure, expressions, correlation, multiple `EventDefinition`s, collections, or another Event host?

This capsule proposes one private executable Process containing a None Start Event, one Intermediate Catch Message Event, one User Task, and one None End Event, extending the closed [Intermediate Catch Message specification](INTERMEDIATE-CATCH-MESSAGE-SPEC.md)'s exact graph with one `ItemDefinition` root, one Event-owned `DataOutput`, one `OutputSet`, and one `DataOutputAssociation` writing into one Process-owned `Property`. The delivery command carries exactly one payload value; the association, not the `DataOutput` id and not the Message name, decides which Property receives it.

The reviewed requirement ID is `BPMN-MECH-EVENT-01`, whose disposition stays `unsupported`: this slice adds a payload proposition to one already-registered subscription profile and does not close the family. `BPMN-MESSAGE-CATCH-01` stays `supported` for its own payload-free slice, which this capsule does not reinterpret.

## Normative account and selected interpretation

Clause 10.5.1's Common Catch Event rules give the two-step account directly, and both steps are quoted here because the capsule's whole meaning is which of them the association owns.

The trigger fills the Event's own output: "For _catch_ **Events**: When the _trigger_ of the **Event** occurs (for example, the **Message** is received), the data is assigned automatically to the **Data Output** that corresponds to the EventDefinition that described that trigger."

The association then moves it into scope, from Table 10.82: "The dataOutputAssociation of a _catch_ **Event** is used to assign data from the **Event** to a data element that is in the scope of the **Event**."

Three further sentences of the same clause bound the slice. The pairing rule is positional — "The order of the EventDefinitions and the order of the **Data Inputs/Outputs** determine which **Data Input/Output** corresponds with which EventDefinition" — so admitting exactly one `EventDefinition` and exactly one `DataOutput` makes the correspondence unambiguous without selecting an ordering account. The typing rule is an equivalence — the `Data Output` "MUST have an ItemDefinition equivalent to the one defined by the **Message**" — which this profile satisfies by identity rather than by a structural equivalence relation it would otherwise have to define. And the absent-output rule is a no-write rather than an error: "if the **Data Output** is not present, the payload within the **Message** ... will not flow out of the **Event** and into the **Process**", which is exactly the closed payload-free profile and is why that profile keeps its meaning unchanged.

The machine-readable anchors are `CatchEvent-dataOutputs` (`DataOutput`, `upper="*" lower="0"`, composite), `CatchEvent-dataOutputAssociation` (`DataOutputAssociation`, `upper="*" lower="0"`, composite), `CatchEvent-outputSet` (`OutputSet`, `lower="0"`, at most one), `Message-itemRef` (`ItemDefinition [0..1]`), `ItemAwareElement-itemSubjectRef` (`ItemDefinition [0..1]`), and the `tItemDefinition` complex type, whose `structureRef`, `isCollection`, and `itemKind` attributes are all optional with `isCollection` defaulting to `false` and `itemKind` to `Information`.

**A catch Event owns its data interface directly, not through an `InputOutputSpecification`.** That is the exact structural difference from [the Activity data-output specification](ACTIVITY-DATA-OUTPUT-MEDIATION-SPEC.md), whose outputs hang off `Activity-ioSpecification`, and it is why this is a new source proposition rather than a second consumer of that reader. A reader that assumed an `ioSpecification` would reject every conforming catch Event.

**The standard does not say what happens when a delivery carries no payload against a model that declares a `DataOutput`.** Clause 10.5.1 governs the model, not the occurrence. That gap is operationalized below and recorded as an interpretation rather than presented as a normative consequence.

## Required, optional, and excluded

**Required:** one `ItemDefinition` root with `structureRef`, `itemKind`, and `isCollection` all absent; a `Message` whose `itemRef` resolves to it; one Intermediate Catch Event with one contained `MessageEventDefinition`, exactly one `dataOutput` whose `itemSubjectRef` resolves to that same `ItemDefinition`, exactly one `outputSet` whose `dataOutputRefs` is exactly that output, and exactly one `dataOutputAssociation` from that output to one Process-owned `Property`; one delivery command carrying exactly one payload value in the profile's scalar domain.

**Optional:** nothing. Every element above is required, and the `DataOutput` `name` is carried for presentation and never for resolution.

**Excluded:** `structureRef`, `itemKind="Physical"`, `isCollection="true"`, `dataState`, a second `DataOutput`, `OutputSet`, or `dataOutputAssociation`, a second `EventDefinition` or any Multiple Event, `parallelMultiple`, `transformation`, `assignment`, an `inputSet` of any kind, correlation of every form, expressions, payload on Message Start, Receive Task, boundary, throw, or End Events, and payload for Signal, Error, or Escalation triggers. Each remains a distinct proposition even where it would reuse this mechanism.

## Competing accounts and the account this proposal selects

The open decision is not where the value goes — the association settles that — but what an occurrence does when the delivery carries no payload while the subscription's Event declares a required `DataOutput`.

**Account P1 — refuse the delivery.** The subscription stays live, the Process stays waiting, no Property is written, and the command reports a semantic refusal with exact state preservation.

**Account P2 — trigger and write nothing.** The subscription is withdrawn, the token is produced, and Process scope is unchanged.

Unlike [the Activity data-output capsule](ACTIVITY-DATA-OUTPUT-MEDIATION-SPEC.md)'s two accounts, these are publicly discriminable at the approved observation boundary: after a payload-free delivery, P1 leaves the Message subscription in the projected wait set and P2 leaves the Process at the User Task. A witness therefore decides between them, and this capsule owes that witness rather than a forward-compatibility argument.

This proposal selects **Account P1**. The closed [Intermediate Catch Message specification](INTERMEDIATE-CATCH-MESSAGE-SPEC.md) already records that an omitted payload and an explicit `null` are not aliases; under P2 they would become aliases at the only boundary anyone can observe, because both would leave Process scope carrying no new binding on some models and a null on others depending only on the value domain. P1 also matches the command discipline both data capsules already carry, where a completion that does not make a declared required output available is refused rather than silently partial. P1's cost is that a payload-free publisher can never advance a payload-declaring model; that is the intended contract, and the model that wants the lenient behavior is the payload-free profile, which remains admissible and unchanged.

The common-mode risk this creates is recorded here rather than discovered later: P1 makes refusal the *only* observable difference between a malformed publisher and an absent one, so a host that dropped a payload in transit would look exactly like a publisher that never sent one. The Temporal preflight below turns that into a concrete obligation on command identity.

## Exact source and profile contract

The admitted document extends the closed catch-Message multiset by exactly four elements: one `ItemDefinition` root, one `dataOutput`, one `outputSet`, and one `dataOutputAssociation`. `Message-itemRef` and `DataOutput-itemSubjectRef` must resolve, by object identity in the parser graph and never by name, to that same `ItemDefinition`. `dataOutputAssociation/sourceRef` must resolve to the Event's own `DataOutput` and `targetRef` to the Process `Property`; the direction is the same as the Activity capsule's and the opposite of a data input's, so a reader that copied the input shape would run the write backwards.

The profile is registered as `bpmn-2.0.2-message-payload-catch-draft`. It lowers to one `payloadMessageCatchEvent` checked node and one `awaitPayloadMessage` operation, which is a new arm rather than an optional field on `awaitMessage`: the union stays closed and exhaustively matched, and the payload-free profile keeps a byte-identical Program.

The profile rejects an `ItemDefinition` carrying any of the three optional attributes, a `DataOutput` whose `itemSubjectRef` differs from the Message's `itemRef`, a second output, output set, or association, an `inputSet`, a `transformation`, an `assignment`, and every element the closed catch-Message profile already rejects.

`structureRef` is required absent rather than admitted and ignored. An admitted-and-ignored structure would let a model declare an external type this engine does not check, which is a claim about validation the capsule cannot support; requiring absence keeps the value domain a recorded profile decision instead of an unchecked model claim, and a later capsule can admit `structureRef` and narrow the domain from it without reinterpreting any model accepted here.

## Runtime, command, stable-state, and observation contract

Activation is unchanged: the Event arms one Message subscription when its incoming token arrives, exactly as the closed profile does. Nothing about the declared `DataOutput` affects arming, because a `DataOutput` constrains the trigger's effect and not the subscription.

`DeliverMessageStimulus` gains one field, `payload`, whose value is either one admitted scalar or physically absent. Absence is represented as `null` at the field and is not the same as the admitted `null` *value*, which is a delivered payload whose kind is null; the two are distinguished exactly as the closed profile requires and as [the Activity data-input specification](ACTIVITY-DATA-INPUT-MEDIATION-SPEC.md) already distinguishes an unbound source from a bound null.

An accepted delivery atomically assigns the payload to the Event's `DataOutput`, executes the association to bind the target Property in Process scope, withdraws the subscription, and adds one outgoing token. The assignment and the association are fused into one step for the same reason the Activity capsule fuses them: a catch Event has no open window between its trigger and its completion, so a materialized intermediate value would have no lifetime in which anything could read it, and writing then removing it would be dead state. The two-step normative account is preserved as the *order* of the two effects, which is what a later while-executing or Multiple-Event capsule needs, not as two committed states.

A delivery carrying no payload against this profile's subscription is refused with exact state preservation. A delivery whose payload is outside the profile's value domain is refused the same way.

The public observation change is confined to canonical `variables`: the target Property appears or changes value. No new observation field is added, and the projected wait set is unchanged.

## Stable semantic rules and separating witnesses

| Rule | Statement | Required evidence |
|---|---|---|
| `MPAYLOAD-DELIVER-01` | The trigger assigns the delivered payload to the Event's declared `DataOutput`; the channel decides which Event is triggered and the `DataOutput` decides nothing about addressing | Lean relation and evaluator-soundness bridge for the payload delivery step; a checked witness whose channel matches and whose payload differs from every id in the model |
| `MPAYLOAD-ROUTE-01` | The `dataOutputAssociation`, not the `DataOutput` id and not the Message name, decides which Process `Property` receives the value | A registered model whose `DataOutput`, `Message`, and target `Property` ids are pairwise distinct; a seeded mutation writing under the `DataOutput` id; a program-admission negative refusing a merged identity |
| `MPAYLOAD-ATOMIC-01` | Assignment, association, subscription withdrawal, and token production are one atomic transition, and the assignment is not separately committed | Lean disposal-and-write law; a core one-transition case; the runtime-collection-removal guard |
| `MPAYLOAD-REQUIRE-01` | A delivery carrying no payload against a payload-declaring subscription is refused with exact state preservation, and the subscription stays live | The Account P1 versus P2 separating witness at the public boundary; a checked refusal; a retained scenario |
| `MPAYLOAD-EQUIV-01` | Admission requires the `DataOutput`'s `itemSubjectRef` and the `Message`'s `itemRef` to resolve to the same `ItemDefinition` | Source mutations pointing them at two distinct `ItemDefinition` roots and at an unresolved one |

The decisive separating witness against the closed payload-free profile is the same graph with the four added elements: under the old profile the delivered Message produces a token and no binding, and under this one it produces a token and one Property binding. The two disagree in canonical `variables`, which is the approved public boundary.

The decisive separating witness inside this capsule is the Account P1 pair: two deliveries on one program that differ only in whether a payload is present, one of which continues to the User Task and one of which leaves the Message subscription live.

## Lean assurance lane

The lane is declared **proved** for the bounded transition family, matching both data capsules rather than weakening below them.

Required theorems cover payload assignment and association as one step; association-decided write with Process-binding preservation elsewhere; subscription withdrawal finality; refusal of an absent payload, an out-of-domain payload, a wrong channel, and a stale subscription with exact state preservation; runtime-state invariant preservation across the delivery transition; and the routed-versus-named non-law that fixes `MPAYLOAD-ROUTE-01` as a real discriminator rather than a coincidence of the registered ids.

## CIB Seven relationship boundary

No CIB relationship is selected. This is a vendor-neutral BPMN capsule whose account rests on Clause 10.5.1 alone, and no probe, profile rule, or retained CIB observation is required to complete it. A later correlation capsule will need one; this one does not, and adding a CIB extension merely to complete it is explicitly not required.

## Temporal hosting and refinement preflight

The durable ingress is the existing Signal-based Message delivery; the payload rides the Signal's existing argument, so the host gains no new mechanism, no new wait, no timer, and no new cancellation path. Committed state grows by one Process binding, which the existing 64 KiB budget already accounts for in the same way the Activity capsules' writes do.

One mapping is a real risk rather than a formality, and it is the reason this preflight exists. **The content-bound command identity must cover the payload.** Today's delivery identity is derived from the command id and the subscription; if the payload is outside that derivation, two deliveries that differ only in payload collapse onto one Update id, and the host would deduplicate a semantically distinct second delivery into the first. That is precisely the failure Account P1 cannot detect from the outside, because the surviving observation is indistinguishable from a single delivery. The implementation must extend the content binding and retain a witness that two payload-distinct deliveries on one subscription are not aliased.

The smallest executable refinement witness starts the model, replaces the Worker while the subscription is live, delivers a payload-free command and requires the semantic refusal with the subscription still projected, then delivers a payload and requires canonical `variables` to show the associated Property, obtains the terminal receipt, and replays the completed Run. Continue-As-New must carry the written binding, and host termination of the refused run must publish no transition.

## Evidence strategy

| Claim | Independent evidence |
|---|---|
| Normative account | BPMN 2.0.2 Clause 10.5.1 and Table 10.82 with the CMOF and XSD anchors quoted above; no CIB semantic vote |
| Exact source and profile admission | Source compiler tests with independently authored checked-graph expectations, old-profile refusal, and mutations covering association direction, reference resolution, cardinality, item equivalence, and each excluded attribute |
| Declarative meaning and laws | Lean delivery relation, evaluator-soundness bridge, and quantified write, withdrawal, preservation, and refusal laws plus the routed-versus-named non-law |
| TypeScript realization | Separately written admission, assignment, routing, withdrawal, and refusal logic with focused state-preservation and negative tests |
| Cross-language behavior | Answer-free supplied-scalar, supplied-null, and absent-payload scenarios compared through exact canonical results |
| Account selection | The P1-versus-P2 witness at the public boundary, which no other capsule in this repository has been able to supply for its own account choice |
| Durable refinement | Real-service Worker replacement, payload-distinct non-aliasing, the routed write observed in canonical `variables`, refusal leaving the subscription live, terminal receipt, and replay of the completed Run |
| Whole-model reach | One project-owned business model with a concrete purpose, exact pipeline binding, capability row, generated corpus map, and Product 2 About-page disclosure |

Required mutations write under the `DataOutput` id or the Message name instead of the association target, reverse the association direction, resolve either end by name, point `itemSubjectRef` at a second `ItemDefinition`, admit a second output, output set, association, or `EventDefinition`, admit each excluded `ItemDefinition` attribute, admit an out-of-domain payload, commit the write while leaving the subscription live, and alias two payload-distinct deliveries onto one command identity.

## Runtime-only inventory and layer ownership

| Construct | Derivation and owner | Public projection | Lifecycle invariant |
|---|---|---|---|
| Delivered payload value | Carried by the accepted delivery command, admitted against the profile's value domain | Reaches canonical `variables` only under the associated Property's id | Exists only within the delivering transition; never stored under the `DataOutput` id |
| Payload-bearing Message subscription | Program-selected because the Event owns a declared data interface | Contributes only to the existing Message wait projection | Armed and withdrawn exactly as the payload-free subscription is |

The BPMN layer owns the assignment and association propositions and the absent-output no-write rule. The selected profile owns the exact source graph, the identity-based item equivalence, the value subset, and the refusal class for a payload-free delivery. Lean and TypeScript independently realize the same reviewed account. Temporal owns durability, delivery, and command identity only.

## Versioning consequences

This is a pre-release additive profile with one breaking wire change. It adds one profile artifact, one checked-node arm, one Semantic Process operation arm, one source reader, scenarios, one retained model, pipeline entries, and documentation owners, and it adds one field to `DeliverMessageStimulus`.

That field is the capsule's largest cost and is stated here rather than discovered during implementation. Under [the contract evolution policy](../../contracts/README.md#evolution-policy) and [the pre-release evolution policy](../PROJECT-DESIGN.md#pre-release-evolution-policy) a breaking shape change replaces every current producer, consumer, fixture, schema, and test atomically; no optional reader, version switch, or defaulted field is permitted. The exact set is derived mechanically with `node scripts/what-binds.ts` rather than from a count, because a number here would be stale before the branch merged.

The executable constraints that already bind this work include [contract schema coverage](../../scripts/contract-schema-coverage.test.ts), [contract artifacts](../../scripts/contract-artifacts.test.ts), [execution-publication contract coverage](../../scripts/execution-publication-contract-coverage.test.ts), [internal commutation census](../../scripts/internal-commutation-census.test.ts), [runtime collection removal completeness](../../scripts/runtime-collection-removal-completeness.test.ts), [canonical ordering](../../scripts/canonical-ordering.test.ts), [experiment union coverage](../../scripts/lean-import-boundaries.test.ts), [Lean source contracts](../../scripts/lean-source-contracts.test.ts), [source hygiene](../../scripts/source-hygiene.test.ts), [requirement-ledger consistency](../../scripts/requirement-ledger-consistency.test.ts), [model-corpus policy](../../scripts/bpmn-corpus-policy.test.ts), and [document reviewability](../../scripts/document-reviewability.test.ts). The source owners the implementation grows include [the semantic-core public contract](../../packages/semantic-core/src/contract.ts), [the Semantic Process contract](../../packages/semantic-core/src/semantic-process-contract.ts), [the checked graph contract](../../packages/semantic-core/src/checked-process-contract.ts), [the source compilation dispatch](../../packages/bpmn-source/src/compilation-dispatch.ts), [the Lean Semantic Process contract](../../BpmnSemantics/SemanticProcessContract.lean), and [Lean profile admission](../../BpmnSemantics/SemanticProcess/ProfileAdmission.lean).

### Owners this implementation grows

The `OWNER` measurements below are the nonblank counts reported by `node scripts/what-binds.ts` and are re-measured as implementation grows each owner, so the table always states the remaining headroom rather than the headroom this capsule started from. The 800-line soft target is the extraction threshold and 1,200 lines is the hard ceiling.

| Owner | Current headroom |
|---|---:|
| [Lean ProfileAdmission](../../BpmnSemantics/SemanticProcess/ProfileAdmission.lean) | 128 |
| [Lean SemanticProcessContract](../../BpmnSemantics/SemanticProcessContract.lean) | 161 |
| [TypeScript Semantic Process contract](../../packages/semantic-core/src/semantic-process-contract.ts) | 287 |
| [TypeScript public contract](../../packages/semantic-core/src/contract.ts) | 398 |
| [TypeScript checked graph contract](../../packages/semantic-core/src/checked-process-contract.ts) | 488 |
| [TypeScript compilation dispatch](../../packages/bpmn-source/src/compilation-dispatch.ts) | 511 |

`ProfileAdmission.lean` and `SemanticProcessContract.lean` are the two narrowest owners and the ones both data capsules also flagged. Each new profile has fit within their headroom so far; the condition under which that stops applying is a measured count above the 800-line target after the exhaustive arm is written, and the answer then is to extract the profile-specific rule as its own behavior-preserving commit before adding semantics, never to compress the arm.

No size exception is requested.

Same-change owners are this proposal, the [catch-Message capsule](INTERMEDIATE-CATCH-MESSAGE-SPEC.md), Product 2's copied published contract at [`execution-publications.ts`](../../platform/contracts/src/execution-publications.ts), the [Semantic Process IL specification](../SEMANTIC-PROCESS-IL-SPEC.md), the [requirement ledger](../BPMN-REQUIREMENT-LEDGER.md), all applicable detail maps routed by [`implementation-status-router`](../IMPLEMENTATION-MAP.md), the semantic-core and source registries, the Lean module graph, the contract registry, model-corpus registry and generated map, capability disclosure, Product 2 About-page disclosure, capsule cost ledger, and [PLAN](../PLAN.md).

## Epistemic closure and reopen conditions

What this capsule would establish is the normative catch-Event payload assignment and association rules, the exact machine-readable cardinalities and the identity-based item equivalence that satisfies them, an operationalized and *witnessed* answer to the payload-free delivery gap, and an implementation whose source admission, Lean account, independently written TypeScript core, three answer-free scenarios, retained whole model, and real-service refinement agree.

What would remain unestablished is everything the slice excludes: no claim would cover structured payloads, collections, correlation, multiple triggers, another Event or Task host, or any other trigger family's payload.

The nearest unsupported claim is Message correlation: selecting the waiting instance by a key carried in the payload rather than by subscription identity. This capsule is its normative dependency, because a correlation key has to live in a payload representation before an extraction rule can name one, and it is the natural next capsule.

The principal common-mode risk is the host-transparency one recorded above: under Account P1 a dropped payload and an absent payload are publicly identical, so the refusal lane cannot distinguish a transport defect from a publisher's choice. The command-identity obligation in the preflight is what covers it, and a reviewer should attack that obligation rather than look for a semantic discriminator.

The nearest realistic counterexample delivers a payload whose value equals the target Property's id, which would make a name-merged implementation and a routed one agree by coincidence. The registered model must therefore keep the `DataOutput`, `Message`, and `Property` ids pairwise distinct, and the merged-identity program must be refused in both languages.

Reopen before admitting `structureRef` or any structured payload, a collection, a second `DataOutput`, `OutputSet`, association, or `EventDefinition`, correlation of any form, payload on another Event or Task host, another trigger family's payload, or a lenient payload-free delivery.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `48cc5b49` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
