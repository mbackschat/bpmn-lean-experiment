# Kernel architecture specification

## Status

Adopted kernel owner document (W0.4, 2026-11-09). It graduates the approved [kernel rewrite proposal](https://github.com/mbackschat/bpmn-lean-experiment/blob/404a39d7/docs/LEAN-KERNEL-REWRITE-PROPOSAL.md) (reviewed in three rounds, final approval on `4424cdab`); the kernel modules and guards it names are the executable authority, and a difference between them and this document is a defect of one of them.

It owns the kernel's architecture, its contracts at the boundary, the guardrails and the definition of done for a coverage row. The [plan](../PLAN.md) owns the delivery order, budgets and resume point; the [IL specification](IL-SPEC.md) owns the program shape and wire encoding; the [semantics documents](../README.md#kernel) own each mechanism's meaning; the [kernel status map](KERNEL-STATUS-MAP.md) owns what is implemented and what is open per row; the [engineering rules](ENGINEERING-POLICY.md) own review, verification, documentation, code style and setup procedure.

## Why delivery slowed

The kernel replaced a design whose cost grew with every BPMN variant. Measured from version history, the code and the rule documents on 2026-11-08 (3,422 commits since 2026-07-23; figures resting on commit-subject classification are approximate). Each guardrail below names the cause it prevents.

| Rank | Cause | Evidence | Share of the slowdown |
|---|---|---|---|
| 1 | One IL constructor per BPMN variant, matched closed-world in Lean, TypeScript, schemas, the adapter and the platform | `SemanticOperation` had 45 constructors with three mirror enumerations, 148 Lean match sites and 89 Lean catch-all arms; the TypeScript core had 878 `case` labels; the median Lean files touched by a constructor addition rose from 13 (July) to 72 (October); one field rename touched 133 modules | the dominant code cause; every other code cause grew from it |
| 2 | Proof estate shaped per variant and per pair | 331–339 `Internal*` modules (about 78,000 lines, 30% of the library); commutation stacks copied per wait kind; proofs unfolded evaluator bodies (2,070 `unfold`), so a behavior-neutral change broke dozens of proofs | September's output went into pairwise proofs |
| 3 | Build-cost containment | 11,482 `import all` lines; hubs with up to 246 direct importers; 686 kernel-decided fixtures (a 13 GB build); four module-system conversions touched 619–1,005 files each with no behavioral change; build and guard mechanics were 25% of commits from 2026-10-23 to 2026-11-02 | most of late October and November |
| 4 | Ceremony | 287 reviews in 117 receipts, 85% approve-with-required-edits; non-feature commits per feature rose from 2.4 to 7.0 | about 30% of time |
| 5 | Documentation control plane | 230 documents, 1.09 million words; `PLAN.md` edited in 48% of all commits; a session read 40,000–50,000 words before acting | a serialization point on every commit |
| 6 | Guards as negotiation records | 131 guard tests, 63 of them for the old library or the process; bound files raised repeatedly; census allowlists replaced the type checker | every Lean commit paid a measurement or a bound edit |
| 7 | Admission shaped by profile instead of by rule | 53 profiles for 184 scenarios; exact operation multisets per profile; about 25 profile-keyed source readers with a silent generic fallback | work was sliced below row level |
| 8 | Per-row definition of done | each row demanded CIB execution, Temporal recovery, refinement and replay, Product 2 disclosure and its own closure | rows could not close even when behavior worked |
| 9 | Serial implementation | only the root agent could write Lean or production code | no parallelism on the critical path |
| 10 | Agent behavior | process findings turned into permanent rules and guards; safe incremental restructurings that closed no row; the stall reported only when asked | amplified causes 3–6 |

## Decision

One Lean kernel and a TypeScript kernel transcribed from it execute one kernel IL. The boundary contracts are cut along the kernel's axes, so that later rows change data, not shape. The former `BpmnSemantics` library, TypeScript core and per-variant adapter were replaced in W0 under the [pre-release evolution rule](../../CLAUDE.md#pre-release-evolution) (one current representation, no compatibility reader, retained evidence regenerated once) and deleted at W0.4.

Unchanged by the rewrite: the [authority model](../../CLAUDE.md#authority-model); the [semantic invariants](../../CLAUDE.md#semantic-invariants); every recorded semantic decision (the [CIB–BPMN relation register](../CIB-BPMN-RELATION-REGISTER.md), the reviewed interpretations now restated in the semantics documents, the [JUEL evaluation decision](../JUEL-EVALUATION-ARCHITECTURE-DECISION.md) as amended under [Evaluation](#runtime-state-and-step), the [Simple Boolean decision](../SIMPLE-BOOLEAN-EXPRESSION-DECISION.md), the [XML ingestion decision](../BPMN-XML-INGESTION-DECISION.md)); `@bpmn-lean/bpmn-source` parsing and source preservation; the MIT and A12 boundary; dependency approval; the SDK-work prohibition; the branch push flow.

## Kernel design

### IL

The IL fixes the shape for every row of the [coverage target](../PRACTICAL-CIB7-COVERAGE-TARGET.md); admission widens per track. A field outside the admitted surface is refused with a stable refusal code, never left out of the type ([forward-compatible restrictions](../../CLAUDE.md#forward-compatible-restrictions)). Admission (is this model inside the admitted surface) and normalization (reading the source into the IL) stay separate steps. The [IL specification](IL-SPEC.md) owns the records and their encoding.

The IL is a flat table of elements keyed by element identifier; a Scope refers to its children, and a flow to its endpoints, by identifier. No IL or state type is a nested or mutual inductive. Every element is a header record (identity, origin, source element type, parent scope) plus one payload record; no constructor carries positional fields beyond those two. Element kinds, fixed for the whole target:

| Kind | Payload |
|---|---|
| Activity | work: `none`, `manual`, `user` (task definition and metadata), `receive` (Message subscription or addressless), `service` (handler binding), `send` (binding, recipient, correlation), `script` (format, source, result variable), `rule` (decision reference, result mapping), `call` (called-definition key, binding and version selectors, business key, input and output mappings, propagation flags); shared activity envelope |
| Scope | `embedded`, `transaction`, `eventSubProcess` (start subscription, interrupting); child identifiers; local variables; shared activity envelope |
| Event | `catch` (one subscription), `throw` (throw record), `link` (catch or throw, name); intermediate or end placement |
| Gateway | `exclusive`, `parallel`, `inclusive` (ordered conditional candidates, default), `eventBased` (ordered arms, each an Event catch or a Receive Activity) |
| Start | none or one subscription; root or Event Sub-Process placement |

Shared activity envelope, on Activity and Scope alike: incoming and outgoing flow identifiers (implicit merge and split); input and output mappings; boundary list of `(subscription, interrupting)`; optional Multi-Instance wrapper; optional compensation handler identifier.

A subscription is `(trigger, address, output mapping)`. Triggers: Timer (`duration | date | cycle`, each `literal | expression`, with cycle dialect and repetition), Message (name `literal | expression`, correlation criteria), Signal (name `literal | expression`), Condition (expression, variable-name and variable-event filter), Error (code or catch-all, code and message variables), Escalation (code or catch-all, code variable), Compensation, Cancel.

A throw record is one of: none; Message (send binding, payload mapping); Signal (name, payload mapping); Error (code, message); Escalation (code); Compensation (`activityRef`, `waitForCompletion`); Cancel; Terminate.

A Multi-Instance wrapper is `(mode, collection expression | cardinality expression, element variable, completion condition, input data item, output data item, output collection, mutable-collection policy)`.

The [row traceability map](ROW-TRACEABILITY-MAP.md) maps every open row to the IL fields, state slots and `Hooks` fields it uses, and each row has an IL fixture that decodes in both kernels (guard 21).

### Runtime state and step

State is flat and identifier-indexed: scope occurrences (parent by identifier); tokens (the closure's work stack: flow tokens and deferred begins); variables per scope occurrence; one list of open items (waits, timers, subscriptions, effects) keyed by engine-issued identity; Multi-Instance controllers; completed-work records; one slot per feature. The open-item kind is a fixed guarded type that only `Step` and `Publish` match. Feature slots are fixed from the traceability map, always present and empty by default, so the state codec never varies by program. Cancellation is one generic subtree removal that notifies the owning features through `Hooks`; publication is one generic projection.

The step function is pure and total. Its inputs:

| Input | Carries |
|---|---|
| Start | definition, start event, trigger payload (process start, Message start, Timer start) |
| Command | occurrence identity, typed result (User Task completion, addressless receive, incident retry and cancellation, external variable write) |
| Delivery | trigger, address, payload (Message with or without payload and correlation, Signal) |
| Timer firing | subscription identity, logical time |
| Effect result | effect identity; success, business failure or technical failure |

Evaluation. Each profile selects exactly one evaluator for its admitted expressions, run inside the kernel step: no evaluation leaves the kernel, and no part of the TypeScript and Temporal solution depends on a JVM (owner decision of 2026-11-08). Until M2 every profile selects the [Simple Boolean subset](../SIMPLE-BOOLEAN-EXPRESSION-DECISION.md). From M2 a read-only JUEL subset, written in Lean and transcribed to TypeScript, grows by the levels below. This reverses the [JUEL decision](../JUEL-EVALUATION-ARCHITECTURE-DECISION.md)'s exclusion of a project-owned evaluator and its Java hosting; its read-only context rules stand. The pinned evaluator checks the subset through retained CIB evidence over a table of expressions and contexts. An expression outside the selected evaluator is refused at admission with a stable code. A row whose acceptance needs such an expression closes only on that subset, never on Simple Boolean; the rest of its track proceeds.

JUEL is treated like BPMN. The Expression Language specification at the grammar level of the pinned `cibseven-juel` (EL 2.2 method invocations, no lambda, assignment or collection literals, on the shaded Jakarta EL 4.0 API) is normative for syntax and coercion; the pinned evaluator is the behavioral oracle; a difference between them is classified in the relation register, never by majority. Levels were chosen from what CIB's own test models use (measured 2026-11-08 over 1,494 expressions in 2,458 BPMN files, a corpus biased toward engine features): 63% plain variables, 17% operators, 3% literals, 2% property paths, 15% method calls, most of them on beans or `execution`.

| Level | Milestone | Language added | Sites added | Rows |
|---|---|---|---|---|
| Core | M2 | `${}` and `#{}`, composite text, literals, variables, `.` and `[]` access on plain data, arithmetic, relational and logical operators, `empty`, ternary, EL coercion over the portable value domain, read-only methods on String, List and Map values from a closed list | conditions, input and output mappings | PC-DATA-05, PC-DATA-07, PC-DATA-08, PC-DATA-09, and PC-CF-02 in M1 once it lands |
| Task fields | M3 | none | assignee, candidate groups, due and follow-up dates, priority | the rows that admit those fields |
| Multi-Instance | M2 (delivered with the data rows, `991cd4a6`) | the Multi-Instance counters in context | collection, cardinality, completion condition | PC-DATA-08, PC-MI-07, PC-MI-09 |
| Events | M6 | `dateTime()` chains and coercion to dates and durations | timer definitions, Message names, conditional event predicates | PC-TIMER-03, PC-MESSAGE-01, PC-CONDITION-01 |
| Throw | M7 | none | Signal names | PC-SIGNAL-01 |

Refused at admission at every level: `execution`, `task`, functions outside the table, and any mutating or unlisted method. A bean name is not refused: under CIB-CFG-0011 the kernel reads it as an unknown variable at run time, as CIB does without a configured bean.

After every committed write, the step closure re-evaluates the Conditions whose filters match, within a declared re-trigger bound. Logical time, scheduler choices and races stay explicit inputs. Outcomes stay distinct: committed, rolled back, rejected, semantic failure, unsupported.

`Hooks` is one record of functions, each field with a no-op default: host lifecycle (activate, complete, cancel), subscription arm and disarm, completed-work record, scope quiescence. The order in which `Step` invokes hooks is semantic and owned by `Step` alone; `Registry` only fills the fields. A cross-owner match (a thrown Error or Escalation against catch triggers with exact-before-catch-all precedence; Compensation; Cancel) goes through a `Hooks` field, never into `Step`. A feature whose rules outgrow three files becomes sub-features joined by their own hooks record. Runtime invariants live per feature in `Laws.<F>`; there is no global well-formedness function.

### Population

Mechanisms across process instances live in one layer, `Kernel.Population`, which calls `Step` for each instance: start selection by trigger and definition version, Message correlation by criteria with zero, one or ambiguous matches, Signal broadcast to the eligible population with a defined discovery order, Conditional start against submitted context, and called-definition version binding. The population scenario form covers them; the [population semantics](semantics/POPULATION-SEMANTICS-SPEC.md) own their meaning.

### Host interface

The host sees the kernel only through `hostRequirements(program)` (timers, concurrent waits, effect frontier, subscription lifetimes), `definitionCapabilities(program)` (start list and correlation addresses, for the engine API) and `hostView(state)` (open items with input kind, address, deadline and typed detail; effect requests; enabled interactions; occurrence start and end facts). State is opaque to the host apart from its codec. A program the kernel admits but the host cannot schedule is refused before a Workflow starts, with a host refusal code keyed by a `hostRequirements` field.

### Modules and build shape

| Layer | Contents | May import |
|---|---|---|
| `Kernel.IL.Types` | flat element table, records, the instances a codec or theorem needs | nothing in the kernel |
| `Kernel.State` | state records with fixed feature slots, generic subtree removal | `IL.Types` |
| `Kernel.Hooks` | the hooks record with defaults | `IL.Types`, `State` |
| `Kernel.Feature.<F>` | one feature's rules, at most three files; a sub-feature such as `Feature.Decision`, which `Feature.Work` reaches through its own hooks record, is a feature of its own | `IL.Types`, `State`, `Hooks` |
| `Kernel.Admission.<F>` | one feature's admission rules with refusal codes | `IL.Types` |
| `Kernel.Step`, `Kernel.Publish`, `Kernel.Population` | dispatch over element, input and open-item kinds with the hooks record as a parameter; generic projection; population mechanisms | `IL.Types`, `State`, `Hooks` (`Population` also `Step`) |
| `Kernel.Registry`, `Kernel.AdmissionRegistry` | fill the hooks record; assemble admission; generated from the feature directories | features; admissions |
| `Kernel.IL.Codec` | table-driven JSON codecs | `IL.Types`, `State` |
| `Kernel.Run`, `Kernel.Run.*` | scenario runner executable and its parts (`Run.Wire` reads inputs, `Run.Population` reads population scenarios and renders their results) | everything above and the runner's own parts; `Kernel.Run` is the only importer of both registries |
| `Kernel.Laws.<F>` | the declarative rules and invariants of one feature, stated independently of `Step`'s code | `import all Kernel.Feature.<F>`, `Hooks` |
| `Kernel.Proofs.Step` and `Kernel.Proofs.*` | composition theorems over the `Laws`; reaches `Step` through a `Laws.Step` module, never an `import all` exception | `Laws`, `Hooks`, `Step` |

Rebuild cones: a feature edit counts as an interface edit and rebuilds `{Feature.F, Laws.F, Registry, Run}` and the proofs that import `Laws.F`; an admission edit rebuilds `{Admission.F, AdmissionRegistry, Run}`. A kernel shape edit (an IL record, a state slot type or a `Hooks` field) rebuilds everything; shape edits are batched at a track's start in one commit with scope `kernel-shape` that the root accepts, never mid-track, and guard 9 counts them.

Features never import each other; cross-feature behavior goes through `Hooks`, so the feature order is irrelevant to the build. Features: flow and gateways, data, work, scopes, subscriptions, Multi-Instance, propagation, compensation and Transaction. `State` and `Hooks` are `@[expose]`, with `@[no_expose]` on `State` operation bodies. Executable modules contain no theorems, and nothing executable imports `Laws` or `Proofs`. `State` derives `DecidableEq` or `Repr` only where a consumer needs it. The root module and the runner's scenario list are generated, never edited by hand. Lean options keep `Elab.async=false`, `backward.match.sparseCases=false` and `-M2048`; [`scripts/lake.sh`](../../scripts/lake.sh) and [`lakefile.toml`](../../lakefile.toml) target the kernel. Commutation is proved once over the footprints each feature declares through its `Hooks` laws, never per wait kind.

TypeScript mirrors the executable modules under [`packages/kernel/`](../../packages/kernel/src/index.ts) with one file per Lean executable module, an explicit export list per layer, no cycles and no proof-motivated code (footprints, commutation helpers). Guarded kinds are TypeScript enums; owner modules dispatch by exhaustive `switch` ending in `assertNever` or by a `Record<Kind, …>` table; codecs decode through lookup tables that return a refusal code. The host, engine API and platform import only the contract types and the host interface. `bpmn-source` refuses only parse, preservation and unknown-element cases, each with a code; every semantic refusal lives in `Kernel.Admission`.

### Profiles

A profile is data: the selected CIB relation options and the admitted field set. No code compares a profile identifier. Profile consolidation reduces the per-variant profiles to one standards profile and one cumulative CIB 2.2.0 profile per set of mutually exclusive relation options (for example [CIB-LIM-0002](../CIB-BPMN-RELATION-REGISTER.md)), each carrying the union of its predecessors' relation identifiers. Retired immutable profiles stay reachable as commit permalinks. Scenarios move atomically. A scenario whose old profile refused a model the consolidated profile admits is listed as a lifted refusal and becomes work of the track that owns it. A relation-register entry lands in the same commit as the profile behavior it governs, and the track review checks it.

## Contracts

| Contract | Shape |
|---|---|
| Vocabulary schema | element kind, work kind, trigger, attachment, input kind, open-item kind, transition role, outcome, channel and refusal-code enumerations for the whole target; the pipeline case form `case.json` (completion delivery, execution and effect schedules, replay selection, expected wait-trace length, mutations as path plus value) |
| Kernel IL | read by `bpmn-source` directly from BPMN; no intermediate checked-process contract |
| Scenario, canonical result | generic `start`, `command`, `deliver`, `timerFire`, `effectResult` stimuli; one `openWaits` list of `{id, input, trigger, address, deadline, detail}`, where `detail` is typed per input kind (User Task metadata, assignment and form; effect descriptor and arguments; incidents; Multi-Instance controllers; failure detail) |
| Population scenario | one population form for every cross-instance mechanism |
| CIB evidence | bound to the scenario and result references; regenerated, never translated lossily |
| Semantic publication | element identity, source element type and transition role; no IL kinds; compiler identity `bpmn-kernel` |
| Flow-node occurrence publication | occurrence facts with the shared identity reference |
| Engine API | one start list of `{startEventId, trigger, schedule}`; correlation capability derived from the subscription address |
| CIB runner options | declared by the scenario or model, never by a profile check in the runner |

The schemas under [`contracts/schemas/`](../../contracts/schemas/) are the wire authority; [contracts/README.md](../../contracts/README.md) indexes them.

## Lean assurance lane

Lane shape: checked.

Lean is the formal semantic authority as the executable specification: every scenario checks the TypeScript kernel and the retained CIB evidence against the Lean kernel's runner, and each `Laws.<F>` states its feature's rules declaratively, independent of `Step`'s code. The `proved` lanes of the 2026-10-14 set (concurrency, cancellation, Compensation and Transaction, Multi-Instance) move to a proof wave after the coverage rows close, which proves `Step` sound against the `Laws` ([owner decision](#owner-decisions-on-the-path)). Until then each is a deliberately open lane in the [kernel status map](KERNEL-STATUS-MAP.md#open-proof-lanes) with coverage closure as its reopen trigger; rows that keep a `done` state rest on the kernel's scenario evidence, and their former theorems are listed there as open lanes.

## Temporal hosting and refinement preflight

| Mechanism | Temporal realization | Risk and witness |
|---|---|---|
| Start | Workflow start with the start input; scheduled starts by a schedule per timer-start definition | duplicate start after response loss; content-bound start identity |
| Command | Update with occurrence identity | duplicate and stale command; command identity computed generically |
| Delivery | Update routed by address; correlation ingress Workflow for cross-instance routing | ordering against timers; late delivery after scope exit |
| Timer firing | durable timer keyed by subscription identity | cancellation on scope exit; re-arm for cycles |
| Effect result | Activity keyed by effect identity | transport retry versus BPMN retry; late result after cancellation |
| Evaluation result | none: evaluation runs inside the kernel step | no host mechanism |
| Population | correlation and broadcast through the correlation ingress Workflow; version binding at start | zero or ambiguous match; broadcast discovery order; witnessed when its rows land |

Hosting gap (2026-11-11): cross-deployment Call binding is not hosted. The engine API compiles each deployment's own document and never assembles the stamped callee copies of other deployments (`assembleProgram` in [`bpmn-source`](../../packages/bpmn-source/README.md)), so admission refuses a Call that names another deployment's process as `work.call.calledProcessMissing` before any Workflow starts; the kernel's population binds it (PC-SCOPE-03).

One generic scheduler in [`@bpmn-lean/temporal-host`](../../packages/temporal-host/src/host.ts) drives all of them from `hostView`. The continuation chain carries the kernel state codec. Event-History capacity is derived from `hostRequirements`. Hosted CI witnesses chain handoff with the state codec, the capacity bounds, replay determinism, and the start, command, delivery, timer and effect mechanisms once each. The state relation preserved is the publication: the host's projection of kernel state equals the published contract. The [Temporal lifecycle specification](../TEMPORAL-PROCESS-LIFECYCLE-SPEC.md) owns the production Workflow contract.

## Guardrails against degradation

Every guard is a fast source or graph scan with no data file that feature work edits; a justification comment at the exception site is the only allowed exception mark. A guard either fails or reports; reports print as CI output and never block. A new guard is added only for a defect class seen twice or for a structural class. Each item names the [cause](#why-delivery-slowed) it prevents. The guards live in [`scripts/kernel-guards*.ts`](../../scripts/kernel-guards.test.ts) and the Lean environment scans beside them.

Dispatch owners per guarded type:

| Guarded type | Owner |
|---|---|
| element kind, input kind, open-item kind | `Kernel.Step` (`Kernel.Publish` for open-item kind) |
| trigger | `Kernel.Feature.Subscriptions` |
| work kind | `Kernel.Feature.Work` |
| gateway kind | `Kernel.Feature.Flow` |
| scope kind | `Kernel.Feature.Scopes` |
| throw kind | `Kernel.Feature.Propagation` |
| Multi-Instance mode | `Kernel.Feature.MultiInstance` |
| JUEL node, binary and unary operator, call target, listed method | `Kernel.Feature.Data` (its `Juel` evaluator) |
| any of them, in proofs | `Kernel.Proofs.Step` |
| any of them, at a boundary | one module per package: the host's input mapper, the CIB runner's trigger mapper, the platform's presentation module shared by the history, start and work views |

Codecs and each type's own `Admission` module may also match it.

1. Closed dispatch, fails (cause 1). Only the owner above matches a guarded type, by pattern, `casesOn`, `BEq`, `matches`, `Decidable` or `DecidableEq` use or `ctorIdx`. Lean: an environment scan in the build lane. TypeScript: a scan for `switch`, `===`/`!==` on enum members, `in` narrowing, `filter` on kinds and string literals of vocabulary values outside owners.
2. No catch-all, fails (cause 1). Lean: the environment scan rejects any match alternative that covers more than one constructor of a guarded type (`_`, variable, multi-pattern, `if let`). TypeScript: every `switch` over a kernel enum ends in `assertNever`; no `default:`; no equality tests or `filter` on guarded kinds inside owners, apart from `Record` tables. Guards 1 and 2 run in the build lane.
3. No mirror enumerations, fails (cause 1). No second enumeration or classifier of a kernel vocabulary type; no census or allowlist of variants.
4. Layering, fails (causes 1, 3). The import graph follows the module table in Lean and TypeScript; acyclic; zero feature-to-feature imports; no `export *`; host, engine API, platform and CIB runner import only the contract types and the host interface.
5. Module-system policy, fails (cause 3). `import all` appears only in `Laws.F` for `Feature.F`; no private-equation helpers; `@[no_expose]` on `State` operation bodies.
6. Proof placement, fails (causes 2, 3). No `theorem` in executable modules; no `decide`, `native_decide`, `cbv` or `rfl` reduction of `Step`, `Run` or a registry anywhere; `decide` elsewhere only in `Proofs` and `Laws` over facts a proof consumes; no `unfold` or `simp` of a feature body outside its `Laws`; no `Feature.F` constant in the types of `Laws.F` rule and invariant definitions; no IL or state literal longer than 50 lines in Lean; finite examples run in the runner.
7. Profiles as data, fails (cause 7). No profile identifier literal outside the profile catalog, in the kernel, any boundary package, `packages/differential/test` or the testkits.
8. One rule, one place (causes 1, 7). Fails: Lean and TypeScript executable modules pair by name and change in the same commit; no checked-source type in the kernel; no duplicate helper names, in the kernel and `bpmn-source`. Reports: kernel and `bpmn-source` file pairs above 0.7 normalized-line similarity.
9. Shape (causes 1, 3). Fails: an IL record file edited after main's merge base in a commit not scoped `kernel-shape`, the earlier such commits of a branch exempt by SHA in the guard's test; an element kind, a top-level state field, a feature slot or a `Hooks` field added outside an accepted shape commit; a constructor with more than a header and a payload; an anonymous-constructor or explicit `.mk` pattern with more than four binders; `Step` above 600 lines. Reports: shape edits per track.
10. Size (cause 3). Fails: a file above 1,200 nonblank lines in the kernel or `bpmn-source`; a function above 150 lines; a feature spanning more than three files in either language. Reports: files above 800, functions above 80 lines.
11. Codec truth, fails (cause 1). Every schema variant has a fixture that round-trips through the Lean and TypeScript codecs and the platform decoder.
12. Admission refusal, fails (cause 7). Every IL field outside the admitted surface, and every `bpmn-source` refusal, has a refusal test with its stable code.
13. Single entry, fails (cause 1). One step function, which `Population` calls; no program-mode predicate; no second evaluator.
14. Discovery by convention, fails (causes 5, 6). Scenarios, pipeline cases, corpus models and the runner list are discovered from directories; counts are derived, never written.
15. Build budget (cause 3), on every push. Fails in the fast suite: the static rebuild-set model, computed from the import graph of both languages: a feature or admission edit rebuilds only its cone above, and the only modules with more than five direct importers are `IL.Types`, `State` and `Hooks`; every edit to one of those three is a shape edit. Fails in the hosted Lean lane, measured with commit, toolchain and thread count: the clean executable build (3 minutes), the worst feature body and interface edit (30 seconds), and any single module above 30 seconds; TypeScript type check and tests (10 s and 60 s). No `maxHeartbeats`, `maxRecDepth` or `synthInstance` option in the kernel, and no derived instance on `State` or `Program` without a named consumer. Reports: a `Hooks` and an IL shape edit, the proof build, and the growth per delivered row (kernel lines, module count, largest file, dispatch sites, seconds of clean build). Bounds change only by owner decision.
16. Behavior oracle, fails (all causes). Lean kernel, TypeScript kernel and retained CIB evidence agree on every scenario, population scenario, admission decision and committed publication. The only exceptions are kernel–CIB disagreements that the [disagreement ledger](../../packages/differential/test/cib-disagreement-ledger.ts) lists under an open row (an answer fixed before its code) or a registered relation. The set must match exactly, so an entry that now agrees also fails.
17. One writer per effect, fails (cause 1). An environment scan and a TypeScript scan of who calls what: each `Token` case has one writer, flow tokens emitted only by `Feature.Flow` and deferred begins stacked only by `Feature.MultiInstance` (`State.deferBegins`); occurrences and activations are created and removed only by `Step` and `State`; variables are written only by `Feature.Data`; an Activity completes only through `Signal.complete` and `Step`'s one pipeline. Dispatch guards see matches and miss effects.
18. Seam fan-out budget, fails (causes 1, 3). Each guarded type has a constant maximum of match sites across the kernel, codecs excluded, fixed in the guard and changed only by owner decision; a new mechanism that needs another site changes the seam, not the budget. A commit whose scope is not `kernel-shape` changes at most eight kernel executable modules, a Lean and TypeScript pair counting once. Reports: modules changed per delivered row.
19. Field liveness, fails (cause 7). Every IL field is read by a non-codec declaration or refused by `Kernel.Admission` with a stable code. A field nothing reads and nothing refuses is a model silently misexecuted.
20. Refusal parity, fails (cause 7). Every runtime `unsupported` code either has a matching admission refusal for the same shape or is marked dynamic-only at its site with the reason: a static shape never fails mid-run.
21. Shape sufficiency, fails (causes 1, 7). Every row of the coverage target, discovered from it, has a traceability entry and an IL fixture that decodes in both kernels, so the shape for a row is present before the row's track starts.
22. Growth probe, on every push, fails (cause 3). The hosted Lean lane copies every feature and admission module three times under renamed namespaces and builds the fourfold kernel: clean build within the bound of guard 15, feature edit unchanged.
23. Guards prove themselves, fails (all causes). Every guard has a test that seeds its violation and sees it fail, so no guard passes by matching nothing. A renamed module, type or directory that empties a guard's input fails it.
24. Justified rules, fails (cause 7). No rule in the kernel is justified by a baseline, a former evaluator or an old implementation; its comment cites a BPMN clause or a register identifier. Matching a past result is evidence of agreement, never a reason for a rule.

## Review

- The W0.1 architecture checkpoint had one cold review of the first kernel commit against the guardrails and the module table.
- Each mechanism track has one combined review of meaning and structure, run when the track's first row is green, where a rejection is still cheap. Its approval covers every row the track closes under that seam; a later row that changes shape reopens it. Its checklist names the degradation classes of the guardrails, that no TypeScript code is proof-motivated, and that each register entry is in the commit of the profile behavior it governs.
- A row that needs a new BPMN or CIB interpretation takes one cold review of that interpretation before its code: PC-BASIC-04 (M1), PC-DATA-07 (M2), PC-AUTO-05 and PC-AUTO-07 (M3), PC-SCOPE-03 (gates M8), PC-COMPENSATION-01 and PC-TX-01 (gate M9).
- A correction gets at most one audit; the verdict is recorded in the correction commit's message.

The [engineering rules](ENGINEERING-POLICY.md#reviews) own how a review is run.

## Definition of done for a row

A row is done when its acceptance clause in the [coverage target](../PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) holds on the kernel in Lean, TypeScript and the retained CIB evidence, and its track's combined review approved it. The [kernel status map](KERNEL-STATUS-MAP.md) lists, per row, the open proof lanes it depends on. A hosted Temporal witness is needed only for a new hosting mechanism. Product 2 disclosure comes from the generated capability catalog. A whole corpus model is needed only where the row's acceptance clause names one; the journey rows carry the business models. A row marked `yes` in the `needs-expression-beyond-simple-boolean` column of the [row traceability map](ROW-TRACEABILITY-MAP.md) closes only on the JUEL level that delivers it. Prerequisites are consumed contracts, not completion edges: a row closes when its acceptance holds on accepted contracts it consumes, and mutually composed rows (PC-CF-04 with PC-SCOPE-01; PC-HUM-01 with PC-MI-01, PC-MI-04 and PC-MI-05) close jointly. While PC-DELIVERY-01 or PC-QUALIFY-03 is held, overall target acceptance cannot close, however complete the tracks look.

## Owner decisions on the path

Decided on 2026-11-08 under the owner's direction to decide autonomously; none adds a dependency or a JVM.

| Item | Decision | Basis |
|---|---|---|
| Proof wave | Deferred until the coverage rows close; until then each proved lane is an open lane in the kernel status map | proofs over a moving `Step` are rewritten, the old slowdown's main cost; Lean stays the executable specification checked by every scenario |
| PC-AUTO-05, PC-AUTO-06 Script | JavaScript Script Tasks run in the TypeScript host's built-in Node `vm` with a read-only context and no host objects; the result is recorded like an effect result, so replay never reruns it; other languages are refused | CIB's default script language without its JVM engine; the `vm` is no security boundary, so scripts are trusted model content |
| PC-AUTO-07 decisions | DMN decision tables evaluated in the kernel, Lean and TypeScript, with the hit policies UNIQUE, FIRST, ANY, COLLECT and RULE ORDER and a bounded FEEL unary-test subset (literals, comparisons, ranges, lists, negation); other FEEL is refused | the same treatment as the JUEL subset: the specification is normative, CIB's DMN engine the oracle, Lean the authority |
| PC-TIMER-02 Cron | CIB's cron dialect, with its seconds field, evaluated in the kernel over UTC from logical time; CIB's use of the JVM default time zone is a classified register difference; other zones are refused | deterministic and replay-safe without time-zone data |
| PC-DELIVERY-01, PC-QUALIFY-03 | Stay held; re-qualified against the generic Temporal host, since TD-001 and TD-002 arose in the deleted adapter's code paths | SDK work stays prohibited; the [Temporal defects ledger](../TEMPORAL-DEFECTS-LEDGER.md) keeps the dispositions |

## Exclusions

The kernel introduces no BPMN meaning or CIB relationship beyond the admitted surface; lifted refusals are listed and owned by their tracks. Production-history compatibility, scale and an A12 product stay outside this target.

## Risks

- Proved lanes are deferred to the proof wave. Mitigation: owner confirmation, declarative `Laws` written with each feature, open lanes listed per row with a reopen trigger; Lean remains the executable authority on every scenario.
- Shape edits rebuild the whole kernel, and the clean-build bound is the binding constraint as the kernel grows. Mitigation: shape fixed for every row by the traceability map, shape edits batched per track and counted, the growth probe on every push, bounds never raised without the owner.
- Guards could become the next ratchets. Mitigation: no data files, reports instead of failures where a threshold is a judgment, bounds changed only by owner decision, and no guard without a repeated or structural class.
