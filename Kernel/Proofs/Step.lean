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
public import Kernel.Laws.MultiInstance
public import Kernel.Laws.Hooks
public import Kernel.Proofs.State
public import Kernel.Laws.State.Removal
public import Kernel.Laws.State.Enter

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

variable {inv : State → Prop}

/-- Data's operations record (`Laws.Data.StateOps`), from the root's. -/
theorem dataOps (ops : Operations inv) (facts : StateFacts) : Laws.Data.StateOps inv where
  housed := ops.variablesHoused
  rooted := ops.rootStands
  set := ops.setVariable
  remove := ops.removeVariable
  setFrame := facts.setVariable
  removeFrame := facts.removeVariable
  declaring := facts.declaring
  owner := facts.owner
  instanceRoot := facts.instanceRoot

/-- `HookContract.writeOutputs` of the registered hooks. -/
theorem registered_writeOutputs (ops : Operations inv) (facts : StateFacts) :
    ∀ ctx scope writes rule state after, inv state → ScopeStands state scope →
      Registry.hooks.writeOutputs ctx scope writes rule state = .ok after → inv after ∧ PipelineFrame state after := by
  intro ctx scope writes rule state after holds stands ran
  rw [Laws.Registry.hooks_writeOutputs] at ran
  obtain ⟨kept, scopes, occurrences, items⟩ := Laws.Data.writeOutputs_keeps (dataOps ops facts) holds stands ran
  exact ⟨kept, scopes, fun occurrence member _ => occurrences ▸ member, fun item member => items ▸ member⟩

/-- `HookContract.removeVariables` of the registered hooks. -/
theorem registered_removeVariables (ops : Operations inv) (facts : StateFacts) :
    ∀ ctx scope names state after, inv state → ScopeStands state scope →
      Registry.hooks.removeVariables ctx scope names state = .ok after → inv after := by
  intro ctx scope names state after holds _ ran
  rw [Laws.Registry.hooks_removeVariables] at ran
  exact Laws.Data.removeVariables_keeps (dataOps ops facts) holds ran

end Contract

/-! ## The phases that queue a signal

`Laws.State.signal_queueSound` asks which signal a phase queues, which only `Signal`'s owners may tell. -/

/-- A start's fresh instance, with its root's Event Sub-Process starts queued for arming (`Laws.Step.Phases.initial`). -/
theorem initial_wellFormed (instanceId : String) (variables : List (String × Value)) (businessKey : Option String) :
    Laws.State.WellFormed ((State.initial instanceId variables businessKey).signal (.armScope State.root)) :=
  have formed := Laws.State.initial_wellFormed instanceId variables businessKey
  Laws.State.signal_wellFormed formed (Laws.State.signal_queueSound formed (fun _ _ _ same => by simp at same)
    (fun _ same => by cases same; exact Laws.State.initial_rootIssued instanceId variables businessKey)
    (fun _ _ _ same => by simp at same) (fun _ _ same => by simp at same))
    (Laws.State.signal_claimed formed (fun _ same => by simp at same) (fun _ _ _ _ same => by simp at same))
    (Laws.State.signal_settled formed (fun _ same => by simp at same) (fun _ _ _ _ _ _ same => by simp at same))

/-- A variable command queues its write (`Laws.Step.Phases.queueWrite`). -/
theorem queueWrite_wellFormed {state : State} (formed : Laws.State.WellFormed state) (scope : ScopeOccurrenceId)
    (writes : List (String × Value)) (rule : WriteRule) :
    Laws.State.WellFormed (state.signal (.write scope writes rule)) :=
  Laws.State.signal_wellFormed formed (Laws.State.signal_queueSound formed (fun _ _ _ same => by simp at same)
    (fun _ same => by simp at same) (fun _ _ _ same => by simp at same) (fun _ _ same => by simp at same))
    (Laws.State.signal_claimed formed (fun _ same => by simp at same) (fun _ _ _ _ same => by simp at same))
    (Laws.State.signal_settled formed (fun _ same => by simp at same) (fun _ _ _ _ _ _ same => by simp at same))

/-- A variable command queues its removal (`Laws.Step.Phases.queueRemove`). -/
theorem queueRemove_wellFormed {state : State} (formed : Laws.State.WellFormed state) (scope : ScopeOccurrenceId)
    (names : List String) : Laws.State.WellFormed (state.signal (.remove scope names)) :=
  Laws.State.signal_wellFormed formed (Laws.State.signal_queueSound formed (fun _ _ _ same => by simp at same)
    (fun _ same => by simp at same) (fun _ _ _ same => by simp at same) (fun _ _ same => by simp at same))
    (Laws.State.signal_claimed formed (fun _ same => by simp at same) (fun _ _ _ _ same => by simp at same))
    (Laws.State.signal_settled formed (fun _ same => by simp at same) (fun _ _ _ _ _ _ same => by simp at same))

