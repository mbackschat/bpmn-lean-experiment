import BpmnSemantics.SemanticProcess.ParallelScopeCommandClosureProofs

/-! # Excluded PMIS waits and incidents

PMIS-ADMIT-01 selects Human and Service arming, and PMIS-DATA-01 admits successful
external completion. Actual Start, singleton execution, reserved batches and
committed ingress preserve empty Message/Timer wait and Effect incident collections.
Predecessor absence is explicit; command reachability and publication compose these
primitive laws downstream.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics InternalCommutation ParallelScopeStart ParallelScopeReplay

/-- The raw Start builder establishes the wait families excluded by PMIS admission. -/
theorem runningProgramStartState_excluded_waits (program : Program) (instanceId : SemanticId)
    (values : List VariableBinding) (after : RuntimeState)
    (started : runningProgramStartState? program instanceId values = some after) :
    after.messageWaits = [] ∧ after.timerWaits = [] ∧ after.effectIncidents = [] := by
  unfold runningProgramStartState? at started
  obtain ⟨root, _, started⟩ := Option.bind_eq_some_iff.mp started
  cases Option.some.inj started
  exact ⟨rfl, rfl, rfl⟩

private theorem issueParallelBodies_excluded_waits (entry : ParallelScopeEntry) (parent : ScopeOccurrenceId)
    (items : List String) (index : Nat) (before after : RuntimeState) (iterations : List ParallelScopeIteration)
    (issued : issueParallelBodies? entry parent items index before = some (after, iterations))
    (prior : before.messageWaits = [] ∧ before.timerWaits = [] ∧ before.effectIncidents = []) :
    after.messageWaits = [] ∧ after.timerWaits = [] ∧ after.effectIncidents = [] := by
  induction items generalizing before index iterations with
  | nil =>
      simp only [issueParallelBodies?, Option.some.injEq, Prod.mk.injEq] at issued
      cases issued.1
      exact prior
  | cons item items ih =>
      unfold issueParallelBodies? at issued
      obtain ⟨variables, _, issued⟩ := Option.bind_eq_some_iff.mp issued
      obtain ⟨⟨successor, rest⟩, generated, issued⟩ := Option.bind_eq_some_iff.mp issued
      cases Option.some.inj issued
      exact ih _ _ _ generated prior

private theorem enterParallelScope_excluded_waits (entry : ParallelScopeEntry) (parent : ScopeOccurrenceId)
    (before after : RuntimeState)
    (prior : before.messageWaits = [] ∧ before.timerWaits = [] ∧ before.effectIncidents = [])
    (entered : enterParallelScope? entry before parent = some after) :
    after.messageWaits = [] ∧ after.timerWaits = [] ∧ after.effectIncidents = [] := by
  unfold enterParallelScope? at entered
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  split at entered
  · cases Option.some.inj entered
    exact prior
  · obtain ⟨⟨issued, iterations⟩, generated, entered⟩ := Option.bind_eq_some_iff.mp entered
    cases iterations with
    | nil => contradiction
    | cons first rest =>
        cases Option.some.inj entered
        exact issueParallelBodies_excluded_waits entry parent _ 0 _ issued (first :: rest) generated prior

private theorem cancelScopeSubtree_excluded_waits (before : RuntimeState) (target : ScopeOccurrenceId)
    (disposition : SelectedScopeDisposition)
    (prior : before.messageWaits = [] ∧ before.timerWaits = [] ∧ before.effectIncidents = []) :
    (cancelScopeSubtree before target disposition).messageWaits = [] ∧
      (cancelScopeSubtree before target disposition).timerWaits = [] ∧
      (cancelScopeSubtree before target disposition).effectIncidents = [] := by
  simp [cancelScopeSubtree, prior.1, prior.2.1, prior.2.2]

private theorem cancelParallelBodies_excluded_waits (iterations : List ParallelScopeIteration)
    (before : RuntimeState)
    (prior : before.messageWaits = [] ∧ before.timerWaits = [] ∧ before.effectIncidents = []) :
    let after := iterations.foldl (fun current iteration => cancelScopeSubtree current iteration.scope .remove) before
    after.messageWaits = [] ∧ after.timerWaits = [] ∧ after.effectIncidents = [] := by
  induction iterations generalizing before with
  | nil => exact prior
  | cons first rest ih => exact ih _ (cancelScopeSubtree_excluded_waits before first.scope .remove prior)

