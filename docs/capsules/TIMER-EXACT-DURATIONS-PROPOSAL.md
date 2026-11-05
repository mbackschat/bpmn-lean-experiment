# Timer exact durations proposal

## Status

Lifecycle: draft
Review: pending

## Question and delivery boundary

Practical CIB7 Coverage batch 5. Rows: `PC-TIMER-01` (primary; its duration clause for exact durations), `PC-TIMER-02` (the duration-parsing clause of an unbounded cycle only). Both rows stay `open`: `PC-TIMER-01` keeps absolute dates, nominal durations and past-deadline outcomes, and `PC-TIMER-02` keeps finite repetition, dated intervals, Cron and the recurrence runtime.

Every admitted Timer site accepts exactly one lexeme today. The Intermediate Catch, Timer Start, interrupting and non-interrupting Activity boundary and Sub-Process boundary Timers accept `PT1S`; the bounded and monitored scopes of the Multi-Instance profiles accept `PT5S`; the repeatable non-interrupting boundary accepts `R/PT1S`. The question is whether one shared duration owner can admit every exact ISO 8601 duration at all of these sites without a kernel representation change. The deliverable: a model whose Timers wait `PT30S`, `PT15M`, `PT2H` or `PT1H30M` is admitted and executed with that deadline, wherever `PT1S` or `PT5S` is admitted today, and landed on `main`.

## Normative basis and CIB classification

- BPMN 2.0.2 Clause 10.5.5 and Table 10.101 define `timeDuration` as an expression whose value conforms to the ISO 8601 duration format, and `timeCycle` as an ISO 8601 repeating interval; Table 10.122 is their XML Schema. They do not fix a calendar, zone or precision.
- ISO 8601 distinguishes exact duration components (hours, minutes, seconds), whose length is fixed, from nominal ones (years, months, weeks, days), whose length depends on the calendar position and zone.
- CIB Seven `2.2.0` (pinned checkout per [SOURCES.md](../SOURCES.md), `engine/src/main/java/org/cibseven/bpm/engine/impl/calendar/DurationHelper.java`) parses `timeDuration` with `DatatypeFactory.newDuration` (special-casing `PnW`) and adds it to a `GregorianCalendar` in the engine's default zone. Hours, minutes and seconds therefore add exact elapsed time, while days and weeks add calendar days, which last 23 or 25 hours across a daylight-saving change.

Classification (new register entries, added with the implementation):

- **Agreement, `CIB-AGR` (next number):** an exact duration `PT[nH][nM][nS]` with non-negative integer components, at least one present and a positive total, waits exactly `3,600,000·H + 60,000·M + 1,000·S` ms in both. It generalizes `CIB-AGR-0004`'s `PT1S` without reinterpreting it.
- **Limitation, `CIB-LIM` (next number):** the profile refuses a duration CIB accepts when it is zero (`PT0S`; CIB makes it due at once), has a fractional component (`PT1.5S`), or uses a nominal component (`P1D`, `P1W`, `P1M`, `P1Y`). These forms are conforming but deferred: zero waits need an explicit immediate-due hosting rule, fractions a precision rule, and nominal components the calendar and zone account that absolute dates also need (`PC-TIMER-01`).

## Required, optional and excluded scope

- **Required:** one exact-duration lexeme owner in each language that maps an admitted lexeme to positive milliseconds and refuses everything else; its use at every site that admits `PT1S`, `PT5S` or `R/PT1S` today; validation, profile, host-admission and wire-schema pins relaxed from one constant to "positive, within the wire's safe integer bound"; one retained whole model with a business purpose; the register entries above.
- **Optional:** none.
- **Excluded:** zero, fractional and nominal durations; `timeDate`; finite `Rn/` and dated-interval cycles and the recurrence runtime (`PC-TIMER-02`); data-derived expressions (`PC-TIMER-03`, which needs evaluation at arming and therefore a runtime-carried duration, a different mechanism); Cron; any change to firing, cancellation, race or recurrence semantics.

## Profile and public contract

