import BpmnSemantics.SemanticProcess.WaitActivation
import BpmnSemantics.SemanticProcess.ActivityOccurrence

/-! # Direct Activity data output

This module owns the token-only activation of one User Task whose accepted completion writes a direct Activity data output, the completion that fills the declared output and executes its association, and the program predicate routing an arriving completion into this family. It owns no stimulus admission, no closure, and no scenario projection.

BPMN 2.0.2 Clause 10.4.1 places an Activity's output Data Associations after its work completes. That is the whole difference from the sibling input family: nothing here constrains entry, and the declared `OutputSet` becomes an obligation only when a completion arrives. Reusing the input family's activation would therefore be wrong rather than merely redundant, because it would make a declared output delay an Activity the standard lets start.

Availability of the single required output is decided entirely by the command's shape in this slice, so the fill and the requirement fail together. They are kept as separate steps regardless, because the association is what routes the value: the submitted name identifies the `DataOutput` inside the Activity and the association alone decides which Process `Property` receives it.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

private def dataOutputRunningInstance? (state : RuntimeState) :
    Option SemanticId :=
  match state.control with
  | .running instanceId => some instanceId
  | _ => none

/-- `ADOUTPUT-ENTRY-01`. Consumes the incoming token and produces the task occurrence, its Activity record, and an empty occurrence-owned scope.

Deliberately reads no Process binding. The scope stays empty for the occurrence's whole lifetime: `ADOUTPUT-ATOMIC-01` fuses the fill with the association, so the submitted value reaches Process scope under the associated Property's id without ever being materialized here. Creating the container at entry rather than at completion is still what gives the Activity one lifetime rather than two, and it is the container later coverage needs when a construct finally has to read an output between its production and its copy. -/
def activateDataOutputUserTask? (state : RuntimeState) (input output : ControlPlaceId)
    (taskId : TaskDefinitionId) (taskName : Option String) :
    Option RuntimeState := do
  let owner ← onlyTokenOwner? state input
  let instanceId ← dataOutputRunningInstance? state
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
          state.activityActivations.filter fun value =>
            decide (value.taskId ≠ taskId)
      variables := addActivityOccurrenceVariableScope state.variables
        activityOwner [] }

/-- Every committed data-output entry operation, projected to its task identity and normal route. -/
def dataOutputTaskOperations (program : Program) :
    List (TaskDefinitionId × DirectActivityDataOutput) :=
  program.operations.filterMap fun
    | .awaitDataOutputUserTask _ _ _ _ taskId _ directOutput =>
        some (taskId, directOutput)
    | _ => none

/-- True when the task identity is declared by exactly one data-output entry operation. -/
def isDataOutputTaskDefinition (program : Program) (taskId : TaskDefinitionId) :
    Bool :=
  (dataOutputTaskOperations program).countP (fun entry =>
    decide (entry.1 = taskId)) = 1

/-- The unique declared association for one task identity, or `none`. -/
def dataOutputAssociation? (program : Program) (taskId : TaskDefinitionId) :
    Option DirectActivityDataOutput :=
  match (dataOutputTaskOperations program).filter fun entry =>
      decide (entry.1 = taskId) with
  | [entry] => some entry.2
  | _ => none

/-- `ADOUTPUT-FILL-01` and `ADOUTPUT-REQUIRE-01`. The Activity-local binding this submission writes into the declared `DataOutput`, or `none`.

Cardinality is checked together with the name so an extra undeclared value is refused rather than silently dropped: this profile's `OutputSet` declares exactly one member, and accepting a superset would let a command introduce output mediation the model never declared. -/
def filledDeclaredOutput? (directOutput : DirectActivityDataOutput)
    (submittedValues : List VariableBinding) : Option VariableBinding :=
  match submittedValues with
  | [binding] =>
      if binding.name = directOutput.sourceDataOutputId then some binding
      else none
  | _ => none

/-- `ADOUTPUT-ROUTE-01`. Executes the direct association: the filled value under the association's target `Property` name.

