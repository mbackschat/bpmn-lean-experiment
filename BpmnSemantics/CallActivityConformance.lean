module

public import BpmnSemantics.CallActivityConformanceFixtures
public import BpmnSemantics.SemanticProcess.DefinitionBindingValidation
public import BpmnSemantics.SemanticProcess.Scenario
import all BpmnSemantics.SemanticProcess.CallActivity
import all BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import all BpmnSemantics.SemanticProcess.CheckedGraphValidation
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle

/-! # Bounded called-Process Call Activity conformance

This module owns the exact two-Process fixture, the 3/3/2 closure witnesses, distinct called identity, paired invocation/return facts, and nearest malformed-association refusals. It does not claim external QName resolution, data mapping, recursion, or host Child Workflow behavior.
-/

@[expose] public section

set_option Elab.async false

namespace BpmnSemantics.CallActivityConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

def taskObservation (id : UserTaskInstanceId) (name : String) :
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

def exact_definition_binding_is_valid : Bool := decide (definitionBindingValid checkedProcess program = true)

def start_closure_is_exactly_three_steps : Bool := decide <|
    calledWaiting.outcome = .committed ∧
      calledWaiting.internalStepBoundExceeded = false ∧
      (applyStimulus 2 program initialState start).internalStepBoundExceeded = true ∧
      observeStableState program calledWaiting.state = some calledWaitingObservation ∧
      enabledInternalOperationCount program calledWaiting.state = 0

def called_completion_closure_is_exactly_three_steps : Bool := decide <|
    callerWaiting.outcome = .committed ∧
      callerWaiting.internalStepBoundExceeded = false ∧
      (applyStimulus 2 program calledWaiting.state completeCalled).internalStepBoundExceeded =
        true ∧
      observeStableState program callerWaiting.state = some callerWaitingObservation ∧
      enabledInternalOperationCount program callerWaiting.state = 0

def caller_completion_closure_is_exactly_two_steps : Bool := decide <|
    completed.outcome = .committed ∧
      completed.internalStepBoundExceeded = false ∧
      (applyStimulus 1 program callerWaiting.state completeCaller).internalStepBoundExceeded =
        true ∧
      observeStableState program completed.state = some completedObservation

def called_wait_uses_derived_identity_and_caller_observation_identity : Bool := decide <|
    calledWaiting.state.waits.map (·.processInstanceId) = [calledInstanceId] ∧
      calledInstanceId ≠ callerInstanceId ∧
      calledWaitingObservation.instanceId = callerInstanceId

def delimiter_and_non_ascii_identity_uses_utf8_lengths : Bool := decide <|
    calledInstanceId.value = "call:18:Caller:Instance:é:6:B_Call:1"

def nonempty_start_data_is_rejected_with_exact_preservation : Bool := decide <|
    applyStimulus scenarioClosureLimit program initialState
        (.startProcess ⟨"bad-start-data"⟩ ⟨callerProcessId.value⟩
          callerInstanceId [{ name := "x", value := .string "y" }]) =
      { outcome := .rejected
        state := initialState
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false }

def registeredNonCallStringStartProfileInvokeReuseProgram : Program :=
  { program with
    identity :=
      { program.identity with
        semanticProfile := serviceTaskIncidentCancellationCheckpointProfileId } }

def registered_non_call_string_start_profile_reusing_invoke_does_not_inherit_empty_start_data : Bool := decide <|
    let initialVariables : List VariableBinding :=
      [{ name := "x", value := .string "y" }]
    let result := applyStimulus scenarioClosureLimit
      registeredNonCallStringStartProfileInvokeReuseProgram initialState
      (.startProcess ⟨"non-call-start"⟩ ⟨callerProcessId.value⟩
        callerInstanceId initialVariables)
    result.outcome = .committed ∧
      result.state.variables.process.bindings = initialVariables

def unregisteredNonCallProfileInvokeReuseProgram : Program :=
  { program with
    identity :=
      { program.identity with semanticProfile := ⟨"non-call-invoke-reuse"⟩ } }

