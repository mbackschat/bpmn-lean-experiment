module

public import Kernel.Laws.Step
public import Kernel.Laws.Registry
public import Kernel.Laws.Flow
public import Kernel.Laws.Scopes
public import Kernel.Laws.Starts
public import Kernel.Laws.Subscriptions
public import Kernel.Laws.Data
public import Kernel.Laws.Work
public import Kernel.Laws.Compensation
public import Kernel.Laws.Propagation
public import Kernel.Laws.MultiInstance
public import Kernel.Laws.Hooks
public import Kernel.Proofs.State
public import Kernel.Proofs.Step.Queue

/-! # Proofs: composition over the registered hooks

The proof wave's composition module ([PLAN, proof wave](../../docs/PLAN.md#proof-wave)): it instantiates the
`Step`-generic facts of `Kernel.Laws.Step` with the registered hooks of `Kernel.Laws.Registry` and the feature lemmas
of each `Kernel.Laws.<F>`, and opens no body. Each lane's statement is stated over a hooks parameter at the head of its
own `Kernel.Proofs.<Lane>` module and proved there from hook contracts; a lane closes when this module proves its
statement of `Registry.hooks`. The registered hooks' contract (`Laws.Step.HookContract`) is assembled here, one field
per hook, from each feature's lemma and the operations record the feature states, which this module fills from
`Laws.Step.Operations` and `Laws.Step.StateFacts`. Nothing executable imports this module.
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
        (Laws.Flow.candidateHolds ctx { variables := state.visible ctx.program scope, nowMs := state.logicalTimeMs })
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
  obtain ⟨sourceType, begun, occurrence, ⟨_, made, dispatched⟩⟩ := Laws.Step.begin_ok begun_
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

/-! ## The registered hooks' contract -/

section Contract

open Kernel.Laws.Step (Operations StateFacts ScopeStands PipelineFrame)

variable {inv : Program → State → Prop}

/-- Data's operations record (`Laws.Data.StateOps`), from the root's. -/
theorem dataOps (ops : Operations inv) (facts : StateFacts) (program : Program) : Laws.Data.StateOps (inv program) where
  housed := ops.variablesHoused program
  rooted := ops.rootStands program
  set := ops.setVariable program
  remove := ops.removeVariable program
  setFrame := facts.setVariable
  removeFrame := facts.removeVariable
  declaring := facts.declaring
  owner := facts.owner
  instanceRoot := facts.instanceRoot

/-- `HookContract.writeOutputs` of the registered hooks. -/
theorem registered_writeOutputs (ops : Operations inv) (facts : StateFacts) :
    ∀ ctx scope writes rule state after, inv ctx.program state → ScopeStands state scope →
      Registry.hooks.writeOutputs ctx scope writes rule state = .ok after → inv ctx.program after ∧
        PipelineFrame state after := by
  intro ctx scope writes rule state after holds stands ran
  rw [Laws.Registry.hooks_writeOutputs] at ran
  obtain ⟨kept, scopes, occurrences, items⟩ := Laws.Data.writeOutputs_keeps (dataOps ops facts ctx.program) holds (fun _ => stands)
    ran
  exact ⟨kept, scopes, fun occurrence member _ => occurrences ▸ member, fun item member => items ▸ member⟩

/-- `HookContract.removeVariables` of the registered hooks. -/
theorem registered_removeVariables (ops : Operations inv) (facts : StateFacts) :
    ∀ ctx scope names state after, inv ctx.program state → ScopeStands state scope →
      Registry.hooks.removeVariables ctx scope names state = .ok after → inv ctx.program after := by
  intro ctx scope names state after holds _ ran
  rw [Laws.Registry.hooks_removeVariables] at ran
  exact Laws.Data.removeVariables_keeps (dataOps ops facts ctx.program) holds ran

end Contract

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
  { reset := fun _ _ formed => Laws.State.reset_wellFormed formed
    clock := fun _ _ atMs formed => Laws.State.clock_wellFormed formed atMs
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
    parkedBegun := fun _ _ waiting _ formed parked member named =>
      (formed.settled.parked waiting parked).2.1 _ member named
    endInstance := fun _ _ _ _ formed recorded => by
      rw [Laws.Step.endInstance_eq]
      exact Laws.State.endInstance_wellFormed formed recorded
    begin := fun _ _ request role sourceType formed stands admitted roled =>
      ⟨Laws.State.begin_wellFormed formed request role sourceType (mem stands) admitted.2.1 roled,
        Laws.State.begin_entry formed request role sourceType admitted.1 admitted.2.1 admitted.2.2⟩
    reserve := fun _ _ element scope formed stands => Laws.State.reserve_wellFormed formed element scope (mem stands)
    startReserved := fun _ _ _ sourceType formed member unnamed =>
      Laws.State.startReserved_closeOwnItems_wellFormed formed sourceType member unnamed
    removeOccurrence := fun _ _ _ formed member free =>
      ⟨(Laws.State.removeOccurrence_wellFormed formed member free).1,
        List.mem_map.mp (Laws.State.removeOccurrence_wellFormed formed member free).2⟩
    recordEnd := fun _ _ key terminal formed => Laws.State.recordEnd_wellFormed formed key terminal
    cancel := fun _ _ id formed => Laws.State.cancel_wellFormed formed id }

