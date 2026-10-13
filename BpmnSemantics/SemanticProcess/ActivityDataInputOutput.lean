import BpmnSemantics.SemanticProcess.ActivityDataInputOutputRuntime
import BpmnSemantics.SemanticProcess.ActivityDataEndpointLaws
import BpmnSemantics.SemanticProcess.ActivityBodyClaimWriterPreservation
import BpmnSemantics.SemanticProcess.RuntimeStateWellFormed

/-! # Composed Activity data relations and laws

The runtime owner supplies the atomic evaluators; these relations and laws retain the composed
Activity contract independently of its module placement.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

variable {policy : PropertyPathValuePolicy}

/-- The exact composed-task lookup also fixes every queried occurrence-key component. -/
theorem dataInputOutputTaskWait_facts {state : RuntimeState} {processInstanceId : SemanticId}
    {taskId : TaskDefinitionId} {activation : Nat} {wait : UserTaskWait}
    (found : dataInputOutputTaskWait? state processInstanceId taskId activation = some wait) :
    wait ∈ state.waits ∧ wait.processInstanceId = processInstanceId ∧
      wait.task.id = taskId ∧ wait.activation = activation := by
  unfold dataInputOutputTaskWait? at found
  split at found
  · next singleton =>
      cases found
      have selected : wait ∈ state.waits.filter (taskIdNamesWait { processInstanceId := processInstanceId, elementId := ⟨taskId.value⟩, activation := activation }) := by
        rw [singleton]
        simp
      obtain ⟨member, keyFacts⟩ := List.mem_filter.mp selected
      simp only [taskIdNamesWait, Bool.and_eq_true, beq_iff_eq] at keyFacts
      exact ⟨member, keyFacts.1.1.symm, taskDefinitionId_eq_of_value keyFacts.1.2.symm, keyFacts.2.symm⟩
  · exact absurd found (by simp)

/-- A contract returned by the unique composed-task lookup projects one actual declared operation. -/
theorem dataInputOutputTaskContract_facts {program : Program} {taskId : TaskDefinitionId}
    {contract : DataInputOutputTaskContract}
    (found : dataInputOutputTaskContract? program taskId = some contract) :
    contract.taskId = taskId ∧ ∃ origin,
      SemanticOperation.awaitDataInputOutputUserTask contract.operationId origin contract.input
          contract.output contract.taskId contract.taskName contract.directInput
          contract.directOutput ∈ program.operations := by
  unfold dataInputOutputTaskContract? at found
  split at found
  · next singleton =>
      cases found
      have selected : contract ∈ (dataInputOutputTaskContracts program).filter fun candidate =>
          decide (candidate.taskId = taskId) := by
        rw [singleton]
        simp
      obtain ⟨contractMember, taskEq⟩ := List.mem_filter.mp selected
      simp only [decide_eq_true_eq] at taskEq
      unfold dataInputOutputTaskContracts at contractMember
      simp only [List.mem_filterMap] at contractMember
      obtain ⟨operation, operationMember, projects⟩ := contractMember
      cases operation <;> simp at projects
      next id origin input output candidateTaskId taskName directInput directOutput =>
        cases projects
        exact ⟨taskEq, origin, operationMember⟩
  · exact absurd found (by simp)

/-- `ADIO-READY-01` as a relation over the committed composed operation. -/
inductive DataInputOutputActivationStep (program : Program) :
    RuntimeState → RuntimeState → Prop where
  | activate (before : RuntimeState) (instanceId : SemanticId)
      (id : OperationId) (origin : BpmnElementOrigin)
      (input output : ControlPlaceId) (taskId : TaskDefinitionId)
      (taskName : Option String) (directInput : DirectActivityDataInput)
      (directOutput : DirectActivityDataOutput)
      (declared : SemanticOperation.awaitDataInputOutputUserTask id origin input output
        taskId taskName directInput directOutput ∈ program.operations)
      (running : before.control = .running instanceId)
      (owner : ScopeOccurrenceId)
      (owned : onlyTokenOwner? before input = some owner)
      (source : (dataInputOutputSourceBinding? (programPropertyPathValuePolicy program) before owner directInput).isSome = true)
      (after : RuntimeState)
      (step : activateDataInputOutputUserTask? (programPropertyPathValuePolicy program) before input output taskId
        taskName directInput = some after) :
      DataInputOutputActivationStep program before after

/-- `ADIO-ATOMIC-01` as a relation. Its premises expose both program-owned associations and every
runtime join that must leave together. -/
inductive DataInputOutputCompletionStep (program : Program) :
    RuntimeState → RuntimeState → Prop where
  | complete (before : RuntimeState) (instanceId processInstanceId : SemanticId)
      (taskId : TaskDefinitionId) (activation : Nat) (submittedValues : List VariableBinding)
      (contract : DataInputOutputTaskContract) (filled : VariableBinding)
      (task : UserTaskWait) (record : ActivityOccurrence) (localsRemoved : ScopedVariables)
      (running : before.control = .running instanceId)
      (declared : dataInputOutputTaskContract? program taskId = some contract)
      (available : filledDeclaredOutput? contract.directOutput submittedValues = some filled)
      (live : dataInputOutputTaskWait? before processInstanceId taskId activation = some task)
      (joined : activityOccurrenceForTaskWait? before.activityOccurrences task = some record)
      (removed : removeActivityOccurrenceVariableScope before.variables (activityOwnerForRecord record) =
        some localsRemoved)
      (after : RuntimeState)
      (step : completeDataInputOutputUserTask? program before processInstanceId taskId
        activation submittedValues = some after)
      (routed : ActivityDataOutputRouting (programPropertyPathValuePolicy program) before task.owner localsRemoved
        contract.directOutput filled after.variables) :
      DataInputOutputCompletionStep program before after

