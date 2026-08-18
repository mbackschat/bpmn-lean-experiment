# Showcase milestone ladder decision

## Status

Implemented. This is the adopted dependency order and exit-gate owner for Product 2 showcase milestones.

## Showcase milestone ladder

The approved [BPM platform proposal](BPM-PLATFORM-PROPOSAL.md) makes showcase milestones its acceptance gates and leaves the list to this plan. This is that list.

Each milestone names one capability demonstrable end to end, the engine work it forces, the platform work it adds, and the executable gate that closes it. The order is a dependency order and not a schedule. It is deliberately shorter than the eight-stage horizon in [the competitive scope research](research/BPM-PLATFORM-COMPETITIVE-SCOPE-RESEARCH.md#dependency-ordered-roadmap), which is design input; the exit gates below are the binding ones, and a milestone closes only when its gate is green and the applicable detail maps routed by [`implementation-status-router`](IMPLEMENTATION-MAP.md) record the exact surface it reached.

Two boundaries hold across the whole ladder. The engine must still build and verify with no platform package present, and the platform must reach the engine only through narrowed public entry points. A milestone that can be demonstrated only by violating either has not been reached.

### M0 — shipped floor

**Status: closed.**

The [Temporal engine runner](RUNNABLE-TEMPORAL-MVP-SPEC.md) over the registered profile catalog. No demo is owed; it exists so the later exit gates have a baseline to differ from. Its configured actors and effect handlers are host simulations, and User Task interaction stays simulated until M3 replaces it with a real inbox.

### M1 — a third party deploys their own BPMN file

**Status: closed.** The engine admission slice, narrow compilation and exact-version start gateway, exact artifact byte store, strict public definition contract, durable per-process versioning workflow, public definition API, server composition, React definition workspace with viewer-only diagram rendering and selected-version start, and required headless Chromium acceptance are implemented. The registered showcase composes a cached ephemeral Temporal service, production Worker, production platform server, and browser client without putting test infrastructure in a production dependency graph.

**Demo.** Someone who is not us uploads BPMN bytes we have never seen, receives an honest per-element admission verdict, and starts an instance when the file is admitted.

This is the owner's original acceptance condition. The preserve-enabled profile admits the selected modeler notation without executing it and reports each refused element. Product 2 receives exact uploaded bytes through its public API, compiles them without receiving private engine representations, stores exact digest-bound bytes without replacement, assigns durable monotonic versions within each process ID, and returns public diagnostics and exact source. Exact-version start recompiles stored bytes and binds source, digest, profile, Process ID, version, semantic instance ID, and Task Queue before calling the concrete Temporal client. The HTTP-only React client composes upload, diagnostics, catalog, version, source-identity verification, licensed diagram rendering, and selected-version start. The showcase exercises that composition over runtime-created source and real Temporal hosting.

**Engine capsules.** Preserve-only admission, splitting parsed material into executed, preserved, and rejected as [the minimal-engine research](research/MINIMAL-USEFUL-BPMN-ENGINE-RESEARCH.md) recommends; multi-root definitions with explicit executable-root selection; per-element rejection diagnostics carrying element identity and reason.

**Platform increments.** The public HTTP API, upload, content-addressed definition storage keyed by engine-computed digest, version ordinals within a BPMN process identifier, viewer-only diagram rendering, admission diagnostics, and a React client that consumes only the same public API an external adopter has.

**Exit gate.** An externally supplied file that is not a registered fixture is admitted, stored, versioned, rendered, and started; an unsupported one is rejected before Workflow start with its element identity; exact bytes, digest, profile, and version stay bound; and the engine gate passes with the platform tree absent.

### M2 — the file runs its real shape

**Status: closed.** The resumption-bounded cyclic-control-flow, Message Start Event, Timer Start Event, Terminate End Event, [configured Task extension](capsules/CONFIGURED-GENERIC-TASK-SPEC.md), [exact-version definition scheduling](BPM-PLATFORM-DEFINITION-SCHEDULING-SPEC.md), [published Message Start ingress](BPM-PLATFORM-MESSAGE-INGRESS-SPEC.md), and [Process-instance search](BPM-PLATFORM-PROCESS-INSTANCE-SEARCH-SPEC.md) increments are implemented, closure-reviewed, evidence-closed, and graduated.

**Demo.** A third-party model with a loop and a real start trigger executes, rather than only the acyclic shapes the current admission accepts.

**Engine capsules.** Compositional admission with cycles, replacing the topological-sort acyclicity check in [graph admission](../packages/semantic-core/src/semantic-process-graph-admission.ts); and the four base elements the research marks essential. Message Start, Timer Start, Terminate End, and the versioned configured Task extension are closed. The configured Task reuses the existing neutral effect mechanism while preserving plain Abstract Task's standard immediate-completion meaning as conforming but deferred.

This is the milestone that must be preceded by the decided-fixture cost review recorded below.

**Platform increments.** Definition scheduling for Timer Start, a published message ingress for Message Start, and instance search.

**Exit gate.** A cyclic model reaches a terminal state under each declared target; Terminate End cancels its containing scope and not the root when nested; the four new elements carry registered answer-free scenarios with seeded mutations; and the Lean gate stays inside its memory bound.

### M3 — real work with real data

**Status: closed.** The [Boolean Process-data specification](capsules/BOOLEAN-PROCESS-DATA-SPEC.md), [E2 User Task assignment and form metadata specification](capsules/USER-TASK-ASSIGNMENT-FORM-METADATA-SPEC.md), and [Product 2 human-work specification](BPM-PLATFORM-HUMAN-WORK-SPEC.md) are implemented, closure-reviewed, evidence-closed, and graduated. Product 2 human work includes independently reviewed public contracts and private engine operations, durable all-producer publication, exact current-task aggregation, fake identity policy, claims, typed detail, retry-safe completion, same-transaction audit outbox, strict HTTP routes, a CSS-Modules React inbox, live Temporal evidence, and Chromium acceptance. Closure target `c72a3bb` and final correction audit `23892a5` close the governed M3 work.

**Demo.** A person picks a task from an inbox, fills a form whose fields are not all strings, submits, and the process continues on the value they entered.

**Engine capsules.** The value domain, widening variables beyond the current string-and-null contract; and E2, the admission capability and public projection for User Task assignment and form metadata that [the platform proposal](BPM-PLATFORM-PROPOSAL.md#the-engine-boundary) records as its second engine prerequisite.

**Platform increments.** The pluggable identity boundary with a fake default, the shared task inbox, claim and release as platform-owned authorization, form projection, and the audit record of who acted.

The [human-work specification](BPM-PLATFORM-HUMAN-WORK-SPEC.md) owns one atomic public contract for current cross-instance tasks, private exact observation locators, actor claims, one typed field, retry-safe completion, platform audit, and a CSS-Modules React inbox.

**Exit gate.** The internal system-visible aggregation matches the engine's published open User Tasks exactly before actor-policy projection; no platform component constructs an occurrence identity; every engine state-changing action is authorized against the exact published occurrence; platform claim and audit state remains distinct from BPMN meaning; and a non-string value survives the round trip through all declared targets.

### M4 — it survives going wrong

**Status: closed.** [Stage 1](capsules/SERVICE-TASK-INCIDENT-RETRY-SPEC.md), one bounded Service Task incident and exact retry, [Stage 2](capsules/SERVICE-TASK-INCIDENT-CANCELLATION-SPEC.md), exact incident-scoped hosting-root Process cancellation, and [Stage 3](BPM-PLATFORM-INCIDENT-OPERATIONS-SPEC.md), current Product 2 incident operations, are implemented, closure-reviewed, evidence-closed, and graduated.

**Demo.** A failing Service Task raises an incident an operator can see, retry, and cancel, and a cancelled scope leaves no orphaned work.

**Engine capsules.** Cancellation beyond the current direct-parent regional case, and incidents as a semantic outcome distinct from Temporal transport retries.

**Platform increments.** The operations console, incident handling, retry and cancellation surfaces, and effect diagnostics.

**Exit gate.** An incident is a published semantic fact rather than an inferred one; cancelling an ancestor scope cancels its descendants with counters preserved; and the platform exposes no retry count that is a Temporal attempt.

### M5 — it can be operated and explained

**Status: closed.** The independently closure-reviewed [committed execution publication specification](capsules/COMMITTED-EXECUTION-PUBLICATION-SPEC.md) implements exact evaluator-root traces, independent current positions, strict wire and canonical bytes, an atomic Workflow publication Query, a representation-free client and gateway, an opaque-locator engine API, live retention and replay evidence, fail-closed transactional Product 2 projection, and two-width desktop History, Diagram, and canonical export evidence. The closure-reviewed [flow-node occurrence metrics specification](capsules/FLOW-NODE-OCCURRENCE-METRICS-SPEC.md) adds exact occurrence frequency and completed duration over a complete exact-version population. The closure-reviewed [operator-history and audit-export specification](BPM-PLATFORM-OPERATOR-HISTORY-AUDIT-EXPORT-SPEC.md) adds the independently ordered Work and incident-action view, canonical audit attachment, strict privacy boundary, restart convergence, and two-width evidence that complete the milestone.

**Demo.** An operator replays what a finished instance did, sees where a running one stands on the diagram, and exports the history.

**Engine capsules.** E1, the publication of committed transition records and of control-token and scope positions. These are two distinct information requirements and must be specified and tested as two even if one publication serves both, because history needs the sequence and the diagram overlay needs the positions.

**Platform increments.** The read-model projection with monotonic revisions, cursoring, ordering, deduplication, gap detection, reconciliation, and rebuild; semantic and operator history; diagram overlays; frequency and duration views; audit export.

**Exit gate.** History is built only from committed publication, never from Event History or state differencing; the projection rebuilds to the same content from scratch; Worker replacement and platform restart do not corrupt it; and a seeded gap is detected rather than silently skipped.

### M6 — useful structured Human Work

**Status: closed.** The independently closure-reviewed [structured Human Work specification](BPM-PLATFORM-STRUCTURED-HUMAN-WORK-SPEC.md) is evidence-closed across the generic five-arm value wire, assignment-only User Task metadata, opaque BPMN Rendering preservation, Product 2's exact-source-bound catalog, Zod-backed validation and canonical patch computation, durable Work completion, responsive web form, retained model, and both-width production browser journey.

**Demo.** A reviewer claims an expense exception, completes regular text, Boolean, date, integer, single-choice, and multiple-choice inputs, and selects Approve, Request changes, or Abort. Action-dependent reason input is enforced on both client and server, the chosen action contributes a fixed resolution value to one atomic patch, and the Process follows the matching gateway route.

**Engine capsules.** Generic non-negative safe integers and ordered string lists are admitted only for the selected User Task completion profile. BPMN Rendering is retained as optional opaque source and remains execution-neutral. No form schema, field rule, action, priority, or Zod dependency enters Lean, the Semantic Process IL, semantic-core form semantics, or Temporal Workflow state.

**Platform increments.** One immutable catalog is derived from the exact admitted definition source, persisted under the complete definition identity, joined to current work by engine-published element ID, validated server-side, and rendered through accessible controls. Structured exact retries canonicalize multiple-choice selections, changed content conflicts, validation rejection performs no engine call or Work mutation, and the initial web graph remains below its 500 kB guard through natural workspace and form boundaries.

**Exit gate.** Product 1's independent cross-language and Temporal evidence is green; Product 2 catalog, deployment, validation, retry, persistence, HTTP, and web gates are green; the expense-exception model is retained and journey-backed; 1280 and 1600 Chromium paths cover every action and field kind; and the context-cold closure reviewer approves the immutable target.

### One Lean research question per engine milestone

The Lean lane must stay a research lane rather than becoming a proof tax on product work. Each engine milestone therefore carries one named question, declared at capsule start under [the assurance-lane rule](PROJECT-DESIGN.md#lean-assurance-lane) as proved, checked, or deliberately open. A question that cannot close within its capsule records its unresolved boundary in the [`implementation-status-owner:ENGINE-RUNTIME-PROOF`](ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md); it does not quietly become a weaker claim.

| Milestone | Question | Why it is the risk |
|---|---|---|
| M1 | Non-interference of preserved payload: does admitting material the engine retains but never executes leave the executable subset's semantics unchanged? | Preserve-only admission is the first rule that lets unexecuted content into a checked definition. If preserved material can reach a semantic decision, the whole execute/preserve/reject split is unsound. |
| M2 | Progress and termination under cycles: what replaces acyclicity as the premise the closure, exhaustion, and stable-state laws rest on? | Acyclicity is currently a structural precondition, not a proof convenience. Removing it invalidates the hypotheses of the existing law set rather than merely widening admission. |
| M3 | Value-domain survival: does the current law set hold over a widened value domain, or does each law need an explicit value hypothesis? | The laws were written when every value was a string or null. A widened domain either passes through or exposes laws that were quietly domain-specific. |
| M4 | Ancestor cancellation: does the direct-parent regional cancellation result generalize to an arbitrary ancestor scope with its monotonic counters intact? | The Sub-Process Error capsule proved one level. Generalizing is where a cancellation account usually breaks. |
| M5 | Trace completeness: is the published transition sequence sufficient to reconstruct the state the engine reached, or only to narrate it? | If it is not, every downstream history and mining claim rests on a projection that cannot be checked against the engine. |
