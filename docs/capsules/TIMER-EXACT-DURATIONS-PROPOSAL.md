# Timer exact durations proposal

## Status

Lifecycle: draft
Review: pending

## Question and delivery boundary

Practical CIB7 Coverage batch 5. Rows: `PC-TIMER-01` (primary; its duration clause for exact durations), `PC-TIMER-02` (the duration-parsing clause of an unbounded cycle only). Both rows stay `open`: `PC-TIMER-01` keeps absolute dates, nominal durations and past-deadline outcomes, and `PC-TIMER-02` keeps finite repetition, dated intervals, Cron and the recurrence runtime.

Every admitted Timer site accepts exactly one lexeme today. The Intermediate Catch, Event-Based Gateway race, Timer Start, interrupting and non-interrupting Activity boundary and Sub-Process boundary Timers accept `PT1S`; the bounded and monitored scopes of the Multi-Instance profiles accept `PT5S`; the repeatable non-interrupting boundary accepts `R/PT1S`. The question is whether one shared duration owner can admit every exact ISO 8601 duration at all of these sites without a kernel representation change. The deliverable: a model whose Timers wait `PT30S`, `PT15M`, `PT2H` or `PT1H30M` is admitted and executed with that deadline, wherever `PT1S` or `PT5S` is admitted today, and landed on `main`.

## Normative basis and CIB classification

- BPMN 2.0.2 Clause 10.5.5 and Table 10.101 define `timeDuration` as an expression whose value conforms to the ISO 8601 duration format, and `timeCycle` as an ISO 8601 repeating interval; Table 10.122 is their XML Schema. They do not fix a calendar, zone, precision or maximum.
- ISO 8601 distinguishes exact duration components (hours, minutes, seconds), whose length is fixed, from nominal ones (years, months, weeks, days), whose length depends on the calendar position and zone.
- CIB Seven `2.2.0` (pinned checkout per [SOURCES.md](../SOURCES.md), `engine/src/main/java/org/cibseven/bpm/engine/impl/calendar/DurationHelper.java`) parses `timeDuration` with `DatatypeFactory.newDuration` (special-casing `PnW`) and adds it to a `GregorianCalendar` in the engine's default zone. Hours, minutes and seconds therefore add exact elapsed time, while days and weeks add calendar days, which last 23 or 25 hours across a daylight-saving change. Every Timer site reaches the same helper through the duration business calendar, so the site does not change the arithmetic.

Classification (new register entries, added with the implementation):

- **Agreement, `CIB-AGR` (next number):** an exact duration `PT[nH][nM][nS]` with non-negative integer components, at least one present and a total of at least 1 ms and at most the profile maximum, waits exactly `3,600,000·H + 60,000·M + 1,000·S` ms in both. It generalizes `CIB-AGR-0004`'s `PT1S` without reinterpreting it. Fidelity: engine-observed for the Intermediate Catch Timer with `PT1H30M` and `PT90M` (one job due at the fixed clock epoch plus 5,400,000 ms, not executable at 5,399,999 ms, executable at 5,400,000 ms), using the controlled-clock harness of [`CibSevenIntermediateCatchTimerTest`](../../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenIntermediateCatchTimerTest.java); source-derived from the shared helper above for the other sites.
- **Limitation, `CIB-LIM` (next number):** the profile refuses a duration CIB accepts when it is zero (`PT0S`; CIB makes it due at once), has a fractional component (`PT1.5S`), uses a nominal component (`P1D`, `P1W`, `P1M`, `P1Y`, `P0DT1S`), or exceeds the profile maximum `PT87660H` (315,576,000,000 ms, ten Julian years of exact time). These forms are conforming but deferred: zero waits need an explicit immediate-due hosting rule, fractions a precision rule, nominal components the calendar and zone account that absolute dates also need (`PC-TIMER-01`), and the maximum keeps every deadline a safe wire integer without an arming-time check.

## Required, optional and excluded scope

- **Required:** one exact-duration lexeme owner in each language that maps an admitted lexeme to positive milliseconds within the maximum and refuses everything else; its use at every site that admits `PT1S`, `PT5S` or `R/PT1S` today; validation, profile, decoder, host-admission, scheduler and wire-schema pins relaxed from one constant to "positive and at most the maximum"; Intermediate Catch oracle cases for `PT1H30M` and `PT90M`; one retained whole model with a business purpose; the register entries above.
- **Optional:** none.
- **Excluded:** zero, fractional and nominal durations; `timeDate`; finite `Rn/` and dated-interval cycles and the recurrence runtime (`PC-TIMER-02`); data-derived expressions (`PC-TIMER-03`, which needs evaluation at arming and therefore a runtime-carried duration, a different mechanism); Cron; any change to firing, cancellation, race or recurrence semantics.

