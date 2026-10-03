import BpmnSemantics.SemanticProcess.ActivityDataInputOutputRuntime
import BpmnSemantics.SemanticProcess.ActivityBodyClaimWriterPreservation
import BpmnSemantics.SemanticProcess.RuntimeStateWellFormed

/-! # Composed Activity data relations and laws

The runtime owner supplies the atomic evaluators; these relations and laws retain the composed
Activity contract independently of its module placement.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

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
      have selected : wait ∈ state.waits.filter fun candidate =>
          decide (candidate.processInstanceId = processInstanceId) &&
            decide (candidate.task.id = taskId) && decide (candidate.activation = activation) := by
        rw [singleton]
        simp
      obtain ⟨member, keyFacts⟩ := List.mem_filter.mp selected
      simp only [Bool.and_eq_true, decide_eq_true_eq] at keyFacts
      exact ⟨member, keyFacts.1.1, keyFacts.1.2, keyFacts.2⟩
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
      (source : (dataInputOutputSourceBinding? before directInput).isSome = true)
      (after : RuntimeState)
      (step : activateDataInputOutputUserTask? before input output taskId taskName
        directInput = some after) :
      DataInputOutputActivationStep program before after

/-- `ADIO-ATOMIC-01` as a relation. Its premises expose both program-owned associations and every
runtime join that must leave together. -/
inductive DataInputOutputCompletionStep (program : Program) :
    RuntimeState → RuntimeState → Prop where
  | complete (before : RuntimeState) (instanceId processInstanceId : SemanticId)
      (taskId : TaskDefinitionId) (activation : Nat)
      (submittedValues : List VariableBinding)
      (contract : DataInputOutputTaskContract) (filled : VariableBinding)
      (running : before.control = .running instanceId)
      (declared : dataInputOutputTaskContract? program taskId = some contract)
      (available : filledDeclaredOutput? contract.directOutput submittedValues = some filled)
      (live : (dataInputOutputTaskWait? before processInstanceId taskId activation).isSome = true)
      (after : RuntimeState)
      (step : completeDataInputOutputUserTask? program before processInstanceId taskId
        activation submittedValues = some after)
      (routed : after.variables.process.bindings =
        mergeProcessVariableBindings before.variables.process.bindings
          [associatedProcessBinding contract.directOutput filled]) :
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
    (unavailable : dataInputOutputSourceBinding? state directInput = none) :
    activateDataInputOutputUserTask? state input output taskId taskName directInput = none := by
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
    (success : activateDataInputOutputUserTask? before input output taskId taskName
      directInput = some after) :
    DataInputOutputActivationStep program before after := by
  have available : (dataInputOutputSourceBinding? before directInput).isSome = true := by
    cases source : dataInputOutputSourceBinding? before directInput with
    | none =>
        rw [dataInputOutputUnavailableSourceRefusesActivation before input output taskId taskName
          directInput source] at success
        simp at success
    | some _ => simp
  have hosted : ∃ instanceId, dataInputOutputRunningInstance? before = some instanceId := by
    cases running : dataInputOutputRunningInstance? before with
    | none =>
        unfold activateDataInputOutputUserTask? at success
        cases owned : onlyTokenOwner? before input with
        | none => simp [owned] at success
        | some owner => simp [owned, running] at success
    | some instanceId => exact ⟨instanceId, rfl⟩
  obtain ⟨instanceId, running⟩ := hosted
  exact .activate before instanceId id origin input output taskId taskName directInput directOutput
    declared (dataInputOutputRunningInstance_sound running) available after success

/-- `ADIO-PRESERVE-01`. Activation copies into local scope without changing Process scope. -/
theorem dataInputOutputActivationPreservesProcessScope {state after : RuntimeState}
    {input output : ControlPlaceId} {taskId : TaskDefinitionId}
    {taskName : Option String} {directInput : DirectActivityDataInput}
    (step : activateDataInputOutputUserTask? state input output taskId taskName directInput =
      some after) :
    after.variables.process = state.variables.process := by
  unfold activateDataInputOutputUserTask? at step
  cases owned : onlyTokenOwner? state input with
  | none => simp [owned] at step
  | some owner =>
      cases running : dataInputOutputRunningInstance? state with
      | none => simp [owned, running] at step
      | some instanceId =>
          cases source : dataInputOutputSourceBinding? state directInput with
          | none => simp [owned, running, source] at step
          | some binding =>
              simp [owned, running, source] at step
              obtain ⟨_, rfl⟩ := step
              rfl

