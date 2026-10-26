module

public import BpmnSemantics.SemanticProcess.ParallelScopeRetirementProgress
import all BpmnSemantics.SemanticProcess.ParallelScopeData

/-! # Parent return after parallel subprocess completion

PMIS-END-01 and PMIS-CANCEL-01 discharge the captured population and transfer its
pending outer continuation to the parent. Issuance history is retained; final
return is not a fresh-entry state and cannot reuse its zero-counter premise.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics InternalCommutation ParallelScopeReplay

/-- A final return removes the enclosing population and all captured bodies while adding
one parent continuation credit. The previous parent credit is retained, so this certificate
alone does not assert a globally unique token or a successful future parent operation.
-/
structure ParallelScopeFinalReturn (entry : ParallelScopeEntry) (parent : ScopeOccurrenceId)
    (iterations : List ParallelScopeIteration) (before after : RuntimeState) : Prop where
  activities : after.activityOccurrences = []
  controllers : after.parallelScopeControllers = []
  control : after.control = before.control
  pending : after.initiationPending = before.initiationPending
  removed : ∀ iteration ∈ iterations, ∀ occurrence ∈ after.scopeOccurrences, occurrence.id ≠ iteration.scope
  continuation : ∀ place, continuationMarking after parent place =
    continuationMarking before parent place + ownedPortCount [entry.normalOutput] parent parent place
  token : ({ placeId := entry.normalOutput, owner := parent } : ControlToken) ∈ after.tokens

/-- Final population removal cannot itself make the parent quiescent: the emitted normal
continuation must be consumed before parent completion can become enabled.
-/
theorem ParallelScopeFinalReturn.parent_nonquiescent (entry : ParallelScopeEntry) (parent : ScopeOccurrenceId)
    (iterations : List ParallelScopeIteration) (before after : RuntimeState)
    (returned : ParallelScopeFinalReturn entry parent iterations before after) : scopeQuiescent after parent = false := by
  apply continuationMarking_positive_nonquiescent after parent entry.normalOutput
  rw [returned.continuation]
  simp [ownedPortCount]

private theorem pending_credit_excludes_parent_work (entry : ParallelScopeEntry) (parent retired : ScopeOccurrenceId)
    (before : RuntimeState) (binding : ParallelScopeBinding) (frame : ParallelScopeStructuralFrame parent before)
    (bound : parallelScopeBinding? entry before retired = some binding)
    (held : ∀ place, parentContinuationMarking entry parent before place = ownedPortCount [entry.normalOutput] parent parent place) :
    ∀ place, continuationMarking before parent place = 0 := by
  obtain ⟨activities, _, owner, element, first, rest, body⟩ := frame.bound_parent_shape entry parent retired before binding bound
  intro place
  have balance := held place
  by_cases output : entry.normalOutput = place <;>
    simp [parentContinuationMarking, activities, List.filter_nil,
      owner, element, body, ownedPortCount, output] at balance <;> omega

/-- The unique pending outer credit becomes one real parent input token on final return.
The held-credit premise is separate from retirement: arbitrary pre-existing parent work
must not be silently discarded to claim readiness.
-/
theorem ParallelScopeFinalReturn.parent_unit (entry : ParallelScopeEntry) (parent retired : ScopeOccurrenceId)
    (iterations : List ParallelScopeIteration) (before after : RuntimeState)
    (returned : ParallelScopeFinalReturn entry parent iterations before after)
    (binding : ParallelScopeBinding) (frame : ParallelScopeStructuralFrame parent before)
    (bound : parallelScopeBinding? entry before retired = some binding)
    (held : ∀ place, parentContinuationMarking entry parent before place =
      ownedPortCount [entry.normalOutput] parent parent place) :
    (∀ place, continuationMarking after parent place = ownedPortCount [entry.normalOutput] parent parent place) ∧
      (after.tokens.filter fun token => token.placeId == entry.normalOutput && token.owner == parent).length = 1 := by
  have empty := pending_credit_excludes_parent_work entry parent retired before binding frame bound held
  have credit (place : ControlPlaceId) : continuationMarking after parent place = ownedPortCount [entry.normalOutput] parent parent place := by
    rw [returned.continuation, empty, Nat.zero_add]
  refine ⟨credit, ?_⟩
  have total := credit entry.normalOutput
  have present : ({ placeId := entry.normalOutput, owner := parent } : ControlToken) ∈
      after.tokens.filter (fun token => token.placeId == entry.normalOutput && token.owner == parent) := by
    simp [returned.token]
  have positive := List.length_pos_of_mem present
  simp only [continuationMarking, ownedPortCount, beq_self_eq_true, Bool.true_and,
    List.filter_cons_of_pos, List.filter_nil, List.length_cons, List.length_nil] at total
  have reordered : after.tokens.filter (fun token => token.owner == parent && token.placeId == entry.normalOutput) =
      after.tokens.filter (fun token => token.placeId == entry.normalOutput && token.owner == parent) := by
    simp only [Bool.and_comm]
  rw [reordered] at total
  omega