private theorem completeParallelScope_excluded_waits (entry : ParallelScopeEntry) (target : ScopeOccurrenceId)
    (before after : RuntimeState)
    (prior : before.messageWaits = [] ∧ before.timerWaits = [] ∧ before.effectIncidents = [])
    (completed : completeParallelScope? entry before target = some after) :
    after.messageWaits = [] ∧ after.timerWaits = [] ∧ after.effectIncidents = [] := by
  unfold completeParallelScope? at completed
  obtain ⟨binding, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  dsimp only at completed
  split at completed <;> try contradiction
  obtain ⟨variables, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  obtain ⟨condition, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  obtain ⟨retirement, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  rcases retirement with ⟨_, _, _, _⟩ | ⟨_, _⟩ | ⟨_, _, first, rest⟩ <;>
    cases Option.some.inj completed
  · exact cancelScopeSubtree_excluded_waits _ target .remove prior
  · exact cancelScopeSubtree_excluded_waits _ target .remove prior
  · exact cancelParallelBodies_excluded_waits (first :: rest) _
      (cancelScopeSubtree_excluded_waits _ target .remove prior)

private theorem completeScopeState_excluded_waits (before after : RuntimeState)
    (scopeId : DefinitionScopeId) (output : Option ControlPlaceId)
    (prior : before.messageWaits = [] ∧ before.timerWaits = [] ∧ before.effectIncidents = [])
    (completed : completeScopeState? before scopeId output = some after) :
    after.messageWaits = [] ∧ after.timerWaits = [] ∧ after.effectIncidents = [] := by
  unfold completeScopeState? at completed
  split at completed <;> try contradiction
  split at completed <;> try contradiction
  unfold completeQuiescentScope? at completed
  split at completed <;> try contradiction
  all_goals split at completed <;> try contradiction
  all_goals cases Option.some.inj completed; exact prior

private theorem body_excluded_waits (program : Program) (before after : RuntimeState)
    (candidate : InternalOperationOccurrence) (operation : SemanticOperation)
    (resolved : resolveInternalOperationOccurrence? program before candidate = some operation)
    (body : operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect, .duplicate, .synchronize, .reachNoneEnd])
    (prior : before.messageWaits = [] ∧ before.timerWaits = [] ∧ before.effectIncidents = [])
    (applied : applyInternalOperationOccurrence? program before candidate = some after) :
    after.messageWaits = [] ∧ after.timerWaits = [] ∧ after.effectIncidents = [] := by
  cases control : before.control <;>
    simp only [applyInternalOperationOccurrence?, control, resolved, bind, Option.bind_some] at applied <;> try contradiction
  cases operation <;> simp [SemanticOperation.kind] at body
  all_goals repeat' first
    | contradiction
    | (cases Option.some.inj applied; exact prior)
    | split at applied
    | (obtain ⟨_, _, applied⟩ := Option.bind_eq_some_iff.mp applied)

