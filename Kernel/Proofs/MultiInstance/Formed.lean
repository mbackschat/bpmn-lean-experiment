module

public import Kernel.Proofs.MultiInstance.Framed
public import Kernel.Proofs.MultiInstance.Hooks
public import Kernel.Proofs.MultiInstance.Continued
public import Kernel.Laws.MultiInstance
public import Kernel.Laws.Scopes

/-! # Proofs: what the Multi-Instance hooks keep of the lane's slot invariant

What setting a body's slot record keeps of the lane's slot invariant but its numbering (`RunsFramed`,
`Kernel.Proofs.MultiInstance.Framed`), the pair `Framed` with `WellFormed`, and what the numbering lane supplies the
lane's statements (`NumberingKept`). `Kernel.Proofs.MultiInstance.Registered` composes them under the registered hooks.
Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Proofs.MultiInstance

open Kernel
open Kernel.Laws.State (WellFormed Within scopeIds)
open Kernel.Laws.MultiInstance (LoopOf Owned BodyOwns InstancesUnowned InstancesUnheld RunsKeyed NumberedInOrder
  InstancesPlaced BeginsQueued IdsUnique SequentialSlots OutputsFit)

/-! ## What the Multi-Instance hooks keep

A hook sets a body's slot record (`MultiInstance.setRun`) after entering and queuing its instances, which adds only
fresh scope occurrences (`Laws.MultiInstance.Begun`), or after leaving a completed instance's scope occurrence
(`Laws.MultiInstance.leftWith`). The record it sets keeps what `RunPlaced` asks of the one it replaces, since an opened
slot is active in a scope occurrence entered for it below the body's (`Laws.MultiInstance.EnteredFor`), and the slot
shapes of its loop's mode, since a sequential body opens a slot only while none is active and then the first waiting one
(`Laws.MultiInstance.opening_idle`). -/

/-- `RunFramed` but the slot shapes, which an opening changes by the loop's mode (`opens_shaped`). -/
structure RunPlaced (s : State) (run : MultiInstanceRun) : Prop where
  owned : Owned s run
  bodyOwns : BodyOwns s run
  unowned : InstancesUnowned s run
  unheld : InstancesUnheld s run

/-- `RunFramed` but the slot shapes. -/
theorem RunFramed.placed {program : Program} {s : State} {run : MultiInstanceRun} (framed : RunFramed program s run) :
    RunPlaced s run :=
  ⟨framed.owned, framed.bodyOwns, framed.unowned, framed.unheld⟩

/-- `RunPlaced` with the slot shapes of every loop the body's element carries. -/
theorem RunPlaced.framed {program : Program} {s : State} {run : MultiInstanceRun} (placed : RunPlaced s run)
    (shaped : ∀ loop, LoopOf program run.element loop → SlotsShaped run loop) : RunFramed program s run :=
  ⟨placed.owned, shaped, placed.bodyOwns, placed.unowned, placed.unheld⟩

/-- `RunPlaced` reads only the scope occurrences, the occurrences and the compensation runs. -/
theorem RunPlaced.transport {s t : State} {run : MultiInstanceRun} (placed : RunPlaced s run)
    (scopes : t.scopes = s.scopes) (occurrences : t.occurrences = s.occurrences)
    (runs : t.slots.compensation.runs = s.slots.compensation.runs) : RunPlaced t run := by
  refine ⟨⟨occurrences ▸ placed.owned.body, by rw [scopes]; exact placed.owned.bodyScope,
    fun index scope slot => scopes ▸ placed.owned.instanceScopes index scope slot, placed.owned.ownScopes⟩,
    fun entry inside named => placed.bodyOwns entry (scopes ▸ inside) named,
    fun scope active entry inside named => placed.unowned scope active entry (scopes ▸ inside) named,
    fun scope active other held => placed.unheld scope active other (runs ▸ held)⟩

/-- Setting a body's slot record that keeps what `RunFramed` asks of it, in a state with one record per body
occurrence whose records of other occurrences keep it, keeps the invariant. -/
theorem setRun_framed {program : Program} {s : State} {next : MultiInstanceRun} (keyed : RunsKeyed s)
    (others : ∀ run ∈ s.slots.multiInstances, run.occurrence ≠ next.occurrence → RunFramed program s run)
    (fresh : RunFramed program s next) : RunsFramed program (Feature.MultiInstance.setRun s next) := by
  have same := Laws.MultiInstance.setRun_eq s next
  have move : ∀ {run}, RunFramed program s run → RunFramed program (Feature.MultiInstance.setRun s next) run :=
    fun each => (each.placed.transport (by rw [same]) (by rw [same]) (by rw [same])).framed each.shaped
  refine ⟨setRun_keyed keyed next, fun run member => ?_⟩
  rcases mem_setRun member with ⟨held, differs⟩ | rfl
  · exact move (others run held differs)
  · exact move fresh

/-- No scope occurrence of a well-formed state carries a key it has not issued. -/
theorem issued_fresh {program : Program} {s : State} (formed : WellFormed program s) {scope : ScopeOccurrenceId}
    (fresh : ¬ Laws.State.ScopeIssued s scope) : scope ∉ scopeIds s := fun inside => by
  obtain ⟨entry, member, named⟩ := List.mem_map.mp inside
  have below := formed.issued.scopes entry member
  rw [named] at below
  exact fresh below

