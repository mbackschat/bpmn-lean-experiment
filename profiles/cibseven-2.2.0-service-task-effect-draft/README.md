# CIB Seven 2.2.0 Service Task effect profile

The [immutable profile artifact](profile.json) selects one private executable `None Start Event → Service Task → None End Event` Process with the exact paired `implementation="urn:bpmn-lean:effect:probe-v1"`, `{http://camunda.org/schema/1.0/bpmn}delegateExpression="${bpmnLeanEffectHandler}"`, and `{http://camunda.org/schema/1.0/bpmn}asyncBefore="true"` binding.

The profile claims only the selected extension `CIB-EXT-0001` under the explicit disabled-executor/manual-release configuration `CIB-CFG-0002`. CIB exposes a pre-activation continuation wait and atomic delegate invocation plus Service Task completion; mapping that wait to the project effect occurrence is adapter-decided rather than an independent CIB derivation.

General JUEL, arbitrary Java delegates or beans, variables, service faults, BPMN Errors, retry exhaustion semantics, incidents, cancellation, and external tasks remain excluded.
