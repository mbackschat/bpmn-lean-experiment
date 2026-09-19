import BpmnSemantics.SemanticProcess.DefinitionBindingValidation
import BpmnSemantics.SemanticProcess.TransitionTrace
import BpmnSemantics.SemanticProcess.InternalPreparedTransition
import BpmnSemantics.SemanticProcess.ControlPosition

/-! A document review witnesses production closure across ordinary scope creation, a local fork, and a deadline under the [mixed batch account](../docs/INTERNAL-COMMUTATION-PROPOSAL.md#scope-creation-preparation-prerequisite). Both constructed Programs use the Call profile's structural graph policy but deliberately fail its capability admission. These kernel-decided facts cover actual Start admission and closure for those Programs; they establish neither checked XML admission, a generalized closure-fuel theorem, nor Temporal refinement. -/

namespace BpmnSemantics.ScopeCreationMixedBatchConformance

open BpmnSemantics.SemanticProcess
open BpmnSemantics.SemanticProcess.InternalCommutation

private inductive Creator where
  | child
  | called
  deriving DecidableEq

private def processId : ProcessId := ⟨"Root"⟩
private def instanceId : SemanticId := ⟨"mixed-review-4711"⟩
private def commandId : SemanticId := ⟨"start-mixed-review"⟩
private def rootScope : DefinitionScopeId := ⟨"scope:Root"⟩
private def legalScope : DefinitionScopeId := ⟨"scope:Legal"⟩
private def owner : ScopeOccurrenceId :=
  { processInstanceId := instanceId, definitionScopeId := rootScope, activation := 1 }

private def legalDefinition : Creator → DefinitionScope
  | .child =>
      { id := legalScope, parentScopeId := some rootScope,
        originElementId := ⟨"D_LegalScope"⟩ }
  | .called =>
      { id := legalScope, parentScopeId := none, originElementId := ⟨"Legal"⟩ }

private def legalNode : Creator → CheckedNode
  | .child => .embeddedSubProcess ⟨"D_LegalScope"⟩ legalScope
  | .called => .callActivity ⟨"D_LegalScope"⟩ ⟨"Legal"⟩

private def checked (kind : Creator) : CheckedProcess :=
  { identity :=
      { semanticProfile := ⟨"bpmn-2.0.2-called-process-call-activity-draft"⟩
        sourceId := ⟨"constructed-mixed-scope-review"⟩
        sourceSha256 := "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }
    processId
    definitionScopes :=
      [legalDefinition kind,
       { id := rootScope, parentScopeId := none, originElementId := ⟨processId.value⟩ }]
    nodeScopes :=
      [{ nodeId := ⟨"A_Start"⟩, scopeId := rootScope },
       { nodeId := ⟨"B_Fork"⟩, scopeId := rootScope },
       { nodeId := ⟨"C_Checks"⟩, scopeId := rootScope },
       { nodeId := ⟨"D_LegalScope"⟩, scopeId := rootScope },
       { nodeId := ⟨"E_Content"⟩, scopeId := rootScope },
       { nodeId := ⟨"F_Risk"⟩, scopeId := rootScope },
       { nodeId := ⟨"G_Deadline"⟩, scopeId := rootScope },
       { nodeId := ⟨"H_Join"⟩, scopeId := rootScope },
       { nodeId := ⟨"I_End"⟩, scopeId := rootScope },
       { nodeId := ⟨"J_LegalStart"⟩, scopeId := legalScope },
       { nodeId := ⟨"K_LegalReview"⟩, scopeId := legalScope },
       { nodeId := ⟨"L_LegalEnd"⟩, scopeId := legalScope }]
    sequenceFlowScopes :=
      [{ sequenceFlowId := ⟨"f01"⟩, scopeId := rootScope },
       { sequenceFlowId := ⟨"f02"⟩, scopeId := rootScope },
       { sequenceFlowId := ⟨"f03"⟩, scopeId := rootScope },
       { sequenceFlowId := ⟨"f04"⟩, scopeId := rootScope },
       { sequenceFlowId := ⟨"f05"⟩, scopeId := rootScope },
       { sequenceFlowId := ⟨"f06"⟩, scopeId := rootScope },
       { sequenceFlowId := ⟨"f07"⟩, scopeId := rootScope },
       { sequenceFlowId := ⟨"f08"⟩, scopeId := rootScope },
       { sequenceFlowId := ⟨"f09"⟩, scopeId := rootScope },
       { sequenceFlowId := ⟨"f10"⟩, scopeId := rootScope },
       { sequenceFlowId := ⟨"f11"⟩, scopeId := rootScope },
       { sequenceFlowId := ⟨"f12"⟩, scopeId := legalScope },
       { sequenceFlowId := ⟨"f13"⟩, scopeId := legalScope }]
    nodes :=
      [.noneStartEvent ⟨"A_Start"⟩,
       .parallelGateway ⟨"B_Fork"⟩ .diverging,
       .parallelGateway ⟨"C_Checks"⟩ .diverging,
       legalNode kind,
       .userTask ⟨"E_Content"⟩ (some "Review content"),
       .userTask ⟨"F_Risk"⟩ (some "Review risk"),
       .intermediateCatchTimerEvent ⟨"G_Deadline"⟩ "PT1S",
       .parallelGateway ⟨"H_Join"⟩ .converging,
       .noneEndEvent ⟨"I_End"⟩,
       .noneStartEvent ⟨"J_LegalStart"⟩,
       .userTask ⟨"K_LegalReview"⟩ (some "Review legal terms"),
       .noneEndEvent ⟨"L_LegalEnd"⟩]
    sequenceFlows :=
      [{ id := ⟨"f01"⟩, sourceId := ⟨"A_Start"⟩, targetId := ⟨"B_Fork"⟩ },
       { id := ⟨"f02"⟩, sourceId := ⟨"B_Fork"⟩, targetId := ⟨"C_Checks"⟩ },
       { id := ⟨"f03"⟩, sourceId := ⟨"B_Fork"⟩, targetId := ⟨"D_LegalScope"⟩ },
       { id := ⟨"f04"⟩, sourceId := ⟨"B_Fork"⟩, targetId := ⟨"G_Deadline"⟩ },
       { id := ⟨"f05"⟩, sourceId := ⟨"C_Checks"⟩, targetId := ⟨"E_Content"⟩ },
       { id := ⟨"f06"⟩, sourceId := ⟨"C_Checks"⟩, targetId := ⟨"F_Risk"⟩ },
       { id := ⟨"f07"⟩, sourceId := ⟨"E_Content"⟩, targetId := ⟨"H_Join"⟩ },
       { id := ⟨"f08"⟩, sourceId := ⟨"F_Risk"⟩, targetId := ⟨"H_Join"⟩ },
       { id := ⟨"f09"⟩, sourceId := ⟨"D_LegalScope"⟩, targetId := ⟨"H_Join"⟩ },
       { id := ⟨"f10"⟩, sourceId := ⟨"G_Deadline"⟩, targetId := ⟨"H_Join"⟩ },
       { id := ⟨"f11"⟩, sourceId := ⟨"H_Join"⟩, targetId := ⟨"I_End"⟩ },
       { id := ⟨"f12"⟩, sourceId := ⟨"J_LegalStart"⟩, targetId := ⟨"K_LegalReview"⟩ },
       { id := ⟨"f13"⟩, sourceId := ⟨"K_LegalReview"⟩, targetId := ⟨"L_LegalEnd"⟩ }] }

private def program (kind : Creator) : Program := lowerCheckedProcess (checked kind)

private def start : Stimulus :=
  .startProcess commandId ⟨processId.value⟩ instanceId []

private def beforeMixed (kind : Creator) : RuntimeState :=
  (do
    let initiation ← (program kind).operations.find? (fun (op : SemanticOperation) =>
      op.id == (⟨"operation:A_Start"⟩ : OperationId))
    let fork ← (program kind).operations.find? (fun (op : SemanticOperation) =>
      op.id == (⟨"operation:B_Fork"⟩ : OperationId))
    let initiated ← fire? (program kind) initiation (admitStimulus (program kind) initialState start).state
    fire? (program kind) fork initiated).getD initialState

private def mixedOperations (kind : Creator) : List SemanticOperation :=
  (program kind).operations.filter fun op =>
    [⟨"operation:C_Checks"⟩, ⟨"operation:D_LegalScope"⟩, ⟨"operation:G_Deadline"⟩].contains op.id

theorem fixtures_are_structurally_admitted_but_outside_profile_capabilities (kind : Creator) :
    programWellFormed (program kind) = true ∧
      programProfileCapabilitiesValid (program kind) = false ∧
      (admitStimulus (program kind) initialState start).outcome = .committed := by
  cases kind <;> decide +kernel

theorem reached_frontier_contains_three_independent_preparations (kind : Creator) :
    runtimeStateWellFormed (program kind) instanceId (beforeMixed kind) = true ∧
      (projectOpenFlowNodeOccurrences? (program kind) (beforeMixed kind)).isSome = true ∧
      (projectControlPosition? (program kind) instanceId (beforeMixed kind)).isSome = true ∧
      enabledInternalOperationCount (program kind) (beforeMixed kind) = 3 ∧
      (prepareInternalTransitionBatch? (program kind) (beforeMixed kind)
        (mixedOperations kind)).map List.length = some 3 := by
  cases kind <;> decide +kernel

private def trace (kind : Creator) : TracedStimulusResult :=
  applyStimulusTraced 8 (program kind) initialState start

theorem committed_start_closes_the_mixed_scope_frontier (kind : Creator) :
    (trace kind).result.outcome = .committed ∧
      (trace kind).result.internalStepBoundExceeded = false ∧
      (trace kind).result.ambiguousInternalChoice = false := by
  cases kind <;> decide +kernel

private def legalOwner : Creator → ScopeOccurrenceId
  | .child =>
      { processInstanceId := instanceId, definitionScopeId := legalScope, activation := 1 }
  | .called =>
      { processInstanceId := deriveCalledProcessInstanceId instanceId ⟨"D_LegalScope"⟩ 1,
        definitionScopeId := legalScope, activation := 1 }

theorem committed_state_retains_three_user_waits_and_one_deadline (kind : Creator) :
    (trace kind).result.state.control = .running instanceId ∧
      (trace kind).result.state.waits.length = 3 ∧
      ((trace kind).result.state.waits.find? fun wait => wait.task.id == ⟨"E_Content"⟩).map
        (·.owner) = some owner ∧
      ((trace kind).result.state.waits.find? fun wait => wait.task.id == ⟨"F_Risk"⟩).map
        (·.owner) = some owner ∧
      ((trace kind).result.state.waits.find? fun wait => wait.task.id == ⟨"K_LegalReview"⟩).map
        (·.owner) = some (legalOwner kind) ∧
      (trace kind).result.state.timerWaits.length = 1 ∧
      (trace kind).result.state.tokens = [] := by
  cases kind <;> decide +kernel

theorem committed_runtime_and_public_projections_are_accepted (kind : Creator) :
    runtimeStateWellFormed (program kind) instanceId (trace kind).result.state = true ∧
      (projectOpenFlowNodeOccurrences? (program kind) (trace kind).result.state).map List.length = some 5 ∧
      (projectControlPosition? (program kind) instanceId (trace kind).result.state).isSome = true := by
  cases kind <;> decide +kernel

theorem committed_publication_has_one_external_and_eight_internal_rows (kind : Creator) :
    (trace kind).committedTransitions.length = 9 ∧
      (trace kind).flowNodeOccurrenceLifecycles.length = 9 ∧
      (trace kind).committedTransitions.head? = some (.externalStimulus start) ∧
      ((trace kind).committedTransitions.filterMap fun
        | .internalOperation record => some record.operationId
        | .externalStimulus _ => none) =
        [⟨"operation:A_Start"⟩, ⟨"operation:B_Fork"⟩, ⟨"operation:C_Checks"⟩,
         ⟨"operation:D_LegalScope"⟩, ⟨"operation:G_Deadline"⟩,
         ⟨"operation:E_Content"⟩, ⟨"operation:F_Risk"⟩, ⟨"operation:K_LegalReview"⟩] := by
  cases kind <;> decide +kernel

theorem local_fork_uses_its_canonical_transition_index (kind : Creator) :
    (trace kind).flowNodeOccurrenceLifecycles[3]? = some
      { started :=
          [{ anchor := .transition commandId 3 0, processId,
             elementId := ⟨"C_Checks"⟩, owner }]
        ended := [{ anchor := .transition commandId 3 0, terminal := .completed }] } := by
  cases kind <;> decide +kernel

theorem child_scope_publication_retains_its_created_scope_identity :
    (trace .child).flowNodeOccurrenceLifecycles[4]? = some
      { started :=
          [{ anchor := .scope (legalOwner .child), processId,
             elementId := ⟨"D_LegalScope"⟩, owner }]
        ended := [] } ∧
      scopeActivationCount (trace .child).result.state legalScope = 1 := by
  decide +kernel

theorem call_publication_retains_its_invocation_identity :
    (trace .called).flowNodeOccurrenceLifecycles[4]? = some
      { started :=
          [{ anchor := .callActivity
               { processInstanceId := instanceId, elementId := ⟨"D_LegalScope"⟩, activation := 1 },
             processId, elementId := ⟨"D_LegalScope"⟩, owner }]
        ended := [] } ∧
      callActivationCount (trace .called).result.state ⟨"D_LegalScope"⟩ = 1 ∧
      (trace .called).result.state.calledProcessOccurrences.map (·.calledRoot) =
        [legalOwner .called] := by
  decide +kernel

theorem insufficient_final_batch_fuel_restores_the_whole_command (kind : Creator) :
    let refused := applyStimulusTraced 7 (program kind) initialState start
    refused.result =
        { outcome := .rolledBack, state := initialState,
          internalStepBoundExceeded := true, ambiguousInternalChoice := false } ∧
      refused.committedTransitions = [] ∧
      refused.flowNodeOccurrenceLifecycles = [] := by
  cases kind <;> decide +kernel

end BpmnSemantics.ScopeCreationMixedBatchConformance
