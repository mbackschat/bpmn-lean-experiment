module

public import Kernel.Laws.Step.Compacted
public import Kernel.Laws.Step.Activations
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

/-- A process instance reading of the settled state, renamed, is one of the committed state. -/
theorem compact_instanceIn (ran : compact schedule start log s = .ok t) (counted : CountersFrom start s)
    (issued : IssuedBelow s) (rooted : Rooted s) (distinct : (scopeIds s).Nodup) {x : ScopeOccurrenceId} {name : InstanceName} {chain : List ScopeOccurrence} (reading : InstanceIn s x name chain) :
    InstanceIn t (renameScope (commitRenaming schedule start log s) x) (name.rename (commitRenaming schedule start log s))
      (chain.map (renamedScope (commitRenaming schedule start log s))) := by
  obtain ⟨H, history⟩ := historic_of issued rooted
  have fixes : Fixes (commitRenaming schedule start log s) := renameBy_fixes _
  have held : ∀ entry ∈ s.scopes, renamedScope (commitRenaming schedule start log s) entry ∈ t.scopes := fun entry member =>
    compact_scopeRecord_mem ran distinct (standing_apart counted rooted issued) member
  have layered : ∀ entry ∈ s.scopes, Layered entry.id.segments := fun entry member =>
    history.layered _ (history.standing entry member)
  induction reading with
  | called entry name member called => exact .called _ _ (held entry member) (by simp [called])
  | up entry parent name chain member uncalled link _ ih =>
    refine .up _ (renameScope _ parent) _ _ (held entry member) (by simp [uncalled]) ?_ ih
    change (renameScope _ entry.id).parent? = _
    rw [renamed_parent fixes (layered entry member), show entry.id.parent? = some parent from link]
    rfl
  | root entry member uncalled orphan =>
    rw [rename_named, ← (compact_kept ran).instanceId]
    refine .root _ (held entry member) (by simp [uncalled]) ?_
    change (renameScope _ entry.id).parent? = none
    rw [renamed_parent fixes (layered entry member), show entry.id.parent? = none from orphan]
    rfl

/-- **A standing scope occurrence keeps its process instance across the commit, resolved** (KD5). `u` is any well-formed
state with the settled state's scope occurrences and instance, through which `Laws.State.instanceIn_exists` reads it. -/
theorem compact_instanceOf {program : Program} {u : State} (ran : compact schedule start log s = .ok t)
    (counted : CountersFrom start s) (formed : WellFormed program u) (scopes : s.scopes = u.scopes)
    (named : s.instanceId = u.instanceId) (issued : IssuedBelow s) (rooted : Rooted s) (distinct : (scopeIds s).Nodup)
    {x : ScopeOccurrenceId} (present : x ∈ scopeIds s) :
    t.instanceOf (renameScope (commitRenaming schedule start log s) x) = (s.instanceOf x).rename (commitRenaming schedule start log s) := by
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
    (compact_scopesNodup ran distinct)
    (fun entry member orphan => (rootedAfter.2.1 entry member).mp orphan) (compact_instanceIn ran counted issued rooted distinct reading)
    renamedNodup

/-- An occurrence keeps its public key across the commit. -/
theorem compact_key {program : Program} {u : State} (ran : compact schedule start log s = .ok t) (counted : CountersFrom start s)
    (formed : WellFormed program u) (scopes : s.scopes = u.scopes) (named : s.instanceId = u.instanceId)
    (issued : IssuedBelow s) (owned : Owned s) (rooted : Rooted s) (distinct : (scopeIds s).Nodup)
    {occurrence : Occurrence} (member : occurrence ∈ t.occurrences) :
    ∃ old ∈ s.occurrences, key t occurrence = renameKey (commitRenaming schedule start log s) (key s old) ∧
      occurrence.begun = old.begun := by
  obtain ⟨old, inside, mapped⟩ := compact_occurrence_of ran member
  have scope := mapped.scope
  have element := mapped.element
  have begun := mapped.begun
  have role := mapped.role
  have activation := mapped.activation
  refine ⟨old, inside, ?_, begun⟩
  simp only [key, scope, element, role, activation, renameKey_eq,
    compact_instanceOf ran counted formed scopes named issued rooted distinct (owned.occurrenceScopes old inside)]

