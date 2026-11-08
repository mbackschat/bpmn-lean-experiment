# Lean kernel rewrite proposal

## Status

Lifecycle: draft

Review: pending

## Mandate

Round 1 on `59c38e87` (one cold proposal review, two HIGH reviews and five HIGH audits of the code, history and process) returned approve-with-required-edits; this revision answers every required finding and goes to round 2.

Owner directions (2026-11-08), which this proposal turns into a contract: stop the incremental Activity host switch; rewrite as new code, not a migration, with clear modularity, fast builds and proper guardrails; Lean stays the formal semantic authority; the rewrite lands within days and Practical CIB7 Coverage follows within days after it; guardrails and code review on the important subjects from the start, closed-world assumptions named as a cause; delete and rewrite the documentation so old documents cannot mislead; keep the coverage target's goals, milestones and dependencies and drop everything tied to the old approach; drop the family ceremony; never run Docker or other long-running suites locally during the rewrite; strip whatever is not needed.

## Why delivery slowed

Measured from version history, the code and the rule documents on 2026-11-08 (3,422 commits since 2026-07-23). The figures are approximate where they rest on commit-subject classification.

| Rank | Cause | Evidence | Share of the slowdown |
|---|---|---|---|
| 1 | One IL constructor per BPMN variant, matched closed-world in Lean, TypeScript, schemas, the adapter and the platform | `SemanticOperation` has 45 constructors with three mirror enumerations, 148 Lean match sites, 89 Lean catch-all arms; the TypeScript core has 878 `case` labels, 388 equality tests and 41 value-returning `default` arms (two admit by default); the median Lean files touched by a constructor addition rose from 13 (July) to 72 (October); one field rename touched 133 modules | the dominant code cause; every other code cause grew from it |
| 2 | Proof estate shaped per variant and per pair | 339 `Internal*` modules (78,000 lines, 30% of the library), commutation stacks copied per wait kind; proofs unfold evaluator bodies (2,070 `unfold`), so a behavior-neutral change breaks dozens of proofs | September's output went into pairwise proofs |
| 3 | Build-cost containment | 11,482 `import all` lines; hubs with up to 246 direct importers; 686 kernel-decided fixtures (median 736 s of fixture rebuild per commit, a 13 GB build); four module-system conversion commits touched 617–986 files with no behavioral change; build and guard mechanics took about 27% of time from late October | most of late October and November |
| 4 | Ceremony | 287 reviews in 117 receipts, 85% approve-with-required-edits, 301 audit commits; 25 small capsules in November each ran propose, review, correct, approve, implement, close, graduate; non-feature commits per feature rose from 2.4 to 7.0 | about 30% of time |
| 5 | Documentation control plane | 230 documents, 1.09 million words; `PLAN.md` edited in 48% of all commits; markdown-only commits took 33% of time overall and 45% in November; a session read 40,000–50,000 words before acting | a serialization point on every commit |
| 6 | Guards as negotiation records | 131 guard tests, 63 of them for the old library or the process; `lean-module-cost.ts` edited 201 times, fan-out bounds raised in 35 commits in one week; census allowlists of 38, 70 and 149 entries replaced the type checker | every Lean commit paid a measurement or a bound edit |
| 7 | Admission shaped by profile instead of by rule | 53 profiles for 184 scenarios (72 in one profile); exact operation multisets per profile; about 25 profile-keyed source readers with a silent generic fallback; 29 family graduations since 2026-10-22 closed 3 rows | work was sliced below row level |
| 8 | Per-row definition of done | each row demanded CIB execution, Temporal recovery, refinement and replay, Product 2 disclosure and its own independent closure | rows could not close even when behavior worked |
| 9 | Serial implementation | only the root agent could write Lean or production code | no parallelism on the critical path |
| 10 | Agent behavior | the agent turned 87 process findings into permanent rules and guards, chose safe incremental restructurings that closed no row (the switch spent 15.5 hours in proposal and rejection cycles and ended in a parked work-in-progress commit), followed ceremony past its value and reported the stall only when asked | amplified causes 3–6 |

