module

public import Kernel.Laws.Registry
public import Kernel.Proofs.Step
public import Kernel.Proofs.MultiInstance.Formed
public import Kernel.Proofs.MultiInstance.Begins

/-! # Proofs: the Multi-Instance lane under the registered hooks

Under the registered hooks `WellFormed` and the lane's slot invariant but its numbering (`Framed`) hold through every
committed input: the other feature records follow from `WellFormed`'s and `FrameAlongside`
(`Proofs.Cancellation.featureOps_frame`), and the Multi-Instance hooks keep it by what `Laws.MultiInstance` proves each
does (`multiInstanceKeeps_framed`). The lane's statements that read the slot invariant whole follow from what the
numbering lane supplies (`NumberingKept`) and from the registered hooks keeping the reservations of looping elements
unmade (`registered_unbegunKept`), `RunsFramed.formed` composing them; the same relation gives `BeginOrder`
(`Kernel.Proofs.MultiInstance.Begins`). `RunsGenerated` follows from what an input keeps of its start's bodies (`Since`),
carried from the input's reset start. This is the lane's one module that
imports the registry's Laws module, since it composes the registered hooks, and so stays in every feature's rebuild cone
(guard 15). Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Proofs.MultiInstance

open Kernel
open Kernel.Laws.State (WellFormed Within scopeIds)
open Kernel.Laws.MultiInstance (LoopOf Owned BodyOwns InstancesUnowned InstancesUnheld RunsKeyed NumberedInOrder
  InstancesPlaced BeginsQueued IdsUnique SequentialSlots OutputsFit)
open Kernel.Proofs.Cancellation (phases_alongside closurePhases_alongside featureOps_frame multiInstanceOps_alongside
  Alongside ClosureAlongside)

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


/-- The registered Multi-Instance hooks keep `Framed`: its `WellFormed` half by `Laws.MultiInstance.MultiInstanceOps`,
its `RunsFramed` half by what each hook does. -/
theorem multiInstanceKeeps_framed : Proofs.Step.MultiInstanceKeeps Framed where
  arrive ctx header envelope loop occurrence state after holds member begun body named looped newest unrun ran :=
    ⟨(Proofs.Step.multiInstanceKeeps_of Proofs.Step.registeredOps_wellFormed.multiInstance).arrive ctx header envelope
      loop occurrence state after holds.1 member begun body named looped newest unrun ran,
      arriveMultiInstance_framed holds.1 holds.2 member begun body named looped ran⟩
  completeBody ctx header envelope loop occurrence state after holds member ran :=
    ⟨(Proofs.Step.multiInstanceKeeps_of Proofs.Step.registeredOps_wellFormed.multiInstance).completeBody ctx header
      envelope loop occurrence state after holds.1 member ran, completeBody_framed holds.2 ran⟩
  instanceCompleted ctx body occurrence writes state after holds stands ran :=
    ⟨(Proofs.Step.multiInstanceKeeps_of Proofs.Step.registeredOps_wellFormed.multiInstance).instanceCompleted ctx body
      occurrence writes state after holds.1 stands ran, instanceCompleted_framed holds.1 holds.2 stands ran⟩

/-- The registered hooks keep `Framed`. -/
theorem framed_contract : Laws.Step.HookContract Registry.hooks Framed :=
  Proofs.Step.registered_contract_of
    (featureOps_frame Proofs.Step.registeredOps_wellFormed.toFeatureOps runsFramed_frameAlongside
      runsFramed_occursAlongside) multiInstanceKeeps_framed
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
    (Laws.Step.complete_keeps framed_contract framed_phases.toClosurePhases
      (runsFramed_pipelinePhases Proofs.Step.pipelinePhases) Proofs.State.stateFacts)
    (framed_reset holds) ran

/-- A committed start makes a `Framed` state under the registered hooks. -/
theorem framed_start {program : Program} {input : Input}
    {after : State} (ran : Step.step Registry.hooks program none input = .ok after) : Framed program after :=
  Laws.Step.step_keeps framed_contract framed_phases Proofs.State.stateFacts
    (Laws.Step.complete_keeps framed_contract framed_phases.toClosurePhases
      (runsFramed_pipelinePhases Proofs.Step.pipelinePhases) Proofs.State.stateFacts)
    (fun _ _ => framed_reset) (framed_initial program) (fun _ given => by simp at given) ran

/-! ## The reservations of looping elements and the order instances begin in -/

