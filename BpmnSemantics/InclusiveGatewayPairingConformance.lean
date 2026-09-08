import BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import BpmnSemantics.SemanticProcess.RootScopeFixtures

/-! Standalone IL witnesses for selected-branch declaration identity. The runtime's
`hiddenRecordDeclarationsValid` binds records by selection key, independently of join-input payload.
-/

namespace BpmnSemantics.InclusiveGatewayPairingConformance

open BpmnSemantics.SemanticProcess

private def region (label input output key : String) : List SemanticOperation :=
  [ .synchronizeSelected ⟨label ++ "J"⟩ { elementId := ⟨label ++ "J"⟩ }
      [⟨label ++ "1"⟩, ⟨label ++ "2"⟩, ⟨label ++ "3"⟩] ⟨output⟩ key
  , .selectMany ⟨label ++ "S"⟩ { elementId := ⟨label ++ "S"⟩ } ⟨input⟩
      [ { condition := .isPresent "x", output := ⟨label ++ "1"⟩,
          expectedJoinInput := ⟨label ++ "1"⟩, origin := { elementId := ⟨label ++ "1"⟩ } }
      , { condition := .isPresent "y", output := ⟨label ++ "2"⟩,
          expectedJoinInput := ⟨label ++ "2"⟩, origin := { elementId := ⟨label ++ "2"⟩ } } ]
      { output := ⟨label ++ "3"⟩, expectedJoinInput := ⟨label ++ "3"⟩,
        origin := { elementId := ⟨label ++ "3"⟩ } } key ]

private def pairedProgram (secondKey thirdKey : String) : Program :=
  let processId : ProcessId := ⟨"P"⟩
  let operations := region "A" "A0" "B0" "A" ++ region "B" "B0" "C0" secondKey ++
    region "C" "C0" "D0" thirdKey ++
    [ .reachNoneEnd ⟨"End"⟩ { elementId := ⟨"End"⟩ } ⟨"D0"⟩
    , .completeScope ⟨"Finish"⟩ { elementId := ⟨"P"⟩ } (rootDefinitionScopeId processId) none
    , .initiate ⟨"Start"⟩ { elementId := ⟨"Start"⟩ } ⟨"A0"⟩ ]
  let places : List ControlPlace :=
    ["A0", "A1", "A2", "A3", "B0", "B1", "B2", "B3", "C0", "C1", "C2", "C3", "D0"].map
      fun name => { id := ⟨name⟩, origin := { elementId := ⟨name⟩ } }
  { identity :=
      { compiler := .bpmnSourceSemanticProcess
        semanticProfile := ⟨"bpmn-2.0.2-inclusive-gateway-selected-branches-draft"⟩
        sourceId := ⟨"pairing"⟩
        sourceSha256 := "0000000000000000000000000000000000000000000000000000000000000000" }
    internalSchedulingMode := .rejectObservableChoice
    processId
    definitionScopes := [rootDefinitionScope processId]
    operationScopes := operations.map fun operation =>
      { operationId := operation.id, scopeId := rootDefinitionScopeId processId }
    controlPlaceScopes := places.map fun place =>
      { controlPlaceId := place.id, scopeId := rootDefinitionScopeId processId }
    controlPlaces := places
    operations }

theorem distinct_region_keys_are_structurally_admitted :
    programWellFormed (pairedProgram "B" "C") = true := by
  decide +kernel

theorem colliding_keys_preserve_graph_admission :
    programGraphWellFormedForProgram (pairedProgram "A" "C") = true ∧
      programGraphWellFormedForProgram (pairedProgram "A" "A") = true := by
  decide +kernel

theorem two_distinct_payload_pairs_cannot_share_a_selection_key :
    programWellFormed (pairedProgram "A" "C") = false := by
  decide +kernel

theorem three_distinct_payload_pairs_cannot_share_a_selection_key :
    programWellFormed (pairedProgram "A" "A") = false := by
  decide +kernel

end BpmnSemantics.InclusiveGatewayPairingConformance
