# Escalations without a catcher

This directory serves [PC-ESCALATION-01](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): an Intermediate and an End Escalation that find no catcher, beside a catch-all in an unrelated region. The [notice model](dispatch-notice.bpmn) is project-authored MIT source for the `cibseven-2.2.0` profile; every schedule is answer-free and CIB Seven `2.2.0` supplies the retained answer.

After a Parallel fork, three branches run. `Draft` leads into an Intermediate Escalation throw `NOBODY_LISTENS` and then `Publish`. `Check` leads into an Escalation End `NOBODY_LISTENS`. The Sub-Process `Unrelated` waits in `Wait` and carries a non-interrupting catch-all boundary leading to the Human Task `Observe`. No boundary or Event Sub-Process encloses the two throwers.

| Scenario | Case it exercises |
|---|---|
| [intermediate-uncaught](intermediate-uncaught.scenario.json) | The Intermediate throw without a catcher, with a catch-all boundary in a sibling region. |
| [end-uncaught-then-ordinary-path](end-uncaught-then-ordinary-path.scenario.json) | The uncaught Escalation End first, then the other branch's ordinary path past its own uncaught throw. |

The schedules carry no expected outcome, route or Process state; the retained CIB evidence is the answer. The [propagation semantics](../../../docs/kernel/semantics/PROPAGATION-SEMANTICS-SPEC.md#open-rows) name the uncaught continuation as the decision owed.
