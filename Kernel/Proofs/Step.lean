module

public import Kernel.Laws.Step
public import Kernel.Laws.Registry
public import Kernel.Laws.Flow
public import Kernel.Laws.Starts
public import Kernel.Laws.Subscriptions
public import Kernel.Laws.Data
public import Kernel.Laws.Work
public import Kernel.Laws.Compensation
public import Kernel.Laws.Propagation
public import Kernel.Proofs.State
public import Kernel.Proofs.Step.Queue
public import Kernel.Proofs.Step.Contract
public import Kernel.Proofs.Cancellation.Registered
public import Kernel.Proofs.MultiInstance
public import Kernel.Proofs.Former
public import Kernel.Proofs.Former.Values
public import Kernel.Proofs.Former.Calls
public import Kernel.Proofs.Former.PlacedFrame

/-! # Proofs: composition over the registered hooks

The proof wave's composition module ([PLAN, proof wave](../../docs/PLAN.md#proof-wave)): it instantiates the
`Step`-generic facts of `Kernel.Laws.Step` with the registered hooks of `Kernel.Laws.Registry` and the feature lemmas
of each `Kernel.Laws.<F>`, and opens no body. Each lane's statement is stated over a hooks parameter at the head of its
own `Kernel.Proofs.<Lane>` module and proved there from hook contracts; a lane closes when this module proves its
statement of `Registry.hooks`. The registered hooks' contract (`Laws.Step.HookContract`) is assembled for any invariant
whose feature records are filled (`Kernel.Proofs.Step.Contract`); this module fills them for `Laws.State.WellFormed`
from `Laws.Step.Operations` and `Laws.Step.StateFacts`. Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Proofs.Step

open Kernel

/-- A flow token moved into an Exclusive Gateway leaves exactly the flows `Laws.Flow.ExclusiveTakes` allows (BPMN 2.0.2
§13.4.2, Table 13.2): the micro-step's body begins a fresh occurrence of the Gateway on that flow in the token's scope
occurrence and enqueues its completion, and nothing else, on the first candidate whose condition holds, else the default.
Each condition reads the variables visible from the token's scope occurrence and the logical time of the state the token
arrived in, so beginning the occurrence changes nothing a condition reads. -/
def ExclusiveArrival : Prop :=
  ∀ (ctx : Ctx) (flow : FlowId) (scope : ScopeOccurrenceId) (gateway : ElementId) (header : Header)
    (payload : GatewayPayload) (candidates : List FlowId) (default : Option FlowId) (state after : State),
    ctx.program.target? flow = some gateway →
    ctx.program.element? gateway = some (.gateway header payload) →
    payload.kind = .exclusive candidates default →
    Step.moveToken Registry.hooks ctx (.flow flow scope) state = .ok after →
    ∃ next sourceType begun occurrence taken evaluated,
      Step.arrive Registry.hooks ctx flow scope state = .ok next ∧
      state.beginOccurrence { element := gateway, scope, incoming := some flow }
        (Step.roleOf ctx.program { element := gateway, scope, incoming := some flow }) sourceType = (begun, occurrence) ∧
      occurrence.element = gateway ∧ occurrence.scope = scope ∧ occurrence.incoming = some flow ∧
      next = begun.signal (.complete occurrence.id (.flows taken) [] .outward) ∧
      Laws.Flow.ExclusiveTakes candidates default
        (Laws.Flow.candidateHolds ctx
          { variables := state.visible ctx.program scope, nowMs := state.logicalTimeMs, bounds := ctx.program.options.bounds })
        evaluated (some taken)

/-- The representative theorem of P0: `Step`'s token routing and dispatch (`Laws.Step`), the registered Gateway hook
(`Laws.Registry`), Flow's Exclusive Gateway lemma (`Laws.Flow`) and what a condition reads (`Laws.Hooks`,
`Laws.State`), composed without opening a body. -/
theorem exclusiveArrival : ExclusiveArrival := by
  intro ctx flow scope gateway header payload candidates default state after target element kind ran
  obtain ⟨next, _, arrived, _⟩ := Laws.Step.microStep_ok (Laws.Step.moveToken_flow ran)
  obtain ⟨reached, reachedTarget, begun_⟩ := Laws.Step.arrive_ok arrived
  have same : reached = gateway := Option.some.inj (reachedTarget.symm.trans target)
  subst same
  obtain ⟨sourceType, begun, occurrence, ⟨entered, ⟨_, made, ⟨dispatched, written⟩⟩⟩⟩ := Laws.Step.begin_ok begun_
  obtain ⟨_, unwritten⟩ := (Laws.Step.writeStart_ok written).resolve_right fun ⟨nonempty, _⟩ => nonempty (by simp)
  subst unwritten
  have fresh := Laws.State.beginOccurrence_fresh (state := state) (sourceType := sourceType)
    (role := Step.roleOf ctx.program { element := reached, scope, incoming := some flow })
    (request := { element := reached, scope, incoming := some flow }) (by simp)
  have keeps := Laws.State.beginOccurrence_keeps state { element := reached, scope, incoming := some flow }
    (Step.roleOf ctx.program { element := reached, scope, incoming := some flow }) sourceType
  simp only [made] at fresh keeps
  obtain ⟨isGateway, inScope, onFlow, _⟩ := fresh
  obtain ⟨scopes, variables, time⟩ := keeps
  rw [Laws.Step.dispatch_gateway (isGateway ▸ element), Laws.Registry.hooks_arriveGateway] at dispatched
  obtain ⟨taken, evaluated, signalled, takes⟩ := Laws.Flow.arriveGateway_exclusive kind dispatched
  rw [inScope, Laws.Hooks.evalContext_eq, Laws.State.visible_congr scopes variables, time] at takes
  exact ⟨next, sourceType, begun, occurrence, taken, evaluated, arrived, made, isGateway, inScope, onFlow, signalled,
    takes⟩

/-! ## The phases `Step` runs itself -/

/-- A start's fresh instance, with its root's Event Sub-Process starts queued for arming (`Laws.Step.step_keeps`'s
`initial`). -/
theorem initial_wellFormed (program : Program) (instanceId : String) (variables : List (String × Value))
    (businessKey : Option String) :
    Laws.State.WellFormed program ((State.initial instanceId variables businessKey).signal (.armScope State.root)) :=
  queue_wellFormed (Laws.State.initial_wellFormed instanceId variables businessKey)
    (Laws.State.initial_rootIssued instanceId variables businessKey)

