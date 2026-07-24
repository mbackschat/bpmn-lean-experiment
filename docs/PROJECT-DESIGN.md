# Project design

## Mission

Build a Temporal-hosted adapter that imports BPMN 2.0.2 Process diagrams and ultimately satisfies OMG Process Execution Conformance.

The project pursues that goal through four independent components:

1. a versioned CIB Seven semantic profile;
2. an executable Lean reference interpreter;
3. an independently implemented pure TypeScript semantic core;
4. a Temporal durability adapter continuously checked through differential, refinement, and replay testing.

The complete supplied architecture contract is the [architecture and assurance handoff](ARCHITECTURE-AND-ASSURANCE-HANDOFF.md). The normative target is owned by [BPMN-CONFORMANCE-TARGET.md](BPMN-CONFORMANCE-TARGET.md). Every reviewed CIB relationship belongs in the prominent [CIB–BPMN register](CIB-BPMN-RELATION.md). This document owns the project-local constitution.

## Authority model

BPMN and CIB are related but not interchangeable. BPMN 2.0.2 is authoritative for syntax, metamodel, and Process Execution Conformance. CIB Seven is a mature, compliance-oriented implementation whose normal role is to realize BPMN faithfully, make underspecified behavior operational, and add explicit engine extensions.

The default CIB classification is normative agreement. Greater operational specificity is an interpretation when it resolves a BPMN gap. Worker, job, retry, incident, listener, or other added capabilities are extensions when they exceed bare BPMN. A normative deviation is exceptional and requires clear standard language, pinned separating evidence, alternative-explanation exclusion, and owner review.

CIB participates twice:

- before formalization, a normative requirement and the smallest relevant CIB probe are reviewed and classified into a semantic profile;
- after implementation, the pinned complete engine remains the independent behavioral oracle for that declared profile.

Raw CIB output never becomes Lean authority automatically, and differential mismatches are never resolved by majority vote.

## Component boundaries

| Component | Responsibility | Explicit limit |
|---|---|---|
| Semantic profile | Select reviewed meaning, compatibility target, configuration, feature surface, observation boundary, interpretations, extensions, and deviations | It is not an engine build or a generic document-format version |
| BPMN source boundary | Preserve exact bytes, validate and admit source, and compile project-owned executable IR | Parser objects and CMOF facts do not define execution behavior |
| Lean reference interpreter | Give the selected capsule executable operational meaning and prove reusable laws | It does not automatically prove CIB, XML parsing, TypeScript, Temporal, databases, or effects |
| TypeScript semantic core | Implement production semantic transitions as a separately written, deterministic realization of the reviewed account | It performs no I/O and has no CIB or Temporal dependency, and it is not an independent choice of operational account |
| Temporal adapter | Persist semantic state, deliver inputs, and host declared effects and waits durably | Hidden Workflow work may not redefine BPMN-visible behavior |
| Assurance pipeline | Compare canonical consequences, detect seeded disagreement, check isolation, and test Temporal refinement/replay | Finite evidence never implies universal conformance |

The preserved handoff calls the TypeScript component a “reducer.” This project calls it the **semantic core** and names its public transition operation `applyStimulus`. The boundary is a semantic transition system; the terminology avoids an unnecessary Redux association.

## Why Lean

Lean is useful when it converts semantic risk into an executable definition, a reusable quantified law, or a checked counterexample before the same choice spreads through TypeScript and Temporal.

The first capsule’s `task_identity_mismatch_is_rejected` theorem quantifies over the model, active Process instance, activation, submitted occurrence, command identity, and logical time. If any semantic occurrence component differs, it proves rejection, exact state preservation, an empty internal microtrace, and no closure-bound involvement. The nearby element-only identity non-law demonstrates the realistic defect that this theorem prevents.

That is stronger than replaying one serialized example, but it remains bounded to the Lean account. A CIB witness, a Lean theorem, TypeScript behavior, and Temporal refinement are separate claims even when they agree.

### Two kinds of independence

Lean and the TypeScript semantic core are independent **transcriptions** of one reviewed operational account. They are separately written, separately executable, and mutually check transcription defects such as an inverted guard or a mistyped identity field. They are not independent **accounts**: the capsule currently prescribes the microstate inventory and the internal closure bound, so both realizations share that decomposition and would reproduce an error in it identically.

Account-level independence therefore comes only from the normative and profile review and from pinned CIB evidence, bounded by the oracle fidelity that the applicable capsule records. Claims must not present Lean-to-TypeScript agreement as independent confirmation of the selected account, and [TESTING.md](TESTING.md) owns the requirement that two evidence lanes count as two only when their failure modes are uncorrelated.

A capsule may deliberately buy account-level independence by specifying only the observable contract and letting each realization choose its own runtime representation. That is a per-capsule decision with a real cost, and it must be recorded in the capsule rather than assumed.

Lean also forces architectural distinctions to become explicit:

- shared definition identity versus runtime occurrence identity;
- external command admission versus internal microstep closure;
- semantic failure versus rejected command versus harness exhaustion;
- semantic state versus CIB and Temporal host identity;
- declarative permitted transition relation versus executable transition selector.