The submitted name is deliberately discarded. It identified the `DataOutput` inside the Activity, and the association alone decides which Process `Property` receives the value. -/
def associatedProcessBinding (directOutput : DirectActivityDataOutput)
    (filled : VariableBinding) : VariableBinding :=
  { name := directOutput.targetPropertyId, value := filled.value }

/-- The one live task wait named by an exact completion identity, or `none`.

Named rather than inlined so the laws below, and the refusal laws of neighbouring families, can case on the same term the evaluator reads. -/
def dataOutputTaskWait? (state : RuntimeState)
    (processInstanceId : SemanticId) (taskId : TaskDefinitionId)
    (activation : Nat) : Option UserTaskWait :=
  state.waits.find? fun wait =>
    decide (
      wait.processInstanceId = processInstanceId &&
        wait.task.id = taskId &&
        wait.activation = activation)

/-- `ADOUTPUT-ATOMIC-01`. Fills the declared output, executes its association into Process scope, disposes the exact active task with its Activity record and local scope, and follows the sole outgoing route, all in one step.

The Activity record is required to carry no attached handler, because this profile arms none: a record that lists one belongs to another family and completing it here would leave that handler's wait orphaned. -/
def completeDataOutputUserTask? (program : Program) (state : RuntimeState)
    (processInstanceId : SemanticId) (taskId : TaskDefinitionId)
    (activation : Nat) (submittedValues : List VariableBinding) :
    Option RuntimeState := do
  let _ ← dataOutputRunningInstance? state
  let directOutput ← dataOutputAssociation? program taskId
  let filled ← filledDeclaredOutput? directOutput submittedValues
  let task ← dataOutputTaskWait? state processInstanceId taskId activation
  let record ← activityOccurrenceForTaskWait? state.activityOccurrences task
  let variables ← removeActivityOccurrenceVariableScope state.variables
    { processInstanceId := record.processInstanceId
      activityElementId := ⟨record.activityElementId.value⟩
      activation := record.activation }
  if record.timerHandlerOccurrences.isEmpty then
    pure
      { state with
        waits := state.waits.erase task
        tokens := addToken state.tokens task.output task.owner
        activityOccurrences := state.activityOccurrences.filter fun candidate =>
          !sameActivityOccurrence candidate record
        variables :=
          { variables with
            process :=
              { bindings := mergeProcessVariableBindings
                  variables.process.bindings
                  [associatedProcessBinding directOutput filled] } } }
  else
    none

/-- `ADOUTPUT-ENTRY-01` as a relation: the token, task, Activity record, and empty local scope move together, with no premise about Process data.

Stated over the committed program's operations rather than over the evaluator's lookup, so it constrains what a legal transition *is* instead of restating how one is computed. -/
inductive DataOutputActivationStep (program : Program) :
    RuntimeState → RuntimeState → Prop where
  | activate (before : RuntimeState) (instanceId : SemanticId)
      (id : OperationId) (origin : BpmnElementOrigin)
      (input output : ControlPlaceId) (taskId : TaskDefinitionId)
      (taskName : Option String) (directOutput : DirectActivityDataOutput)
      (declared :
        SemanticOperation.awaitDataOutputUserTask id origin input output taskId
          taskName directOutput ∈ program.operations)
      (running : before.control = .running instanceId)
      (after : RuntimeState)
      (step : activateDataOutputUserTask? before input output taskId taskName =
        some after) :
      DataOutputActivationStep program before after

/-- `ADOUTPUT-ATOMIC-01` as a relation: the live task, its record, and its local scope leave together while the declared output reaches the Process Property the association names.

The association and the submitted availability are premises this relation states independently of the evaluator: they come from the committed program and the arriving command, so an arm can fail without the evaluator failing. -/
inductive DataOutputCompletionStep (program : Program) :
    RuntimeState → RuntimeState → Prop where
  | complete (before : RuntimeState) (instanceId processInstanceId : SemanticId)
      (taskId : TaskDefinitionId) (activation : Nat)
      (submittedValues : List VariableBinding)
      (directOutput : DirectActivityDataOutput) (filled : VariableBinding)
      (running : before.control = .running instanceId)
      (association : dataOutputAssociation? program taskId = some directOutput)
      (available : filledDeclaredOutput? directOutput submittedValues = some filled)
      (live : (dataOutputTaskWait? before processInstanceId taskId activation).isSome = true)
      (after : RuntimeState)
      (step : completeDataOutputUserTask? program before processInstanceId taskId
        activation submittedValues = some after)
      (routed : after.variables.process.bindings =
        mergeProcessVariableBindings before.variables.process.bindings
          [associatedProcessBinding directOutput filled]) :
      DataOutputCompletionStep program before after

