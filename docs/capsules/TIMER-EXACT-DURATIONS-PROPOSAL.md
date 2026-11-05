# Timer exact durations proposal

## Status

Lifecycle: draft
Review: approved

## Question and delivery boundary

Practical CIB7 Coverage batch 5, row `PC-TIMER-01` (its duration clause), first increment. The row stays `open`: absolute dates, nominal durations, intervals, past-deadline outcomes and every Timer site other than the Intermediate Catch Timer remain.

Every admitted Timer site accepts exactly one lexeme today (`PT1S`; `PT5S` at the Multi-Instance outer boundary; `R/PT1S` at the repeatable boundary). The sites differ in hosting: the Intermediate Catch Timer is an ordinary durable Workflow timer that never defers Continue-As-New; the boundary, bounded-scope, monitored, Multi-Instance and Event-Based Gateway race deadlines are managed deadlines that defer Continue-As-New while armed ([`workflow-implementation.ts`](../../packages/temporal-adapter/workflow/src/workflow-implementation.ts), the `managedBoundaryDeadlineArmed` argument of `workflowRolloverPermitted`); the Timer Start is a Temporal Schedule ([`definition-schedule.ts`](../../packages/engine-api/src/definition-schedule.ts)). Longer deadlines change each hosting mechanism differently, so each is its own increment with its own preflight.

The question of this increment: can one shared exact-duration owner per language admit every exact ISO 8601 duration at the Intermediate Catch Timer, in every profile that admits it today except the repeatable-subscription profile, without a kernel representation change, a new module or a guard exception? The deliverable: a model whose Intermediate Catch Timers wait `PT30S`, `PT15M`, `PT2H` or `PT1H30M` is admitted and executed with that deadline, landed on `main`.

## Normative basis and CIB classification

- BPMN 2.0.2 Clause 10.5.5 and Table 10.101: `timeDuration` is an expression whose value conforms to "the ISO-8601 format for time interval representations"; `timeCycle` is an ISO 8601 repeating interval; Table 10.122 is their XML Schema. They fix no calendar, zone, precision or maximum.
- ISO 8601 time intervals take four forms: a duration, start/end, start/duration and duration/end. Exact duration components (hours, minutes, seconds) have a fixed length; nominal ones (years, months, weeks, days) depend on the calendar position and zone.
- CIB Seven `2.2.0` (pinned checkout per [SOURCES.md](../SOURCES.md), `engine/src/main/java/org/cibseven/bpm/engine/impl/calendar/DurationHelper.java`) splits a non-repeating `timeDuration` on `/` and accepts a duration, start/duration, start/end and duration/end; it parses the duration with `DatatypeFactory.newDuration` (special-casing `PnW`) and adds it to a `GregorianCalendar` in the engine's default zone. Hours, minutes and seconds therefore add exact elapsed time; days and weeks add calendar days, which last 23 or 25 hours across a daylight-saving change.

Classification (new register entries, added with the implementation):

- **Agreement, `CIB-AGR` (next number):** at the Intermediate Catch Timer, an exact duration `PT[nH][nM][nS]` with non-negative integer components, at least one present and a total from 1 ms to the profile maximum, waits exactly `3,600,000·H + 60,000·M + 1,000·S` ms in both. It generalizes `CIB-AGR-0004`'s `PT1S`, whose boundary sentence ("Other duration literals … remain unreviewed") stays true for every other site. Fidelity: engine-observed with `PT1H30M` and `PT90M` (one job due at the fixed clock epoch plus 5,400,000 ms, not executable at 5,399,999 ms, executable at 5,400,000 ms) through the controlled-clock harness of [`CibSevenIntermediateCatchTimerTest`](../../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenIntermediateCatchTimerTest.java).
- **Limitation, `CIB-LIM` (next number):** the profile refuses `timeDuration` text CIB accepts when it is zero (`PT0S`; CIB makes it due at once), has a fractional component (`PT1.5S`), uses a nominal component (`P1D`, `P1W`, `P1M`, `P1Y`, `P0DT1S`), is an interval with a start or end (`2026-01-01T00:00:00Z/PT1H`, `start/end`, `PT1H/end`), or exceeds the profile maximum `PT87660H` (315,576,000,000 ms, ten Julian years of exact time). These forms are conforming but deferred: zero waits need an immediate-due hosting rule, fractions a precision rule, nominal components and dated intervals the calendar and zone account that absolute dates also need (`PC-TIMER-01`), and the maximum keeps deadlines far inside the safe wire integer range.

