module

public import Kernel.Laws.State
import all Kernel.State.Removal

/-! # Laws of the kernel state: removal

The lemmas about `Kernel.State.Removal`'s operations, the one module that sees their bodies: what clearing, leaving,
withdrawing and cancelling do to the fields the invariant reads (`clearInside_cleared`, `clearInside_ends`), their
equations (`clearInside_eq`, `leaveScope_eq`, `removeOccurrence_eq`, `withdrawOccurrence_eq`), and the cancelled
facts they journal (`removal_cancels_with_ends`). `Kernel.State`'s own operations are read through
`Kernel.Laws.State`'s equations. Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Laws.State

open Kernel

/-! ### Cancellation facts -/

private theorem recordCancelled_cancels (state : State) (occurrences : List Occurrence) :
    CancelsWithEnds state (State.recordCancelled state occurrences) := by
  refine ⟨occurrences.filter (·.begun), (occurrences.filter (·.begun)).map state.keyOf, ?_, ?_, by simp, ?_⟩
  · simp [State.recordCancelled]
  · simp [State.recordCancelled, List.map_map, Function.comp_def]
  · intro occurrence member
    simpa using (List.mem_filter.mp member).2

private theorem clearInside_cancels (state : State) (scope : ScopeOccurrenceId) (keep : List OccurrenceId) :
    CancelsWithEnds state (state.clearInside scope keep) := by
  obtain ⟨begun, keys, facts⟩ := recordCancelled_cancels state
    ((state.subtree scope).reverse.flatMap fun current =>
      state.occurrences.filter fun occurrence => occurrence.scope == current && !keep.contains occurrence.id)
  obtain ⟨cancelled, ended, length, flagged⟩ := facts
  exact ⟨begun, keys, by simpa [State.clearInside] using cancelled, by simpa [State.clearInside] using ended, length,
    flagged⟩

private theorem removeOccurrence_cancels (state : State) (id : OccurrenceId) :
    CancelsWithEnds state (state.removeOccurrence id) := by
  have fold : ∀ (scopes : List ScopeOccurrence) (current : State), CancelsWithEnds state current →
      CancelsWithEnds state (scopes.foldl (fun state scope => state.leaveScope scope.id) current) := by
    intro scopes
    induction scopes with
    | nil => intro current reached; exact reached
    | cons scope rest ih =>
      intro current reached
      refine ih _ (reached.trans ?_)
      obtain ⟨begun, keys, facts⟩ := clearInside_cancels current scope.id []
      obtain ⟨cancelled, ended, length, flagged⟩ := facts
      exact ⟨begun, keys, by simpa [State.leaveScope] using cancelled, by simpa [State.leaveScope] using ended, length,
        flagged⟩
  exact fold _ _ (.ofDraft rfl)

private theorem withdrawOccurrence_draft (state : State) (id : OccurrenceId) :
    (state.withdrawOccurrence id).draft = state.draft := by
  have fold : ∀ (scopes : List ScopeOccurrence) (current : State), current.draft = state.draft →
      (scopes.foldl (fun state scope => state.withdrawInside scope.id) current).draft = state.draft := by
    intro scopes
    induction scopes with
    | nil => intro current same; exact same
    | cons scope rest ih => intro current same; exact ih _ (by simpa [State.withdrawInside] using same)
  exact fold _ _ (by simp [closeOwnItems_eq, disarm_eq])

/-- Clearing a scope occurrence and cancelling an occurrence journal their cancelled facts with their end facts
(`CancelsWithEnds`): `State.Removal`'s one cancelled-fact writer pairs every cancelled fact with its end, so P3's notice
is given exactly when the end is journalled. -/
theorem removal_cancels_with_ends (state : State) :
    (∀ scope keep, CancelsWithEnds state (state.clearInside scope keep)) ∧
      ∀ id, CancelsWithEnds state (state.cancelOccurrence id) := by
  refine ⟨clearInside_cancels state, fun id => ?_⟩
  unfold State.cancelOccurrence
  split
  · exact .ofDraft rfl
  · rename_i occurrence _
    exact ((CancelsWithEnds.ofDraft (withdrawOccurrence_draft state id)).trans
      (removeOccurrence_cancels _ id)).trans (recordCancelled_cancels _ [occurrence])