/-- A declared parent End at the normal output can actually consume the returned token.
This proves evaluator readiness and complete credit consumption, without assuming the
scheduler has selected or successfully prepared that End.
-/
theorem ParallelScopeFinalReturn.parent_end_enabled (program : Program) (entry : ParallelScopeEntry)
    (parent retired : ScopeOccurrenceId) (iterations : List ParallelScopeIteration) (before after : RuntimeState)
    (returned : ParallelScopeFinalReturn entry parent iterations before after)
    (binding : ParallelScopeBinding) (frame : ParallelScopeStructuralFrame parent before)
    (bound : parallelScopeBinding? entry before retired = some binding)
    (held : ∀ place, parentContinuationMarking entry parent before place =
      ownedPortCount [entry.normalOutput] parent parent place)
    (instanceId : SemanticId) (running : before.control = .running instanceId)
    (id : OperationId) (origin : BpmnElementOrigin)
    (resolved : resolveInternalOperationOccurrence? program after ⟨id, parent⟩ =
      some (.reachNoneEnd id origin entry.normalOutput)) :
    applyInternalOperationOccurrence? program after ⟨id, parent⟩ =
        some (reachNoneEndToken after parent entry.normalOutput) ∧
      ∀ place, continuationMarking (reachNoneEndToken after parent entry.normalOutput) parent place = 0 := by
  obtain ⟨credit, unit⟩ := returned.parent_unit entry parent retired iterations before after binding frame bound held
  have applied : applyInternalOperationOccurrence? program after ⟨id, parent⟩ =
      some (reachNoneEndToken after parent entry.normalOutput) := by
    simp [applyInternalOperationOccurrence?, returned.control, running, resolved, unit]
  refine ⟨applied, ?_⟩
  intro place
  have balance := applyInternalOperationOccurrence_continuation_balance program after _ ⟨id, parent⟩
    (.reachNoneEnd id origin entry.normalOutput) resolved (by simp [SemanticOperation.kind]) applied parent place
  simpa [bodyConsumedPorts, bodyProducedPorts, SequentialScopeControl.inputs, credit, ownedPortCount] using balance

/-- Actual clean entry moves the parent's cursor into the pending outer continuation,
including the empty collection's immediate normal return.
-/
theorem parent_spine_entry_credit (entry : ParallelScopeEntry) (parent : ScopeOccurrenceId)
    (before after : RuntimeState) (clean : ParallelScopeCleanEntry entry parent before)
    (entered : enterParallelScope? entry before parent = some after)
    (credit : ∀ place, continuationMarking before parent place = ownedPortCount [entry.input] parent parent place) :
    ∀ place, parentContinuationMarking entry parent after place = ownedPortCount [entry.normalOutput] parent parent place := by
  intro place
  have balance := enterParallelScope_parent_continuation_balance entry parent before after clean entered place
  have initial : parentContinuationMarking entry parent before place = ownedPortCount [entry.input] parent parent place := by
    simpa only [parentContinuationMarking, clean.2.2.1, List.filter_nil, List.length_nil, Nat.add_zero] using credit place
  rw [initial] at balance
  omega

private theorem cancel_empty_population (state : RuntimeState) (target : ScopeOccurrenceId)
    (activities : state.activityOccurrences = []) (controllers : state.parallelScopeControllers = []) :
    (cancelScopeSubtree state target .remove).activityOccurrences = [] ∧
      (cancelScopeSubtree state target .remove).parallelScopeControllers = [] := by
  simp [cancelScopeSubtree, activities, controllers, retainedByRegion, withdrawnByRegion]

private theorem cancel_fold_empty_population (iterations : List ParallelScopeIteration) (state : RuntimeState)
    (activities : state.activityOccurrences = []) (controllers : state.parallelScopeControllers = []) :
    let after := iterations.foldl (fun current iteration => cancelScopeSubtree current iteration.scope .remove) state
    after.activityOccurrences = [] ∧ after.parallelScopeControllers = [] ∧
      after.control = state.control ∧ after.initiationPending = state.initiationPending := by
  induction iterations generalizing state with
  | nil => exact ⟨activities, controllers, rfl, rfl⟩
  | cons first rest ih =>
    obtain ⟨emptyActivities, emptyControllers⟩ := cancel_empty_population state first.scope activities controllers
    exact ih _ emptyActivities emptyControllers

