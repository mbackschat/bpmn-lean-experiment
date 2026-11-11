# Timer Start occurrence populations

Answer-free population schedules for [PC-TIMER-04](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): a root Timer Start occurrence named by its due instant and fired at a later or equal firing time, across versions of one process key, late, repeated and replayed. The [subscriptions semantics](../../../docs/kernel/semantics/SUBSCRIPTIONS-SEMANTICS-SPEC.md#starts) and the [population semantics](../../../docs/kernel/semantics/POPULATION-SEMANTICS-SPEC.md#start-selection) own the meaning; these inputs only exercise it. Each is a closed [engine population scenario](../../../contracts/schemas/engine-population-scenario.schema.json): the definitions deploy at 0 in the order listed, or at their `deploy` step, then the steps run in order at their logical times.

Logical time zero is the Unix epoch `1970-01-01T00:00:00Z`. A `timerStart` step names the deployment by its deploy ordinal, the Start Event and the due instant of one occurrence, and its logical time `at` is the firing time. A duration and an undated cycle count from the deployment's logical time, so a deployment at 0 makes `PT1H` due at 3,600,000 ms. The started instances' identities are derived by the engine, so no schedule addresses one of them.

The CIB schedules run under `cibseven-2.2.0` with no source overlay; their CIB answer comes from the CIB runner's population mode in the hosted lane and is retained beside each schedule. The three replay schedules are kernel-only under `bpmn-2.0.2`: CIB keeps no occurrence ledger, so a retained CIB answer to them would say nothing about the kernel's contract.

## Models

| Model | What it holds |
|---|---|
| [hourly-start-v2](hourly-start-v2.bpmn) | The process `Process_DurationBatch` of [duration-start](../timer-start-forms/duration-start.bpmn) with *Review the batch* renamed *ReviewBatchRevised*: a second version of one process key with the same duration. |
| [date-start-early](date-start-early.bpmn) | The Timer Start *On the early batch date* (`timeDate` `1970-01-01T00:05:00Z`) leading to *Review the early batch*. |
| [bounded-cycle-start](bounded-cycle-start.bpmn) | The Timer Start *Every ten minutes* (`timeCycle` `R3/PT10M`) leading to *Review the cycle batch*. |
| [cron-start](cron-start.bpmn) | The Timer Start *Every half hour* (`timeCycle` `0 0/30 * * * ?`) leading to *Review the cron batch*. |
| [failing-duration-start](failing-duration-start.bpmn) | The Timer Start *An hour after deployment* (`PT1H`) into the Exclusive Gateway *Choose the audit*, whose flow to *Audit in depth* reads `${auditLevel > 1}` over a variable no step supplies and whose default flow leads to *Check routinely*. |

The schedules also bind two models of [timer-start-forms](../timer-start-forms/README.md):

- [duration-start](../timer-start-forms/duration-start.bpmn): the Timer Start *An hour after deployment* (`PT1H`).
- [cycle-start](../timer-start-forms/cycle-start.bpmn): the Timer Start *Every hour* (`R/PT1H`).

## Population schedules

| Schedule | Definitions | Target | Case it separates |
|---|---|---|---|
| [cycle-start-second-and-third-occurrence](cycle-start-second-and-third-occurrence.population-scenario.json) | cycle-start | CIB | The cycle `R/PT1H` fires for its second occurrence, 7,200,000 ms, and then its third, without the first. |
| [cron-start-first-match](cron-start-first-match.population-scenario.json) | cron-start | CIB | The Cron expression `0 0/30 * * * ?` fires at 1,800,000 ms, its first match after deployment. |
| [redeploy-supersedes-timer-start](redeploy-supersedes-timer-start.population-scenario.json) | duration-start, hourly-start-v2 | CIB | Version 1 is deployed at 0 and version 2 at 1,800,000 ms; version 1's occurrence fires at 3,600,000 ms and version 2's at 5,400,000 ms. |
| [superseded-occurrence-fired-late](superseded-occurrence-fired-late.population-scenario.json) | duration-start, hourly-start-v2 | CIB | Version 1 is deployed at 0 and version 2 at 4,200,000 ms; version 1's occurrence, due at 3,600,000 ms, fires at 4,500,000 ms. |
| [date-start-before-deployment](date-start-before-deployment.population-scenario.json) | date-start-early | CIB | A date five minutes after the epoch is deployed at ten minutes and fires at ten minutes; the same occurrence is fired again by another command. |
| [duration-start-fired-late](duration-start-fired-late.population-scenario.json) | duration-start | CIB | The occurrence due at 3,600,000 ms fires at 3,660,000 ms. |
| [cycle-start-late-firing](cycle-start-late-firing.population-scenario.json) | bounded-cycle-start | CIB | The cycle `R3/PT10M` fires its first occurrence at 25 minutes instead of 10, then its second occurrence at 25 minutes, then its third at 30. |
| [timer-start-continuation-fails](timer-start-continuation-fails.population-scenario.json) | failing-duration-start | CIB | The occurrence due at 3,600,000 ms fires on time and the start's continuation reads the unset `auditLevel`. The kernel answers a fan-out whose one entry is the start's `failed rolledBack unknown-variable`, starting nothing; CIB rolls the timer job's transaction back with no instance, the job left for its retries (`TimerStartEventJobHandler`, CIB-INT-0033). |
| [timer-start-replay](timer-start-replay.population-scenario.json) | duration-start | kernel-only, `bpmn-2.0.2` | One firing and the identical step again. |
| [timer-start-replay-later-time](timer-start-replay-later-time.population-scenario.json) | duration-start | kernel-only, `bpmn-2.0.2` | One firing at 3,600,000 ms and the identical step at 7,200,000 ms, after the occurrence is consumed. |
| [timer-start-other-command-same-occurrence](timer-start-other-command-same-occurrence.population-scenario.json) | duration-start | kernel-only, `bpmn-2.0.2` | One firing and another command that fires the same occurrence. |
| [kernel-timer-start-refusals](kernel-timer-start-refusals.population-scenario.json) | duration-start | kernel-only, `bpmn-2.0.2` | A firing one millisecond before its occurrence is due, then one naming a deployment that does not exist. |
| [kernel-cron-start-between-matches](kernel-cron-start-between-matches.population-scenario.json) | cron-start | kernel-only, `bpmn-2.0.2` | The Cron expression `0 0/30 * * * ?` is fired for a due instant of 1,000 ms, before its first match, and then for 2,700,000 ms, between two matches; neither is an occurrence. |

The schedules carry no expected deployment, instance, task or resolution.