private theorem dataInputOutputRunningInstance_sound {state : RuntimeState}
    {instanceId : SemanticId}
    (found : dataInputOutputRunningInstance? state = some instanceId) :
    state.control = .running instanceId := by
  unfold dataInputOutputRunningInstance? at found
  split at found
  · next running => cases found; exact running
  · exact absurd found (by simp)

theorem dataInputOutputRunningInstance_of_running {state : RuntimeState}
    {instanceId : SemanticId} (running : state.control = .running instanceId) :
    dataInputOutputRunningInstance? state = some instanceId := by
  simp [dataInputOutputRunningInstance?, running]

/-- `ADIO-READY-01`. Missing, ambiguous, or unsupported required Process input refuses activation. -/
theorem dataInputOutputUnavailableSourceRefusesActivation (state : RuntimeState)
    (input output : ControlPlaceId) (taskId : TaskDefinitionId)
    (taskName : Option String) (directInput : DirectActivityDataInput)
    (unavailable : ∀ owner, dataInputOutputSourceBinding? policy state owner directInput = none) :
    activateDataInputOutputUserTask? policy state input output taskId taskName directInput = none := by
  unfold activateDataInputOutputUserTask?
  simp [unavailable]

/-- Every successful composed activation is admitted by its declarative relation. -/
theorem activateDataInputOutputUserTask_sound (program : Program)
    (before after : RuntimeState) (id : OperationId) (origin : BpmnElementOrigin)
    (input output : ControlPlaceId) (taskId : TaskDefinitionId)
    (taskName : Option String) (directInput : DirectActivityDataInput)
    (directOutput : DirectActivityDataOutput)
    (declared : SemanticOperation.awaitDataInputOutputUserTask id origin input output
      taskId taskName directInput directOutput ∈ program.operations)
    (success : activateDataInputOutputUserTask? (programPropertyPathValuePolicy program) before input output taskId
      taskName directInput = some after) :
    DataInputOutputActivationStep program before after := by
  have ownership : ∃ owner, onlyTokenOwner? before input = some owner := by
    cases owned : onlyTokenOwner? before input with
    | none => simp [activateDataInputOutputUserTask?, owned] at success
    | some owner => exact ⟨owner, rfl⟩
  obtain ⟨owner, owned⟩ := ownership
  have hosted : ∃ instanceId, dataInputOutputRunningInstance? before = some instanceId := by
    cases running : dataInputOutputRunningInstance? before with
    | none => simp [activateDataInputOutputUserTask?, owned, running] at success
    | some instanceId => exact ⟨instanceId, rfl⟩
  obtain ⟨instanceId, running⟩ := hosted
  have available :
      (dataInputOutputSourceBinding? (programPropertyPathValuePolicy program) before owner directInput).isSome = true := by
    cases source : dataInputOutputSourceBinding? (programPropertyPathValuePolicy program) before owner directInput with
    | none => simp [activateDataInputOutputUserTask?, owned, running, source] at success
    | some binding => rfl
  exact .activate before instanceId id origin input output taskId taskName directInput directOutput
    declared (dataInputOutputRunningInstance_sound running) owner owned available after success

/-- `ADIO-PRESERVE-01`. Activation copies into local scope without changing Process scope. -/
theorem dataInputOutputActivationPreservesProcessScope {state after : RuntimeState}
    {input output : ControlPlaceId} {taskId : TaskDefinitionId}
    {taskName : Option String} {directInput : DirectActivityDataInput}
    (step : activateDataInputOutputUserTask? policy state input output taskId taskName directInput =
      some after) :
    after.variables.process = state.variables.process := by
  unfold activateDataInputOutputUserTask? at step
  cases owned : onlyTokenOwner? state input with
  | none => simp [owned] at step
  | some owner =>
      cases running : dataInputOutputRunningInstance? state with
      | none => simp [owned, running] at step
      | some instanceId =>
          cases source : dataInputOutputSourceBinding? policy state owner directInput with
          | none => simp [owned, running, source] at step
          | some binding =>
              simp [owned, running, source] at step
              obtain ⟨_, rfl⟩ := step
              rfl

/-- An existing local scope for the next Activity identity refuses activation instead of creating an
ambiguous second owner. -/
theorem dataInputOutputExistingLocalOwnerRefusesActivation (state : RuntimeState)
    (instanceId : SemanticId) (owner : ScopeOccurrenceId) (input output : ControlPlaceId)
    (taskId : TaskDefinitionId) (taskName : Option String) (directInput : DirectActivityDataInput)
    (running : state.control = .running instanceId)
    (owned : onlyTokenOwner? state input = some owner)
    (present : state.variables.activities.any
      (activityOccurrenceScopeMatches (dataInputOutputActivityOwner state owner.processInstanceId taskId)) = true) :
    activateDataInputOutputUserTask? policy state input output taskId taskName directInput = none := by
  unfold activateDataInputOutputUserTask?
  have hosted := dataInputOutputRunningInstance_of_running running
  cases source : dataInputOutputSourceBinding? policy state owner directInput <;>
    simp [owned, hosted, source, dataInputOutputActivityOwner] at present ⊢
  exact present

/-- Every successful activation obtains local-owner freshness from the evaluator's fail-closed join. -/
theorem activateDataInputOutputUserTask_localOwnerFresh {state after : RuntimeState}
    {instanceId : SemanticId} {owner : ScopeOccurrenceId}
    {input output : ControlPlaceId} {taskId : TaskDefinitionId}
    {taskName : Option String} {directInput : DirectActivityDataInput}
    (running : state.control = .running instanceId)
    (owned : onlyTokenOwner? state input = some owner)
    (step : activateDataInputOutputUserTask? policy state input output taskId taskName directInput = some after) :
    ∀ scope ∈ state.variables.activities,
      activityOccurrenceScopeMatches
        (dataInputOutputActivityOwner state owner.processInstanceId taskId) scope = false := by
  unfold activateDataInputOutputUserTask? at step
  have hosted := dataInputOutputRunningInstance_of_running running
  cases source : dataInputOutputSourceBinding? policy state owner directInput with
  | none => simp [owned, hosted, source] at step
  | some binding =>
      simp [owned, hosted, source] at step
      exact step.1