private theorem final_parent_credit (entry : ParallelScopeEntry) (parent retired : ScopeOccurrenceId)
    (before after : RuntimeState) (binding : ParallelScopeBinding)
    (frame : ParallelScopeStructuralFrame parent before)
    (bound : parallelScopeBinding? entry before retired = some binding)
    (completed : completeParallelScope? entry before retired = some after)
    (empty : after.activityOccurrences = []) (place : ControlPlaceId) :
    continuationMarking after parent place =
      continuationMarking before parent place + ownedPortCount [entry.normalOutput] parent parent place := by
  have balance := completeParallelScope_parent_continuation_marking entry parent retired before after binding frame bound completed place
  obtain ⟨activities, _, owner, element, first, rest, body⟩ := frame.bound_parent_shape entry parent retired before binding bound
  by_cases output : entry.normalOutput = place <;>
    simpa [parentContinuationMarking, empty, activities, List.filter_cons, List.filter_nil,
      owner, element, body, ownedPortCount, output] using balance

/-- Every actual retirement either retains an original sibling or returns to the parent.
Natural and early completion share the same parent-credit contract; neither can leave a
captured body behind. The alternatives are derived from the real retirement dispatch.
-/
theorem completeParallelScope_survivor_or_final_return (entry : ParallelScopeEntry)
    (parent retired : ScopeOccurrenceId) (before after : RuntimeState) (binding : ParallelScopeBinding)
    (frame : ParallelScopeStructuralFrame parent before)
    (bound : parallelScopeBinding? entry before retired = some binding)
    (completed : completeParallelScope? entry before retired = some after) :
    (∃ iteration ∈ binding.iterations, iteration.scope ≠ retired ∧
      ∃ occurrence ∈ after.scopeOccurrences, occurrence.id = iteration.scope) ∨
      ParallelScopeFinalReturn entry parent binding.iterations before after := by
  obtain ⟨activities, controllers, owner⟩ := frame.bound_outer entry parent retired before binding bound
  have parentless : occurrenceParent? before.scopeOccurrences binding.activity.owner = none := by
    rw [owner]
    unfold occurrenceParent?
    rw [← List.head?_filter, frame.root]
    rfl
  have credit := final_parent_credit entry parent retired before after binding frame bound completed
  unfold completeParallelScope? at completed
  simp only [bound, bind, Option.bind_some] at completed
  split at completed <;> try contradiction
  obtain ⟨variables, removed, completed⟩ := Option.bind_eq_some_iff.mp completed
  obtain ⟨condition, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  obtain ⟨retirement, executed, completed⟩ := Option.bind_eq_some_iff.mp completed
  let detached := { before with
    variables := variables
    activityOccurrences := before.activityOccurrences.filter (· != binding.activity)
    parallelScopeControllers := before.parallelScopeControllers.filter (· != binding.controller) }
  have detachedEmpty : detached.activityOccurrences = [] ∧ detached.parallelScopeControllers = [] := by
    simp [detached, activities, controllers]
  have retiredEmpty := cancel_empty_population detached retired detachedEmpty.1 detachedEmpty.2
  have dispatch := retireParallelScopeIteration_dispatch binding.controller binding.iterations retired condition retirement executed
  cases retirement with
  | remaining next selected first rest =>
    cases Option.some.inj completed
    have members := remainingRetirement_members binding.controller next binding.iterations retired condition selected first rest executed
    obtain ⟨included, different⟩ := members first (by simp)
    have census := (parallelScopeRemaining_body_censuses entry before retired binding variables next selected first rest condition
      bound parentless frame.noCalls removed executed first (by simp)).1
    have siblingBound := parallelScopeBinding_retarget entry before retired binding bound first included
    obtain ⟨body, selectedBody, identity, _, _⟩ := parallelScopeBinding_body_record entry before first.scope binding siblingBound
    rw [selectedBody] at census
    exact Or.inl ⟨first, included, different, body,
      (List.mem_filter.mp (census.symm ▸ List.mem_singleton_self body)).1, identity⟩
  | naturalCompletion next selected =>
    cases Option.some.inj completed
    refine Or.inr ⟨retiredEmpty.1, retiredEmpty.2, rfl, rfl, ?_, credit retiredEmpty.1, by simp [owner, addToken, mem_canonicalInsertBy]⟩
    cases dispatch with
    | naturalCompletion selected condition valid shape identity =>
      intro iteration member occurrence present
      have same : iteration = selected := by simpa only [shape, List.mem_singleton] using member
      subst iteration
      simpa only [identity] using cancelScopeSubtree_remove_target detached retired occurrence present
  | earlyCompletion next selected first rest =>
    cases Option.some.inj completed
    have folded := cancel_fold_empty_population (first :: rest) (cancelScopeSubtree detached retired .remove) retiredEmpty.1 retiredEmpty.2
    refine Or.inr ⟨folded.1, folded.2.1, folded.2.2.1, folded.2.2.2, ?_, credit folded.1, by simp [owner, addToken, mem_canonicalInsertBy]⟩
    cases dispatch with
    | earlyCompletion preceding following selected first rest valid shape identity siblings =>
      intro iteration member occurrence present same
      by_cases chosen : iteration = selected
      · subst iteration
        have earlier := (cancelScopeSubtree_fold_scopeOccurrences_sublist (first :: rest) (·.scope)
          (cancelScopeSubtree detached retired .remove)).subset present
        exact cancelScopeSubtree_remove_target detached retired occurrence earlier (same.trans identity)
      · have retained : iteration ∈ first :: rest := by
          rw [shape] at member
          rw [← siblings]
          simpa [chosen] using member
        exact cancelScopeSubtree_fold_remove_targets (first :: rest) (·.scope) _ iteration retained occurrence present same

