module

public import Kernel.Laws.MultiInstance

/-! # Proofs: what Multi-Instance's hooks keep and enter

What `Hooks.arriveMultiInstance` and `Hooks.instanceCompleted` keep, enter, queue and read, derived through the
operations record `Laws.MultiInstance.MultiInstanceOps` from what `Laws.MultiInstance` proves each does
(`arriveMultiInstance_spec`, `instanceCompleted_spec`, `beginInstances_spec`, `finish_spec`): the invariant they keep,
each instance they enter anew holding its `loopCounter` (`SlotsCounted`), the signals an instance's completion queues
(`instanceCompleted_queues`) and the counters it found held. Nothing here sees a feature body. Nothing executable imports
this module.
-/

@[expose] public section

namespace Kernel.Proofs.MultiInstance

open Kernel
open Kernel.Laws.MultiInstance (MultiInstanceOps Entering Begun SlotsCounted Completes recorded leftWith setRun_eq mem_setRun
  setRun_mem beginInstances_spec arriveMultiInstance_spec instanceCompleted_spec finish_spec LoopOf)

variable {program : Program} {inv : State → Prop} {settled : State → Nat → Prop}

/-! ## The invariant -/

/-- Entering and queuing a body's instances below its scope occurrence keeps `inv`, given that a body some slot of
which no longer waits is held and opens by its element's loop. -/
theorem beginInstances_keeps (ops : MultiInstanceOps program inv settled)
    {ctx : Ctx} {loop : MultiInstance} {items : List Value} {run : MultiInstanceRun} {state : State}
    (entering : Entering inv settled run state run.instances [])
    (linked : (∃ slot ∈ run.instances, slot ≠ .waiting) →
      run ∈ state.slots.multiInstances ∧ LoopOf program run.element loop) :
    inv (Feature.MultiInstance.beginInstances ctx loop items run state) := by
  obtain ⟨queued, instances, ran, begun⟩ := beginInstances_spec (ctx := ctx) (loop := loop) (items := items) ops
    entering
  rw [ran]
  exact (ops.runs queued run { run with instances } loop begun.entering.1 begun.entering.2.1 begun.entering.2.2.2.1
    begun.opens fun waiting => ⟨begun.slots ▸ (linked waiting).1, (linked waiting).2⟩).1

/-- Writing the body's counters keeps what the body keeps while it enters. -/
theorem written_entering (ops : MultiInstanceOps program inv settled)
    {run : MultiInstanceRun} {state : State} (entering : Entering inv settled run state run.instances [])
    (scope : ScopeOccurrenceId) (writes : List (String × Value)) (rule : WriteRule) :
    Entering inv settled run (state.signal (.write scope writes rule)) run.instances [] := by
  obtain ⟨kept, carry⟩ := ops.write state scope writes rule entering.1
  exact entering.frame kept (carry _ entering.2.1) (by rw [Laws.State.signal_eq]) (by rw [Laws.State.signal_eq])

/-- A body whose instances are done completes its occurrence. -/
theorem finish_keeps (ops : MultiInstanceOps program inv settled)
    {ctx : Ctx} {loop : MultiInstance} {run : MultiInstanceRun} {state : State}
    (entering : Entering inv settled run state run.instances []) :
    inv (Feature.MultiInstance.finish ctx loop run state) := by
  obtain ⟨_, same, _⟩ := finish_spec ctx loop run state
  rw [same]
  exact ops.complete _ _ _ _ _ entering.1 entering.2.1

/-- A body's completion issues nothing. -/
theorem finish_issue (ctx : Ctx) (loop : MultiInstance) (run : MultiInstanceRun) (state : State) :
    (Feature.MultiInstance.finish ctx loop run state).nextIssue = state.nextIssue := by
  obtain ⟨_, same, _⟩ := finish_spec ctx loop run state
  rw [same, Laws.State.signal_eq]

