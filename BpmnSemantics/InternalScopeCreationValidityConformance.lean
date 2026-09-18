import BpmnSemantics.CallActivityConformance
import BpmnSemantics.EmbeddedSubProcessCompletionConformance
import BpmnSemantics.SemanticProcess.InternalScopeCreationAdmissionFacts

/-! # Admitted scope-creation validity witnesses

The [scope-creation account](../docs/INTERNAL-COMMUTATION-PROPOSAL.md) needs successful
preparations whose Programs and predecessor states satisfy the preservation premises together.
These constructed runtime predecessors reuse the retained admitted Programs; they do not claim
source reachability of the nonzero retained counters.
-/

namespace BpmnSemantics.InternalScopeCreationValidityConformance

open BpmnSemantics.SemanticProcess
open BpmnSemantics.SemanticProcess.InternalCommutation

private def childOwner : ScopeOccurrenceId :=
  { processInstanceId := EmbeddedSubProcessCompletionConformance.instanceId
    definitionScopeId := EmbeddedSubProcessCompletionConformance.rootScopeId
    activation := 1 }

private def childBefore : RuntimeState :=
  { initialState with
    control := .running childOwner.processInstanceId
    scopeOccurrences := [{ id := childOwner, parent := none }]
    scopeActivations := setScopeActivationCount
      [{ scopeId := childOwner.definitionScopeId, count := 1 }]
      EmbeddedSubProcessCompletionConformance.childScopeId 9
    tokens := [{ placeId := flowControlPlaceId ⟨"Flow_OuterStartToScope"⟩, owner := childOwner }]
    logicalTimeMs := 42 }

private def callOwner : ScopeOccurrenceId :=
  { processInstanceId := CallActivityConformance.callerInstanceId
    definitionScopeId := CallActivityConformance.callerScopeId
    activation := 1 }

private def callBefore : RuntimeState :=
  { initialState with
    control := .running callOwner.processInstanceId
    scopeOccurrences := [{ id := callOwner, parent := none }]
    scopeActivations := [{ scopeId := callOwner.definitionScopeId, count := 1 }]
    callActivations := [{ elementId := ⟨"B_Call"⟩, count := 9 }]
    tokens := [{ placeId := flowControlPlaceId ⟨"F1_CallerStartCall"⟩, owner := callOwner }]
    logicalTimeMs := 42 }

private def childPrepared? : Option PreparedInternalScopeCreation := do
  let operation ← EmbeddedSubProcessCompletionConformance.program.operations.find? fun
    | .enterScope .. => true
    | _ => false
  prepareInternalScopeCreation? EmbeddedSubProcessCompletionConformance.program childBefore operation

private def callPrepared? : Option PreparedInternalScopeCreation := do
  let operation ← CallActivityConformance.program.operations.find? fun
    | .invokeProcess .. => true
    | _ => false
  prepareInternalScopeCreation? CallActivityConformance.program callBefore operation

private def admittedPreparationValid (program : Program) (instanceId : SemanticId)
    (before : RuntimeState) (prepared : Option PreparedInternalScopeCreation) : Bool :=
  programWellFormed program && runtimeStateWellFormed program instanceId before &&
    match prepared with
    | none => false
    | some prepared =>
        let after := prepared.selection.apply before
        runtimeStateWellFormed program instanceId after &&
          applyPreparedInternalScopeCreation? program before prepared == some after &&
          fire? program prepared.selection.operation before == some after

theorem admitted_child_preparation_preserves_complete_runtime_validity :
    admittedPreparationValid EmbeddedSubProcessCompletionConformance.program
      childOwner.processInstanceId childBefore childPrepared? = true := by
  decide +kernel

theorem admitted_call_preparation_preserves_complete_runtime_validity :
    admittedPreparationValid CallActivityConformance.program
      callOwner.processInstanceId callBefore callPrepared? = true := by
  decide +kernel

theorem omitted_created_scope_invalidates_child_position :
    (match childPrepared? with
     | none => false
     | some prepared =>
         let after := prepared.selection.apply childBefore
         !runtimePositionValid EmbeddedSubProcessCompletionConformance.program
           childOwner.processInstanceId { after with scopeOccurrences := childBefore.scopeOccurrences })
      = true := by
  decide +kernel

theorem wrong_called_process_payload_preserves_associations_but_invalidates_position :
    (match callPrepared? with
     | none => false
     | some prepared =>
         let after := prepared.selection.apply callBefore
         let altered := { after with calledProcessOccurrences :=
           after.calledProcessOccurrences.map fun record =>
             { record with calledProcessId := ⟨"WrongProcess"⟩ } }
         calledProcessAssociationsValid altered &&
           !runtimePositionValid CallActivityConformance.program callOwner.processInstanceId altered)
      = true := by
  decide +kernel

end BpmnSemantics.InternalScopeCreationValidityConformance
