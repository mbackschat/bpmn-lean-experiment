# Preserve-only admission specification

## Status

**Owner-approved on 2026-08-08 after independent cold review, and fully implemented.** It approves the admission capability that opens M1 of [the showcase milestone ladder](PLAN.md#showcase-milestone-ladder): a third party can deploy their own BPMN file. It changes what source is admitted, what the compiler retains, and how a refusal is reported; it changes no runtime transition family, no semantic meaning of any executed construct, and no public observation. [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md) owns the exact reached and absent scope, and the five `BPMN-STRUCT-` rows in [the requirement ledger](BPMN-REQUIREMENT-LEDGER.md#reviewed-requirements) dispose what retention structurally supports. Its closure review returned `approve` on 2026-08-08 after two correction rounds, so it graduated from `-PROPOSAL` to `-SPEC` under [DOC-DISCIPLINE.md](DOC-DISCIPLINE.md).

Admission structure is owned by [the profile-parameterized admission specification](PROFILE-PARAMETERIZED-ADMISSION-SPEC.md), which this proposal extends rather than replaces. Requirement dispositions belong to [the requirement ledger](BPMN-REQUIREMENT-LEDGER.md), sequencing to [PLAN.md](PLAN.md), and exact implemented and absent scope to [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md). The external recommendation this responds to is [the minimal engine research](research/MINIMAL-USEFUL-BPMN-ENGINE-RESEARCH.md); it disposes no BPMN requirement.

## The question

What is the smallest admission change that lets a file a modeler actually saved compile, without the engine acquiring meaning it cannot check?

The gap is in the **generic** profile, not the whole repository. [The generic compiler](../packages/bpmn-source/src/checked-process-compiler.ts) admits `bpmn:Definitions` with only `$type`, `id`, `targetNamespace`, `expressionLanguage`, and `rootElements`, and a `bpmn:Process` with only `$type`, `id`, `name`, `isExecutable`, and `flowElements`. Every modeler writes Diagram Interchange, so a modeler file is rejected at the first allowlist under every standards profile.

**One profile already does a narrow version of what this proposes**, and the proposal is a generalization rather than a new idea. [The A12 CreateDocument reader](../packages/bpmn-source/src/a12-create-document-source.ts) admits `diagrams`, `exporter`, and `exporterVersion`, and its registered fixture carries eight DI elements. It retains that material in the exact source bytes while refusing any unrecognized executable node, attribute, or extension. That is the execute/preserve/reject split applied to one hand-selected shape; what is missing is a profile-parameterized form of it.

Two failure modes bound the answer. **Silently ignoring** an unsupported executable construct produces a Process that deploys successfully and omits intended business behavior, which is the failure the external research names as decisive. **Admitting preserved material into the executed representation** makes every existing law's hypotheses quietly weaker, because a term the semantics never inspects still travels through the structures the theorems quantify over.

## Recommended design

### D1 — The partition is internal, and the public result stays all-or-nothing

**Recommendation: partition inside the compiler, and keep the published contract exactly `Accepted | Rejected`.**

Classification is three-way internally: an **executed** set that becomes the checked graph exactly as today, a **preserved** set retained without token-flow meaning, and a **rejected** set. The checked graph, the Semantic Process IL, Lean, the semantic core, and the Temporal adapter see only the executed partition.

**The public contract does not become three-way.** [`AcceptedBpmnCompilation`](../packages/bpmn-source/src/contracts.ts) types its diagnostics as `readonly []`, the empty tuple, so an accepted compilation cannot carry a diagnostic at all. That invariant is deliberate and stays: **any rejected element yields `Rejected`, with no checked graph and no program.** There is no partially admitted definition. A preserved element is not a diagnostic, so preservation never populates that field.

Raw `bpmn-moddle` objects never leave `@bpmn-lean/bpmn-source`, under the existing boundary rule. Whatever preserved material is retained crosses that boundary only as exact source bytes or a project-owned serializable contract.

The alternative, threading preserved material through the checked graph as an inert field, was rejected. It would place unexamined content inside the structure every existing Lean theorem quantifies over, so each law would need re-reading to confirm it still says what it said. The proof obligation would grow with the feature rather than being discharged once.

### D2 — A closed recursive classifier, not a flat list

**Recommendation: classify by a total, profile-parameterized function over the parsed tree, where a container is preserved only if every descendant is.**

A flat preserved set is unsound, because preserving a container would conceal executable descendants: a preserved `Collaboration` holding an executable element, or a preserved `extensionElements` holding a listener, would admit exactly the silent-omission failure this proposal exists to prevent. The classifier is therefore recursive and context-aware, and takes four inputs beyond the element itself: the selected profile, the containment path, the descendant classification, and the resolution of every QName and IDREF the element carries.

Four rules bound it.

**A container is preserved only when its complete descendant set is preserved.**

**Foreign content is preserved only at an explicitly inert QName and locus combination the profile declares**, and rejects everywhere else. The default is rejection, and the inert set is enumerated rather than inferred. **`mustUnderstand="true"` rejects unless the profile understands it**, which is what that attribute means.

**For M1 that enumerated set is empty**, so the rule reduces to rejecting foreign content at every locus, and `mustUnderstand="true"` rejects along with everything else rather than through a rule of its own. The machinery a non-empty set needs — expanded `namespace#localName` matching resolved against the document's prefix bindings — lands with the first profile that declares one, because matching a raw prefix would admit content by spelling. Two attribute classes are admitted and neither is foreign content: XML namespace declarations, and the XML Schema instance attributes described in D3's implementation note.

**A preserved element may reference an executed one when the profile declares that reference inert.** Such a reference is admitted when its namespace, its referring type, its identity, and its target are all valid. It is rejected when unresolved, wrong-typed, ambiguous, or **execution-affecting**; a reference the engine reads during lowering is not inert regardless of where it sits.

Target-type validity is decided against the parser's own metamodel rather than a project-owned type table, because a second copy of the BPMN and DI hierarchies would be the weaker of the two. It needs its own rule: `bpmn-moddle` resolves an IDREF by identity alone, reports an unresolvable target as a warning that already blocks admission, and never checks that the element it found is the kind the referring property declares.

An earlier draft of this rule said the opposite, that any preserved-to-executed reference is a rejection, and that was self-defeating. Diagram Interchange exists to point at executed elements. In the already-admitted A12 fixture every `BPMNShape.bpmnElement` resolves to a declared executed element, so the rule would have rejected a file that compiles today, and `BPMNEdge.bpmnElement`, `Lane.flowNodeRef`, and `Participant.processRef` are the same shape.

The table below is the intended classification, not the algorithm. It is a statement of which constructs the classifier must place where, and each row is subject to the recursive rule above.

| Preserved | Rejected when present |
|---|---|
| Diagram Interchange: shapes, edges, waypoints, labels | Any flow node whose type the executed profile does not implement |
| Pools, participants, and collaborations | Data associations, which carry data-flow meaning |
| Lanes and lane sets | Executable extension elements the profile does not recognize |
| Message flows between participants | A second executable Process in the same definition |
| Associations, text annotations, and groups | Any construct whose omission changes execution |
| — | **The complete BPMN data family**: `dataObject`, `dataObjectReference`, `dataStore`, `dataStoreReference`, `itemDefinition`, and every `dataInputAssociation`, `dataOutputAssociation`, `ioSpecification`, `property`, and `dataState` |
| Documentation at any `BaseElement` locus, executed elements included | A second executable Process that is **unrelated or unbound** by any profile QName |
| Foreign content at a profile-declared inert QName and locus | Foreign content anywhere else, and any `mustUnderstand="true"` the profile does not understand |

The discriminator behind the table is one question: would omitting this construct change what the engine executes? If yes it is rejected, never preserved. The discriminator alone does not decide a tree, which is why the classifier and not the table is the contract.

**The owner rejected the complete data family for M1 on 2026-08-08**, overriding an earlier draft that preserved bare `dataObject` and `dataStoreReference` declarations while rejecting their associations. That split was safe only in theory, because its enumerated shapes are not a coherent slice of real modeler output. Measured over the 840 files of the pinned MIWG corpus: 232 files contain a `dataObject` and **217 of those also contain a `dataObjectReference`**, which the split did not admit; 156 contain a `dataStoreReference` and **130 carry `dataStoreRef`**; and 125 `dataObject` files carry `isCollection`. A displayed Data Object is normally a reference to a declaration, and `itemSubjectRef` pulls in an `itemDefinition` root that would itself need preserving and resolving.

So the split would have rejected most real files using these constructs while still paying for classifier and reference-resolution work. Rejecting the family outright gives M1 a smaller closed contract and costs nothing the User Task floor needs.

**Reopen when a named M1 model requires data notation.** At that point preserve one coherent data-notation subgraph — declarations, references, referenced definitions, and their DI links together — while continuing to reject associations, transformations, assignments, and every runtime data semantic.

### D3 — Typed per-element diagnostics with a deterministic identity

**Recommendation: report every rejected element with a typed record whose BPMN ID is nullable.**

Today an unsupported file yields one message about the whole compilation. A third party cannot act on that. But a diagnostic keyed on the BPMN ID cannot be required, and the reason turns out to be a normative disagreement rather than a simple fact.

**`Semantic.xsd` declares `<xsd:attribute name="id" type="xsd:ID" use="optional"/>`**, so an XML instance may legally omit it. The diagnostic contract follows the XSD, because diagnostics describe instance documents.

Verifying that surfaced a separate observation, recorded here only so it is not lost and **explicitly outside this proposal's scope**: `BPMN20.cmof` declares `BaseElement-id` with no explicit `lower` or `upper`, which under CMOF defaults to `1..1`, and [the project's metamodel manifest](../packages/bpmn-source/src/bpmn-2.0.2-semantic-process-metamodel.json) records `lower: 1` accordingly. That manifest predates this proposal and no disposition of it is proposed here; it belongs to a separate metamodel decision. Nothing in this proposal depends on how that resolves, because the nullable diagnostic ID follows the XSD regardless.

