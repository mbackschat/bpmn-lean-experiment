module

public import Kernel.Laws.Step

/-! # Laws of the step function: preservation through a step

`Step.step` keeps a state invariant `inv` for hooks that keep their contract (`HookContract`) when the phases of `Step`
keep it (`Phases`): each body of `Step` keeps it by what `Kernel.Laws.Step` says the committed body ran, and
`step_keeps` composes them through `settle_preserves`, so a proof of an invariant proves the obligations and never
opens `Kernel.Step`. It reads no body itself. Nothing executable imports this module.
-/

public section

namespace Kernel.Laws.Step

open Kernel Kernel.Step

/-! ## The closure from its bodies -/

/-- An invariant that a micro-step's body, its absorbed completion and its transition each preserve is preserved by
the micro-step. -/
theorem microStep_preserves {hooks : Hooks} {ctx : Ctx} {cause : Cause} {element : Option ElementId}
    {owner : ScopeOccurrenceId} {body : State → Outcome} (invariant : State → Prop)
    (byBody : ∀ state next, invariant state → body state = .ok next → invariant next)
    (byAbsorb : ∀ before state next, invariant state → absorb hooks ctx before state = .ok next → invariant next)
    (byConclude : ∀ state next, invariant state → conclude hooks ctx cause element owner state = .ok next →
      invariant next)
    {state after : State} (holds : invariant state)
    (ran : microStep hooks ctx cause element owner body state = .ok after) : invariant after := by
  obtain ⟨next, absorbed, body_, ⟨absorbed_, concluded⟩⟩ := microStep_ok ran
  exact byConclude _ _ (byAbsorb _ _ _ (byBody _ _ holds body_) absorbed_) concluded

/-- `settle_induction` from micro-step bodies: an invariant that every closure micro-step's body, absorbed completion
and transition preserve, from the state the micro-step starts in, is preserved by `Step.settle`. The bodies are a
queued signal's (`Step.dispatchSignal`), a moved token's (`Step.moveToken`, itself one micro-step), an idle scope
occurrence's completion, a parked join's offer and the instance's completion. -/
theorem settle_preserves {hooks : Hooks} {ctx : Ctx} (invariant : State → Prop)
    (bySignal : ∀ state next rest after, invariant state → state.signals = next :: rest →
      microStep hooks ctx (.signal (signalName next)) none State.root (dispatchSignal hooks ctx next)
        { state with signals := rest } = .ok after → invariant after)
    (byToken : ∀ state token rest after, invariant state → nextToken ctx state = some (token, rest) →
      moveToken hooks ctx token { state with tokens := rest } = .ok after → invariant after)
    (byIdle : ∀ state (scope : ScopeOccurrence) after, invariant state → idleScope? ctx state = some scope →
      microStep hooks ctx (.idle scope.id) scope.element scope.id (completeIdleScope hooks ctx scope) state = .ok after →
      invariant after)
    (byOffer : ∀ state gateway scope offered after, invariant state →
      reoffer? hooks ctx state = .ok (some (gateway, scope, offered)) →
      microStep hooks ctx (.idle scope) (some gateway) scope (fun _ => .ok offered) state = .ok after → invariant after)
    (byFinish : ∀ state after, invariant state → state.idle State.root = true →
      microStep hooks ctx (.idle State.root) none State.root (fun state => .ok (endInstance .completed none state))
        state = .ok after → invariant after) :
    ∀ (fuel work : Nat) (state after : State), invariant state → settle hooks ctx fuel work state = .ok after →
      invariant after :=
  settle_induction invariant fun _ _ holds stepped => by
    cases stepped with
    | signal _ signals ran => exact bySignal _ _ _ _ holds signals ran
    | token _ _ moved ran => exact byToken _ _ _ _ holds moved ran
    | idle _ _ _ idle ran => exact byIdle _ _ _ holds idle ran
    | reoffer _ _ _ _ offered ran => exact byOffer _ _ _ _ _ holds offered ran
    | finish _ _ _ _ _ quiet ran => exact byFinish _ _ holds quiet ran

