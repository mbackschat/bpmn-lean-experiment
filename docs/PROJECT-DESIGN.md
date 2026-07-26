# Project design

## Mission

Build a Temporal-hosted adapter that imports BPMN 2.0.2 Process diagrams and ultimately satisfies OMG Process Execution Conformance.

The driving product goal is to replace an existing CIB Seven solution—its BPMN Processes plus selected Java delegates, expressions, and integration code—with a Temporal-hosted, Lean-assured implementation. Migration should preserve admitted model source where feasible, run supported Java business logic behind explicit adapters, and provide classified migration steps for every unsupported remainder. The target is easy, evidence-backed migration, not an unqualified Process Engine drop-in claim.

Migration ease is measured against a defined inventory of the actual target solution: unchanged model-admission coverage, unmodified delegate coverage through the bounded Java bridge, supported Java/REST façade calls, and a classified migration disposition for the remainder. Do not publish percentages before that inventory defines the denominator.

The project pursues that goal through four independent components:

1. a versioned CIB Seven semantic profile;
2. an executable Lean reference interpreter;
3. an independently implemented pure TypeScript semantic core;
4. a Temporal durability adapter continuously checked through differential, refinement, and replay testing.

The complete supplied architecture contract is the [architecture and assurance handoff](ARCHITECTURE-AND-ASSURANCE-HANDOFF.md). The normative target is owned by [BPMN-CONFORMANCE-TARGET.md](BPMN-CONFORMANCE-TARGET.md). Every reviewed CIB relationship belongs in the prominent [CIB–BPMN register](CIB-BPMN-RELATION-REGISTER.md). This document owns the project-local constitution.

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
| BPMN source boundary | Preserve exact bytes, validate and admit source, and produce a checked project-owned BPMN graph | Parser objects and CMOF facts do not define execution behavior |
| Semantic Process IL | Lower the checked graph into a bounded language of typed semantic mechanisms with source provenance | It is not a mirror of the BPMN metamodel, a universal BPMN language, or mutable runtime state |
| Lean reference interpreter | Give the selected capsule executable operational meaning and prove reusable laws | It does not automatically prove CIB, XML parsing, TypeScript, Temporal, databases, or effects |
| TypeScript semantic core | Implement production semantic transitions as a separately written, deterministic realization of the reviewed account | It performs no I/O and has no CIB or Temporal dependency, and it is not an independent choice of operational account |
| Temporal adapter | Persist semantic state, deliver inputs, and host declared effects and waits durably | Hidden Workflow work may not redefine BPMN-visible behavior |
| Assurance pipeline | Compare canonical consequences, detect seeded disagreement, check isolation, and test Temporal refinement/replay | Finite evidence never implies universal conformance |

The preserved handoff calls the TypeScript component a “reducer.” This project calls it the **semantic core** and names its public transition operation `applyStimulus`. The boundary is a semantic transition system; the terminology avoids an unnecessary Redux association.

## Temporal hosting/refinement preflight

Lean-to-TypeScript correspondence and TypeScript-to-Temporal refinement are independent obligations. A Lean definition can be sound and the pure semantic core can transcribe it correctly while the durable adapter still loses an input, applies a duplicate, exposes an intermediate state, leaks transport retries, closes before a command outcome is delivered, or lacks a hosting mechanism for a semantic wait or effect.

Every capsule must therefore complete a Temporal hosting/refinement preflight after selecting its semantic account and separating witnesses but before implementing that transition family in production Lean or TypeScript. The preflight must record:

- the Temporal ingress and acknowledgement mechanism for every external semantic stimulus;
- how semantic waits, timers, subscriptions, effects, and cancellations remain core-owned state while Temporal provides durable wakeup or I/O;
- the relation between committed core state and Workflow state, including which host steps are hidden;
- command serialization, permitted semantic order, handler interleaving, duplicate delivery, idempotency, and retry boundaries;
- completion, failure, cancellation, Continue-As-New, and post-completion command behavior;
- Query, Visibility, external read-model, and canonical-observation responsibilities;
- replay and versioning risks;
- the smallest live-history refinement witness and nearest realistic adapter counterexample.

