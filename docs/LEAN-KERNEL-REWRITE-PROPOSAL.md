# Lean kernel rewrite proposal

## Status

Lifecycle: proposed

Review: pending independent cold proposal review.

Owner direction (2026-11-08): stop the incremental Activity host switch; rewrite the Lean semantics as new code with clear modularity, fast builds and proper guardrails; Lean stays the formal semantic authority; the rewrite lands within days and Practical CIB7 Coverage follows within days after it. This proposal turns that direction into a contract. It changes the checked-source-to-IL lowering, the IL, the runtime representation, the transition families and the proof boundary, so it is material under the [independent cold-review gate](REVIEW-POLICY.md#independent-cold-review-gate).

## Problem

Delivery has nearly stalled. Of the 115 [coverage checklist](PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) rows, 5 are done, 2 held and 108 open; rows closed at about one per week. New code per fortnight fell from about 225,000 added lines (2026-08-06 to 2026-08-20) to about 46,000 (2026-10-29 to 2026-11-08), and documentation commits rose to 60% of November's commits (measured with `git log --numstat` on 2026-11-08).

The mechanism is the shape of the Lean library, not the BPMN semantics. `SemanticOperation` carries about 45 constructors, one per BPMN variant, and closed-world matches over it run through 951 modules (about 233,000 nonblank lines and 6,257 theorems reachable from `BpmnConformance`; the evaluator the pipeline runs, `SemanticProcessJsonMain`, alone reaches 259 modules and about 62,600 lines; measured 2026-11-08). Every new variant or representation change therefore edits dozens of proof modules and rebuilds most of the library. The fan-out ratchets, censuses, frozen digests, memory brakes, container build rounds and Rule 2 declarations were each added to contain that cost; together they now consume more time than the semantics. The stopped switch spent 19 hours repairing proofs in about 30 modules for a change with no behavioral effect and closed no row.

The remaining rows are not 108 independent features. They are cells of one matrix: a trigger (Timer, Message, Signal, Condition, Error, Escalation, Compensation, Cancel, Terminate) at an attachment point (start, intermediate catch, boundary, Event Sub-Process, throw or end, Event-Based Gateway arm) on a host (User, Receive, Service, Send, Script, Rule, Manual, plain Task, embedded Sub-Process, Call, sequential or parallel Multi-Instance) in an interruption mode, plus data, gateway and scope composition. The current library builds one constructor or capsule per cell; the kernel builds each axis once.

## Decision

Write a new Lean kernel and a new TypeScript kernel transcribed from it, both executing one new kernel IL. Freeze the existing `BpmnSemantics` library and TypeScript semantic core immediately: no further feature or proof edits. Delete both, with the documents and guards that exist only for them, at parity (milestone W0.4 below).

What stays unchanged:

- The [authority model](../CLAUDE.md#authority-model): BPMN 2.0.2 is normative, Lean is the formal semantic authority for the declared profile, pinned CIB Seven `2.2.0` is the behavioral oracle, the TypeScript kernel is a separately written transcription, and Temporal hosts without defining BPMN behavior.
- The admission boundary: `@bpmn-lean/bpmn-source` admission and the [checked-process contract](../contracts/schemas/checked-process.schema.json) it produces.
- The neutral [scenario contract](../contracts/schemas/scenario.schema.json), the [canonical result](../contracts/schemas/canonical-result.schema.json) and both [publication](../contracts/schemas/semantic-publication.schema.json) [contracts](../contracts/schemas/flow-node-occurrence-publication.schema.json) that the platform consumes. The engine API and the platform therefore see no change at W0.
- Every recorded semantic decision: the [CIB–BPMN relation register](CIB-BPMN-RELATION-REGISTER.md), profile identities, the [semantic invariants](../CLAUDE.md#semantic-invariants) and the reviewed interpretations in the capsule specifications. The kernel re-implements those decisions; it does not reopen them.
- The MIT and A12 boundary, dependency approval, the SDK-work prohibition, the branch push flow, no tags.

What is replaced: the [Semantic Process IL](SEMANTIC-PROCESS-IL-SPEC.md) and its [schema](../contracts/schemas/semantic-process.schema.json), checked-to-IL lowering on both sides, runtime state, the step relation and evaluator, and the proof estate. Under the [pre-release evolution policy](PROJECT-DESIGN.md#pre-release-evolution-policy) the replacement is atomic: one current IL, no compatibility reader.

## Kernel design

### IL

Six node kinds, fixed for the whole target: start, Activity host, scope host, event wait, gateway, end. Every BPMN variant is data on one of them, never a new kind:

| Node | Fields that carry the remaining matrix |
|---|---|
| Activity host | work kind (`none`, `manual`, `user`, `receive`, `service`, `send`, `script`, `rule`, `call`); input and output mappings; boundary list of subscriptions; optional Multi-Instance wrapper; compensation handler reference; flow lists for implicit split and merge |
| Scope host | embedded, Event Sub-Process (trigger, interrupting), Transaction; local variables; child graph; optional Multi-Instance wrapper |
| Event wait | intermediate catch: one subscription; Event-Based Gateway: an ordered race of subscriptions |
| Gateway | Exclusive, Parallel, Inclusive, Event-Based; ordered conditional candidates and default |
| Start, end | none, trigger start (subscription), throw kind (none, Message, Signal, Error, Escalation, Compensation, Cancel, Terminate) |

A subscription is `(trigger, address, interrupting)`; a trigger is Timer (duration, date, cycle, expression), Message (name, correlation), Signal (name), Condition (expression, variable filter), Error (code or catch-all), Escalation (code or catch-all), Compensation, or Cancel. A Multi-Instance wrapper is `(mode, collection or cardinality, completion condition)` over any host.

The IL shape for every row is fixed now; its admission widens per wave. A field the current wave does not admit is refused by admission, never left out of the type, so later waves add rules, not shape ([forward-compatible restrictions](../CLAUDE.md#forward-compatible-semantic-restrictions)).

### Runtime and step

Runtime state is a tree of scope occurrences, each owning tokens, local variables, open waits, Multi-Instance controllers and completed-work records; every occurrence has an engine-issued identity. Exactly four ingress kinds reach the step function: a command (human completion, addressless receive), a delivery (Message, Signal, variable change for Conditions), a timer firing, and an effect result. Logical time, scheduler choices and races stay explicit inputs. The step function is pure and total over these inputs and distinguishes committed, rolled back, rejected, semantic failure and unsupported outcomes.

### Modules and build shape

| Layer | Contents | May import |
|---|---|---|
| `Kernel.IL` | IL types, JSON codec, admission | nothing in the kernel |
| `Kernel.State` | runtime state and its codec | `IL` |
| `Kernel.Feature.*` | one leaf module per mechanism: flow and gateways, scopes, data, work kinds, subscriptions, throw and propagation, Multi-Instance, compensation and Transaction | `IL`, `State`, and features declared beneath it |
| `Kernel.Step` | the dispatcher over the six node kinds and four ingress kinds | features |
| `Kernel.Run` | the scenario runner executable | `Step` |
| `Kernel.Proofs.*` | theorems | anything above |

No executable or feature module imports `Proofs`, so the evaluator never builds them. Finite checks run in the compiled runner; kernel `decide` is reserved for a fact a theorem consumes. A new variant touches its feature module, the admission rule and its scenarios.

## Lean assurance lane

Lane shape: checked

Evidence: W0's claim is executable parity: the Lean kernel's runner reproduces the frozen old-evaluator results on every scenario through the [pipeline](../scripts/test-pipeline.ts). Each later wave declares its own lane under the [assurance-lane rule](PROJECT-DESIGN.md#lean-assurance-lane): Inclusive join, subtree cancellation, Multi-Instance and Compensation/Transaction take `proved`; other mechanisms take `checked`. Each old theorem whose proposition the kernel does not re-prove at W0.4 is recorded as an explicit absence in [`implementation-status-owner:ENGINE-RUNTIME-PROOF`](ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md) with its reopen trigger, never as a silent loss.

## Temporal hosting and refinement preflight

The adapter keeps its current mechanisms; the kernel maps onto them one-to-one:

| Kernel ingress | Temporal mechanism | Risk and witness |
|---|---|---|
| Command | Update with exact occurrence identity | duplicate and stale delivery; existing command dedupe witness |
| Delivery | Signal or Update routed by address | ordering versus timer; existing Message race witness |
| Timer firing | durable Workflow timer keyed by subscription identity | cancellation on scope exit; existing boundary Timer witness |
| Effect result | Activity completion keyed by effect identity | retry versus BPMN retry, late result after cancellation; existing incident witness |

The state relation preserved is the canonical publication: the adapter's projection of kernel state equals the published contract the platform consumes. W0 changes no Temporal mechanism; each new ingress use in a later wave reuses one of the four and needs a hosted witness only where its delivery, ordering or cancellation risk is new.

## Guardrails against degradation

The old library degraded through classes of defect that no review was asked to look for. Its closed-world matches over one constructor per variant made every variant a library-wide edit, and catch-all arms silently gave a new variant an old variant's meaning; the stopped switch met both. Semantic review checked meaning and never structure. The kernel therefore guards these classes from its first commit, in both Lean and TypeScript, and every review checks them.

Executable guards, in the fast guard suite from W0.1:

1. Open variation, closed dispatch. A variant is a field value, never a node kind. Only `Kernel.Step` and the IL codec and admission may match on a node kind or ingress kind; a feature module matches only its own field types. A source guard rejects a match on those types anywhere else.
2. No catch-all over kernel enumerations. A match on an IL or state enumeration lists every case; a wildcard arm is rejected. Adding a variant then fails compilation exactly in the modules that must decide it, never silently elsewhere.
3. Layering. An import-graph test enforces the module table; nothing outside `Kernel.Proofs` imports a proof module.
4. One owner per rule. A semantic rule lives in one feature module; Lean and TypeScript feature modules correspond one-to-one by name, and a guard rejects an unpaired module.
5. Build budget. Clean kernel build under 3 minutes and an incremental feature-module edit under 30 seconds on the development machine, measured by the build-budget test; the first measurement fixes the bounds, and raising them is an owner decision.
6. File size. 800 nonblank lines target, 1,200 ceiling, as today.
7. Behavior oracle. Lean kernel, TypeScript kernel and retained CIB evidence agree on every scenario. The W0 parity baseline is the old evaluator's canonical results, captured once before deletion as an explicit evidence operation.
8. Admission refusal. Every IL field outside the current wave's admitted surface has a refusal test.
9. Trend report. Each wave closure records kernel lines, module count, largest file, dispatch-site count and the two build times beside the wave's row count, so growth per delivered row is visible.

Code review from the start:

- W0.1 gets an architecture checkpoint review: a cold reviewer checks the first kernel commit against the guards above before W0.2 builds on it.
- Every wave closure review covers both meaning and structure. Its checklist names the degradation classes explicitly: closed-world matching, catch-all arms, duplicated rules, Lean/TypeScript divergence, layer leaks, proof-only coupling in executable code and growth per row.
- A reviewer finding of a new degradation class adds a guard for the class in the same correction, so the review finds each class once.

## Delivery plan

| Milestone | Content | Exit | Target |
|---|---|---|---|
| W0.0 | new `docs/kernel/` semantics documents extracted from the old capsules; old documents and their guards deleted | link and new-guard suite green | day 1, in parallel with W0.1 |
| W0.1 | IL, codec, admission, runtime, step for the currently admitted surface in Lean | runner executes every scenario | day 2 |
| W0.2 | Lean parity | all scenarios equal the frozen baseline | day 3 |
| W0.3 | TypeScript kernel transcription; adapter on it | pipeline, differential and hosted Temporal lanes green | day 5 |
| W0.4 | delete old library, core and their guards and documents | complete verification green on `main` | day 6 |
| W1 | flow and scopes: PC-CF-02/03/06/07, PC-BASIC-01/02, PC-HUM-05, PC-SCOPE-01/02 | rows close | +1 day |
| W2 | data and work: PC-DATA-03–09, PC-HUM-01/02/03/06, PC-AUTO-01–04; PC-JOURNEY-01 | rows close | +2 days |
| W3 | Calls and Multi-Instance: PC-SCOPE-03/06/07, PC-MI-01–12, PC-CF-04/08 | rows close | +2 days |
| W4 | events cut by attachment point across all triggers: foundations, catches with PC-CF-05, boundaries, Event Sub-Processes, starts; PC-JOURNEY-06 | rows close | +2 days |
| W5 | throw, propagation, Terminate: PC-ERROR-*, PC-ESCALATION-*, PC-MESSAGE-09, PC-SIGNAL-01/04, PC-AUTO-02, PC-TERMINATE-*; PC-JOURNEY-02–05 | rows close | +1 day |
| W6 | Compensation and Transaction, PC-TIMER-08; PC-JOURNEY-07 | rows close | +2 days |
| W7 | PC-AUTO-05–08 after the dependency decisions; PC-DELIVERY-01, PC-QUALIFY-*, PC-ACCEPT-01 | target accepted except owner holds | +2 days |

Verification cadence (owner direction, 2026-11-08: the rewrite must be swift). Locally the rewrite runs only the kernel build of the touched modules, the kernel scenario runner, the TypeScript kernel's unit tests, type checks and the fast guard suite. No Docker, Temporal server, PostgreSQL, browser, CIB oracle or other long-running lane runs locally during W0 to W6. Those lanes run once per milestone in hosted CI on the pushed branch, which is also the landing gate; a hosted failure is reproduced locally only by its narrowest focused command. The CIB oracle runs for retained evidence happen only in W7 or when a wave's new scenario has no retained evidence yet, batched once per wave.

Stop rule: if W0.2 parity is below 50% of scenarios at the end of day 3, stop, record the boundary and re-plan before further code. Each wave reports elapsed time against its target.

Preparation runs in parallel from W0: up to three workers write whole business models and neutral scenarios for the next waves, so every wave starts red with its scenarios present; their CIB evidence is produced in one batched oracle run per wave.

## Owner decisions on the path

These are the only dependency or hold decisions the plan needs; each goes to the owner as one packet during W0 with a recommendation:

- PC-DATA-07 expression evaluator adoption (JUEL binding), needed by W2.
- PC-AUTO-05 Script language and runtime, and PC-AUTO-07 decision engine, needed by W7.
- PC-TIMER-02 Cron dialect disposition, needed by W4.
- PC-QUALIFY-03 qualification hold on the recorded Temporal SDK defects: acceptance cannot complete while SDK work stays prohibited, so it needs a disposition before W7.

## Process changes

Owner direction (2026-11-08) asked to remove the ceremony that slowed delivery. On approval of this proposal:

1. Rule 2 applies to mechanical edits of existing files only; new kernel code is not a bulk change. The pre-run review is dropped; the post-run diff check stays.
2. Reviews: this proposal's cold review, the W0.1 architecture checkpoint review, then one cold closure review per wave covering meaning and structure; no per-family proposal review.
3. Documentation: the [documentation reset](#documentation-reset) replaces per-capsule documents; a wave updates its checklist rows, the kernel status map and the semantics document of each mechanism it changes, and nothing else.
4. `CLAUDE.md` shrinks to the mission, authority model, licence boundary, dependency rules, heavy-lane serialization, commands and branch flow.
5. Lean lane default: checked; proved for the four risk mechanisms.

## Documentation reset

Owner direction (2026-11-08): old documents describing the old code or the old process are deleted and replaced by new ones, so that none of them misleads later work. The documentation tree holds about 1,070,000 words (measured 2026-11-08), most of it about the frozen library, its capsules and its process.

The reviewed semantic decisions inside the old capsule specifications are the one thing that must survive. They are carried over by extraction, not by keeping the documents: before an old document is deleted, each decision it records (BPMN clause, CIB relation identifier, interpretation, observation boundary, restriction) is restated in the new semantics document of the mechanism that owns it, with its source cited by commit permalink. Old reasoning, history, module placement, cost rows and review narrative are not carried over.

| Disposition | Documents |
|---|---|
| New in W0 | `docs/kernel/`: an architecture document (this proposal graduated, with the guardrails); the kernel IL specification; one semantics document per feature module (flow and gateways, scopes, data, work kinds, subscriptions, throw and propagation, Multi-Instance, compensation and Transaction); one kernel status map replacing the engine implementation maps; a short engineering-rules document replacing the review, testing-gate, documentation, code-style and verification-infrastructure policies for engine work; a rewritten `PLAN.md` holding the wave plan; a rewritten `CLAUDE.md` |
| Deleted after extraction, in W0 | every capsule proposal and specification under `docs/capsules/`; the Semantic Process IL, runtime-state invariant and Activity occurrence ownership specifications; the issuing-discipline, internal-commutation and regional-ownership proposals; the Lean build modularity specification; the engine implementation maps and their router; the capsule cost ledger, the Lean resource-cost ledgers, the process assessment ledger and its directory, the assurance improvement register; `docs/experiments/` and `docs/archived/`; the stopped Activity host switch proposal |
| Reduced to goals, milestones and dependencies, in W0 | the [coverage target](PRACTICAL-CIB7-COVERAGE-TARGET.md) keeps per row only its ID, required outcome with decisive acceptance, prerequisites and state, plus the target definition and the bounded contract decisions; its owner and source-basis columns, capsule links, mechanism prescriptions and old-approach procedure are dropped, and the waves of this proposal order its rows. [PROJECT-DESIGN.md](PROJECT-DESIGN.md), [ARCHITECTURE.md](ARCHITECTURE.md), the [conformance target](BPMN-CONFORMANCE-TARGET.md), the [requirement ledger](BPMN-REQUIREMENT-LEDGER.md) and the [showcase milestone ladder](SHOWCASE-MILESTONE-LADDER-DECISION.md) are reduced the same way: product goals, authority, milestones, scope and dependencies stay; prescriptions of the old IL, capsule cycle, assurance procedure and Lean build method go |
| Kept, links repaired | normative and research inputs (`docs/reference/`, `docs/research/`, `SOURCES.md`); the CIB–BPMN relation register and the adopted decision records; `@bpmn-lean/bpmn-source` admission specifications; Temporal lifecycle and runner specifications and the Temporal defects ledger; Product 2 platform documents; setup and instrumentation guides |

Guards that exist only for deleted documents or the frozen library are deleted with them: the documentation control-plane, reviewability, cost-ledger and process-ledger guards, and the fan-out, census, frozen-digest, fixture-owner and memory-brake guards and scripts. A checklist row closed before the reset keeps its receipt as a commit permalink.

## Exclusions

No new BPMN meaning, CIB relationship or profile is introduced by W0; it reproduces the admitted surface exactly. Production-history compatibility, scale and an A12 product remain outside this target.

## Risks

- Two systems coexist until W0.4. Mitigation: the old stack is frozen today and deleted at a fixed milestone.
- Old theorems disappear. Mitigation: the four risk mechanisms are re-proved on a smaller kernel in their waves; every other lost proposition is recorded as an explicit absence.
- A parity mismatch could expose an old-evaluator defect rather than a kernel defect. Resolution: classify each mismatch against the reviewed capsule interpretation and retained CIB evidence; never adjust the baseline to match.
- The day targets are estimates; the stop rule bounds the loss.

## Independent cold-review receipt

| Stage | Target | Reviewer | Verdict |
|---|---|---|---|
| Proposal | pending | pending | pending |
