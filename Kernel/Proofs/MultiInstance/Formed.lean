module

public import Kernel.Proofs.MultiInstance
public import Kernel.Proofs.Step
public import Kernel.Laws.Registry

/-! # Proofs: the Multi-Instance lane's slot invariant beside `WellFormed`

What the state operations and `Step`'s phases keep of the lane's slot invariant `RunsFormed` but its numbering, which
reads the occurrences' activations and is a fact of its own (`RunsFramed`): its read set is the Multi-Instance runs,
the compensation runs, the scope tree with each scope occurrence's owner, and the body occurrences' element and role, so
a variable write, a queued signal and a journal entry are frames, and so are entering, reserving and issuing, which add
only what is fresh. Removal keeps it because a body that stays has its scope occurrence outside the removed subtree
(`Laws.State.Cleared.bodies`), so its body occurrence, which owns that scope occurrence and lies directly above it,
stays, and so do its instances' scope occurrences, which lie directly below it, but for one the removal leaves itself,
which `LeavesOwned` excludes: an active instance's scope occurrence is owned by no occurrence and holds no handler.
Instances lie `Apart` in every well-formed state, so the lane carries `Owned` instead.

Under the registered hooks `WellFormed` and `RunsFramed` (`Framed`) then hold through every committed input, given what
the Multi-Instance hooks keep of them (`Proofs.Step.MultiInstanceKeeps Framed`): the other feature records follow from
`WellFormed`'s and `FrameAlongside` (`Proofs.Cancellation.featureOps_frame`). The lane's statements that read the slot
invariant whole follow from what the numbering lane supplies (`NumberingKept`), `RunsFramed.formed` composing the two.
The module imports the registry's Laws module because it composes the registered hooks, and so stays in every feature's
rebuild cone (guard 15). Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Proofs.MultiInstance

open Kernel
open Kernel.Laws.State (WellFormed Within StrictlyWithin scopeIds)
open Kernel.Laws.MultiInstance (LoopOf Owned BodyOwns InstancesUnowned InstancesUnheld RunsKeyed NumberedInOrder
  SequentialSlots ParallelSlots OutputsFit)
open Kernel.Proofs.Cancellation (FrameAlongside StepAlongside Unmoved LeavesOwned StoresHeldOrFresh RunningContext
  ActiveInstance phases_alongside featureOps_frame)

/-- `Shaped` but the numbering: a running body's slots shaped by its loop's mode, its filled slots holding what its
instances submitted. -/
def SlotsShaped (run : MultiInstanceRun) (loop : MultiInstance) : Prop :=
  (loop.mode = .sequential → SequentialSlots run) ∧ (loop.mode = .parallel → ParallelSlots run) ∧ OutputsFit run loop

/-- `RunFormed` but the numbering and `Apart`, which every well-formed state gives of `Owned` (`owned_apart`). -/
structure RunFramed (program : Program) (s : State) (run : MultiInstanceRun) : Prop where
  owned : Owned s run
  shaped : ∀ loop, LoopOf program run.element loop → SlotsShaped run loop
  bodyOwns : BodyOwns s run
  unowned : InstancesUnowned s run
  unheld : InstancesUnheld s run

/-- `RunsFormed` but the numbering and `Apart`: one running body per body occurrence, each `RunFramed`. -/
structure RunsFramed (program : Program) (s : State) : Prop where
  keyed : RunsKeyed s
  framed : ∀ run ∈ s.slots.multiInstances, RunFramed program s run

/-- A running body's instances lie `Apart` in a well-formed state: their scope occurrences are distinct children of
the body's. -/
theorem owned_apart {program : Program} {s : State} {run : MultiInstanceRun} (formed : WellFormed program s)
    (owned : Owned s run) : Apart s run := by
  intro first second firstScope secondScope one two differs within
  obtain ⟨firstEntry, firstMember, firstNamed, firstLink⟩ := owned.instanceScopes first firstScope one
  obtain ⟨secondEntry, secondMember, secondNamed, secondLink⟩ := owned.instanceScopes second secondScope two
  have other : firstEntry.id ≠ secondEntry.id := fun same => by
    rw [firstNamed, secondNamed] at same
    exact differs (owned.ownScopes first second firstScope one (same ▸ two))
  rw [← firstNamed, ← secondNamed] at within
  exact Laws.State.sibling_outside formed secondMember firstMember secondLink firstLink other within

/-- The lane's slot invariant without its numbering. -/
theorem RunsFormed.framed {program : Program} {s : State} (formed : RunsFormed program s) : RunsFramed program s :=
  ⟨formed.keyed, fun run member =>
    have each := formed.formed run member
    ⟨each.owned, fun loop looped => ⟨(each.shaped loop looped).1, (each.shaped loop looped).2.1,
      (each.shaped loop looped).2.2.1⟩, each.bodyOwns, each.unowned, each.unheld⟩⟩

