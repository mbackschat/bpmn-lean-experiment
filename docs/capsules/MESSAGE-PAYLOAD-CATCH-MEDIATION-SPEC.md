# Message payload catch mediation specification

## Status

Lifecycle: implemented
Review: closure-approved

## Question and bounded outcome

What is the smallest standards-only mechanism that lets one Intermediate Catch Message Event carry one delivered payload value into Process scope through a declared catch Data Association, without selecting `ItemDefinition` structure, expressions, correlation, multiple `EventDefinition`s, collections, or another Event host?

This capsule defines one private executable Process containing a None Start Event, one Intermediate Catch Message Event, one User Task, and one None End Event, extending the closed [Intermediate Catch Message specification](INTERMEDIATE-CATCH-MESSAGE-SPEC.md)'s exact graph with one `ItemDefinition` root, one Event-owned `DataOutput`, one `OutputSet`, and one `DataOutputAssociation` writing into one Process-owned `Property`. The delivery command carries exactly one payload value; the association, not the `DataOutput` id and not the Message name, decides which Property receives it.

The reviewed requirement ID is `BPMN-MESSAGE-PAYLOAD-CATCH-01`. Its requirement-ledger disposition is `supported` only for this exact bounded slice; the broad `BPMN-MECH-EVENT-01` and `BPMN-MECH-DATA-01` families remain `unsupported`, the latter because its scope is exactly the `ItemDefinition`, `DataOutput`, and `DataAssociation` breadth this slice takes one point of. `BPMN-MESSAGE-CATCH-01` stays `supported` for its own payload-free slice, which this capsule does not reinterpret.

## Normative account and selected interpretation

Clause 10.5.1's Common Catch Event rules give the two-step account directly, and both steps are quoted here because the capsule's whole meaning is which of them the association owns.

The trigger fills the Event's own output: "For _catch_ **Events**: When the _trigger_ of the **Event** occurs (for example, the **Message** is received), the data is assigned automatically to the **Data Output** that corresponds to the EventDefinition that described that trigger."

The association then moves it into scope, from Table 10.82: "The dataOutputAssociation of a _catch_ **Event** is used to assign data from the **Event** to a data element that is in the scope of the **Event**."

Three further sentences of the same clause bound the slice. The pairing rule is positional — "The order of the EventDefinitions and the order of the **Data Inputs/Outputs** determine which **Data Input/Output** corresponds with which EventDefinition" — so admitting exactly one `EventDefinition` and exactly one `DataOutput` makes the correspondence unambiguous without selecting an ordering account. The typing rule is an equivalence — the `Data Output` "MUST have an ItemDefinition equivalent to the one defined by the **Message**" — which this profile satisfies by identity rather than by a structural equivalence relation it would otherwise have to define. And the absent-output rule is a no-write rather than an error: "if the **Data Output** is not present, the payload within the **Message** ... will not flow out of the **Event** and into the **Process**", which is exactly the closed payload-free profile and is why that profile keeps its meaning unchanged.

The machine-readable anchors are `CatchEvent-dataOutputs` (`DataOutput`, `upper="*" lower="0"`, composite), `CatchEvent-dataOutputAssociation` (`DataOutputAssociation`, `upper="*" lower="0"`, composite), `CatchEvent-outputSet` (`OutputSet`, `lower="0"`, at most one), `Message-itemRef` (`ItemDefinition [0..1]`), `ItemAwareElement-itemSubjectRef` (`ItemDefinition [0..1]`), and the `tItemDefinition` complex type, whose `structureRef`, `isCollection`, and `itemKind` attributes are all optional with `isCollection` defaulting to `false` and `itemKind` to `Information`.

**A catch Event owns its data interface directly, not through an `InputOutputSpecification`.** That is the exact structural difference from [the Activity data-output specification](ACTIVITY-DATA-OUTPUT-MEDIATION-SPEC.md), whose outputs hang off `Activity-ioSpecification`, and it is why this is a new source proposition rather than a second consumer of that reader. A reader that assumed an `ioSpecification` would reject every conforming catch Event.

**The standard does not say what happens when a delivery carries no payload against a model that declares a `DataOutput`.** Clause 10.5.1 governs the model, not the occurrence. That gap is operationalized below and recorded as an interpretation rather than presented as a normative consequence.

## Required, optional, and excluded