## Profile and public contract

No operation, wait or stimulus shape changes. A Timer operation keeps its `durationMs : Nat`; only the set of admitted values grows from `{1000}` or `{5000}` to every value in `1..315,576,000,000` that an admitted lexeme yields. Each affected profile grows in place under its cumulative identity ([profile identity](../../contracts/README.md)). The Semantic Process schema replaces `"const": 1000` and `"const": 5000` on `durationMs` with `"minimum": 1, "maximum": 315576000000`, and the checked-process schema replaces the `durationLiteral`/`cycleLiteral` `const`s with the exact-duration pattern, atomically with every producer, consumer and fixture. The TypeScript literal types (`durationMs: 1000`, `BoundaryTimerArm<1000>`, `durationLiteral: "PT1S"`) become `number` and `string`.

## Representation and runtime ownership

- **Lean:** one hidden total parser `exactTimerDurationMs? : String → Option Nat` and the constant `maxExactTimerDurationMs` in the kernel module [`CheckedProcessContract`](../../BpmnSemantics/CheckedProcessContract.lean), next to the `durationLiteral` fields whose meaning it fixes. Structural recursion over `String.toList`; components in H, M, S order, each at most once, at least one digit each. `normalizeTimerDuration` (Lowering) and the Timer Start normalization (TimerStartLowering) become `(exactTimerDurationMs? literal).getD 0`; the cycle form strips `R/` and parses the rest; checked admission, repeatable-subscription admission, parallel Multi-Instance profile admission and the checked-process JSON decoder test `isSome`. `0` stays the unreachable default that the validation pins refuse.
- **Why that home, measured 2026-11-05 on `29447750`:** the seven lexeme consumers share no lower module but `CheckedProcessContract`. A new leaf module imported privately has 31 interface importers (default bound 100), but its body stays hidden from the conformance fixtures that kernel-decide `lowerCheckedProcess … = expectedProgram` (for example [`TimerStartConformance`](../../BpmnSemantics/TimerStartConformance.lean)), so they would need an `import all` of the leaf, a recorded hidden-edit bound or an exposure allowance, which are guard exceptions. Imported publicly it has 417 importers and violates the default bound. `CheckedProcessContract` is a declared kernel module, so the added declaration is a one-time interface rebuild, not a ratchet violation; later parser body edits stay within its recorded hidden-edit bound 43 and body-edit bound 53; the timer fixtures that decide lowering already open it with `import all`; it grows from 377 to about 405 nonblank lines.
- **Kernel-decide cost, probed 2026-11-05:** the structural parser decides `PT1S`, `PT5S`, `PT1H30M`, `PT87660H`, `PT87661H` and six refused lexemes with `decide` in 78.7 ms tactic and 54.7 ms type-checking time in total, so the existing kernel-decided lowering fixtures do not grow measurably.
- **TypeScript:** the owner moves to `packages/semantic-core/src/timer-duration-lexeme.ts` (exported; `bpmn-source` already depends on `semantic-core`), with the same grammar and maximum; `timer-duration-normalization.ts` in `bpmn-source` delegates to it, and the Event-Based Gateway lowering stops hard-coding `durationMs: 1000`.

## Admission

A Timer is admitted exactly where it is today, with the same structural rules, except that its duration lexeme must parse as an exact duration (or `R/` plus one, where the repeatable boundary admits a cycle). Every other lexeme is refused. `bpmn-source` names the lexeme and the refused class (zero, fractional, nominal, date, repetition, above maximum, malformed) in its diagnostic; Lean checked admission refuses the same set without a class, as it refuses any other unadmitted source today.

## Stable rules

- `TED-PARSE-01`: an admitted lexeme has exactly one millisecond value, the same in Lean and TypeScript.
- `TED-REFUSE-01`: zero, fractional, nominal, date, finite-repetition, above-maximum and malformed lexemes are refused at admission at every site.
- `TED-BOUND-01`: the maximum is `315,576,000,000` ms in both languages and both schemas, so with logical time a safe integer below `2^53 − 1 − 315,576,000,000` every armed deadline is a safe integer; beyond that the existing arming range check stays a harness failure, never a semantic outcome.
- `TED-ONE-01`: `PT1S`, `PT5S` and `R/PT1S` keep 1000, 5000 and 1000 ms, so every existing expected result is unchanged.
- `TED-DEADLINE-01`: an armed Timer's deadline is its arming logical time plus its milliseconds; firing earlier is refused, as for `PT1S` today, and a repeatable cycle re-arms with the same milliseconds.

