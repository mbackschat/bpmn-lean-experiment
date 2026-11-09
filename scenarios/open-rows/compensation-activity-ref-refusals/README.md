# Compensation throws that name an activity outside their scope

This directory serves [PC-COMPENSATION-02](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): a wrong-scope `activityRef` cannot compensate other work. Each model is project-authored MIT source for the `cibseven-2.2.0` profile, and each is answer-free: CIB Seven `2.2.0` supplies the retained answer, whether it deploys the model or refuses it. The explicit-scope cases that a model can express are in [compensation-regions](../compensation-regions/README.md) and [compensation-targeting](../compensation-targeting/README.md).

| Schedule | Model | What the throw names |
|---|---|---|
| [outer-throw-names-inner-activity](outer-throw-names-inner-activity.scenario.json) | [outer-throw-inner-ref](outer-throw-inner-ref.bpmn) | An Intermediate throw at the Process level names `UserTask_InnerWork`, an activity inside the Sub-Process `SubProcess_Region`. |
| [inner-throw-names-outer-activity](inner-throw-names-outer-activity.scenario.json) | [inner-throw-outer-ref](inner-throw-outer-ref.bpmn) | An Intermediate throw inside `SubProcess_Region` names `UserTask_OuterWork`, an activity of the enclosing Process. |
| [throw-names-a-start-event](throw-names-a-start-event.scenario.json) | [non-activity-ref](non-activity-ref.bpmn) | An Intermediate throw names `StartEvent_Start`, an element that is not an Activity; the schedule then completes `UserTask_Work` and `UserTask_After`. |

The first two schedules consist of the start only, because the interest is whether the definition is admitted at all. A reference to an id that no element carries is not authored: the kernel source reader refuses an unresolved reference before it can run any schedule.

The schedules carry no expected deployment outcome or Process state; the retained CIB evidence is the answer.
