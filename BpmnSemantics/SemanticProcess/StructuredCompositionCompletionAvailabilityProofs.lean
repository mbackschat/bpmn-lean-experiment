import BpmnSemantics.SemanticProcess.StructuredCompositionCounterProofs

/-! Exact task lifetime and declaration ownership provide concrete admitted completion commands.
Reached completion availability derives committed collection storage from the existing execution,
control-unit and lifecycle invariants; arbitrary-state construction names storage as a premise. -/

namespace BpmnSemantics.SemanticProcess.StructuredComposition

theorem data_contracts_select_wait_declarers (program : Program) (taskId : TaskDefinitionId) :
    (dataInputOutputTaskContracts program).filter (fun contract => decide (contract.taskId = taskId)) =
      dataInputOutputTaskContracts { program with
        operations := program.operations.filter (fun operation => operationDeclaresWaitKey operation (userTaskWaitDeclarationKey taskId)) } := by
  simp only [dataInputOutputTaskContracts, List.filter_filterMap, List.filterMap_filter]
  congr 1
  funext operation
  cases operation <;> simp [operationDeclaresWaitKey, operationWaitDeclarationKeys, userTaskWaitDeclarationKey]
  case awaitDataInputOutputUserTask id origin input output declaredId taskName directInput directOutput =>
    cases declaredId; cases taskId
    simp [Option.filter, eq_comm]

theorem declared_data_task_has_exact_contract
    (program : Program) (id : OperationId) (origin : BpmnElementOrigin) (input output : ControlPlaceId)
    (taskId : TaskDefinitionId) (taskName : Option String) (directInput : DirectActivityDataInput)
    (directOutput : DirectActivityDataOutput) (wellFormed : programWellFormed program = true)
    (member : SemanticOperation.awaitDataInputOutputUserTask id origin input output taskId taskName directInput directOutput ∈ program.operations) :
    dataInputOutputTaskContract? program taskId = some {
      operationId := id, input, output, taskId, taskName, directInput, directOutput } := by
  have unique := programWellFormed_waitDeclarer program
    (.awaitDataInputOutputUserTask id origin input output taskId taskName directInput directOutput)
    (userTaskWaitDeclarationKey taskId) wellFormed member
    (by simp [operationDeclaresWaitKey, operationWaitDeclarationKeys])
  unfold dataInputOutputTaskContract?
  rw [data_contracts_select_wait_declarers, unique]
  rfl


theorem declared_ordinary_task_completion_guards
    (program : Program) (id : OperationId) (origin : BpmnElementOrigin) (input output : ControlPlaceId)
    (task : UserTaskDefinition) (taskId : UserTaskInstanceId)
    (wellFormed : programWellFormed program = true)
    (profile : program.identity.semanticProfile = structuredCompositionCheckpointProfileId)
    (member : SemanticOperation.awaitUserTask id origin input output task ∈ program.operations)
    (key : taskId.elementId.value = task.id.value) :
    isDataInputOutputTaskDefinition program task.id = false ∧
      structuredCompositionOrdinaryCompletionAdmitted program taskId [] = true := by
  have unique := programWellFormed_waitDeclarer program (.awaitUserTask id origin input output task)
    (userTaskWaitDeclarationKey task.id) wellFormed member
    (by simp [operationDeclaresWaitKey, operationWaitDeclarationKeys])
  have noData : (dataInputOutputTaskContracts program).filter (fun contract => decide (contract.taskId = task.id)) = [] := by
    rw [data_contracts_select_wait_declarers, unique]
    rfl
  have ordinary : program.operations.filter (fun operation => match operation with
      | .awaitUserTask _ _ _ _ declared => declared.id.value == taskId.elementId.value | _ => false) =
      [SemanticOperation.awaitUserTask id origin input output task] := by
    have restrict : program.operations.filter (fun operation => match operation with
        | .awaitUserTask _ _ _ _ declared => declared.id.value == taskId.elementId.value | _ => false) =
        (program.operations.filter (fun operation => operationDeclaresWaitKey operation
          (userTaskWaitDeclarationKey task.id))).filter (fun operation => match operation with
            | .awaitUserTask _ _ _ _ declared => declared.id.value == taskId.elementId.value | _ => false) := by
      rw [List.filter_filter]
      apply List.filter_congr
      intro operation included
      cases operation <;> simp [operationDeclaresWaitKey, operationWaitDeclarationKeys, userTaskWaitDeclarationKey, key]
      exact fun same => same.symm
    rw [restrict, unique]
    simp [key]
  constructor
  · unfold isDataInputOutputTaskDefinition
    apply List.any_eq_false.mpr
    intro contract member
    by_cases matched : contract.taskId = task.id
    · have filtered : contract ∈ (dataInputOutputTaskContracts program).filter (fun candidate => decide (candidate.taskId = task.id)) :=
        List.mem_filter.mpr ⟨member, by simp [matched]⟩
      rw [noData] at filtered
      contradiction
    · simp [matched]
  · unfold structuredCompositionOrdinaryCompletionAdmitted
    simp [profile]
    change (program.operations.filter (fun operation => match operation with
      | .awaitUserTask _ _ _ _ declared => declared.id.value == taskId.elementId.value | _ => false)).length = 1
    rw [ordinary]
    rfl


