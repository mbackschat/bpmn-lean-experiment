module

public import Kernel.Laws.Step.Inputs
public import Kernel.Laws.State.Committed
public import Kernel.Laws.Step.CompactKeyed

/-! # Laws of the step function: preservation through a step

`Step.step` keeps a state invariant `inv` for hooks that keep their contract (`HookContract`) when the phases of `Step`
keep it (`Phases`), the completion pipeline keeps it (`PipelineKeeps`, which `complete_keeps` gives from the pipeline's
own phases, `PipelinePhases`) and an input's reset keeps it: each body of `Step` keeps it by what `Kernel.Laws.Step` says
the committed body ran, and `Kernel.Laws.Step.Commits` composes them one closure micro-step at a time
(`closureStep_carries`) through the commit (`step_keeps`), so a
proof of an invariant proves the obligations and never opens `Kernel.Step`. The pipeline is a premise of the walk
because an invariant of an input's end facts holds across it only as a unit (`Kernel.Laws.Step.Ends`). It reads no body
itself. Nothing executable imports this module.
-/

public section

namespace Kernel.Laws.Step

variable {le : Issue → Issue → Bool}

open Kernel Kernel.Step

/-! ## The closure from its bodies -/

/-- An invariant that a micro-step's body under its unit as the issuer, its absorbed completion and its transition each
preserve is preserved by the micro-step. -/
theorem microStep_preserves {hooks : Hooks} {ctx : Ctx} {unit : UnitKey} {cause : Cause} {element : Option ElementId}
    {owner : ScopeOccurrenceId} {body : State → Outcome} (invariant : State → Prop)
    (byBody : ∀ state next, invariant state → body { state with issuing := unit, issueNext := 0 } = .ok next →
      invariant next)
    (byAbsorb : ∀ before state next, invariant state → absorb hooks ctx before state = .ok next → invariant next)
    (byConclude : ∀ state next, invariant state → conclude hooks ctx unit cause element owner state = .ok next →
      invariant next)
    {state after : State} (holds : invariant state)
    (ran : microStep hooks ctx unit cause element owner body state = .ok after) : invariant after := by
  obtain ⟨_, _, next, ⟨absorbed, body_, absorbed_, concluded⟩⟩ := microStep_ok ran
  exact byConclude _ _ (byAbsorb _ _ _ (byBody _ _ holds body_) absorbed_) concluded

section Keeps

variable {hooks : Hooks} {inv : Program → State → Prop}

/-! ### The bodies of `Step`

Each phase keeps `inv` when the hooks and state operations it runs keep their obligations, read from what
`Kernel.Laws.Step` says each committed body ran. -/

theorem advanceClock_keeps (phases : BodyPhases inv) {program : Program} {at? : Option Nat} {state after : State}
    (holds : inv program state) (ran : advanceClock at? state = .ok after) : inv program after := by
  rcases advanceClock_ok ran with same | ⟨atMs, moved⟩
  · exact same ▸ holds
  · exact moved ▸ phases.clock _ _ _ holds

theorem continueAfter_keeps {src : Program → State → Prop} (contract : HookContract hooks inv src) {ctx : Ctx}
    {occurrence : Occurrence} {leave : Leave} {writes : List (String × Value)} {state after : State}
    (holds : inv ctx.program state) (stands : ScopeStands state occurrence.scope)
    (continues : Laws.Flow.LeavesFrom (src ctx.program) ctx.program state occurrence leave)
    (ran : continueAfter hooks ctx occurrence leave writes state = .ok after) : inv ctx.program after := by
  rcases continueAfter_ok ran with same | flowed | ⟨_, done⟩ | done | ended
  · exact same ▸ holds
  · exact contract.outflow _ _ _ _ _ holds stands continues flowed
  · exact contract.instanceCompleted _ _ _ _ _ _ holds stands done
  · exact contract.handlerCompleted _ _ _ _ holds stands done
  · exact contract.handlerEnded _ _ _ _ holds stands ended