def unregistered_non_call_profile_reusing_invoke_is_fail_closed : Bool := decide <|
    let result := applyStimulus scenarioClosureLimit
      unregisteredNonCallProfileInvokeReuseProgram initialState
      (.startProcess ⟨"unregistered-non-call-start"⟩ ⟨callerProcessId.value⟩
        callerInstanceId [{ name := "x", value := .string "y" }])
    result =
      { outcome := .rejected
        state := initialState
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false }

def nonempty_called_completion_data_is_rejected_with_exact_preservation : Bool := decide <|
    applyStimulus scenarioClosureLimit program calledWaiting.state
        (.completeUserTaskInstance ⟨"bad-called-data"⟩ calledTaskId
          [{ name := "x", value := .string "y" }]) =
      { outcome := .rejected
        state := calledWaiting.state
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false }

def caller_identity_cannot_complete_called_task : Bool := decide <|
    (applyStimulus scenarioClosureLimit program calledWaiting.state
      (.completeUserTaskInstance ⟨"wrong-instance"⟩
        { calledTaskId with processInstanceId := callerInstanceId } [])).outcome =
      .rejected

def returnOperation : SemanticOperation :=
  .returnProcess ⟨"operation:return-process:B_Call"⟩
    { elementId := ⟨"B_Call"⟩ } calledProcessId calledScopeId
    ⟨"place:F2_CallCallerTask"⟩

def unrelatedInstanceId : SemanticId := ⟨"UnrelatedInstance"⟩

def calledController : SequentialMultiInstanceController :=
  { processInstanceId := calledInstanceId
    activityElementId := ⟨"CalledSequentialMultiInstance"⟩
    activation := 1
    snapshot := ["called"]
    outputSlots := [] }

def callerController : SequentialMultiInstanceController :=
  { processInstanceId := callerInstanceId
    activityElementId := ⟨"CallerSequentialMultiInstance"⟩
    activation := 1
    snapshot := ["caller"]
    outputSlots := [] }

def unrelatedController : SequentialMultiInstanceController :=
  { processInstanceId := unrelatedInstanceId
    activityElementId := ⟨"UnrelatedSequentialMultiInstance"⟩
    activation := 1
    snapshot := ["unrelated"]
    outputSlots := [] }

def calledParallelController : ParallelMultiInstanceController :=
  { id :=
      { processInstanceId := calledInstanceId
        activityElementId := ⟨"CalledParallelMultiInstance"⟩
        activation := 1 }
    snapshot := ["called"]
    slots := [] }

def callerParallelController : ParallelMultiInstanceController :=
  { id :=
      { processInstanceId := callerInstanceId
        activityElementId := ⟨"CallerParallelMultiInstance"⟩
        activation := 1 }
    snapshot := ["caller"]
    slots := [] }

def unrelatedParallelController : ParallelMultiInstanceController :=
  { id :=
      { processInstanceId := unrelatedInstanceId
        activityElementId := ⟨"UnrelatedParallelMultiInstance"⟩
        activation := 1 }
    snapshot := ["unrelated"]
    slots := [] }

def controllerReturnReadyState : RuntimeState :=
  { calledWaiting.state with
    waits := []
    sequentialMultiInstanceControllers :=
      [calledController, callerController, unrelatedController]
    parallelMultiInstanceControllers :=
      [calledParallelController, callerParallelController, unrelatedParallelController]
    activityActivations := [{ taskId := ⟨"HistoryActivity"⟩, count := 8 }] }

def controllerReturnResult? : Option RuntimeState :=
  returnProcessState? controllerReturnReadyState
    ⟨"operation:return-process:B_Call"⟩ { elementId := ⟨"B_Call"⟩ }
    calledProcessId calledScopeId ⟨"place:F2_CallCallerTask"⟩