## Required, optional and excluded scope

- **Required:** one exact-duration owner per language; its use for the Intermediate Catch Timer in every profile that admits it today except the repeatable-subscription profile; that site's pins relaxed from `1000` to positive; the Event-Based Gateway race lowering in TypeScript derived from the owner instead of a hard-coded `1000`, so a race arm keeps refusing every lexeme but `PT1S` through its unchanged pins in both languages; one pipeline case, Lean/core integration cases and the time-skipping witness below; two CIB oracle cases; one retained whole model with a business purpose; the register entries above.
- **Optional:** none.
- **Excluded from this increment, each a later increment with its own preflight:** the managed-deadline sites (interrupting, non-interrupting, Sub-Process and Multi-Instance boundaries and the race arm), whose longer armed windows defer Continue-As-New while accepted Updates still grow Event History; the Timer Start, hosted as a Temporal Schedule; the repeatable-subscription profile, whose Intermediate Catch and repeatable cycle are hosted by the subscription readiness scheduler, where Continue-As-New withdraws the native timer and the successor Run re-arms it from the binding's due time, and whose cycle reaches `DurationHelper` through `CycleBusinessCalendar`. **Excluded from the family:** zero, fractional, nominal and interval forms, `timeDate`, finite `Rn/` cycles and the recurrence runtime (`PC-TIMER-02`), data-derived expressions (`PC-TIMER-03`), Cron, and any change to firing, cancellation or race semantics.

## Profile and public contract

No operation, wait or stimulus shape changes. An `awaitTimer` operation keeps `durationMs : Nat`; its admitted values grow from `{1000}` to every value an admitted lexeme yields. The affected profiles grow in place under their cumulative identity ([profile identity](../../contracts/README.md)). The Semantic Process schema replaces `"const": 1000` on the `awaitTimer` duration with `"minimum": 1` (the existing safe-integer bound stays), and the checked-process schema replaces the Intermediate Catch `durationLiteral` `const` with a pattern superset of the grammar; the parsers, not the schemas, own positivity of the lexeme and the maximum. All other Timer `const`s stay. Producers, consumers and fixtures change atomically.

## Representation and runtime ownership

