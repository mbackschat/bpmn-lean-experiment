import BpmnSemantics.SemanticProcess.ParallelScopeServiceInputProofs

/-! # Stored Service mapping provenance

PMIS-DATA-01 stores the admitted output list when creating a Service wait.
The target-uniqueness invariant follows actual issuance and removal through the
existing histories; declaration-key validity alone does not establish it.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics InternalCommutation ParallelScopeReplay

/-- Stored Service outputs have distinct target names. -/
def EffectOutputTargetsUnique (state : RuntimeState) : Prop :=
  ∀ wait ∈ state.effectWaits, (wait.outputMappings.map (·.target)).Nodup

private theorem start_outputs (program : Program) (instanceId : SemanticId)
    (values : List VariableBinding) (state : RuntimeState)
    (started : runningProgramStartState? program instanceId values = some state) : EffectOutputTargetsUnique state := by
  unfold runningProgramStartState? at started
  obtain ⟨root, _, started⟩ := Option.bind_eq_some_iff.mp started
  cases Option.some.inj started
  simp [EffectOutputTargetsUnique, runningStartState, initialState]

private theorem initiation_outputs (before after : RuntimeState) (output : ControlPlaceId)
    (initiated : initiateState? before output = some after) (valid : EffectOutputTargetsUnique before) : EffectOutputTargetsUnique after := by
  unfold initiateState? at initiated
  obtain ⟨owner, _, initiated⟩ := Option.bind_eq_some_iff.mp initiated
  split at initiated <;> try contradiction
  cases Option.some.inj initiated
  exact valid

private theorem issued_effect_waits (entry : ParallelScopeEntry) (parent : ScopeOccurrenceId)
    (items : List String) (index : Nat) (before after : RuntimeState) (iterations : List ParallelScopeIteration)
    (issued : issueParallelBodies? entry parent items index before = some (after, iterations)) :
    after.effectWaits = before.effectWaits := by
  induction items generalizing before after index iterations with
  | nil =>
    simp only [issueParallelBodies?, Option.some.injEq, Prod.mk.injEq] at issued
    exact issued.1 ▸ rfl
  | cons item rest ih =>
    unfold issueParallelBodies? at issued
    obtain ⟨variables, _, issued⟩ := Option.bind_eq_some_iff.mp issued
    obtain ⟨⟨successor, tail⟩, generated, issued⟩ := Option.bind_eq_some_iff.mp issued
    cases Option.some.inj issued
    have frame := ih _ _ _ _ generated
    exact frame

private theorem entry_outputs (entry : ParallelScopeEntry) (parent : ScopeOccurrenceId)
    (before after : RuntimeState) (entered : enterParallelScope? entry before parent = some after)
    (valid : EffectOutputTargetsUnique before) : EffectOutputTargetsUnique after := by
  unfold enterParallelScope? at entered
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  split at entered
  · cases Option.some.inj entered; exact valid
  · obtain ⟨⟨issued, iterations⟩, generated, entered⟩ := Option.bind_eq_some_iff.mp entered
    cases iterations with
    | nil => contradiction
    | cons first rest =>
      cases Option.some.inj entered
      intro wait member
      rw [issued_effect_waits entry parent _ 0 _ issued (first :: rest) generated] at member
      exact valid wait member

private theorem cancelled_outputs (state : RuntimeState) (owner : ScopeOccurrenceId)
    (valid : EffectOutputTargetsUnique state) : EffectOutputTargetsUnique (cancelScopeSubtree state owner .remove) := by
  intro wait member
  exact valid wait (List.filter_sublist.subset member)

private theorem cancelled_bodies_outputs (iterations : List ParallelScopeIteration) (state : RuntimeState)
    (valid : EffectOutputTargetsUnique state) : EffectOutputTargetsUnique
      (iterations.foldl (fun current iteration => cancelScopeSubtree current iteration.scope .remove) state) := by
  induction iterations generalizing state with
  | nil => exact valid
  | cons first rest ih => exact ih _ (cancelled_outputs state first.scope valid)

