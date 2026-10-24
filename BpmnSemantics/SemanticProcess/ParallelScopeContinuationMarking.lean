module

public import BpmnSemantics.SemanticProcess.InternalOperationOccurrence
public import BpmnSemantics.SemanticProcess.TokenStorage
public import BpmnSemantics.SemanticProcess.ContinuationMarkingLaws
public import BpmnSemantics.SemanticProcess.ParallelScopePopulationPreservation
public import BpmnSemantics.SemanticProcess.ScopeAncestryLaws

/-! # Actual body-operation continuation balance

PMIS-SELECT-01 transfers the continuation marking defined by PMIS-DATA-01 through
actual owned input/output ports. Wait issuance counts its blocked output once;
these laws do not assert enabledness or execution at most once.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics
open InternalCommutation
open ContinuationMarkingLaws

/-- Actual scoped Human completion conserves every owner/place continuation marking. -/
theorem completeParallelScopeUserTask_continuation_marking
    (program : Program) (before after : RuntimeState) (id : UserTaskInstanceId)
    (values : List VariableBinding)
    (completed : completeParallelScopeUserTask? program before id values = some after)
    (owner : ScopeOccurrenceId) (place : ControlPlaceId) :
    continuationMarking after owner place = continuationMarking before owner place := by
  unfold completeParallelScopeUserTask? at completed
  split at completed <;> try contradiction
  rename_i candidates wait selected
  have present : wait ∈ before.waits :=
    (List.mem_filter.mp (selected.symm ▸ (show wait ∈ [wait] from by simp))).1
  split at completed <;> try contradiction
  obtain ⟨variables, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  cases Option.some.inj completed
  exact human_continuation_exchange before wait variables present owner place

/-- Actual scoped Service completion conserves marking independently of mapped data writes. -/
theorem completeParallelScopeEffect_continuation_marking
    (program : Program) (before after : RuntimeState) (id : EffectOccurrenceId)
    (result : EffectExecutionResult)
    (completed : completeParallelScopeEffect? program before id result = some after)
    (owner : ScopeOccurrenceId) (place : ControlPlaceId) :
    continuationMarking after owner place = continuationMarking before owner place := by
  unfold completeParallelScopeEffect? at completed
  split at completed <;> try contradiction
  rename_i candidates wait selected
  have present : wait ∈ before.effectWaits :=
    (List.mem_filter.mp (selected.symm ▸ (show wait ∈ [wait] from by simp))).1
  cases result <;> try contradiction
  split at completed <;> try contradiction
  split at completed <;> try contradiction
  split at completed <;> try contradiction
  obtain ⟨projected, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  obtain ⟨variables, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  cases Option.some.inj completed
  exact effect_continuation_exchange before wait
    { variables with activities := variables.activities.filter fun scope => !activityScopeMatches id scope }
    present owner place
  case h_2 =>
    rename_i patch missingResult impossible
    exact False.elim (impossible patch rfl)

namespace ParallelScopeCommand

/-- PMIS-DATA-01 conserves continuation marking through either exact Human completion route. -/
theorem completeTask_continuation_marking (program : Program) (before after : RuntimeState)
    (id : UserTaskInstanceId) (values : List VariableBinding)
    (completed : completeTask? program before id values = some after)
    (owner : ScopeOccurrenceId) (place : ControlPlaceId) :
    continuationMarking after owner place = continuationMarking before owner place := by
  unfold completeTask? at completed
  split at completed <;> try contradiction
  split at completed
  · exact completeParallelScopeUserTask_continuation_marking program before after id values completed owner place
  · obtain ⟨successor, applied, completed⟩ := Option.bind_eq_some_iff.mp completed
    unfold completeUserTask at applied
    split at applied <;> try contradiction
    rename_i wait selected
    have present := List.mem_of_find?_eq_some selected
    cases Option.some.inj applied
    cases Option.some.inj completed
    exact human_continuation_exchange before wait _ present owner place

/-- PMIS-DATA-01 conserves continuation marking through either exact Service completion route. -/
theorem completeEffect_continuation_marking (program : Program) (before after : RuntimeState)
    (id : EffectOccurrenceId) (result : EffectExecutionResult)
    (completed : completeEffect? program before id result = some after)
    (owner : ScopeOccurrenceId) (place : ControlPlaceId) :
    continuationMarking after owner place = continuationMarking before owner place := by
  unfold completeEffect? at completed
  split at completed <;> try contradiction
  rename_i candidates wait selected
  split at completed
  · exact completeParallelScopeEffect_continuation_marking program before after id result completed owner place
  · simp only [completeSerialEffect?, selected] at completed
    obtain ⟨variables, _, completed⟩ := Option.bind_eq_some_iff.mp completed
    cases Option.some.inj completed
    have present : wait ∈ before.effectWaits :=
      (List.mem_filter.mp (selected.symm ▸ (show wait ∈ [wait] from by simp))).1
    exact effect_continuation_exchange before wait variables present owner place

end ParallelScopeCommand

/-- The exact outer Activity holds its normal parent continuation while parallel bodies are live. -/
def parentContinuationMarking (entry : ParallelScopeEntry) (parent : ScopeOccurrenceId)
    (state : RuntimeState) (place : ControlPlaceId) : Nat :=
  continuationMarking state parent place + (state.activityOccurrences.filter fun record =>
    record.owner == parent && record.activityElementId == entry.elementId &&
      (match record.body with | .parallelChildScopes .. => true | _ => false) &&
      entry.normalOutput == place).length

