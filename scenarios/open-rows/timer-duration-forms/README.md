# Timer duration forms at an Intermediate Catch

Answer-free schedules for [PC-TIMER-01](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): the duration lexemes an Intermediate Catch Timer can carry beyond the exact `PT[nH][nM][nS]` forms of the [subscriptions semantics](../../../docs/kernel/semantics/SUBSCRIPTIONS-SEMANTICS-SPEC.md) increment, which the retained CIB Seven `2.2.0` answer fixes before the row decides what to admit: zero, fractional, nominal (day, week, month), mixed, above-bound, signed, bare-number and lower-case lexemes. The model is project-authored MIT source for the `cibseven-2.2.0` profile with no source overlay.

## Models

| Model | What it holds |
|---|---|
| [duration-forms.bpmn](duration-forms.bpmn) | A None Start, an Exclusive Gateway that routes on the String Process variable `form`, one Intermediate Timer catch per duration literal (each named after its form), a converging Exclusive Gateway and the Human Task `Proceed`. The literals are `PT30M` (baseline), `PT0S`, `PT0.5S`, `P1D`, `P1W`, `P1M`, `P1DT12H`, `PT87661H`, `-PT5S`, `PT5` and `pt5s`. Every deadline is relative to the start, which no schedule moves from logical time zero. |
| [calendar-steps.bpmn](calendar-steps.bpmn) | A None Start, an Exclusive Gateway on the String Process variable `form` and four routes of Intermediate Timer catches, each ending at its own End Event: `month-from-february` (`PT744H`, then `P1M`), `month-then-day` (`PT696H`, then `P1M1D`), `five-weeks-in-february` (`PT744H`, then `P5W`) and `year` (`P1Y`). The first catch of a two-catch route moves the clock to a known calendar date, so the second deadline depends on the calendar. |
| [sub-millisecond.bpmn](sub-millisecond.bpmn) | A None Start, the Timer catch `Catch_Fine` with the duration `PT0.0001S` and the Human Task `Proceed`. |

## Schedules

| Schedule | Model | Row | Case it exercises |
|---|---|---|---|
| [baseline-early-then-exact](baseline-early-then-exact.scenario.json) | duration-forms | PC-TIMER-01 | `PT30M`: a firing one millisecond before the deadline, then the exact firing, then `Proceed`. |
| [form-zero](form-zero.scenario.json) | duration-forms | PC-TIMER-01 | The literal `PT0S` is armed at the start, fired at its deadline and followed by `Proceed`. |
| [form-fraction](form-fraction.scenario.json) | duration-forms | PC-TIMER-01 | The literal `PT0.5S` is armed at the start, fired at its deadline and followed by `Proceed`. |
| [form-nominal-day](form-nominal-day.scenario.json) | duration-forms | PC-TIMER-01 | The literal `P1D` is armed at the start, fired at its deadline and followed by `Proceed`. |
| [form-nominal-week](form-nominal-week.scenario.json) | duration-forms | PC-TIMER-01 | The literal `P1W` is armed at the start, fired at its deadline and followed by `Proceed`. |
| [form-nominal-month](form-nominal-month.scenario.json) | duration-forms | PC-TIMER-01 | The literal `P1M` is armed at the start, fired at its deadline and followed by `Proceed`. |
| [form-mixed-nominal](form-mixed-nominal.scenario.json) | duration-forms | PC-TIMER-01 | The literal `P1DT12H` is armed at the start, fired at its deadline and followed by `Proceed`. |
| [form-above-bound](form-above-bound.scenario.json) | duration-forms | PC-TIMER-01 | The literal `PT87661H` is armed at the start, fired at its deadline and followed by `Proceed`. |
| [form-negative](form-negative.scenario.json) | duration-forms | PC-TIMER-01 | The literal `-PT5S` is armed at the start; the schedule is the start alone. |
| [form-bare-number](form-bare-number.scenario.json) | duration-forms | PC-TIMER-01 | The literal `PT5` is armed at the start; the schedule is the start alone. |
| [form-lowercase](form-lowercase.scenario.json) | duration-forms | PC-TIMER-01 | The literal `pt5s` is armed at the start; the schedule is the start alone. |
| [form-month-from-february](form-month-from-february.scenario.json) | calendar-steps | PC-TIMER-01 | `PT744H` is fired at 2,678,400,000 (1970-02-01), which arms `P1M`. Separates a calendar month from a fixed 31-day month. No evidence yet. |
| [form-month-then-day](form-month-then-day.scenario.json) | calendar-steps | PC-TIMER-01 | `PT696H` is fired at 2,505,600,000 (1970-01-30), which arms `P1M1D`. Separates adding months before days from adding days before months. No evidence yet. |
| [form-year](form-year.scenario.json) | calendar-steps | PC-TIMER-01 | `P1Y` is armed at the start; the schedule is the start alone. Separates a year taken as a calendar step. No evidence yet. |
| [form-five-weeks-in-february](form-five-weeks-in-february.scenario.json) | calendar-steps | PC-TIMER-01 | `PT744H` is fired at 2,678,400,000 (1970-02-01), which arms `P5W`. Separates ISO weeks of seven days from a week count the engine converts through a millisecond duration; the CIB-DEV-0009 candidate. No evidence yet. |
| [form-sub-millisecond](form-sub-millisecond.scenario.json) | sub-millisecond | PC-TIMER-01 | The literal `PT0.0001S` is armed at the start; the schedule is the start alone. Separates a duration finer than a millisecond from the subset of lexemes the row admits. No evidence yet. |

## Notes for the target runners

- Every schedule starts with `form` naming one catch, so one Timer is armed. The deadline a `timerFire` names is the literal's length in milliseconds from logical time zero, reading a day as 86,400,000 ms and a month as the 31 days after 1970-01-01; a firing that names another deadline than the engine arms is part of the schedule.
- The `form-zero` deadline equals the arming instant, so the Timer is due before any firing; a target runner that treats a job that is already executable as a harness failure cannot answer that schedule.
- A schedule over a lexeme CIB may not accept as a duration carries the `start` alone: a refused arming ends the run at the start.
- The `calendar-steps` routes fire their first catch at the length of its lexeme (`PT744H` is 31 days, `PT696H` is 29 days), so the second Timer is armed on 1970-02-01 or 1970-01-30; the second deadline is what the schedule leaves to the engine.
- `form-sub-millisecond` is the converse of a refused lexeme: the engine may commit what a profile limits to a subset, so the schedule is the start alone.

The schedules carry no expected route, open wait, variable or Process state; the retained CIB evidence is the answer.
