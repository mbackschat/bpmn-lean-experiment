module

public import Kernel.Laws.Registry
public import Kernel.Proofs.Step
public import Kernel.Proofs.MultiInstance.Formed
public import Kernel.Proofs.MultiInstance.Begins
public import Kernel.Proofs.MultiInstance.Instances

/-! # Proofs: the Multi-Instance lane under the registered hooks

Under the registered hooks `WellFormed` and the lane's slot invariant but its numbering (`Framed`) hold through every
committed input: the other feature records follow from `WellFormed`'s and `FrameAlongside`
(`Proofs.Cancellation.featureOps_frame`), and the Multi-Instance hooks keep it by what `Laws.MultiInstance` proves each
does (`multiInstanceKeeps_framed`). Beside it they keep the numbering under a program whose identifiers are unique
(`Composed`), which supplies the numbering (`registered_numberingKept`); the lane's statements that read the slot
invariant whole follow from it and from the registered hooks keeping the reservations of looping elements unmade
(`registered_unbegunKept`), `RunsFramed.formed` composing them; the same relation gives `BeginOrder`
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
open Kernel.Laws.Step (OccurPending)
open Kernel.Proofs.Cancellation (featureOps_frame compensationKeeps_frame multiInstanceOps_alongside)
open Kernel.Proofs.Frame (phases_alongside closurePhases_alongside Alongside ClosureAlongside FrameAlongside
  StoresAlongside OccursAlongside)

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
  have entered := (runsFramed_frameAlongside program).enterScope state element occurrence.scope locals
    (some occurrence.id) formed (named ▸ Laws.Flow.Anchored.occurrence member) framed
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
      ctx.program) formed member begun header.id
      (enterBody_enters (Proofs.Step.registeredOps_wellFormed.multiInstance ctx.program) formed member begun named)
      (fun current kept present =>
        (Proofs.Step.registeredOps_wellFormed.multiInstance ctx.program).arm current occurrence _ kept present begun named)
      locals unarmed collection _ waiting).1 enteredFramed placed
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
    (featureOps_frame Proofs.Step.registeredOps_wellFormed.toFeatureOps
      (fun program => (runsFramed_frameAlongside program).toFrameAlongside) runsFramed_occursAlongside)
    multiInstanceKeeps_framed
    (compensationKeeps_frame Proofs.Step.registeredOps_wellFormed runsFramed_frameAlongside runsFramed_occursAlongside)
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

/-- The registered hooks keep `BeginsKept` beside `WellFormed`. -/
theorem beginsKept_contract :
    Laws.Step.HookContract Registry.hooks fun program s => WellFormed program s ∧ BeginsKept program s :=
  Proofs.Step.registered_contract_of
    (featureOps_frame Proofs.Step.registeredOps_wellFormed.toFeatureOps
      (fun program => (beginsKept_alongside program).toFrameAlongside) beginsKept_occursAlongside)
    (Proofs.Step.multiInstanceKeeps_of fun program =>
      multiInstanceOps_alongside (beginsKept_alongside program) (Proofs.Step.registeredOps_wellFormed.multiInstance program))
    (compensationKeeps_frame Proofs.Step.registeredOps_wellFormed beginsKept_stores beginsKept_occursAlongside)
    Proofs.State.stateFacts

/-- The phases a closure runs keep `BeginsKept` beside `WellFormed`. -/
theorem beginsKept_phases : Laws.Step.ClosurePhases fun program s => WellFormed program s ∧ BeginsKept program s :=
  closurePhases_alongside Proofs.Step.phases.toClosurePhases beginsKept_closureAlongside

/-- The registered hooks keep the reservations of looping elements unmade. -/
theorem registered_unbegunKept : UnbegunKept Registry.hooks :=
  unbegunKept_of beginsKept_contract beginsKept_phases (beginsKept_pipelinePhases Proofs.Step.pipelinePhases)
    Proofs.State.stateFacts Proofs.Step.initial_wellFormed

/-! ## The numbering under the registered hooks

Beside `Framed` the registered hooks keep the numbering under a program whose identifiers are unique
(`FramedNumbered`): the state operations by what `Kernel.Proofs.MultiInstance.Numbered` proves each keeps, reading the
slot invariant's ownership off `RunsFramed`; a reservation or a queued reservation names no looping element, from its
feature record (`Proofs.Frame.OccursAlongside`) or from the numbering of the state that queued it
(`BeginsQueued.occurs`); and the Multi-Instance hooks by `Kernel.Proofs.MultiInstance.Instances`. `Step`'s begin phase
reads the step's own program, which places a body's begun occurrence by its element's loop, so the phases are proved
here rather than through `Proofs.Frame.phases_alongside`, whose begin may read another. -/