/-- A standing scope occurrence's process instance is live (`Step.countLive`): the process instance, or the one its
instance root calls, so the commit keeps the counters it activates under (DC24). -/
theorem countLive_instanceOf (state : State) (scope : ScopeOccurrenceId) {count : ActivationCount}
    (named : count.processInstance = state.instanceOf scope) : countLive state count = true := by
  rw [instanceOf_root] at named
  simp only [countLive, instanceLive, Bool.or_eq_true, beq_iff_eq, List.any_eq_true]
  cases found : state.scopes.find? (·.id == state.instanceRoot scope) with
  | none => simp only [found, Option.bind_none, Option.getD_none] at named; exact .inl (.inl named)
  | some y =>
    cases called : y.calledInstance with
    | none => simp only [found, called, Option.bind_some, Option.getD_none] at named; exact .inl (.inl named)
    | some q =>
      simp only [found, called, Option.bind_some, Option.getD_some] at named
      exact .inl (.inr ⟨y, List.mem_of_find?_eq_some found, by rw [called, named]⟩)

/-- A scope occurrence's process instance is live. -/
theorem instanceLive_instanceOf (state : State) (scope : ScopeOccurrenceId) :
    instanceLive state (state.instanceOf scope) = true :=
  countLive_instanceOf state scope (count := { processInstance := state.instanceOf scope, element := default, role := .element, count := 0 }) rfl

/-- The slot a key counts under. -/
abbrev slotOf (key : OccurrenceKey) : ActivationSlot :=
  { processInstance := key.processInstanceId, element := key.element, role := key.role }

/-- A slot counted at least `n`, `n` positive, holds an entry of at least `n`. -/
theorem counted_of_count {u : State} {slot : ActivationSlot} {n : Nat} (positive : 0 < n) (below : n ≤ u.activationCount slot) :
    ∃ count ∈ u.activations, count.processInstance = slot.processInstance ∧ count.element = slot.element ∧
      count.role = slot.role ∧ n ≤ count.count := by
  simp only [State.activationCount] at below
  cases found : u.activations.find? (fun other => other.processInstance == slot.processInstance &&
      other.element == slot.element && other.role == slot.role) with
  | none => simp only [found, Option.map_none, Option.getD_none] at below; omega
  | some c =>
    have hit := List.find?_some found
    simp only [Bool.and_eq_true, beq_iff_eq] at hit
    simp only [found, Option.map_some, Option.getD_some] at below
    exact ⟨c, List.mem_of_find?_eq_some found, hit.1.1, hit.1.2, hit.2, below⟩

/-- The slot a key counts under once the commit resolves its process instance's name. -/
abbrev resolvedSlotOf (r : Issue → Issue) (key : OccurrenceKey) : ActivationSlot :=
  { processInstance := key.processInstanceId.rename r, element := key.element, role := key.role }

