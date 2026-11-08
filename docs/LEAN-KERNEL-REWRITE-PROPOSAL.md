# Lean kernel rewrite proposal

## Status

Lifecycle: implementation-in-progress

Review: approved

## Mandate

Round 1 on `59c38e87` and round 2 on `9342a8da` (each one cold proposal review, two HIGH reviews and five HIGH audits of the code, history and process) returned approve-with-required-edits; revision 3 (`4424cdab`) answered every required finding. The final round 3 on `4424cdab` approved: the cold, problem-fit and build-speed reviewers approve, and the five auditors found no gap that blocks W0. This revision applies its text corrections; its other recommended items are [W0 work](#final-round-items-carried-into-w0) and no further round follows.

Owner directions (2026-11-08), which this proposal turns into a contract: stop the incremental Activity host switch; rewrite as new code, not a migration, with clear modularity, fast builds and proper guardrails; Lean stays the formal semantic authority; the rewrite lands within days and Practical CIB7 Coverage follows within days after it; guardrails and code review on the important subjects from the start, closed-world assumptions named as a cause; delete and rewrite the documentation so old documents cannot mislead; keep the coverage target's goals, milestones and dependencies and drop everything tied to the old approach; drop the family ceremony; never run Docker or other long-running suites locally during the rewrite; strip whatever is not needed.

## Why delivery slowed

Measured from version history, the code and the rule documents on 2026-11-08 (3,422 commits since 2026-07-23). Figures resting on commit-subject classification are approximate.

| Rank | Cause | Evidence | Share of the slowdown |
|---|---|---|---|
| 1 | One IL constructor per BPMN variant, matched closed-world in Lean, TypeScript, schemas, the adapter and the platform | `SemanticOperation` has 45 constructors at `59c38e87` with three mirror enumerations, 148 Lean match sites, 89 Lean catch-all arms; the TypeScript core has 878 `case` labels, 388 equality tests and 41 value-returning `default` arms (two admit by default); the median Lean files touched by a constructor addition rose from 13 (July) to 72 (October) and 59 (November); one field rename touched 133 modules | the dominant code cause; every other code cause grew from it |
| 2 | Proof estate shaped per variant and per pair | 331–339 `Internal*` modules (about 78,000 lines, 30% of the library), commutation stacks copied per wait kind; proofs unfold evaluator bodies (2,070 `unfold`), so a behavior-neutral change breaks dozens of proofs | September's output went into pairwise proofs |
| 3 | Build-cost containment | 11,482 `import all` lines; hubs with up to 246 direct importers; 686 kernel-decided fixtures (median 736 s of fixture rebuild per commit, a 13 GB build); four module-system conversion commits touched 619–1,005 files each (all files, `git show --stat`) with no behavioral change; build and guard mechanics were 25% of commits (88 of 347, 2026-10-23 to 2026-11-02) | most of late October and November |
| 4 | Ceremony | 287 reviews in 117 receipts, 85% approve-with-required-edits, 301 audit commits, 33 graduation commits since 2026-10-22; the 25 small capsules of November typically ran propose, review, correct, approve, implement, close, graduate; non-feature commits per feature rose from 2.4 to 7.0 | about 30% of time |
| 5 | Documentation control plane | 230 documents, 1.09 million words; `PLAN.md` edited in 48% of all commits; markdown-only commits took 33% of time overall and 45% in November; a session read 40,000–50,000 words before acting | a serialization point on every commit |
| 6 | Guards as negotiation records | 131 guard tests, 63 of them for the old library or the process; `lean-module-cost.ts` edited 203 times; the fan-out bounds file edited in 35 commits over nine days and raised in 5; census allowlists of 38, 70 and 149 entries replaced the type checker | every Lean commit paid a measurement or a bound edit |
| 7 | Admission shaped by profile instead of by rule | 53 profiles for 184 scenarios (72 in one profile); exact operation multisets per profile; about 25 profile-keyed source readers with a silent generic fallback; 29 family graduations since 2026-10-22 closed 3 rows | work was sliced below row level |
| 8 | Per-row definition of done | each row demanded CIB execution, Temporal recovery, refinement and replay, Product 2 disclosure and its own independent closure | rows could not close even when behavior worked |
| 9 | Serial implementation | only the root agent could write Lean or production code | no parallelism on the critical path |
| 10 | Agent behavior | the agent turned 87 process findings into permanent rules and guards, chose safe incremental restructurings that closed no row (the switch spent 15.5 hours in proposal and rejection cycles and ended in a parked work-in-progress commit), followed ceremony past its value and reported the stall only when asked | amplified causes 3–6 |

Added lines per fortnight (`git log --numstat` with `--since` and `--until`; merge commits count no lines) fell from 329,326 (since 2026-08-06, until 2026-08-20) to 93,859 (since 2026-10-26, until 2026-11-09); without markdown from 300,172 to 82,170. Of 115 coverage rows, 5 are done.

Each cause has a fix below; the [guardrails](#guardrails-against-degradation) and the [process reset](#process-and-rule-reset) name the cause they prevent.

## Decision

Write a new Lean kernel and a TypeScript kernel transcribed from it; both execute one new kernel IL. Re-cut the boundary contracts along the kernel's axes in the same milestone, so that later rows change data, not shape. Freeze the existing `BpmnSemantics` library, TypeScript core and per-variant adapter code today: no feature or proof edits. Delete them at parity (W0.4).

Unchanged: the [authority model](../CLAUDE.md#authority-model) (BPMN 2.0.2 normative; Lean the formal authority; pinned CIB Seven `2.2.0` the behavioral oracle; TypeScript a separately written transcription; Temporal hosts and never defines BPMN behavior); the [semantic invariants](../CLAUDE.md#semantic-invariants); every recorded semantic decision (the [CIB–BPMN relation register](CIB-BPMN-RELATION-REGISTER.md), the reviewed interpretations, the [JUEL evaluation decision](JUEL-EVALUATION-ARCHITECTURE-DECISION.md) as amended for M2 under Evaluation below, the [Simple Boolean decision](SIMPLE-BOOLEAN-EXPRESSION-DECISION.md), the [XML ingestion decision](BPMN-XML-INGESTION-DECISION.md)); `@bpmn-lean/bpmn-source` parsing and source preservation; the MIT and A12 boundary; dependency approval; the SDK-work prohibition; the branch push flow; no tags.

Replaced in W0, atomically under the [pre-release evolution policy](PROJECT-DESIGN.md#pre-release-evolution-policy) (one current representation, no compatibility reader, retained evidence regenerated once):

- the Semantic Process IL, its schema and both lowerings; runtime state; the step relation and evaluator; the proof estate;
- the checked-process contract, re-cut along the kernel axes;
- the scenario, canonical-result, CIB-evidence and population-scenario contracts: generic stimuli, one typed open-wait list, one population form;
- the semantic publication contract: BPMN-level facts instead of IL operation kinds; program identity and element origin move to a stable shared schema, with the compiler identity `bpmn-kernel`;
- the engine API's start and correlation capabilities, derived from subscriptions;
- the adapter's IL-coupled code (admission, publication validation, per-variant schedulers, continuation state, ingress handlers), the platform's hand-written contract mirror and history view, the per-variant CIB probe classes and profile checks, per-variant Temporal tests and the pipeline-case registries.

## Kernel design

### IL

The IL fixes the shape for every open row now; admission widens per track. A field outside the admitted surface is refused with a stable refusal code, never left out of the type ([forward-compatible restrictions](../CLAUDE.md#forward-compatible-restrictions)). Admission (is this model inside the admitted surface) and normalization (lowering the checked source to the IL) stay separate steps.

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

W0.1 publishes a traceability table mapping every open row to the IL fields and state slots it uses, and one IL fixture per row that decodes.

### Runtime state and step

State is flat and identifier-indexed: scope occurrences (parent by identifier); tokens; variables per scope occurrence; one list of open items (waits, timers, subscriptions, effects) keyed by engine-issued identity; Multi-Instance controllers; completed-work records; one slot per feature. The open-item kind is a fixed guarded type that only `Step` and `Publish` match. Feature slots are fixed at W0.1 from the traceability table, always present and empty by default, so the state codec never varies by program. Cancellation is one generic subtree removal that notifies the owning features through `Hooks`; publication is one generic projection.

The step function is pure and total. Its inputs, mapped from every current stimulus:

| Input | Current stimuli |
|---|---|
| Start (definition, start event, trigger payload) | `startProcess`, `triggerMessageStart`, `triggerTimerStart` |
| Command (occurrence identity, typed result) | `completeUserTaskInstance`, addressless receive, `retryIncident`, `cancelIncidentProcess`, external variable write |
| Delivery (trigger, address, payload) | `deliverMessage`, `deliverPayloadMessage`, `deliverCorrelatedPayloadMessage`, Signal |
| Timer firing (subscription identity, logical time) | `fireTimer` |
| Effect result (effect identity, success, business failure or technical failure) | `completeEffect`, `reportEffectFailure` |

Evaluation. Each profile selects exactly one evaluator for its admitted expressions, run inside the kernel step: no evaluation leaves the kernel, and no part of the TypeScript and Temporal solution depends on a JVM (owner decision of 2026-11-08). Until M2 every profile selects the [Simple Boolean subset](SIMPLE-BOOLEAN-EXPRESSION-DECISION.md). M2 opens with a read-only JUEL subset written in Lean and transcribed to TypeScript: `${...}`, literals, comparison, logic, arithmetic, `empty`, ternary, and property or index access on plain data. Method calls, beans, functions and `execution` are refused at admission. This reverses the [JUEL decision](JUEL-EVALUATION-ARCHITECTURE-DECISION.md)'s exclusion of a project-owned evaluator and its Java hosting; its read-only context rules stand. The pinned evaluator checks the subset through retained CIB evidence over a table of expressions and contexts. An expression outside the selected evaluator is refused at admission with a stable code. A row whose acceptance needs such an expression closes only on that subset, never on Simple Boolean; the rest of its track proceeds.

After every committed write, the step closure re-evaluates the Conditions whose filters match, within a declared re-trigger bound. Logical time, scheduler choices and races stay explicit inputs. Outcomes stay distinct: committed, rolled back, rejected, semantic failure, unsupported.

`Hooks` is one record of functions, each field with a no-op default: host lifecycle (activate, complete, cancel), subscription arm and disarm, completed-work record, scope quiescence. The order in which `Step` invokes hooks is semantic and owned by `Step` alone; `Registry` only fills the fields. A feature whose rules outgrow three files becomes sub-features joined by their own hooks record. Runtime invariants live per feature in `Laws.<F>`; there is no global well-formedness function.

### Population

Mechanisms across process instances live in one layer, `Kernel.Population`, which calls `Step` for each instance: start selection by trigger and definition version, Message correlation by criteria with zero, one or ambiguous matches, Signal broadcast to the eligible population with a defined discovery order, Conditional start against submitted context, and called-definition version binding. The population scenario form covers them.

### Host interface

The adapter sees the kernel only through `hostRequirements(program)` (timers, concurrent waits, effect frontier, subscription lifetimes) and `hostView(state)` (open items with input kind, address, deadline and typed detail; effect requests; enabled interactions; occurrence start and end facts). State is opaque to the adapter apart from its codec.

### Modules and build shape

| Layer | Contents | May import |
|---|---|---|
| `Kernel.IL.Types` | flat element table, records, the instances a codec or theorem needs | nothing in the kernel |
| `Kernel.State` | state records with fixed feature slots, generic subtree removal | `IL.Types` |
| `Kernel.Hooks` | the hooks record with defaults | `IL.Types`, `State` |
| `Kernel.Feature.<F>` | one feature's rules, at most three files | `IL.Types`, `State`, `Hooks` |
| `Kernel.Admission.<F>` | one feature's admission rules with refusal codes | `IL.Types` |
| `Kernel.Step`, `Kernel.Publish`, `Kernel.Population` | dispatch over element, input and open-item kinds with the hooks record as a parameter; generic projection; population mechanisms | `IL.Types`, `State`, `Hooks` (`Population` also `Step`) |
| `Kernel.Registry`, `Kernel.AdmissionRegistry` | fill the hooks record; assemble admission | features; admissions |
| `Kernel.IL.Codec` | table-driven JSON codecs | `IL.Types`, `State` |
| `Kernel.Run` | scenario runner executable | everything above; the only importer of both registries |
| `Kernel.Laws.<F>` | the declarative rules and invariants of one feature, stated independently of `Step`'s code | `import all Kernel.Feature.<F>`, `Hooks` |
| `Kernel.Proofs.Step` and `Kernel.Proofs.*` | composition theorems over the `Laws` | `Laws`, `Hooks`, `Step` |

Rebuild cones: a feature interface edit rebuilds `{Feature.F, Laws.F, Registry, Run}` and the proofs that import `Laws.F`; a feature body edit rebuilds `Feature.F`; an admission edit rebuilds `{Admission.F, AdmissionRegistry, Run}`. A kernel shape edit (an IL record, a state slot type or a `Hooks` field) rebuilds everything; shape edits are batched at a track's start in one commit that the root accepts, never mid-track, and guard 9 counts them.

Features never import each other; cross-feature behavior goes through `Hooks`, so the feature order is irrelevant to the build. Features: flow and gateways, data, work, scopes, subscriptions, Multi-Instance, propagation, compensation and Transaction. `State` and `Hooks` are `@[expose]`. Executable modules contain no theorems, and nothing executable imports `Laws` or `Proofs`. `State` derives `DecidableEq` or `Repr` only where a consumer needs it. The root module and the runner's scenario list are generated, never edited by hand. Lean options keep `Elab.async=false`, `backward.match.sparseCases=false` and `-M2048`; `scripts/lake.sh` and `lakefile.toml` are retargeted to the kernel in W0.1.

TypeScript mirrors the executable modules under `packages/kernel/` with one file per Lean executable module, an explicit export list per layer, no cycles and no proof-motivated code (footprints, commutation helpers). Guarded kinds are TypeScript enums; owner modules dispatch by exhaustive `switch` ending in `assertNever` or by a `Record<Kind, …>` table; codecs decode through lookup tables that return a refusal code. The wire types move to a contracts package generated from the schemas; the adapter, engine API and platform import only that package and the host interface. `bpmn-source` refuses only parse, preservation and unknown-element cases, each with a code; every semantic refusal lives in `Kernel.Admission`.

### Profiles

A profile is data: the selected CIB relation options and the admitted field set. No code compares a profile identifier. W0 consolidates the 53 profiles into one standards profile and one cumulative CIB 2.2.0 profile per set of mutually exclusive relation options (for example [CIB-LIM-0002](CIB-BPMN-RELATION-REGISTER.md)), each carrying the union of its predecessors' relation identifiers. Retired immutable profiles stay reachable as commit permalinks. Scenarios move atomically. A scenario whose old profile refused a model the consolidated profile admits is listed as a lifted refusal and becomes work of the track that owns it. A relation-register entry lands in the same commit as the profile behavior it governs, and the track review checks it.

## Contracts

| Contract | W0 shape |
|---|---|
| Vocabulary schema (new) | element kind, work kind, trigger, attachment, input kind, open-item kind, transition role, outcome, channel and refusal-code enumerations for the whole target; the pipeline case form `case.json` (completion delivery, execution and effect schedules, replay selection, expected wait-trace length, mutations as path plus value) |
| Checked process | the kernel axes, so `bpmn-source` emits a total, rule-free lowering with one reader per mechanism; or admission emits the kernel IL directly, whichever W0.1's slice shows is smaller |
| Scenario, canonical result | generic `start`, `command`, `deliver`, `timerFire`, `effectResult` stimuli; one `openWaits` list of `{id, input, trigger, address, deadline, detail}`, where `detail` is typed per input kind and fixed in W0 (User Task metadata, assignment and form; effect descriptor and arguments; incidents; Multi-Instance controllers; failure detail) |
| Population scenario | the population form replaces `engine-population-scenario.schema.json` |
| CIB evidence | re-cut to the new scenario and result references; the translation is lossless, or the evidence is regenerated in one hosted run |
| Semantic publication | element identity, source element type and transition role; no IL kinds |
| Flow-node occurrence publication | unchanged apart from the moved identity reference |
| Engine API | one start list of `{startEventId, trigger, schedule}`; correlation capability derived from the subscription address |
| CIB runner options | the runner's profile checks become options declared by the scenario or model |

Retained evidence (canonical results, CIB evidence) is regenerated once into the new shapes by a declared one-off translation script in the session scratchpad ([Rule 3](../CLAUDE.md#rule-3-no-one-off-scripts-or-tests-in-the-repository)).

## Lean assurance lane

Lane shape: checked

Evidence: W0's claim is executable parity of the Lean kernel's runner through the [pipeline](../scripts/test-pipeline.ts) against the frozen baseline. Lean stays the formal semantic authority as the executable specification that every scenario checks the TypeScript kernel and CIB Seven against, and each `Laws.<F>` states its feature's rules declaratively, independent of `Step`'s code. This proposal moves the `proved` lanes of the 2026-10-14 set (concurrency, cancellation, Compensation and Transaction, Multi-Instance) to a proof wave after the coverage rows close, which proves `Step` sound against the `Laws`, pending the owner's confirmation in the packet. Until then each is recorded as a deliberately open lane in the kernel status map with coverage closure as its reopen trigger. Rows already `done` (PC-DATA-01/02, PC-HUM-04, PC-SCOPE-04/05) keep their state on the kernel's scenario evidence; their former theorems are listed as open lanes in the same map.

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

One generic scheduler drives all of them from `hostView`. The continuation chain carries the new state codec. Event-History capacity is derived from `hostRequirements`. W0.3b witnesses, in hosted CI: chain handoff with the new codec, recomputed capacity bounds, replay determinism, and the start, command, delivery, timer and effect mechanisms once each. The workflow patch identifiers and `V1` format suffixes are removed under the pre-release policy. The state relation preserved is the publication: the adapter's projection of kernel state equals the published contract.

## Guardrails against degradation

Every guard is a fast source or graph scan with no data file that feature work edits; a justification comment at the exception site is the only allowed exception mark. A guard either fails or reports; reports print as CI output and never block. A new guard is added only for a defect class seen twice or for a structural class. Each item names the cause it prevents.

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
| any of them, in proofs | `Kernel.Proofs.Step` |
| any of them, at a boundary | one module per package: the adapter's input mapper, the CIB runner's trigger mapper, the platform's history renderer |

Codecs and each type's own `Admission` module may also match it.

1. Closed dispatch, fails (cause 1). Only the owner above matches a guarded type, by pattern, `casesOn`, `BEq` or `matches`. Lean: an environment scan in the build lane. TypeScript: a scan for `switch`, `===`/`!==` on enum members, `in` narrowing and `filter` on kinds outside owners.
2. No catch-all, fails (cause 1). Lean: the environment scan rejects any match alternative that covers more than one constructor of a guarded type (`_`, variable, multi-pattern, `if let`). TypeScript: every `switch` over a kernel enum ends in `assertNever`; no `default:`.
3. No mirror enumerations, fails (cause 1). No second enumeration or classifier of a kernel vocabulary type; no census or allowlist of variants.
4. Layering, fails (causes 1, 3). The import graph follows the module table in Lean and TypeScript; acyclic; zero feature-to-feature imports; no `export *`; adapter, engine API, platform and CIB runner import only the generated contracts and the host interface.
5. Module-system policy, fails (cause 3). `import all` appears only in `Laws.F` for `Feature.F`; no private-equation helpers.
6. Proof placement, fails (causes 2, 3). No `theorem` in executable modules; no `decide`, `native_decide`, `cbv` or `rfl` reduction of `Step`, `Run` or a registry anywhere; `decide` elsewhere only in `Proofs` and `Laws` over facts a proof consumes; no `unfold` or `simp` of a feature body outside its `Laws`; no IL or state literal longer than 50 lines in Lean; finite examples run in the runner.
7. Profiles as data, fails (cause 7). No profile identifier literal outside the profile catalog, in the kernel or any boundary package.
8. One rule, one place (causes 1, 7). Fails from W0.3a: Lean and TypeScript executable modules pair by name and change in the same commit; no checked-source type in the kernel; no duplicate helper names. Reports: kernel file pairs above 0.7 normalized-line similarity.
9. Shape (causes 1, 3). Fails: an element kind, a top-level state field or a feature slot added outside an accepted shape commit; a constructor with more than a header and a payload; an anonymous-constructor pattern with more than four binders; `Step` above 600 lines. Reports: shape edits per track.
10. Size (cause 3). Fails: a file above 1,200 nonblank lines in the kernel or `bpmn-source`. Reports: files above 800, functions above 80 lines.
11. Codec truth, fails (cause 1). Every schema variant has a fixture that round-trips through the Lean and TypeScript codecs and the platform decoder.
12. Admission refusal, fails (cause 7). Every IL field outside the admitted surface, and every `bpmn-source` refusal, has a refusal test with its stable code.
13. Single entry, fails (cause 1). One step function, which `Population` calls; no program-mode predicate; no second evaluator.
14. Discovery by convention, fails (causes 5, 6). Scenarios, pipeline cases, corpus models and the runner list are discovered from directories; counts are derived, never written.
15. Build budget (cause 3), on every push, never only at closure. Fails in the fast suite: the static rebuild-set model, computed from the import graph of both languages: a feature or admission edit rebuilds only `{itself, its own submodules, Laws.F, the proofs importing Laws.F, the registry, Run}`, and the only modules with more than five direct importers are `IL.Types`, `State` and `Hooks`; every edit to one of those three is a shape edit. Fails in the hosted Lean lane, measured with commit, toolchain and thread count: the clean executable build (3 minutes), the worst feature body and interface edit (30 seconds), and any single module above 30 seconds; TypeScript type check and tests (10 s and 60 s). No `maxHeartbeats`, `maxRecDepth` or `synthInstance` option in the kernel, and no derived instance on `State` or `Program` without a named consumer. Reports: a `Hooks` and an IL shape edit, the proof build, and the growth per delivered row (kernel lines, module count, largest file, dispatch sites, seconds of clean build). Bounds change only by owner decision.
16. Behavior oracle, fails (all causes). Lean kernel, TypeScript kernel and retained CIB evidence agree on every scenario, population scenario, admission decision and committed publication.
17. One writer per effect, fails (cause 1). An environment scan and a TypeScript scan of who calls what: tokens are emitted only by `Feature.Flow`; occurrences and activations are created and removed only by `Step` and `State`; variables are written only by `Feature.Data`; an Activity completes only through `Signal.complete` and `Step`'s one pipeline. Dispatch guards see matches and miss effects: nine completers passed guards 1 and 2.
18. Seam fan-out budget, fails (causes 1, 3). Each guarded type has a constant maximum of match sites across the kernel, codecs excluded, fixed in the guard and changed only by owner decision; a new mechanism that needs another site changes the seam, not the budget. A commit whose scope is not `kernel-shape` changes at most eight kernel executable modules, a Lean and TypeScript pair counting once. Reports: modules changed per delivered row.
19. Field liveness, fails (cause 7). Every IL field is read by a non-codec declaration or refused by `Kernel.Admission` with a stable code. A field nothing reads and nothing refuses is a model silently misexecuted.
20. Refusal parity, fails (cause 7). Every runtime `unsupported` code either has a matching admission refusal for the same shape or is marked dynamic-only at its site with the reason: a static shape never fails mid-run.
21. Shape sufficiency, fails (causes 1, 7). Every row of the coverage target, discovered from it, has a traceability entry and an IL fixture that decodes in both kernels, so the shape for a row is proved present before the row's track starts.
22. Growth probe, on every push, fails (cause 3). The hosted Lean lane copies every feature and admission module three times under renamed namespaces and builds the fourfold kernel: clean build within the bound of guard 15, feature edit unchanged. Build cost that grows with the code fails here, while the code is still small.
23. Guards prove themselves, fails (all causes). Every guard has a test that seeds its violation and sees it fail, so no guard passes by matching nothing. A renamed module, type or directory that empties a guard's input fails it.
24. Justified rules, fails (cause 7). No rule in the kernel is justified by a baseline, the frozen evaluator or an old implementation; its comment cites a BPMN clause or a register identifier. Matching a past result is evidence of agreement, never a reason for a rule.

## Review

- This proposal: one final round with the same reviewers; afterwards, recommended items become W0.1 work.
- W0.1 architecture checkpoint: a cold reviewer checks the first kernel commit against the guardrails and the module table before W0.2 builds on it.
- Each mechanism track has one combined review of meaning and structure, run when the track's first row is green, where a rejection is still cheap. Its approval covers every row the track closes under that seam; a later row that changes shape reopens it. Its checklist names the degradation classes of the guardrails.
- A row that needs a new BPMN or CIB interpretation takes one cold review of that interpretation before its code: PC-BASIC-04 (M1), PC-DATA-07 (M2), PC-AUTO-05 and PC-AUTO-07 (M3), PC-SCOPE-03 (gates M8), PC-COMPENSATION-01 and PC-TX-01 (gate M9).
- A correction gets at most one audit. The verdict is recorded in the correction commit's message.

## Delivery plan

Order gates bind alongside the day budgets, because a budget of days cannot fire on work that takes hours. Nothing builds on a kernel shape until guards 17 to 21 pass on it and every open row maps onto it. A track's fill starts only when its row fixtures, scenarios and CIB evidence exist, so rows turn red to green against an answer fixed before the code. Within W0.3b the contracts re-cut and the generic CIB runner come first, because they are the oracle of every track; the Temporal host and W0.4 run alongside them. Agreement between Lean and TypeScript is a transcription check, never evidence of meaning.

### W0: the kernel

| Milestone | Content | Exit | Budget | Stop rule |
|---|---|---|---|---|
| W0.0 | the process reset (below) | `CLAUDE.md` rewritten, process and document guards deleted, fast suite green | 0.5 day | not done in 1 day: report to the owner |
| W0.1 | module skeleton, guards, vocabulary schema, IL row-traceability table and fixtures, state slots, one `Laws.<F>`, a vertical slice (Start, User Task, Exclusive Gateway, End) through every layer, retargeted `lake.sh` | every row fixture decodes; measurement plan passes; architecture checkpoint approves | 1 day | slice not through every layer after 1.5 days, or budgets fail: redesign before W0.2 |
| W0.2 | Lean kernel parity, largest profiles first (nested scope data, embedded, repeatable subscriptions: 108 of 184 scenarios) | every scenario, population scenario, admission decision and committed publication equals the baseline or carries a classified mismatch; the inflation probe passes | 2 days | below 50% of scenarios at the end of its second day: stop and re-plan |
| W0.3a | TypeScript kernel transcribed from the Lean executable modules | differential agreement on every scenario | 1 day, parallel to W0.2's second day | no differential agreement on the slice and the largest profile after 1.5 days: stop and re-plan |
| W0.3b | contracts re-cut, generic adapter scheduler, engine API, CIB runner options, platform types and history view, generated contracts package | hosted CI green, including the Temporal witnesses | 3 days | not green at the end of its third day: stop and re-plan |
| W0.4 | delete the old library, core, adapter code, guards and documents after extraction; graduate this proposal to the kernel architecture specification | complete hosted verification green; land on `main` | 0.5 day | — |

W0 budget: seven days from approval; with the tracks and integration, about 14 calendar days from approval to Practical CIB7 Coverage acceptance, before the proof wave. M2 opens with the JUEL subset; rows in other tracks whose acceptance needs its expressions close after it, and every other row proceeds on Simple Boolean.

Measurement plan (W0.1 exit): per-module build times at one and two threads on the vertical slice; edit probes in a scratch clone (a feature body edit, a private helper, a feature interface edit, a `Hooks` field, an IL field, an admission rule) compared with the rebuild cones; TypeScript type-check and test times. At W0.2's end, a fourfold inflation probe copies the features under renamed namespaces to simulate the full target; if it fails a bound, the design is cut again before W0.3, and the bound is never raised.

Parity baseline: the old evaluators' results, captured once by a scratchpad script, translated to the new shapes, stored apart from the neutral scenarios and bound to each scenario's digest; the kernel runner never receives it. Each mismatch is classified against the reviewed interpretation and the retained CIB evidence as a kernel defect (fix), an old-evaluator defect (record the correction), or a lifted refusal (listed as track work); the baseline is never adjusted to match. It is deleted at W0.4.

### Mechanism tracks, then rows

After W0 the mechanism tracks run in parallel, up to three at a time, each by its own HIGH agent on its own feature, admission, laws and TypeScript modules, with the root integrating, accepting shape edits, running full builds and reviewing. A track ends when its mechanism and its rows' scenarios are green. Prerequisites are consumed contracts, not completion edges, as the [coverage target](PRACTICAL-CIB7-COVERAGE-TARGET.md#how-a-task-closes) already states: a row closes when its acceptance holds on accepted contracts it consumes; mutually composed rows (PC-CF-04 with PC-SCOPE-01; PC-HUM-01 with PC-MI-01, PC-MI-04 and PC-MI-05) close jointly. Every open or held row appears once:

| Track | Rows |
|---|---|
| M1 flow and gateways | PC-CF-02, PC-CF-03, PC-CF-04, PC-CF-05, PC-CF-06, PC-CF-07, PC-CF-08, PC-BASIC-01, PC-BASIC-02, PC-BASIC-03, PC-BASIC-04, PC-HUM-05 |
| M2 data and expressions | PC-DATA-03, PC-DATA-04, PC-DATA-05, PC-DATA-06, PC-DATA-07, PC-DATA-08, PC-DATA-09 |
| M3 work and effects | PC-HUM-01, PC-HUM-02, PC-HUM-03, PC-HUM-06, PC-AUTO-01, PC-AUTO-02, PC-AUTO-03, PC-AUTO-04, PC-AUTO-05, PC-AUTO-06, PC-AUTO-07, PC-AUTO-08 |
| M4 scopes | PC-SCOPE-01, PC-SCOPE-02, PC-SCOPE-06, PC-SCOPE-07, PC-TERMINATE-01, PC-TERMINATE-02 |
| M5 Multi-Instance | PC-MI-01 to PC-MI-12 |
| M6 subscriptions | PC-TIMER-01, PC-TIMER-02, PC-TIMER-03, PC-TIMER-05, PC-TIMER-06, PC-TIMER-07, PC-TIMER-08, PC-MESSAGE-01, PC-MESSAGE-03, PC-MESSAGE-04, PC-MESSAGE-05, PC-MESSAGE-06, PC-MESSAGE-07, PC-SIGNAL-03, PC-CONDITION-01, PC-CONDITION-03, PC-CONDITION-04, PC-CONDITION-05 |
| M7 throw and propagation | PC-ERROR-01, PC-ERROR-02, PC-ERROR-03, PC-ESCALATION-01, PC-ESCALATION-02, PC-ESCALATION-03, PC-MESSAGE-09, PC-SIGNAL-01 |
| M8 population | PC-TIMER-04, PC-MESSAGE-02, PC-MESSAGE-08, PC-SIGNAL-02, PC-SIGNAL-04, PC-CONDITION-02, PC-SCOPE-03 |
| M9 compensation and Transaction | PC-COMPENSATION-01 to PC-COMPENSATION-05, PC-TX-01, PC-TX-02, PC-TX-03 |
| I integration | PC-DELIVERY-01 (held), PC-JOURNEY-01 to PC-JOURNEY-07, PC-QUALIFY-01 to PC-QUALIFY-10 (PC-QUALIFY-03 held), PC-ACCEPT-01, PC-ACCEPT-02 |

Budgets: M1–M9 five days across three parallel tracks; integration and qualification two days; the proof wave follows acceptance. Each track reports elapsed time against its budget. A missed budget is reported to the owner at once with the boundary reached and the next decision; it is never renewed silently.

### Definition of done for a row

This replaces the coverage target's inherited definition of done. A row is done when its acceptance clause in the [coverage target](PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) holds on the kernel in Lean, TypeScript and the retained CIB evidence, and its track's combined review approved it. The kernel status map lists, per row, the open proof lanes it depends on. A hosted Temporal witness is needed only for a new hosting mechanism. Product 2 disclosure comes from the generated capability catalog. A whole corpus model is needed only where the row's acceptance clause names one; the journey rows carry the business models. A row marked `yes` in the `needs-expression-beyond-simple-boolean` column of the [row traceability table](kernel/ROW-TRACEABILITY.md) closes only on the JUEL subset M2 delivers. PC-AUTO-05 and PC-AUTO-06 stay owner-held on the Script runtime decision; while they are held, the qualification and acceptance rows that consume them and overall target acceptance cannot close, however complete the tracks look.

### Verification cadence

Locally: the kernel build of touched modules, the kernel runner, TypeScript type checks and unit tests, and the fast guard suite. No Docker, Temporal server, PostgreSQL, browser, CIB oracle or other long-running lane runs locally. Those run in hosted CI on the pushed branch, once per milestone or track, which is also the landing gate; a hosted failure is reproduced locally only by its narrowest command. CIB evidence for new scenarios is produced in one batched hosted run per track.

### Delegation

HIGH track agents author kernel feature, admission and laws modules in Lean and their TypeScript pairs on disjoint files, and run only narrow builds of their own modules (`./scripts/lake.sh build Kernel.Feature.<F>`, `Kernel.Laws.<F>` and `Kernel.Run` for their own scenarios) under the shared project lock; an agent that finds the lock held waits and retries, and serialized Lean builds are a known throughput cost. The root alone accepts shape edits, runs full builds, the full runner and every hosted lane, and integrates. Agents never run heavy lanes. Workers on scenarios and models stay MEDIUM. Decision extraction from the old documents is HIGH work accepted by the root. The guards, the architecture checkpoint and the track review replace the old rule that only the root writes Lean ([cause 9](#why-delivery-slowed)).

## Owner decisions on the path

One packet during W0, each item with a recommendation: confirmation of the proof-wave deferral; PC-AUTO-05 Script runtime and PC-AUTO-07 decision engine (M3); PC-TIMER-02 Cron dialect (M6); PC-DELIVERY-01 and PC-QUALIFY-03 qualification holds on the recorded Temporal SDK defects, which block acceptance while SDK work stays prohibited.

## Process and rule reset

Owner direction (2026-11-08) drops the family ceremony and the process that slowed delivery. In W0.0, before kernel code:

- `CLAUDE.md` is rewritten (Rule 2 included) to keep only: the mission; the authority model; the non-negotiable boundaries restated for the kernel; the semantic invariants; forward-compatible restrictions; Rule 1; Rule 2 as "a bulk script declares its scope and target effect, and a post-run diff against that declaration checks it"; Rule 3; root cause before fix; the SDK-work prohibition; pre-release evolution; the MIT and A12 licence boundary; dependency approval and the 14-day rule; the Lean wrapper, memory safety and heavy-lane serialization across every checkout of the project; the guardrails; the verification cadence; the delegation rule; the branch push flow.
- Dropped from `CLAUDE.md` and every policy: capsule documents and their required items, including the capsule Lean-lane declaration, the transition-family-before-capsule-Temporal-preflight rule and the register-before-implementation step (a register entry now changes in the track that needs it); review packets and receipt grammars; semantic-checkpoint and warm-review variants; correction audits beyond one; ledgers and cost rows; assurance-trigger tables; the written double check on every recommendation; `what-binds` and session-start map reading; local long-command receipts; per-commit resource measurements; turning every finding into a rule.
- The process and document guards and the whole-repository Lean scanners are deleted; the guards scoped to the frozen `BpmnSemantics` library stay until W0.4. Old documents remain for extraction until W0.4 and bind nothing.
- `PLAN.md` and the kernel status map change only at a milestone or track closure, or at a stop; a pre-push and CI check on the pull-request diff rejects a commit that changes `PLAN.md` or the status map together with code. No work-in-progress or park commit lands on a track's mainline, and no commit that fails a guard lands; a bound changes only by owner decision.

Guards (131 `scripts/*.test.ts` today; W0.0's scope declaration lists each file):

| Disposition | Guards |
|---|---|
| Keep (52) | product, wire and CIB contract guards (28), with path updates; toolchain, infrastructure and safety guards (19); Lean safety (`lean-proof-escapes`, `lean-test-lane-policy`, `lean-full-gate`, `lean-memory-brake`, `lean-ci-pin`) |
| Rewrite for the kernel (23, plus 2 new) | the ten per-variant checked-to-IL bindings become one codec, admission and refusal test, and their helper scripts are deleted; `structured-human-work-contract`, `flow-node-occurrence-publication-contract-schema`, `contract-artifacts` and `capsule-roundtrip` follow the re-cut contracts; `lean-import-boundaries` becomes guard 4; `lean-source-contracts` becomes guards 1–2; `lean-executable-checks` and `lean-native-driver` target the kernel runner; `a12-preservation` and `pre-release-architecture` retarget their roots; `verification-entrypoint` drops its document-text assertions; `source-hygiene` moves its exceptions to source comments; `pipeline-budget` keeps one bound, changed only by owner decision; new pairing and build-budget guards |
| Delete (56) | censuses and frozen lists (14); Lean build-shape guards for the old library (13, including fan-out, module cost, fixture owners, `import all` minimization); document-structure and process guards (26, including `what-binds` and the review packet); long-command receipt guards (3); all their data and helper files |

The `scripts/*.platform-test.ts` guards stay; their budgets fall under the owner-decision rule.

## Documentation reset

Old documents about the old code or process are deleted; every semantic decision they record is first restated in the new semantics document of the mechanism that owns it, cited by commit permalink. A scratchpad script lists every relation-register identifier and every interpretation and restriction section of the old documents, and a diff against the new owners' citations shows none is unmapped. Deletion happens at W0.4, after extraction; earlier W0 work creates only.

| Disposition | Documents |
|---|---|
| New | `docs/kernel/`: architecture (this proposal graduated, with the guardrails); IL specification; one semantics document per feature, plus admission, publication and observation, and population; kernel status map (implemented and absent per row, open proof lanes, assurance and adoption state); engineering rules (review, gates, documentation, code style, setup policy); `PLAN.md` holding the plan above; rewritten `CLAUDE.md`; rewritten [documentation registry](README.md) |
| Reduced to goals, milestones and dependencies | [coverage target](PRACTICAL-CIB7-COVERAGE-TARGET.md): per row only ID, outcome with decisive acceptance, prerequisites and state, plus the target definition and bounded contract decisions, with this proposal's definition of done; [PROJECT-DESIGN](PROJECT-DESIGN.md), dropping its capsule success criteria, semantic increment preservation gate, Lean assurance lane and Temporal preflight sections; [ARCHITECTURE](ARCHITECTURE.md), [conformance target](BPMN-CONFORMANCE-TARGET.md), [requirement ledger](BPMN-REQUIREMENT-LEDGER.md), [showcase ladder](SHOWCASE-MILESTONE-LADDER-DECISION.md), [CIB compatibility scope](CIB-SEVEN-COMPATIBILITY-SCOPE-PROPOSAL.md) and [CIB observation policy](CIB-OBSERVATION-POLICY.md): goals, authority, scope, milestones and dependencies stay, old-approach prescriptions go; [contributor setup guide](CONTRIBUTOR-SETUP-GUIDE.md), dropping its Lean measurement, decision-procedure, resource-ceiling and agent-startup sections |
| Deleted after extraction | `docs/capsules/` (92 documents); IL, runtime-state invariant, Activity occurrence ownership and profile-parameterized admission specifications; issuing-discipline, internal-commutation and regional-ownership proposals; the Business Process public delivery proposal (its open increment becomes journey-row work); Lean build modularity specification; all engine implementation maps, the assurance and adoption map and their router; Temporal hosting map and Temporal test evidence map (folded into the kernel status map); capsule cost ledger, `capsule-costs/`, `lean-resource-costs/`, process assessment ledger and `process-assessment/`, assurance improvement register; review policy, testing specification, documentation discipline, code style guide, verification-infrastructure policy and the semantic, Temporal and platform verification policies (folded into the engineering rules); `docs/experiments/`, `docs/archived/`; research on semantic representations; the stopped switch proposal |
| Kept, links repaired | normative and research inputs (`docs/reference/`, other `docs/research/`, [SOURCES](SOURCES.md)); the [relation register](CIB-BPMN-RELATION-REGISTER.md) and adopted decision records; `bpmn-source` admission specifications (interchange, preserve-only); Temporal lifecycle, runnable MVP and Worker deployment specifications, the scalability proposal (outside this target) and the [Temporal defects ledger](TEMPORAL-DEFECTS-LEDGER.md); Product 2 platform documents and their implementation map, the MUE Preview Alpha and Beta specifications and the A12 add-on boundary; reference instrumentation policy; infographics, with captions describing the old IL corrected |

Markdown outside `docs/` (package READMEs and source maps, `contracts/`, `scripts/`, `scenarios/`, `profiles/` and corpus READMEs, the root README) is deleted with the code it describes or reduced like the documents above; `contracts/README.md` is rewritten with the contracts. Kept decision records are reduced to decision and rationale stated against the kernel.

Links into deleted documents from scenarios, profiles, corpus models, contracts and kept documents (about 180 files) are repointed to the new owners in the same commit. A row closed before the reset keeps its receipt as a commit permalink.

## Final-round items carried into W0

Recommended by round 3; each lands in the milestone named, without another review round.

- W0.1 traceability table: the `Hooks` field serving each cross-owner match (a thrown Error or Escalation against catch triggers with exact-before-catch-all precedence; Compensation; Cancel), so that guard 1 never pushes it into `Step`; the checked-process cut, settled as an accepted shape commit at the architecture checkpoint.
- W0.1 guards: guard 1 also covers `Decidable` and `DecidableEq` uses and `ctorIdx` on guarded types, and TypeScript string literals of vocabulary values unless the generator emits enums; guard 2 rejects equality tests and `filter` on guarded kinds inside owners, apart from `Record` tables; guard 5 requires `@[no_expose]` on `State` operation bodies; guard 9's binder cap covers explicit `.mk` patterns and its failing list includes `Hooks` fields; the environment scan rejects `Feature.F` constants in the types of `Laws.F` rule and invariant definitions; guard 7 covers `packages/differential/test` and the testkits; guard 10 fails functions above 150 lines and the similarity and duplicate-helper checks cover `bpmn-source`; guards 1 and 2 run in the build lane, not the fast suite.
- W0.1 build model: guard 15 treats every feature edit as an interface edit (`{Feature.F, Laws.F, Registry, Run}` plus proofs importing `Laws.F`); `Kernel.Registry`, `Kernel.AdmissionRegistry` and the TypeScript export lists are generated from the feature directories; the route of `Proofs.Step` into `Step` is a `Laws.Step` module, not an `import all` exception; commutation is proved once over the footprints each feature declares through its `Hooks` laws, never per wait kind.
- W0.3b: the host interface adds `definitionCapabilities(program)` (start list and correlation addresses) for the engine API; the platform's dispatch owner is one presentation module that the history, start and work views share; a host refusal table keyed by `hostRequirements` fields with vocabulary refusal codes replaces today's qualification-pending refusals; `bpmn-source` refusals are recoded and its semantic refusals move to `Kernel.Admission`.
- Track review checklist: no proof-motivated TypeScript code; the register entry is in the commit of the profile behavior it governs.

## Exclusions

W0 introduces no BPMN meaning or CIB relationship beyond the admitted surface; lifted refusals are listed and owned by their tracks. Production-history compatibility, scale and an A12 product stay outside this target.

## Risks

- W0 is large: about 62,600 lines of evaluator, 47,900 of TypeScript core and 31,800 of adapter code are replaced. Mitigation: parallel HIGH authors, the largest profiles first, stop rules per milestone, and generic designs that are smaller than the code they replace.
- Two systems coexist until W0.4. Mitigation: the old stack is frozen today and deleted at a fixed milestone.
- Proved lanes are deferred to the proof wave. Mitigation: owner confirmation, declarative `Laws` written with each feature, open lanes listed per row with a reopen trigger; Lean remains the executable authority on every scenario.
- A parity mismatch may expose an old-evaluator defect. Mitigation: the classification rule above; the baseline is never adjusted.
- Shape edits rebuild the whole kernel and the clean-build bound is the binding constraint as the kernel grows. Mitigation: shape fixed for every row at W0.1, shape edits batched per track and counted, the inflation probe at W0.2, bounds never raised without the owner.
- New guards could become the next ratchets. Mitigation: no data files, reports instead of failures where a threshold is a judgment, bounds changed only by owner decision, and no guard without a repeated or structural class.

## Independent cold-review receipt

| Stage | Target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `4424cdab` | `fork-turns-none` | `approve` | `not-required` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-required` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
