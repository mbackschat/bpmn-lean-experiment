module

public import Kernel.Laws.State.Keeps

/-! # Laws of the kernel state: what removing an occurrence keeps

That `State.removeOccurrence` and `State.cancelOccurrence` keep `WellFormed` under the conditions their callers
establish, composed from what `Kernel.Laws.State` shows each step does to the fields and the frames of
`Kernel.Laws.State.Frames`; it reads no body. `State.removeOccurrence` removes the record first and then leaves the
scope occurrences the occurrence owns, a state in between that owns scope occurrences by a missing occurrence; the proof
leaves them first and removes the record last, which ends in the same state since the record lies outside each of them.
Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Laws.State

open Kernel

/-! ## Leaving a scope occurrence -/

/-- Leaving a present scope occurrence of a well-formed state. -/
theorem leaveScope_left {s : State} (formed : WellFormed s) {scope : ScopeOccurrenceId} (present : scope ∈ scopeIds s) :
    Left s (s.leaveScope scope) scope := by
  have cleared := clearInside_cleared formed present []
  have shape := (leaveScope_eq s scope).1
  have scopes : ∀ entry, entry ∈ (s.leaveScope scope).scopes ↔ entry ∈ s.scopes ∧ ¬ Within s entry.id scope := by
    intro entry
    rw [shape]
    simp only [List.mem_filter, cleared.scopes entry, bne_iff_ne, ne_eq, StrictlyWithin]
    by_cases same : entry.id = scope
    · simp [same, Within.refl]
    · simp [same]
  have fewer : (s.leaveScope scope).scopes.Sublist s.scopes := by
    rw [shape]
    exact List.filter_sublist.trans cleared.scopesSublist
  refine ⟨scopes, fun occurrence => ?_, fun item => ?_, fun token => ?_, fun variables => ?_, fewer,
    by rw [shape]; exact cleared.occurrencesSublist, by rw [shape]; exact cleared.openItemsSublist,
    by rw [shape]; exact cleared.tokensSublist, by rw [shape]; exact List.filter_sublist.trans cleared.variablesSublist,
    fun x member => ?_, by rw [shape]; exact cleared.activations, by rw [shape]; exact cleared.nextIssue,
    by rw [shape]; exact cleared.signals, by rw [shape]; exact cleared.status, by rw [shape]; exact cleared.failure,
    by rw [shape]; exact cleared.journal, by rw [shape]; exact cleared.started⟩
  · rw [shape]
    simpa using cleared.occurrences occurrence
  · rw [shape]
    simpa using cleared.openItems item
  · rw [shape]
    exact cleared.tokens token
  · rw [shape]
    simp only [List.mem_filter, cleared.variables variables, bne_iff_ne, ne_eq, StrictlyWithin]
    by_cases same : variables.scope = scope
    · simp [same, Within.refl]
    · simp [same]
  · obtain ⟨entry, inside, named⟩ := List.mem_map.mp member
    obtain ⟨old, outside⟩ := (scopes entry).mp inside
    refine named ▸ instanceOf_kept formed (formed.distinct.scopes.sublist (fewer.map _))
      (fun entry member orphan => (formed.rooted.2.1 entry (fewer.subset member)).mp orphan) (leaveScope_eq s scope).2
      (List.mem_map.mpr ⟨entry, old, rfl⟩) fun above upper within => (scopes above).mpr ⟨upper, fun inner => ?_⟩
    exact outside (within.trans inner)

/-- Two scope occurrences below one parent lie outside each other. -/
private theorem sibling_outside {s : State} (formed : WellFormed s) {first second : ScopeOccurrence}
    {parent : ScopeOccurrenceId} (one : first ∈ s.scopes) (two : second ∈ s.scopes) (firstLink : first.parent = some parent)
    (secondLink : second.parent = some parent) (other : second.id ≠ first.id) : ¬ Within s second.id first.id := by
  intro within
  generalize named : second.id = x at within
  cases within with
  | refl => exact other named
  | parent child above _ member link inner =>
    obtain rfl := scope_unique formed.distinct two member named
    rw [secondLink] at link
    cases link
    exact parent_not_within formed one firstLink inner

/-! ## Removing an occurrence record -/

