module

public import Kernel.Proofs.MultiInstance
public import Kernel.Laws.State.Fire
public import Kernel.Laws.MultiInstance
public import Kernel.Proofs.MultiInstance.Records
public import Kernel.Proofs.Frame
public import Kernel.Laws.Step.Ends
public import Kernel.Laws.Scopes
public import Kernel.Proofs.MultiInstance.Since
public import Kernel.Proofs.MultiInstance.FramedCompacts
public import Kernel.Proofs.Frame.Both

/-! # Proofs: the Multi-Instance lane's slot invariant carried by the state operations

What the state operations and `Step`'s phases keep of the lane's slot invariant `RunsFormed` but its numbering, which
reads the occurrences' activations and is a fact of its own (`RunsFramed`): its read set is the Multi-Instance runs,
the compensation runs, the scope tree with each scope occurrence's owner, and the body occurrences' element and role, so
a variable write, a queued signal and a journal entry are frames, and so are entering, reserving and issuing, which add
only what is fresh. Removal keeps it because a body that stays has its scope occurrence outside the removed subtree
(`Laws.State.Cleared.bodies`), so its body occurrence, which owns that scope occurrence and lies directly above it,
stays, and so do its instances' scope occurrences, which lie directly below it, but for one the removal leaves itself,
which `LeavesOwned` excludes: an active instance's scope occurrence is owned by no occurrence and holds no handler.
Instances lie `Apart` in every well-formed state, so the lane carries `Owned` instead. `Kernel.Proofs.MultiInstance.Registered`
carries it through the registered hooks, and `Kernel.Proofs.MultiInstance.Since` what an input keeps of its start's
bodies. It reaches the Laws modules of Multi-Instance and Scopes and imports them
directly, so it lies in their rebuild cones alone (guard 15). Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Proofs.MultiInstance

open Kernel
open Kernel.Laws.State (WellFormed Within StrictlyWithin scopeIds)
open Kernel.Laws.MultiInstance (LoopOf Owned BodyOwns InstancesUnowned InstancesUnheld RunsKeyed NumberedInOrder
  InstancesPlaced BeginsQueued UnbegunUnlooped SequentialSlots ParallelSlots OutputsFit)