/-- Entering and queuing a body's instances keeps the invariant: they add only fresh scope occurrences and keep every
occurrence, scope occurrence and slot. -/
theorem begun_framed {program : Program} {inv : State → Prop} {settled : State → OccurrenceId → Prop} {ctx : Ctx}
    {loop : MultiInstance} {state queued : State} {run : MultiInstanceRun} {instances : List Iteration}
    (formed : WellFormed program state) (framed : RunsFramed program state)
    (begun : Laws.MultiInstance.Begun inv settled ctx loop state run queued instances) : RunsFramed program queued :=
  framed.carry (.grow (fun entry inside => (begun.scopes entry inside).imp_right (issued_fresh formed)) begun.kept
    (congrArg (·.multiInstances) begun.slots) (congrArg (·.compensation.runs) begun.slots)
    fun _ present => begun.occurrences ▸ present)

/-- The slot record entering and queuing a body's instances sets keeps what `RunPlaced` asks of the one it opens. -/
theorem begun_placed {program : Program} {inv : State → Prop} {settled : State → OccurrenceId → Prop} {ctx : Ctx}
    {loop : MultiInstance} {state queued : State} {run : MultiInstanceRun} {instances : List Iteration}
    (formed : WellFormed program state) (begun : Laws.MultiInstance.Begun inv settled ctx loop state run queued instances)
    (placed : RunPlaced state run) : RunPlaced queued { run with instances } := by
  have opens := begun.opens
  have old : ∀ scope, scope ∈ scopeIds state → ∀ entry ∈ queued.scopes, entry.id = scope → entry ∈ state.scopes :=
    fun _ known entry inside named =>
      (begun.scopes entry inside).resolve_right fun fresh => issued_fresh formed fresh (named ▸ known)
  have activeOld : ∀ scope, Iteration.active scope ∈ run.instances → scope ∈ scopeIds state := fun scope active => by
    obtain ⟨index, slot⟩ := List.mem_iff_getElem?.mp active
    obtain ⟨entry, inside, named, _⟩ := placed.owned.instanceScopes index scope slot
    exact List.mem_map.mpr ⟨entry, inside, named⟩
  have slotOf : ∀ (index : Nat) (scope : ScopeOccurrenceId), instances[index]? = some (.active scope) →
      Laws.MultiInstance.EnteredFor queued run scope ∨ run.instances[index]? = some (.active scope) := by
    intro index scope slot
    by_cases inside : index ∈ Feature.MultiInstance.opening loop.mode run.instances
    · obtain ⟨found, slot', entered⟩ := opens.opened index inside
      have same : instances[index]? = some (.active found) := slot'
      rw [slot] at same
      obtain rfl := Iteration.active.inj (Option.some.inj same)
      exact .inl entered
    · exact .inr ((opens.unopened index inside).symm.trans slot)
  refine ⟨⟨?_, ?_, fun index scope slot => ?_, fun first second scope one two => ?_⟩, fun entry inside named =>
    placed.bodyOwns entry (old run.scope placed.owned.bodyScope entry inside named) named,
    fun scope active entry inside named => ?_, fun scope active other held => ?_⟩
  · obtain ⟨o, present, named, rest⟩ := placed.owned.body
    exact ⟨o, begun.occurrences ▸ present, named, rest⟩
  · obtain ⟨entry, inside, named⟩ := List.mem_map.mp placed.owned.bodyScope
    exact List.mem_map.mpr ⟨entry, begun.kept entry inside, named⟩
  · rcases slotOf index scope slot with entered | earlier
    · obtain ⟨entry, inside, named⟩ := List.mem_map.mp entered.1
      exact ⟨entry, inside, named, (entered.2.1 entry inside named).1⟩
    · obtain ⟨entry, inside, named, link⟩ := placed.owned.instanceScopes index scope earlier
      exact ⟨entry, begun.kept entry inside, named, link⟩
  · by_cases opened : first ∈ Feature.MultiInstance.opening loop.mode run.instances
    · exact opens.apart first second scope opened one two
    · by_cases other : second ∈ Feature.MultiInstance.opening loop.mode run.instances
      · exact (opens.apart second first scope other two one).symm
      · exact placed.owned.ownScopes first second scope ((opens.unopened first opened).symm.trans one)
          ((opens.unopened second other).symm.trans two)
  · obtain ⟨index, slot⟩ := List.mem_iff_getElem?.mp active
    rcases slotOf index scope slot with entered | earlier
    · exact (entered.2.1 entry inside named).2
    · have was := List.mem_of_getElem? earlier
      exact placed.unowned scope was entry (old scope (activeOld scope was) entry inside named) named
  · obtain ⟨index, slot⟩ := List.mem_iff_getElem?.mp active
    rcases slotOf index scope slot with entered | earlier
    · exact entered.2.2.1 other held
    · exact placed.unheld scope (List.mem_of_getElem? earlier) other (begun.slots ▸ held)