section Keeps

variable {hooks : Hooks} {inv : State → Prop}

/-! ### The bodies of `Step`

Each phase keeps `inv` when the hooks and state operations it runs keep their obligations, read from what
`Kernel.Laws.Step` says each committed body ran. -/

theorem advanceClock_keeps (phases : Phases inv) {at? : Option Nat} {state after : State} (holds : inv state)
    (ran : advanceClock at? state = .ok after) : inv after := by
  rcases advanceClock_ok ran with same | ⟨atMs, moved⟩
  · exact same ▸ holds
  · exact moved ▸ phases.clock _ _ holds

theorem continueAfter_keeps (contract : HookContract hooks inv) {ctx : Ctx} {occurrence : Occurrence} {leave : Leave}
    {writes : List (String × Value)} {state after : State} (holds : inv state)
    (stands : ScopeStands state occurrence.scope) (ran : continueAfter hooks ctx occurrence leave writes state = .ok after) :
    inv after := by
  rcases continueAfter_ok ran with same | flowed | ⟨_, done⟩ | ⟨_, done | ended⟩
  · exact same ▸ holds
  · exact contract.outflow _ _ _ _ _ holds stands flowed
  · exact contract.instanceCompleted _ _ _ _ _ _ holds stands done
  · exact contract.handlerCompleted _ _ _ _ _ holds stands done
  · exact contract.handlerEnded _ _ _ _ _ holds stands ended

/-- The completion pipeline keeps `inv`. -/
theorem complete_keeps (contract : HookContract hooks inv) (phases : Phases inv) (facts : StateFacts) {ctx : Ctx}
    {id : Nat} {leave : Leave} {writes : List (String × Value)} {rule : WriteRule} {state after : State}
    (holds : inv state) (ran : complete hooks ctx id leave writes rule state = .ok after) : inv after := by
  rcases complete_ok ran with ⟨_, same⟩ | ⟨occurrence, sourceType, begun, pipeline⟩
  · exact same ▸ holds
  obtain ⟨left, selected, written, pipeline⟩ := pipeline
  obtain ⟨found, _, leaving, pipeline⟩ := pipeline
  obtain ⟨made, _, writing, finishes⟩ := pipeline
  obtain ⟨member, named⟩ := facts.found _ _ _ found
  obtain ⟨begunMember, begunFlag, begunId, reservation⟩ := facts.startReserved state occurrence sourceType member
  obtain ⟨begunScope, reservedScopes⟩ := reservation
  have reservedHolds := phases.startReserved state occurrence sourceType holds member
  have closedHolds := phases.closeOwnItems _ id reservedHolds
  obtain ⟨closedFrame, closedFree⟩ := facts.closeOwnItems (state.startReserved occurrence sourceType).1 id
  subst made
  have inClosed := closedFrame.begun _ begunMember begunFlag
  obtain ⟨leftHolds, leftFrame, detached⟩ := contract.leave _ _ _ _ closedHolds inClosed leaving
  have stands : ScopeStands left (state.startReserved occurrence sourceType).2.scope := by
    obtain ⟨entry, inside, same⟩ := phases.housed state occurrence holds member
    refine ⟨entry, ?_, same.trans begunScope.symm⟩
    rw [leftFrame.scopes, closedFrame.scopes, reservedScopes]
    exact inside
  obtain ⟨writtenHolds, writtenFrame⟩ := contract.writeOutputs _ _ _ _ _ _ leftHolds stands writing
  have identity : (state.startReserved occurrence sourceType).2.id = id := begunId.trans named
  have free : ∀ (frame : State), (∀ item ∈ frame.openItems, item ∈ left.openItems) →
      ∀ item ∈ frame.openItems, item.occurrence ≠ (state.startReserved occurrence sourceType).2.id ∧
        item.attachedTo ≠ some (state.startReserved occurrence sourceType).2.id := fun frame within item member => by
    rw [identity]
    have inLeft := within item member
    exact ⟨closedFree item (leftFrame.items item inLeft), identity ▸ detached item inLeft⟩
  have inWritten := writtenFrame.begun _ (leftFrame.begun _ inClosed begunFlag) begunFlag
  cases finishes with
  | raised continuing =>
    obtain ⟨removedHolds, removedStands⟩ := phases.removeOccurrence written _ writtenHolds inWritten
      (free written writtenFrame.items)
    rw [identity] at removedHolds removedStands
    obtain ⟨entry, inside, named⟩ := removedStands
    exact continueAfter_keeps contract (phases.recordEnd _ _ _ removedHolds)
      ⟨entry, (facts.recordEnd _ _ _).symm ▸ inside, named⟩ continuing
  | left _ retaining continuing =>
    obtain ⟨retainedHolds, retainedFrame⟩ := contract.completed _ _ _ _ writtenHolds inWritten retaining
    obtain ⟨removedHolds, removedStands⟩ := phases.removeOccurrence _ _ retainedHolds
      (retainedFrame.begun _ inWritten begunFlag)
      (free _ fun item member => writtenFrame.items item (retainedFrame.items item member))
    rw [identity] at removedHolds removedStands
    exact phases.recordEnd _ _ _ (continueAfter_keeps contract removedHolds removedStands continuing)

