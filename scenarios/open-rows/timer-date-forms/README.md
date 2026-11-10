# Timer absolute-date forms at an Intermediate Catch

Answer-free schedules for [PC-TIMER-01](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): the absolute-date lexemes a Timer catch can carry, the conversion of an instant written in UTC to a logical deadline, and a date that is already past or equal to the arming instant, which the [subscriptions semantics](../../../docs/kernel/semantics/SUBSCRIPTIONS-SEMANTICS-SPEC.md) list as owed. The retained CIB Seven `2.2.0` answer fixes each case before the row decides what to admit. Every lexeme names UTC except two: `no-designator` carries no zone designator, which would take the engine host's zone, and `offset-plus-two` writes an explicit `+02:00` offset; a time zone other than UTC is outside the owner decision for this row. The model is project-authored MIT source for the `cibseven-2.2.0` profile with no source overlay.

## Models

| Model | What it holds |
|---|---|
| [date-forms.bpmn](date-forms.bpmn) | A None Start, an Exclusive Gateway on the Boolean Process variable `delayed` that either runs the duration Timer `Catch_Delay` (`PT2H`) or skips it, an Exclusive Gateway that routes on the String variable `form` to one date Timer catch per lexeme, and the Human Task `Proceed`. The lexemes are `1970-01-01T01:00:00Z`, the same instant with `.500` fractional seconds, with the `+00:00` offset notation, `2100-01-01T00:00:00Z`, `1970-01-01T02:00:00Z`, `1970-13-45T25:61:61Z` and `1970-01-01t01:00:00z`. Logical time zero is `1970-01-01T00:00:00Z`. |
| [date-offset.bpmn](date-offset.bpmn) | A None Start, the Timer catch `Catch_Offset` with the date `1970-01-01T03:00:00+02:00`, which is the instant `1970-01-01T01:00:00Z`, and the Human Task `Proceed`. |
| [date-no-designator.bpmn](date-no-designator.bpmn) | A None Start, the Timer catch `Catch_NoDesignator` with the date `1970-01-01T01:00:00`, which carries no zone designator, and the Human Task `Proceed`. |
| [date-before-epoch.bpmn](date-before-epoch.bpmn) | A None Start, the Timer catch `Catch_BeforeEpoch` with the date `1969-12-31T23:00:00Z`, one hour before logical time zero, and the Human Task `Proceed`. |

## Schedules

| Schedule | Model | Row | Case it exercises |
|---|---|---|---|
| [future](future.scenario.json) | date-forms | PC-TIMER-01 | `1970-01-01T01:00:00Z` is armed at the start, fired at 3,600,000 and followed by `Proceed`. |
| [future-early-then-exact](future-early-then-exact.scenario.json) | date-forms | PC-TIMER-01 | The same date, with a firing one millisecond before it, then the exact firing and `Proceed`. |
| [fraction](fraction.scenario.json) | date-forms | PC-TIMER-01 | The instant with fractional seconds is fired at 3,600,500. |
| [utc-offset-notation](utc-offset-notation.scenario.json) | date-forms | PC-TIMER-01 | The instant written with the `+00:00` offset is fired at 3,600,000. |
| [far-future](far-future.scenario.json) | date-forms | PC-TIMER-01 | A date in the year 2100 is armed at the start and fired at 4,102,444,800,000. |
| [past-after-delay](past-after-delay.scenario.json) | date-forms | PC-TIMER-01 | The delay Timer fires at 7,200,000, then the date `1970-01-01T01:00:00Z` is armed one hour in the past, fired at 3,600,000, and `Proceed` follows. |
| [equal-to-now-after-delay](equal-to-now-after-delay.scenario.json) | date-forms | PC-TIMER-01 | The delay Timer fires at 7,200,000, then the date `1970-01-01T02:00:00Z`, equal to the clock, is armed, fired at 7,200,000, and `Proceed` follows. |
| [malformed-date](malformed-date.scenario.json) | date-forms | PC-TIMER-01 | The lexeme `1970-13-45T25:61:61Z`, whose fields are out of range, is armed at the start; the schedule is the start alone. |
| [lowercase-designators](lowercase-designators.scenario.json) | date-forms | PC-TIMER-01 | The lexeme `1970-01-01t01:00:00z`, with lower-case designators, is armed at the start; the schedule is the start alone. |
| [offset-plus-two](offset-plus-two.scenario.json) | date-offset | PC-TIMER-01 | The date with the `+02:00` offset is armed at the start, fired at 3,600,000 and followed by `Proceed`. Separates an explicit offset applied as a fixed shift from its wall-clock time read as UTC. No evidence yet. |
| [no-designator](no-designator.scenario.json) | date-no-designator | PC-TIMER-01 | The lexeme without a zone designator is armed at the start; the schedule is the start alone. Separates a zone-less date refused as outside the row's forms from the same wall-clock time read in the engine host's zone. No evidence yet. |
| [before-epoch](before-epoch.scenario.json) | date-before-epoch | PC-TIMER-01 | The date before logical time zero is armed at the start; the schedule is the start alone. Separates a date before the epoch from a date that is already due. CIB's job is due before logical time zero, which the observation cannot express, so its run ends as a harness failure. |

## Notes for the target runners

- A deadline stated in a `timerFire` is the lexeme's instant in milliseconds after `1970-01-01T00:00:00Z`.
- With `delayed` true the delay Timer fires at 7,200,000 ms first, so the date Timer is armed with the clock at that instant: `past-after-delay` arms a date one hour before it and `equal-to-now` a date equal to it. A target runner that treats a job that is already executable as a harness failure cannot answer those two schedules, whose firings state `at` 7,200,000, the clock at which the due job is woken.
- A schedule over a lexeme CIB may not accept carries the `start` alone: a refused arming ends the run at the start.
- `no-designator` and `before-epoch` carry the start alone, like `malformed-date`: the engine may commit a job the row's forms do not admit.

The schedules carry no expected route, open wait, variable or Process state; the retained CIB evidence is the answer.
