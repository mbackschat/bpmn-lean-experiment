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
    isSafeWireNat 9007199254740991 = true := by decide +kernel

theorem first_unsafe_wire_nat_is_rejected :
    isSafeWireNat 9007199254740992 = false := by decide +kernel

theorem bmp_scalar_precedes_supplementary_scalar :
    compare "\uE000" "𐀀" = .lt := by native_decide

theorem canonically_equivalent_strings_remain_distinct :
    ("e\u0301" : String) ≠ "\u00E9" := by decide +kernel

theorem scenario_unknown_field_is_rejected :
    scenarioRejected "{\"kind\":\"scenario\",\"id\":\"s\",\"profile\":\"p\",\"bpmn\":{\"id\":\"b\",\"relativePath\":\"b\",\"sha256\":\"x\",\"sourceOverlay\":null},\"stimuli\":[],\"observations\":[],\"provenance\":{\"normativeRefs\":[],\"cibRevision\":\"r\",\"cibRefs\":[]},\"unexpected\":true}" = true := by
  native_decide

theorem scenario_missing_profile_is_rejected :
    scenarioRejected "{\"kind\":\"scenario\",\"id\":\"s\",\"bpmn\":{\"id\":\"b\",\"relativePath\":\"b\",\"sha256\":\"x\",\"sourceOverlay\":null},\"stimuli\":[],\"observations\":[],\"provenance\":{\"normativeRefs\":[],\"cibRevision\":\"r\",\"cibRefs\":[]}}" = true := by
  native_decide

theorem scenario_source_overlay_and_message_start_wire_contract :
    scenarioRejected "{\"kind\":\"scenario\",\"id\":\"s\",\"profile\":\"p\",\"bpmn\":{\"id\":\"b\",\"relativePath\":\"b\",\"sha256\":\"x\",\"sourceOverlay\":null},\"stimuli\":[],\"observations\":[],\"provenance\":{\"normativeRefs\":[],\"cibRevision\":\"r\",\"cibRefs\":[]}}" = false ∧
    scenarioRejected "{\"kind\":\"scenario\",\"id\":\"s\",\"profile\":\"p\",\"bpmn\":{\"id\":\"b\",\"relativePath\":\"b\",\"sha256\":\"x\"},\"stimuli\":[],\"observations\":[],\"provenance\":{\"normativeRefs\":[],\"cibRevision\":\"r\",\"cibRefs\":[]}}" = true ∧
    scenarioRejected "{\"kind\":\"scenario\",\"id\":\"s\",\"profile\":\"p\",\"bpmn\":{\"id\":\"b\",\"relativePath\":\"b\",\"sha256\":\"x\",\"sourceOverlay\":{\"id\":\"overlay\",\"sha256\":\"0000000000000000000000000000000000000000000000000000000000000001\"}},\"stimuli\":[],\"observations\":[],\"provenance\":{\"normativeRefs\":[],\"cibRevision\":\"r\",\"cibRefs\":[]}}" = false ∧
    scenarioRejected "{\"kind\":\"scenario\",\"id\":\"s\",\"profile\":\"p\",\"bpmn\":{\"id\":\"b\",\"relativePath\":\"b\",\"sha256\":\"x\",\"sourceOverlay\":{\"id\":\"overlay\",\"sha256\":\"bad\"}},\"stimuli\":[],\"observations\":[],\"provenance\":{\"normativeRefs\":[],\"cibRevision\":\"r\",\"cibRefs\":[]}}" = true ∧
    scenarioRejected "{\"kind\":\"scenario\",\"id\":\"s\",\"profile\":\"p\",\"bpmn\":{\"id\":\"b\",\"relativePath\":\"b\",\"sha256\":\"x\",\"sourceOverlay\":null},\"stimuli\":[{\"kind\":\"triggerMessageStart\",\"commandId\":\"c\",\"processId\":\"p\",\"instanceId\":\"i\",\"startEventId\":\"start\",\"channel\":{\"kind\":\"operationMessage\",\"interfaceId\":\"interface\",\"interfaceOperationId\":\"operation\",\"messageId\":\"message\"}}],\"observations\":[],\"provenance\":{\"normativeRefs\":[],\"cibRevision\":\"r\",\"cibRefs\":[]}}" = false ∧
    scenarioRejected "{\"kind\":\"scenario\",\"id\":\"s\",\"profile\":\"p\",\"bpmn\":{\"id\":\"b\",\"relativePath\":\"b\",\"sha256\":\"x\",\"sourceOverlay\":null},\"stimuli\":[{\"kind\":\"triggerMessageStart\",\"commandId\":\"c\",\"processId\":\"p\",\"instanceId\":\"i\",\"startEventId\":\"start\"}],\"observations\":[],\"provenance\":{\"normativeRefs\":[],\"cibRevision\":\"r\",\"cibRefs\":[]}}" = true ∧
    scenarioRejected "{\"kind\":\"scenario\",\"id\":\"s\",\"profile\":\"p\",\"bpmn\":{\"id\":\"b\",\"relativePath\":\"b\",\"sha256\":\"x\",\"sourceOverlay\":null},\"stimuli\":[{\"kind\":\"triggerMessageStart\",\"commandId\":\"c\",\"processId\":\"p\",\"instanceId\":\"i\",\"startEventId\":\"start\",\"channel\":{\"kind\":\"directMessage\",\"messageId\":\"message\"}}],\"observations\":[],\"provenance\":{\"normativeRefs\":[],\"cibRevision\":\"r\",\"cibRefs\":[]}}" = true ∧
    scenarioRejected "{\"kind\":\"scenario\",\"id\":\"s\",\"profile\":\"p\",\"bpmn\":{\"id\":\"b\",\"relativePath\":\"b\",\"sha256\":\"x\",\"sourceOverlay\":null},\"stimuli\":[{\"kind\":\"triggerMessageStart\",\"commandId\":\"c\",\"processId\":\"p\",\"instanceId\":\"i\",\"startEventId\":\"start\",\"channel\":{\"kind\":\"operationMessage\",\"interfaceId\":\"interface\",\"interfaceOperationId\":\"operation\",\"messageId\":\"message\"},\"unexpected\":true}],\"observations\":[],\"provenance\":{\"normativeRefs\":[],\"cibRevision\":\"r\",\"cibRefs\":[]}}" = true ∧
    scenarioRejected "{\"kind\":\"scenario\",\"id\":\"s\",\"profile\":\"p\",\"bpmn\":{\"id\":\"b\",\"relativePath\":\"b\",\"sha256\":\"x\",\"sourceOverlay\":null},\"stimuli\":[{\"kind\":\"triggerMessageStart\",\"commandId\":\"c\",\"processId\":\"p\",\"instanceId\":\"i\",\"startEventId\":\"start\",\"startEventId\":\"start\",\"channel\":{\"kind\":\"operationMessage\",\"interfaceId\":\"interface\",\"interfaceOperationId\":\"operation\",\"messageId\":\"message\"}}],\"observations\":[],\"provenance\":{\"normativeRefs\":[],\"cibRevision\":\"r\",\"cibRefs\":[]}}" = true := by
  native_decide

