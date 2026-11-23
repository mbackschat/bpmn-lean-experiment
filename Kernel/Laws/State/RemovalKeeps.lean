module

public import Kernel.Laws.State.Keeps

/-! # Laws of the kernel state: what removing an occurrence keeps

That `State.removeOccurrence` and `State.cancelOccurrence` keep `WellFormed` under the conditions their callers
establish, composed from what `Kernel.Laws.State` shows each step does to the fields and the frames of
`Kernel.Laws.State.Clear`; it reads no body. `State.removeOccurrence` removes the record first and then leaves the
scope occurrences the occurrence owns, a state in between that owns scope occurrences by a missing occurrence; the proof
leaves them first and removes the record last, which ends in the same state since the record lies outside each of them.
Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Laws.State

variable {program : Program}

open Kernel

/-! ## Leaving a scope occurrence -/

/-- Leaving a scope occurrence keeps the counters of the scope occurrences that remain, so every history grows. -/
theorem leaveScope_grows (s : State) (scope : ScopeOccurrenceId) : ScopeGrows s (s.leaveScope scope) := by
  have shape := (leaveScope_eq s scope).1
  refine (clearInside_grows s scope []).trans (.shrink
    (fun _ member => by rw [shape] at member; exact (List.filter_sublist.map _).subset member) (fun _ standing _ => ?_)
    (.of_eq (by rw [leaveScope_issued, clearInside_issued])))
  rw [shape] at standing ⊢
  obtain ⟨entry, inside, rfl⟩ := List.mem_map.mp standing
  exact getD_filter_keep fun _ => (List.mem_filter.mp inside).2

/-- Leaving a scope occurrence keeps the occurrence counters of the scope occurrences that remain, so every occurrence
key issued stays issued. -/
theorem leaveScope_occurrenceGrows (s : State) (scope : ScopeOccurrenceId) : OccurrenceGrows s (s.leaveScope scope) := by
  have shape := (leaveScope_eq s scope).1
  have cleared : OccurrenceGrows s (s.clearInside scope) :=
    .of_scopes (clearInside_grows s scope []) (fun _ member _ => ((clearInside_shrinks s scope []).1.map _).subset member)
      (fun x member element => Nat.le_of_eq (clearInside_counters s scope [] x member element).symm)
      (.of_eq (clearInside_issued s scope []))
  have table : TableGrows (s.clearInside scope) (s.leaveScope scope) :=
    .of_eq (by rw [leaveScope_issued, clearInside_issued])
  have grows : ScopeGrows (s.clearInside scope) (s.leaveScope scope) := .shrink
    (fun _ member => by rw [shape] at member; exact (List.filter_sublist.map _).subset member) (fun _ standing _ => by
      rw [shape] at standing ⊢
      obtain ⟨entry, inside, rfl⟩ := List.mem_map.mp standing
      exact getD_filter_keep fun _ => (List.mem_filter.mp inside).2) table
  refine cleared.trans (.of_scopes grows (fun _ member _ => by
    rw [shape] at member; exact (List.filter_sublist.map _).subset member) (fun _ standing _ => ?_) table)
  rw [shape] at standing ⊢
  obtain ⟨entry, inside, rfl⟩ := List.mem_map.mp standing
  exact Nat.le_of_eq (getD_filter_keep fun _ => (List.mem_filter.mp inside).2).symm

/-- Leaving a present scope occurrence of a well-formed state. -/
theorem leaveScope_left {s : State} (formed : WellFormed program s) {scope : ScopeOccurrenceId} (present : scope ∈ scopeIds s) :
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
  refine {
      scopes := scopes, occurrences := fun occurrence => ?_, items := fun item => ?_, tokens := fun token => ?_,
      variables := fun variables => ?_, scopesSublist := fewer,
      occurrencesSublist := by rw [shape]; exact cleared.occurrencesSublist,
      openItemsSub := by rw [shape]; exact cleared.openItemsSub, ordinals := by rw [shape]; exact cleared.ordinals,
      tokensSublist := by rw [shape]; exact cleared.tokensSublist,
      variablesSublist := by rw [shape]; exact List.filter_sublist.trans cleared.variablesSublist,
      instances := fun x member => ?_, activations := by rw [shape]; exact cleared.activations,
      issued := by rw [shape]; exact cleared.issued, issuing := by rw [shape]; exact cleared.issuing,
      issueNext := by rw [shape]; exact cleared.issueNext,
      occurrenceGrows := leaveScope_occurrenceGrows s scope, scopeGrows := leaveScope_grows s scope,
      signals := by rw [shape]; exact cleared.signals, queues := by
        rw [shape]
        exact ⟨cleared.queues.signals, cleared.queues.tokens, cleared.queues.queuedSignals, cleared.queues.queuedTokens⟩,
      status := by rw [shape]; exact cleared.status, failure := by rw [shape]; exact cleared.failure,
      journal := by rw [shape]; exact cleared.journal, transitions := by rw [shape]; exact cleared.transitions, started := by rw [shape]; exact cleared.started, slots := ?_ }
  rotate_right
  · obtain ⟨parked, bodies, runs⟩ := leaveScope_slots s scope
    exact ⟨fun _ member => cleared.slots.parked _ (parked ▸ member),
      fun _ member => cleared.slots.bodies _ (bodies ▸ member), fun _ member => cleared.slots.runs _ (runs ▸ member)⟩
  · rw [shape]
    simpa using cleared.occurrences occurrence
  · rw [shape]
    simpa using cleared.items item
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

