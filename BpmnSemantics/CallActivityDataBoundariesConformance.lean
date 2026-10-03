import BpmnSemantics.SemanticProcess.CallDataContract
import BpmnSemantics.SemanticProcessJson.CallData
import BpmnSemantics.SemanticProcessJson.CheckedProcess
import BpmnSemantics.SemanticProcessJson.Program
import BpmnSemantics.SemanticProcess.Lowering
import BpmnSemantics.SemanticProcess.ProfileShapeCatalog
import BpmnSemantics.SemanticProcess.CallActivityAdmission
import BpmnSemantics.SemanticProcess.CommandAdmission
import BpmnSemantics.SemanticProcess.CallDataTransfer
import BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import BpmnSemantics.SemanticProcess.CheckedProcessAdmission
import BpmnSemantics.SemanticProcess.Transition
import BpmnSemantics.SemanticProcess.TransitionTrace
import BpmnSemantics.SemanticProcess.CallDataStateValidation

/-! # Call data boundary discriminators

These finite declarations and raw transfers separate exact owner/reference correspondence from
label matching, cross-Process associations and control-only data loss. They establish no admitted
supplier trace or scheduled closure.
-/

namespace BpmnSemantics.CallActivityDataBoundariesConformance

open SemanticProcess

def interface (owner : String) : ScalarIoSpecification :=
  { ownerId := owner, id := owner ++ "_io"
    input := { id := owner ++ "_request", name := none }
    output := { id := owner ++ "_result", name := none }
    inputSet := { id := owner ++ "_inputs", name := none, dataInputRefs := [owner ++ "_request"] }
    outputSet := { id := owner ++ "_outputs", name := none, dataOutputRefs := [owner ++ "_result"] } }

def data : ScalarCallData :=
  { callerProperties := ["Receipt", "Request", "Result"]
    call := interface "Call", called := interface "Process"
    directInput := { associationId := "Read", source := .property "Request"
                     targetDataInputId := "Call_request", targetDataInputName := none }
    directOutput := { associationId := "Write", sourceDataOutputId := "Call_result"
                      sourceDataOutputName := none, target := .property "Result" } }

def valid (candidate : ScalarCallData) : Bool :=
  callDataInterfaceValid (.scalar candidate) "Call" "Process"

theorem separately_owned_singleton_ports_correspond : valid data = true := by
  decide +kernel

theorem correspondence_does_not_require_equal_names :
    valid { data with called := { data.called with
      input := { data.called.input with name := some "Different label" } } } = true := by
  decide +kernel

theorem caller_associations_cannot_skip_call_ports :
    (valid { data with directInput := { data.directInput with targetDataInputId := "Process_request" } },
     valid { data with directOutput := { data.directOutput with sourceDataOutputId := "Process_result" } }) =
      (false, false) := by
  decide +kernel

theorem matching_requires_exact_interface_owners_and_set_references :
    (valid { data with called := { data.called with ownerId := "Call" } },
     valid { data with called := { data.called with
       inputSet := { data.called.inputSet with dataInputRefs := ["Call_request"] } } },
     valid { data with called := { data.called with
       outputSet := { data.called.outputSet with dataOutputRefs := [] } } }) =
      (false, false, false) := by
  decide +kernel

theorem caller_endpoints_are_distinct_declared_properties :
    (valid { data with callerProperties := ["Request"] },
     valid { data with directInput := { data.directInput with source := .processDataInput "Request" } },
     valid { data with directOutput := { data.directOutput with target := .property "Request" } }) =
      (false, false, false) := by
  decide +kernel

theorem global_identity_separation_includes_unused_properties_and_associations :
    (valid { data with callerProperties := ["Request", "Result", "Process_inputs"] },
     valid { data with directOutput := { data.directOutput with associationId := "Read" } },
     valid { data with called := { data.called with id := "Call_io" } }) =
      (false, false, false) := by
  decide +kernel

open Lean SemanticProcessJson

def ioFields (owner : String) : List (String × Json) :=
  [("ownerId", toJson owner), ("id", toJson (owner ++ "_io")),
   ("input", Json.mkObj [("id", toJson (owner ++ "_request")), ("name", .null)]),
   ("output", Json.mkObj [("id", toJson (owner ++ "_result")), ("name", .null)]),
   ("inputSet", Json.mkObj [("id", toJson (owner ++ "_inputs")), ("name", .null),
     ("dataInputRefs", toJson [owner ++ "_request"])]),
   ("outputSet", Json.mkObj [("id", toJson (owner ++ "_outputs")), ("name", .null),
     ("dataOutputRefs", toJson [owner ++ "_result"])])]

def scalarFields : List (String × Json) :=
  [("kind", toJson "scalar"), ("callerProperties", toJson ["Receipt", "Request", "Result"]),
   ("call", Json.mkObj (ioFields "Call")), ("called", Json.mkObj (ioFields "Process")),
   ("directInput", Json.mkObj [("associationId", toJson "Read"),
     ("source", Json.mkObj [("kind", toJson "property"), ("propertyId", toJson "Request")]),
     ("targetDataInputId", toJson "Call_request"), ("targetDataInputName", .null)]),
   ("directOutput", Json.mkObj [("associationId", toJson "Write"),
     ("sourceDataOutputId", toJson "Call_result"), ("sourceDataOutputName", .null),
     ("target", Json.mkObj [("kind", toJson "property"), ("propertyId", toJson "Result")])])]

def replaceField (fields : List (String × Json)) (key : String) (value : Json) : Json :=
  Json.mkObj (fields.map fun pair => if pair.1 = key then (key, value) else pair)

def decodesAs (json : Json) (expected : CallDataInterface) : Bool :=
  match decodeCallDataInterface json with
  | .ok actual => decide (actual = expected)
  | .error _ => false

def refusesWire (json : Json) : Bool :=
  !(decodeCallDataInterface json).isOk

theorem call_wire_preserves_explicit_empty_and_exact_scalar_declarations :
    decodesAs (Json.mkObj [("kind", toJson "empty")]) .empty = true ∧
    decodesAs (Json.mkObj scalarFields) (.scalar data) = true := by
  decide +kernel

theorem call_wire_requires_every_scalar_field :
    (scalarFields.map fun omitted =>
      Json.mkObj (scalarFields.filter fun pair => pair.1 != omitted.1)).all refusesWire = true := by
  decide +kernel