/-- A sequential body's slots split at its running instance: every slot before it is filled, every one after it waits,
and a slot active in the running instance's scope occurrence is the one after the filled ones. -/
theorem sequential_split {run : MultiInstanceRun} {index : Nat} {scope : ScopeOccurrenceId}
    (shaped : SequentialSlots run) (slot : run.instances[index]? = some (.active scope)) :
    ∃ filled waiting, run.instances = filled ++ .active scope :: waiting ∧ index = filled.length ∧
      (∀ slot ∈ filled, ∃ output, slot = .completed output) ∧ ∀ slot ∈ waiting, slot = .waiting := by
  obtain ⟨filled, current, ⟨waiting, split, rest⟩⟩ := shaped
  obtain ⟨done, short, _, idle⟩ := rest
  have found := slot
  rw [split] at found
  have notFilled : ¬ index < filled.length := fun lower => by
    rw [List.append_assoc, List.getElem?_append_left lower] at found
    obtain ⟨output, same⟩ := done _ (List.mem_of_getElem? found)
    cases same
  have notWaiting : ¬ filled.length + current.length ≤ index := fun upper => by
    rw [List.getElem?_append_right (by simpa using upper)] at found
    cases idle _ (List.mem_of_getElem? found)
  rcases current with _ | ⟨only, _ | ⟨extra, more⟩⟩
  · simp at notWaiting
    omega
  · have at_ : index = filled.length := by simp at notWaiting; omega
    subst at_
    rw [List.append_assoc, List.getElem?_append_right (Nat.le_refl _)] at found
    simp at found
    subst found
    exact ⟨filled, waiting, by simp [split], rfl, done, idle⟩
  · simp at short

/-- The slot record an opening sets has the slot shapes of its loop's mode, from a record that had a sequential body's
shape, and keeps the filled slots' outputs. -/
theorem opens_shaped {s : State} {base next : MultiInstanceRun} {loop : MultiInstance}
    (opens : Laws.MultiInstance.Opens s base next loop) (sequential : loop.mode = .sequential → SequentialSlots base)
    (fits : OutputsFit base loop) : SlotsShaped next loop := by
  have slotOf : ∀ (index : Nat) (slot : Iteration), next.instances[index]? = some slot →
      (∃ scope, slot = .active scope) ∨
        (index ∉ Feature.MultiInstance.opening loop.mode base.instances ∧ base.instances[index]? = some slot) := by
    intro index slot found
    by_cases inside : index ∈ Feature.MultiInstance.opening loop.mode base.instances
    · obtain ⟨scope, slot', _⟩ := opens.opened index inside
      rw [found] at slot'
      exact .inl ⟨scope, Option.some.inj slot'⟩
    · exact .inr ⟨inside, (opens.unopened index inside).symm.trans found⟩
  refine ⟨fun mode => ?_, fun mode slot member => ?_, fun output member => ?_⟩
  · have unopened := opens.unopened
    rw [mode] at unopened
    have same : (∀ index, index ∉ Feature.MultiInstance.opening .sequential base.instances) →
        next.instances = base.instances := fun none => List.ext_getElem? fun index => unopened index (none index)
    by_cases running : ∃ scope, Iteration.active scope ∈ base.instances
    · have equal := same fun index inside => by simp [Laws.MultiInstance.opening_running running] at inside
      obtain ⟨filled, current, ⟨waiting, split, rest⟩⟩ := sequential mode
      exact ⟨filled, current, waiting, equal.trans split, rest⟩
    · have idle : ∀ scope, Iteration.active scope ∉ base.instances := fun scope active => running ⟨scope, active⟩
      obtain ⟨filled, current, ⟨waiting, split, rest⟩⟩ := sequential mode
      obtain ⟨done, _, active, waits⟩ := rest
      have noCurrent : current = [] := List.eq_nil_iff_forall_not_mem.mpr fun slot inside => by
        obtain ⟨scope, rfl⟩ := active slot inside
        exact idle scope (by rw [split]; simp [inside])
      subst noCurrent
      simp only [List.append_nil] at split
      have notWaiting : ∀ (index : Nat) (slot : Iteration), filled[index]? = some slot → slot ≠ .waiting := fun index slot found same => by
        obtain ⟨output, rfl⟩ := done slot (List.mem_of_getElem? found)
        cases same
      rcases waiting with _ | ⟨first, rest⟩
      · have equal := same fun index inside => by
          have waiting := ((Laws.MultiInstance.opening_idle idle).mp inside).1
          rw [split, List.append_nil] at waiting
          exact notWaiting index _ waiting rfl
        exact ⟨filled, [], [], equal.trans (by rw [split]; simp), done, by simp, by simp, by simp⟩
      · have first_eq : first = .waiting := waits first (List.mem_cons_self ..)
        subst first_eq
        have opened : filled.length ∈ Feature.MultiInstance.opening .sequential base.instances :=
          (Laws.MultiInstance.opening_idle idle).mpr ⟨by rw [split]; simp, fun earlier lower found => by
            rw [split, List.getElem?_append_left lower] at found
            exact notWaiting earlier _ found rfl⟩
        have onlyOne : ∀ index ∈ Feature.MultiInstance.opening .sequential base.instances, index = filled.length := by
          intro index inside
          obtain ⟨waiting, least⟩ := (Laws.MultiInstance.opening_idle idle).mp inside
          rcases Nat.lt_trichotomy index filled.length with lower | equal | upper
          · rw [split, List.getElem?_append_left lower] at waiting
            exact (notWaiting index _ waiting rfl).elim
          · exact equal
          · exact (least filled.length upper (by rw [split]; simp)).elim
        obtain ⟨scope, slot, _⟩ := opens.opened filled.length (by rw [mode]; exact opened)
        have below : filled.length < base.instances.length := by rw [split]; simp
        refine ⟨filled, [.active scope], rest, ?_, done, by simp, by simp, fun slot inside => waits slot
          (List.mem_cons_of_mem _ inside)⟩
        have set : next.instances = base.instances.set filled.length (.active scope) := by
          refine List.ext_getElem? fun index => ?_
          by_cases at_ : index = filled.length
          · subst at_
            rw [List.getElem?_set_self below]
            exact slot
          · rw [List.getElem?_set_ne (Ne.symm at_)]
            exact unopened index fun inside => at_ (onlyOne index inside)
        rw [set, split]
        simp
  · obtain ⟨index, found⟩ := List.mem_iff_getElem?.mp member
    rcases slotOf index slot found with ⟨scope, rfl⟩ | ⟨outside, earlier⟩
    · exact fun same => by cases same
    · intro same
      subst same
      rw [mode] at outside
      exact outside (Laws.MultiInstance.opening_parallel.mpr earlier)
  · obtain ⟨index, found⟩ := List.mem_iff_getElem?.mp member
    rcases slotOf index _ found with ⟨scope, same⟩ | ⟨_, earlier⟩
    · cases same
    · have collection : next.collection = base.collection := by rw [opens.kept]
      exact collection ▸ fits output (List.mem_of_getElem? earlier)

