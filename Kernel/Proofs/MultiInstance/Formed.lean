module

public import Kernel.Proofs.MultiInstance.Framed
public import Kernel.Proofs.Step
public import Kernel.Laws.Registry

/-! # Proofs: the Multi-Instance lane's slot invariant under the registered hooks

Under the registered hooks `WellFormed` and the lane's slot invariant but its numbering (`RunsFramed`,
`Kernel.Proofs.MultiInstance.Framed`) hold through every committed input: the other feature records follow from
`WellFormed`'s and `FrameAlongside` (`Proofs.Cancellation.featureOps_frame`), and the Multi-Instance hooks keep it by
what `Laws.MultiInstance` proves each does (`multiInstanceKeeps_framed`). The lane's statements that read the slot
invariant whole follow from what the numbering lane supplies (`NumberingKept`), `RunsFramed.formed` composing the two.
`RunsGenerated` follows from what an input keeps of its start's bodies (`Since`), carried from the input's reset start.
The module imports the registry's Laws module because it composes the registered hooks, and so stays in every feature's
rebuild cone (guard 15). Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Proofs.MultiInstance

open Kernel
open Kernel.Laws.State (WellFormed Within scopeIds)
open Kernel.Laws.MultiInstance (LoopOf Owned BodyOwns InstancesUnowned InstancesUnheld RunsKeyed NumberedInOrder
  InstancesPlaced BeginsQueued BoundariesApart SequentialSlots OutputsFit)
open Kernel.Proofs.Cancellation (phases_alongside featureOps_frame)

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
  refine ⟨Laws.MultiInstance.setRun_keyed keyed next, fun run member => ?_⟩
  rcases Laws.MultiInstance.mem_setRun member with ⟨held, differs⟩ | rfl
  · exact move (others run held differs)
  · exact move fresh

/-- No scope occurrence of a well-formed state carries an identity at or above its counter. -/
theorem issued_fresh {program : Program} {s : State} (formed : WellFormed program s) {scope : ScopeOccurrenceId}
    (fresh : s.nextIssue ≤ scope.value) : scope ∉ scopeIds s := fun inside => by
  obtain ⟨entry, member, named⟩ := List.mem_map.mp inside
  have below := formed.issued.scopes entry member
  rw [named] at below
  omega

/-- Entering and queuing a body's instances keeps the invariant: they add only fresh scope occurrences and keep every
occurrence, scope occurrence and slot. -/
theorem begun_framed {program : Program} {inv : State → Prop} {settled : State → Nat → Prop} {ctx : Ctx}
    {loop : MultiInstance} {state queued : State} {run : MultiInstanceRun} {instances : List Iteration}
    (formed : WellFormed program state) (framed : RunsFramed program state)
    (begun : Laws.MultiInstance.Begun inv settled ctx loop state run queued instances) : RunsFramed program queued :=
  framed.carry (.grow (fun entry inside => (begun.scopes entry inside).imp_right (issued_fresh formed)) begun.kept
    (congrArg (·.multiInstances) begun.slots) (congrArg (·.compensation.runs) begun.slots)
    fun _ present => begun.occurrences ▸ present)

/-- The slot record entering and queuing a body's instances sets keeps what `RunPlaced` asks of the one it opens. -/
theorem begun_placed {program : Program} {inv : State → Prop} {settled : State → Nat → Prop} {ctx : Ctx}
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

/-- A body's instances, entered and queued from a state that keeps the invariant and places the body, its loop the one
its element carries and its slots of a sequential body's shape, keep the invariant once their slot record is set. -/
theorem beginInstances_framed {ctx : Ctx} {loop : MultiInstance} {items : List Value} {state : State}
    {base : MultiInstanceRun}
    (entering : Laws.MultiInstance.Entering (WellFormed ctx.program) Laws.State.Settled base state base.instances [])
    (framed : RunsFramed ctx.program state) (placed : RunPlaced state base)
    (sequential : loop.mode = .sequential → SequentialSlots base) (fits : OutputsFit base loop)
    (looped : LoopOf ctx.program base.element loop) :
    RunsFramed ctx.program (Feature.MultiInstance.beginInstances ctx loop items base state) := by
  obtain ⟨queued, instances, ran, begun⟩ := Laws.MultiInstance.beginInstances_spec (ctx := ctx) (loop := loop)
    (items := items) (Proofs.Step.registeredOps_wellFormed.multiInstance ctx.program) entering
  rw [ran]
  have queuedFramed := begun_framed entering.1 framed begun
  refine setRun_framed queuedFramed.keyed (fun run inside _ => queuedFramed.framed run inside)
    ((begun_placed entering.1 begun placed).framed fun other otherLooped => ?_)
  obtain rfl : other = loop := Option.some.inj (otherLooped.symm.trans looped)
  exact opens_shaped begun.opens sequential fits