/-- This invariant follows the existing lifetime history only while an outer population
remains. Final removal discharges it instead of forbidding later parent execution.
-/
def pendingParentCredit (entry : ParallelScopeEntry) (parent : ScopeOccurrenceId) (state : RuntimeState) : Prop :=
  state.activityOccurrences = [] ∨
    (∀ place, parentContinuationMarking entry parent state place = ownedPortCount [entry.normalOutput] parent parent place) ∧
    ∀ place, continuationMarking state parent place = 0

private theorem pending_credit_body (program : Program) (entry : ParallelScopeEntry) (parent : ScopeOccurrenceId)
    (before after : RuntimeState) (candidate : InternalOperationOccurrence) (operation : SemanticOperation)
    (resolved : resolveInternalOperationOccurrence? program before candidate = some operation)
    (kind : operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect, .duplicate, .synchronize, .reachNoneEnd])
    (applied : applyInternalOperationOccurrence? program before candidate = some after)
    (pending : pendingParentCredit entry parent before) : pendingParentCredit entry parent after := by
  have activities := (applyInternalOperationOccurrence_body_retirement_frame program before after candidate operation resolved kind applied).2.2.1
  rcases pending with empty | ⟨held, zero⟩
  · exact Or.inl (activities.trans empty)
  have different : candidate.owner ≠ parent := by
    intro same
    obtain ⟨⟨input, member⟩, positive⟩ := body_step_inputs_positive program before after candidate operation resolved kind applied
    have impossible := positive input member
    rw [same, zero] at impossible
    omega
  have unchanged (place : ControlPlaceId) : continuationMarking after parent place = continuationMarking before parent place := by
    have balance := applyInternalOperationOccurrence_continuation_balance program before after candidate operation resolved kind applied parent place
    simpa only [ownedPortCount_foreign _ _ _ _ different, Nat.add_zero] using balance
  exact Or.inr ⟨fun place => by simpa only [parentContinuationMarking, activities, unchanged] using held place,
    fun place => (unchanged place).trans (zero place)⟩

private theorem pending_credit_admission (program : Program) (entry : ParallelScopeEntry) (parent : ScopeOccurrenceId)
    (state : RuntimeState) (stimulus : Stimulus) (selected : ParallelScopeStart.programSelected program = true)
    (completion : waitCompletionStimulus stimulus) (pending : pendingParentCredit entry parent state) :
    pendingParentCredit entry parent (admitStimulus program state stimulus).state := by
  rcases pending with empty | ⟨held, zero⟩
  · exact Or.inl ((admission_parent_activities program state stimulus selected completion).trans empty)
  refine Or.inr ⟨fun place => (admission_parent_marking program entry parent state stimulus selected completion place).trans (held place), ?_⟩
  cases stimulus <;> simp [waitCompletionStimulus] at completion
  · intro place
    rw [admitStimulus_parallel_scope_human_continuation_marking _ _ _ _ _ selected, zero]
  · rename_i result
    cases result <;> simp at completion
    intro place
    rw [admitStimulus_parallel_scope_effect_continuation_marking _ _ _ _ _ selected, zero]