/-- Actual execution of an admitted PMIS operation retains all three excluded wait families. -/
theorem applyInternalOperationOccurrence_parallelScope_excluded_waits
    (program : Program) (analysis : ProgramAnalysis) (admitted : analyzeProgram program = some analysis)
    (before after : RuntimeState) (candidate : InternalOperationOccurrence)
    (prior : before.messageWaits = [] ∧ before.timerWaits = [] ∧ before.effectIncidents = [])
    (applied : applyInternalOperationOccurrence? program before candidate = some after) :
    after.messageWaits = [] ∧ after.timerWaits = [] ∧ after.effectIncidents = [] := by
  have profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft" := by
    cases selected : programSelected program with
    | false => simp [analyzeProgram, selected] at admitted
    | true => simpa only [programSelected, beq_iff_eq] using selected
  obtain ⟨operation, resolved, _, replayed⟩ := applyInternalOperationOccurrence_replay_record
    program before after candidate profile applied
  let record : InternalTransitionRecord := {
    operationId := candidate.operationId
    operationKind := operation.kind
    origin := operation.origin
    owner := candidate.owner
    mergeInput := none }
  have replay : replayInternalOperationOccurrence? program before record = some after := replayed
  by_cases body : operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect, .duplicate, .synchronize, .reachNoneEnd]
  · exact body_excluded_waits program before after candidate operation resolved body prior applied
  · cases operation <;> simp [SemanticOperation.kind] at body
    case initiate =>
      obtain ⟨output, _, _, _, _, _, initiated⟩ := replayed_initiation_execution program before after record rfl replay
      unfold initiateState? at initiated
      obtain ⟨_, _, initiated⟩ := Option.bind_eq_some_iff.mp initiated
      split at initiated <;> try contradiction
      cases Option.some.inj initiated
      exact prior
    case enterParallelMultiInstanceScope =>
      have entered := replayed_parallel_entry_execution program analysis admitted before after record rfl replay
      exact enterParallelScope_excluded_waits _ _ before after prior entered
    case completeParallelMultiInstanceScope =>
      obtain ⟨entry, _, completed⟩ := replayed_retirement_execution program before after record rfl replay
      exact completeParallelScope_excluded_waits entry candidate.owner before after prior completed
    case completeScope =>
      obtain ⟨scopeId, output, _, _, _, _, completed⟩ := replayed_scope_completion_execution program before after record rfl replay
      obtain ⟨unmonitored, unbounded⟩ := admitted_completion_unwrapped program analysis admitted scopeId
      rw [completeSelectedScope?, unmonitored, completeBoundedScope_eq_completeScope_of_unbounded program before scopeId output unbounded] at completed
      exact completeScopeState_excluded_waits before after scopeId output prior completed
    all_goals cases control : before.control <;>
      simp only [applyInternalOperationOccurrence?, control, resolved, bind, Option.bind_some] at applied <;> contradiction

/-- Frozen Human, Service and token patches preserve absence at every actual batch successor. -/
theorem applyInternalOccurrenceBatch_excluded_waits
    (program : Program) (before : RuntimeState) (batch : InternalOccurrenceBatch)
    (successors : List RuntimeState)
    (prior : before.messageWaits = [] ∧ before.timerWaits = [] ∧ before.effectIncidents = [])
    (applied : applyInternalOccurrenceBatch? program before batch = some successors) :
    ∀ after ∈ successors, after.messageWaits = [] ∧ after.timerWaits = [] ∧ after.effectIncidents = [] := by
  refine applyInternalOccurrenceBatch_prefix_induction program before batch successors
    (fun state => state.messageWaits = [] ∧ state.timerWaits = [] ∧ state.effectIncidents = []) prior ?_ applied
  intro state patch _ prepared prior
  cases patch with
  | token patch => exact prior
  | arm arm =>
      change prepareReservedOccurrenceArm? program state ⟨arm.operation.id, arm.owner⟩
        arm.write.occurrence.activation = some arm at prepared
      generalize allocated : arm.write.occurrence.activation = activation at prepared
      obtain ⟨runtimeId, operation, input, _, _, _, _, _, _, _, _, _, _, shape, _, _⟩ :=
        prepareReservedOccurrenceArm_gate_provenance program state ⟨arm.operation.id, arm.owner⟩
          activation arm prepared
      cases operation <;> simp only [ReservedArmWriteShape] at shape <;> try contradiction
      case awaitUserTask => simp only [InternalOccurrencePatch.apply, applyInternalArmingPatch, shape]; exact prior
      case awaitEffect =>
        obtain ⟨_, _, write⟩ := shape
        simp only [InternalOccurrencePatch.apply, applyInternalArmingPatch, write]
        exact prior

/-- Both actual Human completion routes retain the excluded wait families. -/
theorem ParallelScopeCommand.completeTask_excluded_waits (program : Program) (before after : RuntimeState)
    (id : UserTaskInstanceId) (values : List VariableBinding)
    (prior : before.messageWaits = [] ∧ before.timerWaits = [] ∧ before.effectIncidents = [])
    (completed : ParallelScopeCommand.completeTask? program before id values = some after) :
    after.messageWaits = [] ∧ after.timerWaits = [] ∧ after.effectIncidents = [] := by
  unfold ParallelScopeCommand.completeTask? at completed
  split at completed <;> try contradiction
  split at completed
  · unfold completeParallelScopeUserTask? at completed
    split at completed <;> try contradiction
    split at completed <;> try contradiction
    obtain ⟨_, _, completed⟩ := Option.bind_eq_some_iff.mp completed
    cases Option.some.inj completed
    exact prior
  · obtain ⟨_, applied, completed⟩ := Option.bind_eq_some_iff.mp completed
    unfold completeUserTask at applied
    split at applied <;> try contradiction
    cases Option.some.inj applied
    cases Option.some.inj completed
    exact prior

