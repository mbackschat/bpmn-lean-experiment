import BpmnSemantics.SemanticProcessJson

/-! Executable locks for language-neutral JSON and ordering behavior. -/

namespace BpmnSemantics.SemanticProcessJsonConformance

open BpmnSemantics.SemanticProcessJson
open BpmnSemantics.SemanticProcess

def parseRejected (contents : String) : Bool :=
  match parseWireJson contents with
  | .ok _ => false
  | .error _ => true

def variableValueDecodedAs (expected : VariableValue)
    (result : Except String VariableValue) : Bool :=
  match result with
  | .ok actual => decide (actual = expected)
  | .error _ => false

def scenarioRejected (contents : String) : Bool :=
  match parseWireJson contents >>= decodeScenario with
  | .ok _ => false
  | .error _ => true

def messageChannelRejected (contents : String) : Bool :=
  match parseWireJson contents >>= decodeMessageChannel with
  | .ok _ => false
  | .error _ => true

def checkedProcessAccepted (contents : String) : Bool :=
  match parseWireJson contents >>= decodeCheckedProcess with
  | .ok _ => true
  | .error _ => false

def checkedNodeDocument (node : String) : String :=
  "{\"kind\":\"checkedProcess\",\"identity\":{\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"processId\":\"p\",\"definitionScopes\":[],\"nodeScopes\":[],\"sequenceFlowScopes\":[],\"nodes\":[" ++
    node ++ "],\"sequenceFlows\":[]}"

def programAccepted (contents : String) : Bool :=
  match parseWireJson contents >>= decodeProgram with
  | .ok _ => true
  | .error _ => false

def checkedNodesDecodedAs (expected : List CheckedNode)
    (contents : String) : Bool :=
  match parseWireJson contents >>= decodeCheckedProcess with
  | .ok process => decide (process.nodes = expected)
  | .error _ => false

def programOperationDocument (operation : String) : String :=
  "{\"kind\":\"semanticProcess\",\"identity\":{\"compiler\":\"bpmn-source-semantic-process\",\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"internalSchedulingMode\":\"rejectObservableChoice\",\"processId\":\"p\",\"definitionScopes\":[],\"operationScopes\":[],\"controlPlaceScopes\":[],\"controlPlaces\":[],\"operations\":[" ++
    operation ++ "]}"

def programOperationsDecodedAs (expected : List SemanticOperation)
    (contents : String) : Bool :=
  match parseWireJson contents >>= decodeProgram with
  | .ok program => decide (program.operations = expected)
  | .error _ => false

def scenarioDocumentWithStimulus (stimulus : String) : String :=
  "{\"kind\":\"scenario\",\"id\":\"s\",\"profile\":\"p\",\"bpmn\":{\"id\":\"b\",\"relativePath\":\"b\",\"sha256\":\"x\",\"sourceOverlay\":null},\"stimuli\":[" ++
    stimulus ++
    "],\"observations\":[],\"provenance\":{\"normativeRefs\":[],\"cibRevision\":\"r\",\"cibRefs\":[]}}"

def scenarioStimuliDecodedAs (expected : List Stimulus)
    (contents : String) : Bool :=
  match parseWireJson contents >>= decodeScenario with
  | .ok scenario => decide (scenario.stimuli = expected)
  | .error _ => false

def payloadChannel : MessageChannel :=
  .operationMessage ⟨"interface"⟩ ⟨"operation"⟩ ⟨"message"⟩

def payloadOutput : DirectCatchEventPayloadOutput :=
  { associationId := "association"
    sourceDataOutputId := "dataOutput"
    sourceDataOutputName := some "Payload"
    targetPropertyId := "property" }

def payloadSubscription : MessageSubscriptionId :=
  { processInstanceId := ⟨"instance"⟩
    elementId := ⟨"catch"⟩
    activation := 1 }

def correlationPayloadSelector : CorrelationMessagePath :=
  { language := correlationScalarPathLanguage, body := "payload" }

def correlationProcessSelector : CorrelationProcessPropertyPath :=
  { language := correlationScalarPathLanguage
    body := "property:processProperty"
    propertyId := "processProperty" }