private theorem pending_credit_replay (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis) (parent : ScopeOccurrenceId)
    (before after : RuntimeState) (record : InternalTransitionRecord) (frame : ParallelScopeStructuralFrame parent before)
    (kind : bodyOrRetirementTransition (.internalOperation record))
    (replayed : replayInternalOperationOccurrence? program before record = some after)
    (pending : pendingParentCredit analysis.entry parent before) : pendingParentCredit analysis.entry parent after := by
  rcases kind with body | retirement
  · obtain ⟨operation, resolved, metadata, _, _, applied⟩ := replayInternalOperationOccurrence_sound program before after record replayed
    exact pending_credit_body program analysis.entry parent before after ⟨record.operationId, record.owner⟩ operation resolved
      (by simpa only [bodyTransition, metadata] using body) applied pending
  obtain ⟨entry, member, completed⟩ := replayed_retirement_execution program before after record retirement replayed
  obtain ⟨_, _, _, _, _, _, _, entries, _⟩ := ParallelScopeStart.analyzeProgram_body_certificate program analysis admitted
  rw [entries] at member
  have same : entry = analysis.entry := by simpa using member
  subst entry
  have execution := completed
  unfold completeParallelScope? at execution
  obtain ⟨binding, bound, _⟩ := Option.bind_eq_some_iff.mp execution
  rcases pending with empty | ⟨held, _⟩
  · cases control : before.control <;> simp [parallelScopeBinding?, empty, control] at bound
  have balanced (place : ControlPlaceId) := (completeParallelScope_parent_continuation_marking analysis.entry parent record.owner before after binding frame bound completed place).trans (held place)
  rcases completeParallelScope_survivor_or_final_return analysis.entry parent record.owner before after binding frame bound completed with survivor | returned
  · obtain ⟨iteration, member, different, survives⟩ := survivor
    obtain ⟨activities, controllers, owner⟩ := frame.bound_outer analysis.entry parent record.owner before binding bound
    have parentless : occurrenceParent? before.scopeOccurrences binding.activity.owner = none := by
      rw [owner]
      unfold occurrenceParent?
      rw [← List.head?_filter, frame.root]
      rfl
    obtain ⟨next, nextBound⟩ := completeParallelScope_surviving_sibling_binding analysis.entry before after record.owner binding iteration
      bound parentless frame.noCalls activities controllers member different completed survives
    exact Or.inr ⟨balanced, pending_credit_excludes_parent_work analysis.entry parent iteration.scope after next
      (completeParallelScope_structural_parallel_frame analysis.entry parent record.owner before after binding frame bound completed) nextBound balanced⟩
  · exact Or.inl returned.activities

private theorem pending_credit_ordered (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis) (parent : ScopeOccurrenceId)
    (initial final : RuntimeState) (records : List CommittedTransition) (successors : List RuntimeState)
    (length : successors.length = records.length) (last : (initial :: successors).getLast? = some final)
    (aligned : ∀ pair ∈ records.zip ((initial :: successors).zip successors), ∃ record,
      pair.1 = .internalOperation record ∧ replayInternalOperationOccurrence? program pair.2.1 record = some pair.2.2)
    (kinds : ∀ record ∈ records, bodyOrRetirementTransition record)
    (frame : ParallelScopeStructuralFrame parent initial) (pending : pendingParentCredit analysis.entry parent initial) :
    pendingParentCredit analysis.entry parent final := by
  induction records generalizing initial successors with
  | nil =>
    have empty : successors = [] := by simpa using length
    subst successors
    have same : initial = final := by simpa using last
    simpa only [← same] using pending
  | cons first rest ih =>
    cases successors with
    | nil => simp at length
    | cons next tail =>
      obtain ⟨record, identity, replayed⟩ := aligned (first, initial, next) (by simp)
      have nextPending := pending_credit_replay program analysis admitted parent initial next record frame
        (identity ▸ kinds first (by simp)) replayed pending
      have nextFrame := replayed_structural_frame program parent initial next record frame
        (identity ▸ kinds first (by simp)) replayed
      exact ih next tail (by simpa using length) (by simpa using last)
        (fun pair member => aligned pair (by simpa only [List.zip_cons_cons, List.mem_cons] using Or.inr member))
        (fun transition member => kinds transition (by simp [member])) nextFrame nextPending

private theorem pending_credit_history (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis) (owner parent : ScopeOccurrenceId)
    (selected : ParallelScopeStart.programSelected program = true) (initial final : RuntimeState)
    (records : List CommittedTransition) (history : ContinuationCommandHistory program owner initial final records)
    (frame : ParallelScopeStructuralFrame parent initial) (pending : pendingParentCredit analysis.entry parent initial) :
    pendingParentCredit analysis.entry parent final := by
  induction history with
  | initial => exact pending
  | @internalStep before after earlier record history replayed kind outside ih =>
    exact pending_credit_replay program analysis admitted parent before after record
      (history.structural_frame program owner parent selected initial before earlier frame) kind replayed ih
  | @command before after earlier rest stimulus history replayed completion kinds outside ih =>
    obtain ⟨actualStimulus, actualRest, next, successors, shape, _, stateEq, length, last, aligned⟩ :=
      committedTransitions_ordered_steps program selected before after (.externalStimulus stimulus :: rest) replayed
    cases shape
    have beforeFrame := history.structural_frame program owner parent selected initial before earlier frame
    have nextFrame := admission_structural_frame program parent before stimulus selected completion beforeFrame
    have nextPending := pending_credit_admission program analysis.entry parent before stimulus selected completion ih
    rw [stateEq] at nextFrame nextPending
    exact pending_credit_ordered program analysis admitted parent next after rest successors length last aligned kinds nextFrame nextPending

