# Recurring Timers: finite counts, dated intervals and Cron

Answer-free schedules for [PC-TIMER-02](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): finite repetition, dated intervals and the CIB Cron dialect on a non-interrupting Timer boundary, overlapping reminder handlers, the last firing, host expiry, and cycles on an interrupting boundary and on an Intermediate catch. The unbounded `R/PT1S` form is already witnessed by the [repeatable subscriptions](../../repeatable-event-subscriptions/README.md). The Cron expressions use CIB's dialect with a seconds field, evaluated over UTC from logical time; they fire at second 0 and 30 of every minute, so the instants do not depend on the zone of the engine host. The [subscriptions semantics](../../../docs/kernel/semantics/SUBSCRIPTIONS-SEMANTICS-SPEC.md) own the meaning; the retained CIB Seven `2.2.0` answer is the target. The model is project-authored MIT source for the `cibseven-2.2.0` profile with no source overlay.

## Models

| Model | What it holds |
|---|---|
| [reminder-cycles.bpmn](reminder-cycles.bpmn) | A None Start and an Exclusive Gateway that routes on the String Process variable `form` to one region. Four regions hold a Human Task `Host_*` with a non-interrupting Timer boundary `Cycle_*` that leads to the Human Task `Handler_*`: `count` with `R3/PT10S`, `dated` with `R2/1970-01-01T00:01:00Z/PT20S`, `dated-end` with `R2/1970-01-01T00:01:00Z/1970-01-01T00:01:20Z` and `cron` with `0/30 * * * * ?`. `interrupting` holds `Host_Interrupting` with an interrupting boundary `Cycle_Interrupting` (`R3/PT10S`). `catch-cycle` and `catch-cron` hold an Intermediate Timer catch with `R3/PT10S` and with `0/30 * * * * ?`, each followed by a Human Task. |

## Schedules

| Schedule | Model | Row | Case it exercises |
|---|---|---|---|
| [count-finite-overlap](count-finite-overlap.scenario.json) | reminder-cycles | PC-TIMER-02 | `R3/PT10S` fires at 10,000, 20,000 and 30,000 with the three handlers open together, a fourth firing at 40,000 is attempted, then the handlers complete in the order 3, 1, 2 and the host completes. |
| [count-host-expires](count-host-expires.scenario.json) | reminder-cycles | PC-TIMER-02 | `R3/PT10S` fires at 10,000, the host completes, a second firing at 20,000 is attempted, then the first handler completes. |
| [dated-start-and-period](dated-start-and-period.scenario.json) | reminder-cycles | PC-TIMER-02 | `R2/1970-01-01T00:01:00Z/PT20S` is fired at 60,000, 80,000 and 100,000, a fourth firing at 120,000 is attempted, then the host completes. |
| [dated-start-and-end](dated-start-and-end.scenario.json) | reminder-cycles | PC-TIMER-02 | `R2/1970-01-01T00:01:00Z/1970-01-01T00:01:20Z` is fired at 60,000, 80,000 and 100,000, a fourth firing at 120,000 is attempted, then the host completes. |
| [cron-seconds-field](cron-seconds-field.scenario.json) | reminder-cycles | PC-TIMER-02 | `0/30 * * * * ?` fires at 30,000 and 60,000, the host completes, a third firing at 90,000 is attempted. |
| [cycle-on-interrupting-boundary](cycle-on-interrupting-boundary.scenario.json) | reminder-cycles | PC-TIMER-02 | `R3/PT10S` on an interrupting boundary fires at 10,000, a second firing at 20,000 is attempted, then the handler completes. |
| [cycle-on-catch](cycle-on-catch.scenario.json) | reminder-cycles | PC-TIMER-02 | `R3/PT10S` on an Intermediate catch is fired at 10,000, then `Proceed` completes. |
| [cron-on-catch](cron-on-catch.scenario.json) | reminder-cycles | PC-TIMER-02 | `0/30 * * * * ?` on an Intermediate catch is fired at 30,000, then `Proceed` completes. |

## Notes for the target runners

- A cycle's deadlines are armed at the start (logical time zero), so the first `R3/PT10S` firing is at 10,000, and a firing names the occurrence of the boundary by the activation the kernel's numbering gives: the first Timer is activation 1 and each successor the next activation, one period after the deadline it fired at. The CIB runner numbers an attached subscription by its host's activation, so it publishes every firing of one host as activation 1 and rejects the later activations.
- The schedules fire more occurrences than a finite count can hold, so a firing beyond the last one is a probe whose answer is the retained state, not a mistake in the schedule.
- The Cron deadlines assume the engine evaluates the expression over UTC; the second field makes the instants independent of any whole-minute zone offset.

The schedules carry no expected route, open wait, variable or Process state; the retained CIB evidence is the answer.