/-- The phases `Step` runs itself keep `Laws.State.WellFormed` (`Laws.Step.Phases`), from what `Laws.State` shows
each state operation keeps. -/
theorem phases : Laws.Step.Phases Laws.State.WellFormed :=
  have mem : ∀ {state : State} {scope : ScopeOccurrenceId}, Laws.Step.ScopeStands state scope →
      scope ∈ Laws.State.scopeIds state := fun ⟨entry, inside, named⟩ => List.mem_map.mpr ⟨entry, inside, named⟩
  { initial := initial_wellFormed
    reset := fun _ formed => Laws.State.reset_wellFormed formed
    clock := fun _ atMs formed => Laws.State.clock_wellFormed formed atMs
    journal := fun _ _ formed started _ => Laws.State.journal_wellFormed formed started
    runOrder := fun _ formed => Laws.State.runOrder_wellFormed formed
    dequeue := fun _ _ formed fewer => Laws.State.dequeue_wellFormed formed fewer
    untoken := fun _ _ formed fewer => Laws.State.untoken_wellFormed formed fewer
    queueWrite := fun _ scope writes rule formed => queueWrite_wellFormed formed scope writes rule
    queueRemove := fun _ scope names formed => queueRemove_wellFormed formed scope names
    armIssued := fun _ host element scope formed queued => formed.queue.arm host element scope queued
    armScopeIssued := fun _ scope formed queued => formed.queue.armScope scope queued
    armGatewayIssued := fun _ occurrence gateway scope formed queued =>
      formed.queue.armGateway occurrence gateway scope queued
    endRecorded := fun _ status failure formed queued => formed.queue.ends status failure queued
    admittedSignal := fun _ _ _ formed head => Laws.State.admitted_signal formed head
    admittedToken := fun _ _ _ formed taken => Laws.State.admitted_token formed taken
    completeQueued := fun _ _ _ _ _ formed completed => Laws.State.complete_unnamed formed completed
    housed := fun _ _ formed member => Laws.State.housed_wellFormed formed member
    parkedBegun := fun _ waiting _ formed parked member named =>
      (formed.settled.parked waiting parked).2.1 _ member named
    endInstance := fun _ _ _ formed recorded => by
      rw [Laws.Step.endInstance_eq]
      exact Laws.State.endInstance_wellFormed formed recorded
    begin := fun _ request role sourceType formed stands admitted =>
      ⟨Laws.State.begin_wellFormed formed request role sourceType (mem stands) admitted.2,
        Laws.State.begin_entry formed request role sourceType admitted.1 admitted.2⟩
    reserve := fun _ element scope formed stands => Laws.State.reserve_wellFormed formed element scope (mem stands)
    startReserved := fun _ _ sourceType formed member unnamed =>
      Laws.State.startReserved_wellFormed formed sourceType member unnamed
    closeOwnItems := fun _ id formed => Laws.State.closeOwnItems_wellFormed formed id
    removeOccurrence := fun _ _ formed member free =>
      ⟨(Laws.State.removeOccurrence_wellFormed formed member free).1,
        List.mem_map.mp (Laws.State.removeOccurrence_wellFormed formed member free).2⟩
    recordEnd := fun _ key terminal formed => Laws.State.recordEnd_wellFormed formed key terminal
    cancel := fun _ id formed => Laws.State.cancel_wellFormed formed id }

/-! ## The registered hooks under `WellFormed`

The fields of `Laws.Step.HookContract Registry.hooks Laws.State.WellFormed` proved so far, each from its feature's lemma
and the operations record that feature states, filled here from `Laws.State`. -/

/-- A completion, queued, keeps `WellFormed` when no queued begin names what it completes. -/
theorem unnamed_wellFormed {state : State} (formed : Laws.State.WellFormed state) {id : Nat}
    (unnamed : ∀ request, Laws.State.Queued state request → id ∉ Laws.State.names request) (leave : Leave)
    (writes : List (String × Value)) (rule : WriteRule) :
    Laws.State.WellFormed (state.signal (.complete id leave writes rule)) :=
  Laws.State.signal_wellFormed formed (Laws.State.signal_queueSound formed (fun _ _ _ same => by simp at same)
    (fun _ same => by simp at same) (fun _ _ _ same => by simp at same) (fun _ _ same => by simp at same))
    (Laws.State.signal_claimed formed (fun _ same => by simp at same) fun _ _ _ _ same => by
      cases same
      exact unnamed)
    (Laws.State.signal_settled formed (fun _ same => by simp at same) (fun _ _ _ _ _ _ same => by simp at same))

/-- A begun occurrence's completion, queued, keeps `WellFormed`: no queued begin names a begun occurrence. -/
theorem complete_wellFormed {state : State} (formed : Laws.State.WellFormed state) {occurrence : Occurrence}
    (member : occurrence ∈ state.occurrences) (begun : occurrence.begun = true) (leave : Leave)
    (writes : List (String × Value)) (rule : WriteRule) :
    Laws.State.WellFormed (state.signal (.complete occurrence.id leave writes rule)) :=
  unnamed_wellFormed formed (Laws.State.begun_unnamed formed member begun) leave writes rule