/-- The complete Activity occurrence identity minted by one composed activation. -/
def dataInputOutputActivityOwner (state : RuntimeState) (instanceId : SemanticId)
    (taskId : TaskDefinitionId) : ActivityOccurrenceId :=
  { processInstanceId := instanceId
    activityElementId := ⟨taskId.value⟩
    activation := activityActivationCount state taskId + 1 }

/-- An existing local scope for the next Activity identity refuses activation instead of creating an
ambiguous second owner. -/
theorem dataInputOutputExistingLocalOwnerRefusesActivation (state : RuntimeState)
    (instanceId : SemanticId) (input output : ControlPlaceId) (taskId : TaskDefinitionId)
    (taskName : Option String) (directInput : DirectActivityDataInput)
    (running : state.control = .running instanceId)
    (present : state.variables.activities.any
      (activityOccurrenceScopeMatches (dataInputOutputActivityOwner state instanceId taskId)) = true) :
    activateDataInputOutputUserTask? state input output taskId taskName directInput = none := by
  unfold activateDataInputOutputUserTask?
  have hosted := dataInputOutputRunningInstance_of_running running
  cases owned : onlyTokenOwner? state input with
  | none => simp
  | some owner =>
      cases source : dataInputOutputSourceBinding? state directInput with
      | none => simp [hosted]
      | some binding =>
          have present' : state.variables.activities.any (activityOccurrenceScopeMatches
              { processInstanceId := instanceId
                activityElementId := ⟨taskId.value⟩
                activation := activityActivationCount state taskId + 1 }) = true := by
            simpa [dataInputOutputActivityOwner] using present
          simp [hosted]
          exact List.any_eq_true.mp present'

/-- Every successful activation obtains local-owner freshness from the evaluator's fail-closed join. -/
theorem activateDataInputOutputUserTask_localOwnerFresh {state after : RuntimeState}
    {instanceId : SemanticId} {input output : ControlPlaceId} {taskId : TaskDefinitionId}
    {taskName : Option String} {directInput : DirectActivityDataInput}
    (running : state.control = .running instanceId)
    (step : activateDataInputOutputUserTask? state input output taskId taskName directInput =
      some after) :
    ∀ scope ∈ state.variables.activities,
      activityOccurrenceScopeMatches
        (dataInputOutputActivityOwner state instanceId taskId) scope = false := by
  unfold activateDataInputOutputUserTask? at step
  have hosted := dataInputOutputRunningInstance_of_running running
  cases owned : onlyTokenOwner? state input with
  | none => simp [owned] at step
  | some owner =>
      cases source : dataInputOutputSourceBinding? state directInput with
      | none => simp [owned, hosted, source] at step
      | some binding =>
          simp [owned, hosted, source] at step
          exact step.1

/-- The exact Activity record inserted by one composed activation. -/
def dataInputOutputActivityRecord (state : RuntimeState) (instanceId : SemanticId)
    (owner : ScopeOccurrenceId) (taskId : TaskDefinitionId) : ActivityOccurrence :=
  { processInstanceId := instanceId
    activityElementId := ⟨taskId.value⟩
    activation := activityActivationCount state taskId + 1
    owner
    body := .userTask
      { processInstanceId := instanceId
        elementId := ⟨taskId.value⟩
        activation := activationCount state taskId + 1 }
    attachedHandlers := [] }

