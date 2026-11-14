module

public import Kernel.Proofs.MultiInstance
public import Kernel.Laws.State.Fire
public import Kernel.Laws.Registry

/-! # Proofs: the Multi-Instance lane's slot invariant carried by the state operations

What the state operations and `Step`'s phases keep of the lane's slot invariant `RunsFormed` but its numbering, which
reads the occurrences' activations and is a fact of its own (`RunsFramed`): its read set is the Multi-Instance runs,
the compensation runs, the scope tree with each scope occurrence's owner, and the body occurrences' element and role, so
a variable write, a queued signal and a journal entry are frames, and so are entering, reserving and issuing, which add
only what is fresh. Removal keeps it because a body that stays has its scope occurrence outside the removed subtree
(`Laws.State.Cleared.bodies`), so its body occurrence, which owns that scope occurrence and lies directly above it,
stays, and so do its instances' scope occurrences, which lie directly below it, but for one the removal leaves itself,
which `LeavesOwned` excludes: an active instance's scope occurrence is owned by no occurrence and holds no handler.
Instances lie `Apart` in every well-formed state, so the lane carries `Owned` instead. The state operations and phases
also keep what an input keeps of its start's bodies (`Since`), which gives `RunsGenerated`. `Kernel.Proofs.MultiInstance.Formed`
carries it through the registered hooks. It reaches the Laws modules of Multi-Instance and Scopes, so it imports the
registry's Laws module, which puts it in every feature's rebuild cone (guard 15). Nothing executable imports this
module.
-/

@[expose] public section

namespace Kernel.Proofs.MultiInstance

open Kernel
open Kernel.Laws.State (WellFormed Within StrictlyWithin scopeIds)
open Kernel.Laws.MultiInstance (LoopOf Owned BodyOwns InstancesUnowned InstancesUnheld RunsKeyed NumberedInOrder
  InstancesPlaced BeginsQueued SequentialSlots ParallelSlots OutputsFit)
open Kernel.Proofs.Cancellation (FrameAlongside StepAlongside Unmoved LeavesOwned StoresHeldOrFresh RunningContext
  ActiveInstance)

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

/-- The lane's slot invariant of a well-formed state from its part without numbering, the numbering and identity of
each running body's instances, and the instance begins still queued. -/
theorem RunsFramed.formed {program : Program} {s : State} (well : WellFormed program s) (framed : RunsFramed program s)
    (numbered : (∀ run ∈ s.slots.multiInstances, NumberedInOrder s run ∧ InstancesPlaced s run) ∧
      BeginsQueued program s) : RunsFormed program s :=
  ⟨framed.keyed, fun run member =>
    have each := framed.framed run member
    ⟨each.owned, fun loop looped => ⟨(each.shaped loop looped).1, (each.shaped loop looped).2.1,
      (each.shaped loop looped).2.2, (numbered.1 run member).1⟩, owned_apart well each.owned, each.bodyOwns, each.unowned,
      each.unheld, (numbered.1 run member).2⟩, numbered.2⟩

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

