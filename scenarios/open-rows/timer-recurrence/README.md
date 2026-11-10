# Recurring Timers: finite counts, dated intervals and Cron

Answer-free schedules for [PC-TIMER-02](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): finite repetition, dated intervals and the CIB Cron dialect on a non-interrupting Timer boundary, overlapping reminder handlers, the last firing, host expiry, and cycles on an interrupting boundary and on an Intermediate catch. The unbounded `R/PT1S` form is already witnessed by the [repeatable subscriptions](../../repeatable-event-subscriptions/README.md). The Cron expressions use CIB's dialect with a seconds field, evaluated over UTC from logical time; they fire at second 0 and 30 of every minute, so the instants do not depend on the zone of the engine host. The [subscriptions semantics](../../../docs/kernel/semantics/SUBSCRIPTIONS-SEMANTICS-SPEC.md) own the meaning; the retained CIB Seven `2.2.0` answer is the target. The model is project-authored MIT source for the `cibseven-2.2.0` profile with no source overlay.

## Models

| Model | What it holds |
|---|---|
| [reminder-cycles.bpmn](reminder-cycles.bpmn) | A None Start and an Exclusive Gateway that routes on the String Process variable `form` to one region. Two regions hold a Human Task `Host_*` with a non-interrupting Timer boundary `Cycle_*` that leads to the Human Task `Handler_*`: `count` with `R3/PT10S` and `cron` with `0/30 * * * * ?`. `interrupting` holds `Host_Interrupting` with an interrupting boundary `Cycle_Interrupting` (`R3/PT10S`). `catch-cycle` and `catch-cron` hold an Intermediate Timer catch with `R3/PT10S` and with `0/30 * * * * ?`, each followed by a Human Task. |
| [dated-cycles.bpmn](dated-cycles.bpmn) | The `dated` and `dated-end` regions, split from `reminder-cycles.bpmn` so that a target that refuses a dated cycle at deployment still runs the other regions: a None Start and an Exclusive Gateway on the String Process variable `form` to two regions, each a Human Task `Host_*` with a non-interrupting Timer boundary `Cycle_*` that leads to the Human Task `Handler_*`: `dated` with `R2/1970-01-01T00:01:00Z/PT20S` and `dated-end` with `R2/1970-01-01T00:01:00Z/1970-01-01T00:01:20Z`. |
| [cycle-forms.bpmn](cycle-forms.bpmn) | A None Start and an Exclusive Gateway on the String Process variable `form` to three regions. `weekday` holds the Human Task `Host_Weekday` with a non-interrupting Timer boundary `Cycle_Weekday` (`0 0 9 ? * 6`) to `Handler_Weekday`. `sub-second` holds the Timer catch `Catch_Half` (`PT0.5S`) followed by `Host_SubSecond` with `Cycle_SubSecond` (`R3/PT10S`). `last-fire` holds `Host_Last` with `Cycle_Last` (`R2/PT10S`). It holds no dated interval, which a target that refuses a dated cycle at deployment refuses as a whole model. |
| [cron-last-day.bpmn](cron-last-day.bpmn) | A None Start, the Human Task `Host_Cron` and a non-interrupting Timer boundary `Cycle_Cron` (`0 0 12 L * ?`) to `Handler_Cron`. |
| [cron-day-name.bpmn](cron-day-name.bpmn) | The same shape with the boundary `0 0 12 ? * MON`. |
| [cron-two-day-fields.bpmn](cron-two-day-fields.bpmn) | The same shape with the boundary `0 0 12 1 * 2`, which sets both day fields. |

## Schedules

