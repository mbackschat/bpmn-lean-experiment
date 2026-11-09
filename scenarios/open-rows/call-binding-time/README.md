# Call Activity binding time and called-definition selection

Answer-free schedules for [PC-SCOPE-03](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): which definition a Call Activity reaches when its called element is a key, a key with a CIB binding (`camunda:calledElementBinding` `latest`, `deployment`, `version` or `versionTag`), a key held in a variable, an undeployed key or a key under a foreign namespace prefix, a key bound to a tenant, and which version it reaches when the callee is deployed twice. The [work semantics](../../../docs/kernel/semantics/WORK-SEMANTICS-SPEC.md) own the meaning; these inputs only exercise it, and the retained CIB Seven `2.2.0` answer is the row's target. They extend the single registered [Called-Process Call Activity scenario](../../called-process-call-activity/README.md) and the [Call variable mapping](../../call-variable-mapping/README.md). The profile is `cibseven-2.2.0` with no source overlay.

The called instance of a Call is addressed by the derived identity `call:<byte length>:<caller>:<byte length>:<Call element>:<activation>`.

## Models

| Model | What it holds |
|---|---|
| [binding-forms](binding-forms.bpmn) | `Process_BindingCaller` takes the Process variable `route` at an Exclusive Gateway into one of seven Call Activities that all merge into the User Task *Confirm the request*: *Call the latest version* (`Process_Callee`, the default flow), *Call the deployed version* (binding `deployment`), *Call version 1* (binding `version`, version `1`), *Call version 2* (binding `version`, version `2`), *Call the key in a variable* (`${calleeKey}`), *Call an undeployed process* (`Process_Undeployed`) and *Call in another namespace* (`other:Process_Callee`, the prefix bound to a namespace the document does not use for its processes). The same document holds `Process_Callee`, whose only work is the User Task *Assess the request*. |
| [tag-binding](tag-binding.bpmn) | `Process_TagCaller` takes `route` into *Call the stable version* (binding `versionTag`, tag `stable`, the default flow) or *Call the beta version* (binding `versionTag`, tag `beta`), merging into *Confirm the request*. The same document holds `Process_Callee` with version tag `stable`. It is a model of its own because `camunda:versionTag` is a process attribute the kernel reader does not yet carry. |
| [tenant-binding](tenant-binding.bpmn) | `Process_TenantCaller` with one Call Activity *Call the callee of tenant A* (`Process_Callee`, `camunda:calledElementTenantId` `tenant-a`) leading to *Confirm the request*. The same document holds `Process_Callee` with no tenant. |
| [callee-v1](callee-v1.bpmn) | `Process_Callee` with version tag `stable` and the User Task `AssessRequest`. |
| [callee-v2](callee-v2.bpmn) | `Process_Callee` with version tag `next` and the User Task renamed `AssessRequestRevised`: a second version of one process key. |
| [versioned-caller](versioned-caller.bpmn) | `Process_VersionedCaller` takes `route` into four Call Activities of `Process_Callee`: *Call the latest version* (the default flow), *Call version 1* (binding `version`, version `1`), *Call the stable version* (binding `versionTag`, tag `stable`) and *Call the deployed version* (binding `deployment`), merging into *Confirm the request*. It holds no callee. |

## Single-instance schedules

Every schedule but the last starts a caller with the Process variable `route` set to a String, and the last starts with no variable; a schedule that reaches a called instance completes its User Task *Assess the request* and then *Confirm the request*, and the others stop after the start.

| Schedule | Model | `route` | Call reached |
|---|---|---|---|
| [call-latest](call-latest.scenario.json) | binding-forms | `latest` | *Call the latest version*. |
| [call-deployment](call-deployment.scenario.json) | binding-forms | `deployment` | *Call the deployed version*. |
| [call-version](call-version.scenario.json) | binding-forms | `version` | *Call version 1*. |
| [call-dynamic](call-dynamic.scenario.json) | binding-forms | `dynamic`, with `calleeKey` set to `Process_Callee` | *Call the key in a variable*. |
| [call-version-absent](call-version-absent.scenario.json) | binding-forms | `version-absent` | *Call version 2*. |
| [call-missing](call-missing.scenario.json) | binding-forms | `missing` | *Call an undeployed process*. |
| [call-other-namespace](call-other-namespace.scenario.json) | binding-forms | `namespace` | *Call in another namespace*. |
| [call-tag](call-tag.scenario.json) | tag-binding | `stable` | *Call the stable version*. |
| [call-tag-unknown](call-tag-unknown.scenario.json) | tag-binding | `unknown-tag` | *Call the beta version*. |
| [call-tenant-selector](call-tenant-selector.scenario.json) | tenant-binding | none | *Call the callee of tenant A*. |

## Population schedule

A closed [engine population scenario](../../../contracts/schemas/engine-population-scenario.schema.json): definitions deployed in the order listed, then the steps in order.

| Schedule | Definitions | Case it separates |
|---|---|---|
| [callee-two-versions](callee-two-versions.population-scenario.json) | callee-v1, callee-v2, versioned-caller | Four callers start with `route` `latest`, `version-one`, `tag-stable` and `deployment` while two versions of `Process_Callee` are deployed and the caller's own document holds none. |

The schedules carry no expected called definition, task or variable; the retained CIB evidence is the answer.
