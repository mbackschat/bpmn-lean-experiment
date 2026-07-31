# Project design

## Mission

Build a Temporal-hosted BPMN 2.0.2 execution engine that imports Process diagrams and ultimately satisfies OMG Process Execution Conformance. Standards coverage is the primary engine roadmap: the reusable semantic model, Lean account, TypeScript core, and Temporal refinement must be meaningful without CIB Seven or A12. Within that roadmap, the executable BPMN breadth of CIB Seven `2.2.0` orders the near-term standards schedule so that the engine reaches a mature practical subset quickly.

CIB Seven compatibility is a versioned overlay on that BPMN engine. It selects and classifies CIB interpretations, extensions, configuration-specific realizations, limitations, and evidenced deviations without allowing CIB host mechanisms to define the vendor-neutral BPMN core.

The ultimate downstream adoption goal is to replace A12 Workflows `release/2025.06`, the main A12 Process product layered on CIB Seven, with this Temporal-hosted, Lean-assured engine plus a separately bounded A12 adoption adapter. A12 Workflows exposes maintained BPMN behavior, Java/Kotlin delegates, expressions, integration APIs, and engine-backed services to downstream A12 projects; it is the first product adoption target, not the semantic definition of the engine and not one representative consuming application. The A12 Full Stack Project Template is the canonical downstream-project blueprint against which the adoption layer must eventually be demonstrated.

The A12 corpus and integration surface are prioritization and acceptance inputs. They may cause a BPMN mechanism or CIB overlay to be worked earlier, but A12 bean names, APIs, data shapes, licensing, and deployment assumptions remain outside the reusable engine. Migration ease is measured separately against the defined [A12 Workflows compatibility ledger](research/A12-WORKFLOWS-COMPATIBILITY-LEDGER.md): unchanged model-admission coverage, unmodified delegate coverage through a bounded Java bridge, supported Java/REST/JMS façade calls, blueprint integration, and a classified migration disposition for the remainder. Every unsupported model, delegate API, expression, script, listener, engine integration, or transaction assumption receives an explicit migration path rather than being hidden by an aggregate compatibility label.

The project pursues these goals through four assurance and execution components:

1. a versioned CIB Seven semantic profile;
2. an executable Lean reference interpreter;
3. an independently implemented pure TypeScript semantic core;
4. a Temporal durability adapter continuously checked through differential, refinement, and replay testing.

The complete supplied architecture contract is the [architecture and assurance handoff](ARCHITECTURE-AND-ASSURANCE-HANDOFF.md). The normative target is owned by [BPMN-CONFORMANCE-TARGET.md](BPMN-CONFORMANCE-TARGET.md). Every reviewed CIB relationship belongs in the prominent [CIB–BPMN register](CIB-BPMN-RELATION-REGISTER.md). This document owns the project-local constitution.

## Layered product architecture

The product stack has three semantic and adoption layers with one-way dependency:

```text
A12 Workflows adoption adapter and migration tooling
        ↓ uses
selected CIB Seven compatibility profiles
        ↓ refine or extend
vendor-neutral BPMN 2.0.2 execution core
        ↓ hosted by
Temporal durability and effect infrastructure
```

| Layer | Owns | Must not own |
|---|---|---|
| BPMN execution core | Standard Process structure and lifecycle, control flow, Activities, Events, scopes, variables, public semantic observations, and host-independent commands | Camunda extension QNames, CIB jobs/retries/incidents, A12 handlers or APIs, Temporal attempts, or product-specific model shapes |
| CIB Seven compatibility profile | Classified interpretations and gap resolutions, selected `camunda:*` source extensions, CIB configuration, transaction/variable behavior, jobs/retries/incidents, and bounded behavioral compatibility evidence | General BPMN authority, unqualified engine compatibility, A12 integration APIs, or product-specific business semantics |
| A12 Workflows adoption | Exact maintained models, handler/delegate binding, JVM Activity Workers, façade adaptation, migration reports, blueprint integration, and A12-specific acceptance evidence | Changes to BPMN meaning, silent promotion of CIB behavior into the BPMN core, or A12 runtime/license dependencies in this MIT repository |