/-- The slot invariant but its numbering, and the numbering under a program whose identifiers are unique. -/
def FramedNumbered (program : Program) (s : State) : Prop :=
  RunsFramed program s ∧ (IdsUnique program → Numbered program s)

/-- `WellFormed`, the slot invariant but its numbering, and the numbering under a program whose identifiers are
unique. -/
def Composed (program : Program) (s : State) : Prop :=
  WellFormed program s ∧ FramedNumbered program s

/-- What the numbering reads of the slot invariant. -/
theorem RunsFramed.owns {program : Program} {s : State} (framed : RunsFramed program s) : SlotsOwned s :=
  ⟨framed.keyed, fun run member => (framed.framed run member).owned,
    fun run member => (framed.framed run member).bodyOwns, fun run member => (framed.framed run member).unowned⟩

/-- The lane's slot invariant numbers its bodies' instances. -/
theorem RunsFormed.numbered {program : Program} {s : State} (formed : RunsFormed program s) : Numbered program s :=
  ⟨fun run member => ⟨by
    obtain ⟨loop, looped⟩ := formed.queued.looped run member
    exact ((formed.formed run member).shaped loop looped).2.2.2, (formed.formed run member).placed⟩, formed.queued⟩

/-- Queuing a signal that queues no begin and reserves only elements that do not loop keeps `Numbered`. -/
theorem Numbered.signalPending {program : Program} {s : State} {signal : Signal}
    (quiet : Laws.Step.beginsOf [signal] = [])
    (unlooped : ∀ element ∈ Laws.Step.occursOf [signal], ∀ loop, ¬ LoopOf program element loop)
    (held : Numbered program s) : Numbered program (s.signal signal) := by
  rw [Laws.State.signal_eq]
  have split : ∀ element, element ∈ Laws.Step.occursOf (s.signals ++ [signal]) →
      OccurPending s element ∨ ∀ loop, ¬ LoopOf program element loop := fun element inside => by
    rw [Laws.Step.occursOf_append] at inside
    rcases List.mem_append.mp inside with old | new
    · exact .inl ((Laws.Step.mem_occursOf.mp old).elim .inl (.inr ∘ .inl))
    · exact .inr (unlooped element new)
  refine held.unmoved rfl rfl rfl (by rw [Laws.Step.beginsOf_append, quiet, List.append_nil]) rfl
    fun element pending => ?_
  rcases pending with queued | resumed | ⟨run, member, rest⟩
  · exact split element (Laws.Step.mem_occursOf.mpr (.inl queued))
  · exact split element (Laws.Step.mem_occursOf.mpr (.inr resumed))
  · exact .inl (.inr (.inr ⟨run, member, rest⟩))

/-- A reservation a queued `Signal.occur` or compensation resume names, a boundary or one pending in a state that kept
the numbering, is of no looping element. -/
theorem source_unlooped {program : Program} {element : ElementId} (apart : IdsUnique program)
    (source : Laws.IL.BoundaryOf program element ∨ Laws.Step.PendingIn (FramedNumbered program) element) :
    ∀ loop, ¬ LoopOf program element loop :=
  source.elim (boundaryOf_unlooped apart) (PendingIn.unlooped fun _ kept => (kept.2 apart).2.occurs)