/-! ## The feature records of `WellFormed`

The operations record each feature states for its lemmas, filled here from `Laws.State`, and the frame facts the
registered hooks' contract reads beside them. -/

/-- Work's operations record (`Laws.Work.WorkOps`) of `WellFormed`. -/
theorem workOps : Laws.Work.WorkOps program (Laws.State.WellFormed program) where
  write _ scope writes rule formed := queueWrite_wellFormed formed scope writes rule
  complete _ _ leave writes rule formed member unstarted := waited_wellFormed formed member unstarted leave writes rule
  completeOwner _ _ _ leave writes rule formed member owned link :=
    complete_wellFormed formed owned (owner_begun formed member owned link) leave writes rule
  raise _ _ event patch formed member effect := effectRaise_wellFormed formed member effect event patch
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
      obtain ⟨_, _, _, ⟨effect, incident⟩⟩ := formed.typed item member (by rw [start]; rfl)
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
    Laws.State.nodup_map_eq formed.distinct.items member inside same
  queued state signal := by rw [Laws.State.signal_eq]
  kept _ _ := ⟨by rw [Laws.State.signal_eq], by rw [Laws.State.signal_eq]⟩
  completeBegun _ _ leave writes rule formed member begun := complete_wellFormed formed member begun leave writes rule
  housed _ _ formed member := housed_of formed member
  hold _ held formed := hold_wellFormed formed held
  enter _ element locals occurrence formed member begun :=
    ⟨Laws.State.enterScope_wellFormed formed element (formed.owned.occurrenceScopes occurrence member) locals
      fun _ named => ⟨occurrence, member, Option.some.inj named, begun, rfl⟩, by rw [Laws.State.enterScope_eq]⟩
  openItem _ kind _ formed member begun unstarted :=
    ⟨Laws.State.openItem_wellFormed formed kind member begun unstarted, by rw [Laws.State.openItem_eq]⟩
  arm _ _ element formed member begun := queueArm_wellFormed formed member begun element
  enterCalled _ program _ variables definition formed member begun := by
    refine ⟨Laws.State.enterCalled_wellFormed formed program member begun variables definition, ?_, ?_⟩ <;>
      rw [Laws.State.enterCalled_eq _ _ _ _ _ (Laws.State.scopes_fresh formed)]
    simp
  armScope _ _ formed stands := armScope_wellFormed formed stands
  begin _ _ _ formed stands := by
    obtain ⟨entry, inside, named⟩ := stands
    exact bareBegin_wellFormed formed (by simp [Laws.State.names]) (List.mem_map.mpr ⟨entry, inside, named⟩)

/-- Flow's operations record (`Laws.Flow.FlowOps`) of `WellFormed`. -/
theorem flowOps : Laws.Flow.FlowOps (Laws.State.WellFormed program) where
  emit _ flows _ formed stands := by
    obtain ⟨entry, inside, named⟩ := stands
    exact Laws.State.emit_wellFormed formed flows (List.mem_map.mpr ⟨entry, inside, named⟩)
  complete _ _ leave writes rule formed member begun := complete_wellFormed formed member begun leave writes rule

/-- Flow's join operations record (`Laws.Flow.JoinOps`) of `WellFormed`, what a join completes having settled. -/
theorem joinOps : Laws.Flow.JoinOps (Laws.State.WellFormed program) Laws.State.Settled where
  park state waiting formed waits := by
    obtain ⟨occurrence, member, named, begun⟩ := waits
    refine Laws.State.slots_wellFormed formed ⟨fun found inside => ?_, formed.settled.bodies, formed.settled.resumed,
      formed.settled.queued, formed.settled.placed, formed.settled.runsPlaced, formed.settled.grouped,
      formed.settled.raised⟩
    rcases List.mem_append.mp inside with old | new
    · exact formed.settled.parked found old
    · rw [List.mem_singleton.mp new, ← named]
      exact Laws.State.begun_settled formed member begun
  unpark _ _ formed := Laws.State.slots_wellFormed formed ⟨fun found inside =>
    formed.settled.parked found (List.mem_filter.mp inside).1, formed.settled.bodies, formed.settled.resumed,
    formed.settled.queued, formed.settled.placed, formed.settled.runsPlaced, formed.settled.grouped, formed.settled.raised⟩
  parked _ waiting formed member := formed.settled.parked waiting member
  begun _ _ formed member begun := Laws.State.begun_settled formed member begun
  reparked _ _ _ settled := settled
  complete _ _ leave writes rule formed settled := settled_wellFormed formed settled leave writes rule
  completed _ _ _ _ _ _ settled := settled.signal fun _ same => by simp at same
  armGateway state occurrence gateway formed member begun :=
    have ⟨entry, inside, named⟩ := List.mem_map.mp (formed.owned.occurrenceScopes occurrence member)
    queue_wellFormed formed ⟨formed.issued.occurrences occurrence member, named ▸ formed.issued.scopes entry inside,
      fun found present same => by
        rw [Laws.State.nodup_map_eq formed.distinct.occurrences present member same]
        exact ⟨begun, rfl⟩⟩