/-- The slot record an instance's completion sets keeps the slot shapes of its loop's mode: a sequential body's running
slot becomes its last filled one. -/
theorem recorded_shaped {program : Program} {run : MultiInstanceRun} {loop : MultiInstance} {index : Nat}
    {scope : ScopeOccurrenceId} {output : Option Value} {results : List String} (shaped : SlotsShaped run loop)
    (slot : run.instances[index]? = some (.active scope)) (fresh : Laws.MultiInstance.OutputFits program run output)
    (looped : LoopOf program run.element loop) :
    SlotsShaped (Laws.MultiInstance.recorded run index output results) loop := by
  refine ⟨fun mode => ?_, fun mode slot member same => ?_, recorded_fits shaped.2.2 fresh looped⟩
  · obtain ⟨filled, waiting, ⟨split, at_, ⟨done, waits⟩⟩⟩ := sequential_split (shaped.1 mode) slot
    refine ⟨filled ++ [.completed output], [], waiting, ?_, fun slot inside => ?_, by simp, by simp, waits⟩
    · show run.instances.set index (.completed output) = _
      rw [split, at_]
      simp
    · rcases List.mem_append.mp inside with old | new
      · exact done slot old
      · exact ⟨output, List.mem_singleton.mp new⟩
  · subst same
    rcases List.mem_or_eq_of_mem_set member with old | new
    · exact shaped.2.1 mode _ old rfl
    · cases new

/-- Leaving an active instance's scope occurrence and recording its slot with an output that fits keeps the invariant:
the body stays outside the left scope occurrence, which lies directly below its own, and so do its other instances,
which are siblings of the left one; a body of another occurrence has no instance there, since an instance's scope
occurrence lies directly below one body scope occurrence, which one body occurrence owns. -/
theorem leftWith_framed {program : Program} {s : State} {run : MultiInstanceRun} {index : Nat}
    {scope : ScopeOccurrenceId} {output : Option Value} {results : List String} (formed : WellFormed program s)
    (framed : RunsFramed program s) (member : run ∈ s.slots.multiInstances)
    (slot : run.instances[index]? = some (.active scope)) (fits : Laws.MultiInstance.OutputFits program run output) :
    RunsFramed program (Laws.MultiInstance.leftWith s scope (Laws.MultiInstance.recorded run index output results)) := by
  have each := framed.framed run member
  obtain ⟨placed, placedIn, placedNamed, placedLink⟩ := each.owned.instanceScopes index scope slot
  have present : scope ∈ scopeIds s := List.mem_map.mpr ⟨placed, placedIn, placedNamed⟩
  have away : ¬ Within s run.scope scope := placedNamed ▸ Laws.State.parent_not_within formed placedIn placedLink
  have left := Laws.State.leaveScope_left formed present
  obtain ⟨_, bodiesEq, _⟩ := Laws.State.leaveScope_slots s scope
  obtain ⟨fewer, _⟩ := cleared_bodies formed present (Laws.State.clearInside_cleared formed present [])
  rw [← bodiesEq] at fewer
  have entryOf : ∀ entry ∈ (s.leaveScope scope).scopes, entry ∈ s.scopes := fun _ inside =>
    left.scopesSublist.subset inside
  have others : ∀ other ∈ (s.leaveScope scope).slots.multiInstances,
      other.occurrence ≠ (Laws.MultiInstance.recorded run index output results).occurrence →
      RunFramed program (s.leaveScope scope) other := by
    intro other inside differs
    refine leaveScope_framed formed present framed inside fun active => differs ?_
    obtain ⟨at_, found⟩ := List.mem_iff_getElem?.mp active
    have theirs := framed.framed other (fewer.subset inside)
    obtain ⟨entry, entryIn, entryNamed, entryLink⟩ := theirs.owned.instanceScopes at_ scope found
    obtain rfl := Laws.State.scope_unique formed.distinct entryIn placedIn (entryNamed.trans placedNamed.symm)
    rw [placedLink] at entryLink
    obtain ⟨body, bodyIn, bodyNamed⟩ := List.mem_map.mp each.owned.bodyScope
    have mine := each.bodyOwns body bodyIn bodyNamed
    rw [theirs.bodyOwns body bodyIn (bodyNamed.trans (Option.some.inj entryLink))] at mine
    exact Option.some.inj mine
  refine setRun_framed (fewer.map _ |>.nodup framed.keyed) others ?_
  have notHere : ∀ (other : Nat) (found : ScopeOccurrenceId),
      (Laws.MultiInstance.recorded run index output results).instances[other]? = some (.active found) →
      other ≠ index ∧ run.instances[other]? = some (.active found) := fun other found active => by
    have differs : other ≠ index := fun same => by
      rw [same, show (Laws.MultiInstance.recorded run index output results).instances =
        run.instances.set index (.completed output) from rfl,
        List.getElem?_set_self (List.getElem?_eq_some_iff.mp slot).1] at active
      cases active
    exact ⟨differs, by
      rw [show (Laws.MultiInstance.recorded run index output results).instances =
        run.instances.set index (.completed output) from rfl, List.getElem?_set_ne (Ne.symm differs)] at active
      exact active⟩
  have activeOf : ∀ found, Iteration.active found ∈ (Laws.MultiInstance.recorded run index output results).instances →
      Iteration.active found ∈ run.instances := fun found active => by
    obtain ⟨other, at_⟩ := List.mem_iff_getElem?.mp active
    exact List.mem_of_getElem? (notHere other found at_).2
  refine ⟨⟨?_, ?_, fun other found active => ?_, fun first second found one two => ?_⟩, fun loop looped =>
    recorded_shaped (each.shaped loop looped) slot fits looped, fun entry inside named => each.bodyOwns entry
    (entryOf entry inside) named, fun found active entry inside named => each.unowned found (activeOf found active)
    entry (entryOf entry inside) named, fun found active holder held => each.unheld found (activeOf found active) holder
    (left.slots.runs holder held)⟩
  · obtain ⟨o, stands, named, rest⟩ := each.owned.body
    exact ⟨o, (left.occurrences o).mpr ⟨stands, (outside_body formed each away).1 o stands named⟩, named, rest⟩
  · obtain ⟨entry, inside, named⟩ := List.mem_map.mp each.owned.bodyScope
    exact List.mem_map.mpr ⟨entry, (left.scopes entry).mpr ⟨inside, fun within => away (named ▸ within)⟩, named⟩
  · obtain ⟨differs, earlier⟩ := notHere other found active
    obtain ⟨entry, inside, named, link⟩ := each.owned.instanceScopes other found earlier
    refine ⟨entry, (left.scopes entry).mpr ⟨inside, fun within => differs ?_⟩, named, link⟩
    have same := (outside_body formed each away).2 entry inside (named ▸ List.mem_of_getElem? earlier) within
    rw [named.symm.trans same] at earlier
    exact each.owned.ownScopes other index scope earlier slot
  · exact each.owned.ownScopes first second found (notHere first found one).2 (notHere second found two).2