/-- `ADIO-SCOPE-01`. The selected activation-time source is copied exactly once into the newly
minted Activity owner. -/
theorem dataInputOutputActivationCopiesSelectedSourceExactly {state after : RuntimeState}
    {instanceId : SemanticId} {input output : ControlPlaceId}
    {taskId : TaskDefinitionId} {taskName : Option String}
    {directInput : DirectActivityDataInput} {source : VariableBinding}
    (running : state.control = .running instanceId)
    (available : dataInputOutputSourceBinding? state directInput = some source)
    (fresh : ∀ scope ∈ state.variables.activities,
      activityOccurrenceScopeMatches (dataInputOutputActivityOwner state instanceId taskId)
        scope = false)
    (step : activateDataInputOutputUserTask? state input output taskId taskName directInput =
      some after) :
    activityOccurrenceVariableBindings after.variables
        (dataInputOutputActivityOwner state instanceId taskId) =
      some [{ name := directInput.targetDataInputId, value := source.value }] := by
  unfold activateDataInputOutputUserTask? at step
  have hosted : dataInputOutputRunningInstance? state = some instanceId := by
    simp [dataInputOutputRunningInstance?, running]
  cases owned : onlyTokenOwner? state input with
  | none => simp [owned] at step
  | some owner =>
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
    {instanceId : SemanticId} {input output : ControlPlaceId}
    {taskId : TaskDefinitionId} {taskName : Option String}
    {directInput : DirectActivityDataInput} {source : VariableBinding}
    (running : state.control = .running instanceId)
    (available : dataInputOutputSourceBinding? state directInput = some source)
    (fresh : ∀ scope ∈ state.variables.activities,
      activityOccurrenceScopeMatches (dataInputOutputActivityOwner state instanceId taskId)
        scope = false)
    (step : activateDataInputOutputUserTask? state input output taskId taskName directInput =
      some after) :
    dataInputOutputExactOneScope after
      (dataInputOutputActivityOwner state instanceId taskId) directInput := by
  refine ⟨{ name := directInput.targetDataInputId, value := source.value }, ?_, rfl⟩
  unfold activateDataInputOutputUserTask? at step
  have hosted : dataInputOutputRunningInstance? state = some instanceId := by
    simp [dataInputOutputRunningInstance?, running]
  cases owned : onlyTokenOwner? state input with
  | none => simp [owned] at step
  | some owner =>
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
      dataInputOutputLocalScope? state record contract.directInput = some scope ∧
      removeActivityOccurrenceVariableScope state.variables (activityOwnerForRecord record) =
        some variables ∧
      record.attachedHandlers.isEmpty = true ∧
      after.waits = state.waits.erase task ∧
      after.activityOccurrences =
        state.activityOccurrences.filter (fun candidate =>
          !sameActivityOccurrence candidate record) ∧
      after.variables =
        { variables with
          process :=
            { bindings := mergeProcessVariableBindings variables.process.bindings
                [associatedProcessBinding contract.directOutput filled] } } := by
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
                      · cases scopeFound : dataInputOutputLocalScope? state record
                            contract.directInput with
                        | none =>
                            simp [running, declared, available, live, joined, joinValid, scopeFound]
                              at step
                        | some scope =>
                            cases removed : removeActivityOccurrenceVariableScope state.variables
                                (activityOwnerForRecord record) with
                            | none =>
                                simp [running, declared, live, joined, removed] at step
                            | some variables =>
                                simp [running, declared, available, live, joined, joinValid,
                                  scopeFound, removed] at step
                                obtain ⟨handlers, changed⟩ := step
                                cases changed
                                exact ⟨instanceId, contract, filled, task, record, scope, variables,
                                  rfl, rfl, available, rfl, joined, scopeFound, removed,
                                  (by simpa using handlers), rfl, rfl, rfl⟩

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
    (invalid : dataInputOutputLocalScope? state record contract.directInput = none) :
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
    (_scopeFound : dataInputOutputLocalScope? state record contract.directInput = some scope)
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
    {filled : VariableBinding}
    (declared : dataInputOutputTaskContract? program taskId = some contract)
    (available : filledDeclaredOutput? contract.directOutput submittedValues = some filled)
    (step : completeDataInputOutputUserTask? program state processInstanceId taskId activation
      submittedValues = some after) :
    after.variables.process.bindings =
      mergeProcessVariableBindings state.variables.process.bindings
        [associatedProcessBinding contract.directOutput filled] := by
  obtain ⟨_, contract', filled', _, _, _, variables, _, declared', available', _, _, _, removed,
    _, _, _, changed⟩ := dataInputOutputCompletionJoin step
  have sameContract : contract' = contract := Option.some.inj (declared'.symm.trans declared)
  subst sameContract
  have sameFilled : filled' = filled := Option.some.inj (available'.symm.trans available)
  subst sameFilled
  have processUnchanged : variables.process = state.variables.process :=
    removeActivityOccurrenceVariableScope_preserves_process removed
  rw [changed]
  simp [processUnchanged]

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
  rw [changed]
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
    (taskId : TaskDefinitionId) (activation : Nat)
    (submittedValues : List VariableBinding)
    (step : completeDataInputOutputUserTask? program state processInstanceId taskId activation
      submittedValues = some after) :
    DataInputOutputCompletionStep program state after := by
  obtain ⟨instanceId, contract, filled, _, _, _, _, running, declared, available, live, _, _, _,
    _, _, _, _⟩ := dataInputOutputCompletionJoin step
  exact .complete state instanceId processInstanceId taskId activation submittedValues contract
    filled (dataInputOutputRunningInstance_sound running) declared available (by simp [live]) after
    step (dataInputOutputCompletionWritesAssociatedProperty declared available step)