**Required:** one `ItemDefinition` root with `structureRef`, `itemKind`, and `isCollection` all absent; a `Message` whose `itemRef` resolves to it; exactly one Process-owned `Property` with `itemSubjectRef` and `dataState` both absent; one Intermediate Catch Event with one contained `MessageEventDefinition`, exactly one `dataOutput` whose `itemSubjectRef` resolves to that same `ItemDefinition` and whose `isCollection` is absent, exactly one `outputSet` whose `dataOutputRefs` is exactly that output and whose `optionalOutputRefs` and `whileExecutingOutputRefs` are both absent, and exactly one `dataOutputAssociation` from that output to that `Property`; one payload-bearing delivery command carrying exactly one value in the profile's scalar domain.

The output is **required** in the BPMN sense only because of those two absences. `OutputSet-optionalOutputRefs` and `OutputSet-whileExecutingOutputRefs` are both `[0..*]`, so a document listing the single output in `dataOutputRefs` *and* in `optionalOutputRefs` would otherwise satisfy every sentence above while making the output optional, and Account P1 below would then be refusing a delivery the model says may omit its value. Requiredness is therefore a property the profile establishes and the source contract must close, never an assertion this capsule may make about a `dataOutputRefs` membership alone.

**Optional:** nothing. Every element above is required, and the `DataOutput` `name` is carried for presentation and never for resolution.

**Excluded:** `ItemDefinition-structureRef`, `itemKind="Physical"`, `ItemDefinition-isCollection="true"`, `DataOutput-isCollection="true"`, any `dataState`, any `itemSubjectRef` on the target `Property`, an `optionalOutputRefs` or `whileExecutingOutputRefs` entry, a second `Property`, `DataOutput`, `OutputSet`, or `dataOutputAssociation`, a second `EventDefinition` or any Multiple Event, `parallelMultiple`, `transformation`, `assignment`, an `inputSet` of any kind, correlation of every form, expressions, payload on Message Start, Receive Task, boundary, throw, or End Events, and payload for Signal, Error, or Escalation triggers. Each remains a distinct proposition even where it would reuse this mechanism.

## Competing accounts and the account this proposal selects

The open decision is not where the value goes — the association settles that — but what an occurrence does when the delivery carries no payload while the subscription's Event declares an output the profile has closed as required by excluding `optionalOutputRefs` and `whileExecutingOutputRefs`.

**Account P1 — refuse the delivery.** The subscription stays live, the Process stays waiting, no Property is written, and the command reports a semantic refusal with exact state preservation.

**Account P2 — trigger and write nothing.** The subscription is withdrawn, the token is produced, and Process scope is unchanged.

Unlike [the Activity data-output capsule](ACTIVITY-DATA-OUTPUT-MEDIATION-SPEC.md)'s two accounts, these are publicly discriminable at the approved observation boundary, and by three independent channels rather than one: the command result itself, which the closed catch-Message profile already publishes; the projected wait set, where P1 leaves a live Message wait and P2 leaves a User Task wait; and the enabled-interaction projection. A witness therefore locks whichever account is selected and detects drift from it. What such a witness cannot do is decide which account the *standard* requires, because Clause 10.5.1 governs the model rather than the occurrence, so the selection below still rests on argument and the witness holds the implementation to it.

This proposal selects **Account P1**. The closed [Intermediate Catch Message specification](INTERMEDIATE-CATCH-MESSAGE-SPEC.md) already records that an omitted payload and an explicit `null` are not aliases; under P2 they would become aliases at the only boundary anyone can observe, because both would leave Process scope carrying no new binding on some models and a null on others depending only on the value domain. P1 also matches the command discipline both data capsules already carry, where a completion that does not make a declared required output available is refused rather than silently partial. P1's cost is that a payload-free publisher can never advance a payload-declaring model; that is the intended contract, and the model that wants the lenient behavior is the payload-free profile, which remains admissible and unchanged.