/-- A queued cancellation of an occurrence that is gone changes nothing. -/
theorem cancelOccurrence_absent {state : State} {id : OccurrenceId} (absent : state.occurrence? id = none) :
    state.cancelOccurrence id = state := by
  simp [State.cancelOccurrence, absent]

/-- Clearing inside a scope occurrence keeps the counters of the scope occurrences that remain, so every history grows. -/
theorem clearInside_grows (s : State) (scope : ScopeOccurrenceId) (keep : List OccurrenceId) :
    ScopeGrows s (s.clearInside scope keep) := by
  have fewer : (s.clearInside scope keep).scopes.Sublist s.scopes := List.filter_sublist
  refine .shrink (fun _ member => (fewer.map _).subset member) fun parent standing _ => ?_
  simp only [State.clearInside, State.recordCancelled] at standing ⊢
  obtain ⟨entry, inside, rfl⟩ := List.mem_map.mp standing
  exact getD_filter_keep fun _ => (List.mem_filter.mp inside).2

/-- Clearing keeps the occurrence counters of the scope occurrences that stay. -/
theorem clearInside_counters (s : State) (scope : ScopeOccurrenceId) (keep : List OccurrenceId) :
    ∀ x ∈ scopeIds (s.clearInside scope keep), ∀ element,
      occurrenceCount (s.clearInside scope keep) x element = occurrenceCount s x element := by
  intro x standing element
  simp only [scopeIds, occurrenceCount, State.clearInside, State.recordCancelled] at standing ⊢
  obtain ⟨entry, inside, rfl⟩ := List.mem_map.mp standing
  exact getD_filter_keep fun _ => (List.mem_filter.mp inside).2

/-- `State.clearInside` drops the tokens inside the scope occurrence from both token queues and keeps the signals. -/
theorem clearInside_queues (s : State) (scope : ScopeOccurrenceId) (keep : List OccurrenceId) :
    QueuesKept s (s.clearInside scope keep) :=
  ⟨by simp [State.clearInside, State.recordCancelled], by simp [State.clearInside, State.recordCancelled],
    fun _ _ found => by simpa [State.clearInside, State.recordCancelled] using found,
    fun _ _ found => by
      simp only [State.clearInside, State.recordCancelled, Std.ExtTreeMap.getElem?_filter] at found
      exact Option.eq_some_of_pfilter_eq_some found⟩