/-- A begun occurrence's arming, queued in its own scope occurrence, keeps `WellFormed`. -/
theorem queueArm_wellFormed {state : State} (formed : Laws.State.WellFormed state) {occurrence : Occurrence}
    (member : occurrence ∈ state.occurrences) (begun : occurrence.begun = true) (element : ElementId) :
    Laws.State.WellFormed (state.signal (.arm occurrence.id element occurrence.scope)) :=
  have scopeBelow : occurrence.scope.value < state.nextIssue := by
    obtain ⟨entry, inside, named⟩ := List.mem_map.mp (formed.owned.occurrenceScopes occurrence member)
    exact named ▸ formed.issued.scopes entry inside
  Laws.State.signal_wellFormed formed (Laws.State.signal_queueSound formed (fun _ _ _ same => by
      cases same
      exact ⟨formed.issued.occurrences occurrence member, scopeBelow, fun found inside named => by
        rw [Laws.State.nodup_map_eq formed.distinct.occurrences inside member named]
        exact ⟨begun, rfl⟩⟩)
    (fun _ same => by simp at same) (fun _ _ _ same => by simp at same) (fun _ _ same => by simp at same))
    (Laws.State.signal_claimed formed (fun _ same => by simp at same) (fun _ _ _ _ same => by simp at same))
    (Laws.State.signal_settled formed (fun _ same => by simp at same) (fun _ _ _ _ _ _ same => by simp at same))

/-- The arming of a standing scope occurrence's Event Sub-Processes, queued, keeps `WellFormed`. -/
theorem armScope_wellFormed {state : State} (formed : Laws.State.WellFormed state) {scope : ScopeOccurrenceId}
    (stands : ∃ entry ∈ state.scopes, entry.id = scope) : Laws.State.WellFormed (state.signal (.armScope scope)) :=
  Laws.State.signal_wellFormed formed (Laws.State.signal_queueSound formed (fun _ _ _ same => by simp at same)
    (fun _ same => by
      cases same
      obtain ⟨entry, inside, named⟩ := stands
      exact named ▸ formed.issued.scopes entry inside)
    (fun _ _ _ same => by simp at same) (fun _ _ same => by simp at same))
    (Laws.State.signal_claimed formed (fun _ same => by simp at same) (fun _ _ _ _ same => by simp at same))
    (Laws.State.signal_settled formed (fun _ same => by simp at same) (fun _ _ _ _ _ _ same => by simp at same))

/-- A begin naming no reservation, queued in a scope occurrence that stands, keeps `WellFormed`. -/
theorem bareBegin_wellFormed {state : State} (formed : Laws.State.WellFormed state) {request : BeginRequest}
    (bare : Laws.State.names request = []) (stands : request.scope ∈ Laws.State.scopeIds state) :
    Laws.State.WellFormed (state.signal (.begin request)) :=
  Laws.State.signal_wellFormed formed (Laws.State.signal_queueSound formed (fun _ _ _ same => by simp at same)
    (fun _ same => by simp at same) (fun _ _ _ same => by simp at same) (fun _ _ same => by simp at same))
    (Laws.State.signal_claimed_begin formed bare stands fun _ _ _ _ same => by simp at same)
    (Laws.State.signal_settled_begin formed bare fun _ _ _ _ _ _ same => by simp at same)

/-- Holding an occurrence keeps `WellFormed`: no clause reads the held occurrences. -/
theorem hold_wellFormed {state : State} (formed : Laws.State.WellFormed state) (held : Held) :
    Laws.State.WellFormed (state.hold held) := by
  rw [Laws.Hooks.hold_eq]
  exact Laws.State.slots_wellFormed formed
    ⟨formed.settled.parked, formed.settled.bodies, formed.settled.resumed, formed.settled.queued, formed.settled.placed⟩

/-- The scope occurrence an occurrence runs in stands. -/
theorem housed_of {state : State} (formed : Laws.State.WellFormed state) {occurrence : Occurrence}
    (member : occurrence ∈ state.occurrences) : ∃ entry ∈ state.scopes, entry.id = occurrence.scope :=
  List.mem_map.mp (formed.owned.occurrenceScopes occurrence member)

/-- The occurrence that owns a scope occurrence is begun. -/
theorem owner_begun {state : State} (formed : Laws.State.WellFormed state) {scope : ScopeOccurrence}
    {occurrence : Occurrence} (member : scope ∈ state.scopes) (owned : occurrence ∈ state.occurrences)
    (link : scope.occurrence = some occurrence.id) : occurrence.begun = true := by
  obtain ⟨found, inside, named, begunFlag⟩ := formed.owned.scopeOwners scope member _ link
  rw [Laws.State.nodup_map_eq formed.distinct.occurrences inside owned named] at begunFlag
  exact begunFlag