/-- Entering a body's scope occurrence below its begun occurrence's own, which it owns, and arming its boundaries or not,
keeps the invariant and places the body, every slot waiting. -/
theorem enterBody_placed {program : Program} {occurrence : Occurrence} {state : State} (formed : WellFormed program state)
    (framed : RunsFramed program state) (member : occurrence ∈ state.occurrences)
    (body : occurrence.role = .multiInstanceBody) (element : ElementId) (named : occurrence.element = element)
    (locals : List (String × Value)) (unarmed : Bool) (collection : Value) (count : Nat) :
    RunsFramed program (if unarmed then (state.enterScope element occurrence.scope locals (some occurrence.id)).1
        else (state.enterScope element occurrence.scope locals (some occurrence.id)).1.signal
          (.arm occurrence.id element occurrence.scope)) ∧
      RunPlaced (if unarmed then (state.enterScope element occurrence.scope locals (some occurrence.id)).1
        else (state.enterScope element occurrence.scope locals (some occurrence.id)).1.signal
          (.arm occurrence.id element occurrence.scope))
        { scope := (state.enterScope element occurrence.scope locals (some occurrence.id)).2, element,
          occurrence := occurrence.id, collection, instances := List.replicate count .waiting } := by
  have entered := (runsFramed_frameAlongside program).enterScope program state element occurrence.scope locals
    (some occurrence.id) formed framed
  have none : ∀ scope, Iteration.active scope ∉ List.replicate count Iteration.waiting := fun _ active => by
    cases List.eq_of_mem_replicate active
  have placed : RunPlaced (state.enterScope element occurrence.scope locals (some occurrence.id)).1
      { scope := (state.enterScope element occurrence.scope locals (some occurrence.id)).2, element,
        occurrence := occurrence.id, collection, instances := List.replicate count .waiting } := by
    rw [Laws.State.enterScope_eq]
    refine ⟨⟨⟨occurrence, member, rfl, named, body⟩, by simp, fun _ scope slot =>
      absurd (List.mem_of_getElem? slot) (none scope), fun _ _ scope one _ =>
      absurd (List.mem_of_getElem? one) (none scope)⟩, fun entry inside same => ?_,
      fun scope active => absurd active (none scope), fun scope active => absurd active (none scope)⟩
    rcases List.mem_append.mp inside with old | new
    · have below := formed.issued.scopes entry old
      rw [same] at below
      exact absurd below (Nat.lt_irrefl _)
    · rw [List.mem_singleton.mp new]
  cases unarmed
  · simp only [Bool.false_eq_true, ↓reduceIte]
    have same := Laws.State.signal_eq (state.enterScope element occurrence.scope locals (some occurrence.id)).1
      (.arm occurrence.id element occurrence.scope)
    exact ⟨entered.carry (.equal (by rw [same]) (by rw [same]) (by rw [same]) (by rw [same])),
      placed.transport (by rw [same]) (by rw [same]) (by rw [same])⟩
  · exact ⟨entered, placed⟩