/-- Entering the body's scope occurrence below a begun occurrence's own, which it owns, and arming its boundaries or not,
leaves a state where the body, every slot waiting, keeps what it keeps while it enters, with the feature slots of
`state` and an issue counter that grew. -/
theorem enterBody_entering (ops : MultiInstanceOps program inv settled) {occurrence : Occurrence} {state : State}
    (holds : inv state) (member : occurrence ∈ state.occurrences) (begun : occurrence.begun = true) (element : ElementId)
    (locals : List (String × Value)) (unarmed : Bool) (collection : Value) (instances : List Iteration)
    (waiting : ∀ slot ∈ instances, slot = .waiting) :
    Entering inv settled
      { scope := (state.enterScope element occurrence.scope locals (some occurrence.id)).2, element,
        occurrence := occurrence.id, collection, instances }
      (if unarmed then (state.enterScope element occurrence.scope locals (some occurrence.id)).1
        else (state.enterScope element occurrence.scope locals (some occurrence.id)).1.signal
          (.arm occurrence.id element occurrence.scope)) instances [] ∧
      (if unarmed then (state.enterScope element occurrence.scope locals (some occurrence.id)).1
        else (state.enterScope element occurrence.scope locals (some occurrence.id)).1.signal
          (.arm occurrence.id element occurrence.scope)).slots = state.slots ∧
      state.nextIssue ≤ (if unarmed then (state.enterScope element occurrence.scope locals (some occurrence.id)).1
        else (state.enterScope element occurrence.scope locals (some occurrence.id)).1.signal
          (.arm occurrence.id element occurrence.scope)).nextIssue := by
  have stands := ops.housed _ _ holds member
  obtain ⟨entered, carry, _⟩ := ops.enter state element occurrence.scope locals (some occurrence.id) holds stands
    fun id named => ⟨occurrence, member, Option.some.inj named, begun, rfl⟩
  have carried := carry _ (ops.begun _ _ holds member begun)
  rw [Laws.State.enterScope_eq] at entered carried ⊢
  have none : ∀ (current : State) (run : MultiInstanceRun), run.instances = instances →
      Laws.State.Placed current { run with instances := run.instances } := fun _ run same scope active => by
    rw [same] at active
    cases waiting _ active
  cases unarmed
  · have present : occurrence ∈ (_ : State).occurrences := member
    obtain ⟨armed, carryArm⟩ := ops.arm _ occurrence element entered present begun
    refine ⟨⟨armed, carryArm _ carried, ?_, none _ _ rfl, fun _ none => (by cases none)⟩, ?_, ?_⟩ <;>
      rw [Laws.State.signal_eq]
    · simp [Laws.State.scopeIds]
    · simp only [Bool.false_eq_true, ↓reduceIte]
    · simp only [Bool.false_eq_true, ↓reduceIte]
      exact Nat.le_succ _
  · exact ⟨⟨entered, carried, by simp [Laws.State.scopeIds], none _ _ rfl, fun _ none => (by cases none)⟩, rfl,
      Nat.le_succ _⟩

/-- Entering the body's scope occurrence below a begun occurrence's own, which it owns, arming its boundaries or not, and
beginning the instances below it, every slot waiting, keeps `inv`. -/
theorem enterBody_keeps (ops : MultiInstanceOps program inv settled)
    {ctx : Ctx} {loop : MultiInstance} {items : List Value} {occurrence : Occurrence} {state : State} (holds : inv state)
    (member : occurrence ∈ state.occurrences) (begun : occurrence.begun = true) (element : ElementId)
    (locals : List (String × Value)) (unarmed : Bool) (collection : Value) (instances : List Iteration)
    (waiting : ∀ slot ∈ instances, slot = .waiting) :
    inv (Feature.MultiInstance.beginInstances ctx loop items
      { scope := (state.enterScope element occurrence.scope locals (some occurrence.id)).2, element,
        occurrence := occurrence.id, collection, instances }
      (if unarmed then (state.enterScope element occurrence.scope locals (some occurrence.id)).1
        else (state.enterScope element occurrence.scope locals (some occurrence.id)).1.signal
          (.arm occurrence.id element occurrence.scope))) :=
  beginInstances_keeps ops (enterBody_entering ops holds member begun element locals unarmed collection instances
    waiting).1 fun ⟨slot, inside, moved⟩ => absurd (waiting slot inside) moved