/-- The Multi-Instance operations record (`Laws.MultiInstance.MultiInstanceOps`) of `WellFormed`. -/
theorem multiInstanceOps : Laws.MultiInstance.MultiInstanceOps (Laws.State.WellFormed program) Laws.State.Settled where
  bodies _ run formed member := formed.settled.bodies run member
  placed _ run formed member := formed.settled.placed run member
  complete _ _ leave writes rule formed settled := settled_wellFormed formed settled leave writes rule
  begun _ _ formed member begun := Laws.State.begun_settled formed member begun
  housed _ occurrence formed member := formed.owned.occurrenceScopes occurrence member
  hold _ held formed := hold_wellFormed formed held
  enter _ element parent locals owner formed stands owned :=
    ⟨Laws.State.enterScope_wellFormed formed element stands locals owned,
      fun _ settled => settled.enter element parent locals owner, by
        rw [Laws.State.enterScope_eq]
        exact Laws.State.scopes_fresh formed⟩
  arm _ _ element formed member begun :=
    ⟨queueArm_wellFormed formed member begun element, fun _ settled => settled.signal fun _ same => by simp at same⟩
  begin _ _ formed bare stands := ⟨bareBegin_wellFormed formed bare stands, fun _ settled => settled.begin bare⟩
  defer _ _ formed bare := ⟨Laws.State.deferBegins_wellFormed formed bare,
    fun _ settled => settled.defer fun request member => (bare request member).1⟩
  runs _ _ formed kept := ⟨Laws.State.slots_wellFormed formed ⟨formed.settled.parked,
    fun run member => (kept run member).elim (formed.settled.bodies run) (·.1), formed.settled.resumed,
    formed.settled.queued, fun run member => (kept run member).elim (formed.settled.placed run) (·.2),
    formed.settled.runsPlaced, formed.settled.grouped, formed.settled.raised⟩,
    fun _ settled => settled⟩
  leave _ run _ formed member active stands := by
    obtain ⟨below, parentOf⟩ := formed.settled.placed run member _ active
    obtain ⟨entry, inside, named⟩ := List.mem_map.mp stands
    subst named
    obtain ⟨left, standing, frame⟩ := Laws.State.leaveChild_wellFormed formed inside (parentOf entry inside rfl)
    exact ⟨left, (formed.settled.bodies run member).transport (Nat.le_of_eq frame.nextIssue.symm)
      (fun _ present _ => .inl (frame.occurrencesSublist.subset present))
      (fun _ queued => queued.shrink (by rw [frame.signals]; exact .refl _) frame.tokensSublist), standing,
      (formed.settled.placed run member).transport (Nat.le_of_eq frame.nextIssue.symm)
        fun _ present => .inl (frame.scopesSublist.subset present)⟩
  write _ scope writes rule formed :=
    ⟨queueWrite_wellFormed formed scope writes rule, fun _ settled => settled.signal fun _ same => by simp at same⟩

/-- Starts' operations record (`Laws.Starts.StartsOps`) of `WellFormed`. -/
theorem startsOps : Laws.Starts.StartsOps (Laws.State.WellFormed program) where
  clock _ atMs formed := Laws.State.clock_wellFormed formed atMs
  complete _ _ leave writes rule formed member begun := complete_wellFormed formed member begun leave writes rule