/-- The phases `Step` runs itself keep `Laws.State.WellFormed` (`Laws.Step.Phases`), from what `Laws.State` shows
each state operation keeps. -/
theorem phases : Laws.Step.Phases Laws.State.WellFormed :=
  have mem : ∀ {state : State} {scope : ScopeOccurrenceId}, Laws.Step.ScopeStands state scope →
      scope ∈ Laws.State.scopeIds state := fun ⟨entry, inside, named⟩ => List.mem_map.mpr ⟨entry, inside, named⟩
  { clock := fun _ _ atMs formed => Laws.State.clock_wellFormed formed atMs
    journal := fun _ _ _ formed started _ => Laws.State.journal_wellFormed formed started
    runOrder := fun _ _ formed => Laws.State.runOrder_wellFormed formed
    dequeue := fun _ _ _ formed fewer => Laws.State.dequeue_wellFormed formed fewer
    untoken := fun _ _ _ formed fewer => Laws.State.untoken_wellFormed formed fewer
    queueWrite := fun _ _ scope writes rule formed => queueWrite_wellFormed formed scope writes rule
    queueRemove := fun _ _ scope names formed => queueRemove_wellFormed formed scope names
    armIssued := fun _ _ host element scope formed queued => formed.queue.arm host element scope queued
    armScopeIssued := fun _ _ scope formed queued => formed.queue.armScope scope queued
    armGatewayIssued := fun _ _ occurrence gateway scope formed queued =>
      formed.queue.armGateway occurrence gateway scope queued
    endRecorded := fun _ _ status failure formed queued => formed.queue.ends status failure queued
    admittedSignal := fun _ _ _ _ formed head => Laws.State.admitted_signal formed head
    admittedToken := fun _ _ _ _ formed taken => Laws.State.admitted_token formed taken
    completeQueued := fun _ _ _ _ _ _ formed completed => Laws.State.complete_unnamed formed completed
    resumable := fun _ _ _ _ _ _ _ _ formed head => Laws.State.resumable_signal formed head
    raisable := fun _ _ _ _ _ formed head => Laws.State.raisable_signal formed head
    housed := fun _ _ _ formed member => Laws.State.housed_wellFormed formed member
    issued := fun _ _ _ formed member => formed.issued.occurrences _ member
    bodied := fun _ _ occurrence formed member => formed.bodyRoles occurrence member
    newest := fun _ _ request role sourceType formed => by
      rw [(Laws.State.beginOccurrence_begins formed.activations request role sourceType).started]
      simp
    unrun := fun _ _ request role sourceType formed admitted run member same => by
      have begins := Laws.State.beginOccurrence_begins formed.activations request role sourceType
      rw [begins.slots] at member
      rcases begins.source with ⟨reserved, facts⟩ | fresh
      · exact (admitted.2.1 reserved.id (by simp [Laws.State.names, facts.named])).2.2.2
          (.inr (.inl ⟨run, member, same.trans facts.id⟩))
      · have below := (formed.settled.bodies run member).1
        rw [same, fresh.id] at below
        exact Nat.lt_irrefl _ below
    unowned := fun _ _ request role sourceType formed admitted =>
      Laws.State.begin_unowned formed request role sourceType admitted.2.1
    parkedBegun := fun _ _ waiting _ formed parked member named =>
      (formed.settled.parked waiting parked).2.1 _ member named
    endInstance := fun _ _ _ _ formed recorded => by
      rw [Laws.Step.endInstance_eq]
      exact Laws.State.endInstance_wellFormed formed recorded
    begin := fun _ _ request role sourceType formed stands admitted roled bodied _ _ =>
      ⟨Laws.State.begin_wellFormed formed request role sourceType (mem stands) admitted.2.1 roled bodied,
        Laws.State.begin_entry formed request role sourceType admitted.1 admitted.2.1 admitted.2.2⟩
    reserve := fun _ _ element scope formed stands _ _ =>
      Laws.State.reserve_wellFormed formed element scope (mem stands)
    cancel := fun _ _ id formed => Laws.State.cancel_wellFormed formed id }

/-- The completion pipeline's own phases keep `Laws.State.WellFormed` (`Laws.Step.PipelinePhases`). -/
theorem pipelinePhases : Laws.Step.PipelinePhases Laws.State.WellFormed where
  startReserved _ _ _ sourceType formed member unnamed :=
    Laws.State.startReserved_closeOwnItems_wellFormed formed sourceType member unnamed
  removeOccurrence _ _ _ formed member free :=
    ⟨(Laws.State.removeOccurrence_wellFormed formed member free).1,
      List.mem_map.mp (Laws.State.removeOccurrence_wellFormed formed member free).2⟩
  recordEnd _ _ key terminal formed := Laws.State.recordEnd_wellFormed formed key terminal

/-! ## The feature records of `WellFormed`

The operations record each feature states for its lemmas, filled here from `Laws.State`, and the frame facts the
registered hooks' contract reads beside them. -/

/-- Work's operations record (`Laws.Work.WorkOps`) of `WellFormed`. -/
theorem workOps : Laws.Work.WorkOps program (Laws.State.WellFormed program) where
  write _ scope writes rule formed := queueWrite_wellFormed formed scope writes rule
  complete _ _ leave writes rule formed member unstarted _ := waited_wellFormed formed member unstarted leave writes rule
  completeOwner _ _ _ leave writes rule formed member owned link _ :=
    complete_wellFormed formed owned (owner_begun formed member owned link) leave writes rule
  raise _ _ code message patch formed member effect :=
    effectRaise_wellFormed formed member effect (.error code message) patch
  cancel _ formed := queue_wellFormed formed (by simp [Queueable])
  rekind _ change formed kept only := by
    have still : ∀ item ∈ _, Laws.State.AwaitsTrigger item.kind → Laws.State.AwaitsTrigger (change item).kind :=
      fun item member waits => by
        by_cases same : change item = item
        · rw [same]; exact waits
        · rcases only item member same with work | work <;> simp [waits.1, waits.2] at work
    exact Laws.State.rekind_wellFormed formed kept (fun item member start =>
      still item member (formed.typed item member start).2.2.2) still
  workKind _ item formed member waits := by
    cases start : (program.element? item.element).bind (·.start?) with
    | none => rfl
    | some _ =>
      obtain ⟨_, _, _, ⟨effect, incident, _⟩⟩ := formed.typed item member (by rw [start]; rfl)
      rw [effect, incident] at waits
      simp at waits
  activity element _ _ typed := by
    cases known : program.element? element with
    | none => rfl
    | some found =>
      rw [known] at typed
      cases found with
      | activity header payload => exact Laws.IL.start?_activity header payload
      | scope header payload => exact Laws.IL.start?_scope header payload
      | event header payload => exact Laws.IL.start?_event header payload
      | gateway header payload => exact Laws.IL.start?_gateway header payload
      | start header payload => simp [Laws.IL.activity?_start] at typed
  distinct _ formed item member other inside same :=
    formed.distinct.items.eq_of_id (member) (inside) same
  queued state signal := by rw [Laws.State.signal_eq]
  kept _ _ := ⟨by rw [Laws.State.signal_eq], by rw [Laws.State.signal_eq]⟩
  completeBegun _ _ leave writes rule formed member begun _ := complete_wellFormed formed member begun leave writes rule
  housed _ _ formed member := housed_of formed member
  hold _ held formed := hold_wellFormed formed held
  enter _ element locals occurrence formed member begun _ :=
    ⟨Laws.State.enterScope_wellFormed formed element (formed.owned.occurrenceScopes occurrence member) locals
      fun _ named => ⟨occurrence, member, Option.some.inj named, begun, rfl⟩, by rw [Laws.State.enterScope_eq],
      fun root inside called => by
        rw [Laws.State.enterScope_eq] at inside
        rcases List.mem_append.mp inside with old | new
        · exact old
        · rw [List.mem_singleton.mp new] at called
          cases called⟩
  openItem _ kind _ formed member begun unstarted role :=
    ⟨Laws.State.openItem_wellFormed formed kind member begun unstarted role, by rw [Laws.State.openItem_eq]⟩
  arm _ _ element formed member begun _ := queueArm_wellFormed formed member begun element
  enterCalled _ _ variables definition formed member begun _ _ _ := by
    refine ⟨Laws.State.enterCalled_wellFormed formed program member begun variables definition, ?_, ?_⟩ <;>
      rw [Laws.State.enterCalled_eq _ _ _ _ _ (Laws.State.scopes_fresh formed)]
    simp
  armScope _ _ formed stands := armScope_wellFormed formed stands
  begin _ _ _ formed stands _ := by
    obtain ⟨entry, inside, named⟩ := stands
    exact bareBegin_wellFormed formed (by simp [Laws.State.names]) (List.mem_map.mpr ⟨entry, inside, named⟩)