/-- Actual successful scoped and ordinary Service completion retain the excluded wait families. -/
theorem ParallelScopeCommand.completeEffect_success_excluded_waits
    (program : Program) (before after : RuntimeState) (id : EffectOccurrenceId) (values : List VariableBinding)
    (prior : before.messageWaits = [] ∧ before.timerWaits = [] ∧ before.effectIncidents = [])
    (completed : ParallelScopeCommand.completeEffect? program before id (.success values) = some after) :
    after.messageWaits = [] ∧ after.timerWaits = [] ∧ after.effectIncidents = [] := by
  unfold ParallelScopeCommand.completeEffect? at completed
  split at completed <;> try contradiction
  rename_i candidates wait selected
  split at completed
  · unfold completeParallelScopeEffect? at completed
    split at completed <;> try contradiction
    split at completed <;> try contradiction
    split at completed <;> try contradiction
    split at completed <;> try contradiction
    obtain ⟨_, _, completed⟩ := Option.bind_eq_some_iff.mp completed
    obtain ⟨_, _, completed⟩ := Option.bind_eq_some_iff.mp completed
    cases Option.some.inj completed
    exact prior
    case h_2 =>
      rename_i result impossible
      exact False.elim (impossible values rfl)
  · simp only [completeSerialEffect?, selected] at completed
    obtain ⟨_, _, completed⟩ := Option.bind_eq_some_iff.mp completed
    cases Option.some.inj completed
    exact prior

/-- PMIS committed ingress cannot introduce a wait family excluded by its command admission. -/
theorem admitStimulus_parallelScope_excluded_waits
    (program : Program) (analysis : ProgramAnalysis) (admitted : analyzeProgram program = some analysis)
    (before : RuntimeState) (stimulus : Stimulus)
    (prior : before.messageWaits = [] ∧ before.timerWaits = [] ∧ before.effectIncidents = [])
    (committed : (admitStimulus program before stimulus).outcome = .committed) :
    (admitStimulus program before stimulus).state.messageWaits = [] ∧
      (admitStimulus program before stimulus).state.timerWaits = [] ∧
      (admitStimulus program before stimulus).state.effectIncidents = [] := by
  have selected : programSelected program = true := by
    cases chosen : programSelected program with
    | false => simp [analyzeProgram, chosen] at admitted
    | true => rfl
  rcases parallelScope_committed_ingress_kind program selected before stimulus committed with
    ⟨commandId, processId, instanceId, values, rfl, notStarted⟩ | completion
  · cases snapshot : program.compensationEventSubProcessSnapshots <;>
      simp [admitStimulus, snapshot, notStarted, prior.2.2] at committed ⊢
    all_goals repeat' first
      | contradiction
      | exact prior
      | (apply runningProgramStartState_excluded_waits; assumption)
      | split
  · cases stimulus <;> simp only [waitCompletionStimulus] at completion <;> try contradiction
    case completeUserTaskInstance =>
      cases snapshot : program.compensationEventSubProcessSnapshots <;>
        cases control : before.control <;> simp [admitStimulus, snapshot, selected, control, prior.2.2]
      all_goals repeat' first
        | exact prior
        | exact ⟨prior.1, prior.2.1⟩
        | (apply ParallelScopeCommand.completeTask_excluded_waits program before _ _ _ prior; assumption)
        | split
    case completeEffect commandId id result =>
      cases result <;> simp only at completion <;> try contradiction
      cases snapshot : program.compensationEventSubProcessSnapshots <;>
        cases control : before.control <;> simp [admitStimulus, snapshot, selected, control, prior.2.2]
      all_goals repeat' first
        | exact prior
        | exact ⟨prior.1, prior.2.1⟩
        | (apply ParallelScopeCommand.completeEffect_success_excluded_waits program before _ _ _ prior; assumption)
        | split

end BpmnSemantics.SemanticProcess