Every new transition family should have a declarative Lean relation and an executable evaluator with a soundness bridge. Completeness, determinism, compiler correspondence, TypeScript correspondence, liveness, and refinement remain separate obligations and must not be implied by evaluator soundness.

The current Lean implementation does not parse BPMN XML, consume arbitrary executable IR, prove the compiler, or machine-check the TypeScript or Temporal implementation. Those are explicit gaps, not hidden assumptions.

## Interpreter architecture

The production architecture is an **interpreter/evaluator in TypeScript, not a BPMN-to-TypeScript code generator**.

```text
BPMN 2 XML
  → exact source identity and bounded structural import
  → profile admission and normalized executable IR data
  → pure TypeScript semantic-core transitions
  → Temporal durability, delivery, timers, and effects
```

Parsing and admission occur outside deterministic Workflow execution. A generic Workflow receives admitted executable IR and serializes semantic inputs through the core. Temporal Activities, timers, messages, and child operations implement declared effects only after the core assigns their BPMN meaning.

This choice preserves one inspectable model representation, avoids generating a new Workflow Definition for every diagram, and keeps SDK calls, Workflow deployment, and replay mechanics from becoming accidental BPMN semantics. It also keeps parser evolution, profile evolution, semantic-core evolution, and Worker deployment conceptually separate.

Generated TypeScript is not prohibited. It may later serve as a derived diagnostic, specialization, optimization, or packaging artifact after explicit equivalence and replay evidence. It is never the semantic authority by construction.

## Semantic rule traceability

Each semantic capsule owns stable identifiers for its material propositions and maps them to distinct BPMN/profile, CIB, Lean, TypeScript, Temporal, negative-witness, and mutation lanes.

A rule identifier names a proposition rather than a function or test. Ordinary implementation renaming does not change it; a material semantic change must not silently reuse it.

Target scenarios contain only model/profile identity and explicit semantic inputs. Expected results remain verifier-side, content-bound evidence. Canonical observations depend only on admitted definition/runtime state and explicit semantic inputs, never on future scripted commands, host IDs, or expected output.

## Pre-release evolution policy

The project is far from a production compatibility boundary and expects substantial change. Its current evolution policy therefore optimizes for one clean scalable architecture:

- each wire artifact has a stable structural `kind`;
- JSON Schema `$id` owns schema-document identity;
- a semantic profile `id` owns reviewed semantic and compatibility meaning;
- executable IR carries stable compiler, exact source, and selected profile identity;
- a breaking shape change replaces all current producers, consumers, schemas, examples, and tests atomically;
- no parallel legacy format, embedded format counter, compatibility switch, migration reader, or fallback constructor is retained before a durable release baseline exists;
- local Temporal tests use a fresh in-memory server, replay the histories created in that same gate, and then discard all server state.

This policy avoids prototype branches that scale linearly across Java, Lean, TypeScript, Temporal, fixtures, and documentation. It does not waive future compatibility.

Before the first immutable release or persisted production history, the owner must explicitly approve:

1. which profile and wire artifacts become immutable;
2. the Event History baseline and Worker/version markers;
3. migration, patching, deprecation, and rollback rules;
4. retained replay fixtures and their provenance;
5. support windows and removal criteria.

From that point onward, history compatibility and artifact migration become mandatory evidence based on real retained state rather than speculative prototypes.

## MVP conclusion

The bounded `None Start Event → User Task → None End Event` slice demonstrates that the architecture is feasible as a fast loop:

- exact BPMN bytes are admitted once and compiled to project-owned IR;
- CIB and Lean remain independent semantic references;
- the production TypeScript transition system stays pure;
- one generic Temporal Workflow hosts the core through Query and acknowledged Update;
- CIB, Lean, the core, and Temporal agree for exact completion, wrong activation, and stale completion;
- live Event Histories replay before the disposable server shuts down;
- a seeded task-activation mutation proves that the observation/comparison boundary can detect the claimed distinction.

This validates the separation of responsibilities, not scalability to all BPMN. The current runtime has no general token, scope, race, effect, or variable model; the compiler recognizes one topology; Lean emits compiled-in capsule scenarios rather than consuming the pipeline IR; and Temporal has not exercised Activities, timers, cancellation, Worker restart, or Continue-As-New.

The next feature must expose a distinct semantic or representation risk. Infrastructure is generalized only when a second real consumer and a separating mutation justify it.

## Success criteria for every capsule

A semantic capsule is closed only when:

1. its normative/profile question and CIB relationship are explicit;
2. answer-free positive and negative witnesses separate a realistic wrong account;
3. Lean defines executable meaning and at least one useful law or checked non-law where appropriate;
4. the TypeScript semantic core independently realizes the selected behavior;
5. CIB evidence is pinned, content-bound, and mutation-sensitive;
6. Temporal’s observable behavior refines the core and live histories replay;
7. harness, semantic, and infrastructure outcomes remain separate;
8. all public claims and exclusions match [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md);
9. feedback budgets, cleanup, documentation ownership, and common-mode risks have been reviewed.