/-- PMIS-ENTER-01 supplies exactly the issued bodies' entry-port credits, preserving every prior continuation. -/
theorem issueParallelBodies_continuation_balance (entry : ParallelScopeEntry)
    (parent : ScopeOccurrenceId) (items : List String) (index : Nat)
    (before after : RuntimeState) (iterations : List ParallelScopeIteration)
    (issued : issueParallelBodies? entry parent items index before = some (after, iterations))
    (queried : ScopeOccurrenceId) (place : ControlPlaceId) :
    continuationMarking after queried place = continuationMarking before queried place +
      (iterations.map (fun iteration => ownedPortCount [entry.childEntry] iteration.scope queried place)).sum := by
  induction items generalizing before index iterations with
  | nil =>
    simp only [issueParallelBodies?, Option.some.injEq, Prod.mk.injEq] at issued
    rcases issued with ⟨rfl, rfl⟩
    simp
  | cons item items ih =>
    unfold issueParallelBodies? at issued
    obtain ⟨variables, _, issued⟩ := Option.bind_eq_some_iff.mp issued
    obtain ⟨⟨successor, rest⟩, generated, issued⟩ := Option.bind_eq_some_iff.mp issued
    cases Option.some.inj issued
    have later := ih _ _ _ generated
    rw [later]
    let child : ScopeOccurrenceId := ⟨parent.processInstanceId, entry.childScopeId,
      scopeActivationCount before entry.childScopeId + 1⟩
    have added := add_many_count before.tokens [entry.childEntry] child queried place
    simp only [List.map_cons, List.sum_cons, continuationMarking,
      addTokens, List.foldr_cons, List.foldr_nil, tokenCount, child] at added ⊢
    omega

/-- PMIS-ENTER-01's distinct generated scope identities supply at most one new credit per owner and place. -/
theorem issueParallelBodies_continuation_credit_le_one (entry : ParallelScopeEntry)
    (parent : ScopeOccurrenceId) (items : List String) (index : Nat)
    (before after : RuntimeState) (iterations : List ParallelScopeIteration)
    (issued : issueParallelBodies? entry parent items index before = some (after, iterations))
    (queried : ScopeOccurrenceId) (place : ControlPlaceId) :
    continuationMarking after queried place ≤ continuationMarking before queried place + 1 := by
  have countBound :
      (iterations.map (fun iteration => ownedPortCount [entry.childEntry] iteration.scope queried place)).sum ≤
        (iterations.map (·.scope)).count queried := by
    clear issued
    induction iterations with
    | nil => simp
    | cons head tail ih =>
      simp only [List.map_cons, List.sum_cons, List.count_cons]
      have charge : ownedPortCount [entry.childEntry] head.scope queried place ≤
          (if head.scope == queried then 1 else 0) := by
        cases own : (head.scope == queried) <;> cases output : (entry.childEntry == place) <;>
          simp [ownedPortCount, own, output]
      omega
  have unique := List.nodup_iff_count.mp (issueParallelBodies_distinct_scopes issued) queried
  rw [issueParallelBodies_continuation_balance entry parent items index before after iterations issued queried place]
  omega

private theorem issued_parent_marking (entry : ParallelScopeEntry) (parent : ScopeOccurrenceId)
    (different : entry.childScopeId ≠ parent.definitionScopeId) (items : List String)
    (index : Nat) (before after : RuntimeState) (iterations : List ParallelScopeIteration)
    (issued : issueParallelBodies? entry parent items index before = some (after, iterations))
    (place : ControlPlaceId) : continuationMarking after parent place = continuationMarking before parent place := by
  induction items generalizing before index iterations with
  | nil => simp only [issueParallelBodies?, Option.some.injEq, Prod.mk.injEq] at issued; rcases issued with ⟨rfl, rfl⟩; rfl
  | cons item items ih =>
      unfold issueParallelBodies? at issued
      obtain ⟨variables, _, issued⟩ := Option.bind_eq_some_iff.mp issued
      obtain ⟨⟨successor, rest⟩, generated, issued⟩ := Option.bind_eq_some_iff.mp issued
      cases Option.some.inj issued
      have later := ih _ _ _ generated
      rw [later]
      let child : ScopeOccurrenceId := ⟨parent.processInstanceId, entry.childScopeId, scopeActivationCount before entry.childScopeId + 1⟩
      have foreign : child ≠ parent := fun same => different (congrArg ScopeOccurrenceId.definitionScopeId same)
      have added := add_many_count before.tokens [entry.childEntry] child parent place
      rw [ownedPortCount_foreign _ child parent place foreign, Nat.add_zero] at added
      simpa only [continuationMarking, addTokens, List.foldr_cons, List.foldr_nil, tokenCount, child] using
        congrArg (fun count => count + (before.waits.filter fun wait => wait.owner == parent && wait.output == place).length +
          (before.effectWaits.filter fun wait => wait.owner == parent && wait.output == place).length) added