/-- Work's operations record (`Laws.Work.WorkOps`) of `WellFormed`. -/
theorem workOps : Laws.Work.WorkOps Laws.State.WellFormed where
  write _ scope writes rule formed := queueWrite_wellFormed formed scope writes rule
  complete _ _ leave writes rule formed member :=
    unnamed_wellFormed formed (Laws.State.waited_unnamed formed member) leave writes rule
  completeOwner _ _ _ leave writes rule formed member owned link :=
    complete_wellFormed formed owned (owner_begun formed member owned link) leave writes rule
  raise _ _ _ formed := Laws.State.signal_wellFormed formed (Laws.State.signal_queueSound formed
      (fun _ _ _ same => by simp at same) (fun _ same => by simp at same) (fun _ _ _ same => by simp at same)
      (fun _ _ same => by simp at same))
    (Laws.State.signal_claimed formed (fun _ same => by simp at same) (fun _ _ _ _ same => by simp at same))
    (Laws.State.signal_settled formed (fun _ same => by simp at same) (fun _ _ _ _ _ _ same => by simp at same))
  cancel _ formed := Laws.State.signal_wellFormed formed (Laws.State.signal_queueSound formed
      (fun _ _ _ same => by simp at same) (fun _ same => by simp at same) (fun _ _ _ same => by simp at same)
      (fun _ _ same => by cases same; simp))
    (Laws.State.signal_claimed formed (fun _ same => by simp at same) (fun _ _ _ _ same => by simp at same))
    (Laws.State.signal_settled formed (fun _ same => by simp at same) (fun _ _ _ _ _ _ same => by simp at same))
  rekind _ _ formed kept := Laws.State.rekind_wellFormed formed kept
  queued state signal := by rw [Laws.State.signal_eq]
  kept _ _ := ⟨by rw [Laws.State.signal_eq], by rw [Laws.State.signal_eq]⟩
  completeBegun _ _ leave writes rule formed member begun := complete_wellFormed formed member begun leave writes rule
  housed _ _ formed member := housed_of formed member
  hold _ held formed := hold_wellFormed formed held
  enter _ element locals occurrence formed member begun :=
    ⟨Laws.State.enterScope_wellFormed formed element (formed.owned.occurrenceScopes occurrence member) locals
      fun _ named => ⟨occurrence, member, Option.some.inj named, begun, rfl⟩, by rw [Laws.State.enterScope_eq]⟩
  openItem _ kind _ formed member begun :=
    ⟨Laws.State.openItem_wellFormed formed kind member begun, by rw [Laws.State.openItem_eq]⟩
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
theorem flowOps : Laws.Flow.FlowOps Laws.State.WellFormed where
  emit _ flows _ formed stands := by
    obtain ⟨entry, inside, named⟩ := stands
    exact Laws.State.emit_wellFormed formed flows (List.mem_map.mpr ⟨entry, inside, named⟩)
  complete _ _ leave writes rule formed member begun := complete_wellFormed formed member begun leave writes rule

/-- Flow's join operations record (`Laws.Flow.JoinOps`) of `WellFormed`, what a join completes having settled. -/
theorem joinOps : Laws.Flow.JoinOps Laws.State.WellFormed Laws.State.Settled where
  park state waiting formed waits := by
    obtain ⟨occurrence, member, named, begun⟩ := waits
    refine Laws.State.slots_wellFormed formed ⟨fun found inside => ?_, formed.settled.bodies, formed.settled.resumed,
      formed.settled.queued, formed.settled.placed⟩
    rcases List.mem_append.mp inside with old | new
    · exact formed.settled.parked found old
    · rw [List.mem_singleton.mp new, ← named]
      exact Laws.State.begun_settled formed member begun
  unpark _ _ formed := Laws.State.slots_wellFormed formed ⟨fun found inside =>
    formed.settled.parked found (List.mem_filter.mp inside).1, formed.settled.bodies, formed.settled.resumed,
    formed.settled.queued, formed.settled.placed⟩
  parked _ waiting formed member := formed.settled.parked waiting member
  begun _ _ formed member begun := Laws.State.begun_settled formed member begun
  reparked _ _ _ settled := settled
  complete _ _ leave writes rule formed settled := unnamed_wellFormed formed settled.2.2 leave writes rule
  completed _ _ _ _ _ _ settled := settled.signal fun _ same => by simp at same
  armGateway state occurrence gateway formed member begun :=
    Laws.State.signal_wellFormed formed (Laws.State.signal_queueSound formed (fun _ _ _ same => by simp at same)
      (fun _ same => by simp at same)
      (fun _ _ _ same => by
        cases same
        obtain ⟨entry, inside, named⟩ := List.mem_map.mp (formed.owned.occurrenceScopes occurrence member)
        refine ⟨formed.issued.occurrences occurrence member, named ▸ formed.issued.scopes entry inside,
          fun found present same => ?_⟩
        rw [Laws.State.nodup_map_eq formed.distinct.occurrences present member same]
        exact ⟨begun, rfl⟩)
      (fun _ _ same => by simp at same))
    (Laws.State.signal_claimed formed (fun _ same => by simp at same) (fun _ _ _ _ same => by simp at same))
    (Laws.State.signal_settled formed (fun _ same => by simp at same) (fun _ _ _ _ _ _ same => by simp at same))

