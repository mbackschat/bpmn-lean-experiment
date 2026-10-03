import BpmnSemantics.SemanticProcessContract

/-! Separately authored checked and Program graphs make lowering equality a useful discriminator for serial Activity data handoff, rather than constructing one representation from the other. -/

namespace BpmnSemantics.SemanticProcess.StructuredCompositionFixtures

def profile : ProfileId := ⟨"bpmn-2.0.2-structured-process-composition-draft"⟩

def dataTask (id input output reads writes : String) : SemanticOperation :=
  .awaitDataInputOutputUserTask ⟨"operation:" ++ id⟩ { elementId := ⟨id⟩ }
    ⟨"place:" ++ input⟩ ⟨"place:" ++ output⟩ ⟨id⟩ none
    { associationId := id ++ "InputAssociation"
      sourcePropertyId := reads
      targetDataInputId := id ++ "Input"
      targetDataInputName := none }
    { associationId := id ++ "OutputAssociation"
      sourceDataOutputId := id ++ "Output"
      targetPropertyId := writes
      sourceDataOutputName := none }

def serialOperations : List SemanticOperation :=
  [ dataTask "Archive" "b" "c" "Decision" "Receipt"
  , dataTask "Assess" "a" "b" "Invoice" "Decision"
  , .reachNoneEnd ⟨"operation:End"⟩ { elementId := ⟨"End"⟩ } ⟨"place:d"⟩
  , .awaitUserTask ⟨"operation:Notify"⟩ { elementId := ⟨"Notify"⟩ }
      ⟨"place:c"⟩ ⟨"place:d"⟩ { id := ⟨"Notify"⟩, name := none }
  , .initiate ⟨"operation:Start"⟩ { elementId := ⟨"Start"⟩ } ⟨"place:a"⟩
  , .completeScope ⟨"operation:complete-scope:scope:InvoiceProcess"⟩ { elementId := ⟨"InvoiceProcess"⟩ }
      ⟨"scope:InvoiceProcess"⟩ none ]

def serialProgram : Program :=
  { identity :=
      { compiler := .bpmnSourceSemanticProcess
        semanticProfile := profile
        sourceId := ⟨"composition-fixture"⟩
        sourceSha256 := String.ofList (List.replicate 64 'a') }
    internalSchedulingMode := .rejectObservableChoice
    processId := ⟨"InvoiceProcess"⟩
    definitionScopes :=
      [{ id := ⟨"scope:InvoiceProcess"⟩, parentScopeId := none
         originElementId := ⟨"InvoiceProcess"⟩ }]
    operationScopes := serialOperations.map fun op =>
      { operationId := op.id, scopeId := ⟨"scope:InvoiceProcess"⟩ }
    controlPlaceScopes := ["a", "b", "c", "d"].map fun id =>
      { controlPlaceId := ⟨"place:" ++ id⟩, scopeId := ⟨"scope:InvoiceProcess"⟩ }
    controlPlaces := ["a", "b", "c", "d"].map fun id =>
      { id := ⟨"place:" ++ id⟩, origin := { elementId := ⟨id⟩ } }
    operations := serialOperations }

def serialChecked : CheckedProcess :=
  { identity :=
      { semanticProfile := profile
        sourceId := ⟨"composition-fixture"⟩
        sourceSha256 := String.ofList (List.replicate 64 'a') }
    processId := ⟨"InvoiceProcess"⟩
    definitionScopes :=
      [{ id := ⟨"scope:InvoiceProcess"⟩, parentScopeId := none
         originElementId := ⟨"InvoiceProcess"⟩ }]
    nodeScopes := ["Archive", "Assess", "End", "Notify", "Start"].map fun id =>
      { nodeId := ⟨id⟩, scopeId := ⟨"scope:InvoiceProcess"⟩ }
    sequenceFlowScopes := ["a", "b", "c", "d"].map fun id =>
      { sequenceFlowId := ⟨id⟩, scopeId := ⟨"scope:InvoiceProcess"⟩ }
    nodes :=
      [ .dataInputOutputUserTask ⟨"Archive"⟩ none
          { associationId := "ArchiveInputAssociation", sourcePropertyId := "Decision"
            targetDataInputId := "ArchiveInput", targetDataInputName := none }
          { associationId := "ArchiveOutputAssociation", sourceDataOutputId := "ArchiveOutput"
            targetPropertyId := "Receipt", sourceDataOutputName := none }
      , .dataInputOutputUserTask ⟨"Assess"⟩ none
          { associationId := "AssessInputAssociation", sourcePropertyId := "Invoice"
            targetDataInputId := "AssessInput", targetDataInputName := none }
          { associationId := "AssessOutputAssociation", sourceDataOutputId := "AssessOutput"
            targetPropertyId := "Decision", sourceDataOutputName := none }
      , .noneEndEvent ⟨"End"⟩
      , .userTask ⟨"Notify"⟩ none none
      , .noneStartEvent ⟨"Start"⟩ ]
    sequenceFlows :=
      [ { id := ⟨"a"⟩, sourceId := ⟨"Start"⟩, targetId := ⟨"Assess"⟩ }
      , { id := ⟨"b"⟩, sourceId := ⟨"Assess"⟩, targetId := ⟨"Archive"⟩ }
      , { id := ⟨"c"⟩, sourceId := ⟨"Archive"⟩, targetId := ⟨"Notify"⟩ }
      , { id := ⟨"d"⟩, sourceId := ⟨"Notify"⟩, targetId := ⟨"End"⟩ } ] }

end BpmnSemantics.SemanticProcess.StructuredCompositionFixtures