/-- `Hooks.arriveMultiInstance` keeps `inv`, as `Laws.MultiInstance.arriveMultiInstance_spec` says what it does. -/
theorem arriveMultiInstance_keeps (ops : MultiInstanceOps program inv settled) {ctx : Ctx} {header : Header}
    {envelope : Envelope} {loop : MultiInstance} {occurrence : Occurrence} {state after : State} (holds : inv state)
    (member : occurrence ∈ state.occurrences) (begun : occurrence.begun = true)
    (ran : Feature.MultiInstance.arriveMultiInstance ctx header envelope loop occurrence state = .ok after) :
    inv after := by
  rcases arriveMultiInstance_spec ran with ⟨held, rfl⟩ | ⟨writes, rfl⟩ | ⟨locals, unarmed, entered⟩
  · exact ops.hold _ _ holds
  · exact ops.complete _ _ _ _ _ holds (ops.begun _ _ holds member begun)
  · obtain ⟨collection, count, items, rfl⟩ := entered
    exact enterBody_keeps ops holds member begun _ _ _ _ _ fun _ inside => List.eq_of_mem_replicate inside

/-- An instance's completion leaves the issue counter where it was. -/
theorem leftWith_issue (state : State) (scope : ScopeOccurrenceId) (next : MultiInstanceRun) :
    (leftWith state scope next).nextIssue = state.nextIssue := by
  rw [leftWith, setRun_eq]
  show (state.leaveScope scope).nextIssue = state.nextIssue
  rw [(Laws.State.leaveScope_eq state scope).1]
  exact (Laws.State.clearInside_shrinks state scope []).2

/-- A signal issues nothing. -/
theorem signal_issue (state : State) (signal : Signal) : (state.signal signal).nextIssue = state.nextIssue := by
  rw [Laws.State.signal_eq]

/-- Recording an instance's slot in a scope occurrence that stands, and writing the body's counters or not, leaves a
state where the recorded body keeps what it keeps while it enters, recorded, issuing nothing. -/
theorem instanceCompleted_entering {ctx : Ctx} (ops : MultiInstanceOps ctx.program inv settled) {body : Nat}
    {scope : ScopeOccurrenceId} {state after : State} {run : MultiInstanceRun} {loop : MultiInstance} {index : Nat}
    {output : Option Value} (holds : inv state) (stands : scope ∈ Laws.State.scopeIds state)
    (done : Completes ctx body scope state after run loop index output) :
    ∃ results counted, Entering inv settled (recorded run index output results) counted
        (recorded run index output results).instances [] ∧ counted.nextIssue = state.nextIssue ∧
      recorded run index output results ∈ counted.slots.multiInstances ∧
      (after = Feature.MultiInstance.finish ctx loop (recorded run index output results) counted ∨
        ∃ items, after = Feature.MultiInstance.beginInstances ctx loop items (recorded run index output results)
          counted) := by
  obtain ⟨results, counted, left, ended⟩ := done.ends
  obtain ⟨kept, carried, standing, placed⟩ := ops.record state run index scope output results holds
    (Laws.MultiInstance.found_mem done.found) done.slot stands done.fits
  have base : Entering inv settled (recorded run index output results)
      (leftWith state scope (recorded run index output results)) (recorded run index output results).instances [] :=
    ⟨kept, carried, standing, placed, fun _ none => by cases none⟩
  refine ⟨results, counted, ?_, ?_, ?_, ended⟩ <;> rcases left with rfl | ⟨target, written, rule, rfl⟩
  · exact base
  · exact written_entering ops base _ _ _
  · exact leftWith_issue _ _ _
  · exact (signal_issue _ _).trans (leftWith_issue _ _ _)
  · exact setRun_mem _ _
  · rw [Laws.State.signal_eq]
    exact setRun_mem _ _