/-- A counted key's activation, as the commit renames it: a committed one, under a resolved name, stays at or below
`start`'s counter, a pending one takes an ordinal above the counter of its slot under the resolved name
(`assign_tookActivation`). `u` holds the counters, `s` the same issue table. -/
theorem renamed_cases {u : State} (counters : CountersFrom start u) (keyed : ActivationsKeyed u) (table : u.issued = s.issued)
    (slots : ∀ (issue : Issue) (slot : ActivationSlot), s.issued[issue]? = some (.activation slot) →
      NameTabled s slot.processInstance)
    {key : OccurrenceKey} (counted : Counted u key) :
    (∃ n, key.activation = .committed n ∧ key.processInstanceId.unresolved = false ∧
        n ≤ start.activationCount (slotOf key)) ∨
      (∃ unit index n, key.activation = .fresh unit index ∧
        s.issued[Issue.fresh unit index]? = some (.activation (slotOf key)) ∧
        (assign schedule start log s).1[Issue.fresh unit index]? = some n ∧
        start.activationCount (resolvedSlotOf (commitRenaming schedule start log s) key) < n) := by
  unfold Counted at counted
  split at counted
  · rename_i n activation
    obtain ⟨count, member, named, more⟩ := counted
    obtain ⟨elemented, roled, below⟩ := more
    refine .inl ⟨n, activation, named ▸ keyed.resolved count member, Nat.le_trans below (Nat.le_trans ?_ (counters.activations _))⟩
    have := le_activationCount keyed member
    rw [named, elemented, roled] at this
    exact this
  · rename_i unit index activation
    rw [table] at counted
    obtain ⟨n, m, took, more⟩ := assign_tookActivation (schedule := schedule) (start := start) (log := log) slots counted
    obtain ⟨-, base, -⟩ := more
    refine .inr ⟨unit, index, n, activation, counted, took, ?_⟩
    simp only [slotBase_eq] at base
    simp only [resolvedSlotOf]
    omega

/-- The commit resolves every name a tabled activation's slot holds. -/
theorem tabled_resolved (slots : ∀ (issue : Issue) (slot : ActivationSlot), s.issued[issue]? = some (.activation slot) →
      NameTabled s slot.processInstance)
    {issue : Issue} {slot : ActivationSlot} (held : s.issued[issue]? = some (.activation slot)) :
    (slot.processInstance.rename (commitRenaming schedule start log s)).unresolved = false :=
  (slots issue slot held).rename_resolved (fun n => commitRenaming_committed start log s n) fun activation claimed tabled => by
    obtain ⟨n, renamed⟩ := renamed_issue (schedule := schedule) (start := start) (log := log) (s := s)
      (issue := activation) fun unit index same => ⟨_, same ▸ tabled⟩
    rw [renamed]; exact isFresh_committed n

/-- **The commit's renaming keeps counted keys apart** (KD5), with no premise on the names: two keys it renames alike
share their element, role and resolved name; a committed activation, under a resolved name, stays at or below the
counter of that name's slot, a pending one takes an ordinal above it, and two pending ones of one resolved slot take
different ordinals (`assign_apartActivation`), so they are one issue, of one slot. -/
theorem renameKey_apart {u : State} (counters : CountersFrom start u) (keyed : ActivationsKeyed u) (table : u.issued = s.issued)
    (slots : ∀ (issue : Issue) (slot : ActivationSlot), s.issued[issue]? = some (.activation slot) →
      NameTabled s slot.processInstance)
    {a b : OccurrenceKey} (countedA : Counted u a) (countedB : Counted u b)
    (same : renameKey (commitRenaming schedule start log s) a = renameKey (commitRenaming schedule start log s) b) : a = b := by
  rw [renameKey_eq, renameKey_eq] at same
  have pi : a.processInstanceId.rename (commitRenaming schedule start log s) =
      b.processInstanceId.rename (commitRenaming schedule start log s) := by
    simpa using congrArg OccurrenceKey.processInstanceId same
  have el : a.element = b.element := by simpa using congrArg OccurrenceKey.element same
  have ro : a.role = b.role := by simpa using congrArg OccurrenceKey.role same
  have act : commitRenaming schedule start log s a.activation = commitRenaming schedule start log s b.activation := by
    simpa using congrArg OccurrenceKey.activation same
  have resolvedSame : resolvedSlotOf (commitRenaming schedule start log s) a =
      resolvedSlotOf (commitRenaming schedule start log s) b := by simp only [resolvedSlotOf, pi, el, ro]
  suffices parts : a.processInstanceId = b.processInstanceId ∧ a.activation = b.activation by
    cases a; cases b
    simp only [OccurrenceKey.mk.injEq]
    exact ⟨parts.1, el, parts.2, ro⟩
  simp only [commitRenaming] at act
  rcases renamed_cases (schedule := schedule) (log := log) counters keyed table slots countedA with
    ⟨n, ha, ra, la⟩ | ⟨ua, ia, n, ⟨ha, tabledA, tookA, aboveA⟩⟩ <;>
  rcases renamed_cases (schedule := schedule) (log := log) counters keyed table slots countedB with
    ⟨m, hb, rb, lb⟩ | ⟨ub, ib, m, ⟨hb, tabledB, tookB, aboveB⟩⟩
  · rw [rename_resolved _ ra, rename_resolved _ rb] at pi
    rw [ha, hb] at act ⊢
    exact ⟨pi, by simpa [renameBy_committed] using act⟩
  · rw [ha, hb, renameBy_committed, renameBy_fresh, tookB] at act
    simp only [Option.map_some, Option.getD_some, Issue.committed.injEq] at act
    have home : slotOf a = resolvedSlotOf (commitRenaming schedule start log s) a := by
      simp only [slotOf, resolvedSlotOf, rename_resolved _ ra]
    rw [home, resolvedSame] at la
    omega
  · rw [ha, hb, renameBy_committed, renameBy_fresh, tookA] at act
    simp only [Option.map_some, Option.getD_some, Issue.committed.injEq] at act
    have home : slotOf b = resolvedSlotOf (commitRenaming schedule start log s) b := by
      simp only [slotOf, resolvedSlotOf, rename_resolved _ rb]
    rw [home, ← resolvedSame] at lb
    omega
  · rw [ha, hb, renameBy_fresh, renameBy_fresh, tookA, tookB] at act
    simp only [Option.map_some, Option.getD_some, Issue.committed.injEq] at act
    have issues := assign_apartActivation (schedule := schedule) (start := start) (log := log) slots tabledA tabledB
      (by dsimp only; simp only [resolvedSlotOf] at resolvedSame; rw [resolvedSame])
      (by rw [tookA, tookB, act])
    rw [issues, tabledB] at tabledA
    have slotSame := (ClaimSlot.activation.inj (Option.some.inj tabledA)).symm
    exact ⟨by simpa [slotOf] using congrArg ActivationSlot.processInstance slotSame, by rw [ha, hb, issues]⟩

