module

public import Kernel.Laws.Step.Compacted
public import Kernel.Laws.State

/-! # Laws of the step function: occurrence keys and `WellFormed` across the commit (DC12)

The clauses of `Laws.State.WellFormed` that read an occurrence's public key (`Laws.State.key`), whose process instance
`Laws.State.instanceOf_eq` evaluates: a commit renames every scope occurrence with its parent link and keeps every
called instance's identifier, so each standing scope occurrence keeps its process instance (`compact_instanceOf`), and
each occurrence its key. With the clauses of `Kernel.Laws.Step.Compacted`, `WellFormed` holds of every committed closure
(`orderJournal_wellFormed`), which `Kernel.Proofs.Step` gives as `Phases.runOrder`. Nothing executable imports this
module.
-/

@[expose] public section

namespace Kernel.Laws.Step

variable {schedule : BranchSchedule}

open Kernel Kernel.Step Kernel.Laws.State

section Keys

variable {start : State} {log : RunLog} {s t : State}

/-- A scope occurrence record renamed by a commit. -/
abbrev renamedScope (r : Issue → Issue) (scope : ScopeOccurrence) : ScopeOccurrence :=
  { scope with id := renameScope r scope.id, position := r scope.position, occurrence := scope.occurrence.map (renameId r) }

/-- A process instance reading of the settled state, renamed, is one of the committed state. -/
theorem compact_instanceIn (ran : compact schedule start log s = .ok t) (issued : IssuedBelow s) (rooted : Rooted s)
    {x : ScopeOccurrenceId} {name : String} {chain : List ScopeOccurrence} (reading : InstanceIn s x name chain) :
    InstanceIn t (renameScope (commitRenaming schedule start log s) x) name (chain.map (renamedScope (commitRenaming schedule start log s))) := by
  obtain ⟨H, history⟩ := historic_of issued rooted
  have fixes : Fixes (commitRenaming schedule start log s) := renameBy_fixes _
  have held : ∀ entry ∈ s.scopes, renamedScope (commitRenaming schedule start log s) entry ∈ t.scopes := fun entry member => by
    rw [compact_scopeRecords ran]; exact List.mem_map_of_mem member
  have layered : ∀ entry ∈ s.scopes, Layered entry.id.segments := fun entry member =>
    history.layered _ (history.standing entry member)
  induction reading with
  | called entry name member called => exact .called _ name (held entry member) called
  | up entry parent name chain member uncalled link _ ih =>
    refine .up _ (renameScope _ parent) name _ (held entry member) uncalled ?_ ih
    change (renameScope _ entry.id).parent? = _
    rw [renamed_parent fixes (layered entry member), show entry.id.parent? = some parent from link]
    rfl
  | root entry member uncalled orphan =>
    rw [← (compact_kept ran).instanceId]
    refine .root _ (held entry member) uncalled ?_
    change (renameScope _ entry.id).parent? = none
    rw [renamed_parent fixes (layered entry member), show entry.id.parent? = none from orphan]
    rfl

/-- **A standing scope occurrence keeps its process instance across the commit.** `u` is any well-formed state with the
settled state's scope occurrences and instance, through which `Laws.State.instanceIn_exists` reads it. -/
theorem compact_instanceOf {program : Program} {u : State} (ran : compact schedule start log s = .ok t)
    (counted : CountersFrom start s) (formed : WellFormed program u) (scopes : s.scopes = u.scopes)
    (named : s.instanceId = u.instanceId) (issued : IssuedBelow s) (rooted : Rooted s) (distinct : (scopeIds s).Nodup)
    {x : ScopeOccurrenceId} (present : x ∈ scopeIds s) :
    t.instanceOf (renameScope (commitRenaming schedule start log s) x) = s.instanceOf x := by
  obtain ⟨name, chain, reading, rest⟩ := instanceIn_exists formed (by rw [scopeIds, ← scopes]; exact present)
  have nodup := rest.1
  have reading : InstanceIn s x name chain :=
    reading.transport (fun entry inside => by rw [scopes]; exact reading.mem entry inside) named
  have renamedNodup : ((chain.map (renamedScope (commitRenaming schedule start log s))).map (·.id)).Nodup := by
    rw [List.map_map]
    unfold List.Nodup at nodup ⊢
    rw [List.pairwise_map] at nodup ⊢
    refine nodup.imp_of_mem fun {a b} am bm apart same => apart ?_
    exact renameScope_apart counted rooted ((historic_of issued rooted).issued (reading.mem a am))
      (List.mem_map_of_mem (reading.mem b bm)) same
  have rootedAfter := compact_rooted ran issued rooted
  rw [instanceOf_eq distinct (fun entry member orphan => (rooted.2.1 entry member).mp orphan) reading nodup]
  exact instanceOf_eq
    (compact_scopesDistinct ran counted (historic_of issued rooted) (rooted_parents rooted) distinct)
    (fun entry member orphan => (rootedAfter.2.1 entry member).mp orphan) (compact_instanceIn ran issued rooted reading)
    renamedNodup