theorem call_wire_has_no_null_unknown_or_extra_field_fallback :
    [Json.null, Json.mkObj [], Json.mkObj [("kind", toJson "other")],
     Json.mkObj [("kind", toJson "empty"), ("call", .null)],
     Json.mkObj (scalarFields ++ [("extra", .null)])].all refusesWire = true := by
  decide +kernel

theorem call_wire_checks_both_owned_interfaces_recursively :
    [replaceField scalarFields "call" (Json.mkObj ((ioFields "Call").filter fun p => p.1 != "input")),
     replaceField scalarFields "called" (Json.mkObj (ioFields "Process" ++ [("extra", .null)])),
     replaceField scalarFields "call" (replaceField (ioFields "Call") "input"
       (Json.mkObj [("id", toJson ""), ("name", .null)])),
     replaceField scalarFields "called" (replaceField (ioFields "Process") "outputSet"
       (Json.mkObj [("id", toJson "Outputs"), ("name", .null), ("dataOutputRefs", toJson [""])])),
     replaceField scalarFields "callerProperties" (toJson ["Request", ""])].all refusesWire = true := by
  decide +kernel

theorem call_wire_preserves_contextual_owner_errors_for_admission :
    decodesAs (replaceField scalarFields "called" (Json.mkObj (ioFields "Foreign")))
      (.scalar { data with called := interface "Foreign" }) = true ∧
    valid { data with called := interface "Foreign" } = false := by
  decide +kernel

def controlDeclarationFixture (callData : CallDataInterface) : CheckedProcess :=
  { identity := { semanticProfile := ⟨"bpmn-2.0.2-called-process-call-activity-draft"⟩
                  sourceId := ⟨"declaration-fixture"⟩, sourceSha256 := "digest" }
    processId := ⟨"Caller"⟩
    definitionScopes :=
      [{ id := ⟨"caller"⟩, parentScopeId := none, originElementId := ⟨"Caller"⟩ },
       { id := ⟨"called"⟩, parentScopeId := none, originElementId := ⟨"Process"⟩ }]
    nodes := [.noneStartEvent ⟨"CallerStart"⟩, .callActivity ⟨"Call"⟩ ⟨"Process"⟩ callData,
      .userTask ⟨"CallerTask"⟩ none, .noneEndEvent ⟨"CallerEnd"⟩,
      .noneStartEvent ⟨"CalledStart"⟩, .userTask ⟨"CalledTask"⟩ none, .noneEndEvent ⟨"CalledEnd"⟩]
    nodeScopes :=
      (["CallerStart", "Call", "CallerTask", "CallerEnd"].map fun id =>
        { nodeId := ⟨id⟩, scopeId := ⟨"caller"⟩ }) ++
      (["CalledStart", "CalledTask", "CalledEnd"].map fun id =>
        { nodeId := ⟨id⟩, scopeId := ⟨"called"⟩ })
    sequenceFlows :=
      [{ id := ⟨"f1"⟩, sourceId := ⟨"CallerStart"⟩, targetId := ⟨"Call"⟩ },
       { id := ⟨"f2"⟩, sourceId := ⟨"Call"⟩, targetId := ⟨"CallerTask"⟩ },
       { id := ⟨"f3"⟩, sourceId := ⟨"CallerTask"⟩, targetId := ⟨"CallerEnd"⟩ },
       { id := ⟨"f4"⟩, sourceId := ⟨"CalledStart"⟩, targetId := ⟨"CalledTask"⟩ },
       { id := ⟨"f5"⟩, sourceId := ⟨"CalledTask"⟩, targetId := ⟨"CalledEnd"⟩ }]
    sequenceFlowScopes :=
      (["f1", "f2", "f3"].map fun id => { sequenceFlowId := ⟨id⟩, scopeId := ⟨"caller"⟩ }) ++
      (["f4", "f5"].map fun id => { sequenceFlowId := ⟨id⟩, scopeId := ⟨"called"⟩ }) }

def loweredCallData (program : Program) : List CallDataInterface :=
  program.operations.filterMap fun
    | .invokeProcess _ _ _ _ _ _ _ callData | .returnProcess _ _ _ _ _ callData => some callData
    | _ => none

theorem call_lowering_preserves_both_exact_declarations :
    loweredCallData (lowerCheckedProcess (controlDeclarationFixture (.scalar data))) =
      [.scalar data, .scalar data] := by
  decide +kernel

theorem predecessor_profiles_require_the_explicit_empty_interface :
    checkedProfileCapabilitiesValid (controlDeclarationFixture .empty) = true ∧
    programProfileCapabilitiesValid (lowerCheckedProcess (controlDeclarationFixture .empty)) = true ∧
    checkedProfileCapabilitiesValid (controlDeclarationFixture (.scalar data)) = false ∧
    programProfileCapabilitiesValid (lowerCheckedProcess (controlDeclarationFixture (.scalar data))) = false := by
  decide +kernel

def mismatchedReturn : Program :=
  let program := lowerCheckedProcess (controlDeclarationFixture (.scalar data))
  { program with operations := program.operations.map fun
      | .returnProcess id origin process root output _ =>
          .returnProcess id origin process root output
            (.scalar { data with callerProperties := data.callerProperties ++ ["Invented"] })
      | operation => operation }

theorem call_pairing_requires_equal_data_declarations :
    callOperationsPaired (lowerCheckedProcess (controlDeclarationFixture (.scalar data))) = true ∧
    callOperationsPaired mismatchedReturn = false := by
  decide +kernel

def identityFields : List (String × Json) :=
  [("semanticProfile", toJson "profile"), ("sourceId", toJson "source"),
   ("sourceSha256", toJson "digest"), ("sourceOverlay", .null)]

def callNodeFields (wire : Json) : List (String × Json) :=
  [("kind", toJson "callActivity"), ("id", toJson "Call"),
   ("calledProcessId", toJson "Process"), ("data", wire)]