/-- The lane's slot invariant of a well-formed state from its part without numbering and the numbering of each running
body. -/
theorem RunsFramed.formed {program : Program} {s : State} (well : WellFormed program s) (framed : RunsFramed program s)
    (numbered : ∀ run ∈ s.slots.multiInstances, NumberedInOrder s run) : RunsFormed program s :=
  ⟨framed.keyed, fun run member =>
    have each := framed.framed run member
    ⟨each.owned, fun loop looped => ⟨(each.shaped loop looped).1, (each.shaped loop looped).2.1,
      (each.shaped loop looped).2.2, numbered run member⟩, owned_apart well each.owned, each.bodyOwns, each.unowned,
      each.unheld⟩⟩

/-! ## Carrying the invariant -/

/-- What `t` keeps of what `RunsFramed` reads of `s`: no new body, each body occurrence of a body that stays, the scope
occurrences of `s` or fresh ones, a staying body's own and instances' scope occurrences, and running compensation
contexts held before or fresh. -/
structure Carries (s t : State) : Prop where
  bodies : t.slots.multiInstances.Sublist s.slots.multiInstances
  occurrences : ∀ run ∈ t.slots.multiInstances, ∀ o ∈ s.occurrences, o.id = run.occurrence →
    ∃ kept ∈ t.occurrences, kept.id = o.id ∧ kept.element = o.element ∧ kept.role = o.role
  fresh : ∀ entry ∈ t.scopes, entry ∈ s.scopes ∨ entry.id ∉ scopeIds s
  scopes : ∀ run ∈ t.slots.multiInstances, ∀ entry ∈ s.scopes,
    (entry.id = run.scope ∨ Iteration.active entry.id ∈ run.instances) → entry ∈ t.scopes
  runs : StoresHeldOrFresh s t.slots.compensation

/-- What `Carries` keeps. -/
theorem RunsFramed.carry {program : Program} {s t : State} (framed : RunsFramed program s) (carries : Carries s t) :
    RunsFramed program t := by
  refine ⟨carries.bodies.map _ |>.nodup framed.keyed, fun run member => ?_⟩
  have each := framed.framed run (carries.bodies.subset member)
  have bodyIn : run.scope ∈ scopeIds s := each.owned.bodyScope
  have activeIn : ∀ scope, Iteration.active scope ∈ run.instances → scope ∈ scopeIds s := fun scope active => by
    obtain ⟨index, slot⟩ := List.mem_iff_getElem?.mp active
    obtain ⟨entry, inside, named, _⟩ := each.owned.instanceScopes index scope slot
    exact List.mem_map.mpr ⟨entry, inside, named⟩
  have entryOf : ∀ entry ∈ t.scopes, entry.id ∈ scopeIds s → entry ∈ s.scopes := fun entry inside known =>
    (carries.fresh entry inside).resolve_right fun fresh => fresh known
  refine ⟨⟨?_, ?_, fun index scope slot => ?_, each.owned.ownScopes⟩, each.shaped, fun entry inside named => ?_,
    fun scope active entry inside named => ?_, fun scope active other held running => ?_⟩
  · obtain ⟨o, present, named, rest⟩ := each.owned.body
    obtain ⟨kept, keptIn, keptId, same⟩ := carries.occurrences run member o present named
    exact ⟨kept, keptIn, keptId.trans named, same.1.trans rest.1, same.2.trans rest.2⟩
  · obtain ⟨entry, inside, named⟩ := List.mem_map.mp bodyIn
    exact List.mem_map.mpr ⟨entry, carries.scopes run member entry inside (.inl named), named⟩
  · obtain ⟨entry, inside, named, link⟩ := each.owned.instanceScopes index scope slot
    exact ⟨entry, carries.scopes run member entry inside (.inr (named ▸ List.mem_of_getElem? slot)), named, link⟩
  · exact each.bodyOwns entry (entryOf entry inside (named ▸ bodyIn)) named
  · exact each.unowned scope active entry (entryOf entry inside (named ▸ activeIn scope active)) named
  · rcases carries.runs other held scope running with ⟨older, olderIn, olderRunning⟩ | fresh
    · exact each.unheld scope active older olderIn olderRunning
    · exact fresh ⟨run, carries.bodies.subset member, active⟩

/-- Every context the compensation runs of `s` hold running is one of `s`'s. -/
theorem StoresHeldOrFresh.self (s : State) : StoresHeldOrFresh s s.slots.compensation :=
  fun run member _ running => .inl ⟨run, member, running⟩

