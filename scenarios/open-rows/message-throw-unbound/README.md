# Unbound Message throws and Message Flows

This directory serves [PC-MESSAGE-09](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): the CIB forms of a Message throw that name a Message but no delegate, and a Message Flow leaving a throw event. The [status model](status-notices.bpmn) is project-authored MIT source for the `cibseven-2.2.0` profile; every schedule is answer-free and CIB Seven `2.2.0` supplies the retained answer.

The model is a Collaboration of the executable Process `Process_StatusNotices` and a black-box participant `Customer`. After the Human Task `Prepare` the Process passes an Intermediate throw `Throw_BareMarker` whose `messageEventDefinition` only names a Message, an Intermediate throw `Throw_MessageFlow` that is the source of a Message Flow to `Customer`, and a Message End `MessageEnd_Bare` that only names a Message.

| Scenario | Case it exercises |
|---|---|
| [unbound-throws-pass-through](unbound-throws-pass-through.scenario.json) | Completing `Prepare` so the Process reaches all three unbound forms. |

The schedule carries no expected route, effect or Process state; the retained CIB evidence is the answer. The external-task form (`camunda:type="external"`) of a Message throw is not authored: no stimulus realizes an external task.