/-- A scope occurrence with a depth stands. -/
theorem Depth.present {s : State} (formed : WellFormed program s) {scope : ScopeOccurrenceId} {n : Nat} (depth : Depth s scope n) :
    scope ∈ scopeIds s := by
  cases depth with
  | root => exact formed.rooted.1
  | child child _ _ member => exact List.mem_map.mpr ⟨child, member, rfl⟩

/-- Leaving a scope occurrence that has a parent keeps a state well-formed and its parent standing. -/
theorem leaveChild_wellFormed {s : State} (formed : WellFormed program s) {child : ScopeOccurrence} (member : child ∈ s.scopes)
    {parent : ScopeOccurrenceId} (link : child.parent = some parent) :
    WellFormed program (s.leaveScope child.id) ∧ parent ∈ scopeIds (s.leaveScope child.id) ∧
      Left s (s.leaveScope child.id) child.id := by
  have present : child.id ∈ scopeIds s := List.mem_map.mpr ⟨child, member, rfl⟩
  have notRoot : child.id ≠ State.root := fun same => by
    have := (formed.rooted.2.1 child member).mpr same
    simp [this] at link
  have left := leaveScope_left formed present
  obtain ⟨n, depth⟩ := (formed.rooted.2.2 child member).depth
  obtain ⟨_, _, parentDepth⟩ := Depth.parent formed member link depth
  obtain ⟨entry, inside, named⟩ := List.mem_map.mp (parentDepth.present formed)
  refine ⟨left.wellFormed formed present notRoot, List.mem_map.mpr ⟨entry, (left.scopes entry).mpr
    ⟨inside, fun within => parent_not_within formed member link (named ▸ within)⟩, named⟩, left⟩

/-- Two scope occurrences below one parent lie outside each other. -/
theorem sibling_outside {s : State} (formed : WellFormed program s) {first second : ScopeOccurrence}
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
theorem withoutRecord_wellFormed {s : State} (formed : WellFormed program s) {id : OccurrenceId}
    (free : ∀ item ∈ itemList s.openItems, item.id.occurrence ≠ id ∧ item.attachedTo ≠ some id)
    (unowned : ∀ entry ∈ s.scopes, entry.occurrence ≠ some id) : WellFormed program (withoutRecord s id) := by
  have kept : ∀ occurrence ∈ s.occurrences, occurrence.id ≠ id → occurrence ∈ (withoutRecord s id).occurrences :=
    fun occurrence member other => List.mem_filter.mpr ⟨member, by simpa using other⟩
  have ordinals : ∀ occurrence ∈ (withoutRecord s id).occurrences,
      (withoutRecord s id).itemOrdinals.getD occurrence.id 0 = s.itemOrdinals.getD occurrence.id 0 :=
    fun occurrence member => getD_erase_ne (by simpa using (List.mem_filter.mp member).2)
  refine Prunes.wellFormed formed {
      scopes := rfl, scopeOrdinals := rfl, instances := instanceOf_congr rfl rfl, occurrences := List.filter_sublist,
      items := ItemsSub.refl _, ordinals := ordinals, tokens := rfl, signals := rfl, variables := rfl,
      activations := rfl, occurrenceGrows := .refl _, journal := rfl, transitions := rfl, started := rfl, status := rfl, failure := rfl,
      slots := rfl, issued := rfl, issuing := rfl, issueNext := rfl, waited := fun item member occurrence inside link => ?_,
      owners := fun entry member occurrence inside owned => ?_ }
  · refine kept occurrence inside fun same => ?_
    rcases link with waits | hangs
    · exact (free item (items_same member rfl)).1 (waits ▸ same)
    · exact (free item (items_same member rfl)).2 (same ▸ hangs)
  · exact kept occurrence inside fun same => unowned entry member (same ▸ owned)