/-- The completion pipeline keeps `inv`: its continuation comes from where the completion did, read off the states
it ran through, which keep the scope occurrences and add no instance entry. -/
theorem complete_keeps (contract : HookContract hooks inv) (phases : BodyPhases inv) (pipeline : PipelinePhases inv)
    (facts : StateFacts) : PipelineKeeps hooks inv := by
  intro ctx id leave writes rule state after holds free source ran
  obtain ⟨occurrence, sourceType, begun, pipeline⟩ := complete_ok ran
  obtain ⟨left, selected, written, pipeline⟩ := pipeline
  obtain ⟨found, _, leaving, pipeline⟩ := pipeline
  obtain ⟨made, choosing, writing, finishes⟩ := pipeline
  obtain ⟨member, named⟩ := facts.found _ _ _ found
  obtain ⟨begunMember, begunFlag, begunId, reservation⟩ := facts.startReserved state occurrence sourceType member
  obtain ⟨begunScope, reservedScopes, begunElement, reservedInstances⟩ := reservation
  have closedHolds := pipeline.startReserved _ state occurrence sourceType holds member (named ▸ free)
  rw [named] at closedHolds
  obtain ⟨closedFrame, closedFree⟩ := facts.closeOwnItems (state.startReserved occurrence sourceType).1 id
  subst made
  have inClosed := closedFrame.begun _ begunMember begunFlag
  obtain ⟨leftHolds, leftFrame, detached⟩ := contract.leave _ _ _ _ closedHolds inClosed leaving
  have stands : ScopeStands left (state.startReserved occurrence sourceType).2.scope := by
    obtain ⟨entry, inside, same⟩ := phases.housed _ state occurrence holds member
    refine ⟨entry, ?_, same.trans begunScope.symm⟩
    rw [leftFrame.scopes, closedFrame.scopes, reservedScopes]
    exact inside
  obtain ⟨writtenHolds, writtenFrame⟩ := contract.writeOutputs _ _ _ _ _ _ leftHolds stands writing
  have identity : (state.startReserved occurrence sourceType).2.id = id := begunId.trans named
  have free : ∀ (frame : State), (∀ item ∈ itemList frame.openItems, item ∈ itemList left.openItems) →
      ∀ item ∈ itemList frame.openItems, item.id.occurrence ≠ (state.startReserved occurrence sourceType).2.id ∧
        item.attachedTo ≠ some (state.startReserved occurrence sourceType).2.id := fun frame within item member => by
    rw [identity]
    have inLeft := within item member
    exact ⟨closedFree item (leftFrame.items item inLeft), identity ▸ detached item inLeft⟩
  have inWritten := writtenFrame.begun _ (leftFrame.begun _ inClosed begunFlag) begunFlag
  -- The source, carried from the state the completion ran on to every later state of the pipeline.
  have toWritten : ∀ (later : State), (∀ entry ∈ later.slots.instances, entry ∈ written.slots.instances) →
      (∀ entry ∈ later.scopes, entry ∈ written.scopes) →
      Laws.Flow.LeavesFrom (inv ctx.program) ctx.program later (state.startReserved occurrence sourceType).2 selected :=
    fun later instances scopes => ((source occurrence member named).chosen
      (by rw [← begunElement]; exact contract.select _ _ _ _ _ choosing)).shrink
      (fun entry inside => by
        have := closedFrame.instances _ (leftFrame.instances _ (writtenFrame.instances _ (instances entry inside)))
        rwa [reservedInstances] at this)
      (fun entry inside => by
        have := scopes entry inside
        rwa [writtenFrame.scopes, leftFrame.scopes, closedFrame.scopes, reservedScopes] at this)
      begunId begunElement begunScope
  cases finishes with
  | raised continuing =>
    obtain ⟨removedHolds, removedStands⟩ := pipeline.removeOccurrence _ ctx.positionLe written _ writtenHolds inWritten
      (free written writtenFrame.items)
    rw [identity] at removedHolds removedStands
    obtain ⟨entry, inside, named⟩ := removedStands
    obtain ⟨removedScopes, removedInstances⟩ := facts.removeOccurrence written ctx.positionLe id
    obtain ⟨endedScopes, endedInstances⟩ := facts.recordEnd (written.removeOccurrence ctx.positionLe id) (written.keyOf
      (state.startReserved occurrence sourceType).2) .cancelled
    exact continueAfter_keeps contract (pipeline.recordEnd _ _ _ _ removedHolds)
      ⟨entry, endedScopes.symm ▸ inside, named⟩
      (toWritten _ (fun entry member => removedInstances entry (endedInstances ▸ member))
        (fun entry member => removedScopes entry (endedScopes ▸ member))) continuing
  | left _ retaining continuing =>
    obtain ⟨retainedHolds, retainedFrame⟩ := contract.completed _ _ _ _ writtenHolds inWritten retaining
    obtain ⟨removedHolds, removedStands⟩ := pipeline.removeOccurrence _ ctx.positionLe _ _ retainedHolds
      (retainedFrame.begun _ inWritten begunFlag)
      (free _ fun item member => writtenFrame.items item (retainedFrame.items item member))
    rw [identity] at removedHolds removedStands
    obtain ⟨removedScopes, removedInstances⟩ := facts.removeOccurrence _ ctx.positionLe id
    exact pipeline.recordEnd _ _ _ _ (continueAfter_keeps contract removedHolds removedStands
      (toWritten _ (fun entry member => retainedFrame.instances _ (removedInstances entry member))
        (fun entry member => retainedFrame.scopes ▸ removedScopes entry member)) continuing)

theorem fireItem_keeps (contract : HookContract hooks inv) {ctx : Ctx} {item : OpenItem} {fired : Fired}
    {state after : State} (holds : inv ctx.program state) (open_ : item ∈ itemList state.openItems)
    (ran : fireItem hooks ctx item fired state = .ok after) : inv ctx.program after := by
  rcases fireItem_ok ran with ⟨_, _, activity, ran⟩ | ran
  · exact contract.triggerActivity _ _ _ _ _ _ _ holds open_ activity ran
  · exact contract.trigger _ _ _ _ _ holds open_ ran

/-- A begun occurrence's dispatch to its element's hook keeps `inv`; one numbered as a body is of an element with a
Multi-Instance envelope, so any hook but `Hooks.arriveMultiInstance` gets one of the element role, a throw's hook
gets one begun from a state that kept `inv`, and an Activity's one that owns no scope occurrence yet. -/
theorem dispatch_keeps (contract : HookContract hooks inv) {ctx : Ctx} {occurrence : Occurrence} {entry : ScopeEntry}
    {trigger : StartTrigger} {state after : State} (holds : inv ctx.program state) (member : occurrence ∈ state.occurrences)
    (begun : occurrence.begun = true) (inner : ∀ id ∈ entry.inner.toList,
      Laws.State.Beginnable state occurrence.scope id ∧ Laws.State.Unclaimed state id ∧
        ∀ found ∈ state.occurrences, found.id = id → found.scope = occurrence.scope)
    (bodied : occurrence.role = .multiInstanceBody →
      (((ctx.program.element? occurrence.element).bind (·.envelope?)).bind (·.multiInstance)).isSome = true)
    (newest : state.draft.started.getLast?.map (·.occurrence) = some (Laws.State.key state occurrence))
    (unrun : ∀ run ∈ state.slots.multiInstances, run.occurrence ≠ occurrence.id)
    (unowned : ∀ scope ∈ state.scopes, scope.occurrence ≠ some occurrence.id)
    (begunFrom : occurrence.role = .element → Laws.State.BegunFrom (inv ctx.program) state occurrence)
    (ran : dispatch hooks ctx occurrence entry trigger state = .ok after) : inv ctx.program after := by
  rcases dispatch_unstarted ran with ⟨_, _, ran⟩ | ⟨_, _, _, body⟩ | ⟨unstarted, single, arrives⟩
  · exact contract.arriveStart _ _ _ _ _ _ _ holds member begun ran
  · obtain ⟨body, named, looped, ran⟩ := body
    exact contract.arriveMultiInstance _ _ _ _ _ _ _ holds member begun body named looped newest unrun ran
  have role : occurrence.role = .element := by
    cases body : occurrence.role
    · rfl
    · simpa [single body] using bodied body
  cases arrives with
  | atStart ran => exact contract.arriveStart _ _ _ _ _ _ _ holds member begun ran
  | atActivity named activity ran =>
    exact contract.arriveActivity _ _ _ _ _ _ holds member begun unstarted role unowned named activity ran
  | atScope named ran => exact contract.arriveScope _ _ _ _ _ _ _ holds member begun named inner ran
  | atGateway named ran =>
    obtain ⟨element, found, gateway⟩ := Option.bind_eq_some_iff.mp named
    exact contract.arriveGateway _ _ _ _ _ _ holds member begun ⟨element, gateway, .inl found⟩ ran
  | atCatch ran => exact contract.arriveCatch _ _ _ _ _ _ _ holds member begun unstarted role ran
  | atThrow named ran => exact contract.arriveThrow _ _ _ _ _ _ _ holds member begun unstarted role named (begunFrom role) ran
  | atLink named ran => exact contract.arriveLink _ _ _ _ _ _ holds member begun named ran