theorem scenario_unknown_observation_is_rejected :
    scenarioRejected "{\"kind\":\"scenario\",\"id\":\"s\",\"profile\":\"p\",\"bpmn\":{\"id\":\"b\",\"relativePath\":\"b\",\"sha256\":\"x\",\"sourceOverlay\":null},\"stimuli\":[],\"observations\":[\"unknown\"],\"provenance\":{\"normativeRefs\":[],\"cibRevision\":\"r\",\"cibRefs\":[]}}" = true := by
  native_decide

theorem scenario_unsafe_activation_is_rejected :
    scenarioRejected "{\"kind\":\"scenario\",\"id\":\"s\",\"profile\":\"p\",\"bpmn\":{\"id\":\"b\",\"relativePath\":\"b\",\"sha256\":\"x\",\"sourceOverlay\":null},\"stimuli\":[{\"kind\":\"completeUserTaskInstance\",\"commandId\":\"c\",\"taskId\":{\"processInstanceId\":\"i\",\"elementId\":\"t\",\"activation\":9007199254740992}}],\"observations\":[],\"provenance\":{\"normativeRefs\":[],\"cibRevision\":\"r\",\"cibRefs\":[]}}" = true := by
  native_decide

theorem null_value_with_payload_is_rejected :
    scenarioRejected "{\"kind\":\"scenario\",\"id\":\"s\",\"profile\":\"p\",\"bpmn\":{\"id\":\"b\",\"relativePath\":\"b\",\"sha256\":\"x\",\"sourceOverlay\":null},\"stimuli\":[{\"kind\":\"completeEffect\",\"commandId\":\"c\",\"effectId\":{\"processInstanceId\":\"i\",\"elementId\":\"e\",\"activation\":1},\"result\":{\"kind\":\"bpmnError\",\"code\":\"E\",\"message\":null,\"localPatch\":[{\"name\":\"v\",\"value\":{\"kind\":\"null\",\"value\":\"forbidden\"}}]}}],\"observations\":[],\"provenance\":{\"normativeRefs\":[],\"cibRevision\":\"r\",\"cibRefs\":[]}}" = true := by
  native_decide

