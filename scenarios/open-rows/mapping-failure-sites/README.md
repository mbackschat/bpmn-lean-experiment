# Absence, null, mapping error and evaluator failure at mapping sites

Answer-free schedules for [PC-DATA-09](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): absence, null and evaluator-failure behavior at entry and completion, so that a missing source, a present Null and a throwing expression each get their own evidence, with the state and publication that follow. The [data semantics](../../../docs/kernel/semantics/DATA-SEMANTICS-SPEC.md) own the account; the retained CIB Seven `2.2.0` answer is the target. The profile is `cibseven-2.2.0` with no source overlay. The wrong-result-type cases of the row are in [condition-expression-routing](../condition-expression-routing/README.md) (a gateway condition that is not Boolean) and [expression-cardinality-and-collections](../expression-cardinality-and-collections/README.md) (a count or collection of the wrong type); the evaluator failures of single expressions are in [juel-evaluation-failures](../juel-evaluation-failures/README.md); the Service result failures are in [output-mapping-fanout](../output-mapping-fanout/README.md).

[failure-sites.bpmn](failure-sites.bpmn) holds one mapping site per probe behind an Exclusive Gateway whose JUEL conditions test the start variable `probe`; all branches merge before the End Event. The sites are the input mapping of a User Task (*entry*), the output mapping of a User Task (*exit*), the output mapping of a Sub-Process (*scope exit*) and the `camunda:in` and `camunda:out` mappings of a Call Activity of the Process *Peek*, whose one User Task publishes the input `x` it received. The `camunda:out` probe also maps `seed` in as `x`. The probe instance is `Probe_1`, so the called task of *call-out-absent* is addressed as `call:7:Probe_1:26:CallActivity_CallOutAbsent:1`.

| Schedule | Model | Case it separates | Row |
|---|---|---|---|
| [entry-missing](entry-missing.scenario.json) | [failure-sites](failure-sites.bpmn) | A User Task input whose source names no binding. | PC-DATA-09, PC-DATA-05 |
| [entry-null](entry-null.scenario.json) | [failure-sites](failure-sites.bpmn) | A User Task input whose source is a present Null. | PC-DATA-09, PC-DATA-05 |
| [entry-throws](entry-throws.scenario.json) | [failure-sites](failure-sites.bpmn) | A User Task input whose expression fails to evaluate (non-numeric text in arithmetic). | PC-DATA-09, PC-DATA-05 |
| [exit-missing](exit-missing.scenario.json) | [failure-sites](failure-sites.bpmn) | A User Task output whose source names no binding of the completion. | PC-DATA-09, PC-DATA-06 |
| [exit-null](exit-null.scenario.json) | [failure-sites](failure-sites.bpmn) | A User Task output whose source is a present Null in the completion. | PC-DATA-09, PC-DATA-06 |
| [exit-throws](exit-throws.scenario.json) | [failure-sites](failure-sites.bpmn) | A User Task output whose expression fails to evaluate over the completion. | PC-DATA-09, PC-DATA-06 |
| [scope-exit-missing](scope-exit-missing.scenario.json) | [failure-sites](failure-sites.bpmn) | A Sub-Process output whose source names no binding when the body completes. | PC-DATA-09, PC-DATA-04 |
| [call-in-absent](call-in-absent.scenario.json) | [failure-sites](failure-sites.bpmn) | A Call input whose source names no binding of the caller; the called task shows what the called Process received. | PC-DATA-09, PC-DATA-05 |
| [call-out-absent](call-out-absent.scenario.json) | [failure-sites](failure-sites.bpmn) | A Call output whose source names no binding of the called Process when it returns. | PC-DATA-09, PC-DATA-04 |

Notes for the target runners:

- A command that fails inside the engine must be recorded as the command outcome rather than as a harness failure.
- *call-in-absent* ends with the called task open; its observation is the published input `seenX` of the called instance.