- **Lean:** one private total parser `exactTimerDurationMs?` with the private constant `maxExactTimerDurationMs` inside [`Lowering`](../../BpmnSemantics/SemanticProcess/Lowering.lean), where `normalizeTimerDuration` already lives; `normalizeTimerDuration` becomes `(exactTimerDurationMs? literal).getD 0`. Structural recursion over `String.toList`; components in H, M, S order, each at most once with at least one digit. Checked admission drops the Intermediate Catch literal pin, and program validation's `awaitTimer` pin becomes `0 < durationMs`, so an unadmitted lexeme normalizes to `0` and definition admission refuses it there, as the existing `normalizeTimerDuration` contract already describes for a forgotten lexeme. Every other site's pin stays `1000` or `5000`, including both pins of `RepeatableSubscriptionAdmission`, so the parser broadens nothing else.
- **Why that home, by construction and measured on `7173770c`:** a kernel decision that reduces `normalizeTimerDuration` today must already open `Lowering`'s private scope, so a private parser in the same module needs no new `import all` line, no exposure and no new module; the program pin is a literal comparison that every fixture deciding `programWellFormed` can reduce. Alternatives measured and rejected: a new leaf module imported privately (31 interface importers, but hidden from the fixtures that decide lowering), imported publicly (417 importers against the default bound 100), or `CheckedProcessContract` (its hidden-edit fan-out sits at its bound 43, and `SemanticProcessAdmissionConformance`, which decides an Intermediate Catch lowering, does not open it). Line budget in `Lowering`: at most +20 nonblank lines net for the parser, the constant and a shorter rewritten `normalizeTimerDuration` docstring, whose premise that checked admission already rejected the lexeme no longer holds for the Intermediate Catch; `Lowering` stays below 800. If the measured edit would exceed that, the implementation stops before editing and first lands, as its own refactor commit, an extraction of an unrelated cohesive block of `Lowering` into an existing owner whose fan-out bounds the fan-out model confirms unchanged; never an owner exception.
- **Kernel-decide cost, probed 2026-11-05 on the pinned toolchain:** the structural parser decides 11 admitted and refused lexemes in 78.7 ms tactic and 54.7 ms type-checking time in total.
- **TypeScript:** one owner `packages/semantic-core/src/timer-duration-lexeme.ts` with the same grammar and maximum (`bpmn-source` already depends on `semantic-core`), parsing digit runs without floating-point loss. The literal-typed `normalizeTimerDurationMs` in `timer-duration-normalization.ts` stays for the excluded sites, whose literal types (`BoundaryTimerArm<1000>`, the Multi-Instance and Timer Start lowerings) are unchanged; the Intermediate Catch lowering in `semantic-process-lowering.ts` and the race lowering in `event-based-gateway-lowering.ts` call the owner. The race arm's contract type widens from `1000` to `number`, while its runtime pins in race admission and host admission stay `1000`.

## Admission

An Intermediate Catch Timer is admitted exactly where it is today, with the same structural rules, except that its duration lexeme must parse as an exact duration. Every other lexeme is refused. `bpmn-source` names the lexeme and the refused class (zero, fractional, nominal, interval, date, repetition, above maximum, malformed); Lean refuses the same set without a class.

## Stable rules

- `TED-PARSE-01`: an admitted lexeme has exactly one millisecond value, the same in Lean and TypeScript; every admitted value lies in `1..315,576,000,000`. The mapping is not injective (`PT90M` and `PT1H30M` both give 5,400,000), a deliberate non-law.
- `TED-REFUSE-01`: zero, fractional, nominal, interval, date, repetition, above-maximum and malformed lexemes are refused at definition admission.
- `TED-BOUND-01`: the maximum is the same constant in both parsers, so for every program that definition admission binds to its lowered checked source, an armed deadline stays a safe integer while logical time is below `2^53 − 1 − 315,576,000,000`. Beyond that, Lean `Nat` and the TypeScript arming range check disagree; that disagreement stays a harness failure, never a semantic outcome, as today.
- `TED-ONE-01`: `PT1S` keeps 1000 ms, so every existing expected result is unchanged.
- `TED-DEADLINE-01`: an armed Intermediate Catch Timer's deadline is its arming logical time plus its milliseconds; firing earlier is refused, as for `PT1S` today.
- `TED-SITE-01`: every other Timer site still admits only its current lexeme in both languages, including a race arm and an Intermediate Catch Timer of the repeatable-subscription profile.

## Newly reachable waits and resumption

None: the same Intermediate Catch waits are reached with other deadlines. They are ordinary durable timers that never defer Continue-As-New, so a long wait leaves Workflow-chain rollover unchanged.

## Separating witnesses