/-- `ADIO-SCOPE-01`. The selected activation-time source is copied exactly once into the newly
minted Activity owner. -/
theorem dataInputOutputActivationCopiesSelectedSourceExactly {state after : RuntimeState}
    {instanceId : SemanticId} {owner : ScopeOccurrenceId} {input output : ControlPlaceId}
    {taskId : TaskDefinitionId} {taskName : Option String}
    {directInput : DirectActivityDataInput} {source : VariableBinding}
    (owned : onlyTokenOwner? state input = some owner)
    (running : state.control = .running instanceId)
    (available : dataInputOutputSourceBinding? policy state owner directInput = some source)
    (fresh : ∀ scope ∈ state.variables.activities,
      activityOccurrenceScopeMatches (dataInputOutputActivityOwner state owner.processInstanceId taskId)
        scope = false)
    (step : activateDataInputOutputUserTask? policy state input output taskId taskName directInput =
      some after) :
    activityOccurrenceVariableBindings after.variables
        (dataInputOutputActivityOwner state owner.processInstanceId taskId) =
      some [{ name := directInput.targetDataInputId, value := source.value }] := by
  unfold activateDataInputOutputUserTask? at step
  have hosted : dataInputOutputRunningInstance? state = some instanceId := by
    simp [dataInputOutputRunningInstance?, running]
  simp [owned, hosted, available] at step
  obtain ⟨_, rfl⟩ := step
  simp only [dataInputOutputActivityOwner] at fresh
  simp only [activityOccurrenceVariableBindings, addActivityOccurrenceVariableScope,
    dataInputOutputActivityOwner]
  rw [filter_insertActivityVariableScope_eq_singleton _ _
    (by simp [activityOccurrenceScopeMatches, localDataOwnerMatches]) fresh]

/-- The exact family-local one-scope invariant for an active composed occurrence. -/
def dataInputOutputExactOneScope (state : RuntimeState) (owner : ActivityOccurrenceId)
    (directInput : DirectActivityDataInput) : Prop :=
  ∃ binding,
    state.variables.activities.filter (activityOccurrenceScopeMatches owner) =
      [{ owner := .activityOccurrence owner, bindings := [binding] }] ∧
    binding.name = directInput.targetDataInputId

/-- `ADIO-SCOPE-01`. Successful activation establishes the stronger family-local invariant rather
than relying on the aggregate runtime predicate, which intentionally does not reject duplicate
local owners. -/
theorem dataInputOutputActivationEstablishesExactOneScope {state after : RuntimeState}
    {instanceId : SemanticId} {owner : ScopeOccurrenceId} {input output : ControlPlaceId}
    {taskId : TaskDefinitionId} {taskName : Option String}
    {directInput : DirectActivityDataInput} {source : VariableBinding}
    (owned : onlyTokenOwner? state input = some owner)
    (running : state.control = .running instanceId)
    (available : dataInputOutputSourceBinding? policy state owner directInput = some source)
    (fresh : ∀ scope ∈ state.variables.activities,
      activityOccurrenceScopeMatches (dataInputOutputActivityOwner state owner.processInstanceId taskId)
        scope = false)
    (step : activateDataInputOutputUserTask? policy state input output taskId taskName directInput =
      some after) :
    dataInputOutputExactOneScope after
      (dataInputOutputActivityOwner state owner.processInstanceId taskId) directInput := by
  refine ⟨{ name := directInput.targetDataInputId, value := source.value }, ?_, rfl⟩
  unfold activateDataInputOutputUserTask? at step
  have hosted : dataInputOutputRunningInstance? state = some instanceId := by
    simp [dataInputOutputRunningInstance?, running]
  simp [owned, hosted, available] at step
  obtain ⟨_, rfl⟩ := step
  simp only [dataInputOutputActivityOwner] at fresh
  simp only [addActivityOccurrenceVariableScope, dataInputOutputActivityOwner]
  exact filter_insertActivityVariableScope_eq_singleton _ _
    (by simp [activityOccurrenceScopeMatches, localDataOwnerMatches]) fresh

