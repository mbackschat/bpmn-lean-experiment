# Preserve-only admission proposal

## Status

**Drafted, not owner-approved, not implemented, and not yet independently reviewed.** It proposes the admission capability that opens M1 of [the showcase milestone ladder](PLAN.md#showcase-milestone-ladder): a third party can deploy their own BPMN file. It changes what source is admitted and what the compiler retains; it changes no runtime transition family, no semantic meaning of any executed construct, and no public observation.

Admission structure is owned by [the profile-parameterized admission specification](PROFILE-PARAMETERIZED-ADMISSION-SPEC.md), which this proposal extends rather than replaces. Requirement dispositions belong to [the requirement ledger](BPMN-REQUIREMENT-LEDGER.md), sequencing to [PLAN.md](PLAN.md), and exact implemented and absent scope to [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md). The external recommendation this responds to is [the minimal engine research](research/MINIMAL-USEFUL-BPMN-ENGINE-RESEARCH.md); it disposes no BPMN requirement.

## The question

What is the smallest admission change that lets a file a modeler actually saved compile, without the engine acquiring meaning it cannot check?

Today no such file compiles. [The compiler](../packages/bpmn-source/src/checked-process-compiler.ts) admits `bpmn:Definitions` with only `$type`, `id`, `targetNamespace`, `expressionLanguage`, and `rootElements`, and a `bpmn:Process` with only `$type`, `id`, `name`, `isExecutable`, and `flowElements`. Every modeler writes Diagram Interchange, so every modeler file is rejected at the first allowlist. The rejection is correct under the current contract and is exactly what must change.

Two failure modes bound the answer. **Silently ignoring** an unsupported executable construct produces a Process that deploys successfully and omits intended business behavior, which is the failure the external research names as decisive. **Admitting preserved material into the executed representation** makes every existing law's hypotheses quietly weaker, because a term the semantics never inspects still travels through the structures the theorems quantify over.

## Recommended design

### D1 — Preserved material never enters the checked graph

**Recommendation: partition at admission, and carry preserved material in the compilation projection beside the checked graph, never inside it.**

The compiler returns a three-way partition instead of a boolean: an **executed** checked graph exactly as today, a **preserved** record holding the retained source subtrees, and a **rejected** list. The checked graph, the Semantic Process IL, Lean, the semantic core, and the Temporal adapter see only the executed partition, byte-identically to what they see now for a file carrying no preserved material.

The alternative, threading preserved material through the checked graph as an inert field, was rejected. It would place unexamined content inside the structure every existing Lean theorem quantifies over, so each law would need re-reading to confirm it still says what it said. The proof obligation would grow with the feature rather than being discharged once.

This choice is what makes the milestone's research question answerable, and it changes that question's shape: with the partition, non-interference is not a property of the semantics but of the compiler.

### D2 — The preserved set is defined by absence of token-flow semantics

**Recommendation: preserve exactly the constructs that carry no token-flow or data-flow meaning for the executed Process**, and reject every executable construct outside the current profile.

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

The discriminator is one question: would omitting this construct change what the engine executes? If yes it is rejected, never preserved. Data objects sit on the boundary and are split deliberately: a bare declaration is preserved, while a data association is rejected, because the association is what would carry a value into execution.

### D3 — Rejection is per element, with identity and reason

**Recommendation: report every rejected element with its BPMN `id`, its element type, and a reason naming the profile capability it needs.**

Today an unsupported file yields one message about the whole compilation. A third party cannot act on that. The admission result becomes a list, so a file with three unsupported constructs reports three, and the product surface can render them against the diagram.

This is an admission-diagnostic contract, not a semantic observation: it exists before Workflow start, it is not part of any Process state, and no rejected element ever reaches the IL.

### D4 — One executable Process, selected explicitly, others preserved

**Recommendation: extend the existing root-definition selection rather than replacing it.** A definition may carry several root elements; exactly one is selected as the executable Process and the remainder are preserved. Selection is explicit and profile-driven, never positional.

The Call Activity capsule already admits a two-root checked definition forest, so multiple roots are not new. What is new is that an unselected root may be a participant, a collaboration, or a second non-executable Process rather than a called Process. A second root with `isExecutable="true"` is a **rejection**, not a silent selection.

### D5 — The Lean lane is checked, not proved, and this is a narrowing

**Recommendation: declare the lane `checked` under [the assurance-lane rule](PROJECT-DESIGN.md#lean-assurance-lane), and record the boundary rather than implying a theorem.**

The milestone's research question is non-interference of preserved payload. Under D1 the honest statement is: *for every admitted source, the checked graph compiled from it equals the checked graph compiled from the same source with all preserved material removed.* That is a property of the TypeScript compiler over parsed input. Lean has no BPMN XML parser and receives only the compiler's result, so Lean cannot state it without modelling a parser it does not have.

The lane is therefore an executable differential guard over a fixture family that pairs each source with its preserved-material-stripped twin and requires byte-identical checked graphs, plus the existing Lean lowering-equality check on the executed partition. **The unresolved boundary is explicit:** this is exhaustive over the fixture family and quantified over nothing. A quantified statement needs either a Lean-side parser or a checked-source relation, and the second is what [the frozen C2 experiment](experiments/CHECKED-SOURCE-RELATION-EXPERIMENT.md) failed to close within its effort bound.

### D6 — C2 stays frozen, and the trigger is answered rather than ignored

**Recommendation: record that the C2 reopen trigger fires here and that the decision is not to reopen.**

The 2026-07-26 C2 freeze reopens *before admission widens beyond the two fixture-pinned topologies*. M1 widens admission, so the trigger fires and owes an answer.

The answer is that D1 removes the risk C2 studied. That experiment's separating witness was positional lowering, where a defect pairs task and flow identifiers by position rather than by source and target. Preserved material never reaches lowering, so it cannot participate in that defect class. Reopening a roughly 700-line Lean experiment to cover material the lowering never sees would spend the effort where the risk is not.

**What this does not claim:** that the risk is gone. It claims the risk is unchanged by this proposal, and the targeted preservation gate continues to own it.

## Required, optional, excluded

**Required for M1.** The three-way partition; the preserved set of D2; per-element diagnostics; multi-root admission with explicit executable selection; the non-interference differential guard; the requirement-ledger rows for the preserved constructs, recorded as `preserved` rather than `supported`.

**Optional, and not scheduled here.** Rendering preserved DI in a product surface; a preserved-material query API; retaining preserved material through to any public observation.

**Excluded.** Any execution semantics for a preserved construct. Multi-participant execution, message flow delivery, lane-based assignment, and data-object values remain unimplemented, and preserving their source is not a step toward claiming them. No preserved construct enters the IL, the runtime state, or the canonical observation. This proposal claims no BPMN conformance and selects no CIB relationship.

## What already binds this work

### Executable guards

- [the source-hygiene gate](../scripts/source-hygiene.test.ts), which owns the module ceilings named below;
- [the metamodel-default admission guard](../packages/bpmn-source/test/metamodel-default-admission.test.ts), which derives its cases from the scenario registry and manifest, so a widened admitted set is covered without being listed;
- [the artifact roundtrip guard](../scripts/capsule-roundtrip.test.ts) and [the pipeline catalog](../packages/differential/test/pipeline-catalog.test.ts), which require a profile, its scenarios, and its cases to land atomically;
- [the review-policy guard](../scripts/independent-review-policy.test.ts), which reads owner approval only from the Status section above;
- [the plan-shape guard](../scripts/plan-status-consistency.test.ts) and [the reviewability guard](../scripts/document-reviewability.test.ts), which bound this document's owners.

### Source owners this will grow

| Owner | Headroom |
|---|---|
| [the checked-process compiler](../packages/bpmn-source/src/checked-process-compiler.ts) | 518 of 600 nonblank, 82 lines |
| [root-definition selection](../packages/bpmn-source/src/root-definition-selection.ts) | measured at implementation, not assumed here |

The compiler's 82 lines will not hold a three-way partition, a preserved-set classifier, and a per-element diagnostic list. **The extraction lands as its own behavior-preserving commit before any semantics**, under [the code-hygiene rule](../CLAUDE.md#code-hygiene-and-module-boundaries), and the natural seam is the preserved-set classifier, which is a pure function of a parsed element and needs nothing from compilation.

## Open decisions for the owner

1. **D2's data-object split.** Preserving a bare declaration while rejecting its association is defensible but is the one place the discriminator needs a judgment call. The alternative is rejecting data objects entirely, which is safer and rejects more real files.
2. **Whether `preserved` becomes a requirement-ledger disposition.** It is currently not one of the ledger's values, and adding it is a ledger change with its own consequences for coverage accounting.
3. **Whether preserved material is retained at all after admission**, or only proven inert and discarded. Retaining it is required for diagram rendering in M1's product surface; discarding it is simpler and defers the storage question.

My recommendation on all three: take the data-object split as proposed, add `preserved` to the ledger because silently recording preserved constructs as absent understates coverage in the wrong direction, and retain the material because M1's demo renders the diagram.

## Reopen conditions

Reopen before preserving any construct that can change execution, before admitting a second executable Process, before a preserved construct reaches the IL or any public observation, or if the non-interference guard cannot be made to fail on a seeded defect.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `not-recorded` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |

The semantic-checkpoint stage is **required** and not yet reached: this proposal changes an admission and profile capability, which is one of the governed claims in [the cold-review rule](../CLAUDE.md#independent-cold-review). The proposal review must complete and the owner must approve before implementation begins.