private theorem parent_history_entry_credit (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis) (parent : ScopeOccurrenceId)
    (before after : RuntimeState) (parents : ParallelScopeParentHistory program analysis.entry parent before)
    (entered : enterParallelScope? analysis.entry before parent = some after) :
    ∀ place, continuationMarking before parent place = ownedPortCount [analysis.entry.input] parent parent place := by
  have unit : (before.tokens.filter fun token => token.placeId == analysis.entry.input && token.owner == parent).length = 1 := by
    unfold enterParallelScope? at entered
    split at entered <;> try contradiction
    rename_i valid
    simp only [Bool.or_eq_true, bne_iff_ne, not_or] at valid
    exact Classical.byContradiction valid.1.1.1.2
  have positive : 0 < continuationMarking before parent analysis.entry.input := by
    have reordered : before.tokens.filter (fun token => token.owner == parent && token.placeId == analysis.entry.input) =
        before.tokens.filter (fun token => token.placeId == analysis.entry.input && token.owner == parent) := by
      simp only [Bool.and_comm]
    simp only [continuationMarking, reordered, unit]
    omega
  rcases parents.cursor program analysis admitted parent before with ⟨_, zero⟩ | ⟨_, operations, port, path, _, _, _, credit⟩
  · rw [zero] at positive
    omega
  · have same : port.id = analysis.entry.input := by
      rw [credit] at positive
      by_cases same : port.id = analysis.entry.input
      · exact same
      · simp [ownedPortCount, same] at positive
    simpa only [same] using credit

private theorem pending_credit_entry (entry : ParallelScopeEntry) (parent : ScopeOccurrenceId)
    (before after : RuntimeState) (clean : ParallelScopeCleanEntry entry parent before)
    (entered : enterParallelScope? entry before parent = some after)
    (credit : ∀ place, continuationMarking before parent place = ownedPortCount [entry.input] parent parent place) :
    pendingParentCredit entry parent after := by
  have held := parent_spine_entry_credit entry parent before after clean entered credit
  unfold enterParallelScope? at entered
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  split at entered
  · cases Option.some.inj entered
    exact Or.inl clean.2.2.1
  · obtain ⟨⟨issued, iterations⟩, generated, installed⟩ := Option.bind_eq_some_iff.mp entered
    cases iterations with
    | nil => simp at installed
    | cons first rest =>
      cases Option.some.inj installed
      have activities := (issueParallelBodies_structural_fields generated).2.1
      refine Or.inr ⟨held, ?_⟩
      intro place
      have balance := held place
      by_cases output : entry.normalOutput = place <;>
        simp [parentContinuationMarking, activities, clean.2.2.1, insertActivityOccurrence,
          ownedPortCount, output] at balance <;>
        simp only [continuationMarking] at balance ⊢ <;> omega