/-- `Hooks.arriveMultiInstance` keeps the invariant: it holds the occurrence, completes it, or sets the slot record of
a body it enters, every slot waiting, and whose loop its element carries. -/
theorem arriveMultiInstance_framed {ctx : Ctx} {header : Header} {envelope : Envelope} {loop : MultiInstance}
    {occurrence : Occurrence} {state after : State} (formed : WellFormed ctx.program state)
    (framed : RunsFramed ctx.program state) (member : occurrence ∈ state.occurrences) (begun : occurrence.begun = true)
    (body : occurrence.role = .multiInstanceBody) (named : header.id = occurrence.element)
    (looped : LoopOf ctx.program header.id loop)
    (ran : Feature.MultiInstance.arriveMultiInstance ctx header envelope loop occurrence state = .ok after) :
    RunsFramed ctx.program after := by
  rcases Laws.MultiInstance.arriveMultiInstance_spec ran with ⟨held, rfl⟩ | ⟨writes, rfl⟩ | ⟨locals, unarmed, entered⟩
  · have same := Laws.Hooks.hold_eq state held
    exact framed.carry (.equal (by rw [same]) (by rw [same]) (by rw [same]) (by rw [same]))
  · have same := Laws.State.signal_eq state (.complete occurrence.id .outgoing writes .outward)
    exact framed.carry (.equal (by rw [same]) (by rw [same]) (by rw [same]) (by rw [same]))
  · obtain ⟨collection, count, items, ⟨_, rfl⟩⟩ := entered
    have waiting : ∀ slot ∈ List.replicate count Iteration.waiting, slot = .waiting := fun _ inside =>
      List.eq_of_mem_replicate inside
    obtain ⟨enteredFramed, placed⟩ := enterBody_placed formed framed member body header.id named.symm locals unarmed
      collection count
    exact beginInstances_framed (enterBody_entering (Proofs.Step.registeredOps_wellFormed.multiInstance
      ctx.program) formed member begun header.id locals unarmed collection _ waiting).1 enteredFramed placed
      (fun _ => ⟨[], [], List.replicate count .waiting, by simp, by simp, by simp, by simp, waiting⟩)
      (fun _ inside => by cases waiting _ inside) looped

/-- `Hooks.completeBody` keeps the invariant: it queues the body's completion. -/
theorem completeBody_framed {ctx : Ctx} {header : Header} {envelope : Envelope} {loop : MultiInstance}
    {occurrence : Occurrence} {state after : State} (framed : RunsFramed ctx.program state)
    (ran : Feature.MultiInstance.completeBody ctx header envelope loop occurrence state = .ok after) :
    RunsFramed ctx.program after := by
  obtain ⟨run, _, rfl⟩ := Laws.MultiInstance.completeBody_spec ran
  obtain ⟨writes, same, _⟩ := Laws.MultiInstance.finish_spec ctx loop run state
  have frame := Laws.State.signal_eq state (.complete run.occurrence .outgoing writes .outward)
  rw [same]
  exact framed.carry (.equal (by rw [frame]) (by rw [frame]) (by rw [frame]) (by rw [frame]))

/-- `Hooks.instanceCompleted` keeps the invariant for an instance in a scope occurrence that stands: it records the
instance's slot, leaving its scope occurrence (`leftWith_framed`), writes the body's counters or not, then completes the
body or begins its next instances (`beginInstances_framed`). -/
theorem instanceCompleted_framed {ctx : Ctx} {body : Nat} {occurrence : Occurrence} {writes : List (String × Value)}
    {state after : State} (formed : WellFormed ctx.program state) (framed : RunsFramed ctx.program state)
    (stands : occurrence.scope ∈ scopeIds state)
    (ran : Feature.MultiInstance.instanceCompleted ctx body occurrence writes state = .ok after) :
    RunsFramed ctx.program after := by
  have ops := Proofs.Step.registeredOps_wellFormed.multiInstance ctx.program
  obtain ⟨run, loop, index, found⟩ := Laws.MultiInstance.instanceCompleted_spec ran
  obtain ⟨output, done⟩ := found
  obtain ⟨results, counted, left, ended⟩ := done.ends
  have member := Laws.MultiInstance.found_mem done.found
  obtain ⟨entering, _, present⟩ := counted_entering ops formed stands done left
  have countedFramed : RunsFramed ctx.program counted := by
    have leftFramed := leftWith_framed (results := results) formed framed member done.slot done.fits
    rcases left with rfl | ⟨target, counts, rule, rfl⟩
    · exact leftFramed
    · have same := Laws.State.signal_eq (Laws.MultiInstance.leftWith state occurrence.scope
        (Laws.MultiInstance.recorded run index output results)) (.write target counts rule)
      exact leftFramed.carry (.equal (by rw [same]) (by rw [same]) (by rw [same]) (by rw [same]))
  have recordedFramed := countedFramed.framed _ present
  rcases ended with rfl | ⟨items, rfl⟩
  · obtain ⟨written, same, _⟩ := Laws.MultiInstance.finish_spec ctx loop
      (Laws.MultiInstance.recorded run index output results) counted
    rw [same]
    exact countedFramed.carry (.equal (by rw [Laws.State.signal_eq]) (by rw [Laws.State.signal_eq])
      (by rw [Laws.State.signal_eq]) (by rw [Laws.State.signal_eq]))
  · have shaped := recordedFramed.shaped loop done.looped
    exact beginInstances_framed entering countedFramed recordedFramed.placed shaped.1 shaped.2.2 done.looped