/-- A running body that stays when a scope occurrence that stands is left, and has no active instance there, keeps what
`RunsFramed` asks of it: its body occurrence and scope occurrence lie outside the left one, and so does each of its
instances' scope occurrences, which lies directly below its body's. -/
theorem leaveScope_framed {program other : Program} {s : State} {scope : ScopeOccurrenceId}
    (formed : WellFormed program s) (present : scope ∈ scopeIds s) (framed : RunsFramed other s)
    {run : MultiInstanceRun} (member : run ∈ (s.leaveScope scope).slots.multiInstances)
    (absent : Iteration.active scope ∉ run.instances) : RunFramed other (s.leaveScope scope) run := by
  have left := Laws.State.leaveScope_left formed present
  obtain ⟨_, bodiesEq, _⟩ := Laws.State.leaveScope_slots s scope
  obtain ⟨fewer, outside⟩ := cleared_bodies formed present (Laws.State.clearInside_cleared formed present [])
  rw [← bodiesEq] at fewer outside
  have each := framed.framed run (fewer.subset member)
  have away := outside run member
  have entryOf : ∀ entry ∈ (s.leaveScope scope).scopes, entry ∈ s.scopes := fun _ inside =>
    left.scopesSublist.subset inside
  have kept : ∀ entry ∈ s.scopes, (entry.id = run.scope ∨ Iteration.active entry.id ∈ run.instances) →
      entry ∈ (s.leaveScope scope).scopes := fun entry inside which => by
    refine (left.scopes entry).mpr ⟨inside, fun within => ?_⟩
    rcases which with named | active
    · exact away (named ▸ within)
    · exact absent ((outside_body formed each away).2 entry inside active within ▸ active)
  refine ⟨⟨?_, ?_, fun index found slot => ?_, each.owned.ownScopes⟩, each.shaped,
    fun entry inside named => each.bodyOwns entry (entryOf entry inside) named,
    fun found active entry inside named => each.unowned found active entry (entryOf entry inside) named,
    fun found active holder held => each.unheld found active holder (left.slots.runs holder held)⟩
  · obtain ⟨o, stands, named, rest⟩ := each.owned.body
    exact ⟨o, (left.occurrences o).mpr ⟨stands, (outside_body formed each away).1 o stands named⟩, named, rest⟩
  · obtain ⟨entry, inside, named⟩ := List.mem_map.mp each.owned.bodyScope
    exact List.mem_map.mpr ⟨entry, kept entry inside (.inl named), named⟩
  · obtain ⟨entry, inside, named, link⟩ := each.owned.instanceScopes index found slot
    exact ⟨entry, kept entry inside (.inr (named ▸ List.mem_of_getElem? slot)), named, link⟩

/-- Leaving a scope occurrence that stands and is owned or a running compensation context keeps the invariant: no
running body has an active instance there, whose scope occurrence is owned by no occurrence and holds no handler. -/
theorem leaveScope_runsFramed {program other : Program} {s : State} {scope : ScopeOccurrenceId}
    (formed : WellFormed program s) (present : scope ∈ scopeIds s) (leaves : LeavesOwned s scope)
    (framed : RunsFramed other s) : RunsFramed other (s.leaveScope scope) := by
  obtain ⟨_, bodiesEq, _⟩ := Laws.State.leaveScope_slots s scope
  obtain ⟨fewer, _⟩ := cleared_bodies formed present (Laws.State.clearInside_cleared formed present [])
  rw [← bodiesEq] at fewer
  refine ⟨fewer.map _ |>.nodup framed.keyed, fun run member => leaveScope_framed formed present framed member
    fun active => ?_⟩
  have each := framed.framed run (fewer.subset member)
  rcases leaves with ⟨owned, ownedIn, ownedNamed, rest⟩ | ⟨holder, holderIn, running⟩
  · obtain ⟨owner, owns⟩ := rest
    rw [each.unowned scope active owned ownedIn ownedNamed] at owns
    cases owns
  · exact each.unheld scope active holder holderIn running

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
  signalBegin s _ _ kept := by
    rw [Laws.State.signal_eq]
    exact kept.carry (.equal rfl rfl rfl rfl)
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
  leaveScope _ _ _ formed present leaves kept := leaveScope_runsFramed formed present leaves kept
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
  dequeue _ _ _ _ _ kept := kept.carry (.equal rfl rfl rfl rfl)
  untoken _ _ _ _ _ kept := kept.carry (.equal rfl rfl rfl rfl)
  begin _ s request role sourceType formed _ _ _ _ kept := by
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

/-! ## What an input keeps of its start's bodies

Only an arrival sets a body's slot record afresh, and it arrives on the occurrence whose start the input's draft
journalled last (`Laws.Step.HookContract.arriveMultiInstance`), so an input carries, from its start `b`, that no
occurrence keyed by a body of `b` has a start in the draft (`Unstarted`): such an occurrence was begun at `b`, and a
begin starts an unbegun reservation or a fresh occurrence, under a key no begun one has. Beside it the input carries
what it keeps of the bodies of `b` (`Snapshots`): every other operation keeps a body's record, removes it or records an
instance's output in it. `Unstarted` reads no body's record, so the Multi-Instance hooks keep it through their feature
record (`Proofs.Cancellation.Alongside`); `Snapshots` reads only the records, so each hook keeps it by what it sets
(`Kernel.Proofs.MultiInstance.Formed`). -/

section Since

open Kernel.Laws.State (key)
open Kernel.Laws.MultiInstance (SnapshotFixed Opens recorded)
open Kernel.Laws.Step (EndsStep)
open Kernel.Proofs.Cancellation (Alongside)

