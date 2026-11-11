# Intermediate Conditional catches and their race

Answer-free schedules for [PC-CONDITION-03](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): an Intermediate Conditional catch whose predicate is already true or false when the token arrives, a change made before arrival, a change made after the wait was consumed, and a Conditional arm racing a Message arm and a Timer arm at an Event-Based Gateway. Conditional events re-evaluate on variable changes, which these schedules drive with `setVariables` commands. The [subscriptions semantics](../../../docs/kernel/semantics/SUBSCRIPTIONS-SEMANTICS-SPEC.md) own the meaning; the retained CIB Seven `2.2.0` answer is the target. The models are project-authored MIT source for the `cibseven-2.2.0` profile with no source overlay.

## Models

| Model | What it holds |
|---|---|
| [catches.bpmn](catches.bpmn) | A None Start, the Human Task `Prepare`, the Conditional catch `Catch_Ready` (`${ready == true}`, variable `ready`) and the Human Task `Proceed_Ready`. |
| [race.bpmn](race.bpmn) | A None Start, the Human Task `Prepare` and an Event-Based Gateway over the Conditional catch `Catch_Approved` (`${approved == true}`, variable `approved`) to `Approved`, the Message catch `Catch_Rejected` (`reject`) to `Rejected`, and the Timer catch `Catch_Expired` (`PT30S`) to `Expired`. |
| [arms.bpmn](arms.bpmn) | A None Start and an Event-Based Gateway over two Conditional catches, `Catch_Alpha` and `Catch_Beta`, both `${ready == true}` (variable `ready`), to the Human Tasks `Chosen_Alpha` and `Chosen_Beta`. The catches are declared alpha first; the gateway's Sequence Flows leave for beta first. |

## Schedules

| Schedule | Model | Row | Case it exercises |
|---|---|---|---|
| [immediate-true](immediate-true.scenario.json) | catches | PC-CONDITION-03 | `ready` is `true` at the start; `Prepare` completes and `Proceed_Ready` completes. |
| [passive-false](passive-false.scenario.json) | catches | PC-CONDITION-03 | `ready` is `false` at the start; `Prepare` completes; `ready` is then set to `true` on the wait. |
| [absent-then-false-then-true](absent-then-false-then-true.scenario.json) | catches | PC-CONDITION-03 | `ready` is absent when `Prepare` completes; it is then created as `false` and set to `true` on the wait. |
| [change-before-arrival](change-before-arrival.scenario.json) | catches | PC-CONDITION-03 | `ready` is `false` at the start and is set to `true` while `Prepare` is open; `Prepare` then completes. |
| [changes-after-consumption](changes-after-consumption.scenario.json) | catches | PC-CONDITION-03 | The wait is satisfied; `ready` is then set to `false` and to `true` again on `Proceed_Ready`, which then completes. |
| [condition-wins](condition-wins.scenario.json) | race | PC-CONDITION-03 | `approved` is `false` at the start; `Prepare` completes; the Conditional arm is satisfied; the Message arm is then delivered and the Timer arm fired at 30,000; `Approved` completes. |
| [message-wins-then-condition-changes](message-wins-then-condition-changes.scenario.json) | race | PC-CONDITION-03 | `approved` is `false` at the start; `Prepare` completes; the Message arm is delivered; `approved` is then set to `true` on `Rejected`; `Rejected` completes. |
| [true-at-the-gateway](true-at-the-gateway.scenario.json) | race | PC-CONDITION-03 | `approved` is `true` at the start; `Prepare` completes and reaches the gateway; the Message arm is then delivered. |
| [timer-wins-then-condition-changes](timer-wins-then-condition-changes.scenario.json) | race | PC-CONDITION-03 | `approved` is `false` at the start; `Prepare` completes; the Timer arm fires at 30,000; `approved` is then set to `true` on `Expired`; `Expired` completes. |
| [gateway-two-true-arms](gateway-two-true-arms.scenario.json) | arms | PC-CONDITION-03 | `ready` is `true` at the start, so both arms are true when the token arrives; the schedule is the start alone. Separates the order of the gateway's Sequence Flows from the declaration order of its catch Events. |

## Notes for the target runners

- A write is addressed to the open wait or Human Task whose scope it is written in; a variable written while `Prepare` is open is written before the token reaches the catch or gateway.
- A gateway arm is addressed by its catch Event and the activation of the gateway occurrence that armed it.

The schedules carry no expected route, open wait, variable or Process state; the retained CIB evidence is the answer.