/-! ## Under the registered hooks -/

/-- `WellFormed` and the lane's slot invariant but its numbering. -/
def Framed (program : Program) (s : State) : Prop :=
  WellFormed program s ∧ RunsFramed program s

/-- The registered Multi-Instance hooks keep `Framed`: its `WellFormed` half by `Laws.MultiInstance.MultiInstanceOps`,
its `RunsFramed` half by what each hook does. -/
theorem multiInstanceKeeps_framed : Proofs.Step.MultiInstanceKeeps Framed where
  arrive ctx header envelope loop occurrence state after holds member begun body named looped newest ran :=
    ⟨(Proofs.Step.multiInstanceKeeps_of Proofs.Step.registeredOps_wellFormed.multiInstance).arrive ctx header envelope
      loop occurrence state after holds.1 member begun body named looped newest ran,
      arriveMultiInstance_framed holds.1 holds.2 member begun body named looped ran⟩
  completeBody ctx header envelope loop occurrence state after holds member ran :=
    ⟨(Proofs.Step.multiInstanceKeeps_of Proofs.Step.registeredOps_wellFormed.multiInstance).completeBody ctx header
      envelope loop occurrence state after holds.1 member ran, completeBody_framed holds.2 ran⟩
  instanceCompleted ctx body occurrence writes state after holds stands ran :=
    ⟨(Proofs.Step.multiInstanceKeeps_of Proofs.Step.registeredOps_wellFormed.multiInstance).instanceCompleted ctx body
      occurrence writes state after holds.1 stands ran, instanceCompleted_framed holds.1 holds.2 stands ran⟩

/-- What the numbering lane supplies: after a committed input from a well-formed state that keeps the slot invariant,
and after a committed start, every running body numbers its instances in item order and each instance is the one
occurrence of the Activity in its scope occurrence, and the instance begins still queued are in order, under a program
whose boundaries name no element. -/
structure NumberingKept (hooks : Hooks) : Prop where
  step : ∀ program input before after, BoundariesApart program → WellFormed program before →
    RunsFormed program before → Step.step hooks program (some before) input = .ok after →
      (∀ run ∈ after.slots.multiInstances, NumberedInOrder after run ∧ InstancesPlaced after run) ∧
        BeginsQueued program after
  start : ∀ program input after, BoundariesApart program → Step.step hooks program none input = .ok after →
    (∀ run ∈ after.slots.multiInstances, NumberedInOrder after run ∧ InstancesPlaced after run) ∧
      BeginsQueued program after

/-- The registered hooks keep `Framed`. -/
theorem framed_contract : Laws.Step.HookContract Registry.hooks Framed :=
  Proofs.Step.registered_contract_of
    (featureOps_frame Proofs.Step.registeredOps_wellFormed.toFeatureOps runsFramed_frameAlongside) multiInstanceKeeps_framed
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

/-- A committed input on a running instance keeps `Framed` under the registered hooks. -/
theorem framed_stepKeeps {program : Program} {input : Input}
    {before after : State} (holds : Framed program before)
    (ran : Step.step Registry.hooks program (some before) input = .ok after) : Framed program after :=
  Laws.Step.running_keeps framed_contract framed_phases Proofs.State.stateFacts
    (Laws.Step.complete_keeps framed_contract framed_phases
      (runsFramed_pipelinePhases Proofs.Step.pipelinePhases) Proofs.State.stateFacts)
    (fun _ _ => framed_reset) holds ran

/-- A committed start makes a `Framed` state under the registered hooks. -/
theorem framed_start {program : Program} {input : Input}
    {after : State} (ran : Step.step Registry.hooks program none input = .ok after) : Framed program after :=
  Laws.Step.step_keeps framed_contract framed_phases Proofs.State.stateFacts
    (Laws.Step.complete_keeps framed_contract framed_phases
      (runsFramed_pipelinePhases Proofs.Step.pipelinePhases) Proofs.State.stateFacts)
    (fun _ _ => framed_reset) (framed_initial program) (fun _ given => by simp at given) ran

/-! ## The lane's statements -/