/-- Scopes' operations record (`Laws.Scopes.ScopesOps`) of `WellFormed`. -/
theorem scopesOps : Laws.Scopes.ScopesOps (Laws.State.WellFormed program) where
  owner _ _ _ formed member owned link := owner_begun formed member owned link
  complete _ _ leave writes rule formed member begun := complete_wellFormed formed member begun leave writes rule
  clear _ _ _ formed member begun ready := Laws.State.clearInside_inner formed member begun ready
  enter _ element locals _ _ formed member begun claimable :=
    Laws.State.enterScope_inner formed element locals member begun claimable
  arm _ _ element formed member begun := queueArm_wellFormed formed member begun element
  armScope _ _ formed stands := armScope_wellFormed formed (List.mem_map.mp stands)
  begin _ request formed stands inner nodup admitted :=
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
  complete _ _ leave writes rule formed member begun := complete_wellFormed formed member begun leave writes rule
  raise _ event _ formed member begun := raiseFrom_wellFormed formed member begun event (fun _ same => by cases same) []
  fire _ _ _ formed := queue_wellFormed formed trivial
  outbox _ _ formed := formed.narrow ⟨rfl, rfl, rfl, rfl, fun _ => by apply Laws.State.instanceOf_congr <;> rfl, id,
    .refl _, .refl _, .refl _, fun _ => id, .same rfl⟩ rfl formed.startedOnce
  compensate _ _ _ _ _ _ formed member begun := queue_wellFormed formed fun _ same => by
    cases same
    exact ⟨fun _ _ same => by cases same; exact begun_settled formed member begun, fun _ _ same => by simp at same⟩
  terminate _ _ formed member begun :=
    have cleared := Laws.State.clearInside_inner formed member begun (inner := none) (by simp)
    ⟨cleared.1, cleared.2.1⟩
  openItem _ kind _ formed member begun unstarted := Laws.State.openItem_wellFormed formed kind member begun unstarted
  signalOccurrences _ _ := by rw [Laws.State.signal_eq]
  begin _ _ _ formed stands := by
    obtain ⟨entry, inside, named⟩ := stands
    exact bareBegin_wellFormed formed (by simp [Laws.State.names]) (List.mem_map.mpr ⟨entry, inside, named⟩)
  cancel _ _ formed := queue_wellFormed formed trivial
  occur _ _ _ _ _ _ formed := queue_wellFormed formed trivial
  write _ _ _ _ formed := queue_wellFormed formed trivial
  failCompensation _ _ _ _ _ formed := queue_wellFormed formed trivial
  fail _ _ formed := queue_wellFormed formed (by simp [Queueable])
  disarm _ host formed := ⟨Laws.State.disarm_wellFormed formed host, by rw [Laws.State.disarm_eq]⟩
  rollBack _ _ _ _ _ _ _ formed stands := queue_wellFormed
    (Laws.State.clearAll_wellFormed formed (List.mem_map.mpr stands)) fun _ same => by
      cases same
      exact ⟨fun _ _ wrong => (by cases wrong), fun _ _ wrong => by cases wrong⟩

/-- A fired item's scope occurrence stands, and so does its host, if any, begun there. -/
theorem fired_hangs {state : State} (formed : Laws.State.WellFormed program state) {item : OpenItem}
    (member : item ∈ state.openItems) : ∀ id, item.attachedTo = some id → ∃ occurrence ∈ (state.closeItem item.id).occurrences,
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
  openItem _ kind _ formed member begun unstarted := Laws.State.openItem_wellFormed formed kind member begun unstarted
  openSubscription _ kind element _ _ passive formed stands hangs waits := by
    obtain ⟨entry, inside, named⟩ := stands
    exact Laws.State.openSubscription_wellFormed formed kind element (List.mem_map.mpr ⟨entry, inside, named⟩) hangs passive
      waits
  subscribed state kind element scope host passive formed := by
    have reserves := Laws.State.reserve_reserves formed.activations element scope
    rw [Laws.State.openSubscription_eq]
    exact ⟨reserves.scopes, fun occurrence member => by
      rw [reserves.occurrences]
      exact List.mem_append_left _ member⟩
  closeComplete _ _ leave writes formed member :=
    have ⟨closed, fired⟩ := Laws.State.closeItem_fired formed member
    fired_complete closed fired leave writes .outward
  gatewayComplete state item gateway leave writes formed member attached := by
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
  interruptComplete _ _ host leave writes formed member := by
    obtain ⟨closed, fired⟩ := Laws.State.closeItem_fired formed member
    obtain ⟨withdrawn, kept⟩ := Laws.State.withdrawOccurrence_fired closed fired host
    exact fired_complete (queue_wellFormed (signal := .cancel host) withdrawn trivial) (kept.signal (fun _ same => by simp at same)
      (fun _ _ _ same => by simp at same) (fun _ _ _ _ _ same => by simp at same) fun _ _ same => by simp at same) leave
      writes .outward
  reopenComplete _ item detail leave writes formed member := by
    obtain ⟨closed, fired⟩ := Laws.State.closeItem_fired formed member
    obtain ⟨reopened, kept⟩ := Laws.State.openSubscription_fired closed fired (.timer detail) item.element fired.1
      (fired_hangs formed member) item.passive (Laws.State.triggers_await.1 detail)
    exact fired_complete reopened kept leave writes .outward
  occur _ _ _ _ _ formed _ := queue_wellFormed formed trivial
  insideBegin _ item element locals formed member start := by
    obtain ⟨closed, fired⟩ := Laws.State.closeItem_fired formed member
    obtain ⟨withdrawn, kept⟩ := Laws.State.withdrawInside_fired closed fired item.scope
    exact fired_begin withdrawn kept start element locals
  closeBegin _ _ element locals formed member start :=
    have ⟨closed, fired⟩ := Laws.State.closeItem_fired formed member
    fired_begin closed fired start element locals
  reopenBegin _ item detail element locals formed member start := by
    obtain ⟨closed, fired⟩ := Laws.State.closeItem_fired formed member
    obtain ⟨reopened, kept⟩ := Laws.State.openSubscription_fired closed fired (.timer detail) item.element fired.1
      (fired_hangs formed member) item.passive (Laws.State.triggers_await.1 detail)
    exact fired_begin reopened kept start element locals
  bareBegin _ item _ _ formed member := bareBegin_wellFormed formed rfl (formed.owned.itemScopes item member)

