module

import BpmnSemantics.SemanticProcess.ParallelScopeBodyInputProofs
import all BpmnSemantics.SemanticProcess.SequentialScopeRuntime
import all BpmnSemantics.SemanticProcess.ParallelScopeData
import BpmnSemantics.SemanticProcess.ParallelScopeReservationSelectionProofs
import BpmnSemantics.SemanticProcess.ParallelScopeRuntimeLaws
public import BpmnSemantics.SemanticProcess.ParallelScopeCommandReplay
public import BpmnSemantics.SemanticProcess.ParallelScopeSchedulerReadinessProofs
import BpmnSemantics.SemanticProcess.ParallelScopeCommandPhaseProofs
import BpmnSemantics.SemanticProcess.ParallelScopeReplayFrames
import BpmnSemantics.SemanticProcess.ParallelScopeReservationAncestryProofs

/-! # Live parallel-body binding provenance

PMIS-SELECT-01 entry binds every issued body. Actual task writes and body steps
retain binding; retirement removes its target and preserves surviving siblings.
The existing command history connects these laws without assuming future progress.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics InternalCommutation ParallelScopeReplay

private theorem binding_claims (entry : ParallelScopeEntry) (state : RuntimeState)
    (target : ScopeOccurrenceId) (binding : ParallelScopeBinding)
    (bound : parallelScopeBinding? entry state target = some binding) :
    activityBodyScopeClaims binding.activity.body = binding.iterations.map (·.scope) := by
  unfold parallelScopeBinding? at bound
  split at bound <;> try contradiction
  split at bound <;> try contradiction
  split at bound <;> try contradiction
  rename_i first rest body
  split at bound <;> try contradiction
  split at bound <;> try contradiction
  dsimp only at bound
  split at bound <;> try contradiction
  cases Option.some.inj bound
  simp [body, activityBodyScopeClaims]

/-- A surviving bound body stays bound when another member of its actual population retires. -/
theorem completeParallelScope_retains_live_binding (entry : ParallelScopeEntry)
    (parent target retired : ScopeOccurrenceId) (before after : RuntimeState)
    (binding : ParallelScopeBinding) (frame : ParallelScopeStructuralFrame parent before)
    (bound : parallelScopeBinding? entry before target = some binding)
    (completed : completeParallelScope? entry before retired = some after)
    (survives : ∃ occurrence ∈ after.scopeOccurrences, occurrence.id = target) :
    ∃ successor, parallelScopeBinding? entry after target = some successor := by
  have checked := completed
  unfold completeParallelScope? at checked
  obtain ⟨retiring, selected, _⟩ := Option.bind_eq_some_iff.mp checked
  have left := (frame.bound_outer entry parent target before binding bound).1
  have right := (frame.bound_outer entry parent retired before retiring selected).1
  have same : binding.activity = retiring.activity := by simpa only [List.cons.injEq, and_true] using left.symm.trans right
  obtain ⟨iteration, member, identity⟩ := parallelScopeBinding_member entry before target binding bound
  have claimed : target ∈ retiring.iterations.map (·.scope) := by
    rw [← binding_claims entry before retired retiring selected, ← same,
      binding_claims entry before target binding bound]
    exact List.mem_map.mpr ⟨iteration, member, identity⟩
  obtain ⟨survivor, included, owned⟩ := List.mem_map.mp claimed
  have different : survivor.scope ≠ retired := by
    obtain ⟨occurrence, present, targetEq⟩ := survives
    intro equal
    exact (completeParallelScope_scope_census entry before after retired completed).2 occurrence present
      (targetEq.trans (owned.symm.trans equal))
  simpa only [owned] using frame.retirement_binding entry parent before after retired retiring survivor
    selected included different completed (by simpa only [owned] using survives)

private theorem human_binding (program : Program) (before after : RuntimeState)
    (id : UserTaskInstanceId) (values : List VariableBinding)
    (completed : ParallelScopeCommand.completeTask? program before id values = some after)
    (entry : ParallelScopeEntry) (target : ScopeOccurrenceId) :
    parallelScopeBinding? entry after target = parallelScopeBinding? entry before target := by
  unfold ParallelScopeCommand.completeTask? at completed
  split at completed <;> try contradiction
  split at completed
  · exact completeParallelScopeUserTask_preserves_binding completed entry target
  · obtain ⟨successor, applied, completed⟩ := Option.bind_eq_some_iff.mp completed
    unfold completeUserTask at applied
    split at applied <;> try contradiction
    cases Option.some.inj applied
    cases Option.some.inj completed
    exact parallelScopeBinding_state_frame entry before _ target rfl rfl rfl rfl rfl