/-- The state operations the hooks apply keep `BeginsKept` (`Kernel.Proofs.MultiInstance.Begins`). -/
theorem beginsKept_alongside (program : Program) : Alongside (BeginsKept program) where
  frame _ _ moved held := held.frame (fun _ inside => moved.occurrences ▸ inside) moved.pending moved.journal
    (congrArg (·.started) moved.draft)
  signalBegin _ request _ held := held.signalBegin request
  issue _ held := held.issue
  enterScope _ _ element parent locals owner _ held := held.enterScope element parent locals owner
  enterCalled _ _ called call variables definition formed held := held.enterCalled formed called call variables definition
  reserve _ _ _ scope _ pending held := held.reserve (fun apart => PendingIn.unlooped apart pending) scope
  leaveScope _ _ _ formed present _ held := held.leaveScope formed present
  clearInside _ _ _ keep formed present _ held := held.clearInside formed present keep
  disarm _ _ host _ held := held.disarm host
  setVariable _ _ target name value _ held := held.setVariable target name value
  removeVariable _ _ target name _ held := held.removeVariable target name
  storeRuns _ _ compensation _ _ resumes held := held.storeRuns compensation resumes
  instanceBegin _ request held := held.signalBegin request
  defer _ requests held := held.defer requests
  leaveInstance _ _ _ _ formed _ _ present held := held.leaveScope formed present
  runs _ runs held := held.runs runs

/-- The phases a closure runs keep `BeginsKept`; cancelling is `FrameAlongside.cancelOccurrence`. -/
theorem beginsKept_closureAlongside (program : Program) : ClosureAlongside (BeginsKept program) where
  toFrameAlongside := (beginsKept_alongside program).toFrameAlongside
  journal _ _ transition _ held started _ := held.journal transition started
  dequeue _ _ _ _ fewer held := held.dequeue fewer
  untoken _ _ tokens _ _ held := held.untoken tokens
  begin _ _ _ role sourceType formed _ admitted _ _ held := held.begin formed admitted role sourceType
  cancel _ _ _ formed held := (beginsKept_alongside program).toFrameAlongside.cancelOccurrence
    (fun _ id _ kept => kept.withoutRecord id) (fun _ _ _ kept => kept.draft _ rfl) formed held

/-- The completion pipeline's own phases keep `BeginsKept` where they keep `WellFormed`. -/
theorem beginsKept_pipelinePhases (pipeline : Laws.Step.PipelinePhases WellFormed) :
    Laws.Step.PipelinePhases fun program s => WellFormed program s ∧ BeginsKept program s where
  startReserved _ _ occurrence sourceType holds member unnamed :=
    ⟨pipeline.startReserved _ _ occurrence sourceType holds.1 member unnamed, holds.2.startReserved sourceType member⟩
  removeOccurrence program _ occurrence holds member free :=
    have removed := pipeline.removeOccurrence _ _ occurrence holds.1 member free
    ⟨⟨removed.1, (beginsKept_alongside program).toFrameAlongside.removeOccurrence
      (fun _ id _ kept => kept.withoutRecord id) holds.1 holds.2⟩, removed.2⟩
  recordEnd _ _ key terminal holds := ⟨pipeline.recordEnd _ _ key terminal holds.1, holds.2.recordEnd key terminal⟩

/-- The registered hooks keep `BeginsKept` beside `WellFormed`. -/
theorem beginsKept_contract :
    Laws.Step.HookContract Registry.hooks fun program s => WellFormed program s ∧ BeginsKept program s :=
  Proofs.Step.registered_contract_of
    (featureOps_frame Proofs.Step.registeredOps_wellFormed.toFeatureOps
      (fun program => (beginsKept_alongside program).toFrameAlongside) beginsKept_occursAlongside)
    (Proofs.Step.multiInstanceKeeps_of fun program =>
      multiInstanceOps_alongside (beginsKept_alongside program) (Proofs.Step.registeredOps_wellFormed.multiInstance program))
    Proofs.State.stateFacts

/-- The phases a closure runs keep `BeginsKept` beside `WellFormed`. -/
theorem beginsKept_phases : Laws.Step.ClosurePhases fun program s => WellFormed program s ∧ BeginsKept program s :=
  closurePhases_alongside Proofs.Step.phases.toClosurePhases beginsKept_closureAlongside

/-- The registered hooks keep the reservations of looping elements unmade. -/
theorem registered_unbegunKept : UnbegunKept Registry.hooks :=
  unbegunKept_of beginsKept_contract beginsKept_phases (beginsKept_pipelinePhases Proofs.Step.pipelinePhases)
    Proofs.State.stateFacts Proofs.Step.initial_wellFormed

/-! ## The lane's statements -/

/-- The registered hooks keep every running body's instances `Apart`. -/
theorem registered_instancesApart :
    InstancesApart Registry.hooks := fun _ _ _ run ⟨formed, runs, _, ran⟩ member =>
  have after := framed_stepKeeps ⟨formed, runs.framed⟩ ran
  owned_apart after.1 (after.2.framed run member).owned