/-- Flow's operations record (`Laws.Flow.FlowOps`) of `WellFormed`. -/
theorem flowOps : Laws.Flow.FlowOps program (Laws.State.WellFormed program) where
  emit _ _ flows formed stands _ := by
    obtain ⟨entry, inside, named⟩ := stands
    exact Laws.State.emit_wellFormed formed flows (List.mem_map.mpr ⟨entry, inside, named⟩)
  complete _ _ leave writes rule formed member begun _ := complete_wellFormed formed member begun leave writes rule

/-- Flow's join operations record (`Laws.Flow.JoinOps`) of `WellFormed`, what a join completes having settled. -/
theorem joinOps : Laws.Flow.JoinOps program (Laws.State.WellFormed program) Laws.State.Settled where
  park state waiting formed waits := by
    obtain ⟨occurrence, member, named, begun⟩ := waits
    refine Laws.State.slots_wellFormed formed ⟨fun found inside => ?_, formed.settled.bodies, formed.settled.resumed,
      formed.settled.queued, formed.settled.placed, formed.settled.runsPlaced, formed.settled.grouped,
      formed.settled.raised⟩
    rcases List.mem_append.mp inside with old | new
    · exact formed.settled.parked found old
    · rw [List.mem_singleton.mp new, ← named]
      exact Laws.State.begun_settled formed member begun.1
  unpark _ _ formed := Laws.State.slots_wellFormed formed ⟨fun found inside =>
    formed.settled.parked found (List.mem_filter.mp inside).1, formed.settled.bodies, formed.settled.resumed,
    formed.settled.queued, formed.settled.placed, formed.settled.runsPlaced, formed.settled.grouped, formed.settled.raised⟩
  parked _ waiting formed member := formed.settled.parked waiting member
  begun _ _ formed member begun := Laws.State.begun_settled formed member begun
  reparked _ _ _ settled := settled
  complete _ _ leave writes rule formed settled _ := settled_wellFormed formed settled leave writes rule
  completed _ _ _ _ _ _ settled := settled.signal fun _ same => by simp at same
  armGateway state occurrence _ _ formed member begun _ :=
    have ⟨entry, inside, named⟩ := List.mem_map.mp (formed.owned.occurrenceScopes occurrence member)
    queue_wellFormed formed ⟨formed.issued.occurrences occurrence member, named ▸ formed.issued.scopes entry inside,
      fun found present same => by
        rw [Laws.State.nodup_map_eq formed.distinct.occurrences present member same]
        exact ⟨begun, rfl⟩⟩

/-- Entering a scope occurrence below a begun occurrence of a well-formed state, which owns it, keeps `WellFormed` and
what is settled, whatever element it enters. -/
theorem enterBody_wellFormed {state : State} {occurrence : Occurrence} (formed : Laws.State.WellFormed program state)
    (member : occurrence ∈ state.occurrences) (begun : occurrence.begun = true) (element : ElementId)
    (locals : List (String × Value)) :
    Laws.State.WellFormed program (state.enterScope element occurrence.scope locals (some occurrence.id)).1 ∧
      ∀ id, Laws.State.Settled state id →
        Laws.State.Settled (state.enterScope element occurrence.scope locals (some occurrence.id)).1 id :=
  ⟨Laws.State.enterScope_wellFormed formed element (formed.owned.occurrenceScopes occurrence member) locals
    fun _ same => ⟨occurrence, member, Option.some.inj same, begun, rfl⟩, fun _ settled => settled.enter _ _ _ _⟩

/-- The Multi-Instance operations record (`Laws.MultiInstance.MultiInstanceOps`) of `WellFormed`. -/
theorem multiInstanceOps : Laws.MultiInstance.MultiInstanceOps program (Laws.State.WellFormed program)
    Laws.State.Settled where
  bodies _ run formed member := formed.settled.bodies run member
  placed _ run formed member := formed.settled.placed run member
  complete _ _ leave writes rule formed settled _ := settled_wellFormed formed settled leave writes rule
  begun _ _ formed member begun := Laws.State.begun_settled formed member begun
  housed _ occurrence formed member := formed.owned.occurrenceScopes occurrence member
  issued _ formed := formed.issued.scopes
  contexts _ formed run member context inside := ((formed.settled.runsPlaced run member).2 context inside).1
  hold _ held formed := hold_wellFormed formed held
  enter _ element parent locals owner formed stands owned _ :=
    ⟨Laws.State.enterScope_wellFormed formed element stands locals owned,
      fun _ settled => settled.enter element parent locals owner, by
        rw [Laws.State.enterScope_eq]
        exact Laws.State.scopes_fresh formed⟩
  arm _ _ element formed member begun _ :=
    ⟨queueArm_wellFormed formed member begun element, fun _ settled => settled.signal fun _ same => by simp at same⟩
  begin _ _ formed bare stands _ := ⟨bareBegin_wellFormed formed bare stands, fun _ settled => settled.begin bare⟩
  defer _ _ formed bare _ := ⟨Laws.State.deferBegins_wellFormed formed bare,
    fun _ settled => settled.defer fun request member => (bare request member).1⟩
  record state run index scope output results formed member slot stands _ := by
    obtain ⟨below, parentOf⟩ := formed.settled.placed run member _ (List.mem_of_getElem? slot)
    obtain ⟨entry, inside, named⟩ := List.mem_map.mp stands
    subst named
    obtain ⟨left, standing, frame⟩ := Laws.State.leaveChild_wellFormed formed inside (parentOf entry inside rfl)
    have body : Laws.State.Settled (state.leaveScope entry.id) run.occurrence :=
      (formed.settled.bodies run member).transport (Nat.le_of_eq frame.nextIssue.symm)
        (fun _ present _ => .inl (frame.occurrencesSublist.subset present))
        (fun _ queued => queued.shrink (by rw [frame.signals]; exact .refl _) frame.tokensSublist)
    have placed : Laws.State.Placed (state.leaveScope entry.id) (Laws.MultiInstance.recorded run index output results) :=
      fun inner active => (formed.settled.placed run member).transport (Nat.le_of_eq frame.nextIssue.symm)
        (fun _ present => .inl (frame.scopesSublist.subset present)) inner
        ((List.mem_or_eq_of_mem_set active).resolve_right (by simp))
    rw [Laws.MultiInstance.leftWith, Laws.MultiInstance.setRun_eq]
    refine ⟨Laws.State.slots_wellFormed left ⟨left.settled.parked, fun other present => ?_, left.settled.resumed,
      left.settled.queued, fun other present => ?_, left.settled.runsPlaced, left.settled.grouped, left.settled.raised⟩,
      body, standing, placed⟩
    · rcases Proofs.MultiInstance.mem_setRun present with ⟨old, _⟩ | rfl
      · exact left.settled.bodies other old
      · exact body
    · rcases Proofs.MultiInstance.mem_setRun present with ⟨old, _⟩ | rfl
      · exact left.settled.placed other old
      · exact placed
  runs state _ next _ formed settledNext placedNext _ _ _ := by
    rw [Laws.MultiInstance.setRun_eq]
    refine ⟨Laws.State.slots_wellFormed formed ⟨formed.settled.parked, fun other present => ?_, formed.settled.resumed,
      formed.settled.queued, fun other present => ?_, formed.settled.runsPlaced, formed.settled.grouped,
      formed.settled.raised⟩, fun _ settled => settled⟩
    · rcases Proofs.MultiInstance.mem_setRun present with ⟨old, _⟩ | rfl
      · exact formed.settled.bodies other old
      · exact settledNext
    · rcases Proofs.MultiInstance.mem_setRun present with ⟨old, _⟩ | rfl
      · exact formed.settled.placed other old
      · exact placedNext
  write _ scope writes rule formed :=
    ⟨queueWrite_wellFormed formed scope writes rule, fun _ settled => settled.signal fun _ same => by simp at same⟩