/-- Called return withdraws each controller owned by its called-instance closure, retains caller and
unrelated controllers, and frames every monotonic counter, Process data, and logical time. -/
def called_return_withdraws_exact_controller : Bool := decide <|
    controllerReturnResult?.isSome = true ∧
      (controllerReturnResult?.getD initialState).activityOccurrences =
        controllerReturnReadyState.activityOccurrences ∧
      (controllerReturnResult?.getD initialState).sequentialMultiInstanceControllers =
        [callerController, unrelatedController] ∧
      (controllerReturnResult?.getD initialState).parallelMultiInstanceControllers =
        [callerParallelController, unrelatedParallelController] ∧
      (controllerReturnResult?.getD initialState).activations =
        controllerReturnReadyState.activations ∧
      (controllerReturnResult?.getD initialState).messageActivations =
        controllerReturnReadyState.messageActivations ∧
      (controllerReturnResult?.getD initialState).timerActivations =
        controllerReturnReadyState.timerActivations ∧
      (controllerReturnResult?.getD initialState).effectActivations =
        controllerReturnReadyState.effectActivations ∧
      (controllerReturnResult?.getD initialState).scopeActivations =
        controllerReturnReadyState.scopeActivations ∧
      (controllerReturnResult?.getD initialState).eventRaceActivations =
        controllerReturnReadyState.eventRaceActivations ∧
      (controllerReturnResult?.getD initialState).callActivations =
        controllerReturnReadyState.callActivations ∧
      (controllerReturnResult?.getD initialState).activityActivations =
        controllerReturnReadyState.activityActivations ∧
      (controllerReturnResult?.getD initialState).variables.process =
        controllerReturnReadyState.variables.process ∧
      (controllerReturnResult?.getD initialState).logicalTimeMs =
        controllerReturnReadyState.logicalTimeMs

def duplicateIdentityRecordState : RuntimeState :=
  match calledWaiting.state.calledProcessOccurrences with
  | [record] =>
      { calledWaiting.state with
        calledProcessOccurrences :=
          [ record
          , { record with
              calledRoot :=
                { record.calledRoot with definitionScopeId := ⟨"wrong-root"⟩ } } ] }
  | _ => calledWaiting.state

def duplicate_identity_record_with_one_otherwise_valid_disables_return : Bool := decide <|
    calledProcessAssociationsValid duplicateIdentityRecordState = false ∧
      fire? program returnOperation duplicateIdentityRecordState = none

def duplicateCalledRootState : RuntimeState :=
  match calledWaiting.state.calledProcessOccurrences with
  | [record] =>
      { calledWaiting.state with
        scopeOccurrences :=
          { id := { record.calledRoot with definitionScopeId := ⟨"wrong-root"⟩ },
            parent := none } :: calledWaiting.state.scopeOccurrences }
  | _ => calledWaiting.state

def duplicate_called_root_with_one_otherwise_valid_disables_return : Bool := decide <|
    calledProcessAssociationsValid duplicateCalledRootState = false ∧
      fire? program returnOperation duplicateCalledRootState = none

def zeroActivationRecordState : RuntimeState :=
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

def zero_activation_record_is_nonresumable_and_has_no_return : Bool := decide <|
    calledProcessAssociationsValid zeroActivationRecordState = false ∧
      fire? program returnOperation zeroActivationRecordState = none

def aliasedCalledScopeState : RuntimeState :=
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

def called_scope_alias_is_nonresumable_and_has_no_return : Bool := decide <|
    calledProcessAssociationsValid aliasedCalledScopeState = false ∧
      fire? program returnOperation aliasedCalledScopeState = none

def alternateHostingRootId : ScopeOccurrenceId :=
  { processInstanceId := callerInstanceId
    definitionScopeId := ⟨"scope:AlternateHostingRoot"⟩
    activation := 1 }

def childCallerId : ScopeOccurrenceId :=
  { processInstanceId := callerInstanceId
    definitionScopeId := ⟨"scope:Caller_Child"⟩
    activation := 1 }

def childCallerRecord? : Option CalledProcessOccurrence :=
  calledWaiting.state.calledProcessOccurrences.head?.map ({ · with caller := childCallerId })

def childCallerState : RuntimeState :=
  match calledWaiting.state.calledProcessOccurrences, childCallerRecord? with
  | [record], some moved =>
      { calledWaiting.state with
        scopeOccurrences :=
          calledWaiting.state.scopeOccurrences ++ [{ id := childCallerId, parent := some record.caller }]
        calledProcessOccurrences := [moved] }
  | _, _ => calledWaiting.state

