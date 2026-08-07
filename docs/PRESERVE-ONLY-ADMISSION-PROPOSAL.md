# Preserve-only admission proposal

## Status

**Drafted, not owner-approved, not implemented, and not yet independently reviewed.** It proposes the admission capability that opens M1 of [the showcase milestone ladder](PLAN.md#showcase-milestone-ladder): a third party can deploy their own BPMN file. It changes what source is admitted and what the compiler retains; it changes no runtime transition family, no semantic meaning of any executed construct, and no public observation.

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

Four rules bound it. **A container is preserved only when its complete descendant set is preserved.** **Unknown foreign content rejects by default at any execution-bearing location**, and is preserved only at locations the profile declares inert. **`mustUnderstand="true"` rejects unless the profile understands it**, which is what that attribute means. **Every QName and IDREF resolves**, or the definition is rejected; a preserved element pointing at an executed one is a rejection, not a preservation.

The table below is the intended classification, not the algorithm. It is a statement of which constructs the classifier must place where, and each row is subject to the recursive rule above.

| Preserved | Rejected when present |
|---|---|
| Diagram Interchange: shapes, edges, waypoints, labels | Any flow node whose type the executed profile does not implement |
| Pools, participants, and collaborations | Data associations, which carry data-flow meaning |
| Lanes and lane sets | Executable extension elements the profile does not recognize |
| Message flows between participants | A second executable Process in the same definition |
| Associations, text annotations, and groups | Any construct whose omission changes execution |
| Data objects and data store references, as declarations only | |
| Documentation elements | |
| Unrecognized extension elements and foreign namespaces | |

The discriminator behind the table is one question: would omitting this construct change what the engine executes? If yes it is rejected, never preserved. The discriminator alone does not decide a tree, which is why the classifier and not the table is the contract. Data objects sit on the boundary and are split deliberately: a bare declaration is preserved, while a data association is rejected, because the association is what would carry a value into execution.

### D3 — Typed per-element diagnostics with a deterministic identity

**Recommendation: report every rejected element with a typed record whose BPMN ID is nullable.**

Today an unsupported file yields one message about the whole compilation. A third party cannot act on that. But a diagnostic keyed on the BPMN ID cannot be required, because `id` is optional on `BaseElement` and an unidentified element is exactly the kind a modeler leaves behind.

Each record carries the **nullable** BPMN ID, the element type, a **deterministic containment identity** that locates the element when the ID is absent, a **stable reason code** rather than prose, the profile capability the element would require, and a defined ordering. Records are deduplicated. The list is deterministic for identical source bytes, so it can be compared and stored.

Complete enumeration is conditional: it applies only once parsing has succeeded **warning-free**, because a parser warning is admission-blocking before classification runs, and a malformed document cannot be exhaustively classified. That case yields one diagnostic about the parse, not a list.

This is an admission-diagnostic contract, not a semantic observation: it exists before Workflow start, it is not part of any Process state, and no rejected element ever reaches the IL.

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

**Required for M1.** The three-way partition; the preserved set of D2; per-element diagnostics; multi-root admission with explicit executable selection; the non-interference differential guard; the requirement-ledger rows for the preserved constructs, recorded as `preserved` rather than `supported`.

**Optional, and not scheduled here.** Rendering preserved DI in a product surface; a preserved-material query API; retaining preserved material through to any public observation.

**Excluded.** Any execution semantics for a preserved construct. Multi-participant execution, message flow delivery, lane-based assignment, and data-object values remain unimplemented, and preserving their source is not a step toward claiming them. No preserved construct enters the IL, the runtime state, or the canonical observation. This proposal claims no BPMN conformance and selects no CIB relationship.

## Temporal hosting and refinement preflight

This proposal adds **no** semantic transition family, so the preflight is short by content rather than by omission, and its conclusion is that the adapter is untouched.

Admission runs entirely before Workflow start. No durable ingress, wait, timer, effect, cancellation, or lifecycle mechanism is added or changed; the executed partition is byte-identical to what the adapter hosts today for the same executable content. The state relation the adapter preserves is therefore unchanged, because the object it relates is the executed partition alone.

Two things the preflight must state rather than assume. **Preserved material must not enter the Workflow argument**, or it would enter Event History and become a replay-compatibility surface that the pre-release policy forbids adding before a durable baseline; the admitted definition the Workflow receives stays the executed partition. And **the diagnostic list is not a Workflow input**: rejection happens before start, so a rejected definition never reaches Temporal at all.

The residual risk is size, not semantics. Retaining exact source bytes for a modeler file is larger than the current fixtures, and the existing byte limit and parser deadline apply unchanged; the production bounded-Worker requirement for untrusted uploads is recorded in `CLAUDE.md` and is not resolved here.

## Profile versioning

Widening admission changes what a profile admits, so the profiles this touches take a version change rather than an in-place edit, under [the pre-release evolution policy](PROJECT-DESIGN.md#pre-release-evolution-policy). **Decision required from the owner:** whether preserve-only admission is a new profile family alongside the current standards profiles, or a version bump of each existing one. My recommendation is a **new generic profile**, because every existing profile is bound to retained evidence whose source bytes would otherwise all need replacing at once, and because the existing narrow profiles remain the right admission for their own capsules.

## Producers and consumers this changes

| Owner | Change |
|---|---|
| [the checked-process compiler](../packages/bpmn-source/src/checked-process-compiler.ts) | the two allowlists become classifier calls |
| [compile.ts](../packages/bpmn-source/src/compile.ts) | assembles the partition and the diagnostic list |
| [contracts.ts](../packages/bpmn-source/src/contracts.ts) | adds the diagnostic record type; `Accepted \| Rejected` unchanged |
| [root-definition selection](../packages/bpmn-source/src/root-definition-selection.ts) | profile-parameterized entry selection |
| a new preserved-set classifier | new owner, recursive and profile-aware |
| profile artifacts, scenarios, and pipeline cases | one atomic registration under the roundtrip guard |

Unchanged and deliberately so: the Semantic Process IL, Lean, the semantic core, the Temporal adapter, and every canonical observation.

## Separating negative evidence

Each is a case that must fail before the change and pass after, or the reverse. A green gate over admitted files alone would not distinguish this feature from a wider allowlist.

| Witness | Must |
|---|---|
| A modeler file with DI and one unsupported executable node | reject, naming that node, not the DI |
| A preserved container holding an executable descendant | reject, not preserve the container |
| `mustUnderstand="true"` on unrecognized foreign content | reject |
| A preserved element whose IDREF resolves into the executed partition | reject |
| A source and its stripped twin | agree on the execution projection |
| A seeded classifier that leaks one preserved construct into the executed partition | be rejected by the D5 guard |
| An element with no `id` | produce a diagnostic with a resolvable containment identity |

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

1. **D2's data-object split.** Preserving a bare declaration while rejecting its association is defensible but is the one place the discriminator needs a judgment call. The alternative is rejecting data objects entirely, which is safer and rejects more real files.
2. **Whether `preserved` becomes a requirement-ledger disposition.** It is currently not one of the ledger's values, and adding it is a ledger change with its own consequences for coverage accounting.
3. **Whether preserved material is retained at all after admission**, or only proven inert and discarded. Retaining it is required for diagram rendering in M1's product surface; discarding it is simpler and defers the storage question.

My recommendation on all three, refined by the review:

1. **Data-object split: take it, with the shapes enumerated.** The proposal must name the exact declaration-only shapes admitted, and reject every association, transformation, assignment, and execution-facing reference outside them. An unenumerated split is where the concealment risk of D2 returns.
2. **Add `preserved` to the ledger, with an exact meaning:** *structurally admitted and retained, carrying no executable meaning.* It counts as **neither** `supported` nor `rejected`. Operational requirements for Data Objects, Message Flows, Collaborations, and their siblings stay separately `unsupported`, so preserving a construct's syntax never reads as implementing its behavior.
3. **Retain the exact source bytes, and nothing more.** The bytes are already captured and already support storage and diagram rendering, so retention costs no new contract. Do **not** add a normalized preserved-subtree contract until a named engine consumer needs one; that is the generalize-after-one-consumer rule.

## Reopen conditions

Reopen before preserving any construct that can change execution, before admitting a second executable Process, before a preserved construct reaches the IL or any public observation, or if the non-interference guard cannot be made to fail on a seeded defect.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `not-recorded` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |

The semantic-checkpoint stage is **required** and not yet reached: this proposal changes an admission and profile capability, which is one of the governed claims in [the cold-review rule](../CLAUDE.md#independent-cold-review). The proposal review must complete and the owner must approve before implementation begins.