/-- Only a key itself renames onto a committed key under a resolved name at or below `start`'s counter, with no premise
on the counters of the state `u` that counts the renamed key: a committed activation stays under its resolved name, a
pending one takes an ordinal above `start`'s counter (`assign_tookActivation`). -/
theorem renameKey_onto_committed {u : State} (keyed : ActivationsKeyed u) (table : u.issued = s.issued)
    (slots : ∀ (issue : Issue) (slot : ActivationSlot), s.issued[issue]? = some (.activation slot) →
      NameTabled s slot.processInstance)
    {key target : OccurrenceKey} {m : Nat} (counted : Counted u key) (committed : target.activation = .committed m)
    (resolved : target.processInstanceId.unresolved = false) (below : m ≤ start.activationCount (slotOf target))
    (same : renameKey (commitRenaming schedule start log s) key = target) : key = target := by
  unfold Counted at counted
  split at counted
  · rename_i n activation
    obtain ⟨count, member, named, more⟩ := counted
    obtain ⟨-, -, -⟩ := more
    have fixed : renameKey (commitRenaming schedule start log s) key = key := by
      rw [renameKey_eq, rename_resolved _ (named ▸ keyed.resolved count member), activation]
      simp only [commitRenaming, renameBy_committed]
      rw [← activation]
    rw [← same, fixed]
  · rename_i unit index activation
    rw [table] at counted
    obtain ⟨n, _, took, more⟩ := assign_tookActivation (schedule := schedule) (start := start) (log := log) slots counted
    obtain ⟨-, base, -⟩ := more
    simp only [slotBase_eq] at base
    subst same
    simp only [renameKey_eq, activation, commitRenaming, renameBy_fresh, took, Option.map_some, Option.getD_some,
      Issue.committed.injEq] at committed
    simp only [slotOf, renameKey_eq] at below base
    omega