/-- Exact dynamic lifetime and static declaration ownership construct an admitted completion, rather than assuming one succeeds. -/
theorem exact_task_lifetime_has_admitted_completion
    (program : Program) (analysis : Analysis) (state : RuntimeState) (commandId : SemanticId)
    (wellFormed : programWellFormed program = true)
    (profile : program.identity.semanticProfile = structuredCompositionCheckpointProfileId)
    (analyzed : programAnalysis program = some analysis)
    (foreign : ForeignRuntimeEmpty state) (storage : committedStateCollectionAdmitted state = true)
    (shape : TaskLifetimeShape program state)
    (hasWait : state.waits ≠ [])
    (scopeOwned : ∀ operation ∈ program.operations, ∀ wait ∈ state.waits,
      operationOwningScope? program operation.id = some wait.owner.definitionScopeId) :
    ∃ wait ∈ state.waits, ∃ bindings,
      (admitStimulus program state (.completeUserTaskInstance commandId {
        processInstanceId := wait.processInstanceId
        elementId := ⟨wait.task.id.value⟩
        activation := wait.activation } bindings)).outcome = .committed := by
  rcases shape with ⟨empty, _⟩ | ⟨wait, operation, waits, member, running, processOwner, details⟩
  · exact False.elim (hasWait empty)
  · have live : wait ∈ state.waits := by simp [waits]
    have staticOwner := scopeOwned operation member wait live
    have notNested : nestedScopeDataProgram program = false :=
      nestedScopeDataProgram_of_profile_value (by rw [profile])
    obtain ⟨_, _, noRetention, noSnapshots, _⟩ := program_analysis_excludes_foreign_declarations program analysis analyzed
    have noIncidents := foreign.2.2.2.1
    have noDeclarations := well_formed_foreign_profile_has_no_message_declarations program wellFormed (by rw [profile]; decide +kernel)
    have noListeners : state.eventSubProcessMessageSubscriptions = [] := by simp_all only [ForeignRuntimeEmpty]
    refine ⟨wait, live, ?_⟩
    cases operation <;> simp only at details
    all_goals try contradiction
    case awaitUserTask id origin input output task =>
      obtain ⟨taskEq, _, _, _, _⟩ := details
      have guards := declared_ordinary_task_completion_guards program id origin input output task
        { processInstanceId := wait.processInstanceId, elementId := ⟨wait.task.id.value⟩, activation := wait.activation }
        wellFormed profile member (by simp [taskEq])
      have noData : isDataInputOutputTaskDefinition program wait.task.id = false := by simpa only [taskEq] using guards.1
      obtain ⟨noParallel, noSequential, noMessageMonitored, noMessageBounded, noBounded,
        noInput, noOutput, noMonitored⟩ := admitted_completion_foreign_families_absent program analysis wait.task.id analyzed
      refine ⟨[], ?_⟩
      simp [admitStimulus, storage, callDataRuntimeStateValid, interruptingMessageEventSubProcessStateValid, noDeclarations, noListeners, noSnapshots, noIncidents, running, noParallel, noSequential, noMessageMonitored,
        noMessageBounded, noBounded, noData, guards.2, noInput, noOutput, noMonitored,
        completeOrdinaryUserTaskWithCompensation?, compensationTargetDeclaredForFamily, noRetention,
        completeUserTask, taskIdNamesWait, waits, isCallActivityProgram, profile, structuredCompositionCheckpointProfileId,
        processDataBindingsAdmitted, notNested]
    case awaitDataInputOutputUserTask id origin input output taskId taskName directInput directOutput =>
      obtain ⟨taskEq, outputEq, metadata, activityActivation, binding, bindingName, typed, records, scopes⟩ := details
      have declared := declared_data_task_has_exact_contract program id origin input output taskId taskName directInput
        directOutput wellFormed member
      have selected := exact_data_contract_selects_data_dispatch program taskId _ declared
      obtain ⟨_, _, _, _, _, _, endpoint⟩ := completion_contract_has_analyzed_vertex program analysis taskId _ analyzed declared
      change directOutput.target = .property directOutput.target.id at endpoint
      obtain ⟨propertyId, propertyEndpoint⟩ : ∃ propertyId, directOutput.target = .property propertyId := ⟨_, endpoint⟩
      change operationOwningScope? program id = some wait.owner.definitionScopeId at staticOwner
      have scalarPath := programPropertyPathValuePolicy_eq_scalar (program := program) (by simp [profile])
      have ready : ∃ after, completeDataInputOutputUserTask? program state wait.processInstanceId taskId wait.activation
          [{ name := directOutput.sourceDataOutputId, value := .null }] = some after := by
        simp [completeDataInputOutputUserTask?, scalarPath, activityDataOutputValueAdmitted, dataInputOutputRunningInstance_of_running running, declared,
          filledDeclaredOutput?, dataInputOutputTaskWait?, waits, taskEq, activityOccurrenceForTaskWait?,
          records, recordBodyNamesWait, activityBodyTask?, taskIdNamesWait, dataInputOutputRuntimeJoinValid,
          outputEq, staticOwner, processOwner, dataInputOutputLocalScope?, scopes, activityOccurrenceScopeMatches,
          activityOwnerForRecord, localDataOwnerMatches, bindingName, removeActivityOccurrenceVariableScope,
          writeActivityDataOutput?, propertyEndpoint, processInterfaceScalar, activityDataPropertyOwner, running]
        cases value : binding.value <;> simp [value, variableValueAdmitted,
          activityDataInputOutputUserTaskProfileId] at typed ⊢
      obtain ⟨after, completed⟩ := ready
      obtain ⟨noParallel, noSequential, noMessageMonitored, noMessageBounded, noBounded, _, _, _⟩ :=
        admitted_completion_foreign_families_absent program analysis taskId analyzed
      refine ⟨[{ name := directOutput.sourceDataOutputId, value := .null }], ?_⟩
      simp [admitStimulus, storage, callDataRuntimeStateValid, interruptingMessageEventSubProcessStateValid, noDeclarations, noListeners, noSnapshots, noIncidents, running, taskEq, noParallel, noSequential,
        noMessageMonitored, noMessageBounded, noBounded, selected, completed, processDataBindingsAdmitted,
        profile, variableValueAdmitted, structuredCompositionCheckpointProfileId]