/-- An occurrence keeps its public key across the commit. -/
theorem compact_key {program : Program} {u : State} (ran : compact schedule start log s = .ok t) (counted : CountersFrom start s)
    (formed : WellFormed program u) (scopes : s.scopes = u.scopes) (named : s.instanceId = u.instanceId)
    (issued : IssuedBelow s) (owned : Owned s) (rooted : Rooted s) (distinct : (scopeIds s).Nodup)
    {occurrence : Occurrence} (member : occurrence ∈ t.occurrences) :
    ∃ old ∈ s.occurrences, key t occurrence = key s old ∧ occurrence.begun = old.begun := by
  obtain ⟨old, inside, mapped⟩ := compact_occurrence_of ran member
  have scope := mapped.scope
  have element := mapped.element
  have begun := mapped.begun
  have role := mapped.role
  have activation := mapped.activation
  refine ⟨old, inside, ?_, begun⟩
  simp only [key, scope, element, role, activation,
    compact_instanceOf ran counted formed scopes named issued rooted distinct (owned.occurrenceScopes old inside)]

/-! ## The clauses over occurrence keys -/

/-- **`Distinct.keys` across the commit.** -/
theorem compact_keysDistinct {program : Program} {u : State} (ran : compact schedule start log s = .ok t)
    (counted : CountersFrom start s) (formed : WellFormed program u) (scopes : s.scopes = u.scopes)
    (named : s.instanceId = u.instanceId) (issued : IssuedBelow s) (owned : Owned s) (rooted : Rooted s)
    (distinct : Distinct s) : (t.occurrences.map (key t)).Nodup := by
  have same : t.occurrences.map (key t) = s.occurrences.map (key s) := by
    rw [compact_occurrences ran, List.map_map]
    refine List.map_congr_left fun old inside => ?_
    obtain ⟨_, _, mapped⟩ := compact_occurrence_mem ran inside
    have scope := mapped.scope
    simp only [Function.comp, key,
      compact_instanceOf ran counted formed scopes named issued rooted distinct.scopes (owned.occurrenceScopes old inside)]
  rw [same]
  exact distinct.keys

/-- **`OccurrencesCounted` across the commit** (`occurrencesCounted`). -/
theorem compact_occurrencesCounted {program : Program} {u : State} (ran : compact schedule start log s = .ok t)
    (counted : CountersFrom start s) (formed : WellFormed program u) (scopes : s.scopes = u.scopes)
    (named : s.instanceId = u.instanceId) (issued : IssuedBelow s) (owned : Owned s) (rooted : Rooted s)
    (distinct : (scopeIds s).Nodup) (occurrences : OccurrencesCounted s) : OccurrencesCounted t := by
  intro occurrence member
  obtain ⟨old, inside, same, -⟩ := compact_key ran counted formed scopes named issued owned rooted distinct member
  obtain ⟨count, held, rest⟩ := occurrences old inside
  exact ⟨count, by rw [(compact_kept ran).activations]; exact held, by rw [same]; exact rest⟩