No operation, wait or stimulus shape changes. A Timer operation keeps its `durationMs : Nat`; only the set of admitted values grows from `{1000}` or `{5000}` to every positive safe integer that an admitted lexeme yields. Each affected profile grows in place under its cumulative identity ([profile identity](../../contracts/README.md)). The Semantic Process schema replaces `"const": 1000` and `"const": 5000` on `durationMs` with a positive safe-integer bound, atomically with every producer, consumer and fixture.

## Representation and runtime ownership

- **TypeScript:** `packages/bpmn-source/src/timer-duration-normalization.ts` stays the one owner. Its exhaustive table becomes a parser of the exact grammar `PT(\d+H)?(\d+M)?(\d+S)?` (at least one component, positive total, safe-integer milliseconds) returning milliseconds or a refusal; the cycle form is `R/` followed by an admitted duration.
- **Lean:** `normalizeTimerDuration` in `SemanticProcess/Lowering.lean` becomes a call to one total parser `exactTimerDurationMs? : String → Option Nat` placed in `SemanticProcess/CheckedProcessAdmission.lean` (546 nonblank lines), which admission uses to refuse and lowering uses to normalize. `0` stays the unreachable default that the validation pins refuse.
- **Pins:** the exact-millisecond checks in `ProgramStructuralValidation`, `ProfileShapeCatalog`, `ParallelMultiInstanceProfileAdmission`, `RepeatableSubscriptionAdmission`, `TimerStart`, `TimerStartAdmission` and their TypeScript twins (operation admission, profile, repeatable subscription, bounded wait, Temporal host admission) become `durationMs > 0`; the wire decoder already bounds every `Nat` to a safe integer.

## Admission

A Timer is admitted exactly where it is today, with the same structural rules, except that its duration lexeme must parse as an exact duration (or `R/` plus one, where the repeatable boundary admits a cycle). Every other lexeme is refused with a diagnostic that names the lexeme and the refused class (zero, fractional, nominal, date, malformed), never silently normalized.

## Stable rules

- `TED-PARSE-01`: an admitted lexeme has exactly one millisecond value, the same in Lean and TypeScript.
- `TED-REFUSE-01`: zero, fractional, nominal, date, finite-repetition and malformed lexemes are refused at admission at every site.
- `TED-ONE-01`: `PT1S`, `PT5S` and `R/PT1S` keep 1000, 5000 and 1000 ms, so every existing expected result is unchanged.
- `TED-DEADLINE-01`: an armed Timer's deadline is its arming logical time plus its milliseconds; firing earlier is refused, as for `PT1S` today.

## Newly reachable waits and resumption

None: the same Timer waits are reached with other deadlines. Long deadlines (hours) stay logical; Temporal holds them as durable timers already used for `PT1S`.

## Separating witnesses

- Parser agreement: a fixed list of admitted lexemes (`PT1S`, `PT5S`, `PT30S`, `PT15M`, `PT2H`, `PT1H30M`, `PT90M`, `PT36H`) with their milliseconds, and refused lexemes (`PT0S`, `PT1.5S`, `P1D`, `P1W`, `P1M`, `PT`, `P`, `PT-1S`, `2026-01-01T00:00:00Z`, `R3/PT1S`), executed in Lean and TypeScript.
- Deadline: an Intermediate Catch Timer of `PT15M` refuses firing at 899,999 ms and fires at 900,000 ms; the same lexeme at a boundary interrupts at its deadline.
- Unchanged: every existing Timer scenario keeps its expected result byte for byte.

## Oracles this family changes

The Lean and TypeScript duration owners, the pins listed above and the Semantic Process schema. No scenario result changes; new scenarios are added for the new deadlines.

## Rule-to-evidence matrix

| Rule | Evidence |
|---|---|
| `TED-PARSE-01` | Lean executable checks and TypeScript tests over the same lexeme list; pipeline Lean/TypeScript agreement on the new scenarios |
| `TED-REFUSE-01` | admission tests per site family in TypeScript; Lean admission checks |
| `TED-ONE-01` | every existing scenario and conformance fixture unchanged |
| `TED-DEADLINE-01` | new deadline scenarios (early refusal, exact firing) in the pipeline; hosted time-skipping witness |

## Lean assurance lane

