# Project design

## Mission

Build a Temporal-hosted BPMN 2.0.2 execution engine that imports Process diagrams and ultimately satisfies OMG Process Execution Conformance, and an MIT-licensed BPM platform on top of it. Standards coverage is the primary engine roadmap: the reusable semantic model, Lean account, TypeScript core, and Temporal refinement must be meaningful without CIB Seven and without any downstream product. Within that roadmap, the executable BPMN breadth of CIB Seven `2.2.0` orders the near-term standards schedule so that the engine reaches a mature practical subset quickly.

CIB Seven compatibility is a versioned overlay on that BPMN engine. It selects and classifies CIB interpretations, extensions, configuration-specific realizations, limitations, and evidenced deviations without allowing CIB host mechanisms to define the vendor-neutral BPMN core.

The distinguishing claim is that the BPMN meaning underneath the platform is machine-checked in Lean rather than asserted, and that the platform inherits that assurance because it consumes the engine's published contract instead of reconstructing semantic facts. [The product division](#product-division) states the boundary that claim depends on, and [the assurance-lane rule](#lean-assurance-lane) states how the Lean investment is allocated as breadth grows.

The project pursues these goals through four assurance and execution components:

1. a versioned CIB Seven semantic profile;
2. an executable Lean reference interpreter;
3. an independently implemented pure TypeScript semantic core;
4. a Temporal durability adapter continuously checked through differential, refinement, and replay testing.

The original supplied architecture brief is preserved as [archived provenance](archived/ARCHITECTURE-AND-ASSURANCE-HANDOFF.md); its live decisions and release gates have been transferred to current owners. The normative target is owned by [BPMN-CONFORMANCE-TARGET.md](BPMN-CONFORMANCE-TARGET.md). Every reviewed CIB relationship belongs in the prominent [CIB–BPMN register](CIB-BPMN-RELATION-REGISTER.md). This document owns the project-local constitution.

## Product division

The owner divided the work into three products on 2026-08-07.

| # | Product | Owner | License | Repository | Depends on | Owns |
|---|---|---|---|---|---|---|
| 1 | BPMN execution engine | this project | MIT | this one | Temporal | Source admission, the Lean account, the TypeScript semantic core, the Temporal adapter, semantic profiles, the CIB relationship register, and CIB oracle evidence |
| 2 | BPM platform on Temporal | this project | MIT | this one | product 1 | Deployment and versioning, tasklist, task interaction, dashboard, operations and monitoring, history, mining, diagnosis, the JUEL evaluator host, identity, persistence, and the external API |
| 3 | A12 Workflows replacement | A12 | EUPL-1.2 | **separate, A12-owned** | product 2 | A12 models, delegates, façades, and migration |

Dependency runs one way and so does licensing. Product 3 may build on MIT product 2; **product 2 must never take an EUPL dependency**, or the separation it exists to provide is gone. Product 3 consumes product 2 as a published MIT artifact, and **no A12 product code is added here**. A12 remains what it already is in this repository: an external evidence and research input under the separately selected `adoption` lane, alongside the project-authored MIT fixtures and the two profiles that carry its name. The A12 source boundary recorded in [SOURCES.md](SOURCES.md) continues to bind this repository unchanged.

### One repository for products 1 and 2

Products 1 and 2 share this repository. A change to a published observation ripples through the checked graph, the Lean account, the semantic core, the adapter, the schemas, and then the platform's read models and surfaces, and [the pre-release evolution policy](#pre-release-evolution-policy) requires that such a change replace every producer, consumer, fixture, schema, and test **atomically**. Two repositories would make that impossible for the engine-to-platform contract: it would need either lockstep releases or a version-tolerant reader, and the second is exactly what that policy forbids before an immutable baseline exists. Sharing one tree is therefore the option consistent with the project's own rules, not a shortcut around them.

Product 3 is separate for the opposite reason: it is another organization's product under a reciprocal license, so its boundary is a distribution boundary rather than a change-coordination one.

The engine keeps its existing paths and the platform is added as a sibling tree, so no guard search term, documentation link, or registry entry moves:

```text
packages/            product 1, published:  bpmn-source, semantic-core, temporal-adapter, differential
BpmnSemantics/       product 1, Lean
runners/cibseven/    product 1, oracle
profiles/ scenarios/ contracts/   product 1

platform/            product 2
runners/juel/        product 2, JVM Activity Worker
showcase/            product 2, milestone demonstrations that are also its exit gates
```

**No part of the platform tree exists yet**; [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md) owns that boundary. The rules below are obligations on the first platform increment, not descriptions of a present mechanism.

Because the repository wall is gone, the boundary must be executable instead. An owned guard must fail when an engine tree references `platform/` or `runners/juel/`; when a platform package deep-imports an engine internal path instead of its public entry point; and when a platform package imports Temporal Event History APIs at all, because deriving a BPMN fact from Event History is the precise forbidden move and banning the import makes it checkable rather than aspirational. The engine's complete gate must additionally keep passing without building any platform package, which is what demonstrates that the engine remains self-contained.

Sharing the tree also makes one check possible that separate repositories would not: for every registered scenario, the platform's projected task set must equal the engine's published open User Tasks, and its projected history must be complete with respect to the engine's committed transition records. That turns "the platform reconstructs no semantic fact" from a rule into a test.

### Dependency posture

Two rules govern the platform's dependencies, and they are commonly mistaken for one.

**A small footprint is a stated requirement, for security rather than tidiness.** Every package in the resolved graph is attack surface, and a BPM platform is exactly the kind of product where a user-facing surface, a deployment endpoint, and durable business state meet. The owner confirmed this on 2026-08-07 and declined to relax dependency approval for platform-only packages.

**Adopt rather than reimplement.** The platform implements what only it can implement and takes maintained MIT-compatible work for everything else. A JUEL evaluator and a BPMN diagram renderer are explicitly out of scope as implementation here; so is anything else whose correctness is someone else's solved problem. The owner set this direction on 2026-08-07.

The two rules agree more often than they conflict, because fewer packages is not automatically safer when the alternative is our own unaudited code in the same risky position. A hand-written multipart parser on an upload endpoint carries more exposure than a maintained one. Where they genuinely conflict, the comparison is against the whole alternative, including the defects we would introduce and maintain, never against the package count alone.

Together they define what the platform owns: the engine boundary, the projection from committed transition records into read models, deployment and admission gateway behavior, the BPM domain meaning of a task row, an incident, and an operator action, and the composition of all of it. Rendering, parsing, transport, storage engines, expression evaluation, and charting are adopted.