/-- Starts' operations record (`Laws.Starts.StartsOps`) of `WellFormed`. -/
theorem startsOps : Laws.Starts.StartsOps (Laws.State.WellFormed program) where
  clock _ atMs formed := Laws.State.clock_wellFormed formed atMs
  complete _ _ leave writes rule formed member begun _ := complete_wellFormed formed member begun leave writes rule

/-- Scopes' operations record (`Laws.Scopes.ScopesOps`) of `WellFormed`. -/
theorem scopesOps : Laws.Scopes.ScopesOps program (Laws.State.WellFormed program) where
  owner _ _ _ formed member owned link := owner_begun formed member owned link
  complete _ _ leave writes rule formed member begun _ := complete_wellFormed formed member begun leave writes rule
  clear _ _ _ formed member begun ready := Laws.State.clearInside_inner formed member begun ready
  enter _ element locals _ _ formed member begun _ claimable :=
    Laws.State.enterScope_inner formed element locals member begun claimable
  arm _ _ element formed member begun _ := queueArm_wellFormed formed member begun element
  armScope _ _ formed stands := armScope_wellFormed formed (List.mem_map.mp stands)
  begin _ request formed stands inner _ _ nodup admitted _ :=
    Laws.State.signal_named_wellFormed formed stands nodup admitted (by simp [Laws.State.InnerPlaced, inner])
      (Laws.State.signal_queueSound formed (fun _ _ _ same => by simp at same) (fun _ same => by simp at same)
        (fun _ _ _ same => by simp at same) (fun _ _ same => by simp at same) (fun _ _ _ _ same => by simp at same))
      (fun _ _ _ _ same => by simp at same) (fun _ _ _ _ _ same => by simp at same) fun _ _ same => by simp at same
  armed _ _ _ _ _ _ ready := ⟨by rw [Laws.State.signal_eq], Laws.State.Claimable.signal ready
    (fun _ same => by simp at same) (fun _ _ _ _ same => by simp at same) (fun _ _ _ _ _ _ same => by simp at same)
    fun _ _ same => by simp at same⟩
  scopeArmed _ _ _ _ ready := ⟨by rw [Laws.State.signal_eq], Laws.State.Claimable.signal ready
    (fun _ same => by simp at same) (fun _ _ _ _ same => by simp at same) (fun _ _ _ _ _ _ same => by simp at same)
    fun _ _ same => by simp at same⟩
  signalScopes _ _ := by rw [Laws.State.signal_eq]

/-- Propagation's operations record (`Laws.Propagation.PropagationOps`) of `WellFormed`. -/
theorem propagationOps : Laws.Propagation.PropagationOps program (Laws.State.WellFormed program) where
  complete _ _ leave writes rule formed member begun _ := complete_wellFormed formed member begun leave writes rule
  raise _ event _ formed member begun _ := raiseFrom_wellFormed formed member begun event (fun _ same => by cases same) []
  fire _ _ _ formed := queue_wellFormed formed trivial
  outbox _ _ formed := formed.narrow {
      scopes := rfl, occurrences := rfl, activations := rfl, nextIssue := rfl,
      instances := fun _ => by apply Laws.State.instanceOf_congr <;> rfl, recorded := id, items := .refl _,
      tokens := .refl _, signals := .refl _, starts := fun _ => id, slots := .same rfl } rfl formed.startedOnce
  compensate _ _ _ _ _ _ formed member begun _ _ _ := queue_wellFormed formed fun _ same => by
    cases same
    exact ⟨fun _ _ same => by cases same; exact begun_settled formed member begun, fun _ _ same => by simp at same⟩
  terminate _ _ formed member begun :=
    have cleared := Laws.State.clearInside_inner formed member begun (inner := none) (by simp)
    ⟨cleared.1, cleared.2.1⟩
  openItem _ kind _ formed member begun unstarted role :=
    Laws.State.openItem_wellFormed formed kind member begun unstarted role
  signalOccurrences _ _ := by rw [Laws.State.signal_eq]
  signalFrame _ _ := by rw [Laws.State.signal_eq]; exact ⟨rfl, rfl⟩
  begin _ _ _ formed stands _ := by
    obtain ⟨entry, inside, named⟩ := stands
    exact bareBegin_wellFormed formed (by simp [Laws.State.names]) (List.mem_map.mpr ⟨entry, inside, named⟩)
  cancel _ _ formed := queue_wellFormed formed trivial
  occur _ _ _ _ _ _ formed _ _ := queue_wellFormed formed trivial
  write _ _ _ _ formed := queue_wellFormed formed trivial
  failCompensation _ _ _ _ _ formed := queue_wellFormed formed trivial
  fail _ _ formed := queue_wellFormed formed (by simp [Queueable])
  disarm _ host formed := ⟨Laws.State.disarm_wellFormed formed host, by rw [Laws.State.disarm_eq]⟩
  rollBack _ _ _ _ _ _ _ formed stands _ _ _ _ := queue_wellFormed
    (Laws.State.clearAll_wellFormed formed (List.mem_map.mpr stands)) fun _ same => by
      cases same
      exact ⟨fun _ _ wrong => (by cases wrong), fun _ _ wrong => by cases wrong⟩

/-- A fired item's scope occurrence stands, and so does its host, if any, begun there. -/
theorem fired_hangs {state : State} (formed : Laws.State.WellFormed program state) {item : OpenItem}
    (member : item ∈ itemList state.openItems) : ∀ id, item.attachedTo = some id → ∃ occurrence ∈ (state.closeItem item.id).occurrences,
      occurrence.id = id ∧ occurrence.begun = true ∧ occurrence.scope = item.scope := by
  rw [Laws.State.closeItem_eq]
  exact formed.owned.attachments item member