A preflight may conclude that Temporal has no native BPMN analogue and still find a sound composition of Workflow state, Update or Signal ingress, Query, timers, Activities, and child operations. It may not turn one of those mechanisms into semantic authority. If a required public outcome cannot yet be preserved, that is an explicit research or profile blocker; it is not deferred silently until adapter implementation.

The preflight is a feasibility review, not a passed evidence lane. Capsule closure still requires executable Temporal refinement and replay evidence.

## Why Lean

Lean is useful when it converts semantic risk into an executable definition, a reusable quantified law, or a checked counterexample before the same choice spreads through TypeScript and Temporal.

The first capsule’s `task_identity_mismatch_is_rejected` theorem quantifies over the model, active Process instance, activation, submitted occurrence, command identity, and logical time. If any semantic occurrence component differs, it proves rejection, exact state preservation, an empty internal microtrace, and no closure-bound involvement. The nearby element-only identity non-law demonstrates the realistic defect that this theorem prevents.

That is stronger than replaying one serialized example, but it remains bounded to the Lean account. A CIB witness, a Lean theorem, TypeScript behavior, and Temporal refinement are separate claims even when they agree.

### Two kinds of independence

Lean and the TypeScript semantic core are independent **transcriptions** of one reviewed operational account. They are separately written, separately executable, and mutually check transcription defects such as an inverted guard or a mistyped identity field. They are not independent **accounts**: the capsule currently prescribes the microstate inventory and the internal closure bound, so both realizations share that decomposition and would reproduce an error in it identically.

Account-level independence therefore comes only from the normative and profile review and from pinned CIB evidence, bounded by the oracle fidelity that the applicable capsule records. Claims must not present Lean-to-TypeScript agreement as independent confirmation of the selected account, and [TESTING-SPEC.md](TESTING-SPEC.md) owns the requirement that two evidence lanes count as two only when their failure modes are uncorrelated.

A capsule may deliberately buy account-level independence by specifying only the observable contract and letting each realization choose its own runtime representation. That is a per-capsule decision with a real cost, and it must be recorded in the capsule rather than assumed.

Lean also forces architectural distinctions to become explicit:

- shared definition identity versus runtime occurrence identity;
- external command admission versus internal microstep closure;
- semantic failure versus rejected command versus harness exhaustion;
- semantic state versus CIB and Temporal host identity;
- declarative permitted transition relation versus executable transition selector.

Every new transition family should have a declarative Lean relation and an executable evaluator with a soundness bridge. Completeness, determinism, compiler correspondence, TypeScript correspondence, liveness, and refinement remain separate obligations and must not be implied by evaluator soundness.

The current Lean implementation does not parse BPMN XML, prove the arbitrary XML parser correct, prove full checked-source-to-public-run preservation, or machine-check the TypeScript or Temporal implementation. It does strictly decode the pipeline-provided checked BPMN graph and Semantic Process program, validate both independently, recompute canonical lowering, reject inequality before evaluation, and execute the received program. Structural definition identity and source-origin preservation are proved; the stronger reviewed observational preservation proposition remains open because the project has no independent checked-source operational relation to instantiate without assuming the desired result.

## Interpreter architecture

The production architecture is an **interpreter/evaluator in TypeScript, not a BPMN-to-TypeScript code generator**.

```text
BPMN 2 XML
  → exact source identity, bounded structural import, and profile admission
  → checked project-owned BPMN graph
  → bounded Semantic Process IL data
  → pure TypeScript semantic-core transitions
  → Temporal durability, delivery, timers, and effects
```