/-- Actual clean entry consumes the parent input and retains exactly one normal continuation, including empty collections. -/
theorem enterParallelScope_parent_continuation_balance (entry : ParallelScopeEntry)
    (parent : ScopeOccurrenceId) (before after : RuntimeState)
    (clean : ParallelScopeCleanEntry entry parent before)
    (entered : enterParallelScope? entry before parent = some after) (place : ControlPlaceId) :
    parentContinuationMarking entry parent after place + ownedPortCount [entry.input] parent parent place =
      parentContinuationMarking entry parent before place + ownedPortCount [entry.normalOutput] parent parent place := by
  obtain ⟨_, different, activities, _, _, _⟩ := clean
  unfold enterParallelScope? at entered
  split at entered <;> try contradiction
  rename_i valid
  have unit : (before.tokens.filter fun token => token.placeId == entry.input && token.owner == parent).length = 1 := by
    simp only [Bool.or_eq_true, bne_iff_ne, not_or] at valid
    exact Classical.byContradiction valid.1.1.1.2
  have removed := remove_balance before.tokens entry.input parent parent place (token_present _ _ _ unit)
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  split at entered
  · cases Option.some.inj entered
    have added := add_many_count (removeToken before.tokens entry.input parent) [entry.normalOutput] parent parent place
    simp only [parentContinuationMarking, activities, List.filter_nil, List.length_nil, Nat.add_zero,
      continuationMarking, addTokens, List.foldr_cons, List.foldr_nil] at added ⊢
    unfold tokenCount at removed added
    omega
  · obtain ⟨⟨issued, iterations⟩, generated, installed⟩ := Option.bind_eq_some_iff.mp entered
    cases iterations with
    | nil => simp at installed
    | cons first rest =>
      cases Option.some.inj installed
      have marking := issued_parent_marking entry parent different _ _ _ _ _ generated place
      have structural := issueParallelBodies_structural_fields generated
      simp only [parentContinuationMarking, structural.2.1, activities, insertActivityOccurrence,
        List.filter_cons, List.filter_nil, beq_self_eq_true, Bool.true_and]
      simp only [continuationMarking] at marking ⊢
      unfold tokenCount ownedPortCount at removed
      unfold ownedPortCount
      cases output : (entry.normalOutput == place) <;> simp [output] at * <;> omega

/-- Regional cancellation only discards continuations, so PMIS-END-01 cannot fund another body firing. -/
theorem cancelScopeSubtree_continuationMarking_le (before : RuntimeState)
    (target queried : ScopeOccurrenceId) (disposition : SelectedScopeDisposition) (place : ControlPlaceId) :
    continuationMarking (cancelScopeSubtree before target disposition) queried place ≤
      continuationMarking before queried place := by
  unfold continuationMarking
  apply Nat.add_le_add
  · apply Nat.add_le_add
    · exact (List.filter_sublist.filter _).length_le
    · exact (List.filter_sublist.filter _).length_le
  · exact (List.filter_sublist.filter _).length_le

/-- Discard-only accounting composes across every sibling withdrawn by PMIS-END-01 early completion. -/
theorem cancelScopeSubtree_fold_continuationMarking_le (targets : List ParallelScopeIteration)
    (before : RuntimeState) (queried : ScopeOccurrenceId) (place : ControlPlaceId) :
    continuationMarking (targets.foldl (fun state target => cancelScopeSubtree state target.scope .remove) before) queried place ≤
      continuationMarking before queried place := by
  induction targets generalizing before with
  | nil => exact Nat.le_refl _
  | cons target rest ih =>
    exact Nat.le_trans (ih (cancelScopeSubtree before target.scope .remove))
      (cancelScopeSubtree_continuationMarking_le before target.scope queried .remove place)

private theorem addToken_foreign_continuationMarking (state : RuntimeState)
    (output place : ControlPlaceId) (owner queried : ScopeOccurrenceId) (different : owner ≠ queried) :
    continuationMarking { state with tokens := addToken state.tokens output owner } queried place =
      continuationMarking state queried place := by
  have added := add_many_count state.tokens [output] owner queried place
  rw [ownedPortCount_foreign _ owner queried place different, Nat.add_zero] at added
  simpa only [continuationMarking, addTokens, List.foldr_cons, List.foldr_nil, tokenCount] using
    congrArg (fun count => count + (state.waits.filter fun wait => wait.owner == queried && wait.output == place).length +
      (state.effectWaits.filter fun wait => wait.owner == queried && wait.output == place).length) added

/-- PMIS-END-01 only discards continuations outside the bound parent's exact owner;
remaining, natural and early retirement cannot supply another body's flow budget. -/
theorem completeParallelScope_foreign_continuationMarking_le (entry : ParallelScopeEntry)
    (target queried : ScopeOccurrenceId) (before after : RuntimeState) (binding : ParallelScopeBinding)
    (bound : parallelScopeBinding? entry before target = some binding)
    (completed : completeParallelScope? entry before target = some after)
    (foreign : queried ≠ binding.activity.owner) (place : ControlPlaceId) :
    continuationMarking after queried place ≤ continuationMarking before queried place := by
  unfold completeParallelScope? at completed
  simp only [bound, bind, Option.bind_some] at completed
  split at completed <;> try contradiction
  obtain ⟨variables, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  obtain ⟨condition, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  obtain ⟨retirement, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  let detached : RuntimeState  := { before with
    variables := variables,
    activityOccurrences := before.activityOccurrences.filter (· != binding.activity),
    parallelScopeControllers := before.parallelScopeControllers.filter (· != binding.controller) }
  have retired : continuationMarking (cancelScopeSubtree detached target .remove) queried place ≤
      continuationMarking before queried place :=
    cancelScopeSubtree_continuationMarking_le detached target queried .remove place
  cases retirement with
  | remaining next selected first rest =>
    cases Option.some.inj completed
    exact cancelScopeSubtree_continuationMarking_le
      { before with
        variables := variables,
        activityOccurrences := before.activityOccurrences.map fun candidate =>
          if candidate == binding.activity then { candidate with body := .parallelChildScopes first rest } else candidate,
        parallelScopeControllers := before.parallelScopeControllers.map fun candidate =>
          if candidate == binding.controller then next else candidate } target queried .remove place
  | naturalCompletion next selected =>
    cases Option.some.inj completed
    rw [addToken_foreign_continuationMarking _ _ place _ queried (Ne.symm foreign)]
    exact retired
  | earlyCompletion next selected first rest =>
    cases Option.some.inj completed
    rw [addToken_foreign_continuationMarking _ _ place _ queried (Ne.symm foreign)]
    exact Nat.le_trans (cancelScopeSubtree_fold_continuationMarking_le (first :: rest)
      (cancelScopeSubtree detached target .remove) queried place) retired