theorem fireItem_keeps (contract : HookContract hooks inv) {ctx : Ctx} {item : OpenItem} {fired : Fired}
    {state after : State} (holds : inv state) (open_ : item ∈ state.openItems)
    (ran : fireItem hooks ctx item fired state = .ok after) : inv after := by
  rcases fireItem_ok ran with ⟨_, _, ran⟩ | ran
  · exact contract.triggerActivity _ _ _ _ _ _ _ holds open_ ran
  · exact contract.trigger _ _ _ _ _ holds open_ ran

/-- A begun occurrence's dispatch to its element's hook keeps `inv`. -/
theorem dispatch_keeps (contract : HookContract hooks inv) {ctx : Ctx} {occurrence : Occurrence} {entry : ScopeEntry}
    {trigger : StartTrigger} {state after : State} (holds : inv state) (member : occurrence ∈ state.occurrences)
    (ran : dispatch hooks ctx occurrence entry trigger state = .ok after) : inv after := by
  cases dispatch_ok ran with
  | atStart ran => exact contract.arriveStart _ _ _ _ _ _ _ holds member ran
  | atActivity ran => exact contract.arriveActivity _ _ _ _ _ _ holds member ran
  | atMultiInstance ran => exact contract.arriveMultiInstance _ _ _ _ _ _ _ holds member ran
  | atScope ran => exact contract.arriveScope _ _ _ _ _ _ _ holds member ran
  | atGateway ran => exact contract.arriveGateway _ _ _ _ _ _ holds member ran
  | atCatch ran => exact contract.arriveCatch _ _ _ _ _ _ _ holds member ran
  | atThrow ran => exact contract.arriveThrow _ _ _ _ _ _ _ holds member ran
  | atLink ran => exact contract.arriveLink _ _ _ _ _ _ holds member ran

/-- A begin keeps `inv`: it begins only in a scope occurrence that stands, and hands the begun occurrence on. -/
theorem begin_keeps (contract : HookContract hooks inv) (phases : Phases inv) (facts : StateFacts) {ctx : Ctx}
    {request : BeginRequest} {state after : State} (holds : inv state)
    (ran : begin hooks ctx request state = .ok after) : inv after := by
  obtain ⟨sourceType, begun, occurrence, ⟨_, made, dispatched⟩⟩ := begin_ok ran
  have begunHolds := phases.begin state request (roleOf ctx.program request) sourceType holds (begin_scope ran)
  have begunMember := facts.begun state request (roleOf ctx.program request) sourceType
  simp only [made] at begunHolds begunMember
  exact dispatch_keeps contract begunHolds begunMember dispatched