/-- The subscription hooks' operations record (`Laws.Subscriptions.SubscriptionsOps`) of `WellFormed`. -/
theorem subscriptionsOps : Laws.Subscriptions.SubscriptionsOps program (Laws.State.WellFormed program) where
  fire _ _ _ formed := queue_wellFormed formed trivial
  rekind _ _ formed kept waits := Laws.State.rekind_wellFormed formed kept
    (fun item member start => waits item (formed.typed item member start).2.2.2) fun item _ => waits item
  awaits := Laws.State.triggers_await
  disarm _ host formed := Laws.State.disarm_wellFormed formed host
  openItem _ kind _ formed member begun unstarted role :=
    Laws.State.openItem_wellFormed formed kind member begun unstarted role
  openSubscription _ kind element _ _ passive formed stands hangs waits _ _ := by
    obtain ⟨entry, inside, named⟩ := stands
    exact Laws.State.openSubscription_wellFormed formed kind element (List.mem_map.mpr ⟨entry, inside, named⟩) hangs passive
      waits
  subscribed state kind element scope host passive _ := by
    have reserves := Laws.State.reserve_reserves state element scope
    rw [Laws.State.openSubscription_eq]
    exact ⟨reserves.scopes, fun occurrence member => by
      rw [reserves.occurrences]
      exact List.mem_append_left _ member, by rw [Laws.State.reserve_slots]⟩
  closeComplete _ _ leave writes formed member _ :=
    have ⟨closed, fired⟩ := Laws.State.closeItem_fired formed member
    fired_complete closed fired leave writes .outward
  gatewayComplete state item gateway leave writes formed member attached _ := by
    obtain ⟨closed, fired⟩ := Laws.State.closeItem_fired formed member
    obtain ⟨host, present, named, ⟨begun, _⟩⟩ := formed.owned.attachments item member gateway attached
    have disarmed := Laws.State.disarm_wellFormed closed gateway
    have kept : host ∈ ((state.closeItem item.id).disarm gateway).occurrences := by
      rw [Laws.State.disarm_eq, Laws.State.closeItem_eq]
      exact List.mem_filter.mpr ⟨present, by simp [begun]⟩
    refine fired_complete (named ▸ complete_wellFormed disarmed kept begun _ _ _)
      ((Laws.State.disarm_fired fired gateway).signal (fun _ same => by simp at same) (fun _ _ _ same => ?_)
        (fun _ _ _ _ _ same => by simp at same) fun _ _ same => by simp at same) leave writes .outward
    obtain ⟨rfl, -⟩ := Signal.complete.inj same
    have := formed.attachedReserved item member (by rw [attached]; rfl) host present named
    rw [begun] at this
    cases this
  interruptComplete _ _ host leave writes formed member _ := by
    obtain ⟨closed, fired⟩ := Laws.State.closeItem_fired formed member
    obtain ⟨withdrawn, kept⟩ := Laws.State.withdrawOccurrence_fired closed fired host
    exact fired_complete (queue_wellFormed (signal := .cancel host) withdrawn trivial) (kept.signal (fun _ same => by simp at same)
      (fun _ _ _ same => by simp at same) (fun _ _ _ _ _ same => by simp at same) fun _ _ same => by simp at same) leave
      writes .outward
  reopenComplete _ item detail leave writes formed member _ _ := by
    obtain ⟨closed, fired⟩ := Laws.State.closeItem_fired formed member
    obtain ⟨reopened, kept⟩ := Laws.State.openSubscription_fired closed fired (.timer detail) item.element fired.1
      (fired_hangs formed member) item.passive (Laws.State.triggers_await.1 detail)
    exact fired_complete reopened kept leave writes .outward
  occur _ _ _ _ _ formed _ _ _ _ := queue_wellFormed formed trivial
  insideBegin _ item element writes formed member start _ := by
    obtain ⟨closed, fired⟩ := Laws.State.closeItem_fired formed member
    obtain ⟨withdrawn, kept⟩ := Laws.State.withdrawInside_fired closed fired item.scope
    exact fired_begin withdrawn kept start element writes
  closeBegin _ _ element writes formed member start _ :=
    have ⟨closed, fired⟩ := Laws.State.closeItem_fired formed member
    fired_begin closed fired start element writes
  reopenBegin _ item detail element writes formed member start _ _ := by
    obtain ⟨closed, fired⟩ := Laws.State.closeItem_fired formed member
    obtain ⟨reopened, kept⟩ := Laws.State.openSubscription_fired closed fired (.timer detail) item.element fired.1
      (fired_hangs formed member) item.passive (Laws.State.triggers_await.1 detail)
    exact fired_begin reopened kept start element writes
  bareBegin _ item _ _ formed member _ := bareBegin_wellFormed formed rfl (formed.owned.itemScopes item member)

/-- The compensation hooks' operations record (`Laws.Compensation.CompensationOps`) of `WellFormed`. -/
theorem compensationOps : Laws.Compensation.CompensationOps program (Laws.State.WellFormed program) where
  store _ _ formed runs _ := Laws.State.compensation_wellFormed formed runs
  issue _ formed := Laws.State.issue_wellFormed formed
  issued state := by rw [Laws.State.issue_eq]; exact ⟨rfl, rfl, rfl, rfl⟩
  fail _ _ formed := queue_wellFormed formed (by simp [Queueable])

/-- The compensation runs' operations record (`Laws.Compensation.RunsOps`) of `WellFormed`. -/
theorem runsOps : Laws.Compensation.RunsOps program (Laws.State.WellFormed program) Laws.State.Settled where
  fits _ run formed member :=
    ⟨formed.settled.resumed run member, (formed.settled.runsPlaced run member).1, (formed.settled.runsPlaced run member).2⟩
  issued _ formed := formed.issued.scopes
  slotsIssued _ formed body member scope active := (formed.settled.placed body member scope active).1
  store _ _ formed kept _ _ _ := ⟨Laws.State.slots_wellFormed formed ⟨formed.settled.parked, formed.settled.bodies,
    fun run member => (kept run member).elim (formed.settled.resumed run) (·.1), formed.settled.queued,
    formed.settled.placed, fun run member => (kept run member).elim (formed.settled.runsPlaced run) (·.2),
    formed.settled.grouped, formed.settled.raised⟩, fun _ settled => settled⟩
  enter _ element parent locals formed stands _ := ⟨Laws.State.enterScope_wellFormed formed element stands locals
    (fun _ same => by cases same), fun _ settled => settled.enter element parent locals none⟩
  entered _ _ _ _ := by rw [Laws.State.enterScope_eq]; exact ⟨rfl, rfl, rfl, rfl⟩
  signalled _ _ := by rw [Laws.State.signal_eq]; exact ⟨rfl, rfl, rfl⟩
  cancel _ _ formed := ⟨queue_wellFormed formed trivial, fun _ settled => settled.signal fun _ same => by simp at same⟩
  complete _ _ leave writes rule formed settled _ := ⟨settled_wellFormed formed settled leave writes rule,
    fun _ settled => settled.signal fun _ same => by simp at same⟩
  occur _ _ _ _ _ _ formed _ _ := ⟨queue_wellFormed formed trivial, fun _ settled => settled.signal fun _ same => by simp at same⟩
  begin _ _ _ _ formed stands _ := ⟨bareBegin_wellFormed formed (by simp [Laws.State.names]) stands,
    fun _ settled => settled.begin (by simp [Laws.State.names])⟩
  leave _ _ _ formed member link _ := by
    obtain ⟨left, standing, frame⟩ := Laws.State.leaveChild_wellFormed formed member link
    exact ⟨left, standing, frame.nextIssue, fun _ kept => frame.scopesSublist.subset kept, frame.slots.bodies, fun _ settled =>
      settled.transport (Nat.le_of_eq frame.nextIssue.symm) (fun _ present _ => .inl (frame.occurrencesSublist.subset present))
        fun _ queued => queued.shrink (by rw [frame.signals]; exact .refl _) frame.tokensSublist⟩