/-- The state operations the hooks apply keep the numbering beside the slot invariant. -/
theorem framedNumbered_frameAlongside (program : Program) :
    StoresAlongside program (FramedNumbered program) where
  frame s t moved kept := ⟨(runsFramed_frameAlongside program).frame s t moved kept.1, fun apart =>
    (kept.2 apart).unmoved moved.scopes moved.occurrences moved.multiInstances moved.begins moved.deferred
      fun element pending => .inl (moved.pending element pending)⟩
  emit s occurrence flows formed stands continues kept :=
    ⟨(runsFramed_frameAlongside program).emit s occurrence flows formed stands
      (continues.mono fun _ held => ⟨held.1, held.2.1⟩) kept.1, fun apart => by
      rw [Laws.State.emit_eq]
      exact (kept.2 apart).unmoved rfl rfl rfl rfl
        (by rw [Laws.Step.deferredOf_append, Laws.Step.deferredOf_flows, List.append_nil]) fun _ pending => .inl pending⟩
  complete s id leave writes rule source kept :=
    ⟨(runsFramed_frameAlongside program).complete s id leave writes rule (source.mono fun _ held => held.1) kept.1,
      fun apart => (kept.2 apart).signalOther Laws.Step.complete_apart⟩
  park s waiting formed waits kept := ⟨(runsFramed_frameAlongside program).park s waiting formed waits kept.1,
    fun apart => (kept.2 apart).unmoved rfl rfl rfl rfl rfl fun _ pending => .inl pending⟩
  arm s host element scope formed hosted kept :=
    ⟨(runsFramed_frameAlongside program).arm s host element scope formed hosted kept.1,
      fun apart => (kept.2 apart).signalOther Laws.Step.arm_apart⟩
  raise s raised origin formed cancel hosted kept :=
    ⟨(runsFramed_frameAlongside program).raise s raised origin formed cancel hosted kept.1,
      fun apart => (kept.2 apart).signalOther ⟨fun _ => nofun, fun _ _ _ _ _ => nofun, fun _ _ _ _ _ => nofun⟩⟩
  armGateway s occurrence header payload formed member gateway kept :=
    ⟨(runsFramed_frameAlongside program).armGateway s occurrence header payload formed member gateway kept.1,
      fun apart => (kept.2 apart).signalOther Laws.Step.armGateway_apart⟩
  signalBegin s request formed fits anchored kept := ⟨(runsFramed_frameAlongside program).signalBegin s
    request formed fits (anchored.mono fun _ held => ⟨held.1, held.2.1⟩) kept.1,
    fun apart => (kept.2 apart).signalBegin kept.1.owns fits.1 fits.2⟩
  issue s kept := ⟨(runsFramed_frameAlongside program).issue s kept.1, fun apart => (kept.2 apart).issue⟩
  enterScope s element parent locals owner formed anchored kept :=
    ⟨(runsFramed_frameAlongside program).enterScope s element parent locals owner formed
      (anchored.mono fun _ held => ⟨held.1, held.2.1⟩) kept.1,
      fun apart => (kept.2 apart).enterScope formed kept.1.owns element parent locals owner⟩
  reserve s element scope formed _ pending _ kept :=
    ⟨reserve_runsFramed s element scope kept.1, fun apart =>
      (kept.2 apart).reserve formed (PendingIn.unlooped (fun _ kept => (kept.2 apart).2.occurs) pending)⟩
  leaveScope s scope formed present leaves kept :=
    ⟨(runsFramed_frameAlongside program).leaveScope s scope formed present leaves kept.1,
      fun apart => (kept.2 apart).leaveScope formed kept.1.owns present⟩
  clearInside s scope keep formed present outside kept :=
    ⟨(runsFramed_frameAlongside program).clearInside s scope keep formed present outside kept.1,
      fun apart => (kept.2 apart).clearInside formed kept.1.owns present keep⟩
  disarm s host formed kept :=
    ⟨(runsFramed_frameAlongside program).disarm s host formed kept.1, fun apart => (kept.2 apart).disarm host⟩
  setVariable s target name value formed kept :=
    ⟨(runsFramed_frameAlongside program).setVariable s target name value formed kept.1,
      fun apart => (kept.2 apart).setVariable target name value⟩
  removeVariable s target name formed kept :=
    ⟨(runsFramed_frameAlongside program).removeVariable s target name formed kept.1,
      fun apart => (kept.2 apart).removeVariable target name⟩
  storeRuns s compensation formed fresh resumes provenance kept :=
    ⟨(runsFramed_frameAlongside program).storeRuns s compensation formed fresh
      (fun run member element at_ leave resumed => (resumes run member element at_ leave resumed).imp_right
        fun ⟨held, kept, queued⟩ => ⟨held, kept.1, queued⟩) (provenance.weaken fun _ held => ⟨held.1, held.2.1⟩)
      kept.1,
      fun apart => (kept.2 apart).storeRuns compensation fun run member element at_ leave resumed =>
        (resumes run member element at_ leave resumed).imp_right
          (PendingIn.unlooped fun _ kept => (kept.2 apart).2.occurs)⟩