/-- **A counted key stays counted, renamed, across the commit** where its process instance stays live (K12g): a
committed activation under the raised counter, whose name is resolved (`ActivationsKeyed.resolved`), a pending one
under the slot's last ordinal and its name resolved (`advance_activation`). -/
theorem compact_counted (ran : compact schedule start log s = .ok t) (keyed : ActivationsKeyed s)
    (slots : ∀ (issue : Issue) (slot : ActivationSlot), s.issued[issue]? = some (.activation slot) →
      NameTabled s slot.processInstance) {k : OccurrenceKey}
    (live : instanceLive t (renameKey (commitRenaming schedule start log s) k).processInstanceId = true)
    (held : Counted s k) : Counted t (renameKey (commitRenaming schedule start log s) k) := by
  rcases compact_cases ran with ⟨empty, rfl⟩ | ⟨_, rfl⟩
  · have fixed : renameKey (commitRenaming schedule start log t) k = k := by
      simp [renameKey_eq, commitRenaming_empty (schedule := schedule) (start := start) (log := log) empty, rename_id (commitRenaming_empty (schedule := schedule) (start := start) (log := log) empty)]
    rw [fixed]; exact held
  have raised : ∀ slot, s.activationCount slot ≤ (compacted schedule start log s).activationCount slot := fun slot => by
    have up := (advance_raised (commitRenaming schedule start log s) (assign schedule start log s).2
      (renameState (commitRenaming schedule start log s) (commitPositioning schedule start log s) (commitRekey schedule start log s) s)).activations slot
    have keep : (renameState (commitRenaming schedule start log s) (commitPositioning schedule start log s)
        (commitRekey schedule start log s) s).activationCount slot = s.activationCount slot := by
      simp only [renameState_eq, State.activationCount]
    rw [keep] at up
    exact up
  have liveRenamed : instanceLive (renameState (commitRenaming schedule start log s) (commitPositioning schedule start log s)
      (commitRekey schedule start log s) s) (k.processInstanceId.rename (commitRenaming schedule start log s)) = true := by
    rw [← live]
    unfold compacted
    rw [advance_frame]
    simp only [instanceLive, State.scopes, renameKey_eq]
  rw [renameKey_eq]
  unfold Counted at held
  split at held
  · rename_i n activation
    obtain ⟨count, member, named, more⟩ := held
    obtain ⟨elemented, roled, below⟩ := more
    have fixed : k.processInstanceId.rename (commitRenaming schedule start log s) = k.processInstanceId :=
      rename_resolved _ (named ▸ keyed.resolved count member)
    have up := Nat.le_trans (le_activationCount keyed member) (raised _)
    obtain ⟨c, inside, cn, more⟩ := counted_of_count (keyed.positive count member) up
    obtain ⟨ce, cr, cc⟩ := more
    simp only [Counted, activation, renameBy_committed, commitRenaming, fixed]
    exact ⟨c, inside, by rw [cn, named], by rw [ce, elemented], by rw [cr, roled], Nat.le_trans below cc⟩
  · rename_i unit index activation
    obtain ⟨n, m, took, more⟩ := assign_tookActivation (schedule := schedule) (start := start) (log := log) slots held
    obtain ⟨next, base, high⟩ := more
    simp only [slotBase_eq] at base
    have twice : (k.processInstanceId.rename (commitRenaming schedule start log s)).rename (commitRenaming schedule start log s) =
        k.processInstanceId.rename (commitRenaming schedule start log s) :=
      rename_resolved _ (tabled_resolved (schedule := schedule) (start := start) (log := log) slots held)
    have reach := advance_activation (r := commitRenaming schedule start log s) next (by rw [twice]; exact liveRenamed)
    simp only [twice] at reach
    obtain ⟨c, inside, cn, more⟩ := counted_of_count (n := n) (u := compacted schedule start log s) (by omega)
      (Nat.le_trans (by omega) reach)
    obtain ⟨ce, cr, cc⟩ := more
    simp only [Counted, activation, renameBy_fresh, commitRenaming, took, Option.map_some, Option.getD_some]
    exact ⟨c, inside, cn, ce, cr, cc⟩

