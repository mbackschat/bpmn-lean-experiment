# Timer boundaries on every kind of host

Answer-free schedules for [PC-TIMER-06](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): several Timer boundaries on one host, both interruption modes on a Human Task, a Receive Task, an asynchronous Service Task (the effect Activity), a Call Activity and an embedded Sub-Process, a recurring handler, overlapping handlers, obsolete boundaries after the host's end, and a task entered again whose earlier boundary must not reach the later activation. The [subscriptions semantics](../../../docs/kernel/semantics/SUBSCRIPTIONS-SEMANTICS-SPEC.md) own the meaning; the retained CIB Seven `2.2.0` answer is the target. The two models are project-authored MIT source for the `cibseven-2.2.0` profile with no source overlay. The asynchronous Service Task has a model of its own: CIB never commits its boundaries ([CIB-EXT-0038](../../../docs/CIB-BPMN-RELATION-REGISTER.md#cib-ext-0038--the-kernels-effect-wait-holds-its-hosts-boundaries-armed-which-cibs-asyncbefore-realization-never-commits)), and the differential excuses a disagreement per scenario file, so a shared model would excuse every other host with it.

## Models

| Model | What it holds |
|---|---|
| [boundary-hosts.bpmn](boundary-hosts.bpmn) | After a Parallel fork five regions run side by side, each armed at the start. *User*: `Host_User` with the non-interrupting `Soft_User` (`PT5S`) to `Nudge_User` and the interrupting `Hard_User` (`PT10S`) to `Escalate_User` and `Final_User` (`PT20S`) to `Abandon_User`; normal completion leads to `After_User`. *Receive*: `Host_Receive` on the Message `documents` with `Remind_Receive` (non-interrupting, `PT6S`) to `Ping_Receive` and `Late_Receive` (interrupting, `PT12S`) to `Chase_Receive`. *Call*: `Host_Call` of `Process_Child` (the Human Task `Child_Work`) with `Remind_Call` (non-interrupting, `R2/PT7S`) to `Ping_Call` and `Late_Call` (interrupting, `PT15S`) to `Chase_Call`; normal return leads to `After_Call`. *Scope*: the Sub-Process `Host_Scope` over the concurrent Human Tasks `Scope_A` and `Scope_B` with `Soft_Scope` (non-interrupting, `PT9S`) to `Nudge_Scope` and `Hard_Scope` (interrupting, `PT16S`) to `Escalate_Scope`; normal completion leads to `After_Scope`. *Loop*: `Host_Loop` with the interrupting `Deadline_Loop` (`PT10S`) to `Late_Loop`, then `Review_Loop` and an Exclusive Gateway that returns to `Host_Loop` on `${again == true}`. |
| [effect-host.bpmn](effect-host.bpmn) | After a Parallel fork the Human Task `Keep_Open`, which no schedule addresses and which keeps the Process instance running, and *Effect*: `Host_Service`, an asynchronous Service Task answered by `effectResult`, with `Soft_Service` (non-interrupting, `PT4S`) to `Nudge_Service` and `Late_Service` (interrupting, `PT8S`) to `Chase_Service`. CIB arms none of these boundaries, so each schedule on this model differs from the kernel as CIB-EXT-0038 records. |

## Schedules

| Schedule | Model | Row | Case it exercises and separates |
|---|---|---|---|
| [user-soft-then-hard](user-soft-then-hard.scenario.json) | boundary-hosts | PC-TIMER-06 | `Soft_User` fires at 5,000 and `Hard_User` at 10,000; `Final_User` is then fired at 20,000; the escalation and the nudge complete. |
| [user-hard-first](user-hard-first.scenario.json) | boundary-hosts | PC-TIMER-06 | `Hard_User` fires at 10,000 before `Soft_User` has fired; `Soft_User` is then fired at 5,000 and the escalation completes. |
| [user-completes-first](user-completes-first.scenario.json) | boundary-hosts | PC-TIMER-06 | `Host_User` completes before any deadline; `Soft_User`, `Hard_User` and `Final_User` are then fired at their deadlines and `After_User` completes. |
| [receive-remind-then-late](receive-remind-then-late.scenario.json) | boundary-hosts | PC-TIMER-06 | `Remind_Receive` fires at 6,000 and `Late_Receive` at 12,000; the Message is then delivered to the Receive Task and both handlers complete. |
| [receive-message-first](receive-message-first.scenario.json) | boundary-hosts | PC-TIMER-06 | The Message is delivered to the Receive Task first; `Remind_Receive` and `Late_Receive` are then fired at their deadlines. |
| [effect-timer-before-result](effect-timer-before-result.scenario.json) | effect-host | PC-TIMER-06 | `Late_Service` is fired at 8,000 before the effect has answered; the effect result is then delivered and `Soft_Service` is fired at 4,000. It separates a boundary that fires while the effect is pending from one that fires after the result. |
| [effect-result-first](effect-result-first.scenario.json) | effect-host | PC-TIMER-06 | The effect result is delivered first; `Soft_Service` and `Late_Service` are then fired at 4,000 and 8,000. It separates the boundaries that outlive the host's end from the pending effect's. |
| [call-reminders-then-late](call-reminders-then-late.scenario.json) | boundary-hosts | PC-TIMER-06 | `Remind_Call` fires at 7,000 and 14,000 and `Late_Call` at 15,000; the called `Child_Work` is then addressed, and the interrupting handler and both reminder handlers complete. |
| [call-child-completes-first](call-child-completes-first.scenario.json) | boundary-hosts | PC-TIMER-06 | The called `Child_Work` completes first; `Remind_Call` and `Late_Call` are then fired and `After_Call` completes. |
| [scope-soft-then-work-completes](scope-soft-then-work-completes.scenario.json) | boundary-hosts | PC-TIMER-06 | `Soft_Scope` fires at 9,000, both concurrent tasks complete, `Hard_Scope` is then fired at 16,000, and the nudge and `After_Scope` complete. |
| [scope-hard-while-work-open](scope-hard-while-work-open.scenario.json) | boundary-hosts | PC-TIMER-06 | `Hard_Scope` fires at 16,000 with both tasks open; `Scope_A` is then addressed and the escalation completes. |
| [loop-stale-deadline](loop-stale-deadline.scenario.json) | boundary-hosts | PC-TIMER-06 | `Host_Loop` completes and is sent back by `Review_Loop` after `Soft_User` moved the clock to 5,000; the first activation's deadline, then the first deadline against the second activation, are fired before the second activation's own deadline of 15,000. |

## Notes for the target runners

- A schedule names one region's stimuli; the other regions stay armed and open, and no schedule ends the Process instance. In `effect-host` the Human Task `Keep_Open` is that other region.
- Successor occurrences of `Remind_Call` use the kernel's numbering (activation 2 for the second period); the CIB runner numbers an attached subscription by its host's activation, so it does not publish that occurrence under activation 2.
- `Host_Service` is an asynchronous Service Task, answered by `effectResult`; the schedules that name its Timers before the effect result test whether they are armed while the effect is pending, which CIB's `asyncBefore` realization never commits.
- The called instance is addressed by the derived identity `call:10:Instance_1:9:Host_Call:1`.
- `loop-stale-deadline` first fires `Soft_User` at 5,000 so that the second entry of `Host_Loop` is armed at a later logical time than the first; the second `Deadline_Loop` deadline is 15,000.

The schedules carry no expected route, open wait, variable or Process state; the retained CIB evidence is the answer.