private theorem dataOutputRunningInstance_sound {state : RuntimeState}
    {instanceId : SemanticId}
    (found : dataOutputRunningInstance? state = some instanceId) :
    state.control = .running instanceId := by
  unfold dataOutputRunningInstance? at found
  split at found
  · next running =>
      cases found
      exact running
  · exact absurd found (by simp)

/-- `ADOUTPUT-ENTRY-01`. The incoming token alone activates the task: no premise about Process data appears, and none is discharged inside.

This is the separating law against the sibling input family, whose activation is refused in exactly the state where its required source is unbound. -/
theorem dataOutputTokenAloneActivates {state : RuntimeState} {instanceId : SemanticId}
    {input output : ControlPlaceId} {taskId : TaskDefinitionId}
    {taskName : Option String} {owner : ScopeOccurrenceId}
    (owned : onlyTokenOwner? state input = some owner)
    (running : state.control = .running instanceId) :
    (activateDataOutputUserTask? state input output taskId taskName).isSome = true := by
  unfold activateDataOutputUserTask?
  simp [owned, dataOutputRunningInstance?, running]

/-- Every activation the evaluator produces is permitted by the declarative relation. -/
theorem activateDataOutputUserTask_sound (program : Program)
    (before after : RuntimeState) (id : OperationId) (origin : BpmnElementOrigin)
    (input output : ControlPlaceId) (taskId : TaskDefinitionId)
    (taskName : Option String) (directOutput : DirectActivityDataOutput)
    (declared :
      SemanticOperation.awaitDataOutputUserTask id origin input output taskId
        taskName directOutput ∈ program.operations)
    (success : activateDataOutputUserTask? before input output taskId taskName =
      some after) :
    DataOutputActivationStep program before after := by
  have hosted : ∃ instanceId, dataOutputRunningInstance? before = some instanceId := by
    cases running : dataOutputRunningInstance? before with
    | none =>
        unfold activateDataOutputUserTask? at success
        simp [running] at success
    | some instanceId => exact ⟨instanceId, rfl⟩
  obtain ⟨instanceId, running⟩ := hosted
  exact .activate before instanceId id origin input output taskId taskName
    directOutput declared (dataOutputRunningInstance_sound running) after success

/-- `ADOUTPUT-ENTRY-01` and `ADOUTPUT-ATOMIC-01`. Activation never writes Process scope: the whole write is deferred to completion. -/
theorem dataOutputActivationPreservesProcessScope {state after : RuntimeState}
    {input output : ControlPlaceId} {taskId : TaskDefinitionId}
    {taskName : Option String}
    (step : activateDataOutputUserTask? state input output taskId taskName =
      some after) :
    after.variables.process = state.variables.process := by
  unfold activateDataOutputUserTask? at step
  cases owned : onlyTokenOwner? state input with
  | none => simp [owned] at step
  | some owner =>
      cases running : dataOutputRunningInstance? state with
      | none => simp [owned, running] at step
      | some instanceId =>
          simp [owned, running] at step
          cases step
          rfl

/-- The Activity occurrence identity this family mints for one task in one state. -/
def dataOutputActivityOwner (state : RuntimeState) (instanceId : SemanticId)
    (taskId : TaskDefinitionId) : ActivityOccurrenceId :=
  { processInstanceId := instanceId
    activityElementId := ⟨taskId.value⟩
    activation := activityActivationCount state taskId + 1 }

/-- `ADOUTPUT-ENTRY-01`. The activated Activity occurrence owns exactly one local scope and that scope is empty: this family arms the container, and the completion supplies its content.