/-- `State.clearInside` of a present scope occurrence of a well-formed state is `Cleared`. -/
theorem clearInside_cleared {s : State} (formed : WellFormed program s) {scope : ScopeOccurrenceId} (present : scope ∈ scopeIds s)
    (keep : List OccurrenceId) : Cleared s (s.clearInside scope keep) scope keep := by
  have mem := subtree_iff formed present
  have scopes : ∀ entry, entry ∈ (s.clearInside scope keep).scopes ↔ entry ∈ s.scopes ∧ ¬ StrictlyWithin s entry.id scope := by
    intro entry
    simp [State.clearInside, State.recordCancelled, mem, StrictlyWithin]
  have fewer : (s.clearInside scope keep).scopes.Sublist s.scopes := List.filter_sublist
  have ordinals : ∀ occurrence ∈ (s.clearInside scope keep).occurrences,
      (s.clearInside scope keep).itemOrdinals.getD occurrence.id 0 = s.itemOrdinals.getD occurrence.id 0 := by
    intro occurrence member
    simp only [State.clearInside, State.recordCancelled] at member ⊢
    obtain ⟨old, stays⟩ := List.mem_filter.mp member
    refine getD_filter_keep fun _ => ?_
    simp only [Bool.not_eq_eq_eq_not, Bool.not_true, List.any_eq_false, beq_iff_eq]
    intro removed inRemoved same
    simp only [List.mem_flatMap, List.mem_reverse, List.mem_filter, Bool.and_eq_true, beq_iff_eq,
      Bool.not_eq_eq_eq_not, Bool.not_true] at inRemoved
    obtain ⟨current, inside, held, rest⟩ := inRemoved
    obtain ⟨sameScope, kept⟩ := rest
    have := nodup_map_eq formed.distinct.occurrences held old same
    subst this
    simp [sameScope ▸ inside] at stays
    simp [stays] at kept
  refine {
      scopes := scopes, occurrences := fun occurrence => ?_, items := fun item => ?_, tokens := fun token => ?_,
      variables := fun variables => ?_, scopesSublist := fewer, occurrencesSublist := List.filter_sublist,
      scopeGrows := clearInside_grows s scope keep,
      openItemsSub := ItemsSub.filter _ _, ordinals := ordinals, tokensSublist := ?_,
      variablesSublist := List.filter_sublist, instances := fun x member => ?_, activations := rfl, counters := clearInside_counters s scope keep,
      signals := rfl, queues := clearInside_queues s scope keep, status := rfl, failure := rfl, journal := rfl,
      transitions := rfl, started := rfl,
      slots := ⟨fun _ member => ?_, fun _ member => ?_, fun _ member => ?_⟩,
      bodies := by simp [State.clearInside, State.recordCancelled, featureSlotsClear_eq] }
  rotate_left 4
  · simp only [allQueuedTokens, State.clearInside, State.recordCancelled, Std.ExtTreeMap.toList_filter]
    exact (List.filter_sublist.map _).append List.filter_sublist
  · obtain ⟨entry, inside, named⟩ := List.mem_map.mp member
    obtain ⟨old, outside⟩ := (scopes entry).mp inside
    refine named ▸ instanceOf_kept formed (formed.distinct.scopes.sublist (fewer.map _))
      (fun entry member orphan => (formed.rooted.2.1 entry (fewer.subset member)).mp orphan) rfl
      (List.mem_map.mpr ⟨entry, old, rfl⟩) fun above upper within => (scopes above).mpr ⟨upper, fun ⟨inner, other⟩ => ?_⟩
    have entryInside : Within s entry.id scope := within.trans inner
    refine outside ⟨entryInside, fun same => other ?_⟩
    rw [same] at within
    exact Within.antisymm formed (List.mem_map.mpr ⟨above, upper, rfl⟩) inner within
  iterate 3
    · simp only [State.clearInside, State.recordCancelled, featureSlotsClear_eq] at member
      exact (List.mem_filter.mp member).1
  all_goals simp [State.clearInside, State.recordCancelled, mem, StrictlyWithin,
    mem_itemList_filter formed.distinct.items, allQueuedTokens, Std.ExtTreeMap.toList_filter, or_and_right]