/-- The registered hooks keep the lane's slot invariant through a committed input, given the numbering lane's
supply. -/
theorem registered_runsFormed (numbering : NumberingKept Registry.hooks) {program : Program} {input : Input}
    {before after : State} (apart : IdsUnique program)
    (formed : WellFormed program before) (runs : RunsFormed program before)
    (ran : Step.step Registry.hooks program (some before) input = .ok after) :
    WellFormed program after ∧ RunsFormed program after :=
  have framed := framed_stepKeeps ⟨formed, runs.framed⟩ ran
  ⟨framed.1, framed.2.formed framed.1 (numbering.step _ _ _ _ apart formed runs ran)
    (registered_unbegunKept.step _ _ _ _ apart formed runs.unbegun runs.queued.occurs ran)⟩

/-- A committed start keeps the lane's slot invariant under the registered hooks, given the numbering lane's supply. -/
theorem registered_runsFormedAtStart (numbering : NumberingKept Registry.hooks) : RunsFormedAtStart Registry.hooks :=
    fun _ _ _ apart ran =>
  have framed := framed_start ran
  framed.2.formed framed.1 (numbering.start _ _ _ apart ran) (registered_unbegunKept.start _ _ _ apart ran)

/-- Every instance a committed population run holds keeps the lane's slot invariant under the registered hooks, given
the numbering lane's supply. -/
theorem registered_runsFormedInPopulation (numbering : NumberingKept Registry.hooks) :
    RunsFormedInPopulation Registry.hooks := fun _ _ _ ran member inside =>
  (Laws.Population.runStimuli_held
    (good := fun program s => Framed program s ∧ (IdsUnique program → RunsFormed program s))
    ⟨fun _ _ _ _ holds stepped => ⟨framed_stepKeeps holds.1 stepped, fun apart =>
      (registered_runsFormed numbering apart holds.1.1 (holds.2 apart) stepped).2⟩,
      fun _ _ _ ran => ⟨framed_start ran, fun apart => registered_runsFormedAtStart numbering _ _ _ apart ran⟩⟩
    ran member inside).2

/-- Every running body after a committed input is `Shaped` by its loop under the registered hooks, given the numbering
lane's supply. -/
theorem registered_runsShaped (numbering : NumberingKept Registry.hooks) : RunsShaped Registry.hooks :=
  fun _ _ _ run loop apart ⟨formed, runs, _, ran⟩ member looped =>
    ((registered_runsFormed numbering apart formed runs ran).2.formed run member).shaped loop looped

/-- Within a committed input's journal the instances of a Multi-Instance element begin in generation order under the
registered hooks. -/
theorem registered_beginOrder : BeginOrder Registry.hooks := fun _ _ _ _ _ processInstance apart ⟨formed, runs, _, ran⟩ looped =>
  beginsInOrder_of beginsKept_contract beginsKept_phases (beginsKept_pipelinePhases Proofs.Step.pipelinePhases)
    Proofs.State.stateFacts processInstance apart formed runs.unbegun runs.queued.occurs ran looped

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
  arrive ctx header envelope loop occurrence state after holds member begun body named looped newest unrun ran :=
    have first := (unstarted_keeps b).arrive ctx header envelope loop occurrence state after ⟨holds.1, holds.2.1⟩ member
      begun body named looped newest unrun ran
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
    (featureOps_frame Proofs.Step.registeredOps_wellFormed.toFeatureOps (fun _ => since_frameAlongside b)
      (since_occursAlongside b))
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

/-- A committed input on a running instance keeps `Since` of its before-state under the registered hooks, from the
input's start, which `Since` holds of though the before-state's draft may not be empty. -/
theorem since_stepKeeps {program : Program} {input : Input} {b after : State} (formed : WellFormed program b)
    (keyed : RunsKeyed b) (ran : Step.step Registry.hooks program (some b) input = .ok after) : Since b program after :=
  Laws.Step.running_keeps (since_contract b) (since_phases b) Proofs.State.stateFacts
    (Laws.Step.complete_keeps (since_contract b) (since_phases b).toClosurePhases
      (since_pipelinePhases b Proofs.Step.pipelinePhases) Proofs.State.stateFacts)
    (since_reset formed keyed) ran

/-- A body begun by a committed input has at least one slot, and a body running before and after it keeps its
snapshot, slot count and filled slots, under the registered hooks. -/
theorem registered_runsGenerated : RunsGenerated Registry.hooks :=
  fun _ _ _ run ⟨formed, runs, _, ran⟩ member =>
    have since := since_stepKeeps formed runs.keyed ran
    ⟨since.2.2.generatedOf member, fun earlier inside same => since.2.2.fixed earlier inside run member same.symm⟩

end Since

end Kernel.Proofs.MultiInstance