/-! ### The invariant -/

/-- What an input keeps of the occurrences its start `b`'s bodies are keyed by: each was issued and begun, and none has
a start in the draft. -/
structure Unstarted (b s : State) : Prop where
  below : ∀ earlier ∈ b.slots.multiInstances, earlier.occurrence < s.nextIssue
  begun : ∀ earlier ∈ b.slots.multiInstances, ∀ o ∈ s.occurrences, o.id = earlier.occurrence → o.begun = true
  unstarted : ∀ earlier ∈ b.slots.multiInstances, ∀ o ∈ s.occurrences, o.id = earlier.occurrence →
    key s o ∉ s.draft.started.map (·.occurrence)

/-- What an input keeps of its start `b`'s bodies: a record keyed by one of them keeps its snapshot, and any other has
a slot. -/
structure Snapshots (b s : State) : Prop where
  fixed : ∀ earlier ∈ b.slots.multiInstances, ∀ run ∈ s.slots.multiInstances, run.occurrence = earlier.occurrence →
    SnapshotFixed earlier run
  generated : ∀ run ∈ s.slots.multiInstances, (∀ earlier ∈ b.slots.multiInstances, earlier.occurrence ≠ run.occurrence) →
    0 < run.instances.length

/-- `WellFormed` and what the input from `b` keeps of `b`'s bodies. -/
def Since (b : State) (program : Program) (s : State) : Prop :=
  WellFormed program s ∧ Unstarted b s ∧ Snapshots b s

/-- What an operation from `s` to `t` keeps of what `Unstarted` reads: every occurrence `t` holds is one of `s` under
the same key, unchanged if begun, or issued since, and the draft's starts stay. -/
structure Moves (s t : State) : Prop where
  issued : s.nextIssue ≤ t.nextIssue
  held : ∀ o' ∈ t.occurrences, (∃ o ∈ s.occurrences, o'.id = o.id ∧ key t o' = key s o ∧ (o.begun = true → o' = o)) ∨
    s.nextIssue ≤ o'.id
  started : t.draft.started = s.draft.started

theorem Moves.ofEnds {s t : State} {spare : Option Nat} (step : EndsStep s t spare)
    (started : t.draft.started = s.draft.started) : Moves s t :=
  ⟨step.issued, fun o' inside => (step.held o' inside).imp_right (·.1), started⟩

theorem Moves.same {s t : State} (occurrences : t.occurrences = s.occurrences) (scopes : t.scopes = s.scopes)
    (named : t.instanceId = s.instanceId) (issued : s.nextIssue ≤ t.nextIssue)
    (started : t.draft.started = s.draft.started) : Moves s t :=
  ⟨issued, fun o' inside => .inl ⟨o', occurrences ▸ inside, rfl,
    Laws.State.key_congr (Laws.State.instanceOf_congr scopes named _), fun _ => rfl⟩, started⟩

