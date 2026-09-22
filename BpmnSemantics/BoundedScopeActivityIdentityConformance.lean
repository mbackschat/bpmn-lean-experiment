import BpmnSemantics.SemanticProcess.InternalBoundedScopePreparation
import BpmnSemantics.SubProcessBoundaryTimerConformance
import BpmnSemantics.SequentialMultiInstanceProgramBindingConformance

/-! Bounded Sub-Process Activity identity regressions from the 2026-09-22 reassessment.
The two definition-scope IDs deliberately collide with a Multi-Instance task element, inside
and after the child respectively. These are constructed Programs, not public admission witnesses.
-/

namespace BpmnSemantics.BoundedScopeActivityIdentityConformance

open BpmnSemantics.SemanticProcess
open BpmnSemantics.SemanticProcess.InternalCommutation

private def checked (taskName : String) : CheckedProcess :=
  let original := SubProcessBoundaryTimerConformance.checkedProcess
  let scope : DefinitionScopeId := ⟨taskName⟩
  let taskScope := if taskName = "ChildTask" then scope else SubProcessBoundaryTimerConformance.rootScopeId
  let replaceScope := fun id => if id = SubProcessBoundaryTimerConformance.childScopeId then scope else id
  { original with
    definitionScopes := SemanticProcess.sortBy (fun a b : DefinitionScope => decide (a.id.value < b.id.value))
      (original.definitionScopes.map fun definition => { definition with id := replaceScope definition.id })
    nodeScopes := original.nodeScopes.map (fun row => { row with scopeId := replaceScope row.scopeId }) ++
      [{ nodeId := ⟨"InnerTimeoutEnd"⟩, scopeId := taskScope }]
    sequenceFlowScopes := original.sequenceFlowScopes.map (fun row => { row with scopeId := replaceScope row.scopeId }) ++
      [{ sequenceFlowId := ⟨"Flow_Inner_Timeout"⟩, scopeId := taskScope }]
    nodes := original.nodes.map (fun node => match node with
      | .embeddedSubProcess id child => .embeddedSubProcess id (replaceScope child)
      | .userTask id name => if id.value = taskName then
          .sequentialMultiInstanceUserTask id name
            SequentialMultiInstanceProgramBindingConformance.dataDefinition.input
            SequentialMultiInstanceProgramBindingConformance.dataDefinition.output
            ⟨if taskName = "ChildTask" then "Flow_Child_End" else "Flow_Normal_End"⟩
            { elementId := ⟨"InnerDeadline"⟩, durationLiteral := "PT5S", outputFlowId := ⟨"Flow_Inner_Timeout"⟩ }
        else node
      | _ => node) ++ [.noneEndEvent ⟨"InnerTimeoutEnd"⟩]
    sequenceFlows := original.sequenceFlows ++
      [{ id := ⟨"Flow_Inner_Timeout"⟩, sourceId := ⟨"InnerDeadline"⟩, targetId := ⟨"InnerTimeoutEnd"⟩ }] }
private def programFor (taskName : String) : Program :=
  let lowered := lowerCheckedProcess (checked taskName)
  { lowered with
    operations := SemanticProcess.sortBy (fun a b : SemanticOperation => decide (a.id.value < b.id.value)) lowered.operations
    controlPlaces := SemanticProcess.sortBy (fun a b : ControlPlace => decide (a.id.value < b.id.value)) lowered.controlPlaces
    operationScopes := SemanticProcess.sortBy (fun a b : OperationScopeOwnership =>
      decide (a.operationId.value < b.operationId.value)) lowered.operationScopes
    controlPlaceScopes := SemanticProcess.sortBy (fun a b : ControlPlaceScopeOwnership =>
      decide (a.controlPlaceId.value < b.controlPlaceId.value)) lowered.controlPlaceScopes }

private def before : RuntimeState :=
  let owner : ScopeOccurrenceId :=
    { processInstanceId := SubProcessBoundaryTimerConformance.instanceId
      definitionScopeId := SubProcessBoundaryTimerConformance.rootScopeId
      activation := 1 }
  { initialState with
    control := .running owner.processInstanceId
    scopeOccurrences := [{ id := owner, parent := none }]
    scopeActivations := [{ scopeId := owner.definitionScopeId, count := 1 }]
    activityActivations := [{ taskId := ⟨"Scope"⟩, count := 7 }]
    tokens := [⟨⟨"place:Flow_Start"⟩, owner⟩] }

private def validBoundedEntry (taskName : String) : Bool := Id.run do
  let program := programFor taskName
  let [contract] := program.operations.filterMap boundedScopeContract? | return false
  let some prepared := prepareInternalBoundedScope? program before contract | return false
  let some after := fire? program contract.operation before | return false
  return programWellFormed program &&
    runtimeStateWellFormed program SubProcessBoundaryTimerConformance.instanceId before &&
    decide (after = prepared.selection.apply before) &&
    runtimeStateWellFormed program SubProcessBoundaryTimerConformance.instanceId after &&
    decide (after.activityOccurrences.map (fun record =>
      (record.activityElementId.value, record.activation)) = [("Scope", 8)]) &&
    decide (activityActivationCount after ⟨taskName⟩ = 0) &&
    decide (after.scopeOccurrences.any (fun occurrence =>
      occurrence.id.definitionScopeId.value == taskName && occurrence.id.activation == 1))

theorem bounded_entry_preserves_validity_with_child_task_scope_id :
    validBoundedEntry "ChildTask" = true := by
  decide +kernel

theorem bounded_entry_preserves_validity_with_following_task_scope_id :
    validBoundedEntry "AfterScope" = true := by
  decide +kernel

private def ambiguousProgram (sequential : Bool) : Program :=
  let base := if sequential then programFor "ChildTask" else SubProcessBoundaryTimerConformance.program
  { base with operations := base.operations.map fun operation => match operation with
      | .awaitSequentialMultiInstanceUserTask id _ input task data output timer limits =>
          .awaitSequentialMultiInstanceUserTask id ⟨⟨"Scope"⟩⟩ input
            { task with id := ⟨"Scope"⟩ } data output timer limits
      | .awaitUserTask id origin input output task =>
          if task.id.value = "ChildTask" then
            .awaitUserTask id ⟨⟨"Scope"⟩⟩ input output { task with id := ⟨"Scope"⟩ }
          else .awaitUserTask id origin input output task
      | _ => operation }

private def ambiguityRefused (sequential : Bool) : Bool := Id.run do
  let program := ambiguousProgram sequential
  let [contract] := program.operations.filterMap boundedScopeContract? | return false
  return programWellFormed program &&
    runtimeStateWellFormed program SubProcessBoundaryTimerConformance.instanceId before &&
    (fire? program contract.operation before).isSome &&
    (prepareInternalBoundedScope? program before contract).isNone

theorem bounded_batch_refuses_ambiguous_user_task_declarations (sequential : Bool) :
    ambiguityRefused sequential = true := by
  cases sequential <;> decide +kernel

end BpmnSemantics.BoundedScopeActivityIdentityConformance