theorem empty_bpmn_error_message_is_rejected :
    scenarioRejected "{\"kind\":\"scenario\",\"id\":\"s\",\"profile\":\"p\",\"bpmn\":{\"id\":\"b\",\"relativePath\":\"b\",\"sha256\":\"x\",\"sourceOverlay\":null},\"stimuli\":[{\"kind\":\"completeEffect\",\"commandId\":\"c\",\"effectId\":{\"processInstanceId\":\"i\",\"elementId\":\"e\",\"activation\":1},\"result\":{\"kind\":\"bpmnError\",\"code\":\"E\",\"message\":\"\",\"localPatch\":[]}}],\"observations\":[],\"provenance\":{\"normativeRefs\":[],\"cibRevision\":\"r\",\"cibRefs\":[]}}" = true := by
  native_decide

theorem checked_user_task_with_null_name_is_accepted :
    checkedProcessAccepted "{\"kind\":\"checkedProcess\",\"identity\":{\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"processId\":\"p\",\"definitionScopes\":[{\"id\":\"scope:p\",\"parentScopeId\":null,\"originElementId\":\"p\"}],\"nodeScopes\":[{\"nodeId\":\"t\",\"scopeId\":\"scope:p\"}],\"sequenceFlowScopes\":[],\"nodes\":[{\"kind\":\"userTask\",\"id\":\"t\",\"name\":null}],\"sequenceFlows\":[]}" = true := by
  native_decide