/-! ## The supplies -/

/-- `WellFormed` and the lane's slot invariant but its numbering. -/
def Framed (program : Program) (s : State) : Prop :=
  WellFormed program s ∧ RunsFramed program s

/-- What the numbering lane supplies: after a committed input from a well-formed state that keeps the slot invariant,
and after a committed start, every running body numbers its instances in item order and each instance is the one
occurrence of the Activity in its scope occurrence, and the instance begins still queued are in order, under a program
whose identifiers are unique. The registered hooks supply it (`registered_numberingKept`). -/
structure NumberingKept (hooks : Hooks) : Prop where
  step : ∀ program input before after, IdsUnique program → WellFormed program before → Laws.State.Committed before →
    RunsFormed program before → Step.step hooks program (some before) input = .ok after →
      (∀ run ∈ after.slots.multiInstances, NumberedInOrder after run ∧ InstancesPlaced after run) ∧
        BeginsQueued program after
  start : ∀ program input after, IdsUnique program → Step.step hooks program none input = .ok after →
    (∀ run ∈ after.slots.multiInstances, NumberedInOrder after run ∧ InstancesPlaced after run) ∧
      BeginsQueued program after

/-! ## What the Multi-Instance hooks keep of a running body's snapshot

`Snapshots` (`Kernel.Proofs.MultiInstance.Since`) through each Multi-Instance hook, by what it sets, from the operations
record of `WellFormed` (`Laws.MultiInstance.MultiInstanceOps`). -/

section Snapshots

open Kernel.Laws.State (key)
open Kernel.Laws.MultiInstance (SnapshotFixed recorded)

/-- Entering instances from a record that keeps `Snapshots` sets one that keeps its snapshot and slot count. -/
theorem beginInstances_snapshots (mi : ∀ program, Laws.MultiInstance.MultiInstanceOps program (WellFormed program) Laws.State.Settled)
    {ctx : Ctx} {loop : MultiInstance} {items : List Value} {b state : State}
    {base : MultiInstanceRun}
    (entering : Laws.MultiInstance.Entering (WellFormed ctx.program) Laws.State.Settled base state base.instances [])
    (kept : Snapshots b state)
    (fixed : ∀ earlier ∈ b.slots.multiInstances, earlier.occurrence = base.occurrence → SnapshotFixed earlier base)
    (generated : (∀ earlier ∈ b.slots.multiInstances, earlier.occurrence ≠ base.occurrence) → 0 < base.instances.length) :
    Snapshots b (Feature.MultiInstance.beginInstances ctx loop items base state) := by
  obtain ⟨queued, instances, ran, begun⟩ := Laws.MultiInstance.beginInstances_spec (ctx := ctx) (loop := loop)
    (items := items) (mi ctx.program) entering
  have opened := opens_fixed begun.opens
  rw [ran]
  refine (kept.shrink fun _ inside => begun.slots ▸ inside).setRun (fun earlier member same => ?_) fun apart => ?_
  · exact snapshotFixed_trans (fixed earlier member (same.trans opened.occurrence)) opened
  · rw [opened.count]
    exact generated fun earlier member same => apart earlier member (same.trans opened.occurrence.symm)