private theorem cancel_parent_marking (before : RuntimeState) (parent target : ScopeOccurrenceId)
    (noCalls : before.calledProcessOccurrences = [])
    (root : before.scopeOccurrences.filter (fun occurrence => decide (occurrence.id = parent)) = [⟨parent, none⟩])
    (different : target ≠ parent) (place : ControlPlaceId) :
    continuationMarking (cancelScopeSubtree before target .remove) parent place = continuationMarking before parent place ∧
    (cancelScopeSubtree before target .remove).calledProcessOccurrences = [] ∧
    (cancelScopeSubtree before target .remove).scopeOccurrences.filter (fun occurrence => decide (occurrence.id = parent)) = [⟨parent, none⟩] := by
  have parentless : occurrenceParent? before.scopeOccurrences parent = none := by
    unfold occurrenceParent?
    rw [← List.head?_filter, root]
    rfl
  have outside := occurrenceInSubtreeWithin_parentless before.scopeOccurrences target parent (Ne.symm different) parentless
  have calls := calledInstanceClosure_no_calls before target noCalls
  have census := (cancelScopeSubtree_outside_owner_census before target parent noCalls (outside _)).1
  refine ⟨?_, ?_, ?_⟩
  · unfold continuationMarking
    simp only [cancelScopeSubtree, scopeCancellationOwner, calls, List.contains_nil, Bool.or_false, List.filter_filter]
    have outsideOwner : occurrenceInSubtree before.scopeOccurrences target parent = false := outside _
    congr 2 <;> first | apply congrArg List.length | skip
    all_goals apply List.filter_congr <;> intro value _
    all_goals by_cases same : value.owner = parent <;> simp [same, outsideOwner]
  · change before.calledProcessOccurrences.filter _ = []
    rw [noCalls]
    rfl
  · simpa only [Bool.beq_eq_decide_eq] using census.trans (by simpa only [Bool.beq_eq_decide_eq] using root)

private theorem cancel_fold_parent_marking (before : RuntimeState) (parent : ScopeOccurrenceId)
    (targets : List ParallelScopeIteration) (noCalls : before.calledProcessOccurrences = [])
    (root : before.scopeOccurrences.filter (fun occurrence => decide (occurrence.id = parent)) = [⟨parent, none⟩])
    (different : ∀ iteration ∈ targets, iteration.scope ≠ parent) (place : ControlPlaceId) :
    continuationMarking (targets.foldl (fun current iteration => cancelScopeSubtree current iteration.scope .remove) before) parent place =
      continuationMarking before parent place := by
  induction targets generalizing before with
  | nil => rfl
  | cons first rest ih =>
    obtain ⟨marking, calls, census⟩ := cancel_parent_marking before parent first.scope noCalls root (different first (by simp)) place
    exact (ih _ calls census (fun iteration member => different iteration (by simp [member]))).trans marking

theorem ParallelScopeStructuralFrame.bound_parent_shape (entry : ParallelScopeEntry) (parent target : ScopeOccurrenceId)
    (before : RuntimeState) (binding : ParallelScopeBinding) (frame : ParallelScopeStructuralFrame parent before)
    (bound : parallelScopeBinding? entry before target = some binding) :
    before.activityOccurrences = [binding.activity] ∧ before.parallelScopeControllers = [binding.controller] ∧
      binding.activity.owner = parent ∧ binding.activity.activityElementId = entry.elementId ∧
      ∃ first rest, binding.activity.body = .parallelChildScopes first rest := by
  rcases frame.outer with empty | ⟨record, controller, activities, controllers, owner⟩
  · cases control : before.control <;> simp [parallelScopeBinding?, control, empty.1] at bound
  · unfold parallelScopeBinding? at bound
    split at bound <;> try contradiction
    split at bound <;> try contradiction
    rename_i chosen recordFilter
    split at bound <;> try contradiction
    rename_i first rest body
    split at bound <;> try contradiction
    rename_i header
    split at bound <;> try contradiction
    rename_i chosenController controllerFilter
    dsimp only at bound
    split at bound <;> try contradiction
    cases Option.some.inj bound
    have selectedRecord : chosen = record := by
      have member : chosen ∈ before.activityOccurrences :=
        (List.mem_filter.mp (recordFilter.symm ▸ (show chosen ∈ [chosen] from by simp))).1
      simpa [activities] using member
    have selectedController : chosenController = controller := by
      have member : chosenController ∈ before.parallelScopeControllers :=
        (List.mem_filter.mp (controllerFilter.symm ▸ (show chosenController ∈ [chosenController] from by simp))).1
      simpa [controllers] using member
    subst chosen
    subst chosenController
    refine ⟨activities, controllers, owner, ?_, first, rest, body⟩
    simp only [Bool.or_eq_true, bne_iff_ne, not_or] at header
    exact Classical.byContradiction header.1.1.1.1

private theorem cancel_fold_empty (targets : List ParallelScopeIteration) (state : RuntimeState)
    (empty : state.activityOccurrences = []) :
    (targets.foldl (fun current iteration => cancelScopeSubtree current iteration.scope .remove) state).activityOccurrences = [] := by
  induction targets generalizing state with
  | nil => exact empty
  | cons first rest ih => apply ih; simp [cancelScopeSubtree, empty, retainedByRegion]