open Kernel.Proofs.Frame (OccursAlongside FrameAlongside StoresAlongside StepAlongside Unmoved LeavesOwned StoresHeldOrFresh RunningContext
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
each running body's instances, the instance begins still queued, the reservations' elements and the continuations. -/
theorem RunsFramed.formed {program : Program} {s : State} (well : WellFormed program s) (framed : RunsFramed program s)
    (numbered : (∀ run ∈ s.slots.multiInstances, NumberedInOrder s run ∧ InstancesPlaced s run) ∧
      BeginsQueued program s) (unbegun : UnbegunUnlooped program s) (continued : Continued s) : RunsFormed program s :=
  ⟨framed.keyed, fun run member =>
    have each := framed.framed run member
    ⟨each.owned, fun loop looped => ⟨(each.shaped loop looped).1, (each.shaped loop looped).2.1,
      (each.shaped loop looped).2.2, (numbered.1 run member).1⟩, owned_apart well each.owned, each.bodyOwns, each.unowned,
      each.unheld, (numbered.1 run member).2⟩, numbered.2, unbegun, continued⟩

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

/-- No scope occurrence of a well-formed state carries the key its issuer issues next (DC12). -/
theorem counter_fresh {program : Program} {s : State} (formed : WellFormed program s) {parent : ScopeOccurrenceId}
    {element : ElementId} : parent.child element (.fresh s.issuing s.issueNext) ∉ scopeIds s := fun inside => by
  obtain ⟨entry, member, named⟩ := List.mem_map.mp inside
  exact Laws.State.scopes_fresh formed entry member named

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
    rcases Proofs.Frame.Within.up within with same | ⟨child, childIn, childNamed, rest⟩
    · exact same
    · obtain ⟨_, link, above⟩ := rest
      obtain rfl := Laws.State.scope_unique formed.distinct childIn placedIn childNamed
      rw [placedLink] at link
      cases link
      exact absurd above outside

/-- The bodies a clearing of `scope` keeps are those whose scope occurrence lies outside it. -/
theorem cleared_bodies {program : Program} {s t : State} (formed : WellFormed program s) {scope : ScopeOccurrenceId}
    (present : scope ∈ scopeIds s) {keep : List OccurrenceId} (cleared : Laws.State.Cleared s t scope keep) :
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
    (formed : WellFormed program s) (present : scope ∈ scopeIds s) (keep : List OccurrenceId) (framed : RunsFramed other s) :
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

/-- A reservation keeps the lane's slot invariant but its numbering: it adds an occurrence and moves no scope occurrence
or run. -/
theorem reserve_runsFramed {program : Program} (s : State) (element : ElementId) (scope : ScopeOccurrenceId)
    (kept : RunsFramed program s) : RunsFramed program (s.reserve element scope).1 :=
  have reserves := Laws.State.reserve_reserves s element scope
  kept.carry (.grow (fun _ inside => .inl (reserves.scopes ▸ inside)) (fun _ inside => reserves.scopes ▸ inside)
    (congrArg (·.multiInstances) reserves.slots) (congrArg (·.compensation.runs) reserves.slots)
    fun _ present => reserves.occurrences ▸ List.mem_append_left _ present)

/-- The state operations the hooks apply keep the lane's slot invariant but its numbering under any program
(`Proofs.Frame.StoresAlongside`). -/
theorem runsFramed_frameAlongside (program : Program) : StoresAlongside program (RunsFramed program) where
  frame _ _ moved kept :=
    kept.carry (.equal moved.scopes moved.occurrences moved.multiInstances (congrArg (·.runs) moved.compensation))
  emit s _ _ _ _ _ kept := by
    rw [Laws.State.emit_eq]
    exact kept.carry (.equal rfl rfl rfl rfl)
  complete s _ _ _ _ _ kept := by
    rw [Laws.State.signal_eq]
    exact kept.carry (.equal rfl rfl rfl rfl)
  park _ _ _ _ kept := kept.carry (.equal rfl rfl rfl rfl)
  arm s _ _ _ _ _ kept := by
    rw [Laws.State.signal_eq]
    exact kept.carry (.equal rfl rfl rfl rfl)
  armGateway s _ _ _ _ _ _ kept := by
    rw [Laws.State.signal_eq]
    exact kept.carry (.equal rfl rfl rfl rfl)
  raise s _ _ _ _ _ kept := by
    rw [Laws.State.signal_eq]
    exact kept.carry (.equal rfl rfl rfl rfl)
  signalBegin s _ _ _ _ kept := by
    rw [Laws.State.signal_eq]
    exact kept.carry (.equal rfl rfl rfl rfl)
  takePosition s kept := by
    rw [Laws.State.takePosition_eq]
    exact kept.carry (.equal rfl rfl rfl rfl)
  enterScope s element parent locals owner formed stands _ kept := by
    rw [Laws.State.enterScope_eq]
    refine kept.carry (.grow (fun entry inside => ?_) (fun _ inside => List.mem_append_left _ inside) rfl rfl
      fun _ present => present)
    rcases List.mem_append.mp inside with old | new
    · exact .inl old
    · rw [List.mem_singleton.mp new]
      exact .inr (counter_fresh formed)
  reserve s element scope _ _ _ _ kept := reserve_runsFramed s element scope kept
  leaveScope _ _ formed present leaves kept := leaveScope_runsFramed formed present leaves kept
  clearInside _ _ keep formed present _ kept := kept.carry (clearInside_carries formed present keep kept)
  disarm s host formed kept := by
    rw [Laws.State.disarm_eq]
    exact kept.carry (.same rfl rfl rfl (fun _ present begun => List.mem_filter.mpr ⟨present, by simp [begun]⟩)
      (bodies_begun formed))
  setVariable s target name value _ kept :=
    have same := Laws.State.setVariable_same s target name value
    kept.carry (.equal same.scopes same.occurrences (congrArg (·.multiInstances) same.slots)
      (congrArg (·.compensation.runs) same.slots))
  removeVariable s target name _ kept :=
    have same := Laws.State.removeVariable_same s target name
    kept.carry (.equal same.scopes same.occurrences (congrArg (·.multiInstances) same.slots)
      (congrArg (·.compensation.runs) same.slots))
  storeRuns s compensation _ fresh _ _ kept :=
    kept.carry ⟨.refl _, fun _ _ o present _ => ⟨o, present, rfl, rfl, rfl⟩, fun _ inside => .inl inside,
      fun _ _ _ inside _ => inside, fresh⟩

/-- Subscriptions' reservations and queued occurrences keep the lane's slot invariant but its numbering. -/
theorem runsFramed_occursAlongside (program : Program) : OccursAlongside program (RunsFramed program) where
  reserve s element scope _ _ _ _ kept := reserve_runsFramed s element scope kept
  occur s _ _ _ _ _ _ _ _ kept := by
    rw [Laws.State.signal_eq]
    exact kept.carry (.equal rfl rfl rfl rfl)
  compensate s _ _ _ _ _ _ _ _ _ _ kept := by
    rw [Laws.State.signal_eq]
    exact kept.carry (.equal rfl rfl rfl rfl)
  throwCompensate s _ _ _ _ _ _ _ _ _ kept := by
    rw [Laws.State.signal_eq]
    exact kept.carry (.equal rfl rfl rfl rfl)
  raise s _ _ _ _ kept := by
    rw [Laws.State.signal_eq]
    exact kept.carry (.equal rfl rfl rfl rfl)
  enterCalled s call variables definition formed _ _ _ _ _ kept := by
    rw [Laws.State.enterCalled_eq _ _ _ _ _ (Laws.State.scopes_fresh formed)]
    refine kept.carry (.grow (fun entry inside => ?_) (fun _ inside => List.mem_append_left _ inside) rfl rfl
      fun _ present => present)
    rcases List.mem_append.mp inside with old | new
    · exact .inl old
    · rw [List.mem_singleton.mp new]
      exact .inr (counter_fresh formed)

/-- Dropping a record that owns no scope occurrence carries the invariant: it is no running body's body occurrence,
which owns the body's scope occurrence. -/
theorem withoutRecord_carries {program : Program} {t : State} {id : OccurrenceId}
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
removes an occurrence (`FrameAlongside.cancelOccurrence`). -/
theorem runsFramed_stepAlongside (program : Program) : StepAlongside program (RunsFramed program) where
  toFrameAlongside := (runsFramed_frameAlongside program).toFrameAlongside
  journal _ _ _ _ kept _ _ _ := kept.carry (.equal rfl rfl rfl rfl)
  queueBatch _ _ _ kept := by rw [Laws.State.queueBatch_eq]; exact kept.carry (.equal rfl rfl rfl rfl)
  runOrder _ _ _ formed held counted batches keys _ made := by
    have framed := held.framed
    have owned := orderJournal_runsOwned formed counted batches (fun run member =>
      ⟨(framed run member).owned.body, (framed run member).owned.bodyScope, (framed run member).owned.instanceScopes,
        (framed run member).owned.ownScopes⟩) made
    have owns := orderJournal_bodyOwns formed counted batches (fun run member => (framed run member).owned.bodyScope)
      (fun run member => (framed run member).bodyOwns) made
    have unowned := orderJournal_instancesUnowned formed counted batches
      (fun run member => (framed run member).owned.instanceScopes) (fun run member => (framed run member).unowned) made
    have unheld := orderJournal_instancesUnheld formed counted batches
      (fun run member => (framed run member).owned.instanceScopes) (fun run member => (framed run member).unheld) made
    have shaped := orderJournal_shaped (program := program) (fun run member => (framed run member).shaped) made
    refine ⟨orderJournal_runsKeyed formed counted batches keys (fun run member =>
      (framed run member).owned.body.imp fun _ found => ⟨found.1, found.2.1⟩) held.keyed made, fun run member => ?_⟩
    obtain ⟨body, bodyScope, instanceScopes, ownScopes⟩ := owned run member
    exact ⟨⟨body, bodyScope, instanceScopes, ownScopes⟩, shaped run member, owns run member, unowned run member,
      unheld run member⟩
  dequeue _ _ _ _ kept := kept.carry (.equal rfl rfl rfl rfl)
  unqueue _ _ _ kept := kept.carry (.equal rfl rfl rfl rfl)
  untoken _ _ _ kept := kept.carry (.equal rfl rfl rfl rfl)
  begin s request role sourceType formed stands admitted _ _ kept := by
    have begins := Laws.State.beginOccurrence_begins formed.activations request role sourceType
    refine kept.carry ⟨by rw [begins.slots]; exact .refl _, fun run running o present named => ?_,
      fun _ inside => .inl (begins.scopes ▸ inside), fun _ _ _ inside _ => begins.scopes ▸ inside,
      by rw [begins.slots]; exact StoresHeldOrFresh.self s⟩
    rw [begins.occurrences]
    by_cases same : o.id = (s.beginOccurrence request role sourceType).2.id
    · have below := formed.issued.occurrences o present
      rw [same] at below
      rcases begins.source with ⟨reserved, source⟩ | ⟨_, source⟩ | fresh
      · obtain rfl := Laws.State.nodup_map_eq formed.distinct.occurrences present source.member (same.trans source.id)
        exact ⟨_, List.mem_append_right _ (List.mem_singleton_self _), same.symm, source.element, source.role⟩
      · exact (source.fresh formed.issuer stands.mem below).elim
      · exact (fresh.fresh formed.issuer stands.mem below).elim
    · have unnamed : request.reserved ≠ some o.id := fun reserved => by
        rw [begins.slots] at running
        exact (admitted.2.1 o.id (by simp [Laws.State.names, reserved])).2.2.2 (.inr (.inl ⟨run, running, named.symm⟩))
      exact ⟨o, List.mem_append_left _ (List.mem_filter.mpr ⟨present, by simp [same, unnamed]⟩), rfl, rfl, rfl⟩
  cancel s id formed kept := (runsFramed_frameAlongside program).cancelOccurrence
    (fun _ _ unowned framed => withoutRecord_carries unowned framed) (fun _ _ _ kept => kept.carry (.equal rfl rfl rfl rfl))
    (id := id) formed kept

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

open Kernel.Laws.MultiInstance (SnapshotFixed Opens) in
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

open Kernel.Laws.MultiInstance (SnapshotFixed) in
/-- Setting a body's record that keeps the snapshot of a body of `b` it is keyed by, or has a slot, keeps
`Snapshots`. -/
theorem Snapshots.setRun {b s : State} {next : MultiInstanceRun} (kept : Snapshots b s)
    (fixed : ∀ earlier ∈ b.slots.multiInstances, earlier.occurrence = next.occurrence → SnapshotFixed earlier next)
    (generated : (∀ earlier ∈ b.slots.multiInstances, earlier.occurrence ≠ next.occurrence) → 0 < next.instances.length) :
    Snapshots b (Feature.MultiInstance.setRun s next) := by
  refine ⟨fun earlier member run inside same => ?_, fun run inside apart => ?_⟩
  · rcases mem_setRun inside with ⟨old, _⟩ | rfl
    · exact kept.fixed earlier member run old same
    · exact fixed earlier member same.symm
  · rcases mem_setRun inside with ⟨old, _⟩ | rfl
    · exact kept.generated run old apart
    · exact generated apart

/-! ## What an input keeps of its start's bodies beside the slot invariant

Ordering the journal compacts the closure's identities, so `Since`'s parts across it read the running bodies'
occurrences (`Owned.body`), which the slot invariant carries, and the input's start `b` at the lane's entry: committed
and well-formed, with its bodies in its scope occurrences (`Owned.bodyScope`), so the commit's renaming fixes their keys. -/

/-- `Since` of `b` beside the lane's slot invariant. -/
abbrev SinceFramed (b : State) (program : Program) (s : State) : Prop :=
  WellFormed program s ∧ ((Unstarted b s ∧ Snapshots b s) ∧ RunsFramed program s)

/-- `Step`'s phases keep `Unstarted` and `Snapshots` of `b` beside `RunsFramed`. -/
theorem sinceFramed_stepAlongside {programBefore : Program} {b : State} (formedBefore : WellFormed programBefore b)
    (committed : Laws.State.Committed b) (bodyScopes : ∀ earlier ∈ b.slots.multiInstances, earlier.scope ∈ scopeIds b)
    (program : Program) : StepAlongside program fun s => (Unstarted b s ∧ Snapshots b s) ∧ RunsFramed program s :=
  { Proofs.Frame.closureAlongside_both (since_closureAlongside b program)
      (runsFramed_stepAlongside program).toClosureAlongside with
    runOrder := fun start s log formed held counted batches keys after made =>
      have bodies : ∀ run ∈ s.slots.multiInstances, ∃ occurrence ∈ s.occurrences, occurrence.id = run.occurrence :=
        fun run member => (held.2.framed run member).owned.body.imp fun _ found => ⟨found.1, found.2.1⟩
      have unstarted := orderJournal_unstarted formedBefore committed formed counted batches keys held.1.1.below
        held.1.1.begun held.1.1.unstarted made
      have snapshots := orderJournal_snapshots formedBefore committed bodyScopes formed counted batches keys bodies
        held.1.1.below (fun earlier member run inside same => let fixed := held.1.2.fixed earlier member run inside same
          ⟨fixed.collection, fixed.count, fixed.scope, fixed.element, fixed.occurrence, fixed.filledStays⟩)
        held.1.2.generated made
      ⟨⟨⟨unstarted.1, unstarted.2.1, unstarted.2.2⟩, ⟨fun earlier member run inside same =>
          let kept := snapshots.1 earlier member run inside same
          { collection := kept.1, count := kept.2.1, scope := kept.2.2.1, element := kept.2.2.2.1,
            occurrence := kept.2.2.2.2.1, filledStays := kept.2.2.2.2.2 }, snapshots.2⟩⟩,
        (runsFramed_stepAlongside program).runOrder start s log formed held.2 counted batches keys after made⟩ }

end Kernel.Proofs.MultiInstance