/-- Data's share of the state invariant, measured at P0 (P2's budget rests on it): the registered write and removal
hooks keep `Laws.State.WellFormed`. -/
theorem registeredWrites_wellFormed {ctx : Ctx} {scope : ScopeOccurrenceId} {writes : List (String × Value)}
    {rule : WriteRule} {state after : State} (formed : Laws.State.WellFormed ctx.program state)
    (stands : Laws.Step.ScopeStands state scope)
    (ran : Registry.hooks.writeOutputs ctx scope writes rule state = .ok after) : Laws.State.WellFormed ctx.program after :=
  (registered_writeOutputs Proofs.State.operations Proofs.State.stateFacts _ _ _ _ _ _ formed stands ran).1

theorem registeredRemovals_wellFormed {ctx : Ctx} {scope : ScopeOccurrenceId} {names : List String} {state after : State}
    (formed : Laws.State.WellFormed ctx.program state) (stands : Laws.Step.ScopeStands state scope)
    (ran : Registry.hooks.removeVariables ctx scope names state = .ok after) : Laws.State.WellFormed ctx.program after :=
  registered_removeVariables Proofs.State.operations Proofs.State.stateFacts _ _ _ _ _ formed stands ran

/-! ## The registered hooks' contract

The records of `WellFormed` are filled above, so `Laws.Step.HookContract Registry.hooks Laws.State.WellFormed` is
proved (`registered_contract`), and the state-invariant lane's statements follow from the contract and `phases`. -/

/-- The feature records of `WellFormed`. -/
theorem registeredOps_wellFormed : RegisteredOps Laws.State.WellFormed where
  operations := Proofs.State.operations
  work _ := workOps
  flow _ := flowOps
  join _ := joinOps
  multiInstance _ := multiInstanceOps
  starts _ := startsOps
  scopes _ := scopesOps
  subscriptions _ := subscriptionsOps
  compensation _ := compensationOps
  propagation _ := propagationOps
  runs _ := runsOps

/-- A committed input keeps the registered hooks' state well-formed. -/
theorem registered_stepKeeps : Proofs.State.StepKeepsWellFormed Registry.hooks :=
  Proofs.State.stepKeepsWellFormed (registered_contract registeredOps_wellFormed Proofs.State.stateFacts) phases
    pipelinePhases

/-- A committed start makes a well-formed state under the registered hooks. -/
theorem registered_startIs : Proofs.State.StartIsWellFormed Registry.hooks :=
  Proofs.State.startIsWellFormed (registered_contract registeredOps_wellFormed Proofs.State.stateFacts) phases
    pipelinePhases initial_wellFormed

/-- Every instance a committed population run holds is well-formed under the registered hooks. -/
theorem registered_populationKeeps : Proofs.State.PopulationKeepsWellFormed Registry.hooks :=
  Proofs.State.populationKeepsWellFormed registered_stepKeeps registered_startIs

/-! ## The cancellation lane

`Kernel.Proofs.Cancellation` proves the lane's statements for any hooks, or for the registered hooks from their feature
records and phases beside `WellFormed` (`Kernel.Proofs.Cancellation.Registered`), which this module fills. -/

/-- Queued work naming a removed scope occurrence has no effect under the registered hooks. -/
theorem registered_queuedWorkInert : Cancellation.QueuedWorkInert Registry.hooks :=
  Cancellation.queuedWorkInert

/-- An input addressed to a removed occurrence is rejected without effect under the registered hooks. -/
theorem registered_lateInputRejected : Cancellation.LateInputRejected Registry.hooks :=
  Cancellation.lateInputRejected

/-- Subtree removal under the registered hooks leaves nothing of the removed subtree. -/
theorem registered_subtreeRemoved : Cancellation.SubtreeRemoved Registry.hooks :=
  Cancellation.subtreeRemoved_registered registeredOps_wellFormed phases pipelinePhases

/-- Every begun occurrence an input on a running instance removes under the registered hooks ends once in its
journal. -/
theorem registered_removedEndOnce : Cancellation.RemovedEndOnce Registry.hooks :=
  Cancellation.removedEndOnce_registered registeredOps_wellFormed phases pipelinePhases

/-! ## The Multi-Instance lane

`Kernel.Proofs.MultiInstance.Hooks` proves what the lane's hooks enter through `Laws.MultiInstance.MultiInstanceOps`,
which this module fills for `Laws.State.WellFormed`. -/

/-- Under `cibLocals` the registered hooks enter each instance holding its `loopCounter`. -/
theorem registered_countersEntered : MultiInstance.CountersEntered Registry.hooks := by
  refine ⟨fun ctx _ _ loop _ state _ formed member begun cib apart ran => ?_,
    fun ctx _ _ _ state _ formed stands cib apart ran => ?_⟩
  · rw [Laws.Registry.hooks_arriveMultiInstance] at ran
    rcases MultiInstance.arriveMultiInstance_counted multiInstanceOps formed member begun
      (enterBody_wellFormed formed member begun _)
      (fun _ kept present => ⟨queueArm_wellFormed kept present begun _, fun _ settled => settled.signal fun _ same => by
        simp at same⟩) cib
      (Laws.MultiInstance.itemName_ne apart.1 apart.2.1 apart.2.2) ran with ⟨held, same⟩ | counted
    · subst same
      exact MultiInstance.nothingCounted multiInstanceOps (multiInstanceOps.hold _ _ formed)
        (by rw [Laws.Hooks.hold_eq]; exact Nat.le_refl _)
    · exact counted
  · rw [Laws.Registry.hooks_instanceCompleted] at ran
    exact MultiInstance.instanceCompleted_counted multiInstanceOps formed stands cib
      (fun _ _ looped => Laws.MultiInstance.itemName_ne (apart _ _ looped).1 (apart _ _ looped).2.1
        (apart _ _ looped).2.2) ran

/-- A committed registered instance completion found CIB's counters held under `cibLocals`. -/
theorem registered_countersRead : MultiInstance.CountersRead Registry.hooks :=
  fun _ _ _ _ _ _ _ _ _ formed cib ran member owns looped slot => by
    rw [Laws.Registry.hooks_instanceCompleted] at ran
    exact MultiInstance.instanceCompleted_countersHeld formed.keyed (formed.formed _ member).owned cib ran member
      owns looped slot

/-! ## The Multi-Instance output collection

What the registered `Hooks.completeBody` and `Hooks.instanceCompleted` queue is a body's completion writing what
`Laws.MultiInstance.WritesCollection` allows (`Laws.MultiInstance.finish_spec`, `MultiInstance.instanceCompleted_queues`),
the write of its counters, or the begins of its next instances; telling them apart is a `Signal` discrimination, made
here. -/

