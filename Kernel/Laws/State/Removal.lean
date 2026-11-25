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

variable {le : Issue → Issue → Bool}

variable {program : Program}

open Kernel

/-- `State.disarm` closes the items attached to `host` and drops the reservations they hold. -/
theorem disarm_eq (s : State) (host : OccurrenceId) : s.disarm host = { s with
    openItems := s.openItems.filter fun _ item => item.attachedTo != some host
    occurrenceMap := s.occurrenceMap.filter fun _ occurrence =>
      occurrence.begun || !((itemList s.openItems).filter (·.attachedTo == some host)).any (·.id.occurrence == occurrence.id)
    itemOrdinals := s.itemOrdinals.filter fun id _ => !s.occurrences.any fun occurrence =>
      occurrence.id == id && !occurrence.begun && ((itemList s.openItems).filter (·.attachedTo == some host)).any (·.id.occurrence == occurrence.id) } := by
  simp only [State.disarm, State.mk.injEq, and_true, true_and]
  congr 1
  funext id _
  simp only [List.contains_map, List.any_filter]
  congr 2
  funext occurrence
  cases occurrence.begun <;> simp only [Bool.not_true, Bool.not_false, Bool.false_and, Bool.true_and, Bool.and_false,
    Bool.and_true]
  rw [BEq.comm, Bool.and_comm]

/-! ### Cancellation facts -/

private theorem recordCancelled_cancels (state : State) (occurrences : List Occurrence) :
    CancelsWithEnds state (State.recordCancelled state occurrences) := by
  refine ⟨occurrences.filter (·.begun), (occurrences.filter (·.begun)).map state.keyOf, ?_, ?_, by simp, ?_⟩
  · simp [State.recordCancelled]
  · simp [State.recordCancelled, List.map_map, Function.comp_def]
  · intro occurrence member
    simpa using (List.mem_filter.mp member).2

private theorem clearInside_cancels (state : State) (scope : ScopeOccurrenceId) (keep : List OccurrenceId) :
    CancelsWithEnds state (state.clearInside le scope keep) := by
  obtain ⟨begun, keys, facts⟩ := recordCancelled_cancels state
    ((state.subtree le scope).reverse.flatMap fun current =>
      (state.occurrences.filter fun occurrence => occurrence.scope == current && !keep.contains occurrence.id).mergeSort
        fun a b => le a.position b.position)
  obtain ⟨cancelled, ended, length, flagged⟩ := facts
  exact ⟨begun, keys, by simpa [State.clearInside] using cancelled, by simpa [State.clearInside] using ended, length,
    flagged⟩

private theorem removeOccurrence_cancels (state : State) (id : OccurrenceId) :
    CancelsWithEnds state (state.removeOccurrence le id) := by
  have fold : ∀ (scopes : List ScopeOccurrence) (current : State), CancelsWithEnds state current →
      CancelsWithEnds state (scopes.foldl (fun state scope => state.leaveScope le scope.id) current) := by
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
    (∀ scope keep, CancelsWithEnds state (state.clearInside le scope keep)) ∧
      ∀ id, CancelsWithEnds state (state.cancelOccurrence le id) := by
  refine ⟨clearInside_cancels state, fun id => ?_⟩
  unfold State.cancelOccurrence
  split
  · exact .ofDraft rfl
  · rename_i occurrence _
    exact ((CancelsWithEnds.ofDraft (withdrawOccurrence_draft state id)).trans
      (removeOccurrence_cancels _ id)).trans (recordCancelled_cancels _ [occurrence])

/-- A queued cancellation of an occurrence that is gone changes nothing. -/
theorem cancelOccurrence_absent {state : State} {id : OccurrenceId} (absent : state.occurrence? id = none) :
    state.cancelOccurrence le id = state := by
  simp [State.cancelOccurrence, absent]

/-- Clearing keeps the scope occurrences outside the subtree below `scope`: the first clause of `Cleared`. -/
theorem clearInside_mem_scopes (s : State) (scope : ScopeOccurrenceId) (keep : List OccurrenceId) (entry : ScopeOccurrence) :
    entry ∈ (s.clearInside le scope keep).scopes ↔
      entry ∈ s.scopes ∧ (!((s.subtree le scope).filter (· != scope)).contains entry.id) = true := by
  rw [scopes_eq, scopes_eq]
  simp only [State.clearInside, State.recordCancelled]
  exact mem_scopeList_filter_val

