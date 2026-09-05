import BpmnSemantics.SemanticProcess.ActivityBodyClaimWriterPreservation
import BpmnSemantics.SemanticProcess.RuntimeStateWellFormed

/-! # Composed direct Activity data input and output

This module owns one User Task lifetime that copies a required Process input at activation and
routes one required submitted output at completion. The two halves are deliberately not evaluated
as their predecessor transitions in sequence: doing that would mint two task occurrences, two
Activity records, and two local scopes for one BPMN Activity.

The local scope therefore contains only the copied `DataInput` for the complete active lifetime.
The `DataOutput` exists only in the accepted completion command; its direct association writes the
value to Process scope in the same transition that removes the wait, Activity record, and that one
input-bearing scope.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

private def dataInputOutputRunningInstance? (state : RuntimeState) : Option SemanticId :=
  match state.control with
  | .running instanceId => some instanceId
  | _ => none

/-- `ADIO-READY-01` and `ADIO-SCOPE-01`. Activate one composed Activity only after selecting one
exact Process input binding, and create its wait, record, and sole input-bearing local scope
atomically. -/
def activateDataInputOutputUserTask? (state : RuntimeState)
    (input output : ControlPlaceId) (taskId : TaskDefinitionId)
    (taskName : Option String) (directInput : DirectActivityDataInput) :
    Option RuntimeState := do
  let owner ← onlyTokenOwner? state input
  let instanceId ← dataInputOutputRunningInstance? state
  let source ← dataInputSourceBinding? state directInput
  let taskActivation := activationCount state taskId + 1
  let activityActivation := activityActivationCount state taskId + 1
  let activityOwner : ActivityOccurrenceId :=
    { processInstanceId := instanceId
      activityElementId := ⟨taskId.value⟩
      activation := activityActivation }
  pure
    { state with
      tokens := removeToken state.tokens input owner
      waits := insertUserTaskWait
        { processInstanceId := instanceId
          owner
          task := { id := taskId, name := taskName }
          activation := taskActivation
          output
          metadata := none } state.waits
      activations := setActivationCount state.activations taskId taskActivation
      activityOccurrences := insertActivityOccurrence
        { processInstanceId := instanceId
          activityElementId := ⟨taskId.value⟩
          activation := activityActivation
          owner
          body := .userTask
            { processInstanceId := instanceId
              elementId := ⟨taskId.value⟩
              activation := taskActivation }
          attachedHandlers := [] } state.activityOccurrences
      activityActivations :=
        { taskId, count := activityActivation } ::
          state.activityActivations.filter fun value => decide (value.taskId ≠ taskId)
      variables := addActivityOccurrenceVariableScope state.variables activityOwner
        [{ name := directInput.targetDataInputId, value := source.value }] }

/-- Both immutable data contracts belonging to one composed task declaration. -/
structure DataInputOutputTaskContract where
  taskId : TaskDefinitionId
  directInput : DirectActivityDataInput
  directOutput : DirectActivityDataOutput
  deriving Repr, DecidableEq

/-- Every composed Activity-data operation, projected to its task and both direct associations. -/
def dataInputOutputTaskContracts (program : Program) :
    List DataInputOutputTaskContract :=
  program.operations.filterMap fun
    | .awaitDataInputOutputUserTask _ _ _ _ taskId _ directInput directOutput =>
        some { taskId, directInput, directOutput }
    | _ => none

/-- The unique composed declaration for one task, or `none` for absent or ambiguous definitions. -/
def dataInputOutputTaskContract? (program : Program) (taskId : TaskDefinitionId) :
    Option DataInputOutputTaskContract :=
  match (dataInputOutputTaskContracts program).filter fun contract =>
      decide (contract.taskId = taskId) with
  | [contract] => some contract
  | _ => none

def isDataInputOutputTaskDefinition (program : Program) (taskId : TaskDefinitionId) : Bool :=
  (dataInputOutputTaskContract? program taskId).isSome

/-- The unique wait named by the complete task occurrence identity. Duplicate matching waits are
refused rather than resolved by list order. -/
def dataInputOutputTaskWait? (state : RuntimeState) (processInstanceId : SemanticId)
    (taskId : TaskDefinitionId) (activation : Nat) : Option UserTaskWait :=
  match state.waits.filter fun wait =>
      decide (wait.processInstanceId = processInstanceId) &&
        decide (wait.task.id = taskId) && decide (wait.activation = activation) with
  | [wait] => some wait
  | _ => none

private def activityOwnerForRecord (record : ActivityOccurrence) : ActivityOccurrenceId :=
  { processInstanceId := record.processInstanceId
    activityElementId := ⟨record.activityElementId.value⟩
    activation := record.activation }

/-- The one Activity-local scope a composed task may carry. The value is intentionally not compared
with current Process data: the scope is the activation-time copy, while later independent Process
transitions may change the source Property. -/
def dataInputOutputLocalScope? (state : RuntimeState) (record : ActivityOccurrence)
    (directInput : DirectActivityDataInput) : Option ActivityVariableScope :=
  match state.variables.activities.filter
      (activityOccurrenceScopeMatches (activityOwnerForRecord record)) with
  | [scope] =>
      match scope.bindings with
      | [binding] =>
          if binding.name = directInput.targetDataInputId then some scope else none
      | _ => none
  | _ => none

