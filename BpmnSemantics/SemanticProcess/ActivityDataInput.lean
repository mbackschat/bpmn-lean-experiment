import BpmnSemantics.SemanticProcess.WaitActivation
import BpmnSemantics.SemanticProcess.ActivityOccurrence

/-! # Direct Activity data input

This module owns the atomic activation of one User Task whose entry fills a direct Activity data input, the completion that disposes that Activity with its copied value, and the program predicate routing an arriving completion into this family. It owns no stimulus admission, no closure, and no scenario projection.

BPMN 2.0.2 Clause 10.4.2 makes an InputSet unavailable while any of its Data Association sources is unavailable, and the Activity then waits. That is the whole content of the family: the incoming token alone does not enable the Activity, and the enabling fact is a Process binding this module reads but never writes. Once the source is available the associations execute before the Activity begins, which is why arming and copying are one transition.

Availability is decided at the representation level, and that is a recorded profile interpretation rather than a normative rule: a missing binding is unavailable, and a present binding whose value arm is `null` is available and is copied as explicit null. A duplicated name is unavailable too, because two bindings under one name is an invalid Process scope and selecting either would make the copied value depend on list order rather than on the model.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

private def dataInputRunningInstance? (state : RuntimeState) :
    Option SemanticId :=
  match state.control with
  | .running instanceId => some instanceId
  | _ => none

/-- The exact present Process binding one direct association reads, or `none`. -/
def dataInputSourceBinding? (state : RuntimeState)
    (directInput : DirectActivityDataInput) : Option VariableBinding :=
  match state.variables.process.bindings.filter fun binding =>
      decide (binding.name = directInput.sourcePropertyId) with
  | [binding] => some binding
  | _ => none

/-- `ADINPUT-READY-01` and `ADINPUT-COPY-01`. Consumes the incoming token and produces the task occurrence, its Activity record, and the occurrence-owned copy in one step.

`none` while the source is unbound is the family's stable ready state rather than an error: the token stays where it is and nothing else about the state changes. -/
def activateDataInputUserTask? (state : RuntimeState) (input output : ControlPlaceId)
    (taskId : TaskDefinitionId) (taskName : Option String)
    (directInput : DirectActivityDataInput) : Option RuntimeState := do
  let owner ← onlyTokenOwner? state input
  let instanceId ← dataInputRunningInstance? state
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
          attachedTimers := [] } state.activityOccurrences
      activityActivations :=
        { taskId, count := activityActivation } ::
          state.activityActivations.filter fun value =>
            decide (value.taskId ≠ taskId)
      variables := addActivityOccurrenceVariableScope state.variables
        activityOwner
        [{ name := directInput.targetDataInputId, value := source.value }] }

/-- Every committed data-input entry operation, projected to its task identity and normal route. -/
def dataInputTaskOperations (program : Program) :
    List (TaskDefinitionId × ControlPlaceId) :=
  program.operations.filterMap fun
    | .awaitDataInputUserTask _ _ _ output taskId _ _ => some (taskId, output)
    | _ => none

/-- True when the task identity is declared by exactly one data-input entry operation. -/
def isDataInputTaskDefinition (program : Program) (taskId : TaskDefinitionId) :
    Bool :=
  (dataInputTaskOperations program).countP (fun entry =>
    decide (entry.1 = taskId)) = 1

/-- The one live task wait named by an exact completion identity, or `none`.

Named rather than inlined so the laws below, and the refusal laws of neighbouring families, can case
on the same term the evaluator reads. -/
def dataInputTaskWait? (state : RuntimeState)
    (processInstanceId : SemanticId) (taskId : TaskDefinitionId)
    (activation : Nat) : Option UserTaskWait :=
  state.waits.find? fun wait =>
    decide (
      wait.processInstanceId = processInstanceId &&
        wait.task.id = taskId &&
        wait.activation = activation)

/-- `ADINPUT-COMPLETE-01`. Disposes the exact active task, its Activity record, and its local scope together, leaving Process data untouched and following the sole outgoing route.