/-- Clearing inside a scope occurrence keeps the counters of the scope occurrences that remain, so every history grows. -/
theorem clearInside_grows (s : State) (scope : ScopeOccurrenceId) (keep : List OccurrenceId) :
    ScopeGrows s (s.clearInside le scope keep) := by
  refine .shrink (fun _ member => ?_) (fun parent standing _ => ?_)
    (.of_eq (by simp [State.clearInside, State.recordCancelled]))
  · obtain ⟨entry, inside, rfl⟩ := List.mem_map.mp member
    exact List.mem_map.mpr ⟨entry, ((clearInside_mem_scopes s scope keep entry).mp inside).1, rfl⟩
  obtain ⟨entry, inside, rfl⟩ := List.mem_map.mp standing
  have kept := ((clearInside_mem_scopes s scope keep entry).mp inside).2
  simp only [State.clearInside, State.recordCancelled]
  exact getD_filter_keep fun _ => kept

/-- Clearing keeps the occurrence counters of the scope occurrences that stay. -/
theorem clearInside_counters (s : State) (scope : ScopeOccurrenceId) (keep : List OccurrenceId) :
    ∀ x ∈ scopeIds (s.clearInside le scope keep), ∀ element,
      occurrenceCount (s.clearInside le scope keep) x element = occurrenceCount s x element := by
  intro x standing element
  obtain ⟨entry, inside, rfl⟩ := List.mem_map.mp standing
  have kept := ((clearInside_mem_scopes s scope keep entry).mp inside).2
  simp only [occurrenceCount, State.clearInside, State.recordCancelled]
  exact getD_filter_keep fun _ => kept

/-- `State.clearInside` drops the tokens inside the scope occurrence from both token queues and keeps the signals. -/
theorem clearInside_queues (s : State) (scope : ScopeOccurrenceId) (keep : List OccurrenceId) :
    QueuesKept s (s.clearInside le scope keep) :=
  ⟨by simp [State.clearInside, State.recordCancelled], by simp [State.clearInside, State.recordCancelled],
    fun _ _ found => by simpa [State.clearInside, State.recordCancelled] using found,
    fun _ _ found => by
      simp only [State.clearInside, State.recordCancelled, Std.ExtTreeMap.getElem?_filter] at found
      exact Option.eq_some_of_pfilter_eq_some found⟩