- Parser agreement over one shared list, executed in Lean and TypeScript. Admitted: `PT1S`, `PT5S`, `PT01S`, `PT0H1S`, `PT30S`, `PT15M`, `PT2H`, `PT1H30M`, `PT90M`, `PT36H`, `PT87660H`. Refused: `PT0S`, `PT0H0M0S`, `PT1.5S`, `PT1,5S`, `P1D`, `P0DT1S`, `P1W`, `P1M`, `P1Y`, `PT`, `P`, `PTH`, `PT-1S`, `PT+1S`, `PT1S1M`, `PT1H1H`, `pt1s`, ` PT1S`, `PT1S `, `PT87661H`, `PT9007199254740993S`, `PT99999999999999999999H`, `2026-01-01T00:00:00Z`, `2026-01-01T00:00:00Z/PT1H`, `PT1H/2026-01-01T00:00:00Z`, `R/PT1S`, `R3/PT1S`.
- Deadlines in logical time, Lean against the semantic core (integration cases, no host clock): `PT15M` refused at 899,999 ms and fired at 900,000 ms; `PT2H` fires at 7,200,000 ms.
- Hosted: one pipeline case with `PT2S`, which the pipeline's host-clock Temporal target runs within the aggregate pipeline budget; the time-skipping lane runs one `PT15M` Intermediate Catch Timer to completion.
- Sites: a race arm, a boundary Timer and a repeatable-subscription Intermediate Catch with `PT2S` are refused in both languages.
- Oracle: the Intermediate Catch runner cases `PT1H30M` and `PT90M` against CIB Seven, asserted in the runner test against unregistered scenario sources; they retain no evidence file, because a registered scenario must also be a pipeline case.
- Unchanged: every existing Timer scenario keeps its expected result byte for byte.

## Oracles this family changes

The Lean and TypeScript duration owners, the Intermediate Catch pins in checked admission, program validation, operation admission and the profiles, the TypeScript Intermediate Catch and race lowerings and the race contract type, and both schemas at that one site. No existing scenario result changes.

## Rule-to-evidence matrix

| Rule | Evidence |
|---|---|
| `TED-PARSE-01` | Lean executable check and TypeScript test over the shared list, including the range of every admitted value |
| `TED-REFUSE-01` | refused lexemes at definition admission in TypeScript and Lean |
| `TED-BOUND-01` | `PT87660H` admitted, `PT87661H` and the huge-digit lexemes refused in both languages |
| `TED-ONE-01` | every existing scenario and conformance fixture unchanged |
| `TED-DEADLINE-01` | Lean/core deadline cases, the `PT2S` pipeline case, the CIB oracle cases, the hosted time-skipping witness |
| `TED-SITE-01` | race-arm and boundary refusal cases in both languages |

## Lean assurance lane

Lane shape: checked