Each candidate is still decided on its own record through the ordinary process: research the alternatives, compare resolved footprint and licenses against what building it would cost, and obtain owner approval before anything enters the tree. Approval alone cannot hold the footprint requirement, because it inspects the direct addition rather than the resolved graph. [The dependency rule](../CLAUDE.md#dependencies) therefore obligates pairing it with an executable per-product budget over resolved package count and a permissive-license check across the whole graph. **Neither guard nor budget exists yet**, and [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md) records their absence; until they land, `SOURCES.md` is the only audit and the requirement binds at review rather than between reviews.

Within product 1 the internal layering is unchanged:

```text
BPM platform on Temporal            (product 2)
        ↓ consumes the published engine contract
selected CIB Seven compatibility profiles
        ↓ refine or extend
vendor-neutral BPMN 2.0.2 execution core
        ↓ hosted by
Temporal durability and effect infrastructure
```

| Layer | Owns | Must not own |
|---|---|---|
| BPMN execution core | Standard Process structure and lifecycle, control flow, Activities, Events, scopes, variables, public semantic observations, and host-independent commands | Camunda extension QNames, CIB jobs/retries/incidents, downstream handlers or APIs, Temporal attempts, or product-specific model shapes |
| CIB Seven compatibility profile | Classified interpretations and gap resolutions, selected `camunda:*` source extensions, CIB configuration, transaction/variable behavior, jobs/retries/incidents, and bounded behavioral compatibility evidence | General BPMN authority, unqualified engine compatibility, downstream integration APIs, or product-specific business semantics |
| BPM platform | Deployment, read models, user and operator surfaces, persistence, identity, the pinned JUEL runtime, and product acceptance evidence | Any BPMN meaning, transition, admission decision, or occurrence identity it did not receive from a published engine observation |

### What the platform may consume

Product 2's permitted surface for **consuming semantic state** is the engine's published contract, in four kinds: compile exact bytes against a selected profile, start an admitted program, observe committed canonical state, and submit a command. Nothing else of that kind crosses.

Those four are a taxonomy of permitted consumption, **not yet the shape of any package boundary**: `packages/temporal-adapter` currently re-exports harness material alongside its client surface, so the narrowness this rule describes has to be established by narrowing each engine package's public entry point. That narrowing is platform-increment work recorded as absent in [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md), and until it lands the guard cannot hold the boundary at the claimed width.

Consumption is not the only direction. The platform additionally **hosts** engine-defined work: it runs the Workflow Worker carrying the admitted program, implements the effect Activity Worker, and will host the pinned JUEL runtime. Hosting an evaluator whose result decides a Sequence Flow is safe only under the existing isolation, where an explicitly selected language profile bounds the evaluator and the semantic core validates the content-bound result before applying the consuming BPMN rule. Hosting is a responsibility, never a fifth way to reach semantic state.

Because the two products share a tree, the platform will link engine packages through the workspace, which is what makes the atomic cross-layer change above possible; the boundary is therefore to be held by the executable guard and those narrowed entry points, not by a distribution step.

Each surface additionally splits into a service, a public HTTP API over it, and a client. **The platform's own UI must consume only that public API and may not import a platform service package.** The reason is evidential rather than stylistic: the UI is the most demanding client the platform has, so a guarded UI passing demonstrates the API is sufficient for an adopter who builds their own front end. Without it, such an adopter discovers the API's gaps only after committing to it, and the platform's claim to be adoptable at the API is untested.

Two rules make the assurance claim transferable, and without both of them it is false:

- **Occurrence identity is taken, never constructed.** The platform answers a published interaction by submitting the identity that interaction carried. No product code assembles a task, subscription, activation, or Call identity.
- **A missing fact is a stop condition, not a workaround.** When the platform needs something the engine does not publish, it files an engine requirement and stops. It does not derive the fact from Temporal Event History, from a state difference, or from its own store. This extends the rule the engine runner already applies to a rejected wait-set shape.

CIB Seven enters product 2 as a *functional* reference only: it answers what capabilities a BPM platform has to have. No CIB screen, interaction pattern, or line of code is derived, so no provenance record is required for it.

A representative vertical slice may deliberately cross layers when needed to prove that source admission, semantics, CIB realization, and Temporal hosting compose. The `CreateDocument` and typed boundary-error slices are such feasibility evidence. They do not establish a policy of implementing every downstream model independently across every layer.

After a seam is proven, work proceeds by reusable semantic mechanism. A model that uses already implemented BPMN and CIB mechanisms should normally add only platform configuration and regression evidence. A new full semantic capsule is justified only by a new BPMN proposition, a newly selected CIB relationship, or a material Temporal refinement risk.

Coverage is accounted separately:

1. BPMN coverage counts reviewed Process Execution requirements and reusable standard mechanisms;
2. CIB coverage counts classified source extensions and behavioral relationships for named profiles;
3. platform coverage counts closed showcase milestones and their acceptance gates, against the denominator in [the showcase milestone ladder](PLAN.md#showcase-milestone-ladder), which [PLAN.md](PLAN.md) owns.

No aggregate percentage may combine these denominators, and no public claim may exceed the exact profile and evidence recorded in [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md). The architecture is built so that a conformance claim becomes provable; the claim itself stays bounded until the evidence supports it.

## CIB Seven 2.2.0 breadth ordering

CIB Seven `2.2.0` is the primary breadth baseline for ordering the near-term BPMN 2.0.2 Process Execution schedule. Choose the next uncovered reusable BPMN mechanism primarily from the executable Process surface evidenced by that release, subject to semantic dependencies, capsule size, and Temporal feasibility. When two candidates are of equal standards value, **the one the BPM platform's next showcase milestone needs wins**, read from [the showcase milestone ladder](PLAN.md#showcase-milestone-ladder) that [PLAN.md](PLAN.md) owns. The engine's essential element set and depth are additionally scoped by [the minimal engine research](research/MINIMAL-USEFUL-BPMN-ENGINE-RESEARCH.md), with its deferred constructs covered by [the extensions research](research/HIGH-PRIORITY-BPMN-EXTENSIONS-RESEARCH.md); neither disposes a requirement, and [the requirement ledger](BPMN-REQUIREMENT-LEDGER.md) still owns dispositions.

This is a scheduling rule, not an authority reversal and not a combined coverage denominator. BPMN 2.0.2 remains normative; every mechanism receives a standards-owned account; CIB-specific interpretations and extensions remain separately classified; and a standards capsule may still omit CIB from its target relation when CIB supplies no independent evidence for that exact proposition.

The breadth baseline counts executable Process behavior rather than every CIB product feature or public API. Administration, persistence, authorization, Tasklist, Cockpit, forms UI, identity management, Collaboration features not exercised by the selected engine baseline, and product-specific human-resource policy do not enter the **semantic** schedule merely because a CIB distribution contains adjacent facilities. Several of those facilities are exactly what product 2 must provide, and it provides them as its own MIT work without importing CIB semantics for them.

The [BPMN requirement ledger](BPMN-REQUIREMENT-LEDGER.md) owns standards dispositions. The [CIB–BPMN register](CIB-BPMN-RELATION-REGISTER.md) owns relation classifications. [PLAN.md](PLAN.md) owns the concrete ordered queue.

## Engine runner delivery boundary

The [Temporal engine runner](RUNNABLE-TEMPORAL-MVP-SPEC.md) is the implemented engine-side product floor: an ordinary external-Temporal Worker and command path for the registered admitted profiles, plus explicit host simulations that answer published interactions through the real semantic command boundaries. The command owns no Temporal server or port lifecycle, and unsupported source is rejected before it connects.

That simulated actor is host policy. It does not define BPMN User Task meaning and adds no human-resource model. It is also not the product's user surface: real task interaction, forms, identity, authorization, discovery, and a task inbox belong to product 2, which reaches them through the same published contract and the same content-bound commands this actor uses. Completion data is a separately reviewed CIB-profile semantic extension under the [User Task completion-data specification](capsules/USER-TASK-COMPLETION-DATA-SPEC.md).

## Lean assurance lane

Breadth is how the approach's unknown failure modes are found, not what they are traded for. Nothing further proved about the current bounded topologies reveals whether the account survives cycles, arbitrary graphs, a wider value domain, or ordinary multiple-enabledness. Each engine milestone therefore carries one named research question, recorded with [the showcase milestone ladder](PLAN.md#showcase-milestone-ladder) that [PLAN.md](PLAN.md) owns, and each capsule declares the **shape** of its Lean lane at capsule start rather than discovering it from how much effort the lane absorbed.

| Lane shape | When it is required | Recorded as |
|---|---|---|
| Proved | The risk is an invariant no finite test can cover: progress under cycles, cancellation removing exactly the owned subtree, trace completeness with respect to the transition relation | A quantified theorem with useful hypotheses |
| Checked | The proposition is finite and the risk is a coding slip | A decided fixture or executable guard |
| Deliberately open | Neither is affordable within the capsule's effort bound | An explicit absence in [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md) with its reason and reopen trigger |

The first two shapes are the choice [the targeted preservation gate](PLAN.md#approved-decisions) already permits between "the smallest reusable theorem or executable guard". **The third is new and widens a proof boundary**: that gate requires every capsule in its scope to close one of those two, and "deliberately open" closes neither, so it changes the minimum assurance a capsule may close with. It is recorded as an owner decision superseding that part of the 2026-07-30 gate rather than presented as a permission that already existed, and it is therefore a material change under [the materiality definition](../CLAUDE.md#independent-cold-review). The reason for keeping it is that some obligations are genuinely unaffordable within a capsule, and an unrecorded gap is worse than a recorded one.

Two outcomes look alike and are not. A Lean lane that cannot close within its effort bound is a cost signal, handled the way the checked-source relation experiment was handled: record the precise unresolved boundary, freeze the experiment, and let the product continue on the executable guard. A Lean lane that **refutes** a proposed account is the payoff the approach exists for. Only the third case genuinely stops work, where a preservation obligation cannot be stated without assuming its own result, and [PLAN.md](PLAN.md#stop-conditions) already owns it as a stop condition.

Two costs are known to grow with breadth and are scheduled rather than discovered. Kernel-decided fixtures hold their terms in resident memory and their peak grows with the fixture count, which grows with every capsule; and loops lengthen each decided run at the same time as breadth multiplies them. The decided-fixture strategy is therefore reviewed before the compositional-admission milestone, not after it.

## Authority model

BPMN and CIB are related but not interchangeable. BPMN 2.0.2 is authoritative for syntax, metamodel, and Process Execution Conformance. CIB Seven is a mature, compliance-oriented implementation whose normal role is to realize BPMN faithfully, make underspecified behavior operational, and add explicit engine extensions.

The default CIB classification is normative agreement. Greater operational specificity is an interpretation when it resolves a BPMN gap. Worker, job, retry, incident, listener, or other added capabilities are extensions when they exceed bare BPMN. A normative deviation is exceptional and requires clear standard language, pinned separating evidence, alternative-explanation exclusion, and owner review.

CIB participates twice:

- before formalization, a normative requirement and the smallest relevant CIB probe are reviewed and classified into a semantic profile;
- after implementation, the pinned complete engine remains the independent behavioral oracle for that declared profile.

Raw CIB output never becomes Lean authority automatically, and differential mismatches are never resolved by majority vote.

## Pre-coding decision ownership

The supplied handoff's original pre-coding checklist is discharged through current owners rather than repeated as a second live checklist:

| Decision | Current owner |
|---|---|
| Exact CIB release, source revision, and environment | [SOURCES.md](SOURCES.md), each semantic profile, and the [CIB–BPMN register](CIB-BPMN-RELATION-REGISTER.md) |
| Compatibility level and selected CIB extensions | [CIB Seven compatibility scope](CIB-SEVEN-COMPATIBILITY-SCOPE-PROPOSAL.md) and profile-specific capsules |
| BPMN feature subset | [BPMN requirement ledger](BPMN-REQUIREMENT-LEDGER.md), [Semantic Process IL](SEMANTIC-PROCESS-IL-SPEC.md), and semantic capsules |
| Database and scheduler profiles | Selected CIB profiles and [TESTING-SPEC.md](TESTING-SPEC.md) |
| Expression and variable-type subsets | Profile-selected expression decisions, data capsules, and [Semantic Process IL](SEMANTIC-PROCESS-IL-SPEC.md) |
| Observation boundary | Shared wire contracts, semantic capsules, and [TESTING-SPEC.md](TESTING-SPEC.md#evidence-lanes) |
| Listener and history inclusion | [Temporal lifecycle specification](TEMPORAL-PROCESS-LIFECYCLE-SPEC.md) and the pre-release policy below |
| Nondeterminism and causal ordering | Semantic capsules, profile admission, and [TESTING-SPEC.md](TESTING-SPEC.md) |
| External services | Effect capsules and versioned Worker protocols |
| Profile and artifact evolution | The pre-release evolution policy below and profile registry |
| Evidence and release gates | [TESTING-SPEC.md](TESTING-SPEC.md#profile-release-readiness-gate) |

No component may silently answer an undecided semantic question. A new decision returns to its named owner, applicable normative or CIB evidence, and independent review gate before implementation crosses that boundary.

## Component boundaries

| Component | Responsibility | Explicit limit |
|---|---|---|
| BPMN semantic profile | Select one bounded reading of the normative Process requirement, including explicit resolution of a standard gap or inconsistency | It contains no CIB extension or downstream product binding unless a separately named overlay selects it |
| CIB Seven compatibility profile | Select a pinned release, configuration, source extensions, host realization, observation boundary, and classified relation to the BPMN account | It is not the vendor-neutral BPMN core, an engine build, or an unqualified compatibility promise |
| BPMN source boundary | Preserve exact bytes, validate and admit source, and produce a checked project-owned BPMN graph | Parser objects and CMOF facts do not define execution behavior |
| Semantic Process IL | Lower the checked graph into a bounded language of typed semantic mechanisms with source provenance | It is not a mirror of the BPMN metamodel, a universal BPMN language, or mutable runtime state |
| Lean reference interpreter | Give the selected capsule executable operational meaning and prove reusable laws | It does not automatically prove CIB, XML parsing, TypeScript, Temporal, databases, or effects |
| TypeScript semantic core | Implement production semantic transitions as a separately written, deterministic realization of the reviewed account, including explicitly selected project-owned total expression languages | It performs no I/O, evaluates no external/profile-delegated language such as JUEL, has no CIB or Temporal dependency, and is not an independent choice of operational account |
| Temporal adapter | Persist semantic state, deliver inputs, and host declared effects and waits durably | Hidden Workflow work may not redefine BPMN-visible behavior |
| BPM platform | Deploy and version definitions, project engine observations into read models, and serve user, operator, and integration surfaces | It does not enter the semantic core, redefine profiles, construct an occurrence identity, or reconstruct a semantic fact the engine did not publish |
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

The intended adapter-correctness relation is observational, weak, and stuttering-aware: Temporal may add hidden durable steps only while preserving semantic-core-visible behavior. Current finite refinement and replay witnesses establish their exact capsule boundaries; they do not yet constitute a general refinement theorem.

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

Camunda/CIB extension syntax is admitted only through exact profile-selected BPMN contexts, expanded namespace QNames, and value shapes. Source/profile admission normalizes an admitted binding to profile-registered opaque protocol and operation identities validated as safe strings. Camunda namespaces and source tokens remain in exact source/profile evidence; bean or Worker bindings remain in the BPM platform. The checked graph, Semantic Process IL, Lean, and pure TypeScript core contain only the neutral identities and generic source-derived semantic data needed to verify neutral graph-to-program lowering. Java classes, JUEL objects, engine jobs, retries, host identities, and downstream business literals never become semantic authority merely because the source or oracle uses them. Only an explicitly selected language profile may make a pinned evaluator authoritative for its bounded expression result, under the isolation above. The approved family dispositions and reopen conditions remain in [the CIB Seven compatibility scope proposal](CIB-SEVEN-COMPATIBILITY-SCOPE-PROPOSAL.md).

The TypeScript semantic core and TypeScript Temporal Workflow remain the single production interpreter account. Committed effect intents cross a versioned language-neutral Activity protocol that may be executed by TypeScript or JVM Workers. A Worker performs external computation; it never mutates Process state directly or independently chooses semantic identity. It returns a typed result or future typed variable patch for validation and commitment by the semantic core.

Supporting Java handlers therefore does not justify rewriting the semantic core in Java or Kotlin, maintaining a second JVM interpreter, or moving semantic decisions to a remote service. A JVM Worker may expose a project-owned Java handler API and, under separately reviewed compatibility profiles, bounded adapters for CIB Seven or Camunda 7 delegates. Unsupported delegate operations fail explicitly. Full `DelegateExecution`, internal `ActivityBehavior`, Process Engine service, and plugin compatibility remain outside the architecture unless the owner funds a separate compatibility program.

Workflow and Worker implementations must agree through explicit Activity type, task queue, request/result schema, payload encoding, idempotency identity, timeout, retry, cancellation, and failure contracts. Cross-SDK compatibility is an executable evidence obligation rather than an assumption about default payload converters. A JVM Worker may be implemented in Kotlin behind Java-friendly public interfaces, but neither a Kotlin toolchain nor any Java runtime dependency follows automatically from this architecture.

The [archived dual semantic-core proposal](archived/DUAL-SEMANTIC-CORE-ARCHITECTURE-PROPOSAL.md) records the rejected alternative. The TypeScript SDK’s deterministic Workflow sandbox, event-loop fit, structural wire types, existing replay evidence, and language separation from the Java CIB oracle make TypeScript the selected interpreter host. Java remains the preferred language for a future JVM compatibility Worker when the migration inventory supplies that consumer. Reopen the semantic-core language only for a named non-Temporal embedded JVM product mode that must own and advance semantic Process state in-process; a Worker, Java client façade, or Spring preference does not qualify.

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