The Activity record is required to carry no attached handler, because this profile arms none: a record that lists one belongs to another family and completing it here would leave that handler's wait orphaned. -/
def completeDataInputUserTask? (program : Program) (state : RuntimeState)
    (processInstanceId : SemanticId) (taskId : TaskDefinitionId)
    (activation : Nat) : Option RuntimeState := do
  let _ ← dataInputRunningInstance? state
  let task ← dataInputTaskWait? state processInstanceId taskId activation
  let record ← activityOccurrenceForTaskWait? state.activityOccurrences task
  let variables ← removeActivityOccurrenceVariableScope state.variables
    { processInstanceId := record.processInstanceId
      activityElementId := ⟨record.activityElementId.value⟩
      activation := record.activation }
  if isDataInputTaskDefinition program taskId && record.attachedTimers.isEmpty then
    pure
      { state with
        waits := state.waits.erase task
        tokens := addToken state.tokens task.output task.owner
        activityOccurrences := state.activityOccurrences.filter fun candidate =>
          !sameActivityOccurrence candidate record
        variables }
  else
    none

/-- `ADINPUT-READY-01` as a relation: the source binding is present, and the token, task, Activity record, and copied value move together.

Stated over the committed program's operations rather than over the evaluator's lookup, so it constrains what a legal transition *is* instead of restating how one is computed. -/
inductive DataInputActivationStep (program : Program) :
    RuntimeState → RuntimeState → Prop where
  | activate (before : RuntimeState) (instanceId : SemanticId)
      (id : OperationId) (origin : BpmnElementOrigin)
      (input output : ControlPlaceId) (taskId : TaskDefinitionId)
      (taskName : Option String) (directInput : DirectActivityDataInput)
      (declared :
        SemanticOperation.awaitDataInputUserTask id origin input output taskId
          taskName directInput ∈ program.operations)
      (running : before.control = .running instanceId)
      (source : (dataInputSourceBinding? before directInput).isSome = true)
      (after : RuntimeState)
      (step : activateDataInputUserTask? before input output taskId taskName
        directInput = some after) :
      DataInputActivationStep program before after

/-- `ADINPUT-COMPLETE-01` as a relation: the live task, its record, and its local scope leave together while Process scope is preserved exactly. -/
inductive DataInputCompletionStep (program : Program) :
    RuntimeState → RuntimeState → Prop where
  | complete (before : RuntimeState) (instanceId : SemanticId)
      (task : UserTaskWait)
      (running : before.control = .running instanceId)
      (live : task ∈ before.waits)
      (declared : isDataInputTaskDefinition program task.task.id = true)
      (after : RuntimeState)
      (step : completeDataInputUserTask? program before task.processInstanceId
        task.task.id task.activation = some after)
      (preserved : after.variables.process = before.variables.process) :
      DataInputCompletionStep program before after

private theorem dataInputRunningInstance_sound {state : RuntimeState}
    {instanceId : SemanticId}
    (found : dataInputRunningInstance? state = some instanceId) :
    state.control = .running instanceId := by
  unfold dataInputRunningInstance? at found
  split at found
  · next running =>
      cases found
      exact running
  · exact absurd found (by simp)

/-- `ADINPUT-READY-01`. An unavailable required source refuses activation in every state, so the ready
position is stable rather than a case the witnesses happen to miss. -/
theorem unavailableSourceRefusesActivation (state : RuntimeState)
    (input output : ControlPlaceId) (taskId : TaskDefinitionId)
    (taskName : Option String) (directInput : DirectActivityDataInput)
    (unavailable : dataInputSourceBinding? state directInput = none) :
    activateDataInputUserTask? state input output taskId taskName directInput =
      none := by
  unfold activateDataInputUserTask?
  simp [unavailable]

