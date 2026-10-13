import BpmnSemantics.SemanticProcess.ParallelScopeProgramCapacity
import BpmnSemantics.SemanticProcess.ParallelScopeData
import BpmnSemantics.SemanticProcess.WaitCompletion

/-! PMIS-DATA-01 admits selected command data and routes exact live waits through the existing scoped writers. -/

namespace BpmnSemantics.SemanticProcess.ParallelScopeCommand

def humanValuesAdmitted (analysis : ParallelScopeStart.ProgramAnalysis) (bindings : List VariableBinding) : Bool :=
  strictlySortedStrings (bindings.map (·.name)) && bindings.all (fun binding =>
    SerialBusinessTask.nameAllowed analysis.handlers binding.name &&
    binding.name != analysis.entry.collectionName && binding.name != analysis.entry.itemName &&
    if analysis.entry.completionBooleanName == some binding.name then
      match binding.value with | .boolean _ => true | _ => false
    else SerialBusinessTask.scalar binding.value)

def stimulusAdmitted (program : Program) (state : RuntimeState) (stimulus : Stimulus) : Bool :=
  if !ParallelScopeStart.programSelected program then true
  else if !InternalCommutation.occurrenceReservationStateValid state then false
  else match ParallelScopeStart.analyzeProgram program with
    | none => false
    | some analysis => match stimulus with
      | .startProcess _ _ instanceId bindings =>
          !instanceId.value.isEmpty && (ParallelScopeStart.programStartCapacity program bindings).isSome
      | .completeUserTaskInstance _ _ bindings =>
          (ParallelScopeStart.programStateCapacity program state).isSome && humanValuesAdmitted analysis bindings
      | .completeEffect _ _ (.success bindings) =>
          (ParallelScopeStart.programStateCapacity program state).isSome && SerialBusinessTask.bindingsValid analysis.handlers bindings
      | _ => false

@[simp] theorem stimulusAdmitted_of_unselected (program : Program) (state : RuntimeState)
    (stimulus : Stimulus) (unselected : ParallelScopeStart.programSelected program = false) :
    stimulusAdmitted program state stimulus = true := by
  simp [stimulusAdmitted, unselected]

def completeTask? (program : Program) (state : RuntimeState) (id : UserTaskInstanceId)
    (values : List VariableBinding) : Option RuntimeState := do
  let [wait] := state.waits.filter ((taskIdNamesWait id)) | none
  if hasParallelScopeDefinition program wait.owner then completeParallelScopeUserTask? program state id values
  else do
    let completed ← completeUserTask state id.processInstanceId ⟨id.elementId.value⟩ id.activation
    pure { completed with variables := { completed.variables with process := {
      bindings := mergeProcessVariableBindings completed.variables.process.bindings values } } }

def completeEffect? (program : Program) (state : RuntimeState) (id : EffectOccurrenceId)
    (result : EffectExecutionResult) : Option RuntimeState := do
  let [wait] := state.effectWaits.filter (effectIdNamesWait id) | none
  if hasParallelScopeDefinition program wait.owner then completeParallelScopeEffect? program state id result
  else completeSerialEffect? program state id result

/-- Ordinary parent Human completion only changes its wait, continuation token and Process values. -/
theorem completeTask_preserves_clean_entry (program : Program) (before after : RuntimeState)
    (id : UserTaskInstanceId) (values : List VariableBinding) (entry : ParallelScopeEntry)
    (parent : ScopeOccurrenceId) (wait : UserTaskWait)
    (clean : ParallelScopeCleanEntry entry parent before)
    (selected : before.waits.filter ((taskIdNamesWait id)) = [wait])
    (ordinary : hasParallelScopeDefinition program wait.owner = false)
    (completed : completeTask? program before id values = some after) : ParallelScopeCleanEntry entry parent after := by
  simp only [completeTask?, selected, ordinary, Bool.false_eq_true, ↓reduceIte] at completed
  obtain ⟨successor, applied, completed⟩ := Option.bind_eq_some_iff.mp completed
  unfold completeUserTask at applied
  split at applied <;> try contradiction
  cases Option.some.inj applied
  cases Option.some.inj completed
  exact clean

/-- Ordinary parent Service completion disposes separate Activity data without changing the clean repeated-scope population. -/
theorem completeEffect_preserves_clean_entry (program : Program) (before after : RuntimeState)
    (id : EffectOccurrenceId) (result : EffectExecutionResult) (entry : ParallelScopeEntry)
    (parent : ScopeOccurrenceId) (wait : EffectWait)
    (clean : ParallelScopeCleanEntry entry parent before)
    (selected : before.effectWaits.filter (effectIdNamesWait id) = [wait])
    (ordinary : hasParallelScopeDefinition program wait.owner = false)
    (completed : completeEffect? program before id result = some after) : ParallelScopeCleanEntry entry parent after := by
  simp only [completeEffect?, selected, ordinary, Bool.false_eq_true, ↓reduceIte,
    completeSerialEffect?] at completed
  obtain ⟨variables, written, completed⟩ := Option.bind_eq_some_iff.mp completed
  unfold completeSerialActivityScope? at written
  split at written <;> try contradiction
  obtain ⟨bindings, _, written⟩ := Option.bind_eq_some_iff.mp written
  cases Option.some.inj written
  cases Option.some.inj completed
  exact clean