/-- CALLN-FRAME-01: Stage B admits an embedded caller, so association validity accepts a record whose caller is a
live child occurrence; the record's declaration instead binds the caller to the scope holding its invocation,
which this child's scope is not, so the state is ill-formed. -/
def call_record_caller_is_bound_to_its_invocation_scope : Bool := decide <|
    calledProcessAssociationsValid childCallerState = true ∧
      (childCallerRecord?.map (callRecordDeclared program)) = some false ∧
      runtimeStateWellFormed program callerInstanceId childCallerState = false

def duplicateHostingRootState : RuntimeState :=
  { calledWaiting.state with
    scopeOccurrences :=
      { id := alternateHostingRootId, parent := none } ::
        calledWaiting.state.scopeOccurrences }

def duplicate_hosting_root_with_one_valid_original_is_nonresumable : Bool := decide <|
    calledProcessAssociationsValid duplicateHostingRootState = false ∧
      fire? program returnOperation duplicateHostingRootState = none

def duplicateInvokeProgram : Program :=
  match program.operations.find? fun
      | .invokeProcess .. => true
      | _ => false with
  | some invoke => { program with operations := invoke :: program.operations }
  | none => program

def duplicate_identity_definition_with_one_otherwise_valid_is_rejected : Bool := decide <|
    callOperationsPaired duplicateInvokeProgram = false

def duplicateCalledRootProgram : Program :=
  { program with
    definitionScopes :=
      { id := ⟨"scope:WrongCalled"⟩
        parentScopeId := none
        originElementId := ⟨calledProcessId.value⟩ } :: program.definitionScopes }

def duplicate_called_process_identity_with_one_valid_root_is_rejected : Bool := decide <|
    callOperationsPaired duplicateCalledRootProgram = false

def wrongCalledEntryProgram : Program :=
  { program with
    operations := program.operations.map fun
      | .invokeProcess id origin input calledProcess calledRoot _ returned _ =>
          .invokeProcess id origin input calledProcess calledRoot
            ⟨"place:F2_CallCallerTask"⟩ returned
      | operation => operation }

def target_root_entry_permutation_fails_binding : Bool := decide <|
    definitionBindingValid checkedProcess wrongCalledEntryProgram = false

def wrongCalledRootProgram : Program :=
  { program with
    operations := program.operations.map fun
      | .invokeProcess id origin input calledProcess _ calledEntry returned _ =>
          .invokeProcess id origin input calledProcess callerScopeId calledEntry returned
      | .returnProcess id origin calledProcess _ output _ =>
          .returnProcess id origin calledProcess callerScopeId output
      | operation => operation }

def wrong_target_root_is_rejected : Bool := decide <|
    callOperationsPaired wrongCalledRootProgram = false ∧
      definitionBindingValid checkedProcess wrongCalledRootProgram = false

def wrongReturnOwnerProgram : Program :=
  { program with
    operationScopes := program.operationScopes.map fun owner =>
      if owner.operationId = ⟨"operation:return-process:B_Call"⟩ then
        { owner with scopeId := callerScopeId }
      else owner }

def wrong_return_owner_is_rejected : Bool := decide <|
    callOperationsPaired wrongReturnOwnerProgram = false ∧
      definitionBindingValid checkedProcess wrongReturnOwnerProgram = false

def wrongReturnPairProgram : Program :=
  { program with
    operations := program.operations.map fun
      | .invokeProcess id origin input calledProcess calledRoot calledEntry _ _ =>
          .invokeProcess id origin input calledProcess calledRoot calledEntry
            ⟨"operation:wrong-return"⟩
      | operation => operation }

def wrong_return_pair_is_rejected : Bool := decide (callOperationsPaired wrongReturnPairProgram = false)

def stale_called_completion_preserves_exact_state : Bool := decide <|
    applyStimulus scenarioClosureLimit program callerWaiting.state completeCalled =
      { outcome := .rejected
        state := callerWaiting.state
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false }

def orphanCalledRootState : RuntimeState :=
  { calledWaiting.state with calledProcessOccurrences := [] }