/-- Every activation the evaluator produces is permitted by the declarative relation. -/
theorem activateDataInputUserTask_sound (program : Program)
    (before after : RuntimeState) (id : OperationId) (origin : BpmnElementOrigin)
    (input output : ControlPlaceId) (taskId : TaskDefinitionId)
    (taskName : Option String) (directInput : DirectActivityDataInput)
    (declared :
      SemanticOperation.awaitDataInputUserTask id origin input output taskId
        taskName directInput ∈ program.operations)
    (success : activateDataInputUserTask? before input output taskId taskName
      directInput = some after) :
    DataInputActivationStep program before after := by
  have available : (dataInputSourceBinding? before directInput).isSome = true := by
    cases source : dataInputSourceBinding? before directInput with
    | none =>
        rw [unavailableSourceRefusesActivation before input output taskId taskName
          directInput source] at success
        simp at success
    | some _ => simp
  have hosted : ∃ instanceId, dataInputRunningInstance? before = some instanceId := by
    cases running : dataInputRunningInstance? before with
    | none =>
        unfold activateDataInputUserTask? at success
        cases owned : onlyTokenOwner? before input with
        | none => simp [owned] at success
        | some owner => simp [owned, running] at success
    | some instanceId => exact ⟨instanceId, rfl⟩
  obtain ⟨instanceId, running⟩ := hosted
  exact .activate before instanceId id origin input output taskId taskName directInput
    declared (dataInputRunningInstance_sound running) available after success

/-- `ADINPUT-COPY-01`. Activation never writes Process scope: the copy is one-directional. -/
theorem activationPreservesProcessScope {state after : RuntimeState}
    {input output : ControlPlaceId} {taskId : TaskDefinitionId}
    {taskName : Option String} {directInput : DirectActivityDataInput}
    (step : activateDataInputUserTask? state input output taskId taskName
      directInput = some after) :
    after.variables.process = state.variables.process := by
  unfold activateDataInputUserTask? at step
  cases owned : onlyTokenOwner? state input with
  | none => simp [owned] at step
  | some owner =>
      cases running : dataInputRunningInstance? state with
      | none => simp [owned, running] at step
      | some instanceId =>
          cases available : dataInputSourceBinding? state directInput with
          | none => simp [owned, running, available] at step
          | some source =>
              simp [owned, running, available] at step
              cases step
              rfl

/-- The Activity occurrence identity this family mints for one task in one state. -/
def dataInputActivityOwner (state : RuntimeState) (instanceId : SemanticId)
    (taskId : TaskDefinitionId) : ActivityOccurrenceId :=
  { processInstanceId := instanceId
    activityElementId := ⟨taskId.value⟩
    activation := activityActivationCount state taskId + 1 }

/-- `ADINPUT-COPY-01` and `ADINPUT-SCOPE-01`. The activated Activity occurrence owns exactly one local
binding, named by the target DataInput identity and holding the selected source value unchanged.

Stated over the selected binding rather than a literal, so a witness whose copied value happens to
agree cannot stand in for the copy. Owner freshness stays a hypothesis here so the law speaks only
about the copy, but it is no longer an obligation a caller must discharge by hand:
`issuedCountBoundSuppliesFreshOwner` derives it from a bound this family's own transitions preserve
from `initialState`. -/
theorem activationCopiesSelectedSourceExactly {state after : RuntimeState}
    {instanceId : SemanticId} {input output : ControlPlaceId}
    {taskId : TaskDefinitionId} {taskName : Option String}
    {directInput : DirectActivityDataInput} {source : VariableBinding}
    (running : state.control = .running instanceId)
    (available : dataInputSourceBinding? state directInput = some source)
    (fresh : ∀ scope ∈ state.variables.activities,
      activityOccurrenceScopeMatches (dataInputActivityOwner state instanceId taskId)
        scope = false)
    (step : activateDataInputUserTask? state input output taskId taskName
      directInput = some after) :
    activityOccurrenceVariableBindings after.variables
        (dataInputActivityOwner state instanceId taskId) =
      some [{ name := directInput.targetDataInputId, value := source.value }] := by
  unfold activateDataInputUserTask? at step
  have hosted : dataInputRunningInstance? state = some instanceId := by
    simp [dataInputRunningInstance?, running]
  cases owned : onlyTokenOwner? state input with
  | none => simp [owned] at step
  | some owner =>
      simp [owned, hosted, available] at step
      cases step
      simp only [dataInputActivityOwner] at fresh
      simp only [activityOccurrenceVariableBindings, addActivityOccurrenceVariableScope,
        dataInputActivityOwner]
      rw [filter_insertActivityVariableScope_eq_singleton _ _
        (by simp [activityOccurrenceScopeMatches, localDataOwnerMatches]) fresh]