/-! ## The clauses over occurrence keys -/

/-- **`Distinct.keys` across the commit.** -/
theorem compact_keysDistinct {program : Program} {u : State} (ran : compact schedule start log s = .ok t)
    (counted : CountersFrom start s) (formed : WellFormed program u) (scopes : s.scopes = u.scopes)
    (named : s.instanceId = u.instanceId) (issued : IssuedBelow s) (owned : Owned s) (rooted : Rooted s)
    (distinct : Distinct s) (keyed : ActivationsKeyed s) (occurrences : OccurrencesCounted s) :
    (t.occurrences.map (key t)).Nodup := by
  have renamed : ∀ old ∈ s.occurrences,
      key t (renamedOccurrence (commitRenaming schedule start log s) (commitPositioning schedule start log s) (commitRekey schedule start log s) old) =
        renameKey (commitRenaming schedule start log s) (key s old) :=
    fun old inside => by
      simp only [key, renameKey_eq,
        compact_instanceOf ran counted formed scopes named issued rooted distinct.scopes (owned.occurrenceScopes old inside)]
  have nodup : t.occurrences.Nodup :=
    Keyed.nodup_of_map (key := Occurrence.id) (occurrenceList_nodup (compact_occurrencesKeyed ran distinct.occurrencesKeyed))
  unfold List.Nodup
  rw [List.pairwise_map]
  refine nodup.imp_of_mem fun {x y} xin yin differ same => differ ?_
  obtain ⟨ox, oxIn, rfl⟩ := compact_occurrenceRecord_of ran xin
  obtain ⟨oy, oyIn, rfl⟩ := compact_occurrenceRecord_of ran yin
  rw [renamed ox oxIn, renamed oy oyIn] at same
  have kept := renameKey_apart (schedule := schedule) (log := log) counted keyed rfl issued.slots (occurrences ox oxIn)
    (occurrences oy oyIn) same
  rw [nodup_map_eq distinct.keys oxIn oyIn kept]

/-- **`OccurrencesCounted` across the commit** (`occurrencesCounted`). -/
theorem compact_occurrencesCounted {program : Program} {u : State} (ran : compact schedule start log s = .ok t)
    (counted : CountersFrom start s) (formed : WellFormed program u) (scopes : s.scopes = u.scopes)
    (named : s.instanceId = u.instanceId) (issued : IssuedBelow s) (owned : Owned s) (rooted : Rooted s)
    (distinct : (scopeIds s).Nodup) (keyed : ActivationsKeyed s) (occurrences : OccurrencesCounted s) :
    OccurrencesCounted t := by
  intro occurrence member
  obtain ⟨old, inside, same, -⟩ := compact_key ran counted formed scopes named issued owned rooted distinct member
  rw [same]
  exact compact_counted ran keyed issued.slots (by rw [← same]; exact instanceLive_instanceOf t occurrence.scope)
    (occurrences old inside)

/-- **`ReservationsUnstarted` across the commit** (`reservations`). -/
theorem compact_reservations (ran : compact schedule start log s = .ok t) (none : starts s = []) :
    ReservationsUnstarted t := by
  intro occurrence member unbegun fact started
  have recorded : fact.occurrence ∈ (starts s).map (·.occurrence) := by
    rw [← compact_starts ran]; exact List.mem_map_of_mem (f := StartedFact.occurrence) started
  rw [none] at recorded; cases recorded

end Keys

/-! ## `WellFormed` across the commit -/

/-- The ordered state keeps one counter per process instance, element and role: its counters are some of the settled
state's. -/
theorem ordered_activations {log : RunLog} {state : State} (keyed : ActivationsKeyed state) :
    ActivationsKeyed (ordered log state) :=
  ⟨keyed.keys.sublist (List.filter_sublist.map _), fun count member => keyed.positive count (List.mem_filter.mp member).1,
    fun count member => keyed.resolved count (List.mem_filter.mp member).1⟩