private theorem human_disposal_reservation (before : RuntimeState) (wait : UserTaskWait)
    (variables : ScopedVariables) (activities : variables.activities = before.variables.activities)
    (valid : InternalCommutation.occurrenceReservationStateValid before = true)
    (noCompensation : before.compensationHandlerEffectWaits = []) :
    InternalCommutation.occurrenceReservationStateValid { before with
      waits := before.waits.erase wait, variables, tokens := addToken before.tokens wait.output wait.owner } = true ∧
      ({ before with
        waits := before.waits.erase wait, variables,
        tokens := addToken before.tokens wait.output wait.owner } : RuntimeState).compensationHandlerEffectWaits = [] := by
  refine ⟨InternalCommutation.occurrenceReservationStateValid_restrict before _ valid rfl rfl
    List.erase_sublist (List.Sublist.refl _) (List.Sublist.refl _) (List.Sublist.refl _)
    (List.Sublist.refl _) (List.Sublist.refl _) ?_, noCompensation⟩
  rw [activities]
  exact List.Sublist.refl _

private theorem effect_disposal_reservation (before : RuntimeState) (wait : EffectWait)
    (variables : ScopedVariables) (activities : variables.activities.Sublist before.variables.activities)
    (valid : InternalCommutation.occurrenceReservationStateValid before = true)
    (noCompensation : before.compensationHandlerEffectWaits = []) :
    InternalCommutation.occurrenceReservationStateValid { before with
      effectWaits := before.effectWaits.erase wait, variables, tokens := addToken before.tokens wait.output wait.owner } = true ∧
      ({ before with
        effectWaits := before.effectWaits.erase wait, variables,
        tokens := addToken before.tokens wait.output wait.owner } : RuntimeState).compensationHandlerEffectWaits = [] := by
  exact ⟨InternalCommutation.occurrenceReservationStateValid_restrict before _ valid rfl rfl
    (List.Sublist.refl _) (List.Sublist.refl _) (List.Sublist.refl _) List.erase_sublist
    (List.Sublist.refl _) (List.Sublist.refl _) activities, noCompensation⟩

/-- Actual scoped and ordinary Human completion preserve reservation validity and Compensation-wait absence. -/
theorem completeTask_reservation_valid (program : Program) (before after : RuntimeState)
    (id : UserTaskInstanceId) (values : List VariableBinding)
    (completed : ParallelScopeCommand.completeTask? program before id values = some after)
    (valid : InternalCommutation.occurrenceReservationStateValid before = true)
    (noCompensation : before.compensationHandlerEffectWaits = []) :
    InternalCommutation.occurrenceReservationStateValid after = true ∧ after.compensationHandlerEffectWaits = [] := by
  unfold ParallelScopeCommand.completeTask? at completed
  split at completed <;> try contradiction
  split at completed
  · unfold completeParallelScopeUserTask? at completed
    split at completed <;> try contradiction
    split at completed <;> try contradiction
    obtain ⟨variables, written, completed⟩ := Option.bind_eq_some_iff.mp completed
    cases Option.some.inj completed
    exact human_disposal_reservation before _ variables (writeParallelScopeValues_preserves_activities written) valid noCompensation
  · obtain ⟨successor, applied, completed⟩ := Option.bind_eq_some_iff.mp completed
    unfold completeUserTask at applied
    split at applied <;> try contradiction
    cases Option.some.inj applied
    cases Option.some.inj completed
    exact human_disposal_reservation before _ _ rfl valid noCompensation

/-- Actual successful scoped and ordinary Service completion retain reservation validity after disposing the exact local frame. -/
theorem completeEffect_success_reservation_valid (program : Program) (before after : RuntimeState)
    (id : EffectOccurrenceId) (values : List VariableBinding)
    (completed : ParallelScopeCommand.completeEffect? program before id (.success values) = some after)
    (valid : InternalCommutation.occurrenceReservationStateValid before = true)
    (noCompensation : before.compensationHandlerEffectWaits = []) :
    InternalCommutation.occurrenceReservationStateValid after = true ∧ after.compensationHandlerEffectWaits = [] := by
  unfold ParallelScopeCommand.completeEffect? at completed
  split at completed <;> try contradiction
  rename_i candidates wait selected
  split at completed
  · unfold completeParallelScopeEffect? at completed
    split at completed <;> try contradiction
    split at completed <;> try contradiction
    split at completed <;> try contradiction
    split at completed <;> try contradiction
    obtain ⟨projected, _, completed⟩ := Option.bind_eq_some_iff.mp completed
    obtain ⟨variables, written, completed⟩ := Option.bind_eq_some_iff.mp completed
    cases Option.some.inj completed
    apply effect_disposal_reservation before _ _ _ valid noCompensation
    change (variables.activities.filter fun scope => !activityScopeMatches id scope).Sublist before.variables.activities
    rw [writeParallelScopeValues_preserves_activities written]
    exact List.filter_sublist
    case h_2 =>
      rename_i result impossible
      exact False.elim (impossible values rfl)
  · simp only [completeSerialEffect?, selected] at completed
    obtain ⟨variables, written, completed⟩ := Option.bind_eq_some_iff.mp completed
    unfold completeSerialActivityScope? at written
    split at written <;> try contradiction
    obtain ⟨bindings, _, written⟩ := Option.bind_eq_some_iff.mp written
    cases Option.some.inj written
    cases Option.some.inj completed
    apply effect_disposal_reservation before _ _ _ valid noCompensation
    exact List.filter_sublist

end BpmnSemantics.SemanticProcess.ParallelScopeCommand