/-- Removing a record on which no item waits or hangs and which owns no scope occurrence keeps a state well-formed. -/
theorem withoutRecord_wellFormed {s : State} (formed : WellFormed s) {id : Nat}
    (free : ∀ item ∈ s.openItems, item.occurrence ≠ id ∧ item.attachedTo ≠ some id)
    (unowned : ∀ entry ∈ s.scopes, entry.occurrence ≠ some id) : WellFormed (withoutRecord s id) := by
  have kept : ∀ occurrence ∈ s.occurrences, occurrence.id ≠ id → occurrence ∈ (withoutRecord s id).occurrences :=
    fun occurrence member other => List.mem_filter.mpr ⟨member, by simpa using other⟩
  refine Prunes.wellFormed formed ⟨rfl, instanceOf_congr rfl rfl, List.filter_sublist, .refl _, rfl, rfl, rfl, rfl, rfl,
    rfl, rfl, rfl, rfl, fun item member occurrence inside link => ?_, fun entry member occurrence inside owned => ?_⟩
  · refine kept occurrence inside fun same => ?_
    rcases link with waits | hangs
    · exact (free item member).1 (waits ▸ same)
    · exact (free item member).2 (same ▸ hangs)
  · exact kept occurrence inside fun same => unowned entry member (same ▸ owned)

/-- Leaving the scope occurrences an occurrence `record` owns, siblings below its scope occurrence, keeps a state
well-formed, keeps the record and its scope occurrence, leaves no scope occurrence it owns, and commutes with removing
its record. -/
private theorem leaveOwned {id : Nat} {record : Occurrence} :
    ∀ (owned : List ScopeOccurrence) (t : State), WellFormed t → record ∈ t.occurrences →
      (∀ occurrence ∈ t.occurrences, occurrence.id = id → occurrence = record) → owned.Nodup →
      (∀ entry ∈ owned, entry ∈ t.scopes ∧ entry.parent = some record.scope) →
      (∀ entry ∈ t.scopes, entry.occurrence = some id → entry ∈ owned) →
      owned.foldl (fun state entry => state.leaveScope entry.id) (withoutRecord t id) =
        withoutRecord (owned.foldl (fun state entry => state.leaveScope entry.id) t) id ∧
      WellFormed (owned.foldl (fun state entry => state.leaveScope entry.id) t) ∧
      record.scope ∈ scopeIds (owned.foldl (fun state entry => state.leaveScope entry.id) t) ∧
      (owned.foldl (fun state entry => state.leaveScope entry.id) t).openItems.Sublist t.openItems ∧
      ∀ entry ∈ (owned.foldl (fun state entry => state.leaveScope entry.id) t).scopes, entry.occurrence ≠ some id := by
  intro owned
  induction owned with
  | nil =>
    intro t formed member _ _ _ unowned
    exact ⟨rfl, formed, formed.owned.occurrenceScopes record member, .refl _,
      fun entry inside owns => by simpa using unowned entry inside owns⟩
  | cons first rest ih =>
    intro t formed member only nodup placed unowned
    obtain ⟨firstMember, firstLink⟩ := placed first (List.mem_cons_self ..)
    have present : first.id ∈ scopeIds t := List.mem_map.mpr ⟨first, firstMember, rfl⟩
    have notRoot : first.id ≠ State.root := fun same => by
      simp [(formed.rooted.2.1 first firstMember).mpr same] at firstLink
    have left := leaveScope_left formed present
    have outside : ¬ Within t record.scope first.id := parent_not_within formed firstMember firstLink
    have apart : ∀ occurrence ∈ t.occurrences, occurrence.id = id → occurrence.scope ∉ t.subtree first.id :=
      fun occurrence inside same within => by
        rw [only occurrence inside same] at within
        exact outside ((subtree_iff formed present _).mp within)
    have restPlaced : ∀ entry ∈ rest, entry ∈ (t.leaveScope first.id).scopes ∧ entry.parent = some record.scope :=
      fun entry inside => by
        obtain ⟨entryMember, entryLink⟩ := placed entry (List.mem_cons_of_mem _ inside)
        have other : entry.id ≠ first.id := fun same =>
          (List.nodup_cons.mp nodup).1 (scope_unique formed.distinct entryMember firstMember same ▸ inside)
        exact ⟨(left.scopes entry).mpr ⟨entryMember, sibling_outside formed firstMember entryMember firstLink entryLink
          other⟩, entryLink⟩
    have restUnowned : ∀ entry ∈ (t.leaveScope first.id).scopes, entry.occurrence = some id → entry ∈ rest :=
      fun entry inside owns => by
        obtain ⟨old, away⟩ := (left.scopes entry).mp inside
        rcases List.mem_cons.mp (unowned entry old owns) with rfl | later
        · exact absurd (.refl _) away
        · exact later
    obtain ⟨commutes, kept, stands, rest⟩ := ih (t.leaveScope first.id) (left.wellFormed formed present notRoot)
      ((left.occurrences record).mpr ⟨member, outside⟩)
      (fun occurrence inside same => only occurrence (left.occurrencesSublist.subset inside) same)
      (List.nodup_cons.mp nodup).2 restPlaced restUnowned
    obtain ⟨fewer, none⟩ := rest
    simp only [List.foldl_cons]
    rw [leaveScope_withoutRecord t id first.id apart]
    exact ⟨commutes, kept, stands, fewer.trans left.openItemsSublist, none⟩