/-- The successor's Activity record is the exact composed issuer record. -/
theorem activateDataInputOutputUserTask_activityOccurrences {state after : RuntimeState}
    {instanceId : SemanticId} {owner : ScopeOccurrenceId}
    {input output : ControlPlaceId} {taskId : TaskDefinitionId}
    {taskName : Option String} {directInput : DirectActivityDataInput}
    (owned : onlyTokenOwner? state input = some owner)
    (running : state.control = .running instanceId)
    (available : (dataInputOutputSourceBinding? state directInput).isSome = true)
    (step : activateDataInputOutputUserTask? state input output taskId taskName directInput =
      some after) :
    after.activityOccurrences =
      insertActivityOccurrence (dataInputOutputActivityRecord state instanceId owner taskId)
        state.activityOccurrences := by
  have hosted : dataInputOutputRunningInstance? state = some instanceId := by
    simp [dataInputOutputRunningInstance?, running]
  unfold activateDataInputOutputUserTask? at step
  cases source : dataInputOutputSourceBinding? state directInput with
  | none => rw [source] at available; simp at available
  | some binding =>
      simp [owned, hosted, source] at step
      obtain ⟨_, rfl⟩ := step
      rfl

/-- `RSI-ISSUE-01`. Composed activation issues above the Activity-element high-water mark. -/
theorem activateDataInputOutputUserTask_issuesFreshActivity {state after : RuntimeState}
    {input output : ControlPlaceId} {taskId : TaskDefinitionId}
    {taskName : Option String} {directInput : DirectActivityDataInput}
    (step : activateDataInputOutputUserTask? state input output taskId taskName directInput =
      some after) :
    activityIdentityIssuingDiscipline state after = true := by
  unfold activateDataInputOutputUserTask? at step
  cases owned : onlyTokenOwner? state input with
  | none => simp [owned] at step
  | some owner =>
      cases running : dataInputOutputRunningInstance? state with
      | none => simp [owned, running] at step
      | some instanceId =>
          cases source : dataInputOutputSourceBinding? state directInput with
          | none => simp [owned, running, source] at step
          | some binding =>
              simp [owned, running, source] at step
              obtain ⟨_, rfl⟩ := step
              exact activityIdentityIssuingDiscipline_insertActivityOccurrence state
                (dataInputOutputActivityRecord state instanceId owner taskId)
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
    (available : (dataInputOutputSourceBinding? state directInput).isSome = true)
    (recordsOwn : activityRecordsOwnLiveWork state = true)
    (bounds : runtimeStateIdentityBound state = true)
    (claimsUnique : activityBodyClaimsUnique state.activityOccurrences = true)
    (step : activateDataInputOutputUserTask? state input output taskId taskName directInput =
      some after) :
    activityBodyClaimsUnique after.activityOccurrences = true := by
  have inserted := activateDataInputOutputUserTask_activityOccurrences owned running available step
  have disjoint : state.activityOccurrences.all
      (activityBodyClaimsDisjoint
        (dataInputOutputActivityRecord state instanceId owner taskId)) = true := by
    simp only [List.all_eq_true]
    intro existing existingMem
    apply activityBodyClaimsDisjoint_userTask_of_not_mem
      (dataInputOutputActivityRecord state instanceId owner taskId) existing
      { processInstanceId := instanceId
        elementId := { value := taskId.value }
        activation := activationCount state taskId + 1 }
    intro claimed
    obtain ⟨candidate, candidateMem, names⟩ := activityBodyTaskClaim_has_live_wait state existing
      { processInstanceId := instanceId
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
    (dataInputOutputActivityRecord state instanceId owner taskId) state.activityOccurrences
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

end BpmnSemantics.SemanticProcess