New code per fortnight fell from about 329,000 added lines (2026-08-06 to 2026-08-20) to about 86,000 (2026-10-29 to 2026-11-08), measured with `git log --numstat`; of 115 coverage rows, 5 are done.

Each cause has a fix below; the [guardrails](#guardrails-against-degradation) name the cause they prevent.

## Decision

Write a new Lean kernel and a TypeScript kernel transcribed from it; both execute one new kernel IL. Re-cut the boundary contracts along the kernel's axes in the same milestone, so that later rows change data, not shape. Freeze the existing `BpmnSemantics` library, TypeScript core and per-variant adapter code today: no feature or proof edits. Delete them at parity (W0.4).

Unchanged: the [authority model](../CLAUDE.md#authority-model) (BPMN 2.0.2 normative; Lean the formal authority; pinned CIB Seven `2.2.0` the behavioral oracle; TypeScript a separately written transcription; Temporal hosts and never defines BPMN behavior); the [semantic invariants](../CLAUDE.md#semantic-invariants); every recorded semantic decision (the [CIB–BPMN relation register](CIB-BPMN-RELATION-REGISTER.md), the reviewed interpretations, the [JUEL evaluation decision](JUEL-EVALUATION-ARCHITECTURE-DECISION.md), the [XML ingestion decision](BPMN-XML-INGESTION-DECISION.md)); `@bpmn-lean/bpmn-source` parsing and source preservation; the MIT and A12 boundary; dependency approval; the SDK-work prohibition; the branch push flow; no tags.

Replaced in W0, atomically under the [pre-release evolution policy](PROJECT-DESIGN.md#pre-release-evolution-policy) (one current representation, no compatibility reader, retained evidence regenerated once):

- the Semantic Process IL, its schema and both lowerings; runtime state; the step relation and evaluator; the proof estate;
- the checked-process contract, re-cut along the kernel axes;
- the scenario and canonical-result contracts: generic stimuli and one open-wait list;
- the semantic publication contract: BPMN-level facts instead of IL operation kinds; program identity and element origin move to a stable shared schema, with the compiler identity `bpmn-kernel`;
- the engine API's start capabilities: one start list with trigger and schedule as data;
- the adapter's IL-coupled code (admission, publication validation, per-variant schedulers, continuation state, ingress handlers), the platform's hand-written contract mirror and history view, the per-variant CIB probe classes, per-variant Temporal tests and the pipeline-case registries.

## Kernel design

### IL

The IL fixes the shape for every open row now; admission widens per wave. A field outside the admitted surface is refused with a stable refusal code, never left out of the type ([forward-compatible restrictions](../CLAUDE.md#forward-compatible-semantic-restrictions)). A shape change after W0 is an owner decision and lands at a track start with schema, codec, TypeScript and evidence in one commit.

Every element is a header record (identity, origin, source element type) plus one payload record; no constructor carries positional fields beyond those two. Element kinds, fixed for the whole target:

| Kind | Payload |
|---|---|
| Activity | work: `none`, `manual`, `user` (task definition and metadata), `receive` (Message subscription or addressless), `service` (handler binding), `send` (binding, recipient, correlation), `script` (format, source, result variable), `rule` (decision reference, result mapping), `call` (called-definition key, binding and version selectors, business key, input and output mappings, propagation flags); shared activity envelope |
| Scope | `embedded`, `transaction`, `eventSubProcess` (start subscription, interrupting); child graph; local variables; shared activity envelope |
| Event | `catch` (one subscription), `throw` (throw record), `link` (catch or throw, name); intermediate or end placement |
| Gateway | `exclusive`, `parallel`, `inclusive` (ordered conditional candidates, default), `eventBased` (ordered arms, each an Event catch or a Receive Activity) |
| Start | none or one subscription; root or Event Sub-Process placement |

Shared activity envelope, on Activity and Scope alike: incoming and outgoing flow lists (implicit merge and split); input and output mappings; boundary list of `(subscription, interrupting)`; optional Multi-Instance wrapper; optional compensation handler reference.

A subscription is `(trigger, address, output mapping)`. Triggers: Timer (`duration | date | cycle`, each `literal | expression`, with cycle dialect and repetition), Message (name `literal | expression`, correlation criteria), Signal (name `literal | expression`), Condition (expression, variable-name and variable-event filter), Error (code or catch-all, code and message variables), Escalation (code or catch-all, code variable), Compensation, Cancel.

A throw record is one of: none; Message (send binding, payload mapping); Signal (name, payload mapping); Error (code, message); Escalation (code); Compensation (`activityRef`, `waitForCompletion`); Cancel; Terminate.

A Multi-Instance wrapper is `(mode, collection expression | cardinality expression, element variable, completion condition, input data item, output data item, output collection, mutable-collection policy)`.

W0.1 publishes a traceability table mapping every open row to the IL fields it uses, and one IL fixture per row that decodes.

### Runtime state and step

State is flat and identifier-indexed: a tree of scope occurrences; tokens; variables per scope; one list of open items (waits, timers, subscriptions, effects, evaluation requests) keyed by engine-issued identity; Multi-Instance controllers; completed-work records. Feature data lives in slots the feature owns; the top-level shape is fixed at W0.1. Cancellation is one generic subtree removal that notifies the owning features; publication is one generic projection.

The step function is pure and total. Its inputs, mapped from every current stimulus:

| Input | Current stimuli |
|---|---|
| Start (definition, start event, trigger payload) | `startProcess`, `triggerMessageStart`, `triggerTimerStart` |
| Command (occurrence identity, typed result) | `completeUserTaskInstance`, addressless receive, `retryIncident`, `cancelIncidentProcess`, external variable write |
| Delivery (trigger, address, payload) | `deliverMessage`, `deliverPayloadMessage`, `deliverCorrelatedPayloadMessage`, Signal |
| Timer firing (subscription identity, logical time) | `fireTimer` |
| Effect result (effect identity, success, business failure or technical failure) | `completeEffect`, `reportEffectFailure` |
| Evaluation result (request identity, typed value or evaluation failure) | new: the content-bound result the [JUEL decision](JUEL-EVALUATION-ARCHITECTURE-DECISION.md) requires |

A step that needs an expression value emits an evaluation request and suspends that branch; an evaluation failure rolls back to the pre-step state. After every committed write, the step closure re-evaluates the Conditions whose filters match, within a declared re-trigger bound. Logical time, scheduler choices and races stay explicit inputs. Outcomes stay distinct: committed, rolled back, rejected, semantic failure, unsupported.

### Population

Mechanisms across process instances live in one layer, `Kernel.Population`, beside the step: start selection by trigger and definition version, Message correlation by criteria with zero, one or ambiguous matches, Signal broadcast to the eligible population with a defined discovery order, Conditional start against submitted context, and called-definition version binding. The scenario contract's population form covers them.

### Host interface

The adapter sees the kernel only through `hostRequirements(program)` (timers, concurrent waits, effect frontier, subscription lifetimes) and `hostView(state)` (open items with their input kind, address and deadline; effect requests; evaluation requests; enabled interactions; occurrence start and end facts). State is opaque to the adapter apart from its codec.

### Modules and build shape

| Layer | Contents | May import |
|---|---|---|
| `Kernel.IL.Types` | IL records and the instances a codec or theorem needs | nothing in the kernel |
| `Kernel.State` | state records, generic subtree removal | `IL.Types` |
| `Kernel.Hooks` | one record of functions per cross-feature seam: host lifecycle (activate, complete, cancel), subscription arm and disarm, completed-work record, scope quiescence, evaluation request | `IL.Types`, `State` |
| `Kernel.Feature.<F>` | one feature's step rules, at most three files | `IL.Types`, `State`, `Hooks` |
| `Kernel.Admission.<F>` | one feature's admission rules with refusal codes | `IL.Types` |
| `Kernel.Registry` | assembles hooks and admission | features, admissions |
| `Kernel.Step`, `Kernel.Publish`, `Kernel.Population` | dispatch over element and input kinds, generic projection, population mechanisms | `Registry` |
| `Kernel.IL.Codec`, `Kernel.Run` | JSON codecs (table-driven), scenario runner executable | `Step`, `Publish`, `Population` |
| `Kernel.Laws.<F>` | the laws of one feature's hooks | `import all Kernel.Feature.<F>` |
| `Kernel.Proofs.*` | composition theorems over the `Hooks` laws | `Laws`, `Hooks` |

Features never import each other; cross-feature behavior goes through `Hooks`, so the feature order is irrelevant to the build. Features: flow and gateways, data, work, scopes, subscriptions, Multi-Instance, propagation, compensation and Transaction. Executable modules contain no theorems, and nothing executable imports `Laws` or `Proofs`. The root module and the runner's scenario list are generated, never edited by hand. Lean options keep `Elab.async=false`, `backward.match.sparseCases=false` and `-M2048`; `scripts/lake.sh` and `lakefile.toml` are retargeted to the kernel in W0.1.

TypeScript mirrors the table under `packages/kernel/` with one file per Lean module, an explicit export list per layer, and no cycles. The wire types move to a contracts package generated from the schemas; the adapter, engine API and platform import only that package and the host interface.

### Profiles

A profile is data: the selected CIB relation options and the admitted field set. No code compares a profile identifier. W0 consolidates the 53 profiles into one standards profile and one cumulative CIB 2.2.0 profile carrying the union of their relation identifiers. Scenarios move atomically. A scenario whose old profile refused a model the consolidated profile admits is listed as a lifted refusal and becomes work of the mechanism that owns it.

## Contracts

| Contract | W0 shape |
|---|---|
| Vocabulary schema (new) | trigger, work kind, element kind, attachment, channel and refusal-code enumerations for the whole target |
| Checked process | the kernel axes, so `bpmn-source` emits a total, rule-free lowering with one reader per mechanism; or admission emits the kernel IL directly, whichever W0.1's slice shows is smaller |
| Scenario, canonical result | generic `start`, `command`, `deliver`, `timerFire`, `effectResult`, `evaluationResult` stimuli; one `openWaits` list of `{id, input, trigger, address, deadline}`; population form |
| Semantic publication | element identity, source element type and transition role; no IL kinds |
| Flow-node occurrence publication | unchanged apart from the moved identity reference |
| Engine API starts | one list of `{startEventId, trigger, schedule}` |

Retained evidence (canonical results, CIB evidence) is regenerated once into the new shapes by a reviewed one-off translation script in the session scratchpad ([Rule 3](../CLAUDE.md#rule-3-no-one-off-scripts-or-tests-in-the-repository)).

## Lean assurance lane

Lane shape: checked

Evidence: W0's claim is executable parity of the Lean kernel's runner through the [pipeline](../scripts/test-pipeline.ts) against the frozen baseline. Lean stays the formal semantic authority as the executable specification that every scenario checks the TypeScript kernel and CIB Seven against. Owner direction (2026-11-08) moves the `proved` lanes of the 2026-10-14 set (concurrency, cancellation, Compensation and Transaction, Multi-Instance) to a proof wave after the coverage rows close: each is stated over the feature's `Hooks` laws and recorded until then as a deliberately open lane in the new kernel status map, with coverage closure as its reopen trigger. Rows already `done` (PC-DATA-01/02, PC-HUM-04, PC-SCOPE-04/05) keep their state on the kernel's scenario evidence; their former theorems are listed as open lanes in the same map.

## Temporal hosting and refinement preflight

| Mechanism | Temporal realization | Risk and W0.3 witness |
|---|---|---|
| Start | Workflow start with the start input; scheduled starts by a schedule per timer-start definition | duplicate start after response loss; content-bound start identity |
| Command | Update with occurrence identity | duplicate and stale command; command identity computed generically |
| Delivery | Update routed by address; correlation ingress Workflow for cross-instance routing | ordering against timers; late delivery after scope exit |
| Timer firing | durable timer keyed by subscription identity | cancellation on scope exit; re-arm for cycles |
| Effect result | Activity keyed by effect identity | transport retry versus BPMN retry; late result after cancellation |
| Evaluation result | Activity on the Java evaluation Worker, keyed by request identity | replay determinism of the recorded result |
| Population | correlation and broadcast through the correlation ingress Workflow; version binding at start | zero or ambiguous match; broadcast discovery order; new mechanism, witnessed when its rows land |

One generic scheduler drives all of them from `hostView`. The continuation chain carries the new state codec. Event-History capacity is derived from `hostRequirements`. W0.3 witnesses: chain handoff with the new codec, recomputed capacity bounds, replay determinism, and each of the six input mechanisms once. The workflow patch identifiers and `V1` format suffixes are removed under the pre-release policy. The state relation preserved is the publication: the adapter's projection of kernel state equals the published contract.

## Guardrails against degradation

Every guard is a fast source or graph scan in the fast suite, binary, with no data file that feature work edits; a justification comment is the only allowed exception mark. A new guard is added only for a defect class seen twice or for a structural class. Each line names the cause it prevents.

1. Closed dispatch (cause 1). Only `Kernel.Step`, `Kernel.Publish`, codecs, admission and the source lowering may match on an element, input, trigger or work-kind type, or on the checked-process and stimulus sums. Lean: a post-build environment scan for matchers, `casesOn` and `BEq` uses on guarded types outside owners. TypeScript: lexical scan of `switch`, `===`/`!==` on enumeration literals and `in` narrowing.
2. No catch-all (cause 1). Lean: no `| _ =>` under `Kernel/` without a `wildcard:` comment naming a non-kernel type. TypeScript: every `switch` over a kernel enumeration ends in `assertNever`; no `default:`.
3. No mirror enumerations (cause 1). No second enumeration or classifier of an existing kind anywhere in the repository; no census or allowlist of variants.
4. Layering (causes 1, 3). Import graph follows the module table in Lean and TypeScript; acyclic; zero feature-to-feature imports; no `export *`; adapter, engine API, platform and CIB runner import only the generated contracts and the host interface.
5. Module-system policy (cause 3). `import all` appears only in `Laws.X` for `Feature.X`; no private-equation helpers.
6. Proof placement (causes 2, 3). No `theorem` in executable modules; `decide`, `native_decide`, `cbv` and `rfl` over `Step` appear only in `Proofs` and `Laws`; no `unfold` or `simp` of a feature body outside its `Laws`; no IL or state literal longer than 50 lines in Lean.
7. Profiles as data (cause 7). No profile identifier literal outside the profile catalog, in the kernel or any boundary package.
8. One rule, one place (causes 1, 7). Lean and TypeScript modules pair by name and change in the same commit; no checked-source type in the kernel; no duplicate helper names; no two kernel files above 0.7 normalized-line similarity.
9. Shape (causes 1, 3). No top-level state field and no element kind added without an owner decision; constructors take at most a header and a payload; `Step` stays at or below 600 lines.
10. Size (cause 3). Files: 800 nonblank lines target, 1,200 ceiling; functions: 80 lines.
11. Codec truth (cause 1). Every schema variant has a fixture that round-trips through the Lean and TypeScript codecs and the platform decoder.
12. Admission refusal (cause 7). Every IL field outside the admitted surface has a refusal test with its stable code.
13. Single entry (cause 1). One step function; no program-mode predicate; no second evaluator.
14. Discovery by convention (causes 5, 6). Scenarios, pipeline cases, corpus models and the runner list are discovered from directories; counts are derived, never written.
15. Build budget (cause 3). The fast suite checks a static rebuild-set model: a feature's interface cone is `{Feature, Laws, Registry, Step, Publish, Population, Codec, Run}`. At each track closure the root measures the clean executable build (bound 3 minutes), the worst feature edit (30 seconds), an IL shape edit and the proof build (its own bound), and fails the track if seconds per delivered row extrapolated to all rows exceed the clean-build bound. Bounds change only by owner decision. The figures appear as CI output, never in a document.
16. Behavior oracle. Lean kernel, TypeScript kernel and retained CIB evidence agree on every scenario, population scenario, admission decision and committed publication.

## Review

- This proposal: round 2 with the same reviewers until all approve.
- W0.1 architecture checkpoint: a cold reviewer checks the first kernel commit against the guardrails and the module table before W0.2 builds on it.
- Each mechanism track ends with one combined review of meaning and structure, which is also the closure approval of every row the track closes. Its checklist names the degradation classes of the guardrails. A track whose rows need a new BPMN or CIB interpretation (PC-COMPENSATION-01, PC-TX-01, PC-SCOPE-03, PC-BASIC-04, PC-AUTO-05, PC-AUTO-07) takes one cold review of that interpretation before its code.
- A correction gets at most one audit. The verdict is recorded in the correction commit's message.

## Delivery plan

### W0: the kernel

| Milestone | Content | Exit | Budget | Stop rule |
|---|---|---|---|---|
| W0.1 | module skeleton, guards, vocabulary schema, IL row-traceability table and fixtures, a vertical slice (Start, User Task, Exclusive Gateway, End) through every layer, retargeted `lake.sh` | every row fixture decodes; measurement plan below passes | 1 day | budgets fail: redesign before W0.2 |
| W0.2 | Lean kernel parity, largest profiles first (nested scope data, embedded, repeatable subscriptions: 108 of 184 scenarios) | every scenario, population scenario, admission decision and committed publication equals the baseline or carries a classified mismatch | 2 days | below 50% at the end of day 3: stop and re-plan |
| W0.3a | TypeScript kernel transcribed from the Lean modules | differential agreement on every scenario | 1 day, parallel to W0.2's tail | — |
| W0.3b | contracts re-cut, generic adapter scheduler, engine API, platform types and history view, generated contracts package | hosted CI green, including the W0.3 Temporal witnesses | 2 days | not green at the end of day 6: stop and re-plan |
| W0.4 | delete the old library, core, adapter code, guards and documents; graduate this proposal to the kernel architecture specification | complete hosted verification green; land on `main` | 0.5 day | — |

Measurement plan (W0.1 exit): per-module build times at one and two threads on the vertical slice; edit probes in a scratch clone (a feature body edit, a private helper, a feature interface edit, an IL field, an admission rule) compared with the static rebuild-set model; a fourfold inflation probe that copies the features under renamed namespaces to simulate the full target; TypeScript type-check and test times (bounds 10 s and 60 s).

Parity baseline: the old evaluators' results, captured once by a scratchpad script, translated to the new shapes, stored apart from the neutral scenarios and bound to each scenario's digest; the kernel runner never receives it. Each mismatch is classified against the reviewed interpretation and the retained CIB evidence as a kernel defect (fix), an old-evaluator defect (record the correction), or a lifted refusal (listed as mechanism work); the baseline is never adjusted to match. It is deleted at W0.4.

### Mechanism tracks, then rows

After W0 the mechanism tracks run in parallel, up to three at a time, each by its own HIGH agent on its own feature, admission, laws and TypeScript modules, with the root integrating, building Lean and reviewing. A track ends when its mechanism and its rows' scenarios are green. A row closes when its acceptance holds and every prerequisite row is closed; a rolling closure sweep closes rows in dependency order. Every open or held row appears once:

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

Budgets: W0 six days; M1–M9 five days across three parallel tracks; integration and qualification two days; the proof wave follows acceptance. Each track reports elapsed time against its budget; a track at its budget records its boundary and continues unless the evidence invalidates the path.

### Definition of done for a row

A row is done when its acceptance clause in the [coverage target](PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) holds on the kernel in Lean, TypeScript and the retained CIB evidence, and its track's combined review approved it. A hosted Temporal witness is needed only for a new hosting mechanism. Product 2 disclosure comes from the generated capability catalog. A whole corpus model is needed only where the row's acceptance clause names one; the journey rows carry the business models.

### Verification cadence

Locally: the kernel build of touched modules, the kernel runner, TypeScript type checks and unit tests, and the fast guard suite. No Docker, Temporal server, PostgreSQL, browser, CIB oracle or other long-running lane runs locally. Those run in hosted CI on the pushed branch, once per milestone or track, which is also the landing gate; a hosted failure is reproduced locally only by its narrowest command. CIB evidence for new scenarios is produced in one batched hosted run per track.

### Delegation

HIGH agents author kernel feature modules in Lean and TypeScript on disjoint files; the root alone runs Lean builds and integrates. Agents never run heavy lanes. Workers on scenarios and models stay MEDIUM. Decision extraction from the old capsules is HIGH work and accepted by the root.

## Owner decisions on the path

Dependencies and holds, sent as one packet during W0, each with a recommendation: PC-DATA-07 JUEL evaluator adoption (M2); PC-AUTO-05 Script runtime and PC-AUTO-07 decision engine (M3); PC-TIMER-02 Cron dialect (M6); PC-DELIVERY-01 and PC-QUALIFY-03 qualification holds on the recorded Temporal SDK defects, which block acceptance while SDK work stays prohibited.

## Process and rule reset

Owner direction (2026-11-08) drops the family ceremony and the process that slowed delivery. At W0.4 `CLAUDE.md` is rewritten to keep only:

- the mission;
- the authority model;
- the non-negotiable boundaries, restated for the kernel;
- the semantic invariants;
- forward-compatible restrictions;
- Rule 1 (no routine GitHub-hosted macOS);
- Rule 2, rewritten as: a bulk script declares its scope and is checked by a post-run diff against that scope;
- Rule 3 (no one-off scripts in the repository);
- root-cause-before-fix;
- pre-release evolution;
- the MIT and A12 licence boundary;
- dependency approval and the 14-day rule;
- the Lean wrapper and memory safety;
- the guardrails above;
- the verification cadence;
- the delegation rule above;
- the branch push flow.

Dropped:

- capsule documents and their required items;
- review packets and receipt grammars;
- semantic-checkpoint and warm-review variants;
- correction audits beyond one;
- ledgers and cost rows;
- assurance-trigger tables;
- the written double check on every recommendation;
- `what-binds` and session-start map reading;
- local long-command receipts;
- per-commit resource measurements;
- turning every finding into a rule.

Guards (131 today):

| Disposition | Guards |
|---|---|
| Keep (56) | product, wire and CIB contract guards (32), with path updates; toolchain, infrastructure and safety guards (19); Lean safety (`lean-proof-escapes`, `lean-test-lane-policy`, `lean-full-gate`, `lean-memory-brake`, `lean-ci-pin`) |
| Rewrite for the kernel (12) | the per-variant checked-to-IL bindings become one codec, admission and refusal test; `lean-import-boundaries` becomes guard 4; `lean-source-contracts` becomes guards 1–2; `lean-executable-checks` and `lean-native-driver` target the kernel runner; `a12-preservation`, `pre-release-architecture` and `verification-entrypoint` retarget their roots; `pipeline-budget` keeps one bound; new pairing and build-budget guards |
| Delete (63) | censuses and frozen lists (15); Lean build-shape guards for the old library (13, including fan-out, module cost, fixture owners, `import all` minimization); document-structure and process guards (26, including `what-binds` and the review packet); long-command receipt guards; all their data and helper files |

## Documentation reset

Old documents about the old code or process are deleted; every semantic decision they record is first restated in the new semantics document of the mechanism that owns it, cited by commit permalink, and an extraction check confirms that every relation-register identifier and every capsule interpretation and restriction section maps to a new owner. Deletion happens at W0.4, after extraction; earlier W0 work creates only.

| Disposition | Documents |
|---|---|
| New | `docs/kernel/`: architecture (this proposal graduated, with the guardrails); IL specification; one semantics document per feature, plus publication and observation and population; kernel status map (implemented and absent per row, open proof lanes); engineering rules (review, gates, documentation, code style); `PLAN.md` holding the plan above; rewritten `CLAUDE.md` |
| Reduced to goals, milestones and dependencies | [coverage target](PRACTICAL-CIB7-COVERAGE-TARGET.md): per row only ID, outcome with decisive acceptance, prerequisites and state, plus the target definition and bounded contract decisions; [PROJECT-DESIGN](PROJECT-DESIGN.md), [ARCHITECTURE](ARCHITECTURE.md), [conformance target](BPMN-CONFORMANCE-TARGET.md), [requirement ledger](BPMN-REQUIREMENT-LEDGER.md), [showcase ladder](SHOWCASE-MILESTONE-LADDER-DECISION.md), [CIB compatibility scope](CIB-SEVEN-COMPATIBILITY-SCOPE-PROPOSAL.md) and [CIB observation policy](CIB-OBSERVATION-POLICY.md): goals, authority, scope, milestones and dependencies stay; old-approach prescriptions go |
| Deleted after extraction | `docs/capsules/` (92 documents); IL, runtime-state invariant and Activity occurrence ownership specifications; issuing-discipline, internal-commutation and regional-ownership proposals; Lean build modularity specification; all engine implementation maps and their router; Temporal hosting map and Temporal test evidence map (folded into the kernel status map); capsule cost ledger, `capsule-costs/`, `lean-resource-costs/`, process assessment ledger and `process-assessment/`, assurance improvement register; review policy, testing specification, documentation discipline, code style guide, verification-infrastructure policy and the semantic, Temporal and platform verification policies (folded into the engineering rules); `docs/experiments/`, `docs/archived/`; research on semantic representations; the stopped switch proposal |
| Kept, links repaired | normative and research inputs (`docs/reference/`, other `docs/research/`, [SOURCES](SOURCES.md)); the [relation register](CIB-BPMN-RELATION-REGISTER.md) and adopted decision records; `bpmn-source` admission specifications; Temporal lifecycle and runner specifications and the [Temporal defects ledger](TEMPORAL-DEFECTS-LEDGER.md); Product 2 platform documents; setup and instrumentation guides |

Links into deleted documents from scenarios, profiles, corpus models, contracts and kept documents (about 180 files) are repointed to the new owners in the same commit. A row closed before the reset keeps its receipt as a commit permalink.

## Exclusions

W0 introduces no BPMN meaning or CIB relationship beyond the admitted surface; lifted refusals are listed and owned by their tracks. Production-history compatibility, scale and an A12 product stay outside this target.

## Risks

- W0 is large: about 62,600 lines of evaluator, 47,900 of TypeScript core and 31,800 of adapter code are replaced. Mitigation: parallel HIGH authors, the largest profiles first, stop rules per milestone, and generic designs that are smaller than the code they replace.
- Two systems coexist until W0.4. Mitigation: the old stack is frozen today and deleted at a fixed milestone.
- Proved lanes are deferred to the proof wave. Mitigation: they are recorded as open lanes with a reopen trigger; Lean remains the executable authority on every scenario.
- A parity mismatch may expose an old-evaluator defect. Mitigation: the classification rule above; the baseline is never adjusted.
- New guards could become the next ratchets. Mitigation: binary scans with no data files, bounds changed only by owner decision, and no guard without a repeated or structural class.

## Independent cold-review receipt

| Stage | Target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `not-recorded` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-required` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
