# Link Events proposal

## Status

Lifecycle: draft
Review: pending

## Question and delivery boundary

Can the nested scope-data profile admit a pair of Link Intermediate Events, one throw and one catch of the same Link name in one scope, so that the definition behaves exactly as its explicit-flow twin, in which the throw's incoming Sequence Flow connects directly to the catch's successor, with no occurrence, wait or step for either Event, while every model, command and observation the profile admits today keeps its meaning?

This is the next family of batch 4 in [PLAN](../PLAN.md#scheduled-delivery-batches), whose outcome names Link and interoperability. The [None Throw specification](NONE-INTERMEDIATE-THROW-SPEC.md#question-and-delivery-boundary) screened Link Events out because "CIB records no activity for either Link Event, so a Link needs a non-publishing step or place aliasing, a representation change". This family supplies that change as a normalization before lowering, not as a new operation. It takes the clauses of `PC-BASIC-02` in the [coverage checklist](../PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) that a single-source pair serves:

- throw/catch continuation equivalence, and a Link model matching its explicit-flow twin;
- repeated occurrences without invented waits, through a Link on a re-entry back-edge;
- same-scope name resolution, and refusal of missing and duplicate targets, cross-scope continuation and a Link catch after an Event-Based Gateway.

The row stays open on multiple sources to one target. Screened out, with its reason: several throws naming one catch are a fan-in at the catch's successor. A contraction would give the successor's input place several producers, which the IL's single-producer rule refuses (`GraphValidation.lean`, `producerCensus_without_invocations`), and a many-input merge would publish a step CIB does not have. That is the kernel extension the [implicit fan-in proposal](IMPLICIT-FAN-IN-PROPOSAL.md#independent-cold-review-receipt) was rejected for needing, so this clause waits for it.

Selection, 2026-11-04: a close call against admitting nested and sibling Inclusive regions, the cells the [Inclusive regions specification](INCLUSIVE-GATEWAY-REGIONS-SPEC.md#required-optional-and-excluded-scope) refused at closure. Link Events win on reach and risk. Of the 1,947 BPMN files in the pinned CIB engine test resources, 11 hold a `linkEventDefinition`: 7 parse as distinct files, 6 of them single-source. Of the MIWG reference files, 96 hold one, 45 distinct after hashing, all single-source and nearly all exports of the B.2.0 reference model. The mechanism is a pure flow continuation. The Inclusive cells need a new retained model and a CIB probe of two live selection records for a narrower reach.

## Normative basis and CIB classification

The passages are in the [external reading copy](../reference/bpmn-2.0.2/README.md#reading-workflow).

- **Clause 10.5.5, Link Event Definition:** a Link connects two sections of a Process, is limited to a single Process level, and can serve as an Off-Page Connector or a Go To object. For a Go To, "the token traversing the Sequence Flow would reach the source Link Event and then 'jump' to the target Link Event and continue down the Sequence Flow. The Process would continue as if the Sequence Flow had directly connected the two objects", and both diagrams "will behave equivalently". The pair is named alike; "there can be multiple source Link Events, but there can only be one target Link Event".
- **Clause 10.5.4, Table 10.89 (Link row) and the Intermediate Event Sequence Flow connection rules:** Link Intermediate Events are valid only in normal flow, a catching Link has no incoming Sequence Flow, a source Link need not have an outgoing one, and a Link Event must not be both a target and a source of Sequence Flow.
- **Table 10.98:** `LinkEventDefinition` carries `name`, `sources` and `target`.

CIB Seven `2.2.0` at the pinned checkout:

- `BpmnParse#parseIntermediateThrowEvent` creates no activity for a Link throw and records it as a redirection by its `linkEventDefinition` name (`BpmnParse.java:1611-1622`).
- `#parseSequenceFlow` retargets every Sequence Flow into a Link throw to the catch of that name, and refuses a throw without a catch (`BpmnParse.java:4306-4316`).
- `#parseIntermediateLinkEventCatchBehavior` refuses a second catch of one name (`BpmnParse.java:1575-1576`) and a catch after an Event-Based Gateway (`BpmnParse.java:1544-1546`).
- `IntermediateCatchLinkEventActivityBehavior#execute` leaves at once.
- `HistoryParseListener#parseIntermediateCatchEvent` writes no history for a Link catch (`HistoryParseListener.java:207-211`, "do not write history for link events").
- `LinkEventTest#testValidEventLink` observes only the waits after each Link and the four non-Link historic activity instances.

Classification: normative agreement, a new register entry `CIB-AGR-0018`: a Link pair continues the token as its explicit Sequence Flow would, records no activity instance and adds no wait. CIB pairs by the `linkEventDefinition` name and ignores `sources` and `target`. This account admits a definition only without those references, so name pairing and reference pairing cannot disagree on an admitted model.

## Required, optional and excluded scope

Required, for the nested scope-data profile only: every model the profile admits today, unchanged, plus Link pairs in one scope (the root or a Sub-Process body), where:

- a throw is an `intermediateThrowEvent` with an identity, an optional name and exactly one contained `linkEventDefinition` with a nonempty `name` and no `sources` or `target`, with no CIB attribute or extension element, exactly one incoming flow and no outgoing flow;
- a catch is an `intermediateCatchEvent` of the same form, with no incoming flow and exactly one outgoing flow;
- each Link name of a scope names exactly one throw and exactly one catch;
- the catch's outgoing flow does not enter a Link throw;
- the definition with every pair contracted, the throw's incoming flow retargeted to the catch's successor and the throw, the catch and the catch's outgoing flow removed, is admitted by the profile as it stands.

That last condition places Links wherever a Sequence Flow may stand: on serial paths, a re-entry back-edge, a Choice candidate (the incoming flow keeps its condition or default role), a Parallel branch, and around a fork or join.

Optional: several pairs in one definition and in one scope.

Excluded, each refused at admission:

- two or more throws of one name, the multiple-sources clause on which `PC-BASIC-02` stays open;
- a throw without a catch, a catch without a throw, two catches of one name, and a pair split across scopes;
- a catch with an incoming flow, which covers a catch after an Event-Based Gateway, and a throw with an outgoing flow;
- a throw with two incoming flows, a catch with two outgoing flows, and a catch whose successor is a Link throw (a chain);
- `sources`, `target` or `eventDefinitionRef`, a second EventDefinition, and any CIB attribute or extension element such as `camunda:asyncBefore` or an execution listener;
- Links in a called Process, whose body stays one to three User Tasks;
- every other profile.

These bound admission only. Admitting multiple sources or chains later adds forms without reinterpreting an admitted model.

## Profile and public contract

The profile `cibseven-2.2.0-nested-embedded-scope-data-draft` grows in place under the [cumulative profile rule](../../contracts/README.md). Its value domain, Start contract, effect contract and closure limit are unchanged. The [profile artifact](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/profile.json) adds Clause 10.5.5, `CIB-AGR-0018` and the feature `link-events`, and narrows its exclusions; the [profile README](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/README.md) states the class.

Observation adds no field and publishes nothing for a Link Event: no occurrence, no wait and no committed step. The checked-process wire contract gains two node variants in the [checked-process schema](../../contracts/schemas/checked-process.schema.json), `linkThrowEvent` and `linkCatchEvent`, each with an `id` and a `linkName`. Every producer, consumer and fixture moves together under the [pre-release evolution policy](../PROJECT-DESIGN.md#pre-release-evolution-policy). The Semantic Process IL does not change.

## Representation and runtime ownership

- **Checked graph.** Two new arms of `CheckedNode` in [`CheckedProcessContract`](../../BpmnSemantics/CheckedProcessContract.lean), `linkThrowEvent (id : NodeId) (linkName : String)` and `linkCatchEvent (id : NodeId) (linkName : String)`, and the matching `CheckedNodeKind` members in TypeScript. The checked graph keeps the source kinds and Sequence Flows as written, so normalization stays separate from import, as the [authority model](../../CLAUDE.md#non-negotiable-boundaries) requires.
- **Link contraction.** A new leaf per language, `LinkContraction` in Lean and `link-contraction.ts` in the semantic core, owns one partial function from a checked process to its explicit-flow twin. It refuses every excluded pairing form. It is the identity on a graph without Link arms, and it refuses any Link arm under another profile. For each pair it retargets the throw's incoming flow to the catch's successor. It removes the throw, the catch, the catch's outgoing flow and their scope-ownership entries, and keeps every other node, flow, condition, default and record unchanged.
- **Checked admission and lowering.** `checkedWellFormed` and `lowerCheckedProcess` in Lean, and their TypeScript twins in [checked admission](../../packages/bpmn-source/src/checked-process-admission.ts) and [lowering](../../packages/bpmn-source/src/semantic-process-lowering.ts), apply the contraction first and run their unchanged bodies over its result. A refused contraction is not well-formed. Because the 92 Lean callers of `checkedWellFormed` and every consumer of the lowering see the contracted graph, the analyses, routers, burst rules, `ProfileCardinalities`' shape counts and `definitionBindingValid` need no Link case. `definitionBindingValid` stays lowering equality.
- **Program.** The Program of a Link model equals, operation for operation and place for place, the Program of its twin, the definition identity aside. The incoming flow of the throw keeps its identity, so a Choice candidate, a default or a branch place keeps its origin.
- **Runtime.** Unchanged. No operation stands for a Link Event, so none publishes, waits or counts against the closure limit.

Rejected alternatives:

- a non-publishing one-input `mergeExclusive` with a new origin kind: it adds a committed step that CIB does not have, changes the IL, and charges the closure limit for a jump;
- aliasing places while lowering, without a checked normalization: every checked analysis would need its own Link case, and the analyses that decide admission would diverge from the lowering that decides behavior;
- contracting in the source reader: the checked graph would hold flows the source does not, and it would lose the Link kinds that the decoder, the schema and later families need.

## Admission

Admission stays [profile-parameterized](../PROFILE-PARAMETERIZED-ADMISSION-SPEC.md):

- **Source.** The [nested scope-data source reader](../../packages/bpmn-source/src/nested-scope-data-source.ts) projects an Intermediate Throw or Catch Event with exactly one named `linkEventDefinition` and no other key to its arm. It refuses `sources`, `target` and `eventDefinitionRef` by name, as the None Throw reader refuses the reference, because the key inventory cannot see reference-valued attributes. Other profiles' readers keep refusing Link Events.
- **Checked validation.** Arity is decided by the contraction: a throw takes one incoming and no outgoing flow, a catch none incoming and one outgoing. The contracted graph then meets every rule a Link-free graph meets.
- **Analyses.** Unchanged; they run on the contracted graph at the checked level and on the identical Program at the Program level.

Nearest wrong algorithms, each with a separating witness below:

1. lowering a Link pair as a pass-through step, which publishes two occurrences and charges two closure steps;
2. pairing across scopes, or by the Event's `name` instead of its `linkEventDefinition` name;
3. dropping the condition or default role of the throw's incoming flow, which keeps the catch's flow instead;
4. admitting several throws of one name by giving the successor several producers;
5. admitting the arms under another profile, or contracting at only one level;
6. dropping the CIB-attribute refusal, which would pass an asynchronous continuation through as a jump.

## Stable rules

| Rule | Statement |
|---|---|
| `LNK-KIND-01` | The checked graph keeps a Link throw and catch as `linkThrowEvent` and `linkCatchEvent` with their Link name, never as a Task, None Throw or Sequence Flow, and the decoder refuses every other spelling. |
| `LNK-PAIR-01` | Within one scope, each Link name names exactly one throw with one incoming flow and exactly one catch with one outgoing flow; every other pairing form is refused. |
| `LNK-CONT-01` | A definition with Link pairs is well-formed, admitted and lowered exactly as its contraction, whose Program equals the explicit-flow twin's; a Link Event publishes no occurrence, wait or step. |
| `LNK-ADMIT-01` | The nested scope-data profile admits a Link pair exactly where its contraction is admitted, and refuses each excluded form. |
| `LNK-PROFILE-01` | Every other profile refuses a Link Event, as today. |

## Newly reachable waits and resumption

None. A Link adds no step, so every wait, command, closure burst and resumption point is its twin's.

## Separating witnesses

Both models are the retained [None Throw models](../../scenarios/none-intermediate-throw/README.md) with Sequence Flows interrupted by Link pairs. Each original is therefore the model's registered explicit-flow twin. In each edit the flow keeps its identity into the throw, and a new flow leaves the catch.

- **Warranty repair with Go To links:**
  - `Flow_Rework` ends at throw *Back to repair* and catch *Back to repair* leads to the Merge *Repair round*. This is the Link loop of Figure 10.87, and the rework journey crosses it once.
  - `Flow_SparePartOrdered` inside *Repair device* ends at throw *To testing*, whose catch leads to *Test device*: an Off-Page Connector in a body, crossed in every repair round.
  - The conditioned candidate `Flow_Passed` ends at throw *Release device*, whose catch leads to *Device released*: a Link on a Choice candidate.
  - Journeys: passed, and rework.
- **Onboarding milestones with Off-Page links:**
  - `Flow_ToWelcome` ends at throw *Welcome track*, whose catch leads to *Welcome sent*: a Link on a Parallel branch.
  - `Flow_AccountCreated` in *Set up account* ends at throw *Account done*, whose catch leads to *Account ready*: a Link in a body on a branch.
  - `Flow_Ready` after the join ends at throw *All set*, whose catch leads to *Onboarding complete*.
  - Journeys: account first, and laptop first.
- **Twin equality (wrong algorithms 1 and 3):** in source tests at both levels and in the Lean conformance module, each model's Program equals its retained twin's Program, apart from the definition identity, and each checked contraction equals the twin's checked graph apart from identity. In the pipeline test, each journey's observation trace equals its twin journey's, apart from the definition identity.
- **Refused edits**, each beside its admitted original at the checked and Program levels unless stated:
  - a second throw *Back to repair* on another path (multiple sources, wrong algorithm 4);
  - the catch *To testing* removed, and a second catch *To testing* added;
  - the catch *To testing* moved to the root, a cross-scope pair (wrong algorithm 2);
  - the pair *Release device* with the Event names swapped but the definition names kept, admitted, against its definition names mismatched, refused (wrong algorithm 2);
  - an incoming flow added to a catch, an outgoing flow added to a throw, and a catch leading straight into another throw;
  - `camunda:asyncBefore` on a throw and an execution listener on a catch (wrong algorithm 6);
  - a `target` reference on a catch's definition.

  A refused graph has no Program, so each refusal is asserted at the source and checked levels.
- **Profile control (minimal pair, wrong algorithm 5):** the employee onboarding model the embedded completion profile admits today, with one Link pair interrupting a root flow, is refused under that profile and admitted without it at the source level. Separately, the same Link-bearing checked graph relabelled to that profile's identity is refused by both languages' checked admission, while its contraction relabelled alike is admitted, so the profile test of the contraction is killed rather than masked by the source reader.
- **CIB calibration:** the CIB probe runs all four journeys and asserts each step's open tasks equal the twin's. It also asserts that no historic activity instance names a Link Event, and that the rework journey crosses the Go To loop once.

## Rule-to-evidence matrix

| Rule | Positive and negative witness | Lanes | Killing mutation |
|---|---|---|---|
| `LNK-KIND-01` | Both models hold the arms with their Link names; the decoder refuses an arm without `linkName` | Source, decoder, Lean conformance module | Project a Link Event as a None Throw |
| `LNK-PAIR-01` | Each pairing refusal beside its original | Source and core at both levels, Lean conformance module | Pair by Event name; pair across scopes; drop the single-source check |
| `LNK-CONT-01` | Program and checked twin equality; equal journey traces; no Link occurrence in core or CIB history | Source, core, pipeline, Lean conformance module, CIB probe | Lower a pair as pass-through steps; keep the catch's flow and drop the incoming condition |
| `LNK-ADMIT-01` | Both models admitted at both levels; each refused edit | Source and core, Lean conformance module | Skip the contraction at one level |
| `LNK-PROFILE-01` | The embedded completion minimal pair at the source and checked levels | Source, core and Lean checked levels | Contract under every profile |

## Lean assurance lane

Lane shape: checked

Evidence: the family adds no transition family, operation or runtime law. Its meaning is the contraction, a total executable function on checked graphs whose result the existing admission and lowering decide. A private `rfl` law in [`Lowering`](../../BpmnSemantics/SemanticProcess/Lowering.lean) states that lowering a checked graph is lowering its contraction. A new executable conformance module, `linkEventsConformanceChecks`, holds:

- both models admitted at both levels;
- the Program and checked twin equalities against transcriptions of the retained twins;
- each refused pairing form;
- the profile control;
- the decoder's refusal of a malformed arm.

What stays argued, not proved: that every admitted closure stays within the computed burst, as for the accounts it reuses. No new argument arises, since a contracted definition is its twin.

## Temporal hosting and refinement preflight

No new hosting mechanism. A Link adds no operation, so ingress, waits, timers, effects, cancellation, lifecycle, the publication projection and the continuation reader are unchanged. The preserved relation is equality of hosted committed state and publications with the core's, which for a Link model is the twin's. Delivery, ordering, deduplication, retry and replay risks are unchanged. The smallest witness is the hosted pipeline over both models' journeys at family closure.

## Evidence and acceptance

The models run as answer-free scenarios with four registered pipeline cases, each with a seeded mutation. They also get value-domain matrix rows, corpus rows and the About disclosure. A new CIB probe runs the four journeys as described above.

Then `PC-BASIC-02` is accepted for this profile's single-source pairs in the root and Sub-Process bodies, on its continuation-equivalence, repeated-occurrence, same-scope and refusal clauses. The row stays open on multiple sources.

Nearest unsupported claims:

- multiple throws of one name, Link chains, and Links in called Processes, Multi-Instance bodies and every other profile;
- `sources` and `target` references, which are refused rather than checked;
- that every actual closure stays within the admitted burst, which is not proved in Lean, as for the twins.

## Versioning consequences

Apply the [pre-release wire policy](../../contracts/README.md#evolution-policy). The checked-process schema gains two node variants, and every producer, consumer, fixture and test moves in one change, with no legacy reader or migration. No admitted model changes its Program, route or behavior, because no profile admits a Link Event today.

### Owners this implementation grows

Build cost is a constraint. The kernel type change is two `CheckedNode` arms, an interface edit of `CheckedProcessContract` whose cone is the whole library. As for the None Throw's arm, that is one complete rebuild landing in one commit. Every exhaustive match on `CheckedNode` must cover the arms: the JSON decoder, `ProfileCardinalities`, `CheckedGraphValidation` and any other match the compiler reports. Each one either refuses the arms or, behind the contraction, never sees them. `checkedWellFormed` in `CheckedProcessAdmission` and `lowerCheckedProcess` in `Lowering` take body edits that call the contraction. The new leaf `LinkContraction` and the conformance module import only the contract and admission owners. `NestedScopeControlAdmission`, at 796 of 800 nonblank lines, takes no edit.

TypeScript owners: the [checked-process contract](../../packages/semantic-core/src/checked-process-contract.ts) and schema reader, the new `link-contraction.ts`, the [nested scope-data source reader](../../packages/bpmn-source/src/nested-scope-data-source.ts), [checked admission](../../packages/bpmn-source/src/checked-process-admission.ts) and [lowering](../../packages/bpmn-source/src/semantic-process-lowering.ts).

Guards the implementation must satisfy, with bounds unchanged: [`lean-fanout`](../../scripts/lean-fanout.test.ts), [`lean-module-cost`](../../scripts/lean-module-cost.test.ts), [`source-hygiene`](../../scripts/source-hygiene.test.ts), the contract schema tests, and the consumer-site registry of the [projected flow-element keys test](../../packages/bpmn-source/test/projected-flow-element-keys.test.ts).

Registration:

- `CIB-AGR-0018` in the [register](../CIB-BPMN-RELATION-REGISTER.md);
- a new Link Event row in the [requirement ledger](../BPMN-REQUIREMENT-LEDGER.md);
- the profile artifact's clauses, relationships, `features` and exclusions, and its README;
- the conformance module in `ConformanceChecksMain`;
- scenarios, pipeline cases, the value-domain matrix, the corpus, About and the CIB probe.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `not-recorded` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-required` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