[The forward-compatible restriction rule](../../CLAUDE.md#forward-compatible-semantic-restrictions) applies unconditionally and is discharged here rather than treated as replaced by the witness. P1 is stated as a rule of *this profile's* subscription, not as the general meaning of a payload-free Message delivery, so the capsule that later admits `optionalOutputRefs` may accept such a delivery and write nothing without reinterpreting any model admitted here — the two profiles disagree about different source graphs rather than about the same one. The source restriction is forward-compatible for the same reason the sibling data capsules' are: every excluded attribute is required *absent* rather than admitted and ignored, so admitting it later broadens the profile instead of changing what an already-accepted document means.

The common-mode risk P1 creates is recorded here rather than discovered later: P1 makes refusal the *only* observable difference between a malformed publisher and an absent one, so a host that dropped a payload in transit would look exactly like a publisher that never sent one. The Temporal preflight below turns that into a concrete obligation on command identity.

## Exact source and profile contract

The admitted document extends the closed catch-Message multiset by exactly five elements: one `ItemDefinition` root, one Process-owned `Property`, one `dataOutput`, one `outputSet`, and one `dataOutputAssociation`. The `Property` is new here rather than inherited, because the closed catch-Message profile admits none. `Message-itemRef` and `DataOutput-itemSubjectRef` must resolve, by object identity in the parser graph and never by name, to that same `ItemDefinition`. `dataOutputAssociation/sourceRef` must resolve to the Event's own `DataOutput` and `targetRef` to the Process `Property`; the direction is the same as the Activity capsule's and the opposite of a data input's, so a reader that copied the input shape would run the write backwards.

The profile is registered as `bpmn-2.0.2-message-payload-catch-draft`. It lowers to one `payloadMessageCatchEvent` checked node and one `awaitPayloadMessage` operation, which is a new arm rather than an optional field on `awaitMessage`: the union stays closed and exhaustively matched, and the payload-free profile keeps a byte-identical Program.

The profile rejects an `ItemDefinition` carrying any of its three optional attributes, a `DataOutput` whose `itemSubjectRef` differs from the Message's `itemRef` or whose `isCollection` is present, an `outputSet` carrying an `optionalOutputRefs` or `whileExecutingOutputRefs` entry, a `Property` carrying an `itemSubjectRef` or a `dataState`, a second `Property`, output, output set, or association, an `inputSet`, a `transformation`, an `assignment`, and every element the closed catch-Message profile already rejects.

`structureRef` is required absent rather than admitted and ignored. An admitted-and-ignored structure would let a model declare an external type this engine does not check, which is a claim about validation the capsule cannot support; requiring absence keeps the value domain a recorded profile decision instead of an unchecked model claim, and a later capsule can admit `structureRef` and narrow the domain from it without reinterpreting any model accepted here.

## Runtime, command, stable-state, and observation contract

Activation is unchanged: the Event arms one Message subscription when its incoming token arrives, exactly as the closed profile does. Nothing about the declared `DataOutput` affects arming, because a `DataOutput` constrains the trigger's effect and not the subscription.

The payload rides a new closed-union arm rather than a field on the existing one. `StimulusKind.DeliverPayloadMessage` carries the same `commandId`, `subscriptionId`, and `channel` as `deliverMessage` plus exactly one `payload` value in the profile's scalar domain, and `deliverMessage` is left byte-identical.

This is the same decision the operation union takes one section above, applied to the equally closed `Stimulus` union; the two closed unions get the same treatment for the same reason. It has three consequences worth stating because each removes an obligation the field encoding would have created. Every registered scenario, fixture, schema, and target runner that carries a `deliverMessage` command stays valid unchanged, so this is an additive pre-release change rather than a breaking one. The absent-payload case needs no encoding at all: a `deliverMessage` command against a payload-declaring subscription is a well-formed stimulus that Account P1 refuses, so absence is a *choice of arm* rather than a null at a field, which is exactly the presence-of-binding discipline [the Activity data-input specification](ACTIVITY-DATA-INPUT-MEDIATION-SPEC.md) uses to separate an unbound source from a bound null. And the delivered `null` value stays a payload whose kind is null, never a synonym for the payload-free arm.

The matching `EnabledInteraction` arm is what makes Account P1 legible to a caller. A payload-declaring subscription publishes `deliverPayloadMessage` rather than `deliverMessage`, so a consumer of the engine's published contract learns structurally that this subscription requires a payload instead of having to derive it from a refusal. Without that arm the engine would refuse a delivery for a reason it never published, which [the mission's platform boundary](../../CLAUDE.md#mission) forbids and which the semantic invariant that enabled external interactions are part of the observation contract forbids independently.

An accepted payload-bearing delivery atomically assigns the payload to the Event's `DataOutput`, executes the association to bind the target Property in Process scope, withdraws the subscription, and adds one outgoing token. The assignment and the association are fused into one step for the same reason the Activity capsule fuses them: a catch Event has no open window between its trigger and its completion, so a materialized intermediate value would have no lifetime in which anything could read it, and writing then removing it would be dead state. The two-step normative account is preserved as the *order* of the two effects, which is what a later while-executing or Multiple-Event capsule needs, not as two committed states.

A `deliverMessage` command against this profile's subscription is refused with exact state preservation, and so is a `deliverPayloadMessage` command whose payload is outside the profile's value domain or whose canonical encoding exceeds the existing stimulus size bound. The payload inherits that bound rather than introducing one, exactly as a variable patch does today.

The public observation changes in exactly two places. Canonical `variables` gains the target Property, which appears or changes value. The enabled-interaction projection gains the `deliverPayloadMessage` arm for this profile's subscriptions. No observation *field* is added to any existing arm, and the projected wait set keeps its existing shape: this profile's wait is still one Message wait, distinguished from a payload-free one by the interaction it enables rather than by a new wait kind.

## Stable semantic rules and separating witnesses

| Rule | Statement | Required evidence |
|---|---|---|
| `MPAYLOAD-DELIVER-01` | The trigger assigns the delivered payload to the Event's declared `DataOutput`; the channel decides which Event is triggered and the `DataOutput` decides nothing about addressing | Lean relation and evaluator-soundness bridge for the payload delivery step; a checked witness whose channel matches and whose payload differs from every id in the model |
| `MPAYLOAD-ROUTE-01` | The `dataOutputAssociation`, not the `DataOutput` id and not the Message name, decides which Process `Property` receives the value | A registered model whose `DataOutput`, `Message`, and target `Property` ids are pairwise distinct; a seeded mutation writing under the `DataOutput` id; a program-admission negative refusing a merged identity |
| `MPAYLOAD-ATOMIC-01` | Assignment, association, subscription withdrawal, and token production are one atomic transition, and the assignment is not separately committed | Lean disposal-and-write law; a core one-transition case; the runtime-collection-removal guard |
| `MPAYLOAD-REQUIRE-01` | A delivery carrying no payload against a payload-declaring subscription is refused with exact state preservation, and the subscription stays live | The Account P1 versus P2 separating witness at the public boundary; a checked refusal; a retained scenario |
| `MPAYLOAD-EQUIV-01` | Admission requires the `DataOutput`'s `itemSubjectRef` and the `Message`'s `itemRef` to resolve to the same `ItemDefinition` | Source mutations pointing them at two distinct `ItemDefinition` roots and at an unresolved one |
| `MPAYLOAD-PUBLISH-01` | A payload-declaring subscription publishes the payload-bearing enabled interaction, so a caller learns the requirement from the published contract rather than from a refusal | An observation test requiring the payload-bearing arm for this profile and the payload-free arm for the closed one on the same wait shape |

The decisive separating witness against the closed payload-free profile is the same graph with the five added elements: under the old profile the delivered Message produces a token and no binding, and under this one it produces a token and one Property binding. The two disagree in canonical `variables`, which is the approved public boundary.

The decisive separating witness inside this capsule is the Account P1 pair: two deliveries on one program that differ only in whether a payload is present, one of which continues to the User Task and one of which leaves the Message subscription live.

## Lean assurance lane

The lane is declared **proved** for the bounded transition family, matching both data capsules rather than weakening below them.

Required theorems cover payload assignment and association as one step; association-decided write with Process-binding preservation elsewhere; subscription withdrawal finality; refusal of an absent payload, an out-of-domain payload, a wrong channel, and a stale subscription with exact state preservation; runtime-state invariant preservation across the delivery transition; and the routed-versus-named non-law that fixes `MPAYLOAD-ROUTE-01` as a real discriminator rather than a coincidence of the registered ids.

## CIB Seven relationship boundary

No CIB relationship is selected. This is a vendor-neutral BPMN capsule whose account rests on Clause 10.5.1 alone, and no probe, profile rule, or retained CIB observation is required to complete it. A later correlation capsule will need one; this one does not, and adding a CIB extension merely to complete it is explicitly not required.

## Temporal hosting and refinement preflight

The durable ingress is the existing Signal-based Message delivery; the payload rides the Signal's existing argument, so the host gains no new mechanism, no new wait, no timer, and no new cancellation path. Committed state grows by one Process binding, which the existing 64 KiB budget already accounts for in the same way the Activity capsules' writes do. The payload is bounded on the stimulus side by the same canonical size bound an admitted variable patch already carries, so the profile's value domain adds no new resource dimension; a payload above it is refused at admission rather than truncated.

One mapping is a real risk rather than a formality, and it is the reason this preflight exists. **The content-bound command identity covers the payload.** Delivery and recovery identity derive from the complete canonical stimulus encoding, so two deliveries that differ only in payload do not collapse onto one Update identity. The retained protocol and recovery witnesses reject that aliasing class. This is the failure Account P1 could not detect from the outside, because an aliased surviving observation would be indistinguishable from a single delivery.

The executable refinement witness starts the model, forces Continue-As-New while the subscription is live, replaces the Worker, delivers a payload-free command and requires the semantic refusal with the subscription still projected, then delivers a payload and requires canonical `variables` to show the associated Property, obtains the terminal receipt, and replays every Run. Continuation carries the written binding, and host termination after the refused delivery publishes no semantic transition.

## Evidence strategy

| Claim | Independent evidence |
|---|---|
| Normative account | BPMN 2.0.2 Clause 10.5.1 and Table 10.82 with the CMOF and XSD anchors quoted above; no CIB semantic vote |
| Exact source and profile admission | Source compiler tests with independently authored checked-graph expectations, old-profile refusal, and mutations covering association direction, reference resolution, cardinality, item equivalence, and each excluded attribute |
| Declarative meaning and laws | Lean delivery relation, evaluator-soundness bridge, and quantified write, withdrawal, preservation, and refusal laws plus the routed-versus-named non-law |
| TypeScript realization | Separately written admission, assignment, routing, withdrawal, and refusal logic with focused state-preservation and negative tests |
| Cross-language behavior | Answer-free supplied-scalar, supplied-null, and absent-payload scenarios compared through exact canonical results |
| Selected-account realization | The P1-versus-P2 witness at the public boundary, which locks the selected refusal and detects drift to the lenient account. It does not evidence which account the standard requires, because Clause 10.5.1 governs the model rather than the occurrence; the selection's justification is the argument recorded above |
| Durable refinement | Real-service Worker replacement, payload-distinct non-aliasing, the routed write observed in canonical `variables`, refusal leaving the subscription live, terminal receipt, and replay of the completed Run |
| Whole-model reach | One project-owned business model with a concrete purpose, exact pipeline binding, capability row, generated corpus map, and Product 2 About-page disclosure |

Required mutations write under the `DataOutput` id or the Message name instead of the association target, reverse the association direction, resolve either end by name, point `itemSubjectRef` at a second `ItemDefinition`, list the single output in `optionalOutputRefs` or `whileExecutingOutputRefs`, admit a second `Property`, output, output set, association, or `EventDefinition`, admit each excluded `ItemDefinition`, `DataOutput`, and `Property` attribute, admit an out-of-domain payload, accept a payload-free delivery, commit the write while leaving the subscription live, and alias two payload-distinct deliveries onto one command identity.

## Runtime-only inventory and layer ownership

| Construct | Derivation and owner | Public projection | Lifecycle invariant |
|---|---|---|---|
| Delivered payload value | Carried by the accepted delivery command, admitted against the profile's value domain | Reaches canonical `variables` only under the associated Property's id | Exists only within the delivering transition; never stored under the `DataOutput` id |
| Payload-bearing Message subscription | Program-selected because the Event owns a declared data interface | Contributes only to the existing Message wait projection | Armed and withdrawn exactly as the payload-free subscription is |

The BPMN layer owns the assignment and association propositions and the absent-output no-write rule. The selected profile owns the exact source graph, the identity-based item equivalence, the value subset, and the refusal class for a payload-free delivery. Lean and TypeScript independently realize the same reviewed account. Temporal owns durability, delivery, and command identity only.

## Versioning consequences

This is a pre-release additive profile with no breaking wire change. It adds one profile artifact, one checked-node arm, one Semantic Process operation arm, one Stimulus arm, one EnabledInteraction arm, one source reader, scenarios, one retained model, pipeline entries, and documentation owners. Every existing producer, consumer, fixture, schema, and target runner keeps byte-identical artifacts, because `deliverMessage` is untouched and the new arms are new members of closed unions rather than fields on existing ones.

That is a deliberate design choice and not an accident of scope. Adding `payload` to `DeliverMessageStimulus` would have been a breaking shape change, which under [the contract evolution policy](../../contracts/README.md#evolution-policy) and [the pre-release evolution policy](../PROJECT-DESIGN.md#pre-release-evolution-policy) must replace every current producer, consumer, fixture, schema, and test atomically, since no optional reader, version switch, or defaulted field is permitted. The arm avoids that cost outright and is the encoding every later trigger family should inherit; the exact touched set is derived mechanically with `node scripts/what-binds.ts` rather than from a count, because a number here would be stale before the branch merged.

The executable constraints that bind this contract include [contract schema coverage](../../scripts/contract-schema-coverage.test.ts), [contract artifacts](../../scripts/contract-artifacts.test.ts), [execution-publication contract coverage](../../scripts/execution-publication-contract-coverage.test.ts), [internal commutation census](../../scripts/internal-commutation-census.test.ts), [runtime collection removal completeness](../../scripts/runtime-collection-removal-completeness.test.ts), [canonical ordering](../../scripts/canonical-ordering.test.ts), [experiment union coverage](../../scripts/lean-import-boundaries.test.ts), [Lean source contracts](../../scripts/lean-source-contracts.test.ts), [source hygiene](../../scripts/source-hygiene.test.ts), [requirement-ledger consistency](../../scripts/requirement-ledger-consistency.test.ts), [model-corpus policy](../../scripts/bpmn-corpus-policy.test.ts), and [document reviewability](../../scripts/document-reviewability.test.ts). The principal source owners are [the semantic-core public contract](../../packages/semantic-core/src/contract.ts), [the Semantic Process contract](../../packages/semantic-core/src/semantic-process-contract.ts), [the checked graph contract](../../packages/semantic-core/src/checked-process-contract.ts), [the source compilation dispatch](../../packages/bpmn-source/src/compilation-dispatch.ts), [the Lean Semantic Process contract](../../BpmnSemantics/SemanticProcessContract.lean), and [Lean profile admission](../../BpmnSemantics/SemanticProcess/ProfileAdmission.lean).

## Epistemic closure and reopen conditions

This capsule establishes the normative catch-Event payload assignment and association rules, the exact machine-readable cardinalities and the identity-based item equivalence that satisfies them, an operationalized and *witnessed* answer to the payload-free delivery gap, and an implementation whose source admission, Lean account, independently written TypeScript core, three answer-free scenarios, retained whole model, and real-service refinement agree.

Everything the slice excludes remains unestablished: no claim covers structured payloads, collections, correlation, multiple triggers, another Event or Task host, or any other trigger family's payload.

The nearest unsupported claim is Message correlation: selecting the waiting instance by a key carried in the payload rather than by subscription identity. This capsule is its normative dependency, because a correlation key has to live in a payload representation before an extraction rule can name one, and it is the natural next capsule.

The principal common-mode risk is the host-transparency one recorded above: under Account P1 a dropped payload and an absent payload are publicly identical, so the refusal lane cannot distinguish a transport defect from a publisher's choice. The command-identity obligation in the preflight is what covers it, and a reviewer should attack that obligation rather than look for a semantic discriminator. The narrower risk, that a caller could not learn the requirement it is being refused against, is closed by `MPAYLOAD-PUBLISH-01` rather than left to the refusal.

The nearest realistic counterexample delivers a payload whose value equals the target Property's id, which would make a name-merged implementation and a routed one agree by coincidence. The registered model must therefore keep the `DataOutput`, `Message`, and `Property` ids pairwise distinct, and the merged-identity program must be refused in both languages.

Reopen before admitting `structureRef` or any structured payload, a collection, an `optionalOutputRefs` or `whileExecutingOutputRefs` entry, which additionally requires revisiting `MPAYLOAD-REQUIRE-01`'s refusal because the model would then permit the omission, a second `Property`, `DataOutput`, `OutputSet`, association, or `EventDefinition`, correlation of any form, payload on another Event or Task host, another trigger family's payload, or a lenient payload-free delivery.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `48cc5b49` | `fork-turns-none` | `approve-with-required-edits` | `89ea501e, 0c44fdbd` |
| Semantic checkpoint | `ba38efb8` | `fork-turns-none` | `approve-with-required-edits` | `c13901b5` |
| Closure | `32337c43` | `fork-turns-none` | `approve-with-required-edits` | `036a30bb` |