/-- Subscriptions' reservations and queued occurrences keep the numbering beside the slot invariant: each names a
reservable element, a boundary or one pending in a state that kept it, none looping. -/
theorem framedNumbered_occursAlongside (program : Program) : OccursAlongside program (FramedNumbered program) where
  reserve s element scope formed stands reservable anchored kept :=
    ⟨(runsFramed_occursAlongside program).reserve s element scope formed stands reservable (anchored.mono fun _ held => ⟨held.1, held.2.1⟩) kept.1,
      fun apart =>
      (kept.2 apart).reserve formed (reservable_unlooped apart reservable)⟩
  occur s element scope leave writes rule formed source anchored kept :=
    ⟨(runsFramed_occursAlongside program).occur s element scope leave writes rule formed
      (source.imp_right fun ⟨held, kept, queued⟩ => ⟨held, kept.1, queued⟩) (anchored.mono fun _ held => ⟨held.1, held.2.1⟩) kept.1, fun apart =>
      (kept.2 apart).signalPending rfl fun named inside => by
        rw [List.mem_singleton.mp inside]
        exact source_unlooped apart source⟩
  compensate s scope activity trigger leave element at_ resumed source rolls anchored kept :=
    ⟨(runsFramed_occursAlongside program).compensate s scope activity trigger leave element at_ resumed
      (source.imp_right fun ⟨held, kept, queued⟩ => ⟨held, kept.1, queued⟩)
      (rolls.imp fun _ => And.imp_right (And.imp_right (And.imp_right
        (Laws.State.RollsBack.imp fun _ => And.imp_right And.left)))) (anchored.mono fun _ held => ⟨held.1, held.2.1⟩) kept.1, fun apart =>
      (kept.2 apart).signalPending rfl fun named inside => by
        rw [List.mem_singleton.mp inside]
        exact source_unlooped apart source⟩
  throwCompensate s occurrence scope activity trigger leave formed begunFrom named unnamed kept :=
    ⟨(runsFramed_occursAlongside program).throwCompensate s occurrence scope activity trigger leave formed
      (begunFrom.imp fun _ => And.imp_right And.left) named unnamed kept.1, fun apart =>
      (kept.2 apart).signalPending rfl fun _ inside => absurd inside List.not_mem_nil⟩
  raise s raised occurrence formed raises kept :=
    ⟨(runsFramed_occursAlongside program).raise s raised occurrence formed
      (raises.imp fun _ => And.imp_right And.left) kept.1, fun apart =>
      (kept.2 apart).signalPending rfl fun _ inside => absurd inside List.not_mem_nil⟩
  enterCalled s call variables definition formed member begun role activity unowned kept :=
    ⟨(runsFramed_occursAlongside program).enterCalled s call variables definition formed member begun role activity
      unowned kept.1,
      fun apart => (kept.2 apart).enterCalled formed kept.1.owns program call variables definition⟩

/-- Dropping a record that owns no scope occurrence keeps the numbering beside the slot invariant. -/
theorem framedNumbered_withoutRecord {program : Program} (t : State) (id : Nat)
    (unowned : ∀ entry ∈ t.scopes, entry.occurrence ≠ some id) (kept : FramedNumbered program t) :
    FramedNumbered program (Laws.State.withoutRecord t id) :=
  ⟨withoutRecord_carries unowned kept.1, fun apart => (kept.2 apart).withoutRecord id⟩

/-- A queued begin that begins no instance names no reservation of a body's element in one of its instances' scope
occurrences, as the numbering of the queue it left holds. -/
theorem reservedApart_of_dequeued {program : Program} {queue s : State} {request : BeginRequest}
    (held : Numbered program queue) (dequeued : Laws.Step.Dequeued program queue request s) :
    ReservedApart s request := by
  have queuedHere : Laws.State.Queued queue request := by
    rcases dequeued with ⟨_, head, _⟩ | ⟨_, _, shape, _⟩
    · exact .inl (head ▸ List.mem_cons_self ..)
    · rcases shape with ⟨_, tokens⟩ | tokens
      · exact .inr (tokens ▸ List.mem_cons_self ..)
      · exact .inr (tokens ▸ List.mem_append_right _ (List.mem_singleton_self _))
  intro reserved inside named run member active element role
  rcases dequeued with ⟨_, _, popped⟩ | ⟨_, _, _, popped⟩ <;> subst popped <;>
    exact held.2.reserved request queuedHere run member active _ named reserved inside rfl element role