/-- `State.clearInside` of a present scope occurrence of a well-formed state is `Cleared`. -/
theorem clearInside_cleared {s : State} (formed : WellFormed program s) {scope : ScopeOccurrenceId} (present : scope ∈ scopeIds s)
    (keep : List OccurrenceId) : Cleared s (s.clearInside le scope keep) scope keep := by
  have mem := subtree_iff (le := le) formed present
  have scopes : ∀ entry, entry ∈ (s.clearInside le scope keep).scopes ↔ entry ∈ s.scopes ∧ ¬ StrictlyWithin s entry.id scope := by
    intro entry
    rw [clearInside_mem_scopes]; simp [mem, StrictlyWithin]
  have fewer : ScopesSub (s.clearInside le scope keep).scopeMap s.scopeMap := by
    simp only [State.clearInside, State.recordCancelled]; exact ScopesSub.filter _ _
  have ordinals : ∀ occurrence ∈ (s.clearInside le scope keep).occurrences,
      (s.clearInside le scope keep).itemOrdinals.getD occurrence.id 0 = s.itemOrdinals.getD occurrence.id 0 := by
    intro occurrence member
    simp only [State.clearInside, State.recordCancelled, occurrences_eq, occurrenceList_filter_val] at member ⊢
    obtain ⟨old, stays⟩ := List.mem_filter.mp member
    refine getD_filter_keep fun _ => ?_
    simp only [Bool.not_eq_eq_eq_not, Bool.not_true, List.any_eq_false, beq_iff_eq]
    intro removed inRemoved same
    simp only [List.mem_flatMap, List.mem_reverse, List.mem_mergeSort, List.mem_filter, Bool.and_eq_true, beq_iff_eq,
      Bool.not_eq_eq_eq_not, Bool.not_true] at inRemoved
    obtain ⟨current, inside, held, rest⟩ := inRemoved
    obtain ⟨sameScope, kept⟩ := rest
    have := nodup_map_eq formed.distinct.occurrences held old same
    subst this
    simp [sameScope ▸ inside] at stays
    simp [stays] at kept
  refine {
      scopes := scopes, occurrences := fun occurrence => ?_, items := fun item => ?_, tokens := fun token => ?_,
      variables := fun x entries => by
        simp [State.clearInside, State.recordCancelled, -Std.ExtTreeMap.getElem?_filter, Std.ExtTreeMap.getElem?_filter',
          Option.filter_eq_some_iff, mem, StrictlyWithin], scopesSub := fewer,
      occurrencesSub := by simp only [State.clearInside, State.recordCancelled]; exact OccurrencesSub.filter _ _,
      occurrencesSublist := by
        simp only [State.clearInside, State.recordCancelled, occurrences_eq]; exact occurrenceList_filter_val_sublist _ _,
      scopeGrows := clearInside_grows s scope keep,
      openItemsSub := ItemsSub.filter _ _, ordinals := ordinals, tokensSublist := ?_,
      instances := fun x member => ?_, activations := rfl, counters := clearInside_counters s scope keep,
      signals := rfl, queues := clearInside_queues s scope keep, status := rfl, failure := rfl, journal := rfl,
      transitions := rfl, started := rfl,
      slots := ⟨fun _ member => ?_, fun _ member => ?_, fun _ member => ?_⟩,
      bodies := by
        simp [State.clearInside, State.recordCancelled, featureSlotsClear_eq, mem_subtree_inside, multiInstances_eq,
          multiInstanceList_filter_map, record_scope],
      issued := rfl, issuing := rfl, issueNext := rfl }
  rotate_left 3
  · simp only [allQueuedTokens, State.clearInside, State.recordCancelled, Std.ExtTreeMap.toList_filter]
    exact (List.filter_sublist.map _).append List.filter_sublist
  · obtain ⟨entry, inside, named⟩ := List.mem_map.mp member
    obtain ⟨old, outside⟩ := (scopes entry).mp inside
    refine named ▸ instanceOf_kept formed (by rw [scopeIds, scopes_eq]; exact scopeList_nodup (fewer.keyed formed.distinct.scopesKeyed))
      (fun entry member orphan => (formed.rooted.2.1 entry ((scopes entry).mp member).1).mp orphan) rfl
      (List.mem_map.mpr ⟨entry, old, rfl⟩) fun above upper within => (scopes above).mpr ⟨upper, fun ⟨inner, other⟩ => ?_⟩
    have entryInside : Within s entry.id scope := within.trans inner
    refine outside ⟨entryInside, fun same => other ?_⟩
    rw [same] at within
    exact Within.antisymm formed (List.mem_map.mpr ⟨above, upper, rfl⟩) inner within
  iterate 3
    · simp only [State.clearInside, State.recordCancelled, featureSlotsClear_eq, multiInstances_eq,
        multiInstanceList_filter_map, record_scope, runs_eq, runList_filter] at member
      exact (List.mem_filter.mp member).1
  all_goals simp [State.clearInside, State.recordCancelled, mem, mem_itemList_filter formed.distinct.items,
    allQueuedTokens, Std.ExtTreeMap.toList_filter, or_and_right, occurrences_eq, occurrenceList_filter_val]

