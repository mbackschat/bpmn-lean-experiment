# Timer Start Event scenario

The [answer-free scenario](scenario.json) executes the byte-identical [BPMN source](process.bpmn) admitted under the [`bpmn-2.0.2` profile](../../profiles/bpmn-2.0.2/profile.json) and governed by the [Timer Start Event specification](../../docs/kernel/semantics/SUBSCRIPTIONS-SEMANTICS-SPEC.md).

The first stimulus resolves `TimerStart_PT1S` and creates semantic instance `TimerStartInstance_1` after its exact `PT1S` occurrence. The second stimulus completes `UserTask_AfterTimer` activation 1 with no submitted values.

The scenario contains source identity and semantic inputs only. It carries no expected result, CIB runner target, retained CIB evidence, due time, schedule identity, Workflow identity, initial variables, or scheduling policy.