Parsing, admission, and lowering occur outside deterministic Workflow execution. A generic Workflow receives an admitted Semantic Process program and serializes semantic inputs through the core. Temporal Activities, timers, messages, and child operations implement declared effects only after the core assigns their BPMN meaning.

[SEMANTIC-PROCESS-IL-SPEC.md](SEMANTIC-PROCESS-IL-SPEC.md) owns the implemented checked-source contract, bounded lowering, operation meanings, exact Lean preservation boundary, event-growth policy, and stop criteria. The language slice is bounded to the sequential and balanced parallel capsule specs. No topology-specific executable representation or legacy reader is retained.

This choice preserves one inspectable model representation, avoids generating a new Workflow Definition for every diagram, and keeps SDK calls, Workflow deployment, and replay mechanics from becoming accidental BPMN semantics. It also keeps parser evolution, profile evolution, semantic-core evolution, and Worker deployment conceptually separate.

Generated TypeScript is not prohibited. It may later serve as a derived diagnostic, specialization, optimization, or packaging artifact after explicit equivalence and replay evidence. It is never the semantic authority by construction.

## CIB compatibility and polyglot effect execution

The project targets explicitly selected source and behavioral compatibility with versioned CIB Seven profiles. It does not target drop-in replacement of the Process Engine Java, REST, plugin, persistence, deployment, or administration APIs. Every compatibility claim names its source syntax, feature surface, behavior, configuration, observation boundary, and evidence; an unqualified “CIB-compatible” claim is prohibited.

Camunda/CIB extension syntax is admitted only through exact profile-selected BPMN contexts, expanded namespace QNames, and value shapes. An admitted binding normalizes to a project-owned descriptor before Semantic Process IL. Java classes, JUEL objects, engine jobs, retries, and host identities never become semantic authority merely because the source or oracle uses them. The approved family dispositions and reopen conditions remain in [the CIB Seven compatibility scope proposal](CIB-SEVEN-COMPATIBILITY-SCOPE-PROPOSAL.md).

The TypeScript semantic core and TypeScript Temporal Workflow remain the single production interpreter account. Committed effect intents cross a versioned language-neutral Activity protocol that may be executed by TypeScript or JVM Workers. A Worker performs external computation; it never mutates Process state directly or independently chooses semantic identity. It returns a typed result or future typed variable patch for validation and commitment by the semantic core.

Supporting Java handlers therefore does not justify rewriting the semantic core in Java or Kotlin, maintaining a second JVM interpreter, or moving semantic decisions to a remote service. A JVM Worker may expose a project-owned Java handler API and, under separately reviewed compatibility profiles, bounded adapters for CIB Seven or Camunda 7 delegates. Unsupported delegate operations fail explicitly. Full `DelegateExecution`, internal `ActivityBehavior`, Process Engine service, and plugin compatibility remain outside the architecture unless the owner funds a separate compatibility program.

Workflow and Worker implementations must agree through explicit Activity type, task queue, request/result schema, payload encoding, idempotency identity, timeout, retry, cancellation, and failure contracts. Cross-SDK compatibility is an executable evidence obligation rather than an assumption about default payload converters. A JVM Worker may be implemented in Kotlin behind Java-friendly public interfaces, but neither a Kotlin toolchain nor any Java runtime dependency follows automatically from this architecture.

The [dual semantic-core proposal](DUAL-SEMANTIC-CORE-ARCHITECTURE-PROPOSAL.md) is rejected. The TypeScript SDK’s deterministic Workflow sandbox, event-loop fit, structural wire types, existing replay evidence, and language separation from the Java CIB oracle make TypeScript the selected interpreter host. Java remains the preferred language for a future JVM compatibility Worker when the migration inventory supplies that consumer. Reopen the semantic-core language only for a named non-Temporal embedded JVM product mode that must own and advance semantic Process state in-process; a Worker, Java client façade, or Spring preference does not qualify.

## Semantic rule traceability