private theorem service_binding (program : Program) (before after : RuntimeState)
    (id : EffectOccurrenceId) (values : List VariableBinding)
    (completed : ParallelScopeCommand.completeEffect? program before id (.success values) = some after)
    (entry : ParallelScopeEntry) (target : ScopeOccurrenceId) :
    parallelScopeBinding? entry after target = parallelScopeBinding? entry before target := by
  unfold ParallelScopeCommand.completeEffect? at completed
  split at completed <;> try contradiction
  rename_i wait selected
  split at completed
  · exact completeParallelScopeEffect_preserves_binding completed entry target
  · simp only [completeSerialEffect?, selected] at completed
    obtain ⟨variables, written, completed⟩ := Option.bind_eq_some_iff.mp completed
    unfold completeSerialActivityScope? at written
    split at written <;> try contradiction
    obtain ⟨bindings, _, written⟩ := Option.bind_eq_some_iff.mp written
    cases Option.some.inj written
    cases Option.some.inj completed
    exact parallelScopeBinding_state_frame entry before _ target rfl rfl rfl rfl rfl

private theorem admission_binding (program : Program) (before : RuntimeState) (stimulus : Stimulus)
    (selected : ParallelScopeStart.programSelected program = true) (completion : waitCompletionStimulus stimulus)
    (entry : ParallelScopeEntry) (target : ScopeOccurrenceId) :
    parallelScopeBinding? entry (admitStimulus program before stimulus).state target = parallelScopeBinding? entry before target := by
  cases stimulus <;> simp only [waitCompletionStimulus] at completion <;> try contradiction
  case completeUserTaskInstance commandId id values =>
    cases snapshot : program.compensationEventSubProcessSnapshots <;>
      cases control : before.control <;> simp [admitStimulus, snapshot, selected, control]
    all_goals repeat' first | rfl | (apply human_binding; assumption) | split
  case completeEffect commandId id result =>
    cases result <;> simp only at completion <;> try contradiction
    all_goals
      cases snapshot : program.compensationEventSubProcessSnapshots <;>
        cases control : before.control <;> simp [admitStimulus, snapshot, selected, control]
    all_goals repeat' first | rfl | (apply service_binding; assumption) | split