A representative vertical slice may deliberately cross all three layers when needed to prove that source admission, semantics, CIB realization, Temporal hosting, and downstream binding compose. `CreateDocument` and the typed boundary-error work are such feasibility slices. They do not establish a policy of implementing every A12 model independently across every layer.

After a seam is proven, work proceeds by reusable semantic mechanism. A model that uses already implemented BPMN and CIB mechanisms should normally add only adoption-layer configuration and compatibility regression evidence. A new full semantic capsule is justified only by a new BPMN proposition, a newly selected CIB relationship, or a material Temporal refinement risk.

Coverage is accounted separately:

1. BPMN coverage counts reviewed Process Execution requirements and reusable standard mechanisms;
2. CIB coverage counts classified source extensions and behavioral relationships for named profiles;
3. A12 adoption counts unchanged models, handler/delegate compatibility, façade operations, and classified migration steps.

No aggregate percentage may combine these denominators. A12 adoption is the ultimate product test, while BPMN coverage remains the primary implementation roadmap and CIB work is added when a standards ambiguity, selected compatibility claim, or downstream need forces it.

## CIB Seven 2.2.0 breadth ordering

CIB Seven `2.2.0` is the primary breadth baseline for ordering the near-term BPMN 2.0.2 Process Execution schedule. After the runnable MVP, choose the next uncovered reusable BPMN mechanism primarily from the executable Process surface evidenced by that release, subject to semantic dependencies, capsule size, and Temporal feasibility.

This is a scheduling rule, not an authority reversal and not a combined coverage denominator. BPMN 2.0.2 remains normative; every mechanism receives a standards-owned account; CIB-specific interpretations and extensions remain separately classified; and a standards capsule may still omit CIB from its target relation when CIB supplies no independent evidence for that exact proposition.

The breadth baseline counts executable Process behavior rather than every CIB product feature or public API. Administration, persistence, authorization, Tasklist, Cockpit, forms UI, identity management, Collaboration features not exercised by the selected engine baseline, and product-specific human-resource policy do not enter the semantic schedule merely because a CIB distribution contains adjacent facilities.

A12 Workflows remains pinned separately to CIB Seven `2.0.0` for its downstream adoption profiles. Evidence from `2.2.0` must not be used as proof of `2.0.0` compatibility without a bounded equivalence result.

The [BPMN requirement ledger](BPMN-REQUIREMENT-LEDGER.md) owns standards dispositions. The [CIB–BPMN register](CIB-BPMN-RELATION-REGISTER.md) owns relation classifications. [PLAN.md](PLAN.md) owns the concrete ordered queue.

## Runnable MVP delivery boundary

Before the next breadth capsule, deliver the [owner-approved runnable Temporal MVP](RUNNABLE-TEMPORAL-MVP-PROPOSAL.md): an ordinary external-Temporal Worker and command path for a documented admitted subset, plus a dummy actor that leaves the User Task durably waiting on Temporal during a realistic host delay and then simulates form input through the real semantic completion boundary.