/-- Clearing a present scope occurrence of a well-formed state journals each begun occurrence it removes once, under
its key: those within the scope occurrence that it does not keep. -/
theorem clearInside_ends {s : State} (formed : WellFormed program s) {scope : ScopeOccurrenceId}
    (present : scope ∈ scopeIds s) (keep : List OccurrenceId) :
    ∃ gone : List Occurrence,
      (s.clearInside scope keep).draft.ended = s.draft.ended ++ gone.map (fun o => (key s o, Terminal.cancelled)) ∧
      (gone.map (·.id)).Nodup ∧
      ∀ o, o ∈ gone ↔ o ∈ s.occurrences ∧ o.begun = true ∧ Within s o.scope scope ∧ o.id ∉ keep := by
  have tree : (s.subtree scope).Nodup := subtree_nodup s formed.distinct.scopes scope
  have mem := subtree_iff formed present
  let removed := (s.subtree scope).reverse.flatMap fun current =>
    s.occurrences.filter fun occurrence => occurrence.scope == current && !keep.contains occurrence.id
  refine ⟨removed.filter (·.begun), ?_, ?_, fun o => ?_⟩
  · simp [State.clearInside, State.recordCancelled, removed, keyOf_eq]
  · refine (List.Sublist.map _ List.filter_sublist).nodup ?_
    rw [List.map_flatMap]
    refine List.pairwise_flatMap.mpr ⟨fun current _ =>
      formed.distinct.occurrences.sublist (List.filter_sublist.map _), ?_⟩
    refine (List.pairwise_reverse.mpr (tree.imp Ne.symm)).imp_of_mem fun inFirst inSecond apart => ?_
    intro id one _ two equal
    subst equal
    obtain ⟨first, firstIn, rfl⟩ := List.mem_map.mp one
    obtain ⟨second, secondIn, same⟩ := List.mem_map.mp two
    obtain ⟨firstMember, firstAt⟩ := List.mem_filter.mp firstIn
    obtain ⟨secondMember, secondAt⟩ := List.mem_filter.mp secondIn
    obtain rfl := nodup_map_eq formed.distinct.occurrences secondMember firstMember same
    simp only [Bool.and_eq_true, beq_iff_eq] at firstAt secondAt
    exact apart (firstAt.1.symm.trans secondAt.1)
  · simp only [List.mem_filter, removed, List.mem_flatMap, List.mem_reverse, Bool.and_eq_true, beq_iff_eq,
      Bool.not_eq_true', List.contains_eq_mem, decide_eq_false_iff_not, mem]
    constructor
    · rintro ⟨⟨_, inside, member, rfl, outside⟩, begun⟩
      exact ⟨member, begun, inside, outside⟩
    · rintro ⟨member, begun, inside, outside⟩
      exact ⟨⟨_, inside, member, rfl, outside⟩, begun⟩

/-- `State.clearInside` drops what lies inside the scope occurrence (`State.subtree`), its own record kept, and journals
the cancellations in `draft`: the one equation of the clearing the laws above this module read. -/
theorem clearInside_eq (s : State) (scope : ScopeOccurrenceId) (keep : List OccurrenceId) : ∃ draft, s.clearInside scope keep =
    { s with
      batchTokens := s.batchTokens.filter (!(s.subtree scope).contains ·.busyScope)
      queuedTokens := s.queuedTokens.filter fun _ token => !(s.subtree scope).contains token.busyScope
      openItems := s.openItems.filter fun _ item => !(s.subtree scope).contains item.scope || keep.contains item.id.occurrence
      itemOrdinals := s.itemOrdinals.filter fun id _ => !((s.subtree scope).reverse.flatMap fun current =>
        s.occurrences.filter fun occurrence => occurrence.scope == current && !keep.contains occurrence.id).any (·.id == id)
      occurrences := s.occurrences.filter fun occurrence =>
        !(s.subtree scope).contains occurrence.scope || keep.contains occurrence.id
      scopes := s.scopes.filter (!((s.subtree scope).filter (· != scope)).contains ·.id)
      scopeOrdinals := s.scopeOrdinals.filter fun slot _ => !((s.subtree scope).filter (· != scope)).contains slot.parent
      occurrenceOrdinals :=
        s.occurrenceOrdinals.filter fun slot _ => !((s.subtree scope).filter (· != scope)).contains slot.parent
      variables := s.variables.filter (!((s.subtree scope).filter (· != scope)).contains ·.scope)
      slots := {
        parked := s.slots.parked.filter (!(s.subtree scope).contains ·.scope)
        held := s.slots.held.filter (!(s.subtree scope).contains ·.scope)
        multiInstances := s.slots.multiInstances.filter (!(s.subtree scope).contains ·.scope)
        compensation := {
          retained := s.slots.compensation.retained.filter (!((s.subtree scope).filter (· != scope)).contains ·.scope)
          runs := s.slots.compensation.runs.filter (!(s.subtree scope).contains ·.scope) }
        instances := s.slots.instances.filter (!((s.subtree scope).filter (· != scope)).contains ·.root) }
      draft } :=
  ⟨_, by simp only [State.clearInside, State.recordCancelled, featureSlotsClear_eq]; rfl⟩

/-- Leaving a scope occurrence keeps the slots its clearing leaves but the compensation records it retains and its
instance entry. -/
theorem leaveScope_slots_eq (s : State) (scope : ScopeOccurrenceId) :
    (s.leaveScope scope).slots = { (s.clearInside scope).slots with
      compensation := { (s.clearInside scope).slots.compensation with
        retained := (s.clearInside scope).slots.compensation.retained.filter (·.scope != scope) }
      instances := (s.clearInside scope).slots.instances.filter (·.root != scope) } := by
  simp only [State.leaveScope]

/-- `State.leaveScope` clears the scope occurrence, then removes it and its variable set, and keeps the instance. -/
theorem leaveScope_eq (s : State) (scope : ScopeOccurrenceId) :
    s.leaveScope scope = { s.clearInside scope with
      scopes := (s.clearInside scope).scopes.filter (·.id != scope)
      scopeOrdinals := (s.clearInside scope).scopeOrdinals.filter fun slot _ => slot.parent != scope
      occurrenceOrdinals := (s.clearInside scope).occurrenceOrdinals.filter fun slot _ => slot.parent != scope
      variables := (s.clearInside scope).variables.filter (·.scope != scope)
      slots := (s.leaveScope scope).slots } ∧
    (s.leaveScope scope).instanceId = s.instanceId := by
  simp [State.leaveScope, State.clearInside, State.recordCancelled]

/-- `State.removeOccurrence` leaves the scope occurrences the occurrence owns after removing its record. -/
theorem removeOccurrence_eq (s : State) (id : OccurrenceId) :
    s.removeOccurrence id =
      (s.scopes.filter (·.occurrence == some id)).foldl (fun t entry => t.leaveScope entry.id) (withoutRecord s id) := by
  simp [State.removeOccurrence, withoutRecord]

/-- Leaving a scope occurrence that holds no record `id` commutes with removing the record. -/
theorem leaveScope_withoutRecord (s : State) (id : OccurrenceId) (scope : ScopeOccurrenceId)
    (apart : ∀ occurrence ∈ s.occurrences, occurrence.id = id → occurrence.scope ∉ s.subtree scope) :
    (withoutRecord s id).leaveScope scope = withoutRecord (s.leaveScope scope) id := by
  have tree : (withoutRecord s id).subtree scope = s.subtree scope := subtree_congr (s := s) (t := withoutRecord s id) rfl scope
  have same : ∀ current ∈ (s.subtree scope).reverse,
      ((s.occurrences.filter (·.id != id)).filter fun occurrence =>
        occurrence.scope == current && !([] : List OccurrenceId).contains occurrence.id) =
      s.occurrences.filter fun occurrence => occurrence.scope == current && !([] : List OccurrenceId).contains occurrence.id := by
    intro current inside
    rw [List.filter_filter]
    refine List.filter_congr fun occurrence member => ?_
    by_cases named : occurrence.id = id
    · have outside := apart occurrence member named
      have : occurrence.scope ≠ current := fun equal => outside (equal ▸ List.mem_reverse.mp inside)
      simp [this]
    · simp [named]
  have removed := congrArg List.flatten (List.map_congr_left same)
  simp only [← List.flatMap_def] at removed
  have keyOf : (withoutRecord s id).keyOf = s.keyOf := funext fun occurrence => by
    rw [keyOf_eq, keyOf_eq]
    exact key_congr (instanceOf_congr (s := s) (t := withoutRecord s id) rfl rfl _)
  simp only [State.leaveScope, State.clearInside, State.recordCancelled, tree, keyOf]
  simp only [withoutRecord]
  rw [removed]
  simp only [List.filter_filter, Bool.and_comm, filter_erase_comm]

theorem withdrawInside_eq (s : State) (scope : ScopeOccurrenceId) :
    s.withdrawInside scope = { s with openItems := s.openItems.filter fun _ item => !(s.subtree scope).contains item.scope } := by
  simp only [State.withdrawInside]

theorem withdrawOccurrence_eq (s : State) (id : OccurrenceId) :
    s.withdrawOccurrence id = (((s.closeOwnItems id).disarm id).scopes.filter (·.occurrence == some id)).foldl
      (fun t entry => t.withdrawInside entry.id) ((s.closeOwnItems id).disarm id) := by
  simp only [State.withdrawOccurrence]

/-- `State.cancelOccurrence` of a standing occurrence withdraws its items, removes it and journals its end. -/
theorem cancelOccurrence_some {s : State} {id : OccurrenceId} {occurrence : Occurrence} (found : s.occurrence? id = some occurrence) :
    ∃ ended cancelled, s.cancelOccurrence id = { (s.withdrawOccurrence id).removeOccurrence id with
      draft := { ((s.withdrawOccurrence id).removeOccurrence id).draft with ended, cancelled } } := by
  simp only [State.cancelOccurrence, found, State.recordCancelled]
  exact ⟨_, _, rfl⟩

/-- Cancelling a standing occurrence journals, after what removing it journals, its own end if it was begun. -/
theorem cancelOccurrence_ended {s : State} {id : OccurrenceId} {occurrence : Occurrence} (found : s.occurrence? id = some occurrence) :
    (s.cancelOccurrence id).draft.ended = ((s.withdrawOccurrence id).removeOccurrence id).draft.ended ++
      ([occurrence].filter (·.begun)).map fun o => (key ((s.withdrawOccurrence id).removeOccurrence id) o, .cancelled) := by
  simp [State.cancelOccurrence, found, State.recordCancelled, keyOf_eq]

end Kernel.Laws.State
