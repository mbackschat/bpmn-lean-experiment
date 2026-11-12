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
| — | arms | PC-CONDITION-03 | Two true arms at the gateway (`ready` true at the start) have no retained CIB answer: CIB fires the first true arm in `ScopeImpl.eventActivities` HashSet order, which varies between JVM runs, so one retained answer is a sample a replay cannot reproduce ([#79](https://github.com/mbackschat/bpmn-lean-experiment/issues/79)). The kernel refuses the input as `unsupported gateway-arms-simultaneous` ([CIB-LIM-0053](../../../docs/CIB-BPMN-RELATION-REGISTER.md#cib-lim-0053--the-kernel-refuses-competing-conditional-items-true-at-one-evaluation-cib-fires-one-of-them)); `arms.bpmn` stays as the kernel's preemption-test model. |
| [kernel-submission-outside-domain](kernel-submission-outside-domain.scenario.json) | catches | PC-DATA-02 | Kernel-only: `Prepare` is completed with a value nested beyond the value domain, which is rejected `value-outside-domain`, then with `ready` true; `Proceed_Ready` completes. |

## Notes for the target runners

- A write is addressed to the open wait or Human Task whose scope it is written in; a variable written while `Prepare` is open is written before the token reaches the catch or gateway.
- A gateway arm is addressed by its catch Event and the activation of the gateway occurrence that armed it.

The schedules carry no expected route, open wait, variable or Process state; the retained CIB evidence is the answer.

The `kernel-only` schedules name no CIB revision (`not-applicable`), so no CIB run takes them, and the differential compares the Lean kernel with the TypeScript kernel on them.