The dummy actor is host policy. It does not define BPMN User Task meaning, add a human-resource model, or justify UI, forms, identity, authorization, Search Attributes, or a task inbox. Completion data is a separately reviewed CIB-profile semantic extension under the [User Task completion-data proposal](capsules/USER-TASK-COMPLETION-DATA-PROPOSAL.md).

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
| BPMN semantic profile | Select one bounded reading of the normative Process requirement, including explicit resolution of a standard gap or inconsistency | It contains no CIB extension or A12 product binding unless a separately named overlay selects it |
| CIB Seven compatibility profile | Select a pinned release, configuration, source extensions, host realization, observation boundary, and classified relation to the BPMN account | It is not the vendor-neutral BPMN core, an engine build, or an unqualified compatibility promise |
| BPMN source boundary | Preserve exact bytes, validate and admit source, and produce a checked project-owned BPMN graph | Parser objects and CMOF facts do not define execution behavior |
| Semantic Process IL | Lower the checked graph into a bounded language of typed semantic mechanisms with source provenance | It is not a mirror of the BPMN metamodel, a universal BPMN language, or mutable runtime state |
| Lean reference interpreter | Give the selected capsule executable operational meaning and prove reusable laws | It does not automatically prove CIB, XML parsing, TypeScript, Temporal, databases, or effects |
| TypeScript semantic core | Implement production semantic transitions as a separately written, deterministic realization of the reviewed account, including explicitly selected project-owned total expression languages | It performs no I/O, evaluates no external/profile-delegated language such as JUEL, has no CIB or Temporal dependency, and is not an independent choice of operational account |
| Temporal adapter | Persist semantic state, deliver inputs, and host declared effects and waits durably | Hidden Workflow work may not redefine BPMN-visible behavior |
| A12 adoption adapter | Bind exact A12 models, handlers, JVM Workers, and client façades to stable BPMN/CIB contracts and report migration gaps | It does not enter the semantic core, redefine profiles, or become a runtime dependency of this MIT repository |
| Assurance pipeline | Compare canonical consequences, detect seeded disagreement, check isolation, and test Temporal refinement/replay | Finite evidence never implies universal conformance |

The preserved handoff calls the TypeScript component a “reducer.” This project calls it the **semantic core** and names its public transition operation `applyStimulus`. The boundary is a semantic transition system; the terminology avoids an unnecessary Redux association.

## Temporal hosting/refinement preflight

Lean-to-TypeScript correspondence and TypeScript-to-Temporal refinement are independent obligations. A Lean definition can be sound and the pure semantic core can transcribe it correctly while the durable adapter still loses an input, applies a duplicate, exposes an intermediate state, leaks transport retries, closes before a command outcome is delivered, or lacks a hosting mechanism for a semantic wait or effect.

Every capsule must therefore complete a Temporal hosting/refinement preflight after selecting its semantic account and separating witnesses but before implementing that transition family in production Lean or TypeScript. The preflight must record:

- the Temporal ingress and acknowledgement mechanism for every external semantic stimulus;
- how semantic waits, timers, subscriptions, effects, and cancellations remain core-owned state while Temporal provides durable wakeup or I/O;
- how any profile-selected expression evaluator receives an exact context and returns a content-bound result without letting the adapter choose BPMN control flow;
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

The Lean implementation does not parse BPMN XML, prove the arbitrary XML parser correct, prove full checked-source-to-public-run preservation, or machine-check the TypeScript or Temporal implementation. It does strictly decode the pipeline-provided checked BPMN graph and Semantic Process program, validate both independently, recompute canonical lowering, reject inequality before evaluation, and execute the received program. Structural definition identity and source-origin preservation are proved; the stronger universal observational preservation proposition remains unsupported and is not a standing prerequisite. Material admission and representation changes instead close the targeted obligation above, while the universal theorem reopens only under its explicit reuse or non-locality trigger.

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

## Profile-selected expression evaluation

BPMN `FormalExpression` carries expression text under a selected language. BPMN does not prescribe one universal grammar, AST, or evaluator, but an executable profile must still select the exact language, visible context, result type, failure consequence, and consuming BPMN transition. Omitted definition-level and expression-level language selection retains BPMN's XPath default and is never silently interpreted as a project language.

The standards-first path is the dependency-free [Simple Boolean expression language](SIMPLE-BOOLEAN-EXPRESSION-DECISION.md). Its immutable URI selects a closed, total, read-only grammar whose complete typed AST and string/null Process-variable meaning are implemented independently in Lean and TypeScript. The source boundary parses and rejects the complete language before Workflow start; the checked graph retains both the exact source and typed expression; Lean reparses the source when checking lowering; and the semantic core evaluates only the typed expression during bounded internal closure. This establishes one exact `FormalExpression` profile and conditional-routing mechanism without claiming XPath, JUEL, or general expression support.