private theorem completionJoin {program : Program} {state after : RuntimeState}
    {processInstanceId : SemanticId} {taskId : TaskDefinitionId} {activation : Nat}
    (step : completeDataInputUserTask? program state processInstanceId taskId
      activation = some after) :
    ∃ owner : ActivityOccurrenceId, ∃ variables,
      removeActivityOccurrenceVariableScope state.variables owner = some variables ∧
        after.variables = variables := by
  unfold completeDataInputUserTask? at step
  cases running : dataInputRunningInstance? state with
  | none => simp [running] at step
  | some instanceId =>
      cases live : dataInputTaskWait? state processInstanceId taskId activation with
      | none => simp [running, live] at step
      | some task =>
          cases record :
              activityOccurrenceForTaskWait? state.activityOccurrences task with
          | none => simp [running, live, record] at step
          | some found =>
              cases removed : removeActivityOccurrenceVariableScope state.variables
                  { processInstanceId := found.processInstanceId
                    activityElementId := ⟨found.activityElementId.value⟩
                    activation := found.activation } with
              | none => simp [running, live, record, removed] at step
              | some variables =>
                  simp [running, live, record, removed] at step
                  obtain ⟨_, changed⟩ := step
                  cases changed
                  exact ⟨_, variables, removed, rfl⟩

/-- `ADINPUT-COMPLETE-01`. Completion leaves Process scope exactly as it was: this family mediates no
output, so a completed task can neither publish, replace, nor delete a Process binding. -/
theorem completionPreservesProcessScope {program : Program}
    {state after : RuntimeState} {processInstanceId : SemanticId}
    {taskId : TaskDefinitionId} {activation : Nat}
    (step : completeDataInputUserTask? program state processInstanceId taskId
      activation = some after) :
    after.variables.process = state.variables.process := by
  obtain ⟨_, _, removed, changed⟩ := completionJoin step
  rw [changed]
  exact removeActivityOccurrenceVariableScope_preserves_process removed

/-- `ADINPUT-SCOPE-01`. A committed completion disposes exactly one Activity-local scope: it was
present once before and is absent afterwards. -/
theorem completionDisposesOneLocalScope {program : Program}
    {state after : RuntimeState} {processInstanceId : SemanticId}
    {taskId : TaskDefinitionId} {activation : Nat}
    (step : completeDataInputUserTask? program state processInstanceId taskId
      activation = some after) :
    ∃ owner : ActivityOccurrenceId,
      (state.variables.activities.filter
          (activityOccurrenceScopeMatches owner)).length = 1 ∧
        after.variables.activities.filter
          (activityOccurrenceScopeMatches owner) = [] := by
  obtain ⟨owner, _, removed, changed⟩ := completionJoin step
  rw [changed]
  exact ⟨owner, removeActivityOccurrenceVariableScope_disposes removed⟩

/-- `ADINPUT-REFUSE-01`. A task identity this program does not declare exactly once as a data-input
entry never completes here, so the family cannot dispose another family's Activity. -/
theorem undeclaredTaskRefusesCompletion (program : Program) (state : RuntimeState)
    (processInstanceId : SemanticId) (taskId : TaskDefinitionId) (activation : Nat)
    (undeclared : isDataInputTaskDefinition program taskId = false) :
    completeDataInputUserTask? program state processInstanceId taskId activation =
      none := by
  unfold completeDataInputUserTask?
  simp [undeclared]

private theorem dataInputTaskWait_sound {state : RuntimeState}
    {processInstanceId : SemanticId} {taskId : TaskDefinitionId} {activation : Nat}
    {task : UserTaskWait}
    (found : dataInputTaskWait? state processInstanceId taskId activation = some task) :
    task ∈ state.waits ∧ task.processInstanceId = processInstanceId ∧
      task.task.id = taskId ∧ task.activation = activation := by
  unfold dataInputTaskWait? at found
  have selected := List.find?_some found
  simp [Bool.and_eq_true, decide_eq_true_eq] at selected
  obtain ⟨⟨sameInstance, sameTask⟩, sameActivation⟩ := selected
  exact ⟨List.mem_of_find?_eq_some found, sameInstance, sameTask, sameActivation⟩

