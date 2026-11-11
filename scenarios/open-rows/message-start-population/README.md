# Message start and publication populations

Answer-free population schedules for [PC-MESSAGE-02](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) (several root Message Starts, definition and version resolution, content-bound start recovery) and the population half of [PC-MESSAGE-08](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) (a publication that selects among the instances of every deployment by typed criteria and delivered variables). The [subscriptions semantics](../../../docs/kernel/semantics/SUBSCRIPTIONS-SEMANTICS-SPEC.md#starts) and the [population semantics](../../../docs/kernel/semantics/POPULATION-SEMANTICS-SPEC.md#start-selection) own the meaning; these inputs only exercise it. Each is a closed [engine population scenario](../../../contracts/schemas/engine-population-scenario.schema.json): the definitions deploy in the order listed (or at their `deploy` step), then the steps run in order at their logical times.

A `publish` step addresses a Message by its name (the `cibseven-2.2.0` schedules) or by its channel (the `bpmn-2.0.2` schedules), optionally within one definition selected by process key (the current deployment) or by deployment ordinal, and states its criteria as typed matches. The mode `startOnly` reaches only a Message Start, `executionsOnly` only a waiting catch and `any` a waiting catch first and a Message Start otherwise. The started instances' identities are derived by the engine, so no schedule addresses one of them.

The CIB schedules run under `cibseven-2.2.0` with no source overlay; their CIB answer comes from the CIB runner's population mode in the hosted lane and is retained beside each schedule. The three replay schedules are kernel-only under `bpmn-2.0.2`: CIB keeps no command ledger, so a retained CIB answer to them would say nothing about the kernel's contract.

## Models

| Model | What it holds |
|---|---|
| [order-intake-v2](order-intake-v2.bpmn) | The process `Process_OrderIntake` of [order-intake](../message-start-compositions/order-intake.bpmn) with *Pick the order* renamed *Pick and pack the order*: a second version of one process key. |
| [order-intake-copy](order-intake-copy.bpmn) | A second process key, `Process_OrderIntakeCopy`, with one Message Start on the Message name `order-placed` into the User Task *Pick the copied order*. |
| [confirmation-intake](confirmation-intake.bpmn) | A Message Start on the Message name `order-confirmed` into the User Task *Record the confirmation*. |

The schedules also bind three models of other directories:

- [order-intake](../message-start-compositions/order-intake.bpmn): two Message Starts, `order-placed` and `order-amended`, each to its own User Task.
- [order-confirmation](../message-correlation-criteria/order-confirmation.bpmn): a None Start, the Message catch *Await confirmation* (`order-confirmed`) and the User Task *Fulfil the order*.
- [duplicate-message-starts](../message-start-compositions/duplicate-message-starts.bpmn): two Message Starts of one process on the one Message `order-placed`.

## Population schedules

| Schedule | Definitions | Target | Case it separates |
|---|---|---|---|
| [start-by-key-current-version](start-by-key-current-version.population-scenario.json) | order-intake, order-intake-v2 | CIB | Two versions of one process are deployed, then a start-only publication addresses the process key. |
| [start-by-exact-old-version](start-by-exact-old-version.population-scenario.json) | order-intake, order-intake-v2 | CIB | The same two versions, then a start-only publication addresses deployment 1. |
| [same-definition-deployed-twice](same-definition-deployed-twice.population-scenario.json) | order-intake | CIB | One definition is deployed twice; start-only publications address deployment 1, deployment 2 and the process key. |
| [publish-waiting-catch-wins-over-start](publish-waiting-catch-wins-over-start.population-scenario.json) | order-confirmation, confirmation-intake | CIB | An instance waits at a catch of `order-confirmed`, another definition starts on it; the name is published twice. |
| [publish-falls-back-to-start](publish-falls-back-to-start.population-scenario.json) | order-intake | CIB | No instance waits; `order-placed` and then `order-amended` are published in the default mode. |
| [criteria-select-one-of-two-instances](criteria-select-one-of-two-instances.population-scenario.json) | order-confirmation | CIB | Two instances wait at the catch with the Process variable `orderId` `A-1` and `B-2`; the criterion names `B-2`. |
| [criteria-ambiguous-two-instances](criteria-ambiguous-two-instances.population-scenario.json) | order-confirmation | CIB | Two instances wait at the catch with `orderId` `A-1`; the criterion names `A-1`. |
| [criteria-none-no-start-definition](criteria-none-no-start-definition.population-scenario.json) | order-confirmation | CIB | One instance waits with `orderId` `A-1`, no definition starts on the name, and the criterion names `Z-9`. |
| [delivery-variables-installed](delivery-variables-installed.population-scenario.json) | order-confirmation | CIB | The publication selects the one waiting instance by `orderId` and carries the variables `confirmedBy` and `packages`. |
| [object-valued-criterion-with-start](object-valued-criterion-with-start.population-scenario.json) | order-confirmation, confirmation-intake | CIB | An instance waits at the catch with `orderId` `A-1` and another definition starts on `order-confirmed`; the name is published with the criterion on `orderId` stated as a list, then as the String `A-1`. The kernel answers the first `unsupported correlation-criterion-not-primitive`, starting nothing, and delivers the second to the waiting instance; CIB is predicted to roll the first back, since its execution query refuses the list before it seeks a start (`SingleQueryVariableValueCondition.java:83-85`). |
| [start-only-with-criteria](start-only-with-criteria.population-scenario.json) | confirmation-intake | CIB | Three start-only publications of `order-confirmed`: one with the criterion `orderId` `A-1`, one with the business-key criterion `ORD-7`, then one without criteria. The kernel rejects the first (`criteria-start-only`), refuses the second (`unsupported start-criterion-not-variable`) and starts one instance for the third; CIB is predicted to roll the first back (`ensureCorrelationVariablesNotSet`), to start an instance under the business key `ORD-7` for the second, and to start one for the third. |
| [criterion-reaching-start](criterion-reaching-start.population-scenario.json) | confirmation-intake | CIB | No instance waits; `order-confirmed` is published in the default mode with the business-key criterion `ORD-7`, then with the criterion `orderId` `A-1`. The kernel refuses the first (`unsupported start-criterion-not-variable`) and starts one instance without variables for the second; CIB is predicted to start an instance under the business key `ORD-7` for the first and one without variables for the second, since a variable criterion only seeks a waiting execution. |
| [second-deployment-same-start-name-refused](second-deployment-same-start-name-refused.population-scenario.json) | order-intake, order-intake-copy | CIB | A second process key is deployed with a Message Start of the name `order-placed`, then that name is published. |
| [start-replay-same-command](start-replay-same-command.population-scenario.json) | order-intake | kernel-only, `bpmn-2.0.2` | A start-only publication on the direct Message `Message_OrderPlaced`, then the identical step again. |
| [start-replay-later-time](start-replay-later-time.population-scenario.json) | order-intake | kernel-only, `bpmn-2.0.2` | A start-only publication on the direct Message `Message_OrderPlaced` at 0, then the identical step at 60,000 ms. |
| [start-replay-different-content](start-replay-different-content.population-scenario.json) | order-intake | kernel-only, `bpmn-2.0.2` | A start-only publication, then the same `commandId` on the direct Message `Message_OrderAmended`. |
| [kernel-start-refusals-standards](kernel-start-refusals-standards.population-scenario.json) | order-intake, duplicate-message-starts, order-confirmation | kernel-only, `bpmn-2.0.2` | A start-only publication with a payload to a start that writes none, one that reaches both starts of one process, one selecting a missing process key, then a caller's delivery that carries variables. |
| [kernel-business-key-and-criteria](kernel-business-key-and-criteria.population-scenario.json) | order-confirmation | kernel-only, `cibseven-2.2.0` | An instance under the business key `ORD-7`: a publication under `ORD-9`, one naming the criterion `orderId` twice, one under `ORD-7`, then one on the channel while the instance waits at its task. |

The schedules carry no expected deployment, instance, task, variable or resolution.