/-- Actual retirement retains the parent continuation, exchanging its pending outer marker only at population completion. -/
theorem completeParallelScope_parent_continuation_marking (entry : ParallelScopeEntry)
    (parent target : ScopeOccurrenceId) (before after : RuntimeState) (binding : ParallelScopeBinding)
    (frame : ParallelScopeStructuralFrame parent before)
    (bound : parallelScopeBinding? entry before target = some binding)
    (completed : completeParallelScope? entry before target = some after) (place : ControlPlaceId) :
    parentContinuationMarking entry parent after place = parentContinuationMarking entry parent before place := by
  obtain ⟨activities, controllers, owner, element, firstBody, restBody, body⟩ := ParallelScopeStructuralFrame.bound_parent_shape entry parent target before binding frame bound
  have parentless : occurrenceParent? before.scopeOccurrences parent = none := by
    unfold occurrenceParent?
    rw [← List.head?_filter, frame.root]
    rfl
  have bodyDifferent : ∀ iteration ∈ binding.iterations, iteration.scope ≠ parent := by
    intro iteration member same
    have assigned := parallelScopeBinding_body_parent entry before target binding bound iteration member
    rw [same, owner, parentless] at assigned
    contradiction
  obtain ⟨selectedBody, selectedMember, selectedIdentity⟩ := parallelScopeBinding_member entry before target binding bound
  have targetDifferent : target ≠ parent := by simpa only [selectedIdentity] using bodyDifferent selectedBody selectedMember
  unfold completeParallelScope? at completed
  simp only [bound, bind, Option.bind_some] at completed
  split at completed <;> try contradiction
  obtain ⟨variables, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  obtain ⟨condition, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  obtain ⟨retirement, executed, completed⟩ := Option.bind_eq_some_iff.mp completed
  let detached := { before with
    variables := variables
    activityOccurrences := []
    parallelScopeControllers := [] }
  have detachedEq : { before with
      variables := variables
      activityOccurrences := before.activityOccurrences.filter (· != binding.activity)
      parallelScopeControllers := before.parallelScopeControllers.filter (· != binding.controller) } = detached := by
    simp [detached, activities, controllers]
  obtain ⟨retiredMarking, retiredCalls, retiredRoot⟩ := cancel_parent_marking detached parent target frame.noCalls frame.root targetDifferent place
  change continuationMarking (cancelScopeSubtree detached target .remove) parent place = continuationMarking before parent place at retiredMarking
  cases retirement with
  | remaining next selected first rest =>
    cases Option.some.inj completed
    have relation := retireParallelScopeIteration_dispatch binding.controller binding.iterations target condition
      (.remaining next selected first rest) executed
    cases relation with
    | remaining preceding following selected first rest valid shape identity siblings =>
      have distinct : ∀ iteration ∈ first :: rest, iteration.scope ≠ target := by
        have population := (parallelScopeBinding_population entry before target binding bound).1
        simp only [validParallelScopePopulation, Bool.and_eq_true] at population
        have unique := population.1.2
        simp only [validParallelScopeIterations, Bool.and_eq_true, decide_eq_true_eq] at unique
        have scopesUnique : (binding.iterations.map (·.scope)).Nodup :=
          List.nodup_iff_pairwise_ne.mpr (List.pairwise_map.mpr (unique.2.imp fun facts => facts.2.1))
        rw [shape, List.map_append, List.map_cons] at scopesUnique
        obtain ⟨_, tailUnique, disjoint⟩ := List.nodup_append.mp scopesUnique
        intro iteration member
        rw [← siblings] at member
        rcases List.mem_append.mp member with leading | trailing
        · exact fun same => disjoint iteration.scope (List.mem_map.mpr ⟨iteration, leading, rfl⟩)
            selected.scope (by simp) (same.trans identity.symm)
        · exact fun same => (List.nodup_cons.mp tailUnique).1 (List.mem_map.mpr ⟨iteration, trailing, same.trans identity.symm⟩)
      let next : ParallelScopeController := { binding.controller with completed := binding.controller.completed + 1 }
      let retained : (first :: rest).Sublist binding.iterations := by
        rw [← siblings, shape]
        exact (List.sublist_cons_self selected following).append_left preceding
      let edited := { before with
        variables := variables
        activityOccurrences := [{ binding.activity with body := .parallelChildScopes first rest }]
        parallelScopeControllers := [next] }
      simp only [activities, controllers, List.map_cons, List.map_nil, beq_self_eq_true, ↓reduceIte]
      change parentContinuationMarking entry parent (cancelScopeSubtree edited target .remove) place = _
      have marking := (cancel_parent_marking edited parent target frame.noCalls frame.root targetDifferent place).1
      have outer := cancelScopeSubtree_outside_parallel_outer edited target _ next frame.noCalls rfl rfl
        (by simpa only [edited, owner, occurrenceInSubtree] using occurrenceInSubtreeWithin_parentless before.scopeOccurrences target parent (Ne.symm targetDifferent) parentless _) (by
          intro scope claimed
          obtain ⟨iteration, member, rfl⟩ := List.mem_map.mp claimed
          apply parallelScopeBinding_sibling_outside entry before target binding bound iteration
          · exact retained.subset member
          · exact distinct iteration member
          · simpa only [owner] using parentless)
      simp only [parentContinuationMarking, outer.1, activities, owner, element, body,
        continuationMarking, beq_self_eq_true, Bool.true_and, List.filter_cons, List.filter_nil]
      simp only [continuationMarking] at marking
      cases output : (entry.normalOutput == place) <;> simp [output] at * <;> omega
  | naturalCompletion next selected =>
    cases Option.some.inj completed
    rw [detachedEq]
    have added := add_many_count (cancelScopeSubtree detached target .remove).tokens [entry.normalOutput] parent parent place
    have empty : (cancelScopeSubtree detached target .remove).activityOccurrences = [] := by
      simp [cancelScopeSubtree, detached, retainedByRegion]
    simp only [parentContinuationMarking, continuationMarking, activities, owner, element, body,
      empty, List.filter_nil, List.filter_cons, beq_self_eq_true, Bool.true_and]
    unfold continuationMarking at retiredMarking
    unfold tokenCount ownedPortCount at added
    cases output : (entry.normalOutput == place) <;> simp [output, addTokens] at * <;> omega
  | earlyCompletion next selected first rest =>
    cases Option.some.inj completed
    rw [detachedEq]
    have relation := retireParallelScopeIteration_dispatch binding.controller binding.iterations target condition
      (.earlyCompletion next selected first rest) executed
    cases relation with
    | earlyCompletion preceding following selected first rest valid shape identity siblings =>
      have different : ∀ iteration ∈ first :: rest, iteration.scope ≠ parent := by
        intro iteration member
        apply bodyDifferent iteration
        have retained : (first :: rest).Sublist binding.iterations := by
          rw [← siblings, shape]
          exact (List.sublist_cons_self selected following).append_left preceding
        exact retained.subset member
      have cancelledMarking := (cancel_fold_parent_marking _ parent (first :: rest) retiredCalls retiredRoot different place).trans retiredMarking
      have empty : ((first :: rest).foldl (fun current iteration => cancelScopeSubtree current iteration.scope .remove)
          (cancelScopeSubtree detached target .remove)).activityOccurrences = [] := by
        apply cancel_fold_empty
        simp [cancelScopeSubtree, detached, retainedByRegion]
      have added := add_many_count ((first :: rest).foldl
        (fun current iteration => cancelScopeSubtree current iteration.scope .remove)
        (cancelScopeSubtree detached target .remove)).tokens [entry.normalOutput] parent parent place
      simp only [parentContinuationMarking, empty, activities, owner, element, body,
        continuationMarking, List.filter_nil, List.filter_cons, beq_self_eq_true, Bool.true_and]
      unfold continuationMarking at cancelledMarking
      unfold tokenCount ownedPortCount at added
      cases output : (entry.normalOutput == place) <;> simp [output, addTokens] at * <;> omega