/-- The registered hooks keep every running body's instances `Apart`. -/
theorem registered_instancesApart :
    InstancesApart Registry.hooks := fun _ _ _ run ⟨formed, runs, _, ran⟩ member =>
  have after := framed_stepKeeps ⟨formed, runs.framed⟩ ran
  owned_apart after.1 (after.2.framed run member).owned

/-- The registered hooks keep the lane's slot invariant through a committed input, given the numbering lane's
supply. -/
theorem registered_runsFormed (numbering : NumberingKept Registry.hooks) {program : Program} {input : Input}
    {before after : State} (apart : BoundariesApart program)
    (formed : WellFormed program before) (runs : RunsFormed program before)
    (ran : Step.step Registry.hooks program (some before) input = .ok after) :
    WellFormed program after ∧ RunsFormed program after :=
  have framed := framed_stepKeeps ⟨formed, runs.framed⟩ ran
  ⟨framed.1, framed.2.formed framed.1 (numbering.step _ _ _ _ apart formed runs ran)⟩

/-- A committed start keeps the lane's slot invariant under the registered hooks, given the numbering lane's supply. -/
theorem registered_runsFormedAtStart (numbering : NumberingKept Registry.hooks) : RunsFormedAtStart Registry.hooks :=
    fun _ _ _ apart ran =>
  have framed := framed_start ran
  framed.2.formed framed.1 (numbering.start _ _ _ apart ran)

/-- Every instance a committed population run holds keeps the lane's slot invariant under the registered hooks, given
the numbering lane's supply. -/
theorem registered_runsFormedInPopulation (numbering : NumberingKept Registry.hooks) :
    RunsFormedInPopulation Registry.hooks := fun _ _ _ ran member inside =>
  (Laws.Population.runStimuli_held
    (good := fun program s => Framed program s ∧ (BoundariesApart program → RunsFormed program s))
    ⟨fun _ _ _ _ holds stepped => ⟨framed_stepKeeps holds.1 stepped, fun apart =>
      (registered_runsFormed numbering apart holds.1.1 (holds.2 apart) stepped).2⟩,
      fun _ _ _ ran => ⟨framed_start ran, fun apart => registered_runsFormedAtStart numbering _ _ _ apart ran⟩⟩
    ran member inside).2

/-- Every running body after a committed input is `Shaped` by its loop under the registered hooks, given the numbering
lane's supply. -/
theorem registered_runsShaped (numbering : NumberingKept Registry.hooks) : RunsShaped Registry.hooks :=
  fun _ _ _ run loop apart ⟨formed, runs, _, ran⟩ member looped =>
    ((registered_runsFormed numbering apart formed runs ran).2.formed run member).shaped loop looped

/-- A committed input keeps its well-formed before-state's scope occurrences under the registered hooks. -/
theorem registered_stepKeepsScopes : Proofs.Cancellation.StepKeepsScopes Registry.hooks :=
  Proofs.Cancellation.stepKeepsScopes (Proofs.Cancellation.keepsScopes_contract Proofs.Step.registeredOps_wellFormed)
    (Proofs.Cancellation.keepsScopes_phases Proofs.Step.phases)
    (Proofs.Cancellation.keepsScopes_pipelinePhases Proofs.Step.pipelinePhases) Proofs.State.stateFacts

/-- A body whose occurrence goes takes its instances with it under the registered hooks: no slot record of it stays,
since each running body's occurrence stands; its instances' scope occurrences go, since a standing one would keep its
parent, the body's scope occurrence, whose owner is the body's occurrence; and so does what lay in them
(`Proofs.Cancellation.outside_removed`). -/
theorem registered_endsWithInstances :
    EndsWithInstances Registry.hooks := by
  intro program before after run index scope ⟨formed, runs, input, ran⟩ member gone slot
  have framed := framed_stepKeeps ⟨formed, runs.framed⟩ ran
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

/-! ## A running body's snapshot through an input

The registered hooks keep `Since` of an input's start (`Kernel.Proofs.MultiInstance.Framed`): its `Unstarted` part
through the Multi-Instance hooks by their feature record, its `Snapshots` part by what each sets. The draft is emptied
at each input's start, so the walk starts from that reset (`since_stepKeeps`). -/

section Since

open Kernel.Laws.State (key)
open Kernel.Laws.MultiInstance (SnapshotFixed recorded)

/-! ### The Multi-Instance hooks -/