theorem dataInputOutputCompletionJoin {program : Program} {state after : RuntimeState}
    {processInstanceId : SemanticId} {taskId : TaskDefinitionId} {activation : Nat}
    {submittedValues : List VariableBinding}
    (step : completeDataInputOutputUserTask? program state processInstanceId taskId activation
      submittedValues = some after) :
    ∃ instanceId contract filled task record scope variables,
      dataInputOutputRunningInstance? state = some instanceId ∧
      dataInputOutputTaskContract? program taskId = some contract ∧
      filledDeclaredOutput? contract.directOutput submittedValues = some filled ∧
      dataInputOutputTaskWait? state processInstanceId taskId activation = some task ∧
      activityOccurrenceForTaskWait? state.activityOccurrences task = some record ∧
      dataInputOutputLocalScope? (programPropertyPathValuePolicy program) state record contract.directInput = some scope ∧
      removeActivityOccurrenceVariableScope state.variables (activityOwnerForRecord record) =
        some variables ∧
      record.attachedHandlers.isEmpty = true ∧
      after.waits = state.waits.erase task ∧
      after.activityOccurrences = state.activityOccurrences.filter (fun candidate =>
        !sameActivityOccurrence candidate record) ∧
      writeActivityDataOutput? (programPropertyPathValuePolicy program) state task.owner variables contract.directOutput filled =
        some after.variables := by
  unfold completeDataInputOutputUserTask? at step
  cases running : dataInputOutputRunningInstance? state with
  | none => simp [running] at step
  | some instanceId =>
      cases declared : dataInputOutputTaskContract? program taskId with
      | none => simp [running, declared] at step
      | some contract =>
          cases available : filledDeclaredOutput? contract.directOutput submittedValues with
          | none => simp [running, declared, available] at step
          | some filled =>
              cases live : dataInputOutputTaskWait? state processInstanceId taskId activation with
              | none => simp [running, declared, live] at step
              | some task =>
                  cases joined : activityOccurrenceForTaskWait? state.activityOccurrences task with
                  | none => simp [running, declared, live, joined] at step
                  | some record =>
                      cases joinValid : dataInputOutputRuntimeJoinValid program contract task record
                      · simp [running, declared, live, joined, joinValid] at step
                      · cases scopeFound : dataInputOutputLocalScope? (programPropertyPathValuePolicy program) state record contract.directInput with
                        | none => simp [running, declared, live, joined, joinValid, scopeFound] at step
                        | some scope =>
                            cases removed : removeActivityOccurrenceVariableScope state.variables
                                (activityOwnerForRecord record) with
                            | none => simp [running, declared, live, joined, removed] at step
                            | some variables =>
                                cases routed : writeActivityDataOutput? (programPropertyPathValuePolicy program) state task.owner
                                    variables contract.directOutput filled with
                                | none => simp [running, declared, available, live, joined, joinValid,
                                    scopeFound, removed, routed] at step
                                | some result =>
                                    simp [running, declared, available, live, joined, joinValid,
                                      scopeFound, removed, routed] at step
                                    obtain ⟨handlers, rfl⟩ := step
                                    exact ⟨instanceId, contract, filled, task, record, scope, variables,
                                      rfl, rfl, available, rfl, joined, scopeFound, removed,
                                      (by simpa using handlers), rfl, rfl, routed⟩

/-- `ADIO-FILL-01`. A missing, extra, or wrongly named required output refuses universally. -/
theorem dataInputOutputUnavailableOutputRefusesCompletion (program : Program)
    (state : RuntimeState) (processInstanceId : SemanticId) (taskId : TaskDefinitionId)
    (activation : Nat) (submittedValues : List VariableBinding)
    (contract : DataInputOutputTaskContract)
    (declared : dataInputOutputTaskContract? program taskId = some contract)
    (unavailable : filledDeclaredOutput? contract.directOutput submittedValues = none) :
    completeDataInputOutputUserTask? program state processInstanceId taskId activation
      submittedValues = none := by
  unfold completeDataInputOutputUserTask?
  cases dataInputOutputRunningInstance? state <;> simp [declared, unavailable]

/-- `ADIO-REFUSE-01`. An absent or multiply declared composed task cannot consume a completion. -/
theorem dataInputOutputUndeclaredTaskRefusesCompletion (program : Program)
    (state : RuntimeState) (processInstanceId : SemanticId) (taskId : TaskDefinitionId)
    (activation : Nat) (submittedValues : List VariableBinding)
    (undeclared : dataInputOutputTaskContract? program taskId = none) :
    completeDataInputOutputUserTask? program state processInstanceId taskId activation
      submittedValues = none := by
  unfold completeDataInputOutputUserTask?
  cases dataInputOutputRunningInstance? state <;> simp [undeclared]

/-- `ADIO-REFUSE-01`. A stale, absent, or duplicated matching task wait refuses universally. -/
theorem dataInputOutputMissingWaitRefusesCompletion (program : Program)
    (state : RuntimeState) (processInstanceId : SemanticId) (taskId : TaskDefinitionId)
    (activation : Nat) (submittedValues : List VariableBinding)
    (missing : dataInputOutputTaskWait? state processInstanceId taskId activation = none) :
    completeDataInputOutputUserTask? program state processInstanceId taskId activation
      submittedValues = none := by
  unfold completeDataInputOutputUserTask?
  cases dataInputOutputRunningInstance? state <;>
    cases dataInputOutputTaskContract? program taskId <;>
      simp [missing]

/-- `ADIO-REFUSE-01`. Missing, duplicate, or wrongly shaped input-local scope refuses completion. -/
theorem dataInputOutputInvalidLocalScopeRefusesCompletion (program : Program)
    (state : RuntimeState) (processInstanceId : SemanticId) (taskId : TaskDefinitionId)
    (activation : Nat) (submittedValues : List VariableBinding)
    (contract : DataInputOutputTaskContract) (task : UserTaskWait)
    (record : ActivityOccurrence)
    (declared : dataInputOutputTaskContract? program taskId = some contract)
    (live : dataInputOutputTaskWait? state processInstanceId taskId activation = some task)
    (joined : activityOccurrenceForTaskWait? state.activityOccurrences task = some record)
    (invalid : dataInputOutputLocalScope? (programPropertyPathValuePolicy program) state record contract.directInput = none) :
    completeDataInputOutputUserTask? program state processInstanceId taskId activation
      submittedValues = none := by
  unfold completeDataInputOutputUserTask?
  cases dataInputOutputRunningInstance? state <;>
    simp [declared, live, joined, invalid]

/-- `ADIO-REFUSE-01`. A record carrying any attached handler belongs to another semantic family. -/
theorem dataInputOutputAttachedHandlerRefusesCompletion (program : Program)
    (state : RuntimeState) (processInstanceId : SemanticId) (taskId : TaskDefinitionId)
    (activation : Nat) (submittedValues : List VariableBinding)
    (contract : DataInputOutputTaskContract) (task : UserTaskWait)
    (record : ActivityOccurrence) (scope : ActivityVariableScope)
    (declared : dataInputOutputTaskContract? program taskId = some contract)
    (live : dataInputOutputTaskWait? state processInstanceId taskId activation = some task)
    (joined : activityOccurrenceForTaskWait? state.activityOccurrences task = some record)
    (_scopeFound : dataInputOutputLocalScope? (programPropertyPathValuePolicy program) state record contract.directInput = some scope)
    (attached : record.attachedHandlers.isEmpty = false) :
    completeDataInputOutputUserTask? program state processInstanceId taskId activation
      submittedValues = none := by
  have handlersNotEmpty : record.attachedHandlers ≠ [] := by
    intro empty
    simp [empty] at attached
  unfold completeDataInputOutputUserTask?
  cases dataInputOutputRunningInstance? state <;>
    simp [declared, live, joined, handlersNotEmpty]