def correlationDefinition : ProgramIdentity :=
  { compiler := .bpmnSourceSemanticProcess
    semanticProfile := ⟨"profile"⟩
    sourceId := ⟨"source"⟩
    sourceSha256 := "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }

def correlationAddress : CorrelatedMessageAddress :=
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

def exactWireIntegerAdmissionWitness : IO Unit := do
  unless ["1.0", "1e1", "1E+2", "1.0000000000000001",
      "9007199254740991.1", "1e-400", "1e400", "-1",
      "9007199254740992", "9007199254740993"].all parseRejected do
    throw (IO.userError "wire integer tokens: noncanonical or inexact spelling admitted")
  unless ["0", "1", "9007199254740991"].all (fun text =>
      match parseWireJson text >>= decodeSafeNat with
      | .ok value => toString value == text
      | .error _ => false) do
    throw (IO.userError "wire integer tokens: canonical value changed or refused")
  unless parseRejected "{\"value\":[0,{\"activation\":1e1}]}" &&
      parseRejected "{\"value\":[0,{\"activation\":9007199254740991.1}]}" &&
      !parseRejected "{\"value\":[0,{\"activation\":9007199254740991}]}" do
    throw (IO.userError "wire integer tokens: nested admission mismatch")
  unless !parseRejected "{\"value\":\"-0 1e1 1.0 9007199254740993\"}" &&
      !parseRejected "{\"value\":\"quoted \\\"1e1\\\" and \\\\ slash\",\"activation\":1}" do
    throw (IO.userError "wire integer tokens: string content treated as a number")

#eval exactWireIntegerAdmissionWitness

def valueDecoded (contents : String) : Except String VariableValue :=
  parseWireJson contents >>= decodeVariableValue

def valueRejected (contents : String) : Bool :=
  (valueDecoded contents).toOption.isNone

def stringJson (text : String) : String := "{\"kind\":\"string\",\"value\":\"" ++ text ++ "\"}"
def nullJson : String := "{\"kind\":\"null\"}"
def listJson (members : List String) : String :=
  "{\"kind\":\"list\",\"value\":[" ++ ",".intercalate members ++ "]}"
def mapJson (entries : List (String × String)) : String :=
  "{\"kind\":\"map\",\"value\":[" ++
    ",".intercalate (entries.map fun (name, value) => "{\"name\":\"" ++ name ++ "\",\"value\":" ++ value ++ "}") ++ "]}"
def decimalJson (coefficient : String) (scale : String) : String :=
  "{\"kind\":\"decimal\",\"coefficient\":\"" ++ coefficient ++ "\",\"scale\":" ++ scale ++ "}"

def orderItem : BusinessValue := .map [("quantity", .integer 1), ("sku", .string "A")]

/-- The capsule's 12-node order: present-null `line2`, two equal items and an exact signed total. -/
def businessOrder : BusinessValue :=
  .map [("address", .map [("city", .string "Berlin"), ("line2", .null)]),
        ("items", .list [orderItem, orderItem]),
        ("total", .decimal 12345 2)]

def orderItemJson : String :=
  mapJson [("quantity", "{\"kind\":\"integer\",\"value\":1}"), ("sku", stringJson "A")]

def businessOrderJson : String :=
  mapJson [("address", mapJson [("city", stringJson "Berlin"), ("line2", nullJson)]),
           ("items", listJson [orderItemJson, orderItemJson]),
           ("total", decimalJson "12345" "2")]

/-- Nest `depth` containers around a null leaf; the root container counts as one. -/
def nestedListJson : Nat → String
  | 0 => nullJson
  | depth + 1 => listJson [nestedListJson depth]

/-- A root List of `groups` Lists of `members` Nulls has `1 + groups × (1 + members)` nodes. -/
def groupedNullsJson (groups members : Nat) : String :=
  listJson (List.replicate groups (listJson (List.replicate members nullJson)))

/-- A root List of sixteen Strings whose canonical encoding is `489 + payload` UTF-8 bytes. -/
def sixteenStringsJson (payload : Nat) : String :=
  listJson ((List.replicate 15 (stringJson (String.ofList (List.replicate 1000 'a')))) ++
    [stringJson (String.ofList (List.replicate (payload - 15000) 'a'))])

def portableBusinessValueWireWitness : IO Unit := do
  unless (valueDecoded businessOrderJson).toOption ==
      some (.map [("address", .map [("city", .string "Berlin"), ("line2", .null)]),
        ("items", .list [orderItem, orderItem]), ("total", .decimal 12345 2)]) do
    throw (IO.userError "PBV-TREE-01: the order did not decode to its exact tree")
  unless ((valueDecoded businessOrderJson >>= fun value =>
      decodeVariableValue (encodeVariableValue value)).toOption ==
        (valueDecoded businessOrderJson).toOption) do
    throw (IO.userError "PBV-IDENTITY-01: the order did not survive encoding and decoding")
  unless [decimalJson "12345" "2", decimalJson "-125" "2", decimalJson "0" "0",
      decimalJson "9223372036854775807" "0", decimalJson "-9223372036854775808" "0",
      decimalJson "1" "6"].all (!valueRejected ·) do
    throw (IO.userError "PBV-AMOUNT-01: a canonical in-range Decimal was refused")
  unless [decimalJson "9223372036854775808" "0", decimalJson "-9223372036854775809" "0",
      decimalJson "-0" "0", decimalJson "01" "0", decimalJson "+1" "0", decimalJson "1e2" "0",
      decimalJson "123450" "3", decimalJson "0" "1", decimalJson "1" "7", decimalJson "" "0",
      "{\"kind\":\"decimal\",\"coefficient\":12345,\"scale\":2}",
      "{\"kind\":\"decimal\",\"coefficient\":\"1\",\"scale\":\"2\"}",
      "{\"kind\":\"decimal\",\"coefficient\":\"1\",\"scale\":0,\"value\":1}"].all valueRejected do
    throw (IO.userError "PBV-AMOUNT-01: a noncanonical or out-of-range Decimal was admitted")
  unless !valueRejected (listJson []) && !valueRejected (mapJson []) &&
      !valueRejected (listJson [nullJson, stringJson "x", decimalJson "1" "0", listJson []]) &&
      !valueRejected (mapJson [("", nullJson)]) &&
      !valueRejected (mapJson [("￿", nullJson), ("𐀀", nullJson)]) do
    throw (IO.userError "PBV-TREE-01: an admissible List or Map was refused")
  unless valueRejected (listJson ["{\"kind\":\"stringList\",\"value\":[]}"]) &&
      valueRejected (mapJson [("b", nullJson), ("a", nullJson)]) &&
      valueRejected (mapJson [("a", nullJson), ("a", nullJson)]) &&
      valueRejected (mapJson [("𐀀", nullJson), ("￿", nullJson)]) &&
      valueRejected "{\"kind\":\"map\",\"value\":[{\"name\":\"a\",\"value\":{\"kind\":\"null\"},\"extra\":1}]}" &&
      valueRejected "{\"kind\":\"list\",\"value\":[],\"extra\":1}" &&
      valueRejected (listJson [nullJson, nullJson, decimalJson "01" "0"]) do
    throw (IO.userError "PBV-IDENTITY-01: a nested legacy, noncanonical or malformed tree was admitted")
  unless !valueRejected (nestedListJson 4) && valueRejected (nestedListJson 5) &&
      !valueRejected (listJson (List.replicate 32 nullJson)) &&
      valueRejected (listJson (List.replicate 33 nullJson)) &&
      !valueRejected (groupedNullsJson 15 16) && valueRejected (groupedNullsJson 16 15) &&
      !valueRejected (sixteenStringsJson 15895) && valueRejected (sixteenStringsJson 15896) &&
      !valueRejected (listJson [stringJson (String.ofList (List.replicate 1024 'a'))]) &&
      valueRejected (listJson [stringJson (String.ofList (List.replicate 1025 'a'))]) &&
      valueRejected (mapJson [(String.ofList (List.replicate 1025 'a'), nullJson)]) do
    throw (IO.userError "PBV-BOUND-01: an exact limit was refused or a one-over value admitted")
  unless !valueRejected (stringJson (String.ofList (List.replicate 2000 'a'))) do
    throw (IO.userError "root String arm gained the portable member byte limit")

#eval portableBusinessValueWireWitness

def business_order_has_twelve_nodes_and_container_depth_three : Bool := decide <|
    businessOrder.nodeCount = 12 ∧ businessOrder.containerDepth = 3

def business_value_types_remain_pairwise_distinct : Bool := decide <|
    VariableValue.integer 1 ≠ .decimal 1 0 ∧
      VariableValue.boolean true ≠ .string "true" ∧
      VariableValue.null ≠ .map [] ∧
      VariableValue.list [.string "a"] ≠ .stringList ["a"] ∧
      BusinessValue.integer 1 ≠ .decimal 1 0

def business_trees_keep_multiplicity_order_and_present_null : Bool := decide <|
    VariableValue.list [orderItem, orderItem] ≠ .list [orderItem] ∧
      VariableValue.list [.integer 1, .integer 2] ≠ .list [.integer 2, .integer 1] ∧
      VariableValue.map [("line2", .null)] ≠ .map []

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

def maximum_safe_wire_nat_is_accepted : Bool := decide <|
    isSafeWireNat 9007199254740991 = true

def first_unsafe_wire_nat_is_rejected : Bool := decide <|
    isSafeWireNat 9007199254740992 = false

def bmp_scalar_precedes_supplementary_scalar : Bool := decide <|
    compare "\uE000" "𐀀" = .lt

def canonically_equivalent_strings_remain_distinct : Bool := decide <|
    ("e\u0301" : String) ≠ "\u00E9"

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

def effectResultAccepted (businessError : Bool) (names : List String) : Bool :=
  let patch := Lean.Json.arr (names.map fun name => Lean.Json.mkObj
    [("name", .str name), ("value", Lean.Json.mkObj [("kind", .str "null")])]).toArray
  let result := Lean.Json.mkObj
    ([("kind", .str (if businessError then "bpmnError" else "success")), ("localPatch", patch)] ++
      if businessError then [("code", .str "REVIEW"), ("message", .null)] else [])
  match decodeEffectExecutionResult result with
  | .ok _ => true
  | .error _ => false

def effect_success_duplicate_patch_wire_admission : Bool := decide <|
    effectResultAccepted false ["a", "a"] = false

def effect_success_reversed_patch_wire_admission : Bool := decide <|
    effectResultAccepted false ["b", "a"] = false

def effect_success_canonical_patch_wire_admission : Bool := decide <|
    effectResultAccepted false ["a", "b"] = true

def effect_bpmnError_duplicate_patch_wire_admission : Bool := decide <|
    effectResultAccepted true ["a", "a"] = false

def effect_bpmnError_reversed_patch_wire_admission : Bool := decide <|
    effectResultAccepted true ["b", "a"] = false

def effect_bpmnError_canonical_patch_wire_admission : Bool := decide <|
    effectResultAccepted true ["a", "b"] = true

def sequentialScopeNodeFields : List (String × Lean.Json) :=
  [("kind", .str "sequentialMultiInstanceSubProcess"), ("id", .str "mi"),
   ("childScopeId", .str "body"), ("collectionName", .str "items"),
   ("itemName", .str "item"), ("bodyInputs", .arr #[]), ("completionBooleanName", .null)]

def sequentialScopeEntryFields : List (String × Lean.Json) :=
  [("kind", .str "enterSequentialMultiInstanceScope"), ("id", .str "enter"),
   ("origin", Lean.Json.mkObj [("kind", .str "bpmnElement"), ("elementId", .str "mi")]),
   ("input", .str "before"), ("childEntry", .str "first"), ("childScopeId", .str "body"),
   ("normalOutput", .str "after"), ("collectionName", .str "items"),
   ("itemName", .str "item"), ("bodyInputs", .arr #[]), ("completionBooleanName", .str "done")]

def sequentialScopeCompletionFields : List (String × Lean.Json) :=
  [("kind", .str "completeSequentialMultiInstanceScope"), ("id", .str "complete"),
   ("origin", Lean.Json.mkObj [("kind", .str "bpmnElement"), ("elementId", .str "mi")]),
   ("entryOperationId", .str "enter")]

def sequentialScopeDecodedNodes (fields : List (String × Lean.Json)) :
    Option (List CheckedNode) :=
  let identity := Lean.Json.mkObj [("semanticProfile", .str "p"), ("sourceId", .str "s"),
    ("sourceOverlay", .null), ("sourceSha256", .str "x")]
  (decodeCheckedProcess (Lean.Json.mkObj [("kind", .str "checkedProcess"), ("identity", identity),
    ("processId", .str "p"), ("definitionScopes", .arr #[]), ("nodeScopes", .arr #[]),
    ("sequenceFlowScopes", .arr #[]), ("sequenceFlows", .arr #[]),
    ("nodes", .arr #[Lean.Json.mkObj fields])])).toOption.map (·.nodes)

def sequentialScopeDecodedOperations (fields : List (String × Lean.Json)) :
    Option (List SemanticOperation) :=
  let identity := Lean.Json.mkObj [("compiler", .str "bpmn-source-semantic-process"),
    ("semanticProfile", .str "p"), ("sourceId", .str "s"), ("sourceOverlay", .null),
    ("sourceSha256", .str "x")]
  (decodeProgram (Lean.Json.mkObj [("kind", .str "semanticProcess"), ("identity", identity),
    ("internalSchedulingMode", .str "rejectObservableChoice"), ("processId", .str "p"),
    ("definitionScopes", .arr #[]), ("operationScopes", .arr #[]),
    ("controlPlaceScopes", .arr #[]), ("controlPlaces", .arr #[]),
    ("operations", .arr #[Lean.Json.mkObj fields])])).toOption.map (·.operations)

def sequential_scope_wire_preserves_entry_policy_and_completion_binding : Bool := decide <|
    sequentialScopeDecodedNodes sequentialScopeNodeFields =
      some [.sequentialMultiInstanceSubProcess ⟨"mi"⟩ ⟨"body"⟩ "items" "item" [] none] ∧
    sequentialScopeDecodedOperations sequentialScopeEntryFields =
      some [.enterSequentialMultiInstanceScope ⟨"enter"⟩ { elementId := ⟨"mi"⟩ }
        ⟨"before"⟩ ⟨"first"⟩ ⟨"body"⟩ ⟨"after"⟩ "items" "item" [] (some "done")] ∧
    sequentialScopeDecodedOperations sequentialScopeCompletionFields =
      some [.completeSequentialMultiInstanceScope ⟨"complete"⟩ { elementId := ⟨"mi"⟩ } ⟨"enter"⟩]

def sequential_scope_wire_rejects_missing_policy_and_empty_binding : Bool := decide <|
    sequentialScopeDecodedNodes (sequentialScopeNodeFields.map fun (key, value) =>
      (key, if key == "completionBooleanName" then .str "" else value)) = none ∧
    sequentialScopeDecodedOperations
      (sequentialScopeEntryFields.filter fun field => field.1 != "bodyInputs") = none ∧
    sequentialScopeDecodedOperations (sequentialScopeCompletionFields.map fun (key, value) =>
      (key, if key == "entryOperationId" then .str "" else value)) = none

def sequential_scope_completion_wire_rejects_a_second_continuation_owner : Bool := decide <|
    sequentialScopeDecodedOperations
      (sequentialScopeCompletionFields ++ [("normalOutput", .str "elsewhere")]) = none

/-- Every executable check of this module, named for the driver's failure report. -/
def checks : List (String × Bool) := [
  ("business_order_has_twelve_nodes_and_container_depth_three", business_order_has_twelve_nodes_and_container_depth_three),
  ("business_value_types_remain_pairwise_distinct", business_value_types_remain_pairwise_distinct),
  ("business_trees_keep_multiplicity_order_and_present_null", business_trees_keep_multiplicity_order_and_present_null),
  ("maximum_safe_wire_nat_is_accepted", maximum_safe_wire_nat_is_accepted),
  ("first_unsafe_wire_nat_is_rejected", first_unsafe_wire_nat_is_rejected),
  ("bmp_scalar_precedes_supplementary_scalar", bmp_scalar_precedes_supplementary_scalar),
  ("canonically_equivalent_strings_remain_distinct", canonically_equivalent_strings_remain_distinct),
  ("effect_success_duplicate_patch_wire_admission", effect_success_duplicate_patch_wire_admission),
  ("effect_success_reversed_patch_wire_admission", effect_success_reversed_patch_wire_admission),
  ("effect_success_canonical_patch_wire_admission", effect_success_canonical_patch_wire_admission),
  ("effect_bpmnError_duplicate_patch_wire_admission", effect_bpmnError_duplicate_patch_wire_admission),
  ("effect_bpmnError_reversed_patch_wire_admission", effect_bpmnError_reversed_patch_wire_admission),
  ("effect_bpmnError_canonical_patch_wire_admission", effect_bpmnError_canonical_patch_wire_admission),
  ("sequential_scope_wire_preserves_entry_policy_and_completion_binding", sequential_scope_wire_preserves_entry_policy_and_completion_binding),
  ("sequential_scope_wire_rejects_missing_policy_and_empty_binding", sequential_scope_wire_rejects_missing_policy_and_empty_binding),
  ("sequential_scope_completion_wire_rejects_a_second_continuation_owner", sequential_scope_completion_wire_rejects_a_second_continuation_owner)
]

end BpmnSemantics.SemanticProcessJsonConformance