/-- Every completion the evaluator produces is permitted by the declarative relation.

This is a dispatcher and constructor-selection check, not an independent evidence lane: the relation
states the same selection conditions the evaluator applies, and `preserved` is the evaluator's own
result rather than a premise it could fail. What it does buy is that a later edit cannot quietly drop
one of those conditions, because the relation would then no longer be inhabited by this term. -/
theorem completeDataInputUserTask_sound (program : Program)
    (before after : RuntimeState) (processInstanceId : SemanticId)
    (taskId : TaskDefinitionId) (activation : Nat)
    (success : completeDataInputUserTask? program before processInstanceId taskId
      activation = some after) :
    DataInputCompletionStep program before after := by
  have hosted : ∃ instanceId, dataInputRunningInstance? before = some instanceId := by
    cases running : dataInputRunningInstance? before with
    | none =>
        unfold completeDataInputUserTask? at success
        simp [running] at success
    | some instanceId => exact ⟨instanceId, rfl⟩
  have waited :
      ∃ task, dataInputTaskWait? before processInstanceId taskId activation = some task := by
    cases live : dataInputTaskWait? before processInstanceId taskId activation with
    | none =>
        unfold completeDataInputUserTask? at success
        cases running : dataInputRunningInstance? before with
        | none => simp [running] at success
        | some _ => simp [running, live] at success
    | some task => exact ⟨task, rfl⟩
  have declared : isDataInputTaskDefinition program taskId = true := by
    cases undeclared : isDataInputTaskDefinition program taskId with
    | false =>
        rw [undeclaredTaskRefusesCompletion program before processInstanceId taskId
          activation undeclared] at success
        simp at success
    | true => rfl
  obtain ⟨instanceId, running⟩ := hosted
  obtain ⟨task, live⟩ := waited
  obtain ⟨mem, sameInstance, sameTask, sameActivation⟩ := dataInputTaskWait_sound live
  exact .complete before instanceId task (dataInputRunningInstance_sound running) mem
    (by rw [sameTask]; exact declared) after
    (by rw [sameInstance, sameTask, sameActivation]; exact success)
    (completionPreservesProcessScope success)

/-- The successor's exact Activity record, so the issuing and claim laws below name one term. -/
def dataInputActivityRecord (state : RuntimeState) (instanceId : SemanticId)
    (owner : ScopeOccurrenceId) (taskId : TaskDefinitionId) : ActivityOccurrence :=
  { processInstanceId := instanceId
    activityElementId := ⟨taskId.value⟩
    activation := activityActivationCount state taskId + 1
    owner
    body := .userTask
      { processInstanceId := instanceId
        elementId := ⟨taskId.value⟩
        activation := activationCount state taskId + 1 }
    attachedTimers := [] }

/-- The successor's exact Activity collection, expressed over the record above. -/
theorem activateDataInputUserTask_activityOccurrences {state after : RuntimeState}
    {instanceId : SemanticId} {owner : ScopeOccurrenceId}
    {input output : ControlPlaceId} {taskId : TaskDefinitionId}
    {taskName : Option String} {directInput : DirectActivityDataInput}
    (owned : onlyTokenOwner? state input = some owner)
    (running : state.control = .running instanceId)
    (available : (dataInputSourceBinding? state directInput).isSome = true)
    (step : activateDataInputUserTask? state input output taskId taskName
      directInput = some after) :
    after.activityOccurrences =
      insertActivityOccurrence (dataInputActivityRecord state instanceId owner taskId)
        state.activityOccurrences := by
  have hosted : dataInputRunningInstance? state = some instanceId := by
    simp [dataInputRunningInstance?, running]
  unfold activateDataInputUserTask? at step
  cases source : dataInputSourceBinding? state directInput with
  | none => rw [source] at available; simp at available
  | some binding =>
      simp [owned, hosted, source] at step
      cases step
      rfl