Each record carries the **nullable** BPMN ID, the element type, a **deterministic containment identity** that locates the element when the ID is absent, a **stable reason code** rather than prose, the profile capability the element would require, and a defined ordering. Records are deduplicated. The list is deterministic for identical source bytes, so it can be compared and stored.

Complete enumeration of *classification* results is conditional: it applies only once parsing has succeeded **warning-free**, because a parser warning is admission-blocking before classification runs and a malformed document cannot be exhaustively classified.

That case still yields a **list, not a single diagnostic**. Every parser warning is normalized into the same typed record and all of them are retained, because a file with four malformed constructs must tell its author about four. Collapsing them would reintroduce the one-message-per-file failure this decision exists to remove, at exactly the moment the author most needs the detail.

**The per-element claim is bounded to classification, and the boundary is stated rather than left to a reader.** An element is rejected by *classification*: its type, an own property **at the `Definitions` or `Process` locus**, or a foreign attribute the profile does not consume. A refusal stated over the whole document or over the checked graph — encoding, the root-definition multiset, identity distinctness, connectivity, arity, profile cardinality — rejects the source rather than an element, and carries no element, because naming one there would be a location the compiler cannot justify. Both kinds are the same typed record, and the nullable element is what makes the difference visible instead of guessable.

**Two locus limits are part of the implemented contract rather than omissions to discover.** An unadmitted own property on an *executed flow node* refuses without naming it, because the per-type admitted key sets live inside the projection predicates and return a boolean; and the three profiles that admit one hand-selected model shape report one document-level refusal instead of a located list. Both are safe — every case still rejects, so no construct is silently discarded — and both cost diagnostic quality on likely input, `bpmn:extensionElements` on a task most of all. Locating them means extracting a shared per-type key inventory and classifying flow elements before projection, which widens where classification is decided rather than correcting a claim, so it is scheduled as its own increment.

