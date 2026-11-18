module

public import Kernel.Proofs.Compensation.Relation

/-! # Proofs: the Compensation lane relation carried by the state operations

What the state operations the hooks apply and `Step`'s phases keep of the lane relation `Formed` beside
`Laws.State.WellFormed` (`Proofs.Frame.FrameAlongside`, `Alongside`, `OccursAlongside`, `StepAlongside`, and the
completion pipeline's phases). Its read set is the compensation slot, the issue and activation counters, the scope
occurrences with their process instances, the unbegun occurrences' keys, and the queued compensations' triggers and
resumes and Cancel raises' origins. Every operation here keeps the compensation slot or keeps a sublist of its records
and runs, issues only upward, counts only upward, keeps the process instance of every issued scope occurrence that
stands and reserves only at a fresh activation (`ReservesFresh`), so `Formed` carries over (`Formed.shrink`): the
queued triggers it names then shrink too, as a queued Cancel raise's scope occurrence was issued
(`TriggersApart.issued`). A throw's trigger is fresh (`thrower_fresh`), so its compensation and raise keep `Formed`
with no premise beyond the record's (`formed_occursAlongside`). The compensation
hooks themselves store runs and are proved directly (`Proofs.Step.CompensationKeeps`). It reads no feature, so it lies
in no feature's rebuild cone (guard 15). Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Proofs.Compensation

open Kernel
open Kernel.Laws.State (WellFormed scopeIds Counted)
open Kernel.Proofs.Frame (FrameAlongside OccursAlongside StepAlongside ClosureAlongside Alongside Unmoved)

/-! ## Carrying the relation -/

/-- The completion numbers of a sublist of records are a sublist of theirs. -/
theorem completionsIn_sublist {first second : List Compensable} (fewer : first.Sublist second) :
    (completionsIn first).Sublist (completionsIn second) := by
  induction fewer with
  | slnil => exact .refl _
  | cons record _ ih =>
    simp only [completionsIn]
    exact ih.trans (List.sublist_append_right _ _)
  | cons_cons record _ ih =>
    simp only [completionsIn]
    exact ih.append_left _

/-- A flat map over a sublist is a sublist of the flat map. -/
theorem flatMap_sublist {α β : Type} (f : α → List β) {first second : List α} (fewer : first.Sublist second) :
    (first.flatMap f).Sublist (second.flatMap f) := by
  induction fewer with
  | slnil => exact .refl _
  | cons a _ ih =>
    simp only [List.flatMap_cons]
    exact ih.trans (List.sublist_append_right _ _)
  | cons_cons a _ ih =>
    simp only [List.flatMap_cons]
    exact ih.append_left _

/-- Filtering by a map that agrees with another wherever it keeps something keeps a sublist. -/
theorem filterMap_sublist_of {α β : Type} {f g : α → Option β} :
    ∀ {items : List α}, (∀ a ∈ items, f a = g a ∨ f a = none) → (items.filterMap f).Sublist (items.filterMap g)
  | [], _ => .refl _
  | a :: rest, agree => by
    have tail := filterMap_sublist_of (f := f) (g := g) fun b inside => agree b (List.mem_cons_of_mem _ inside)
    rcases agree a (List.mem_cons_self ..) with same | dropped
    · simp only [List.filterMap_cons, same]
      split
      · exact tail
      · exact tail.cons_cons _
    · simp only [List.filterMap_cons, dropped]
      split
      · exact tail
      · exact tail.cons _

/-- The completions of a slot whose records and runs are sublists of another's are a sublist of its. -/
theorem completions_sublist {before after : Compensations} (retained : after.retained.Sublist before.retained)
    (runs : after.runs.Sublist before.runs) : (completions after).Sublist (completions before) :=
  (completionsIn_sublist retained).append (flatMap_sublist _ runs)

/-- Every unbegun occurrence of `t` is one of `s`, unbegun under the same key, or carries a key no counter of `s` has
reached: what a change must keep for no held trigger to name a reservation (`TriggersApart.unreserved`). -/
def ReservesFresh (s t : State) : Prop :=
  ∀ o ∈ t.occurrences, o.begun = false →
    (∃ old ∈ s.occurrences, old.begun = false ∧ Laws.State.key t o = Laws.State.key s old) ∨
      ∀ key, Counted s key → key ≠ Laws.State.key t o

/-- A change that keeps a subset of the occurrences, each in its process instance, makes no reservation. -/
theorem ReservesFresh.sub {s t : State} (occurrences : ∀ o ∈ t.occurrences, o ∈ s.occurrences)
    (instances : ∀ o ∈ t.occurrences, t.instanceOf o.scope = s.instanceOf o.scope) : ReservesFresh s t :=
  fun o inside unbegun => .inl ⟨o, occurrences o inside, unbegun, by simp [Laws.State.key, instances o inside]⟩

/-- So does one that keeps a subset of the occurrences, the scope occurrences and the instance identity. -/
theorem ReservesFresh.same {s t : State} (occurrences : ∀ o ∈ t.occurrences, o ∈ s.occurrences)
    (scopes : t.scopes = s.scopes) (instanceId : t.instanceId = s.instanceId) : ReservesFresh s t :=
  .sub occurrences fun o _ => Laws.State.instanceOf_congr scopes instanceId o.scope

/-- `Formed` carries over to a state that keeps a sublist of the slot's records and runs, issues and counts only
upward, keeps every issued scope occurrence that stands standing in its process instance, keeps its retained records
in scope occurrences that stand, queues the same triggers and resumes, and makes no reservation but at a fresh
activation. -/
theorem Formed.shrink {precedes : Compensable → Compensable → Prop} {s t : State} (formed : Formed precedes s)
    (scopes : ∀ x ∈ scopeIds t, Laws.State.ScopeIssued s x → x ∈ scopeIds s ∧ t.instanceOf x = s.instanceOf x)
    (issued : s.nextPosition ≤ t.nextPosition) (grows : Laws.State.ScopeGrows s t)
    (counted : ∀ key, Counted s key → Counted t key)
    (retained : t.slots.compensation.retained.Sublist s.slots.compensation.retained)
    (runs : t.slots.compensation.runs.Sublist s.slots.compensation.runs) (present : RetainedPresent t)
    (triggers : (Laws.Step.triggersOf t.signals).Sublist (Laws.Step.triggersOf s.signals))
    (resumes : ∀ resume ∈ Laws.Step.resumesOf t.signals, resume ∈ Laws.Step.resumesOf s.signals)
    (reserves : ReservesFresh s t) : Formed precedes t := by
  have queued : (queuedTriggers t).Sublist (queuedTriggers s) := by
    unfold queuedTriggers
    refine List.Sublist.trans (filterMap_sublist_of fun held inside => ?_) (triggers.filterMap _)
    rcases held with trigger | origin
    · exact .inl rfl
    · have below := formed.triggers.issued origin (triggers.subset inside)
      unfold queuedTrigger
      by_cases stands : origin.scope ∈ scopeIds t
      · obtain ⟨was, same⟩ := scopes _ stands below
        exact .inl (by simp [stands, was, same])
      · exact .inr (by simp [stands])
  have completed := completions_sublist retained runs
  refine ⟨fun run member record claimed held => formed.claims run (runs.subset member) record claimed
      (retained.subset held), present, fun run member => formed.unfinished run (runs.subset member),
    formed.completions.sublist completed,
    fun completion member => Nat.lt_of_lt_of_le (formed.issued completion (completed.subset member)) issued,
    fun run member => formed.settled run (runs.subset member), formed.keyed.sublist (runs.map _),
    fun run member => grows.issued (formed.runsIssued run (runs.subset member)), ?_, ?_⟩
  · refine ⟨formed.triggers.apart.sublist (((runs.filter _).map _).append queued), fun run member grouped held =>
      formed.triggers.grouped run (runs.subset member) grouped (queued.subset held), fun trigger member => ?_,
      fun origin inside => ?_, fun o inside unbegun trigger member => ?_⟩
    · exact counted _ (formed.triggers.counted trigger ((((runs.map _).append queued)).subset member))
    · exact grows.issued (formed.triggers.issued origin (triggers.subset inside))
    · have held := ((runs.map _).append queued).subset member
      rcases reserves o inside unbegun with ⟨prior, was, waiting, same⟩ | fresh
      · rw [same]
        exact formed.triggers.unreserved prior was waiting trigger held
      · exact fresh _ (formed.triggers.counted trigger held)
  · intro scope activity trigger leave resume member
    obtain ⟨scope', activity', trigger', rest⟩ :=
      Laws.Step.mem_resumesOf.mp (resumes _ (Laws.Step.mem_resumesOf.mpr ⟨scope, activity, trigger, leave, member⟩))
    obtain ⟨leave', inside⟩ := rest
    exact formed.ungrouped scope' activity' trigger' leave' resume inside

/-- `Formed` reads nothing an `Unmoved` change moves. -/
theorem Formed.unmoved {precedes : Compensable → Compensable → Prop} {s t : State} (formed : Formed precedes s)
    (moved : Unmoved s t) : Formed precedes t :=
  formed.shrink (fun x present _ => ⟨by rwa [scopeIds, moved.scopes] at present,
      Laws.State.instanceOf_congr moved.scopes moved.instanceId x⟩)
    (Nat.le_of_eq moved.nextPosition.symm) (.of_same (congrArg (List.map ScopeOccurrence.id) moved.scopes) moved.scopeOrdinals)
    (fun _ held => Laws.State.Counted.congr moved.activations held)
    (by rw [moved.compensation]; exact .refl _) (by rw [moved.compensation]; exact .refl _)
    (fun record member => by
      rw [moved.compensation] at member
      have stands := formed.retained record member
      rwa [scopeIds, ← moved.scopes] at stands)
    (by rw [moved.triggers]; exact .refl _) (fun _ inside => moved.resumes ▸ inside)
    (.same (fun _ inside => by rwa [moved.occurrences] at inside) moved.scopes moved.instanceId)

/-- `Formed` carries over to a state that keeps the slot, the counts, the scope occurrences and the instance identity,
issues only upward and keeps a sublist of the queue. -/
theorem Formed.same {precedes : Compensable → Compensable → Prop} {s t : State} (formed : Formed precedes s)
    (scopes : t.scopes = s.scopes) (instanceId : t.instanceId = s.instanceId) (issued : s.nextPosition ≤ t.nextPosition)
    (activations : t.activations = s.activations) (compensation : t.slots.compensation = s.slots.compensation)
    (signals : t.signals.Sublist s.signals)
    (occurrences : ∀ o ∈ t.occurrences, o ∈ s.occurrences := by exact fun _ held => held)
    (ordinals : t.scopeOrdinals = s.scopeOrdinals := by exact rfl) : Formed precedes t := by
  have ids : scopeIds t = scopeIds s := by rw [scopeIds, scopes]; rfl
  refine formed.shrink (fun x present _ => ⟨ids ▸ present, Laws.State.instanceOf_congr scopes instanceId x⟩) issued
    (.of_same (congrArg (List.map ScopeOccurrence.id) scopes) ordinals)
    (fun _ held => Laws.State.Counted.congr activations held) (by rw [compensation]; exact .refl _)
    (by rw [compensation]; exact .refl _) (fun record member => ?_) (Laws.Step.triggersOf_sublist signals)
    (fun _ inside => (Laws.Step.resumesOf_sublist signals).subset inside) (.same occurrences scopes instanceId)
  rw [compensation] at member
  exact ids ▸ formed.retained record member

/-- A queued signal that carries no trigger and no resume keeps `Formed`. -/
theorem Formed.signal {precedes : Compensable → Compensable → Prop} {s : State} (formed : Formed precedes s)
    (signal : Signal) (triggers : Laws.Step.triggersOf [signal] = [] := by exact rfl)
    (resumes : Laws.Step.resumesOf [signal] = [] := by exact rfl) : Formed precedes (s.signal signal) := by
  rw [Laws.State.signal_eq]
  refine formed.shrink (fun x present _ => ⟨present, Laws.State.instanceOf_congr (s := s)
      (t := { s with signals := s.signals ++ [signal] }) rfl rfl x⟩) (Nat.le_refl _) (.refl _)
    (fun _ held => held) (.refl _) (.refl _) formed.retained ?_ (fun resume inside => ?_)
    (.same (fun _ held => held) rfl rfl)
  · rw [Laws.Step.triggersOf_append, triggers, List.append_nil]
    exact .refl _
  · rwa [Laws.Step.resumesOf_append, resumes, List.append_nil] at inside

/-- Entering a scope occurrence under a fresh key, below a parent, keeps `Formed` when it keeps the slot, the counts,
the instance identity and the queue: no queued Cancel raise names the new key, never issued before, and the others
keep their process instances. -/
theorem Formed.enter {precedes : Compensable → Compensable → Prop} {program : Program} {s t : State}
    {entry : ScopeOccurrence} (formed : Formed precedes s) (well : WellFormed program s)
    (scopes : t.scopes = s.scopes ++ [entry]) (fresh : Laws.State.ScopeFresh s t entry.id) (placed : entry.parent.isSome)
    (nextPosition : t.nextPosition = s.nextPosition) (activations : t.activations = s.activations)
    (instanceId : t.instanceId = s.instanceId) (compensation : t.slots.compensation = s.slots.compensation)
    (signals : t.signals = s.signals) (occurrences : t.occurrences = s.occurrences) : Formed precedes t := by
  have ids : scopeIds t = scopeIds s ++ [entry.id] := by simp [scopeIds, scopes]
  have nodup : (scopeIds t).Nodup := by
    rw [ids]
    refine List.nodup_append.mpr ⟨well.distinct.scopes, List.nodup_cons.mpr ⟨by simp, .nil⟩, fun x inside y new same => ?_⟩
    obtain ⟨old, member, rfl⟩ := List.mem_map.mp inside
    rw [List.mem_singleton.mp new] at same
    exact fresh.1 (same ▸ well.issued.scopes old member)
  have parentless : ∀ other ∈ t.scopes, other.parent = none → other.id = State.root := fun other member orphan => by
    rw [scopes] at member
    rcases List.mem_append.mp member with old | new
    · exact (well.rooted.2.1 other old).mp orphan
    · obtain rfl := List.mem_singleton.mp new
      rw [orphan] at placed
      cases placed
  have keptIn : ∀ x ∈ scopeIds s, t.instanceOf x = s.instanceOf x := fun x old =>
    Laws.State.instanceOf_kept well nodup parentless instanceId old fun other member _ => by
      rw [scopes]; exact List.mem_append_left _ member
  refine formed.shrink (fun x present below => ?_) (Nat.le_of_eq nextPosition.symm) fresh.2.2
    (fun _ held => Laws.State.Counted.congr activations held)
    (by rw [compensation]; exact .refl _) (by rw [compensation]; exact .refl _) (fun record member => ?_)
    (by rw [signals]; exact .refl _) (fun _ inside => signals ▸ inside)
    (.sub (fun _ inside => occurrences ▸ inside) fun o inside =>
      keptIn _ (well.owned.occurrenceScopes o (occurrences ▸ inside)))
  · have old : x ∈ scopeIds s := by
      rw [ids] at present
      rcases List.mem_append.mp present with old | new
      · exact old
      · rw [List.mem_singleton.mp new] at below
        exact absurd below fresh.1
    exact ⟨old, keptIn x old⟩
  · rw [compensation] at member
    rw [ids]
    exact List.mem_append_left _ (formed.retained record member)

/-- A reservation keeps `Formed`: it changes only the occurrences, the counter of its key and the issue counter. -/
theorem Formed.reserve {precedes : Compensable → Compensable → Prop} {program : Program} {s : State}
    (formed : Formed precedes s) (well : WellFormed program s) (element : ElementId) (scope : ScopeOccurrenceId) :
    Formed precedes (s.reserve element scope).1 := by
  have made := Laws.State.reserve_reserves s element scope
  refine formed.shrink (fun x present _ => ⟨by rwa [scopeIds, made.scopes] at present, made.instances x⟩) (Nat.le_of_eq ((Laws.State.positions_kept s).1 element scope).symm)
    (.of_same (congrArg (List.map ScopeOccurrence.id) made.scopes) made.scopeOrdinals) (fun _ held => (made.activated well.activations).counted held) (by rw [made.slots]; exact .refl _)
    (by rw [made.slots]; exact .refl _) (fun record member => ?_) (by rw [made.signals]; exact .refl _)
    (fun _ inside => made.signals ▸ inside) (fun o inside unbegun => ?_)
  rotate_left
  · rw [made.occurrences] at inside
    rcases List.mem_append.mp inside with old | fresh
    · exact .inl ⟨o, old, unbegun, by simp [Laws.State.key, made.instances]⟩
    · obtain rfl := List.mem_singleton.mp fresh
      refine .inr fun key counted => ?_
      have apart := (made.activated well.activations).fresh counted
      rwa [Laws.State.key, made.instances, made.placed, made.kind, made.role]
  rw [made.slots] at member
  have stands := formed.retained record member
  rwa [scopeIds, ← made.scopes] at stands

/-- A retained record outside the subtree a removal drops stands where it stood: the scope occurrence it lies in lies
outside that subtree. -/
theorem retained_outside {program : Program} {s : State} (well : WellFormed program s) {scope : ScopeOccurrenceId}
    (present : scope ∈ scopeIds s) {x : ScopeOccurrenceId} (outside : !(s.subtree scope).contains x = true) :
    ¬ Laws.State.Within s x scope := fun within => by
  have inside := (Laws.State.subtree_iff well present x).mpr within
  simp [inside] at outside

/-- Leaving a scope occurrence that stands keeps `Formed`: the slot keeps a sublist of its records and runs, those that
stay lie outside the left subtree, and every scope occurrence that stays keeps its process instance. -/
theorem Formed.leaveScope {precedes : Compensable → Compensable → Prop} {program : Program} {s : State}
    {scope : ScopeOccurrenceId} (formed : Formed precedes s) (well : WellFormed program s)
    (present : scope ∈ scopeIds s) : Formed precedes (s.leaveScope scope) := by
  have left := Laws.State.leaveScope_left well present
  obtain ⟨retained, runs, -⟩ := Laws.State.leaveScope_compensation s scope
  have kept : ∀ x ∈ scopeIds (s.leaveScope scope), x ∈ scopeIds s := fun x inside => by
    obtain ⟨entry, member, rfl⟩ := List.mem_map.mp inside
    exact List.mem_map.mpr ⟨entry, ((left.scopes entry).mp member).1, rfl⟩
  refine formed.shrink (fun x inside _ => ⟨kept x inside, left.instances x inside⟩) (Nat.le_of_eq (Laws.State.leaveScope_compensation s scope).2.2.2.2.symm) left.scopeGrows
    (fun _ held => Laws.State.Counted.congr left.activations held)
    (by rw [retained]; exact List.filter_sublist.trans List.filter_sublist) (by rw [runs]; exact List.filter_sublist)
    (fun record member => ?_) (by rw [left.signals]; exact .refl _) (fun _ inside => left.signals ▸ inside)
    (.sub (fun o inside => ((left.occurrences o).mp inside).1) fun o inside => ?_)
  rotate_left
  · obtain ⟨was, outside⟩ := (left.occurrences o).mp inside
    obtain ⟨entry, member, named⟩ := List.mem_map.mp (well.owned.occurrenceScopes o was)
    refine left.instances _ (List.mem_map.mpr ⟨entry, (left.scopes entry).mpr ⟨member, ?_⟩, named⟩)
    rwa [named]
  rw [retained] at member
  obtain ⟨member, other⟩ := List.mem_filter.mp member
  obtain ⟨member, unnested⟩ := List.mem_filter.mp member
  obtain ⟨entry, stands, named⟩ := List.mem_map.mp (formed.retained record member)
  refine List.mem_map.mpr ⟨entry, (left.scopes entry).mpr ⟨stands, fun within => ?_⟩, named⟩
  have inside := (Laws.State.subtree_iff well present _).mpr within
  have distinct : entry.id ≠ scope := fun same => by simp [← named, same] at other
  rw [← named] at unnested
  simp [inside, distinct] at unnested

/-- Clearing a scope occurrence that stands keeps `Formed`: the slot keeps a sublist of its records and runs, those
that stay lie in no scope occurrence strictly within the cleared one, and every scope occurrence that stays keeps its
process instance. -/
theorem Formed.clearInside {precedes : Compensable → Compensable → Prop} {program : Program} {s : State}
    {scope : ScopeOccurrenceId} (formed : Formed precedes s) (well : WellFormed program s)
    (present : scope ∈ scopeIds s) (keep : List OccurrenceId)
    (housed : ∀ o ∈ s.occurrences, o.id ∈ keep → ¬ Laws.State.StrictlyWithin s o.scope scope) :
    Formed precedes (s.clearInside scope keep) := by
  have cleared := Laws.State.clearInside_cleared well present keep
  have slot := Laws.State.clearInside_compensation s scope keep
  have kept : ∀ x ∈ scopeIds (s.clearInside scope keep), x ∈ scopeIds s := fun x inside => by
    obtain ⟨entry, member, rfl⟩ := List.mem_map.mp inside
    exact List.mem_map.mpr ⟨entry, ((cleared.scopes entry).mp member).1, rfl⟩
  refine formed.shrink (fun x inside _ => ⟨kept x inside, cleared.instances x inside⟩)
    (Nat.le_of_eq (Laws.State.clearInside_shrinks s scope keep).2.symm) cleared.scopeGrows
    (fun _ held => Laws.State.Counted.congr cleared.activations held)
    (by rw [slot]; exact List.filter_sublist) (by rw [slot]; exact List.filter_sublist) (fun record member => ?_)
    (by rw [cleared.signals]; exact .refl _) (fun _ inside => cleared.signals ▸ inside)
    (.sub (fun o inside => ((cleared.occurrences o).mp inside).1) fun o inside => ?_)
  rotate_left
  · obtain ⟨was, outside⟩ := (cleared.occurrences o).mp inside
    obtain ⟨entry, member, named⟩ := List.mem_map.mp (well.owned.occurrenceScopes o was)
    refine cleared.instances _ (List.mem_map.mpr ⟨entry, (cleared.scopes entry).mpr ⟨member, fun strictly => ?_⟩, named⟩)
    rw [named] at strictly
    rcases outside with away | kept
    · exact away strictly.1
    · exact housed o was kept strictly
  rw [slot] at member
  obtain ⟨member, unnested⟩ := List.mem_filter.mp member
  obtain ⟨entry, stands, named⟩ := List.mem_map.mp (formed.retained record member)
  refine List.mem_map.mpr ⟨entry, (cleared.scopes entry).mpr ⟨stands, fun strictly => ?_⟩, named⟩
  have inside := (Laws.State.subtree_iff well present _).mpr strictly.1
  rw [← named] at unnested
  simp [inside, strictly.2] at unnested

/-! ## The frame -/

/-- The state operations the hooks apply keep `Formed`. -/
theorem formed_frameAlongside (precedes : Compensable → Compensable → Prop) (program : Program) :
    FrameAlongside program (Formed precedes) where
  frame _ _ moved kept := kept.unmoved moved
  emit s _ _ _ _ _ kept := by
    rw [Laws.State.emit_eq]
    exact kept.same rfl rfl (Nat.le_refl _) rfl rfl (.refl _)
  complete _ _ _ _ _ _ kept := kept.signal _
  park _ _ _ _ kept := kept.same rfl rfl (Nat.le_refl _) rfl rfl (.refl _)
  arm _ _ _ _ _ _ kept := kept.signal _
  armGateway _ _ _ _ _ _ _ kept := kept.signal _
  raise _ _ _ _ cancel _ kept := kept.signal _ (by rw [Laws.Step.triggersOf_raise, cancel]; rfl)
  signalBegin _ _ _ _ _ kept := kept.signal _
  takePosition s kept := by
    rw [Laws.State.takePosition_eq]
    exact kept.same rfl rfl (Nat.le_succ _) rfl rfl (.refl _)
  enterScope s element parent locals owner well stands _ kept := by
    have fresh := Laws.State.enterScope_fresh well.historic element stands locals owner
    rw [Laws.State.enterScope_eq] at fresh ⊢
    exact kept.enter well rfl fresh rfl rfl rfl rfl rfl rfl rfl
  reserve s element scope well _ _ _ kept := kept.reserve well element scope
  leaveScope _ _ well present _ kept := kept.leaveScope well present
  clearInside _ _ keep well present housed kept := kept.clearInside well present keep housed
  disarm s host _ kept := by
    rw [Laws.State.disarm_eq]
    exact kept.same rfl rfl (Nat.le_refl _) rfl rfl (.refl _) fun _ inside => (List.mem_filter.mp inside).1
  setVariable s target name value _ kept :=
    have same := Laws.State.setVariable_same s target name value
    kept.same same.scopes same.instanceId (Nat.le_of_eq ((Laws.State.positions_kept s).2.2.2.1 target name value).symm) same.activations (congrArg (·.compensation) same.slots)
      (by rw [same.signals]; exact .refl _) (fun _ inside => by rwa [same.occurrences] at inside) same.scopeOrdinals
  removeVariable s target name _ kept :=
    have same := Laws.State.removeVariable_same s target name
    kept.same same.scopes same.instanceId (Nat.le_of_eq ((Laws.State.positions_kept s).2.2.2.2 target name).symm) same.activations (congrArg (·.compensation) same.slots)
      (by rw [same.signals]; exact .refl _) (fun _ inside => by rwa [same.occurrences] at inside) same.scopeOrdinals

/-- Dropping an occurrence record keeps `Formed`: it reads no occurrence but the unbegun ones it keeps apart. -/
theorem Formed.withoutRecord {precedes : Compensable → Compensable → Prop} {s : State} (formed : Formed precedes s)
    (id : OccurrenceId) : Formed precedes (Laws.State.withoutRecord s id) :=
  formed.same rfl rfl (Nat.le_refl _) rfl rfl (.refl _) fun _ inside => by
    simp only [Laws.State.withoutRecord, List.mem_filter] at inside
    exact inside.1

/-- `Step`'s own phases keep `Formed`: journalling, taking signals and tokens off, beginning, cancelling and ordering
the journal change nothing it reads but the queue, which they shorten, and a begin's counters, which grow. -/
theorem formed_stepAlongside (precedes : Compensable → Compensable → Prop) (program : Program) :
    StepAlongside program (Formed precedes) where
  toFrameAlongside := formed_frameAlongside precedes program
  journal _ _ _ kept _ _ := kept.same rfl rfl (Nat.le_refl _) rfl rfl (.refl _)
  runOrder _ _ kept := kept.same rfl rfl (Nat.le_refl _) rfl rfl (.refl _)
  dequeue _ _ _ fewer kept := kept.same rfl rfl (Nat.le_refl _) rfl rfl fewer
  untoken _ _ _ _ kept := kept.same rfl rfl (Nat.le_refl _) rfl rfl (.refl _)
  begin s request role sourceType well _ _ _ _ kept := by
    have begins := Laws.State.beginOccurrence_begins well.activations request role sourceType
    have counters : ∀ key, Counted s key → Counted (s.beginOccurrence request role sourceType).1 key := by
      rcases begins.source with ⟨_, reserved⟩ | issued
      · exact fun _ held => Laws.State.Counted.congr reserved.activations held
      · exact fun _ held => issued.activated.counted held
    refine kept.shrink (fun x present _ => ⟨by rwa [scopeIds, begins.scopes] at present, begins.instances x⟩)
      (Nat.le_of_eq ((Laws.State.positions_kept s).2.1 request role sourceType).symm)
      (.of_same (congrArg (List.map ScopeOccurrence.id) begins.scopes) begins.scopeOrdinals) counters (by rw [begins.slots]; exact .refl _) (by rw [begins.slots]; exact .refl _)
      (fun record member => ?_) (by rw [begins.signals]; exact .refl _) (fun _ inside => begins.signals ▸ inside)
      (fun o inside unbegun => ?_)
    rotate_left
    · rw [begins.occurrences] at inside
      rcases List.mem_append.mp inside with old | begun
      · exact .inl ⟨o, (List.mem_filter.mp old).1, unbegun, by simp [Laws.State.key, begins.instances]⟩
      · rw [List.mem_singleton.mp begun, begins.isBegun] at unbegun
        cases unbegun
    rw [begins.slots] at member
    have stands := kept.retained record member
    rwa [scopeIds, ← begins.scopes] at stands
  cancel s id well kept := (formed_frameAlongside precedes program).cancelOccurrence (fun _ id _ held => held.withoutRecord id)
    (fun _ _ _ held => held.same rfl rfl (Nat.le_refl _) rfl rfl (.refl _)) (id := id) well kept

/-- The Multi-Instance record's operations keep `Formed`: an instance's begin and the deferred begins queue no trigger,
an instance's scope occurrence is left as any that stands, and the Multi-Instance runs are no part of what it reads. -/
theorem formed_alongside (precedes : Compensable → Compensable → Prop) (program : Program) :
    Alongside program (Formed precedes) where
  toFrameAlongside := formed_frameAlongside precedes program
  instanceBegin _ _ _ _ kept := kept.signal _
  defer s requests _ _ kept := by
    rw [Laws.State.deferBegins_eq]
    exact kept.same rfl rfl (Nat.le_refl _) rfl rfl (.refl _)
  leaveInstance _ _ _ well _ _ present kept := kept.leaveScope well present
  runs _ _ _ _ kept := kept.same rfl rfl (Nat.le_refl _) rfl rfl (.refl _)

/-- The completion pipeline's own phases keep `Formed` beside `WellFormed` where they keep `WellFormed`: starting a
reservation begins it under its key and closing its items moves nothing `Formed` reads, removing an occurrence leaves
the scope occurrences it owns and drops its record (`Proofs.Frame.FrameAlongside.removeOccurrence`), and journalling an
end moves nothing it reads. -/
theorem formed_pipelinePhases (precedes : Program → Compensable → Compensable → Prop)
    (pipeline : Laws.Step.PipelinePhases WellFormed) :
    Laws.Step.PipelinePhases fun program s => WellFormed program s ∧ Formed (precedes program) s where
  startReserved program s occurrence sourceType holds member unnamed := by
    refine ⟨pipeline.startReserved _ _ occurrence sourceType holds.1 member unnamed, ?_⟩
    have started : Formed (precedes program) (s.startReserved occurrence sourceType).1 := by
      cases begun : occurrence.begun
      · have starts := Laws.State.startReserved_starts s sourceType begun
        refine holds.2.shrink (fun x present _ => ⟨by rwa [scopeIds, starts.scopes] at present, starts.instances x⟩)
          (Nat.le_of_eq ((Laws.State.positions_kept s).2.2.1 occurrence sourceType).symm) (.of_same (congrArg (List.map ScopeOccurrence.id) starts.scopes) starts.scopeOrdinals)
          (fun _ held => Laws.State.Counted.congr starts.activations held)
          (by rw [starts.slots]; exact .refl _) (by rw [starts.slots]; exact .refl _) (fun record inside => ?_)
          (by rw [starts.signals]; exact .refl _) (fun _ inside => starts.signals ▸ inside) (fun o inside unbegun => ?_)
        · rw [starts.slots] at inside
          have stands := holds.2.retained record inside
          rwa [scopeIds, ← starts.scopes] at stands
        · rw [starts.occurrences] at inside
          obtain ⟨other, was, made⟩ := List.mem_map.mp inside
          by_cases same : other.id = occurrence.id
          · simp only [same, ↓reduceIte] at made
            rw [← made] at unbegun
            cases unbegun
          · simp only [same, ↓reduceIte] at made
            subst made
            exact .inl ⟨other, was, unbegun, by simp [Laws.State.key, starts.instances]⟩
      · rw [Laws.State.startReserved_begun s sourceType begun]
        exact holds.2
    rw [Laws.State.closeOwnItems_eq]
    exact started.same rfl rfl (Nat.le_refl _) rfl rfl (.refl _)
  removeOccurrence _ s occurrence holds member free :=
    have removed := pipeline.removeOccurrence _ _ occurrence holds.1 member free
    ⟨⟨removed.1, (formed_frameAlongside _ _).removeOccurrence (fun _ id _ held => held.withoutRecord id) holds.1 holds.2⟩,
      removed.2⟩
  recordEnd _ _ key terminal holds := ⟨pipeline.recordEnd _ _ key terminal holds.1, by
    rw [Laws.State.recordEnd_eq]
    exact holds.2.same rfl rfl (Nat.le_refl _) rfl rfl (.refl _)⟩

/-! ## What the features' records queue -/

/-- Queuing signals moves no occurrence's key. -/
theorem key_signals (s : State) (more : List Signal) (o : Occurrence) :
    Laws.State.key { s with signals := more } o = Laws.State.key s o := by
  simp [Laws.State.key, Laws.State.instanceOf_congr (s := s) (t := { s with signals := more }) rfl rfl]

/-- `trigger` may be held next to what `s` holds: it is held nowhere yet, is no group's nested run's, was counted, and
names no unbegun reservation. -/
def FreshTrigger (s : State) (trigger : OccurrenceRef) : Prop :=
  trigger ∉ heldTriggers s ∧ (∀ run ∈ s.slots.compensation.runs, resumesGroup run.resume = true → run.trigger ≠ trigger) ∧
    Counted s (triggerKey trigger) ∧ ∀ o ∈ s.occurrences, o.begun = false → triggerKey trigger ≠ Laws.State.key s o

/-- Queuing a signal that carries one trigger, a compensation's or a Cancel raise's, keeps `Formed` when the trigger it
names in `s` is fresh (`FreshTrigger`), a raise's scope occurrence was issued, and it resumes no group. -/
theorem Formed.append {precedes : Compensable → Compensable → Prop} {s : State} (formed : Formed precedes s)
    (signal : Signal) {held : OccurrenceRef ⊕ Origin} (carries : Laws.Step.triggersOf [signal] = [held])
    (resumes : ∀ resume ∈ Laws.Step.resumesOf [signal], resumesGroup resume = false)
    (issued : ∀ origin, held = .inr origin → Laws.State.ScopeIssued s origin.scope)
    (fresh : ∀ trigger, queuedTrigger s held = some trigger → FreshTrigger s trigger) :
    Formed precedes (s.signal signal) := by
  rw [Laws.State.signal_eq]
  have same : queuedTrigger { s with signals := s.signals ++ [signal] } = queuedTrigger s := by
    funext entry
    rcases entry with _ | origin
    · rfl
    · have named := Laws.State.instanceOf_congr (s := s) (t := { s with signals := s.signals ++ [signal] }) rfl rfl
        origin.scope
      simp only [queuedTrigger, named]
      rfl
  have queued : queuedTriggers { s with signals := s.signals ++ [signal] } =
      queuedTriggers s ++ (queuedTrigger s held).toList := by
    unfold queuedTriggers
    rw [same, Laws.Step.triggersOf_append, carries, List.filterMap_append]
    cases found : queuedTrigger s held <;> simp [found]
  have extra : ∀ trigger ∈ (queuedTrigger s held).toList, FreshTrigger s trigger := fun trigger inside =>
    fresh trigger (by simpa using inside)
  refine ⟨formed.claims, formed.retained, formed.unfinished, formed.completions, formed.issued, formed.settled,
    formed.keyed, formed.runsIssued, ⟨?_, fun run member grouped inHeld => ?_, fun trigger member => ?_,
      fun origin inside => ?_, fun o inside unbegun trigger member => ?_⟩, fun _ _ _ _ resume member => ?_⟩
  · unfold heldTriggers
    rw [queued, ← List.append_assoc]
    refine List.nodup_append.mpr ⟨formed.triggers.apart, by cases queuedTrigger s held <;> simp, ?_⟩
    intro other inside trigger named same
    exact (extra trigger named).1 (same ▸ inside)
  · rw [queued] at inHeld
    rcases List.mem_append.mp inHeld with old | named
    · exact formed.triggers.grouped run member grouped old
    · exact (extra _ named).2.1 run member grouped rfl
  · rw [queued, ← List.append_assoc] at member
    rcases List.mem_append.mp member with old | named
    · exact formed.triggers.counted trigger old
    · exact (extra trigger named).2.2.1
  · rw [Laws.Step.triggersOf_append, carries] at inside
    rcases List.mem_append.mp inside with old | named
    · exact formed.triggers.issued origin old
    · exact issued origin (List.mem_singleton.mp named).symm
  · rw [key_signals]
    rw [queued, ← List.append_assoc] at member
    rcases List.mem_append.mp member with old | named
    · exact formed.triggers.unreserved o inside unbegun trigger old
    · exact (extra trigger named).2.2.2 o inside unbegun
  · have carried := Laws.Step.mem_resumesOf.mpr ⟨_, _, _, _, member⟩
    rw [Laws.Step.resumesOf_append] at carried
    rcases List.mem_append.mp carried with old | named
    · obtain ⟨scope', activity', trigger', rest⟩ := Laws.Step.mem_resumesOf.mp old
      obtain ⟨leave', inside⟩ := rest
      exact formed.ungrouped scope' activity' trigger' leave' resume inside
    · exact resumes resume named

/-- Queuing a compensation keeps `Formed` when its trigger is held nowhere yet, is no group's nested run's, was
counted, names no unbegun reservation, and its resume resumes no group. -/
theorem Formed.queue {precedes : Compensable → Compensable → Prop} {s : State} (formed : Formed precedes s)
    {scope : ScopeOccurrenceId} {activity : Option ElementId} {trigger : OccurrenceRef} {leave : Option OccurrenceId}
    {resume : Option Resume} (fresh : trigger ∉ heldTriggers s)
    (ungrouped : ∀ run ∈ s.slots.compensation.runs, resumesGroup run.resume = true → run.trigger ≠ trigger)
    (counted : Counted s (triggerKey trigger)) (unresumed : resumesGroup resume = false)
    (unreserved : ∀ o ∈ s.occurrences, o.begun = false → triggerKey trigger ≠ Laws.State.key s o) :
    Formed precedes (s.signal (.compensate scope activity trigger leave resume)) :=
  formed.append _ (Laws.Step.triggersOf_compensate _ _ _ _ _)
    (fun _ inside => by rw [List.mem_singleton.mp inside]; exact unresumed) (fun _ named => by cases named)
    fun _ named => by
      simp only [queuedTrigger, Option.some.injEq] at named
      exact named ▸ ⟨fresh, ungrouped, counted, unreserved⟩

/-- A state whose issued scope occurrences that stand stood in `queue` in the same process instance names only
triggers `queue` names from the same queued compensations and Cancel raises. -/
theorem queuedTrigger_back {s queue : State}
    (chain : ∀ x ∈ scopeIds s, x ∈ scopeIds queue ∧ s.instanceOf x = queue.instanceOf x) {held : OccurrenceRef ⊕ Origin}
    {trigger : OccurrenceRef} (named : queuedTrigger s held = some trigger) : queuedTrigger queue held = some trigger := by
  rcases held with _ | origin
  · exact named
  · unfold queuedTrigger at named ⊢
    by_cases stands : origin.scope ∈ scopeIds s
    · obtain ⟨was, same⟩ := chain _ stands
      simp only [stands, ite_true] at named
      simp only [was, ite_true, ← same]
      exact named
    · simp [stands] at named

/-- What a caught Cancel's rollback keeps of the state its search reached: disarming the rolled-back Transaction's
boundaries changes only items and occurrences. -/
theorem rolledBack_frame {before searched : State}
    (terminated : before = searched ∨ ∃ host, before = searched.disarm host) :
    before.scopes = searched.scopes ∧ before.instanceId = searched.instanceId ∧
      before.activations = searched.activations ∧ before.slots = searched.slots ∧ before.signals = searched.signals := by
  rcases terminated with rfl | ⟨host, rfl⟩
  · exact ⟨rfl, rfl, rfl, rfl, rfl⟩
  · rw [Laws.State.disarm_eq]
    exact ⟨rfl, rfl, rfl, rfl, rfl⟩

/-- A caught Cancel's compensation keeps `Formed`: its trigger, the thrower of the raise taken off a queue that kept
`Formed`, was that queue's first queued trigger, so the queue held it once and as no group's nested run's and counted
it; the search, the disarming and the clearing since hold no trigger the queue did not (`queuedTrigger_back`) and no
run it did not, and keep its counts. -/
theorem formed_compensate (program : Program) (precedes : Compensable → Compensable → Prop) (s : State)
    (scope : ScopeOccurrenceId) (activity : Option ElementId) (trigger : OccurrenceRef) (leave : Option OccurrenceId)
    (element : ElementId) (at_ : ScopeOccurrenceId) (resumed : Leave)
    (source : ∃ before, s = before.clearInside scope ∧ WellFormed program before ∧ scope ∈ scopeIds before ∧
      Laws.State.RollsBack (fun t => WellFormed program t ∧ Formed precedes t) trigger before)
    (kept : Formed precedes s) :
    Formed precedes (s.signal (.compensate scope activity trigger leave (some (.occur element at_ resumed)))) := by
  obtain ⟨before, rfl, well, rest⟩ := source
  obtain ⟨present, rolls⟩ := rest
  obtain ⟨base, raised, origin, rest⟩ := rolls
  obtain ⟨searched, popped, standing, rest⟩ := rest
  obtain ⟨cancels, steady, terminated, named⟩ := rest
  obtain ⟨queue, holds, heads, made⟩ := popped
  have formedQueue := holds.2
  have baseScopes : base.scopes = queue.scopes := by rw [made]
  have baseId : base.instanceId = queue.instanceId := by rw [made]
  have frame := rolledBack_frame terminated
  have cleared := Laws.State.clearInside_cleared well present []
  -- the scope occurrences of the cleared state stood in the queue's, in the same process instance
  have chain : ∀ x ∈ scopeIds (before.clearInside scope), x ∈ scopeIds queue ∧
      (before.clearInside scope).instanceOf x = queue.instanceOf x := fun x inside => by
    obtain ⟨entry, member, rfl⟩ := List.mem_map.mp inside
    have stood := ((cleared.scopes entry).mp member).1
    rw [frame.1, steady.scopes, baseScopes] at stood
    refine ⟨List.mem_map.mpr ⟨entry, stood, rfl⟩, ?_⟩
    rw [cleared.instances _ inside, Laws.State.instanceOf_congr frame.1 frame.2.1, steady.instances,
      Laws.State.instanceOf_congr baseScopes baseId]
  -- the trigger is the queue's first queued one
  have first : queuedTriggers queue = trigger :: (Laws.Step.triggersOf base.signals).filterMap (queuedTrigger queue) := by
    have stood : origin.scope ∈ scopeIds queue := by rwa [scopeIds, ← baseScopes]
    unfold queuedTriggers
    rw [heads, ← List.singleton_append, Laws.Step.triggersOf_append, Laws.Step.triggersOf_raise, cancels,
      List.filterMap_append]
    simp only [↓reduceIte, List.filterMap_cons, List.filterMap_nil, queuedTrigger, stood, named,
      ← Laws.State.instanceOf_congr baseScopes baseId, ← steady.instances, List.singleton_append]
  have apart := formedQueue.triggers.apart
  unfold heldTriggers at apart
  rw [first] at apart
  obtain ⟨-, unrepeated, disjoint⟩ := List.nodup_append.mp apart
  have notLater := (List.nodup_cons.mp unrepeated).1
  have baseSlots : base.slots = queue.slots := by rw [made]
  have runsBack : ∀ run ∈ (before.clearInside scope).slots.compensation.runs, run ∈ queue.slots.compensation.runs :=
    fun run member => by
      rw [Laws.State.clearInside_compensation] at member
      have inside := (List.mem_filter.mp member).1
      rw [frame.2.2.2.1] at inside
      have earlier := steady.runs run inside
      rwa [baseSlots] at earlier
  have headed : trigger ∈ queuedTriggers queue := by
    rw [first]
    exact List.mem_cons_self ..
  -- an unbegun reservation of the cleared state stood unbegun in the queue, under the same key
  have heldBack : ∀ o ∈ (before.clearInside scope).occurrences, o ∈ queue.occurrences := fun o inside => by
    have was := ((cleared.occurrences o).mp inside).1
    have searchedHeld : o ∈ searched.occurrences := by
      rcases terminated with rfl | ⟨host, rfl⟩
      · exact was
      · rw [Laws.State.disarm_eq] at was
        exact (List.mem_filter.mp was).1
    rw [steady.occurrences] at searchedHeld
    rwa [made] at searchedHeld
  have reservedApart : ∀ o ∈ (before.clearInside scope).occurrences, o.begun = false →
      triggerKey trigger ≠ Laws.State.key (before.clearInside scope) o := fun o inside unbegun => by
    obtain ⟨was, outside⟩ := (cleared.occurrences o).mp inside
    obtain ⟨entry, member, named⟩ := List.mem_map.mp (well.owned.occurrenceScopes o was)
    have stands : o.scope ∈ scopeIds (before.clearInside scope) := List.mem_map.mpr ⟨entry,
      (cleared.scopes entry).mpr ⟨member, fun strictly => by
        rw [named] at strictly
        rcases outside with away | kept
        · exact away strictly.1
        · simp at kept⟩, named⟩
    have keyed : Laws.State.key (before.clearInside scope) o = Laws.State.key queue o := by
      simp [Laws.State.key, (chain _ stands).2]
    rw [keyed]
    exact formedQueue.triggers.unreserved o (heldBack o inside) unbegun trigger (List.mem_append_right _ headed)
  refine kept.queue (fun inHeld => ?_) (fun run member grouped same => ?_) ?_ rfl reservedApart
  · unfold heldTriggers at inHeld
    rcases List.mem_append.mp inHeld with inRuns | inQueued
    · obtain ⟨run, member, same⟩ := List.mem_map.mp inRuns
      obtain ⟨inside, ungrouped⟩ := List.mem_filter.mp member
      exact disjoint _ (List.mem_map.mpr ⟨run, List.mem_filter.mpr ⟨runsBack run inside, ungrouped⟩, rfl⟩) trigger
        (List.mem_cons_self ..) same
    · unfold queuedTriggers at inQueued
      obtain ⟨held, inside, carried⟩ := List.mem_filterMap.mp inQueued
      obtain ⟨more, appended, quiet⟩ := steady.signals
      rw [Laws.State.clearInside_signals, frame.2.2.2.2, appended, Laws.Step.triggersOf_append,
        Laws.Step.triggersOf_untriggered quiet, List.append_nil] at inside
      exact notLater (List.mem_filterMap.mpr ⟨held, inside, queuedTrigger_back chain carried⟩)
  · exact formedQueue.triggers.grouped run (runsBack run member) grouped (same ▸ headed)
  · have counted := formedQueue.triggers.counted trigger (List.mem_append_right _ headed)
    refine Laws.State.Counted.congr ?_ counted
    rw [cleared.activations, frame.2.2.1, steady.activations, made]

/-- The trigger a queued compensation or Cancel raise names reads only the scope occurrences and the instance. -/
theorem queuedTrigger_congr {s t : State} (scopes : t.scopes = s.scopes) (named : t.instanceId = s.instanceId) :
    queuedTrigger t = queuedTrigger s := by
  funext x
  cases x <;> simp [queuedTrigger, scopeIds, scopes, Laws.State.instanceOf_congr scopes named]

/-- A state with another's scope occurrences, instance identity and queued triggers names the same ones. -/
theorem queuedTriggers_congr {s t : State} (scopes : t.scopes = s.scopes) (instanceId : t.instanceId = s.instanceId)
    (triggers : Laws.Step.triggersOf t.signals = Laws.Step.triggersOf s.signals) : queuedTriggers t = queuedTriggers s := by
  unfold queuedTriggers
  rw [triggers, queuedTrigger_congr scopes instanceId]

/-- The trigger a throw takes from its occurrence is fresh in a state that holds what the state its begin left held:
a begin from a state that kept `Formed` began an unbegun reservation, whose key no held trigger names
(`TriggersApart.unreserved`), or issued afresh above every counted activation (`Laws.State.Activated.fresh`); no other
occurrence carries the thrower's key (`Laws.State.Distinct.keys`), and its counter counted it. The thrower stands. -/
theorem thrower_fresh {program : Program} {precedes : Compensable → Compensable → Prop} {base t : State}
    {occurrence : Occurrence}
    (begun : Laws.State.BegunFrom (fun u => WellFormed program u ∧ Formed precedes u) base occurrence)
    (well : WellFormed program t) (occurrences : t.occurrences = base.occurrences)
    (scopes : t.scopes = base.scopes)
    (instanceId : t.instanceId = base.instanceId) (compensation : t.slots.compensation = base.slots.compensation)
    (triggers : Laws.Step.triggersOf t.signals = Laws.Step.triggersOf base.signals) :
    occurrence ∈ t.occurrences ∧ FreshTrigger t { processInstanceId := t.instanceOf occurrence.scope,
                                                  element := occurrence.element, activation := occurrence.activation } := by
  obtain ⟨before, request, rest⟩ := begun
  obtain ⟨role, sourceType, holds, rest⟩ := rest
  obtain ⟨began, made⟩ := rest
  have begins := Laws.State.beginOccurrence_begins holds.1.activations request role sourceType
  rw [made] at begins
  have instances : ∀ x, t.instanceOf x = before.instanceOf x := fun x =>
    (Laws.State.instanceOf_congr scopes instanceId x).trans (begins.instances x)
  have keyOf : triggerKey { processInstanceId := t.instanceOf occurrence.scope, element := occurrence.element,
                            activation := occurrence.activation } = Laws.State.key t occurrence := by
    unfold triggerKey Laws.State.key
    rw [began.role]
  have member : occurrence ∈ t.occurrences := by
    rw [occurrences, begins.occurrences]
    exact List.mem_append_right _ (List.mem_singleton_self _)
  -- every trigger `t` holds is one the begin's state held, and names another key than the thrower's
  have held : ∀ trigger ∈ t.slots.compensation.runs.map (·.trigger) ++ queuedTriggers t,
      triggerKey trigger ≠ Laws.State.key t occurrence := fun trigger inside => by
    have queued : queuedTriggers t = queuedTriggers before :=
      queuedTriggers_congr (scopes.trans begins.scopes) (instanceId.trans begins.instanceId)
        (by rw [triggers, begins.signals])
    rw [queued, compensation, begins.slots] at inside
    rw [← keyOf]
    rcases begins.source with ⟨reserved, taken⟩ | issued
    · obtain ⟨unbegun, -, placed⟩ := (began.reserved reserved.id taken.named).2 reserved taken.member rfl
      have same : triggerKey { processInstanceId := t.instanceOf occurrence.scope, element := occurrence.element,
                               activation := occurrence.activation } = Laws.State.key before reserved := by
        unfold triggerKey Laws.State.key
        rw [instances, begins.scope, placed began.scope, taken.element, taken.activation, ← taken.role, began.role]
      rw [same]
      exact holds.2.triggers.unreserved reserved taken.member unbegun trigger inside
    · have apart := issued.activated.fresh (holds.2.triggers.counted trigger inside)
      have roleIs : role = .element := issued.roled ▸ began.role
      rw [roleIs] at apart
      intro same
      apply apart
      rw [same]
      unfold triggerKey
      rw [instances, begins.scope, issued.element]
  refine ⟨member, fun inHeld => ?_, fun run inside _ same => ?_, keyOf ▸ well.occurrencesCounted occurrence member,
    fun o inside unbegun same => ?_⟩
  · unfold heldTriggers at inHeld
    rcases List.mem_append.mp inHeld with ran | queuedIn
    · obtain ⟨run, chosen, named⟩ := List.mem_map.mp ran
      exact held _ (List.mem_append_left _ (List.mem_map.mpr ⟨run, (List.mem_filter.mp chosen).1, named⟩)) keyOf
    · exact held _ (List.mem_append_right _ queuedIn) keyOf
  · exact held run.trigger (List.mem_append_left _ (List.mem_map.mpr ⟨run, inside, rfl⟩)) (same ▸ keyOf)
  · have one := Laws.State.nodup_map_eq well.distinct.keys inside member (same.symm.trans keyOf)
    rw [one, begins.isBegun] at unbegun
    cases unbegun

/-- The features' records keep `Formed` where they reserve, queue an occurrence or a caught Cancel's compensation, and
where a throw queues its compensation or raises: its trigger is fresh (`thrower_fresh`), and a raise's scope occurrence,
the thrower's, was issued. -/
theorem formed_occursAlongside (program : Program) (precedes : Compensable → Compensable → Prop) :
    OccursAlongside program (Formed precedes) where
  reserve s element scope well _ _ _ kept := kept.reserve well element scope
  occur _ _ _ _ _ _ _ _ _ kept := kept.signal _
  compensate s scope activity trigger leave element at_ resumed _ source _ kept :=
    formed_compensate program precedes s scope activity trigger leave element at_ resumed source kept
  throwCompensate s occurrence scope activity trigger leave well begun named _ kept := by
    subst named
    have fresh := (thrower_fresh begun well rfl rfl rfl rfl rfl).2
    exact kept.queue fresh.1 fresh.2.1 fresh.2.2.1 rfl fresh.2.2.2
  raise s raised occurrence well raises kept := by
    obtain ⟨base, begun, at_⟩ := raises
    obtain ⟨member, fresh⟩ : occurrence ∈ s.occurrences ∧
        FreshTrigger s { processInstanceId := s.instanceOf occurrence.scope, element := occurrence.element,
                         activation := occurrence.activation } := by
      rcases at_ with rfl | ⟨leave, rfl⟩
      · exact thrower_fresh begun well rfl rfl rfl rfl rfl
      · rw [Laws.State.signal_eq] at well ⊢
        exact thrower_fresh begun well rfl rfl rfl rfl (by
          rw [Laws.Step.triggersOf_append, show Laws.Step.triggersOf [Signal.complete occurrence.id leave [] .outward] = []
            from rfl, List.append_nil])
    cases cancels : raised.isCancel
    · exact kept.signal _ (by rw [Laws.Step.triggersOf_raise, cancels]; rfl)
    · obtain ⟨entry, inside, named⟩ := List.mem_map.mp (well.owned.occurrenceScopes occurrence member)
      refine kept.append _ (by rw [Laws.Step.triggersOf_raise, cancels]; rfl) (fun _ inside => absurd inside List.not_mem_nil)
        (fun origin same => ?_) fun trigger found => ?_
      · cases same
        rw [← named]
        exact well.issued.scopes entry inside
      · have stands : occurrence.scope ∈ scopeIds s := List.mem_map.mpr ⟨entry, inside, named⟩
        simp only [queuedTrigger, stands, ite_true, Option.some.injEq] at found
        exact found ▸ fresh
  enterCalled s call variables definition well member _ _ _ _ kept := by
    have fresh := Laws.State.enterCalled_fresh well program (well.owned.occurrenceScopes call member) variables
      definition
    rw [Laws.State.enterCalled_eq s program call variables definition (Laws.State.scopes_fresh well)] at fresh ⊢
    exact kept.enter well rfl fresh rfl rfl rfl rfl rfl rfl rfl

end Kernel.Proofs.Compensation
