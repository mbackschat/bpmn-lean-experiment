import BpmnSemantics.SemanticProcessJson

/-! Executable locks for language-neutral JSON and ordering behavior. -/

namespace BpmnSemantics.SemanticProcessJsonConformance

open BpmnSemantics.SemanticProcessJson
open BpmnSemantics.SemanticProcess

private def parseRejected (contents : String) : Bool :=
  match parseWireJson contents with
  | .ok _ => false
  | .error _ => true

private def variableValueDecodedAs (expected : VariableValue)
    (result : Except String VariableValue) : Bool :=
  match result with
  | .ok actual => decide (actual = expected)
  | .error _ => false

private def scenarioRejected (contents : String) : Bool :=
  match parseWireJson contents >>= decodeScenario with
  | .ok _ => false
  | .error _ => true

private def messageChannelRejected (contents : String) : Bool :=
  match parseWireJson contents >>= decodeMessageChannel with
  | .ok _ => false
  | .error _ => true

private def checkedProcessAccepted (contents : String) : Bool :=
  match parseWireJson contents >>= decodeCheckedProcess with
  | .ok _ => true
  | .error _ => false

private def checkedNodeDocument (node : String) : String :=
  "{\"kind\":\"checkedProcess\",\"identity\":{\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"processId\":\"p\",\"definitionScopes\":[],\"nodeScopes\":[],\"sequenceFlowScopes\":[],\"nodes\":[" ++
    node ++ "],\"sequenceFlows\":[]}"

private def programAccepted (contents : String) : Bool :=
  match parseWireJson contents >>= decodeProgram with
  | .ok _ => true
  | .error _ => false

private def checkedNodesDecodedAs (expected : List CheckedNode)
    (contents : String) : Bool :=
  match parseWireJson contents >>= decodeCheckedProcess with
  | .ok process => decide (process.nodes = expected)
  | .error _ => false

private def programOperationDocument (operation : String) : String :=
  "{\"kind\":\"semanticProcess\",\"identity\":{\"compiler\":\"bpmn-source-semantic-process\",\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"internalSchedulingMode\":\"rejectObservableChoice\",\"processId\":\"p\",\"definitionScopes\":[],\"operationScopes\":[],\"controlPlaceScopes\":[],\"controlPlaces\":[],\"operations\":[" ++
    operation ++ "]}"

private def programOperationsDecodedAs (expected : List SemanticOperation)
    (contents : String) : Bool :=
  match parseWireJson contents >>= decodeProgram with
  | .ok program => decide (program.operations = expected)
  | .error _ => false

private def scenarioDocumentWithStimulus (stimulus : String) : String :=
  "{\"kind\":\"scenario\",\"id\":\"s\",\"profile\":\"p\",\"bpmn\":{\"id\":\"b\",\"relativePath\":\"b\",\"sha256\":\"x\",\"sourceOverlay\":null},\"stimuli\":[" ++
    stimulus ++
    "],\"observations\":[],\"provenance\":{\"normativeRefs\":[],\"cibRevision\":\"r\",\"cibRefs\":[]}}"

private def scenarioStimuliDecodedAs (expected : List Stimulus)
    (contents : String) : Bool :=
  match parseWireJson contents >>= decodeScenario with
  | .ok scenario => decide (scenario.stimuli = expected)
  | .error _ => false

private def payloadChannel : MessageChannel :=
  .operationMessage ⟨"interface"⟩ ⟨"operation"⟩ ⟨"message"⟩

private def payloadOutput : DirectCatchEventPayloadOutput :=
  { associationId := "association"
    sourceDataOutputId := "dataOutput"
    sourceDataOutputName := some "Payload"
    targetPropertyId := "property" }

private def payloadSubscription : MessageSubscriptionId :=
  { processInstanceId := ⟨"instance"⟩
    elementId := ⟨"catch"⟩
    activation := 1 }

private def correlationPayloadSelector : CorrelationMessagePath :=
  { language := correlationScalarPathLanguage, body := "payload" }

private def correlationProcessSelector : CorrelationProcessPropertyPath :=
  { language := correlationScalarPathLanguage
    body := "property:processProperty"
    propertyId := "processProperty" }

