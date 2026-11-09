# Error boundaries whose code names a Java class

This directory serves [PC-ERROR-01](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) and [PC-AUTO-02](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): whether an Error boundary whose `errorCode` is a Java class name catches the technical failure of an effect, and whether a typed business failure with such a code reaches the same boundary. Both models are project-authored MIT source for the `cibseven-2.2.0` profile; every schedule is answer-free and CIB Seven `2.2.0` supplies the retained answer.

Each model runs one async Service Task `Settle`, a delegated effect answered by an `effectResult` stimulus, with one exact Error boundary that leads to the Human Task `Recover`. The two models differ only in the code of that boundary.

| Model | Boundary `errorCode` |
|---|---|
| [runtime-exception-code](runtime-exception-code.bpmn) | `java.lang.RuntimeException` |
| [illegal-state-code](illegal-state-code.bpmn) | `java.lang.IllegalStateException` |

A technical failure of an effect is a `technicalFailure` stimulus, which the schedule enables incidents for; a business failure carries a code and no output.

| Scenario | Model | Case it separates |
|---|---|---|
| [runtime-exception-technical-failure](runtime-exception-technical-failure.scenario.json) | runtime-exception-code | A technical failure against a boundary that names a Java class, so the catch, or the incident, is observed. |
| [runtime-exception-business-failure](runtime-exception-business-failure.scenario.json) | runtime-exception-code | A business failure whose code is that class name, so the boundary is reached by a typed code that happens to be a class name. |
| [illegal-state-technical-failure](illegal-state-technical-failure.scenario.json) | illegal-state-code | The same technical failure against a boundary that names a different class, so the exact class name and the class hierarchy are told apart. |
| [illegal-state-business-failure](illegal-state-business-failure.scenario.json) | illegal-state-code | A business failure with the code `java.lang.RuntimeException` against a boundary for another class, which no code equality satisfies. |

The schedules carry no expected route, Process state or incident; the retained CIB evidence is the answer.

Runner realization: a technical failure that the boundary catches completes the job instead of failing it, so the CIB runner must record that completion as the step's outcome rather than as a harness failure.
