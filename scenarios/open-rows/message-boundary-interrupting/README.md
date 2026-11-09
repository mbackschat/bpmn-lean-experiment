# Interrupting Message boundaries on every kind of host

Answer-free schedules for [PC-MESSAGE-04](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): interrupting Message boundaries on a Human Task (two of them with distinct addresses), a Receive Task, an asynchronous Service Task, an embedded Sub-Process, a Call Activity and both Multi-Instance forms, delivered before and after the host's own completion or result, and what each victory leaves of the host's other subscriptions. The [subscriptions semantics](../../../docs/kernel/semantics/SUBSCRIPTIONS-SEMANTICS-SPEC.md) own the meaning; the retained CIB Seven `2.2.0` answer is the target. The model is project-authored MIT source for the `cibseven-2.2.0` profile with no source overlay.

## Models

| Model | What it holds |
|---|---|
| [message-hosts.bpmn](message-hosts.bpmn) | After a Parallel fork eight regions run side by side. *User*: `Host_User` with the interrupting boundaries `Cancel_User` (`cancel`) to `Handle_Cancel_User` and `Amend_User` (`amend`) to `Handle_Amend_User`, normal completion to `After_User`. *Receive*: `Host_Receive` on `documents` with `Withdraw_Receive` (`withdraw`) to `Handle_Withdraw_Receive`. *Effect*: the asynchronous Service Task `Host_Service` with `Abort_Service` (`abort`) to `Handle_Abort_Service`. *Scope*: the Sub-Process `Host_Scope` over the concurrent Human Tasks `Scope_A` and `Scope_B` with `Halt_Scope` (`halt`) to `Handle_Halt_Scope`, normal completion to `After_Scope`. *Call*: `Host_Call` of `Process_Child` (`Child_Work`) with `Stop_Call` (`stop`) to `Handle_Stop_Call`, normal return to `After_Call`. *Sequential Multi-Instance*: the Sub-Process `Host_MiSeq` over `items` (sequential, body `Body_Seq`) with `Quit_MiSeq` (`quitSeq`) to `Handle_Quit_MiSeq`. *Parallel Multi-Instance*: the Human Task `Host_MiPar` over `items` (parallel) with `Quit_MiPar` (`quitPar`) to `Handle_Quit_MiPar`. |

## Schedules

| Schedule | Model | Row | Case it exercises |
|---|---|---|---|
| [user-cancel-then-amend](user-cancel-then-amend.scenario.json) | message-hosts | PC-MESSAGE-04 | `cancel` wins on the Human Task; `amend` is then delivered, the task is completed, and the cancellation handler completes. |
| [user-amend-first](user-amend-first.scenario.json) | message-hosts | PC-MESSAGE-04 | `amend` wins on the Human Task; `cancel` is then delivered and the amendment handler completes. |
| [user-completes-first](user-completes-first.scenario.json) | message-hosts | PC-MESSAGE-04 | The Human Task completes; `cancel` and `amend` are then delivered and `After_User` completes. |
| [receive-withdraw-before-own-message](receive-withdraw-before-own-message.scenario.json) | message-hosts | PC-MESSAGE-04 | `withdraw` wins on the Receive Task; its own Message is then delivered and the handler completes. |
| [receive-message-first](receive-message-first.scenario.json) | message-hosts | PC-MESSAGE-04 | The Receive Task's own Message is delivered; `withdraw` is then delivered. |
| [effect-abort-before-result](effect-abort-before-result.scenario.json) | message-hosts | PC-MESSAGE-04 | `abort` is delivered before the effect has answered; the effect result is then delivered. |
| [effect-result-first](effect-result-first.scenario.json) | message-hosts | PC-MESSAGE-04 | The effect result is delivered first; `abort` is then delivered. |
| [scope-halt-while-work-open](scope-halt-while-work-open.scenario.json) | message-hosts | PC-MESSAGE-04 | `halt` wins with both tasks open; `Scope_A` is then addressed and the handler completes. |
| [scope-completes-first](scope-completes-first.scenario.json) | message-hosts | PC-MESSAGE-04 | Both tasks complete; `halt` is then delivered and `After_Scope` completes. |
| [call-stop-while-child-open](call-stop-while-child-open.scenario.json) | message-hosts | PC-MESSAGE-04 | `stop` wins while the called `Child_Work` is open; `Child_Work` is then addressed and the handler completes. |
| [call-child-completes-first](call-child-completes-first.scenario.json) | message-hosts | PC-MESSAGE-04 | The called `Child_Work` completes; `stop` is then delivered and `After_Call` completes. |
| [sequential-bodies-quit](sequential-bodies-quit.scenario.json) | message-hosts | PC-MESSAGE-04 | `quitSeq` wins while the first body is open; that body's task is then addressed and the handler completes. |
| [sequential-bodies-complete-first](sequential-bodies-complete-first.scenario.json) | message-hosts | PC-MESSAGE-04 | Both bodies complete; `quitSeq` is then delivered. |
| [parallel-bodies-quit](parallel-bodies-quit.scenario.json) | message-hosts | PC-MESSAGE-04 | `quitPar` wins with both bodies open; body 1 is then addressed and the handler completes. |
| [parallel-bodies-complete-first](parallel-bodies-complete-first.scenario.json) | message-hosts | PC-MESSAGE-04 | Both bodies complete; `quitPar` is then delivered. |

## Notes for the target runners

- A schedule names one region's stimuli; the other regions stay open and no schedule ends the Process instance. `items` is the String list `a, b` in every schedule that starts a Multi-Instance region.
- `Host_Service` is an asynchronous Service Task, answered by `effectResult`; the schedules that deliver `abort` before the effect result test whether the boundary is armed while the effect is pending.
- The called instance is addressed by the derived identity `call:10:Instance_1:9:Host_Call:1`.
- `Quit_MiPar` hangs on a parallel Multi-Instance host, whose outer subscription the CIB runner may not be able to number.

The schedules carry no expected route, open wait, variable or Process state; the retained CIB evidence is the answer.