/-- `Step`'s begin keeps the numbering: a fresh begin continues by its flows and names no reservation, a queued one
begins an instance or not as it continues, and its role is the step's program's (`Step.roleOf`). -/
theorem numbered_begin {program : Program} {s : State} {request : BeginRequest} {role : ActivationRole}
    {sourceType : String} (apart : IdsUnique program) (formed : WellFormed program s)
    (stands : Laws.Step.ScopeStands s request.scope) (admitted : Laws.Step.Admitted s request)
    (assigned : role = Step.roleOf program request)
    (origin : Laws.Step.BeginOrigin Composed program s request) (kept : FramedNumbered program s) :
    Numbered program (s.beginOccurrence request role sourceType).1 := by
  rcases origin with ⟨flows, fresh, _⟩ | ⟨queue, held, dequeued⟩
  · have other : ∀ body, request.continuation ≠ .multiInstance body := fun body same =>
      Laws.Step.flow_ne_multiInstance body (flows ▸ same)
    exact (kept.2 apart).beginOther formed admitted (fun looping => assigned.trans (roleOf_other other looping)) other
      (fun _ _ named => by rw [fresh] at named; cases named)
  · by_cases instance_ : ∃ body, request.continuation = .multiInstance body
    · obtain ⟨body, on⟩ := instance_
      obtain ⟨entry, inside, named⟩ := stands
      exact Numbered.beginInstance formed kept.1.owns (List.mem_map.mpr ⟨entry, inside, named⟩)
        (assigned.trans (roleOf_instance on)) on (held.2.2 apart) dequeued
    · have other : ∀ body, request.continuation ≠ .multiInstance body := fun body same => instance_ ⟨body, same⟩
      exact (kept.2 apart).beginOther formed admitted (fun looping => assigned.trans (roleOf_other other looping))
        other (reservedApart_of_dequeued (held.2.2 apart) dequeued)

/-- `Step`'s phases keep `Composed`: those that read `WellFormed` alone read its first part, and the others keep the
rest by what each operation keeps. -/
theorem composed_phases : Laws.Step.Phases Composed :=
  have phases := Proofs.Step.phases
  have unmoved : ∀ {program : Program} {s t : State}, FramedNumbered program s → t.scopes = s.scopes →
      t.occurrences = s.occurrences → t.slots = s.slots → t.signals = s.signals → t.tokens = s.tokens →
      FramedNumbered program t := fun kept scopes occurrences slots signals tokens =>
    ⟨kept.1.carry (.equal scopes occurrences (congrArg (·.multiInstances) slots)
      (congrArg (·.compensation.runs) slots)), fun apart => (kept.2 apart).unmoved scopes occurrences
      (congrArg (·.multiInstances) slots) (congrArg _ signals) (congrArg _ tokens) fun _ pending =>
        .inl ((pending_congr signals (congrArg (·.compensation.runs) slots)).mp pending)⟩
  { clock := fun _ s atMs holds => ⟨phases.clock _ _ atMs holds.1, unmoved holds.2 rfl rfl rfl rfl rfl⟩
    journal := fun _ s transition holds started ended =>
      ⟨phases.journal _ _ transition holds.1 started ended, unmoved holds.2 rfl rfl rfl rfl rfl⟩
    runOrder := fun _ s holds => ⟨phases.runOrder _ _ holds.1, unmoved holds.2 rfl rfl rfl rfl rfl⟩
    dequeue := fun _ s signals holds fewer => ⟨phases.dequeue _ _ signals holds.1 fewer,
      (runsFramed_stepAlongside _).dequeue s signals holds.1 fewer holds.2.1,
      fun apart => (holds.2.2 apart).dequeue fewer (.refl _)⟩
    untoken := fun _ s tokens holds fewer => ⟨phases.untoken _ _ tokens holds.1 fewer,
      (runsFramed_stepAlongside _).untoken s tokens holds.1 fewer holds.2.1,
      fun apart => (holds.2.2 apart).dequeue (.refl _) fewer⟩
    queueWrite := fun _ _ scope writes rule holds =>
      ⟨phases.queueWrite _ _ scope writes rule holds.1, (framedNumbered_frameAlongside _).signal holds.2 _⟩
    queueRemove := fun _ _ scope names holds =>
      ⟨phases.queueRemove _ _ scope names holds.1, (framedNumbered_frameAlongside _).signal holds.2 _⟩
    armIssued := fun _ _ host element scope holds => phases.armIssued _ _ host element scope holds.1
    armScopeIssued := fun _ _ scope holds => phases.armScopeIssued _ _ scope holds.1
    armGatewayIssued := fun _ _ host gateway scope holds => phases.armGatewayIssued _ _ host gateway scope holds.1
    endRecorded := fun _ _ status failure holds => phases.endRecorded _ _ status failure holds.1
    admittedSignal := fun _ _ request rest holds => phases.admittedSignal _ _ request rest holds.1
    admittedToken := fun _ _ request rest holds => phases.admittedToken _ _ request rest holds.1
    completeQueued := fun _ _ id leave writes rule holds => phases.completeQueued _ _ id leave writes rule holds.1
    resumable := fun _ _ scope activity trigger leave resume rest holds =>
      phases.resumable _ _ scope activity trigger leave resume rest holds.1
    raisable := fun _ _ raised origin rest holds => phases.raisable _ _ raised origin rest holds.1
    housed := fun _ _ occurrence holds => phases.housed _ _ occurrence holds.1
    issued := fun _ _ occurrence holds => phases.issued _ _ occurrence holds.1
    bodied := fun _ _ occurrence holds => phases.bodied _ _ occurrence holds.1
    newest := fun _ _ request role sourceType holds => phases.newest _ _ request role sourceType holds.1
    unrun := fun _ _ request role sourceType holds => phases.unrun _ _ request role sourceType holds.1
    unowned := fun _ _ request role sourceType holds => phases.unowned _ _ request role sourceType holds.1
    parkedBegun := fun _ _ waiting occurrence holds => phases.parkedBegun _ _ waiting occurrence holds.1
    endInstance := fun _ s status failure holds recorded => by
      refine ⟨phases.endInstance _ _ status failure holds.1 recorded, ?_⟩
      rw [Laws.Step.endInstance_eq]
      exact unmoved ((framedNumbered_frameAlongside _).clearInside s State.root [] holds.1 holds.1.rooted.1
        (fun _ _ none => by cases none) holds.2) rfl rfl rfl rfl rfl
    begin := fun _ s request role sourceType holds stands admitted roled bodied assigned origin =>
      have begun := phases.begin _ _ request role sourceType holds.1 stands admitted roled bodied assigned
        (origin.mono fun _ held => held.1)
      ⟨⟨begun.1, (runsFramed_stepAlongside _).begin s request role sourceType holds.1 stands admitted assigned
        (origin.mono fun _ held => ⟨held.1, held.2.1⟩) holds.2.1,
        fun apart => numbered_begin apart holds.1 stands admitted assigned origin holds.2⟩, begun.2⟩
    reserve := fun _ s element scope holds stands pending popped =>
      have reserved := phases.reserve _ _ element scope holds.1 stands (pending.imp fun _ => And.imp_left And.left)
        (popped.imp fun _ => Exists.imp fun _ => Exists.imp fun _ queued => queued.imp fun _ held => held.1)
      ⟨⟨reserved.1, (framedNumbered_frameAlongside _).reserve s element scope holds.1 stands
        (pending.imp fun _ => And.imp_left And.right) popped holds.2⟩, reserved.2⟩
    cancel := fun _ s id holds => ⟨phases.cancel _ _ id holds.1, (framedNumbered_frameAlongside _).cancelOccurrence
      framedNumbered_withoutRecord (fun _ _ _ kept => unmoved kept rfl rfl rfl rfl rfl) holds.1 holds.2⟩ }