/-- `Hooks.arriveMultiInstance` keeps `Snapshots`: it holds the occurrence, completes it, or sets the record of a body
it enters, every slot waiting, of which there is at least one, keyed by the occurrence whose start the draft journalled
last, which no body of `b` is keyed by. -/
theorem arriveMultiInstance_snapshots (mi : ∀ program, Laws.MultiInstance.MultiInstanceOps program (WellFormed program) Laws.State.Settled)
    {ctx : Ctx} {header : Header} {envelope : Envelope} {loop : MultiInstance}
    {occurrence : Occurrence} {b state after : State} (formed : WellFormed ctx.program state) (unstarted : Unstarted b state)
    (kept : Snapshots b state) (member : occurrence ∈ state.occurrences) (begun : occurrence.begun = true)
    (named : header.id = occurrence.element) (newest : state.draft.started.getLast?.map (·.occurrence) = some (key state occurrence))
    (ran : Feature.MultiInstance.arriveMultiInstance ctx header envelope loop occurrence state = .ok after) :
    Snapshots b after := by
  have fresh : ∀ earlier ∈ b.slots.multiInstances, earlier.occurrence ≠ occurrence.id := fun earlier inside same => by
    obtain ⟨fact, last, named⟩ := Option.map_eq_some_iff.mp newest
    exact unstarted.unstarted earlier inside occurrence member same.symm
      (named ▸ List.mem_map_of_mem (List.mem_of_getLast? last))
  rcases Laws.MultiInstance.arriveMultiInstance_spec ran with ⟨held, rfl⟩ | ⟨writes, rfl⟩ | ⟨locals, unarmed, entered⟩
  · rw [Laws.Hooks.hold_eq]
    exact kept.same rfl
  · rw [Laws.State.signal_eq]
    exact kept.same rfl
  · obtain ⟨collection, count, items, ⟨positive, rfl⟩⟩ := entered
    have enteredKept : Snapshots b (if unarmed then (state.enterScope header.id occurrence.scope locals (some occurrence.id)).1
        else (state.enterScope header.id occurrence.scope locals (some occurrence.id)).1.signal
          (.arm occurrence.id header.id occurrence.scope)) := by
      cases unarmed <;> simp only [Bool.false_eq_true, ↓reduceIte, Laws.State.signal_eq, Laws.State.enterScope_eq] <;>
        exact kept.same rfl
    refine beginInstances_snapshots mi (enterBody_entering (mi ctx.program)
      formed member begun header.id
      (enterBody_enters (mi ctx.program) formed member begun named)
      (fun current kept present =>
        (mi ctx.program).arm current occurrence _ kept present begun named)
      locals unarmed collection _ fun _ inside => List.eq_of_mem_replicate inside).1
      enteredKept (fun earlier inside same => absurd same (fresh earlier inside)) fun _ => ?_
    simpa using positive

/-- `Hooks.completeBody` keeps `Snapshots`: it queues the body's completion. -/
theorem completeBody_snapshots {ctx : Ctx} {header : Header} {envelope : Envelope} {loop : MultiInstance}
    {occurrence : Occurrence} {b state after : State} (kept : Snapshots b state)
    (ran : Feature.MultiInstance.completeBody ctx header envelope loop occurrence state = .ok after) : Snapshots b after := by
  obtain ⟨run, _, rfl⟩ := Laws.MultiInstance.completeBody_spec ran
  obtain ⟨writes, same, _⟩ := Laws.MultiInstance.finish_spec ctx loop run state
  rw [same, Laws.State.signal_eq]
  exact kept.same rfl

/-- `Hooks.instanceCompleted` keeps `Snapshots` for an instance in a scope occurrence that stands: it records the
instance's output in its body's record, leaving its scope occurrence, then completes the body or enters its next
instances. -/
theorem instanceCompleted_snapshots (mi : ∀ program, Laws.MultiInstance.MultiInstanceOps program (WellFormed program) Laws.State.Settled)
    {ctx : Ctx} {body : OccurrenceId} {occurrence : Occurrence} {writes : List (String × Value)}
    {b state after : State} (formed : WellFormed ctx.program state) (kept : Snapshots b state)
    (stands : occurrence.scope ∈ scopeIds state)
    (ran : Feature.MultiInstance.instanceCompleted ctx body occurrence writes state = .ok after) :
    Snapshots b after := by
  obtain ⟨run, loop, index, found⟩ := Laws.MultiInstance.instanceCompleted_spec ran
  obtain ⟨output, done⟩ := found
  obtain ⟨results, counted, left, ended⟩ := done.ends
  have member := Laws.MultiInstance.found_mem done.found
  have filled := recorded_fixed (output := output) results done.slot
  have fixed : ∀ earlier ∈ b.slots.multiInstances, earlier.occurrence = (recorded run index output results).occurrence →
      SnapshotFixed earlier (recorded run index output results) := fun earlier inside same =>
    snapshotFixed_trans (kept.fixed earlier inside run member (filled.occurrence.symm.trans same.symm)) filled
  have generated : (∀ earlier ∈ b.slots.multiInstances, earlier.occurrence ≠ (recorded run index output results).occurrence) →
      0 < (recorded run index output results).instances.length := fun apart => by
    rw [filled.count]
    exact kept.generated run member fun earlier inside same => apart earlier inside (same.trans filled.occurrence.symm)
  have countedKept : Snapshots b counted := by
    have leftKept : Snapshots b (Laws.MultiInstance.leftWith state occurrence.scope (recorded run index output results)) :=
      (kept.shrink (Laws.State.leaveScope_left formed stands).slots.bodies).setRun fixed generated
    rcases left with rfl | ⟨target, counts, rule, rfl⟩
    · exact leftKept
    · rw [Laws.State.signal_eq]
      exact leftKept.same rfl
  rcases ended with rfl | ⟨items, rfl⟩
  · obtain ⟨written, same, _⟩ := Laws.MultiInstance.finish_spec ctx loop (recorded run index output results) counted
    rw [same, Laws.State.signal_eq]
    exact countedKept.same rfl
  · obtain ⟨entering, _, present⟩ := counted_entering (mi ctx.program)
      formed stands done left
    exact beginInstances_snapshots mi entering countedKept (fun earlier inside same => countedKept.fixed earlier inside _
      present same.symm) fun apart => countedKept.generated _ present apart

