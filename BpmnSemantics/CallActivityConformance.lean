import BpmnSemantics.SemanticProcess

/-! # Bounded called-Process Call Activity conformance

This module owns the exact two-Process fixture, the 3/3/2 closure witnesses, distinct called identity, paired invocation/return facts, and nearest malformed-association refusals. It does not claim external QName resolution, data mapping, recursion, or host Child Workflow behavior.
-/

namespace BpmnSemantics.CallActivityConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

def profileId : ProfileId :=
  ⟨"bpmn-2.0.2-called-process-call-activity-draft"⟩

def callerProcessId : ProcessId := ⟨"CallerProcess"⟩
def calledProcessId : ProcessId := ⟨"CalledProcess"⟩
def calledScopeId : DefinitionScopeId := ⟨"scope:Called"⟩
def callerScopeId : DefinitionScopeId := ⟨"scope:Caller"⟩

def checkedProcess : CheckedProcess :=
  { identity :=
      { semanticProfile := profileId
        sourceId := ⟨"called-process-call-activity"⟩
        sourceSha256 :=
          "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }
    processId := callerProcessId
    definitionScopes :=
      [ { id := calledScopeId, parentScopeId := none,
          originElementId := ⟨calledProcessId.value⟩ }
      , { id := callerScopeId, parentScopeId := none,
          originElementId := ⟨callerProcessId.value⟩ } ]
    nodeScopes :=
      [ { nodeId := ⟨"A_CallerStart"⟩, scopeId := callerScopeId }
      , { nodeId := ⟨"B_Call"⟩, scopeId := callerScopeId }
      , { nodeId := ⟨"C_CallerTask"⟩, scopeId := callerScopeId }
      , { nodeId := ⟨"D_CallerEnd"⟩, scopeId := callerScopeId }
      , { nodeId := ⟨"E_CalledStart"⟩, scopeId := calledScopeId }
      , { nodeId := ⟨"F_CalledTask"⟩, scopeId := calledScopeId }
      , { nodeId := ⟨"G_CalledEnd"⟩, scopeId := calledScopeId } ]
    sequenceFlowScopes :=
      [ { sequenceFlowId := ⟨"F1_CallerStartCall"⟩, scopeId := callerScopeId }
      , { sequenceFlowId := ⟨"F2_CallCallerTask"⟩, scopeId := callerScopeId }
      , { sequenceFlowId := ⟨"F3_CallerTaskEnd"⟩, scopeId := callerScopeId }
      , { sequenceFlowId := ⟨"F4_CalledStartTask"⟩, scopeId := calledScopeId }
      , { sequenceFlowId := ⟨"F5_CalledTaskEnd"⟩, scopeId := calledScopeId } ]
    nodes :=
      [ .noneStartEvent ⟨"A_CallerStart"⟩
      , .callActivity ⟨"B_Call"⟩ calledProcessId
      , .userTask ⟨"C_CallerTask"⟩ (some "Caller task")
      , .noneEndEvent ⟨"D_CallerEnd"⟩
      , .noneStartEvent ⟨"E_CalledStart"⟩
      , .userTask ⟨"F_CalledTask"⟩ (some "Called task")
      , .noneEndEvent ⟨"G_CalledEnd"⟩ ]
    sequenceFlows :=
      [ { id := ⟨"F1_CallerStartCall"⟩, sourceId := ⟨"A_CallerStart"⟩,
          targetId := ⟨"B_Call"⟩ }
      , { id := ⟨"F2_CallCallerTask"⟩, sourceId := ⟨"B_Call"⟩,
          targetId := ⟨"C_CallerTask"⟩ }
      , { id := ⟨"F3_CallerTaskEnd"⟩, sourceId := ⟨"C_CallerTask"⟩,
          targetId := ⟨"D_CallerEnd"⟩ }
      , { id := ⟨"F4_CalledStartTask"⟩, sourceId := ⟨"E_CalledStart"⟩,
          targetId := ⟨"F_CalledTask"⟩ }
      , { id := ⟨"F5_CalledTaskEnd"⟩, sourceId := ⟨"F_CalledTask"⟩,
          targetId := ⟨"G_CalledEnd"⟩ } ] }

def program : Program := lowerCheckedProcess checkedProcess

def callerInstanceId : SemanticId := ⟨"Caller:Instance:é"⟩
def calledInstanceId : SemanticId :=
  deriveCalledProcessInstanceId callerInstanceId ⟨"B_Call"⟩ 1

def calledTaskId : UserTaskInstanceId :=
  { processInstanceId := calledInstanceId
    elementId := ⟨"F_CalledTask"⟩
    activation := 1 }

def callerTaskId : UserTaskInstanceId :=
  { processInstanceId := callerInstanceId
    elementId := ⟨"C_CallerTask"⟩
    activation := 1 }

def start : Stimulus :=
  .startProcess ⟨"start-call"⟩ ⟨callerProcessId.value⟩ callerInstanceId []

def completeCalled : Stimulus :=
  .completeUserTaskInstance ⟨"complete-called"⟩ calledTaskId []

def completeCaller : Stimulus :=
  .completeUserTaskInstance ⟨"complete-caller"⟩ callerTaskId []

def calledWaiting : StimulusResult :=
  applyStimulus scenarioClosureLimit program initialState start

def callerWaiting : StimulusResult :=
  applyStimulus scenarioClosureLimit program calledWaiting.state completeCalled

def completed : StimulusResult :=
  applyStimulus scenarioClosureLimit program callerWaiting.state completeCaller

private def taskObservation (id : UserTaskInstanceId) (name : String) :
    OpenUserTask :=
  { id, name := some name, state := .active }

def calledWaitingObservation : StateObservation :=
  { instanceId := callerInstanceId
    status := .running
    activeWaits :=
      [{ elementId := calledTaskId.elementId, kind := .userTask, multiplicity := 1 }]
    openUserTasks := [taskObservation calledTaskId "Called task"]
    openMessageSubscriptions := []
    openTimers := []
    openEffects := []
    variables := []
    enabledInteractions := [.completeUserTaskInstance calledTaskId]
    logicalTimeMs := 0 }

def callerWaitingObservation : StateObservation :=
  { calledWaitingObservation with
    activeWaits :=
      [{ elementId := callerTaskId.elementId, kind := .userTask, multiplicity := 1 }]
    openUserTasks := [taskObservation callerTaskId "Caller task"]
    enabledInteractions := [.completeUserTaskInstance callerTaskId] }

def completedObservation : StateObservation :=
  { callerWaitingObservation with
    status := .completed
    activeWaits := []
    openUserTasks := []
    enabledInteractions := [] }

theorem exact_definition_binding_is_valid :
    definitionBindingValid checkedProcess program = true := by decide

theorem start_closure_is_exactly_three_steps :
    calledWaiting.outcome = .committed ∧
      calledWaiting.internalStepBoundExceeded = false ∧
      (applyStimulus 2 program initialState start).internalStepBoundExceeded = true ∧
      observeStableState program calledWaiting.state = some calledWaitingObservation ∧
      enabledInternalOperationCount program calledWaiting.state = 0 := by decide

theorem called_completion_closure_is_exactly_three_steps :
    callerWaiting.outcome = .committed ∧
      callerWaiting.internalStepBoundExceeded = false ∧
      (applyStimulus 2 program calledWaiting.state completeCalled).internalStepBoundExceeded =
        true ∧
      observeStableState program callerWaiting.state = some callerWaitingObservation ∧
      enabledInternalOperationCount program callerWaiting.state = 0 := by decide

theorem caller_completion_closure_is_exactly_two_steps :
    completed.outcome = .committed ∧
      completed.internalStepBoundExceeded = false ∧
      (applyStimulus 1 program callerWaiting.state completeCaller).internalStepBoundExceeded =
        true ∧
      observeStableState program completed.state = some completedObservation := by decide

theorem called_wait_uses_derived_identity_and_caller_observation_identity :
    calledWaiting.state.waits.map (·.processInstanceId) = [calledInstanceId] ∧
      calledInstanceId ≠ callerInstanceId ∧
      calledWaitingObservation.instanceId = callerInstanceId := by decide

theorem delimiter_and_non_ascii_identity_uses_utf8_lengths :
    calledInstanceId.value = "call:18:Caller:Instance:é:6:B_Call:1" := by decide

theorem nonempty_start_data_is_rejected_with_exact_preservation :
    applyStimulus scenarioClosureLimit program initialState
        (.startProcess ⟨"bad-start-data"⟩ ⟨callerProcessId.value⟩
          callerInstanceId [{ name := "x", value := .string "y" }]) =
      { outcome := .rejected
        state := initialState
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by decide

private def nonCallProfileInvokeReuseProgram : Program :=
  { program with
    identity :=
      { program.identity with semanticProfile := ⟨"non-call-invoke-reuse"⟩ } }

theorem non_call_profile_reusing_invoke_does_not_inherit_empty_start_data :
    let initialVariables : List VariableBinding :=
      [{ name := "x", value := .string "y" }]
    let result := applyStimulus scenarioClosureLimit
      nonCallProfileInvokeReuseProgram initialState
      (.startProcess ⟨"non-call-start"⟩ ⟨callerProcessId.value⟩
        callerInstanceId initialVariables)
    result.outcome = .committed ∧
      result.state.variables.process.bindings = initialVariables := by decide

theorem nonempty_called_completion_data_is_rejected_with_exact_preservation :
    applyStimulus scenarioClosureLimit program calledWaiting.state
        (.completeUserTaskInstance ⟨"bad-called-data"⟩ calledTaskId
          [{ name := "x", value := .string "y" }]) =
      { outcome := .rejected
        state := calledWaiting.state
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by decide

theorem caller_identity_cannot_complete_called_task :
    (applyStimulus scenarioClosureLimit program calledWaiting.state
      (.completeUserTaskInstance ⟨"wrong-instance"⟩
        { calledTaskId with processInstanceId := callerInstanceId } [])).outcome =
      .rejected := by decide

private def returnOperation : SemanticOperation :=
  .returnProcess ⟨"operation:return-process:B_Call"⟩
    { elementId := ⟨"B_Call"⟩ } calledProcessId calledScopeId
    ⟨"place:F2_CallCallerTask"⟩

private def duplicateIdentityRecordState : RuntimeState :=
  match calledWaiting.state.calledProcessOccurrences with
  | [record] =>
      { calledWaiting.state with
        calledProcessOccurrences :=
          [ record
          , { record with
              calledRoot :=
                { record.calledRoot with definitionScopeId := ⟨"wrong-root"⟩ } } ] }
  | _ => calledWaiting.state

theorem duplicate_identity_record_with_one_otherwise_valid_disables_return :
    calledProcessAssociationsValid duplicateIdentityRecordState = false ∧
      fire? returnOperation duplicateIdentityRecordState = none := by decide

private def duplicateCalledRootState : RuntimeState :=
  match calledWaiting.state.calledProcessOccurrences with
  | [record] =>
      { calledWaiting.state with
        scopeOccurrences :=
          { id := { record.calledRoot with definitionScopeId := ⟨"wrong-root"⟩ },
            parent := none } :: calledWaiting.state.scopeOccurrences }
  | _ => calledWaiting.state

theorem duplicate_called_root_with_one_otherwise_valid_disables_return :
    calledProcessAssociationsValid duplicateCalledRootState = false ∧
      fire? returnOperation duplicateCalledRootState = none := by decide

private def zeroActivationRecordState : RuntimeState :=
  match calledWaiting.state.calledProcessOccurrences with
  | [record] =>
      let zeroId := { record.id with activation := 0 }
      let zeroRoot :=
        { record.calledRoot with
          processInstanceId := deriveCalledProcessInstanceId
            record.caller.processInstanceId ⟨record.id.elementId.value⟩ 0 }
      { calledWaiting.state with
        scopeOccurrences := calledWaiting.state.scopeOccurrences.map fun occurrence =>
          if occurrence.id = record.calledRoot then { occurrence with id := zeroRoot }
          else occurrence
        calledProcessOccurrences := [{ record with id := zeroId, calledRoot := zeroRoot }] }
  | _ => calledWaiting.state

theorem zero_activation_record_is_nonresumable_and_has_no_return :
    calledProcessAssociationsValid zeroActivationRecordState = false ∧
      fire? returnOperation zeroActivationRecordState = none := by decide

private def aliasedCalledScopeState : RuntimeState :=
  match calledWaiting.state.calledProcessOccurrences with
  | [record] =>
      let aliasedRoot :=
        { record.calledRoot with definitionScopeId := record.caller.definitionScopeId }
      { calledWaiting.state with
        scopeOccurrences := calledWaiting.state.scopeOccurrences.map fun occurrence =>
          if occurrence.id = record.calledRoot then { occurrence with id := aliasedRoot }
          else occurrence
        waits := calledWaiting.state.waits.map fun wait =>
          if wait.owner = record.calledRoot then { wait with owner := aliasedRoot }
          else wait
        calledProcessOccurrences := [{ record with calledRoot := aliasedRoot }] }
  | _ => calledWaiting.state

theorem called_scope_alias_is_nonresumable_and_has_no_return :
    calledProcessAssociationsValid aliasedCalledScopeState = false ∧
      fire? returnOperation aliasedCalledScopeState = none := by decide

private def alternateHostingRootId : ScopeOccurrenceId :=
  { processInstanceId := callerInstanceId
    definitionScopeId := ⟨"scope:AlternateHostingRoot"⟩
    activation := 1 }

private def childCallerState : RuntimeState :=
  match calledWaiting.state.calledProcessOccurrences with
  | [record] =>
      { calledWaiting.state with
        scopeOccurrences :=
          { id := alternateHostingRootId, parent := none } ::
            calledWaiting.state.scopeOccurrences.map fun occurrence =>
              if occurrence.id = record.caller then
                { occurrence with parent := some alternateHostingRootId }
              else occurrence }
  | _ => calledWaiting.state

theorem child_caller_with_one_hosting_root_is_nonresumable :
    calledProcessAssociationsValid childCallerState = false ∧
      fire? returnOperation childCallerState = none := by decide

private def duplicateHostingRootState : RuntimeState :=
  { calledWaiting.state with
    scopeOccurrences :=
      { id := alternateHostingRootId, parent := none } ::
        calledWaiting.state.scopeOccurrences }

theorem duplicate_hosting_root_with_one_valid_original_is_nonresumable :
    calledProcessAssociationsValid duplicateHostingRootState = false ∧
      fire? returnOperation duplicateHostingRootState = none := by decide

private def duplicateInvokeProgram : Program :=
  match program.operations.find? fun
      | .invokeProcess .. => true
      | _ => false with
  | some invoke => { program with operations := invoke :: program.operations }
  | none => program

theorem duplicate_identity_definition_with_one_otherwise_valid_is_rejected :
    callOperationsPaired duplicateInvokeProgram = false := by decide

private def duplicateCalledRootProgram : Program :=
  { program with
    definitionScopes :=
      { id := ⟨"scope:WrongCalled"⟩
        parentScopeId := none
        originElementId := ⟨calledProcessId.value⟩ } :: program.definitionScopes }

theorem duplicate_called_process_identity_with_one_valid_root_is_rejected :
    callOperationsPaired duplicateCalledRootProgram = false := by decide

private def wrongCalledEntryProgram : Program :=
  { program with
    operations := program.operations.map fun
      | .invokeProcess id origin input calledProcess calledRoot _ returned =>
          .invokeProcess id origin input calledProcess calledRoot
            ⟨"place:F2_CallCallerTask"⟩ returned
      | operation => operation }

theorem target_root_entry_permutation_fails_binding :
    definitionBindingValid checkedProcess wrongCalledEntryProgram = false := by decide

private def wrongCalledRootProgram : Program :=
  { program with
    operations := program.operations.map fun
      | .invokeProcess id origin input calledProcess _ calledEntry returned =>
          .invokeProcess id origin input calledProcess callerScopeId calledEntry returned
      | .returnProcess id origin calledProcess _ output =>
          .returnProcess id origin calledProcess callerScopeId output
      | operation => operation }

theorem wrong_target_root_is_rejected :
    callOperationsPaired wrongCalledRootProgram = false ∧
      definitionBindingValid checkedProcess wrongCalledRootProgram = false := by decide

private def wrongReturnOwnerProgram : Program :=
  { program with
    operationScopes := program.operationScopes.map fun owner =>
      if owner.operationId = ⟨"operation:return-process:B_Call"⟩ then
        { owner with scopeId := callerScopeId }
      else owner }

theorem wrong_return_owner_is_rejected :
    callOperationsPaired wrongReturnOwnerProgram = false ∧
      definitionBindingValid checkedProcess wrongReturnOwnerProgram = false := by decide

private def wrongReturnPairProgram : Program :=
  { program with
    operations := program.operations.map fun
      | .invokeProcess id origin input calledProcess calledRoot calledEntry _ =>
          .invokeProcess id origin input calledProcess calledRoot calledEntry
            ⟨"operation:wrong-return"⟩
      | operation => operation }

theorem wrong_return_pair_is_rejected :
    callOperationsPaired wrongReturnPairProgram = false := by decide

theorem stale_called_completion_preserves_exact_state :
    applyStimulus scenarioClosureLimit program callerWaiting.state completeCalled =
      { outcome := .rejected
        state := callerWaiting.state
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by decide

private def orphanCalledRootState : RuntimeState :=
  { calledWaiting.state with calledProcessOccurrences := [] }

theorem orphan_called_root_is_nonresumable :
    calledProcessAssociationsValid orphanCalledRootState = false ∧
      stableStateResumable orphanCalledRootState = false := by decide

theorem return_refuses_nonquiescent_called_scope :
    returnProcessState? calledWaiting.state
        ⟨"operation:return-process:B_Call"⟩ { elementId := ⟨"B_Call"⟩ }
        calledProcessId calledScopeId ⟨"place:F2_CallCallerTask"⟩ = none ∧
      calledWaiting.state.calledProcessOccurrences.all fun record =>
        scopeQuiescent calledWaiting.state record.calledRoot = false := by decide

end BpmnSemantics.CallActivityConformance