/-- `ADIO-ROUTE-01`. The direct association, not the submitted name, selects the Process binding
written by a successful completion. -/
theorem dataInputOutputCompletionWritesAssociatedProperty {program : Program}
    {state after : RuntimeState} {processInstanceId : SemanticId}
    {taskId : TaskDefinitionId} {activation : Nat}
    {submittedValues : List VariableBinding} {contract : DataInputOutputTaskContract}
    {filled : VariableBinding} {propertyId : String}
    (endpoint : contract.directOutput.target = .property propertyId)
    (declared : dataInputOutputTaskContract? program taskId = some contract)
    (available : filledDeclaredOutput? contract.directOutput submittedValues = some filled)
    (step : completeDataInputOutputUserTask? program state processInstanceId taskId activation
      submittedValues = some after) :
    after.variables.process.bindings = mergeProcessVariableBindings state.variables.process.bindings
      [associatedProcessBinding propertyId filled] := by
  obtain ⟨_, contract', filled', _, _, _, variables, _, declared', available', _, _, _, removed,
    _, _, _, written⟩ := dataInputOutputCompletionJoin step
  have sameContract : contract' = contract := Option.some.inj (declared'.symm.trans declared)
  subst sameContract
  have sameFilled : filled' = filled := Option.some.inj (available'.symm.trans available)
  subst sameFilled
  have processUnchanged : variables.process = state.variables.process :=
    removeActivityOccurrenceVariableScope_preserves_process removed
  simpa [associatedProcessBinding, processUnchanged] using
    (writeActivityDataOutput_property endpoint written).1

/-- `ADIO-ATOMIC-01`. Completion removes exactly the one joined local scope. -/
theorem dataInputOutputCompletionDisposesOneLocalScope {program : Program}
    {state after : RuntimeState} {processInstanceId : SemanticId}
    {taskId : TaskDefinitionId} {activation : Nat}
    {submittedValues : List VariableBinding}
    (step : completeDataInputOutputUserTask? program state processInstanceId taskId activation
      submittedValues = some after) :
    ∃ owner : ActivityOccurrenceId,
      (state.variables.activities.filter (activityOccurrenceScopeMatches owner)).length = 1 ∧
      after.variables.activities.filter (activityOccurrenceScopeMatches owner) = [] := by
  obtain ⟨_, _, _, _, record, _, _, _, _, _, _, _, _, removed, _, _, _, changed⟩ :=
    dataInputOutputCompletionJoin step
  obtain ⟨present, absent⟩ := removeActivityOccurrenceVariableScope_disposes removed
  refine ⟨activityOwnerForRecord record, present, ?_⟩
  rw [writeActivityDataOutput_preserves_activities changed]
  exact absent

/-- `ADIO-ATOMIC-01`. The same successful transition removes its exact wait and Activity record. -/
theorem dataInputOutputCompletionRemovesWaitAndActivity {program : Program}
    {state after : RuntimeState} {processInstanceId : SemanticId}
    {taskId : TaskDefinitionId} {activation : Nat}
    {submittedValues : List VariableBinding}
    (step : completeDataInputOutputUserTask? program state processInstanceId taskId activation
      submittedValues = some after) :
    ∃ task record,
      after.waits = state.waits.erase task ∧
      after.activityOccurrences = state.activityOccurrences.filter fun candidate =>
        !sameActivityOccurrence candidate record := by
  obtain ⟨_, _, _, task, record, _, _, _, _, _, _, _, _, _, _, waits, records, _⟩ :=
    dataInputOutputCompletionJoin step
  exact ⟨task, record, waits, records⟩

/-- Every successful composed completion is admitted by its declarative relation. -/
theorem completeDataInputOutputUserTask_sound (program : Program)
    (state after : RuntimeState) (processInstanceId : SemanticId)
    (taskId : TaskDefinitionId) (activation : Nat) (submittedValues : List VariableBinding)
    (step : completeDataInputOutputUserTask? program state processInstanceId taskId activation
      submittedValues = some after) : DataInputOutputCompletionStep program state after := by
  obtain ⟨instanceId, contract, filled, task, record, _, variables, running, declared, available,
    live, joined, _, removed, _, _, _, written⟩ := dataInputOutputCompletionJoin step
  exact .complete state instanceId processInstanceId taskId activation submittedValues contract
    filled task record variables (dataInputOutputRunningInstance_sound running) declared available
    live joined removed after step (writeActivityDataOutput_sound written)

/-- The successor's Activity record is the exact composed issuer record. -/
theorem activateDataInputOutputUserTask_activityOccurrences {state after : RuntimeState}
    {instanceId : SemanticId} {owner : ScopeOccurrenceId}
    {input output : ControlPlaceId} {taskId : TaskDefinitionId}
    {taskName : Option String} {directInput : DirectActivityDataInput}
    (owned : onlyTokenOwner? state input = some owner)
    (running : state.control = .running instanceId)
    (available : (dataInputOutputSourceBinding? policy state owner directInput).isSome = true)
    (step : activateDataInputOutputUserTask? policy state input output taskId taskName directInput =
      some after) :
    after.activityOccurrences =
      insertActivityOccurrence (dataInputOutputActivityRecord state owner.processInstanceId owner taskId)
        state.activityOccurrences := by
  have hosted : dataInputOutputRunningInstance? state = some instanceId := by
    simp [dataInputOutputRunningInstance?, running]
  unfold activateDataInputOutputUserTask? at step
  cases source : dataInputOutputSourceBinding? policy state owner directInput with
  | none => rw [source] at available; simp at available
  | some binding =>
      simp [owned, hosted, source] at step
      obtain ⟨_, rfl⟩ := step
      rfl