def checkedWire (node : Json) : Json :=
  Json.mkObj [("kind", toJson "checkedProcess"), ("identity", Json.mkObj identityFields),
    ("processId", toJson "Caller"), ("definitionScopes", .arr #[]), ("nodeScopes", .arr #[]),
    ("sequenceFlowScopes", .arr #[]), ("sequenceFlows", .arr #[]), ("nodes", .arr #[node])]

def operationWireFields (returning : Bool) (wire : Json) : List (String × Json) :=
  [("kind", toJson (if returning then "returnProcess" else "invokeProcess")),
   ("id", toJson (if returning then "ret" else "inv")),
   ("origin", Json.mkObj [("kind", toJson "bpmnElement"), ("elementId", toJson "Call")]),
   ("calledProcessId", toJson "Process"), ("calledRootScopeId", toJson "root"), ("data", wire)] ++
  (if returning then [("callerOutput", toJson "out")]
   else [("input", toJson "in"), ("calledEntry", toJson "entry"), ("returnOperationId", toJson "ret")])

def programWire (operations : List Json) : Json :=
  Json.mkObj [("kind", toJson "semanticProcess"),
    ("identity", Json.mkObj (identityFields ++ [("compiler", toJson "bpmn-source-semantic-process")])),
    ("processId", toJson "Caller"), ("internalSchedulingMode", toJson "rejectObservableChoice"),
    ("definitionScopes", .arr #[]), ("operationScopes", .arr #[]),
    ("controlPlaceScopes", .arr #[]), ("controlPlaces", .arr #[]), ("operations", .arr operations.toArray)]

def checkedWireRetains (wire : Json) (expected : CallDataInterface) : Bool :=
  match decodeCheckedProcess (checkedWire (Json.mkObj (callNodeFields wire))) with
  | .ok source => decide (source.nodes = [.callActivity ⟨"Call"⟩ ⟨"Process"⟩ expected])
  | .error _ => false

def programWireRetains (wire : Json) (expected : CallDataInterface) : Bool :=
  match decodeProgram (programWire [Json.mkObj (operationWireFields false wire),
      Json.mkObj (operationWireFields true wire)]) with
  | .ok program => decide (program.operations =
      [.invokeProcess ⟨"inv"⟩ ⟨⟨"Call"⟩⟩ ⟨"in"⟩ ⟨"Process"⟩ ⟨"root"⟩ ⟨"entry"⟩ ⟨"ret"⟩ expected,
       .returnProcess ⟨"ret"⟩ ⟨⟨"Call"⟩⟩ ⟨"Process"⟩ ⟨"root"⟩ ⟨"out"⟩ expected])
  | .error _ => false

theorem document_decoders_retain_both_call_data_variants :
    checkedWireRetains (Json.mkObj [("kind", toJson "empty")]) .empty = true ∧
    checkedWireRetains (Json.mkObj scalarFields) (.scalar data) = true ∧
    programWireRetains (Json.mkObj [("kind", toJson "empty")]) .empty = true ∧
    programWireRetains (Json.mkObj scalarFields) (.scalar data) = true := by
  decide +kernel

theorem document_decoders_require_call_data_without_legacy_defaults :
    (decodeCheckedProcess (checkedWire (Json.mkObj
      ((callNodeFields .null).filter fun pair => pair.1 != "data")))).isOk = false ∧
    (decodeCheckedProcess (checkedWire (Json.mkObj (callNodeFields .null)))).isOk = false ∧
    [false, true].all (fun returning =>
      !(decodeProgram (programWire [Json.mkObj
        ((operationWireFields returning .null).filter fun pair => pair.1 != "data")])).isOk &&
      !(decodeProgram (programWire [Json.mkObj (operationWireFields returning .null)])).isOk) = true := by
  decide +kernel

def callerOwner : ScopeOccurrenceId :=
  { processInstanceId := ⟨"CallerInstance"⟩, definitionScopeId := ⟨"CallerScope"⟩, activation := 1 }

def calledOwner : ScopeOccurrenceId :=
  { processInstanceId := deriveCalledProcessInstanceId callerOwner.processInstanceId ⟨"Call"⟩ 1
    definitionScopeId := ⟨"CalledScope"⟩, activation := 1 }

def beforeInvocation (value : VariableValue) : RuntimeState :=
  { initialState with
    control := .running callerOwner.processInstanceId
    scopeOccurrences := [{ id := callerOwner, parent := none }]
    tokens := [{ owner := callerOwner, placeId := ⟨"Input"⟩ }]
    variables := { emptyScopedVariables with process := { bindings :=
      [{ name := "Request", value }, { name := "Result", value := .string "old result" },
       { name := "Unrelated", value := .string "retained" }] } } }

def invokeScalar (state : RuntimeState) : Option RuntimeState :=
  invokeProcessWithDataState? state ⟨⟨"Call"⟩⟩ ⟨"Input"⟩ ⟨"Process"⟩ ⟨"CalledScope"⟩
    ⟨"CalledEntry"⟩ ⟨"Return"⟩ (.scalar data)

def callRecord : CalledProcessOccurrence :=
  { id := { processInstanceId := callerOwner.processInstanceId, elementId := ⟨"Call"⟩, activation := 1 }
    caller := callerOwner, calledProcessId := ⟨"Process"⟩, calledRoot := calledOwner
    returnOperationId := ⟨"Return"⟩ }

def beforeReturn (outputs : List VariableBinding) : RuntimeState :=
  { beforeInvocation (.string "supplier") with
    tokens := []
    scopeOccurrences := [{ id := callerOwner, parent := none }, { id := calledOwner, parent := none }]
    calledProcessOccurrences := [callRecord]
    callActivations := [{ elementId := ⟨"Call"⟩, count := 1 }]
    variables := { (beforeInvocation (.string "supplier")).variables with
      processInterfaces := [{ owner := calledOwner, inputs := [{ name := "Process_request", value := .string "supplier" }], outputs }] } }

def returnScalar (state : RuntimeState) : Option RuntimeState :=
  returnProcessWithDataState? state ⟨"Return"⟩ ⟨⟨"Call"⟩⟩ ⟨"Process"⟩ ⟨"CalledScope"⟩
    ⟨"CallerOutput"⟩ (.scalar data)

theorem scalar_invocation_copies_string_and_null_without_caller_write :
    [.string "supplier", .null].all (fun value =>
      match invokeScalar (beforeInvocation value) with
      | none => false
      | some state =>
          decide (state.variables.process = (beforeInvocation value).variables.process) &&
          decide (state.variables.processInterfaces = [{ owner := calledOwner, inputs := [{ name := "Process_request", value }], outputs := [] }]) &&
          decide (state.calledProcessOccurrences = [callRecord]) &&
          decide (state.tokens = [{ owner := calledOwner, placeId := ⟨"CalledEntry"⟩ }])) = true := by
  decide +kernel

theorem scalar_return_copies_string_and_null_and_disposes_the_exact_call :
    [.string "approved", .null].all (fun value =>
      match returnScalar (beforeReturn [{ name := "Process_result", value }]) with
      | none => false
      | some state =>
          decide (state.variables.process.bindings =
            [{ name := "Request", value := .string "supplier" }, { name := "Result", value },
             { name := "Unrelated", value := .string "retained" }]) &&
          state.variables.processInterfaces.isEmpty && state.calledProcessOccurrences.isEmpty &&
          decide (state.scopeOccurrences = [{ id := callerOwner, parent := none }]) &&
          decide (state.tokens = [{ owner := callerOwner, placeId := ⟨"CallerOutput"⟩ }]) &&
          (returnScalar state).isNone) = true := by
  decide +kernel

theorem scalar_return_refuses_missing_wrong_and_ambiguous_output :
    [[], [{ name := "Call_result", value := .null }],
     [{ name := "Process_result", value := .boolean true }],
     [{ name := "Process_result", value := .null }, { name := "Process_result", value := .null }]].all
      (fun outputs => (returnScalar (beforeReturn outputs)).isNone) = true := by
  decide +kernel

theorem scalar_return_requires_complete_owner_and_quiescence :
    (let state := beforeReturn [{ name := "Process_result", value := .null }]
     let scope : ProcessInterfaceScope :=
       { owner := calledOwner, inputs := [], outputs := [{ name := "Process_result", value := .null }] }
     [[], [scope, { scope with outputs := [] }],
      [{ scope with owner := { calledOwner with activation := 2 } }],
      [{ scope with owner := { calledOwner with definitionScopeId := ⟨"OtherScope"⟩ } }],
      [{ scope with owner := { calledOwner with processInstanceId := ⟨"OtherInstance"⟩ } }]].all
       (fun scopes => (returnScalar { state with variables := { state.variables with processInterfaces := scopes } }).isNone) &&
     (returnScalar { state with tokens := [{ owner := calledOwner, placeId := ⟨"CalledEntry"⟩ }] }).isNone) = true := by
  decide +kernel

theorem scalar_invocation_requires_unique_available_input_and_fresh_interface :
    (let state := beforeInvocation (.string "supplier")
     [[], [{ name := "Request", value := .boolean true }],
      [{ name := "Request", value := .null }, { name := "Request", value := .null }]].all
       (fun bindings => (invokeScalar { state with variables := { state.variables with process := { bindings } } }).isNone) &&
     (invokeScalar { state with variables := { state.variables with
       processInterfaces := [{ owner := calledOwner, inputs := [], outputs := [] }] } }).isNone) = true := by
  decide +kernel

def callerTaskInput : DirectActivityDataInput :=
  { associationId := "CallerTask_read", source := .property "Result"
    targetDataInputId := "CallerTask_input", targetDataInputName := none }

def callerTaskOutput : DirectActivityDataOutput :=
  { associationId := "CallerTask_write", sourceDataOutputId := "CallerTask_output"
    sourceDataOutputName := none, target := .property "Receipt" }

def calledTaskInput : DirectActivityDataInput :=
  { associationId := "CalledTask_read", source := .processDataInput "Process_request"
    targetDataInputId := "CalledTask_input", targetDataInputName := none }

def calledTaskOutput : DirectActivityDataOutput :=
  { associationId := "CalledTask_write", sourceDataOutputId := "CalledTask_output"
    sourceDataOutputName := none, target := .processDataOutput "Process_result" }

def supplierChecked : CheckedProcess :=
  let source := controlDeclarationFixture (.scalar data)
  { source with
    identity := { source.identity with
      semanticProfile := ⟨"bpmn-2.0.2-call-activity-data-boundaries-draft"⟩
      sourceSha256 := "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }
    definitionScopes := source.definitionScopes.foldr (canonicalInsertBy (fun left right => left.id.value < right.id.value)) []
    nodeScopes := source.nodeScopes.foldr (canonicalInsertBy (fun left right => left.nodeId.value < right.nodeId.value)) []
    nodes := (source.nodes.map fun
      | .userTask id name _ =>
          if id.value = "CallerTask" then .dataInputOutputUserTask id name callerTaskInput callerTaskOutput
          else .dataInputOutputUserTask id name calledTaskInput calledTaskOutput
      | node => node).foldr (canonicalInsertBy (fun left right => left.id.value < right.id.value)) [] }

theorem independent_supplier_checked_admission_accepts_the_exact_typed_model :
    checkedWellFormed supplierChecked = true := by
  decide +kernel

def changeSupplierCall (replace : ScalarCallData → ScalarCallData) : CheckedProcess :=
  { supplierChecked with nodes := supplierChecked.nodes.map fun
      | .callActivity id process (.scalar current) => .callActivity id process (.scalar (replace current))
      | node => node }

theorem independent_supplier_admission_rejects_call_identity_and_property_drift :
    [changeSupplierCall (fun current => { current with callerProperties := ["Request", "Result"] }),
     changeSupplierCall (fun current => { current with callerProperties := ["Receipt", "Request", "Result", "f1"] }),
     changeSupplierCall (fun current => { current with called := { current.called with ownerId := "Caller" } }),
     changeSupplierCall (fun current => { current with callerProperties := ["Request", "Receipt", "Result"] })].all
       (fun source => !(checkedWellFormed source)) = true := by
  decide +kernel

theorem supplier_admission_preserves_unused_properties_and_descriptive_names :
    checkedWellFormed (changeSupplierCall (fun current => { current with
      callerProperties := current.callerProperties ++ ["Unused"]
      called := { current.called with
        input := { current.called.input with name := some "A different label" }
        outputSet := { current.called.outputSet with name := some "Descriptive only" } } })) = true := by
  decide +kernel

theorem checked_supplier_admission_selects_the_exact_private_execution_profile :
    programProfileCapabilitiesValid (lowerCheckedProcess supplierChecked) = true := by
  decide +kernel

theorem independent_supplier_admission_rejects_cross_process_endpoints_and_early_caller_task :
    [ { supplierChecked with nodes := supplierChecked.nodes.map fun
          | .dataInputOutputUserTask id name input output =>
              if id.value = "CalledTask" then .dataInputOutputUserTask id name
                { input with source := .property "Request" } output else .dataInputOutputUserTask id name input output
          | node => node },
      { supplierChecked with nodes := supplierChecked.nodes.map fun
          | .dataInputOutputUserTask id name input output =>
              if id.value = "CallerTask" then .dataInputOutputUserTask id name input
                { output with target := .property "Result" } else .dataInputOutputUserTask id name input output
          | node => node },
      { supplierChecked with sequenceFlows := supplierChecked.sequenceFlows.map fun flow =>
          if flow.id.value = "f1" then { flow with targetId := ⟨"CallerTask"⟩ }
          else if flow.id.value = "f2" then { flow with sourceId := ⟨"CallerTask"⟩, targetId := ⟨"Call"⟩ }
          else if flow.id.value = "f3" then { flow with sourceId := ⟨"Call"⟩ }
          else flow } ].all (fun source => !(checkedWellFormed source)) = true := by
  decide +kernel

theorem standalone_supplier_program_admits_exact_lowering :
    programWellFormed (lowerCheckedProcess supplierChecked) = true := by
  decide +kernel

theorem standalone_supplier_program_rejects_property_inventory_drift :
    [changeSupplierCall (fun current => { current with callerProperties := ["Request", "Result"] }),
     changeSupplierCall (fun current => { current with callerProperties := ["Receipt", "Request", "Result", "f1"] }),
     changeSupplierCall (fun current => { current with callerProperties := ["Request", "Receipt", "Result"] })].all
       (fun source => !(programWellFormed (lowerCheckedProcess source))) = true := by
  decide +kernel

theorem standalone_supplier_program_rejects_cross_process_data_routing :
    [ { supplierChecked with nodes := supplierChecked.nodes.map fun
          | .dataInputOutputUserTask id name input output =>
              if id.value = "CalledTask" then .dataInputOutputUserTask id name
                { input with source := .property "Request" } output else .dataInputOutputUserTask id name input output
          | node => node },
      { supplierChecked with nodes := supplierChecked.nodes.map fun
          | .dataInputOutputUserTask id name input output =>
              if id.value = "CalledTask" then .dataInputOutputUserTask id name input
                { output with target := .property "Result" } else .dataInputOutputUserTask id name input output
          | node => node },
      { supplierChecked with sequenceFlows := supplierChecked.sequenceFlows.map fun flow =>
          if flow.id.value = "f1" then { flow with targetId := ⟨"CallerTask"⟩ }
          else if flow.id.value = "f2" then { flow with sourceId := ⟨"CallerTask"⟩, targetId := ⟨"Call"⟩ }
          else if flow.id.value = "f3" then { flow with sourceId := ⟨"Call"⟩ }
          else flow } ].all (fun source => !(programWellFormed (lowerCheckedProcess source))) = true := by
  decide +kernel

def supplierProgram : Program :=
  lowerCheckedProcess (changeSupplierCall (fun current =>
    { current with callerProperties := current.callerProperties ++ ["Unused"] }))

def supplierStart (bindings : List VariableBinding) : ExternalAdmission :=
  admitStimulus supplierProgram initialState (.startProcess ⟨"start"⟩ ⟨"Caller"⟩ ⟨"instance"⟩ bindings)

def supplierInitial (value : VariableValue) : List VariableBinding :=
  [{ name := "Request", value }, { name := "Result", value := .string "previous" },
   { name := "Unused", value := .string "untouched" }]

theorem supplier_start_admits_exact_string_and_null_request_with_optional_declared_properties :
    [.string "supplier", .null].all (fun value =>
      let result := supplierStart (supplierInitial value)
      result.outcome == .committed && result.state.variables.process.bindings == supplierInitial value &&
        result.state.variables.processInterfaces.isEmpty) = true := by
  decide +kernel

theorem supplier_start_refuses_missing_undeclared_duplicate_unordered_and_non_scalar_data :
    [[], [{ name := "Result", value := .null }],
     supplierInitial (.null) ++ [{ name := "Unknown", value := .null }],
     [{ name := "Request", value := .null }, { name := "Request", value := .null }],
     (supplierInitial (.null)).reverse,
     [{ name := "Request", value := .boolean true }],
     [{ name := "Request", value := .integer 1 }],
     [{ name := "Request", value := .stringList ["supplier"] }]].all (fun bindings =>
       let result := supplierStart bindings
       result.outcome == .rejected && result.state == initialState) = true := by
  decide +kernel

def supplierCalledWait? : Option RuntimeState := do
  let started := (supplierStart (supplierInitial (.string "supplier"))).state
  let root : ScopeOccurrenceId := { processInstanceId := ⟨"instance"⟩, definitionScopeId := ⟨"caller"⟩, activation := 1 }
  let initiated := { started with initiationPending := false, tokens := [{ owner := root, placeId := ⟨"place:f1"⟩ }] }
  let .invokeProcess _ origin input process scope entry returned declaration :=
    (← supplierProgram.operations.find? fun | .invokeProcess .. => true | _ => false) | none
  let called ← invokeProcessWithDataState? initiated origin input process scope entry returned declaration
  let .awaitDataInputOutputUserTask _ _ taskInput taskOutput taskId name directInput _ :=
    (← supplierProgram.operations.find? fun
      | .awaitDataInputOutputUserTask _ _ _ _ taskId .. => taskId.value == "CalledTask"
      | _ => false) | none
  activateDataInputOutputUserTask? called taskInput taskOutput taskId name directInput

def supplierComplete (state : RuntimeState) (task : UserTaskInstanceId) (values : List VariableBinding) : ExternalAdmission :=
  admitStimulus supplierProgram state (.completeUserTaskInstance ⟨"complete"⟩ task values)

theorem supplier_called_completion_fills_only_process_output_for_string_and_null :
    (match supplierCalledWait? with
     | none => false
     | some before => [.string "approved", .null].all fun value =>
         match before.waits with
         | [wait] =>
             let result := supplierComplete before
               { processInstanceId := wait.processInstanceId, elementId := ⟨wait.task.id.value⟩, activation := wait.activation }
               [{ name := "CalledTask_output", value }]
             result.outcome == .committed && result.state.variables.process == before.variables.process &&
               result.state.variables.processInterfaces.any (fun scope => scope.outputs == [{ name := "Process_result", value }]) &&
               result.state.waits.isEmpty && result.state.variables.activities.isEmpty && result.state.calledProcessOccurrences.length == 1
         | _ => false) = true := by
  decide +kernel

theorem supplier_called_completion_refuses_wrong_output_and_occurrence_without_mutation :
    (match supplierCalledWait? with
     | none => false
     | some before => match before.waits with
       | [wait] =>
           let task : UserTaskInstanceId :=
             { processInstanceId := wait.processInstanceId, elementId := ⟨wait.task.id.value⟩, activation := wait.activation }
           let fields := [[], [{ name := "Process_result", value := .null }],
             [{ name := "CalledTask_output", value := .boolean true }],
             [{ name := "CalledTask_output", value := .null }, { name := "CalledTask_output", value := .null }]]
           let ids := [{ task with processInstanceId := ⟨"instance"⟩ },
             { task with processInstanceId := ⟨"foreign"⟩ }, { task with activation := 2 },
             { task with elementId := ⟨"CallerTask"⟩ }]
           (fields.all fun values =>
             let result := supplierComplete before task values
             result.outcome == .rejected && result.state == before) &&
           ids.all (fun id =>
             let result := supplierComplete before id [{ name := "CalledTask_output", value := .null }]
             result.outcome == .rejected && result.state == before)
       | _ => false) = true := by
  decide +kernel

theorem supplier_called_completion_is_stale_after_its_single_write :
    (match supplierCalledWait? with
     | none => false
     | some before => match before.waits with
       | [wait] =>
           let task : UserTaskInstanceId :=
             { processInstanceId := wait.processInstanceId, elementId := ⟨wait.task.id.value⟩, activation := wait.activation }
           let after := supplierComplete before task [{ name := "CalledTask_output", value := .string "approved" }]
           let duplicate := supplierComplete after.state task [{ name := "CalledTask_output", value := .null }]
           after.outcome == .committed && duplicate.outcome == .rejected && duplicate.state == after.state
       | _ => false) = true := by
  decide +kernel

theorem supplier_start_binds_optional_values_to_actual_property_declarations :
    [supplierChecked, changeSupplierCall (fun current =>
      { current with callerProperties := ["Other", "Receipt", "Request", "Result"] })].all (fun source =>
      let result := admitStimulus (lowerCheckedProcess source) initialState
        (.startProcess ⟨"start"⟩ ⟨"Caller"⟩ ⟨"instance"⟩ (supplierInitial (.null)))
      result.outcome == .rejected && result.state == initialState) = true := by
  decide +kernel

theorem operation_dispatch_invokes_scalar_data_without_control_only_fallback :
    [.string "supplier", .null].all (fun value =>
      let state := beforeInvocation value
      let operation := SemanticOperation.invokeProcess ⟨"Invoke"⟩ ⟨⟨"Call"⟩⟩ ⟨"Input"⟩
        ⟨"Process"⟩ ⟨"CalledScope"⟩ ⟨"CalledEntry"⟩ ⟨"Return"⟩ (.scalar data)
      (fire? supplierProgram operation state).isSome &&
      fire? supplierProgram operation state == invokeScalar state &&
      (fire? supplierProgram operation { state with variables := emptyScopedVariables }).isNone) = true := by
  decide +kernel

theorem operation_dispatch_returns_scalar_data_only_with_available_output :
    [.string "approved", .null].all (fun value =>
      let state := beforeReturn [{ name := "Process_result", value }]
      let operation := SemanticOperation.returnProcess ⟨"Return"⟩ ⟨⟨"Call"⟩⟩
        ⟨"Process"⟩ ⟨"CalledScope"⟩ ⟨"CallerOutput"⟩ (.scalar data)
      (fire? supplierProgram operation state).isSome &&
      fire? supplierProgram operation state == returnScalar state &&
      (fire? supplierProgram operation (beforeReturn [])).isNone) = true := by
  decide +kernel

def supplierStartCommand (value : VariableValue) : Stimulus :=
  .startProcess ⟨"start"⟩ ⟨"Caller"⟩ ⟨"instance"⟩ (supplierInitial value)

def supplierCalledCommand (value : VariableValue) : Stimulus :=
  .completeUserTaskInstance ⟨"called"⟩
    { processInstanceId := deriveCalledProcessInstanceId ⟨"instance"⟩ ⟨"Call"⟩ 1
      elementId := ⟨"CalledTask"⟩, activation := 1 }
    [{ name := "CalledTask_output", value }]

def supplierCallerCommand : Stimulus :=
  .completeUserTaskInstance ⟨"caller"⟩
    { processInstanceId := ⟨"instance"⟩, elementId := ⟨"CallerTask"⟩, activation := 1 }
    [{ name := "CallerTask_output", value := .string "receipt" }]

def supplierStartedTrace : TracedStimulusResult :=
  applyStimulusTraced 3 supplierProgram initialState (supplierStartCommand (.string "supplier"))

def supplierReturnedTrace : TracedStimulusResult :=
  applyStimulusTraced 3 supplierProgram supplierStartedTrace.result.state
    (supplierCalledCommand (.string "approved"))

def supplierFinishedTrace : TracedStimulusResult :=
  applyStimulusTraced 2 supplierProgram supplierReturnedTrace.result.state supplierCallerCommand

theorem supplier_scheduled_start_closes_in_three_steps_with_publication :
    supplierStartedTrace.result.outcome = .committed ∧
    some supplierStartedTrace.result.state = supplierCalledWait? ∧
    supplierStartedTrace.committedTransitions.length = 4 ∧
    supplierStartedTrace.flowNodeOccurrenceLifecycles.length = 4 := by
  decide +kernel

theorem supplier_scheduled_return_closes_in_three_steps_with_publication :
    supplierReturnedTrace.result.outcome = .committed ∧
    supplierReturnedTrace.result.state.variables.process.bindings =
      [{ name := "Request", value := .string "supplier" },
       { name := "Result", value := .string "approved" },
       { name := "Unused", value := .string "untouched" }] ∧
    supplierReturnedTrace.result.state.variables.processInterfaces = [] ∧
    supplierReturnedTrace.committedTransitions.length = 4 ∧
    supplierReturnedTrace.flowNodeOccurrenceLifecycles.length = 4 := by
  decide +kernel

theorem supplier_scheduled_completion_closes_in_two_steps_with_publication :
    supplierFinishedTrace.result.outcome = .committed ∧
    supplierFinishedTrace.result.state.control = .completed ⟨"instance"⟩ ∧
    supplierFinishedTrace.result.state.variables.process.bindings =
      [{ name := "Receipt", value := .string "receipt" },
       { name := "Request", value := .string "supplier" },
       { name := "Result", value := .string "approved" },
       { name := "Unused", value := .string "untouched" }] ∧
    supplierFinishedTrace.committedTransitions.length = 3 ∧
    supplierFinishedTrace.flowNodeOccurrenceLifecycles.length = 3 := by
  decide +kernel

theorem supplier_one_less_step_rolls_back_the_complete_command_without_publication :
    [(initialState, supplierStartCommand (.string "supplier"), 2),
     (supplierStartedTrace.result.state, supplierCalledCommand (.string "approved"), 2),
     (supplierReturnedTrace.result.state, supplierCallerCommand, 1)].all (fun (state, command, fuel) =>
       let trace := applyStimulusTraced fuel supplierProgram state command
       trace.result.outcome == .rolledBack && trace.result.state == state &&
       trace.result.internalStepBoundExceeded && trace.committedTransitions.isEmpty &&
       trace.flowNodeOccurrenceLifecycles.isEmpty) = true := by
  decide +kernel

def supplierHost : ScopeOccurrenceId :=
  { processInstanceId := ⟨"instance"⟩, definitionScopeId := ⟨"caller"⟩, activation := 1 }

def supplierCallee : ScopeOccurrenceId :=
  { processInstanceId := deriveCalledProcessInstanceId ⟨"instance"⟩ ⟨"Call"⟩ 1
    definitionScopeId := ⟨"called"⟩, activation := 1 }

def expectedRecord (id : String) (kind : SemanticOperationKind) (element : String)
    (owner : ScopeOccurrenceId) : CommittedTransition :=
  .internalOperation { operationId := ⟨id⟩, operationKind := kind, origin := ⟨⟨element⟩⟩, owner }

theorem supplier_scheduled_trace_has_exact_operation_id_kind_origin_and_owner :
    supplierStartedTrace.committedTransitions =
      [.externalStimulus (supplierStartCommand (.string "supplier")),
       expectedRecord "operation:CallerStart" .initiate "CallerStart" supplierHost,
       expectedRecord "operation:Call" .invokeProcess "Call" supplierHost,
       expectedRecord "operation:CalledTask" .awaitDataInputOutputUserTask "CalledTask" supplierCallee] ∧
    supplierReturnedTrace.committedTransitions =
      [.externalStimulus (supplierCalledCommand (.string "approved")),
       expectedRecord "operation:CalledEnd" .reachNoneEnd "CalledEnd" supplierCallee,
       expectedRecord "operation:return-process:Call" .returnProcess "Call" supplierCallee,
       expectedRecord "operation:CallerTask" .awaitDataInputOutputUserTask "CallerTask" supplierHost] ∧
    supplierFinishedTrace.committedTransitions =
      [.externalStimulus supplierCallerCommand,
       expectedRecord "operation:CallerEnd" .reachNoneEnd "CallerEnd" supplierHost,
       expectedRecord "operation:complete-scope:caller" .completeScope "Caller" supplierHost] := by
  decide +kernel

def expectedInstant (command element process : String) (index : Nat)
    (owner : ScopeOccurrenceId) : UnnumberedFlowNodeOccurrenceDelta :=
  { started := [{ anchor := .transition ⟨command⟩ index 0, processId := ⟨process⟩, elementId := ⟨element⟩, owner }]
    ended := [{ anchor := .transition ⟨command⟩ index 0, terminal := .completed }] }

def expectedTaskStart (element process : String) (owner : ScopeOccurrenceId) :
    UnnumberedFlowNodeOccurrenceDelta :=
  { started := [{ anchor := .wait { processInstanceId := owner.processInstanceId, elementId := ⟨element⟩, activation := 1 }, processId := ⟨process⟩, elementId := ⟨element⟩, owner }], ended := [] }

def expectedTaskEnd (element : String) (owner : ScopeOccurrenceId) :
    UnnumberedFlowNodeOccurrenceDelta :=
  { started := [], ended := [{ anchor := .wait { processInstanceId := owner.processInstanceId, elementId := ⟨element⟩, activation := 1 }, terminal := .completed }] }

theorem supplier_scheduled_lifecycles_retain_exact_called_identity_and_return_order :
    supplierStartedTrace.flowNodeOccurrenceLifecycles =
      [{ started := [], ended := [] }, expectedInstant "start" "CallerStart" "Caller" 1 supplierHost,
       { started := [{ anchor := .callActivity { processInstanceId := ⟨"instance"⟩, elementId := ⟨"Call"⟩, activation := 1 }, processId := ⟨"Caller"⟩, elementId := ⟨"Call"⟩, owner := supplierHost }], ended := [] },
       expectedTaskStart "CalledTask" "Process" supplierCallee] ∧
    supplierReturnedTrace.flowNodeOccurrenceLifecycles =
      [expectedTaskEnd "CalledTask" supplierCallee, expectedInstant "called" "CalledEnd" "Process" 1 supplierCallee,
       { started := [], ended := [{ anchor := .callActivity { processInstanceId := ⟨"instance"⟩, elementId := ⟨"Call"⟩, activation := 1 }, terminal := .completed }] },
       expectedTaskStart "CallerTask" "Caller" supplierHost] ∧
    supplierFinishedTrace.flowNodeOccurrenceLifecycles =
      [expectedTaskEnd "CallerTask" supplierHost, expectedInstant "caller" "CallerEnd" "Caller" 1 supplierHost,
       { started := [], ended := [] }] := by
  decide +kernel

def singletonPrefixes (before : RuntimeState) (trace : TracedStimulusResult) : Bool :=
  !trace.committedTransitions.isEmpty && (List.range trace.committedTransitions.length).all fun index =>
    match replayCommittedTransitions supplierProgram before (trace.committedTransitions.take (index + 1)) with
    | none => false
    | some state =>
        let frontier := InternalCommutation.deriveInternalExecutionFrontier supplierProgram state
        !frontier.preparationFailed && frontier.offers.length ==
          (if index + 1 == trace.committedTransitions.length then 0 else 1)

theorem every_supplier_scheduled_microstep_has_a_complete_singleton_frontier :
    singletonPrefixes initialState supplierStartedTrace = true ∧
    singletonPrefixes supplierStartedTrace.result.state supplierReturnedTrace = true ∧
    singletonPrefixes supplierReturnedTrace.result.state supplierFinishedTrace = true := by
  decide +kernel

theorem unprepared_scalar_offer_cannot_enter_a_multiple_offer_batch :
    (let before := (supplierStart (supplierInitial (.string "supplier"))).state
     let started := step supplierProgram before ⟨"operation:CallerStart"⟩
     match started with
     | none => false
     | some state =>
         let program := { supplierProgram with operations := supplierProgram.operations ++
           [.reachNoneEnd ⟨"operation:OtherEnd"⟩ ⟨⟨"OtherEnd"⟩⟩ ⟨"place:f1"⟩] }
         let frontier := InternalCommutation.deriveInternalExecutionFrontier program state
         let closure := InternalCommutation.closeScheduledTraced 8 program ⟨"adversary"⟩ 1 0 [] state
         frontier.offers.length == 2 && frontier.offers.any (fun offer => offer.preparation.isNone) &&
         closure.ambiguousChoice && closure.state == state && closure.records.isNone && closure.lifecycles.isNone) = true := by
  decide +kernel

def validSupplierPrefixes (before : RuntimeState) (trace : TracedStimulusResult) : Bool :=
  callDataCheckpointStateWellFormed supplierProgram ⟨"instance"⟩ before &&
  (List.range trace.committedTransitions.length).all fun index =>
    match replayCommittedTransitions supplierProgram before (trace.committedTransitions.take (index + 1)) with
    | none => false
    | some state => callDataCheckpointStateWellFormed supplierProgram ⟨"instance"⟩ state

theorem supplier_initial_admitted_scheduled_and_terminal_states_preserve_complete_validity :
    validSupplierPrefixes initialState supplierStartedTrace = true ∧
    validSupplierPrefixes supplierStartedTrace.result.state supplierReturnedTrace = true ∧
    validSupplierPrefixes supplierReturnedTrace.result.state supplierFinishedTrace = true := by
  decide +kernel

theorem malformed_called_interface_cannot_be_completed :
    (match supplierCalledWait? with
     | none => false
     | some state => match state.waits with
       | [wait] =>
           let task : UserTaskInstanceId :=
             { processInstanceId := wait.processInstanceId, elementId := ⟨wait.task.id.value⟩, activation := wait.activation }
           [false, true].all fun premature =>
             let malformed := { state with variables := { state.variables with
               processInterfaces := state.variables.processInterfaces.map fun scope =>
                 if premature then { scope with outputs := [{ name := "Process_result", value := .null }] }
                 else { scope with inputs := scope.inputs ++ [{ name := "Undeclared", value := .null }] } } }
             let result := supplierComplete malformed task [{ name := "CalledTask_output", value := .null }]
             result.outcome == .rejected && result.state == malformed
       | _ => false) = true := by
  decide +kernel

theorem null_supplier_data_preserves_validity_through_actual_scheduled_closure :
    (let start := applyStimulusTraced 3 supplierProgram initialState (supplierStartCommand .null)
     let returned := applyStimulusTraced 3 supplierProgram start.result.state (supplierCalledCommand .null)
     let finished := applyStimulusTraced 2 supplierProgram returned.result.state supplierCallerCommand
     start.result.outcome == .committed && returned.result.outcome == .committed && finished.result.outcome == .committed &&
     validSupplierPrefixes initialState start && validSupplierPrefixes start.result.state returned &&
     validSupplierPrefixes returned.result.state finished &&
     start.committedTransitions.length == 4 && returned.committedTransitions.length == 4 && finished.committedTransitions.length == 3 &&
     start.flowNodeOccurrenceLifecycles == supplierStartedTrace.flowNodeOccurrenceLifecycles &&
     returned.flowNodeOccurrenceLifecycles == supplierReturnedTrace.flowNodeOccurrenceLifecycles &&
     finished.flowNodeOccurrenceLifecycles == supplierFinishedTrace.flowNodeOccurrenceLifecycles &&
     finished.result.state.variables.process.bindings ==
       [{ name := "Receipt", value := .string "receipt" }, { name := "Request", value := .null },
        { name := "Result", value := .null }, { name := "Unused", value := .string "untouched" }]) = true := by
  decide +kernel

theorem interface_owner_port_cardinality_and_lifetime_corruption_is_invalid :
    (match supplierCalledWait? with
     | none => false
     | some state => match state.variables.processInterfaces with
       | [scope] =>
           let scopes := [[], [scope, scope], [{ scope with owner := { scope.owner with activation := 2 } }],
             [{ scope with owner := { scope.owner with processInstanceId := ⟨"foreign"⟩ } }],
             [{ scope with owner := { scope.owner with definitionScopeId := ⟨"caller"⟩ } }],
             [{ scope with inputs := [] }], [{ scope with inputs := scope.inputs ++ scope.inputs }],
             [{ scope with inputs := [{ name := "Call_request", value := .null }] }],
             [{ scope with inputs := [{ name := "Process_request", value := .boolean true }] }],
             [{ scope with outputs := [{ name := "Process_result", value := .null }] }]]
           scopes.all (fun interfaces => !callDataRuntimeStateValid supplierProgram
             { state with variables := { state.variables with processInterfaces := interfaces } }) &&
           !callDataRuntimeStateValid supplierProgram { state with calledProcessOccurrences := [] } &&
           !callDataRuntimeStateValid supplierProgram { state with variables := { state.variables with activities := [] } } &&
           !callDataRuntimeStateValid supplierProgram { state with variables := { state.variables with activities := state.variables.activities ++ state.variables.activities } } &&
           !callDataRuntimeStateValid supplierProgram { state with variables := { state.variables with process := { bindings := state.variables.process.bindings ++ [{ name := "Wrong", value := .null }] } } } &&
           !callDataRuntimeStateValid supplierProgram { initialState with variables := state.variables } &&
           !callDataRuntimeStateValid supplierProgram { supplierFinishedTrace.result.state with variables := { supplierFinishedTrace.result.state.variables with processInterfaces := [scope] } }
       | _ => false) = true := by
  decide +kernel

end BpmnSemantics.CallActivityDataBoundariesConformance