/-- `Hooks.instanceCompleted` keeps `inv` for an instance in a scope occurrence that stands: it records its slot,
leaving its scope occurrence, then completes the body or begins the next instances. -/
theorem instanceCompleted_keeps {ctx : Ctx} (ops : MultiInstanceOps ctx.program inv settled) {body : Nat}
    {occurrence : Occurrence} {writes : List (String × Value)} {state after : State} (holds : inv state)
    (stands : occurrence.scope ∈ Laws.State.scopeIds state)
    (ran : Feature.MultiInstance.instanceCompleted ctx body occurrence writes state = .ok after) : inv after := by
  obtain ⟨run, loop, index, found⟩ := instanceCompleted_spec ran
  obtain ⟨output, done⟩ := found
  obtain ⟨_, counted, recorded⟩ := instanceCompleted_entering ops holds stands done
  obtain ⟨entering, _, present, ended⟩ := recorded
  rcases ended with rfl | ⟨items, rfl⟩
  · exact finish_keeps ops entering
  · exact beginInstances_keeps ops entering fun _ => ⟨present, done.looped⟩

/-! ## Counters entered -/

/-- Whatever keeps `inv` without issuing past a state's counter enters no instance anew since that state. -/
theorem nothingCounted (ops : MultiInstanceOps program inv settled) {state after : State} (holds : inv after)
    (issued : after.nextIssue ≤ state.nextIssue) : SlotsCounted state after := by
  intro run member index scope slot fresh
  have := (ops.placed after run holds member scope (List.mem_of_getElem? slot)).1
  exact absurd (Nat.lt_of_lt_of_le this issued) (Nat.not_lt.mpr fresh)

/-- Setting the body's slot record after `Begun` enters each instance anew holding its counter, under `cibLocals` and
an item local not named `loopCounter`, when every slot active before was issued before `before`. -/
theorem begun_counted {ctx : Ctx} {loop : MultiInstance}
    {state queued : State} {run : MultiInstanceRun} {instances : List Iteration}
    (begun : Begun inv settled ctx loop state run queued instances) (before : State)
    (others : ∀ other ∈ state.slots.multiInstances, ∀ scope, Iteration.active scope ∈ other.instances →
      scope.value < before.nextIssue)
    (old : ∀ scope, Iteration.active scope ∈ run.instances → scope.value < before.nextIssue)
    (cib : ctx.program.options.multiInstanceCounters = .cibLocals)
    (apart : Feature.MultiInstance.itemName ctx loop ≠ some "loopCounter") :
    SlotsCounted before (Feature.MultiInstance.setRun queued { run with instances }) := by
  intro other member index scope slot fresh
  rcases mem_setRun member with ⟨held, _⟩ | rfl
  · rw [begun.slots] at held
    exact absurd fresh (Nat.not_le.mpr (others other held scope (List.mem_of_getElem? slot)))
  · rcases begun.counted index scope slot with earlier | ⟨_, counter⟩
    · exact absurd fresh (Nat.not_le.mpr (old scope (List.mem_of_getElem? earlier)))
    · obtain ⟨locals, present, at_, entry⟩ := counter cib apart
      exact ⟨locals, by rw [setRun_eq]; exact present, at_, entry⟩

/-- Beginning a body's instances enters each anew holding its counter, as `begun_counted` says. -/
theorem beginInstances_counted (ops : MultiInstanceOps program inv settled) {ctx : Ctx} {loop : MultiInstance}
    {items : List Value} {run : MultiInstanceRun} {state before : State}
    (entering : Entering inv settled run state run.instances [])
    (others : ∀ other ∈ state.slots.multiInstances, ∀ scope, Iteration.active scope ∈ other.instances →
      scope.value < before.nextIssue)
    (old : ∀ scope, Iteration.active scope ∈ run.instances → scope.value < before.nextIssue)
    (cib : ctx.program.options.multiInstanceCounters = .cibLocals)
    (apart : Feature.MultiInstance.itemName ctx loop ≠ some "loopCounter") :
    SlotsCounted before (Feature.MultiInstance.beginInstances ctx loop items run state) := by
  obtain ⟨queued, instances, ran, begun⟩ := beginInstances_spec (ctx := ctx) (loop := loop) (items := items) ops
    entering
  rw [ran]
  exact begun_counted begun before others old cib apart