/-- Every occurrence's activation stays counted in the ordered state: its counter names the process instance its scope
occurrence stands in, which the commit keeps (`countLive_instanceOf`). -/
theorem ordered_counted {log : RunLog} {state : State} (counted : OccurrencesCounted state) :
    ∀ occurrence ∈ state.occurrences, Counted (ordered log state) (key state occurrence) := by
  intro occurrence member
  have held := counted occurrence member
  cases activation : occurrence.activation with
  | committed n =>
    simp only [Counted, key, activation] at held ⊢
    obtain ⟨count, held, rest⟩ := held
    exact ⟨count, List.mem_filter.mpr ⟨held, countLive_instanceOf state occurrence.scope rest.1⟩, rest⟩
  | fresh unit index => simp only [Counted, key, activation] at held ⊢; exact held

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
  have none : starts (ordered log state) = [] := by simp [starts]
  have once : StartedOnce (ordered log state) := by simp [StartedOnce, none]
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
    distinct := ⟨compact_occurrencesKeyed ran distinct.occurrencesKeyed,
      compact_keyed ran distinct.items, compact_scopesKeyed ran distinct.scopesKeyed,
      compact_keysDistinct ran counted formed rfl rfl issued owned rooted distinct (ordered_activations formed.activations)
        fun occurrence member => by rw [keyed]; exact ordered_counted formed.occurrencesCounted occurrence member⟩
    startedOnce := compact_startedOnce ran once
    activations := compact_activations ran (ordered_activations formed.activations) issued
    reservations := compact_reservations ran none
    owned := compact_owned ran (occurrences_apart counted issued owned rooted keys distinct.occurrencesKeyed) owned quiet.2
    rooted := compact_rooted ran issued rooted
    failure := compact_failure ran formed.failure
    queue := quiet_queueSound quiet.1
    counted := compact_startsCounted ran none
    occurrencesCounted := compact_occurrencesCounted ran counted formed rfl rfl issued owned rooted distinct.scopes
      (ordered_activations formed.activations)
      fun occurrence member => by rw [keyed]; exact ordered_counted formed.occurrencesCounted occurrence member
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

/-- **A committed input's journal starts each occurrence key once**: it holds the closure's start facts in run order,
which `StartedOnce` keeps distinct, while the counters of the instances the closure left no longer bound them (DC24). -/
theorem orderJournal_journalOnce {program : Program} {start state : State} {log : RunLog} {after : State}
    (formed : WellFormed program state) (counters : CountersFrom start state)
    (made : orderJournal schedule start (.ok (state, log)) = .ok after) :
    ((after.journal.flatMap (·.started)).map (·.occurrence)).Nodup := by
  rw [compact_journalStarts (orderJournal_of made)]
  have once := formed.startedOnce
  simp only [StartedOnce, starts, List.map_append] at once
  have base := (((byRun_perm log state.transitions).flatMap_right (·.started)).map (·.occurrence)).nodup_iff.mpr
    (List.nodup_append.mp once).1
  have counted : ∀ x ∈ ((byRun log state.transitions).flatMap (·.started)).map (·.occurrence), Counted state x := by
    intro x inside
    obtain ⟨fact, factIn, rfl⟩ := List.mem_map.mp inside
    exact formed.counted fact (List.mem_append_left _
      (((byRun_perm log state.transitions).flatMap_right (·.started)).mem_iff.mp factIn))
  rw [show (fun fact : StartedFact => renameKey (commitRenaming schedule start log (ordered log state)) fact.occurrence) =
      renameKey (commitRenaming schedule start log (ordered log state)) ∘ (·.occurrence) from rfl, ← List.map_map]
  unfold List.Nodup
  rw [List.pairwise_map]
  exact base.imp_of_mem fun {x y} xIn yIn apart same =>
    apart (renameKey_apart (schedule := schedule) (log := log) (u := state) (s := ordered log state) counters formed.activations rfl
      (fun issue slot held => NameTabled.grow (s := state) (t := ordered log state) (fun _ _ kept => kept)
        (formed.issued.slots issue slot held)) (counted x xIn) (counted y yIn) same)

end Kernel.Laws.Step