private def correlationDefinition : ProgramIdentity :=
  { compiler := .bpmnSourceSemanticProcess
    semanticProfile := ⟨"profile"⟩
    sourceId := ⟨"source"⟩
    sourceSha256 := "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }

private def correlationAddress : CorrelatedMessageAddress :=
  { definition := correlationDefinition
    processId := ⟨"process"⟩
    channel := payloadChannel
    correlationKeyId := "correlationKey" }

theorem duplicate_and_escape_equivalent_json_keys_are_rejected :
    parseRejected "{\"id\":1,\"id\":1}" = true ∧
      parseRejected "{\"id\":1,\"\\u0069d\":1}" = true := by
  native_decide

theorem negative_zero_spellings_are_rejected :
    parseRejected "-0" = true ∧
      parseRejected "-0.0" = true ∧
      parseRejected "-0e1" = true := by
  native_decide

theorem new_variable_value_arms_round_trip_without_normalization :
    variableValueDecodedAs (.integer 4250)
        (decodeVariableValue (encodeVariableValue (.integer 4250))) = true ∧
      variableValueDecodedAs (.stringList ["policy", "policy"])
          (decodeVariableValue
            (encodeVariableValue (.stringList ["policy", "policy"]))) = true := by
  native_decide

theorem unpaired_surrogate_is_rejected :
    parseRejected "{\"id\":\"\\ud800\"}" = true := by
  native_decide

theorem maximum_safe_wire_nat_is_accepted :
    isSafeWireNat 9007199254740991 = true := by decide +kernel

theorem first_unsafe_wire_nat_is_rejected :
    isSafeWireNat 9007199254740992 = false := by decide +kernel

theorem bmp_scalar_precedes_supplementary_scalar :
    compare "\uE000" "𐀀" = .lt := by decide +kernel

theorem canonically_equivalent_strings_remain_distinct :
    ("e\u0301" : String) ≠ "\u00E9" := by decide +kernel

theorem scenario_unknown_field_is_rejected :
    scenarioRejected "{\"kind\":\"scenario\",\"id\":\"s\",\"profile\":\"p\",\"bpmn\":{\"id\":\"b\",\"relativePath\":\"b\",\"sha256\":\"x\",\"sourceOverlay\":null},\"stimuli\":[],\"observations\":[],\"provenance\":{\"normativeRefs\":[],\"cibRevision\":\"r\",\"cibRefs\":[]},\"unexpected\":true}" = true := by
  native_decide

theorem scenario_missing_profile_is_rejected :
    scenarioRejected "{\"kind\":\"scenario\",\"id\":\"s\",\"bpmn\":{\"id\":\"b\",\"relativePath\":\"b\",\"sha256\":\"x\",\"sourceOverlay\":null},\"stimuli\":[],\"observations\":[],\"provenance\":{\"normativeRefs\":[],\"cibRevision\":\"r\",\"cibRefs\":[]}}" = true := by
  native_decide

theorem scenario_source_overlay_and_triggered_start_wire_contract :
    scenarioRejected "{\"kind\":\"scenario\",\"id\":\"s\",\"profile\":\"p\",\"bpmn\":{\"id\":\"b\",\"relativePath\":\"b\",\"sha256\":\"x\",\"sourceOverlay\":null},\"stimuli\":[],\"observations\":[],\"provenance\":{\"normativeRefs\":[],\"cibRevision\":\"r\",\"cibRefs\":[]}}" = false ∧
    scenarioRejected "{\"kind\":\"scenario\",\"id\":\"s\",\"profile\":\"p\",\"bpmn\":{\"id\":\"b\",\"relativePath\":\"b\",\"sha256\":\"x\"},\"stimuli\":[],\"observations\":[],\"provenance\":{\"normativeRefs\":[],\"cibRevision\":\"r\",\"cibRefs\":[]}}" = true ∧
    scenarioRejected "{\"kind\":\"scenario\",\"id\":\"s\",\"profile\":\"p\",\"bpmn\":{\"id\":\"b\",\"relativePath\":\"b\",\"sha256\":\"x\",\"sourceOverlay\":{\"id\":\"overlay\",\"sha256\":\"0000000000000000000000000000000000000000000000000000000000000001\"}},\"stimuli\":[],\"observations\":[],\"provenance\":{\"normativeRefs\":[],\"cibRevision\":\"r\",\"cibRefs\":[]}}" = false ∧
    scenarioRejected "{\"kind\":\"scenario\",\"id\":\"s\",\"profile\":\"p\",\"bpmn\":{\"id\":\"b\",\"relativePath\":\"b\",\"sha256\":\"x\",\"sourceOverlay\":{\"id\":\"overlay\",\"sha256\":\"bad\"}},\"stimuli\":[],\"observations\":[],\"provenance\":{\"normativeRefs\":[],\"cibRevision\":\"r\",\"cibRefs\":[]}}" = true ∧
    scenarioRejected "{\"kind\":\"scenario\",\"id\":\"s\",\"profile\":\"p\",\"bpmn\":{\"id\":\"b\",\"relativePath\":\"b\",\"sha256\":\"x\",\"sourceOverlay\":null},\"stimuli\":[{\"kind\":\"triggerMessageStart\",\"commandId\":\"c\",\"processId\":\"p\",\"instanceId\":\"i\",\"startEventId\":\"start\",\"channel\":{\"kind\":\"operationMessage\",\"interfaceId\":\"interface\",\"interfaceOperationId\":\"operation\",\"messageId\":\"message\"}}],\"observations\":[],\"provenance\":{\"normativeRefs\":[],\"cibRevision\":\"r\",\"cibRefs\":[]}}" = false ∧
    scenarioRejected "{\"kind\":\"scenario\",\"id\":\"s\",\"profile\":\"p\",\"bpmn\":{\"id\":\"b\",\"relativePath\":\"b\",\"sha256\":\"x\",\"sourceOverlay\":null},\"stimuli\":[{\"kind\":\"triggerMessageStart\",\"commandId\":\"c\",\"processId\":\"p\",\"instanceId\":\"i\",\"startEventId\":\"start\"}],\"observations\":[],\"provenance\":{\"normativeRefs\":[],\"cibRevision\":\"r\",\"cibRefs\":[]}}" = true ∧
    scenarioRejected "{\"kind\":\"scenario\",\"id\":\"s\",\"profile\":\"p\",\"bpmn\":{\"id\":\"b\",\"relativePath\":\"b\",\"sha256\":\"x\",\"sourceOverlay\":null},\"stimuli\":[{\"kind\":\"triggerMessageStart\",\"commandId\":\"c\",\"processId\":\"p\",\"instanceId\":\"i\",\"startEventId\":\"start\",\"channel\":{\"kind\":\"directMessage\",\"messageId\":\"message\"}}],\"observations\":[],\"provenance\":{\"normativeRefs\":[],\"cibRevision\":\"r\",\"cibRefs\":[]}}" = true ∧
    scenarioRejected "{\"kind\":\"scenario\",\"id\":\"s\",\"profile\":\"p\",\"bpmn\":{\"id\":\"b\",\"relativePath\":\"b\",\"sha256\":\"x\",\"sourceOverlay\":null},\"stimuli\":[{\"kind\":\"triggerMessageStart\",\"commandId\":\"c\",\"processId\":\"p\",\"instanceId\":\"i\",\"startEventId\":\"start\",\"channel\":{\"kind\":\"operationMessage\",\"interfaceId\":\"interface\",\"interfaceOperationId\":\"operation\",\"messageId\":\"message\"},\"unexpected\":true}],\"observations\":[],\"provenance\":{\"normativeRefs\":[],\"cibRevision\":\"r\",\"cibRefs\":[]}}" = true ∧
    scenarioRejected "{\"kind\":\"scenario\",\"id\":\"s\",\"profile\":\"p\",\"bpmn\":{\"id\":\"b\",\"relativePath\":\"b\",\"sha256\":\"x\",\"sourceOverlay\":null},\"stimuli\":[{\"kind\":\"triggerMessageStart\",\"commandId\":\"c\",\"processId\":\"p\",\"instanceId\":\"i\",\"startEventId\":\"start\",\"startEventId\":\"start\",\"channel\":{\"kind\":\"operationMessage\",\"interfaceId\":\"interface\",\"interfaceOperationId\":\"operation\",\"messageId\":\"message\"}}],\"observations\":[],\"provenance\":{\"normativeRefs\":[],\"cibRevision\":\"r\",\"cibRefs\":[]}}" = true ∧
    scenarioRejected "{\"kind\":\"scenario\",\"id\":\"s\",\"profile\":\"p\",\"bpmn\":{\"id\":\"b\",\"relativePath\":\"b\",\"sha256\":\"x\",\"sourceOverlay\":null},\"stimuli\":[{\"kind\":\"triggerMessageStart\",\"commandId\":\"\",\"processId\":\"p\",\"instanceId\":\"i\",\"startEventId\":\"start\",\"channel\":{\"kind\":\"operationMessage\",\"interfaceId\":\"interface\",\"interfaceOperationId\":\"operation\",\"messageId\":\"message\"}}],\"observations\":[],\"provenance\":{\"normativeRefs\":[],\"cibRevision\":\"r\",\"cibRefs\":[]}}" = true ∧
    scenarioRejected "{\"kind\":\"scenario\",\"id\":\"s\",\"profile\":\"p\",\"bpmn\":{\"id\":\"b\",\"relativePath\":\"b\",\"sha256\":\"x\",\"sourceOverlay\":null},\"stimuli\":[{\"kind\":\"triggerMessageStart\",\"commandId\":\"c\",\"processId\":\"\",\"instanceId\":\"i\",\"startEventId\":\"start\",\"channel\":{\"kind\":\"operationMessage\",\"interfaceId\":\"interface\",\"interfaceOperationId\":\"operation\",\"messageId\":\"message\"}}],\"observations\":[],\"provenance\":{\"normativeRefs\":[],\"cibRevision\":\"r\",\"cibRefs\":[]}}" = true ∧
    scenarioRejected "{\"kind\":\"scenario\",\"id\":\"s\",\"profile\":\"p\",\"bpmn\":{\"id\":\"b\",\"relativePath\":\"b\",\"sha256\":\"x\",\"sourceOverlay\":null},\"stimuli\":[{\"kind\":\"triggerMessageStart\",\"commandId\":\"c\",\"processId\":\"p\",\"instanceId\":\"\",\"startEventId\":\"start\",\"channel\":{\"kind\":\"operationMessage\",\"interfaceId\":\"interface\",\"interfaceOperationId\":\"operation\",\"messageId\":\"message\"}}],\"observations\":[],\"provenance\":{\"normativeRefs\":[],\"cibRevision\":\"r\",\"cibRefs\":[]}}" = true ∧
    scenarioRejected "{\"kind\":\"scenario\",\"id\":\"s\",\"profile\":\"p\",\"bpmn\":{\"id\":\"b\",\"relativePath\":\"b\",\"sha256\":\"x\",\"sourceOverlay\":null},\"stimuli\":[{\"kind\":\"triggerMessageStart\",\"commandId\":\"c\",\"processId\":\"p\",\"instanceId\":\"i\",\"startEventId\":\"\",\"channel\":{\"kind\":\"operationMessage\",\"interfaceId\":\"interface\",\"interfaceOperationId\":\"operation\",\"messageId\":\"message\"}}],\"observations\":[],\"provenance\":{\"normativeRefs\":[],\"cibRevision\":\"r\",\"cibRefs\":[]}}" = true ∧
    scenarioRejected "{\"kind\":\"scenario\",\"id\":\"s\",\"profile\":\"p\",\"bpmn\":{\"id\":\"b\",\"relativePath\":\"b\",\"sha256\":\"x\",\"sourceOverlay\":null},\"stimuli\":[{\"kind\":\"triggerTimerStart\",\"commandId\":\"c\",\"processId\":\"p\",\"instanceId\":\"i\",\"startEventId\":\"start\"}],\"observations\":[],\"provenance\":{\"normativeRefs\":[],\"cibRevision\":\"r\",\"cibRefs\":[]}}" = false ∧
    scenarioRejected "{\"kind\":\"scenario\",\"id\":\"s\",\"profile\":\"p\",\"bpmn\":{\"id\":\"b\",\"relativePath\":\"b\",\"sha256\":\"x\",\"sourceOverlay\":null},\"stimuli\":[{\"kind\":\"triggerTimerStart\",\"commandId\":\"c\",\"processId\":\"p\",\"instanceId\":\"i\"}],\"observations\":[],\"provenance\":{\"normativeRefs\":[],\"cibRevision\":\"r\",\"cibRefs\":[]}}" = true ∧
    scenarioRejected "{\"kind\":\"scenario\",\"id\":\"s\",\"profile\":\"p\",\"bpmn\":{\"id\":\"b\",\"relativePath\":\"b\",\"sha256\":\"x\",\"sourceOverlay\":null},\"stimuli\":[{\"kind\":\"triggerTimerStart\",\"commandId\":\"c\",\"processId\":\"p\",\"instanceId\":\"i\",\"startEventId\":\"start\",\"dueTimeMs\":1000}],\"observations\":[],\"provenance\":{\"normativeRefs\":[],\"cibRevision\":\"r\",\"cibRefs\":[]}}" = true ∧
    scenarioRejected "{\"kind\":\"scenario\",\"id\":\"s\",\"profile\":\"p\",\"bpmn\":{\"id\":\"b\",\"relativePath\":\"b\",\"sha256\":\"x\",\"sourceOverlay\":null},\"stimuli\":[{\"kind\":\"triggerTimerStart\",\"commandId\":\"\",\"processId\":\"p\",\"instanceId\":\"i\",\"startEventId\":\"start\"}],\"observations\":[],\"provenance\":{\"normativeRefs\":[],\"cibRevision\":\"r\",\"cibRefs\":[]}}" = true ∧
    scenarioRejected "{\"kind\":\"scenario\",\"id\":\"s\",\"profile\":\"p\",\"bpmn\":{\"id\":\"b\",\"relativePath\":\"b\",\"sha256\":\"x\",\"sourceOverlay\":null},\"stimuli\":[{\"kind\":\"triggerTimerStart\",\"commandId\":\"c\",\"processId\":\"p\",\"instanceId\":\"i\",\"startEventId\":\"start\",\"startEventId\":\"start\"}],\"observations\":[],\"provenance\":{\"normativeRefs\":[],\"cibRevision\":\"r\",\"cibRefs\":[]}}" = true ∧
    messageChannelRejected "{\"kind\":\"operationMessage\",\"interfaceId\":\"\",\"interfaceOperationId\":\"operation\",\"messageId\":\"message\"}" = true ∧
    messageChannelRejected "{\"kind\":\"operationMessage\",\"interfaceId\":\"interface\",\"interfaceOperationId\":\"\",\"messageId\":\"message\"}" = true ∧
    messageChannelRejected "{\"kind\":\"operationMessage\",\"interfaceId\":\"interface\",\"interfaceOperationId\":\"operation\",\"messageId\":\"\"}" = true ∧
    messageChannelRejected "{\"kind\":\"directMessage\",\"messageId\":\"\"}" = true ∧
    scenarioRejected "{\"kind\":\"scenario\",\"id\":\"s\",\"profile\":\"p\",\"bpmn\":{\"id\":\"b\",\"relativePath\":\"b\",\"sha256\":\"x\",\"sourceOverlay\":null},\"stimuli\":[{\"kind\":\"cancelIncidentProcess\",\"commandId\":\"cancel\",\"processInstanceId\":\"Instance_1\",\"incidentId\":{\"effectId\":{\"processInstanceId\":\"Instance_1\",\"elementId\":\"ServiceTask_Record\",\"activation\":1},\"generation\":1}}],\"observations\":[],\"provenance\":{\"normativeRefs\":[],\"cibRevision\":\"r\",\"cibRefs\":[]}}" = false ∧
    scenarioRejected "{\"kind\":\"scenario\",\"id\":\"s\",\"profile\":\"p\",\"bpmn\":{\"id\":\"b\",\"relativePath\":\"b\",\"sha256\":\"x\",\"sourceOverlay\":null},\"stimuli\":[{\"kind\":\"cancelIncidentProcess\",\"commandId\":\"cancel\",\"processInstanceId\":\"Instance_1\",\"incidentId\":{\"effectId\":{\"processInstanceId\":\"Instance_1\",\"elementId\":\"ServiceTask_Record\",\"activation\":1},\"generation\":1},\"owner\":\"forbidden\"}],\"observations\":[],\"provenance\":{\"normativeRefs\":[],\"cibRevision\":\"r\",\"cibRefs\":[]}}" = true ∧
    scenarioRejected "{\"kind\":\"scenario\",\"id\":\"s\",\"profile\":\"p\",\"bpmn\":{\"id\":\"b\",\"relativePath\":\"b\",\"sha256\":\"x\",\"sourceOverlay\":null},\"stimuli\":[{\"kind\":\"cancelIncidentProcess\",\"commandId\":\"cancel\",\"incidentId\":{\"effectId\":{\"processInstanceId\":\"Instance_1\",\"elementId\":\"ServiceTask_Record\",\"activation\":1},\"generation\":1}}],\"observations\":[],\"provenance\":{\"normativeRefs\":[],\"cibRevision\":\"r\",\"cibRefs\":[]}}" = true ∧
    scenarioRejected "{\"kind\":\"scenario\",\"id\":\"s\",\"profile\":\"p\",\"bpmn\":{\"id\":\"b\",\"relativePath\":\"b\",\"sha256\":\"x\",\"sourceOverlay\":null},\"stimuli\":[{\"kind\":\"cancelIncidentProcess\",\"commandId\":\"cancel\",\"processInstanceId\":\"Instance_1\",\"incidentId\":{\"effectId\":{\"processInstanceId\":\"Instance_1\",\"elementId\":\"ServiceTask_Record\",\"activation\":1},\"generation\":1,\"unexpected\":true}}],\"observations\":[],\"provenance\":{\"normativeRefs\":[],\"cibRevision\":\"r\",\"cibRefs\":[]}}" = true ∧
    scenarioRejected "{\"kind\":\"scenario\",\"id\":\"s\",\"profile\":\"p\",\"bpmn\":{\"id\":\"b\",\"relativePath\":\"b\",\"sha256\":\"x\",\"sourceOverlay\":null},\"stimuli\":[{\"kind\":\"cancelIncidentProcess\",\"commandId\":\"cancel\",\"processInstanceId\":\"Instance_1\",\"incidentId\":{\"effectId\":{\"processInstanceId\":\"Instance_1\",\"elementId\":\"ServiceTask_Record\",\"activation\":1,\"unexpected\":true},\"generation\":1}}],\"observations\":[],\"provenance\":{\"normativeRefs\":[],\"cibRevision\":\"r\",\"cibRefs\":[]}}" = true ∧
    scenarioRejected "{\"kind\":\"scenario\",\"id\":\"s\",\"profile\":\"p\",\"bpmn\":{\"id\":\"b\",\"relativePath\":\"b\",\"sha256\":\"x\",\"sourceOverlay\":null},\"stimuli\":[{\"kind\":\"cancelIncidentProcess\",\"commandId\":\"cancel\",\"processInstanceId\":\"\",\"incidentId\":{\"effectId\":{\"processInstanceId\":\"Instance_1\",\"elementId\":\"ServiceTask_Record\",\"activation\":1},\"generation\":1}}],\"observations\":[],\"provenance\":{\"normativeRefs\":[],\"cibRevision\":\"r\",\"cibRefs\":[]}}" = true ∧
    scenarioRejected "{\"kind\":\"scenario\",\"id\":\"s\",\"profile\":\"p\",\"bpmn\":{\"id\":\"b\",\"relativePath\":\"b\",\"sha256\":\"x\",\"sourceOverlay\":null},\"stimuli\":[{\"kind\":\"startProcess\",\"commandId\":\"c\",\"processId\":\"p\",\"instanceId\":\"i\",\"initialVariables\":[{\"name\":\"empty\",\"value\":{\"kind\":\"string\",\"value\":\"\"}}]}],\"observations\":[],\"provenance\":{\"normativeRefs\":[],\"cibRevision\":\"r\",\"cibRefs\":[]}}" = false := by
  native_decide

theorem unknown_observation_and_unsafe_activation_are_rejected :
    scenarioRejected "{\"kind\":\"scenario\",\"id\":\"s\",\"profile\":\"p\",\"bpmn\":{\"id\":\"b\",\"relativePath\":\"b\",\"sha256\":\"x\",\"sourceOverlay\":null},\"stimuli\":[],\"observations\":[\"unknown\"],\"provenance\":{\"normativeRefs\":[],\"cibRevision\":\"r\",\"cibRefs\":[]}}" = true ∧
      scenarioRejected "{\"kind\":\"scenario\",\"id\":\"s\",\"profile\":\"p\",\"bpmn\":{\"id\":\"b\",\"relativePath\":\"b\",\"sha256\":\"x\",\"sourceOverlay\":null},\"stimuli\":[{\"kind\":\"completeUserTaskInstance\",\"commandId\":\"c\",\"taskId\":{\"processInstanceId\":\"i\",\"elementId\":\"t\",\"activation\":9007199254740992}}],\"observations\":[],\"provenance\":{\"normativeRefs\":[],\"cibRevision\":\"r\",\"cibRefs\":[]}}" = true := by
  native_decide

theorem incident_generation_domain_is_exactly_literal_one :
    admitEffectIncidentGeneration 1 = .ok 1 ∧
      admitEffectIncidentGeneration 0 =
        .error "effect incident generation must be 1" ∧
      admitEffectIncidentGeneration 2 =
        .error "effect incident generation must be 1" := by
  exact ⟨rfl, rfl, rfl⟩

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
    checkedProcessAccepted "{\"kind\":\"checkedProcess\",\"identity\":{\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"processId\":\"p\",\"definitionScopes\":[],\"nodeScopes\":[],\"sequenceFlowScopes\":[],\"nodes\":[{\"channel\":{\"kind\":\"operationMessage\",\"interfaceId\":\"i\",\"interfaceOperationId\":\"o\",\"messageId\":\"m\"},\"id\":\"start\",\"id\":\"start\",\"kind\":\"messageStartEvent\"}],\"sequenceFlows\":[]}" = false ∧
    checkedProcessAccepted "{\"kind\":\"checkedProcess\",\"identity\":{\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"processId\":\"p\",\"definitionScopes\":[],\"nodeScopes\":[],\"sequenceFlowScopes\":[],\"nodes\":[{\"id\":\"start\",\"kind\":\"timerStartEvent\"}],\"sequenceFlows\":[]}" = false ∧
    checkedProcessAccepted "{\"kind\":\"checkedProcess\",\"identity\":{\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"processId\":\"p\",\"definitionScopes\":[],\"nodeScopes\":[],\"sequenceFlowScopes\":[],\"nodes\":[{\"durationLiteral\":\"PT2S\",\"id\":\"start\",\"kind\":\"timerStartEvent\"}],\"sequenceFlows\":[]}" = false ∧
    checkedProcessAccepted "{\"kind\":\"checkedProcess\",\"identity\":{\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"processId\":\"p\",\"definitionScopes\":[],\"nodeScopes\":[],\"sequenceFlowScopes\":[],\"nodes\":[{\"durationLiteral\":\"PT1S\",\"id\":\"start\",\"kind\":\"timerStartEvent\",\"scheduleId\":\"host\"}],\"sequenceFlows\":[]}" = false ∧
    checkedProcessAccepted "{\"kind\":\"checkedProcess\",\"identity\":{\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"processId\":\"p\",\"definitionScopes\":[],\"nodeScopes\":[],\"sequenceFlowScopes\":[],\"nodes\":[{\"durationLiteral\":\"PT1S\",\"durationLiteral\":\"PT1S\",\"id\":\"start\",\"kind\":\"timerStartEvent\"}],\"sequenceFlows\":[]}" = false ∧
    checkedProcessAccepted "{\"kind\":\"checkedProcess\",\"identity\":{\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"processId\":\"p\",\"definitionScopes\":[],\"nodeScopes\":[],\"sequenceFlowScopes\":[],\"nodes\":[{\"kind\":\"terminateEndEvent\"}],\"sequenceFlows\":[]}" = false ∧
    checkedProcessAccepted "{\"kind\":\"checkedProcess\",\"identity\":{\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"processId\":\"p\",\"definitionScopes\":[],\"nodeScopes\":[],\"sequenceFlowScopes\":[],\"nodes\":[{\"id\":\"\",\"kind\":\"terminateEndEvent\"}],\"sequenceFlows\":[]}" = false ∧
    checkedProcessAccepted "{\"kind\":\"checkedProcess\",\"identity\":{\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"processId\":\"p\",\"definitionScopes\":[],\"nodeScopes\":[],\"sequenceFlowScopes\":[],\"nodes\":[{\"id\":\"end\",\"kind\":\"terminateEndEvent\",\"unexpected\":true}],\"sequenceFlows\":[]}" = false ∧
    checkedProcessAccepted "{\"kind\":\"checkedProcess\",\"identity\":{\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"processId\":\"p\",\"definitionScopes\":[],\"nodeScopes\":[],\"sequenceFlowScopes\":[],\"nodes\":[{\"id\":1,\"kind\":\"terminateEndEvent\"}],\"sequenceFlows\":[]}" = false ∧
    checkedProcessAccepted "{\"kind\":\"checkedProcess\",\"identity\":{\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"processId\":\"p\",\"definitionScopes\":[],\"nodeScopes\":[],\"sequenceFlowScopes\":[],\"nodes\":[{\"id\":\"end\",\"id\":\"end\",\"kind\":\"terminateEndEvent\"}],\"sequenceFlows\":[]}" = false ∧
    checkedProcessAccepted (checkedNodeDocument "{\"id\":\"task\",\"kind\":\"configuredTask\"}") = false ∧
    checkedProcessAccepted (checkedNodeDocument "{\"descriptor\":{\"operation\":\"urn:bpmn-lean:effect-operation:probe-v1\",\"protocol\":\"urn:bpmn-lean:effect-protocol:activity-v1\"},\"id\":\"task\",\"kind\":\"configuredTask\",\"unexpected\":true}") = false ∧
    checkedProcessAccepted (checkedNodeDocument "{\"descriptor\":false,\"id\":\"task\",\"kind\":\"configuredTask\"}") = false ∧
    checkedProcessAccepted (checkedNodeDocument "{\"descriptor\":{\"operation\":\"urn:bpmn-lean:effect-operation:probe-v1\",\"protocol\":\"urn:bpmn-lean:effect-protocol:activity-v1\"},\"id\":\"\",\"kind\":\"configuredTask\"}") = false ∧
    checkedProcessAccepted (checkedNodeDocument "{\"descriptor\":{\"operation\":\"urn:bpmn-lean:effect-operation:probe-v1\",\"protocol\":\"urn:bpmn-lean:effect-protocol:activity-v1\"},\"id\":\"task\",\"id\":\"task\",\"kind\":\"configuredTask\"}") = false ∧
    checkedProcessAccepted (checkedNodeDocument "{\"descriptor\":{\"operation\":\"urn:bpmn-lean:effect-operation:probe-v1\",\"protocol\":\"urn:bpmn-lean:effect-protocol:activity-v1\"},\"id\":\"task\",\"kind\":\"serviceTask\"}") = false ∧
    checkedProcessAccepted (checkedNodeDocument "{\"descriptor\":{\"operation\":\"urn:bpmn-lean:effect-operation:wrong-v1\",\"protocol\":\"urn:bpmn-lean:effect-protocol:activity-v1\"},\"id\":\"task\",\"kind\":\"configuredTask\"}") = false ∧
    checkedProcessAccepted (checkedNodeDocument "{\"descriptor\":{\"operation\":\"\",\"protocol\":\"\"},\"id\":\"task\",\"kind\":\"configuredTask\"}") = false ∧
    checkedProcessAccepted (checkedNodeDocument "{\"boundaryTimer\":{\"durationLiteral\":\"PT1S\",\"elementId\":\"timer\",\"outputFlowId\":\"timerOut\"},\"completionCondition\":{\"body\":\"stringEquals(completionPolicy,\\\"first\\\")\",\"language\":\"urn:bpmn-lean:expression:simple-boolean:v1\"},\"id\":\"task\",\"input\":{\"collectionAssociationId\":\"collectionAssociation\",\"collectionItemDefinitionId\":\"collectionItem\",\"dataObjectId\":\"inputObject\",\"dataObjectReferenceId\":\"inputReference\",\"inputDataItemId\":\"inputItem\",\"itemAssociationId\":\"itemAssociation\",\"loopDataInputId\":\"loopInput\",\"scalarItemDefinitionId\":\"scalarItem\",\"taskDataInputId\":\"taskInput\"},\"kind\":\"parallelMultiInstanceUserTask\",\"name\":\"Review\",\"normalOutputFlowId\":\"normalOut\",\"output\":{\"collectionAssociationId\":\"outputCollectionAssociation\",\"dataObjectId\":\"outputObject\",\"dataObjectReferenceId\":\"outputReference\",\"itemAssociationId\":\"outputItemAssociation\",\"loopDataOutputId\":\"loopOutput\",\"outputDataItemId\":\"outputItem\",\"taskDataOutputId\":\"taskOutput\"}}") = false := by
  native_decide

theorem checked_node_exact_shapes_are_accepted :
    checkedProcessAccepted "{\"kind\":\"checkedProcess\",\"identity\":{\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"processId\":\"p\",\"definitionScopes\":[{\"id\":\"scope:p\",\"parentScopeId\":null,\"originElementId\":\"p\"}],\"nodeScopes\":[{\"nodeId\":\"g\",\"scopeId\":\"scope:p\"}],\"sequenceFlowScopes\":[],\"nodes\":[{\"direction\":\"diverging\",\"id\":\"g\",\"kind\":\"eventBasedGateway\"}],\"sequenceFlows\":[]}" = true ∧
    checkedProcessAccepted "{\"kind\":\"checkedProcess\",\"identity\":{\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"processId\":\"p\",\"definitionScopes\":[],\"nodeScopes\":[],\"sequenceFlowScopes\":[],\"nodes\":[{\"id\":\"m\",\"kind\":\"exclusiveMerge\"}],\"sequenceFlows\":[]}" = true ∧
    checkedProcessAccepted "{\"kind\":\"checkedProcess\",\"identity\":{\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"processId\":\"p\",\"definitionScopes\":[],\"nodeScopes\":[],\"sequenceFlowScopes\":[],\"nodes\":[{\"channel\":{\"kind\":\"operationMessage\",\"interfaceId\":\"i\",\"interfaceOperationId\":\"o\",\"messageId\":\"m\"},\"id\":\"start\",\"kind\":\"messageStartEvent\"}],\"sequenceFlows\":[]}" = true ∧
    checkedProcessAccepted "{\"kind\":\"checkedProcess\",\"identity\":{\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"processId\":\"p\",\"definitionScopes\":[],\"nodeScopes\":[],\"sequenceFlowScopes\":[],\"nodes\":[{\"durationLiteral\":\"PT1S\",\"id\":\"start\",\"kind\":\"timerStartEvent\"}],\"sequenceFlows\":[]}" = true ∧
    checkedProcessAccepted "{\"kind\":\"checkedProcess\",\"identity\":{\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"processId\":\"p\",\"definitionScopes\":[],\"nodeScopes\":[],\"sequenceFlowScopes\":[],\"nodes\":[{\"id\":\"end\",\"kind\":\"terminateEndEvent\"}],\"sequenceFlows\":[]}" = true ∧
    checkedProcessAccepted (checkedNodeDocument "{\"boundaryTimer\":{\"durationLiteral\":\"PT5S\",\"elementId\":\"timer\",\"outputFlowId\":\"timerOut\"},\"completionCondition\":{\"body\":\"stringEquals(completionPolicy,\\\"first\\\")\",\"language\":\"urn:bpmn-lean:expression:simple-boolean:v1\"},\"id\":\"task\",\"input\":{\"collectionAssociationId\":\"collectionAssociation\",\"collectionItemDefinitionId\":\"collectionItem\",\"dataObjectId\":\"inputObject\",\"dataObjectReferenceId\":\"inputReference\",\"inputDataItemId\":\"inputItem\",\"itemAssociationId\":\"itemAssociation\",\"loopDataInputId\":\"loopInput\",\"scalarItemDefinitionId\":\"scalarItem\",\"taskDataInputId\":\"taskInput\"},\"kind\":\"parallelMultiInstanceUserTask\",\"name\":\"Review\",\"normalOutputFlowId\":\"normalOut\",\"output\":{\"collectionAssociationId\":\"outputCollectionAssociation\",\"dataObjectId\":\"outputObject\",\"dataObjectReferenceId\":\"outputReference\",\"itemAssociationId\":\"outputItemAssociation\",\"loopDataOutputId\":\"loopOutput\",\"outputDataItemId\":\"outputItem\",\"taskDataOutputId\":\"taskOutput\"}}") = true ∧
    checkedProcessAccepted (checkedNodeDocument "{\"descriptor\":{\"operation\":\"urn:bpmn-lean:effect-operation:probe-v1\",\"protocol\":\"urn:bpmn-lean:effect-protocol:activity-v1\"},\"id\":\"task\",\"kind\":\"configuredTask\"}") = true := by
  native_decide

theorem semantic_operation_exact_shapes_are_accepted :
    programAccepted "{\"kind\":\"semanticProcess\",\"identity\":{\"compiler\":\"bpmn-source-semantic-process\",\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"internalSchedulingMode\":\"rejectObservableChoice\",\"processId\":\"p\",\"definitionScopes\":[],\"operationScopes\":[],\"controlPlaceScopes\":[],\"controlPlaces\":[],\"operations\":[{\"id\":\"race\",\"input\":\"in\",\"kind\":\"awaitEventRace\",\"message\":{\"channel\":{\"interfaceId\":\"i\",\"interfaceOperationId\":\"o\",\"kind\":\"operationMessage\",\"messageId\":\"m\"},\"configurationOrigin\":{\"elementId\":\"fm\",\"kind\":\"bpmnSequenceFlow\"},\"elementId\":\"message\",\"output\":\"om\"},\"origin\":{\"elementId\":\"g\",\"kind\":\"bpmnElement\"},\"timer\":{\"configurationOrigin\":{\"elementId\":\"ft\",\"kind\":\"bpmnSequenceFlow\"},\"durationMs\":1000,\"elementId\":\"timer\",\"output\":\"ot\"}}]}" = true ∧
    programAccepted "{\"kind\":\"semanticProcess\",\"identity\":{\"compiler\":\"bpmn-source-semantic-process\",\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"internalSchedulingMode\":\"rejectObservableChoice\",\"processId\":\"p\",\"definitionScopes\":[],\"operationScopes\":[],\"controlPlaceScopes\":[],\"controlPlaces\":[],\"operations\":[{\"id\":\"m\",\"inputs\":[\"a\",\"b\",\"c\"],\"kind\":\"mergeExclusive\",\"origin\":{\"elementId\":\"Merge\",\"kind\":\"bpmnElement\"},\"output\":\"out\"}]}" = true ∧
    programAccepted "{\"kind\":\"semanticProcess\",\"identity\":{\"compiler\":\"bpmn-source-semantic-process\",\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"internalSchedulingMode\":\"rejectObservableChoice\",\"processId\":\"p\",\"definitionScopes\":[],\"operationScopes\":[],\"controlPlaceScopes\":[],\"controlPlaces\":[],\"operations\":[{\"channel\":{\"kind\":\"operationMessage\",\"interfaceId\":\"i\",\"interfaceOperationId\":\"o\",\"messageId\":\"m\"},\"id\":\"start\",\"kind\":\"initiateMessage\",\"origin\":{\"elementId\":\"Start\",\"kind\":\"bpmnElement\"},\"outputs\":[\"out\"]}]}" = true ∧
    programAccepted "{\"kind\":\"semanticProcess\",\"identity\":{\"compiler\":\"bpmn-source-semantic-process\",\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"internalSchedulingMode\":\"rejectObservableChoice\",\"processId\":\"p\",\"definitionScopes\":[],\"operationScopes\":[],\"controlPlaceScopes\":[],\"controlPlaces\":[],\"operations\":[{\"id\":\"start\",\"kind\":\"initiateTimer\",\"origin\":{\"elementId\":\"Start\",\"kind\":\"bpmnElement\"},\"outputs\":[\"out\"],\"timer\":{\"durationMs\":1000}}]}" = true ∧
    programAccepted "{\"kind\":\"semanticProcess\",\"identity\":{\"compiler\":\"bpmn-source-semantic-process\",\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"internalSchedulingMode\":\"rejectObservableChoice\",\"processId\":\"p\",\"definitionScopes\":[],\"operationScopes\":[],\"controlPlaceScopes\":[],\"controlPlaces\":[],\"operations\":[{\"id\":\"terminate\",\"input\":\"in\",\"kind\":\"terminateScope\",\"origin\":{\"elementId\":\"end\",\"kind\":\"bpmnElement\"},\"scopeId\":\"scope:p\"}]}" = true := by
  native_decide

theorem semantic_process_top_level_wire_contract :
    programAccepted "{\"kind\":\"semanticProcess\",\"identity\":{\"compiler\":\"bpmn-source-semantic-process\",\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"internalSchedulingMode\":\"rejectObservableChoice\",\"processId\":\"p\",\"definitionScopes\":[],\"operationScopes\":[],\"controlPlaceScopes\":[],\"controlPlaces\":[],\"operations\":[]}" = true ∧
    programAccepted "{\"kind\":\"semanticProcess\",\"identity\":{\"compiler\":\"bpmn-source-semantic-process\",\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"internalSchedulingMode\":\"requireChoiceSchedule\",\"processId\":\"p\",\"definitionScopes\":[],\"operationScopes\":[],\"controlPlaceScopes\":[],\"controlPlaces\":[],\"operations\":[]}" = true ∧
    programAccepted "{\"kind\":\"semanticProcess\",\"identity\":{\"compiler\":\"bpmn-source-semantic-process\",\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"processId\":\"p\",\"definitionScopes\":[],\"operationScopes\":[],\"controlPlaceScopes\":[],\"controlPlaces\":[],\"operations\":[]}" = false ∧
    programAccepted "{\"kind\":\"semanticProcess\",\"identity\":{\"compiler\":\"bpmn-source-semantic-process\",\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"internalSchedulingMode\":\"unknown\",\"processId\":\"p\",\"definitionScopes\":[],\"operationScopes\":[],\"controlPlaceScopes\":[],\"controlPlaces\":[],\"operations\":[]}" = false ∧
    programAccepted "{\"kind\":\"semanticProcess\",\"identity\":{\"compiler\":\"bpmn-source-semantic-process\",\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":{\"id\":\"overlay\",\"sha256\":\"0000000000000000000000000000000000000000000000000000000000000001\"},\"sourceSha256\":\"x\"},\"internalSchedulingMode\":\"rejectObservableChoice\",\"processId\":\"p\",\"definitionScopes\":[],\"operationScopes\":[],\"controlPlaceScopes\":[],\"controlPlaces\":[],\"operations\":[]}" = true ∧
    programAccepted "{\"kind\":\"semanticProcess\",\"identity\":{\"compiler\":\"bpmn-source-semantic-process\",\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceSha256\":\"x\"},\"internalSchedulingMode\":\"rejectObservableChoice\",\"processId\":\"p\",\"definitionScopes\":[],\"operationScopes\":[],\"controlPlaceScopes\":[],\"controlPlaces\":[],\"operations\":[]}" = false ∧
    programAccepted "{\"kind\":\"semanticProcess\",\"identity\":{\"compiler\":\"bpmn-source-semantic-process\",\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":{\"id\":\"overlay\",\"sha256\":false},\"sourceSha256\":\"x\"},\"internalSchedulingMode\":\"rejectObservableChoice\",\"processId\":\"p\",\"definitionScopes\":[],\"operationScopes\":[],\"controlPlaceScopes\":[],\"controlPlaces\":[],\"operations\":[]}" = false := by
  native_decide

theorem semantic_operation_shapes_reject_missing_extra_and_malformed_fields :
    programAccepted "{\"kind\":\"semanticProcess\",\"identity\":{\"compiler\":\"bpmn-source-semantic-process\",\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"internalSchedulingMode\":\"rejectObservableChoice\",\"processId\":\"p\",\"definitionScopes\":[],\"operationScopes\":[],\"controlPlaceScopes\":[],\"controlPlaces\":[],\"operations\":[{\"id\":\"race\",\"input\":\"in\",\"kind\":\"awaitEventRace\",\"message\":{\"channel\":{\"interfaceId\":\"i\",\"interfaceOperationId\":\"o\",\"kind\":\"operationMessage\",\"messageId\":\"m\"},\"elementId\":\"message\",\"output\":\"om\"},\"origin\":{\"elementId\":\"g\",\"kind\":\"bpmnElement\"},\"timer\":{\"configurationOrigin\":{\"elementId\":\"ft\",\"kind\":\"bpmnSequenceFlow\"},\"durationMs\":1000,\"elementId\":\"timer\",\"output\":\"ot\"}}]}" = false ∧
    programAccepted "{\"kind\":\"semanticProcess\",\"identity\":{\"compiler\":\"bpmn-source-semantic-process\",\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"internalSchedulingMode\":\"rejectObservableChoice\",\"processId\":\"p\",\"definitionScopes\":[],\"operationScopes\":[],\"controlPlaceScopes\":[],\"controlPlaces\":[],\"operations\":[{\"id\":\"m\",\"kind\":\"mergeExclusive\",\"origin\":{\"elementId\":\"Merge\",\"kind\":\"bpmnElement\"},\"output\":\"out\"}]}" = false ∧
    programAccepted "{\"kind\":\"semanticProcess\",\"identity\":{\"compiler\":\"bpmn-source-semantic-process\",\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"internalSchedulingMode\":\"rejectObservableChoice\",\"processId\":\"p\",\"definitionScopes\":[],\"operationScopes\":[],\"controlPlaceScopes\":[],\"controlPlaces\":[],\"operations\":[{\"id\":\"m\",\"inputs\":\"a\",\"kind\":\"mergeExclusive\",\"origin\":{\"elementId\":\"Merge\",\"kind\":\"bpmnElement\"},\"output\":\"out\"}]}" = false ∧
    programAccepted "{\"kind\":\"semanticProcess\",\"identity\":{\"compiler\":\"bpmn-source-semantic-process\",\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"internalSchedulingMode\":\"rejectObservableChoice\",\"processId\":\"p\",\"definitionScopes\":[],\"operationScopes\":[],\"controlPlaceScopes\":[],\"controlPlaces\":[],\"operations\":[{\"id\":\"m\",\"inputs\":[\"a\"],\"kind\":\"mergeExclusive\",\"origin\":{\"elementId\":\"Merge\",\"kind\":\"bpmnElement\"},\"output\":\"out\",\"unexpected\":true}]}" = false ∧
    programAccepted "{\"kind\":\"semanticProcess\",\"identity\":{\"compiler\":\"bpmn-source-semantic-process\",\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"internalSchedulingMode\":\"rejectObservableChoice\",\"processId\":\"p\",\"definitionScopes\":[],\"operationScopes\":[],\"controlPlaceScopes\":[],\"controlPlaces\":[],\"operations\":[{\"id\":\"m\",\"inputs\":[\"a\"],\"kind\":\"mergeExclusive\",\"origin\":{\"elementId\":\"Merge\",\"kind\":\"bpmnElement\"},\"output\":\"out\",\"output\":\"out\"}]}" = false ∧
    programAccepted "{\"kind\":\"semanticProcess\",\"identity\":{\"compiler\":\"bpmn-source-semantic-process\",\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"internalSchedulingMode\":\"rejectObservableChoice\",\"processId\":\"p\",\"definitionScopes\":[],\"operationScopes\":[],\"controlPlaceScopes\":[],\"controlPlaces\":[],\"operations\":[{\"id\":\"m\",\"inputs\":[],\"kind\":\"mergeExclusive\",\"origin\":{\"elementId\":\"Merge\",\"kind\":\"bpmnElement\"},\"output\":\"out\"}]}" = false ∧
    programAccepted "{\"kind\":\"semanticProcess\",\"identity\":{\"compiler\":\"bpmn-source-semantic-process\",\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"internalSchedulingMode\":\"rejectObservableChoice\",\"processId\":\"p\",\"definitionScopes\":[],\"operationScopes\":[],\"controlPlaceScopes\":[],\"controlPlaces\":[],\"operations\":[{\"id\":\"m\",\"inputs\":[\"a\",\"a\"],\"kind\":\"mergeExclusive\",\"origin\":{\"elementId\":\"Merge\",\"kind\":\"bpmnElement\"},\"output\":\"out\"}]}" = false ∧
    programAccepted "{\"kind\":\"semanticProcess\",\"identity\":{\"compiler\":\"bpmn-source-semantic-process\",\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"internalSchedulingMode\":\"rejectObservableChoice\",\"processId\":\"p\",\"definitionScopes\":[],\"operationScopes\":[],\"controlPlaceScopes\":[],\"controlPlaces\":[],\"operations\":[{\"id\":\"m\",\"inputs\":[\"\"],\"kind\":\"mergeExclusive\",\"origin\":{\"elementId\":\"Merge\",\"kind\":\"bpmnElement\"},\"output\":\"out\"}]}" = false ∧
    programAccepted "{\"kind\":\"semanticProcess\",\"identity\":{\"compiler\":\"bpmn-source-semantic-process\",\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"internalSchedulingMode\":\"rejectObservableChoice\",\"processId\":\"p\",\"definitionScopes\":[],\"operationScopes\":[],\"controlPlaceScopes\":[],\"controlPlaces\":[],\"operations\":[{\"channel\":{\"kind\":\"operationMessage\",\"interfaceId\":\"i\",\"interfaceOperationId\":\"o\",\"messageId\":\"m\"},\"id\":\"start\",\"kind\":\"initiateMessage\",\"origin\":{\"elementId\":\"Start\",\"kind\":\"bpmnElement\"}}]}" = false ∧
    programAccepted "{\"kind\":\"semanticProcess\",\"identity\":{\"compiler\":\"bpmn-source-semantic-process\",\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"internalSchedulingMode\":\"rejectObservableChoice\",\"processId\":\"p\",\"definitionScopes\":[],\"operationScopes\":[],\"controlPlaceScopes\":[],\"controlPlaces\":[],\"operations\":[{\"channel\":{\"kind\":\"directMessage\",\"messageId\":\"m\"},\"id\":\"start\",\"kind\":\"initiateMessage\",\"origin\":{\"elementId\":\"Start\",\"kind\":\"bpmnElement\"},\"outputs\":[\"out\"]}]}" = false ∧
    programAccepted "{\"kind\":\"semanticProcess\",\"identity\":{\"compiler\":\"bpmn-source-semantic-process\",\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"internalSchedulingMode\":\"rejectObservableChoice\",\"processId\":\"p\",\"definitionScopes\":[],\"operationScopes\":[],\"controlPlaceScopes\":[],\"controlPlaces\":[],\"operations\":[{\"channel\":{\"kind\":\"operationMessage\",\"interfaceId\":\"i\",\"interfaceOperationId\":\"o\",\"messageId\":\"m\"},\"id\":\"start\",\"kind\":\"initiateMessage\",\"origin\":{\"elementId\":\"Start\",\"kind\":\"bpmnElement\"},\"outputs\":\"out\"}]}" = false ∧
    programAccepted "{\"kind\":\"semanticProcess\",\"identity\":{\"compiler\":\"bpmn-source-semantic-process\",\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"internalSchedulingMode\":\"rejectObservableChoice\",\"processId\":\"p\",\"definitionScopes\":[],\"operationScopes\":[],\"controlPlaceScopes\":[],\"controlPlaces\":[],\"operations\":[{\"channel\":{\"kind\":\"operationMessage\",\"interfaceId\":\"i\",\"interfaceOperationId\":\"o\",\"messageId\":\"m\"},\"id\":\"start\",\"kind\":\"initiateMessage\",\"origin\":{\"elementId\":\"Start\",\"kind\":\"bpmnElement\"},\"outputs\":[\"out\"],\"unexpected\":true}]}" = false ∧
    programAccepted "{\"kind\":\"semanticProcess\",\"identity\":{\"compiler\":\"bpmn-source-semantic-process\",\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"internalSchedulingMode\":\"rejectObservableChoice\",\"processId\":\"p\",\"definitionScopes\":[],\"operationScopes\":[],\"controlPlaceScopes\":[],\"controlPlaces\":[],\"operations\":[{\"channel\":{\"kind\":\"operationMessage\",\"interfaceId\":\"i\",\"interfaceOperationId\":\"o\",\"messageId\":\"m\"},\"id\":\"start\",\"kind\":\"initiateMessage\",\"origin\":{\"elementId\":\"Start\",\"kind\":\"bpmnElement\"},\"outputs\":[\"out\"],\"outputs\":[\"out\"]}]}" = false ∧
    programAccepted "{\"kind\":\"semanticProcess\",\"identity\":{\"compiler\":\"bpmn-source-semantic-process\",\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"internalSchedulingMode\":\"rejectObservableChoice\",\"processId\":\"p\",\"definitionScopes\":[],\"operationScopes\":[],\"controlPlaceScopes\":[],\"controlPlaces\":[],\"operations\":[{\"id\":\"start\",\"kind\":\"initiateTimer\",\"origin\":{\"elementId\":\"Start\",\"kind\":\"bpmnElement\"},\"outputs\":[\"out\"]}]}" = false ∧
    programAccepted "{\"kind\":\"semanticProcess\",\"identity\":{\"compiler\":\"bpmn-source-semantic-process\",\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"internalSchedulingMode\":\"rejectObservableChoice\",\"processId\":\"p\",\"definitionScopes\":[],\"operationScopes\":[],\"controlPlaceScopes\":[],\"controlPlaces\":[],\"operations\":[{\"id\":\"start\",\"kind\":\"initiateTimer\",\"origin\":{\"elementId\":\"Start\",\"kind\":\"bpmnElement\"},\"outputs\":[],\"timer\":{\"durationMs\":1000}}]}" = false ∧
    programAccepted "{\"kind\":\"semanticProcess\",\"identity\":{\"compiler\":\"bpmn-source-semantic-process\",\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"internalSchedulingMode\":\"rejectObservableChoice\",\"processId\":\"p\",\"definitionScopes\":[],\"operationScopes\":[],\"controlPlaceScopes\":[],\"controlPlaces\":[],\"operations\":[{\"id\":\"start\",\"kind\":\"initiateTimer\",\"origin\":{\"elementId\":\"Start\",\"kind\":\"bpmnElement\"},\"outputs\":[\"out\",\"out\"],\"timer\":{\"durationMs\":1000}}]}" = false ∧
    programAccepted "{\"kind\":\"semanticProcess\",\"identity\":{\"compiler\":\"bpmn-source-semantic-process\",\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"internalSchedulingMode\":\"rejectObservableChoice\",\"processId\":\"p\",\"definitionScopes\":[],\"operationScopes\":[],\"controlPlaceScopes\":[],\"controlPlaces\":[],\"operations\":[{\"id\":\"start\",\"kind\":\"initiateTimer\",\"origin\":{\"elementId\":\"Start\",\"kind\":\"bpmnElement\"},\"outputs\":[\"out\"],\"timer\":{\"durationMs\":999}}]}" = false ∧
    programAccepted "{\"kind\":\"semanticProcess\",\"identity\":{\"compiler\":\"bpmn-source-semantic-process\",\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"internalSchedulingMode\":\"rejectObservableChoice\",\"processId\":\"p\",\"definitionScopes\":[],\"operationScopes\":[],\"controlPlaceScopes\":[],\"controlPlaces\":[],\"operations\":[{\"id\":\"start\",\"kind\":\"initiateTimer\",\"origin\":{\"elementId\":\"Start\",\"kind\":\"bpmnElement\"},\"outputs\":[\"out\"],\"timer\":{\"durationMs\":1000},\"scheduleId\":\"host\"}]}" = false ∧
    programAccepted "{\"kind\":\"semanticProcess\",\"identity\":{\"compiler\":\"bpmn-source-semantic-process\",\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"internalSchedulingMode\":\"rejectObservableChoice\",\"processId\":\"p\",\"definitionScopes\":[],\"operationScopes\":[],\"controlPlaceScopes\":[],\"controlPlaces\":[],\"operations\":[{\"id\":\"start\",\"kind\":\"initiateTimer\",\"origin\":{\"elementId\":\"Start\",\"kind\":\"bpmnElement\"},\"outputs\":[\"out\"],\"timer\":{\"durationMs\":1000,\"durationMs\":1000}}]}" = false ∧
    programAccepted "{\"kind\":\"semanticProcess\",\"identity\":{\"compiler\":\"bpmn-source-semantic-process\",\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"internalSchedulingMode\":\"rejectObservableChoice\",\"processId\":\"p\",\"definitionScopes\":[],\"operationScopes\":[],\"controlPlaceScopes\":[],\"controlPlaces\":[],\"operations\":[{\"id\":\"\",\"input\":\"in\",\"kind\":\"terminateScope\",\"origin\":{\"elementId\":\"end\",\"kind\":\"bpmnElement\"},\"scopeId\":\"scope:p\"}]}" = false ∧
    programAccepted "{\"kind\":\"semanticProcess\",\"identity\":{\"compiler\":\"bpmn-source-semantic-process\",\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"internalSchedulingMode\":\"rejectObservableChoice\",\"processId\":\"p\",\"definitionScopes\":[],\"operationScopes\":[],\"controlPlaceScopes\":[],\"controlPlaces\":[],\"operations\":[{\"id\":\"terminate\",\"input\":\"in\",\"kind\":\"terminateScope\",\"origin\":{\"elementId\":\"\",\"kind\":\"bpmnElement\"},\"scopeId\":\"scope:p\"}]}" = false ∧
    programAccepted "{\"kind\":\"semanticProcess\",\"identity\":{\"compiler\":\"bpmn-source-semantic-process\",\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"internalSchedulingMode\":\"rejectObservableChoice\",\"processId\":\"p\",\"definitionScopes\":[],\"operationScopes\":[],\"controlPlaceScopes\":[],\"controlPlaces\":[],\"operations\":[{\"id\":\"terminate\",\"input\":\"\",\"kind\":\"terminateScope\",\"origin\":{\"elementId\":\"end\",\"kind\":\"bpmnElement\"},\"scopeId\":\"scope:p\"}]}" = false ∧
    programAccepted "{\"kind\":\"semanticProcess\",\"identity\":{\"compiler\":\"bpmn-source-semantic-process\",\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"internalSchedulingMode\":\"rejectObservableChoice\",\"processId\":\"p\",\"definitionScopes\":[],\"operationScopes\":[],\"controlPlaceScopes\":[],\"controlPlaces\":[],\"operations\":[{\"id\":\"terminate\",\"input\":\"in\",\"kind\":\"terminateScope\",\"origin\":{\"elementId\":\"end\",\"kind\":\"bpmnElement\"},\"scopeId\":\"\"}]}" = false ∧
    programAccepted "{\"kind\":\"semanticProcess\",\"identity\":{\"compiler\":\"bpmn-source-semantic-process\",\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"internalSchedulingMode\":\"rejectObservableChoice\",\"processId\":\"p\",\"definitionScopes\":[],\"operationScopes\":[],\"controlPlaceScopes\":[],\"controlPlaces\":[],\"operations\":[{\"id\":\"terminate\",\"input\":\"in\",\"kind\":\"terminateScope\",\"origin\":{\"elementId\":\"end\",\"kind\":\"bpmnElement\"}}]}" = false ∧
    programAccepted "{\"kind\":\"semanticProcess\",\"identity\":{\"compiler\":\"bpmn-source-semantic-process\",\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"internalSchedulingMode\":\"rejectObservableChoice\",\"processId\":\"p\",\"definitionScopes\":[],\"operationScopes\":[],\"controlPlaceScopes\":[],\"controlPlaces\":[],\"operations\":[{\"id\":\"terminate\",\"input\":\"in\",\"kind\":\"terminateScope\",\"origin\":{\"elementId\":\"end\",\"kind\":\"bpmnElement\"},\"scopeId\":\"scope:p\",\"unexpected\":true}]}" = false ∧
    programAccepted "{\"kind\":\"semanticProcess\",\"identity\":{\"compiler\":\"bpmn-source-semantic-process\",\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"internalSchedulingMode\":\"rejectObservableChoice\",\"processId\":\"p\",\"definitionScopes\":[],\"operationScopes\":[],\"controlPlaceScopes\":[],\"controlPlaces\":[],\"operations\":[{\"id\":\"terminate\",\"input\":\"in\",\"kind\":\"terminateScope\",\"origin\":{\"elementId\":\"end\",\"kind\":\"bpmnElement\"},\"scopeId\":1}]}" = false ∧
    programAccepted "{\"kind\":\"semanticProcess\",\"identity\":{\"compiler\":\"bpmn-source-semantic-process\",\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"internalSchedulingMode\":\"rejectObservableChoice\",\"processId\":\"p\",\"definitionScopes\":[],\"operationScopes\":[],\"controlPlaceScopes\":[],\"controlPlaces\":[],\"operations\":[{\"id\":\"terminate\",\"input\":\"in\",\"kind\":\"terminateScope\",\"origin\":{\"elementId\":\"end\",\"kind\":\"bpmnElement\"},\"scopeId\":\"scope:p\",\"scopeId\":\"scope:p\"}]}" = false := by
  native_decide

theorem message_payload_and_correlation_checked_program_and_stimulus_wire_contracts_are_exact :
    checkedNodesDecodedAs
        [.payloadMessageCatchEvent ⟨"catch"⟩ payloadChannel payloadOutput]
        (checkedNodeDocument "{\"channel\":{\"interfaceId\":\"interface\",\"interfaceOperationId\":\"operation\",\"kind\":\"operationMessage\",\"messageId\":\"message\"},\"directOutput\":{\"associationId\":\"association\",\"sourceDataOutputId\":\"dataOutput\",\"sourceDataOutputName\":\"Payload\",\"targetPropertyId\":\"property\"},\"id\":\"catch\",\"kind\":\"payloadMessageCatchEvent\"}") = true ∧
      checkedProcessAccepted
        (checkedNodeDocument "{\"channel\":{\"interfaceId\":\"interface\",\"interfaceOperationId\":\"operation\",\"kind\":\"operationMessage\",\"messageId\":\"message\"},\"id\":\"catch\",\"kind\":\"payloadMessageCatchEvent\"}") = false ∧
      checkedProcessAccepted
        (checkedNodeDocument "{\"channel\":{\"interfaceId\":\"interface\",\"interfaceOperationId\":\"operation\",\"kind\":\"operationMessage\",\"messageId\":\"message\"},\"directOutput\":{\"associationId\":\"association\",\"sourceDataOutputId\":\"dataOutput\",\"sourceDataOutputName\":\"Payload\",\"targetPropertyId\":\"property\"},\"id\":\"catch\",\"kind\":\"payloadMessageCatchEvent\",\"unexpected\":true}") = false ∧
      checkedProcessAccepted
        (checkedNodeDocument "{\"channel\":{\"kind\":\"directMessage\",\"messageId\":\"message\"},\"directOutput\":{\"associationId\":\"association\",\"sourceDataOutputId\":\"dataOutput\",\"sourceDataOutputName\":\"Payload\",\"targetPropertyId\":\"property\"},\"id\":\"catch\",\"kind\":\"payloadMessageCatchEvent\"}") = false ∧
      programOperationsDecodedAs
        [.awaitPayloadMessage ⟨"await"⟩ {
            elementId := ⟨"catch"⟩ } ⟨"input"⟩ ⟨"output"⟩
          { elementId := ⟨"catch"⟩, channel := payloadChannel } payloadOutput]
        (programOperationDocument "{\"directOutput\":{\"associationId\":\"association\",\"sourceDataOutputId\":\"dataOutput\",\"sourceDataOutputName\":\"Payload\",\"targetPropertyId\":\"property\"},\"id\":\"await\",\"input\":\"input\",\"kind\":\"awaitPayloadMessage\",\"message\":{\"channel\":{\"interfaceId\":\"interface\",\"interfaceOperationId\":\"operation\",\"kind\":\"operationMessage\",\"messageId\":\"message\"},\"elementId\":\"catch\"},\"origin\":{\"elementId\":\"catch\",\"kind\":\"bpmnElement\"},\"output\":\"output\"}") = true ∧
      programAccepted
        (programOperationDocument "{\"id\":\"await\",\"input\":\"input\",\"kind\":\"awaitPayloadMessage\",\"message\":{\"channel\":{\"interfaceId\":\"interface\",\"interfaceOperationId\":\"operation\",\"kind\":\"operationMessage\",\"messageId\":\"message\"},\"elementId\":\"catch\"},\"origin\":{\"elementId\":\"catch\",\"kind\":\"bpmnElement\"},\"output\":\"output\"}") = false ∧
      programAccepted
        (programOperationDocument "{\"directOutput\":{\"associationId\":\"association\",\"sourceDataOutputId\":\"dataOutput\",\"sourceDataOutputName\":\"Payload\",\"targetPropertyId\":\"property\"},\"id\":\"await\",\"input\":\"input\",\"kind\":\"awaitPayloadMessage\",\"message\":{\"channel\":{\"interfaceId\":\"interface\",\"interfaceOperationId\":\"operation\",\"kind\":\"operationMessage\",\"messageId\":\"message\"},\"elementId\":\"catch\"},\"origin\":{\"elementId\":\"catch\",\"kind\":\"bpmnElement\"},\"output\":\"output\",\"unexpected\":true}") = false ∧
      programAccepted
        (programOperationDocument "{\"directOutput\":{\"associationId\":\"association\",\"sourceDataOutputId\":\"dataOutput\",\"sourceDataOutputName\":\"Payload\",\"targetPropertyId\":\"property\"},\"id\":\"await\",\"input\":\"input\",\"kind\":\"awaitPayloadMessage\",\"message\":{\"channel\":{\"kind\":\"directMessage\",\"messageId\":\"message\"},\"elementId\":\"catch\"},\"origin\":{\"elementId\":\"catch\",\"kind\":\"bpmnElement\"},\"output\":\"output\"}") = false ∧
      scenarioStimuliDecodedAs
        [.deliverPayloadMessage ⟨"deliver"⟩ payloadSubscription payloadChannel
          (.string "settlement-reference-123")]
        (scenarioDocumentWithStimulus "{\"channel\":{\"interfaceId\":\"interface\",\"interfaceOperationId\":\"operation\",\"kind\":\"operationMessage\",\"messageId\":\"message\"},\"commandId\":\"deliver\",\"kind\":\"deliverPayloadMessage\",\"payload\":{\"kind\":\"string\",\"value\":\"settlement-reference-123\"},\"subscriptionId\":{\"processInstanceId\":\"instance\",\"elementId\":\"catch\",\"activation\":1}}") = true ∧
      scenarioRejected
        (scenarioDocumentWithStimulus "{\"channel\":{\"interfaceId\":\"interface\",\"interfaceOperationId\":\"operation\",\"kind\":\"operationMessage\",\"messageId\":\"message\"},\"commandId\":\"deliver\",\"kind\":\"deliverPayloadMessage\",\"subscriptionId\":{\"processInstanceId\":\"instance\",\"elementId\":\"catch\",\"activation\":1}}") = true ∧
      scenarioRejected
        (scenarioDocumentWithStimulus "{\"channel\":{\"interfaceId\":\"interface\",\"interfaceOperationId\":\"operation\",\"kind\":\"operationMessage\",\"messageId\":\"message\"},\"commandId\":\"deliver\",\"kind\":\"deliverPayloadMessage\",\"payload\":{\"kind\":\"string\",\"value\":\"settlement-reference-123\"},\"subscriptionId\":{\"processInstanceId\":\"instance\",\"elementId\":\"catch\",\"activation\":1},\"unexpected\":true}") = true ∧
    checkedNodesDecodedAs
        [.correlatedPayloadMessageCatchEvent ⟨"catch"⟩ payloadChannel "correlationKey"
          "correlationProperty" correlationPayloadSelector correlationProcessSelector]
        (checkedNodeDocument "{\"channel\":{\"interfaceId\":\"interface\",\"interfaceOperationId\":\"operation\",\"kind\":\"operationMessage\",\"messageId\":\"message\"},\"correlationKeyId\":\"correlationKey\",\"correlationPropertyId\":\"correlationProperty\",\"id\":\"catch\",\"kind\":\"correlatedPayloadMessageCatchEvent\",\"payloadSelector\":{\"body\":\"payload\",\"language\":\"urn:bpmn-lean:correlation-scalar-path:v1\"},\"processPropertySelector\":{\"body\":\"property:processProperty\",\"language\":\"urn:bpmn-lean:correlation-scalar-path:v1\",\"propertyId\":\"processProperty\"}}") = true ∧
      checkedProcessAccepted
        (checkedNodeDocument "{\"channel\":{\"interfaceId\":\"interface\",\"interfaceOperationId\":\"operation\",\"kind\":\"operationMessage\",\"messageId\":\"message\"},\"correlationKeyId\":\"correlationKey\",\"correlationPropertyId\":\"correlationProperty\",\"id\":\"catch\",\"kind\":\"correlatedPayloadMessageCatchEvent\",\"payloadSelector\":{\"body\":\" payload\",\"language\":\"urn:bpmn-lean:correlation-scalar-path:v1\"},\"processPropertySelector\":{\"body\":\"property:processProperty\",\"language\":\"urn:bpmn-lean:correlation-scalar-path:v1\",\"propertyId\":\"processProperty\"}}") = false ∧
      programOperationsDecodedAs
        [.awaitCorrelatedPayloadMessage ⟨"await"⟩ { elementId := ⟨"catch"⟩ }
          ⟨"input"⟩ ⟨"output"⟩ { elementId := ⟨"catch"⟩, channel := payloadChannel }
          "correlationKey" "correlationProperty" correlationPayloadSelector
          correlationProcessSelector]
        (programOperationDocument "{\"correlationKeyId\":\"correlationKey\",\"correlationPropertyId\":\"correlationProperty\",\"id\":\"await\",\"input\":\"input\",\"kind\":\"awaitCorrelatedPayloadMessage\",\"message\":{\"channel\":{\"interfaceId\":\"interface\",\"interfaceOperationId\":\"operation\",\"kind\":\"operationMessage\",\"messageId\":\"message\"},\"elementId\":\"catch\"},\"origin\":{\"elementId\":\"catch\",\"kind\":\"bpmnElement\"},\"output\":\"output\",\"payloadSelector\":{\"body\":\"payload\",\"language\":\"urn:bpmn-lean:correlation-scalar-path:v1\"},\"processPropertySelector\":{\"body\":\"property:processProperty\",\"language\":\"urn:bpmn-lean:correlation-scalar-path:v1\",\"propertyId\":\"processProperty\"}}") = true ∧
      programAccepted
        (programOperationDocument "{\"correlationKeyId\":\"correlationKey\",\"correlationPropertyId\":\"correlationProperty\",\"id\":\"await\",\"input\":\"input\",\"kind\":\"awaitCorrelatedPayloadMessage\",\"message\":{\"channel\":{\"interfaceId\":\"interface\",\"interfaceOperationId\":\"operation\",\"kind\":\"operationMessage\",\"messageId\":\"message\"},\"elementId\":\"catch\"},\"origin\":{\"elementId\":\"catch\",\"kind\":\"bpmnElement\"},\"output\":\"output\",\"payloadSelector\":{\"body\":\"payload\",\"language\":\"urn:bpmn-lean:correlation-scalar-path:v1\"},\"processPropertySelector\":{\"body\":\"property:other\",\"language\":\"urn:bpmn-lean:correlation-scalar-path:v1\",\"propertyId\":\"processProperty\"}}") = false ∧
      scenarioStimuliDecodedAs
        [.deliverCorrelatedPayloadMessage
          { commandId := ⟨"deliver"⟩, address := correlationAddress, ingressOrdinal := 1
            subscriptionId := payloadSubscription
            correlationPropertyId := "correlationProperty"
            processPropertyId := "processProperty"
            payload := { value := "settlement-reference-123" } }]
        (scenarioDocumentWithStimulus "{\"address\":{\"channel\":{\"interfaceId\":\"interface\",\"interfaceOperationId\":\"operation\",\"kind\":\"operationMessage\",\"messageId\":\"message\"},\"correlationKeyId\":\"correlationKey\",\"definition\":{\"compiler\":\"bpmn-source-semantic-process\",\"semanticProfile\":\"profile\",\"sourceId\":\"source\",\"sourceOverlay\":null,\"sourceSha256\":\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\"},\"processId\":\"process\"},\"commandId\":\"deliver\",\"correlationPropertyId\":\"correlationProperty\",\"ingressOrdinal\":1,\"kind\":\"deliverCorrelatedPayloadMessage\",\"payload\":{\"kind\":\"string\",\"value\":\"settlement-reference-123\"},\"processPropertyId\":\"processProperty\",\"subscriptionId\":{\"activation\":1,\"elementId\":\"catch\",\"processInstanceId\":\"instance\"}}") = true ∧
      scenarioRejected
        (scenarioDocumentWithStimulus "{\"address\":{\"channel\":{\"interfaceId\":\"interface\",\"interfaceOperationId\":\"operation\",\"kind\":\"operationMessage\",\"messageId\":\"message\"},\"correlationKeyId\":\"correlationKey\",\"definition\":{\"compiler\":\"bpmn-source-semantic-process\",\"semanticProfile\":\"profile\",\"sourceId\":\"source\",\"sourceOverlay\":null,\"sourceSha256\":\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\"},\"processId\":\"process\"},\"commandId\":\"deliver\",\"correlationPropertyId\":\"correlationProperty\",\"ingressOrdinal\":0,\"kind\":\"deliverCorrelatedPayloadMessage\",\"payload\":{\"kind\":\"string\",\"value\":\"settlement-reference-123\"},\"processPropertyId\":\"processProperty\",\"subscriptionId\":{\"activation\":1,\"elementId\":\"catch\",\"processInstanceId\":\"instance\"}}") = true := by
  native_decide

end BpmnSemantics.SemanticProcessJsonConformance