**A third kind sits before classification and is located anyway: a malformed source.** A parser warning is one, and the reference-target-type rule is the other. Both name their element, and neither is collected with classification records, because a document whose own references do not resolve to the kinds their properties declare cannot be exhaustively classified — the same reason already given above for parser warnings. That rule takes no profile parameter, so it is applied once above the profile dispatch; installing it per source reader is what let two readers omit it while the module claimed uniform application.

This is an admission-diagnostic contract, not a semantic observation: it exists before Workflow start, it is not part of any Process state, and no rejected element ever reaches the IL.

**Implementation note: the two attribute classes admitted beside foreign content.** XML namespace declarations bind a prefix and are not content. Three XML Schema instance attributes are admitted for two different reasons, and the distinction matters because calling them all content-free would be false. `xsi:schemaLocation` and `xsi:noNamespaceSchemaLocation` genuinely are content-free: they tell a validating parser where to find a schema. `xsi:type` is **not** — it selects the element type the parser resolves, so a `conditionExpression` carrying `bpmn:tFormalExpression` parses as a `FormalExpression` and one carrying `tExpression` parses as an `Expression`. It is admitted on the same ground as the Service Task's `camunda` attributes: the meaning it carries has already been applied and is visible in the resolved type for every projector to judge. `xsi:nil` is refused, because it empties an element's content. Refusing the admitted three is not an option: 37% of the 840 files in the pinned MIWG corpus carry `xsi:schemaLocation` and 30% carry `xsi:type`.