/-- The completion pipeline's own phases keep `Composed`. -/
theorem composed_pipelinePhases : Laws.Step.PipelinePhases Composed :=
  have pipeline := runsFramed_pipelinePhases Proofs.Step.pipelinePhases
  { startReserved := fun _ s occurrence sourceType holds member unnamed =>
      have started := pipeline.startReserved _ s occurrence sourceType ⟨holds.1, holds.2.1⟩ member unnamed
      ⟨started.1, started.2, fun apart => by
        rw [Laws.State.closeOwnItems_eq]
        exact ((holds.2.2 apart).startReserved sourceType member).unmoved rfl rfl rfl rfl rfl
          fun _ pending => .inl pending⟩
    removeOccurrence := fun _ _ occurrence holds member free =>
      have removed := Proofs.Step.pipelinePhases.removeOccurrence _ _ occurrence holds.1 member free
      ⟨⟨removed.1, (framedNumbered_frameAlongside _).removeOccurrence framedNumbered_withoutRecord holds.1 holds.2⟩,
        removed.2⟩
    recordEnd := fun _ s key terminal holds =>
      have recorded := pipeline.recordEnd _ s key terminal ⟨holds.1, holds.2.1⟩
      ⟨recorded.1, recorded.2, fun apart => by
        rw [Laws.State.recordEnd_eq]
        exact (holds.2.2 apart).unmoved rfl rfl rfl rfl rfl fun _ pending => .inl pending⟩ }