/-- A task reached from an admitted start has a concrete accepted full-occurrence completion. -/
theorem reached_task_has_admitted_completion
    (program : Program) (analysis : Analysis) (startCommandId completionCommandId processId instanceId : SemanticId)
    (bindings : List VariableBinding) (reached : RuntimeState)
    (wellFormed : programWellFormed program = true)
    (profile : program.identity.semanticProfile = structuredCompositionCheckpointProfileId)
    (analyzed : programAnalysis program = some analysis)
    (committed : (admitStimulus program initialState
      (.startProcess startCommandId processId instanceId bindings)).outcome = .committed)
    (reachable : TaskExecutionReachable program
      (admitStimulus program initialState (.startProcess startCommandId processId instanceId bindings)).state reached)
    (hasWait : reached.waits ≠ []) :
    ∃ wait ∈ reached.waits, ∃ completionBindings,
      (admitStimulus program reached (.completeUserTaskInstance completionCommandId {
        processInstanceId := wait.processInstanceId
        elementId := ⟨wait.task.id.value⟩
        activation := wait.activation } completionBindings)).outcome = .committed := by
  obtain ⟨frame, shape⟩ := reached_state_has_exact_lifecycle program analysis startCommandId processId instanceId
    bindings reached wellFormed profile analyzed committed reachable
  obtain ⟨root, owner, definitions, rootKey, startOwned⟩ := committed_start_has_declared_root_owner program analysis
    startCommandId processId instanceId bindings profile analyzed committed
  have startBound := committed_start_task_execution_has_at_most_one_control_unit program analysis startCommandId processId
    instanceId bindings _ profile analyzed committed .initial
  have owned := task_execution_preserves_root_ownership program analysis _ reached owner analyzed startOwned startBound reachable
  apply exact_task_lifetime_has_admitted_completion program analysis reached completionCommandId
    wellFormed profile analyzed frame.1.1
    (exact_lifecycle_collection_storage program reached frame shape
      (committed_start_task_execution_has_at_most_one_control_unit program analysis startCommandId processId
        instanceId bindings reached profile analyzed committed reachable)
      (reached_state_has_counter_storage program analysis startCommandId processId instanceId bindings reached
        profile analyzed committed reachable)) shape hasWait
  intro operation member wait live
  rw [owned.2.2 wait live, rootKey]
  exact admitted_operations_share_declared_root program analysis root wellFormed analyzed definitions operation member

end BpmnSemantics.SemanticProcess.StructuredComposition
