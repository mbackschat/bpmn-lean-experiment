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

private def programAccepted (contents : String) : Bool :=
  match parseWireJson contents >>= decodeProgram with
  | .ok _ => true
  | .error _ => false

theorem duplicate_json_key_is_rejected :
    parseRejected "{\"id\":1,\"id\":1}" = true := by
  native_decide

theorem escape_equivalent_duplicate_json_key_is_rejected :
    parseRejected "{\"id\":1,\"\\u0069d\":1}" = true := by
  native_decide

theorem unpaired_surrogate_is_rejected :
    parseRejected "{\"id\":\"\\ud800\"}" = true := by
  native_decide

theorem maximum_safe_wire_nat_is_accepted :
    isSafeWireNat 9007199254740991 = true := by decide

theorem first_unsafe_wire_nat_is_rejected :
    isSafeWireNat 9007199254740992 = false := by decide

theorem bmp_scalar_precedes_supplementary_scalar :
    compare "\uE000" "𐀀" = .lt := by native_decide

theorem canonically_equivalent_strings_remain_distinct :
    ("e\u0301" : String) ≠ "\u00E9" := by decide

theorem scenario_unknown_field_is_rejected :
    scenarioRejected "{\"kind\":\"scenario\",\"id\":\"s\",\"profile\":\"p\",\"bpmn\":{\"id\":\"b\",\"relativePath\":\"b\",\"sha256\":\"x\"},\"stimuli\":[],\"observations\":[],\"provenance\":{\"normativeRefs\":[],\"cibRevision\":\"r\",\"cibRefs\":[]},\"unexpected\":true}" = true := by
  native_decide

theorem scenario_missing_profile_is_rejected :
    scenarioRejected "{\"kind\":\"scenario\",\"id\":\"s\",\"bpmn\":{\"id\":\"b\",\"relativePath\":\"b\",\"sha256\":\"x\"},\"stimuli\":[],\"observations\":[],\"provenance\":{\"normativeRefs\":[],\"cibRevision\":\"r\",\"cibRefs\":[]}}" = true := by
  native_decide

theorem scenario_unknown_observation_is_rejected :
    scenarioRejected "{\"kind\":\"scenario\",\"id\":\"s\",\"profile\":\"p\",\"bpmn\":{\"id\":\"b\",\"relativePath\":\"b\",\"sha256\":\"x\"},\"stimuli\":[],\"observations\":[\"unknown\"],\"provenance\":{\"normativeRefs\":[],\"cibRevision\":\"r\",\"cibRefs\":[]}}" = true := by
  native_decide

theorem scenario_unsafe_activation_is_rejected :
    scenarioRejected "{\"kind\":\"scenario\",\"id\":\"s\",\"profile\":\"p\",\"bpmn\":{\"id\":\"b\",\"relativePath\":\"b\",\"sha256\":\"x\"},\"stimuli\":[{\"kind\":\"completeUserTaskInstance\",\"commandId\":\"c\",\"taskId\":{\"processInstanceId\":\"i\",\"elementId\":\"t\",\"activation\":9007199254740992}}],\"observations\":[],\"provenance\":{\"normativeRefs\":[],\"cibRevision\":\"r\",\"cibRefs\":[]}}" = true := by
  native_decide

theorem null_value_with_payload_is_rejected :
    scenarioRejected "{\"kind\":\"scenario\",\"id\":\"s\",\"profile\":\"p\",\"bpmn\":{\"id\":\"b\",\"relativePath\":\"b\",\"sha256\":\"x\"},\"stimuli\":[{\"kind\":\"completeEffect\",\"commandId\":\"c\",\"effectId\":{\"processInstanceId\":\"i\",\"elementId\":\"e\",\"activation\":1},\"result\":{\"kind\":\"bpmnError\",\"code\":\"E\",\"message\":null,\"localPatch\":[{\"name\":\"v\",\"value\":{\"kind\":\"null\",\"value\":\"forbidden\"}}]}}],\"observations\":[],\"provenance\":{\"normativeRefs\":[],\"cibRevision\":\"r\",\"cibRefs\":[]}}" = true := by
  native_decide

theorem empty_bpmn_error_message_is_rejected :
    scenarioRejected "{\"kind\":\"scenario\",\"id\":\"s\",\"profile\":\"p\",\"bpmn\":{\"id\":\"b\",\"relativePath\":\"b\",\"sha256\":\"x\"},\"stimuli\":[{\"kind\":\"completeEffect\",\"commandId\":\"c\",\"effectId\":{\"processInstanceId\":\"i\",\"elementId\":\"e\",\"activation\":1},\"result\":{\"kind\":\"bpmnError\",\"code\":\"E\",\"message\":\"\",\"localPatch\":[]}}],\"observations\":[],\"provenance\":{\"normativeRefs\":[],\"cibRevision\":\"r\",\"cibRefs\":[]}}" = true := by
  native_decide