/-- `WellFormed` and `Unstarted` through the Multi-Instance hooks, by their feature record. -/
theorem unstarted_keeps (b : State) :
    Proofs.Step.MultiInstanceKeeps fun program s => WellFormed program s ∧ Unstarted b s :=
  Proofs.Step.multiInstanceKeeps_of fun program =>
    Proofs.Cancellation.multiInstanceOps_alongside (unstarted_alongside b)
      (Proofs.Step.registeredOps_wellFormed.multiInstance program)

/-- Entering instances from a record that keeps `Snapshots` sets one that keeps its snapshot and slot count. -/
theorem beginInstances_snapshots {ctx : Ctx} {loop : MultiInstance} {items : List Value} {b state : State}
    {base : MultiInstanceRun}
    (entering : Laws.MultiInstance.Entering (WellFormed ctx.program) Laws.State.Settled base state base.instances [])
    (kept : Snapshots b state)
    (fixed : ∀ earlier ∈ b.slots.multiInstances, earlier.occurrence = base.occurrence → SnapshotFixed earlier base)
    (generated : (∀ earlier ∈ b.slots.multiInstances, earlier.occurrence ≠ base.occurrence) → 0 < base.instances.length) :
    Snapshots b (Feature.MultiInstance.beginInstances ctx loop items base state) := by
  obtain ⟨queued, instances, ran, begun⟩ := Laws.MultiInstance.beginInstances_spec (ctx := ctx) (loop := loop)
    (items := items) (Proofs.Step.registeredOps_wellFormed.multiInstance ctx.program) entering
  have opened := opens_fixed begun.opens
  rw [ran]
  refine (kept.shrink fun _ inside => begun.slots ▸ inside).setRun (fun earlier member same => ?_) fun apart => ?_
  · exact snapshotFixed_trans (fixed earlier member (same.trans opened.occurrence)) opened
  · rw [opened.count]
    exact generated fun earlier member same => apart earlier member (same.trans opened.occurrence.symm)

/-- `Hooks.arriveMultiInstance` keeps `Snapshots`: it holds the occurrence, completes it, or sets the record of a body
it enters, every slot waiting, of which there is at least one, keyed by the occurrence whose start the draft journalled
last, which no body of `b` is keyed by. -/
theorem arriveMultiInstance_snapshots {ctx : Ctx} {header : Header} {envelope : Envelope} {loop : MultiInstance}
    {occurrence : Occurrence} {b state after : State} (formed : WellFormed ctx.program state) (unstarted : Unstarted b state)
    (kept : Snapshots b state) (member : occurrence ∈ state.occurrences) (begun : occurrence.begun = true)
    (newest : state.draft.started.getLast?.map (·.occurrence) = some (key state occurrence))
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
    refine beginInstances_snapshots (enterBody_entering (Proofs.Step.registeredOps_wellFormed.multiInstance ctx.program)
      formed member begun header.id locals unarmed collection _ fun _ inside => List.eq_of_mem_replicate inside).1
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
theorem instanceCompleted_snapshots {ctx : Ctx} {body : Nat} {occurrence : Occurrence} {writes : List (String × Value)}
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
  · obtain ⟨entering, _, present⟩ := counted_entering (Proofs.Step.registeredOps_wellFormed.multiInstance ctx.program)
      formed stands done left
    exact beginInstances_snapshots entering countedKept (fun earlier inside same => countedKept.fixed earlier inside _
      present same.symm) fun apart => countedKept.generated _ present apart

/-- The registered Multi-Instance hooks keep `Since`: its `WellFormed` and `Unstarted` parts by their feature record,
its `Snapshots` part by what each hook sets. -/
theorem since_multiInstanceKeeps (b : State) : Proofs.Step.MultiInstanceKeeps (Since b) where
  arrive ctx header envelope loop occurrence state after holds member begun body named looped newest ran :=
    have first := (unstarted_keeps b).arrive ctx header envelope loop occurrence state after ⟨holds.1, holds.2.1⟩ member
      begun body named looped newest ran
    ⟨first.1, first.2, arriveMultiInstance_snapshots holds.1 holds.2.1 holds.2.2 member begun newest ran⟩
  completeBody ctx header envelope loop occurrence state after holds member ran :=
    have first := (unstarted_keeps b).completeBody ctx header envelope loop occurrence state after ⟨holds.1, holds.2.1⟩
      member ran
    ⟨first.1, first.2, completeBody_snapshots holds.2.2 ran⟩
  instanceCompleted ctx body occurrence writes state after holds stands ran :=
    have first := (unstarted_keeps b).instanceCompleted ctx body occurrence writes state after ⟨holds.1, holds.2.1⟩
      stands ran
    ⟨first.1, first.2, instanceCompleted_snapshots holds.1 holds.2.2 stands ran⟩