theorem checked_process_source_overlay_wire_contract :
    checkedProcessAccepted "{\"kind\":\"checkedProcess\",\"identity\":{\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":{\"id\":\"overlay\",\"sha256\":\"0000000000000000000000000000000000000000000000000000000000000001\"},\"sourceSha256\":\"x\"},\"processId\":\"p\",\"definitionScopes\":[],\"nodeScopes\":[],\"sequenceFlowScopes\":[],\"nodes\":[],\"sequenceFlows\":[]}" = true ∧
    checkedProcessAccepted "{\"kind\":\"checkedProcess\",\"identity\":{\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceSha256\":\"x\"},\"processId\":\"p\",\"definitionScopes\":[],\"nodeScopes\":[],\"sequenceFlowScopes\":[],\"nodes\":[],\"sequenceFlows\":[]}" = false ∧
    checkedProcessAccepted "{\"kind\":\"checkedProcess\",\"identity\":{\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":{\"id\":\"overlay\"},\"sourceSha256\":\"x\"},\"processId\":\"p\",\"definitionScopes\":[],\"nodeScopes\":[],\"sequenceFlowScopes\":[],\"nodes\":[],\"sequenceFlows\":[]}" = false ∧
    checkedProcessAccepted "{\"kind\":\"checkedProcess\",\"identity\":{\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":{\"id\":\"overlay\",\"sha256\":\"0000000000000000000000000000000000000000000000000000000000000001\",\"unexpected\":true},\"sourceSha256\":\"x\"},\"processId\":\"p\",\"definitionScopes\":[],\"nodeScopes\":[],\"sequenceFlowScopes\":[],\"nodes\":[],\"sequenceFlows\":[]}" = false ∧
    checkedProcessAccepted "{\"kind\":\"checkedProcess\",\"identity\":{\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":{\"id\":\"\",\"sha256\":\"0000000000000000000000000000000000000000000000000000000000000001\"},\"sourceSha256\":\"x\"},\"processId\":\"p\",\"definitionScopes\":[],\"nodeScopes\":[],\"sequenceFlowScopes\":[],\"nodes\":[],\"sequenceFlows\":[]}" = false := by
  native_decide

theorem checked_node_shapes_reject_missing_extra_and_malformed_fields :
    checkedProcessAccepted "{\"kind\":\"checkedProcess\",\"identity\":{\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"processId\":\"p\",\"definitionScopes\":[{\"id\":\"scope:p\",\"parentScopeId\":null,\"originElementId\":\"p\"}],\"nodeScopes\":[{\"nodeId\":\"t\",\"scopeId\":\"scope:p\"}],\"sequenceFlowScopes\":[],\"nodes\":[{\"kind\":\"userTask\",\"id\":\"t\"}],\"sequenceFlows\":[]}" = false ∧
    checkedProcessAccepted "{\"kind\":\"checkedProcess\",\"identity\":{\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"processId\":\"p\",\"definitionScopes\":[],\"nodeScopes\":[],\"sequenceFlowScopes\":[],\"nodes\":[{\"kind\":\"exclusiveMerge\"}],\"sequenceFlows\":[]}" = false ∧
    checkedProcessAccepted "{\"kind\":\"checkedProcess\",\"identity\":{\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"processId\":\"p\",\"definitionScopes\":[],\"nodeScopes\":[],\"sequenceFlowScopes\":[],\"nodes\":[{\"direction\":\"converging\",\"id\":\"m\",\"kind\":\"exclusiveMerge\"}],\"sequenceFlows\":[]}" = false ∧
    checkedProcessAccepted "{\"kind\":\"checkedProcess\",\"identity\":{\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"processId\":\"p\",\"definitionScopes\":[],\"nodeScopes\":[],\"sequenceFlowScopes\":[],\"nodes\":[{\"id\":1,\"kind\":\"exclusiveMerge\"}],\"sequenceFlows\":[]}" = false ∧
    checkedProcessAccepted "{\"kind\":\"checkedProcess\",\"identity\":{\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"processId\":\"p\",\"definitionScopes\":[],\"nodeScopes\":[],\"sequenceFlowScopes\":[],\"nodes\":[{\"id\":\"m\",\"id\":\"m\",\"kind\":\"exclusiveMerge\"}],\"sequenceFlows\":[]}" = false ∧
    checkedProcessAccepted "{\"kind\":\"checkedProcess\",\"identity\":{\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"processId\":\"p\",\"definitionScopes\":[],\"nodeScopes\":[],\"sequenceFlowScopes\":[],\"nodes\":[{\"id\":\"start\",\"kind\":\"messageStartEvent\"}],\"sequenceFlows\":[]}" = false ∧
    checkedProcessAccepted "{\"kind\":\"checkedProcess\",\"identity\":{\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"processId\":\"p\",\"definitionScopes\":[],\"nodeScopes\":[],\"sequenceFlowScopes\":[],\"nodes\":[{\"channel\":{\"kind\":\"directMessage\",\"messageId\":\"m\"},\"id\":\"start\",\"kind\":\"messageStartEvent\"}],\"sequenceFlows\":[]}" = false ∧
    checkedProcessAccepted "{\"kind\":\"checkedProcess\",\"identity\":{\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"processId\":\"p\",\"definitionScopes\":[],\"nodeScopes\":[],\"sequenceFlowScopes\":[],\"nodes\":[{\"channel\":{\"kind\":\"operationMessage\",\"interfaceId\":\"i\",\"interfaceOperationId\":\"o\",\"messageId\":\"m\"},\"id\":\"start\",\"kind\":\"messageStartEvent\",\"unexpected\":true}],\"sequenceFlows\":[]}" = false ∧
    checkedProcessAccepted "{\"kind\":\"checkedProcess\",\"identity\":{\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"processId\":\"p\",\"definitionScopes\":[],\"nodeScopes\":[],\"sequenceFlowScopes\":[],\"nodes\":[{\"channel\":{\"kind\":\"operationMessage\",\"interfaceId\":\"i\",\"interfaceOperationId\":\"o\",\"messageId\":\"m\"},\"id\":\"start\",\"id\":\"start\",\"kind\":\"messageStartEvent\"}],\"sequenceFlows\":[]}" = false := by
  native_decide

theorem checked_node_exact_shapes_are_accepted :
    checkedProcessAccepted "{\"kind\":\"checkedProcess\",\"identity\":{\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"processId\":\"p\",\"definitionScopes\":[{\"id\":\"scope:p\",\"parentScopeId\":null,\"originElementId\":\"p\"}],\"nodeScopes\":[{\"nodeId\":\"g\",\"scopeId\":\"scope:p\"}],\"sequenceFlowScopes\":[],\"nodes\":[{\"direction\":\"diverging\",\"id\":\"g\",\"kind\":\"eventBasedGateway\"}],\"sequenceFlows\":[]}" = true ∧
    checkedProcessAccepted "{\"kind\":\"checkedProcess\",\"identity\":{\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"processId\":\"p\",\"definitionScopes\":[],\"nodeScopes\":[],\"sequenceFlowScopes\":[],\"nodes\":[{\"id\":\"m\",\"kind\":\"exclusiveMerge\"}],\"sequenceFlows\":[]}" = true ∧
    checkedProcessAccepted "{\"kind\":\"checkedProcess\",\"identity\":{\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"processId\":\"p\",\"definitionScopes\":[],\"nodeScopes\":[],\"sequenceFlowScopes\":[],\"nodes\":[{\"channel\":{\"kind\":\"operationMessage\",\"interfaceId\":\"i\",\"interfaceOperationId\":\"o\",\"messageId\":\"m\"},\"id\":\"start\",\"kind\":\"messageStartEvent\"}],\"sequenceFlows\":[]}" = true := by
  native_decide

theorem semantic_operation_exact_shapes_are_accepted :
    programAccepted "{\"kind\":\"semanticProcess\",\"identity\":{\"compiler\":\"bpmn-source-semantic-process\",\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"processId\":\"p\",\"definitionScopes\":[],\"operationScopes\":[],\"controlPlaceScopes\":[],\"controlPlaces\":[],\"operations\":[{\"id\":\"race\",\"input\":\"in\",\"kind\":\"awaitEventRace\",\"message\":{\"channel\":{\"interfaceId\":\"i\",\"interfaceOperationId\":\"o\",\"kind\":\"operationMessage\",\"messageId\":\"m\"},\"configurationOrigin\":{\"elementId\":\"fm\",\"kind\":\"bpmnSequenceFlow\"},\"elementId\":\"message\",\"output\":\"om\"},\"origin\":{\"elementId\":\"g\",\"kind\":\"bpmnElement\"},\"timer\":{\"configurationOrigin\":{\"elementId\":\"ft\",\"kind\":\"bpmnSequenceFlow\"},\"durationMs\":1000,\"elementId\":\"timer\",\"output\":\"ot\"}}]}" = true ∧
    programAccepted "{\"kind\":\"semanticProcess\",\"identity\":{\"compiler\":\"bpmn-source-semantic-process\",\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"processId\":\"p\",\"definitionScopes\":[],\"operationScopes\":[],\"controlPlaceScopes\":[],\"controlPlaces\":[],\"operations\":[{\"id\":\"m\",\"inputs\":[\"a\",\"b\",\"c\"],\"kind\":\"mergeExclusive\",\"origin\":{\"elementId\":\"Merge\",\"kind\":\"bpmnElement\"},\"output\":\"out\"}]}" = true ∧
    programAccepted "{\"kind\":\"semanticProcess\",\"identity\":{\"compiler\":\"bpmn-source-semantic-process\",\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"processId\":\"p\",\"definitionScopes\":[],\"operationScopes\":[],\"controlPlaceScopes\":[],\"controlPlaces\":[],\"operations\":[{\"channel\":{\"kind\":\"operationMessage\",\"interfaceId\":\"i\",\"interfaceOperationId\":\"o\",\"messageId\":\"m\"},\"id\":\"start\",\"kind\":\"initiateMessage\",\"origin\":{\"elementId\":\"Start\",\"kind\":\"bpmnElement\"},\"outputs\":[\"out\"]}]}" = true := by
  native_decide

theorem semantic_process_source_overlay_wire_contract :
    programAccepted "{\"kind\":\"semanticProcess\",\"identity\":{\"compiler\":\"bpmn-source-semantic-process\",\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":{\"id\":\"overlay\",\"sha256\":\"0000000000000000000000000000000000000000000000000000000000000001\"},\"sourceSha256\":\"x\"},\"processId\":\"p\",\"definitionScopes\":[],\"operationScopes\":[],\"controlPlaceScopes\":[],\"controlPlaces\":[],\"operations\":[]}" = true ∧
    programAccepted "{\"kind\":\"semanticProcess\",\"identity\":{\"compiler\":\"bpmn-source-semantic-process\",\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceSha256\":\"x\"},\"processId\":\"p\",\"definitionScopes\":[],\"operationScopes\":[],\"controlPlaceScopes\":[],\"controlPlaces\":[],\"operations\":[]}" = false ∧
    programAccepted "{\"kind\":\"semanticProcess\",\"identity\":{\"compiler\":\"bpmn-source-semantic-process\",\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":{\"id\":\"overlay\",\"sha256\":false},\"sourceSha256\":\"x\"},\"processId\":\"p\",\"definitionScopes\":[],\"operationScopes\":[],\"controlPlaceScopes\":[],\"controlPlaces\":[],\"operations\":[]}" = false := by
  native_decide

theorem semantic_operation_shapes_reject_missing_extra_and_malformed_fields :
    programAccepted "{\"kind\":\"semanticProcess\",\"identity\":{\"compiler\":\"bpmn-source-semantic-process\",\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"processId\":\"p\",\"definitionScopes\":[],\"operationScopes\":[],\"controlPlaceScopes\":[],\"controlPlaces\":[],\"operations\":[{\"id\":\"race\",\"input\":\"in\",\"kind\":\"awaitEventRace\",\"message\":{\"channel\":{\"interfaceId\":\"i\",\"interfaceOperationId\":\"o\",\"kind\":\"operationMessage\",\"messageId\":\"m\"},\"elementId\":\"message\",\"output\":\"om\"},\"origin\":{\"elementId\":\"g\",\"kind\":\"bpmnElement\"},\"timer\":{\"configurationOrigin\":{\"elementId\":\"ft\",\"kind\":\"bpmnSequenceFlow\"},\"durationMs\":1000,\"elementId\":\"timer\",\"output\":\"ot\"}}]}" = false ∧
    programAccepted "{\"kind\":\"semanticProcess\",\"identity\":{\"compiler\":\"bpmn-source-semantic-process\",\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"processId\":\"p\",\"definitionScopes\":[],\"operationScopes\":[],\"controlPlaceScopes\":[],\"controlPlaces\":[],\"operations\":[{\"id\":\"m\",\"kind\":\"mergeExclusive\",\"origin\":{\"elementId\":\"Merge\",\"kind\":\"bpmnElement\"},\"output\":\"out\"}]}" = false ∧
    programAccepted "{\"kind\":\"semanticProcess\",\"identity\":{\"compiler\":\"bpmn-source-semantic-process\",\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"processId\":\"p\",\"definitionScopes\":[],\"operationScopes\":[],\"controlPlaceScopes\":[],\"controlPlaces\":[],\"operations\":[{\"id\":\"m\",\"inputs\":\"a\",\"kind\":\"mergeExclusive\",\"origin\":{\"elementId\":\"Merge\",\"kind\":\"bpmnElement\"},\"output\":\"out\"}]}" = false ∧
    programAccepted "{\"kind\":\"semanticProcess\",\"identity\":{\"compiler\":\"bpmn-source-semantic-process\",\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"processId\":\"p\",\"definitionScopes\":[],\"operationScopes\":[],\"controlPlaceScopes\":[],\"controlPlaces\":[],\"operations\":[{\"id\":\"m\",\"inputs\":[\"a\"],\"kind\":\"mergeExclusive\",\"origin\":{\"elementId\":\"Merge\",\"kind\":\"bpmnElement\"},\"output\":\"out\",\"unexpected\":true}]}" = false ∧
    programAccepted "{\"kind\":\"semanticProcess\",\"identity\":{\"compiler\":\"bpmn-source-semantic-process\",\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"processId\":\"p\",\"definitionScopes\":[],\"operationScopes\":[],\"controlPlaceScopes\":[],\"controlPlaces\":[],\"operations\":[{\"id\":\"m\",\"inputs\":[\"a\"],\"kind\":\"mergeExclusive\",\"origin\":{\"elementId\":\"Merge\",\"kind\":\"bpmnElement\"},\"output\":\"out\",\"output\":\"out\"}]}" = false ∧
    programAccepted "{\"kind\":\"semanticProcess\",\"identity\":{\"compiler\":\"bpmn-source-semantic-process\",\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"processId\":\"p\",\"definitionScopes\":[],\"operationScopes\":[],\"controlPlaceScopes\":[],\"controlPlaces\":[],\"operations\":[{\"id\":\"m\",\"inputs\":[],\"kind\":\"mergeExclusive\",\"origin\":{\"elementId\":\"Merge\",\"kind\":\"bpmnElement\"},\"output\":\"out\"}]}" = false ∧
    programAccepted "{\"kind\":\"semanticProcess\",\"identity\":{\"compiler\":\"bpmn-source-semantic-process\",\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"processId\":\"p\",\"definitionScopes\":[],\"operationScopes\":[],\"controlPlaceScopes\":[],\"controlPlaces\":[],\"operations\":[{\"id\":\"m\",\"inputs\":[\"a\",\"a\"],\"kind\":\"mergeExclusive\",\"origin\":{\"elementId\":\"Merge\",\"kind\":\"bpmnElement\"},\"output\":\"out\"}]}" = false ∧
    programAccepted "{\"kind\":\"semanticProcess\",\"identity\":{\"compiler\":\"bpmn-source-semantic-process\",\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"processId\":\"p\",\"definitionScopes\":[],\"operationScopes\":[],\"controlPlaceScopes\":[],\"controlPlaces\":[],\"operations\":[{\"id\":\"m\",\"inputs\":[\"\"],\"kind\":\"mergeExclusive\",\"origin\":{\"elementId\":\"Merge\",\"kind\":\"bpmnElement\"},\"output\":\"out\"}]}" = false ∧
    programAccepted "{\"kind\":\"semanticProcess\",\"identity\":{\"compiler\":\"bpmn-source-semantic-process\",\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"processId\":\"p\",\"definitionScopes\":[],\"operationScopes\":[],\"controlPlaceScopes\":[],\"controlPlaces\":[],\"operations\":[{\"channel\":{\"kind\":\"operationMessage\",\"interfaceId\":\"i\",\"interfaceOperationId\":\"o\",\"messageId\":\"m\"},\"id\":\"start\",\"kind\":\"initiateMessage\",\"origin\":{\"elementId\":\"Start\",\"kind\":\"bpmnElement\"}}]}" = false ∧
    programAccepted "{\"kind\":\"semanticProcess\",\"identity\":{\"compiler\":\"bpmn-source-semantic-process\",\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"processId\":\"p\",\"definitionScopes\":[],\"operationScopes\":[],\"controlPlaceScopes\":[],\"controlPlaces\":[],\"operations\":[{\"channel\":{\"kind\":\"directMessage\",\"messageId\":\"m\"},\"id\":\"start\",\"kind\":\"initiateMessage\",\"origin\":{\"elementId\":\"Start\",\"kind\":\"bpmnElement\"},\"outputs\":[\"out\"]}]}" = false ∧
    programAccepted "{\"kind\":\"semanticProcess\",\"identity\":{\"compiler\":\"bpmn-source-semantic-process\",\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"processId\":\"p\",\"definitionScopes\":[],\"operationScopes\":[],\"controlPlaceScopes\":[],\"controlPlaces\":[],\"operations\":[{\"channel\":{\"kind\":\"operationMessage\",\"interfaceId\":\"i\",\"interfaceOperationId\":\"o\",\"messageId\":\"m\"},\"id\":\"start\",\"kind\":\"initiateMessage\",\"origin\":{\"elementId\":\"Start\",\"kind\":\"bpmnElement\"},\"outputs\":\"out\"}]}" = false ∧
    programAccepted "{\"kind\":\"semanticProcess\",\"identity\":{\"compiler\":\"bpmn-source-semantic-process\",\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"processId\":\"p\",\"definitionScopes\":[],\"operationScopes\":[],\"controlPlaceScopes\":[],\"controlPlaces\":[],\"operations\":[{\"channel\":{\"kind\":\"operationMessage\",\"interfaceId\":\"i\",\"interfaceOperationId\":\"o\",\"messageId\":\"m\"},\"id\":\"start\",\"kind\":\"initiateMessage\",\"origin\":{\"elementId\":\"Start\",\"kind\":\"bpmnElement\"},\"outputs\":[\"out\"],\"unexpected\":true}]}" = false ∧
    programAccepted "{\"kind\":\"semanticProcess\",\"identity\":{\"compiler\":\"bpmn-source-semantic-process\",\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"processId\":\"p\",\"definitionScopes\":[],\"operationScopes\":[],\"controlPlaceScopes\":[],\"controlPlaces\":[],\"operations\":[{\"channel\":{\"kind\":\"operationMessage\",\"interfaceId\":\"i\",\"interfaceOperationId\":\"o\",\"messageId\":\"m\"},\"id\":\"start\",\"kind\":\"initiateMessage\",\"origin\":{\"elementId\":\"Start\",\"kind\":\"bpmnElement\"},\"outputs\":[\"out\"],\"outputs\":[\"out\"]}]}" = false := by
  native_decide

end BpmnSemantics.SemanticProcessJsonConformance
