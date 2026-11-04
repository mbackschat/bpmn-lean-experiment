# Link Events specification

## Status

Lifecycle: implemented
Review: approved

## Question and delivery boundary

Can the nested scope-data profile admit a pair of Link Intermediate Events, one throw and one catch of the same Link name in one scope, so that the definition behaves exactly as its explicit-flow twin, in which the throw's incoming Sequence Flow connects directly to the catch's successor, with no occurrence, wait or step for either Event, while every model, command and observation the profile admits today keeps its meaning?

This is the next family of batch 4 in [PLAN](../PLAN.md#scheduled-delivery-batches), whose outcome names Link and interoperability. The [None Throw specification](NONE-INTERMEDIATE-THROW-SPEC.md#question-and-delivery-boundary) screened Link Events out because "CIB records no activity for either Link Event, so a Link needs a non-publishing step or place aliasing, a representation change". This family supplies that change as a normalization before lowering, not as a new operation. It takes the clauses of `PC-BASIC-02` in the [coverage checklist](../PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) that a single-source pair serves:

- throw/catch continuation equivalence, and a Link model matching its explicit-flow twin;
- repeated occurrences without invented waits, through a Link on a re-entry back-edge;
- same-scope name resolution, and refusal of missing and duplicate targets, cross-scope continuation and a Link catch after an Event-Based Gateway.

The row stays open on multiple sources to one target. Screened out, with its reason: several throws naming one catch are a fan-in at the catch's successor. A contraction would give the successor's input place several producers, which the IL's single-producer rule refuses (`GraphValidation.lean`, `producerCensus_without_invocations`), and a many-input merge would publish a step CIB does not have. That is the kernel extension the [implicit fan-in proposal](IMPLICIT-FAN-IN-PROPOSAL.md#independent-cold-review-receipt) was rejected for needing, so this clause waits for it.

Selection, 2026-11-04, corrected at the proposal review: a close call against admitting nested and sibling Inclusive regions, the cells the [Inclusive regions specification](INCLUSIVE-GATEWAY-REGIONS-SPEC.md#required-optional-and-excluded-scope) refused at closure. Reach is small on both sides. In the pinned CIB checkout (`5a45b47`), 4 BPMN files hold a `linkEventDefinition`, all `LinkEventTest` resources: one valid single-source model (`testValidEventLink`), one multiple-source model and two refusal fixtures. The MIWG files that hold one are nearly all exports of the B.2.0 reference model, and none falls within this profile. Link Events still win on risk and cost: the mechanism is a pure flow continuation that adds no operation, the row must close for the checklist to close, and the Inclusive cells need a new retained model and a CIB probe of two live selection records.

## Normative basis and CIB classification

The passages are in the [external reading copy](../reference/bpmn-2.0.2/README.md#reading-workflow).

- **Clause 10.5.5, Link Event Definition:** a Link connects two sections of a Process, is limited to a single Process level, and can serve as an Off-Page Connector or a Go To object. For a Go To, "the token traversing the Sequence Flow would reach the source Link Event and then 'jump' to the target Link Event and continue down the Sequence Flow. The Process would continue as if the Sequence Flow had directly connected the two objects", and both diagrams "will behave equivalently". The pair is named alike; "there can be multiple source Link Events, but there can only be one target Link Event".
- **Clause 10.5.4, Table 10.89 (Link row) and the Intermediate Event Sequence Flow connection rules:** Link Intermediate Events are valid only in normal flow, a catching Link has no incoming Sequence Flow, a source Link need not have an outgoing one, and a Link Event must not be both a target and a source of Sequence Flow.
- **Table 10.98:** `LinkEventDefinition` carries `name`, `sources` [1..*] and `target` [1]. The machine-readable artifacts, authoritative for syntax under the [authority model](../../CLAUDE.md#authority-model), name the properties `source` (0..*) and `target` (0..1) (`machine-readable/BPMN20.cmof:384-385`), so the reference-free form is valid and the table's multiplicities are not.

CIB Seven `2.2.0` at the pinned checkout:

- `BpmnParse#parseIntermediateThrowEvent` creates no activity for a Link throw and records it as a redirection by its `linkEventDefinition` name (`BpmnParse.java:1611-1622`).
- `#parseSequenceFlow` retargets every Sequence Flow into a Link throw to the catch of that name, and refuses a throw without a catch (`BpmnParse.java:4306-4316`).
- `#parseIntermediateLinkEventCatchBehavior` refuses a second catch of one name (`BpmnParse.java:1575-1576`) and a catch after an Event-Based Gateway (`BpmnParse.java:1544-1546`). Its name map `eventLinkTargets` is one per parse and never cleared (`BpmnParse.java:313`), so a catch name is unique across the whole deployment resource, every scope and Process included.
- `IntermediateCatchLinkEventActivityBehavior#execute` leaves at once through `leave`, which evaluates the conditions of its outgoing flow. The catch is a scope activity, so `asyncBefore` and execution listeners take effect on it.
- `HistoryParseListener#parseIntermediateCatchEvent` writes no history for a Link catch (`HistoryParseListener.java:207-211`, "do not write history for link events").
- `LinkEventTest#testValidEventLink` observes only the waits after each Link and the four non-Link historic activity instances.

Classification: normative agreement, a new register entry `CIB-AGR-0018`: a Link pair continues the token as its explicit Sequence Flow would, records no activity instance and adds no wait. CIB pairs by the `linkEventDefinition` name in one resource-wide name space and ignores `source` and `target`. This account admits a definition only without those references and with each catch name unique in the resource, so name pairing and reference pairing cannot disagree on an admitted model and CIB deploys every admitted one.

## Required, optional and excluded scope

Required, for the nested scope-data profile only: every model the profile admits today, unchanged, plus Link pairs in the executed root Process's scopes (its root scope or a Sub-Process body), where:

- a throw is an `intermediateThrowEvent` with an identity, an optional name and exactly one contained `linkEventDefinition` with an optional `id`, a nonempty `name` and no `source` or `target`, with no CIB attribute or extension element, exactly one incoming flow and no outgoing flow;
- a catch is an `intermediateCatchEvent` of the same form, with no incoming flow and exactly one unconditioned outgoing flow;
- each Link name names exactly one throw and exactly one catch in the whole definition, and the throw, the catch, the throw's incoming flow and the catch's outgoing flow belong to one scope;
- the catch's outgoing flow does not enter a Link throw;
- the definition with every pair contracted, the throw's incoming flow retargeted to the catch's successor and the throw, the catch and the catch's outgoing flow removed, is admitted by the profile as it stands.

That last condition places Links wherever a Sequence Flow may stand: on serial paths, a re-entry back-edge, a Choice candidate (the incoming flow keeps its condition or default role), a Parallel branch, and around a fork or join.

Optional: several pairs in one definition and in one scope.

Excluded, each refused at admission:

- two or more throws of one name, the multiple-sources clause on which `PC-BASIC-02` stays open;
- a throw without a catch, a catch without a throw, two catches of one name anywhere in the definition (CIB's resource-wide name space), and a pair split across scopes;
- a catch with an incoming flow, which covers a catch after an Event-Based Gateway, and a throw with an outgoing flow;
- a throw with two incoming flows, a catch with two outgoing flows, a conditioned catch outgoing flow, and a catch whose successor is a Link throw (a chain);
- `source`, `target` or `eventDefinitionRef`, a second EventDefinition, and any CIB attribute or extension element such as `camunda:asyncBefore` or an execution listener;
- Links in any Process other than the executed root, including a called Process, whose body stays one to three User Tasks;
- every other profile.

These bound admission only. Admitting multiple sources or chains later adds forms without reinterpreting an admitted model, and the resource-wide name rule is already CIB's, so no admitted model is refused when the account broadens.

## Profile and public contract

The profile `cibseven-2.2.0-nested-embedded-scope-data-draft` grows in place under the [cumulative profile rule](../../contracts/README.md). Its value domain, Start contract, effect contract and closure limit are unchanged. The [profile artifact](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/profile.json) adds Clause 10.5.5, `CIB-AGR-0018` and the feature `link-event-pairs`, and narrows its exclusions; the [profile README](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/README.md) states the class.

Observation adds no field and publishes nothing for a Link Event: no occurrence, no wait and no committed step. The checked-process wire contract gains two node variants in the [checked-process schema](../../contracts/schemas/checked-process.schema.json), `linkThrowEvent` and `linkCatchEvent`, each with an `id` and a `linkName`. Every producer, consumer and fixture moves together under the [pre-release evolution policy](../PROJECT-DESIGN.md#pre-release-evolution-policy). The Semantic Process IL does not change.

## Representation and runtime ownership

- **Checked graph.** Two new arms of `CheckedNode` in [`CheckedProcessContract`](../../BpmnSemantics/CheckedProcessContract.lean), `linkThrowEvent (id : NodeId) (linkName : String)` and `linkCatchEvent (id : NodeId) (linkName : String)`, and the matching `CheckedNodeKind` members in TypeScript. The checked graph keeps the source kinds and Sequence Flows as written, so normalization stays separate from import, as the [authority model](../../CLAUDE.md#non-negotiable-boundaries) requires.
- **Link contraction.** A new leaf per language, `LinkContraction` in Lean and `link-contraction.ts` in [`@bpmn-lean/bpmn-source`](../../packages/bpmn-source/src/), owns one partial function `contractLinks?` from a checked process to its explicit-flow twin. On a graph without Link arms it returns the graph itself after one linear scan of the nodes. It refuses any Link arm under another profile. Before it removes anything it checks, over the raw graph, every rule that must see the removed elements:
  - node and flow ids nonempty and strictly sorted, and no node id equal to a flow id;
  - a nonempty Link name;
  - each throw, catch, throw incoming flow and catch outgoing flow owned exactly once, all four by one scope;
  - an unconditioned catch outgoing flow;
  - the pairing rules of the required scope.

  For each pair it then retargets the throw's incoming flow to the catch's successor. It removes the throw, the catch, the catch's outgoing flow and their scope-ownership entries, and keeps every other node, flow, condition, default and record unchanged. The leaf also defines `linkedCheckedWellFormed` (the contraction succeeds and `checkedWellFormed` accepts its result), `lowerLinkedCheckedProcess` (`lowerCheckedProcess` of the contraction, or of the raw graph when the contraction refuses, so it claims meaning only under `linkedCheckedWellFormed`, as the lowering does under `checkedWellFormed`) and `linkedDefinitionBindingValid` (the same over the linked pair).
- **Link-free core.** `checkedWellFormed` and `lowerCheckedProcess` and their TypeScript twins in [checked admission](../../packages/bpmn-source/src/checked-process-admission.ts) and [lowering](../../packages/bpmn-source/src/semantic-process-lowering.ts) do not contract. Their exhaustive matches refuse both arms (`checkedNodeArityValid`) and lower them to no operation (`lowerNode`). Their callers, their laws (among them `lower_preserves_sequence_flow_origins`, which stays true of the raw graph it is stated over), the proofs that unfold the lowering and every kernel-decided fixture keep their statements and cost. Under every profile the analyses, routers, burst rules, `ProfileCardinalities`' shape counts and `definitionBindingValid` need no Link case, because no Link arm reaches them.
- **Boundaries that see a raw Link graph contract first.** In Lean, `validateDefinitionInput` in [`DefinitionInput`](../../BpmnSemantics/SemanticProcessJson/DefinitionInput.lean) checks `linkedCheckedWellFormed` and compares the supplied Program with `lowerLinkedCheckedProcess`. In TypeScript, the [nested scope-data source reader](../../packages/bpmn-source/src/nested-scope-data-source.ts) contracts the projected graph once, before its `admitted` hook and before `isAdmittedCheckedProcess`, so `structuredScopeDataCheckedAnalysis` and `effectResultReachesDefaultlessChoice` in [`defaultless-choice-effect-closure.ts`](../../packages/bpmn-source/src/defaultless-choice-effect-closure.ts) see the twin, and the [compiler](../../packages/bpmn-source/src/compile.ts) lowers through `lowerLinkedCheckedProcess`. The emitted checked artifact stays the raw graph with its Link arms, so the Lean boundary re-derives the contraction independently. The diagnostic [`DefinitionAdmissionJsonMain`](../../BpmnSemantics/DefinitionAdmissionJsonMain.lean) reports `linkedCheckedWellFormed` for the same reason. No Temporal adapter module reads a checked graph.
- **Control places.** A Link definition's Program has one control place for every Sequence Flow of its contraction, so none for a catch's outgoing flow. The [Semantic Process IL](../SEMANTIC-PROCESS-IL-SPEC.md) statement of "one control place for every admitted Sequence Flow" describes its Link-free parallel example and stays true. The IL's general rules are stated over the Program and do not change.
- **Program.** The Program of a Link model equals, operation for operation and place for place, the Program of its twin, the definition identity aside. The incoming flow of the throw keeps its identity, so a Choice candidate, a default or a branch place keeps its origin.
- **Runtime.** Unchanged. No operation stands for a Link Event, so none publishes, waits or counts against the closure limit.

Rejected alternatives:

- a non-publishing one-input `mergeExclusive` with a new origin kind: it adds a committed step that CIB does not have, changes the IL, and charges the closure limit for a jump;
- contracting inside `checkedWellFormed` and `lowerCheckedProcess`: it falsifies `lower_preserves_sequence_flow_origins`, needs contraction laws in every proof that unfolds the lowering, and adds the scan to every kernel-decided fixture of every profile;
- aliasing places while lowering, without a checked normalization: every checked analysis would need its own Link case, and the analyses that decide admission would diverge from the lowering that decides behavior;
- contracting in the source reader: the checked graph would hold flows the source does not, and it would lose the Link kinds that the decoder, the schema and later families need.

## Admission

Admission stays [profile-parameterized](../PROFILE-PARAMETERIZED-ADMISSION-SPEC.md):

- **Source.** The [nested scope-data source reader](../../packages/bpmn-source/src/nested-scope-data-source.ts) projects an Intermediate Throw or Catch Event of the root Process's scopes with exactly one `linkEventDefinition`, whose enumerable keys are `$type`, an optional `id` and `name`, to its arm. It refuses the moddle properties `source` and `target` on both arms, and `eventDefinitionRef`, by name, as the None Throw reader refuses the reference, because they are non-enumerable and the key inventory cannot see them. It projects a Link Event of any Process of the resource, and the contraction refuses a pair outside the executed root Process. The Inclusive join's pairing walk reads the scope with its pairs contracted, so a pair on a region branch is admitted as its explicit flow is. Other profiles' readers keep refusing Link Events.
- **Checked validation.** The contraction decides arity, pairing, raw identity, ownership and the catch flow's condition. Its result then meets every rule a Link-free graph meets.
- **Analyses.** Unchanged. In TypeScript the reader's `admitted` hook and checked admission run on the contraction. In Lean the conformance module runs the profile's analyses on the contraction, and at the Program level on the identical Program.

Nearest wrong algorithms, each with a separating witness below:

1. lowering a Link pair as a pass-through step, which publishes two occurrences and charges two closure steps;
2. pairing by the Event's `name` instead of its `linkEventDefinition` name, or per scope instead of across the resource;
3. dropping the condition or default role of the throw's incoming flow, which keeps the catch's flow instead, or dropping a condition on the catch's outgoing flow;
4. admitting several throws of one name by giving the successor several producers;
5. admitting the arms under another profile, contracting at only one level, or running a profile analysis on the raw graph;
6. dropping the CIB-attribute refusal, which would pass an asynchronous continuation through as a jump.

## Stable rules

| Rule | Statement |
|---|---|
| `LNK-KIND-01` | The checked graph keeps a Link throw and catch as `linkThrowEvent` and `linkCatchEvent` with their Link name, never as a Task, None Throw or Sequence Flow, and the decoder refuses every other spelling. |
| `LNK-PAIR-01` | Each Link name names exactly one throw with one incoming flow and exactly one catch with one unconditioned outgoing flow in the whole definition, all four in one scope of the root Process; every other pairing form is refused. |
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
- **Event-name pairing (wrong algorithm 2):** the warranty model with the Event names of the throws *Back to repair* and *Release device* crossed and every definition name kept is admitted, and its Program equals the twin's. Pairing by Event name would join the rework flow to *Device released* and change the Program.
- **Refused edits**, each beside its admitted original. A refused graph has no Program, so each refusal is asserted at the source and checked levels:
  - a second throw *Back to repair* on another path (multiple sources, wrong algorithm 4);
  - the catch *To testing* removed, and a second catch *To testing* added;
  - a complete second pair *Back to repair* inside *Repair device*, beside the root pair: two catches of one name in two scopes (resource-wide names, wrong algorithm 2);
  - the catch *To testing* moved to the root, a cross-scope pair, kept as a regression check, since ownership already refuses the contracted flow;
  - the catch *Release device*'s outgoing flow conditioned (wrong algorithm 3);
  - an incoming flow added to a catch, an outgoing flow added to a throw, and a catch leading straight into another throw;
  - `camunda:asyncBefore` on a throw and an execution listener on a catch (wrong algorithm 6);
  - a `target` on the throw *Release device*'s definition, and a `source` on its catch's definition;
  - a Link pair interrupting a flow of the called Process of the [loan application](../../scenarios/call-variable-mapping/loan-application.bpmn), refused beside the admitted original.
- **Raw-graph analysis (wrong algorithm 5):** the warranty model with *Test device* removed, so the catch *To testing* leads to *Repair closed*, and *Device passes?* without a default, `Flow_Failed` conditioned on `stringEquals(testResult,"failed")`. The result of *Order spare part* reaches the default-less Choice only through the Link pair. `effectResultReachesDefaultlessChoice` accepts the raw graph and refuses its contraction, the reader refuses the model, and the explicit-flow twin is refused alike.
- **Profile control (minimal pair, wrong algorithm 5):** the employee onboarding model the embedded completion profile admits today, with one Link pair interrupting a root flow, is refused under that profile and admitted without it at the source level. Separately, the same Link-bearing checked graph relabelled to that profile's identity is refused by the contraction in both languages and so by `linkedCheckedWellFormed`, while the twin relabelled alike is admitted, so the profile test of the contraction is killed rather than masked by the source reader.
- **CIB calibration:** the CIB probe runs all four journeys and asserts each step's set of open tasks equals the twin's, compared as sets because a Link adds PVM operations inside one transaction on Parallel branches. It also asserts that no historic activity instance names a Link Event, and that the rework journey crosses the Go To loop once.

## Rule-to-evidence matrix

| Rule | Positive and negative witness | Lanes | Killing mutation |
|---|---|---|---|
| `LNK-KIND-01` | Both models hold the arms with their Link names; the decoder refuses an arm without `linkName` | Source, decoder, Lean conformance module | Project a Link Event as a None Throw |
| `LNK-PAIR-01` | Each pairing refusal beside its original; the crossed Event names admitted with the twin's Program | Source and checked levels, Lean conformance module | Pair by Event name; pair per scope; drop the single-source check; drop the catch-flow condition check |
| `LNK-CONT-01` | Program and checked twin equality; equal journey traces; no Link occurrence in core or CIB history | Source, core, pipeline, Lean conformance module, CIB probe | Lower a pair as pass-through steps; keep the catch's flow and drop the incoming condition |
| `LNK-ADMIT-01` | Both models admitted at both levels; each refused edit; the raw-graph analysis witness | Source and checked levels, Lean conformance module and `DefinitionInput` | Skip the contraction at one boundary; run the reader hook on the raw graph |
| `LNK-PROFILE-01` | The embedded completion minimal pair at the source and checked levels | Source, core and Lean checked levels | Contract under every profile |

## Lean assurance lane

Lane shape: checked

Evidence: the family adds no transition family, operation or runtime law. Its meaning is the contraction, a partial executable function on checked graphs whose result the existing admission and lowering decide. `lowerLinkedCheckedProcess` and `linkedCheckedWellFormed` are by definition the existing lowering and well-formedness of the contraction, so no existing law changes and no proof unfolds the contraction. [`Lowering`](../../BpmnSemantics/SemanticProcess/Lowering.lean), a hub near its size target, takes only the exhaustive-match arm, and [`DefinitionInput`](../../BpmnSemantics/SemanticProcessJson/DefinitionInput.lean) the linked entry points. A new executable conformance module, [`linkEventsConformanceChecks`](../../BpmnSemantics/LinkEventsConformance.lean#linkEventsConformanceChecks), holds:

- both models admitted at both levels, with `linkedDefinitionBindingValid`;
- the Program and checked twin equalities against transcriptions of the retained twins, and the crossed Event names;
- each refused pairing form, and the raw-graph analysis witness;
- the profile control;
- the decoder's refusal of a malformed arm.

What stays argued, not proved: that every admitted closure stays within the computed burst, as for the accounts it reuses. No new argument arises, since a contracted definition is its twin.

## Temporal hosting and refinement preflight

No new hosting mechanism. A Link adds no operation, so ingress, waits, timers, effects, cancellation, lifecycle, the publication projection and the continuation reader are unchanged. The preserved relation is equality of hosted committed state and publications with the core's, which for a Link model is the twin's. Delivery, ordering, deduplication, retry and replay risks are unchanged. The smallest witness is the hosted pipeline over both models' journeys at family closure.

## Evidence and acceptance

The models run as answer-free scenarios with four registered pipeline cases, each with a seeded mutation. They also get value-domain matrix rows, corpus rows and the About disclosure. A new CIB probe runs the four journeys as described above.

Then `PC-BASIC-02` is accepted for this profile's single-source pairs in the root and Sub-Process bodies, on its continuation-equivalence, repeated-occurrence, same-scope and refusal clauses, with duplicate targets refused across the resource as CIB refuses them. The row stays open on multiple sources.

The Product 2 definition projection is unaffected: its auto-layout reads generic flow nodes, so a Link model without DI lays out its throws without an outgoing flow and its catches without an incoming one, and the Human Task catalog holds no Link Event.

Nearest unsupported claims:

- multiple throws of one name, Link chains, and Links in called Processes, Multi-Instance bodies and every other profile;
- `source` and `target` references, which are refused rather than checked; [`PC-BASIC-04`](../PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) owns reference forms;
- that every actual closure stays within the admitted burst, which is not proved in Lean, as for the twins.

## Versioning consequences

Apply the [pre-release wire policy](../../contracts/README.md#evolution-policy). The checked-process schema gains two node variants, and every producer, consumer, fixture and test moves in one change, with no legacy reader or migration. No admitted model changes its Program, route or behavior, because no profile admits a Link Event today.

### Owners this implementation grows

Build cost is a constraint. The kernel type change is two `CheckedNode` arms, an interface edit of `CheckedProcessContract` whose cone is the whole library. As for the None Throw's arm, that is one complete rebuild landing in one commit. Every exhaustive match on `CheckedNode` takes an arm that refuses or ignores the Link kinds and no other change:

- `CheckedNode.id` in the contract;
- the JSON decoder `SemanticProcessJson/CheckedProcess`;
- `checkedNodeArityValid` in `CheckedProcessAdmission`, which refuses them;
- `lowerNode` in `Lowering`, which lowers them to no operation;
- `ProfileCardinalities`, `CheckedGraphValidation` and `InclusiveRegionWalk`;
- the six `Experiments/CheckedSource*` modules;
- any other match the compiler reports.

`checkedWellFormed`, `lowerCheckedProcess` and their laws keep their bodies. The new leaf `LinkContraction` imports the contract, `CheckedProcessAdmission`, `Lowering` and `DefinitionBindingValidation`. Only `DefinitionInput`, a body edit, and the conformance module import it. No kernel-decided fixture reduces the contraction. `what-binds` reports the headroom of the touched owners at implementation; `Lowering` and the TypeScript checked admission are close to their size target, so the arm and the reader edit are their only growth.

TypeScript owners:
- the [checked-process contract](../../packages/semantic-core/src/checked-process-contract.ts) and schema reader;
- the new `link-contraction.ts` in `@bpmn-lean/bpmn-source`;
- the [nested scope-data source reader](../../packages/bpmn-source/src/nested-scope-data-source.ts) and its hook;
- the [compiler](../../packages/bpmn-source/src/compile.ts).

The arity rule in [checked admission](../../packages/bpmn-source/src/checked-process-admission.ts) refuses the arms, and [lowering](../../packages/bpmn-source/src/semantic-process-lowering.ts) lowers them to nothing. [`defaultless-choice-effect-closure.ts`](../../packages/bpmn-source/src/defaultless-choice-effect-closure.ts), the structured scope-data routing and `nested-scope-control-admission.ts` take no Link case, because the reader hands them only the contraction.

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
| Proposal | `945479ad` | `fork-turns-none` | `approve-with-required-edits` | `5b1591ac` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-required` | `not-applicable` |
| Closure | `653296d4` | `fork-turns-none` | `approve-with-required-edits` | `34878019` |