/-! ### Through an input -/

/-- The registered hooks keep `Since`. -/
theorem since_contract (b : State) : Laws.Step.HookContract Registry.hooks (Since b) :=
  Proofs.Step.registered_contract_of
    (featureOps_frame Proofs.Step.registeredOps_wellFormed.toFeatureOps fun _ => since_frameAlongside b)
    (since_multiInstanceKeeps b) Proofs.State.stateFacts

/-- `Step`'s phases keep `Since`. -/
theorem since_phases (b : State) : Laws.Step.Phases (Since b) :=
  phases_alongside Proofs.Step.phases fun _ => since_stepAlongside b

/-- An input's start: the well-formed `b` with its journal, outbox, draft and writes cleared keeps `Since b`, since
every body's occurrence has settled (`Laws.State.SlotsSettled.bodies`) and one record per body occurrence is held. -/
theorem since_reset {program : Program} {b : State} (formed : WellFormed program b) (keyed : RunsKeyed b) :
    Since b program { b with journal := [], outbox := [], draft := {}, writes := [] } := by
  refine ⟨Laws.State.reset_wellFormed formed, ⟨fun earlier member => (formed.settled.bodies earlier member).1,
    fun earlier member o inside same => (formed.settled.bodies earlier member).2.1 o inside same,
    fun _ _ _ _ _ => by simp⟩, ⟨fun earlier member run inside same => ?_, fun run inside apart => absurd rfl
    (apart run inside)⟩⟩
  obtain rfl := Laws.State.nodup_map_eq keyed member inside same.symm
  exact snapshotFixed_refl _

/-- A committed input on a running instance keeps `Since` of its before-state under the registered hooks: the walk of
`Laws.Step.running_keeps` from the input's reset start, which `Since` holds of though the before-state's draft may not
be empty. -/
theorem since_stepKeeps {program : Program} {input : Input} {b after : State} (formed : WellFormed program b)
    (keyed : RunsKeyed b) (ran : Step.step Registry.hooks program (some b) input = .ok after) : Since b program after := by
  have pipeline := Laws.Step.complete_keeps (since_contract b) (since_phases b)
    (since_pipelinePhases b Proofs.Step.pipelinePhases) Proofs.State.stateFacts
  rcases Laws.Step.step_ok ran with ⟨_, _, fresh, _⟩ | ⟨_, _, runs, ran⟩
  · simp at fresh
  · obtain ⟨state, start, moved, rest⟩ := Laws.Step.onRunning_ok ran
    obtain ⟨settled, present, _, rest⟩ := rest
    obtain ⟨clocked, stepped, settling, made⟩ := rest
    cases Option.some.inj present
    have entered : Since b (Laws.Step.inputCtx Registry.hooks program input).program
        { b with journal := [], outbox := [], draft := {}, writes := [] } := by
      rw [Laws.Step.inputCtx_program]
      exact since_reset formed keyed
    have started := Laws.Step.advanceClock_keeps (since_phases b) entered clocked
    have movedHolds := Laws.Step.microStep_keeps (since_contract b) (since_phases b) pipeline
      (fun _ transitioned => Laws.Step.transition_keeps (since_contract b) (since_phases b) runs started transitioned)
      stepped
    have done := made ▸ (since_phases b).runOrder _ _ (Laws.Step.settle_keeps (since_contract b) (since_phases b)
      Proofs.State.stateFacts pipeline _ _ _ _ movedHolds settling)
    rwa [Laws.Step.inputCtx_program] at done

/-- A body begun by a committed input has at least one slot, and a body running before and after it keeps its
snapshot, slot count and filled slots, under the registered hooks. -/
theorem registered_runsGenerated : RunsGenerated Registry.hooks :=
  fun _ _ _ run ⟨formed, runs, _, ran⟩ member =>
    have since := since_stepKeeps formed runs.keyed ran
    ⟨since.2.2.generatedOf member, fun earlier inside same => since.2.2.fixed earlier inside run member same.symm⟩

end Since

end Kernel.Proofs.MultiInstance