private theorem retirement_outputs (entry : ParallelScopeEntry) (owner : ScopeOccurrenceId)
    (before after : RuntimeState) (completed : completeParallelScope? entry before owner = some after)
    (valid : EffectOutputTargetsUnique before) : EffectOutputTargetsUnique after := by
  unfold completeParallelScope? at completed
  obtain ⟨binding, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  dsimp only at completed
  split at completed <;> try contradiction
  obtain ⟨variables, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  obtain ⟨condition, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  obtain ⟨retirement, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  rcases retirement with ⟨_, _, _, _⟩ | ⟨_, _⟩ | ⟨_, _, first, rest⟩ <;>
    cases Option.some.inj completed
  · exact cancelled_outputs _ owner valid
  · exact cancelled_outputs _ owner valid
  · exact cancelled_bodies_outputs (first :: rest) _ (cancelled_outputs _ owner valid)

private theorem body_outputs (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (analyzed : ParallelScopeStart.analyzeProgram program = some analysis)
    (before after : RuntimeState) (candidate : InternalOperationOccurrence) (operation : SemanticOperation)
    (resolved : resolveInternalOperationOccurrence? program before candidate = some operation)
    (kind : operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect, .duplicate, .synchronize, .reachNoneEnd])
    (applied : applyInternalOperationOccurrence? program before candidate = some after)
    (valid : EffectOutputTargetsUnique before) : EffectOutputTargetsUnique after := by
  have declared := (resolveInternalOperationOccurrence_declaration program before candidate operation resolved).1
  cases control : before.control <;> simp only [applyInternalOperationOccurrence?, control, bind] at applied <;> try contradiction
  cases operation <;> simp only [SemanticOperation.kind, List.mem_cons] at kind <;> try contradiction
  all_goals simp only [resolved, Option.bind_some] at applied
  case awaitUserTask =>
    split at applied <;> try contradiction
    split at applied
    · obtain ⟨_, _, applied⟩ := Option.bind_eq_some_iff.mp applied
      cases Option.some.inj applied
      exact valid
    · cases Option.some.inj applied
      exact valid
  case awaitEffect id origin input output effect route =>
    have unique := ParallelScopeStart.effect_output_targets_unique program analysis analyzed id origin input output effect route declared
    split at applied <;> try contradiction
    split at applied
    all_goals obtain ⟨arguments, _, applied⟩ := Option.bind_eq_some_iff.mp applied
    all_goals cases Option.some.inj applied
    all_goals
      intro wait member
      simp only [activateEffect, insertEffectWait, mem_canonicalInsertBy] at member
      rcases member with rfl | retained
      · exact unique
      · exact valid wait retained
  all_goals
    split at applied <;> try contradiction
    cases Option.some.inj applied
    exact valid

private theorem human_outputs (program : Program) (before after : RuntimeState)
    (id : UserTaskInstanceId) (values : List VariableBinding)
    (completed : ParallelScopeCommand.completeTask? program before id values = some after)
    (valid : EffectOutputTargetsUnique before) : EffectOutputTargetsUnique after := by
  unfold ParallelScopeCommand.completeTask? at completed
  split at completed <;> try contradiction
  split at completed
  · unfold completeParallelScopeUserTask? at completed
    split at completed <;> try contradiction
    split at completed <;> try contradiction
    obtain ⟨variables, _, completed⟩ := Option.bind_eq_some_iff.mp completed
    cases Option.some.inj completed
    exact valid
  · obtain ⟨middle, applied, completed⟩ := Option.bind_eq_some_iff.mp completed
    unfold completeUserTask at applied
    split at applied <;> try contradiction
    cases Option.some.inj applied
    cases Option.some.inj completed
    exact valid

private theorem service_outputs (program : Program) (before after : RuntimeState)
    (id : EffectOccurrenceId) (values : List VariableBinding)
    (completed : ParallelScopeCommand.completeEffect? program before id (.success values) = some after)
    (valid : EffectOutputTargetsUnique before) : EffectOutputTargetsUnique after := by
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
    obtain ⟨variables, _, completed⟩ := Option.bind_eq_some_iff.mp completed
    cases Option.some.inj completed
    exact fun retained member => valid retained (List.erase_sublist.subset member)
    case h_2 =>
      rename_i result impossible
      exact False.elim (impossible values rfl)
  · simp only [completeSerialEffect?, selected] at completed
    obtain ⟨variables, _, completed⟩ := Option.bind_eq_some_iff.mp completed
    cases Option.some.inj completed
    exact fun retained member => valid retained (List.erase_sublist.subset member)