Checked: the parser and its agreement are finite executable checks, and `TED-ONE-01` is a kernel-decided equation for the three existing lexemes. No new transition family or proof obligation: deadlines and firing keep their proofs, which are already parametric in `durationMs`.

## Temporal hosting and refinement preflight

No new hosting mechanism. Durable ingress, wait and timer: the existing durable Timer per armed occurrence, now with a longer duration; the adapter keeps supplying the semantic deadline, not wall-clock arrival, as the firing time. Effect, cancellation and lifecycle: unchanged. Projection: unchanged. The state relation is unchanged, because a Timer wait still carries its logical deadline. Risks: a deadline beyond the host's maximum timer (refused at host admission only if it exceeds the safe-integer bound already enforced); replay of long timers is unchanged Temporal behavior. Smallest refinement witness: the hosted time-skipping lane runs one `PT15M` Intermediate Catch Timer to completion. The host-admission pin moves from `=== 1_000` to positive.

## Evidence and acceptance

The rule matrix, the Lean and TypeScript gates of the affected packages, `test:pipeline`, the hosted time-skipping witness, one retained whole model (a reminder Process that waits `PT2H` before escalating a User Task), the register entries, and the cold closure review. Structural guards are pre-measured: no new Lean module (importer counts unchanged); body edits only in the named owners, with `CheckedProcessAdmission` growing by about 45 lines to about 590 and `Lowering` shrinking; kernel-decided fixtures that evaluate `normalizeTimerDuration` rebuild once.

## Versioning consequences

Pre-release, one current representation: the [semantic process](../../contracts/README.md) schema, fixtures and profiles change atomically. Models admitted before keep the same programs and results.

### Owners this implementation grows

Duration owners: [`timer-duration-normalization.ts`](../../packages/bpmn-source/src/timer-duration-normalization.ts) (33 nonblank lines) and [`CheckedProcessAdmission`](../../BpmnSemantics/SemanticProcess/CheckedProcessAdmission.lean) (546), which gains the Lean parser; [`Lowering`](../../BpmnSemantics/SemanticProcess/Lowering.lean) (774) only delegates. Pin owners, each a body edit: [`ProgramStructuralValidation`](../../BpmnSemantics/SemanticProcess/ProgramStructuralValidation.lean) (592), [`ProfileShapeCatalog`](../../BpmnSemantics/SemanticProcess/ProfileShapeCatalog.lean) (713), `ParallelMultiInstanceProfileAdmission`, `RepeatableSubscriptionAdmission`, `TimerStart`, `TimerStartAdmission`, and in TypeScript [`semantic-process-operation-admission.ts`](../../packages/semantic-core/src/semantic-process-operation-admission.ts), `semantic-process-profile.ts`, `repeatable-subscription-admission.ts`, `bounded-wait-admission.ts` and [`host-admission.ts`](../../packages/temporal-adapter/protocol/src/host-admission.ts). Nonblank counts measured 2026-11-05; no owner crosses 800.

Guards the implementation must satisfy, with bounds unchanged and measured before the first edit: [`lean-fanout`](../../scripts/lean-fanout.test.ts) (no new module, so importer counts stay; the body edits must add no rewrite with a hidden definition), [`lean-module-cost`](../../scripts/lean-module-cost.test.ts) (kernel-decided fixtures that evaluate `normalizeTimerDuration` are re-measured), [`source-hygiene`](../../scripts/source-hygiene.test.ts), and the executable oracles named in the rule matrix: the Lean conformance checks, `test:bpmn-source`, `test:semantic-core`, `test:contracts`, `test:pipeline` and `test:timer-time-skipping`.

**Cost.** One commit under a [Rule 2](../../CLAUDE.md#rule-2-declare-review-and-check-every-bulk-change) declaration, because the pins span more than 20 files: about 25 files, Lean +150/−40 and TypeScript +250/−60 lines including tests, scenarios and the model; estimated 5 to 6 hours, dominated by one rebuild of the fixtures that kernel-decide durations and the closure lanes.

Registration: the register entries, profile artifacts, scenarios, pipeline cases, the corpus model, and the [requirement ledger](../BPMN-REQUIREMENT-LEDGER.md) cell for Timer durations.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `not-recorded` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-required` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
