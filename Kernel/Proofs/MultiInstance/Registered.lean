module

public import Kernel.Laws.Registry
public import Kernel.Proofs.Step
public import Kernel.Proofs.MultiInstance.Formed
public import Kernel.Proofs.MultiInstance.Begins
public import Kernel.Proofs.MultiInstance.Instances
public import Kernel.Proofs.MultiInstance.Since

/-! # Proofs: the Multi-Instance lane under the registered hooks

Under the registered hooks `WellFormed` and the lane's slot invariant but its numbering (`Framed`) hold through every
committed input: the other feature records follow from `WellFormed`'s and `FrameAlongside`
(`Proofs.Cancellation.featureOps_frame`), and the Multi-Instance hooks keep it by what `Laws.MultiInstance` proves each
does (`multiInstanceKeeps_framed`). Beside it they keep the numbering under a program whose identifiers are unique
(`Composed`), which supplies the numbering (`registered_numberingKept`); the lane's statements that read the slot
invariant whole follow from it and from the registered hooks keeping the reservations of looping elements unmade
(`registered_unbegunKept`), `RunsFramed.formed` composing them; the same relation gives `BeginOrder`
(`Kernel.Proofs.MultiInstance.Begins`). `RunsGenerated` follows from what an input keeps of its start's bodies
(`Kernel.Proofs.MultiInstance.Since`), carried from the input's reset start. This is the lane's one module that imports
the registry's Laws module, since it composes the registered hooks, and so stays in every feature's rebuild cone
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
open Kernel.Proofs.Frame (phases_alongside closurePhases_alongside bodyPhases_alongside Alongside ClosureAlongside FrameAlongside
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
    (some occurrence.id) formed (formed.owned.occurrenceScopes occurrence member)
    (named ▸ Laws.Flow.Anchored.occurrence member) framed
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
    · exact absurd same (Laws.State.scopes_fresh formed entry old)
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
theorem instanceCompleted_framed {ctx : Ctx} {body : OccurrenceId} {occurrence : Occurrence} {writes : List (String × Value)}
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
  phases_alongside Proofs.Step.phases runsFramed_stepAlongside fun _ _ _ kept => kept.carry (.equal rfl rfl rfl rfl)

/-- Clearing an input's journal, intents, draft and writes keeps `Framed`. -/
theorem framed_reset {program : Program} {s : State} (holds : Framed program s) (committed : Laws.State.Committed s) :
    Framed program { s with journal := [], intents := [], transitions := ∅, outboxes := ∅, draft := {}, writes := [], completionBase := s.nextCompletion } :=
  ⟨Laws.State.reset_wellFormed holds.1 committed, holds.2.carry (.equal rfl rfl rfl rfl)⟩

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
    {before after : State} (holds : Framed program before) (committed : Laws.State.Committed before)
    (ran : Step.step Registry.hooks program (some before) input = .ok after) :
    Framed program after ∧ Laws.State.Committed after :=
  Proofs.State.running_keeps framed_contract framed_phases (Laws.Step.complete_keeps framed_contract
      framed_phases.toBodyPhases (runsFramed_pipelinePhases Proofs.Step.pipelinePhases) Proofs.State.stateFacts)
    Proofs.Step.registered_framing Proofs.Step.registered_keysAux (fun _ _ holds => holds.1) committed
    (framed_reset holds committed) ran

/-- A committed start makes a `Framed` state under the registered hooks. -/
theorem framed_start {program : Program} {input : Input}
    {after : State} (ran : Step.step Registry.hooks program none input = .ok after) :
    Framed program after ∧ Laws.State.Committed after :=
  Proofs.State.step_keeps framed_contract framed_phases (Laws.Step.complete_keeps framed_contract
      framed_phases.toBodyPhases (runsFramed_pipelinePhases Proofs.Step.pipelinePhases) Proofs.State.stateFacts)
    Proofs.Step.registered_framing Proofs.Step.registered_keysAux (fun _ _ holds => holds.1) (fun _ _ => framed_reset)
    (framed_initial program) (fun _ given => by simp at given) ran

/-! ## The reservations of looping elements and the order instances begin in -/

/-- The registered hooks keep `BeginsKept` of each snapshot of the transitions beside `WellFormed`. -/
theorem beginsKept_contract (T : TreeMap UnitKey Transition compare) :
    Laws.Step.HookContract Registry.hooks fun program s => WellFormed program s ∧ BeginsKept program T s :=
  Proofs.Step.registered_contract_of
    (featureOps_frame Proofs.Step.registeredOps_wellFormed.toFeatureOps
      (fun program => (beginsKept_alongside program T).toFrameAlongside)
      fun program => beginsKept_occursAlongside (T := T) program)
    (Proofs.Step.multiInstanceKeeps_of fun program =>
      multiInstanceOps_alongside (beginsKept_alongside program T)
        (Proofs.Step.registeredOps_wellFormed.multiInstance program))
    (compensationKeeps_frame Proofs.Step.registeredOps_wellFormed (fun program => beginsKept_stores program T)
      fun program => beginsKept_occursAlongside (T := T) program)
    Proofs.State.stateFacts

/-- The phases a micro-step's body runs keep `BeginsKept` of each snapshot of the transitions beside `WellFormed`. -/
theorem beginsKept_phases (T : TreeMap UnitKey Transition compare) :
    Laws.Step.BodyPhases fun program s => WellFormed program s ∧ BeginsKept program T s :=
  bodyPhases_alongside Proofs.Step.phases.toBodyPhases fun program => beginsKept_bodyAlongside program T

/-- The registered hooks keep the reservations of looping elements unmade. -/
theorem registered_unbegunKept : UnbegunKept Registry.hooks :=
  unbegunKept_of beginsKept_contract beginsKept_phases (beginsKept_pipelinePhases Proofs.Step.pipelinePhases)
    (Proofs.Step.registered_contract Proofs.Step.registeredOps_wellFormed Proofs.State.stateFacts)
    Proofs.Step.phases.toClosurePhases Proofs.Step.pipelinePhases Proofs.Step.registered_framing Proofs.State.stateFacts
    Proofs.Step.initial_wellFormed fun instanceId variables businessKey =>
      (Proofs.State.initial_between instanceId variables businessKey).1

/-! ## The numbering under the registered hooks

Beside `Framed` the registered hooks keep the numbering under a program whose identifiers are unique
(`FramedNumbered`): the state operations by what `Kernel.Proofs.MultiInstance.Numbered` proves each keeps, reading the
slot invariant's ownership off `RunsFramed`; a reservation or a queued reservation names no looping element, from its
feature record (`Proofs.Frame.OccursAlongside`) or from the numbering of the state that queued it
(`BeginsQueued.occurs`); and the Multi-Instance hooks by `Kernel.Proofs.MultiInstance.Instances`. `Step`'s begin phase
reads the step's own program, which places a body's begun occurrence by its element's loop, so the phases are proved
here rather than through `Proofs.Frame.phases_alongside`, whose begin may read another. -/

/-- The slot invariant but its numbering, and the numbering under a program whose identifiers are unique. -/
def Numbering (program : Program) (s : State) : Prop :=
  RunsFramed program s ∧ (IdsUnique program → Numbered program s)

/-- `Numbering` and the continuations (`Continued`), which the commit's numbering reads. -/
def FramedNumbered (program : Program) (s : State) : Prop :=
  Numbering program s ∧ Continued s

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
  have split : ∀ element, element ∈ Laws.Step.occursOf (Laws.State.allSignals { s with batchSignals := s.batchSignals ++ [signal] }) →
      OccurPending s element ∨ ∀ loop, ¬ LoopOf program element loop := fun element inside => by
    rw [Laws.State.allSignals_append, Laws.Step.occursOf_append] at inside
    rcases List.mem_append.mp inside with old | new
    · exact .inl ((Laws.Step.mem_occursOf.mp old).elim .inl (.inr ∘ .inl))
    · exact .inr (unlooped element new)
  refine held.unmoved rfl rfl rfl (by rw [Laws.Step.beginsOf_append, quiet, List.append_nil]) rfl rfl rfl
    fun element pending => ?_
  rcases pending with queued | resumed | ⟨run, member, rest⟩
  · exact split element (Laws.Step.mem_occursOf.mpr (.inl queued))
  · exact split element (Laws.Step.mem_occursOf.mpr (.inr resumed))
  · exact .inl (.inr (.inr ⟨run, member, rest⟩))

/-- A reservation a queued `Signal.occur` or compensation resume names, a boundary or one pending in a state that kept
the numbering, is of no looping element. -/
theorem source_unlooped {program : Program} {element : ElementId} (apart : IdsUnique program)
    (source : Laws.IL.BoundaryOf program element ∨ Laws.Step.PendingIn (Numbering program) element) :
    ∀ loop, ¬ LoopOf program element loop :=
  source.elim (boundaryOf_unlooped apart) (PendingIn.unlooped fun _ kept => (kept.2 apart).2.occurs)

/-- The state operations the hooks apply keep the numbering beside the slot invariant. -/
theorem numbering_frameAlongside (program : Program) :
    StoresAlongside program (Numbering program) where
  frame s t moved kept := ⟨(runsFramed_frameAlongside program).frame s t moved kept.1, fun apart =>
    (kept.2 apart).unmoved moved.scopes moved.occurrences moved.multiInstances moved.begins moved.deferred
      moved.queuedSignals moved.queuedTokens fun element pending => .inl (moved.pending element pending)⟩
  emit s occurrence flows formed stands continues kept :=
    ⟨(runsFramed_frameAlongside program).emit s occurrence flows formed stands
      (continues.mono fun _ held => ⟨held.1, held.2.1⟩) kept.1, fun apart => by
      rw [Laws.State.emit_eq]
      exact (kept.2 apart).unmoved rfl rfl rfl rfl
        (by rw [Laws.Step.deferredOf_append, Laws.Step.deferredOf_flows, List.append_nil]) rfl rfl
        fun _ pending => .inl pending⟩
  complete s id leave writes rule source kept :=
    ⟨(runsFramed_frameAlongside program).complete s id leave writes rule (source.mono fun _ held => held.1) kept.1,
      fun apart => (kept.2 apart).signalOther Laws.Step.complete_apart⟩
  park s waiting formed waits kept := ⟨(runsFramed_frameAlongside program).park s waiting formed waits kept.1,
    fun apart => (kept.2 apart).unmoved rfl rfl rfl rfl rfl rfl rfl fun _ pending => .inl pending⟩
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
  takeCompletion s kept := ⟨(runsFramed_frameAlongside program).takeCompletion s kept.1, fun apart => (kept.2 apart).takeCompletion⟩
  enterScope s element parent locals owner formed stands anchored kept :=
    ⟨(runsFramed_frameAlongside program).enterScope s element parent locals owner formed stands
      (anchored.mono fun _ held => ⟨held.1, held.2.1⟩) kept.1,
      fun apart => (kept.2 apart).enterScope formed kept.1.owns element parent locals owner stands⟩
  reserve s element scope formed stands pending _ kept :=
    ⟨reserve_runsFramed s element scope kept.1, fun apart =>
      (kept.2 apart).reserve formed (PendingIn.unlooped (fun _ kept => (kept.2 apart).2.occurs) pending) stands.mem⟩
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
theorem numbering_occursAlongside (program : Program) : OccursAlongside program (Numbering program) where
  reserve s element scope formed stands reservable anchored kept :=
    ⟨(runsFramed_occursAlongside program).reserve s element scope formed stands reservable (anchored.mono fun _ held => ⟨held.1, held.2.1⟩) kept.1,
      fun apart =>
      (kept.2 apart).reserve formed (reservable_unlooped apart reservable) stands.mem⟩
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
      fun apart => (kept.2 apart).enterCalled formed kept.1.owns program call variables definition
        (formed.owned.occurrenceScopes call member)⟩

/-- Dropping a record that owns no scope occurrence keeps the numbering beside the slot invariant. -/
theorem numbering_withoutRecord {program : Program} (t : State) (id : OccurrenceId)
    (unowned : ∀ entry ∈ t.scopes, entry.occurrence ≠ some id) (kept : Numbering program t) :
    Numbering program (Laws.State.withoutRecord t id) :=
  ⟨withoutRecord_carries unowned kept.1, fun apart => (kept.2 apart).withoutRecord id⟩

/-- A queued begin that begins no instance names no reservation of a body's element in one of its instances' scope
occurrences, as the numbering of the queue it left holds. -/
theorem reservedApart_of_dequeued {program : Program} {queue s : State} {request : BeginRequest}
    (held : Numbered program queue) (dequeued : Laws.Step.Dequeued program queue request s) :
    ReservedApart s request := by
  have queuedHere : Laws.State.Queued queue request := by
    rcases dequeued.queued with ⟨unit, found, _⟩ | ⟨unit, found, _⟩
    · exact .inl (List.mem_append_left _ (Laws.State.mem_values.mpr ⟨unit, found⟩))
    · exact .inr (List.mem_append_left _ (Laws.State.mem_values.mpr ⟨unit, found⟩))
  intro reserved inside named run member active element role
  rcases dequeued.queued with ⟨_, _, popped⟩ | ⟨_, _, popped⟩ <;> subst popped <;>
    exact held.2.reserved request queuedHere run member active _ named reserved inside rfl element role

/-- `Step`'s begin keeps the numbering: a fresh begin continues by its flows and names no reservation, a queued one
begins an instance or not as it continues, and its role is the step's program's (`Step.roleOf`). -/
theorem numbered_begin {program : Program} {s : State} {request : BeginRequest} {role : ActivationRole}
    {sourceType : String} (apart : IdsUnique program) (formed : WellFormed program s)
    (stands : Laws.Step.ScopeStands s request.scope) (admitted : Laws.Step.Admitted s request)
    (assigned : role = Step.roleOf program request)
    (origin : Laws.Step.BeginOrigin Composed program s request) (kept : Numbering program s) :
    Numbered program (s.beginOccurrence request role sourceType).1 := by
  rcases origin with ⟨flows, fresh, _⟩ | ⟨queue, held, dequeued⟩
  · have other : ∀ body, request.continuation ≠ .multiInstance body := fun body same =>
      Laws.Step.flow_ne_multiInstance body (flows ▸ same)
    exact (kept.2 apart).beginOther formed stands.mem admitted (fun looping => assigned.trans (roleOf_other other looping)) other
      (fun _ _ named => by rw [fresh] at named; cases named)
  · by_cases instance_ : ∃ body, request.continuation = .multiInstance body
    · obtain ⟨body, on⟩ := instance_
      obtain ⟨entry, inside, named⟩ := stands
      exact Numbered.beginInstance formed kept.1.owns (List.mem_map.mpr ⟨entry, inside, named⟩)
        (assigned.trans (roleOf_instance on)) on (held.2.1.2 apart) dequeued
    · have other : ∀ body, request.continuation ≠ .multiInstance body := fun body same => instance_ ⟨body, same⟩
      exact (kept.2 apart).beginOther formed stands.mem admitted (fun looping => assigned.trans (roleOf_other other looping))
        other (reservedApart_of_dequeued (held.2.1.2 apart) dequeued)

/-- A change that moves nothing the slot invariant and the numbering read keeps them. -/
theorem numbering_unmoved {program : Program} {s t : State} (kept : Numbering program s)
    (scopes : t.scopes = s.scopes) (occurrences : t.occurrences = s.occurrences) (slots : t.slots = s.slots)
    (signals : t.batchSignals = s.batchSignals) (tokens : t.batchTokens = s.batchTokens) (queuedSignals : t.queuedSignals = s.queuedSignals)
    (queuedTokens : t.queuedTokens = s.queuedTokens) : Numbering program t :=
  ⟨kept.1.carry (.equal scopes occurrences (congrArg (·.multiInstances) slots)
    (congrArg (·.compensation.runs) slots)), fun apart => (kept.2 apart).unmoved scopes occurrences
    (congrArg (·.multiInstances) slots) (congrArg _ signals) (congrArg _ tokens) queuedSignals queuedTokens
    fun _ pending => .inl (pending_kept (.of_eq signals tokens queuedSignals queuedTokens)
      (congrArg (·.compensation.runs) slots) pending)⟩

/-- The state operations the hooks apply keep the numbering and the continuations. -/
theorem framedNumbered_frameAlongside (program : Program) : StoresAlongside program (FramedNumbered program) :=
  Proofs.Frame.storesAlongside_both (numbering_frameAlongside program) (continued_stores program)

/-- Subscriptions' reservations and queued occurrences keep the numbering and the continuations. -/
theorem framedNumbered_occursAlongside (program : Program) : OccursAlongside program (FramedNumbered program) :=
  Proofs.Frame.occursAlongside_both (numbering_occursAlongside program) (continued_occursAlongside program)

/-- Dropping a record that owns no scope occurrence keeps the numbering and the continuations. -/
theorem framedNumbered_withoutRecord {program : Program} (t : State) (id : OccurrenceId)
    (unowned : ∀ entry ∈ t.scopes, entry.occurrence ≠ some id) (kept : FramedNumbered program t) :
    FramedNumbered program (Laws.State.withoutRecord t id) :=
  ⟨numbering_withoutRecord t id unowned kept.1, kept.2.withoutRecord id⟩

/-- A change that moves nothing the numbering and the continuations read keeps them. -/
theorem framedNumbered_unmoved {program : Program} {s t : State} (kept : FramedNumbered program s)
    (scopes : t.scopes = s.scopes) (occurrences : t.occurrences = s.occurrences) (slots : t.slots = s.slots)
    (signals : t.batchSignals = s.batchSignals) (tokens : t.batchTokens = s.batchTokens) (queuedSignals : t.queuedSignals = s.queuedSignals)
    (queuedTokens : t.queuedTokens = s.queuedTokens)
    (issued : Laws.State.OccurrenceGrows s t := by exact fun _ held => held) : FramedNumbered program t :=
  ⟨numbering_unmoved kept.1 scopes occurrences slots signals tokens queuedSignals queuedTokens,
    kept.2.same issued occurrences (by simp only [Laws.State.allSignals, signals, queuedSignals])
      (by simp only [Laws.State.allQueuedTokens, tokens, queuedTokens])⟩

/-- `Step`'s begin keeps the numbering and the continuations beside the slot invariant. -/
theorem framedNumbered_begin {program : Program} {s : State} {request : BeginRequest} {role : ActivationRole}
    {sourceType : String} (holds : Composed program s) (stands : Laws.Step.ScopeStands s request.scope)
    (admitted : Laws.Step.Admitted s request) (assigned : role = Step.roleOf program request)
    (origin : Laws.Step.BeginOrigin Composed program s request) :
    FramedNumbered program (s.beginOccurrence request role sourceType).1 :=
  ⟨⟨(runsFramed_stepAlongside _).begin s request role sourceType holds.1 stands admitted assigned
      (origin.mono fun _ held => ⟨held.1, held.2.1.1⟩) holds.2.1.1,
      fun apart => numbered_begin apart holds.1 stands admitted assigned origin holds.2.1⟩,
    (continued_stepAlongside _).begin s request role sourceType holds.1 stands admitted assigned
      (origin.mono fun _ held => ⟨held.1, held.2.2⟩) holds.2.2⟩

/-- The phases a micro-step's body runs keep `Composed`: those that read `WellFormed` alone read its first part, and
the others keep the rest by what each operation keeps. -/
theorem composed_bodyPhases : Laws.Step.BodyPhases Composed :=
  have phases := Proofs.Step.phases
  { clock := fun _ s atMs holds => ⟨phases.clock _ _ atMs holds.1, framedNumbered_unmoved holds.2 rfl rfl rfl rfl rfl rfl rfl⟩
    issuer := fun _ _ holds => holds.1.issuer
    dequeue := fun _ s signals holds fewer => ⟨phases.dequeue _ _ signals holds.1 fewer,
      ⟨(runsFramed_stepAlongside _).dequeue s signals holds.1 fewer holds.2.1.1,
        fun apart => (holds.2.1.2 apart).dequeue fewer (.refl _)⟩,
      (continued_stepAlongside _).dequeue s signals holds.1 fewer holds.2.2⟩
    unqueue := fun _ s unit holds => ⟨phases.unqueue _ _ unit holds.1,
      ⟨(runsFramed_stepAlongside _).unqueue s unit holds.1 holds.2.1.1, fun apart => (holds.2.1.2 apart).unqueue unit⟩,
      (continued_stepAlongside _).unqueue s unit holds.1 holds.2.2⟩
    untoken := fun _ s unit holds => ⟨phases.untoken _ _ unit holds.1,
      ⟨(runsFramed_stepAlongside _).untoken s unit holds.1 holds.2.1.1, fun apart => (holds.2.1.2 apart).untoken unit⟩,
      (continued_stepAlongside _).untoken s unit holds.1 holds.2.2⟩
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
      exact framedNumbered_unmoved ((framedNumbered_frameAlongside _).clearInside s State.root [] holds.1 holds.1.rooted.1
        (fun _ _ none => by cases none) holds.2) rfl rfl rfl rfl rfl rfl rfl
    begin := fun _ s request role sourceType holds stands admitted roled bodied assigned origin =>
      have begun := phases.begin _ _ request role sourceType holds.1 stands admitted roled bodied assigned
        (origin.mono fun _ held => held.1)
      ⟨⟨begun.1, framedNumbered_begin holds stands admitted assigned origin⟩, begun.2⟩
    reserve := fun _ s element scope holds stands pending popped =>
      have reserved := phases.reserve _ _ element scope holds.1 stands (pending.imp fun _ => And.imp_left And.left)
        (popped.imp fun _ => Exists.imp fun _ => Exists.imp fun _ queued => queued.imp fun _ held => held.1)
      ⟨⟨reserved.1, (framedNumbered_frameAlongside _).reserve s element scope holds.1 stands
        (pending.imp fun _ => And.imp_left And.right) popped holds.2⟩, reserved.2⟩
    cancel := fun _ s id holds => ⟨phases.cancel _ _ id holds.1, (framedNumbered_frameAlongside _).cancelOccurrence
      framedNumbered_withoutRecord (fun _ _ _ kept => framedNumbered_unmoved kept rfl rfl rfl rfl rfl rfl rfl) holds.1 holds.2⟩ }

/-- `Step`'s phases keep `Composed`: the body's (`composed_bodyPhases`), journalling the draft, moving the batches under
the unit key and ordering the journal at the commit. -/
theorem composed_phases : Laws.Step.Phases Composed :=
  have phases := Proofs.Step.phases
  { composed_bodyPhases with
    journal := fun _ _ unit transition holds fresh started ended =>
      ⟨phases.journal _ _ unit transition holds.1 fresh started ended, framedNumbered_unmoved holds.2 rfl rfl rfl rfl rfl rfl rfl⟩
    queueBatch := fun _ s unit holds => ⟨phases.queueBatch _ _ unit holds.1,
      ⟨(runsFramed_stepAlongside _).queueBatch s unit holds.1 holds.2.1.1, fun apart => (holds.2.1.2 apart).queueBatch unit⟩,
      (continued_stepAlongside _).queueBatch s unit holds.1 holds.2.2⟩
    enterUnit := fun _ _ unit holds unrun unseeded untabled => ⟨phases.enterUnit _ _ unit holds.1 unrun unseeded untabled,
      framedNumbered_unmoved holds.2 rfl rfl rfl rfl rfl rfl rfl⟩
    leaveUnit := fun _ _ holds ran seed => ⟨phases.leaveUnit _ _ holds.1 ran seed,
      framedNumbered_unmoved holds.2 rfl rfl rfl rfl rfl rfl rfl⟩
    runOrder := fun _ start s log holds counted batches keys after made =>
      ⟨phases.runOrder _ start s log holds.1 counted batches keys after made,
        ⟨(runsFramed_stepAlongside _).runOrder start s log holds.1 holds.2.1.1 counted batches keys after made,
          fun apart => orderJournal_numbered holds.1 counted batches keys (fun run member =>
            let ⟨o, present, named, _⟩ := (holds.2.1.1.framed run member).owned.body; ⟨o, present, named⟩)
            holds.2.2.occurrences (holds.2.1.2 apart) made⟩,
        (continued_stepAlongside _).runOrder start s log holds.1 holds.2.2 counted batches keys after made⟩ }

/-- The completion pipeline's own phases keep `Composed`. -/
theorem composed_pipelinePhases : Laws.Step.PipelinePhases Composed :=
  have pipeline := runsFramed_pipelinePhases Proofs.Step.pipelinePhases
  have continued := continued_pipelinePhases Proofs.Step.pipelinePhases
  { startReserved := fun _ s occurrence sourceType holds member unnamed =>
      have started := pipeline.startReserved _ s occurrence sourceType ⟨holds.1, holds.2.1.1⟩ member unnamed
      ⟨started.1, ⟨started.2, fun apart => by
        rw [Laws.State.closeOwnItems_eq]
        exact ((holds.2.1.2 apart).startReserved sourceType member).unmoved rfl rfl rfl rfl rfl rfl rfl
          fun _ pending => .inl pending⟩,
        (continued.startReserved _ s occurrence sourceType ⟨holds.1, holds.2.2⟩ member unnamed).2⟩
    removeOccurrence := fun _ _ occurrence holds member free =>
      have removed := Proofs.Step.pipelinePhases.removeOccurrence _ _ occurrence holds.1 member free
      ⟨⟨removed.1, (framedNumbered_frameAlongside _).removeOccurrence framedNumbered_withoutRecord holds.1 holds.2⟩,
        removed.2⟩
    recordEnd := fun _ s key terminal holds =>
      have recorded := pipeline.recordEnd _ s key terminal ⟨holds.1, holds.2.1.1⟩
      ⟨recorded.1, ⟨recorded.2, fun apart => by
        rw [Laws.State.recordEnd_eq]
        exact (holds.2.1.2 apart).unmoved rfl rfl rfl rfl rfl rfl rfl fun _ pending => .inl pending⟩,
        (continued.recordEnd _ s key terminal ⟨holds.1, holds.2.2⟩).2⟩ }

/-- The registered Multi-Instance hooks issue no fewer keys than their before-state (`grown_alongside`), which
`Continued` reads through them (`arriveMultiInstance_continued`, `instanceCompleted_continued`). -/
theorem grown_keeps (s0 : State) :
    Proofs.Step.MultiInstanceKeeps fun program s => WellFormed program s ∧ Laws.State.OccurrenceGrows s0 s :=
  Proofs.Step.multiInstanceKeeps_of fun program =>
    multiInstanceOps_alongside (grown_alongside s0 program) (Proofs.Step.registeredOps_wellFormed.multiInstance program)

/-- The registered Multi-Instance hooks keep `Composed`: `Framed` by `multiInstanceKeeps_framed`, and the numbering by
what `Kernel.Proofs.MultiInstance.Instances` proves each hook keeps, reading the slot invariant's ownership after each
step it takes off `RunsFramed`. -/
theorem multiInstanceKeeps_composed : Proofs.Step.MultiInstanceKeeps Composed where
  arrive ctx header envelope loop occurrence state after holds member begun body named looped newest unrun ran :=
    have framed := multiInstanceKeeps_framed.arrive ctx header envelope loop occurrence state after ⟨holds.1, holds.2.1.1⟩
      member begun body named looped newest unrun ran
    ⟨framed.1, ⟨framed.2, fun apart => numbered_arrive (Proofs.Step.registeredOps_wellFormed.multiInstance ctx.program)
      holds.1 holds.2.1.1.owns (holds.2.1.2 apart) member begun named looped (fun locals unarmed =>
        (enterBody_placed holds.1 holds.2.1.1 member body header.id named.symm locals unarmed .null 0).1.owns) unrun ran⟩,
      arriveMultiInstance_continued Proofs.Step.registeredOps_wellFormed.multiInstance holds.1 holds.2.2
        ((grown_keeps state).arrive ctx header envelope loop occurrence state after ⟨holds.1, fun _ issued => issued⟩
          member begun body named looped newest unrun ran).2 member begun named ran⟩
  completeBody ctx header envelope loop occurrence state after holds member ran :=
    have framed := multiInstanceKeeps_framed.completeBody ctx header envelope loop occurrence state after
      ⟨holds.1, holds.2.1.1⟩ member ran
    ⟨framed.1, ⟨framed.2, fun apart => numbered_completeBody (holds.2.1.2 apart) ran⟩, completeBody_continued holds.2.2 ran⟩
  instanceCompleted ctx body occurrence writes state after holds stands ran :=
    have framed := multiInstanceKeeps_framed.instanceCompleted ctx body occurrence writes state after
      ⟨holds.1, holds.2.1.1⟩ stands ran
    ⟨framed.1, ⟨framed.2, fun apart => numbered_instanceCompleted
      (Proofs.Step.registeredOps_wellFormed.multiInstance ctx.program) holds.1 holds.2.1.1.owns (holds.2.1.2 apart) stands
      (fun _ _ _ _ member slot fits => (leftWith_framed holds.1 holds.2.1.1 member slot fits).owns)
      (fun run member loop looped parallel => ((holds.2.1.1.framed run member).shaped loop looped).2.1 parallel) ran⟩,
      instanceCompleted_continued Proofs.Step.registeredOps_wellFormed.multiInstance holds.1 holds.2.2
        ((grown_keeps state).instanceCompleted ctx body occurrence writes state after ⟨holds.1, fun _ issued => issued⟩
          stands ran).2 stands ran⟩

/-- The registered hooks keep `Composed`. -/
theorem composed_contract : Laws.Step.HookContract Registry.hooks Composed :=
  Proofs.Step.registered_contract_of
    (featureOps_frame Proofs.Step.registeredOps_wellFormed.toFeatureOps
      (fun program => (framedNumbered_frameAlongside program).toFrameAlongside) framedNumbered_occursAlongside)
    multiInstanceKeeps_composed
    (compensationKeeps_frame Proofs.Step.registeredOps_wellFormed framedNumbered_frameAlongside
      framedNumbered_occursAlongside)
    Proofs.State.stateFacts

/-- Clearing an input's journal, intents, draft and writes keeps `Composed`. -/
theorem composed_reset {program : Program} {s : State} (holds : Composed program s) (committed : Laws.State.Committed s) :
    Composed program { s with journal := [], intents := [], transitions := ∅, outboxes := ∅, draft := {}, writes := [], completionBase := s.nextCompletion } :=
  ⟨Laws.State.reset_wellFormed holds.1 committed, ⟨holds.2.1.1.carry (.equal rfl rfl rfl rfl), fun apart =>
    (holds.2.1.2 apart).unmoved rfl rfl rfl rfl rfl rfl rfl fun _ pending => .inl pending⟩,
    holds.2.2.same (fun _ issued => issued) rfl rfl rfl⟩

/-- A start's fresh instance keeps `Composed`. -/
theorem composed_initial (program : Program) (instanceId : String) (variables : List (String × Value))
    (businessKey : Option String) :
    Composed program ((State.initial instanceId variables businessKey).signal (.armScope State.root)) :=
  have framed := framed_initial program instanceId variables businessKey
  ⟨framed.1, ⟨framed.2, fun _ => (numbered_initial program instanceId variables businessKey).signalPending rfl
    fun _ inside => by cases inside⟩, (continued_initial instanceId variables businessKey).signal _⟩

/-- A committed input on a running instance keeps `Composed` under the registered hooks. -/
theorem composed_stepKeeps {program : Program} {input : Input}
    {before after : State} (holds : Composed program before) (committed : Laws.State.Committed before)
    (ran : Step.step Registry.hooks program (some before) input = .ok after) :
    Composed program after ∧ Laws.State.Committed after :=
  Proofs.State.running_keeps composed_contract composed_phases (Laws.Step.complete_keeps composed_contract
      composed_phases.toBodyPhases composed_pipelinePhases Proofs.State.stateFacts)
    Proofs.Step.registered_framing Proofs.Step.registered_keysAux (fun _ _ holds => holds.1) committed
    (composed_reset holds committed) ran

/-- A committed start makes a `Composed` state under the registered hooks. -/
theorem composed_start {program : Program} {input : Input}
    {after : State} (ran : Step.step Registry.hooks program none input = .ok after) :
    Composed program after ∧ Laws.State.Committed after :=
  Proofs.State.step_keeps composed_contract composed_phases (Laws.Step.complete_keeps composed_contract
      composed_phases.toBodyPhases composed_pipelinePhases Proofs.State.stateFacts)
    Proofs.Step.registered_framing Proofs.Step.registered_keysAux (fun _ _ holds => holds.1)
    (fun _ _ => composed_reset) (composed_initial program) (fun _ given => by simp at given) ran

/-- The registered hooks keep the numbering: the numbering lane's supply. -/
theorem registered_numberingKept : NumberingKept Registry.hooks :=
  ⟨fun _ _ _ _ apart formed committed runs ran =>
    (composed_stepKeeps ⟨formed, ⟨runs.framed, fun _ => runs.numbered⟩, runs.continued⟩ committed ran).1.2.1.2 apart,
    fun _ _ _ apart ran => (composed_start ran).1.2.1.2 apart⟩

/-! ## The lane's statements -/

/-- The registered hooks keep every running body's instances `Apart`. -/
theorem registered_instancesApart :
    InstancesApart Registry.hooks := fun _ _ _ run ⟨formed, committed, runs, _, ran⟩ member =>
  have after := (framed_stepKeeps ⟨formed, runs.framed⟩ committed ran).1
  owned_apart after.1 (after.2.framed run member).owned

/-- The registered hooks keep the lane's slot invariant through a committed input. -/
theorem registered_runsFormed {program : Program} {input : Input}
    {before after : State} (apart : IdsUnique program)
    (formed : WellFormed program before) (committed : Laws.State.Committed before) (runs : RunsFormed program before)
    (ran : Step.step Registry.hooks program (some before) input = .ok after) :
    (WellFormed program after ∧ RunsFormed program after) ∧ Laws.State.Committed after :=
  have framed := framed_stepKeeps ⟨formed, runs.framed⟩ committed ran
  ⟨⟨framed.1.1, framed.1.2.formed framed.1.1 (registered_numberingKept.step _ _ _ _ apart formed committed runs ran)
    (registered_unbegunKept.step _ _ _ _ apart formed committed runs.unbegun runs.queued.occurs ran)
    (composed_stepKeeps ⟨formed, ⟨runs.framed, fun _ => runs.numbered⟩, runs.continued⟩ committed ran).1.2.2⟩, framed.2⟩

/-- A committed start keeps the lane's slot invariant under the registered hooks. -/
theorem registered_runsFormedAtStart : RunsFormedAtStart Registry.hooks :=
    fun _ _ _ apart ran =>
  have framed := (framed_start ran).1
  framed.2.formed framed.1 (registered_numberingKept.start _ _ _ apart ran)
    (registered_unbegunKept.start _ _ _ apart ran) (composed_start ran).1.2.2

/-- Every instance a committed population run holds keeps the lane's slot invariant under the registered hooks. -/
theorem registered_runsFormedInPopulation :
    RunsFormedInPopulation Registry.hooks := fun _ _ _ ran member inside =>
  (Laws.Population.runStimuli_held
    (good := fun program s => (Framed program s ∧ (IdsUnique program → RunsFormed program s)) ∧ Laws.State.Committed s)
    ⟨fun _ _ _ _ holds stepped => ⟨⟨(framed_stepKeeps holds.1.1 holds.2 stepped).1, fun apart =>
      (registered_runsFormed apart holds.1.1.1 holds.2 (holds.1.2 apart) stepped).1.2⟩,
        (framed_stepKeeps holds.1.1 holds.2 stepped).2⟩,
      fun _ _ _ ran => ⟨⟨(framed_start ran).1, fun apart => registered_runsFormedAtStart _ _ _ apart ran⟩,
        (framed_start ran).2⟩⟩
    ran member inside).1.2

/-- Every running body after a committed input is `Shaped` by its loop under the registered hooks. -/
theorem registered_runsShaped : RunsShaped Registry.hooks :=
  fun _ _ _ run loop apart ⟨formed, committed, runs, _, ran⟩ member looped =>
    ((registered_runsFormed apart formed committed runs ran).1.2.formed run member).shaped loop looped

/-- Within a committed input's journal the instances of a Multi-Instance element begin in generation order under the
registered hooks. -/
theorem registered_beginOrder : BeginOrder Registry.hooks :=
    fun _ _ _ _ _ processInstance apart ⟨formed, committed, runs, _, ran⟩ looped =>
  beginsInOrder_of beginsKept_contract beginsKept_phases (beginsKept_pipelinePhases Proofs.Step.pipelinePhases)
    (Proofs.Step.registered_contract Proofs.Step.registeredOps_wellFormed Proofs.State.stateFacts)
    Proofs.Step.phases.toClosurePhases Proofs.Step.pipelinePhases Proofs.Step.registered_framing Proofs.State.stateFacts
    processInstance apart formed committed runs.unbegun runs.queued.occurs ran looped

/-- A committed input keeps its well-formed before-state's scope occurrences under the registered hooks. -/
theorem registered_stepKeepsScopes : Proofs.Cancellation.StepKeepsScopes Registry.hooks :=
  Proofs.Cancellation.stepKeepsScopes (Proofs.Cancellation.keepsScopesWalk_registered
    Proofs.Step.registeredOps_wellFormed Proofs.Step.phases Proofs.Step.pipelinePhases)

/-- A body whose occurrence goes takes its instances with it under the registered hooks: no slot record of it stays,
since each running body's occurrence stands; its instances' scope occurrences go, since a standing one would keep its
parent, the body's scope occurrence, whose owner is the body's occurrence; and so does what lay in them
(`Proofs.Cancellation.outside_removed`). -/
theorem registered_endsWithInstances :
    EndsWithInstances Registry.hooks := by
  intro program before after run index scope ⟨formed, committed, runs, input, ran⟩ member gone slot
  have framed := (framed_stepKeeps ⟨formed, runs.framed⟩ committed ran).1
  have kept := registered_stepKeepsScopes program input before after formed committed ran
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

The registered hooks keep `Since` of an input's start (`Kernel.Proofs.MultiInstance.Since`): its `Unstarted` part
through the Multi-Instance hooks by their feature record, its `Snapshots` part by what each sets, beside `RunsFramed`
(`SinceFramed`), whose running bodies' occurrences ordering the journal reads. The draft is emptied at each input's
start, so the walk starts from that reset (`since_stepKeeps`). -/

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

/-- The registered Multi-Instance hooks keep `SinceFramed`: its `WellFormed` and `Unstarted` parts by their feature
record, its `Snapshots` part by what each hook sets, its `RunsFramed` part as they keep `Framed`. -/
theorem since_multiInstanceKeeps (b : State) : Proofs.Step.MultiInstanceKeeps (SinceFramed b) where
  arrive ctx header envelope loop occurrence state after holds member begun body named looped newest unrun ran :=
    have first := (unstarted_keeps b).arrive ctx header envelope loop occurrence state after ⟨holds.1, holds.2.1.1⟩
      member begun body named looped newest unrun ran
    ⟨first.1, ⟨first.2, arriveMultiInstance_snapshots Proofs.Step.registeredOps_wellFormed.multiInstance
      holds.1 holds.2.1.1 holds.2.1.2 member begun named newest ran⟩, (multiInstanceKeeps_framed.arrive ctx header
        envelope loop occurrence state after ⟨holds.1, holds.2.2⟩ member begun body named looped newest unrun ran).2⟩
  completeBody ctx header envelope loop occurrence state after holds member ran :=
    have first := (unstarted_keeps b).completeBody ctx header envelope loop occurrence state after ⟨holds.1, holds.2.1.1⟩
      member ran
    ⟨first.1, ⟨first.2, completeBody_snapshots holds.2.1.2 ran⟩, (multiInstanceKeeps_framed.completeBody ctx header
      envelope loop occurrence state after ⟨holds.1, holds.2.2⟩ member ran).2⟩
  instanceCompleted ctx body occurrence writes state after holds stands ran :=
    have first := (unstarted_keeps b).instanceCompleted ctx body occurrence writes state after ⟨holds.1, holds.2.1.1⟩
      stands ran
    ⟨first.1, ⟨first.2, instanceCompleted_snapshots Proofs.Step.registeredOps_wellFormed.multiInstance
      holds.1 holds.2.1.2 stands ran⟩, (multiInstanceKeeps_framed.instanceCompleted ctx body occurrence writes state
        after ⟨holds.1, holds.2.2⟩ stands ran).2⟩

/-! ### Through an input -/

/-- The registered hooks keep `SinceFramed`. -/
theorem since_contract (b : State) : Laws.Step.HookContract Registry.hooks (SinceFramed b) :=
  have stores := fun program => Proofs.Frame.storesAlongside_both (since_frameAlongside b program)
    (runsFramed_frameAlongside program)
  have occurs := fun program => Proofs.Frame.occursAlongside_both (since_occursAlongside b program)
    (runsFramed_occursAlongside program)
  Proofs.Step.registered_contract_of
    (featureOps_frame Proofs.Step.registeredOps_wellFormed.toFeatureOps (fun program => (stores program).toFrameAlongside)
      occurs)
    (since_multiInstanceKeeps b) (compensationKeeps_frame Proofs.Step.registeredOps_wellFormed stores occurs)
    Proofs.State.stateFacts

/-- `Step`'s phases keep `SinceFramed` of a committed, well-formed `b` whose bodies stand in its scope occurrences. -/
theorem since_phases {programBefore : Program} {b : State} (formedBefore : WellFormed programBefore b)
    (committed : Laws.State.Committed b) (bodyScopes : ∀ earlier ∈ b.slots.multiInstances, earlier.scope ∈ scopeIds b) :
    Laws.Step.Phases (SinceFramed b) :=
  phases_alongside Proofs.Step.phases (sinceFramed_stepAlongside formedBefore committed bodyScopes) fun _ _ _ kept =>
    ⟨⟨kept.1.1.move (.same rfl rfl rfl (.refl _) rfl), kept.1.2.same rfl⟩, kept.2.carry (.equal rfl rfl rfl rfl)⟩

/-- A committed input on a running instance keeps `Since` of its before-state under the registered hooks, from the
input's start, which `Since` holds of though the before-state's draft may not be empty. -/
theorem since_stepKeeps {program : Program} {input : Input} {b after : State} (formed : WellFormed program b)
    (committed : Laws.State.Committed b) (framed : RunsFramed program b)
    (ran : Step.step Registry.hooks program (some b) input = .ok after) : Since b program after :=
  have phases := since_phases formed committed fun earlier member => (framed.framed earlier member).owned.bodyScope
  have pipeline := Proofs.Frame.pipelinePhases_both (since_pipelinePhases b Proofs.Step.pipelinePhases)
    (runsFramed_pipelinePhases Proofs.Step.pipelinePhases)
  have reset := since_reset formed committed framed.keyed
  have kept := (Proofs.State.running_keeps (since_contract b) phases (Laws.Step.complete_keeps (since_contract b)
      phases.toBodyPhases pipeline Proofs.State.stateFacts)
    Proofs.Step.registered_framing Proofs.Step.registered_keysAux (fun _ _ holds => holds.1) committed
    ⟨reset.1, reset.2, (framed_reset ⟨formed, framed⟩ committed).2⟩ ran).1
  ⟨kept.1, kept.2.1⟩

/-- A body begun by a committed input has at least one slot, and a body running before and after it keeps its
snapshot, slot count and filled slots, under the registered hooks. -/
theorem registered_runsGenerated : RunsGenerated Registry.hooks :=
  fun _ _ _ run ⟨formed, committed, runs, _, ran⟩ member =>
    have since := since_stepKeeps formed committed runs.framed ran
    ⟨since.2.2.generatedOf member, fun earlier inside same => since.2.2.fixed earlier inside run member same.symm⟩

end Since

end Kernel.Proofs.MultiInstance