private theorem admission_outputs (program : Program) (before : RuntimeState) (stimulus : Stimulus)
    (selected : ParallelScopeStart.programSelected program = true) (completion : waitCompletionStimulus stimulus)
    (valid : EffectOutputTargetsUnique before) : EffectOutputTargetsUnique (admitStimulus program before stimulus).state := by
  apply admitStimulus_wait_preserves program before stimulus selected completion EffectOutputTargetsUnique valid
  · intro id values after completed
    exact human_outputs program before after id values completed valid
  · intro id values after completed
    exact service_outputs program before after id values completed valid

private theorem parent_outputs (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (analyzed : ParallelScopeStart.analyzeProgram program = some analysis) (parent : ScopeOccurrenceId) (state : RuntimeState)
    (history : ParallelScopeParentHistory program analysis.entry parent state) : EffectOutputTargetsUnique state := by
  induction history with
  | start instanceId root values state selected started owner distinct => exact start_outputs program instanceId values state started
  | @initiate before after history output declared applied ih => exact initiation_outputs before after output applied ih
  | @body before after history candidate operation resolved kind applied ih =>
    exact body_outputs program analysis analyzed before after candidate operation resolved kind applied ih
  | @human before after history id values wait selected ordinary applied ih => exact human_outputs program before after id values applied ih
  | @service before after history id values wait selected ordinary applied ih => exact service_outputs program before after id values applied ih

private theorem replay_outputs (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (analyzed : ParallelScopeStart.analyzeProgram program = some analysis) (before after : RuntimeState)
    (record : InternalTransitionRecord) (kind : bodyOrRetirementTransition (.internalOperation record))
    (replayed : replayInternalOperationOccurrence? program before record = some after)
    (valid : EffectOutputTargetsUnique before) : EffectOutputTargetsUnique after := by
  rcases kind with body | retirement
  · obtain ⟨operation, resolved, metadata, _, _, applied⟩ := replayInternalOperationOccurrence_sound program before after record replayed
    exact body_outputs program analysis analyzed before after _ operation resolved (by rw [metadata]; exact body) applied valid
  · obtain ⟨entry, _, completed⟩ := replayed_retirement_execution program before after record retirement replayed
    exact retirement_outputs entry record.owner before after completed valid

private theorem internal_outputs (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (analyzed : ParallelScopeStart.analyzeProgram program = some analysis)
    (selected : ParallelScopeStart.programSelected program = true) (before after : RuntimeState)
    (records : List CommittedTransition) (replayed : internalTransitions? program before records = some after)
    (kinds : ∀ record ∈ records, bodyOrRetirementTransition record)
    (valid : EffectOutputTargetsUnique before) : EffectOutputTargetsUnique after := by
  induction records generalizing before with
  | nil =>
    have same : before = after := by simpa only [internalTransitions?, Option.some.injEq] using replayed
    exact same ▸ valid
  | cons record rest ih =>
    cases record with
    | externalStimulus => simp [internalTransitions?] at replayed
    | internalOperation record =>
      simp only [internalTransitions?] at replayed
      obtain ⟨next, applied, followed⟩ := Option.bind_eq_some_iff.mp replayed
      have actual : replayInternalOperationOccurrence? program before record = some next := by
        simpa [internalTransition?, selected] using applied
      exact ih next followed (fun record member => kinds record (by simp [member]))
        (replay_outputs program analysis analyzed before next record (kinds _ (by simp)) actual valid)

private theorem history_outputs (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (analyzed : ParallelScopeStart.analyzeProgram program = some analysis)
    (selected : ParallelScopeStart.programSelected program = true) (owner : ScopeOccurrenceId)
    (initial current : RuntimeState) (records : List CommittedTransition)
    (history : ContinuationCommandHistory program owner initial current records)
    (valid : EffectOutputTargetsUnique initial) : EffectOutputTargetsUnique current := by
  induction history with
  | initial => exact valid
  | @internalStep before after earlier record history replayed kind outside ih =>
    exact replay_outputs program analysis analyzed before after record kind replayed ih
  | @command before after earlier rest stimulus history replayed completion kinds outside ih =>
    simp only [committedTransitions?, selected, Bool.not_true, Bool.false_eq_true, ↓reduceIte] at replayed
    cases snapshot : program.compensationEventSubProcessSnapshots with
    | some value => simp [snapshot] at replayed
    | none =>
      simp only [snapshot] at replayed
      split at replayed <;> try contradiction
      exact internal_outputs program analysis analyzed selected _ after rest replayed kinds
        (admission_outputs program before stimulus selected completion ih)

private theorem phase_outputs (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (analyzed : ParallelScopeStart.analyzeProgram program = some analysis)
    (selected : ParallelScopeStart.programSelected program = true) (owner parent : ScopeOccurrenceId)
    (initial current : RuntimeState) (records : List CommittedTransition)
    (phase : ParallelScopeSchedulerPhase program analysis owner parent initial current records) : EffectOutputTargetsUnique current := by
  rcases phase with ⟨parents, _⟩ | ⟨before, issued, prior, entryRecord, suffix, _, parents, _, _, _, entered, later⟩
  · exact parent_outputs program analysis analyzed parent current parents
  · have initialValid := entry_outputs analysis.entry parent before issued entered (parent_outputs program analysis analyzed parent before parents)
    rcases later with history | ⟨terminalPrefix, record, middle, _, history, kind, replayed, _, _⟩
    · exact history_outputs program analysis analyzed selected owner issued current suffix history initialValid
    · have middleValid := history_outputs program analysis analyzed selected owner issued middle terminalPrefix history initialValid
      obtain ⟨scopeId, output, _, _, _, _, completed⟩ := replayed_scope_completion_execution program middle current record kind replayed
      obtain ⟨unmonitored, unbounded⟩ := admitted_completion_unwrapped program analysis analyzed scopeId
      rw [completeSelectedScope?, unmonitored,
        completeBoundedScope_eq_completeScope_of_unbounded program middle scopeId output unbounded] at completed
      unfold completeScopeState? at completed
      split at completed <;> try contradiction
      split at completed <;> try contradiction
      unfold completeQuiescentScope? at completed
      split at completed <;> try contradiction
      all_goals repeat' (split at completed <;> try contradiction)
      all_goals cases Option.some.inj completed; exact middleValid

/-- Actual command-prefix provenance carries admitted output-target uniqueness
through native and reserved issuance, completion, retirement and cancellation.
-/
theorem ParallelScopeInternalPrefixReachable.effect_output_targets_unique (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis) (analyzed : ParallelScopeStart.analyzeProgram program = some analysis)
    (state : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program state) : EffectOutputTargetsUnique state := by
  have selected : ParallelScopeStart.programSelected program = true := by
    cases chosen : ParallelScopeStart.programSelected program with
    | false => simp [ParallelScopeStart.analyzeProgram, chosen] at analyzed
    | true => rfl
  obtain ⟨seed, _, phases⟩ := reachable.start_certificate program analysis analyzed state
  rcases phases ⟨seed.instanceId, analysis.entry.childScopeId, 1⟩ rfl with rfl |
    ⟨id, origin, output, initial, records, _, _, phase⟩
  · exact start_outputs program seed.instanceId seed.values seed.ready seed.started
  · exact phase_outputs program analysis analyzed selected _ seed.parent initial state records phase


/-- Completed command boundaries retain the same stored target provenance as
internal prefixes; the initial boundary contains no wait.
-/
theorem ParallelScopeCommandBoundaryReachable.effect_output_targets_unique (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis) (analyzed : ParallelScopeStart.analyzeProgram program = some analysis)
    (state : RuntimeState) (reachable : ParallelScopeCommandBoundaryReachable program state) : EffectOutputTargetsUnique state := by
  have selected : ParallelScopeStart.programSelected program = true := by
    cases chosen : ParallelScopeStart.programSelected program with
    | false => simp [ParallelScopeStart.analyzeProgram, chosen] at analyzed
    | true => rfl
  rcases reachable.start_certificate program analysis analyzed state with rfl | ⟨seed, _, phases⟩
  · simp [EffectOutputTargetsUnique, initialState]
  · rcases phases ⟨seed.instanceId, analysis.entry.childScopeId, 1⟩ rfl with rfl |
      ⟨id, origin, output, initial, records, _, _, phase⟩
    · exact start_outputs program seed.instanceId seed.values seed.ready seed.started
    · exact phase_outputs program analysis analyzed selected _ seed.parent initial state records phase

/-- The actual prefix now supplies the stored-target premise of ordinary Service
completion; the caller supplies only the scalar read that must be preserved.
-/
theorem ParallelScopeInternalPrefixReachable.service_completion_preserves_scalar_read (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis) (analyzed : ParallelScopeStart.analyzeProgram program = some analysis)
    (before after : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program before)
    (id : EffectOccurrenceId) (result : EffectExecutionResult)
    (completed : ParallelScopeCommand.completeEffect? program before id result = some after)
    (name : String) (notCondition : analysis.entry.completionBooleanName ≠ some name)
    (available : ∃ value, enclosingVariable? before.variables.process.bindings name = some value) :
    ∃ value, enclosingVariable? after.variables.process.bindings name = some value :=
  ParallelScopeCommand.completeEffect_scalar_read program analysis analyzed before after id result
    (reachable.effect_output_targets_unique program analysis analyzed before) completed name notCondition available


private theorem admitted_wait_scalar_read (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (analyzed : ParallelScopeStart.analyzeProgram program = some analysis)
    (selected : ParallelScopeStart.programSelected program = true) (before : RuntimeState)
    (stimulus : Stimulus) (completion : waitCompletionStimulus stimulus)
    (committed : (admitStimulus program before stimulus).outcome = .committed)
    (outputs : EffectOutputTargetsUnique before) (name : String)
    (notCondition : analysis.entry.completionBooleanName ≠ some name)
    (available : ∃ value, enclosingVariable? before.variables.process.bindings name = some value) :
    ∃ value, enclosingVariable? (admitStimulus program before stimulus).state.variables.process.bindings name = some value := by
  have admitted : ParallelScopeCommand.stimulusAdmitted program before stimulus = true := by
    cases checked : ParallelScopeCommand.stimulusAdmitted program before stimulus with
    | false =>
      cases snapshot : program.compensationEventSubProcessSnapshots <;> simp [admitStimulus, snapshot, checked] at committed
    | true => rfl
  cases stimulus <;> simp only [waitCompletionStimulus] at completion <;> try contradiction
  case completeUserTaskInstance commandId id values =>
    have dataAdmitted : ParallelScopeCommand.humanValuesAdmitted analysis values = true := by
      simp only [ParallelScopeCommand.stimulusAdmitted, selected, Bool.not_true, Bool.false_eq_true, ↓reduceIte, analyzed] at admitted
      split at admitted <;> try contradiction
      exact (Bool.and_eq_true_iff.mp admitted).2
    cases snapshot : program.compensationEventSubProcessSnapshots <;>
      cases control : before.control <;> simp [admitStimulus, snapshot, selected, control]
    all_goals repeat' first
      | exact available
      | (apply ParallelScopeCommand.completeTask_scalar_read program analysis analyzed before _ id values dataAdmitted _ name notCondition available; assumption)
      | split
  case completeEffect commandId id result =>
    cases result <;> simp only at completion <;> try contradiction
    rename_i values
    cases snapshot : program.compensationEventSubProcessSnapshots <;>
      cases control : before.control <;> simp [admitStimulus, snapshot, selected, control]
    all_goals repeat' first
      | exact available
      | (apply ParallelScopeCommand.completeEffect_scalar_read program analysis analyzed before _ id (.success values) outputs _ name notCondition available; assumption)
      | split

private theorem ingress_scalar_read (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (analyzed : ParallelScopeStart.analyzeProgram program = some analysis)
    (selected : ParallelScopeStart.programSelected program = true)
    (before : RuntimeState) (reachable : ParallelScopeCommandBoundaryReachable program before)
    (stimulus : Stimulus) (committed : (admitStimulus program before stimulus).outcome = .committed)
    (name : String) (required : name ∈ analysis.required)
    (notCollection : name ≠ analysis.entry.collectionName) (notCondition : analysis.entry.completionBooleanName ≠ some name) :
    ∃ value, enclosingVariable? (admitStimulus program before stimulus).state.variables.process.bindings name = some value := by
  rcases reachable.start_certificate program analysis analyzed before with rfl | ⟨seed, _, phases⟩
  · obtain ⟨commandId, processId, instanceId, values, rfl⟩ := parallelScope_initial_committed_is_start program selected stimulus committed
    obtain ⟨started, capacity, accepted⟩ := parallelScope_committed_start_exact program selected commandId processId instanceId values committed
    have available := ParallelScopeStart.capacity_scalar_read program analysis analyzed values capacity accepted name required notCollection notCondition
    unfold runningProgramStartState? at started
    obtain ⟨root, _, started⟩ := Option.bind_eq_some_iff.mp started
    have process := congrArg (fun state : RuntimeState => state.variables.process.bindings) (Option.some.inj started).symm
    change (admitStimulus program initialState (.startProcess commandId processId instanceId values)).state.variables.process.bindings = values at process
    rw [process]
    exact available
  · have alreadyStarted : before.control ≠ .notStarted := by
      rcases phases ⟨seed.instanceId, analysis.entry.childScopeId, 1⟩ rfl with rfl |
        ⟨id, origin, output, initial, records, _, _, phase⟩
      · rw [runningProgramStartState_control program seed.instanceId seed.values seed.ready seed.started]
        simp
      · exact phase.not_notStarted program analysis selected _ _ initial before records
    have completion : waitCompletionStimulus stimulus := by
      rcases parallelScope_committed_ingress_kind program selected before stimulus committed with ⟨_, _, _, _, _, control⟩ | completion
      · exact False.elim (alreadyStarted control)
      · exact completion
    have checked := parallelScope_committed_resumption_capacity program analysis before stimulus selected analyzed completion committed
    obtain ⟨capacity, accepted⟩ := Option.isSome_iff_exists.mp checked
    have startCapacity := ParallelScopeStart.programStateCapacity_retains_start_capacity program before capacity accepted
    have available := ParallelScopeStart.capacity_scalar_read program analysis analyzed before.variables.process.bindings capacity
      startCapacity name required notCollection notCondition
    exact admitted_wait_scalar_read program analysis analyzed selected before stimulus completion committed
      (reachable.effect_output_targets_unique program analysis analyzed before) name notCondition available

private theorem singleton_process_frame (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (analyzed : ParallelScopeStart.analyzeProgram program = some analysis)
    (profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft")
    (before after : RuntimeState) (candidate : InternalOperationOccurrence)
    (applied : applyInternalOperationOccurrence? program before candidate = some after) :
    after.variables.process = before.variables.process := by
  obtain ⟨operation, resolved, _, replayed⟩ := applyInternalOperationOccurrence_replay_record program before after candidate profile applied
  let record : InternalTransitionRecord := {
    operationId := candidate.operationId
    operationKind := operation.kind
    origin := operation.origin
    owner := candidate.owner
    mergeInput := none }
  have replay : replayInternalOperationOccurrence? program before record = some after := replayed
  by_cases body : operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect, .duplicate, .synchronize, .reachNoneEnd]
  · exact (applyInternalOperationOccurrence_body_retirement_frame program before after candidate operation resolved body applied).2.2.2.2.2
  · cases operation <;> simp [SemanticOperation.kind] at body
    case initiate =>
      obtain ⟨output, _, _, _, _, _, initiated⟩ := replayed_initiation_execution program before after record rfl replay
      unfold initiateState? at initiated
      obtain ⟨owner, _, initiated⟩ := Option.bind_eq_some_iff.mp initiated
      split at initiated <;> try contradiction
      cases Option.some.inj initiated
      rfl
    case enterParallelMultiInstanceScope =>
      exact enterParallelScope_preserves_process (replayed_parallel_entry_execution program analysis analyzed before after record rfl replay)
    case completeParallelMultiInstanceScope =>
      obtain ⟨entry, _, completed⟩ := replayed_retirement_execution program before after record rfl replay
      exact completeParallelScope_preserves_process completed
    case completeScope =>
      obtain ⟨scopeId, output, _, _, _, _, completed⟩ := replayed_scope_completion_execution program before after record rfl replay
      obtain ⟨unmonitored, unbounded⟩ := admitted_completion_unwrapped program analysis analyzed scopeId
      rw [completeSelectedScope?, unmonitored,
        completeBoundedScope_eq_completeScope_of_unbounded program before scopeId output unbounded] at completed
      unfold completeScopeState? at completed
      split at completed <;> try contradiction
      split at completed <;> try contradiction
      unfold completeQuiescentScope? at completed
      all_goals repeat' (split at completed <;> try contradiction)
      all_goals cases Option.some.inj completed; rfl
    all_goals cases control : before.control <;>
      simp only [applyInternalOperationOccurrence?, control, resolved, bind, Option.bind_some] at applied <;> contradiction

/-- Required scalar reads remain available at every actual command prefix.
Admission supplies the checked predecessor data; actual writes preserve lookup,
and all selected internal operations preserve the Process store.
-/
theorem ParallelScopeInternalPrefixReachable.required_scalar_read (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis) (analyzed : ParallelScopeStart.analyzeProgram program = some analysis)
    (state : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program state)
    (name : String) (required : name ∈ analysis.required)
    (notCollection : name ≠ analysis.entry.collectionName) (notCondition : analysis.entry.completionBooleanName ≠ some name) :
    ∃ value, enclosingVariable? state.variables.process.bindings name = some value := by
  have selected : ParallelScopeStart.programSelected program = true := by
    cases chosen : ParallelScopeStart.programSelected program with
    | false => simp [ParallelScopeStart.analyzeProgram, chosen] at analyzed
    | true => rfl
  have profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft" := by
    simpa only [ParallelScopeStart.programSelected, beq_iff_eq] using selected
  induction reachable with
  | admitted before stimulus boundary committed =>
    exact ingress_scalar_read program analysis analyzed selected before boundary stimulus committed name required notCollection notCondition
  | singleton before after ordinal schedule remaining consumed offer candidate preceding chosen alternative applied ih =>
    rw [singleton_process_frame program analysis analyzed profile before after candidate applied]
    exact ih
  | batch before after ordinal schedule remaining consumed offers batch successors preceding chosen reserved alternatives applied endpoint ih =>
    have frames := applyInternalOccurrenceBatch_prefix_induction program before batch successors
      (fun current => current.variables.process = before.variables.process) rfl
      (fun current patch _ _ prior => (patch.retirement_frame current).2.2.2.2.2.trans prior) applied
    have member : after ∈ successors := List.mem_of_getLast? endpoint
    rw [frames after member]
    exact ih

/-- Native parent Service arming now follows from actual prefix reachability and
its unique input token. Neither evaluated inputs nor stored mapping validity is
supplied by the caller; full reserved scheduler preparation remains separate.
-/
theorem ParallelScopeInternalPrefixReachable.parent_service_enabled (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis) (analyzed : ParallelScopeStart.analyzeProgram program = some analysis)
    (state : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program state)
    (instanceId : SemanticId) (running : state.control = .running instanceId)
    (candidate : InternalOperationOccurrence) (id : OperationId) (origin : BpmnElementOrigin)
    (input output : ControlPlaceId) (effect : EffectDefinition) (route : Option BpmnErrorRoute)
    (resolved : resolveInternalOperationOccurrence? program state candidate = some (.awaitEffect id origin input output effect route))
    (parent : candidate.owner.definitionScopeId ≠ analysis.entry.childScopeId)
    (unit : (state.tokens.filter fun token => token.placeId == input && token.owner == candidate.owner).length = 1) :
    ∃ after, applyInternalOperationOccurrence? program state candidate = some after := by
  obtain ⟨mappings, reads⟩ := ParallelScopeStart.parent_effect_requirements program analysis analyzed state candidate id origin input output effect route resolved parent
  obtain ⟨arguments, evaluated⟩ := SerialBusinessTask.inputs_evaluable analysis.handlers state.variables.process.bindings effect.inputMappings
    (strictlySortedStrings_nodup _ (Bool.and_eq_true_iff.mp (Bool.and_eq_true_iff.mp (Bool.and_eq_true_iff.mp mappings).1).1).1)
    (Bool.and_eq_true_iff.mp (Bool.and_eq_true_iff.mp mappings).1).2
    (fun name member => reachable.required_scalar_read program analysis analyzed state name
      (reads name member).1 (reads name member).2.1 (reads name member).2.2)
  have ordinary : sequentialScopeProgramSelected program = false := by
    have selected : ParallelScopeStart.programSelected program = true := by
      cases chosen : ParallelScopeStart.programSelected program with
      | false => simp [ParallelScopeStart.analyzeProgram, chosen] at analyzed
      | true => rfl
    have profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft" := by
      simpa only [ParallelScopeStart.programSelected, beq_iff_eq] using selected
    simp [sequentialScopeProgramSelected, profile]
  have inputs : evaluateEffectInputs? program state candidate.owner effect.inputMappings = some arguments := by
    simpa only [evaluateEffectInputs?, ordinary, Bool.false_and, Bool.false_eq_true, ↓reduceIte] using evaluated
  exact ⟨_, reachable.parent_effect_enabled program analysis analyzed state instanceId running candidate id origin input output
    effect route resolved parent unit arguments inputs⟩

end BpmnSemantics.SemanticProcess
