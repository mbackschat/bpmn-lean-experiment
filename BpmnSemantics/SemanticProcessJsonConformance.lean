import BpmnSemantics.SemanticProcessJson

/-! Executable locks for language-neutral JSON and ordering behavior. -/

namespace BpmnSemantics.SemanticProcessJsonConformance

open BpmnSemantics.SemanticProcessJson

private def parseRejected (contents : String) : Bool :=
  match parseWireJson contents with
  | .ok _ => false
  | .error _ => true

private def scenarioRejected (contents : String) : Bool :=
  match parseWireJson contents >>= decodeScenario with
  | .ok _ => false
  | .error _ => true

private def checkedProcessAccepted (contents : String) : Bool :=
  match parseWireJson contents >>= decodeCheckedProcess with
  | .ok _ => true
  | .error _ => false

example : parseRejected "{\"id\":1,\"id\":1}" = true := by
  native_decide

example : parseRejected "{\"id\":1,\"\\u0069d\":1}" = true := by
  native_decide

example : parseRejected "{\"id\":\"\\ud800\"}" = true := by
  native_decide

example : isSafeWireNat 9007199254740991 = true := by decide
example : isSafeWireNat 9007199254740992 = false := by decide

example : compare "\uE000" "𐀀" = .lt := by native_decide
example : ("e\u0301" : String) ≠ "\u00E9" := by decide

example : scenarioRejected "{\"kind\":\"scenario\",\"id\":\"s\",\"profile\":\"p\",\"bpmn\":{\"id\":\"b\",\"relativePath\":\"b\",\"sha256\":\"x\"},\"stimuli\":[],\"observations\":[],\"provenance\":{\"normativeRefs\":[],\"cibRevision\":\"r\",\"cibRefs\":[]},\"unexpected\":true}" = true := by
  native_decide

example : scenarioRejected "{\"kind\":\"scenario\",\"id\":\"s\",\"bpmn\":{\"id\":\"b\",\"relativePath\":\"b\",\"sha256\":\"x\"},\"stimuli\":[],\"observations\":[],\"provenance\":{\"normativeRefs\":[],\"cibRevision\":\"r\",\"cibRefs\":[]}}" = true := by
  native_decide

example : scenarioRejected "{\"kind\":\"scenario\",\"id\":\"s\",\"profile\":\"p\",\"bpmn\":{\"id\":\"b\",\"relativePath\":\"b\",\"sha256\":\"x\"},\"stimuli\":[],\"observations\":[\"unknown\"],\"provenance\":{\"normativeRefs\":[],\"cibRevision\":\"r\",\"cibRefs\":[]}}" = true := by
  native_decide

example : scenarioRejected "{\"kind\":\"scenario\",\"id\":\"s\",\"profile\":\"p\",\"bpmn\":{\"id\":\"b\",\"relativePath\":\"b\",\"sha256\":\"x\"},\"stimuli\":[{\"kind\":\"completeUserTaskInstance\",\"commandId\":\"c\",\"taskId\":{\"processInstanceId\":\"i\",\"elementId\":\"t\",\"activation\":9007199254740992}}],\"observations\":[],\"provenance\":{\"normativeRefs\":[],\"cibRevision\":\"r\",\"cibRefs\":[]}}" = true := by
  native_decide

example : scenarioRejected "{\"kind\":\"scenario\",\"id\":\"s\",\"profile\":\"p\",\"bpmn\":{\"id\":\"b\",\"relativePath\":\"b\",\"sha256\":\"x\"},\"stimuli\":[{\"kind\":\"completeEffect\",\"commandId\":\"c\",\"effectId\":{\"processInstanceId\":\"i\",\"elementId\":\"e\",\"activation\":1},\"result\":{\"kind\":\"bpmnError\",\"code\":\"E\",\"message\":null,\"localPatch\":[{\"name\":\"v\",\"value\":{\"kind\":\"null\",\"value\":\"forbidden\"}}]}}],\"observations\":[],\"provenance\":{\"normativeRefs\":[],\"cibRevision\":\"r\",\"cibRefs\":[]}}" = true := by
  native_decide

example : scenarioRejected "{\"kind\":\"scenario\",\"id\":\"s\",\"profile\":\"p\",\"bpmn\":{\"id\":\"b\",\"relativePath\":\"b\",\"sha256\":\"x\"},\"stimuli\":[{\"kind\":\"completeEffect\",\"commandId\":\"c\",\"effectId\":{\"processInstanceId\":\"i\",\"elementId\":\"e\",\"activation\":1},\"result\":{\"kind\":\"bpmnError\",\"code\":\"E\",\"message\":\"\",\"localPatch\":[]}}],\"observations\":[],\"provenance\":{\"normativeRefs\":[],\"cibRevision\":\"r\",\"cibRefs\":[]}}" = true := by
  native_decide

example : checkedProcessAccepted "{\"kind\":\"checkedProcess\",\"identity\":{\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceSha256\":\"x\"},\"processId\":\"p\",\"definitionScopes\":[{\"id\":\"scope:p\",\"parentScopeId\":null,\"originElementId\":\"p\"}],\"nodeScopes\":[{\"nodeId\":\"t\",\"scopeId\":\"scope:p\"}],\"sequenceFlowScopes\":[],\"nodes\":[{\"kind\":\"userTask\",\"id\":\"t\",\"name\":null}],\"sequenceFlows\":[]}" = true := by
  native_decide

example : checkedProcessAccepted "{\"kind\":\"checkedProcess\",\"identity\":{\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceSha256\":\"x\"},\"processId\":\"p\",\"definitionScopes\":[{\"id\":\"scope:p\",\"parentScopeId\":null,\"originElementId\":\"p\"}],\"nodeScopes\":[{\"nodeId\":\"t\",\"scopeId\":\"scope:p\"}],\"sequenceFlowScopes\":[],\"nodes\":[{\"kind\":\"userTask\",\"id\":\"t\"}],\"sequenceFlows\":[]}" = false := by
  native_decide

end BpmnSemantics.SemanticProcessJsonConformance