| Schedule | Model | Row | Case it exercises |
|---|---|---|---|
| [count-finite-overlap](count-finite-overlap.scenario.json) | reminder-cycles | PC-TIMER-02 | `R3/PT10S` fires at 10,000, 20,000 and 30,000 with the three handlers open together, a fourth firing at 40,000 is attempted, then the handlers complete in the order 3, 1, 2 and the host completes. |
| [count-host-expires](count-host-expires.scenario.json) | reminder-cycles | PC-TIMER-02 | `R3/PT10S` fires at 10,000, the host completes, a second firing at 20,000 is attempted, then the first handler completes. |
| [dated-start-and-period](dated-start-and-period.scenario.json) | dated-cycles | PC-TIMER-02 | `R2/1970-01-01T00:01:00Z/PT20S` is fired at 60,000, 80,000 and 100,000, a fourth firing at 120,000 is attempted, then the host completes. CIB chains past the count (CIB-DEV-0006), so its run ends as a harness failure. |
| [dated-start-and-end](dated-start-and-end.scenario.json) | dated-cycles | PC-TIMER-02 | `R2/1970-01-01T00:01:00Z/1970-01-01T00:01:20Z` is fired at 60,000, 80,000 and 100,000, a fourth firing at 120,000 is attempted, then the host completes. CIB chains past the count (CIB-DEV-0006), so its run ends as a harness failure. |
| [cron-seconds-field](cron-seconds-field.scenario.json) | reminder-cycles | PC-TIMER-02 | `0/30 * * * * ?` fires at 30,000 and 60,000, the host completes, a third firing at 90,000 is attempted. |
| [cycle-on-interrupting-boundary](cycle-on-interrupting-boundary.scenario.json) | reminder-cycles | PC-TIMER-02 | `R3/PT10S` on an interrupting boundary fires at 10,000, a second firing at 20,000 is attempted, then the handler completes. |
| [cycle-on-catch](cycle-on-catch.scenario.json) | reminder-cycles | PC-TIMER-02 | `R3/PT10S` on an Intermediate catch is fired at 10,000, then `Proceed` completes. |
| [cron-on-catch](cron-on-catch.scenario.json) | reminder-cycles | PC-TIMER-02 | `0/30 * * * * ?` on an Intermediate catch is fired at 30,000, then `Proceed` completes. |
| [cron-weekday-number](cron-weekday-number.scenario.json) | cycle-forms | PC-TIMER-02 | `0 0 9 ? * 6` is armed at the start, a Thursday, and fired at 118,800,000; the next occurrence is left open. Separates Quartz day-of-week numbering from a week that starts on Monday. No evidence yet. |
| [cron-refused-last-day](cron-refused-last-day.scenario.json) | cron-last-day | PC-TIMER-02 | The schedule is the start alone. Separates the last-day token `L` from the Cron forms the row admits. No evidence yet. |
| [cron-refused-day-name](cron-refused-day-name.scenario.json) | cron-day-name | PC-TIMER-02 | The schedule is the start alone. Separates a day of week written as a name from the numbered forms the row admits. No evidence yet. |
| [cron-refused-two-day-fields](cron-refused-two-day-fields.scenario.json) | cron-two-day-fields | PC-TIMER-02 | The schedule is the start alone. Separates two concrete day fields, which the engine reads through its day-field rewrite, from the forms the row admits. No evidence yet. |
| [count-sub-second-arming](count-sub-second-arming.scenario.json) | cycle-forms | PC-TIMER-02 | `Catch_Half` is fired at 500, which arms `R3/PT10S` with the host; the boundary is fired at 10,500 and 20,500. Separates a cycle that keeps arming time plus whole periods from one anchored to the whole-second grid; the CIB-DEV-0007 candidate. No evidence yet. |
| [count-last-fire-chain](count-last-fire-chain.scenario.json) | cycle-forms | PC-TIMER-02 | `R2/PT10S` is armed at the start and fired at 10,000 and 20,000. Separates two firings and then none from a chain that continues at the last deadline; the CIB-DEV-0006 candidate. No evidence yet. |

## Notes for the target runners

- A cycle's deadlines are armed at the start (logical time zero), so the first `R3/PT10S` firing is at 10,000, and a firing names the occurrence of the boundary by the activation the kernel's numbering gives: the first Timer is activation 1 and each successor the next activation, one period after the deadline it fired at. The CIB runner numbers an attached subscription by its host's activation, so it publishes every firing of one host as activation 1 and rejects the later activations.
- The schedules fire more occurrences than a finite count can hold, so a firing beyond the last one is a probe whose answer is the retained state, not a mistake in the schedule.
- The Cron deadlines assume the engine evaluates the expression over UTC; the second field makes the instants independent of any whole-minute zone offset.
- `cron-weekday-number` fires at 09:00 on a Friday, so its instants depend on the zone the engine evaluates Cron in; the schedule assumes UTC.
- A schedule over a Cron form the row does not admit carries the start alone: the engine may commit a job the row refuses.

The schedules carry no expected route, open wait, variable or Process state; the retained CIB evidence is the answer.