/-- A change that keeps the scope occurrences, the bodies and the compensation runs and keeps each body occurrence
carries the invariant. -/
theorem Carries.same {s t : State} (scopes : t.scopes = s.scopes) (bodies : t.slots.multiInstances = s.slots.multiInstances)
    (runs : t.slots.compensation.runs = s.slots.compensation.runs)
    (occurrences : ∀ o ∈ s.occurrences, o.begun = true → o ∈ t.occurrences) (settled : ∀ run ∈ s.slots.multiInstances,
      ∀ o ∈ s.occurrences, o.id = run.occurrence → o.begun = true) : Carries s t where
  bodies := bodies ▸ .refl _
  occurrences run member o present named := ⟨o, occurrences o present (settled run (bodies ▸ member) o present named), rfl,
    rfl, rfl⟩
  fresh _ inside := .inl (scopes ▸ inside)
  scopes _ _ _ inside _ := scopes ▸ inside
  runs run member _ running := .inl ⟨run, runs ▸ member, running⟩

/-- Every body occurrence of a well-formed state has begun. -/
theorem bodies_begun {program : Program} {s : State} (formed : WellFormed program s) :
    ∀ run ∈ s.slots.multiInstances, ∀ o ∈ s.occurrences, o.id = run.occurrence → o.begun = true :=
  fun run member o present named => (formed.settled.bodies run member).2.1 o present named

/-- A change that adds only fresh scope occurrences and keeps every occurrence, the bodies and the compensation runs
carries the invariant. -/
theorem Carries.grow {s t : State} (scopes : ∀ entry ∈ t.scopes, entry ∈ s.scopes ∨ entry.id ∉ scopeIds s)
    (kept : ∀ entry ∈ s.scopes, entry ∈ t.scopes) (bodies : t.slots.multiInstances = s.slots.multiInstances)
    (runs : t.slots.compensation.runs = s.slots.compensation.runs) (occurrences : ∀ o ∈ s.occurrences, o ∈ t.occurrences) :
    Carries s t where
  bodies := bodies ▸ .refl _
  occurrences _ _ o present _ := ⟨o, occurrences o present, rfl, rfl, rfl⟩
  fresh := scopes
  scopes _ _ entry inside _ := kept entry inside
  runs run member _ running := .inl ⟨run, runs ▸ member, running⟩

/-- A change that keeps everything `RunsFramed` reads carries it. -/
theorem Carries.equal {s t : State} (scopes : t.scopes = s.scopes) (occurrences : t.occurrences = s.occurrences)
    (bodies : t.slots.multiInstances = s.slots.multiInstances)
    (runs : t.slots.compensation.runs = s.slots.compensation.runs) : Carries s t :=
  .grow (fun _ inside => .inl (scopes ▸ inside)) (fun _ inside => scopes ▸ inside) bodies runs
    fun _ present => occurrences ▸ present

/-- No scope occurrence of a well-formed state carries the identity at its counter. -/
theorem counter_fresh {program : Program} {s : State} (formed : WellFormed program s) :
    (⟨s.nextIssue⟩ : ScopeOccurrenceId) ∉ scopeIds s := fun inside => by
  obtain ⟨entry, member, named⟩ := List.mem_map.mp inside
  have below := formed.issued.scopes entry member
  rw [named] at below
  exact Nat.lt_irrefl _ below

/-! ## What removal keeps -/

/-- A running body whose scope occurrence lies outside `scope` has its body occurrence outside it, since that occurrence
owns the body's scope occurrence directly above it, and each of its instances' scope occurrences inside `scope` is
`scope` itself, since it lies directly below the body's. -/
theorem outside_body {program other : Program} {s : State} {run : MultiInstanceRun} (formed : WellFormed program s)
    (framed : RunFramed other s run) {scope : ScopeOccurrenceId} (outside : ¬ Within s run.scope scope) :
    (∀ o ∈ s.occurrences, o.id = run.occurrence → ¬ Within s o.scope scope) ∧
      ∀ entry ∈ s.scopes, Iteration.active entry.id ∈ run.instances → Within s entry.id scope → entry.id = scope := by
  obtain ⟨body, bodyIn, bodyNamed⟩ := List.mem_map.mp framed.owned.bodyScope
  refine ⟨fun o present named within => outside ?_, fun entry inside active within => ?_⟩
  · have owned := framed.bodyOwns body bodyIn bodyNamed
    have link := formed.ownedBelow body bodyIn o present (by rw [owned, named])
    exact bodyNamed ▸ Within.parent body o.scope scope bodyIn link within
  · obtain ⟨index, slot⟩ := List.mem_iff_getElem?.mp active
    obtain ⟨placed, placedIn, placedNamed, placedLink⟩ := framed.owned.instanceScopes index entry.id slot
    obtain rfl := Laws.State.scope_unique formed.distinct placedIn inside placedNamed
    rcases Proofs.Cancellation.Within.up within with same | ⟨child, childIn, childNamed, rest⟩
    · exact same
    · obtain ⟨_, link, above⟩ := rest
      obtain rfl := Laws.State.scope_unique formed.distinct childIn placedIn childNamed
      rw [placedLink] at link
      cases link
      exact absurd above outside