Each semantic capsule owns stable identifiers for its material propositions and maps them to distinct BPMN/profile, CIB, Lean, TypeScript, Temporal, negative-witness, and mutation lanes.

A rule identifier names a proposition rather than a function or test. Ordinary implementation renaming does not change it; a material semantic change must not silently reuse it.

Target scenarios contain only model/profile identity and explicit semantic inputs. Expected results remain verifier-side, content-bound evidence. Canonical observations depend only on admitted definition/runtime state and explicit semantic inputs, never on future scripted commands, host IDs, or expected output.

## Pre-release evolution policy

The project is far from a production compatibility boundary and expects substantial change. Its current evolution policy therefore optimizes for one clean scalable architecture:

- each wire artifact has a stable structural `kind`;
- JSON Schema `$id` owns schema-document identity;
- a semantic profile `id` owns reviewed semantic and compatibility meaning;
- checked BPMN graphs and Semantic Process programs carry stable exact-source and selected-profile identity, and programs also carry compiler identity;
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
- CIB, Lean, the core, and Temporal agree for exact completion, wrong activation, stale completion, and both balanced parallel completion orders;
- the exact Intermediate Catch Timer capsule demonstrates committed-state-derived durable wakeup without giving Temporal ownership of occurrence identity, deadline, eligibility, or logical time;
- live Event Histories replay before the disposable server shuts down;
- seeded task-activation, omitted-parallel-task, timer-deadline, durable-timer-bypass, operation-origin, and Sequence-Flow-provenance mutations prove that the observation, definition-binding, adapter-refinement, and comparison boundaries detect the claimed distinctions.

This validates the separation of responsibilities, not scalability to all BPMN. The bounded runtime has no general scope, race, effect, or variable model; the compiler recognizes only the sequential User Task, balanced two-branch parallel, and exact `PT1S` timer topologies; Lean consumes the exact checked graph and Semantic Process program but has no adopted independent checked-source operational relation; and Temporal has not exercised Activities, cancellation, Continue-As-New, or any timer race.

The [parallel fork/join spec](capsules/PARALLEL-FORK-JOIN-SPEC.md) supplies the second distinct topology and representation risk that justifies the bounded Semantic Process IL. Its closure does not generalize the language beyond its named consumers and separating witnesses.

The [Intermediate Catch Timer spec](capsules/INTERMEDIATE-CATCH-TIMER-SPEC.md) supplies the first durable host Command driven by a semantic wait. Its deadline-as-logical-time refinement stutter is valid only for the race-free capsule and must be reopened before any competing input, second timer, cancellation, or physical-lateness observation enters scope.

The production Temporal host follows the [Process lifecycle specification](TEMPORAL-PROCESS-LIFECYCLE-SPEC.md): one Workflow receives the admitted Semantic Process program and explicit start, derives its lifetime from semantic state, drains accepted handlers, recovers exact accepted results during retention, and classifies a distinct post-closure command through an adapter-owned lifecycle result. The semantic rejection lane remains separate: the sequential post-terminal case compares only the semantic prefix and `processClosed` adapter classification, while a live parallel sibling keeps the Process addressable for exact stale semantic rejection.

## Success criteria for every capsule

A semantic capsule is closed only when:

1. its normative/profile question and CIB relationship are explicit;
2. answer-free positive and negative witnesses separate a realistic wrong account;
3. its Temporal hosting/refinement preflight identifies every required host mechanism, lifecycle risk, and smallest refinement witness without making Temporal semantic authority;
4. Lean defines executable meaning and at least one useful law or checked non-law where appropriate;
5. the TypeScript semantic core independently realizes the selected behavior;
6. CIB evidence is pinned, content-bound, and mutation-sensitive;
7. Temporal’s observable behavior refines the core and live histories replay;
8. harness, semantic, and infrastructure outcomes remain separate;
9. all public claims and exclusions match [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md);
10. feedback budgets, cleanup, documentation ownership, and common-mode risks have been reviewed.