theorem checked_user_task_with_null_name_is_accepted :
    checkedProcessAccepted "{\"kind\":\"checkedProcess\",\"identity\":{\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceSha256\":\"x\"},\"processId\":\"p\",\"definitionScopes\":[{\"id\":\"scope:p\",\"parentScopeId\":null,\"originElementId\":\"p\"}],\"nodeScopes\":[{\"nodeId\":\"t\",\"scopeId\":\"scope:p\"}],\"sequenceFlowScopes\":[],\"nodes\":[{\"kind\":\"userTask\",\"id\":\"t\",\"name\":null}],\"sequenceFlows\":[]}" = true := by
  native_decide

theorem checked_user_task_without_name_is_rejected :
    checkedProcessAccepted "{\"kind\":\"checkedProcess\",\"identity\":{\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceSha256\":\"x\"},\"processId\":\"p\",\"definitionScopes\":[{\"id\":\"scope:p\",\"parentScopeId\":null,\"originElementId\":\"p\"}],\"nodeScopes\":[{\"nodeId\":\"t\",\"scopeId\":\"scope:p\"}],\"sequenceFlowScopes\":[],\"nodes\":[{\"kind\":\"userTask\",\"id\":\"t\"}],\"sequenceFlows\":[]}" = false := by
  native_decide

theorem checked_event_based_gateway_exact_shape_is_accepted :
    checkedProcessAccepted "{\"kind\":\"checkedProcess\",\"identity\":{\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceSha256\":\"x\"},\"processId\":\"p\",\"definitionScopes\":[{\"id\":\"scope:p\",\"parentScopeId\":null,\"originElementId\":\"p\"}],\"nodeScopes\":[{\"nodeId\":\"g\",\"scopeId\":\"scope:p\"}],\"sequenceFlowScopes\":[],\"nodes\":[{\"direction\":\"diverging\",\"id\":\"g\",\"kind\":\"eventBasedGateway\"}],\"sequenceFlows\":[]}" = true := by
  native_decide

theorem event_race_operation_exact_shape_is_accepted :
    programAccepted "{\"kind\":\"semanticProcess\",\"identity\":{\"compiler\":\"bpmn-source-semantic-process\",\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceSha256\":\"x\"},\"processId\":\"p\",\"definitionScopes\":[],\"operationScopes\":[],\"controlPlaceScopes\":[],\"controlPlaces\":[],\"operations\":[{\"id\":\"race\",\"input\":\"in\",\"kind\":\"awaitEventRace\",\"message\":{\"channel\":{\"interfaceId\":\"i\",\"interfaceOperationId\":\"o\",\"kind\":\"operationMessage\",\"messageId\":\"m\"},\"configurationOrigin\":{\"elementId\":\"fm\",\"kind\":\"bpmnSequenceFlow\"},\"elementId\":\"message\",\"output\":\"om\"},\"origin\":{\"elementId\":\"g\",\"kind\":\"bpmnElement\"},\"timer\":{\"configurationOrigin\":{\"elementId\":\"ft\",\"kind\":\"bpmnSequenceFlow\"},\"durationMs\":1000,\"elementId\":\"timer\",\"output\":\"ot\"}}]}" = true := by
  native_decide

theorem event_race_operation_without_configuration_origin_is_rejected :
    programAccepted "{\"kind\":\"semanticProcess\",\"identity\":{\"compiler\":\"bpmn-source-semantic-process\",\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceSha256\":\"x\"},\"processId\":\"p\",\"definitionScopes\":[],\"operationScopes\":[],\"controlPlaceScopes\":[],\"controlPlaces\":[],\"operations\":[{\"id\":\"race\",\"input\":\"in\",\"kind\":\"awaitEventRace\",\"message\":{\"channel\":{\"interfaceId\":\"i\",\"interfaceOperationId\":\"o\",\"kind\":\"operationMessage\",\"messageId\":\"m\"},\"elementId\":\"message\",\"output\":\"om\"},\"origin\":{\"elementId\":\"g\",\"kind\":\"bpmnElement\"},\"timer\":{\"configurationOrigin\":{\"elementId\":\"ft\",\"kind\":\"bpmnSequenceFlow\"},\"durationMs\":1000,\"elementId\":\"timer\",\"output\":\"ot\"}}]}" = false := by
  native_decide

end BpmnSemantics.SemanticProcessJsonConformance