External/profile-delegated languages remain a different architecture. The deferred [JUEL evaluation decision](JUEL-EVALUATION-ARCHITECTURE-DECISION.md) supplies exact expression text and complete approved context to the pinned runtime, then binds its result back to the semantic core. Such a runtime is authoritative only for its bounded language result. It does not choose a Sequence Flow, mutate semantic state directly, define variable visibility, or supply host identity. CIB and a project JUEL Worker would share one correlated expression-truth account.

Read-only evaluation, variable mutation, and engine/application-service calls are separate capability classes. The Simple Boolean language has no mutation or capability surface. A future mutating language must return a typed patch for semantic-core validation. Service calls use explicit effects or downstream adoption capabilities. Beans, `execution`, Java objects, methods, functions, file/network access, Groovy, FreeMarker, DMN/FEEL, JUEL, and XPath do not enter the Simple Boolean profile by implication.

The existing exact `MappingExpression.localVariable` form remains a bounded direct lookup for two implemented mapping capsules, not a general expression language and not a Simple Boolean or JUEL consumer. It may not grow. A future mapping-expression capsule must replace it atomically or retain a separately evidenced exact-token equivalence; pre-release code may not retain two selectable accounts for the same admitted source.

Language families remain separately selected profiles. BPMN 2.0.2 declares XPath as its default expression language, while JUEL, DMN/FEEL, Groovy scripts, and FreeMarker templates have different value, capability, failure, and hosting contracts. Do not extract a universal multi-language framework until a second implemented consumer demonstrates an identical contract.

The [Simple Boolean decision](SIMPLE-BOOLEAN-EXPRESSION-DECISION.md) owns the active language. The [Exclusive Gateway condition specification](capsules/EXCLUSIVE-GATEWAY-CONDITION-SPEC.md) owns its first consuming rules and Temporal boundary. The [JUEL decision](JUEL-EVALUATION-ARCHITECTURE-DECISION.md) owns only the deferred CIB compatibility boundary.

## CIB compatibility and polyglot effect execution

The project targets explicitly selected source and behavioral compatibility with versioned CIB Seven profiles. It does not target drop-in replacement of the Process Engine Java, REST, plugin, persistence, deployment, or administration APIs. Every compatibility claim names its source syntax, feature surface, behavior, configuration, observation boundary, and evidence; an unqualified “CIB-compatible” claim is prohibited.

Camunda/CIB extension syntax is admitted only through exact profile-selected BPMN contexts, expanded namespace QNames, and value shapes. Source/profile admission normalizes an admitted binding to profile-registered opaque protocol and operation identities validated as safe strings. Camunda namespaces and source tokens remain in exact source/profile evidence; A12 bean or Worker bindings remain in the downstream adoption layer. The checked graph, Semantic Process IL, Lean, and pure TypeScript core contain only the neutral identities and generic source-derived semantic data needed to verify neutral graph-to-program lowering. Java classes, JUEL objects, engine jobs, retries, host identities, and A12 business literals never become semantic authority merely because the source or oracle uses them. Only an explicitly selected language profile may make a pinned evaluator authoritative for its bounded expression result, under the isolation above. The approved family dispositions and reopen conditions remain in [the CIB Seven compatibility scope proposal](CIB-SEVEN-COMPATIBILITY-SCOPE-PROPOSAL.md).

The TypeScript semantic core and TypeScript Temporal Workflow remain the single production interpreter account. Committed effect intents cross a versioned language-neutral Activity protocol that may be executed by TypeScript or JVM Workers. A Worker performs external computation; it never mutates Process state directly or independently chooses semantic identity. It returns a typed result or future typed variable patch for validation and commitment by the semantic core.