/-- Leaving the scope occurrences an occurrence `record` owns, siblings below its scope occurrence, keeps a state
well-formed, keeps the record and its scope occurrence, leaves no scope occurrence it owns, and commutes with removing
its record. -/
private theorem leaveOwned {id : OccurrenceId} {record : Occurrence} :
    ∀ (owned : List ScopeOccurrence) (t : State), WellFormed program t → record ∈ t.occurrences →
      (∀ occurrence ∈ t.occurrences, occurrence.id = id → occurrence = record) → owned.Nodup →
      (∀ entry ∈ owned, entry ∈ t.scopes ∧ entry.parent = some record.scope) →
      (∀ entry ∈ t.scopes, entry.occurrence = some id → entry ∈ owned) →
      owned.foldl (fun state entry => state.leaveScope entry.id) (withoutRecord t id) =
        withoutRecord (owned.foldl (fun state entry => state.leaveScope entry.id) t) id ∧
      WellFormed program (owned.foldl (fun state entry => state.leaveScope entry.id) t) ∧
      record.scope ∈ scopeIds (owned.foldl (fun state entry => state.leaveScope entry.id) t) ∧
      ItemsSub (owned.foldl (fun state entry => state.leaveScope entry.id) t).openItems t.openItems ∧
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
    exact ⟨commutes, kept, stands, left.openItemsSub.trans fewer, none⟩

/-- Removing an occurrence on which no item waits or hangs keeps a state well-formed and leaves its scope occurrence
standing. -/
theorem removeOccurrence_wellFormed {s : State} (formed : WellFormed program s) {record : Occurrence}
    (member : record ∈ s.occurrences)
    (free : ∀ item ∈ itemList s.openItems, item.id.occurrence ≠ record.id ∧ item.attachedTo ≠ some record.id) :
    WellFormed program (s.removeOccurrence record.id) ∧ record.scope ∈ scopeIds (s.removeOccurrence record.id) := by
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
  exact ⟨withoutRecord_wellFormed kept (fun item inside => free item (fewer.items inside)) none, stands⟩

/-! ## Cancelling an occurrence -/