end Snapshots

/-! ## What the Multi-Instance hooks keep of the continuations

`Continued` (`Kernel.Proofs.MultiInstance.Continued`) through each Multi-Instance hook: it keeps or removes occurrences,
queues no begin but its instances', which continue into a body occurrence that has settled and so was issued, and,
beside it, issues no fewer keys (`grown_alongside`). -/

section Continuations

open Kernel.Laws.State (OccurrenceGrows OccurrenceIssued Queued allSignals allQueuedTokens)
open Kernel.Laws.MultiInstance (recorded)

/-- Entering instances keeps every occurrence and queues only begins continuing into the body's occurrence, which has
settled. -/
theorem beginInstances_continuedFrame
    (mi : ∀ program, Laws.MultiInstance.MultiInstanceOps program (WellFormed program) Laws.State.Settled)
    {ctx : Ctx} {loop : MultiInstance} {items : List Value} {state : State} {base : MultiInstanceRun}
    (entering : Laws.MultiInstance.Entering (WellFormed ctx.program) Laws.State.Settled base state base.instances []) :
    ContinuedFrame state (Feature.MultiInstance.beginInstances ctx loop items base state) := by
  obtain ⟨queued, instances, ran, begun⟩ := Laws.MultiInstance.beginInstances_spec (ctx := ctx) (loop := loop)
    (items := items) (mi ctx.program) entering
  obtain ⟨requests, requested, asQueued⟩ := begun.queues
  have fromRequests : ∀ request ∈ requests, ∀ body, request.continuation = .multiInstance body →
      OccurrenceIssued queued body := by
    intro request member body on
    obtain ⟨slots, _, rfl, _⟩ := requested
    obtain ⟨slot, _, rfl⟩ := List.mem_map.mp member
    simp only [Laws.MultiInstance.instanceRequest, Continuation.multiInstance.injEq] at on
    exact on ▸ begun.entering.2.1.1
  rw [ran, Laws.MultiInstance.setRun_eq]
  refine ⟨fun o inside => ?_, fun request inside body on => ?_⟩
  · have held : o ∈ queued.occurrences := inside
    rw [begun.occurrences] at held
    exact held
  rcases inside with signal | token
  · change Signal.begin request ∈ allSignals queued at signal
    rw [allSignals, begun.keyed.1] at signal
    rcases List.mem_append.mp signal with keyed | batch
    · exact .inl (.inl (List.mem_append_left _ keyed))
    rcases asQueued with ⟨signals, _⟩ | ⟨_, _, signals, _⟩ <;> rw [signals] at batch
    · rcases List.mem_append.mp batch with old | new
      · exact .inl (.inl (List.mem_append_right _ old))
      · obtain ⟨made, madeIn, same⟩ := List.mem_map.mp new
        cases same
        exact .inr (fromRequests _ madeIn body on)
    · exact .inl (.inl (List.mem_append_right _ batch))
  · change Token.begin request ∈ allQueuedTokens queued at token
    rw [allQueuedTokens, begun.keyed.2] at token
    rcases List.mem_append.mp token with keyed | batch
    · exact .inl (.inr (List.mem_append_left _ keyed))
    rcases asQueued with ⟨_, tokens⟩ | ⟨_, _, _, tokens⟩ <;> rw [tokens] at batch
    · exact .inl (.inr (List.mem_append_right _ batch))
    · rcases List.mem_append.mp batch with old | new
      · exact .inl (.inr (List.mem_append_right _ old))
      · obtain ⟨made, madeIn, same⟩ := List.mem_map.mp (List.mem_reverse.mp new)
        cases same
        exact .inr (fromRequests _ madeIn body on)