/-- Disarming a host keeps the completion pipeline's frame and leaves nothing attached to the host. -/
theorem disarm_frame (state : State) (host : Nat) : Laws.Step.PipelineFrame state (state.disarm host) ∧
    ∀ item ∈ (state.disarm host).openItems, item.attachedTo ≠ some host := by
  rw [Laws.State.disarm_eq]
  refine ⟨⟨rfl, fun found member begun => ?_, fun item member => (List.mem_filter.mp member).1⟩,
    fun item member => by simpa using (List.mem_filter.mp member).2⟩
  exact List.mem_filter.mpr ⟨member, by simp [begun]⟩

/-- The host facts an arming's premises give, as Subscriptions states them. -/
theorem hosted_of {state : State} {host : Nat} {scope : ScopeOccurrenceId} (stands : Laws.Step.OccurrenceStands state host)
    (placed : Laws.Step.ScopeStands state scope)
    (hosted : ∀ occurrence ∈ state.occurrences, occurrence.id = host → occurrence.begun = true ∧ occurrence.scope = scope) :
    Laws.Subscriptions.Hosted scope (some host) state := by
  obtain ⟨occurrence, member, named⟩ := stands
  refine ⟨placed, fun id same => ?_⟩
  cases same
  exact ⟨occurrence, member, named, hosted occurrence member named⟩

/-- The compensation hooks' operations record (`Laws.Compensation.CompensationOps`) of `WellFormed`. -/
theorem compensationOps : Laws.Compensation.CompensationOps (Laws.State.WellFormed program) where
  store _ _ formed runs := Laws.State.compensation_wellFormed formed runs
  issue _ formed := Laws.State.issue_wellFormed formed
  issued state := by rw [Laws.State.issue_eq]; exact ⟨rfl, rfl, rfl, rfl⟩
  fail _ _ formed := queue_wellFormed formed (by simp [Queueable])

/-- The compensation runs' operations record (`Laws.Compensation.RunsOps`) of `WellFormed`. -/
theorem runsOps : Laws.Compensation.RunsOps (Laws.State.WellFormed program) Laws.State.Settled where
  fits _ run formed member :=
    ⟨formed.settled.resumed run member, (formed.settled.runsPlaced run member).1, (formed.settled.runsPlaced run member).2⟩
  issued _ formed := formed.issued.scopes
  store _ _ formed kept := ⟨Laws.State.slots_wellFormed formed ⟨formed.settled.parked, formed.settled.bodies,
    fun run member => (kept run member).elim (formed.settled.resumed run) (·.1), formed.settled.queued,
    formed.settled.placed, fun run member => (kept run member).elim (formed.settled.runsPlaced run) (·.2),
    formed.settled.grouped, formed.settled.raised⟩, fun _ settled => settled⟩
  enter _ element parent locals formed stands := ⟨Laws.State.enterScope_wellFormed formed element stands locals
    (fun _ same => by cases same), fun _ settled => settled.enter element parent locals none⟩
  entered _ _ _ _ := by rw [Laws.State.enterScope_eq]; exact ⟨rfl, rfl, rfl, rfl⟩
  signalled _ _ := by rw [Laws.State.signal_eq]; exact ⟨rfl, rfl, rfl⟩
  cancel _ _ formed := ⟨queue_wellFormed formed trivial, fun _ settled => settled.signal fun _ same => by simp at same⟩
  complete _ _ leave writes rule formed settled := ⟨settled_wellFormed formed settled leave writes rule,
    fun _ settled => settled.signal fun _ same => by simp at same⟩
  occur _ _ _ _ _ _ formed := ⟨queue_wellFormed formed trivial, fun _ settled => settled.signal fun _ same => by simp at same⟩
  begin _ _ _ _ formed stands := ⟨bareBegin_wellFormed formed (by simp [Laws.State.names]) stands,
    fun _ settled => settled.begin (by simp [Laws.State.names])⟩
  leave _ _ _ formed member link := by
    obtain ⟨left, standing, frame⟩ := Laws.State.leaveChild_wellFormed formed member link
    exact ⟨left, standing, frame.nextIssue, fun _ kept => frame.scopesSublist.subset kept, fun _ settled =>
      settled.transport (Nat.le_of_eq frame.nextIssue.symm) (fun _ present _ => .inl (frame.occurrencesSublist.subset present))
        fun _ queued => queued.shrink (by rw [frame.signals]; exact .refl _) frame.tokensSublist⟩

/-- A completion's retained record keeps the completion pipeline's frame. -/
theorem retained_frame {state after : State} (scopes : after.scopes = state.scopes)
    (occurrences : after.occurrences = state.occurrences) (items : after.openItems = state.openItems) :
    Laws.Step.PipelineFrame state after :=
  ⟨scopes, fun _ member _ => occurrences ▸ member, fun _ member => items ▸ member⟩