/-- The closure's next queued signal keeps `inv`: its work runs only once what it names stands, or changes nothing
(`Laws.Step`'s queued work whose target is gone). -/
theorem signal_keeps (contract : HookContract hooks inv) (phases : Phases inv) (facts : StateFacts) {ctx : Ctx}
    {queue : State} {next : Signal} {rest : List Signal} {after : State} (holds : inv queue)
    (heads : queue.signals = next :: rest)
    (ran : dispatchSignal hooks ctx next { queue with signals := rest } = .ok after) : inv after := by
  have popped : inv { queue with signals := rest } := phases.dequeue _ _ holds (heads ▸ List.sublist_cons_self next rest)
  have head : next ∈ queue.signals := by simp [heads]
  have stands : ∀ id, (∃ occurrence, State.occurrence? { queue with signals := rest } id = some occurrence) →
      OccurrenceStands { queue with signals := rest } id := fun id ⟨_, found⟩ => by
    obtain ⟨member, same⟩ := facts.found _ _ _ found
    exact ⟨_, member, same⟩
  cases dispatchSignal_ok ran with
  | onArm host scope ran =>
    obtain ⟨hostIssued, scopeIssued⟩ := phases.armIssued _ _ _ _ holds head
    exact contract.arm _ _ _ _ _ _ popped (stands _ (host hostIssued)) (scope scopeIssued) ran
  | onArmScope scope ran => exact contract.armScope _ _ _ _ popped (scope (phases.armScopeIssued queue _ holds head)) ran
  | onArmGateway occurrence scope ran =>
    obtain ⟨occurrenceIssued, scopeIssued⟩ := phases.armGatewayIssued _ _ _ _ holds head
    exact contract.armGateway _ _ _ _ _ _ popped (stands _ (occurrence occurrenceIssued)) (scope scopeIssued) ran
  | onRaise ran => exact contract.raise _ _ _ _ _ popped ran
  | onBegin ran => exact begin_keeps contract phases facts popped ran
  | onComplete ran => exact complete_keeps contract phases facts popped ran
  | onWrite stands ran => exact (contract.writeOutputs _ _ _ _ _ _ popped stands ran).1
  | onRemove stands ran => exact contract.removeVariables _ _ _ _ _ popped stands ran
  | onOccur stands ran =>
    exact complete_keeps contract phases facts (phases.reserve _ _ _ popped stands) ran
  | onCancel => exact phases.cancel _ _ popped
  | onFire fired =>
    rcases fired with ⟨item, open_, ran⟩ | same
    · exact fireItem_keeps contract popped open_ ran
    · exact same ▸ popped
  | onEndInstance => exact phases.endInstance _ _ _ popped (phases.endRecorded queue _ _ holds head)
  | onCompensate stands ran => exact contract.compensate _ _ _ _ _ _ _ _ popped stands ran
  | onCompensationFailed stands ran => exact contract.failCompensation _ _ _ _ _ _ _ popped stands ran

theorem completeIdleScope_keeps (contract : HookContract hooks inv) (facts : StateFacts) {ctx : Ctx}
    {scope : ScopeOccurrence} {state after : State} (holds : inv state) (member : scope ∈ state.scopes)
    (ran : completeIdleScope hooks ctx scope state = .ok after) : inv after := by
  obtain ⟨_, occurrence, _, ⟨found, completed⟩⟩ := completeIdleScope_ok ran
  obtain ⟨owned, _⟩ := facts.found _ _ _ found
  rcases completed with ⟨_, _, ran⟩ | ⟨_, _, ran⟩ | ⟨_, _, _, ran⟩
  · exact contract.completeScope _ _ _ _ _ _ _ holds member owned ran
  · exact contract.completeCall _ _ _ _ _ _ _ holds member owned ran
  · exact contract.completeBody _ _ _ _ _ _ _ holds owned ran

/-- A parked join offered again keeps `inv`: its gateway's hook ran on the state the closure reached, for an occurrence
that stands. -/
theorem reoffer_keeps (contract : HookContract hooks inv) (facts : StateFacts) {ctx : Ctx} {state : State}
    {gateway : ElementId} {scope : ScopeOccurrenceId} {offered : State} (holds : inv state)
    (ran : reoffer? hooks ctx state = .ok (some (gateway, scope, offered))) : inv offered := by
  obtain ⟨_, _, _, ⟨_, found, offering⟩⟩ := reoffer_ok ran
  exact contract.arriveGateway _ _ _ _ _ _ holds (facts.found _ _ _ found).1 offering

theorem transition_keeps (contract : HookContract hooks inv) (phases : Phases inv) {ctx : Ctx}
    {transition : State → Outcome} (runs : RunsTransition hooks ctx transition) {state after : State}
    (holds : inv state) (ran : transition state = .ok after) : inv after := by
  rcases runs with ⟨data, same⟩ | ⟨data, same⟩ | fires
  · subst same
    cases command_ok ran with
    | completeUserTask open_ ran => exact contract.completeUserTask _ _ _ _ _ _ _ holds open_ ran
    | retryIncident open_ ran => exact contract.retryIncident _ _ _ _ _ _ holds open_ ran
    | cancelIncidentProcess ran => exact contract.cancelIncidentProcess _ _ _ _ _ holds ran
    | write queued => exact queued ▸ phases.queueWrite _ _ _ _ holds
    | remove queued => exact queued ▸ phases.queueRemove _ _ _ holds
  · subst same
    obtain ⟨_, open_, ran⟩ := deliverEffectResult_ok ran
    exact contract.effectResult _ _ _ _ _ holds open_ ran
  · obtain ⟨_, _, picked, fired⟩ := fires _ _ ran
    rcases picked with open_ | ⟨_, delivered⟩
    · exact fireItem_keeps contract holds open_ fired
    · exact fireItem_keeps contract holds (contract.delivered _ _ _ _ _ delivered) fired

/-! ### The closure -/

private theorem foldlM_keeps {α : Type} {f : State → α → Outcome}
    (each : ∀ state a after, inv state → f state a = .ok after → inv after) :
    ∀ (items : List α) (state after : State), inv state → items.foldlM f state = .ok after → inv after
  | [], state, after, holds, ran => by
    simp only [List.foldlM_nil] at ran
    exact (Except.ok.inj ran) ▸ holds
  | a :: rest, state, after, holds, ran => by
    simp only [List.foldlM_cons] at ran
    obtain ⟨mid, stepped, ran⟩ := bind_ok ran
    exact foldlM_keeps each rest mid after (each _ _ _ holds stepped) ran

theorem conclude_keeps (contract : HookContract hooks inv) (phases : Phases inv) {ctx : Ctx} {cause : Cause}
    {element : Option ElementId} {owner : ScopeOccurrenceId} {state after : State} (holds : inv state)
    (ran : conclude hooks ctx cause element owner state = .ok after) : inv after := by
  obtain ⟨notified, notifying, written⟩ := conclude_ok ran
  have journalled := phases.journal state ⟨cause, element, owner, state.draft.started, state.draft.ended⟩ holds
    (by simp) (by simp)
  exact contract.written _ _ _ _ (foldlM_keeps (fun _ _ _ kept ran => contract.cancelled _ _ _ _ kept ran) _ _ _
    journalled notifying) written

theorem absorb_keeps (contract : HookContract hooks inv) (phases : Phases inv) (facts : StateFacts) {ctx : Ctx}
    {before : Nat} {state after : State} (holds : inv state) (ran : absorb hooks ctx before state = .ok after) :
    inv after := by
  rcases absorb_ok ran with same | ⟨_, _, _, absorbed⟩
  · exact same ▸ holds
  · obtain ⟨_, _, completed⟩ := absorbed
    exact complete_keeps contract phases facts (phases.dequeue _ _ holds (List.take_sublist _ _)) completed

/-- A micro-step whose body keeps `inv` keeps it. -/
theorem microStep_keeps (contract : HookContract hooks inv) (phases : Phases inv) (facts : StateFacts) {ctx : Ctx}
    {cause : Cause} {element : Option ElementId} {owner : ScopeOccurrenceId} {body : State → Outcome}
    {state after : State} (byBody : ∀ next, body state = .ok next → inv next)
    (ran : microStep hooks ctx cause element owner body state = .ok after) : inv after := by
  obtain ⟨next, absorbed, body_, ⟨absorbed_, concluded⟩⟩ := microStep_ok ran
  exact conclude_keeps contract phases (absorb_keeps contract phases facts (byBody _ body_) absorbed_) concluded

theorem moveToken_keeps (contract : HookContract hooks inv) (phases : Phases inv) (facts : StateFacts) {ctx : Ctx}
    {token : Token} {state after : State} (holds : inv state) (ran : moveToken hooks ctx token state = .ok after) :
    inv after := by
  cases token with
  | flow flow scope =>
    refine microStep_keeps contract phases facts (fun next arrived => ?_) (moveToken_flow ran)
    obtain ⟨_, _, begun⟩ := arrive_ok arrived
    exact begin_keeps contract phases facts holds begun
  | begin request =>
    exact microStep_keeps contract phases facts
      (fun _ dispatched => begin_keeps contract phases facts holds (dispatchBegin_ok dispatched)) (moveToken_begin ran)

/-- The closure keeps `inv`. -/
theorem settle_keeps (contract : HookContract hooks inv) (phases : Phases inv) (facts : StateFacts) {ctx : Ctx} :
    ∀ (fuel work : Nat) (state after : State), inv state → settle hooks ctx fuel work state = .ok after → inv after :=
  settle_preserves inv
    (fun _ _ _ _ holds queued ran => microStep_keeps contract phases facts
      (fun _ dispatched => signal_keeps contract phases facts holds queued dispatched) ran)
    (fun _ _ _ _ holds next ran => moveToken_keeps contract phases facts
      (phases.untoken _ _ holds (nextToken_rest next)) ran)
    (fun _ _ _ holds idle ran => microStep_keeps contract phases facts
      (fun _ completed => completeIdleScope_keeps contract facts holds (idleScope_mem idle) completed) ran)
    (fun _ _ _ _ _ holds offered ran => by
      refine microStep_keeps contract phases facts ?_ ran
      intro next made
      simp only [Except.ok.injEq] at made
      exact made ▸ reoffer_keeps contract facts holds offered)
    (fun _ _ holds _ ran => by
      refine microStep_keeps contract phases facts ?_ ran
      intro next ended
      simp only [Except.ok.injEq] at ended
      exact ended ▸ phases.endInstance _ _ _ holds (by simp))

/-- `Step.step` keeps `inv` for hooks that keep their contract, from a before-state that keeps it. -/
theorem step_keeps (contract : HookContract hooks inv) (phases : Phases inv) (facts : StateFacts) {program : Program}
    {before : Option State} {input : Input} {after : State} (entry : ∀ state, before = some state → inv state)
    (ran : step hooks program before input = .ok after) : inv after := by
  rcases step_ok ran with ⟨_, _, _, ⟨_, _, _, settled, clocked, stepped, settling, made⟩⟩ | ⟨_, _, runs, ran⟩
  · have moved := microStep_keeps contract phases facts
      (fun _ begun => begin_keeps contract phases facts (advanceClock_keeps phases (phases.initial _ _ _) clocked) begun)
      stepped
    exact made ▸ phases.runOrder _ (settle_keeps contract phases facts _ _ _ _ moved settling)
  · obtain ⟨state, start, moved, rest⟩ := onRunning_ok ran
    obtain ⟨settled, present, _, rest⟩ := rest
    obtain ⟨clocked, stepped, settling, made⟩ := rest
    have started := advanceClock_keeps phases (phases.reset _ (entry state present)) clocked
    have movedHolds := microStep_keeps contract phases facts
      (fun _ transitioned => transition_keeps contract phases runs started transitioned) stepped
    exact made ▸ phases.runOrder _ (settle_keeps contract phases facts _ _ _ _ movedHolds settling)

end Keeps

end Kernel.Laws.Step