Owner freshness stays a hypothesis so the law speaks only about the armed scope; the input family's `issuedCountBoundSuppliesFreshOwner` derives the same obligation from a bound both families' arming preserves. -/
theorem dataOutputActivationArmsOneEmptyLocalScope {state after : RuntimeState}
    {instanceId : SemanticId} {input output : ControlPlaceId}
    {taskId : TaskDefinitionId} {taskName : Option String}
    (running : state.control = .running instanceId)
    (fresh : ∀ scope ∈ state.variables.activities,
      activityOccurrenceScopeMatches (dataOutputActivityOwner state instanceId taskId)
        scope = false)
    (step : activateDataOutputUserTask? state input output taskId taskName =
      some after) :
    activityOccurrenceVariableBindings after.variables
        (dataOutputActivityOwner state instanceId taskId) = some [] := by
  unfold activateDataOutputUserTask? at step
  have hosted : dataOutputRunningInstance? state = some instanceId := by
    simp [dataOutputRunningInstance?, running]
  cases owned : onlyTokenOwner? state input with
  | none => simp [owned] at step
  | some owner =>
      simp [owned, hosted] at step
      cases step
      simp only [dataOutputActivityOwner] at fresh
      simp only [activityOccurrenceVariableBindings, addActivityOccurrenceVariableScope,
        dataOutputActivityOwner]
      rw [filter_insertActivityVariableScope_eq_singleton _ _
        (by simp [activityOccurrenceScopeMatches, localDataOwnerMatches]) fresh]

/-- `ADOUTPUT-FILL-01`. Every submitted name but the declared `DataOutput` id is refused, and so is every cardinality but one. -/
theorem dataOutputWrongSubmissionRefusesFill (directOutput : DirectActivityDataOutput)
    (submittedValues : List VariableBinding)
    (wrong : ∀ binding, submittedValues ≠ [binding] ∨
      binding.name ≠ directOutput.sourceDataOutputId) :
    filledDeclaredOutput? directOutput submittedValues = none := by
  unfold filledDeclaredOutput?
  cases submittedValues with
  | nil => rfl
  | cons head tail =>
      cases tail with
      | nil =>
          rcases wrong head with shape | name
          · exact absurd rfl shape
          · simp [name]
      | cons _ _ => rfl

/-- `ADOUTPUT-REQUIRE-01`. A completion that makes the required output unavailable is refused, so the state is preserved exactly rather than committed with a partial write. -/
theorem dataOutputUnavailableRequiredOutputRefusesCompletion (program : Program)
    (state : RuntimeState) (processInstanceId : SemanticId)
    (taskId : TaskDefinitionId) (activation : Nat)
    (submittedValues : List VariableBinding)
    (directOutput : DirectActivityDataOutput)
    (association : dataOutputAssociation? program taskId = some directOutput)
    (unavailable : filledDeclaredOutput? directOutput submittedValues = none) :
    completeDataOutputUserTask? program state processInstanceId taskId activation
      submittedValues = none := by
  unfold completeDataOutputUserTask?
  cases dataOutputRunningInstance? state <;> simp [association, unavailable]

/-- `ADOUTPUT-REFUSE-01`. A task identity this program does not declare exactly once as a data-output entry has no association, so its completion is refused in every state. -/
theorem dataOutputUndeclaredTaskRefusesCompletion (program : Program) (state : RuntimeState)
    (processInstanceId : SemanticId) (taskId : TaskDefinitionId)
    (activation : Nat) (submittedValues : List VariableBinding)
    (undeclared : dataOutputAssociation? program taskId = none) :
    completeDataOutputUserTask? program state processInstanceId taskId activation
      submittedValues = none := by
  unfold completeDataOutputUserTask?
  cases dataOutputRunningInstance? state <;> simp [undeclared]