/-- Entering a body and its first instances enters each holding its counter. -/
theorem enterBody_counted (ops : MultiInstanceOps program inv settled)
    {ctx : Ctx} {loop : MultiInstance} {items : List Value} {occurrence : Occurrence} {state : State} (holds : inv state)
    (member : occurrence ∈ state.occurrences) (begun : occurrence.begun = true) (element : ElementId)
    (locals : List (String × Value)) (unarmed : Bool) (collection : Value) (instances : List Iteration)
    (waiting : ∀ slot ∈ instances, slot = .waiting) (cib : ctx.program.options.multiInstanceCounters = .cibLocals)
    (apart : Feature.MultiInstance.itemName ctx loop ≠ some "loopCounter") :
    SlotsCounted state (Feature.MultiInstance.beginInstances ctx loop items
      { scope := (state.enterScope element occurrence.scope locals (some occurrence.id)).2, element,
        occurrence := occurrence.id, collection, instances }
      (if unarmed then (state.enterScope element occurrence.scope locals (some occurrence.id)).1
        else (state.enterScope element occurrence.scope locals (some occurrence.id)).1.signal
          (.arm occurrence.id element occurrence.scope))) := by
  obtain ⟨entering, slots, _⟩ := enterBody_entering ops holds member begun element locals unarmed collection instances
    waiting
  exact beginInstances_counted ops entering (fun other held scope active => by
      rw [slots] at held
      exact (ops.placed state other holds held scope active).1)
    (fun scope active => by cases waiting _ active) cib apart

/-- Under `cibLocals` and an item local not named `loopCounter`, `Hooks.arriveMultiInstance` enters each instance
holding its counter, or holds the occurrence. -/
theorem arriveMultiInstance_counted (ops : MultiInstanceOps program inv settled) {ctx : Ctx} {header : Header}
    {envelope : Envelope} {loop : MultiInstance} {occurrence : Occurrence} {state after : State} (holds : inv state)
    (member : occurrence ∈ state.occurrences) (begun : occurrence.begun = true)
    (cib : ctx.program.options.multiInstanceCounters = .cibLocals)
    (apart : Feature.MultiInstance.itemName ctx loop ≠ some "loopCounter")
    (ran : Feature.MultiInstance.arriveMultiInstance ctx header envelope loop occurrence state = .ok after) :
    (∃ held, after = state.hold held) ∨ SlotsCounted state after := by
  rcases arriveMultiInstance_spec ran with held | ⟨writes, rfl⟩ | ⟨locals, unarmed, entered⟩
  · exact .inl held
  · exact .inr (nothingCounted ops (ops.complete _ _ _ _ _ holds (ops.begun _ _ holds member begun))
      (Nat.le_of_eq (signal_issue _ _)))
  · obtain ⟨collection, count, items, rfl⟩ := entered
    exact .inr (enterBody_counted ops holds member begun _ _ _ _ _
      (fun _ inside => List.eq_of_mem_replicate inside) cib apart)