def orphan_called_root_is_nonresumable : Bool := decide <|
    calledProcessAssociationsValid orphanCalledRootState = false ∧
      stableStateResumable orphanCalledRootState = false

def return_refuses_nonquiescent_called_scope : Bool := decide <|
    returnProcessState? calledWaiting.state
        ⟨"operation:return-process:B_Call"⟩ { elementId := ⟨"B_Call"⟩ }
        calledProcessId calledScopeId ⟨"place:F2_CallCallerTask"⟩ = none ∧
      calledWaiting.state.calledProcessOccurrences.all fun record =>
        scopeQuiescent calledWaiting.state record.calledRoot = false

/-- Every check of this module, named for the executable driver's failure report. -/
def checks : List (String × Bool) := [
  ("exact_definition_binding_is_valid", exact_definition_binding_is_valid),
  ("start_closure_is_exactly_three_steps", start_closure_is_exactly_three_steps),
  ("called_completion_closure_is_exactly_three_steps", called_completion_closure_is_exactly_three_steps),
  ("caller_completion_closure_is_exactly_two_steps", caller_completion_closure_is_exactly_two_steps),
  ("called_wait_uses_derived_identity_and_caller_observation_identity", called_wait_uses_derived_identity_and_caller_observation_identity),
  ("delimiter_and_non_ascii_identity_uses_utf8_lengths", delimiter_and_non_ascii_identity_uses_utf8_lengths),
  ("nonempty_start_data_is_rejected_with_exact_preservation", nonempty_start_data_is_rejected_with_exact_preservation),
  ("registered_non_call_string_start_profile_reusing_invoke_does_not_inherit_empty_start_data", registered_non_call_string_start_profile_reusing_invoke_does_not_inherit_empty_start_data),
  ("unregistered_non_call_profile_reusing_invoke_is_fail_closed", unregistered_non_call_profile_reusing_invoke_is_fail_closed),
  ("nonempty_called_completion_data_is_rejected_with_exact_preservation", nonempty_called_completion_data_is_rejected_with_exact_preservation),
  ("caller_identity_cannot_complete_called_task", caller_identity_cannot_complete_called_task),
  ("called_return_withdraws_exact_controller", called_return_withdraws_exact_controller),
  ("duplicate_identity_record_with_one_otherwise_valid_disables_return", duplicate_identity_record_with_one_otherwise_valid_disables_return),
  ("duplicate_called_root_with_one_otherwise_valid_disables_return", duplicate_called_root_with_one_otherwise_valid_disables_return),
  ("zero_activation_record_is_nonresumable_and_has_no_return", zero_activation_record_is_nonresumable_and_has_no_return),
  ("called_scope_alias_is_nonresumable_and_has_no_return", called_scope_alias_is_nonresumable_and_has_no_return),
  ("call_record_caller_is_bound_to_its_invocation_scope", call_record_caller_is_bound_to_its_invocation_scope),
  ("duplicate_hosting_root_with_one_valid_original_is_nonresumable", duplicate_hosting_root_with_one_valid_original_is_nonresumable),
  ("duplicate_identity_definition_with_one_otherwise_valid_is_rejected", duplicate_identity_definition_with_one_otherwise_valid_is_rejected),
  ("duplicate_called_process_identity_with_one_valid_root_is_rejected", duplicate_called_process_identity_with_one_valid_root_is_rejected),
  ("target_root_entry_permutation_fails_binding", target_root_entry_permutation_fails_binding),
  ("wrong_target_root_is_rejected", wrong_target_root_is_rejected),
  ("wrong_return_owner_is_rejected", wrong_return_owner_is_rejected),
  ("wrong_return_pair_is_rejected", wrong_return_pair_is_rejected),
  ("stale_called_completion_preserves_exact_state", stale_called_completion_preserves_exact_state),
  ("orphan_called_root_is_nonresumable", orphan_called_root_is_nonresumable),
  ("return_refuses_nonquiescent_called_scope", return_refuses_nonquiescent_called_scope)
]

end BpmnSemantics.CallActivityConformance