### D4 — One executable entry Process for generic profiles, without breaking existing ones

**Recommendation: extend root-definition selection with a rule that is profile-parameterized, and document the roles existing profiles already give to non-entry roots.**

The earlier form of this decision, that a second root with `isExecutable="true"` is a rejection, was wrong and would have broken a closed capsule. [The Call Activity reader](../packages/bpmn-source/src/call-activity-source.ts) requires **exactly two Process roots** and projects both, because a called Process is a genuine second executable Process reached through a QName. That profile is implemented, evidence-closed, and graduated.

The rule is therefore: a generic profile selects **one executable entry Process**, and additional executable Processes are admitted only when a profile binds them by QName, as Call Activity does. Everything else is preserved or rejected by D2.

Three root kinds are **executed support artifacts, not preserved remainder**, and this proposal must not reclassify them: `Message` and `Interface` roots consumed by the Message and Receive Task profiles, and `Error` roots consumed by the boundary-Error profiles. They carry no tokens but they are read during lowering, so preserving them would silently remove meaning that existing capsules depend on.

### D5 — The Lean lane is checked, not proved, and this is a narrowing

**Recommendation: declare the lane `checked` under [the assurance-lane rule](PROJECT-DESIGN.md#lean-assurance-lane), and record the boundary rather than implying a theorem.**

The milestone's research question is non-interference of preserved payload. Under D1 the honest statement is about the TypeScript compiler over parsed input, and Lean cannot state it without modelling a BPMN parser it does not have; Lean receives only the compiler's result.

**Byte-identical graph equality is the wrong predicate and would never hold.** `CheckedProcessIdentity` carries `sourceSha256`, so a source and its preserved-material-stripped twin necessarily produce different checked graphs: stripping the material changes the bytes, which changes the digest, which is part of the graph. A guard written as stated would fail on every pair for a reason unrelated to non-interference.

The predicate is therefore equality of an **explicitly defined execution projection**: the checked graph with exact-source identity normalized away, and nothing else normalized. Digest fidelity is then checked **separately**, by requiring each compilation to retain its own source digest, so normalizing identity for one comparison does not quietly stop anyone from checking it.

Two further conditions keep the guard from being common-mode with the thing it checks. The **source/twin generator is independent of the production classifier** — a twin produced by asking the classifier what to strip would agree with the classifier by construction. And the guard carries a **seeded defect it must reject**, a classifier that lets one preserved construct reach the executed partition.

**The unresolved boundary is explicit:** this is exhaustive over the fixture family and quantified over nothing. A quantified statement needs either a Lean-side parser or a checked-source relation, and the second is what [the frozen C2 experiment](experiments/CHECKED-SOURCE-RELATION-EXPERIMENT.md) failed to close within its effort bound.

### D6 — C2 stays frozen, and the trigger is answered rather than ignored

**Recommendation: record that the C2 reopen trigger fires here and that the decision is not to reopen.**

The 2026-07-26 C2 freeze reopens *before admission widens beyond the two fixture-pinned topologies*. M1 widens admission, so the trigger fires and owes an answer.

The answer is that **the risk C2 studied remains unchanged, and this proposal does not remove it.** That experiment's separating witness was positional lowering, where a defect pairs task and flow identifiers by position rather than by source and target. Preserved material never reaches lowering under D1, so it does not enlarge that defect class. Reopening a roughly 700-line Lean experiment to cover material the lowering never sees would spend the effort where the risk is not.

This holds **conditional on D5's corrected guard actually landing**, including its independent twin generator and its seeded defect. If the guard degenerates into one that shares its classifier with production, the argument for not reopening loses its evidence and the trigger should be re-answered.

## Required, optional, excluded

**Required for M1.** The three-way partition; the preserved set of D2; per-element diagnostics; multi-root admission with explicit executable selection; the non-interference differential guard; retention of the exact source bytes; and one narrowly stated **structural** requirement-ledger row per preserved construct family, which becomes `supported` on its evidence while the corresponding **operational** requirement stays `unsupported`.

**Optional, and not scheduled here.** Rendering preserved DI in a product surface; a preserved-material query API; retaining preserved material through to any public observation.

**Excluded.** Any execution semantics for a preserved construct. Multi-participant execution, message flow delivery, lane-based assignment, and data-object values remain unimplemented, and preserving their source is not a step toward claiming them. No preserved construct enters the IL, the runtime state, or the canonical observation. This proposal claims no BPMN conformance and selects no CIB relationship.

## Temporal hosting and refinement preflight

This proposal adds **no** semantic transition family, so the preflight is short by content rather than by omission, and its conclusion is that the adapter is untouched.

Admission runs entirely before Workflow start. No durable ingress, wait, timer, effect, cancellation, or lifecycle mechanism is added or changed. The executed partition equals what the adapter hosts today for the same executable content **under the identity-normalized execution projection of D5, not byte-identically**: a preserve-enabled source and its stripped twin carry different bytes, so each program retains its own distinct exact-source digest and the raw structures differ in that field alone. The state relation the adapter preserves is unchanged, because the object it relates is the executed partition.

Two things the preflight must state rather than assume. **Preserved material must not enter the Workflow argument**, or it would enter Event History and become a replay-compatibility surface that the pre-release policy forbids adding before a durable baseline; the admitted definition the Workflow receives stays the executed partition. And **the diagnostic list is not a Workflow input**: rejection happens before start, so a rejected definition never reaches Temporal at all.

The residual risk is size, not semantics. Retaining exact source bytes for a modeler file is larger than the current fixtures, and the existing byte limit and parser deadline apply unchanged; the production bounded-Worker requirement for untrusted uploads is recorded in `CLAUDE.md` and is not resolved here.

## Profile versioning

Widening admission changes what a profile admits, so this takes a version change rather than an in-place edit, under [the pre-release evolution policy](PROJECT-DESIGN.md#pre-release-evolution-policy).

**Recommendation: one named preserve-enabled successor to the product-floor User Task profile**, not a new profile family and not a bump of every profile. The engine runner already exercises that profile end to end, so the successor inherits a live example, a registered scenario, and a pipeline case rather than needing new ones. Every other profile stays exactly as it is, so no immutable evidence-bound profile is widened and no retained source bytes are replaced.

The successor's name, and whether later profiles gain preserve-enabled successors one at a time or by a shared capability, are implementation decisions for the approved capsule rather than this proposal.

## Producers and consumers this changes

| Owner | Change |
|---|---|
| [the checked-process compiler](../packages/bpmn-source/src/checked-process-compiler.ts) | the two allowlists become classifier calls |
| [compile.ts](../packages/bpmn-source/src/compile.ts) | assembles the partition and the diagnostic list |
| [contracts.ts](../packages/bpmn-source/src/contracts.ts) | adds the diagnostic record type; `Accepted \| Rejected` unchanged |
| [root-definition selection](../packages/bpmn-source/src/root-definition-selection.ts) | profile-parameterized entry selection |
| a new preserved-set classifier | new owner, recursive and profile-aware |
| profile artifacts, scenarios, and pipeline cases | one atomic registration under the roundtrip guard |

**Consumers** of the compilation result, each of which sees the changed diagnostic type or the successor profile:

| Consumer | Why it is affected |
|---|---|
| the Temporal command-line product surface | renders the admission result and must render a list |
| [the differential pipeline](../packages/differential) | registers the successor profile's case |
| the Temporal adapter's pre-start admission path | consumes `Accepted \| Rejected`, unchanged in shape |
| [the BPMN source package tests](../packages/bpmn-source/test) | own the admitted and refused sets |
| the package registry README | lists the package's public surface |

**Binding guards** beyond those already listed: the pre-release architecture guard, the wire-schema guards for any new diagnostic contract, and the erasable-syntax and harness type gates for directly executed surfaces.

Unchanged and deliberately so: the Semantic Process IL, Lean, the semantic core, the Temporal adapter's hosting behavior, and every canonical observation.

## Separating negative evidence

Each is a case that must fail before the change and pass after, or the reverse. A green gate over admitted files alone would not distinguish this feature from a wider allowlist.

| Witness | Must |
|---|---|
| A modeler file with DI and one unsupported executable node | reject, naming that node, not the DI |
| A preserved container holding an executable descendant | reject, not preserve the container |
| `mustUnderstand="true"` on unrecognized foreign content | reject |
| A preserved reference resolving to the wrong target type: a shape to a plane, a participant to a User Task, a lane to a Process | each reject, because the parser resolves an IDREF by identity alone and never checks the referring property's declared type |
| A source and its stripped twin | agree on the execution projection |
| A seeded classifier that leaks one preserved construct into the executed partition | be rejected by the D5 guard |
| An element with no `id` | produce a diagnostic with a resolvable containment identity |
| An unrelated, QName-unbound second executable Process | reject |
| The Call Activity fixture's two Process roots | still be accepted; its **valid** shape is unchanged, while its foreign-attribute and reference-target admission is tightened along with every other profile's |
| A bare `dataObject` declaration, a `dataObjectReference`, and a `dataInputAssociation` | each reject, since M1 rejects the whole data family |
| A file with four parser warnings | produce four normalized diagnostics, not one |
| Foreign content at any locus, executed or preserved | reject, because this profile declares no inert QName and locus; the paired preserve case reopens with the first profile that declares one |
| A DI reference to a declared executed element, and one to a missing target | be preserved, and rejected, respectively |
| `documentation` on an executed User Task, Start Event, and Sequence Flow | be retained without reaching the checked graph or the program, since BPMN declares it on `BaseElement` |
| The stripped twin's closure bound, enabledness, stable-state resumability, and host capability | be **inherited unchanged** by the preserve-enabled source, each asserted explicitly rather than assumed to follow from projection equality |

## What already binds this work

### Executable guards

- [the source-hygiene gate](../scripts/source-hygiene.test.ts), which owns the module ceilings named below;
- [the metamodel-default admission guard](../packages/bpmn-source/test/metamodel-default-admission.test.ts), which derives its cases from the scenario registry and manifest, so a widened admitted set is covered without being listed;
- [the artifact roundtrip guard](../scripts/capsule-roundtrip.test.ts) and [the pipeline catalog](../packages/differential/test/pipeline-catalog.test.ts), which require a profile, its scenarios, and its cases to land atomically;
- [the review-policy guard](../scripts/independent-review-policy.test.ts), which reads owner approval only from the Status section above;
- [the plan-shape guard](../scripts/plan-status-consistency.test.ts) and [the reviewability guard](../scripts/document-reviewability.test.ts), which bound this document's owners.

### Source owners this will grow

Measured, not estimated:

| Owner | Nonblank | Headroom |
|---|---:|---:|
| [the checked-process compiler](../packages/bpmn-source/src/checked-process-compiler.ts) | 518 | 82 |
| [compile.ts](../packages/bpmn-source/src/compile.ts) | 316 | 284 |
| [root-definition selection](../packages/bpmn-source/src/root-definition-selection.ts) | 190 | 410 |
| [contracts.ts](../packages/bpmn-source/src/contracts.ts) | 70 | 530 |
| [the A12 CreateDocument reader](../packages/bpmn-source/src/a12-create-document-source.ts) | 321 | 279 |
| [the Call Activity reader](../packages/bpmn-source/src/call-activity-source.ts) | 327 | 273 |

The compiler's 82 lines will not hold the classification calls, the partition assembly, and the diagnostic list. **The extraction lands as its own behavior-preserving commit before any semantics**, under [the code-hygiene rule](../CLAUDE.md#code-hygiene-and-module-boundaries).

The natural seam is the preserved-set classifier, and an earlier draft of this proposal called it *a pure function of a parsed element that needs nothing from compilation*. D2 refutes that: it needs the profile, the containment path, the descendant classification, and reference resolution. It is still a clean owner, because all four are inputs rather than compiler state, but it is not the trivial extraction that phrasing implied and should not be scheduled as one.

## Open decisions for the owner

All three were **decided by the owner on 2026-08-08**, two of them against the recommendation this proposal had made.

1. **Reject the complete data family for M1**, rather than splitting declarations from associations. The reasoning and the corpus measurement behind it are recorded in D2 above, together with the reopen condition.
2. **Do not add `preserved` as a requirement-ledger disposition.** Record preservation as a narrowly stated **structural requirement** instead, which the existing vocabulary already handles.
3. **Do not add a normalized preserved-subtree contract.** The required exact bytes already carry source identity, storage, diagram rendering, and later reparsing under an explicitly selected profile. The classifier may use an internal transient representation without publishing it.

### Why `preserved` is not a disposition

This proposal recommended adding it and that was wrong, in a way worth recording because the error is a category mistake rather than a judgment call.

`preserved` describes **how the source compiler treats an element**. [The ledger's four dispositions](BPMN-REQUIREMENT-LEDGER.md#dispositions) describe **what the project has decided about a requirement**. Those are different dimensions, and the same Data Object can sit in both at once: structurally imported and retained, while operationally unsupported. A vocabulary that has to express both would make a row's disposition depend on whether the row describes syntax or behavior, and it would complicate the existing guard that treats only `supported` and `rejected` as decided outcomes.

The structural form needs no new vocabulary. A requirement such as *"the selected profile imports and retains BPMN DI without exposing it to execution"* becomes `supported` once evidenced, while the Collaboration, Message Flow, and Data Object **operational** requirements stay `unsupported`. That reports the additional coverage honestly without letting structural admission read as executable support. The exact preserved-element inventory belongs to the profile and [the implementation map](IMPLEMENTATION-MAP.md), not to the disposition vocabulary.

## Reopen conditions

Reopen before preserving any construct that can change execution, before admitting a **new, QName-unbound** executable Process, before a preserved construct reaches the IL or any public observation, or if the non-interference guard cannot be made to fail on a seeded defect.

The second condition does not touch the existing Call Activity profile, whose two executable Process roots are bound by QName and are already admitted, evidence-closed, and graduated.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `95d7160` | `fork-turns-none` | `approve-with-required-edits` | `96bd2e7` |
| Semantic checkpoint | `2deb802` | `fork-turns-none` | `approve-with-required-edits` | `9923b02` |
| Closure | `a16319d` | `fork-turns-none` | `approve-with-required-edits` | `1a7924e` |

The proposal stage used **two correction rounds**. The context-cold review of target `95d7160` returned `approve-with-required-edits` across seven findings; corrections `c104aad` and `e70742f` were audited and returned nine further required corrections, of which one was blocking. Those landed at `96bd2e7`, which the owner decided on 2026-08-08 not to send for a third audit.

**Three of the seven-plus-nine findings were restrictions this proposal wrote without checking them against existing source**, and each would have broken something already implemented: rejecting a second executable Process would have rejected the graduated Call Activity profile, byte-identical checked-graph equality can never hold because `sourceSha256` is part of the graph, and rejecting preserved-to-executed references would have rejected all Diagram Interchange, which is the construct this proposal exists to admit. A tightening reads as safe and therefore received less verification than a widening would have.

The semantic-checkpoint stage used **two correction rounds and an owner decision**, and its first target was withdrawn. Target `2b1a133` was superseded before review because the root's own repository-wide gate found it red: a registered profile with no live example config, an obligation reached through the profile enum rather than through any path the change edited. Review ran against `2deb802` and returned `approve-with-required-edits` across nine findings, two blocking. Round one closed eight at `ab29717`; round two closed the retained normative-provenance finding at `9923b02` and raised one new required finding against the guard that correction added. That guard compared only a reference's numeral, so a profile's `Table 13.2` authorized a scenario's `Clause 13.2`. It is corrected at `c915628`, which the owner accepted without a third audit round under [the two-round bound](TESTING-SPEC.md#independent-cold-review-gate).

**Two of the review's findings were defects the implementation had, not gaps in its account**, and both were reproduced before correction: a resolved reference was never checked against its property's declared target type, so a shape could point at a plane; and `documentation` was retained only on `Definitions` and `Process` while BPMN declares it on `BaseElement`. A third was a defect in the *guard* rather than the artifact: the normative-resolution gate globbed only `*.scenario.json` and had never checked any of the eleven primary `scenario.json` files, which is why an invented clause number passed it.