/-- `RSI-ISSUE-01`. Arming issues its Activity occurrence strictly above the predecessor
Activity-element high-water mark, so the new identity cannot collide with a live one. -/
theorem activateDataInputUserTask_issues_fresh_activity {state after : RuntimeState}
    {input output : ControlPlaceId} {taskId : TaskDefinitionId}
    {taskName : Option String} {directInput : DirectActivityDataInput}
    (step : activateDataInputUserTask? state input output taskId taskName
      directInput = some after) :
    activityIdentityIssuingDiscipline state after = true := by
  unfold activateDataInputUserTask? at step
  cases owned : onlyTokenOwner? state input with
  | none => simp [owned] at step
  | some owner =>
      cases running : dataInputRunningInstance? state with
      | none => simp [owned, running] at step
      | some instanceId =>
          cases source : dataInputSourceBinding? state directInput with
          | none => simp [owned, running, source] at step
          | some binding =>
              simp [owned, running, source] at step
              cases step
              exact activityIdentityIssuingDiscipline_insertActivityOccurrence state
                (dataInputActivityRecord state instanceId owner taskId) (by simp
                  [dataInputActivityRecord])

/-- Completion removes Activity records and issues none, so the discipline holds by subset. -/
theorem completeDataInputUserTask_activity_identity_discipline {program : Program}
    {before after : RuntimeState} {processInstanceId : SemanticId}
    {taskId : TaskDefinitionId} {activation : Nat}
    (step : completeDataInputUserTask? program before processInstanceId taskId
      activation = some after) :
    activityIdentityIssuingDiscipline before after = true := by
  apply activityIdentityIssuingDiscipline_of_subset
  intro record present
  unfold completeDataInputUserTask? at step
  cases running : dataInputRunningInstance? before with
  | none => simp [running] at step
  | some instanceId =>
      cases live : dataInputTaskWait? before processInstanceId taskId activation with
      | none => simp [running, live] at step
      | some task =>
          cases found :
              activityOccurrenceForTaskWait? before.activityOccurrences task with
          | none => simp [running, live, found] at step
          | some located =>
              cases removed : removeActivityOccurrenceVariableScope before.variables
                  { processInstanceId := located.processInstanceId
                    activityElementId := ⟨located.activityElementId.value⟩
                    activation := located.activation } with
              | none => simp [running, live, found, removed] at step
              | some variables =>
                  simp [running, live, found, removed] at step
                  obtain ⟨_, changed⟩ := step
                  cases changed
                  exact (List.mem_filter.mp present).1


/-! ## The issuing-discipline consequence that supplies owner freshness

`ADINPUT-SCOPE-01`'s uniqueness half rests on a freshness hypothesis that the global runtime-state
predicate cannot supply, because its quantified preservation is a deliberately open lane. This
section replaces it with a weaker and family-local one: the bound below implies the hypothesis and is
preserved by both of this family's transitions, so `fresh` follows from the issuing discipline
wherever the bound holds.

The bound is anchored at both states a run can begin from, but neither anchor reaches an activation on
its own: both family transitions require `.running` control, so `initialState` enables neither, and
every state where an activation is possible is reached through non-family transitions whose
preservation of this bound is not proved here. What is discharged is the obligation to justify
`fresh` at each call site; establishing the bound at an arbitrary reachable state still belongs to the
open global-predicate lane. -/

/-- Every Activity-owned local scope sits at or below its own element's high-water mark.

Effect-owned scopes are unconstrained here on purpose: they are numbered by a different counter, and
constraining them would make this bound a claim about a family it does not govern. -/
def activityScopesWithinIssuedCount (state : RuntimeState) : Prop :=
  ∀ scope ∈ state.variables.activities,
    ∀ owner : ActivityOccurrenceId, scope.owner = .activityOccurrence owner →
      owner.activation ≤ activityActivationCount state ⟨owner.activityElementId.value⟩

private theorem taskActivationCount_cons_self
    (rest : List TaskActivation) (taskId : TaskDefinitionId) (count : Nat) :
    taskActivationCount ({ taskId, count } :: rest) taskId = count := by
  simp [taskActivationCount]