/-- `HookContract.delivered` of the registered hooks: the item a delivery fires is open. -/
theorem registered_delivered : ∀ ctx data state item fired,
    Registry.hooks.delivered ctx data state = .ok (item, fired) → item ∈ state.openItems := by
  intro _ _ _ _ _ ran
  rw [Laws.Registry.hooks_delivered] at ran
  rcases Laws.Subscriptions.delivered_found ran with found | found
  · exact Laws.Hooks.item?_mem found
  · exact Laws.Hooks.item?_mem found

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

The registered hooks keep any invariant every feature's operations record is filled for, one field per hook from its
feature's lemma, which is generic in the invariant (`registered_contract`); the records of `WellFormed` are filled
above, so `Laws.Step.HookContract Registry.hooks Laws.State.WellFormed` is proved, and the lane's statements follow from
the contract and `phases`. The cancellation lane fills the records of properties carried beside `WellFormed`
(`Kernel.Proofs.Cancellation.Registered`). -/

/-- The operations records of every feature the registered hooks run, of one invariant. -/
structure RegisteredOps (inv : Program → State → Prop) : Prop where
  operations : Laws.Step.Operations inv
  work : ∀ program, Laws.Work.WorkOps program (inv program)
  flow : ∀ program, Laws.Flow.FlowOps (inv program)
  join : ∀ program, Laws.Flow.JoinOps (inv program) Laws.State.Settled
  multiInstance : ∀ program, Laws.MultiInstance.MultiInstanceOps (inv program) Laws.State.Settled
  starts : ∀ program, Laws.Starts.StartsOps (inv program)
  scopes : ∀ program, Laws.Scopes.ScopesOps (inv program)
  subscriptions : ∀ program, Laws.Subscriptions.SubscriptionsOps program (inv program)
  compensation : ∀ program, Laws.Compensation.CompensationOps (inv program)
  propagation : ∀ program, Laws.Propagation.PropagationOps program (inv program)
  runs : ∀ program, Laws.Compensation.RunsOps (inv program) Laws.State.Settled

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

/-- What a variable write changes, it changes alone, so a raise's search reads the same. -/
theorem steady_of_same {before after : State} (same : Laws.State.SameButVariables before after) :
    Laws.Propagation.Steady before after :=
  ⟨same.occurrences, same.scopes, Nat.le_of_eq same.nextIssue.symm, fun _ named => by
    unfold Laws.State.Queued at named ⊢
    rwa [same.signals, same.tokens] at named⟩

/-- The hooks the registered raise's search takes keep `inv` and what the search reads
(`Laws.Propagation.SearchHooks`): Data's writes change only variables, Work's Error-path leave then completes its
settled host, and Compensation's drop changes only the runs. -/
theorem registeredSearch (ops : RegisteredOps inv) (facts : Laws.Step.StateFacts) (ctx : Ctx)
    {propagation : Feature.Propagation.PropagationHooks}
    (mapped : propagation.mappedErrorOutputs = Feature.Work.mappedErrorOutputs Feature.Data.writeOutputs)
    (caught : ∀ ctx scope writes,
      propagation.writeCaught ctx scope writes = Feature.Data.writeOutputs ctx scope writes .outward)
    (call : ∀ ctx root state, propagation.callOutputs ctx root state = do
      let (scope, writes) ← Feature.Work.Call.raisedOutputs ctx root state
      Feature.Data.writeOutputs ctx scope writes .outward state)
    (drop : propagation.dropRuns = Feature.Compensation.dropWithin) :
    Laws.Propagation.SearchHooks ctx (inv ctx.program) propagation :=
  have outward : ∀ scope writes state after, inv ctx.program state →
      Feature.Data.writeOutputs ctx scope writes .outward state = .ok after →
      inv ctx.program after ∧ Laws.Propagation.Steady state after := fun _ _ state _ holds ran =>
    ⟨(Laws.Data.writeOutputs_keeps (dataOps ops.operations facts ctx.program) holds (fun same => by cases same) ran).1,
      Laws.Data.writeOutputs_induction (Laws.Propagation.Steady state)
        (fun _ _ _ _ steady => steady.trans (steady_of_same (Laws.State.setVariable_same _ _ _ _))) (.refl _) ran⟩
  { mappedErrorOutputs := fun origin _ state _ holds settled ran => by
      rw [mapped] at ran
      refine Laws.Work.mappedErrorOutputs_keeps (motive := fun s => inv ctx.program s ∧ Laws.Propagation.Steady state s)
        (fun _ _ _ _ ⟨kept, steady⟩ wrote => ?_) (fun _ host named ⟨kept, steady⟩ => ?_) ⟨holds, .refl _⟩ ran
      · obtain ⟨written, more⟩ := outward _ _ _ _ kept wrote
        exact ⟨written, steady.trans more⟩
      · refine ⟨(ops.join _).complete _ _ _ _ _ kept ((settled.steady steady) host named), steady.trans ?_⟩
        rw [Laws.State.signal_eq]
        exact ⟨rfl, rfl, Nat.le_refl _, fun request named => named.elim (fun named =>
          .inl ((List.mem_append.mp named).resolve_right (by simp))) .inr⟩
    writeCaught := fun _ _ _ _ holds ran => outward _ _ _ _ holds (caught _ _ _ ▸ ran)
    callOutputs := fun _ _ _ holds ran => by
      rw [call] at ran
      obtain ⟨⟨scope, writes⟩, _, ran⟩ := Laws.Step.bind_ok ran
      exact outward _ _ _ _ holds ran
    dropRuns := fun scope _ holds => by
      rw [drop]
      obtain ⟨kept, _, same⟩ := Laws.Compensation.dropWithin_keeps (ops.compensation _) ctx scope holds
      refine ⟨kept, ?_⟩
      rw [same]
      exact ⟨rfl, rfl, Nat.le_refl _, fun _ queued => queued⟩ }