/-- The bodies a clearing of `scope` keeps are those whose scope occurrence lies outside it. -/
theorem cleared_bodies {program : Program} {s t : State} (formed : WellFormed program s) {scope : ScopeOccurrenceId}
    (present : scope ∈ scopeIds s) {keep : List Nat} (cleared : Laws.State.Cleared s t scope keep) :
    t.slots.multiInstances.Sublist s.slots.multiInstances ∧
      ∀ run ∈ t.slots.multiInstances, ¬ Within s run.scope scope := by
  rw [cleared.bodies]
  refine ⟨List.filter_sublist, fun run member within => ?_⟩
  have outside := (List.mem_filter.mp member).2
  simp only [Bool.not_eq_true'] at outside
  have inside := (Laws.State.subtree_iff formed present _).mpr within
  rw [List.contains_iff_mem.mpr inside] at outside
  cases outside

/-- Leaving a scope occurrence that stands and is owned or a running compensation context carries the invariant. -/
theorem leaveScope_carries {program other : Program} {s : State} {scope : ScopeOccurrenceId}
    (formed : WellFormed program s) (present : scope ∈ scopeIds s) (leaves : LeavesOwned s scope)
    (framed : RunsFramed other s) :
    Carries s (s.leaveScope scope) := by
  have left := Laws.State.leaveScope_left formed present
  obtain ⟨_, bodiesEq, runsEq⟩ := Laws.State.leaveScope_slots s scope
  obtain ⟨fewer, outside⟩ := cleared_bodies formed present (Laws.State.clearInside_cleared formed present [])
  rw [← bodiesEq] at fewer outside
  refine ⟨fewer, fun run member o inside named => ⟨o, (left.occurrences o).mpr ⟨inside,
    (outside_body formed (framed.framed run (fewer.subset member)) (outside run member)).1 o inside named⟩, rfl, rfl,
    rfl⟩, fun _ inside => .inl (left.scopesSublist.subset inside), fun run member entry inside which => ?_,
    fun other member _ running => .inl ⟨other, left.slots.runs other member, running⟩⟩
  have each := framed.framed run (fewer.subset member)
  refine (left.scopes entry).mpr ⟨inside, fun within => ?_⟩
  rcases which with named | active
  · exact outside run member (named ▸ within)
  · have same := (outside_body formed each (outside run member)).2 entry inside active within
    rcases leaves with ⟨owned, ownedIn, ownedNamed, rest⟩ | ⟨holder, holderIn, running⟩
    · obtain ⟨owner, owns⟩ := rest
      obtain rfl := Laws.State.scope_unique formed.distinct ownedIn inside (ownedNamed.trans same.symm)
      rw [each.unowned owned.id active owned ownedIn rfl] at owns
      cases owns
    · exact each.unheld entry.id active holder holderIn (same ▸ running)

/-- Clearing a scope occurrence that stands carries the invariant. -/
theorem clearInside_carries {program other : Program} {s : State} {scope : ScopeOccurrenceId}
    (formed : WellFormed program s) (present : scope ∈ scopeIds s) (keep : List Nat) (framed : RunsFramed other s) :
    Carries s (s.clearInside scope keep) := by
  have cleared := Laws.State.clearInside_cleared formed present keep
  obtain ⟨fewer, outside⟩ := cleared_bodies formed present cleared
  refine ⟨fewer, fun run member o inside named => ⟨o, (cleared.occurrences o).mpr ⟨inside,
    .inl ((outside_body formed (framed.framed run (fewer.subset member)) (outside run member)).1 o inside named)⟩, rfl,
    rfl, rfl⟩, fun _ inside => .inl (cleared.scopesSublist.subset inside), fun run member entry inside which => ?_,
    fun other member _ running => .inl ⟨other, cleared.slots.runs other member, running⟩⟩
  refine (cleared.scopes entry).mpr ⟨inside, fun ⟨within, differs⟩ => ?_⟩
  rcases which with named | active
  · exact outside run member (named ▸ within)
  · exact differs ((outside_body formed (framed.framed run (fewer.subset member)) (outside run member)).2 entry inside
      active within)

/-! ## The state operations -/

/-- The state operations the hooks apply keep the lane's slot invariant but its numbering under any program
(`Proofs.Cancellation.FrameAlongside`). -/
theorem runsFramed_frameAlongside (program : Program) : FrameAlongside (RunsFramed program) where
  frame _ _ moved kept := kept.carry (.equal moved.scopes moved.occurrences moved.multiInstances moved.runs)
  issue s kept := by
    rw [Laws.State.issue_eq]
    exact kept.carry (.equal rfl rfl rfl rfl)
  enterScope _ s element parent locals owner formed kept := by
    rw [Laws.State.enterScope_eq]
    refine kept.carry (.grow (fun entry inside => ?_) (fun _ inside => List.mem_append_left _ inside) rfl rfl
      fun _ present => present)
    rcases List.mem_append.mp inside with old | new
    · exact .inl old
    · rw [List.mem_singleton.mp new]
      exact .inr (counter_fresh formed)
  enterCalled _ s called call variables definition formed kept := by
    have fresh : ∀ entry ∈ s.scopes, entry.id ≠ ⟨s.nextIssue⟩ := fun entry inside same =>
      counter_fresh formed (same ▸ List.mem_map.mpr ⟨entry, inside, rfl⟩)
    rw [Laws.State.enterCalled_eq _ _ _ _ _ fresh]
    refine kept.carry (.grow (fun entry inside => ?_) (fun _ inside => List.mem_append_left _ inside) rfl rfl
      fun _ present => present)
    rcases List.mem_append.mp inside with old | new
    · exact .inl old
    · rw [List.mem_singleton.mp new]
      exact .inr (counter_fresh formed)
  reserve _ s element scope _ kept :=
    have reserves := Laws.State.reserve_reserves s element scope
    kept.carry (.grow (fun _ inside => .inl (reserves.scopes ▸ inside)) (fun _ inside => reserves.scopes ▸ inside)
      (congrArg (·.multiInstances) reserves.slots) (congrArg (·.compensation.runs) reserves.slots)
      fun _ present => reserves.occurrences ▸ List.mem_append_left _ present)
  leaveScope _ _ _ formed present leaves kept := kept.carry (leaveScope_carries formed present leaves kept)
  clearInside _ _ _ keep formed present _ kept := kept.carry (clearInside_carries formed present keep kept)
  disarm _ s host formed kept := by
    rw [Laws.State.disarm_eq]
    exact kept.carry (.same rfl rfl rfl (fun _ present begun => List.mem_filter.mpr ⟨present, by simp [begun]⟩)
      (bodies_begun formed))
  setVariable _ s target name value _ kept :=
    have same := Laws.State.setVariable_same s target name value
    kept.carry (.equal same.scopes same.occurrences (congrArg (·.multiInstances) same.slots)
      (congrArg (·.compensation.runs) same.slots))
  removeVariable _ s target name _ kept :=
    have same := Laws.State.removeVariable_same s target name
    kept.carry (.equal same.scopes same.occurrences (congrArg (·.multiInstances) same.slots)
      (congrArg (·.compensation.runs) same.slots))
  storeRuns _ s compensation _ fresh kept :=
    kept.carry ⟨.refl _, fun _ _ o present _ => ⟨o, present, rfl, rfl, rfl⟩, fun _ inside => .inl inside,
      fun _ _ _ inside _ => inside, fresh⟩

/-- Dropping a record that owns no scope occurrence carries the invariant: it is no running body's body occurrence,
which owns the body's scope occurrence. -/
theorem withoutRecord_carries {program : Program} {t : State} {id : Nat}
    (unowned : ∀ entry ∈ t.scopes, entry.occurrence ≠ some id) (framed : RunsFramed program t) :
    RunsFramed program (Laws.State.withoutRecord t id) :=
  framed.carry ⟨.refl _, fun run member o present named => ⟨o, List.mem_filter.mpr ⟨present, by
    obtain ⟨entry, inside, bodyNamed⟩ := List.mem_map.mp (framed.framed run member).owned.bodyScope
    simp only [bne_iff_ne, ne_eq]
    exact fun same => unowned entry inside (by rw [(framed.framed run member).bodyOwns entry inside bodyNamed, ← named, same])⟩,
    rfl, rfl, rfl⟩, fun _ inside => .inl inside, fun _ _ _ inside _ => inside, StoresHeldOrFresh.self t⟩

/-! ## `Step`'s phases -/

/-- `Step`'s phases keep the lane's slot invariant but its numbering: journalling and ordering move nothing it reads,
beginning replaces a reservation by its begun record or adds a fresh occurrence, and cancelling withdraws items and
removes an occurrence (`FrameAlongside.removeOccurrence`). -/
theorem runsFramed_stepAlongside (program : Program) : StepAlongside (RunsFramed program) where
  toFrameAlongside := runsFramed_frameAlongside program
  journal _ _ _ _ kept _ _ := kept.carry (.equal rfl rfl rfl rfl)
  runOrder _ _ _ kept := kept.carry (.equal rfl rfl rfl rfl)
  begin _ s request role sourceType formed _ _ kept := by
    have begins := Laws.State.beginOccurrence_begins formed.activations request role sourceType
    refine kept.carry ⟨by rw [begins.slots]; exact .refl _, fun run _ o present named => ?_,
      fun _ inside => .inl (begins.scopes ▸ inside), fun _ _ _ inside _ => begins.scopes ▸ inside,
      by rw [begins.slots]; exact StoresHeldOrFresh.self s⟩
    rw [begins.occurrences]
    by_cases same : o.id = (s.beginOccurrence request role sourceType).2.id
    · rcases begins.source with ⟨reserved, source⟩ | fresh
      · obtain rfl := Laws.State.nodup_map_eq formed.distinct.occurrences present source.member (same.trans source.id)
        exact ⟨_, List.mem_append_right _ (List.mem_singleton_self _), same.symm, source.element, source.role⟩
      · have below := formed.issued.occurrences o present
        rw [same, fresh.id] at below
        exact absurd below (Nat.lt_irrefl _)
    · exact ⟨o, List.mem_append_left _ (List.mem_filter.mpr ⟨present, by simpa using same⟩), rfl, rfl, rfl⟩
  cancel _ s id formed kept := by
    cases found : s.occurrence? id with
    | none =>
      rw [Laws.State.cancelOccurrence_absent found]
      exact kept
    | some occurrence =>
      obtain ⟨ended, cancelled, cancels⟩ := Laws.State.cancelOccurrence_some found
      have side := runsFramed_frameAlongside program
      have formedWithdrawn := (Laws.State.withdrawAll
        (((s.closeOwnItems id).disarm id).scopes.filter (·.occurrence == some id)) _
        (Laws.State.disarm_wellFormed (Laws.State.closeOwnItems_wellFormed formed id) id)).1
      obtain ⟨items, withdrawn⟩ := Laws.State.withdrawAll_frame
        (((s.closeOwnItems id).disarm id).scopes.filter (·.occurrence == some id)) ((s.closeOwnItems id).disarm id)
      rw [← Laws.State.withdrawOccurrence_eq] at formedWithdrawn withdrawn
      have closed : RunsFramed program (s.closeOwnItems id) := by
        rw [Laws.State.closeOwnItems_eq]
        exact kept.carry (.equal rfl rfl rfl rfl)
      have withdrawnKept : RunsFramed program (s.withdrawOccurrence id) := by
        rw [withdrawn]
        exact (side.disarm _ _ id (Laws.State.closeOwnItems_wellFormed formed id) closed).carry (.equal rfl rfl rfl rfl)
      rw [cancels]
      exact (side.removeOccurrence (fun _ _ unowned framed => withoutRecord_carries unowned framed) formedWithdrawn
        withdrawnKept).carry (.equal rfl rfl rfl rfl)

/-- The completion pipeline's own phases keep the lane's slot invariant but its numbering where they keep
`WellFormed`: starting a reservation begins its record in place, removing an occurrence is
`FrameAlongside.removeOccurrence`, and journalling an end moves nothing it reads. -/
theorem runsFramed_pipelinePhases (pipeline : Laws.Step.PipelinePhases WellFormed) :
    Laws.Step.PipelinePhases fun program s => WellFormed program s ∧ RunsFramed program s where
  startReserved program s occurrence sourceType holds member unnamed := by
    refine ⟨pipeline.startReserved _ _ occurrence sourceType holds.1 member unnamed, ?_⟩
    rw [Laws.State.closeOwnItems_eq]
    suffices started : RunsFramed program (s.startReserved occurrence sourceType).1 from
      started.carry (.equal rfl rfl rfl rfl)
    cases begun : occurrence.begun
    · have starts := Laws.State.startReserved_starts s sourceType begun
      refine holds.2.carry ⟨by rw [starts.slots]; exact .refl _, fun run _ o present _ => ?_,
        fun _ inside => .inl (starts.scopes ▸ inside), fun _ _ _ inside _ => starts.scopes ▸ inside,
        by rw [starts.slots]; exact StoresHeldOrFresh.self s⟩
      rw [starts.occurrences]
      by_cases same : o.id = occurrence.id
      · obtain rfl := Laws.State.nodup_map_eq holds.1.distinct.occurrences present member same
        exact ⟨{ o with begun := true }, List.mem_map.mpr ⟨o, present, by simp⟩, rfl, rfl, rfl⟩
      · exact ⟨o, List.mem_map.mpr ⟨o, present, by simp [same]⟩, rfl, rfl, rfl⟩
    · rw [Laws.State.startReserved_begun s sourceType begun]
      exact holds.2
  removeOccurrence program _ occurrence holds member free :=
    have removed := pipeline.removeOccurrence _ _ occurrence holds.1 member free
    ⟨⟨removed.1, (runsFramed_frameAlongside program).removeOccurrence
      (fun _ _ unowned framed => withoutRecord_carries unowned framed) holds.1 holds.2⟩, removed.2⟩
  recordEnd _ _ key terminal holds := ⟨pipeline.recordEnd _ _ key terminal holds.1, by
    rw [Laws.State.recordEnd_eq]
    exact holds.2.carry (.equal rfl rfl rfl rfl)⟩

/-! ## Under the registered hooks -/

/-- `WellFormed` and the lane's slot invariant but its numbering. -/
def Framed (program : Program) (s : State) : Prop :=
  WellFormed program s ∧ RunsFramed program s

/-- What the numbering lane supplies: every running body after a committed input from a well-formed state that keeps
the slot invariant, and after a committed start, numbers its instances in item order. -/
structure NumberingKept (hooks : Hooks) : Prop where
  step : ∀ program input before after, WellFormed program before → RunsFormed program before →
    Step.step hooks program (some before) input = .ok after → ∀ run ∈ after.slots.multiInstances, NumberedInOrder after run
  start : ∀ program input after, Step.step hooks program none input = .ok after →
    ∀ run ∈ after.slots.multiInstances, NumberedInOrder after run

/-- The registered hooks keep `Framed` where the Multi-Instance hooks do. -/
theorem framed_contract (multiInstance : Proofs.Step.MultiInstanceKeeps Framed) :
    Laws.Step.HookContract Registry.hooks Framed :=
  Proofs.Step.registered_contract_of
    (featureOps_frame Proofs.Step.registeredOps_wellFormed.toFeatureOps runsFramed_frameAlongside) multiInstance
    Proofs.State.stateFacts

/-- `Step`'s phases keep `Framed`. -/
theorem framed_phases : Laws.Step.Phases Framed :=
  phases_alongside Proofs.Step.phases runsFramed_stepAlongside

/-- Clearing an input's journal, outbox, draft and writes keeps `Framed`. -/
theorem framed_reset {program : Program} {s : State} (holds : Framed program s) :
    Framed program { s with journal := [], outbox := [], draft := {}, writes := [] } :=
  ⟨Laws.State.reset_wellFormed holds.1, holds.2.carry (.equal rfl rfl rfl rfl)⟩

/-- A start's fresh instance runs no body. -/
theorem framed_initial (program : Program) (instanceId : String) (variables : List (String × Value))
    (businessKey : Option String) :
    Framed program ((State.initial instanceId variables businessKey).signal (.armScope State.root)) := by
  have none := Laws.State.initial_bodies instanceId variables businessKey
  refine ⟨Proofs.Step.initial_wellFormed program instanceId variables businessKey, ⟨?_, fun run member => ?_⟩⟩
  · rw [RunsKeyed, Laws.State.signal_eq]
    simp [none]
  · rw [Laws.State.signal_eq] at member
    simp [none] at member

/-- A committed input on a running instance keeps `Framed` under the registered hooks, given the Multi-Instance
hooks keep it. -/
theorem framed_stepKeeps (multiInstance : Proofs.Step.MultiInstanceKeeps Framed) {program : Program} {input : Input}
    {before after : State} (holds : Framed program before)
    (ran : Step.step Registry.hooks program (some before) input = .ok after) : Framed program after :=
  Laws.Step.running_keeps (framed_contract multiInstance) framed_phases Proofs.State.stateFacts
    (Laws.Step.complete_keeps (framed_contract multiInstance) framed_phases
      (runsFramed_pipelinePhases Proofs.Step.pipelinePhases) Proofs.State.stateFacts)
    (fun _ _ => framed_reset) holds ran

/-- A committed start makes a `Framed` state under the registered hooks, given the Multi-Instance hooks keep it. -/
theorem framed_start (multiInstance : Proofs.Step.MultiInstanceKeeps Framed) {program : Program} {input : Input}
    {after : State} (ran : Step.step Registry.hooks program none input = .ok after) : Framed program after :=
  Laws.Step.step_keeps (framed_contract multiInstance) framed_phases Proofs.State.stateFacts
    (Laws.Step.complete_keeps (framed_contract multiInstance) framed_phases
      (runsFramed_pipelinePhases Proofs.Step.pipelinePhases) Proofs.State.stateFacts)
    (fun _ _ => framed_reset) (framed_initial program) (fun _ given => by simp at given) ran

/-! ## The lane's statements -/

/-- The registered hooks keep every running body's instances `Apart`, given the Multi-Instance hooks keep `Framed`. -/
theorem registered_instancesApart (multiInstance : Proofs.Step.MultiInstanceKeeps Framed) :
    InstancesApart Registry.hooks := fun _ _ _ run ⟨formed, runs, _, ran⟩ member =>
  have after := framed_stepKeeps multiInstance ⟨formed, runs.framed⟩ ran
  owned_apart after.1 (after.2.framed run member).owned

/-- The registered hooks keep the lane's slot invariant through a committed input, given the Multi-Instance hooks keep
`Framed` and the numbering lane's supply. -/
theorem registered_runsFormed (multiInstance : Proofs.Step.MultiInstanceKeeps Framed)
    (numbering : NumberingKept Registry.hooks) {program : Program} {input : Input} {before after : State}
    (formed : WellFormed program before) (runs : RunsFormed program before)
    (ran : Step.step Registry.hooks program (some before) input = .ok after) :
    WellFormed program after ∧ RunsFormed program after :=
  have framed := framed_stepKeeps multiInstance ⟨formed, runs.framed⟩ ran
  ⟨framed.1, framed.2.formed framed.1 (numbering.step _ _ _ _ formed runs ran)⟩

/-- A committed start keeps the lane's slot invariant under the registered hooks, given the Multi-Instance hooks keep
`Framed` and the numbering lane's supply. -/
theorem registered_runsFormedAtStart (multiInstance : Proofs.Step.MultiInstanceKeeps Framed)
    (numbering : NumberingKept Registry.hooks) : RunsFormedAtStart Registry.hooks := fun _ _ _ ran =>
  have framed := framed_start multiInstance ran
  framed.2.formed framed.1 (numbering.start _ _ _ ran)

/-- Every instance a committed population run holds keeps the lane's slot invariant under the registered hooks, given
the Multi-Instance hooks keep `Framed` and the numbering lane's supply. -/
theorem registered_runsFormedInPopulation (multiInstance : Proofs.Step.MultiInstanceKeeps Framed)
    (numbering : NumberingKept Registry.hooks) : RunsFormedInPopulation Registry.hooks := fun _ _ _ ran member inside =>
  (Laws.Population.runStimuli_held (good := fun program s => WellFormed program s ∧ RunsFormed program s)
    ⟨fun _ _ _ _ holds stepped => registered_runsFormed multiInstance numbering holds.1 holds.2 stepped,
      fun _ _ _ ran => ⟨(framed_start multiInstance ran).1, registered_runsFormedAtStart multiInstance numbering _ _ _ ran⟩⟩
    ran member inside).2

/-- Every running body after a committed input is `Shaped` by its loop under the registered hooks, given the
Multi-Instance hooks keep `Framed` and the numbering lane's supply. -/
theorem registered_runsShaped (multiInstance : Proofs.Step.MultiInstanceKeeps Framed)
    (numbering : NumberingKept Registry.hooks) : RunsShaped Registry.hooks :=
  fun _ _ _ run loop ⟨formed, runs, _, ran⟩ member looped =>
    ((registered_runsFormed multiInstance numbering formed runs ran).2.formed run member).shaped loop looped

/-- A committed input keeps its well-formed before-state's scope occurrences under the registered hooks. -/
theorem registered_stepKeepsScopes : Proofs.Cancellation.StepKeepsScopes Registry.hooks :=
  Proofs.Cancellation.stepKeepsScopes (Proofs.Cancellation.keepsScopes_contract Proofs.Step.registeredOps_wellFormed)
    (Proofs.Cancellation.keepsScopes_phases Proofs.Step.phases)
    (Proofs.Cancellation.keepsScopes_pipelinePhases Proofs.Step.pipelinePhases) Proofs.State.stateFacts

/-- A body whose occurrence goes takes its instances with it under the registered hooks, given the Multi-Instance hooks
keep `Framed`: no slot record of it stays, since each running body's occurrence stands; its instances' scope
occurrences go, since a standing one would keep its parent, the body's scope occurrence, whose owner is the body's
occurrence; and so does what lay in them (`Proofs.Cancellation.outside_removed`). -/
theorem registered_endsWithInstances (multiInstance : Proofs.Step.MultiInstanceKeeps Framed) :
    EndsWithInstances Registry.hooks := by
  intro program before after run index scope ⟨formed, runs, input, ran⟩ member gone slot
  have framed := framed_stepKeeps multiInstance ⟨formed, runs.framed⟩ ran
  have kept := registered_stepKeepsScopes program input before after formed ran
  have each := runs.formed run member
  have removed : scope ∉ scopeIds after := fun stands => by
    obtain ⟨entry, inside, named⟩ := List.mem_map.mp stands
    obtain ⟨placed, placedIn, placedNamed, link⟩ := each.owned.instanceScopes index scope slot
    have old := kept.2 entry inside (named ▸ List.mem_map.mpr ⟨placed, placedIn, placedNamed⟩)
    have same := Laws.State.scope_unique formed.distinct old placedIn (named.trans placedNamed.symm)
    subst same
    obtain ⟨body, bodyIn, bodyNamed⟩ := List.mem_map.mp (Proofs.Cancellation.parent_stands framed.1 inside link)
    have bodyOld := kept.2 body bodyIn (bodyNamed ▸ each.owned.bodyScope)
    obtain ⟨owner, present, ownerNamed, _⟩ :=
      framed.1.owned.scopeOwners body bodyIn _ (each.bodyOwns body bodyOld bodyNamed)
    exact gone (List.mem_map.mpr ⟨owner, present, ownerNamed⟩)
  refine ⟨fun other inside same => ?_, removed, fun occurrence inside =>
    Proofs.Cancellation.outside_removed formed framed.1 kept removed (framed.1.owned.occurrenceScopes occurrence inside)⟩
  obtain ⟨o, present, named, _⟩ := (framed.2.framed other inside).owned.body
  exact gone (List.mem_map.mpr ⟨o, present, named.trans same⟩)

end Kernel.Proofs.MultiInstance