/-- A begin keeps `inv`: it begins only in a scope occurrence that stands, hands the begun occurrence on and writes its
start's values from a scope occurrence that stands. -/
theorem begin_keeps (contract : HookContract hooks inv) (phases : BodyPhases inv) (facts : StateFacts) {ctx : Ctx}
    {request : BeginRequest} {state after : State} (holds : inv ctx.program state) (admitted : Admitted state request)
    (origin : BeginOrigin inv ctx.program state request) (ran : begin hooks ctx request state = .ok after) :
    inv ctx.program after := by
  obtain ⟨sourceType, begun, occurrence, ⟨entered, ⟨_, made, ⟨dispatched, written⟩⟩⟩⟩ := begin_ok ran
  have begunHolds := phases.begin _ state request (roleOf ctx.program request) sourceType holds (begin_scope ran) admitted
    roleOf_event (fun body => (roleOf_body.mp body).1) rfl origin
  have begunMember := facts.begun state request (roleOf ctx.program request) sourceType
  have newest := phases.newest _ state request (roleOf ctx.program request) sourceType holds
  have unrun := phases.unrun _ state request (roleOf ctx.program request) sourceType holds (begin_scope ran) admitted
  have unowned := phases.unowned _ state request (roleOf ctx.program request) sourceType holds (begin_scope ran)
    admitted
  simp only [made] at begunHolds begunMember newest unrun unowned
  obtain ⟨entry, standing, named⟩ := begin_scope ran
  have throws : occurrence.role = .element → Laws.State.BeginsThrow state request occurrence := fun role =>
    ⟨List.mem_map.mpr ⟨entry, standing, named⟩,
      fun id reserved => (admitted.2.1 id (by simp [Laws.State.names, reserved])).1, role⟩
  have enteredHolds := dispatch_keeps contract begunHolds.1 begunMember.1 begunMember.2 begunHolds.2
    (phases.bodied _ _ _ begunHolds.1 begunMember.1) newest unrun unowned
    (fun role => ⟨state, request, _, sourceType, holds, throws role, made⟩) dispatched
  rcases writeStart_ok written with ⟨_, same⟩ | ⟨_, _, owned, ran⟩
  · exact same ▸ enteredHolds
  · exact (contract.writeOutputs _ _ _ _ _ _ enteredHolds (facts.localScope _ _ _ owned) ran).1

/-- A request an arrival or a start makes names no reservation. -/
theorem admitted_fresh {state : State} {element : ElementId} {scope : ScopeOccurrenceId} {incoming : Option FlowId}
    {trigger : StartTrigger} : Admitted state { element, scope, incoming, trigger } :=
  ⟨by simp [Laws.State.names], by simp [Laws.State.names], by simp [Laws.State.InnerPlaced]⟩