Supporting Java handlers therefore does not justify rewriting the semantic core in Java or Kotlin, maintaining a second JVM interpreter, or moving semantic decisions to a remote service. A JVM Worker may expose a project-owned Java handler API and, under separately reviewed compatibility profiles, bounded adapters for CIB Seven or Camunda 7 delegates. Unsupported delegate operations fail explicitly. Full `DelegateExecution`, internal `ActivityBehavior`, Process Engine service, and plugin compatibility remain outside the architecture unless the owner funds a separate compatibility program.

Workflow and Worker implementations must agree through explicit Activity type, task queue, request/result schema, payload encoding, idempotency identity, timeout, retry, cancellation, and failure contracts. Cross-SDK compatibility is an executable evidence obligation rather than an assumption about default payload converters. A JVM Worker may be implemented in Kotlin behind Java-friendly public interfaces, but neither a Kotlin toolchain nor any Java runtime dependency follows automatically from this architecture.

The [dual semantic-core proposal](DUAL-SEMANTIC-CORE-ARCHITECTURE-PROPOSAL.md) is rejected. The TypeScript SDK’s deterministic Workflow sandbox, event-loop fit, structural wire types, existing replay evidence, and language separation from the Java CIB oracle make TypeScript the selected interpreter host. Java remains the preferred language for a future JVM compatibility Worker when the migration inventory supplies that consumer. Reopen the semantic-core language only for a named non-Temporal embedded JVM product mode that must own and advance semantic Process state in-process; a Worker, Java client façade, or Spring preference does not qualify.

## Semantic rule traceability

Each semantic capsule owns stable identifiers for its material propositions and maps them to distinct BPMN/profile, CIB, Lean, TypeScript, Temporal, negative-witness, and mutation lanes.

A rule identifier names a proposition rather than a function or test. Ordinary implementation renaming does not change it; a material semantic change must not silently reuse it.

Target scenarios contain only model/profile identity and explicit semantic inputs. Expected results remain verifier-side, content-bound evidence. Canonical observations depend only on admitted definition/runtime state and explicit semantic inputs, never on future scripted commands, host IDs, or expected output.

Every admission, lowering, runtime-representation, or public-observation capsule names the exact source-to-result claim it can invalidate and closes the smallest targeted theorem or executable guard that protects that claim. It also checks that newly reachable internal closure remains within the configured production bound and that newly reachable multiple-enabledness is order-invariant, explicitly chosen, or rejected consistently by Lean and TypeScript. A universal checked-source preservation theorem is required when a second capsule needs the same proposition or a targeted proof cannot isolate the risk without rebuilding the general relation.

Runtime variables preserve explicit scope ownership. Process-scope bindings form the public `variables` observation; Activity-local bindings are internal semantic state unless a later capsule explicitly changes the observation contract. Activity-local ownership uses complete semantic occurrence identity rather than a bare BPMN element identifier or activation ordinal.

## Pre-release evolution policy

The project is far from a production compatibility boundary and expects substantial change. Its current evolution policy therefore optimizes for one clean scalable architecture:

- each wire artifact has a stable structural `kind`;
- wire integers stay within the non-negative JavaScript-safe integer domain, and canonical identifiers are exact Unicode-scalar strings ordered lexicographically by scalar value without normalization;
- byte-level JSON admission rejects duplicate decoded object keys and unpaired surrogate encodings before typed decoding;
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
10. feedback budgets, cleanup, documentation ownership, and common-mode risks have been reviewed;
11. every rule is assigned to the BPMN core, a selected CIB overlay, or downstream adoption, and an existing mechanism is reused instead of adding a model-specific semantic path.
12. any external language evaluator is pinned and capability-bounded, its context and result are content-bound, its evidence correlation is stated, and Lean/TypeScript claims stop at the consuming transition unless expression truth is actually formalized.