/-- The Multi-Instance operations record (`Laws.MultiInstance.MultiInstanceOps`) of `WellFormed`. -/
theorem multiInstanceOps : Laws.MultiInstance.MultiInstanceOps Laws.State.WellFormed Laws.State.Settled where
  bodies _ run formed member := formed.settled.bodies run member
  placed _ run formed member := formed.settled.placed run member
  complete _ _ leave writes rule formed settled := unnamed_wellFormed formed settled.2.2 leave writes rule
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
    formed.settled.queued, fun run member => (kept run member).elim (formed.settled.placed run) (·.2)⟩,
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
theorem startsOps : Laws.Starts.StartsOps Laws.State.WellFormed where
  clock _ atMs formed := Laws.State.clock_wellFormed formed atMs
  complete _ _ leave writes rule formed member begun := complete_wellFormed formed member begun leave writes rule

/-- Scopes' operations record (`Laws.Scopes.ScopesOps`) of `WellFormed`. -/
theorem scopesOps : Laws.Scopes.ScopesOps Laws.State.WellFormed where
  owner _ _ _ formed member owned link := owner_begun formed member owned link
  complete _ _ leave writes rule formed member begun := complete_wellFormed formed member begun leave writes rule

/-- `HookContract.outflow` of the registered hooks. -/
theorem registered_outflow : ∀ ctx occurrence leave state after, Laws.State.WellFormed state →
    Laws.Step.ScopeStands state occurrence.scope → Registry.hooks.outflow ctx occurrence leave state = .ok after →
    Laws.State.WellFormed after := by
  intro _ _ _ _ _ formed stands ran
  rw [Laws.Registry.hooks_outflow] at ran
  exact Laws.Flow.outflow_keeps flowOps formed stands ran

/-- `HookContract.arriveLink` of the registered hooks. -/
theorem registered_arriveLink : ∀ ctx header payload occurrence state after, Laws.State.WellFormed state →
    occurrence ∈ state.occurrences → occurrence.begun = true →
    Registry.hooks.arriveLink ctx header payload occurrence state = .ok after → Laws.State.WellFormed after := by
  intro _ _ _ _ _ _ formed member begun ran
  rw [Laws.Registry.hooks_arriveLink] at ran
  exact Laws.Flow.arriveLink_keeps flowOps formed member begun ran

/-- `HookContract.arriveStart` of the registered hooks. -/
theorem registered_arriveStart : ∀ ctx header payload trigger occurrence state after, Laws.State.WellFormed state →
    occurrence ∈ state.occurrences → occurrence.begun = true →
    Registry.hooks.arriveStart ctx header payload trigger occurrence state = .ok after → Laws.State.WellFormed after := by
  intro _ _ _ _ _ _ _ formed member begun ran
  rw [Laws.Registry.hooks_arriveStart] at ran
  exact Laws.Starts.arriveStart_keeps startsOps formed member begun ran

/-- `HookContract.completeScope` of the registered hooks. -/
theorem registered_completeScope : ∀ ctx header payload scope occurrence state after, Laws.State.WellFormed state →
    scope ∈ state.scopes → occurrence ∈ state.occurrences → scope.occurrence = some occurrence.id →
    Registry.hooks.completeScope ctx header payload scope occurrence state = .ok after → Laws.State.WellFormed after := by
  intro _ _ _ _ _ _ _ formed member owned link ran
  rw [Laws.Registry.hooks_completeScope] at ran
  exact Laws.Scopes.completeScope_keeps scopesOps formed member owned link ran

/-- The subscription hooks' operations record (`Laws.Subscriptions.SubscriptionsOps`) of `WellFormed`. -/
theorem subscriptionsOps : Laws.Subscriptions.SubscriptionsOps Laws.State.WellFormed where
  fire _ _ _ formed := Laws.State.signal_wellFormed formed (Laws.State.signal_queueSound formed
      (fun _ _ _ same => by simp at same) (fun _ same => by simp at same) (fun _ _ _ same => by simp at same)
      (fun _ _ same => by simp at same))
    (Laws.State.signal_claimed formed (fun _ same => by simp at same) (fun _ _ _ _ same => by simp at same))
    (Laws.State.signal_settled formed (fun _ same => by simp at same) (fun _ _ _ _ _ _ same => by simp at same))
  rekind _ _ formed kept := Laws.State.rekind_wellFormed formed kept
  disarm _ host formed := Laws.State.disarm_wellFormed formed host
  openItem _ kind _ formed member begun := Laws.State.openItem_wellFormed formed kind member begun
  openSubscription _ kind element _ _ passive formed stands hangs := by
    obtain ⟨entry, inside, named⟩ := stands
    exact Laws.State.openSubscription_wellFormed formed kind element (List.mem_map.mpr ⟨entry, inside, named⟩) hangs passive
  subscribed state kind element scope host passive formed := by
    have reserves := Laws.State.reserve_reserves formed.activations element scope
    rw [Laws.State.openSubscription_eq]
    exact ⟨reserves.scopes, fun occurrence member => by
      rw [reserves.occurrences]
      exact List.mem_append_left _ member⟩

