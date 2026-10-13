import BpmnSemantics.SemanticProcess.ProfileShapeCatalog
import BpmnSemantics.SemanticProcess.TransitionTrace

/-! Portable handoff witnesses run the actual external dispatcher and its internal closure on the
capsule's typed order, so neither a widened value domain nor a widened Property path alone can
satisfy them. They are finite checks of the selected profile, not universal codec or resumption
theorems; see the
[serial-handoff amendment](../docs/capsules/PORTABLE-BUSINESS-VALUES-PROPOSAL.md#decisive-witnesses-and-checkpoint).
-/

set_option Elab.async false

namespace BpmnSemantics.PortableHandoffConformance

open SemanticProcess

private def dataTask (id input output reads writes : String) : SemanticOperation :=
  .awaitDataInputOutputUserTask ⟨"operation:" ++ id⟩ { elementId := ⟨id⟩ }
    ⟨"place:" ++ input⟩ ⟨"place:" ++ output⟩ ⟨id⟩ none
    { associationId := id ++ "InputAssociation", source := .property reads
      targetDataInputId := id ++ "Input", targetDataInputName := none }
    { associationId := id ++ "OutputAssociation", sourceDataOutputId := id ++ "Output"
      target := .property writes, sourceDataOutputName := none }

private def scopeId : DefinitionScopeId := ⟨"scope:OrderProcess"⟩

private def program (profile : ProfileId) (operations : List SemanticOperation) : Program :=
  { identity :=
      { compiler := .bpmnSourceSemanticProcess, semanticProfile := profile
        sourceId := ⟨"portable-handoff-fixture"⟩
        sourceSha256 := String.ofList (List.replicate 64 'b') }
    internalSchedulingMode := .rejectObservableChoice
    processId := ⟨"OrderProcess"⟩
    definitionScopes := [{ id := scopeId, parentScopeId := none, originElementId := ⟨"OrderProcess"⟩ }]
    operationScopes := operations.map fun operation => { operationId := operation.id, scopeId }
    controlPlaceScopes := ["a", "b", "c"].map fun id =>
      { controlPlaceId := ⟨"place:" ++ id⟩, scopeId }
    controlPlaces := ["a", "b", "c"].map fun id => { id := ⟨"place:" ++ id⟩, origin := { elementId := ⟨id⟩ } }
    operations }

private def boundary : List SemanticOperation :=
  [ .initiate ⟨"operation:Start"⟩ { elementId := ⟨"Start"⟩ } ⟨"place:a"⟩
  , .reachNoneEnd ⟨"operation:End"⟩ { elementId := ⟨"End"⟩ } ⟨"place:c"⟩
  , .completeScope ⟨"operation:complete-scope:scope:OrderProcess"⟩ { elementId := ⟨"OrderProcess"⟩ }
      scopeId none ]

private def handoff : Program :=
  program portableHandoffProfileId
    (dataTask "Review" "a" "b" "OrderDraft" "ReviewedOrder" ::
      dataTask "Archive" "b" "c" "ReviewedOrder" "ArchivedOrder" :: boundary)

/-- Renamed tasks and Properties, declared in the opposite order. -/
private def renamed : Program :=
  program portableHandoffProfileId
    (boundary.reverse ++ [dataTask "Store" "b" "c" "Checked" "Stored", dataTask "Check" "a" "b" "Draft" "Checked"])

private def orderItem (sku : String) : BusinessValue := .map [("quantity", .integer 1), ("sku", .string sku)]

/-- The capsule's 12-node order: present-null `line2`, two equal items and an exact signed total. -/
private def order : VariableValue :=
  .map [("address", .map [("city", .string "Berlin"), ("line2", .null)]),
        ("items", .list [orderItem "A", orderItem "A"]),
        ("total", .decimal 12345 2)]

/-- Ordered unequal items and a negative total defeat deduplication, sorting and unsigned readers. -/
private def revision : VariableValue :=
  .map [("address", .map [("city", .string "Berlin"), ("line2", .null)]),
        ("items", .list [orderItem "B", orderItem "A"]),
        ("total", .decimal (-125) 2)]

private def start (target : Program) (bindings : List VariableBinding) : StimulusResult :=
  applyStimulus scenarioClosureLimit target initialState (.startProcess ⟨"start"⟩ ⟨"OrderProcess"⟩ ⟨"order-1"⟩ bindings)

private def task (id : String) : UserTaskInstanceId :=
  { processInstanceId := ⟨"order-1"⟩, elementId := ⟨id⟩, activation := 1 }

private def complete (state : RuntimeState) (id : String) (bindings : List VariableBinding) :
    StimulusResult :=
  applyStimulus scenarioClosureLimit handoff state (.completeUserTaskInstance ⟨"complete-" ++ id⟩ (task id) bindings)

private def value? (bindings : List VariableBinding) (name : String) : Option VariableValue :=
  (bindings.find? (·.name == name)).map (·.value)

private def locals (state : RuntimeState) : List (List VariableBinding) :=
  state.variables.activities.map (·.bindings)

private def atReview : RuntimeState := (start handoff [{ name := "OrderDraft", value := order }]).state
private def atArchive : RuntimeState :=
  (complete atReview "Review" [{ name := "ReviewOutput", value := revision }]).state

theorem handoff_shapes_admitted_independent_of_names_and_order :
    programProfileCapabilitiesValid handoff = true ∧
      programProfileCapabilitiesValid renamed = true ∧
      portableHandoffProgramInput? handoff = some "OrderDraft" ∧
      portableHandoffProgramInput? renamed = some "Draft" ∧
      locals (start renamed [{ name := "Draft", value := order }]).state =
        [[{ name := "CheckInput", value := order }]] := by
  decide +kernel

/-- A second task that rereads the Start Property instead of the first task's output, or a shared
input and output Property, is not a handoff. -/
theorem broken_property_chains_refused :
    programProfileCapabilitiesValid (program portableHandoffProfileId
      (dataTask "Review" "a" "b" "OrderDraft" "ReviewedOrder" ::
        dataTask "Archive" "b" "c" "OrderDraft" "ArchivedOrder" :: boundary)) = false ∧
    programProfileCapabilitiesValid (program portableHandoffProfileId
      (dataTask "Review" "a" "b" "OrderDraft" "ReviewedOrder" ::
        dataTask "Archive" "b" "c" "ReviewedOrder" "OrderDraft" :: boundary)) = false := by
  decide +kernel

theorem start_admits_only_one_singleton_item_for_the_start_property :
    (start handoff [{ name := "OrderDraft", value := order }]).outcome = .committed ∧
      (start handoff [{ name := "OrderDraft", value := .null }]).outcome = .committed ∧
      (start handoff [{ name := "OrderDraft", value := .list [orderItem "A"] }]).outcome = .rejected ∧
      (start handoff [{ name := "OrderDraft", value := .string (String.ofList (List.replicate 1025 'a')) }]).outcome =
        .rejected ∧
      (start handoff [{ name := "OrderDraft", value := .string (String.ofList (List.replicate 1024 'a')) }]).outcome =
        .committed ∧
      (start handoff []).outcome = .rejected ∧
      (start handoff [{ name := "Other", value := order }]).outcome = .rejected ∧
      (start handoff [{ name := "Extra", value := .null }, { name := "OrderDraft", value := order }]).outcome =
        .rejected := by
  decide +kernel

private def structuredHandoff : Program :=
  { handoff with identity := { handoff.identity with
      semanticProfile := structuredCompositionCheckpointProfileId } }

/-- PBV-INGRESS-01: the same Program under the structured-composition profile still starts with a
String but refuses the order. -/
theorem old_profile_refuses_the_order :
    (start structuredHandoff [{ name := "OrderDraft", value := .string "order-1" }]).outcome =
        .committed ∧
      (start structuredHandoff [{ name := "OrderDraft", value := order }]).outcome = .rejected := by
  decide +kernel

/-- PBV-TREE-01 and PBV-AMOUNT-01 through both tasks: each task receives the exact value the
previous step committed, and the Start Property keeps the original order. -/
theorem order_and_revision_flow_through_both_tasks :
    locals atReview = [[{ name := "ReviewInput", value := order }]] ∧
      locals atArchive = [[{ name := "ArchiveInput", value := revision }]] ∧
      value? atArchive.variables.process.bindings "ReviewedOrder" = some revision ∧
      value? atArchive.variables.process.bindings "OrderDraft" = some order ∧
      (complete atArchive "Archive" [{ name := "ArchiveOutput", value := .null }]).outcome = .committed ∧
      value? (complete atArchive "Archive" [{ name := "ArchiveOutput", value := .null }]).state.variables.process.bindings
        "ArchivedOrder" = some .null ∧
      locals (complete atArchive "Archive" [{ name := "ArchiveOutput", value := .null }]).state = [] := by
  decide +kernel

theorem invalid_completions_preserve_the_review_state :
    [ [{ name := "ReviewOutput", value := .list [orderItem "A"] }]
    , [{ name := "ReviewOutput", value := revision }, { name := "Zextra", value := .null }]
    , [{ name := "ReviewedOrder", value := revision }]
    , [] ].all (fun bindings =>
      (complete atReview "Review" bindings).outcome == .rejected &&
        (complete atReview "Review" bindings).state == atReview) = true := by
  decide +kernel

end BpmnSemantics.PortableHandoffConformance