/-- Clearing a present scope occurrence of a well-formed state journals each begun occurrence it removes once, under
its key: those within the scope occurrence that it does not keep. -/
theorem clearInside_ends {s : State} (formed : WellFormed program s) {scope : ScopeOccurrenceId}
    (present : scope ∈ scopeIds s) (keep : List OccurrenceId) :
    ∃ gone : List Occurrence,
      (s.clearInside le scope keep).draft.ended = s.draft.ended ++ gone.map (fun o => (key s o, Terminal.cancelled)) ∧
      (gone.map (·.id)).Nodup ∧
      ∀ o, o ∈ gone ↔ o ∈ s.occurrences ∧ o.begun = true ∧ Within s o.scope scope ∧ o.id ∉ keep := by
  have tree : (s.subtree le scope).Nodup := subtree_nodup s le formed.distinct.scopes scope
  have mem := subtree_iff (le := le) formed present
  let removed := (s.subtree le scope).reverse.flatMap fun current =>
    (s.occurrences.filter fun occurrence => occurrence.scope == current && !keep.contains occurrence.id).mergeSort
      fun a b => le a.position b.position
  refine ⟨removed.filter (·.begun), ?_, ?_, fun o => ?_⟩
  · simp [State.clearInside, State.recordCancelled, removed, keyOf_eq]
  · refine (List.Sublist.map _ List.filter_sublist).nodup ?_
    rw [List.map_flatMap]
    refine List.pairwise_flatMap.mpr ⟨fun current _ => ((List.mergeSort_perm _ _).map _).nodup_iff.mpr
      (formed.distinct.occurrences.sublist (List.filter_sublist.map _)), ?_⟩
    refine (List.pairwise_reverse.mpr (tree.imp Ne.symm)).imp_of_mem fun inFirst inSecond apart => ?_
    intro id one _ two equal
    subst equal
    obtain ⟨first, firstIn, rfl⟩ := List.mem_map.mp one
    obtain ⟨second, secondIn, same⟩ := List.mem_map.mp two
    obtain ⟨firstMember, firstAt⟩ := List.mem_filter.mp (List.mem_mergeSort.mp firstIn)
    obtain ⟨secondMember, secondAt⟩ := List.mem_filter.mp (List.mem_mergeSort.mp secondIn)
    obtain rfl := nodup_map_eq formed.distinct.occurrences secondMember firstMember same
    simp only [Bool.and_eq_true, beq_iff_eq] at firstAt secondAt
    exact apart (firstAt.1.symm.trans secondAt.1)
  · simp only [List.mem_filter, removed, List.mem_flatMap, List.mem_reverse, List.mem_mergeSort, Bool.and_eq_true, beq_iff_eq,
      Bool.not_eq_true', List.contains_eq_mem, decide_eq_false_iff_not, mem]
    constructor
    · rintro ⟨⟨_, inside, member, rfl, outside⟩, begun⟩
      exact ⟨member, begun, inside, outside⟩
    · rintro ⟨member, begun, inside, outside⟩
      exact ⟨⟨_, inside, member, rfl, outside⟩, begun⟩

/-- `State.clearInside` drops what lies inside the scope occurrence (`State.subtree`), its own record kept, and journals
the cancellations in `draft`: the one equation of the clearing the laws above this module read. -/
theorem clearInside_eq (s : State) (scope : ScopeOccurrenceId) (keep : List OccurrenceId) : ∃ draft, s.clearInside le scope keep =
    { s with
      batchTokens := s.batchTokens.filter (!(s.subtree le scope).contains ·.busyScope)
      queuedTokens := s.queuedTokens.filter fun _ token => !(s.subtree le scope).contains token.busyScope
      openItems := s.openItems.filter fun _ item => !(s.subtree le scope).contains item.scope || keep.contains item.id.occurrence
      itemOrdinals := s.itemOrdinals.filter fun id _ => !((s.subtree le scope).reverse.flatMap fun current =>
        (s.occurrences.filter fun occurrence => occurrence.scope == current && !keep.contains occurrence.id).mergeSort
          fun a b => le a.position b.position).any (·.id == id)
      occurrenceMap := s.occurrenceMap.filter fun _ occurrence =>
        !(s.subtree le scope).contains occurrence.scope || keep.contains occurrence.id
      scopeMap := s.scopeMap.filter fun _ entry => !((s.subtree le scope).filter (· != scope)).contains entry.id
      scopeOrdinals := s.scopeOrdinals.filter fun slot _ => !((s.subtree le scope).filter (· != scope)).contains slot.parent
      occurrenceOrdinals :=
        s.occurrenceOrdinals.filter fun slot _ => !((s.subtree le scope).filter (· != scope)).contains slot.parent
      variables := s.variables.filter fun x _ => !((s.subtree le scope).filter (· != scope)).contains x
      slots := {
        parked := s.slots.parked.filter (!(s.subtree le scope).contains ·.scope)
        heldMap := s.slots.heldMap.filter fun _ held => !(s.subtree le scope).contains held
        multiInstanceMap := s.slots.multiInstanceMap.filter fun _ record => !(s.subtree le scope).contains record.scope
        compensation := {
          retained := s.slots.compensation.retained.filter (!((s.subtree le scope).filter (· != scope)).contains ·.scope)
          runMap := s.slots.compensation.runMap.filter fun key _ => !(s.subtree le scope).contains key.scope }
        instances := s.slots.instances.filter (!((s.subtree le scope).filter (· != scope)).contains ·.root) }
      draft } :=
  ⟨_, by simp only [State.clearInside, State.recordCancelled, featureSlotsClear_eq]; rfl⟩

/-- Leaving a scope occurrence keeps the slots its clearing leaves but the compensation records it retains and its
instance entry. -/
theorem leaveScope_slots_eq (s : State) (scope : ScopeOccurrenceId) :
    (s.leaveScope le scope).slots = { (s.clearInside le scope).slots with
      compensation := { (s.clearInside le scope).slots.compensation with
        retained := (s.clearInside le scope).slots.compensation.retained.filter (·.scope != scope) }
      instances := (s.clearInside le scope).slots.instances.filter (·.root != scope) } := by
  simp only [State.leaveScope]

/-- `State.leaveScope` clears the scope occurrence, then removes it and its variable set, and keeps the instance. -/
theorem leaveScope_eq (s : State) (scope : ScopeOccurrenceId) :
    s.leaveScope le scope = { s.clearInside le scope with
      scopeMap := (s.clearInside le scope).scopeMap.filter fun _ entry => entry.id != scope
      scopeOrdinals := (s.clearInside le scope).scopeOrdinals.filter fun slot _ => slot.parent != scope
      occurrenceOrdinals := (s.clearInside le scope).occurrenceOrdinals.filter fun slot _ => slot.parent != scope
      variables := (s.clearInside le scope).variables.erase scope
      slots := (s.leaveScope le scope).slots } ∧
    (s.leaveScope le scope).instanceId = s.instanceId := by
  simp [State.leaveScope, State.clearInside, State.recordCancelled]

/-- Leaving filters the cleared list view: a filter that reads only the value keeps the key order. -/
theorem leaveScope_scopes (s : State) (scope : ScopeOccurrenceId) :
    (s.leaveScope le scope).scopes = (s.clearInside le scope).scopes.filter (·.id != scope) := by
  rw [(leaveScope_eq s scope).1]
  simp only [scopes_eq, scopeList_filter_val]

/-- Clearing a scope occurrence keeps the issue table: a removal retracts no issue (DC12). -/
theorem clearInside_issued (s : State) (scope : ScopeOccurrenceId) (keep : List OccurrenceId) :
    (s.clearInside le scope keep).issued = s.issued := by
  simp [State.clearInside, State.recordCancelled]

/-- Leaving a scope occurrence keeps the issue table. -/
theorem leaveScope_issued (s : State) (scope : ScopeOccurrenceId) : (s.leaveScope le scope).issued = s.issued := by
  rw [(leaveScope_eq s scope).1]
  exact clearInside_issued (le := le) s scope []

/-- `State.removeOccurrence` leaves the scope occurrences the occurrence owns after removing its record. -/
theorem removeOccurrence_eq (s : State) (id : OccurrenceId) :
    s.removeOccurrence le id =
      ((s.scopes.filter (·.occurrence == some id)).mergeSort fun a b => le a.position b.position).foldl
        (fun t entry => t.leaveScope le entry.id) (withoutRecord s id) := by
  simp [State.removeOccurrence, withoutRecord, State.scopes]

/-- Leaving a scope occurrence that holds no record `id` commutes with removing the record. -/
theorem leaveScope_withoutRecord (s : State) (id : OccurrenceId) (scope : ScopeOccurrenceId)
    (apart : ∀ occurrence ∈ s.occurrences, occurrence.id = id → occurrence.scope ∉ s.subtree le scope) :
    (withoutRecord s id).leaveScope le scope = withoutRecord (s.leaveScope le scope) id := by
  have tree : (withoutRecord s id).subtree le scope = s.subtree le scope := subtree_congr (s := s) (t := withoutRecord s id) rfl le scope
  have same : ∀ current ∈ (s.subtree le scope).reverse,
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
  have sorted : ∀ current ∈ (s.subtree le scope).reverse,
      (((s.occurrences.filter (·.id != id)).filter fun occurrence =>
        occurrence.scope == current && !([] : List OccurrenceId).contains occurrence.id).mergeSort fun a b => le a.position b.position) =
      (s.occurrences.filter fun occurrence => occurrence.scope == current && !([] : List OccurrenceId).contains occurrence.id).mergeSort
        fun a b => le a.position b.position :=
    fun current inside => by rw [same current inside]
  have removed := congrArg List.flatten (List.map_congr_left sorted)
  simp only [← List.flatMap_def] at removed
  have keyOf : (withoutRecord s id).keyOf = s.keyOf := funext fun occurrence => by
    rw [keyOf_eq, keyOf_eq]
    exact key_congr (instanceOf_congr (s := s) (t := withoutRecord s id) rfl rfl _)
  simp only [State.leaveScope, State.clearInside, State.recordCancelled, tree, keyOf]
  simp only [withoutRecord, occurrences_eq, occurrenceList_filter_val]
  simp only [occurrences_eq] at removed
  rw [removed]
  simp only [Bool.and_comm, filter_erase_comm, Keyed.filter_filter_val]

theorem withdrawInside_eq (s : State) (scope : ScopeOccurrenceId) :
    s.withdrawInside scope = { s with openItems := s.openItems.filter fun _ item => !(s.inside scope).contains item.scope } := by
  simp only [State.withdrawInside]

theorem withdrawOccurrence_eq (s : State) (id : OccurrenceId) :
    s.withdrawOccurrence id = (((s.closeOwnItems id).disarm id).scopes.filter (·.occurrence == some id)).foldl
      (fun t entry => t.withdrawInside entry.id) ((s.closeOwnItems id).disarm id) := by
  simp only [State.withdrawOccurrence]

/-- `State.cancelOccurrence` of a standing occurrence withdraws its items, removes it and journals its end. -/
theorem cancelOccurrence_some {s : State} {id : OccurrenceId} {occurrence : Occurrence} (found : s.occurrence? id = some occurrence) :
    ∃ ended cancelled, s.cancelOccurrence le id = { (s.withdrawOccurrence id).removeOccurrence le id with
      draft := { ((s.withdrawOccurrence id).removeOccurrence le id).draft with ended, cancelled } } := by
  simp only [State.cancelOccurrence, found, State.recordCancelled]
  exact ⟨_, _, rfl⟩

/-- Cancelling a standing occurrence journals, after what removing it journals, its own end if it was begun. -/
theorem cancelOccurrence_ended {s : State} {id : OccurrenceId} {occurrence : Occurrence} (found : s.occurrence? id = some occurrence) :
    (s.cancelOccurrence le id).draft.ended = ((s.withdrawOccurrence id).removeOccurrence le id).draft.ended ++
      ([occurrence].filter (·.begun)).map fun o => (key ((s.withdrawOccurrence id).removeOccurrence le id) o, .cancelled) := by
  simp [State.cancelOccurrence, found, State.recordCancelled, keyOf_eq]

/-! ## Counters inside a closure (DC12)

A closure changes a counter only by pruning it with its owner (`clearInside`, `leaveScope`, `removeOccurrence`), so the
counters it settles with stay at most the ones it started from (`CountersFrom`). One lemma per counter writer, each
stated per counter map, so a further counter is one more conjunct. -/

/-- A filter keeps or drops each entry, so it raises no count. -/
theorem getD_filter_le {α : Type} [Ord α] [Std.TransOrd α] [Std.LawfulEqOrd α] (m : Std.ExtTreeMap α Nat compare)
    (f : α → Nat → Bool) (k : α) : (m.filter f).getD k 0 ≤ m.getD k 0 := by
  rw [Std.ExtTreeMap.getD_filter', Std.ExtTreeMap.getD_eq_getD_getElem?]
  cases m[k]? <;> simp only [Option.filter, Option.getD_none, Option.getD_some, Nat.le_refl]
  split <;> simp

/-- An erase drops one entry, so it raises no count. -/
theorem getD_erase_le {α : Type} [Ord α] [Std.TransOrd α] [Std.LawfulEqOrd α] (m : Std.ExtTreeMap α Nat compare)
    (id k : α) : (m.erase id).getD k 0 ≤ m.getD k 0 := by
  rw [Std.ExtTreeMap.getD_erase]
  split <;> simp

/-- A change whose counters are each at most `s`'s keeps `CountersFrom start`. -/
theorem CountersFrom.lower {start s t : State} (counted : CountersFrom start s)
    (scopes : ∀ slot, t.scopeOrdinals.getD slot 0 ≤ s.scopeOrdinals.getD slot 0)
    (occurrences : ∀ slot, t.occurrenceOrdinals.getD slot 0 ≤ s.occurrenceOrdinals.getD slot 0)
    (items : ∀ occurrence, t.itemOrdinals.getD occurrence 0 ≤ s.itemOrdinals.getD occurrence 0)
    (positions : t.nextOrder ≤ s.nextOrder := by exact Nat.le_refl _)
    (activations : ∀ slot, t.activationCount slot ≤ s.activationCount slot := by exact fun _ => Nat.le_refl _) :
    CountersFrom start t :=
  ⟨fun slot => Nat.le_trans (scopes slot) (counted.scopes slot),
    fun slot => Nat.le_trans (occurrences slot) (counted.occurrences slot),
    fun occurrence => Nat.le_trans (items occurrence) (counted.items occurrence),
    Nat.le_trans positions counted.positions, fun slot => Nat.le_trans (activations slot) (counted.activations slot)⟩

/-- A change that leaves the three counter maps keeps `CountersFrom start`. -/
theorem CountersFrom.same {start s t : State} (counted : CountersFrom start s) (scopes : t.scopeOrdinals = s.scopeOrdinals)
    (occurrences : t.occurrenceOrdinals = s.occurrenceOrdinals) (items : t.itemOrdinals = s.itemOrdinals)
    (positions : t.nextOrder = s.nextOrder := by exact rfl) (activations : t.activations = s.activations := by exact rfl) :
    CountersFrom start t :=
  counted.lower (fun _ => by rw [scopes]; exact Nat.le_refl _) (fun _ => by rw [occurrences]; exact Nat.le_refl _)
    (fun _ => by rw [items]; exact Nat.le_refl _) (by rw [positions]; exact Nat.le_refl _)
    (fun _ => by simp only [State.activationCount, activations]; exact Nat.le_refl _)

/-- `State.clearInside` prunes counters only. -/
theorem clearInside_countersFrom {start s : State} (counted : CountersFrom start s) (scope : ScopeOccurrenceId)
    (keep : List OccurrenceId) : CountersFrom start (s.clearInside le scope keep) :=
  counted.lower (fun _ => by simp only [State.clearInside, State.recordCancelled]; exact getD_filter_le _ _ _)
    (fun _ => by simp only [State.clearInside, State.recordCancelled]; exact getD_filter_le _ _ _)
    fun _ => by simp only [State.clearInside, State.recordCancelled]; exact getD_filter_le _ _ _

/-- `State.leaveScope` prunes counters only. -/
theorem leaveScope_countersFrom {start s : State} (counted : CountersFrom start s) (scope : ScopeOccurrenceId) :
    CountersFrom start (s.leaveScope le scope) :=
  (clearInside_countersFrom counted scope []).lower
    (fun _ => by simp only [State.leaveScope]; exact getD_filter_le _ _ _)
    (fun _ => by simp only [State.leaveScope]; exact getD_filter_le _ _ _)
    fun _ => by simp only [State.leaveScope]; exact Nat.le_refl _

/-- Leaving scope occurrences one after another prunes counters only. -/
theorem leaveScopes_countersFrom {start : State} :
    ∀ (entries : List ScopeOccurrence) (s : State), CountersFrom start s →
      CountersFrom start (entries.foldl (fun state entry => state.leaveScope le entry.id) s)
  | [], _, counted => counted
  | entry :: rest, _, counted => leaveScopes_countersFrom rest _ (leaveScope_countersFrom counted entry.id)

/-- `State.removeOccurrence` erases its item counter and leaves the scope occurrences it owned: it prunes counters only. -/
theorem removeOccurrence_countersFrom {start s : State} (counted : CountersFrom start s) (id : OccurrenceId) :
    CountersFrom start (s.removeOccurrence le id) := by
  unfold State.removeOccurrence
  exact leaveScopes_countersFrom _ _
    (counted.lower (fun _ => Nat.le_refl _) (fun _ => Nat.le_refl _) fun _ => getD_erase_le _ _ _)

/-- `State.disarm` drops the item counters of the reservations it removes: it prunes counters only. -/
theorem disarm_countersFrom {start s : State} (counted : CountersFrom start s) (host : OccurrenceId) :
    CountersFrom start (s.disarm host) := by
  rw [disarm_eq]
  exact counted.lower (fun _ => Nat.le_refl _) (fun _ => Nat.le_refl _) fun _ => getD_filter_le _ _ _

/-- Withdrawing an occurrence's items moves no counter but the reservations' its disarming drops. -/
theorem withdrawOccurrence_countersFrom {start s : State} (counted : CountersFrom start s) (id : OccurrenceId) :
    CountersFrom start (s.withdrawOccurrence id) := by
  rw [withdrawOccurrence_eq]
  have disarmed := disarm_countersFrom (s := s.closeOwnItems id)
    (counted.same (by rw [closeOwnItems_eq]) (by rw [closeOwnItems_eq]) (by rw [closeOwnItems_eq]) (by rw [closeOwnItems_eq]) (by rw [closeOwnItems_eq])) id
  generalize (s.closeOwnItems id).disarm id = t at disarmed ⊢
  generalize t.scopes.filter (·.occurrence == some id) = entries
  induction entries generalizing t with
  | nil => exact disarmed
  | cons entry rest ih => exact ih _ (disarmed.same (by simp only [withdrawInside_eq])
      (by simp only [withdrawInside_eq]) (by simp only [withdrawInside_eq]))

/-- `State.cancelOccurrence` withdraws and removes the occurrence: it prunes counters only. -/
theorem cancelOccurrence_countersFrom {start s : State} (counted : CountersFrom start s) (id : OccurrenceId) :
    CountersFrom start (s.cancelOccurrence le id) := by
  cases found : s.occurrence? id with
  | none => rw [cancelOccurrence_absent found]; exact counted
  | some occurrence =>
    obtain ⟨_, _, cancels⟩ := cancelOccurrence_some (le := le) found
    rw [cancels]
    exact (removeOccurrence_countersFrom (withdrawOccurrence_countersFrom counted id) id).same rfl rfl rfl

/-! ## The issuer through the removals (DC12)

A removal keeps the transitions and the issuer, which a micro-step's body and the hooks its conclusion runs keep beside
`WellFormed` (`Laws.Step.Framed`). -/

/-- `t` keeps the transitions and the issuer of `s`. -/
structure IssuerKept (s t : State) : Prop where
  transitions : t.transitions = s.transitions
  issuing : t.issuing = s.issuing

theorem IssuerKept.refl (s : State) : IssuerKept s s := ⟨rfl, rfl⟩

theorem IssuerKept.trans {s t u : State} (first : IssuerKept s t) (second : IssuerKept t u) : IssuerKept s u :=
  ⟨second.transitions.trans first.transitions, second.issuing.trans first.issuing⟩

theorem clearInside_issuerKept (s : State) (scope : ScopeOccurrenceId) (keep : List OccurrenceId) :
    IssuerKept s (s.clearInside le scope keep) :=
  ⟨by simp [State.clearInside, State.recordCancelled], by simp [State.clearInside, State.recordCancelled]⟩

theorem leaveScope_issuerKept (s : State) (scope : ScopeOccurrenceId) : IssuerKept s (s.leaveScope le scope) := by
  have cleared := clearInside_issuerKept (le := le) s scope []
  rw [(leaveScope_eq s scope).1]
  exact ⟨cleared.transitions, cleared.issuing⟩

/-- Leaving a scope occurrence keeps a fresh issuer fresh: the issue table, the issuer and the transitions stay. -/
theorem leaveScope_issuerFresh {s : State} (fresh : IssuerFresh s) (scope : ScopeOccurrenceId) :
    IssuerFresh (s.leaveScope le scope) := by
  have kept := leaveScope_issuerKept (le := le) s scope
  refine fresh.same ?_ kept.issuing ?_ kept.transitions <;>
    rw [(leaveScope_eq s scope).1] <;> simp [State.clearInside, State.recordCancelled]

theorem leaveScopes_issuerKept :
    ∀ (entries : List ScopeOccurrence) (s : State),
      IssuerKept s (entries.foldl (fun state entry => state.leaveScope le entry.id) s)
  | [], s => .refl s
  | entry :: rest, s => (leaveScope_issuerKept s entry.id).trans (leaveScopes_issuerKept rest _)

theorem removeOccurrence_issuerKept (s : State) (id : OccurrenceId) : IssuerKept s (s.removeOccurrence le id) := by
  unfold State.removeOccurrence
  refine IssuerKept.trans ?_ (leaveScopes_issuerKept _ _)
  exact ⟨rfl, rfl⟩

/-- Disarming keeps a sublist of the occurrences: it drops only reservations hanging on the host. -/
theorem disarm_occurrences (s : State) (host : OccurrenceId) : (s.disarm host).occurrences.Sublist s.occurrences := by
  rw [disarm_eq, occurrences_eq]
  exact occurrenceList_filter_val_sublist _ _

theorem disarm_issuerKept (s : State) (host : OccurrenceId) : IssuerKept s (s.disarm host) := by
  rw [disarm_eq]
  exact ⟨rfl, rfl⟩

theorem withdrawOccurrence_issuerKept (s : State) (id : OccurrenceId) : IssuerKept s (s.withdrawOccurrence id) := by
  rw [withdrawOccurrence_eq]
  have disarmed : IssuerKept s ((s.closeOwnItems id).disarm id) := by
    have closed : IssuerKept s (s.closeOwnItems id) := by rw [closeOwnItems_eq]; exact ⟨rfl, rfl⟩
    exact closed.trans (disarm_issuerKept _ id)
  generalize (s.closeOwnItems id).disarm id = t at disarmed ⊢
  generalize t.scopes.filter (·.occurrence == some id) = entries
  induction entries generalizing t with
  | nil => exact disarmed
  | cons entry rest ih =>
    have step : IssuerKept t (t.withdrawInside entry.id) := by rw [withdrawInside_eq]; exact ⟨rfl, rfl⟩
    exact ih _ (disarmed.trans step)

theorem cancelOccurrence_issuerKept (s : State) (id : OccurrenceId) : IssuerKept s (s.cancelOccurrence le id) := by
  cases found : s.occurrence? id with
  | none => rw [cancelOccurrence_absent found]; exact .refl s
  | some occurrence =>
    obtain ⟨_, _, cancels⟩ := cancelOccurrence_some (le := le) found
    have removed := (withdrawOccurrence_issuerKept s id).trans (removeOccurrence_issuerKept (le := le) _ id)
    rw [cancels]
    exact ⟨removed.transitions, removed.issuing⟩

end Kernel.Laws.State