def armingContinuationPorts : InternalArmingWrite → List ControlPlaceId
  | .userTask wait => [wait.output]
  | .effect wait _ => [wait.output]
  | .message _ | .timer _ => []

private theorem arming_patch_balance (before : RuntimeState) (patch : InternalArmingPatch)
    (owned : patch.write.owner = patch.owner)
    (present : ({ placeId := patch.input, owner := patch.owner } : ControlToken) ∈ before.tokens)
    (queried : ScopeOccurrenceId) (place : ControlPlaceId) :
    continuationMarking (applyInternalArmingPatch before patch) queried place + ownedPortCount [patch.input] patch.owner queried place =
      continuationMarking before queried place + ownedPortCount (armingContinuationPorts patch.write) patch.owner queried place := by
  have removed := remove_balance before.tokens patch.input patch.owner queried place present
  cases write : patch.write with
  | userTask wait =>
    have inserted := length_filter_insertUserTaskWait (fun wait => wait.owner == queried && wait.output == place) wait before.waits
    simp only [write, InternalArmingWrite.owner] at owned
    simp only [applyInternalArmingPatch, write, armingContinuationPorts, continuationMarking]
    unfold ownedPortCount tokenCount at *
    rw [owned] at inserted
    cases selected : (patch.owner == queried && wait.output == place) <;> simp [selected] at inserted ⊢ <;> omega
  | effect wait bindings =>
    have inserted := length_filter_canonicalInsertBy effectWaitBefore (fun wait : EffectWait => wait.owner == queried && wait.output == place) wait before.effectWaits
    simp only [write, InternalArmingWrite.owner] at owned
    simp only [applyInternalArmingPatch, write, armingContinuationPorts, continuationMarking, insertEffectWait]
    unfold ownedPortCount tokenCount at *
    rw [owned] at inserted
    cases selected : (patch.owner == queried && wait.output == place) <;> simp [selected] at inserted ⊢ <;> omega
  | message wait | timer wait =>
    simp only [applyInternalArmingPatch, write, armingContinuationPorts, continuationMarking, ownedPortCount, List.filter_nil, List.length_nil, Nat.add_zero]
    unfold tokenCount ownedPortCount at removed
    omega

private theorem successful_refusing_guard {α : Type} (guard : Bool) (tail : Option α) (value : α)
    (successful : (if guard then none else tail) = some value) : tail = some value := by
  cases guard <;> simp_all