/-- The registered Multi-Instance hooks keep `Composed`: `Framed` by `multiInstanceKeeps_framed`, and the numbering by
what `Kernel.Proofs.MultiInstance.Instances` proves each hook keeps, reading the slot invariant's ownership after each
step it takes off `RunsFramed`. -/
theorem multiInstanceKeeps_composed : Proofs.Step.MultiInstanceKeeps Composed where
  arrive ctx header envelope loop occurrence state after holds member begun body named looped newest unrun ran :=
    have framed := multiInstanceKeeps_framed.arrive ctx header envelope loop occurrence state after ⟨holds.1, holds.2.1⟩
      member begun body named looped newest unrun ran
    ⟨framed.1, framed.2, fun apart => numbered_arrive (Proofs.Step.registeredOps_wellFormed.multiInstance ctx.program)
      holds.1 holds.2.1.owns (holds.2.2 apart) member begun named looped (fun locals unarmed =>
        (enterBody_placed holds.1 holds.2.1 member body header.id named.symm locals unarmed .null 0).1.owns) unrun ran⟩
  completeBody ctx header envelope loop occurrence state after holds member ran :=
    have framed := multiInstanceKeeps_framed.completeBody ctx header envelope loop occurrence state after
      ⟨holds.1, holds.2.1⟩ member ran
    ⟨framed.1, framed.2, fun apart => numbered_completeBody (holds.2.2 apart) ran⟩
  instanceCompleted ctx body occurrence writes state after holds stands ran :=
    have framed := multiInstanceKeeps_framed.instanceCompleted ctx body occurrence writes state after
      ⟨holds.1, holds.2.1⟩ stands ran
    ⟨framed.1, framed.2, fun apart => numbered_instanceCompleted
      (Proofs.Step.registeredOps_wellFormed.multiInstance ctx.program) holds.1 holds.2.1.owns (holds.2.2 apart) stands
      (fun _ _ _ _ member slot fits => (leftWith_framed holds.1 holds.2.1 member slot fits).owns)
      (fun run member loop looped parallel => ((holds.2.1.framed run member).shaped loop looped).2.1 parallel) ran⟩

/-- The registered hooks keep `Composed`. -/
theorem composed_contract : Laws.Step.HookContract Registry.hooks Composed :=
  Proofs.Step.registered_contract_of
    (featureOps_frame Proofs.Step.registeredOps_wellFormed.toFeatureOps
      (fun program => (framedNumbered_frameAlongside program).toFrameAlongside) framedNumbered_occursAlongside)
    multiInstanceKeeps_composed
    (compensationKeeps_frame Proofs.Step.registeredOps_wellFormed framedNumbered_frameAlongside
      framedNumbered_occursAlongside)
    Proofs.State.stateFacts

/-- Clearing an input's journal, outbox, draft and writes keeps `Composed`. -/
theorem composed_reset {program : Program} {s : State} (holds : Composed program s) :
    Composed program { s with journal := [], outbox := [], draft := {}, writes := [] } :=
  ⟨Laws.State.reset_wellFormed holds.1, holds.2.1.carry (.equal rfl rfl rfl rfl), fun apart =>
    (holds.2.2 apart).unmoved rfl rfl rfl rfl rfl fun _ pending => .inl pending⟩

/-- A fresh instance numbers nothing: it holds no body, occurrence, queued signal or token, nor compensation run. -/
theorem numbered_initial (program : Program) (instanceId : String) (variables : List (String × Value))
    (businessKey : Option String) : Numbered program (State.initial instanceId variables businessKey) := by
  have empty := Laws.State.initial_empty instanceId variables businessKey
  have bodies := Laws.State.initial_bodies instanceId variables businessKey
  obtain ⟨occurrences, signals, tokens, runs⟩ := empty
  unfold Numbered
  refine ⟨fun _ member => by simp [bodies] at member, ?_⟩
  constructor <;> simp [bodies, occurrences, signals, tokens, runs, Laws.State.Queued, OccurPending]

/-- A start's fresh instance keeps `Composed`. -/
theorem composed_initial (program : Program) (instanceId : String) (variables : List (String × Value))
    (businessKey : Option String) :
    Composed program ((State.initial instanceId variables businessKey).signal (.armScope State.root)) :=
  have framed := framed_initial program instanceId variables businessKey
  ⟨framed.1, framed.2, fun _ => (numbered_initial program instanceId variables businessKey).signalPending rfl
    fun _ inside => by cases inside⟩

/-- A committed input on a running instance keeps `Composed` under the registered hooks. -/
theorem composed_stepKeeps {program : Program} {input : Input}
    {before after : State} (holds : Composed program before)
    (ran : Step.step Registry.hooks program (some before) input = .ok after) : Composed program after :=
  Laws.Step.running_keeps composed_contract composed_phases Proofs.State.stateFacts
    (Laws.Step.complete_keeps composed_contract composed_phases.toClosurePhases composed_pipelinePhases
      Proofs.State.stateFacts)
    (composed_reset holds) ran

