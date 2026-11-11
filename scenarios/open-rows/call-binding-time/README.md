# Call Activity binding time and called-definition selection

Answer-free schedules for [PC-SCOPE-03](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): which definition a Call Activity reaches when its called element is a key, a key with a CIB binding (`camunda:calledElementBinding` `latest`, `deployment`, `version` or `versionTag`), a key held in a variable, an undeployed key, a key under a foreign namespace prefix or under a prefix bound nowhere, and a key bound to a tenant. The [work semantics](../../../docs/kernel/semantics/WORK-SEMANTICS-SPEC.md) own the meaning; these inputs only exercise it, and the retained CIB Seven `2.2.0` answer is the row's target. They extend the single registered [Called-Process Call Activity scenario](../../called-process-call-activity/README.md) and the [Call variable mapping](../../call-variable-mapping/README.md). The profile is `cibseven-2.2.0` with no source overlay.

Each Call form has a model and a schedule of its own, because one model holding every form is refused as a whole when any one of its Calls cannot be resolved, which hides the forms that could be compared. The called instance of a Call is addressed by the derived identity `call:<byte length>:<caller>:<byte length>:<Call element>:<activation>`. Which version of a called process a Call reaches when the callee is deployed more than once is exercised by the population witnesses in [call-binding-versions](../call-binding-versions/README.md).

## Models

Every per-form model holds `Process_BindingCaller` (`Process_TagCaller` for the tag forms) with one Call Activity leading to the User Task *Confirm the request*, and the same document's `Process_Callee`, whose only work is the User Task *Assess the request*.

| Model | Call Activity |
|---|---|
| [binding-latest](binding-latest.bpmn) | *Call the latest version* (`Process_Callee`, the default binding). |
| [binding-deployment](binding-deployment.bpmn) | *Call the deployed version* (binding `deployment`). |
| [binding-version-1](binding-version-1.bpmn) | *Call version 1* (binding `version`, version `1`). |
| [binding-version-2-missing](binding-version-2-missing.bpmn) | *Call version 2* (binding `version`, version `2`). |
| [binding-missing](binding-missing.bpmn) | *Call an undeployed process* (`Process_Undeployed`). |
| [binding-other-namespace](binding-other-namespace.bpmn) | *Call in another namespace* (`other:Process_Callee`, the prefix bound to a namespace the document does not use for its processes). |
| [binding-unbound-prefix](binding-unbound-prefix.bpmn) | *Call under an unbound prefix* (`nobound:Process_Callee`, the prefix declared nowhere); the value is no valid `xsd:QName`, so the document does not validate against the BPMN schema. |
| [binding-dynamic](binding-dynamic.bpmn) | *Call the key in a variable* (`${calleeKey}`); the value is no valid `xsd:QName`, so the document does not validate against the BPMN schema. |
| [tag-stable](tag-stable.bpmn) | *Call the stable version* (binding `versionTag`, tag `stable`); `Process_Callee` carries the version tag `stable`. |
| [tag-unknown](tag-unknown.bpmn) | *Call the beta version* (binding `versionTag`, tag `beta`); `Process_Callee` carries the version tag `stable`. |
| [tenant-binding](tenant-binding.bpmn) | `Process_TenantCaller` with one Call Activity *Call the callee of tenant A* (`Process_Callee`, `camunda:calledElementTenantId` `tenant-a`) leading to *Confirm the request*. The same document holds `Process_Callee` with no tenant. |

## Single-instance schedules

Each schedule starts its caller (`binding-dynamic` with the Process variable `calleeKey` set to `Process_Callee`, the others with no variable). The five schedules marked below then complete the User Task *Assess the request* of the called instance and the caller's *Confirm the request*; the others stop after the start.

| Schedule | Model | Completes the called instance's task |
|---|---|---|
| [binding-latest](binding-latest.scenario.json) | binding-latest | yes |
| [binding-deployment](binding-deployment.scenario.json) | binding-deployment | yes |
| [binding-version-1](binding-version-1.scenario.json) | binding-version-1 | yes |
| [binding-version-2-missing](binding-version-2-missing.scenario.json) | binding-version-2-missing | no |
| [binding-missing](binding-missing.scenario.json) | binding-missing | no |
| [binding-other-namespace](binding-other-namespace.scenario.json) | binding-other-namespace | no |
| [binding-unbound-prefix](binding-unbound-prefix.scenario.json) | binding-unbound-prefix | no |
| [binding-dynamic](binding-dynamic.scenario.json) | binding-dynamic | yes |
| [tag-stable](tag-stable.scenario.json) | tag-stable | yes |
| [tag-unknown](tag-unknown.scenario.json) | tag-unknown | no |
| [call-tenant-selector](call-tenant-selector.scenario.json) | tenant-binding | no |

The schedules carry no expected called definition, task or variable; the retained CIB evidence is the answer.