private theorem reserved_arm_provenance (program : Program) (before : RuntimeState)
    (candidate : InternalOperationOccurrence) (activation : Nat) (patch : InternalArmingPatch)
    (prepared : prepareReservedOccurrenceArm? program before candidate activation = some patch) :
    patch.owner = candidate.owner ∧ bodyConsumedPorts patch.operation = [patch.input] ∧
      bodyProducedPorts patch.operation = armingContinuationPorts patch.write ∧ patch.write.owner = patch.owner ∧
      ({ placeId := patch.input, owner := patch.owner } : ControlToken) ∈ before.tokens := by
  cases control : before.control <;> simp only [prepareReservedOccurrenceArm?, control, bind] at prepared <;> try contradiction
  have prepared := successful_refusing_guard _ _ patch prepared
  try simp only [pure, Option.bind_some] at prepared
  obtain ⟨operation, _, prepared⟩ := Option.bind_eq_some_iff.mp prepared
  obtain ⟨input, inputEq, prepared⟩ := Option.bind_eq_some_iff.mp prepared
  obtain ⟨origin, _, prepared⟩ := Option.bind_eq_some_iff.mp prepared
  split at prepared <;> try contradiction
  rename_i valid
  have unit : (before.tokens.filter fun token => token.placeId == input && token.owner == candidate.owner).length = 1 := by
    simp only [Bool.or_eq_true, Bool.not_eq_true, bne_iff_ne, not_or] at valid
    exact Classical.byContradiction valid.2
  try simp only [pure, Option.bind_some] at prepared
  obtain ⟨inputOrigin, _, prepared⟩ := Option.bind_eq_some_iff.mp prepared
  cases parallel : hasParallelScopeDefinition program candidate.owner <;> simp only [parallel, ↓reduceIte] at prepared
  all_goals first
    | (have prepared := successful_refusing_guard _ _ patch prepared
       obtain ⟨_, _, prepared⟩ := Option.bind_eq_some_iff.mp prepared)
    | skip
  all_goals cases operation <;> simp only [Option.bind_none] at prepared <;> try contradiction
  all_goals try simp only [Bool.false_eq_true, ↓reduceIte] at prepared
  all_goals simp only [internalArmInput?, Option.some.injEq] at inputEq
  all_goals subst input
  all_goals first
    | (have prepared := successful_refusing_guard _ _ patch prepared
       cases Option.some.inj prepared
       exact ⟨rfl, rfl, rfl, rfl, token_present _ _ _ unit⟩)
    | (obtain ⟨arguments, _, prepared⟩ := Option.bind_eq_some_iff.mp prepared
       have prepared := successful_refusing_guard _ _ patch prepared
       cases Option.some.inj prepared
       exact ⟨rfl, rfl, rfl, rfl, token_present _ _ _ unit⟩)

/-- Actual reserved arming balances the operation's declared ports at its allocated activation. -/
theorem prepareReservedOccurrenceArm_continuation_balance (program : Program) (before : RuntimeState)
    (candidate : InternalOperationOccurrence) (activation : Nat) (patch : InternalArmingPatch)
    (prepared : prepareReservedOccurrenceArm? program before candidate activation = some patch)
    (queried : ScopeOccurrenceId) (place : ControlPlaceId) :
    continuationMarking (applyInternalArmingPatch before patch) queried place +
      ownedPortCount (bodyConsumedPorts patch.operation) patch.owner queried place =
      continuationMarking before queried place + ownedPortCount (bodyProducedPorts patch.operation) patch.owner queried place := by
  obtain ⟨_, consumed, produced, owned, present⟩ := reserved_arm_provenance program before candidate activation patch prepared
  rw [consumed, produced]
  exact arming_patch_balance before patch owned present queried place

private theorem all_of_not_all_false {α : Type} (xs : List α) (predicate : α → Bool)
    (negative : (!xs.all predicate) = false) : ∀ value ∈ xs, predicate value = true := by
  have positive : xs.all predicate = true := by
    cases checked : xs.all predicate <;> simp_all
  exact List.all_eq_true.mp positive

private theorem reserved_token_provenance (program : Program) (before : RuntimeState)
    (candidate : InternalOperationOccurrence) (patch : InternalOccurrenceTokenPatch)
    (prepared : prepareOccurrenceTokenPatch? program before candidate = some patch) :
    patch.tokens.owner = candidate.owner ∧ bodyConsumedPorts patch.operation = patch.tokens.consumed ∧
      bodyProducedPorts patch.operation = patch.tokens.produced ∧ patch.tokens.consumed.Nodup ∧
      ∀ input ∈ patch.tokens.consumed, ({ placeId := input, owner := patch.tokens.owner } : ControlToken) ∈ before.tokens := by
  cases control : before.control <;> simp only [prepareOccurrenceTokenPatch?, control, bind] at prepared <;> try contradiction
  obtain ⟨operation, _, prepared⟩ := Option.bind_eq_some_iff.mp prepared
  cases operation <;> simp only [Option.bind_none] at prepared <;> try contradiction
  all_goals try (split at prepared <;> try contradiction)
  all_goals simp only [Option.bind_some] at prepared
  all_goals
    split at prepared <;> try contradiction
    rename_i valid
    simp only [Bool.or_eq_true, Bool.not_eq_true, not_or] at valid
    have unique : _ := valid.1.1.1.2
    have available : _ := valid.1.2
    have prepared := successful_refusing_guard _ _ patch prepared
    try simp only [pure, Option.bind_some] at prepared
    obtain ⟨_, _, prepared⟩ := Option.bind_eq_some_iff.mp prepared
    cases Option.some.inj prepared
    refine ⟨rfl, rfl, rfl, ?_, ?_⟩
    · first | (simp; done) | simpa using unique
    · intro input member
      apply token_present
      have ready := all_of_not_all_false _
        (fun input => (before.tokens.filter fun token => token.placeId == input && token.owner == candidate.owner).length == 1) available input member
      simpa only [beq_iff_eq] using ready