/-- `RSI-ISSUE-01`. Composed activation issues above the Activity-element high-water mark. -/
theorem activateDataInputOutputUserTask_issuesFreshActivity {state after : RuntimeState}
    {input output : ControlPlaceId} {taskId : TaskDefinitionId}
    {taskName : Option String} {directInput : DirectActivityDataInput}
    (step : activateDataInputOutputUserTask? policy state input output taskId taskName directInput =
      some after) :
    activityIdentityIssuingDiscipline state after = true := by
  unfold activateDataInputOutputUserTask? at step
  cases owned : onlyTokenOwner? state input with
  | none => simp [owned] at step
  | some owner =>
      cases running : dataInputOutputRunningInstance? state with
      | none => simp [owned, running] at step
      | some instanceId =>
          cases source : dataInputOutputSourceBinding? policy state owner directInput with
          | none => simp [owned, running, source] at step
          | some binding =>
              simp [owned, running, source] at step
              obtain ⟨_, rfl⟩ := step
              exact activityIdentityIssuingDiscipline_insertActivityOccurrence state
                (dataInputOutputActivityRecord state owner.processInstanceId owner taskId)
                (by simp [dataInputOutputActivityRecord])

/-- Completion only removes Activity records, so it issues no identity. -/
theorem completeDataInputOutputUserTask_activityIdentityDiscipline {program : Program}
    {before after : RuntimeState} {processInstanceId : SemanticId}
    {taskId : TaskDefinitionId} {activation : Nat}
    {submittedValues : List VariableBinding}
    (step : completeDataInputOutputUserTask? program before processInstanceId taskId activation
      submittedValues = some after) :
    activityIdentityIssuingDiscipline before after = true := by
  apply activityIdentityIssuingDiscipline_of_subset
  intro occurrence present
  obtain ⟨_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, retained, _⟩ :=
    dataInputOutputCompletionJoin step
  rw [retained] at present
  exact (List.mem_filter.mp present).1

/-- `AOO-CLAIM-01`. The composed issuer preserves unique Activity body claims under the same live
record and issued-count hypotheses as both predecessor issuers. -/
theorem activateDataInputOutputUserTask_preserves_activityBodyClaimsUnique
    {state after : RuntimeState} {instanceId : SemanticId} {owner : ScopeOccurrenceId}
    {input output : ControlPlaceId} {taskId : TaskDefinitionId}
    {taskName : Option String} {directInput : DirectActivityDataInput}
    (owned : onlyTokenOwner? state input = some owner)
    (running : state.control = .running instanceId)
    (available : (dataInputOutputSourceBinding? policy state owner directInput).isSome = true)
    (recordsOwn : activityRecordsOwnLiveWork state = true)
    (bounds : runtimeStateIdentityBound state = true)
    (claimsUnique : activityBodyClaimsUnique state.activityOccurrences = true)
    (step : activateDataInputOutputUserTask? policy state input output taskId taskName directInput =
      some after) :
    activityBodyClaimsUnique after.activityOccurrences = true := by
  have inserted := activateDataInputOutputUserTask_activityOccurrences owned running available step
  have disjoint : state.activityOccurrences.all
      (activityBodyClaimsDisjoint
        (dataInputOutputActivityRecord state owner.processInstanceId owner taskId)) = true := by
    simp only [List.all_eq_true]
    intro existing existingMem
    apply activityBodyClaimsDisjoint_userTask_of_not_mem
      (dataInputOutputActivityRecord state owner.processInstanceId owner taskId) existing
      { processInstanceId := owner.processInstanceId
        elementId := { value := taskId.value }
        activation := activationCount state taskId + 1 }
    intro claimed
    obtain ⟨candidate, candidateMem, names⟩ := activityBodyTaskClaim_has_live_wait state existing
      { processInstanceId := owner.processInstanceId
        elementId := { value := taskId.value }
        activation := activationCount state taskId + 1 }
      recordsOwn existingMem claimed
    simp only [runtimeStateIdentityBound, Bool.and_eq_true] at bounds
    have candidateBound := List.all_eq_true.mp bounds.1.1 candidate candidateMem
    simp only [decide_eq_true_eq] at candidateBound
    simp only [taskIdNamesWait, Bool.and_eq_true, beq_iff_eq] at names
    have taskEq : candidate.task.id = taskId := taskDefinitionId_eq_of_value names.1.2.symm
    rw [taskEq] at candidateBound
    omega
  have preserved := activityBodyClaimsUnique_insertActivityOccurrence
    (dataInputOutputActivityRecord state owner.processInstanceId owner taskId) state.activityOccurrences
    disjoint claimsUnique
  simpa [inserted] using preserved

/-- Removing the completed record cannot introduce a second body claimant. -/
theorem completeDataInputOutputUserTask_preserves_activityBodyClaimsUnique {program : Program}
    {before after : RuntimeState} {processInstanceId : SemanticId}
    {taskId : TaskDefinitionId} {activation : Nat}
    {submittedValues : List VariableBinding}
    (claimsUnique : activityBodyClaimsUnique before.activityOccurrences = true)
    (step : completeDataInputOutputUserTask? program before processInstanceId taskId activation
      submittedValues = some after) :
    activityBodyClaimsUnique after.activityOccurrences = true := by
  obtain ⟨_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, retained, _⟩ :=
    dataInputOutputCompletionJoin step
  rw [retained]
  exact activityBodyClaimsUnique_filter before.activityOccurrences _ claimsUnique