/-- Disarming a host keeps the completion pipeline's frame and leaves nothing attached to the host. -/
theorem disarm_frame (state : State) (host : Nat) : Laws.Step.PipelineFrame state (state.disarm host) ∧
    ∀ item ∈ (state.disarm host).openItems, item.attachedTo ≠ some host := by
  rw [Laws.State.disarm_eq]
  refine ⟨⟨rfl, fun found member begun => ?_, fun item member => (List.mem_filter.mp member).1⟩,
    fun item member => by simpa using (List.mem_filter.mp member).2⟩
  exact List.mem_filter.mpr ⟨member, by simp [begun]⟩

/-- `HookContract.leave` of the registered hooks: the completing occurrence's disarming keeps the begun occurrences and
leaves nothing attached to it. -/
theorem registered_leave : ∀ ctx occurrence state after, Laws.State.WellFormed state → occurrence ∈ state.occurrences →
    Registry.hooks.leave ctx occurrence state = .ok after →
    Laws.State.WellFormed after ∧ Laws.Step.PipelineFrame state after ∧
      ∀ item ∈ after.openItems, item.attachedTo ≠ some occurrence.id := by
  intro _ occurrence state _ formed _ ran
  rw [Laws.Registry.hooks_leave] at ran
  obtain ⟨kept, disarmed⟩ := Laws.Subscriptions.leave_keeps subscriptionsOps formed ran
  subst disarmed
  exact ⟨kept, disarm_frame state occurrence.id⟩

/-- `HookContract.arriveCatch` of the registered hooks. -/
theorem registered_arriveCatch : ∀ ctx header payload subscription occurrence state after, Laws.State.WellFormed state →
    occurrence ∈ state.occurrences → occurrence.begun = true →
    Registry.hooks.arriveCatch ctx header payload subscription occurrence state = .ok after →
    Laws.State.WellFormed after := by
  intro _ _ _ _ _ _ _ formed member begun ran
  rw [Laws.Registry.hooks_arriveCatch] at ran
  exact Laws.Subscriptions.arriveCatch_keeps subscriptionsOps formed member begun ran

/-- The host facts an arming's premises give, as Subscriptions states them. -/
theorem hosted_of {state : State} {host : Nat} {scope : ScopeOccurrenceId} (stands : Laws.Step.OccurrenceStands state host)
    (placed : Laws.Step.ScopeStands state scope)
    (hosted : ∀ occurrence ∈ state.occurrences, occurrence.id = host → occurrence.begun = true ∧ occurrence.scope = scope) :
    Laws.Subscriptions.Hosted scope (some host) state := by
  obtain ⟨occurrence, member, named⟩ := stands
  refine ⟨placed, fun id same => ?_⟩
  cases same
  exact ⟨occurrence, member, named, hosted occurrence member named⟩

/-- `HookContract.arm` of the registered hooks. -/
theorem registered_arm : ∀ ctx host element scope state after, Laws.State.WellFormed state →
    Laws.Step.OccurrenceStands state host → Laws.Step.ScopeStands state scope →
    (∀ occurrence ∈ state.occurrences, occurrence.id = host → occurrence.begun = true ∧ occurrence.scope = scope) →
    Registry.hooks.arm ctx host element scope state = .ok after → Laws.State.WellFormed after := by
  intro _ _ _ _ _ _ formed stands placed hosted ran
  rw [Laws.Registry.hooks_arm] at ran
  exact Laws.Subscriptions.arm_keeps subscriptionsOps formed (hosted_of stands placed hosted) ran

/-- `HookContract.armScope` of the registered hooks. -/
theorem registered_armScope : ∀ ctx scope state after, Laws.State.WellFormed state → Laws.Step.ScopeStands state scope →
    Registry.hooks.armScope ctx scope state = .ok after → Laws.State.WellFormed after := by
  intro _ _ _ _ formed placed ran
  rw [Laws.Registry.hooks_armScope] at ran
  exact Laws.Subscriptions.armScope_keeps subscriptionsOps formed placed ran

/-- `HookContract.armGateway` of the registered hooks. -/
theorem registered_armGateway : ∀ ctx occurrence gateway scope state after, Laws.State.WellFormed state →
    Laws.Step.OccurrenceStands state occurrence → Laws.Step.ScopeStands state scope →
    (∀ found ∈ state.occurrences, found.id = occurrence → found.begun = true ∧ found.scope = scope) →
    Registry.hooks.armGateway ctx occurrence gateway scope state = .ok after → Laws.State.WellFormed after := by
  intro _ _ _ _ _ _ formed stands placed hosted ran
  rw [Laws.Registry.hooks_armGateway] at ran
  exact Laws.Subscriptions.armGateway_keeps subscriptionsOps formed (hosted_of stands placed hosted) ran

/-- `HookContract.written` of the registered hooks. -/
theorem registered_written : ∀ ctx writes state after, Laws.State.WellFormed state →
    Registry.hooks.written ctx writes state = .ok after → Laws.State.WellFormed after := by
  intro _ _ _ _ formed ran
  rw [Laws.Registry.hooks_written] at ran
  exact Laws.Subscriptions.offerWrites_keeps subscriptionsOps formed ran