/-- What a completion writes under the output collection's name lists every slot's output in item order, when the loop
names its output data item (`MultiInstance.OutputsNamed`) and the slots fit the loop. -/
theorem collectsWritten {program : Program} {loop : MultiInstance} {run : MultiInstanceRun} {name : String}
    {written : List (String × Value)} (writes : Laws.MultiInstance.WritesCollection program loop run written)
    (named : MultiInstance.OutputsNamed program loop) (collection : loop.outputCollection = some name)
    (fits : Laws.MultiInstance.OutputsFit run loop) (value : Value) (present : (name, value) ∈ written) :
    ∃ outputs, collectionItems value = some outputs ∧ Laws.MultiInstance.Collects run (some outputs) := by
  obtain ⟨aggregates, _, listed⟩ := writes name value present
  obtain ⟨outputs, lists, collects⟩ := listed (named aggregates (by rw [collection]; rfl)) fits
  exact ⟨outputs, Laws.Hooks.collectionItems_lists lists, collects⟩

/-- A body's completion under the registered hooks writes the output collection listing every slot's output in item
order. -/
theorem registered_collectsOnCompletion : MultiInstance.CollectsOnCompletion Registry.hooks := by
  refine ⟨fun ctx _ _ loop _ state _ run _ formed named looped member owns collection ran => ?_,
    fun _ _ _ _ _ _ run loop _ formed named looped member owns collection ran => ?_⟩
  · rw [Laws.Registry.hooks_completeBody] at ran
    obtain ⟨found, located, finished⟩ := Laws.MultiInstance.completeBody_spec ran
    have one := Laws.MultiInstance.runOf?_keyed formed.keyed located member owns
    subst finished one
    obtain ⟨written, same, writes⟩ := Laws.MultiInstance.finish_spec ctx loop found state
    refine ⟨[.complete found.occurrence .outgoing written .outward],
      by rw [same, Laws.State.signal_eq, Laws.State.Queues], ?_⟩
    intro queued inside _ value present shape
    have one := List.mem_singleton.mp inside
    subst one
    rcases shape with ⟨_, _, _, same⟩ | ⟨_, _, same⟩
    · obtain ⟨-, -, listed, -⟩ := Signal.complete.inj same
      subst listed
      exact collectsWritten writes named collection ((formed.formed found member).shaped loop looped).2.2.1 value present
    · cases same
  · rw [Laws.Registry.hooks_instanceCompleted] at ran
    obtain ⟨found, other, index, rest⟩ := MultiInstance.instanceCompleted_queues ran
    obtain ⟨output, done, _, queues⟩ := rest
    obtain ⟨new, queued, each⟩ := queues
    refine ⟨new, queued, fun _ _ _ _ inside value present => ?_⟩
    rcases each _ inside with ⟨_, _, _, same⟩ | ⟨_, same⟩ | ⟨_, same, writes, only⟩
    · cases same
    · cases same
    · obtain ⟨-, -, listed, -⟩ := Signal.complete.inj same
      have one := only run member owns
      subst listed one
      have looped' : other = loop := Option.some.inj ((done.looped : _ = some other).symm.trans looped)
      subst looped'
      have fits := ((formed.formed found (Laws.MultiInstance.found_mem done.found)).shaped other done.looped).2.2.1
      exact collectsWritten writes named collection (MultiInstance.recorded_fits fits done.fits done.looped) value present

/-- A body's completion under the registered hooks writes its output collection once every slot is filled. -/
theorem registered_collectionWritten : MultiInstance.CollectionWritten Registry.hooks := by
  refine ⟨fun ctx _ _ loop _ state _ run _ formed member owns aggregates named filled ran => ?_,
    fun _ _ _ _ _ _ run _ _ _ formed looped member owns slot others aggregates named ran => ?_⟩
  · rw [Laws.Registry.hooks_completeBody] at ran
    obtain ⟨found, located, finished⟩ := Laws.MultiInstance.completeBody_spec ran
    have one := Laws.MultiInstance.runOf?_keyed formed.keyed located member owns
    subst finished one
    obtain ⟨written, value, same, present⟩ := Laws.MultiInstance.finish_collects ctx found state aggregates named filled
    refine ⟨[.complete found.occurrence .outgoing written .outward],
      by rw [same, Laws.State.signal_eq, Laws.State.Queues], written, value, ?_, present⟩
    rw [owns]
    exact List.mem_singleton_self _
  · rw [Laws.Registry.hooks_instanceCompleted] at ran
    exact MultiInstance.instanceCompleted_collects formed.keyed (formed.formed run member).owned ran member owns looped
      slot others aggregates named

/-- An instance's completion under the registered hooks that leaves a slot of its body unfilled queues no completion
writing the output collection. -/
theorem registered_stopsUncollected : MultiInstance.StopsUncollected Registry.hooks := by
  intro _ _ _ _ _ _ run _ name ran member owns unfilled _ _
  rw [Laws.Registry.hooks_instanceCompleted] at ran
  obtain ⟨_, _, _, rest⟩ := MultiInstance.instanceCompleted_queues ran
  obtain ⟨_, _, _, queues⟩ := rest
  obtain ⟨new, queued, each⟩ := queues
  refine ⟨new, queued, fun _ _ _ _ inside value present => ?_⟩
  rcases each _ inside with ⟨_, _, _, same⟩ | ⟨_, same⟩ | ⟨_, same, writes, only⟩
  · cases same
  · cases same
  · obtain ⟨-, -, listed, -⟩ := Signal.complete.inj same
    have one := only run member owns
    subst listed one
    obtain ⟨slot, inside', open_⟩ := unfilled
    obtain ⟨filled, is⟩ := (writes name value present).2.1 slot inside'
    exact open_ filled is

/-! ## The former lanes

The statements of `Kernel.Proofs.Former` read `Hooks.writeOutputs` or no hook: each holds of every hooks record whose
`writeOutputs` is Data's, and of every `Laws.Step.StateFacts`. `CalledReadsIsolated` and `FailedSourcesRead` read no
hook and are proved where they are stated. -/

/-- A write from inside a called instance under the registered hooks changes no frame outside it. -/
theorem registered_calledWritesIsolated : Former.CalledWritesIsolated Registry.hooks :=
  Former.calledWritesIsolated Laws.Registry.hooks_writeOutputs

/-- An outward write under the registered hooks lands at the nearest owner within the writer's instance. -/
theorem registered_outputsAtNearestOwner : Former.OutputsAtNearestOwner Registry.hooks :=
  Former.outputsAtNearestOwner Laws.Registry.hooks_writeOutputs

/-- An outward write of a Scope's item under the registered hooks lands in its declaring occurrence. -/
theorem registered_outputsAtDeclaringOccurrence : Former.OutputsAtDeclaringOccurrence Registry.hooks :=
  Former.outputsAtDeclaringOccurrence Laws.Registry.hooks_writeOutputs

/-- A scope occurrence with a live child, a nested Call's root among them, is never the idle one the closure completes. -/
theorem stateFacts_nestedCallKeepsRootBusy : Former.NestedCallKeepsRootBusy :=
  Former.nestedCallKeepsRootBusy Proofs.State.stateFacts