/-- The registered hooks keep any invariant every feature's record is filled for, given its `raise` field. -/
theorem registered_contract {inv : Program → State → Prop} (ops : RegisteredOps inv) (facts : Laws.Step.StateFacts) :
    Laws.Step.HookContract Registry.hooks inv where
  arriveStart _ _ _ _ _ _ _ holds member begun ran := by
    rw [Laws.Registry.hooks_arriveStart] at ran
    exact Laws.Starts.arriveStart_keeps (ops.starts _) holds member begun ran
  arriveActivity _ _ _ _ _ _ holds member begun unstarted ran := by
    rw [Laws.Registry.hooks_arriveActivity] at ran
    exact Laws.Work.arriveActivity_keeps (ops.work _) holds member begun unstarted ran
  arriveMultiInstance _ _ _ _ _ _ _ holds member begun ran := by
    rw [Laws.Registry.hooks_arriveMultiInstance] at ran
    exact Laws.MultiInstance.arriveMultiInstance_keeps (ops.multiInstance _) holds member begun ran
  arriveScope _ _ _ _ _ _ _ holds member begun ready ran := by
    rw [Laws.Registry.hooks_arriveScope] at ran
    exact Laws.Scopes.arriveScope_keeps (ops.scopes _) holds member begun ready ran
  arriveGateway _ _ _ _ _ _ holds member begun ran := by
    rw [Laws.Registry.hooks_arriveGateway] at ran
    exact Laws.Flow.arriveGateway_keeps (ops.join _) holds member begun ran
  arriveCatch _ _ _ _ _ _ _ holds member begun unstarted ran := by
    rw [Laws.Registry.hooks_arriveCatch] at ran
    exact Laws.Subscriptions.arriveCatch_keeps (ops.subscriptions _) holds member begun unstarted ran
  arriveThrow _ _ _ _ _ _ _ holds member begun unstarted named ran := by
    rw [Laws.Registry.hooks_arriveThrow] at ran
    exact Laws.Propagation.arriveThrow_keeps (ops.propagation _) holds member begun unstarted named ran
  arriveLink _ _ _ _ _ _ holds member begun ran := by
    rw [Laws.Registry.hooks_arriveLink] at ran
    exact Laws.Flow.arriveLink_keeps (ops.flow _) holds member begun ran
  completeScope _ _ _ _ _ _ _ holds member owned link ran := by
    rw [Laws.Registry.hooks_completeScope] at ran
    exact Laws.Scopes.completeScope_keeps (ops.scopes _) holds member owned link ran
  completeCall _ _ _ _ _ _ _ holds member owned link ran := by
    rw [Laws.Registry.hooks_completeCall] at ran
    exact Laws.Work.completeCall_keeps (ops.work _) holds member owned link ran
  completeBody _ _ _ _ _ _ _ holds _ ran := by
    rw [Laws.Registry.hooks_completeBody] at ran
    exact Laws.MultiInstance.completeBody_keeps (ops.multiInstance _) holds ran
  completeUserTask _ _ _ _ _ _ _ holds member activity ran := by
    rw [Laws.Registry.hooks_completeUserTask] at ran
    exact Laws.Work.completeUserTask_keeps (ops.work _) holds member activity ran
  effectResult _ _ _ _ _ holds member effect ran := by
    rw [Laws.Registry.hooks_effectResult] at ran
    exact Laws.Work.effectResult_keeps (ops.work _) holds member effect ran
  retryIncident _ _ _ _ _ _ holds member incident ran := by
    rw [Laws.Registry.hooks_retryIncident] at ran
    exact Laws.Work.retryIncident_keeps (ops.work _) holds member incident ran
  cancelIncidentProcess _ _ _ _ _ holds ran := by
    rw [Laws.Registry.hooks_cancelIncidentProcess] at ran
    exact Laws.Work.cancelIncidentProcess_keeps (ops.work _) holds ran
  triggerActivity _ _ _ _ _ _ _ holds member activity ran := by
    rw [Laws.Registry.hooks_triggerActivity] at ran
    exact Laws.Work.triggerActivity_keeps (ops.work _) holds member activity ran
  trigger _ _ _ _ _ holds member ran := by
    rw [Laws.Registry.hooks_trigger] at ran
    exact Laws.Subscriptions.trigger_keeps (ops.subscriptions _) holds member ran
  arm _ _ _ _ _ _ holds stands placed hosted ran := by
    rw [Laws.Registry.hooks_arm] at ran
    exact Laws.Subscriptions.arm_keeps (ops.subscriptions _) holds (hosted_of stands placed hosted) ran
  armScope _ _ _ _ holds placed ran := by
    rw [Laws.Registry.hooks_armScope] at ran
    exact Laws.Subscriptions.armScope_keeps (ops.subscriptions _) holds placed ran
  armGateway _ _ _ _ _ _ holds stands placed hosted ran := by
    rw [Laws.Registry.hooks_armGateway] at ran
    exact Laws.Subscriptions.armGateway_keeps (ops.subscriptions _) holds (hosted_of stands placed hosted) ran
  raise ctx _ _ _ _ holds raisable settled ran := by
    rw [Laws.Registry.hooks_raise] at ran
    exact Laws.Propagation.raise_keeps (ops.propagation _) (registeredSearch ops facts ctx (by simp only)
      (fun _ _ _ => by simp only) (fun _ _ _ => by simp only) (by simp only)) holds settled (fun event => (raisable event).2.2)
      ran
  compensate _ _ _ _ _ _ _ _ holds stands resumable ran := by
    rw [Laws.Registry.hooks_compensate] at ran
    obtain ⟨entry, inside, named⟩ := stands
    exact Laws.Compensation.compensate_keeps (ops.runs _) holds (List.mem_map.mpr ⟨entry, inside, named⟩) resumable ran
  failCompensation _ _ _ _ _ _ _ holds _ ran := by
    rw [Laws.Registry.hooks_failCompensation] at ran
    exact Laws.Compensation.failCompensation_keeps (ops.compensation _) holds ran
  leave _ occurrence state _ holds _ ran := by
    rw [Laws.Registry.hooks_leave] at ran
    obtain ⟨kept, disarmed⟩ := Laws.Subscriptions.leave_keeps (ops.subscriptions _) holds ran
    subst disarmed
    exact ⟨kept, disarm_frame state occurrence.id⟩
  writeOutputs := registered_writeOutputs ops.operations facts
  removeVariables := registered_removeVariables ops.operations facts
  completed _ _ _ _ holds _ ran := by
    rw [Laws.Registry.hooks_completed] at ran
    obtain ⟨kept, scopes, occurrences, items⟩ := Laws.Compensation.completed_keeps (ops.compensation _) holds ran
    exact ⟨kept, retained_frame scopes occurrences items⟩
  outflow _ _ _ _ _ holds stands ran := by
    rw [Laws.Registry.hooks_outflow] at ran
    exact Laws.Flow.outflow_keeps (ops.flow _) holds stands ran
  instanceCompleted _ _ _ _ _ _ holds stands ran := by
    rw [Laws.Registry.hooks_instanceCompleted] at ran
    obtain ⟨entry, inside, named⟩ := stands
    exact Laws.MultiInstance.instanceCompleted_keeps (ops.multiInstance _) holds (List.mem_map.mpr ⟨entry, inside, named⟩)
      ran
  handlerCompleted _ _ _ _ _ holds stands ran := by
    rw [Laws.Registry.hooks_handlerCompleted] at ran
    obtain ⟨entry, inside, named⟩ := stands
    exact Laws.Compensation.handlerCompleted_keeps (ops.runs _) holds (List.mem_map.mpr ⟨entry, inside, named⟩) ran
  handlerEnded _ _ _ _ _ holds stands ran := by
    rw [Laws.Registry.hooks_handlerEnded] at ran
    obtain ⟨entry, inside, named⟩ := stands
    exact Laws.Compensation.handlerEnded_keeps (ops.runs _) holds (List.mem_map.mpr ⟨entry, inside, named⟩) ran
  cancelled _ _ _ _ holds ran := by
    rw [Laws.Registry.hooks_cancelled] at ran
    cases ran
    exact holds
  written _ _ _ _ holds ran := by
    rw [Laws.Registry.hooks_written] at ran
    exact Laws.Subscriptions.offerWrites_keeps (ops.subscriptions _) holds ran
  delivered := registered_delivered

/-- A committed input keeps the registered hooks' state well-formed. -/
theorem registered_stepKeeps : Proofs.State.StepKeepsWellFormed Registry.hooks :=
  Proofs.State.stepKeepsWellFormed (registered_contract registeredOps_wellFormed Proofs.State.stateFacts) phases

/-- A committed start makes a well-formed state under the registered hooks. -/
theorem registered_startIs : Proofs.State.StartIsWellFormed Registry.hooks :=
  Proofs.State.startIsWellFormed (registered_contract registeredOps_wellFormed Proofs.State.stateFacts) phases
    initial_wellFormed

end Kernel.Proofs.Step