/-- **`ReservationsUnstarted` across the commit** (`reservations`). -/
theorem compact_reservations {program : Program} {u : State} (ran : compact schedule start log s = .ok t)
    (counted : CountersFrom start s) (formed : WellFormed program u) (scopes : s.scopes = u.scopes)
    (named : s.instanceId = u.instanceId) (issued : IssuedBelow s) (owned : Owned s) (rooted : Rooted s)
    (distinct : (scopeIds s).Nodup) (unstarted : ReservationsUnstarted s) : ReservationsUnstarted t := by
  intro occurrence member unbegun fact started
  obtain ⟨old, inside, same, begun⟩ := compact_key ran counted formed scopes named issued owned rooted distinct member
  have recorded : fact.occurrence ∈ (starts s).map (·.occurrence) := by
    rw [← compact_starts ran]; exact List.mem_map_of_mem (f := StartedFact.occurrence) started
  obtain ⟨other, otherIn, otherSame⟩ := List.mem_map.mp recorded
  rw [same, ← otherSame]
  exact unstarted old inside (by rw [← begun]; exact unbegun) other otherIn

end Keys

/-! ## `WellFormed` across the commit -/

/-- **`WellFormed` across the commit** (`Phases.runOrder`'s compaction, DC12): a settled closure's state, ordered and
compacted onto the counters of the state the closure started from, is well-formed when the settled state is, its
counters are at most the start's (`CountersFrom`), its batches are empty, and its occurrences' keys lead with the scope
occurrences they stand in (DC26). The ordered state is not itself `WellFormed`: its transitions are emptied while its
issue table still names their units (`IssuerFresh.ran`), so each clause is carried from the settled state directly. -/
theorem compact_wellFormed {program : Program} {start state : State} {log : RunLog} {t : State}
    (formed : WellFormed program state) (counted : CountersFrom start state)
    (batches : state.batchSignals = [] ∧ state.batchTokens = [] ∧ state.batchIntents = [])
    (keys : ∀ occurrence ∈ state.occurrences, occurrence.id.scope = occurrence.scope)
    (ran : compact schedule start log (ordered log state) = .ok t) : WellFormed program t := by
  have fewer : Fewer (starts (ordered log state)) (starts state) := by
    simp only [starts, toList_empty, List.map_nil, List.flatMap_nil, List.append_nil]
    exact Fewer.trans (.of_perm (((byRun_perm log state.transitions).flatMap_right _).append_right _))
      (.of_sublist ((List.sublist_append_right _ _).append_right _))
  have once : StartedOnce (ordered log state) := by
    obtain ⟨kept, same, sub⟩ := fewer
    exact (formed.startedOnce.sublist (sub.map _)).perm (same.map _).symm
  have facts := ordered_facts log formed counted batches
  have counted := facts.counted
  have issued := facts.issued
  have owned := facts.owned
  have rooted := facts.rooted
  have quietSignals := facts.quietSignals
  have quietTokens := facts.quietTokens
  have quietBefore : allSignals (ordered log state) = [] ∧ allQueuedTokens (ordered log state) = [] :=
    ⟨quietSignals, quietTokens⟩
  have quiet := compact_quiet ran quietBefore
  -- A clause structure over the settled state is not one over the ordered state, so each is rebuilt from its fields.
  have keyed : ∀ occurrence, key (ordered log state) occurrence = key state occurrence := fun _ =>
    key_congr (instanceOf_congr (s := state) (t := ordered log state) rfl rfl _)
  have distinct : Distinct (ordered log state) :=
    ⟨formed.distinct.1, formed.distinct.2, formed.distinct.3, by rw [funext keyed]; exact formed.distinct.4⟩
  have grows : ScopeGrows state (ordered log state) := .of_same rfl rfl (.of_eq rfl)
  have issuedGrows : OccurrenceGrows state (ordered log state) := .of_same rfl rfl rfl (.of_eq rfl)
  have noSignal : ∀ signal ∈ allSignals (ordered log state), signal ∈ allSignals state := fun _ member => by
    rw [quietBefore.1] at member; cases member
  have claimed : ReservationsClaimed (ordered log state) :=
    formed.claimed.shrink (fun _ member => member) (fun _ member => member) formed.owned.occurrenceScopes
      (fun _ member => member) (fun _ _ => instanceOf_congr (s := state) (t := ordered log state) rfl rfl _) issuedGrows grows
      (by rw [quietBefore.1]; exact .of_sublist (List.nil_sublist _))
      (by rw [quietBefore.2]; exact .of_sublist (List.nil_sublist _))
  have settled : SlotsSettled (ordered log state) :=
    formed.settled.transport (.same rfl) issuedGrows grows (fun _ member _ => .inl member)
      (fun _ queued => absurd queued (quiet_queued quietBefore)) noSignal (fun _ member => .inl member)
  have typed : Typed program (ordered log state) :=
    formed.typed.shrink (fun _ member => member) (fun _ member _ => member) noSignal
  have parents := rooted_parents rooted
  have historic := historic_of issued rooted
  exact {
    issued := compacts_issued ran counted issued
      (fun item member => let ⟨occurrence, present, same, _⟩ := owned.itemOccurrences item member; ⟨occurrence, present, same⟩)
      parents
    distinct := ⟨compact_occurrencesDistinct ran counted issued owned rooted keys distinct.occurrences,
      compact_keyed ran distinct.items, compact_scopesDistinct ran counted historic parents distinct.scopes,
      compact_keysDistinct ran counted formed rfl rfl issued owned rooted distinct⟩
    startedOnce := compact_startedOnce ran once
    activations := compact_activations ran ⟨formed.activations.1, formed.activations.2⟩
    reservations := compact_reservations ran counted formed rfl rfl issued owned rooted distinct.scopes
      fun occurrence member unbegun fact started => by
        rw [keyed]; exact formed.reservations occurrence member unbegun fact (fewer.subset started)
    owned := compact_owned ran owned quiet.2
    rooted := compact_rooted ran issued rooted
    variables := compact_variablesKeyed ran counted issued owned rooted ⟨formed.variables.1, formed.variables.2⟩
    failure := compact_failure ran formed.failure
    queue := quiet_queueSound quiet.1
    counted := compact_startsCounted ran fun fact started => formed.counted fact (fewer.subset started)
    occurrencesCounted := compact_occurrencesCounted ran counted formed rfl rfl issued owned rooted distinct.scopes
      fun occurrence member => by rw [keyed]; exact formed.occurrencesCounted occurrence member
    ownedBelow := compact_ownedBelow ran counted issued owned rooted keys formed.ownedBelow
    claimed := compact_claimed ran counted issued owned rooted keys quiet claimed
    settled := compact_slotsSettled ran counted issued owned rooted keys quiet settled
    attachedReserved := compact_attachedReserved ran counted issued owned rooted keys formed.attachedReserved
    typed := compact_typed ran counted issued owned rooted keys quiet.1 typed
    worked := compact_worked ran counted issued owned rooted keys formed.worked
    roles := compact_eventRoles ran formed.roles
    raises := quiet_raisesSound quiet.1
    bodyRoles := compact_bodyRoles ran formed.bodyRoles
    itemRoles := compact_itemRoles' ran counted issued owned rooted keys formed.itemRoles
    issuer := compact_issuerFresh ran }

/-- **`WellFormed` across `Step.orderJournal`**, in the form `Phases.runOrder` takes it. -/
theorem orderJournal_wellFormed {program : Program} {start state : State} {log : RunLog} {after : State}
    (formed : WellFormed program state) (counted : CountersFrom start state)
    (batches : state.batchSignals = [] ∧ state.batchTokens = [] ∧ state.batchIntents = [])
    (keys : ∀ occurrence ∈ state.occurrences, occurrence.id.scope = occurrence.scope)
    (made : orderJournal schedule start (.ok (state, log)) = .ok after) : WellFormed program after :=
  compact_wellFormed formed counted batches keys (orderJournal_of made)

end Kernel.Laws.Step