/-- `ADIO-ATOMIC-01`. Validate the declaration, submitted output, exact wait/record/scope join, and
absence of attached handlers before routing the output and disposing that same joined lifetime in
one successor. -/
def completeDataInputOutputUserTask? (program : Program) (state : RuntimeState)
    (processInstanceId : SemanticId) (taskId : TaskDefinitionId) (activation : Nat)
    (submittedValues : List VariableBinding) : Option RuntimeState := do
  let _ ← dataInputOutputRunningInstance? state
  let contract ← dataInputOutputTaskContract? program taskId
  let filled ← filledDeclaredOutput? contract.directOutput submittedValues
  let task ← dataInputOutputTaskWait? state processInstanceId taskId activation
  let record ← activityOccurrenceForTaskWait? state.activityOccurrences task
  let _ ← dataInputOutputLocalScope? state record contract.directInput
  let variables ← removeActivityOccurrenceVariableScope state.variables
    (activityOwnerForRecord record)
  if record.attachedHandlers.isEmpty then
    pure
      { state with
        waits := state.waits.erase task
        tokens := addToken state.tokens task.output task.owner
        activityOccurrences := state.activityOccurrences.filter fun candidate =>
          !sameActivityOccurrence candidate record
        variables :=
          { variables with
            process :=
              { bindings := mergeProcessVariableBindings variables.process.bindings
                  [associatedProcessBinding contract.directOutput filled] } } }
  else
    none

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
      (source : (dataInputSourceBinding? before directInput).isSome = true)
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

/-- `ADIO-READY-01`. Missing or ambiguous required Process input universally refuses activation. -/
theorem dataInputOutputUnavailableSourceRefusesActivation (state : RuntimeState)
    (input output : ControlPlaceId) (taskId : TaskDefinitionId)
    (taskName : Option String) (directInput : DirectActivityDataInput)
    (unavailable : dataInputSourceBinding? state directInput = none) :
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
  have available : (dataInputSourceBinding? before directInput).isSome = true := by
    cases source : dataInputSourceBinding? before directInput with
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
          cases source : dataInputSourceBinding? state directInput with
          | none => simp [owned, running, source] at step
          | some binding => simp [owned, running, source] at step; cases step; rfl

/-- The complete Activity occurrence identity minted by one composed activation. -/
def dataInputOutputActivityOwner (state : RuntimeState) (instanceId : SemanticId)
    (taskId : TaskDefinitionId) : ActivityOccurrenceId :=
  { processInstanceId := instanceId
    activityElementId := ⟨taskId.value⟩
    activation := activityActivationCount state taskId + 1 }

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
    (available : dataInputSourceBinding? state directInput = some source)
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
      cases step
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
    (available : dataInputSourceBinding? state directInput = some source)
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
      cases step
      simp only [dataInputOutputActivityOwner] at fresh
      simp only [addActivityOccurrenceVariableScope, dataInputOutputActivityOwner]
      exact filter_insertActivityVariableScope_eq_singleton _ _
        (by simp [activityOccurrenceScopeMatches, localDataOwnerMatches]) fresh

private theorem dataInputOutputCompletionJoin {program : Program} {state after : RuntimeState}
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
                      cases scopeFound : dataInputOutputLocalScope? state record contract.directInput with
                      | none => simp [running, declared, available, live, joined, scopeFound] at step
                      | some scope =>
                          cases removed : removeActivityOccurrenceVariableScope state.variables
                              (activityOwnerForRecord record) with
                          | none =>
                              simp [running, declared, live, joined, removed]
                                at step
                          | some variables =>
                              simp [running, declared, available, live, joined, scopeFound, removed]
                                at step
                              obtain ⟨handlers, changed⟩ := step
                              cases changed
                              exact ⟨instanceId, contract, filled, task, record, scope, variables,
                                rfl, rfl, available, rfl, joined, scopeFound, removed,
                                (by simpa using handlers),
                                rfl, rfl, rfl⟩

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
    (available : (dataInputSourceBinding? state directInput).isSome = true)
    (step : activateDataInputOutputUserTask? state input output taskId taskName directInput =
      some after) :
    after.activityOccurrences =
      insertActivityOccurrence (dataInputOutputActivityRecord state instanceId owner taskId)
        state.activityOccurrences := by
  have hosted : dataInputOutputRunningInstance? state = some instanceId := by
    simp [dataInputOutputRunningInstance?, running]
  unfold activateDataInputOutputUserTask? at step
  cases source : dataInputSourceBinding? state directInput with
  | none => rw [source] at available; simp at available
  | some binding => simp [owned, hosted, source] at step; cases step; rfl

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
          cases source : dataInputSourceBinding? state directInput with
          | none => simp [owned, running, source] at step
          | some binding =>
              simp [owned, running, source] at step
              cases step
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
    (available : (dataInputSourceBinding? state directInput).isSome = true)
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