/-- CDATA-INPUT-01: the interface binding is copied under the Task input ID. Caller Properties are
unconstrained, so even a same-named caller value cannot supply or override the copied value. -/
theorem dataInputOutputActivationCopiesProcessInput
    {state after : RuntimeState} {host : SemanticId} {owner : ScopeOccurrenceId}
    {input output : ControlPlaceId} {taskId : TaskDefinitionId} {taskName : Option String}
    {directInput : DirectActivityDataInput} {port : String}
    {scope : ProcessInterfaceScope} {source : VariableBinding}
    (running : state.control = .running host)
    (owned : onlyTokenOwner? state input = some owner)
    (endpoint : directInput.source = .processDataInput port)
    (uniqueOwner : state.variables.processInterfaces.filter
      (fun candidate => decide (candidate.owner = owner)) = [scope])
    (uniquePort : scope.inputs.filter (fun candidate => decide (candidate.name = port)) = [source])
    (scalar : processInterfaceScalar source.value = true)
    (step : activateDataInputOutputUserTask? policy state input output taskId taskName directInput = some after) :
    activityOccurrenceVariableBindings after.variables
      (dataInputOutputActivityOwner state owner.processInstanceId taskId) =
        some [{ name := directInput.targetDataInputId, value := source.value }] := by
  have selected := selectProcessInterface_iff.mpr uniqueOwner
  have available : dataInputOutputSourceBinding? policy state owner directInput = some source := by
    rw [dataInputOutputSourceBinding?, readActivityDataInput_interface_exact endpoint]
    exact readProcessInterfaceInput_iff.mpr ⟨scope, selected, uniquePort, scalar⟩
  exact dataInputOutputActivationCopiesSelectedSourceExactly owned running available
    (activateDataInputOutputUserTask_localOwnerFresh running owned step) step

theorem dataInputOutputDuplicateInterfaceOwnerRefusesActivation
    {state : RuntimeState} {owner : ScopeOccurrenceId} {input output : ControlPlaceId}
    {taskId : TaskDefinitionId} {taskName : Option String} {directInput : DirectActivityDataInput}
    {port : String} {first second : ProcessInterfaceScope} {rest : List ProcessInterfaceScope}
    (owned : onlyTokenOwner? state input = some owner)
    (endpoint : directInput.source = .processDataInput port)
    (duplicates : state.variables.processInterfaces.filter (fun scope => decide (scope.owner = owner)) =
      first :: second :: rest) :
    activateDataInputOutputUserTask? policy state input output taskId taskName directInput = none := by
  have refused : dataInputOutputSourceBinding? policy state owner directInput = none :=
    readActivityDataInput_duplicate_interfaces_refused endpoint duplicates
  simp [activateDataInputOutputUserTask?, owned, refused]

theorem dataInputOutputCalledPropertyRefusesActivation
    {state : RuntimeState} {host : SemanticId} {owner : ScopeOccurrenceId}
    {input output : ControlPlaceId} {taskId : TaskDefinitionId} {taskName : Option String}
    {directInput : DirectActivityDataInput} {propertyId : String}
    (running : state.control = .running host) (called : owner.processInstanceId ≠ host)
    (owned : onlyTokenOwner? state input = some owner)
    (endpoint : directInput.source = .property propertyId) :
    activateDataInputOutputUserTask? policy state input output taskId taskName directInput = none := by
  have refused : dataInputOutputSourceBinding? policy state owner directInput = none :=
    readActivityDataInput_called_property_refused running called endpoint
  simp [activateDataInputOutputUserTask?, owned, refused]

/-- The predecessor Property-copy guarantee remains the root-owned specialization of typed copying. -/
theorem dataInputOutputActivationCopiesRootProperty
    {state after : RuntimeState} {owner : ScopeOccurrenceId}
    {input output : ControlPlaceId} {taskId : TaskDefinitionId} {taskName : Option String}
    {directInput : DirectActivityDataInput} {propertyId : String} {source : VariableBinding}
    (running : state.control = .running owner.processInstanceId)
    (owned : onlyTokenOwner? state input = some owner)
    (endpoint : directInput.source = .property propertyId)
    (unique : state.variables.process.bindings.filter
      (fun candidate => decide (candidate.name = propertyId)) = [source])
    (admitted : policy.admits source.value = true)
    (step : activateDataInputOutputUserTask? policy state input output taskId taskName directInput = some after) :
    activityOccurrenceVariableBindings after.variables
      (dataInputOutputActivityOwner state owner.processInstanceId taskId) =
        some [{ name := directInput.targetDataInputId, value := source.value }] := by
  exact dataInputOutputActivationCopiesSelectedSourceExactly owned running
    (readActivityDataInput_root_property running endpoint unique admitted)
    (activateDataInputOutputUserTask_localOwnerFresh running owned step) step

/-- CDATA-OUTPUT-01: completion writes the selected Process output and preserves caller Properties,
all interface inputs, and every other full owner. The submitted Task output name is not a target. -/
theorem dataInputOutputCompletionWritesProcessOutput
    {program : Program} {state after : RuntimeState} {processInstanceId : SemanticId}
    {taskId : TaskDefinitionId} {activation : Nat} {submittedValues : List VariableBinding}
    {contract : DataInputOutputTaskContract} {filled : VariableBinding} {task : UserTaskWait} {port : String}
    (endpoint : contract.directOutput.target = .processDataOutput port)
    (declared : dataInputOutputTaskContract? program taskId = some contract)
    (available : filledDeclaredOutput? contract.directOutput submittedValues = some filled)
    (live : dataInputOutputTaskWait? state processInstanceId taskId activation = some task)
    (step : completeDataInputOutputUserTask? program state processInstanceId taskId activation
      submittedValues = some after) :
    after.variables.process = state.variables.process ∧
      readProcessInterfaceOutput? after.variables task.owner port =
        some { name := port, value := filled.value } ∧
      after.variables.processInterfaces.map (fun scope => (scope.owner, scope.inputs)) =
        state.variables.processInterfaces.map (fun scope => (scope.owner, scope.inputs)) ∧
      after.variables.processInterfaces.filter (fun scope => decide (scope.owner ≠ task.owner)) =
        state.variables.processInterfaces.filter (fun scope => decide (scope.owner ≠ task.owner)) := by
  obtain ⟨_, contract', filled', task', _, _, variables, _, declared', available', live', _, _, removed,
    _, _, _, written⟩ := dataInputOutputCompletionJoin step
  have sameContract : contract' = contract := Option.some.inj (declared'.symm.trans declared)
  subst sameContract
  have sameFilled : filled' = filled := Option.some.inj (available'.symm.trans available)
  subst sameFilled
  have sameTask : task' = task := Option.some.inj (live'.symm.trans live)
  subst sameTask
  have interfaceWrite := writeActivityDataOutput_interface_evaluator endpoint written
  have interfaceFrame := activityDataLocalRemoval_preserves_processInterfaces removed
  refine ⟨(writeActivityDataOutput_interface_preserves_caller endpoint written).trans
    (removeActivityOccurrenceVariableScope_preserves_process removed),
    writeProcessInterfaceOutput_available interfaceWrite, ?_, ?_⟩
  · rw [writeProcessInterfaceOutput_preserves_all_inputs interfaceWrite, interfaceFrame]
  · rw [writeProcessInterfaceOutput_frames_others interfaceWrite, interfaceFrame]

