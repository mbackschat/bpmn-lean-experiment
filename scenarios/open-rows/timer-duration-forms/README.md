# Timer duration forms at an Intermediate Catch

Answer-free schedules for [PC-TIMER-01](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): the duration lexemes an Intermediate Catch Timer can carry beyond the exact `PT[nH][nM][nS]` forms of the [subscriptions semantics](../../../docs/kernel/semantics/SUBSCRIPTIONS-SEMANTICS-SPEC.md) increment, which the retained CIB Seven `2.2.0` answer fixes before the row decides what to admit: zero, fractional, nominal (day, week, month), mixed, above-bound, signed, bare-number and lower-case lexemes. The model is project-authored MIT source for the `cibseven-2.2.0` profile with no source overlay.

## Models

| Model | What it holds |
|---|---|
| [duration-forms.bpmn](duration-forms.bpmn) | A None Start, an Exclusive Gateway that routes on the String Process variable `form`, one Intermediate Timer catch per duration literal (each named after its form), a converging Exclusive Gateway and the Human Task `Proceed`. The literals are `PT30M` (baseline), `PT0S`, `PT0.5S`, `P1D`, `P1W`, `P1M`, `P1DT12H`, `PT87661H`, `-PT5S`, `PT5` and `pt5s`. Every deadline is relative to the start, which no schedule moves from logical time zero. |

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

## Notes for the target runners

- Every schedule starts with `form` naming one catch, so one Timer is armed. The deadline a `timerFire` names is the literal's length in milliseconds from logical time zero, reading a day as 86,400,000 ms and a month as the 31 days after 1970-01-01; a firing that names another deadline than the engine arms is part of the schedule.
- The `form-zero` deadline equals the arming instant, so the Timer is due before any firing; a target runner that treats a job that is already executable as a harness failure cannot answer that schedule.
- A schedule over a lexeme CIB may not accept as a duration carries the `start` alone: a refused arming ends the run at the start.

The schedules carry no expected route, open wait, variable or Process state; the retained CIB evidence is the answer.