Evidence: [`exact_lowering_preserves_timer_start`](../../BpmnSemantics/TimerStartConformance.lean#exact_lowering_preserves_timer_start) and the other existing kernel-decided lowering equations keep `TED-ONE-01`; the implementation adds the parser-agreement list as a finite executable check run by [`ConformanceChecksMain`](../../BpmnSemantics/ConformanceChecksMain.lean). No new transition family or proof obligation: deadlines and firing keep their proofs, which are already parametric in `durationMs`.

## Temporal hosting and refinement preflight

No new hosting mechanism. Durable ingress, wait and timer: the generic host path awaits the armed Intermediate Catch's durable Workflow timer inline ([`workflow-host-readiness.ts`](../../packages/temporal-adapter/workflow/src/workflow-host-readiness.ts)), now with a longer duration, and the adapter keeps supplying the semantic deadline, not wall-clock arrival, as the firing time. No rollover check runs until the timer fires; that stays harmless for long waits because host admission admits no concurrent wait beside that timer ([`host-admission.ts`](../../packages/temporal-adapter/protocol/src/host-admission.ts)), so nothing can grow Event History meanwhile. The second hosting path, the subscription readiness scheduler of the repeatable-subscription profile, stays at `PT1S` in this increment. Effect, cancellation, lifecycle and projection: unchanged. The state relation is unchanged, because the wait still carries its logical deadline. Risk: replay of a long timer is unchanged Temporal behavior. Smallest refinement witness: the hosted time-skipping lane with one `PT15M` Intermediate Catch Timer, plus the `PT2S` pipeline case on the host clock. Host admission's race and boundary pins stay.

## Evidence and acceptance

The rule matrix, the Lean and TypeScript gates of the affected packages, `test:pipeline`, the CIB oracle cases and the [CIB gate](../SEMANTIC-VERIFICATION-POLICY.md#current-cib-gate) row for them, the hosted time-skipping witness, one retained whole model (an alarm-debounce Process that waits `PT2S` before an operator acknowledges the alarm in a User Task; it is the `PT2S` pipeline case, because every retained model binds to a pipeline case and the pipeline's Temporal target runs on the host clock), the register entries, and the cold closure review.

## Versioning consequences

Pre-release, one current representation: the [semantic process](../../contracts/README.md) and checked-process schemas, fixtures and profiles change atomically. Models admitted before keep the same programs and results. Dates, nominal durations, intervals, finite cycles and expressions will need a Timer value that is not one exact millisecond count; `durationMs` stays the meaning of an exact duration, so models admitted now keep their meaning when that value is added.

### Owners this implementation grows

Sites, from `grep` of the lexeme, the constant and the literal types on 2026-11-05; the implementation re-derives them with `node scripts/what-binds.ts` before the first edit:

- **Lean:** [`Lowering`](../../BpmnSemantics/SemanticProcess/Lowering.lean) (gains the parser), [`CheckedProcessAdmission`](../../BpmnSemantics/SemanticProcess/CheckedProcessAdmission.lean), [`ProgramStructuralValidation`](../../BpmnSemantics/SemanticProcess/ProgramStructuralValidation.lean), and a check driver for the parser list.
- **TypeScript semantic core:** the new `timer-duration-lexeme.ts`, `checked-process-contract.ts`, `semantic-process-contract.ts` (the Intermediate Catch and race arm duration types), `semantic-process-operation-admission.ts`, the profile checks in `semantic-process-profile.ts` that name the Intermediate Catch.
- **TypeScript source:** `timer-duration-normalization.ts`, `checked-element-projection.ts`, `semantic-process-lowering.ts`, `event-based-gateway-lowering.ts`.
- **Contracts:** `checked-process.schema.json`, `semantic-process.schema.json`.
- **Generic consumers that must keep holding:** `scripts/start-operation-artifact-consistency.ts` and `scripts/contract-definition-artifacts.test.ts` (their Timer Start and race expectations stay true), the engine-api and platform schedule decoders, and the web schedule panel, all untouched by this increment.

Guards, with bounds unchanged and measured before the first edit: [`lean-fanout`](../../scripts/lean-fanout.test.ts) (no new module, no new `import all`, no interface change), [`lean-module-cost`](../../scripts/lean-module-cost.test.ts), [`source-hygiene`](../../scripts/source-hygiene.test.ts), every guard `what-binds` reports for the targets, and the executable oracles named in the rule matrix.

**Cost.** One commit under a [Rule 2](../../CLAUDE.md#rule-2-declare-review-and-check-every-bulk-change) declaration if it exceeds 20 files: about 15 source files plus about 15 test, scenario, pipeline, oracle, profile, register and corpus files; Lean about +60/−15, TypeScript and JSON about +250/−40 lines including tests. Lean rebuild: hidden edits only, a union of about 230 modules across `Lowering`, `ProgramStructuralValidation` and `CheckedProcessAdmission`. Estimated 4 hours.

Registration: the register entries, profile artifacts, scenarios, pipeline and integration cases, oracle cases, the corpus model, and the [requirement ledger](../BPMN-REQUIREMENT-LEDGER.md) cell for Timer durations.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `7173770c` | `fork-turns-none` | `approve-with-required-edits` | `47c2ce30, 72394378` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-required` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