/-- Removing an occurrence on which no item waits or hangs keeps a state well-formed and leaves its scope occurrence
standing. -/
theorem removeOccurrence_wellFormed {s : State} (formed : WellFormed s) {record : Occurrence}
    (member : record ∈ s.occurrences)
    (free : ∀ item ∈ s.openItems, item.occurrence ≠ record.id ∧ item.attachedTo ≠ some record.id) :
    WellFormed (s.removeOccurrence record.id) ∧ record.scope ∈ scopeIds (s.removeOccurrence record.id) := by
  have owned : ∀ entry ∈ s.scopes.filter (·.occurrence == some record.id), entry ∈ s.scopes ∧
      entry.parent = some record.scope := fun entry inside => by
    obtain ⟨entryMember, owns⟩ := List.mem_filter.mp inside
    exact ⟨entryMember, formed.ownedBelow entry entryMember record member (by simpa using owns)⟩
  have scopesNodup : s.scopes.Nodup := by
    have nodup : (s.scopes.map (·.id)).Nodup := formed.distinct.scopes
    exact List.Pairwise.of_map (R := (· ≠ ·)) (S := (· ≠ ·)) (·.id) (fun _ _ apart same => apart (congrArg _ same)) nodup
  obtain ⟨commutes, kept, stands, rest⟩ := leaveOwned (record := record) (id := record.id)
    (s.scopes.filter (·.occurrence == some record.id)) s formed member
    (fun occurrence inside same => nodup_map_eq formed.distinct.occurrences inside member same)
    (scopesNodup.sublist List.filter_sublist) owned (fun entry inside owns => List.mem_filter.mpr ⟨inside, by simpa using owns⟩)
  obtain ⟨fewer, none⟩ := rest
  rw [removeOccurrence_eq, commutes]
  exact ⟨withoutRecord_wellFormed kept (fun item inside => free item (fewer.subset inside)) none, stands⟩

/-! ## Cancelling an occurrence -/