/-- `Hooks.arriveMultiInstance` keeps `Continued` where it issues no fewer keys: it holds the occurrence, completes it,
or enters its body and its instances. -/
theorem arriveMultiInstance_continued
    (mi : ∀ program, Laws.MultiInstance.MultiInstanceOps program (WellFormed program) Laws.State.Settled)
    {ctx : Ctx} {header : Header} {envelope : Envelope} {loop : MultiInstance} {occurrence : Occurrence}
    {state after : State} (formed : WellFormed ctx.program state) (kept : Continued state)
    (grows : OccurrenceGrows state after) (member : occurrence ∈ state.occurrences) (begun : occurrence.begun = true)
    (named : header.id = occurrence.element)
    (ran : Feature.MultiInstance.arriveMultiInstance ctx header envelope loop occurrence state = .ok after) :
    Continued after := by
  rcases Laws.MultiInstance.arriveMultiInstance_spec ran with ⟨held, rfl⟩ | ⟨writes, rfl⟩ | ⟨locals, unarmed, entered⟩
  · rw [Laws.Hooks.hold_eq]
    exact kept.same (fun _ issued => issued) rfl rfl rfl
  · exact kept.signal _
  obtain ⟨collection, count, items, ⟨_, rfl⟩⟩ := entered
  have frame := beginInstances_continuedFrame mi (loop := loop) (items := items) (enterBody_entering (mi ctx.program)
    formed member begun header.id (enterBody_enters (mi ctx.program) formed member begun named)
    (fun current kept present => (mi ctx.program).arm current occurrence _ kept present begun named)
    locals unarmed collection (List.replicate count .waiting) fun _ inside => List.eq_of_mem_replicate inside).1
  refine kept.hooked grows ⟨fun o inside => ?_, fun request inside body on => ?_⟩
  · have held := frame.occurrences o inside
    cases unarmed <;> simpa [Laws.State.signal_eq, Laws.State.enterScope_eq] using held
  · refine (frame.queued request inside body on).imp_left fun old => ?_
    cases unarmed
    · simp only [Bool.false_eq_true, ↓reduceIte] at old
      have entered := queued_signal old
      rw [Laws.State.enterScope_eq] at entered
      exact entered
    · simp only [↓reduceIte] at old
      rw [Laws.State.enterScope_eq] at old
      exact old

/-- `Hooks.completeBody` keeps `Continued`: it queues the body's completion. -/
theorem completeBody_continued {ctx : Ctx} {header : Header} {envelope : Envelope} {loop : MultiInstance}
    {occurrence : Occurrence} {state after : State} (kept : Continued state)
    (ran : Feature.MultiInstance.completeBody ctx header envelope loop occurrence state = .ok after) : Continued after := by
  obtain ⟨run, _, rfl⟩ := Laws.MultiInstance.completeBody_spec ran
  obtain ⟨writes, same, _⟩ := Laws.MultiInstance.finish_spec ctx loop run state
  rw [same]
  exact kept.signal _

/-- `Hooks.instanceCompleted` keeps `Continued` for an instance in a scope occurrence that stands, where it issues no
fewer keys: it leaves the instance's scope occurrence, then completes the body or enters its next instances. -/
theorem instanceCompleted_continued
    (mi : ∀ program, Laws.MultiInstance.MultiInstanceOps program (WellFormed program) Laws.State.Settled)
    {ctx : Ctx} {body : OccurrenceId} {occurrence : Occurrence} {writes : List (String × Value)} {state after : State}
    (formed : WellFormed ctx.program state) (kept : Continued state) (grows : OccurrenceGrows state after)
    (stands : occurrence.scope ∈ scopeIds state)
    (ran : Feature.MultiInstance.instanceCompleted ctx body occurrence writes state = .ok after) : Continued after := by
  obtain ⟨run, loop, index, found⟩ := Laws.MultiInstance.instanceCompleted_spec ran
  obtain ⟨output, done⟩ := found
  obtain ⟨results, counted, left, ended⟩ := done.ends
  have leftOf := Laws.State.leaveScope_left formed stands
  have back : (∀ o ∈ (Laws.MultiInstance.leftWith state occurrence.scope (recorded run index output results)).occurrences,
      o ∈ state.occurrences) ∧ ∀ request,
      Queued (Laws.MultiInstance.leftWith state occurrence.scope (recorded run index output results)) request →
        Queued state request := by
    unfold Laws.MultiInstance.leftWith
    rw [Laws.MultiInstance.setRun_eq]
    exact ⟨fun _ inside => leftOf.occurrencesSublist.subset inside, fun _ inside => inside.shrink
      (fun _ held => leftOf.signals ▸ held) fun _ held => leftOf.tokensSublist.subset held⟩
  have countedBack : (∀ o ∈ counted.occurrences, o ∈ state.occurrences) ∧
      ∀ request, Queued counted request → Queued state request := by
    rcases left with rfl | ⟨target, counts, rule, rfl⟩
    · exact back
    · exact ⟨fun o inside => back.1 o (signal_occurrences _ _ ▸ inside),
        fun request inside => back.2 request (queued_signal inside)⟩
  rcases ended with rfl | ⟨items, rfl⟩
  · obtain ⟨written, same, _⟩ := Laws.MultiInstance.finish_spec ctx loop (recorded run index output results) counted
    rw [same] at grows ⊢
    exact kept.hooked grows ⟨fun o inside => countedBack.1 o (signal_occurrences _ _ ▸ inside), fun request inside _ _ =>
      .inl (countedBack.2 request (queued_signal inside))⟩
  · obtain ⟨entering, _, _⟩ := counted_entering (mi ctx.program) formed stands done left
    have frame : ContinuedFrame counted
        (Feature.MultiInstance.beginInstances ctx loop items (recorded run index output results) counted) :=
      beginInstances_continuedFrame mi entering
    exact kept.hooked grows ⟨fun o inside => countedBack.1 o (frame.occurrences o inside), fun request inside body on =>
      (frame.queued request inside body on).imp_left (countedBack.2 request)⟩

end Continuations

end Kernel.Proofs.MultiInstance
