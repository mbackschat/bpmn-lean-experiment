# Call binding across versions of the called process

Answer-free population schedules for [PC-SCOPE-03](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): which version of a called process a Call Activity reaches when the callee is deployed twice, before or after its caller, under a version tag shared by two versions, or inside the caller's own deployment. They extend the single-instance [per-form witnesses](../call-binding-time/README.md) and sit beside the [assembly witnesses](../call-binding-population/README.md). The [work semantics](../../../docs/kernel/semantics/WORK-SEMANTICS-SPEC.md) and the [population semantics](../../../docs/kernel/semantics/POPULATION-SEMANTICS-SPEC.md) own the meaning; these inputs only exercise it. Each is a closed [engine population scenario](../../../contracts/schemas/engine-population-scenario.schema.json): the definitions deploy at their `deploy` steps, then the schedule starts the caller.

Every document shares the `targetNamespace` `urn:bpmn-lean:scenarios:call-binding-versions`, so the callers' unprefixed `calledElement` names `Process_Callee` in it under both resolutions. The called instance of a Call is addressed by the derived identity `call:<byte length>:<caller>:<byte length>:<Call element>:<activation>`.

The CIB schedules run under `cibseven-2.2.0` with no source overlay; their CIB answer comes from the CIB runner's population mode in the hosted lane, so none is retained yet. [recovery-keeps-binding](recovery-keeps-binding.population-scenario.json) is kernel-only under `bpmn-2.0.2`: it continues a running instance after a redeployment, which CIB's invocation-time resolution cannot separate from a fresh one.

## Models

| Model | What it holds |
|---|---|
| [callee-v1](callee-v1.bpmn) | `Process_Callee` with the User Task *Assess the request*. |
| [callee-v2](callee-v2.bpmn) | `Process_Callee` with the User Task *Assess the request thoroughly* (`AssessRequestThoroughly`). |
| [callee-stable](callee-stable.bpmn) | `Process_Callee` with `camunda:versionTag` `stable` and the User Task *Assess the request*. |
| [callee-beta](callee-beta.bpmn) | `Process_Callee` with `camunda:versionTag` `beta` and the User Task *Assess the request thoroughly*. |
| [caller-latest](caller-latest.bpmn) | `Process_Caller`: a None Start, the Call Activity *Call the callee* (`Process_Callee`, default binding) and the User Task *Confirm the request*. |
| [caller-version-1](caller-version-1.bpmn) | The same caller with binding `version` and version `1`. |
| [caller-tag-stable](caller-tag-stable.bpmn) | The same caller with binding `versionTag` and tag `stable`. |
| [caller-tag-beta](caller-tag-beta.bpmn) | The same caller with binding `versionTag` and tag `beta`. |
| [bound-document](bound-document.bpmn) | `Process_BoundCaller`, whose Call Activity names `Process_BoundCallee` with binding `deployment`, and `Process_BoundCallee` with the User Task *Assess the request in this deployment*, in one document. |

## Population schedules

| Schedule | Definitions | Target | Case it separates |
|---|---|---|---|
| [two-versions-latest-at-assembly](two-versions-latest-at-assembly.population-scenario.json) | callee-v1, callee-v2, caller-latest | CIB | Two callee versions are deployed, then a caller with the default binding, then the caller is started. |
| [two-versions-version-1](two-versions-version-1.population-scenario.json) | callee-v1, callee-v2, caller-version-1 | CIB | The same deployments with a caller bound to version 1. |
| [two-versions-tag](two-versions-tag.population-scenario.json) | callee-stable, callee-beta, caller-tag-stable | CIB | Two callees carrying the version tags `stable` and `beta`, then a caller bound to the tag `stable`. |
| [callee-redeployed-after-caller](callee-redeployed-after-caller.population-scenario.json) | callee-v1, caller-latest, callee-v2 | CIB | The caller is deployed between the two callee versions and started after both. |
| [tag-deployed-after-caller](tag-deployed-after-caller.population-scenario.json) | callee-stable, caller-tag-beta, callee-beta | CIB | The caller binds the tag `beta` and is deployed before the only callee carrying it. |
| [shared-tag-ambiguous](shared-tag-ambiguous.population-scenario.json) | callee-stable (twice), caller-tag-stable | CIB | Two versions of the callee carry the tag `stable`, and the caller binds that tag. |
| [callee-deployed-twice-same-bytes](callee-deployed-twice-same-bytes.population-scenario.json) | bound-document (twice) | CIB | One document holding a caller bound to its own deployment and its callee is deployed twice, then the caller of the latest deployment is started. |
| [recovery-keeps-binding](recovery-keeps-binding.population-scenario.json) | callee-v1, caller-latest, callee-v2 | kernel-only, `bpmn-2.0.2` | A caller is started and waits in its called instance, a second callee version is deployed, then the called instance's task and the caller's task complete. |

The schedules carry no expected deployment, called definition, task or variable.