/-- The closure's next queued signal keeps `inv`: its work runs only once what it names stands, or changes nothing
(`Laws.Step`'s queued work whose target is gone). -/
theorem signal_keeps (contract : HookContract hooks inv) (phases : BodyPhases inv) (facts : StateFacts)
    (pipeline : PipelineKeeps hooks inv) {ctx : Ctx}
    {queue : State} {next : Signal} {unit : UnitKey} {after : State} (holds : inv ctx.program queue)
    (heads : firstBreadth queue.queuedSignals = some (unit, next))
    (ran : dispatchSignal hooks ctx next { queue with queuedSignals := queue.queuedSignals.erase unit } = .ok after) :
    inv ctx.program after := by
  have popped : inv ctx.program { queue with queuedSignals := queue.queuedSignals.erase unit } :=
    phases.unqueue _ _ _ holds
  have found := firstBreadth_mem heads
  have head : next ∈ Laws.State.allSignals queue := Laws.State.mem_allSignals_of found
  have stands : ∀ id, (∃ occurrence, State.occurrence? { queue with queuedSignals := queue.queuedSignals.erase unit } id =
      some occurrence) → OccurrenceStands { queue with queuedSignals := queue.queuedSignals.erase unit } id :=
      fun id ⟨_, found⟩ => by
    obtain ⟨member, same⟩ := facts.found _ _ _ found
    exact ⟨_, member, same⟩
  cases dispatchSignal_ok ran with
  | onArm host scope ran =>
    obtain ⟨hostIssued, scopeIssued, hosted⟩ := phases.armIssued _ _ _ _ _ holds head
    exact contract.arm _ _ _ _ _ _ popped (stands _ (host hostIssued)) (scope scopeIssued) hosted
      ⟨queue, unit, holds, found, rfl⟩ ran
  | onArmScope scope ran => exact contract.armScope _ _ _ _ popped (scope (phases.armScopeIssued _ queue _ holds head)) ran
  | onArmGateway occurrence scope ran =>
    obtain ⟨occurrenceIssued, scopeIssued, hosted⟩ := phases.armGatewayIssued _ _ _ _ _ holds head
    exact contract.armGateway _ _ _ _ _ _ popped (stands _ (occurrence occurrenceIssued)) (scope scopeIssued) hosted
      ⟨queue, unit, holds, found, rfl⟩ ran
  | onRaise ran =>
    obtain ⟨raisable, settled⟩ := phases.raisable _ _ _ _ _ holds heads
    exact contract.raise _ _ _ _ _ popped raisable settled ⟨queue, unit, holds, found, rfl⟩ ran
  | onBegin ran =>
    exact begin_keeps contract phases facts popped (phases.admittedSignal _ _ _ _ holds heads)
      (.inr ⟨queue, holds, .inl ⟨unit, heads, rfl⟩⟩) ran
  | onComplete ran =>
    exact pipeline _ _ _ _ _ _ _ popped (fun request queued => phases.completeQueued _ _ _ _ _ _ holds head
      request (Laws.State.Queued.shrink (before := queue)
        (after := { queue with queuedSignals := queue.queuedSignals.erase unit })
        Laws.State.allSignals_unqueue (fun _ inside => inside) queued))
      (fun occurrence member named => ⟨queue, holds, fun _ kept => kept, fun _ kept => kept,
        .inl ⟨⟨occurrence, member, rfl, rfl, rfl⟩, fun selected same flow inside => .inr ⟨selected, _, _, inside,
          by rw [named, ← same]; exact head⟩⟩⟩) ran
  | onWrite stands ran => exact (contract.writeOutputs _ _ _ _ _ _ popped stands ran).1
  | onRemove stands ran => exact contract.removeVariables _ _ _ _ _ popped stands ran
  | onOccur stands ran =>
    obtain ⟨reserved, free⟩ := phases.reserve _ _ _ _ popped stands ⟨queue, holds, .inl ⟨_, _, _, _, head⟩⟩
      ⟨_, _, _, queue, unit, holds, found, rfl⟩
    obtain ⟨occurrences, element, scope, placed⟩ :=
      facts.reserve { queue with queuedSignals := queue.queuedSignals.erase unit } _ _
    obtain ⟨fresh, scopes, instances⟩ := placed
    refine pipeline _ _ _ _ _ _ _ reserved free (fun occurrence member named => ?_) ran
    rcases occurrences _ member with old | new
    · have := phases.issued _ _ _ popped old
      rw [named] at this
      exact (fresh (phases.issuer _ _ popped) stands.mem this).elim
    rw [new]
    exact ⟨queue, holds, fun entry kept => instances ▸ kept, fun entry kept => scopes ▸ kept,
      .inr ⟨_, _, _, by rw [element, scope]; exact head, fun selected same flow inside =>
        .inr ⟨selected, same, inside⟩⟩⟩
  | onCancel => exact phases.cancel _ _ _ _ popped
  | onFire fired =>
    rcases fired with ⟨item, open_, ran⟩ | same
    · exact fireItem_keeps contract popped open_ ran
    · exact same ▸ popped
  | onEndInstance => exact phases.endInstance _ _ _ _ _ popped (phases.endRecorded _ queue _ _ holds head)
  | onCompensate stands ran =>
    exact contract.compensate _ _ _ _ _ _ _ _ popped stands (fun _ same => phases.resumable _ _ _ _ _ _ _ _ holds
      (same ▸ heads)) (fun _ _ _ same => ⟨queue, holds, .inr (.inl ⟨_, _, _, _, _, _, same ▸ head⟩)⟩)
      ⟨queue, unit, holds, found, rfl⟩ ran
  | onCompensationFailed stands ran => exact contract.failCompensation _ _ _ _ _ _ _ popped stands ran
  | onCompensationReady stands ran => exact contract.compensationReady _ _ _ _ _ popped stands ran

theorem completeIdleScope_keeps (contract : HookContract hooks inv) (facts : StateFacts) {ctx : Ctx}
    {scope : ScopeOccurrence} {state after : State} (holds : inv ctx.program state) (member : scope ∈ state.scopes)
    (ran : completeIdleScope hooks ctx scope state = .ok after) : inv ctx.program after := by
  obtain ⟨_, occurrence, link, ⟨found, completed⟩⟩ := completeIdleScope_ok ran
  obtain ⟨owned, named⟩ := facts.found _ _ _ found
  rw [← named] at link
  rcases completed with ⟨_, _, ran⟩ | ⟨_, _, ran⟩ | ⟨_, _, _, ran⟩
  · exact contract.completeScope _ _ _ _ _ _ _ holds member owned link ran
  · exact contract.completeCall _ _ _ _ _ _ _ holds member owned link ran
  · exact contract.completeBody _ _ _ _ _ _ _ holds owned ran

/-- A parked join offered again keeps `inv`: its gateway's hook ran on the state the closure reached under the offer's
unit as the issuer, for an occurrence that stands. -/
theorem reoffer_keeps (contract : HookContract hooks inv) (phases : BodyPhases inv) (facts : StateFacts) {ctx : Ctx}
    {state : State} {gateway : ElementId} {scope : ScopeOccurrenceId} {named : OccurrenceId} {offered : State}
    {unit : UnitKey} (holds : inv ctx.program { state with issuing := unit, issueNext := 0 })
    (ran : reoffer? hooks ctx state = .ok (some (gateway, scope, named, offered)))
    (keyed : UnitKey.offerUnit? named (offerRound state named) = some unit) : inv ctx.program offered := by
  obtain ⟨_, occurrence, _, rest⟩ := reoffer_ok ran
  obtain ⟨_, ⟨waiting, parked, named, gateway⟩, found, ⟨same, offerUnit, keyedOffer, offering⟩⟩ := rest
  subst same
  obtain rfl : offerUnit = unit := Option.some.inj (keyedOffer.symm.trans keyed)
  obtain ⟨element, targeted, isGateway⟩ := gateway
  obtain ⟨member, same⟩ := facts.found _ _ _ found
  exact contract.arriveGateway _ _ _ _ _ _ holds member
    (phases.parkedBegun _ _ _ _ holds parked member (same.trans named.symm))
    ⟨element, isGateway, .inr ⟨waiting, parked, named.trans same.symm, targeted⟩⟩ offering

theorem transition_keeps (contract : HookContract hooks inv) (phases : BodyPhases inv) {ctx : Ctx}
    {transition : State → Outcome} (runs : RunsTransition hooks ctx transition) {state after : State}
    (holds : inv ctx.program state) (ran : transition state = .ok after) : inv ctx.program after := by
  rcases runs with ⟨data, same⟩ | ⟨data, same⟩ | ⟨data, same⟩ | fires
  · subst same
    cases command_ok ran with
    | completeUserTask open_ activity ran => exact contract.completeUserTask _ _ _ _ _ _ _ holds open_ activity ran
    | retryIncident open_ incident ran => exact contract.retryIncident _ _ _ _ _ _ holds open_ incident ran
    | cancelIncidentProcess ran => exact contract.cancelIncidentProcess _ _ _ _ _ holds ran
    | write queued => exact queued ▸ phases.queueWrite _ _ _ _ _ holds
    | remove queued => exact queued ▸ phases.queueRemove _ _ _ _ holds
  · subst same
    obtain ⟨_, open_, effect, ran⟩ := deliverEffectResult_ok ran
    exact contract.effectResult _ _ _ _ _ holds open_ effect ran
  · subst same
    obtain ⟨_, _, found, ran⟩ := jobFailure_ok ran
    exact contract.failJob _ _ _ _ _ holds (Laws.Hooks.itemDetail?_mem found) (Laws.Hooks.itemDetail?_view found) ran
  · obtain ⟨_, _, picked, fired⟩ := fires _ _ ran
    rcases picked with open_ | ⟨_, delivered⟩
    · exact fireItem_keeps contract holds open_ fired
    · exact fireItem_keeps contract holds (contract.delivered _ _ _ _ _ delivered) fired

/-! ### The closure -/

/-- A fold whose every step keeps `inv` keeps it. -/
theorem foldlM_keeps {α : Type} {program : Program} {f : State → α → Outcome}
    (each : ∀ state a after, inv program state → f state a = .ok after → inv program after) :
    ∀ (items : List α) (state after : State), inv program state → items.foldlM f state = .ok after → inv program after
  | [], state, after, holds, ran => by
    simp only [List.foldlM_nil] at ran
    exact (Except.ok.inj ran) ▸ holds
  | a :: rest, state, after, holds, ran => by
    simp only [List.foldlM_cons] at ran
    obtain ⟨mid, stepped, ran⟩ := bind_ok ran
    exact foldlM_keeps each rest mid after (each _ _ _ holds stepped) ran

theorem absorb_keeps (phases : BodyPhases inv) (pipeline : PipelineKeeps hooks inv) {ctx : Ctx} {before : Nat}
    {state after : State} (holds : inv ctx.program state) (ran : absorb hooks ctx before state = .ok after) :
    inv ctx.program after := by
  rcases absorb_ok ran with same | ⟨_, _, _, absorbed⟩
  · exact same ▸ holds
  · obtain ⟨_, sole, completed⟩ := absorbed
    have queued : _ ∈ Laws.State.allSignals state :=
      List.mem_append_right _ (List.mem_of_mem_drop (i := before) (sole ▸ List.mem_singleton_self _))
    exact pipeline _ _ _ _ _ _ _ (phases.dequeue _ _ _ holds (List.take_sublist _ _))
      (fun request inQueue => phases.completeQueued _ _ _ _ _ _ holds queued request
        (Laws.State.Queued.shrink (before := state) (after := { state with batchSignals := state.batchSignals.take before })
          (Laws.State.allSignals_batch (List.take_sublist _ _)) (fun _ inside => inside) inQueue))
      (fun occurrence member named => ⟨state, holds, fun _ kept => kept, fun _ kept => kept,
        .inl ⟨⟨occurrence, member, rfl, rfl, rfl⟩, fun selected same flow inside => .inr ⟨selected, _, _, inside,
          by rw [named, ← same]; exact queued⟩⟩⟩) completed

/-! ### The issuer between micro-steps (DC12)

A micro-step's body runs under its unit as the issuer (`ClosurePhases.enterUnit`), and its conclusion makes the seed the
issuer again (`ClosurePhases.leaveUnit`). Both resets need what `inv` does not say: the unit has not run, and the issue
table holds no issue of the issuer replaced. Between micro-steps the closure keeps `Between`; through a body and its
conclusion the hooks keep the transitions and the issuer the body started from beside a base invariant every `inv`
implies (`Framed`), for every start (`Framing`), so every walk runs that second track beside its own `inv`. -/

/-- What holds of a closure between its micro-steps (DC12): the issue table holds no issue of the issuer, and the seed's
root unit has no transition. -/
structure Between (s : State) : Prop where
  untabled : ∀ index, s.issued[Issue.fresh s.issuing index]? = none
  seed : s.transitions.contains (.ofRoot .seed) = false

/-- `base` of a state with the transitions and the issuer of `b`: what a micro-step's body and the hooks its conclusion
runs keep of the state the body started from. -/
abbrev Framed (base : Program → State → Prop) (b : State) (program : Program) (s : State) : Prop :=
  base program s ∧ s.transitions = b.transitions ∧ s.issuing = b.issuing

/-- What the hooks and phases keep of `base` and, beside it, of the transitions and the issuer a body starts from, for
every start; and that `State.queueBatch` moves neither (`Laws.State.queueBatch_eq`, which this module cannot read). -/
structure Framing (hooks : Hooks) (base : Program → State → Prop) : Prop where
  phases : ClosurePhases base
  contract : ∀ b, HookContract hooks (Framed base b)
  body : ∀ b, BodyPhases (Framed base b)
  pipeline : ∀ b, PipelineKeeps hooks (Framed base b)
  queueBatch : ∀ (s : State) unit grouped, (s.queueBatch unit grouped).transitions = s.transitions ∧
    (s.queueBatch unit grouped).issuing = s.issuing

/-- Journalling a unit other than `other` adds no transition of `other`. -/
theorem contains_insert_ne {m : TreeMap UnitKey Transition compare} {unit other : UnitKey} {transition : Transition}
    (ne : unit ≠ other) (absent : m.contains other = false) : (m.insert unit transition).contains other = false := by
  rw [Std.ExtTreeMap.contains_insert, absent, Bool.or_false]
  simpa using ne

section Walk

variable {base : Program → State → Prop}

/-- A micro-step's conclusion from a state that keeps `inv`, and beside `base` the transitions and the issuer of the
state `b` its body started from, keeps `inv` and leaves the closure `Between` micro-steps: it journals the unit, which
`b` has not run, and makes the seed the issuer again, whose issues the table cannot hold, since the seed's unit never
runs. -/
theorem conclude_carries (contract : HookContract hooks inv) (phases : ClosurePhases inv) (framing : Framing hooks base)
    {ctx : Ctx} {unit : UnitKey} {cause : Cause} {element : Option ElementId} {owner : ScopeOccurrenceId}
    {b state after : State} (issuing : b.issuing = unit) (unrun : b.transitions.contains unit = false)
    (unseeded : unit ≠ .ofRoot .seed) (seed : b.transitions.contains (.ofRoot .seed) = false)
    (holds : inv ctx.program state) (framed : Framed base b ctx.program state)
    (ran : conclude hooks ctx unit cause element owner state = .ok after) : inv ctx.program after ∧ Between after := by
  obtain ⟨based, transitions, issuer⟩ := framed
  obtain ⟨notified, written, grouped, ⟨notifying, writing, groups, rfl⟩⟩ := conclude_ok ran
  have fresh : state.transitions.contains unit = false := by rw [transitions]; exact unrun
  let transition : Transition := ⟨cause, element, owner, state.draft.started, state.draft.ended, state.draft.ready⟩
  have journalled := phases.journal _ state unit transition holds (Laws.State.getElem?_of_contains fresh)
    (by simp [transition]) (by simp [transition])
  have journalledBase := framing.phases.journal _ state unit transition based (Laws.State.getElem?_of_contains fresh)
    (by simp [transition]) (by simp [transition])
  have kept := contract.written _ _ _ _ (foldlM_keeps (fun _ _ _ kept ran => contract.cancelled _ _ _ _ kept ran)
    _ _ _ journalled notifying) writing
  have framedWritten := (framing.contract _).written _ _ _ _ (foldlM_keeps
    (fun _ _ _ kept ran => (framing.contract _).cancelled _ _ _ _ kept ran) _ _ _
    (⟨journalledBase, rfl, rfl⟩ : Framed base
      { state with transitions := state.transitions.insert unit transition, draft := {}, writes := [] } ctx.program
      { state with transitions := state.transitions.insert unit transition, draft := {}, writes := [] }) notifying) writing
  have queued := phases.queueBatch _ _ unit grouped groups kept
  obtain ⟨queuedTransitions, queuedIssuing⟩ := framing.queueBatch written unit grouped
  have recorded : (written.queueBatch unit grouped).transitions = state.transitions.insert unit transition :=
    queuedTransitions.trans framedWritten.2.1
  have issued : (written.queueBatch unit grouped).issuing = unit :=
    queuedIssuing.trans (framedWritten.2.2.trans (issuer.trans issuing))
  have seedAbsent : (written.queueBatch unit grouped).transitions.contains (.ofRoot .seed) = false := by
    rw [recorded]
    exact contains_insert_ne unseeded (by rw [transitions]; exact seed)
  have untabled : ∀ index, (written.queueBatch unit grouped).issued[Issue.fresh (.ofRoot .seed) index]? = none := fun index => by
    cases tabled : (written.queueBatch unit grouped).issued[Issue.fresh (.ofRoot .seed) index]? with
    | none => rfl
    | some slot =>
      rcases (phases.issuer _ _ queued).ran _ index slot tabled with contains | same
      · rw [seedAbsent] at contains
        cases contains
      · exact absurd (same.trans issued).symm unseeded
  have closed : (written.queueBatch unit grouped).transitions.contains (written.queueBatch unit grouped).issuing = true := by
    rw [recorded, issued]
    exact Std.ExtTreeMap.contains_insert_self
  exact ⟨phases.leaveUnit _ _ queued closed untabled, untabled, seedAbsent⟩

/-- A micro-step whose body keeps `inv` and a side invariant concludes from a state that keeps both. -/
theorem microStep_concludes {side : Program → State → Prop} (phases : BodyPhases inv) (pipeline : PipelineKeeps hooks inv)
    (sidePhases : BodyPhases side) (sidePipeline : PipelineKeeps hooks side) {ctx : Ctx} {unit : UnitKey}
    {cause : Cause} {element : Option ElementId} {owner : ScopeOccurrenceId} {body : State → Outcome} {state after : State}
    (byBody : ∀ next, body { state with issuing := unit, issueNext := 0 } = .ok next →
      inv ctx.program next ∧ side ctx.program next)
    (ran : microStep hooks ctx unit cause element owner body state = .ok after) :
    ∃ mid, (inv ctx.program mid ∧ side ctx.program mid) ∧ conclude hooks ctx unit cause element owner mid = .ok after := by
  obtain ⟨_, _, next, ⟨absorbed, body_, absorbed_, concluded⟩⟩ := microStep_ok ran
  have kept := byBody _ body_
  exact ⟨absorbed, ⟨absorb_keeps phases pipeline kept.1 absorbed_, absorb_keeps sidePhases sidePipeline kept.2 absorbed_⟩,
    concluded⟩

/-- A micro-step whose body keeps every invariant its hooks and phases keep keeps `inv`, and leaves the closure
`Between` micro-steps, from a state that keeps `inv` between them. -/
theorem microStep_carries (contract : HookContract hooks inv) (phases : ClosurePhases inv)
    (pipeline : PipelineKeeps hooks inv) (framing : Framing hooks base) (based : ∀ program s, inv program s → base program s)
    {ctx : Ctx} {unit : UnitKey} {cause : Cause} {element : Option ElementId} {owner : ScopeOccurrenceId}
    {body : State → Outcome} {state after : State} (holds : inv ctx.program state) (between : Between state)
    (byBody : ∀ (keep : Program → State → Prop), HookContract hooks keep → BodyPhases keep →
      keep ctx.program { state with issuing := unit, issueNext := 0 } →
      ∀ next, body { state with issuing := unit, issueNext := 0 } = .ok next → keep ctx.program next)
    (ran : microStep hooks ctx unit cause element owner body state = .ok after) :
    inv ctx.program after ∧ Between after := by
  obtain ⟨unrun, unseeded, -⟩ := microStep_ok ran
  have entered := phases.enterUnit _ _ _ holds unrun unseeded between.untabled
  have framed : Framed base { state with issuing := unit, issueNext := 0 } ctx.program
      { state with issuing := unit, issueNext := 0 } :=
    ⟨framing.phases.enterUnit _ _ _ (based _ _ holds) unrun unseeded between.untabled, rfl, rfl⟩
  obtain ⟨mid, ⟨kept, framedMid⟩, concluded⟩ := microStep_concludes phases.toBodyPhases pipeline (framing.body _)
    (framing.pipeline _) (fun next ran => ⟨byBody _ contract phases.toBodyPhases entered next ran,
      byBody _ (framing.contract _) (framing.body _) framed next ran⟩) ran
  exact conclude_carries (b := { state with issuing := unit, issueNext := 0 }) contract phases framing rfl unrun unseeded
    between.seed kept framedMid concluded

end Walk

/-- A moved token's micro-step concludes from a state that keeps `inv` and a side invariant, each under the unit as the
issuer. -/
theorem moveToken_concludes {side : Program → State → Prop} (contract : HookContract hooks inv) (phases : BodyPhases inv)
    (pipeline : PipelineKeeps hooks inv) (sideContract : HookContract hooks side) (sidePhases : BodyPhases side)
    (sidePipeline : PipelineKeeps hooks side) (facts : StateFacts) {ctx : Ctx} {unit : UnitKey} {token : Token}
    {state after : State} (holds : inv ctx.program { state with issuing := unit, issueNext := 0 })
    (sideHolds : side ctx.program { state with issuing := unit, issueNext := 0 })
    (admitted : ∀ request, token = .begin request → Admitted { state with issuing := unit, issueNext := 0 } request)
    (queue : State) (held : inv ctx.program queue) (sideHeld : side ctx.program queue)
    (taken : TokenTaken ctx.program queue token { state with issuing := unit, issueNext := 0 })
    (ran : moveToken hooks ctx unit token state = .ok after) :
    ∃ mid cause element owner, (inv ctx.program mid ∧ side ctx.program mid) ∧
      conclude hooks ctx unit cause element owner mid = .ok after := by
  cases token with
  | flow flow scope =>
    obtain ⟨mid, kept, concluded⟩ := microStep_concludes phases pipeline sidePhases sidePipeline (fun next arrived => by
      obtain ⟨_, target, begun⟩ := arrive_ok arrived
      exact ⟨begin_keeps contract phases facts holds admitted_fresh
          (.inl ⟨rfl, rfl, .inl ⟨queue, flow, held, ⟨target, rfl⟩, taken⟩⟩) begun,
        begin_keeps sideContract sidePhases facts sideHolds admitted_fresh
          (.inl ⟨rfl, rfl, .inl ⟨queue, flow, sideHeld, ⟨target, rfl⟩, taken⟩⟩) begun⟩) (moveToken_flow ran)
    exact ⟨mid, _, _, _, kept, concluded⟩
  | begin request =>
    obtain ⟨mid, kept, concluded⟩ := microStep_concludes phases pipeline sidePhases sidePipeline
      (fun _ dispatched => ⟨begin_keeps contract phases facts holds (admitted request rfl)
          (.inr ⟨queue, held, .inr taken⟩) (dispatchBegin_ok dispatched),
        begin_keeps sideContract sidePhases facts sideHolds (admitted request rfl)
          (.inr ⟨queue, sideHeld, .inr taken⟩) (dispatchBegin_ok dispatched)⟩)
      (moveToken_begin ran)
    exact ⟨mid, _, _, _, kept, concluded⟩

/-- A moved token's micro-step runs a unit the closure has not run and that is not the seed's (`Step.microStep`, DC4). -/
theorem moveToken_fresh {ctx : Ctx} {unit : UnitKey} {token : Token} {state after : State}
    (ran : moveToken hooks ctx unit token state = .ok after) :
    state.transitions.contains unit = false ∧ unit ≠ .ofRoot .seed := by
  cases token with
  | flow => exact ⟨(microStep_ok (moveToken_flow ran)).1, (microStep_ok (moveToken_flow ran)).2.1⟩
  | begin => exact ⟨(microStep_ok (moveToken_begin ran)).1, (microStep_ok (moveToken_begin ran)).2.1⟩

/-- A closure micro-step runs a unit the closure has not run and that is not the seed's (`Step.microStep`, DC4). -/
theorem closureStep_fresh {ctx : Ctx} {log : RunLog} {unit : UnitKey} {state after : State}
    (step : ClosureStep hooks ctx log unit state after) :
    state.transitions.contains unit = false ∧ unit ≠ .ofRoot .seed := by
  cases step with
  | signal _ _ ran => exact ⟨(microStep_ok ran).1, (microStep_ok ran).2.1⟩
  | token _ _ _ ran =>
    have fresh := moveToken_fresh ran
    exact fresh
  | idle _ _ _ _ _ ran => exact ⟨(microStep_ok ran).1, (microStep_ok ran).2.1⟩
  | reoffer _ _ _ _ _ _ ran => exact ⟨(microStep_ok ran).1, (microStep_ok ran).2.1⟩
  | finish _ _ _ _ _ _ _ ran => exact ⟨(microStep_ok ran).1, (microStep_ok ran).2.1⟩

/-- A closure micro-step concludes, under its unit, from a state that keeps `inv` and a side invariant under the unit as
the issuer: a queued signal's, a moved token's, an idle scope occurrence's completion, a parked join's offer and the
instance's completion. -/
theorem closureStep_concludes {side : Program → State → Prop} (contract : HookContract hooks inv)
    (phases : BodyPhases inv) (pipeline : PipelineKeeps hooks inv) (sideContract : HookContract hooks side)
    (sidePhases : BodyPhases side) (sidePipeline : PipelineKeeps hooks side) (facts : StateFacts) {ctx : Ctx}
    {log : RunLog} {unit : UnitKey} {state after : State}
    (holds : inv ctx.program { state with issuing := unit, issueNext := 0 })
    (sideHolds : side ctx.program { state with issuing := unit, issueNext := 0 })
    (step : ClosureStep hooks ctx log unit state after) :
    ∃ mid cause element owner, (inv ctx.program mid ∧ side ctx.program mid) ∧
      conclude hooks (unitCtx ctx log) unit cause element owner mid = .ok after := by
  cases step with
  | signal _ heads ran =>
    obtain ⟨mid, kept, concluded⟩ := microStep_concludes (ctx := unitCtx ctx log) phases pipeline sidePhases sidePipeline
      (fun _ dispatched => ⟨signal_keeps contract phases facts pipeline holds heads dispatched,
        signal_keeps sideContract sidePhases facts sidePipeline sideHolds heads dispatched⟩) ran
    exact ⟨mid, _, _, _, kept, concluded⟩
  | token _ quiet next ran =>
    have taken : TokenTaken ctx.program { state with issuing := unit, issueNext := 0 } _
        { { state with queuedTokens := state.queuedTokens.erase unit } with issuing := unit, issueNext := 0 } :=
      ⟨quiet, unit, log, (nextToken_mem next).2, rfl⟩
    exact moveToken_concludes (ctx := unitCtx ctx log) contract phases pipeline sideContract sidePhases sidePipeline facts
      (phases.untoken _ _ _ holds) (sidePhases.untoken _ _ _ sideHolds)
      (fun request same => phases.admittedToken _ _ _ _ holds (same ▸ taken)) _ holds sideHolds taken ran
  | idle _ _ _ idle _ ran =>
    have member := idleScope_mem idle
    obtain ⟨mid, kept, concluded⟩ := microStep_concludes (ctx := unitCtx ctx log) phases pipeline sidePhases sidePipeline
      (fun _ completed => ⟨completeIdleScope_keeps contract facts holds member completed,
        completeIdleScope_keeps sideContract facts sideHolds member completed⟩) ran
    exact ⟨mid, _, _, _, kept, concluded⟩
  | reoffer _ _ _ _ offered keyed ran =>
    obtain ⟨mid, kept, concluded⟩ := microStep_concludes (ctx := unitCtx ctx log) phases pipeline sidePhases sidePipeline (fun next made => by
      simp only [Except.ok.injEq] at made
      subst made
      exact ⟨reoffer_keeps contract phases facts holds offered keyed,
        reoffer_keeps sideContract sidePhases facts sideHolds offered keyed⟩) ran
    exact ⟨mid, _, _, _, kept, concluded⟩
  | finish _ _ _ _ _ _ _ ran =>
    obtain ⟨mid, kept, concluded⟩ := microStep_concludes (ctx := unitCtx ctx log) phases pipeline sidePhases sidePipeline (fun next ended => by
      simp only [Except.ok.injEq] at ended
      subst ended
      exact ⟨phases.endInstance _ _ _ _ _ holds (by simp), sidePhases.endInstance _ _ _ _ _ sideHolds (by simp)⟩) ran
    exact ⟨mid, _, _, _, kept, concluded⟩

section Walk

variable {base : Program → State → Prop}

/-- A closure micro-step keeps `inv` between micro-steps. -/
theorem closureStep_carries (contract : HookContract hooks inv) (phases : ClosurePhases inv) (facts : StateFacts)
    (pipeline : PipelineKeeps hooks inv) (framing : Framing hooks base)
    (based : ∀ program s, inv program s → base program s) {ctx : Ctx} {log : RunLog} {unit : UnitKey}
    {state after : State} (holds : inv ctx.program state) (between : Between state)
    (step : ClosureStep hooks ctx log unit state after) : inv ctx.program after ∧ Between after := by
  obtain ⟨unrun, unseeded⟩ := closureStep_fresh step
  have framed : Framed base { state with issuing := unit, issueNext := 0 } ctx.program
      { state with issuing := unit, issueNext := 0 } :=
    ⟨framing.phases.enterUnit _ _ _ (based _ _ holds) unrun unseeded between.untabled, rfl, rfl⟩
  obtain ⟨mid, _, _, ⟨_, ⟨kept, framedMid⟩, concluded⟩⟩ := closureStep_concludes contract phases.toBodyPhases pipeline
    (framing.contract _) (framing.body _) (framing.pipeline _) facts
    (phases.enterUnit _ _ _ holds unrun unseeded between.untabled) framed step
  exact conclude_carries (ctx := unitCtx ctx log) (b := { state with issuing := unit, issueNext := 0 }) contract phases framing rfl unrun unseeded
    between.seed kept framedMid concluded

/-- The closure keeps `inv` between micro-steps. -/
theorem settle_carries (contract : HookContract hooks inv) (phases : ClosurePhases inv) (facts : StateFacts)
    (pipeline : PipelineKeeps hooks inv) (framing : Framing hooks base)
    (based : ∀ program s, inv program s → base program s) {ctx : Ctx} :
    ∀ (fuel work : Nat) (log : RunLog) (state : State) (after : State × RunLog), inv ctx.program state →
      Between state → settle hooks ctx fuel work log state = .ok after → inv ctx.program after.1 ∧ Between after.1 :=
  fun fuel work log state after holds between ran =>
    settle_induction (fun s => inv ctx.program s ∧ Between s)
      (fun _ _ _ _ holds step => closureStep_carries contract phases facts pipeline framing based holds.1 holds.2 step)
      fuel work log state after ⟨holds, between⟩ ran

/-- An input's start on a running instance holds no issue and no transition when the before-state is committed. -/
theorem reset_between {before : State} (committed : Laws.State.Committed before) :
    Between { before with journal := [], intents := [], transitions := ∅, outboxes := ∅, draft := {}, writes := [], completionBase := before.nextCompletion } :=
  ⟨fun index => by simp [committed.issued], by simp⟩

/-- The clock moves neither the issue table nor the transitions. -/
theorem advanceClock_between {at? : Option Nat} {state after : State} (between : Between state)
    (ran : advanceClock at? state = .ok after) : Between after := by
  rcases advanceClock_ok ran with rfl | ⟨_, rfl⟩
  · exact between
  · exact ⟨between.untabled, between.seed⟩

/-- An input's micro-step and the closure after it keep `inv` between micro-steps, from a start that keeps it. -/
theorem input_carries (contract : HookContract hooks inv) (phases : ClosurePhases inv) (facts : StateFacts)
    (pipeline : PipelineKeeps hooks inv) (framing : Framing hooks base)
    (based : ∀ program s, inv program s → base program s) {ctx : Ctx} {transition : State → Outcome}
    (runs : RunsTransition hooks ctx transition) {cause : Cause} {start moved : State} {settled : State × RunLog}
    (started : inv ctx.program start) (between : Between start)
    (stepped : microStep hooks ctx (.ofRoot .input) cause none State.root transition start = .ok moved)
    (settling : settle hooks ctx closureBound closureWorkBound (RunLog.record {} (.ofRoot .input)) moved = .ok settled) :
    inv ctx.program settled.1 ∧ Between settled.1 :=
  have movedHolds := microStep_carries contract phases pipeline framing based started between
    (fun _ keeps keepPhases kept _ transitioned => transition_keeps keeps keepPhases runs kept transitioned) stepped
  settle_carries contract phases facts pipeline framing based _ _ _ _ _ movedHolds.1 movedHolds.2 settling

/-- `Step.step` on a running instance settles in a state that keeps `inv` of the program it runs, whose journal and
intents ordered by the run log (`Step.orderJournal`) are the committed state's, for hooks that keep their contract,
from a committed before-state whose input start keeps it. It needs no `Phases.runOrder`, so an invariant of the
closure's keyed content holds there. -/
theorem running_settles (contract : HookContract hooks inv) (phases : ClosurePhases inv) (facts : StateFacts)
    (pipeline : PipelineKeeps hooks inv) (framing : Framing hooks base)
    (based : ∀ program s, inv program s → base program s) {program : Program} {before : State} {input : Input}
    {after : State} (committed : Laws.State.Committed before)
    (holds : inv program { before with journal := [], intents := [], transitions := ∅, outboxes := ∅, draft := {}, writes := [], completionBase := before.nextCompletion })
    (ran : step hooks program (some before) input = .ok after) :
    ∃ (start : State) (settled : State × RunLog), (inv program settled.1 ∧ Between settled.1) ∧
      orderJournal program.options.branchSchedule start (.ok settled) = .ok after := by
  rcases step_ok ran with ⟨_, _, fresh, _⟩ | ⟨_, _, runs, ran⟩
  · simp at fresh
  · obtain ⟨state, start, moved, rest⟩ := onRunning_ok ran
    obtain ⟨settled, present, _, rest⟩ := rest
    obtain ⟨clocked, stepped, settling, made⟩ := rest
    obtain rfl := Option.some.inj present
    have entered : inv (inputCtx hooks program input).program
        { before with journal := [], intents := [], transitions := ∅, outboxes := ∅, draft := {}, writes := [], completionBase := before.nextCompletion } := by
      rw [inputCtx_program]
      exact holds
    have done := input_carries contract phases facts pipeline framing based runs
      (advanceClock_keeps phases.toBodyPhases entered clocked) (advanceClock_between (reset_between committed) clocked)
      stepped settling
    rw [inputCtx_program] at done made
    exact ⟨start, settled, done, made⟩

end Walk

end Keeps

end Kernel.Laws.Step