## Newly reachable waits and resumption

None: the same Timer waits are reached with other deadlines. Long deadlines (hours) stay logical; Temporal holds them as the durable timers already used for `PT1S`.

## Separating witnesses

- Parser agreement, executed in Lean and TypeScript over one shared list. Admitted: `PT1S`, `PT5S`, `PT01S` (1000), `PT0H1S` (1000), `PT30S`, `PT15M`, `PT2H`, `PT1H30M`, `PT90M`, `PT36H`, `PT87660H`. Refused: `PT0S`, `PT0H0M0S`, `PT1.5S`, `PT1,5S`, `P1D`, `P0DT1S`, `P1W`, `P1M`, `P1Y`, `PT`, `P`, `PTH`, `PT-1S`, `PT+1S`, `PT1S1M`, `PT1H1H`, `pt1s`, ` PT1S`, `PT1S `, `PT87661H`, `2026-01-01T00:00:00Z`, `R3/PT1S`, `R/PT0S`, `R/P1D`.
- Per site family, one admitted non-unit lexeme with early refusal and exact firing through the pipeline: Intermediate Catch `PT15M` (refused at 899,999 ms, fires at 900,000 ms), Event-Based Gateway race `PT2H` against its Message, Timer Start `PT30S`, interrupting Activity boundary `PT15M`, Sub-Process boundary `PT15M`, monitored non-interrupting boundary `PT15M`, sequential and parallel Multi-Instance outer boundary `PT2H`, and the repeatable cycle `R/PT15M` firing at 900,000 and again at 1,800,000 ms.
- Per site family, one refused lexeme (`PT0S`, `P1D` or `PT87661H`) at admission in TypeScript and Lean.
- Unchanged: every existing Timer scenario keeps its expected result byte for byte.
- Oracle: the Intermediate Catch Timer runner cases `PT1H30M` and `PT90M` against CIB Seven.

## Oracles this family changes

The Lean and TypeScript duration owners, the pins listed below, the Temporal schedulers' admitted remaining duration (from one constant to the committed deadline minus the committed logical time, positive and at most the maximum), and both schemas. No existing scenario result changes; new scenarios are added for the new deadlines.

## Rule-to-evidence matrix

| Rule | Evidence |
|---|---|
| `TED-PARSE-01` | Lean executable checks and TypeScript tests over the shared lexeme list; pipeline Lean/TypeScript agreement on the new scenarios |
| `TED-REFUSE-01` | refused-lexeme admission tests per site family in TypeScript and Lean |
| `TED-BOUND-01` | `PT87660H` admitted and `PT87661H` refused in both languages; schema validation of both bounds |
| `TED-ONE-01` | every existing scenario and conformance fixture unchanged |
| `TED-DEADLINE-01` | per-site deadline scenarios (early refusal, exact firing, second cycle firing) in the pipeline; CIB oracle cases; hosted time-skipping witness |

## Lean assurance lane

Lane shape: checked