/-- Actual reserved token preparation establishes the exact owned port balance before batch application. -/
theorem prepareOccurrenceTokenPatch_continuation_balance (program : Program) (before : RuntimeState)
    (candidate : InternalOperationOccurrence) (patch : InternalOccurrenceTokenPatch)
    (prepared : prepareOccurrenceTokenPatch? program before candidate = some patch)
    (queried : ScopeOccurrenceId) (place : ControlPlaceId) :
    continuationMarking (InternalOccurrencePatch.apply before (.token patch)) queried place +
      ownedPortCount (bodyConsumedPorts patch.operation) patch.tokens.owner queried place =
      continuationMarking before queried place + ownedPortCount (bodyProducedPorts patch.operation) patch.tokens.owner queried place := by
  obtain ⟨_, consumed, produced, unique, present⟩ := reserved_token_provenance program before candidate patch prepared
  rw [consumed, produced]
  have removed := remove_many_balance before.tokens patch.tokens.consumed patch.tokens.owner queried place unique present
  have added := add_many_count (removeTokens before.tokens patch.tokens.consumed patch.tokens.owner) patch.tokens.produced patch.tokens.owner queried place
  simp only [InternalOccurrencePatch.apply, TokenPatch.apply, continuationMarking]
  unfold tokenCount at removed added
  omega

def occurrenceConsumedCharge (queried : ScopeOccurrenceId) (place : ControlPlaceId)
    (patch : InternalOccurrencePatch) : Nat :=
  ownedPortCount (bodyConsumedPorts patch.operation) patch.owner queried place

def occurrenceProducedCharge (queried : ScopeOccurrenceId) (place : ControlPlaceId)
    (patch : InternalOccurrencePatch) : Nat :=
  ownedPortCount (bodyProducedPorts patch.operation) patch.owner queried place

private theorem prepared_step_balance (program : Program) (before after : RuntimeState)
    (patch : InternalOccurrencePatch) (step : InternalOccurrencePatchStep program before after patch)
    (queried : ScopeOccurrenceId) (place : ControlPlaceId) :
    continuationMarking after queried place + occurrenceConsumedCharge queried place patch =
      continuationMarking before queried place + occurrenceProducedCharge queried place patch := by
  cases patch with
  | arm arm =>
    obtain ⟨rfl, _, _, prepared⟩ := step
    simpa only [occurrenceConsumedCharge, occurrenceProducedCharge, InternalOccurrencePatch.operation,
      InternalOccurrencePatch.owner, InternalOccurrencePatch.apply] using
      prepareReservedOccurrenceArm_continuation_balance program before ⟨arm.operation.id, arm.owner⟩
        arm.write.occurrence.activation arm prepared queried place
  | token token =>
    obtain ⟨rfl, prepared⟩ := step
    simpa only [occurrenceConsumedCharge, occurrenceProducedCharge, InternalOccurrencePatch.operation,
      InternalOccurrencePatch.owner] using
      prepareOccurrenceTokenPatch_continuation_balance program before ⟨token.operation.id, token.tokens.owner⟩
        token prepared queried place

private theorem ordered_prefix_balance (program : Program) (members : List InternalOccurrencePatch)
    (before : RuntimeState) (successors : List RuntimeState)
    (length : successors.length = members.length)
    (steps : ∀ pair ∈ members.zip ((before :: successors).zip successors),
      InternalOccurrencePatchStep program pair.2.1 pair.2.2 pair.1)
    (n : Nat) (current : RuntimeState) (selected : (before :: successors)[n]? = some current)
    (queried : ScopeOccurrenceId) (place : ControlPlaceId) :
    continuationMarking current queried place + ((members.take n).map (occurrenceConsumedCharge queried place)).sum =
      continuationMarking before queried place + ((members.take n).map (occurrenceProducedCharge queried place)).sum := by
  induction members generalizing before successors n current with
  | nil =>
    cases successors with
    | nil =>
      cases n with
      | zero => simp at selected; subst current; simp
      | succ n => simp at selected
    | cons next tail => simp at length
  | cons patch rest ih =>
    cases successors with
    | nil => simp at length
    | cons next tail =>
      have tailLength : tail.length = rest.length := by simpa using length
      have first := prepared_step_balance program before next patch (steps (patch, before, next) (by simp)) queried place
      have later : ∀ pair ∈ rest.zip ((next :: tail).zip tail),
          InternalOccurrencePatchStep program pair.2.1 pair.2.2 pair.1 := by
        intro pair member
        exact steps pair (by simp only [List.zip_cons_cons, List.mem_cons]; exact Or.inr member)
      cases n with
      | zero => simp at selected; subst current; simp
      | succ n =>
        have tailSelected : (next :: tail)[n]? = some current := by simpa using selected
        have tailBalance := ih next tail tailLength later n current tailSelected
        simp only [List.take_succ_cons, List.map_cons, List.sum_cons]
        omega

/-- Every actual ordered batch prefix balances its cumulative owned consumed and produced continuation ports. -/
theorem applyInternalOccurrenceBatch_prefix_continuation_balance
    (program : Program) (before : RuntimeState) (batch : InternalOccurrenceBatch)
    (successors : List RuntimeState)
    (applied : applyInternalOccurrenceBatch? program before batch = some successors)
    (n : Nat) (current : RuntimeState) (selected : (before :: successors)[n]? = some current)
    (queried : ScopeOccurrenceId) (place : ControlPlaceId) :
    continuationMarking current queried place + ((batch.members.take n).map (occurrenceConsumedCharge queried place)).sum =
      continuationMarking before queried place + ((batch.members.take n).map (occurrenceProducedCharge queried place)).sum := by
  obtain ⟨length, steps⟩ := applyInternalOccurrenceBatch_ordered_steps program before batch successors applied
  exact ordered_prefix_balance program batch.members before successors length steps n current selected queried place

end BpmnSemantics.SemanticProcess