/-- A committed start makes a `Composed` state under the registered hooks. -/
theorem composed_start {program : Program} {input : Input}
    {after : State} (ran : Step.step Registry.hooks program none input = .ok after) : Composed program after :=
  Laws.Step.step_keeps composed_contract composed_phases Proofs.State.stateFacts
    (Laws.Step.complete_keeps composed_contract composed_phases.toClosurePhases composed_pipelinePhases
      Proofs.State.stateFacts)
    (fun _ _ => composed_reset) (composed_initial program) (fun _ given => by simp at given) ran

/-- The registered hooks keep the numbering: the numbering lane's supply. -/
theorem registered_numberingKept : NumberingKept Registry.hooks :=
  ⟨fun _ _ _ _ apart formed runs ran =>
    (composed_stepKeeps ⟨formed, runs.framed, fun _ => runs.numbered⟩ ran).2.2 apart,
    fun _ _ _ apart ran => (composed_start ran).2.2 apart⟩

/-! ## The lane's statements -/

/-- The registered hooks keep every running body's instances `Apart`. -/
theorem registered_instancesApart :
    InstancesApart Registry.hooks := fun _ _ _ run ⟨formed, runs, _, ran⟩ member =>
  have after := framed_stepKeeps ⟨formed, runs.framed⟩ ran
  owned_apart after.1 (after.2.framed run member).owned

/-- The registered hooks keep the lane's slot invariant through a committed input. -/
theorem registered_runsFormed {program : Program} {input : Input}
    {before after : State} (apart : IdsUnique program)
    (formed : WellFormed program before) (runs : RunsFormed program before)
    (ran : Step.step Registry.hooks program (some before) input = .ok after) :
    WellFormed program after ∧ RunsFormed program after :=
  have framed := framed_stepKeeps ⟨formed, runs.framed⟩ ran
  ⟨framed.1, framed.2.formed framed.1 (registered_numberingKept.step _ _ _ _ apart formed runs ran)
    (registered_unbegunKept.step _ _ _ _ apart formed runs.unbegun runs.queued.occurs ran)⟩

/-- A committed start keeps the lane's slot invariant under the registered hooks. -/
theorem registered_runsFormedAtStart : RunsFormedAtStart Registry.hooks :=
    fun _ _ _ apart ran =>
  have framed := framed_start ran
  framed.2.formed framed.1 (registered_numberingKept.start _ _ _ apart ran)
    (registered_unbegunKept.start _ _ _ apart ran)

/-- Every instance a committed population run holds keeps the lane's slot invariant under the registered hooks. -/
theorem registered_runsFormedInPopulation :
    RunsFormedInPopulation Registry.hooks := fun _ _ _ ran member inside =>
  (Laws.Population.runStimuli_held
    (good := fun program s => Framed program s ∧ (IdsUnique program → RunsFormed program s))
    ⟨fun _ _ _ _ holds stepped => ⟨framed_stepKeeps holds.1 stepped, fun apart =>
      (registered_runsFormed apart holds.1.1 (holds.2 apart) stepped).2⟩,
      fun _ _ _ ran => ⟨framed_start ran, fun apart => registered_runsFormedAtStart _ _ _ apart ran⟩⟩
    ran member inside).2

/-- Every running body after a committed input is `Shaped` by its loop under the registered hooks. -/
theorem registered_runsShaped : RunsShaped Registry.hooks :=
  fun _ _ _ run loop apart ⟨formed, runs, _, ran⟩ member looped =>
    ((registered_runsFormed apart formed runs ran).2.formed run member).shaped loop looped

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
    Proofs.Cancellation.multiInstanceOps_alongside (unstarted_alongside b program)
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
    refine beginInstances_snapshots (enterBody_entering (Proofs.Step.registeredOps_wellFormed.multiInstance ctx.program)
      formed member begun header.id
      (enterBody_enters (Proofs.Step.registeredOps_wellFormed.multiInstance ctx.program) formed member begun named)
      (fun current kept present =>
        (Proofs.Step.registeredOps_wellFormed.multiInstance ctx.program).arm current occurrence _ kept present begun named)
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
    ⟨first.1, first.2, arriveMultiInstance_snapshots holds.1 holds.2.1 holds.2.2 member begun named newest ran⟩
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
    (featureOps_frame Proofs.Step.registeredOps_wellFormed.toFeatureOps (fun program => (since_frameAlongside b program).toFrameAlongside)
      (since_occursAlongside b))
    (since_multiInstanceKeeps b)
    (compensationKeeps_frame Proofs.Step.registeredOps_wellFormed (since_frameAlongside b) (since_occursAlongside b))
    Proofs.State.stateFacts

/-- `Step`'s phases keep `Since`. -/
theorem since_phases (b : State) : Laws.Step.Phases (Since b) :=
  phases_alongside Proofs.Step.phases (since_stepAlongside b)

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