/-- Actual pre-entry history supplies the consumed cursor credit, and the existing lifetime
history preserves its pending balance whenever the outer population is still bound.
Parent work after final removal is allowed, so no future firing or phase order is assumed.
-/
theorem ParallelScopeReplay.ContinuationCommandHistory.pending_parent_credit_from_entry (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis) (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (owner parent : ScopeOccurrenceId) (selected : ParallelScopeStart.programSelected program = true)
    (before issued current : RuntimeState) (parents : ParallelScopeParentHistory program analysis.entry parent before)
    (entered : enterParallelScope? analysis.entry before parent = some issued)
    (records : List CommittedTransition) (history : ContinuationCommandHistory program owner issued current records)
    (retired : ScopeOccurrenceId) (binding : ParallelScopeBinding)
    (bound : parallelScopeBinding? analysis.entry current retired = some binding) :
    ParallelScopeStructuralFrame parent current ∧
      ∀ place, parentContinuationMarking analysis.entry parent current place = ownedPortCount [analysis.entry.normalOutput] parent parent place := by
  have clean := (parents.clean_and_foreign_marking program analysis.entry parent before).1
  have initialFrame := enterParallelScope_structural_parallel_frame analysis.entry parent before issued clean
    (parents.structural_frame program analysis.entry parent before) entered
  have currentFrame := history.structural_frame program owner parent selected issued current records initialFrame
  have initialCredit := pending_credit_entry analysis.entry parent before issued clean entered
    (parent_history_entry_credit program analysis admitted parent before issued parents entered)
  have currentCredit := pending_credit_history program analysis admitted owner parent selected issued current records history initialFrame initialCredit
  refine ⟨currentFrame, ?_⟩
  rcases currentCredit with empty | ⟨held, _⟩
  · cases control : current.control <;> simp [parallelScopeBinding?, empty, control] at bound
  · exact held

/-- PMIS-END-01 withholds parent continuation credit until the entire bound population is removed. -/
theorem ParallelScopeReplay.ContinuationCommandHistory.parent_credit_requires_retirement (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis) (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (owner parent : ScopeOccurrenceId) (selected : ParallelScopeStart.programSelected program = true)
    (before issued current : RuntimeState) (parents : ParallelScopeParentHistory program analysis.entry parent before)
    (entered : enterParallelScope? analysis.entry before parent = some issued)
    (records : List CommittedTransition) (history : ContinuationCommandHistory program owner issued current records)
    (place : ControlPlaceId) (positive : 0 < continuationMarking current parent place) :
    current.activityOccurrences = [] := by
  have clean := (parents.clean_and_foreign_marking program analysis.entry parent before).1
  have frame := enterParallelScope_structural_parallel_frame analysis.entry parent before issued clean
    (parents.structural_frame program analysis.entry parent before) entered
  have initialCredit := pending_credit_entry analysis.entry parent before issued clean entered
    (parent_history_entry_credit program analysis admitted parent before issued parents entered)
  rcases pending_credit_history program analysis admitted owner parent selected issued current records history frame initialCredit with
    empty | ⟨_, zero⟩
  · exact empty
  · rw [zero] at positive
    omega

/-- A live bound population at an actual command prefix carries exactly one pending
parent continuation. Start and pre-entry states are excluded by their empty outer census;
the terminal phase is excluded by the running-only binding contract.
-/
theorem ParallelScopeInternalPrefixReachable.pending_parent_credit (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis) (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (selected : ParallelScopeStart.programSelected program = true) (current : RuntimeState)
    (reachable : ParallelScopeInternalPrefixReachable program current) (retired : ScopeOccurrenceId)
    (binding : ParallelScopeBinding) (bound : parallelScopeBinding? analysis.entry current retired = some binding) :
    ParallelScopeStructuralFrame binding.activity.owner current ∧
      ∀ place, parentContinuationMarking analysis.entry binding.activity.owner current place =
        ownedPortCount [analysis.entry.normalOutput] binding.activity.owner binding.activity.owner place := by
  have nonempty : current.activityOccurrences ≠ [] := by
    intro empty
    cases control : current.control <;> simp [parallelScopeBinding?, empty, control] at bound
  obtain ⟨seed, _, phases⟩ := reachable.start_certificate program analysis admitted current
  let view : ScopeOccurrenceId := ⟨seed.instanceId, analysis.entry.childScopeId, 1⟩
  rcases phases view rfl with original | ⟨id, origin, output, initial, records, _, _, phase⟩
  · have raw := seed.started
    simp only [runningProgramStartState?, seed.rootSelected, bind, Option.bind_some, pure, Option.some.injEq] at raw
    change _ = seed.ready at raw
    have empty : seed.ready.activityOccurrences = [] := by rw [← raw]; rfl
    exact False.elim (nonempty (original ▸ empty))
  rcases phase with ⟨parents, _⟩ | ⟨before, issued, prior, entryRecord, suffix, _, parents, _, _, _, entered, following⟩
  · exact False.elim (nonempty (parents.clean_and_foreign_marking program analysis.entry seed.parent current).1.2.2.1)
  rcases following with history | terminal
  · obtain ⟨frame, held⟩ := history.pending_parent_credit_from_entry program analysis admitted view seed.parent selected before issued current
      parents entered suffix retired binding bound
    have owner := (frame.bound_outer analysis.entry seed.parent retired current binding bound).2.2
    rw [owner]
    exact ⟨frame, held⟩
  · obtain ⟨_, _, _, _, _, _, _, ⟨instanceId, completed⟩, _⟩ := terminal
    simp [parallelScopeBinding?, completed] at bound

/-- Actual command-prefix provenance discharges the final return's credit premise.
The resulting unique input token is ready for the parent operation independently of
whether scheduler preparation or the remaining closure succeeds.
-/
theorem ParallelScopeInternalPrefixReachable.final_parent_unit (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis) (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (selected : ParallelScopeStart.programSelected program = true) (before after : RuntimeState)
    (reachable : ParallelScopeInternalPrefixReachable program before) (retired : ScopeOccurrenceId)
    (binding : ParallelScopeBinding) (bound : parallelScopeBinding? analysis.entry before retired = some binding)
    (returned : ParallelScopeFinalReturn analysis.entry binding.activity.owner binding.iterations before after) :
    (∀ place, continuationMarking after binding.activity.owner place =
      ownedPortCount [analysis.entry.normalOutput] binding.activity.owner binding.activity.owner place) ∧
      (after.tokens.filter fun token => token.placeId == analysis.entry.normalOutput && token.owner == binding.activity.owner).length = 1 := by
  obtain ⟨frame, held⟩ := reachable.pending_parent_credit program analysis admitted selected before retired binding bound
  exact returned.parent_unit analysis.entry binding.activity.owner retired binding.iterations before after binding frame bound held

theorem reachable_at_scheduled_prefix {program : Program} {commandId : SemanticId}
    {initialFuel initialIndex initialOrdinal fuel index ordinal : Nat}
    {initialSchedule schedule : InternalChoiceSchedule} {initial current : RuntimeState}
    (path : ScheduledClosurePrefix program commandId initialFuel initialIndex initialOrdinal initialSchedule initial
      fuel index ordinal schedule current)
    (profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft")
    (reachable : ParallelScopeInternalPrefixReachable program initial) : ParallelScopeInternalPrefixReachable program current := by
  induction path with
  | initial => exact reachable
  | @step fuel index ordinal schedule remaining state first rest consumed next earlier unstable chosen enough executed ih =>
    rcases executeSelectedFrontier_parallel_scope_steps program commandId index ordinal schedule state (first :: rest)
      remaining consumed next profile (by simp) chosen executed with
      ⟨offer, candidate, shape, _, alternative, applied, _⟩ |
        ⟨batch, successors, reserved, applied, _, endpoint, alternatives, _⟩
    · rw [shape] at chosen
      exact .singleton state next.state ordinal schedule remaining consumed offer candidate ih chosen alternative applied
    · exact .batch state next.state ordinal schedule remaining consumed (first :: rest) batch successors ih chosen reserved alternatives applied endpoint

/-- Actual committed body resumption either stays in its body phase, stops successfully at
nonfinal retirement, or reaches the final parent-return certificate. This classification
preserves the exact original closure cursor and assumes no future parent execution.
-/
theorem ParallelScopeCommandBoundaryReachable.scoped_retirement_outcome (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis)
    (selected : ParallelScopeStart.programSelected program = true)
    (analyzed : ParallelScopeStart.analyzeProgram program = some analysis)
    (entryBefore issued current : RuntimeState) (record : InternalTransitionRecord)
    (kind : record.operationKind = .enterParallelMultiInstanceScope)
    (entered : replayInternalOperationOccurrence? program entryBefore record = some issued)
    (reachable : ParallelScopeCommandBoundaryReachable program current)
    (instanceId : SemanticId) (running : current.control = .running instanceId)
    (stimulus : Stimulus) (completion : waitCompletionStimulus stimulus)
    (committed : (admitStimulus program current stimulus).outcome = .committed)
    (structural : ParallelScopeStructuralFrame record.owner current)
    (actor : ScopeOccurrenceId) (resumed : scopedWaitCompletionOwner program current stimulus actor) (fuel : Nat) :
    ParallelScopeOwnerFrame current
        (closeScheduledTraced fuel program (stimulusCommandId stimulus) 1 0 [] (admitStimulus program current stimulus).state).state actor ∨
      ∃ cut : ParallelScopeSingletonCut program (stimulusCommandId stimulus) fuel 1 0 [] (admitStimulus program current stimulus).state,
        ParallelScopeOwnerFrame current cut.before actor ∧
        cut.operation.kind = .completeParallelMultiInstanceScope ∧ cut.candidate.owner = actor ∧
        ∃ binding, parallelScopeBinding? analysis.entry cut.before actor = some binding ∧
          completeParallelScope? analysis.entry cut.before actor = some cut.step.state ∧
          (((closeScheduledTraced fuel program (stimulusCommandId stimulus) 1 0 [] (admitStimulus program current stimulus).state).state = cut.step.state ∧
            (closeScheduledTraced fuel program (stimulusCommandId stimulus) 1 0 [] (admitStimulus program current stimulus).state).failed = false) ∨
            (ParallelScopeFinalReturn analysis.entry record.owner binding.iterations cut.before cut.step.state ∧
              (∀ place, continuationMarking cut.step.state record.owner place = ownedPortCount [analysis.entry.normalOutput] record.owner record.owner place) ∧
              (cut.step.state.tokens.filter fun token => token.placeId == analysis.entry.normalOutput && token.owner == record.owner).length = 1)) := by
  rcases reachable.scoped_retirement_sibling_frame program analysis selected analyzed entryBefore issued current record kind entered
    instanceId running stimulus completion committed structural actor resumed fuel with retained | ⟨cut, frame, retirement, owned, binding, bound, completed, siblings⟩
  · exact Or.inl retained
  · refine Or.inr ⟨cut, frame, retirement, owned, binding, bound, completed, ?_⟩
    rcases completeParallelScope_survivor_or_final_return analysis.entry record.owner actor cut.before cut.step.state binding
      (frame.population record.owner structural) bound completed with survivor | returned
    · obtain ⟨iteration, present, different, survives⟩ := survivor
      exact Or.inl (cut.stable_success (siblings iteration present different survives).2.2)
    · have profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft" := by
        simpa only [ParallelScopeStart.programSelected, beq_iff_eq] using selected
      have cutReachable := reachable_at_scheduled_prefix cut.path profile (.admitted current stimulus reachable committed)
      have owner := ((frame.population record.owner structural).bound_outer analysis.entry record.owner actor cut.before binding bound).2.2
      have unit := cutReachable.final_parent_unit program analysis analyzed selected cut.before cut.step.state actor binding bound
        (by simpa only [owner] using returned)
      exact Or.inr ⟨returned, by simpa only [owner] using unit⟩

end BpmnSemantics.SemanticProcess