/-- Under `cibLocals` and loops whose item locals are not named `loopCounter`, `Hooks.instanceCompleted` enters each
next instance holding its counter. -/
theorem instanceCompleted_counted {ctx : Ctx} (ops : MultiInstanceOps ctx.program inv settled) {body : Nat}
    {occurrence : Occurrence} {writes : List (String × Value)} {state after : State} (holds : inv state)
    (stands : occurrence.scope ∈ Laws.State.scopeIds state)
    (cib : ctx.program.options.multiInstanceCounters = .cibLocals)
    (apart : ∀ element loop, Laws.MultiInstance.LoopOf ctx.program element loop →
      Feature.MultiInstance.itemName ctx loop ≠ some "loopCounter")
    (ran : Feature.MultiInstance.instanceCompleted ctx body occurrence writes state = .ok after) :
    SlotsCounted state after := by
  obtain ⟨run, loop, index, found⟩ := instanceCompleted_spec ran
  obtain ⟨output, done⟩ := found
  obtain ⟨_, counted, recorded⟩ := instanceCompleted_entering ops holds stands done
  obtain ⟨entering, issue, _, ended⟩ := recorded
  rcases ended with rfl | ⟨items, rfl⟩
  · exact nothingCounted ops (finish_keeps ops entering) (Nat.le_of_eq ((finish_issue _ _ _ _).trans issue))
  · refine beginInstances_counted ops entering (fun other held scope active => issue ▸
      (ops.placed counted other entering.1 held scope active).1) (fun scope active => ?_) cib
      (apart _ _ done.looped)
    exact (ops.placed state run holds (Laws.MultiInstance.found_mem done.found) scope
      ((List.mem_or_eq_of_mem_set active).resolve_right (by simp))).1

/-! ## Completions queued -/

/-- Recording an instance's slot queues nothing. -/
theorem leftWith_signals (state : State) (scope : ScopeOccurrenceId) (next : MultiInstanceRun) :
    (leftWith state scope next).signals = state.signals := by
  rw [leftWith, setRun_eq]
  exact Laws.State.leaveScope_signals state scope

/-- A body's slot record whose filled slots fit its loop still does once one slot is filled with an output that fits. -/
theorem recorded_fits {program : Program} {run : MultiInstanceRun} {loop : MultiInstance} {index : Nat}
    {output : Option Value} {results : List String} (fits : Laws.MultiInstance.OutputsFit run loop)
    (fresh : Laws.MultiInstance.OutputFits program run output) (looped : LoopOf program run.element loop) :
    Laws.MultiInstance.OutputsFit (recorded run index output results) loop := by
  intro filled member
  rcases List.mem_or_eq_of_mem_set member with old | new
  · exact fits filled old
  · obtain rfl := Iteration.completed.inj new
    exact ⟨fresh.1 loop looped, fresh.2⟩