/-- `State.disarm` keeps a state well-formed: an item attached to the host holds its reservation alone, and a
reservation hosts no item and owns no scope occurrence, so what stays refers only to occurrences that stay. -/
theorem disarm_wellFormed {s : State} (formed : WellFormed program s) (host : OccurrenceId) : WellFormed program (s.disarm host) := by
  rw [disarm_eq]
  refine Prunes.wellFormed formed {
      scopes := rfl, scopeOrdinals := rfl, instances := instanceOf_congr rfl rfl, occurrences := List.filter_sublist,
      items := ItemsSub.filter _ _, ordinals := fun occurrence member => getD_filter_keep fun _ => ?_, tokens := rfl,
      signals := rfl, variables := rfl, activations := rfl, occurrenceGrows := .refl _, journal := rfl, transitions := rfl, started := rfl,
      status := rfl, failure := rfl, slots := rfl, issued := rfl, issuing := rfl, issueNext := rfl, waited := fun item member occurrence inside link => ?_,
      owners := fun entry _ occurrence inside owned => ?_ }
  · obtain ⟨present, kept⟩ := List.mem_filter.mp member
    simp only [Bool.not_eq_eq_eq_not, Bool.not_true, List.any_eq_false, Bool.and_eq_true, beq_iff_eq]
    rintro other held ⟨⟨same, unbegun⟩, attached⟩
    rw [nodup_map_eq formed.distinct.occurrences held present same] at unbegun attached
    simp [unbegun] at kept
    simp at attached
    obtain ⟨item, inside, hung, named⟩ := attached
    exact kept item inside hung named
  · obtain ⟨old, unattached⟩ := mem_itemList_filter_val.mp (member)
    replace old := old
    refine List.mem_filter.mpr ⟨inside, ?_⟩
    cases begunFlag : occurrence.begun
    · rcases link with waits | hangs
      · rw [Bool.false_or, Bool.not_eq_true', List.any_eq_false]
        intro reserving held same
        obtain ⟨heldOld, attached⟩ := List.mem_filter.mp held
        have named : occurrence.id = reserving.id.occurrence := by simp at same; simp [same]
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
theorem withdrawAll : ∀ (scopes : List ScopeOccurrence) (t : State), WellFormed program t →
    WellFormed program (scopes.foldl (fun state entry => state.withdrawInside entry.id) t) ∧
      ItemsSub (scopes.foldl (fun state entry => state.withdrawInside entry.id) t).openItems t.openItems ∧
      (scopes.foldl (fun state entry => state.withdrawInside entry.id) t).occurrences = t.occurrences
  | [], _, formed => ⟨formed, ItemsSub.refl _, rfl⟩
  | first :: rest, t, formed => by
    simp only [List.foldl_cons]
    have step : WellFormed program (t.withdrawInside first.id) := by
      rw [withdrawInside_eq]
      exact formed.narrow {
          scopes := rfl, scopeOrdinals := rfl, occurrences := rfl, activations := rfl, occurrenceOrdinals := rfl,
          instances := instanceOf_congr rfl rfl, recorded := id, items := .filter _, tokens := .refl _,
          signals := .refl _, starts := fun _ => id, slots := .same rfl, issued := rfl, issuing := rfl, issueNext := rfl } rfl formed.startedOnce
    obtain ⟨kept, fewer, same⟩ := withdrawAll rest _ step
    refine ⟨kept, ItemsSub.trans ?_ fewer, same.trans ?_⟩
    · rw [withdrawInside_eq]
      exact ItemsSub.filter _ _
    · rw [withdrawInside_eq]

/-- Journalling end and cancelled facts keeps a state well-formed. -/
theorem draftEnds_wellFormed {s : State} (formed : WellFormed program s) (ended : List (OccurrenceKey × Terminal))
    (cancelled : List Occurrence) : WellFormed program { s with draft := { s.draft with ended, cancelled } } :=
  formed.narrow {
      scopes := rfl, scopeOrdinals := rfl, occurrences := rfl, activations := rfl, occurrenceOrdinals := rfl, instances := instanceOf_congr rfl rfl,
      recorded := id, items := .refl _, tokens := .refl _, signals := .refl _, starts := fun _ => id,
      slots := .same rfl, issued := rfl, issuing := rfl, issueNext := rfl }
    rfl formed.startedOnce

/-- Cancelling an occurrence keeps a state well-formed: its items and the subscriptions on it are withdrawn first, so
its record goes with nothing left waiting for it or hanging on it. -/
theorem cancel_wellFormed {s : State} (formed : WellFormed program s) (id : OccurrenceId) : WellFormed program (s.cancelOccurrence id) := by
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
    have free : ∀ item ∈ itemList (s.withdrawOccurrence occurrence.id).openItems,
        item.id.occurrence ≠ occurrence.id ∧ item.attachedTo ≠ some occurrence.id := fun item inside => by
      have disarmed := fewer.items inside
      rw [disarm_eq] at disarmed
      obtain ⟨closedItem, unattached⟩ := mem_itemList_filter_val.mp (disarmed)
      rw [closeOwnItems_eq] at closedItem
      obtain ⟨_, own⟩ := mem_itemList_filter_val.mp closedItem
      exact ⟨by simpa using own, by simpa using unattached⟩
    rw [cancels]
    exact draftEnds_wellFormed (removeOccurrence_wellFormed withdrawn stays free).1 ended cancelled

/-! ## What removal shrinks -/

private theorem leaveScope_shrinks (s : State) (scope : ScopeOccurrenceId) :
    (s.leaveScope scope).scopes.Sublist s.scopes ∧ (s.leaveScope scope).nextPosition = s.nextPosition := by
  obtain ⟨fewer, same⟩ := clearInside_shrinks s scope []
  rw [(leaveScope_eq s scope).1]
  exact ⟨List.filter_sublist.trans fewer, same⟩

private theorem leaveAll_shrinks : ∀ (scopes : List ScopeOccurrence) (t : State),
    (scopes.foldl (fun t entry => t.leaveScope entry.id) t).scopes.Sublist t.scopes ∧
      (scopes.foldl (fun t entry => t.leaveScope entry.id) t).nextPosition = t.nextPosition ∧
      ScopeGrows t (scopes.foldl (fun t entry => t.leaveScope entry.id) t)
  | [], _ => ⟨.refl _, rfl, .refl _⟩
  | entry :: rest, t => by
    obtain ⟨fewer, same, grows⟩ := leaveAll_shrinks rest (t.leaveScope entry.id)
    obtain ⟨fewer', same'⟩ := leaveScope_shrinks t entry.id
    exact ⟨fewer.trans fewer', same.trans same', (leaveScope_grows t entry.id).trans grows⟩

private theorem removeOccurrence_shrinks (s : State) (id : OccurrenceId) :
    (s.removeOccurrence id).scopes.Sublist s.scopes ∧ (s.removeOccurrence id).nextPosition = s.nextPosition ∧
      ScopeGrows s (s.removeOccurrence id) := by
  rw [removeOccurrence_eq]
  obtain ⟨fewer, same, grows⟩ := leaveAll_shrinks _ (withoutRecord s id)
  exact ⟨fewer, same, (ScopeGrows.of_same (t := withoutRecord s id) rfl rfl (.refl _)).trans grows⟩

private theorem withdrawAll_shrinks : ∀ (scopes : List ScopeOccurrence) (t : State),
    (scopes.foldl (fun t entry => t.withdrawInside entry.id) t).scopes = t.scopes ∧
      (scopes.foldl (fun t entry => t.withdrawInside entry.id) t).nextPosition = t.nextPosition ∧
      (scopes.foldl (fun t entry => t.withdrawInside entry.id) t).scopeOrdinals = t.scopeOrdinals ∧
      (scopes.foldl (fun t entry => t.withdrawInside entry.id) t).issued = t.issued
  | [], _ => ⟨rfl, rfl, rfl, rfl⟩
  | entry :: rest, t => by
    obtain ⟨scopes, position, ordinals, table⟩ := withdrawAll_shrinks rest (t.withdrawInside entry.id)
    exact ⟨scopes.trans (by simp [withdrawInside_eq]), position.trans (by simp [withdrawInside_eq]),
      ordinals.trans (by simp [withdrawInside_eq]), table.trans (by simp [withdrawInside_eq])⟩

/-- The removal operations drop scope occurrences, take no position and keep every scope occurrence key issued. -/
theorem removal_shrinks (s : State) :
    (∀ scope keep, (s.clearInside scope keep).scopes.Sublist s.scopes ∧
      (s.clearInside scope keep).nextPosition = s.nextPosition ∧ ScopeGrows s (s.clearInside scope keep)) ∧
    (∀ scope, (s.leaveScope scope).scopes.Sublist s.scopes ∧ (s.leaveScope scope).nextPosition = s.nextPosition ∧
      ScopeGrows s (s.leaveScope scope)) ∧
    (∀ id, (s.removeOccurrence id).scopes.Sublist s.scopes ∧ (s.removeOccurrence id).nextPosition = s.nextPosition ∧
      ScopeGrows s (s.removeOccurrence id)) ∧
    ∀ id, (s.cancelOccurrence id).scopes.Sublist s.scopes ∧ (s.cancelOccurrence id).nextPosition = s.nextPosition ∧
      ScopeGrows s (s.cancelOccurrence id) := by
  refine ⟨fun scope keep => ⟨(clearInside_shrinks s scope keep).1, (clearInside_shrinks s scope keep).2,
      clearInside_grows s scope keep⟩,
    fun scope => ⟨(leaveScope_shrinks s scope).1, (leaveScope_shrinks s scope).2, leaveScope_grows s scope⟩,
    removeOccurrence_shrinks s, fun id => ?_⟩
  cases found : s.occurrence? id with
  | none => rw [cancelOccurrence_absent found]; exact ⟨.refl _, rfl, .refl _⟩
  | some occurrence =>
    obtain ⟨_, _, cancels⟩ := cancelOccurrence_some found
    obtain ⟨fewer, same, grows⟩ := removeOccurrence_shrinks (s.withdrawOccurrence id) id
    obtain ⟨scopes, position, ordinals, table⟩ := withdrawAll_shrinks _ ((s.closeOwnItems id).disarm id)
    rw [← withdrawOccurrence_eq, disarm_eq, closeOwnItems_eq] at scopes position ordinals table
    rw [cancels]
    exact ⟨fewer.trans (scopes ▸ .refl _), same.trans position,
      (ScopeGrows.of_same (congrArg (List.map ScopeOccurrence.id) scopes) ordinals (.of_eq table)).trans grows⟩

end Kernel.Laws.State