/-- An occurrence keyed by a body of `b` that `t` holds is the record `s` held, under the same key. -/
theorem Unstarted.record {b s t : State} (kept : Unstarted b s)
    (held : ∀ o' ∈ t.occurrences, (∃ o ∈ s.occurrences, o'.id = o.id ∧ key t o' = key s o ∧ (o.begun = true → o' = o)) ∨
      s.nextIssue ≤ o'.id)
    {earlier : MultiInstanceRun} (member : earlier ∈ b.slots.multiInstances) {o' : Occurrence}
    (inside : o' ∈ t.occurrences) (named : o'.id = earlier.occurrence) : o' ∈ s.occurrences ∧ key t o' = key s o' := by
  rcases held o' inside with ⟨o, old, same, ⟨keyed, unchanged⟩⟩ | fresh
  · obtain rfl := unchanged (kept.begun earlier member o old (same.symm.trans named))
    exact ⟨old, keyed⟩
  · have := kept.below earlier member
    omega

theorem Unstarted.move {b s t : State} (kept : Unstarted b s) (moves : Moves s t) : Unstarted b t := by
  refine ⟨fun earlier member => Nat.lt_of_lt_of_le (kept.below earlier member) moves.issued,
    fun earlier member o inside named => ?_, fun earlier member o inside named => ?_⟩
  · exact kept.begun earlier member o (kept.record moves.held member inside named).1 named
  · obtain ⟨old, keyed⟩ := kept.record moves.held member inside named
    rw [keyed, moves.started]
    exact kept.unstarted earlier member o old named

/-- A start journalled for an occurrence `t` holds that was no begun occurrence of `s` keeps `Unstarted`: it is a
reservation of `s`, under its key, which no other occurrence has, or fresh, under a key the counters had not issued. -/
theorem Unstarted.start {program : Program} {b s t : State} {spare : Option Nat} {fact : StartedFact}
    {begun : Occurrence} (formed : WellFormed program s) (kept : Unstarted b s) (step : EndsStep s t spare)
    (started : t.draft.started = s.draft.started ++ [fact]) (named : fact.occurrence = key t begun)
    (present : begun ∈ t.occurrences) (unbegun : ∀ o ∈ s.occurrences, o.id = begun.id → o.begun = false) :
    Unstarted b t := by
  have held : ∀ o' ∈ t.occurrences, (∃ o ∈ s.occurrences, o'.id = o.id ∧ key t o' = key s o ∧ (o.begun = true → o' = o)) ∨
      s.nextIssue ≤ o'.id := fun o' inside => (step.held o' inside).imp_right (·.1)
  refine ⟨fun earlier member => Nat.lt_of_lt_of_le (kept.below earlier member) step.issued,
    fun earlier member o inside same => ?_, fun earlier member o inside same => ?_⟩
  · exact kept.begun earlier member o (kept.record held member inside same).1 same
  obtain ⟨old, keyed⟩ := kept.record held member inside same
  rw [started, List.map_append, List.mem_append, keyed]
  rintro (inDraft | newest)
  · exact kept.unstarted earlier member o old same inDraft
  rw [List.map_singleton, List.mem_singleton, named] at newest
  rcases step.held begun present with ⟨r, inS, ids, ⟨rekeyed, _⟩⟩ | ⟨_, uncounted⟩
  · obtain rfl := Laws.State.nodup_map_eq formed.distinct.keys old inS (newest.trans rekeyed)
    have := unbegun o old ids.symm
    rw [kept.begun earlier member o old same] at this
    cases this
  · exact uncounted (newest ▸ formed.occurrencesCounted o old)

theorem Snapshots.shrink {b s t : State} (kept : Snapshots b s)
    (bodies : ∀ run ∈ t.slots.multiInstances, run ∈ s.slots.multiInstances) : Snapshots b t :=
  ⟨fun earlier member run inside same => kept.fixed earlier member run (bodies run inside) same,
    fun run inside apart => kept.generated run (bodies run inside) apart⟩

/-- A record no body of `b` is keyed by is `Generated` with its slot count. -/
theorem Snapshots.generatedOf {b s : State} {run : MultiInstanceRun} (kept : Snapshots b s)
    (member : run ∈ s.slots.multiInstances) :
    (∀ earlier ∈ b.slots.multiInstances, earlier.occurrence ≠ run.occurrence) →
      Laws.MultiInstance.Generated run run.instances.length :=
  fun apart => ⟨rfl, kept.generated run member apart⟩

theorem Snapshots.same {b s t : State} (kept : Snapshots b s)
    (same : t.slots.multiInstances = s.slots.multiInstances) : Snapshots b t :=
  kept.shrink fun _ inside => same ▸ inside

/-- Setting a body's record that keeps the snapshot of a body of `b` it is keyed by, or has a slot, keeps
`Snapshots`. -/
theorem Snapshots.setRun {b s : State} {next : MultiInstanceRun} (kept : Snapshots b s)
    (fixed : ∀ earlier ∈ b.slots.multiInstances, earlier.occurrence = next.occurrence → SnapshotFixed earlier next)
    (generated : (∀ earlier ∈ b.slots.multiInstances, earlier.occurrence ≠ next.occurrence) → 0 < next.instances.length) :
    Snapshots b (Feature.MultiInstance.setRun s next) := by
  refine ⟨fun earlier member run inside same => ?_, fun run inside apart => ?_⟩
  · rcases Laws.MultiInstance.mem_setRun inside with ⟨old, _⟩ | rfl
    · exact kept.fixed earlier member run old same
    · exact fixed earlier member same.symm
  · rcases Laws.MultiInstance.mem_setRun inside with ⟨old, _⟩ | rfl
    · exact kept.generated run old apart
    · exact generated apart

/-! ### Snapshots -/

theorem snapshotFixed_refl (run : MultiInstanceRun) : SnapshotFixed run run :=
  ⟨rfl, rfl, rfl, rfl, rfl, fun _ _ filled => filled⟩

theorem snapshotFixed_trans {first second third : MultiInstanceRun} (one : SnapshotFixed first second)
    (two : SnapshotFixed second third) : SnapshotFixed first third :=
  ⟨two.collection.trans one.collection, two.count.trans one.count, two.scope.trans one.scope,
    two.element.trans one.element, two.occurrence.trans one.occurrence,
    fun index output filled => two.filledStays index output (one.filledStays index output filled)⟩

/-- Recording an active instance's output keeps the body's snapshot. -/
theorem recorded_fixed {run : MultiInstanceRun} {index : Nat} {scope : ScopeOccurrenceId} {output : Option Value}
    (results : List String) (slot : run.instances[index]? = some (.active scope)) :
    SnapshotFixed run (recorded run index output results) := by
  refine ⟨rfl, List.length_set .., rfl, rfl, rfl, fun other filled completed => ?_⟩
  by_cases same : index = other
  · subst same
    rw [slot] at completed
    cases completed
  · simp only [recorded, List.getElem?_set_ne same]
    exact completed

/-- Entering instances keeps the body's snapshot: they open waiting slots only. -/
theorem opens_fixed {s : State} {base next : MultiInstanceRun} {loop : MultiInstance} (opens : Opens s base next loop) :
    SnapshotFixed base next := by
  have field : ∀ {α : Type} (read : MultiInstanceRun → α), (∀ instances, read { base with instances } = read base) →
      read next = read base := fun read keeps => by rw [opens.kept]; exact keeps _
  refine ⟨field (·.collection) fun _ => rfl, opens.length, field (·.scope) fun _ => rfl, field (·.element) fun _ => rfl,
    field (·.occurrence) fun _ => rfl, fun index output filled => ?_⟩
  by_cases named : index ∈ Feature.MultiInstance.opening loop.mode base.instances
  · rw [Laws.MultiInstance.opening_waiting named] at filled
    cases filled
  · rw [opens.unopened index named]
    exact filled

/-! ### The state operations -/

/-- The state operations keep `Unstarted`: each moves the occurrences and keys as `Laws.Step.EndsStep` says and keeps
the draft's starts; the Multi-Instance ones as well, since it reads no body's record. -/
theorem unstarted_alongside (b : State) : Alongside (Unstarted b) where
  frame s _ moved kept := kept.move (.same moved.occurrences moved.scopes moved.instanceId
    (Nat.le_of_eq moved.nextIssue.symm) (by rw [moved.draft]))
  signalBegin s _ _ kept := by
    rw [Laws.State.signal_eq]
    exact kept.move (.same rfl rfl rfl (Nat.le_refl _) rfl)
  issue s kept := by
    rw [Laws.State.issue_eq]
    exact kept.move (.same rfl rfl rfl (Nat.le_succ _) rfl)
  enterScope _ s element parent locals owner formed kept :=
    kept.move (.ofEnds (Laws.Step.enterScope_frame formed element parent locals owner) (by rw [Laws.State.enterScope_eq]))
  enterCalled _ s called call variables definition formed kept :=
    kept.move (.ofEnds (Laws.Step.enterCalled_frame formed called call variables definition)
      (by rw [Laws.State.enterCalled_eq _ _ _ _ _ (Laws.State.scopes_fresh formed)]))
  reserve _ s element scope formed kept :=
    kept.move (.ofEnds (Laws.Step.reserve_frame formed element scope)
      (congrArg (·.started) (Laws.State.reserve_reserves s element scope).draft))
  leaveScope _ _ _ formed present _ kept :=
    kept.move (.ofEnds (Laws.Step.leaveScope_frame formed present) (Laws.State.leaveScope_left formed present).started)
  clearInside _ _ _ keep formed present inside kept :=
    kept.move (.ofEnds (Laws.Step.clearInside_frame formed present inside)
      (Laws.State.clearInside_cleared formed present keep).started)
  disarm _ s host _ kept := kept.move (.ofEnds (Laws.Step.disarm_frame s host) (by rw [Laws.State.disarm_eq]))
  setVariable _ s target name value _ kept :=
    kept.move (.ofEnds (Laws.Step.setVariable_frame s target name value)
      (congrArg (·.started) (Laws.State.setVariable_same s target name value).draft))
  removeVariable _ s target name _ kept :=
    kept.move (.ofEnds (Laws.Step.removeVariable_frame s target name)
      (congrArg (·.started) (Laws.State.removeVariable_same s target name).draft))
  storeRuns _ _ _ _ _ kept := kept.move (.same rfl rfl rfl (Nat.le_refl _) rfl)
  instanceBegin s _ kept := by
    rw [Laws.State.signal_eq]
    exact kept.move (.same rfl rfl rfl (Nat.le_refl _) rfl)
  defer s _ kept := by
    rw [Laws.State.deferBegins_eq]
    exact kept.move (.same rfl rfl rfl (Nat.le_refl _) rfl)
  leaveInstance _ _ _ _ formed _ _ present kept :=
    kept.move (.ofEnds (Laws.Step.leaveScope_frame formed present) (Laws.State.leaveScope_left formed present).started)
  runs _ _ kept := kept.move (.same rfl rfl rfl (Nat.le_refl _) rfl)

/-- The state operations the hooks apply keep `Snapshots`: none sets a body's record, and each keeps or removes
some. -/
theorem snapshots_frameAlongside (b : State) : FrameAlongside (Snapshots b) where
  frame _ _ moved kept := kept.shrink fun _ inside => moved.multiInstances ▸ inside
  signalBegin s _ _ kept := by
    rw [Laws.State.signal_eq]
    exact kept.same rfl
  issue s kept := by
    rw [Laws.State.issue_eq]
    exact kept.same rfl
  enterScope _ s element parent locals owner _ kept := by
    rw [Laws.State.enterScope_eq]
    exact kept.same rfl
  enterCalled _ s called call variables definition formed kept := by
    rw [Laws.State.enterCalled_eq _ _ _ _ _ (Laws.State.scopes_fresh formed)]
    exact kept.same rfl
  reserve _ s element scope _ kept :=
    kept.shrink fun _ inside => (Laws.State.reserve_reserves s element scope).slots ▸ inside
  leaveScope _ _ _ formed present _ kept := kept.shrink (Laws.State.leaveScope_left formed present).slots.bodies
  clearInside _ _ _ keep formed present _ kept :=
    kept.shrink (Laws.State.clearInside_cleared formed present keep).slots.bodies
  disarm _ s host _ kept := by
    rw [Laws.State.disarm_eq]
    exact kept.same rfl
  setVariable _ s target name value _ kept :=
    kept.shrink fun _ inside => (Laws.State.setVariable_same s target name value).slots ▸ inside
  removeVariable _ s target name _ kept :=
    kept.shrink fun _ inside => (Laws.State.removeVariable_same s target name).slots ▸ inside
  storeRuns _ _ _ _ _ kept := kept.same rfl

/-- The state operations keep `Unstarted` and `Snapshots` together. -/
theorem since_frameAlongside (b : State) : FrameAlongside fun s => Unstarted b s ∧ Snapshots b s :=
  have one := (unstarted_alongside b).toFrameAlongside
  have two := snapshots_frameAlongside b
  { frame := fun s t moved kept => ⟨one.frame s t moved kept.1, two.frame s t moved kept.2⟩
    signalBegin := fun s request fits kept => ⟨one.signalBegin s request fits kept.1, two.signalBegin s request fits kept.2⟩
    issue := fun s kept => ⟨one.issue s kept.1, two.issue s kept.2⟩
    enterScope := fun program s element parent locals owner formed kept =>
      ⟨one.enterScope program s element parent locals owner formed kept.1,
        two.enterScope program s element parent locals owner formed kept.2⟩
    enterCalled := fun program s called call variables definition formed kept =>
      ⟨one.enterCalled program s called call variables definition formed kept.1,
        two.enterCalled program s called call variables definition formed kept.2⟩
    reserve := fun program s element scope formed kept =>
      ⟨one.reserve program s element scope formed kept.1, two.reserve program s element scope formed kept.2⟩
    leaveScope := fun program s scope formed present leaves kept =>
      ⟨one.leaveScope program s scope formed present leaves kept.1, two.leaveScope program s scope formed present leaves kept.2⟩
    clearInside := fun program s scope keep formed present inside kept =>
      ⟨one.clearInside program s scope keep formed present inside kept.1,
        two.clearInside program s scope keep formed present inside kept.2⟩
    disarm := fun program s host formed kept => ⟨one.disarm program s host formed kept.1, two.disarm program s host formed kept.2⟩
    setVariable := fun program s target name value formed kept =>
      ⟨one.setVariable program s target name value formed kept.1, two.setVariable program s target name value formed kept.2⟩
    removeVariable := fun program s target name formed kept =>
      ⟨one.removeVariable program s target name formed kept.1, two.removeVariable program s target name formed kept.2⟩
    storeRuns := fun program s compensation formed fresh kept =>
      ⟨one.storeRuns program s compensation formed fresh kept.1, two.storeRuns program s compensation formed fresh kept.2⟩ }

/-- Dropping a record keeps both: it moves no key and no body's record. -/
theorem since_withoutRecord {b t : State} (id : Nat) (kept : Unstarted b t ∧ Snapshots b t) :
    Unstarted b (Laws.State.withoutRecord t id) ∧ Snapshots b (Laws.State.withoutRecord t id) :=
  ⟨kept.1.move (.ofEnds (Laws.Step.withoutRecord_frame t id) rfl), kept.2.same rfl⟩

/-- The start of a begun reservation or a fresh occurrence of a well-formed `s`, which keeps every body's record. -/
theorem since_start {program : Program} {b s t : State} {spare : Option Nat} {fact : StartedFact} {begun : Occurrence}
    (formed : WellFormed program s) (kept : Unstarted b s ∧ Snapshots b s) (step : EndsStep s t spare)
    (started : t.draft.started = s.draft.started ++ [fact]) (named : fact.occurrence = key t begun)
    (present : begun ∈ t.occurrences) (unbegun : ∀ o ∈ s.occurrences, o.id = begun.id → o.begun = false)
    (slots : t.slots = s.slots) : Unstarted b t ∧ Snapshots b t :=
  ⟨kept.1.start formed step started named present unbegun, kept.2.shrink fun _ inside => slots ▸ inside⟩

/-! ### `Step`'s phases -/

/-- `Step`'s phases keep both: journalling empties the draft, a begin starts an admitted reservation, which is unbegun,
or a fresh occurrence, and cancelling withdraws items and removes an occurrence (`FrameAlongside.removeOccurrence`). -/
theorem since_stepAlongside (b : State) : StepAlongside fun s => Unstarted b s ∧ Snapshots b s where
  toFrameAlongside := since_frameAlongside b
  journal _ _ _ _ kept _ _ := ⟨⟨kept.1.below, kept.1.begun, fun _ _ _ _ _ => by simp⟩, kept.2.same rfl⟩
  runOrder _ _ _ kept := ⟨kept.1.move (.same rfl rfl rfl (Nat.le_refl _) rfl), kept.2.same rfl⟩
  dequeue _ _ _ _ _ kept := ⟨kept.1.move (.same rfl rfl rfl (Nat.le_refl _) rfl), kept.2.same rfl⟩
  untoken _ _ _ _ _ kept := ⟨kept.1.move (.same rfl rfl rfl (Nat.le_refl _) rfl), kept.2.same rfl⟩
  begin _ s request role sourceType formed stands admitted _ _ kept := by
    have begins := Laws.State.beginOccurrence_begins formed.activations request role sourceType
    have present : (s.beginOccurrence request role sourceType).2 ∈ (s.beginOccurrence request role sourceType).1.occurrences := by
      rw [begins.occurrences]
      exact List.mem_append_right _ (List.mem_singleton_self _)
    refine since_start formed kept (Laws.Step.beginOccurrence_frame formed stands admitted role sourceType) begins.started
      rfl present (fun o member same => ?_) begins.slots
    rcases begins.source with ⟨reserved, source⟩ | fresh
    · have named : reserved.id ∈ Laws.State.names request := by simp [Laws.State.names, source.named]
      exact ((admitted.2.1 reserved.id named).1.2 o member (same.trans source.id)).1
    · have below := formed.issued.occurrences o member
      rw [same, fresh.id] at below
      exact absurd below (Nat.lt_irrefl _)
  cancel _ s id formed kept := by
    have side := since_frameAlongside b
    cases found : s.occurrence? id with
    | none =>
      rw [Laws.State.cancelOccurrence_absent found]
      exact kept
    | some occurrence =>
      obtain ⟨ended, cancelled, cancels⟩ := Laws.State.cancelOccurrence_some found
      have formedWithdrawn := (Laws.State.withdrawAll
        (((s.closeOwnItems id).disarm id).scopes.filter (·.occurrence == some id)) _
        (Laws.State.disarm_wellFormed (Laws.State.closeOwnItems_wellFormed formed id) id)).1
      obtain ⟨items, withdrawn⟩ := Laws.State.withdrawAll_frame
        (((s.closeOwnItems id).disarm id).scopes.filter (·.occurrence == some id)) ((s.closeOwnItems id).disarm id)
      rw [← Laws.State.withdrawOccurrence_eq] at formedWithdrawn withdrawn
      have closed : Unstarted b (s.closeOwnItems id) ∧ Snapshots b (s.closeOwnItems id) := by
        rw [Laws.State.closeOwnItems_eq]
        exact ⟨kept.1.move (.same rfl rfl rfl (Nat.le_refl _) rfl), kept.2.same rfl⟩
      have disarmed := side.disarm _ _ id (Laws.State.closeOwnItems_wellFormed formed id) closed
      have withdrawnKept : Unstarted b (s.withdrawOccurrence id) ∧ Snapshots b (s.withdrawOccurrence id) := by
        rw [withdrawn]
        exact ⟨disarmed.1.move (.same rfl rfl rfl (Nat.le_refl _) rfl), disarmed.2.same rfl⟩
      have removed := side.removeOccurrence (fun _ id _ kept => since_withoutRecord id kept) (id := id) formedWithdrawn
        withdrawnKept
      rw [cancels]
      exact ⟨removed.1.move (.same rfl rfl rfl (Nat.le_refl _) rfl), removed.2.same rfl⟩

/-- The completion pipeline's own phases keep `Since` where they keep `WellFormed`: starting a reservation starts an
unbegun occurrence, removing one is `FrameAlongside.removeOccurrence`, and journalling an end moves nothing either
reads. -/
theorem since_pipelinePhases (b : State) (pipeline : Laws.Step.PipelinePhases WellFormed) :
    Laws.Step.PipelinePhases (Since b) where
  startReserved program s occurrence sourceType holds member unnamed := by
    refine ⟨pipeline.startReserved _ _ occurrence sourceType holds.1 member unnamed, ?_⟩
    rw [Laws.State.closeOwnItems_eq]
    suffices started : Unstarted b (s.startReserved occurrence sourceType).1 ∧
        Snapshots b (s.startReserved occurrence sourceType).1 from
      ⟨started.1.move (.same rfl rfl rfl (Nat.le_refl _) rfl), started.2.same rfl⟩
    cases begun : occurrence.begun
    · have starts := Laws.State.startReserved_starts s sourceType begun
      have present : { occurrence with begun := true } ∈ (s.startReserved occurrence sourceType).1.occurrences := by
        rw [starts.occurrences]
        exact List.mem_map.mpr ⟨occurrence, member, by simp⟩
      refine since_start (begun := { occurrence with begun := true }) holds.1 holds.2
        (Laws.Step.startReserved_frame holds.1 member sourceType) starts.started rfl present (fun o inside same => ?_)
        starts.slots
      obtain rfl := Laws.State.nodup_map_eq holds.1.distinct.occurrences inside member same
      exact begun
    · rw [Laws.State.startReserved_begun s sourceType begun]
      exact holds.2
  removeOccurrence program _ occurrence holds member free :=
    have removed := pipeline.removeOccurrence _ _ occurrence holds.1 member free
    ⟨⟨removed.1, (since_frameAlongside b).removeOccurrence (fun _ id _ kept => since_withoutRecord id kept) holds.1
      holds.2⟩, removed.2⟩
  recordEnd _ _ key terminal holds := ⟨pipeline.recordEnd _ _ key terminal holds.1, by
    rw [Laws.State.recordEnd_eq]
    exact ⟨holds.2.1.move (.same rfl rfl rfl (Nat.le_refl _) rfl), holds.2.2.same rfl⟩⟩

end Since

end Kernel.Proofs.MultiInstance