private theorem completionJoin {program : Program} {state after : RuntimeState}
    {processInstanceId : SemanticId} {taskId : TaskDefinitionId}
    {activation : Nat} {submittedValues : List VariableBinding}
    (step : completeDataOutputUserTask? program state processInstanceId taskId
      activation submittedValues = some after) :
    ∃ instanceId directOutput filled, ∃ record : ActivityOccurrence, ∃ variables,
      dataOutputRunningInstance? state = some instanceId ∧
      dataOutputAssociation? program taskId = some directOutput ∧
      filledDeclaredOutput? directOutput submittedValues = some filled ∧
      (dataOutputTaskWait? state processInstanceId taskId activation).isSome = true ∧
      removeActivityOccurrenceVariableScope state.variables
        { processInstanceId := record.processInstanceId
          activityElementId := ⟨record.activityElementId.value⟩
          activation := record.activation } = some variables ∧
      after.activityOccurrences =
        state.activityOccurrences.filter (fun candidate =>
          !sameActivityOccurrence candidate record) ∧
      after.variables =
        { variables with
          process :=
            { bindings := mergeProcessVariableBindings variables.process.bindings
                [associatedProcessBinding directOutput filled] } } := by
  unfold completeDataOutputUserTask? at step
  cases running : dataOutputRunningInstance? state with
  | none => simp [running] at step
  | some instanceId =>
      cases association : dataOutputAssociation? program taskId with
      | none => simp [running, association] at step
      | some directOutput =>
          cases available : filledDeclaredOutput? directOutput submittedValues with
          | none => simp [running, association, available] at step
          | some filled =>
              cases live : dataOutputTaskWait? state processInstanceId taskId activation with
              | none => simp [running, association, live] at step
              | some task =>
                  cases joined :
                      activityOccurrenceForTaskWait? state.activityOccurrences task with
                  | none => simp [running, association, live, joined] at step
                  | some record =>
                      cases removed : removeActivityOccurrenceVariableScope state.variables
                          { processInstanceId := record.processInstanceId
                            activityElementId := ⟨record.activityElementId.value⟩
                            activation := record.activation } with
                      | none =>
                          simp [running, association, live, joined, removed] at step
                      | some variables =>
                          simp [running, association, available, live, joined, removed] at step
                          obtain ⟨_, changed⟩ := step
                          cases changed
                          exact ⟨instanceId, directOutput, filled, record, variables,
                            rfl, rfl, available, rfl, removed, rfl, rfl⟩

/-- `ADOUTPUT-ROUTE-01`. A committed completion writes exactly the association's target `Property`, carrying the value submitted under the declared `DataOutput` id.