/-- The compensation hooks' operations record (`Laws.Compensation.CompensationOps`) of `WellFormed`. -/
theorem compensationOps : Laws.Compensation.CompensationOps Laws.State.WellFormed where
  store _ _ formed runs := Laws.State.compensation_wellFormed formed runs
  issue _ formed := Laws.State.issue_wellFormed formed
  issued state := by rw [Laws.State.issue_eq]; exact ⟨rfl, rfl, rfl, rfl⟩
  fail _ _ formed := Laws.State.signal_wellFormed formed (Laws.State.signal_queueSound formed
      (fun _ _ _ same => by simp at same) (fun _ same => by simp at same) (fun _ _ _ same => by simp at same)
      (fun _ _ same => by cases same; simp))
    (Laws.State.signal_claimed formed (fun _ same => by simp at same) (fun _ _ _ _ same => by simp at same))
    (Laws.State.signal_settled formed (fun _ same => by simp at same) (fun _ _ _ _ _ _ same => by simp at same))

/-- A completion's retained record keeps the completion pipeline's frame. -/
theorem retained_frame {state after : State} (scopes : after.scopes = state.scopes)
    (occurrences : after.occurrences = state.occurrences) (items : after.openItems = state.openItems) :
    Laws.Step.PipelineFrame state after :=
  ⟨scopes, fun _ member _ => occurrences ▸ member, fun _ member => items ▸ member⟩

/-- `HookContract.completed` of the registered hooks. -/
theorem registered_completed : ∀ ctx occurrence state after, Laws.State.WellFormed state →
    occurrence ∈ state.occurrences → Registry.hooks.completed ctx occurrence state = .ok after →
    Laws.State.WellFormed after ∧ Laws.Step.PipelineFrame state after := by
  intro _ _ _ _ formed _ ran
  rw [Laws.Registry.hooks_completed] at ran
  obtain ⟨kept, scopes, occurrences, items⟩ := Laws.Compensation.completed_keeps compensationOps formed ran
  exact ⟨kept, retained_frame scopes occurrences items⟩

/-- `HookContract.failCompensation` of the registered hooks. -/
theorem registered_failCompensation : ∀ ctx handler code message origin state after, Laws.State.WellFormed state →
    Laws.Step.ScopeStands state handler →
    Registry.hooks.failCompensation ctx handler code message origin state = .ok after → Laws.State.WellFormed after := by
  intro _ _ _ _ _ _ _ formed _ ran
  rw [Laws.Registry.hooks_failCompensation] at ran
  exact Laws.Compensation.failCompensation_keeps compensationOps formed ran

/-- `HookContract.completeUserTask` of the registered hooks. -/
theorem registered_completeUserTask : ∀ ctx header payload item values state after, Laws.State.WellFormed state →
    item ∈ state.openItems → Registry.hooks.completeUserTask ctx header payload item values state = .ok after →
    Laws.State.WellFormed after := by
  intro _ _ _ _ _ _ _ formed member ran
  rw [Laws.Registry.hooks_completeUserTask] at ran
  exact Laws.Work.completeUserTask_keeps workOps formed member ran

/-- `HookContract.effectResult` of the registered hooks. -/
theorem registered_effectResult : ∀ ctx item outcome state after, Laws.State.WellFormed state →
    item ∈ state.openItems → Registry.hooks.effectResult ctx item outcome state = .ok after →
    Laws.State.WellFormed after := by
  intro _ _ _ _ _ formed member ran
  rw [Laws.Registry.hooks_effectResult] at ran
  exact Laws.Work.effectResult_keeps workOps formed member ran

/-- `HookContract.retryIncident` of the registered hooks. -/
theorem registered_retryIncident : ∀ ctx item detail generation state after, Laws.State.WellFormed state →
    item ∈ state.openItems → Registry.hooks.retryIncident ctx item detail generation state = .ok after →
    Laws.State.WellFormed after := by
  intro _ _ _ _ _ _ formed _ ran
  rw [Laws.Registry.hooks_retryIncident] at ran
  exact Laws.Work.retryIncident_keeps workOps formed ran

/-- `HookContract.cancelIncidentProcess` of the registered hooks. -/
theorem registered_cancelIncidentProcess : ∀ ctx detail generation state after, Laws.State.WellFormed state →
    Registry.hooks.cancelIncidentProcess ctx detail generation state = .ok after → Laws.State.WellFormed after := by
  intro _ _ _ _ _ formed ran
  rw [Laws.Registry.hooks_cancelIncidentProcess] at ran
  exact Laws.Work.cancelIncidentProcess_keeps workOps formed ran

/-- `HookContract.triggerActivity` of the registered hooks. -/
theorem registered_triggerActivity : ∀ ctx header payload item fired state after, Laws.State.WellFormed state →
    item ∈ state.openItems → Registry.hooks.triggerActivity ctx header payload item fired state = .ok after →
    Laws.State.WellFormed after := by
  intro _ _ _ _ _ _ _ formed member ran
  rw [Laws.Registry.hooks_triggerActivity] at ran
  exact Laws.Work.triggerActivity_keeps workOps formed member ran

