# BPM platform proposal

## Status

**Owner-approved on 2026-08-07; not implemented.** It is the accepted phase-one contract for product 2 of [the product division](PROJECT-DESIGN.md#product-division): an MIT-licensed BPM platform on Temporal, built in this repository on top of the BPMN execution engine. It stays a proposal rather than a specification because nothing here is implemented and no dependency is adopted; [DOC-DISCIPLINE.md](DOC-DISCIPLINE.md) reserves `-SPEC` for an implemented contract. The independent cold proposal review returned `approve-with-required-edits`; all findings are closed and audited, as [the receipt](#independent-cold-review-receipt) records.

Sequencing belongs to [PLAN.md](PLAN.md), durable architecture to [PROJECT-DESIGN.md](PROJECT-DESIGN.md), the exact implemented boundary to [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md), and the stack evidence to [the platform stack research](research/BPM-PLATFORM-STACK-RESEARCH.md). The [competitive platform-scope research](research/BPM-PLATFORM-COMPETITIVE-SCOPE-RESEARCH.md) records a broader growth horizon and does not expand this proposal's first-product contract.

## Product question

What is the smallest complete BPM platform that makes the engine usable by someone who is not us, without acquiring any authority over BPMN meaning?

Two failure modes bound the answer. A platform that reconstructs semantic facts the engine did not publish silently becomes a second, unverified semantic authority, and the Lean assurance underneath stops transferring. A platform that exposes only what our own screens happen to need is not adoptable, because the first external consumer discovers the gap after committing.

## Scope

The platform provides deployment and versioning of BPMN definitions, a task list and task interaction surface, an operations and monitoring console, incident handling, execution history, process mining views, identity, persistence, and one public HTTP API over all of it. It hosts the JUEL evaluator as an Activity Worker when the deferred CIB compatibility lane opens.

It is a product, not a demonstration. Its acceptance gates are showcase milestones rather than a separate artifact, recorded as [the showcase milestone ladder](PLAN.md#showcase-milestone-ladder), which [PLAN.md](PLAN.md) owns.

## What the platform owns, and what it must not

| Owns | Must not own |
|---|---|
| The engine boundary adapter | Any BPMN meaning, transition, or semantic rule |
| Projection of committed transition records into read models | Any admission decision; it delegates to the engine compiler and reports the result |
| Deployment store, version ordinals, and the admission gateway | Construction of any occurrence identity |
| The BPM domain meaning of a task row, an incident, and an operator action | Any semantic fact the engine did not publish |
| Identity, authorization, persistence, and the public API | The pinned JUEL grammar or evaluator semantics, which remain the engine's consuming rule |
| The user and operator surfaces, and the component kit behind them | A second representation of Process state that could disagree with the engine |

## The engine boundary

[PROJECT-DESIGN.md](PROJECT-DESIGN.md#what-the-platform-may-consume) owns the permitted consumption surface, the two rules that make the assurance claim transferable, the hosting responsibilities that are not consumption, and the guards that must hold them. This proposal does not restate them and **adds no consumption operation**.

What follows for this proposal: every surface below is built from those four operations alone. Where a surface needs something the engine does not publish, that is recorded here as an engine requirement rather than designed around. **Two such requirements exist**, and both are engine work outside this proposal's scope:

| # | Requirement | Needed by |
|---|---|---|
| E1 | A committed per-transition record in the public contract | [History, mining, and diagnosis](#history-mining-and-diagnosis), and the read model generally |
| E2 | A profile admission capability for User Task assignment and form metadata, and a public projection carrying it | [Task list](#task-list) and [Task interaction](#task-interaction) |

E2 is new information from the proposal review rather than an assumption: `CheckedNodeKind.UserTask` carries `{id, name}`, the published `OpenUserTask` carries `{id, name, state}`, and no engine package source contains `assignee`, `candidateGroups`, or `formKey`. Those surfaces therefore ship without assignment and form metadata until E2 is separately proposed and approved.

The consumption surface is already exercised: [the engine runner](RUNNABLE-TEMPORAL-MVP-SPEC.md#interaction-driver) uses only those four kinds today, which is why this proposal treats them as sufficient for interaction and insufficient for history.

## API-first architecture

Each surface is a service plus a public HTTP API plus a React client. [PROJECT-DESIGN.md](PROJECT-DESIGN.md#what-the-platform-may-consume) owns the rule that the UI consumes only that public API and its evidential rationale; this proposal applies it rather than restating it.

```text
engine packages                     (product 1, published contract)
        ↑ four operations
platform services                   deployment, projection, tasklist, operations, identity
        ↑ in-process
platform API                        the public HTTP surface
        ↑ HTTP only
platform UI                         React SPA
```

A consequence worth stating: the UI is optional. An adopter may run the services and API without it, which is the shape product 3 adopts.

## Surfaces and their functional scope

The capability set is derived from what a BPM platform must have, using CIB Seven's product surface as a **functional** reference only. No CIB screen, interaction pattern, or line of code is derived, so no provenance record arises from it.

### Deployment and definitions

Accept a BPMN file, run engine compilation against a selected profile, and report acceptance or rejection with the offending element identity and reason. Store accepted definitions content-addressed by the SHA-256 the engine compiler already computes, with a version ordinal per BPMN process identifier. List definitions and versions, and render each definition's diagram.

Every started instance pins the exact source digest, so definition version pinning follows from the existing byte-exact identity rather than needing a separate mechanism.

### Task list

Task rows across all instances, filtered and sorted, from the engine's published open User Tasks. Claim and release. Completion submits the engine's exact content-bound completion command.

**Assignment metadata is not available and this surface ships without it until E2 lands.** When it does, it is **projected profile data, never a precondition on the engine command**: the engine continues to accept any correct completion for an active occurrence, and who may submit it is a platform authorization decision. That keeps the User Task rules untouched, and it is already true today, since the completion command takes only the content-bound stimulus.

### Task interaction

Render a form from the Process variables the engine publishes, currently a closed string/null domain, collect values, and submit them through the same completion command. No form engine of our own. Form metadata is unavailable until E2 lands, so the first form is a projection of the bindings that currently exist over that one value type, and no interpretation of form metadata beyond field identity and type is proposed even afterwards.

### Operations and monitoring

Instance list with status and filters. Instance detail showing token position on the diagram, Process variables, open waits, and the instance's own history. Incident list with retry. Instance cancellation.

Instance cancellation and incidents are **engine capsules, not platform features**. The platform exposes them; it cannot implement them, because both are semantic transitions.

Host-level detail is deliberately not reimplemented: the console links out to Temporal's own UI for Event History, Workflow retries, and Activity attempts. BPMN facts come from our surfaces, host facts from Temporal's.

### History, mining, and diagnosis

An execution event log projected from committed transition records, per instance and across instances. A process map overlaying frequency and duration on the definition diagram. Basic aggregate views.

The interesting mining visual is an overlay on the diagram rather than a chart, so it belongs to the diagram renderer rather than to a charting library. Deeper conformance checking and variant analysis are excluded below, partly because the mature libraries in that field skew copyleft.

### Identity

A pluggable identity boundary with a fake implementation by default. No authentication provider is selected by this proposal. Building our own authentication is explicitly out of scope.

## Read model and projection

The platform subscribes to the engine's committed transition records and projects them into its own store. Task rows, instance rows, history events, and incident state are all projections; none is a second source of truth.

The projection is the reason for E1. The engine's public contract currently publishes committed *state* at command boundaries, and pure transitions may close to quiescence inside one Workflow Task, so many semantic steps leave no trace. State differencing recovers waiting Activities, because a User Task entering and leaving the open set is a start and an end, but recovers nothing for pass-through nodes: gateways taken, None Events, Sub-Process entry and exit. Definition-scope and runtime-scope identity are not publicly projected at all.

A process map without gateway paths is not process mining. **An engine change is therefore required**, and this proposal does not decide its shape.

At least two shapes could serve. A **committed per-transition record** emitted by the same commit that applies each operation is the more direct answer for history and mining. Alternatively, **publishing committed control-token and scope positions in each observed state** would serve the same need less completely while also serving the Operations surface's token overlay, which needs positions that are equally unpublished today. Whichever is chosen must not be reconstructed from Temporal Event History, which the non-negotiable boundaries forbid as a source of BPMN facts.

Requirement E1 is therefore "an engine change that makes transitions and token positions publicly recoverable", and its shape is decided in its own material proposal rather than here.

Cross-instance discovery is the platform's own problem and requires no engine change: the projection builds the index.

## Deployment store

Content-addressed on the filesystem under the digest the compiler already computes, with a small index in the platform's store. No database is required for definition blobs. The read model uses the store below.

## Selected stack

Evidence, alternatives, measured footprints, and the rationale are owned by [the platform stack research](research/BPM-PLATFORM-STACK-RESEARCH.md#3-recommendation). This section records the selection and its approval state.

| Component | Selection | Approval state |
|---|---|---|
| UI framework | React 19 with plain Vite, single-page, no meta-framework | Selected, no dependency approval outstanding beyond React itself |
| Behavior and accessibility primitives | `react-aria-components` 1.20.0, Apache-2.0 | Owner-selected 2026-08-07; approval record below |
| Table logic | `@tanstack/react-table` 9.0.1, MIT | Owner-selected 2026-08-07 |
| Virtualization | `@tanstack/react-virtual` 3.14.9, MIT | Owner-selected 2026-08-07 |
| Server state | `@tanstack/react-query` 5.101.4, MIT | Owner-selected 2026-08-07 |
| Component kit | Platform-owned, written over the primitives | Our source, roughly 2,000 lines expected |
| Diagram rendering | `bpmn-js` viewer with its `overlays` API | **Approval outstanding** |
| Read-model store | `node:sqlite`, part of the pinned Node 24.18.0 | No approval needed; upstream experimental status to be recorded |
| Styling method | Open; CSS Modules costs nothing extra under Vite | **Open decision** |
| Charting | Hand-rolled SVG first; a dependency-free library if that proves insufficient | **Open decision** |
| Live updates | HTTP long-polling on the Temporal pattern, no WebSockets or server-sent events | Proposed |
| HTTP surface | To be decided against the dependency posture; hand-writing multipart upload parsing is the worse security answer | **Open decision** |

### Approval record for the selected four

Measured on 2026-08-07 by installing into an empty project on the pinned Node 24.18.0. Resolved tree: **24 packages, 15 MIT, 8 Apache-2.0, 1 0BSD, zero copyleft, zero unknown, zero install scripts.**

| Package | Version | Licence | Role | Removal cost |
|---|---|---|---|---|
| `react-aria-components` | 1.20.0 | Apache-2.0 | Behavior, keyboard interaction, focus management, ARIA semantics | High. Every kit component is built on it; replacement means rewriting the kit |
| `@tanstack/react-table` | 9.0.1 | MIT | Headless table logic | Medium. Confined to the kit's table component |
| `@tanstack/react-virtual` | 3.14.9 | MIT | Row virtualization | Low. One component, large lists only |
| `@tanstack/react-query` | 5.101.4 | MIT | Server-state caching and refetch | Medium. Replaceable at the cost of re-solving cache invalidation |

## Package structure

```text
platform/
  deployment/   content-addressed store, version ordinals, admission gateway
  projection/   subscribes to committed transition records, builds read models
  tasklist/     task read model, claim and release, completion
  operations/   instance and incident read models, operator actions
  identity/     pluggable, fake by default
  api/          the public HTTP surface over the above
  ui-kit/       platform-owned components over the primitives
  ui/           React SPA, consumes api over HTTP only
runners/juel/   JVM Activity Worker, pinned JUEL runtime, never a semantic path
showcase/       milestone demonstrations, which are the acceptance gates
```

Engine paths do not move. `runners/juel/` is the only Java component and remains an Activity Worker.

## Non-functional requirements

[The dependency posture](PROJECT-DESIGN.md#dependency-posture) and [the product division](PROJECT-DESIGN.md#product-division) govern footprint, licence direction, and MIT distributability. Two requirements this proposal adds on top of them, because they are selection criteria for the platform rather than repository-wide rules:

**Longevity.** Dependency backing and maintainer concentration are first-class selection criteria, not tie-breakers. [The stack research](research/BPM-PLATFORM-STACK-RESEARCH.md#73-maintainer-concentration-and-backing) records the measurements this turns on and the one candidate it eliminated.

**Adopter-first.** The platform is optimized for an adopter who uses the UI as it ships and brands it, not for one who substitutes their own component library.

## Acceptance conditions

**The product acceptance test the owner set on 2026-08-07 is that a third party can deploy their own BPMN file.** This condition defines M1 in the [showcase milestone ladder](PLAN.md#showcase-milestone-ladder) and required admission to accept the selected safe modeler notation without assigning unsupported execution meaning. No platform surface satisfies it alone.

A surface is accepted when it has a runnable demonstration under `showcase/`, registered as a gate so a landed milestone cannot silently rot, and when the boundary guards and the cross-product agreement test that [PROJECT-DESIGN.md](PROJECT-DESIGN.md#one-repository-for-products-1-and-2) requires are green. Each guard is verified by a planted violation, as this repository verifies every guard.

**No product lane is an independent semantic evidence lane.** The platform composes the already-evidenced compiler, program, semantic core, Workflow, and client. Nothing here supports a BPMN conformance or CIB compatibility claim.

## Explicit exclusions

- BPMN modeling or editing in the browser, DMN authoring or execution, and any form designer;
- A12 widgets, A12 models, A12 delegates, and A12 façade adaptation, all of which belong to product 3;
- authentication providers, single sign-on, directory integration, and any authorization model beyond the pluggable boundary;
- multi-tenancy, clustering, horizontal scaling, high-availability claims, and production release packaging;
- conformance checking, variant analysis, and predictive process mining beyond frequency and duration overlays;
- reimplementation of Temporal's own operator surfaces, which are linked out to;
- any semantic capability the engine does not publish, including cancellation and incidents until their engine capsules close;
- migration of running instances between definition versions;
- a second Process-state representation, a semantic assertion language, and any platform-side interpretation of BPMN meaning.

## Open decisions

1. Styling method for the platform component kit.
2. `bpmn-js` adoption, needing its own approval record.
3. HTTP surface: a maintained minimal library against hand-written request handling, weighed against the whole alternative rather than the package count.
4. Charting, if hand-rolled SVG proves insufficient.
5. Whether platform-only dependencies follow the same per-item approval as engine dependencies. Currently they do, unchanged.

## Reopen conditions

Reopen this proposal before adding a second Process-state representation, any platform-side semantic interpretation, an authentication provider, multi-tenancy, browser-based modeling, mining beyond frequency and duration, an EUPL dependency, or any path that bypasses the engine's four-operation boundary or constructs an occurrence identity.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `4bfe36d` | `fork-turns-none` | `approve-with-required-edits` | `af66ee3` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-required` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |

The proposal stage used **one correction round**. The cold review of target `4bfe36d` returned thirteen required findings; correction `af66ee3` closed all thirteen and the same reviewer's audit confirmed each. That audit raised six residual defects of its own, three required, of which three were topic sentences and a receipt clause still asserting a claim the correction had removed from the surrounding paragraphs. Those were applied at `0c07ed6` and were not re-audited, on the reviewer's explicit statement that no third round was warranted if applied verbatim. The review's routed sections included the assurance-lane rule in [PROJECT-DESIGN.md](PROJECT-DESIGN.md#lean-assurance-lane), so this cycle is the one owning that rule's material supersession, as [PLAN.md](PLAN.md#approved-decisions) records.

The semantic-checkpoint stage is classified as not required because this proposal itself changes no BPMN meaning, no semantic profile or CIB relationship, no checked-source or Semantic Process representation, no runtime or public observation, no admission or profile capability, no transition family or proof boundary, and no Temporal refinement claim. The two engine requirements it records, E1 and E2, are engine work outside its scope and carry their own governed cycles; E2 is an admission and profile capability, which is precisely why it is not proposed here. A docs-only follow-up records the immutable proposal target before the review prompt is handed off, because a commit cannot contain its own Git identity.