private theorem taskActivationCount_filter_ne
    (rest : List TaskActivation) {taskId other : TaskDefinitionId} (distinct : other ≠ taskId) :
    taskActivationCount (rest.filter fun value => decide (value.taskId ≠ taskId)) other =
      taskActivationCount rest other := by
  induction rest with
  | nil => simp [taskActivationCount]
  | cons head tail ih =>
      -- `decide (a ≠ b)` and `!decide (a = b)` are the same predicate in two normal forms, and the
      -- goal reaches one while the induction hypothesis carries the other.
      simp only [ne_eq, decide_not] at ih ⊢
      by_cases kept : head.taskId = taskId
      · have absent : ¬ (taskId = other) := fun same => distinct same.symm
        simp [kept, taskActivationCount, absent, ih]
      · simp [kept, taskActivationCount, ih]


/-- Membership in a canonical insertion is membership in the original or the inserted scope. -/
private theorem mem_insertActivityVariableScope
    {inserted scope : ActivityVariableScope} {values : List ActivityVariableScope}
    (present : scope ∈ insertActivityVariableScope inserted values) :
    scope = inserted ∨ scope ∈ values := by
  induction values with
  | nil =>
      simp only [insertActivityVariableScope, List.mem_singleton] at present
      exact Or.inl present
  | cons head tail ih =>
      simp only [insertActivityVariableScope] at present
      by_cases first : activityVariableScopeBefore inserted head = true
      · rw [if_pos first] at present
        simp only [List.mem_cons] at present
        rcases present with same | rest
        · exact Or.inl same
        · exact Or.inr (List.mem_cons.mpr rest)
      · rw [if_neg first] at present
        simp only [List.mem_cons] at present
        rcases present with same | rest
        · exact Or.inr (by simp [same])
        · rcases ih rest with same | tailMember
          · exact Or.inl same
          · exact Or.inr (by simp [tailMember])

/-- `ADINPUT-SCOPE-01`. Freshness is a consequence of the bound rather than a caller obligation: the
minted activation is one above its element's high-water mark, and the bound puts every live scope of
that element at or below it. -/
theorem issuedCountBoundSuppliesFreshOwner {state : RuntimeState}
    {instanceId : SemanticId} {taskId : TaskDefinitionId}
    (bound : activityScopesWithinIssuedCount state) :
    ∀ scope ∈ state.variables.activities,
      activityOccurrenceScopeMatches (dataInputActivityOwner state instanceId taskId) scope
        = false := by
  intro scope present
  cases matched :
      activityOccurrenceScopeMatches (dataInputActivityOwner state instanceId taskId) scope with
  | false => rfl
  | true =>
      exfalso
      simp only [activityOccurrenceScopeMatches, localDataOwnerMatches,
        decide_eq_true_eq] at matched
      have bounded :=
        bound scope present (dataInputActivityOwner state instanceId taskId) matched.symm
      simp only [dataInputActivityOwner] at bounded
      exact Nat.not_succ_le_self _ bounded

private theorem completionPreservesActivityActivations {program : Program}
    {state after : RuntimeState} {processInstanceId : SemanticId}
    {taskId : TaskDefinitionId} {activation : Nat}
    (step : completeDataInputUserTask? program state processInstanceId taskId
      activation = some after) :
    after.activityActivations = state.activityActivations := by
  unfold completeDataInputUserTask? at step
  cases running : dataInputRunningInstance? state with
  | none => simp [running] at step
  | some instanceId =>
      cases live : dataInputTaskWait? state processInstanceId taskId activation with
      | none => simp [running, live] at step
      | some task =>
          cases record :
              activityOccurrenceForTaskWait? state.activityOccurrences task with
          | none => simp [running, live, record] at step
          | some found =>
              cases removed : removeActivityOccurrenceVariableScope state.variables
                  { processInstanceId := found.processInstanceId
                    activityElementId := ⟨found.activityElementId.value⟩
                    activation := found.activation } with
              | none => simp [running, live, record, removed] at step
              | some variables =>
                  simp [running, live, record, removed] at step
                  obtain ⟨_, changed⟩ := step
                  cases changed
                  rfl