/-- What a committed `Hooks.instanceCompleted` newly queues: writes of its body's counters, begins of its next
instances, or its body's completion, which writes what `Laws.MultiInstance.WritesCollection` allows of the slot record
it recorded, the one record of the body the after-state holds. -/
theorem instanceCompleted_queues {ctx : Ctx} {body : Nat} {occurrence : Occurrence} {writes : List (String × Value)}
    {state after : State} (ran : Feature.MultiInstance.instanceCompleted ctx body occurrence writes state = .ok after) :
    ∃ run loop index output, Completes ctx body occurrence.scope state after run loop index output ∧
      ∃ results new, after.signals = state.signals ++ new ∧ ∀ signal ∈ new,
        (∃ target counts rule, signal = .write target counts rule) ∨ (∃ request, signal = .begin request) ∨
        ∃ written, signal = .complete body .outgoing written .outward ∧
          Laws.MultiInstance.WritesCollection ctx.program loop (recorded run index output results) written ∧
          ∀ other ∈ after.slots.multiInstances, other.occurrence = body → other = recorded run index output results := by
  obtain ⟨run, loop, index, found⟩ := instanceCompleted_spec ran
  obtain ⟨output, done⟩ := found
  refine ⟨run, loop, index, output, done, ?_⟩
  obtain ⟨results, counted, left, ended⟩ := done.ends
  obtain rfl := Laws.MultiInstance.found_occurrence done.found
  obtain ⟨counts, queued, counters, slots⟩ : ∃ counts : List Signal, counted.signals = state.signals ++ counts ∧
      (∀ signal ∈ counts, ∃ target counts rule, signal = .write target counts rule) ∧
      counted.slots = (leftWith state occurrence.scope (recorded run index output results)).slots := by
    rcases left with rfl | ⟨target, counts, rule, rfl⟩
    · exact ⟨[], by rw [leftWith_signals, List.append_nil], fun _ none => (by cases none), rfl⟩
    · exact ⟨[.write target counts rule], by rw [Laws.State.signal_eq, leftWith_signals],
        fun _ inside => ⟨target, counts, rule, List.mem_singleton.mp inside⟩, by rw [Laws.State.signal_eq]⟩
  refine ⟨results, ?_⟩
  rcases ended with rfl | ⟨items, rfl⟩
  · obtain ⟨written, same, collects⟩ := finish_spec ctx loop (recorded run index output results) counted
    refine ⟨counts ++ [.complete run.occurrence .outgoing written .outward], ?_, fun signal inside => ?_⟩
    · rw [same, Laws.State.signal_eq, queued, List.append_assoc]
      rfl
    · rcases List.mem_append.mp inside with old | new
      · exact .inl (counters signal old)
      · refine .inr (.inr ⟨written, List.mem_singleton.mp new, collects, fun other member named => ?_⟩)
        rw [same, Laws.State.signal_eq] at member
        change other ∈ counted.slots.multiInstances at member
        rw [slots, leftWith] at member
        rcases mem_setRun member with ⟨_, differs⟩ | same
        · exact absurd named differs
        · exact same
  · obtain ⟨begins, same⟩ := Laws.MultiInstance.beginInstances_signals ctx loop items
      (recorded run index output results) counted
    refine ⟨counts ++ begins.map .begin, by rw [same, queued, List.append_assoc], fun signal inside => ?_⟩
    rcases List.mem_append.mp inside with old | new
    · exact .inl (counters signal old)
    · obtain ⟨request, _, rfl⟩ := List.mem_map.mp new
      exact .inr (.inl ⟨request, rfl⟩)

/-! ## Counters read -/

/-- Under `cibLocals`, a committed instance completion found the counters it reads held: its scope occurrence's
`loopCounter` and its body's counts (`CountersHeld`), given one record per body occurrence and an instance's scope
occurrence in one slot. -/
theorem instanceCompleted_countersHeld {ctx : Ctx} {body : Nat} {occurrence : Occurrence}
    {writes : List (String × Value)} {state after : State} {run : MultiInstanceRun} {loop : MultiInstance} {index : Nat}
    (keyed : Laws.MultiInstance.RunsKeyed state) (owned : Laws.MultiInstance.Owned state run)
    (cib : ctx.program.options.multiInstanceCounters = .cibLocals)
    (ran : Feature.MultiInstance.instanceCompleted ctx body occurrence writes state = .ok after)
    (member : run ∈ state.slots.multiInstances) (owns : run.occurrence = body) (looped : LoopOf ctx.program run.element loop)
    (slot : run.instances[index]? = some (.active occurrence.scope)) :
    Laws.MultiInstance.CountersHeld (state.ownVariables occurrence.scope) (state.ownVariables run.scope) run loop index := by
  obtain ⟨found, other, at_, rest⟩ := instanceCompleted_spec ran
  obtain ⟨_, done⟩ := rest
  obtain rfl := Laws.MultiInstance.runOf?_keyed keyed done.found member owns
  obtain rfl : other = loop := Option.some.inj ((done.looped : _ = some other).symm.trans looped)
  obtain rfl := owned.ownScopes at_ index occurrence.scope done.slot slot
  obtain ⟨bodyHeld, instanceHeld⟩ := done.intact
  obtain ⟨instanceCounts, bodyCounts⟩ := Laws.MultiInstance.counts_eq other found at_
  rw [instanceCounts] at instanceHeld
  rw [bodyCounts] at bodyHeld
  have held := @Laws.MultiInstance.holdsCounts_lookup ctx
  exact ⟨held cib instanceHeld rfl (by simp), held cib bodyHeld rfl (by simp), held cib bodyHeld rfl (by simp),
    held cib bodyHeld rfl (by simp)⟩

end Kernel.Proofs.MultiInstance