/-- An input carrying a value outside the domain is rejected whole under the registered hooks. -/
theorem registered_valuesRejectedWhole : Former.ValuesRejectedWhole Registry.hooks :=
  Former.valuesRejectedWhole Registry.hooks

/-- A Call's return continues exactly its caller under the registered hooks. -/
theorem registered_returnContinuesCaller : Former.ReturnContinuesCaller Registry.hooks :=
  Former.returnContinuesCaller Laws.Registry.hooks_completeCall

/-- A Call installs its evaluated inputs as its called root's variables under the registered hooks. -/
theorem registered_callInstallsSnapshot : Former.CallInstallsSnapshot Registry.hooks :=
  Former.callInstallsSnapshot Laws.Registry.hooks_arriveActivity

/-- The registered hooks keep `WellFormed` and the lane invariant of called instances (`Former.Formed`): the feature
records follow from `WellFormed`'s and the lane's frames. -/
theorem formed_contract : Laws.Step.HookContract Registry.hooks Former.Formed :=
  registered_contract_of
    (Proofs.Cancellation.featureOps_frame registeredOps_wellFormed.toFeatureOps
      (fun program => (Former.callsFormed_alongside program).toFrameAlongside) Former.callsFormed_occursAlongside)
    (multiInstanceKeeps_of fun program => Proofs.Cancellation.multiInstanceOps_alongside
      (Former.callsFormed_alongside program) (registeredOps_wellFormed.multiInstance program))
    (Proofs.Cancellation.compensationKeeps_frame registeredOps_wellFormed Former.callsFormed_stores
      Former.callsFormed_occursAlongside)
    Proofs.State.stateFacts

/-- A committed input or start under the registered hooks keeps `Former.Formed`, from a before-state that keeps it. -/
theorem registered_formed {program : Program} {before : Option State} {input : Input} {after : State}
    (entry : ∀ state, before = some state → Former.Formed program state)
    (ran : Step.step Registry.hooks program before input = .ok after) : Former.Formed program after :=
  Laws.Step.step_keeps formed_contract (Former.formed_phases phases) Proofs.State.stateFacts
    (Laws.Step.complete_keeps formed_contract (Former.formed_phases phases).toClosurePhases
      (Former.callsFormed_pipelinePhases pipelinePhases) Proofs.State.stateFacts)
    (fun _ _ holds => Former.formed_reset holds)
    (fun instanceId variables businessKey => ⟨initial_wellFormed program instanceId variables businessKey,
      Former.callsFormed_initial program instanceId variables businessKey⟩)
    entry ran

/-- A committed start keeps the lane invariant of called instances under the registered hooks. -/
theorem registered_callsFormedAtStart : Former.CallsFormedAtStart Registry.hooks := fun _ _ _ ran =>
  (registered_formed (fun _ given => by cases given) ran).2

/-- Every instance a committed population run holds keeps the lane invariant of called instances under the registered
hooks. -/
theorem registered_callsFormedInPopulation : Former.CallsFormedInPopulation Registry.hooks :=
  fun _ _ _ ran member inside =>
    (Laws.Population.runStimuli_held (good := Former.Formed)
      ⟨fun _ _ _ _ holds stepped => registered_formed (fun _ given => by cases given; exact holds) stepped,
        fun _ _ _ stepped => registered_formed (fun _ given => by cases given) stepped⟩
      ran member inside).2

/-- The registered hooks keep `WellFormed` and the placement lane under its premise (`Former.PlacedForm`): the feature
records follow from `WellFormed`'s and the lane's frames. -/
theorem placed_contract : Laws.Step.HookContract Registry.hooks Former.PlacedForm :=
  registered_contract_of
    (Proofs.Cancellation.featureOps_frame registeredOps_wellFormed.toFeatureOps
      (fun program => (Former.placedAlongside program).toFrameAlongside) Former.placedOccursAlongside)
    (multiInstanceKeeps_of fun program => Proofs.Cancellation.multiInstanceOps_alongside
      (Former.placedAlongside program) (registeredOps_wellFormed.multiInstance program))
    (Proofs.Cancellation.compensationKeeps_frame registeredOps_wellFormed Former.placedStores
      Former.placedOccursAlongside)
    Proofs.State.stateFacts

/-- A committed input or start under the registered hooks keeps `Former.PlacedForm`, from a before-state that keeps
it. -/
theorem registered_placedForm {program : Program} {before : Option State} {input : Input} {after : State}
    (entry : ∀ state, before = some state → Former.PlacedForm program state)
    (ran : Step.step Registry.hooks program before input = .ok after) : Former.PlacedForm program after :=
  have phases := Proofs.Frame.phases_alongside phases Former.placedStepAlongside
  Laws.Step.step_keeps placed_contract phases Proofs.State.stateFacts
    (Laws.Step.complete_keeps placed_contract phases.toClosurePhases (Former.placed_pipelinePhases pipelinePhases)
      Proofs.State.stateFacts)
    (fun _ _ holds => Former.placed_reset holds)
    (fun instanceId variables businessKey => ⟨initial_wellFormed program instanceId variables businessKey,
      fun _ => Former.placedLane_initial program instanceId variables businessKey⟩)
    entry ran

/-- A committed input under the registered hooks keeps the placement lane of a well-formed state of a program whose
references stay in one process. -/
theorem registered_placed {program : Program} {before after : State} {input : Input}
    (references : Former.ReferencesPlaced program) (formed : Laws.State.WellFormed program before)
    (placed : Former.PlacedLane program before)
    (ran : Step.step Registry.hooks program (some before) input = .ok after) : Former.PlacedLane program after :=
  (registered_placedForm (fun _ given => by cases given; exact ⟨formed, fun _ => placed⟩) ran).2 references

/-- A committed start keeps the placement lane under the registered hooks. -/
theorem registered_placedAtStart : Former.PlacedAtStart Registry.hooks := fun _ _ _ references ran =>
  (registered_placedForm (fun _ given => by cases given) ran).2 references

/-- Every instance a committed population run holds keeps the placement lane under the registered hooks. -/
theorem registered_placedInPopulation : Former.PlacedInPopulation Registry.hooks :=
  fun _ _ _ ran member inside references =>
    (Laws.Population.runStimuli_held (good := Former.PlacedForm)
      ⟨fun _ _ _ _ holds stepped => registered_placedForm (fun _ given => by cases given; exact holds) stepped,
        fun _ _ _ stepped => registered_placedForm (fun _ given => by cases given) stepped⟩
      ran member inside).2 references

/-- A committed input under the registered hooks names every called root it creates by its Call, keeps the lane
invariant of called instances and the placement lane, and leaves each called identity naming one instance. -/
theorem registered_calledIdentityUnique : Former.CalledIdentityUnique Registry.hooks :=
  fun _ _ before _ apart references formed calls placed ran =>
    have after := registered_formed (before := some before) (fun _ given => by cases given; exact ⟨formed, calls⟩) ran
    have placedAfter := registered_placed references formed placed ran
    ⟨fun _ member _ called => after.2.named.owner after.1 member called, after.2, placedAfter,
      Former.identitiesApart_of after.1 after.2 (Former.ownersPlaced_of after.1 after.2 placedAfter.placed apart)⟩

end Kernel.Proofs.Step