/-- `HookContract.completeCall` of the registered hooks. -/
theorem registered_completeCall : ∀ ctx header payload scope occurrence state after, Laws.State.WellFormed state →
    scope ∈ state.scopes → occurrence ∈ state.occurrences → scope.occurrence = some occurrence.id →
    Registry.hooks.completeCall ctx header payload scope occurrence state = .ok after → Laws.State.WellFormed after := by
  intro _ _ _ _ _ _ _ formed member owned link ran
  rw [Laws.Registry.hooks_completeCall] at ran
  exact Laws.Work.completeCall_keeps workOps formed member owned link ran

/-- `HookContract.arriveGateway` of the registered hooks. -/
theorem registered_arriveGateway : ∀ ctx header payload occurrence state after, Laws.State.WellFormed state →
    occurrence ∈ state.occurrences → occurrence.begun = true →
    Registry.hooks.arriveGateway ctx header payload occurrence state = .ok after → Laws.State.WellFormed after := by
  intro _ _ _ _ _ _ formed member begun ran
  rw [Laws.Registry.hooks_arriveGateway] at ran
  exact Laws.Flow.arriveGateway_keeps joinOps formed member begun ran

/-- `HookContract.arriveActivity` of the registered hooks. -/
theorem registered_arriveActivity : ∀ ctx header payload occurrence state after, Laws.State.WellFormed state →
    occurrence ∈ state.occurrences → occurrence.begun = true →
    Registry.hooks.arriveActivity ctx header payload occurrence state = .ok after → Laws.State.WellFormed after := by
  intro _ _ _ _ _ _ formed member begun ran
  rw [Laws.Registry.hooks_arriveActivity] at ran
  exact Laws.Work.arriveActivity_keeps workOps formed member begun ran

/-- `HookContract.arriveMultiInstance` of the registered hooks. -/
theorem registered_arriveMultiInstance : ∀ ctx header envelope loop occurrence state after, Laws.State.WellFormed state →
    occurrence ∈ state.occurrences → occurrence.begun = true →
    Registry.hooks.arriveMultiInstance ctx header envelope loop occurrence state = .ok after →
    Laws.State.WellFormed after := by
  intro _ _ _ _ _ _ _ formed member begun ran
  rw [Laws.Registry.hooks_arriveMultiInstance] at ran
  exact Laws.MultiInstance.arriveMultiInstance_keeps multiInstanceOps formed member begun ran

/-- `HookContract.instanceCompleted` of the registered hooks. -/
theorem registered_instanceCompleted : ∀ ctx body occurrence writes state after, Laws.State.WellFormed state →
    Laws.Step.ScopeStands state occurrence.scope →
    Registry.hooks.instanceCompleted ctx body occurrence writes state = .ok after → Laws.State.WellFormed after := by
  intro _ _ _ _ _ _ formed stands ran
  rw [Laws.Registry.hooks_instanceCompleted] at ran
  obtain ⟨entry, inside, named⟩ := stands
  exact Laws.MultiInstance.instanceCompleted_keeps multiInstanceOps formed (List.mem_map.mpr ⟨entry, inside, named⟩) ran

/-- `HookContract.completeBody` of the registered hooks. -/
theorem registered_completeBody : ∀ ctx header envelope loop occurrence state after, Laws.State.WellFormed state →
    occurrence ∈ state.occurrences →
    Registry.hooks.completeBody ctx header envelope loop occurrence state = .ok after → Laws.State.WellFormed after := by
  intro _ _ _ _ _ _ _ formed _ ran
  rw [Laws.Registry.hooks_completeBody] at ran
  exact Laws.MultiInstance.completeBody_keeps multiInstanceOps formed ran

/-- `HookContract.cancelled` of the registered hooks: no feature is told, so nothing changes. -/
theorem registered_cancelled : ∀ ctx occurrence state after, Laws.State.WellFormed state →
    Registry.hooks.cancelled ctx occurrence state = .ok after → Laws.State.WellFormed after := by
  intro ctx occurrence state _ formed ran
  rw [Laws.Registry.hooks_cancelled] at ran
  cases ran
  exact formed

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
    {rule : WriteRule} {state after : State} (formed : Laws.State.WellFormed state)
    (stands : Laws.Step.ScopeStands state scope)
    (ran : Registry.hooks.writeOutputs ctx scope writes rule state = .ok after) : Laws.State.WellFormed after :=
  (registered_writeOutputs Proofs.State.operations Proofs.State.stateFacts _ _ _ _ _ _ formed stands ran).1

theorem registeredRemovals_wellFormed {ctx : Ctx} {scope : ScopeOccurrenceId} {names : List String} {state after : State}
    (formed : Laws.State.WellFormed state) (stands : Laws.Step.ScopeStands state scope)
    (ran : Registry.hooks.removeVariables ctx scope names state = .ok after) : Laws.State.WellFormed after :=
  registered_removeVariables Proofs.State.operations Proofs.State.stateFacts _ _ _ _ _ formed stands ran

end Kernel.Proofs.Step