/-- `State.disarm` keeps a state well-formed: an item attached to the host holds its reservation alone, and a
reservation hosts no item and owns no scope occurrence, so what stays refers only to occurrences that stay. -/
theorem disarm_wellFormed {s : State} (formed : WellFormed s) (host : Nat) : WellFormed (s.disarm host) := by
  rw [disarm_eq]
  refine Prunes.wellFormed formed ⟨rfl, instanceOf_congr rfl rfl, List.filter_sublist, List.filter_sublist, rfl, rfl,
    rfl, rfl, rfl, rfl, rfl, rfl, rfl, fun item member occurrence inside link => ?_,
    fun entry _ occurrence inside owned => ?_⟩
  · obtain ⟨old, unattached⟩ := List.mem_filter.mp member
    refine List.mem_filter.mpr ⟨inside, ?_⟩
    cases begunFlag : occurrence.begun
    · rcases link with waits | hangs
      · rw [Bool.false_or, Bool.not_eq_true', List.any_eq_false]
        intro reserving held same
        obtain ⟨heldOld, attached⟩ := List.mem_filter.mp held
        have named : occurrence.id = reserving.occurrence := by simp at same; exact same.symm
        have equal := formed.claimed.attached reserving heldOld (by simp at attached; simp [attached])
          ⟨occurrence, inside, named, begunFlag⟩ item old (by rw [← waits, named])
        subst equal
        simp at attached unattached
        exact unattached attached
      · obtain ⟨found, held, named, rest⟩ := formed.owned.attachments item old _ hangs
        rw [nodup_map_eq formed.distinct.occurrences held inside named] at rest
        simp [rest.1] at begunFlag
    · simp
  · obtain ⟨found, held, named, begunFlag⟩ := formed.owned.scopeOwners entry (by simpa using ‹entry ∈ _›) _ owned
    rw [nodup_map_eq formed.distinct.occurrences held inside named] at begunFlag
    exact List.mem_filter.mpr ⟨inside, by simp [begunFlag]⟩

/-- Withdrawing the items inside scope occurrences keeps a state well-formed and its occurrences. -/
private theorem withdrawAll : ∀ (scopes : List ScopeOccurrence) (t : State), WellFormed t →
    WellFormed (scopes.foldl (fun state entry => state.withdrawInside entry.id) t) ∧
      (scopes.foldl (fun state entry => state.withdrawInside entry.id) t).openItems.Sublist t.openItems ∧
      (scopes.foldl (fun state entry => state.withdrawInside entry.id) t).occurrences = t.occurrences
  | [], _, formed => ⟨formed, .refl _, rfl⟩
  | first :: rest, t, formed => by
    simp only [List.foldl_cons]
    have step : WellFormed (t.withdrawInside first.id) := by
      rw [withdrawInside_eq]
      exact formed.narrow ⟨rfl, rfl, rfl, rfl, instanceOf_congr rfl rfl, id, List.filter_sublist, .refl _, .refl _,
        fun _ => id⟩ rfl formed.startedOnce
    obtain ⟨kept, fewer, same⟩ := withdrawAll rest _ step
    refine ⟨kept, fewer.trans ?_, same.trans ?_⟩
    · rw [withdrawInside_eq]
      exact List.filter_sublist
    · rw [withdrawInside_eq]

/-- Journalling end and cancelled facts keeps a state well-formed. -/
theorem draftEnds_wellFormed {s : State} (formed : WellFormed s) (ended : List (OccurrenceKey × Terminal))
    (cancelled : List Occurrence) : WellFormed { s with draft := { s.draft with ended, cancelled } } :=
  formed.narrow ⟨rfl, rfl, rfl, rfl, instanceOf_congr rfl rfl, id, .refl _, .refl _, .refl _, fun _ => id⟩ rfl
    formed.startedOnce

/-- Cancelling an occurrence keeps a state well-formed: its items and the subscriptions on it are withdrawn first, so
its record goes with nothing left waiting for it or hanging on it. -/
theorem cancel_wellFormed {s : State} (formed : WellFormed s) (id : Nat) : WellFormed (s.cancelOccurrence id) := by
  cases found : s.occurrence? id with
  | none =>
    rw [cancelOccurrence_absent found]
    exact formed
  | some occurrence =>
    obtain ⟨member, named⟩ := occurrence?_some found
    obtain ⟨ended, cancelled, cancels⟩ := cancelOccurrence_some found
    subst named
    have closed := closeOwnItems_wellFormed formed occurrence.id
    obtain ⟨withdrawn, fewer, same⟩ := withdrawAll _ _ (disarm_wellFormed closed occurrence.id)
    rw [← withdrawOccurrence_eq] at withdrawn fewer same
    have stays : occurrence ∈ (s.withdrawOccurrence occurrence.id).occurrences := by
      rw [same, disarm_eq]
      refine List.mem_filter.mpr ⟨by rw [closeOwnItems_eq]; exact member, ?_⟩
      cases begunFlag : occurrence.begun
      · rw [Bool.false_or, Bool.not_eq_true', List.any_eq_false]
        intro reserving held _
        obtain ⟨heldOld, attached⟩ := List.mem_filter.mp held
        obtain ⟨host, hosted, hostNamed, rest⟩ := closed.owned.attachments reserving heldOld _ (by simpa using attached)
        rw [closeOwnItems_eq] at hosted
        rw [nodup_map_eq formed.distinct.occurrences hosted member hostNamed] at rest
        simp [rest.1] at begunFlag
      · simp
    have free : ∀ item ∈ (s.withdrawOccurrence occurrence.id).openItems,
        item.occurrence ≠ occurrence.id ∧ item.attachedTo ≠ some occurrence.id := fun item inside => by
      have disarmed := fewer.subset inside
      rw [disarm_eq] at disarmed
      obtain ⟨closedItem, unattached⟩ := List.mem_filter.mp disarmed
      rw [closeOwnItems_eq] at closedItem
      obtain ⟨_, own⟩ := List.mem_filter.mp closedItem
      exact ⟨by simpa using own, by simpa using unattached⟩
    rw [cancels]
    exact draftEnds_wellFormed (removeOccurrence_wellFormed withdrawn stays free).1 ended cancelled

end Kernel.Laws.State