/-- Completion removes one scope and touches no counter, so the bound survives by subset. -/
theorem completeDataInputUserTask_preservesIssuedCountBound {program : Program}
    {state after : RuntimeState} {processInstanceId : SemanticId}
    {taskId : TaskDefinitionId} {activation : Nat}
    (bound : activityScopesWithinIssuedCount state)
    (step : completeDataInputUserTask? program state processInstanceId taskId
      activation = some after) :
    activityScopesWithinIssuedCount after := by
  intro scope present owner owned
  obtain ⟨_, variables, removed, changed⟩ := completionJoin step
  simp only [activityActivationCount, completionPreservesActivityActivations step]
  refine bound scope ?_ owner owned
  rw [changed] at present
  unfold removeActivityOccurrenceVariableScope at removed
  split at removed
  · cases removed
    exact (List.mem_filter.mp present).left
  · simp at removed

/-- Arming raises its own element's mark and leaves every other element's alone, so no live scope's
bound is invalidated by the update. -/
private theorem activationCounterMonotone (state : RuntimeState)
    (taskId element : TaskDefinitionId) :
    taskActivationCount state.activityActivations element ≤
      taskActivationCount
        ({ taskId, count := taskActivationCount state.activityActivations taskId + 1 } ::
          state.activityActivations.filter fun value => !decide (value.taskId = taskId))
        element := by
  by_cases same : element = taskId
  · subst same
    rw [taskActivationCount_cons_self]
    exact Nat.le_succ _
  · have head : ¬ (taskId = element) := fun eq => same eq.symm
    simp only [taskActivationCount, head, ite_false]
    have bridge :
        (state.activityActivations.filter fun value => !decide (value.taskId = taskId)) =
          state.activityActivations.filter fun value => decide (value.taskId ≠ taskId) := by
      simp only [ne_eq, decide_not]
    rw [bridge, taskActivationCount_filter_ne _ same]
    exact Nat.le_refl _

/-- Arming preserves the bound: the minted scope sits exactly at the new mark, and every scope that
was already live keeps a mark that only rose. -/
theorem activateDataInputUserTask_preservesIssuedCountBound {state after : RuntimeState}
    {input output : ControlPlaceId} {taskId : TaskDefinitionId}
    {taskName : Option String} {directInput : DirectActivityDataInput}
    (bound : activityScopesWithinIssuedCount state)
    (step : activateDataInputUserTask? state input output taskId taskName
      directInput = some after) :
    activityScopesWithinIssuedCount after := by
  intro scope present owner owned
  unfold activateDataInputUserTask? at step
  cases token : onlyTokenOwner? state input with
  | none => simp [token] at step
  | some tokenOwner =>
      cases running : dataInputRunningInstance? state with
      | none => simp [token, running] at step
      | some instanceId =>
          cases available : dataInputSourceBinding? state directInput with
          | none => simp [token, running, available] at step
          | some source =>
              simp [token, running, available] at step
              cases step
              simp only [addActivityOccurrenceVariableScope] at present
              rcases mem_insertActivityVariableScope present with minted | earlier
              · subst minted
                simp only at owned
                cases owned
                simp only [activityActivationCount, taskActivationCount_cons_self]
                exact Nat.le_refl _
              · have prior := bound scope earlier owner owned
                simp only [activityActivationCount] at prior ⊢
                exact Nat.le_trans prior
                  (activationCounterMonotone state taskId ⟨owner.activityElementId.value⟩)

/-- The bound holds before a Process starts, where no local scope exists at all.

This anchor is the weaker of the two: no transition of this family is enabled at `.notStarted`
control, so nothing is derived from it alone. -/
theorem initialState_activityScopesWithinIssuedCount :
    activityScopesWithinIssuedCount initialState := by
  intro scope present
  simp [initialState, emptyScopedVariables] at present

/-- The bound also holds at the started state, which is where a run that can reach an activation
begins.

`runningStartState` populates only the Process scope, so the Activity scopes are still empty and the
activation counters are still unissued. Non-family transitions between here and an activation are
outside this family's proof obligation. -/
theorem runningStartState_activityScopesWithinIssuedCount
    (instanceId : SemanticId) (initialVariables : List VariableBinding) :
    activityScopesWithinIssuedCount (runningStartState instanceId initialVariables) := by
  intro scope present
  simp [runningStartState, initialState, emptyScopedVariables] at present

end BpmnSemantics.SemanticProcess
