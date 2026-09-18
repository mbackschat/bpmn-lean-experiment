import BpmnSemantics.SemanticProcess.DefinitionBindingValidation
import BpmnSemantics.SemanticProcess.InternalScopeCreationPreparation
import BpmnSemantics.SemanticProcess.InternalLocalControlFootprintCommutation

/-! # Independent scope-creation preparation witnesses

The [scope-creation account](../docs/INTERNAL-COMMUTATION-PROPOSAL.md#scope-creation-preparation-prerequisite)
requires structurally valid Programs and valid predecessors for independent creator pairs. These
constructed fork frontiers exercise actual preparations without claiming source admission,
source reachability of retained counters, or production batching. The existing Call profile supplies
only its acyclic graph policy here; its separate profile cardinalities exclude these constructed pairs.
-/

namespace BpmnSemantics.InternalScopeCreationFrameConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess
open BpmnSemantics.SemanticProcess.InternalCommutation

private inductive Creator where
  | child
  | called
  deriving DecidableEq

private def scopeA : DefinitionScopeId := ⟨"scope:A"⟩
private def scopeB : DefinitionScopeId := ⟨"scope:B"⟩
private def rootScope : DefinitionScopeId := ⟨"scope:Root"⟩

private def definition (kind : Creator) (scope : DefinitionScopeId)
    (element : NodeId) (process : ProcessId) : DefinitionScope :=
  match kind with
  | .child => { id := scope, parentScopeId := some rootScope, originElementId := element }
  | .called => { id := scope, parentScopeId := none, originElementId := ⟨process.value⟩ }

private def creatorNode (kind : Creator) (element : NodeId)
    (scope : DefinitionScopeId) (process : ProcessId) : CheckedNode :=
  match kind with
  | .child => .embeddedSubProcess element scope
  | .called => .callActivity element process

private def checked (left right : Creator) : CheckedProcess :=
  { identity :=
      { semanticProfile := ⟨"bpmn-2.0.2-called-process-call-activity-draft"⟩
        sourceId := ⟨"constructed-scope-creation-frame"⟩
        sourceSha256 := "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }
    processId := ⟨"Root"⟩
    definitionScopes :=
      [definition left scopeA ⟨"C_Left"⟩ ⟨"A_Callee"⟩,
       definition right scopeB ⟨"D_Right"⟩ ⟨"B_Callee"⟩,
       { id := rootScope, parentScopeId := none, originElementId := ⟨"Root"⟩ }]
    nodeScopes :=
      [{ nodeId := ⟨"A_Start"⟩, scopeId := rootScope },
       { nodeId := ⟨"B_Fork"⟩, scopeId := rootScope },
       { nodeId := ⟨"C_Left"⟩, scopeId := rootScope },
       { nodeId := ⟨"D_Right"⟩, scopeId := rootScope },
       { nodeId := ⟨"E_Join"⟩, scopeId := rootScope },
       { nodeId := ⟨"F_End"⟩, scopeId := rootScope },
       { nodeId := ⟨"G_StartA"⟩, scopeId := scopeA },
       { nodeId := ⟨"H_EndA"⟩, scopeId := scopeA },
       { nodeId := ⟨"I_StartB"⟩, scopeId := scopeB },
       { nodeId := ⟨"J_EndB"⟩, scopeId := scopeB }]
    sequenceFlowScopes :=
      [{ sequenceFlowId := ⟨"f01"⟩, scopeId := rootScope },
       { sequenceFlowId := ⟨"f02"⟩, scopeId := rootScope },
       { sequenceFlowId := ⟨"f03"⟩, scopeId := rootScope },
       { sequenceFlowId := ⟨"f04"⟩, scopeId := rootScope },
       { sequenceFlowId := ⟨"f05"⟩, scopeId := rootScope },
       { sequenceFlowId := ⟨"f06"⟩, scopeId := rootScope },
       { sequenceFlowId := ⟨"f07"⟩, scopeId := scopeA },
       { sequenceFlowId := ⟨"f08"⟩, scopeId := scopeB }]
    nodes :=
      [.noneStartEvent ⟨"A_Start"⟩, .parallelGateway ⟨"B_Fork"⟩ .diverging,
       creatorNode left ⟨"C_Left"⟩ scopeA ⟨"A_Callee"⟩,
       creatorNode right ⟨"D_Right"⟩ scopeB ⟨"B_Callee"⟩,
       .parallelGateway ⟨"E_Join"⟩ .converging, .noneEndEvent ⟨"F_End"⟩,
       .noneStartEvent ⟨"G_StartA"⟩, .noneEndEvent ⟨"H_EndA"⟩,
       .noneStartEvent ⟨"I_StartB"⟩, .noneEndEvent ⟨"J_EndB"⟩]
    sequenceFlows :=
      [{ id := ⟨"f01"⟩, sourceId := ⟨"A_Start"⟩, targetId := ⟨"B_Fork"⟩ },
       { id := ⟨"f02"⟩, sourceId := ⟨"B_Fork"⟩, targetId := ⟨"C_Left"⟩ },
       { id := ⟨"f03"⟩, sourceId := ⟨"B_Fork"⟩, targetId := ⟨"D_Right"⟩ },
       { id := ⟨"f04"⟩, sourceId := ⟨"C_Left"⟩, targetId := ⟨"E_Join"⟩ },
       { id := ⟨"f05"⟩, sourceId := ⟨"D_Right"⟩, targetId := ⟨"E_Join"⟩ },
       { id := ⟨"f06"⟩, sourceId := ⟨"E_Join"⟩, targetId := ⟨"F_End"⟩ },
       { id := ⟨"f07"⟩, sourceId := ⟨"G_StartA"⟩, targetId := ⟨"H_EndA"⟩ },
       { id := ⟨"f08"⟩, sourceId := ⟨"I_StartB"⟩, targetId := ⟨"J_EndB"⟩ }] }

private def program (left right : Creator) : Program := lowerCheckedProcess (checked left right)

private def owner : ScopeOccurrenceId :=
  { processInstanceId := ⟨"frame-instance"⟩, definitionScopeId := rootScope, activation := 1 }

private def before : RuntimeState :=
  { initialState with
    control := .running owner.processInstanceId
    scopeOccurrences := [{ id := owner, parent := none }]
    scopeActivations := [{ scopeId := scopeA, count := 9 },
      { scopeId := scopeB, count := 19 }, { scopeId := rootScope, count := 1 }]
    callActivations := [{ elementId := ⟨"C_Left"⟩, count := 9 },
      { elementId := ⟨"D_Right"⟩, count := 19 }]
    tokens := [{ placeId := flowControlPlaceId ⟨"f02"⟩, owner },
      { placeId := flowControlPlaceId ⟨"f03"⟩, owner }]
    logicalTimeMs := 42 }

private def preparation (program : Program) (state : RuntimeState) (element : NodeId) :
    Option PreparedInternalScopeCreation := do
  let operation ← program.operations.find? fun operation =>
    match operation with
    | .enterScope _ origin .. | .invokeProcess _ origin .. => origin.elementId == element
    | _ => false
  prepareInternalScopeCreation? program state operation

private def pairPreconditions (program : Program) : Bool :=
  match preparation program before ⟨"C_Left"⟩, preparation program before ⟨"D_Right"⟩ with
  | some left, some right => localControlStateFootprintsNonInterfering left.footprint right.footprint
  | _, _ => false

private def pairFrames (program : Program) : Bool :=
  match preparation program before ⟨"C_Left"⟩, preparation program before ⟨"D_Right"⟩ with
  | some left, some right =>
      preparation program (right.selection.apply before) ⟨"C_Left"⟩ == some left &&
        preparation program (left.selection.apply before) ⟨"D_Right"⟩ == some right
  | _, _ => false

private def pairCommutes (program : Program) : Bool :=
  match preparation program before ⟨"C_Left"⟩, preparation program before ⟨"D_Right"⟩ with
  | some left, some right =>
      let leftThenRight := right.selection.apply (left.selection.apply before)
      let rightThenLeft := left.selection.apply (right.selection.apply before)
      leftThenRight == rightThenLeft &&
        runtimeStateWellFormed program owner.processInstanceId leftThenRight &&
        runtimeStateWellFormed program owner.processInstanceId rightThenLeft
  | _, _ => false

theorem constructed_pairs_remain_outside_profile_admission :
    programProfileCapabilitiesValid (program .child .child) = false ∧
    programProfileCapabilitiesValid (program .child .called) = false ∧
    programProfileCapabilitiesValid (program .called .called) = false := by
  decide +kernel

theorem child_child_premises_hold_jointly :
    programWellFormed (program .child .child) = true ∧
    runtimeStateWellFormed (program .child .child) owner.processInstanceId before = true ∧
    pairPreconditions (program .child .child) = true := by
  constructor
  · decide +kernel
  · constructor <;> decide +kernel

theorem child_call_premises_hold_jointly :
    programWellFormed (program .child .called) = true ∧
    runtimeStateWellFormed (program .child .called) owner.processInstanceId before = true ∧
    pairPreconditions (program .child .called) = true := by
  constructor
  · decide +kernel
  · constructor <;> decide +kernel

theorem call_call_premises_hold_jointly :
    programWellFormed (program .called .called) = true ∧
    runtimeStateWellFormed (program .called .called) owner.processInstanceId before = true ∧
    pairPreconditions (program .called .called) = true := by
  constructor
  · decide +kernel
  · constructor <;> decide +kernel

theorem child_child_complete_preparations_survive_both_orders :
    pairFrames (program .child .child) = true := by decide +kernel

theorem child_call_complete_preparations_survive_both_orders :
    pairFrames (program .child .called) = true := by decide +kernel

theorem call_call_complete_preparations_survive_both_orders :
    pairFrames (program .called .called) = true := by decide +kernel

theorem child_child_complete_states_commute_and_remain_valid :
    pairCommutes (program .child .child) = true := by decide +kernel

theorem child_call_complete_states_commute_and_remain_valid :
    pairCommutes (program .child .called) = true := by decide +kernel

theorem call_call_complete_states_commute_and_remain_valid :
    pairCommutes (program .called .called) = true := by decide +kernel

theorem equal_call_sort_keys_do_not_identify_retained_payloads :
    (match preparation (program .called .called) before ⟨"C_Left"⟩ with
     | none => false
     | some prepared =>
         match prepared.selection.kind with
         | .child => false
         | .called record =>
             let alias := { record with returnOperationId := ⟨"different-return"⟩ }
             !callRecordBefore record alias && !callRecordBefore alias record &&
               sortCallRecords [record, alias] != sortCallRecords [alias, record] &&
               !calledProcessAssociationsValid
                 { prepared.selection.apply before with calledProcessOccurrences := [record, alias] }) = true := by
  decide +kernel

theorem child_definition_population_excludes_a_different_occurrence_identity :
    (match preparation (program .child .child) before ⟨"C_Left"⟩ with
     | none => false
     | some prepared =>
         let created := prepared.selection.created
         let alias := { created with id := { created.id with activation := created.id.activation + 1 } }
         let altered := { before with scopeOccurrences := insertScopeOccurrence alias before.scopeOccurrences }
         !(altered.scopeOccurrences.any fun scope => scope.id == created.id) &&
           selectInternalScopeCreation? altered prepared.selection.operation == none) = true := by
  decide +kernel

theorem call_instance_population_excludes_a_different_scope_identity :
    (match preparation (program .called .called) before ⟨"C_Left"⟩ with
     | none => false
     | some prepared =>
         let created := prepared.selection.created
         let alias : RuntimeScopeOccurrence :=
           { id := { created.id with definitionScopeId := scopeB, activation := 2 }
             parent := some owner }
         let altered := { before with scopeOccurrences := insertScopeOccurrence alias before.scopeOccurrences }
         calledProcessAssociationsValid altered &&
           !(altered.scopeOccurrences.any fun scope => scope.id == created.id) &&
           selectInternalScopeCreation? altered prepared.selection.operation == none) = true := by
  decide +kernel

theorem child_issuance_change_alters_the_complete_preparation :
    (match preparation (program .child .child) before ⟨"C_Left"⟩ with
     | none => false
     | some prepared =>
         let altered := { before with scopeActivations := setScopeActivationCount before.scopeActivations scopeA 10 }
         let next := preparation (program .child .child) altered ⟨"C_Left"⟩
         next.isSome && next != some prepared) = true := by
  decide +kernel

theorem call_issuance_change_alters_the_complete_preparation :
    (match preparation (program .called .called) before ⟨"C_Left"⟩ with
     | none => false
     | some prepared =>
         let altered := { before with callActivations := setCallActivationCount before ⟨"C_Left"⟩ 10 }
         let next := preparation (program .called .called) altered ⟨"C_Left"⟩
         next.isSome && next != some prepared) = true := by
  decide +kernel

end BpmnSemantics.InternalScopeCreationFrameConformance