Evidence: [`exact_lowering_preserves_timer_start`](../../BpmnSemantics/TimerStartConformance.lean#exact_lowering_preserves_timer_start) and the other existing kernel-decided lowering equations keep `TED-ONE-01` for the three existing lexemes; the implementation adds the parser-agreement list as a finite executable check run by [`ConformanceChecksMain`](../../BpmnSemantics/ConformanceChecksMain.lean). No new transition family or proof obligation: deadlines and firing keep their proofs, which are already parametric in `durationMs`.

## Temporal hosting and refinement preflight

No new hosting mechanism. Durable ingress, wait and timer: the existing durable Timer per armed occurrence, now with a longer duration; the adapter keeps supplying the semantic deadline, not wall-clock arrival, as the firing time. Effect, cancellation and lifecycle: unchanged. Projection: unchanged. The state relation is unchanged, because a Timer wait still carries its logical deadline. Risks: the bounded-deadline and event-race schedulers check one exact remaining duration today; they check instead that the remaining duration is positive and at most the maximum, so a resumed Workflow with a partly elapsed deadline stays admitted. Replay of long timers is unchanged Temporal behavior. Smallest refinement witness: the hosted time-skipping lane runs one `PT15M` Intermediate Catch Timer to completion.

## Evidence and acceptance

The rule matrix, the Lean and TypeScript gates of the affected packages, `test:pipeline`, the CIB oracle cases and the [CIB gate](../SEMANTIC-VERIFICATION-POLICY.md#current-cib-gate) row for them, the hosted time-skipping witness, one retained whole model (a reminder Process that waits `PT2H` before escalating a User Task), the register entries, and the cold closure review.

## Versioning consequences

Pre-release, one current representation: the [semantic process](../../contracts/README.md) and checked-process schemas, fixtures and profiles change atomically. Models admitted before keep the same programs and results.

### Owners this implementation grows

Sites, complete per `grep` of the lexemes, the constants and the literal types on 2026-11-05 and checked with `node scripts/what-binds.ts`:

- **Lean (12):** [`CheckedProcessContract`](../../BpmnSemantics/CheckedProcessContract.lean) (377 nonblank lines; gains the parser), [`Lowering`](../../BpmnSemantics/SemanticProcess/Lowering.lean), `TimerStartLowering`, [`CheckedProcessAdmission`](../../BpmnSemantics/SemanticProcess/CheckedProcessAdmission.lean), `RepeatableSubscriptionAdmission`, `ParallelMultiInstanceProfileAdmission`, [`ProgramStructuralValidation`](../../BpmnSemantics/SemanticProcess/ProgramStructuralValidation.lean), [`ProfileShapeCatalog`](../../BpmnSemantics/SemanticProcess/ProfileShapeCatalog.lean), `TimerStart`, `TimerStartAdmission`, and the decoders `SemanticProcessJson/CheckedProcess` and `SemanticProcessJson/Program`.
- **TypeScript semantic core (12):** the new `timer-duration-lexeme.ts`, `checked-process-contract.ts`, `semantic-process-contract.ts`, `semantic-process-profile.ts`, `semantic-process-operation-admission.ts`, `repeatable-subscription-admission.ts`, `bounded-wait-admission.ts`, `event-race-admission.ts`, `semantic-process-timer-start.ts`, `sequential-multi-instance-admission.ts`, `parallel-multi-instance-admission.ts`, `semantic-process-recurring-boundary-timer-runtime.ts`.
- **TypeScript source (8):** `timer-duration-normalization.ts`, `timer-boundary-event-source.ts`, `timer-start-event-source.ts`, `checked-element-projection.ts`, `sequential-multi-instance-source.ts`, `parallel-multi-instance-source-reader.ts`, `event-based-gateway-lowering.ts`, `semantic-process-lowering.ts`.
- **Temporal (3):** [`host-admission.ts`](../../packages/temporal-adapter/protocol/src/host-admission.ts), `bounded-deadline-scheduler.ts`, `event-race-readiness-scheduler.ts`.
- **Contracts (4):** `checked-process.schema.json`, `semantic-process.schema.json`, and the type tests `boundary-timer-deadline.type-test.ts` and `timer-start-event.type-test.ts`.

Guards, with bounds unchanged and measured before the first edit: [`lean-fanout`](../../scripts/lean-fanout.test.ts) (no new module; the kernel module's interface edit changes no importer count; body edits add no rewrite with a hidden definition), [`lean-module-cost`](../../scripts/lean-module-cost.test.ts), [`source-hygiene`](../../scripts/source-hygiene.test.ts) (no owner crosses 800 nonblank lines), and the executable oracles named in the rule matrix: the Lean conformance checks, `test:bpmn-source`, `test:semantic-core`, `test:contracts`, `test:pipeline`, the CIB oracle and `test:timer-time-skipping`.

**Cost.** One commit under a [Rule 2](../../CLAUDE.md#rule-2-declare-review-and-check-every-bulk-change) declaration: 39 source files above plus about 25 test, scenario, pipeline, oracle, profile, register and corpus files; Lean about +110/−45 and TypeScript and JSON about +450/−120 lines including tests. Lean rebuild: one rebuild of `CheckedProcessContract`'s interface cone (about 1,025 modules) for the added declaration, which the family-closure full-library run reuses; the hidden-edit union of the other eleven Lean owners is 270 modules. Estimated 7 hours: 3 for the edits and tests, 1.5 for the focused rebuilds, 1.5 for the closure lanes and 1 for the oracle cases, scenarios and the model.

Registration: the register entries, profile artifacts, scenarios, pipeline cases, oracle cases, the corpus model, and the [requirement ledger](../BPMN-REQUIREMENT-LEDGER.md) cell for Timer durations.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `not-recorded` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-required` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