private theorem replay_binding (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (analyzed : ParallelScopeStart.analyzeProgram program = some analysis)
    (parent target : ScopeOccurrenceId) (before after : RuntimeState) (record : InternalTransitionRecord)
    (frame : ParallelScopeStructuralFrame parent before)
    (bound : ∃ binding, parallelScopeBinding? analysis.entry before target = some binding)
    (kind : bodyOrRetirementTransition (.internalOperation record))
    (replayed : replayInternalOperationOccurrence? program before record = some after)
    (survives : ∃ occurrence ∈ after.scopeOccurrences, occurrence.id = target) :
    ∃ binding, parallelScopeBinding? analysis.entry after target = some binding := by
  obtain ⟨binding, bound⟩ := bound
  rcases kind with body | retirement
  · obtain ⟨operation, resolved, metadata, _, _, applied⟩ := replayInternalOperationOccurrence_sound program before after record replayed
    exact ⟨binding, (applyInternalOperationOccurrence_body_binding_frame program before after
      ⟨record.operationId, record.owner⟩ operation analysis.entry target resolved (by rw [metadata]; exact body) applied).trans bound⟩
  · obtain ⟨entry, member, completed⟩ := replayed_retirement_execution program before after record retirement replayed
    obtain ⟨_, _, _, _, _, _, _, entries, _⟩ := ParallelScopeStart.analyzeProgram_body_certificate program analysis analyzed
    rw [entries] at member
    have same : entry = analysis.entry := by simpa using member
    subst entry
    exact completeParallelScope_retains_live_binding analysis.entry parent target record.owner before after binding frame bound completed survives

private theorem internal_scope_sublist (program : Program)
    (selected : ParallelScopeStart.programSelected program = true)
    (before after : RuntimeState) (records : List CommittedTransition)
    (replayed : internalTransitions? program before records = some after)
    (kinds : ∀ record ∈ records, bodyOrRetirementTransition record) :
    after.scopeOccurrences.Sublist before.scopeOccurrences := by
  induction records generalizing before with
  | nil =>
    have same : before = after := by simpa only [internalTransitions?, Option.some.injEq] using replayed
    rw [same]
    exact List.Sublist.refl _
  | cons head rest ih =>
    cases head with
    | externalStimulus => simp [internalTransitions?] at replayed
    | internalOperation record =>
      simp only [internalTransitions?] at replayed
      obtain ⟨next, executed, replayed⟩ := Option.bind_eq_some_iff.mp replayed
      have actual : replayInternalOperationOccurrence? program before record = some next := by
        simpa [internalTransition?, selected] using executed
      exact (ih next replayed (fun item member => kinds item (by simp [member]))).trans
        (replayed_scope_sublist program before next record (kinds _ (by simp)) actual)

private theorem internal_binding (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (analyzed : ParallelScopeStart.analyzeProgram program = some analysis)
    (selected : ParallelScopeStart.programSelected program = true)
    (parent target : ScopeOccurrenceId) (before after : RuntimeState) (records : List CommittedTransition)
    (replayed : internalTransitions? program before records = some after)
    (kinds : ∀ record ∈ records, bodyOrRetirementTransition record)
    (frame : ParallelScopeStructuralFrame parent before)
    (bound : ∃ binding, parallelScopeBinding? analysis.entry before target = some binding)
    (survives : ∃ occurrence ∈ after.scopeOccurrences, occurrence.id = target) :
    ∃ binding, parallelScopeBinding? analysis.entry after target = some binding := by
  induction records generalizing before with
  | nil =>
    have same : before = after := by simpa only [internalTransitions?, Option.some.injEq] using replayed
    exact same ▸ bound
  | cons head rest ih =>
    cases head with
    | externalStimulus => simp [internalTransitions?] at replayed
    | internalOperation record =>
      simp only [internalTransitions?] at replayed
      obtain ⟨next, executed, replayed⟩ := Option.bind_eq_some_iff.mp replayed
      have actual : replayInternalOperationOccurrence? program before record = some next := by
        simpa [internalTransition?, selected] using executed
      have remainingKinds : ∀ item ∈ rest, bodyOrRetirementTransition item := fun item member => kinds item (by simp [member])
      have tailSublist := internal_scope_sublist program selected next after rest replayed remainingKinds
      have nextPresent : ∃ occurrence ∈ next.scopeOccurrences, occurrence.id = target := by
        obtain ⟨occurrence, member, same⟩ := survives
        exact ⟨occurrence, tailSublist.subset member, same⟩
      have nextBound := replay_binding program analysis analyzed parent target before next record frame bound
        (kinds _ (by simp)) actual nextPresent
      exact ih next replayed remainingKinds
        (replayed_structural_frame program parent before next record frame (kinds _ (by simp)) actual) nextBound

/-- Actual lifetime histories preserve every initially bound body that still exists. -/
theorem ParallelScopeReplay.ContinuationCommandHistory.live_binding (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis) (analyzed : ParallelScopeStart.analyzeProgram program = some analysis)
    (selected : ParallelScopeStart.programSelected program = true) (owner parent target : ScopeOccurrenceId)
    (initial current : RuntimeState) (records : List CommittedTransition)
    (history : ContinuationCommandHistory program owner initial current records)
    (frame : ParallelScopeStructuralFrame parent initial)
    (bound : ∃ binding, parallelScopeBinding? analysis.entry initial target = some binding)
    (survives : ∃ occurrence ∈ current.scopeOccurrences, occurrence.id = target) :
    ∃ binding, parallelScopeBinding? analysis.entry current target = some binding := by
  induction history with
  | initial => exact bound
  | @internalStep before after earlier record history replayed kind outside ih =>
    have prior : ∃ occurrence ∈ before.scopeOccurrences, occurrence.id = target := by
      obtain ⟨occurrence, member, same⟩ := survives
      exact ⟨occurrence, (replayed_scope_sublist program before after record kind replayed).subset member, same⟩
    exact replay_binding program analysis analyzed parent target before after record
      (history.structural_frame program owner parent selected initial before earlier frame) (ih prior) kind replayed survives
  | @command before after earlier rest stimulus history replayed completion kinds outside ih =>
    simp only [committedTransitions?, selected, Bool.not_true, Bool.false_eq_true, ↓reduceIte] at replayed
    cases snapshot : program.compensationEventSubProcessSnapshots with
    | some value => simp [snapshot] at replayed
    | none =>
      simp only [snapshot] at replayed
      split at replayed <;> try contradiction
      have tailSublist := internal_scope_sublist program selected _ after rest replayed kinds
      have scopes := admission_scope_frame program before stimulus selected completion
      have prior : ∃ occurrence ∈ before.scopeOccurrences, occurrence.id = target := by
        obtain ⟨occurrence, member, same⟩ := survives
        exact ⟨occurrence, by rw [← scopes]; exact tailSublist.subset member, same⟩
      obtain ⟨binding, boundBefore⟩ := ih prior
      have nextBound := (admission_binding program before stimulus selected completion analysis.entry target).trans boundBefore
      have nextFrame := admission_structural_frame program parent before stimulus selected completion
        (history.structural_frame program owner parent selected initial before earlier frame)
      exact internal_binding program analysis analyzed selected parent target _ after rest replayed kinds nextFrame ⟨binding, nextBound⟩ survives

/-- Every live child in a running reachable prefix has an actual complete population binding. -/
theorem ParallelScopeInternalPrefixReachable.live_child_binding (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis) (analyzed : ParallelScopeStart.analyzeProgram program = some analysis)
    (state : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program state)
    (instanceId : SemanticId) (running : state.control = .running instanceId)
    (target : ScopeOccurrenceId) (child : target.definitionScopeId = analysis.entry.childScopeId)
    (present : ∃ occurrence ∈ state.scopeOccurrences, occurrence.id = target) :
    ∃ binding, parallelScopeBinding? analysis.entry state target = some binding := by
  have selected : ParallelScopeStart.programSelected program = true := by
    cases chosen : ParallelScopeStart.programSelected program with
    | false => simp [ParallelScopeStart.analyzeProgram, chosen] at analyzed
    | true => rfl
  obtain ⟨seed, _, phases⟩ := reachable.start_certificate program analysis analyzed state
  have distinct := ParallelScopeStart.analyzeProgram_child_root_distinct program analysis analyzed seed.root seed.rootSelected
  have noChild (current : RuntimeState) (census : current.scopeOccurrences = [⟨seed.parent, none⟩])
      (represented : ∃ occurrence ∈ current.scopeOccurrences, occurrence.id = target) : False := by
    obtain ⟨occurrence, member, same⟩ := represented
    rw [census] at member
    cases List.mem_singleton.mp member
    exact distinct (child.symm.trans (congrArg ScopeOccurrenceId.definitionScopeId same.symm))
  rcases phases target child with rfl | ⟨id, origin, output, initial, records, _, _, phase⟩
  · have raw := seed.started
    simp only [runningProgramStartState?, seed.rootSelected, bind, Option.bind_some, pure, Option.some.injEq] at raw
    change _ = seed.ready at raw
    exact False.elim (noChild seed.ready (by rw [← raw]; rfl) present)
  rcases phase with ⟨parents, _⟩ | ⟨before, issued, prior, entryRecord, suffix, _, parents, _, _, _, entered, later⟩
  · exact False.elim (noChild state (parents.clean_and_foreign_marking program analysis.entry seed.parent state).1.1 present)
  rcases later with history | terminal
  · have clean := (parents.clean_and_foreign_marking program analysis.entry seed.parent before).1
    have initialPresent : ∃ occurrence ∈ issued.scopeOccurrences, occurrence.id = target := by
      obtain ⟨occurrence, member, same⟩ := present
      exact ⟨occurrence, (history.scopeOccurrences_sublist program target selected issued state suffix).subset member, same⟩
    have bound := enterParallelScope_clean_binding entered clean.1 clean.2.1 clean.2.2.1 clean.2.2.2.1
      clean.2.2.2.2.1 clean.2.2.2.2.2 initialPresent child
    have initialFrame := enterParallelScope_structural_parallel_frame analysis.entry seed.parent before issued clean
      (parents.structural_frame program analysis.entry seed.parent before) entered
    exact history.live_binding program analysis analyzed selected target seed.parent target issued state suffix initialFrame bound present
  · obtain ⟨_, _, _, _, _, _, _, ⟨terminalId, completed⟩, _⟩ := terminal
    rw [running] at completed
    contradiction

/-- Resolution and actual reachability supply the complete binding of any child operation. -/
theorem ParallelScopeInternalPrefixReachable.resolved_child_binding (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis) (analyzed : ParallelScopeStart.analyzeProgram program = some analysis)
    (state : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program state)
    (instanceId : SemanticId) (running : state.control = .running instanceId)
    (candidate : InternalOperationOccurrence) (operation : SemanticOperation)
    (resolved : resolveInternalOperationOccurrence? program state candidate = some operation)
    (child : candidate.owner.definitionScopeId = analysis.entry.childScopeId) :
    ∃ binding, parallelScopeBinding? analysis.entry state candidate.owner = some binding := by
  have live := resolved_exactLiveOccurrence program state candidate operation resolved
  have count : (state.scopeOccurrences.filter (fun scope => decide (scope.id = candidate.owner))).length = 1 := of_decide_eq_true live
  obtain ⟨scope, census⟩ := List.length_eq_one_iff.mp count
  have member := List.mem_filter.mp (census.symm ▸ List.mem_singleton_self scope)
  exact reachable.live_child_binding program analysis analyzed state instanceId running candidate.owner child
    ⟨scope, member.1, of_decide_eq_true member.2⟩

/-- Admitted parallel programs cannot also claim a sequential body definition. -/
theorem ParallelScopeStart.no_sequential_definition (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (analyzed : ParallelScopeStart.analyzeProgram program = some analysis) (owner : ScopeOccurrenceId) :
    hasSequentialScopeDefinition program owner = false := by
  have allowed := (ParallelScopeStart.analyzeProgram_incidence_admission program analysis analyzed).2.2
  have empty : program.operations.filterMap sequentialScopeEntry? = [] := by
    apply List.filterMap_eq_nil_iff.mpr
    intro operation member
    have checked := List.all_eq_true.mp allowed operation member
    cases operation <;> simp_all [sequentialScopeEntry?, ParallelScopeStart.programOperationAllowed]
  simp [hasSequentialScopeDefinition, empty]

/-- The actual reservation scope probe succeeds for every resolved child operation. -/
theorem ParallelScopeInternalPrefixReachable.child_scope_probe (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis) (analyzed : ParallelScopeStart.analyzeProgram program = some analysis)
    (state : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program state)
    (instanceId : SemanticId) (running : state.control = .running instanceId)
    (candidate : InternalOperationOccurrence) (operation : SemanticOperation)
    (resolved : resolveInternalOperationOccurrence? program state candidate = some operation)
    (child : candidate.owner.definitionScopeId = analysis.entry.childScopeId) :
    hasParallelScopeDefinition program candidate.owner = true ∧
      hasSequentialScopeDefinition program candidate.owner = false ∧
      evaluateParallelScopeInputs? program state candidate.owner [] = some [] := by
  obtain ⟨_, _, _, _, _, _, _, entries, _⟩ := ParallelScopeStart.analyzeProgram_body_certificate program analysis analyzed
  obtain ⟨binding, bound⟩ := reachable.resolved_child_binding program analysis analyzed state instanceId running candidate operation resolved child
  exact ⟨by simp [hasParallelScopeDefinition, entries, child],
    ParallelScopeStart.no_sequential_definition program analysis analyzed candidate.owner,
    parallelScopeBinding_empty_inputs program analysis analyzed state candidate.owner child binding bound⟩

/-- Resolved child Service inputs need no assumed binding or data invariant at a running reachable prefix. -/
theorem ParallelScopeInternalPrefixReachable.reachable_child_effect_inputs (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis) (analyzed : ParallelScopeStart.analyzeProgram program = some analysis)
    (state : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program state)
    (instanceId : SemanticId) (running : state.control = .running instanceId)
    (candidate : InternalOperationOccurrence) (id : OperationId) (origin : BpmnElementOrigin)
    (input output : ControlPlaceId) (effect : EffectDefinition) (route : Option BpmnErrorRoute)
    (resolved : resolveInternalOperationOccurrence? program state candidate = some (.awaitEffect id origin input output effect route))
    (child : candidate.owner.definitionScopeId = analysis.entry.childScopeId) :
    ∃ arguments, evaluateParallelScopeInputs? program state candidate.owner effect.inputMappings = some arguments := by
  obtain ⟨binding, bound⟩ := reachable.resolved_child_binding program analysis analyzed state instanceId running candidate _ resolved child
  exact reachable.child_effect_inputs program analysis analyzed state candidate id origin input output effect route resolved child binding bound

end BpmnSemantics.SemanticProcess