The submitted name never appears in the successor's Process scope. That is the whole discriminator against a name-merged completion, and it is observable only because the registered model gives the `DataOutput` and the `Property` different ids. -/
theorem dataOutputCompletionWritesTheAssociatedProperty {program : Program}
    {state after : RuntimeState} {processInstanceId : SemanticId}
    {taskId : TaskDefinitionId} {activation : Nat}
    {submittedValues : List VariableBinding}
    {directOutput : DirectActivityDataOutput} {filled : VariableBinding}
    (association : dataOutputAssociation? program taskId = some directOutput)
    (available : filledDeclaredOutput? directOutput submittedValues = some filled)
    (step : completeDataOutputUserTask? program state processInstanceId taskId
      activation submittedValues = some after) :
    after.variables.process.bindings =
      mergeProcessVariableBindings state.variables.process.bindings
        [associatedProcessBinding directOutput filled] := by
  obtain ⟨_, directOutput', filled', _, variables, _, association', available', _,
    removed, _, changed⟩ := completionJoin step
  have sameOutput : directOutput' = directOutput :=
    Option.some.inj (association'.symm.trans association)
  subst sameOutput
  have sameFilled : filled' = filled :=
    Option.some.inj (available'.symm.trans available)
  subst sameFilled
  have processUnchanged : variables.process = state.variables.process :=
    removeActivityOccurrenceVariableScope_preserves_process removed
  rw [changed]
  simp [processUnchanged]

/-- `ADOUTPUT-ATOMIC-01`. A committed completion disposes exactly one Activity-local scope: it was present once before and is absent afterwards. -/
theorem dataOutputCompletionDisposesOneLocalScope {program : Program}
    {state after : RuntimeState} {processInstanceId : SemanticId}
    {taskId : TaskDefinitionId} {activation : Nat}
    {submittedValues : List VariableBinding}
    (step : completeDataOutputUserTask? program state processInstanceId taskId
      activation submittedValues = some after) :
    ∃ owner : ActivityOccurrenceId,
      (state.variables.activities.filter
          (activityOccurrenceScopeMatches owner)).length = 1 ∧
        after.variables.activities.filter
          (activityOccurrenceScopeMatches owner) = [] := by
  obtain ⟨_, _, _, _, _, _, _, _, _, removed, _, changed⟩ := completionJoin step
  obtain ⟨present, absent⟩ := removeActivityOccurrenceVariableScope_disposes removed
  refine ⟨_, present, ?_⟩
  rw [changed]
  exact absent

/-- Every completion the evaluator produces is permitted by the declarative relation. -/
theorem completeDataOutputUserTask_sound (program : Program)
    (state after : RuntimeState) (processInstanceId : SemanticId)
    (taskId : TaskDefinitionId) (activation : Nat)
    (submittedValues : List VariableBinding)
    (step : completeDataOutputUserTask? program state processInstanceId taskId
      activation submittedValues = some after) :
    DataOutputCompletionStep program state after := by
  obtain ⟨instanceId, directOutput, filled, _, _, running, association, available,
    live, _, _, _⟩ := completionJoin step
  exact .complete state instanceId processInstanceId taskId activation submittedValues
    directOutput filled (dataOutputRunningInstance_sound running) association available
    live after step
    (dataOutputCompletionWritesTheAssociatedProperty association available step)

/-- The successor's exact Activity record, so the issuing and claim laws below name one term. -/
def dataOutputActivityRecord (state : RuntimeState) (instanceId : SemanticId)
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

/-- The successor's exact Activity collection, expressed over the record above. -/
theorem activateDataOutputUserTask_activityOccurrences {state after : RuntimeState}
    {instanceId : SemanticId} {owner : ScopeOccurrenceId}
    {input output : ControlPlaceId} {taskId : TaskDefinitionId}
    {taskName : Option String}
    (owned : onlyTokenOwner? state input = some owner)
    (running : state.control = .running instanceId)
    (step : activateDataOutputUserTask? state input output taskId taskName =
      some after) :
    after.activityOccurrences =
      insertActivityOccurrence (dataOutputActivityRecord state instanceId owner taskId)
        state.activityOccurrences := by
  have hosted : dataOutputRunningInstance? state = some instanceId := by
    simp [dataOutputRunningInstance?, running]
  unfold activateDataOutputUserTask? at step
  simp [owned, hosted] at step
  cases step
  rfl

/-- `RSI-ISSUE-01`. Arming issues its Activity occurrence strictly above the predecessor
Activity-element high-water mark, so the new identity cannot collide with a live one. -/
theorem activateDataOutputUserTask_issues_fresh_activity {state after : RuntimeState}
    {input output : ControlPlaceId} {taskId : TaskDefinitionId}
    {taskName : Option String}
    (step : activateDataOutputUserTask? state input output taskId taskName =
      some after) :
    activityIdentityIssuingDiscipline state after = true := by
  unfold activateDataOutputUserTask? at step
  cases owned : onlyTokenOwner? state input with
  | none => simp [owned] at step
  | some owner =>
      cases running : dataOutputRunningInstance? state with
      | none => simp [owned, running] at step
      | some instanceId =>
          simp [owned, running] at step
          cases step
          exact activityIdentityIssuingDiscipline_insertActivityOccurrence state
            (dataOutputActivityRecord state instanceId owner taskId) (by simp
              [dataOutputActivityRecord])

/-- Completion removes Activity records and issues none, so the discipline holds by subset. -/
theorem completeDataOutputUserTask_activity_identity_discipline {program : Program}
    {before after : RuntimeState} {processInstanceId : SemanticId}
    {taskId : TaskDefinitionId} {activation : Nat}
    {submittedValues : List VariableBinding}
    (step : completeDataOutputUserTask? program before processInstanceId taskId
      activation submittedValues = some after) :
    activityIdentityIssuingDiscipline before after = true := by
  apply activityIdentityIssuingDiscipline_of_subset
  intro occurrence present
  obtain ⟨_, _, _, _, _, _, _, _, _, _, retained, _⟩ := completionJoin step
  rw [retained] at present
  exact (List.mem_filter.mp present).1

end BpmnSemantics.SemanticProcess