theorem dataInputOutputRoutingRefusalPreventsCompletion
    {program : Program} {state : RuntimeState} {processInstanceId : SemanticId}
    {taskId : TaskDefinitionId} {activation : Nat} {submittedValues : List VariableBinding}
    {contract : DataInputOutputTaskContract} {filled : VariableBinding}
    {task : UserTaskWait} {record : ActivityOccurrence} {variables : ScopedVariables}
    (declared : dataInputOutputTaskContract? program taskId = some contract)
    (available : filledDeclaredOutput? contract.directOutput submittedValues = some filled)
    (live : dataInputOutputTaskWait? state processInstanceId taskId activation = some task)
    (joined : activityOccurrenceForTaskWait? state.activityOccurrences task = some record)
    (removed : removeActivityOccurrenceVariableScope state.variables (activityOwnerForRecord record) =
      some variables)
    (refused : writeActivityDataOutput? (programPropertyPathValuePolicy program) state task.owner variables contract.directOutput filled = none) :
    completeDataInputOutputUserTask? program state processInstanceId taskId activation submittedValues = none := by
  simp [completeDataInputOutputUserTask?, declared, available, live, joined, removed, refused]


theorem dataInputOutputActivationPreservesProcessInterfaces {state after : RuntimeState}
    {input output : ControlPlaceId} {taskId : TaskDefinitionId}
    {taskName : Option String} {directInput : DirectActivityDataInput}
    (step : activateDataInputOutputUserTask? policy state input output taskId taskName directInput = some after) :
    after.variables.processInterfaces = state.variables.processInterfaces := by
  unfold activateDataInputOutputUserTask? at step
  cases owned : onlyTokenOwner? state input with
  | none => simp [owned] at step
  | some owner =>
      cases running : dataInputOutputRunningInstance? state with
      | none => simp [owned, running] at step
      | some instanceId =>
          cases source : dataInputOutputSourceBinding? policy state owner directInput with
          | none => simp [owned, running, source] at step
          | some binding =>
              simp [owned, running, source] at step
              obtain ⟨_, rfl⟩ := step
              rfl

/-- The original unavailable-Property guarantee needs no ownership premise: no endpoint owner can
make an unavailable caller Property available. The Process-input alternative is a separate rule. -/
theorem dataInputOutputUnavailablePropertyRefusesActivation (state : RuntimeState)
    (input output : ControlPlaceId) (taskId : TaskDefinitionId)
    (taskName : Option String) (directInput : DirectActivityDataInput) (propertyId : String)
    (endpoint : directInput.source = .property propertyId)
    (unavailable : dataInputSourceBinding? state directInput = none) :
    activateDataInputOutputUserTask? policy state input output taskId taskName directInput = none := by
  apply dataInputOutputUnavailableSourceRefusesActivation
  intro owner
  unfold dataInputSourceBinding? at unavailable
  simp only [endpoint] at unavailable
  unfold dataInputOutputSourceBinding? readActivityDataInput?
  simp only [endpoint]
  split
  · split at unavailable <;> simp_all
  · rfl

/-- CDATA-OUTPUT-01 preserves caller Properties for Process outputs; a Property endpoint has one
replacement admitted by the Program's Property-path policy. This sum keeps predecessor Property invariants valid for either direction. -/
theorem dataInputOutputCompletionProcessEffect {program : Program} {before after : RuntimeState}
    {instanceId : SemanticId} {taskId : TaskDefinitionId} {activation : Nat}
    {bindings : List VariableBinding}
    (completed : completeDataInputOutputUserTask? program before instanceId taskId activation
      bindings = some after) :
    after.variables.process = before.variables.process ∨ ∃ written : VariableBinding,
      (programPropertyPathValuePolicy program).admits written.value = true ∧
      after.variables.process.bindings = mergeProcessVariableBindings
        before.variables.process.bindings [written] := by
  obtain ⟨_, contract, filled, _, _, _, variables, _, declared, supplied, _, _, _, removed,
    _, _, _, written⟩ := dataInputOutputCompletionJoin completed
  cases endpoint : contract.directOutput.target with
  | property propertyId =>
      have admitted := (writeActivityDataOutput_sound written).1
      simp only [activityDataOutputValueAdmitted, endpoint] at admitted
      exact Or.inr ⟨associatedProcessBinding propertyId filled, admitted,
        dataInputOutputCompletionWritesAssociatedProperty endpoint declared supplied completed⟩
  | processDataOutput port =>
      exact Or.inl ((writeActivityDataOutput_interface_preserves_caller endpoint written).trans
        (removeActivityOccurrenceVariableScope_preserves_process removed))

end BpmnSemantics.SemanticProcess
