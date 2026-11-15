module

public import Kernel.Laws.Step.Inputs

/-! # Laws of the step function: preservation through a step

`Step.step` keeps a state invariant `inv` for hooks that keep their contract (`HookContract`) when the phases of `Step`
keep it (`Phases`), the completion pipeline keeps it (`PipelineKeeps`, which `complete_keeps` gives from the pipeline's
own phases, `PipelinePhases`) and an input's reset keeps it: each body of `Step` keeps it by what `Kernel.Laws.Step` says
the committed body ran, and `step_keeps` composes them one closure micro-step at a time (`closureStep_keeps`), so a
proof of an invariant proves the obligations and never opens `Kernel.Step`. The pipeline is a premise of the walk
because an invariant of an input's end facts holds across it only as a unit (`Kernel.Laws.Step.Ends`). It reads no body
itself. Nothing executable imports this module.
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

section Keeps

variable {hooks : Hooks} {inv : Program → State → Prop}

/-! ### The bodies of `Step`

Each phase keeps `inv` when the hooks and state operations it runs keep their obligations, read from what
`Kernel.Laws.Step` says each committed body ran. -/

theorem advanceClock_keeps (phases : ClosurePhases inv) {program : Program} {at? : Option Nat} {state after : State}
    (holds : inv program state) (ran : advanceClock at? state = .ok after) : inv program after := by
  rcases advanceClock_ok ran with same | ⟨atMs, moved⟩
  · exact same ▸ holds
  · exact moved ▸ phases.clock _ _ _ holds

theorem continueAfter_keeps {src : Program → State → Prop} (contract : HookContract hooks inv src) {ctx : Ctx}
    {occurrence : Occurrence} {leave : Leave} {writes : List (String × Value)} {state after : State}
    (holds : inv ctx.program state) (stands : ScopeStands state occurrence.scope)
    (continues : Laws.Flow.LeavesFrom (src ctx.program) ctx.program state occurrence leave)
    (ran : continueAfter hooks ctx occurrence leave writes state = .ok after) : inv ctx.program after := by
  rcases continueAfter_ok ran with same | flowed | ⟨_, done⟩ | ⟨_, done | ended⟩
  · exact same ▸ holds
  · exact contract.outflow _ _ _ _ _ holds stands continues flowed
  · exact contract.instanceCompleted _ _ _ _ _ _ holds stands done
  · exact contract.handlerCompleted _ _ _ _ _ holds stands done
  · exact contract.handlerEnded _ _ _ _ _ holds stands ended

/-- The completion pipeline keeps `inv`: its continuation comes from where the completion did, read off the states
it ran through, which keep the scope occurrences and add no instance entry. -/
theorem complete_keeps (contract : HookContract hooks inv) (phases : ClosurePhases inv) (pipeline : PipelinePhases inv)
    (facts : StateFacts) : PipelineKeeps hooks inv := by
  intro ctx id leave writes rule state after holds free source ran
  rcases complete_ok ran with ⟨_, same⟩ | ⟨occurrence, sourceType, begun, pipeline⟩
  · exact same ▸ holds
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
  have free : ∀ (frame : State), (∀ item ∈ frame.openItems, item ∈ left.openItems) →
      ∀ item ∈ frame.openItems, item.occurrence ≠ (state.startReserved occurrence sourceType).2.id ∧
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
    obtain ⟨removedHolds, removedStands⟩ := pipeline.removeOccurrence _ written _ writtenHolds inWritten
      (free written writtenFrame.items)
    rw [identity] at removedHolds removedStands
    obtain ⟨entry, inside, named⟩ := removedStands
    obtain ⟨removedScopes, removedInstances⟩ := facts.removeOccurrence written id
    obtain ⟨endedScopes, endedInstances⟩ := facts.recordEnd (written.removeOccurrence id) (written.keyOf
      (state.startReserved occurrence sourceType).2) .cancelled
    exact continueAfter_keeps contract (pipeline.recordEnd _ _ _ _ removedHolds)
      ⟨entry, endedScopes.symm ▸ inside, named⟩
      (toWritten _ (fun entry member => removedInstances entry (endedInstances ▸ member))
        (fun entry member => removedScopes entry (endedScopes ▸ member))) continuing
  | left _ retaining continuing =>
    obtain ⟨retainedHolds, retainedFrame⟩ := contract.completed _ _ _ _ writtenHolds inWritten retaining
    obtain ⟨removedHolds, removedStands⟩ := pipeline.removeOccurrence _ _ _ retainedHolds
      (retainedFrame.begun _ inWritten begunFlag)
      (free _ fun item member => writtenFrame.items item (retainedFrame.items item member))
    rw [identity] at removedHolds removedStands
    obtain ⟨removedScopes, removedInstances⟩ := facts.removeOccurrence _ id
    exact pipeline.recordEnd _ _ _ _ (continueAfter_keeps contract removedHolds removedStands
      (toWritten _ (fun entry member => retainedFrame.instances _ (removedInstances entry member))
        (fun entry member => retainedFrame.scopes ▸ removedScopes entry member)) continuing)

theorem fireItem_keeps (contract : HookContract hooks inv) {ctx : Ctx} {item : OpenItem} {fired : Fired}
    {state after : State} (holds : inv ctx.program state) (open_ : item ∈ state.openItems)
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

/-- A begin keeps `inv`: it begins only in a scope occurrence that stands, and hands the begun occurrence on. -/
theorem begin_keeps (contract : HookContract hooks inv) (phases : ClosurePhases inv) (facts : StateFacts) {ctx : Ctx}
    {request : BeginRequest} {state after : State} (holds : inv ctx.program state) (admitted : Admitted state request)
    (origin : BeginOrigin inv ctx.program state request) (ran : begin hooks ctx request state = .ok after) :
    inv ctx.program after := by
  obtain ⟨sourceType, begun, occurrence, ⟨_, made, dispatched⟩⟩ := begin_ok ran
  have begunHolds := phases.begin _ state request (roleOf ctx.program request) sourceType holds (begin_scope ran) admitted
    roleOf_event (fun body => (roleOf_body.mp body).1) rfl origin
  have begunMember := facts.begun state request (roleOf ctx.program request) sourceType
  have newest := phases.newest _ state request (roleOf ctx.program request) sourceType holds
  have unrun := phases.unrun _ state request (roleOf ctx.program request) sourceType holds admitted
  have unowned := phases.unowned _ state request (roleOf ctx.program request) sourceType holds admitted
  simp only [made] at begunHolds begunMember newest unrun unowned
  obtain ⟨entry, standing, named⟩ := begin_scope ran
  have throws : occurrence.role = .element → Laws.State.BeginsThrow state request occurrence := fun role =>
    ⟨List.mem_map.mpr ⟨entry, standing, named⟩,
      fun id reserved => (admitted.2.1 id (by simp [Laws.State.names, reserved])).1, role⟩
  exact dispatch_keeps contract begunHolds.1 begunMember.1 begunMember.2 begunHolds.2
    (phases.bodied _ _ _ begunHolds.1 begunMember.1) newest unrun unowned
    (fun role => ⟨state, request, _, sourceType, holds, throws role, made⟩) dispatched

/-- A request an arrival or a start makes names no reservation. -/
theorem admitted_fresh {state : State} {element : ElementId} {scope : ScopeOccurrenceId} {incoming : Option FlowId}
    {trigger : StartTrigger} : Admitted state { element, scope, incoming, trigger } :=
  ⟨by simp [Laws.State.names], by simp [Laws.State.names], by simp [Laws.State.InnerPlaced]⟩

/-- The closure's next queued signal keeps `inv`: its work runs only once what it names stands, or changes nothing
(`Laws.Step`'s queued work whose target is gone). -/
theorem signal_keeps (contract : HookContract hooks inv) (phases : ClosurePhases inv) (facts : StateFacts)
    (pipeline : PipelineKeeps hooks inv) {ctx : Ctx}
    {queue : State} {next : Signal} {rest : List Signal} {after : State} (holds : inv ctx.program queue)
    (heads : queue.signals = next :: rest)
    (ran : dispatchSignal hooks ctx next { queue with signals := rest } = .ok after) : inv ctx.program after := by
  have popped : inv ctx.program { queue with signals := rest } := phases.dequeue _ _ _ holds (heads ▸ List.sublist_cons_self next rest)
  have head : next ∈ queue.signals := by simp [heads]
  have stands : ∀ id, (∃ occurrence, State.occurrence? { queue with signals := rest } id = some occurrence) →
      OccurrenceStands { queue with signals := rest } id := fun id ⟨_, found⟩ => by
    obtain ⟨member, same⟩ := facts.found _ _ _ found
    exact ⟨_, member, same⟩
  cases dispatchSignal_ok ran with
  | onArm host scope ran =>
    obtain ⟨hostIssued, scopeIssued, hosted⟩ := phases.armIssued _ _ _ _ _ holds head
    exact contract.arm _ _ _ _ _ _ popped (stands _ (host hostIssued)) (scope scopeIssued) hosted ran
  | onArmScope scope ran => exact contract.armScope _ _ _ _ popped (scope (phases.armScopeIssued _ queue _ holds head)) ran
  | onArmGateway occurrence scope ran =>
    obtain ⟨occurrenceIssued, scopeIssued, hosted⟩ := phases.armGatewayIssued _ _ _ _ _ holds head
    exact contract.armGateway _ _ _ _ _ _ popped (stands _ (occurrence occurrenceIssued)) (scope scopeIssued) hosted ran
  | onRaise ran =>
    obtain ⟨raisable, settled⟩ := phases.raisable _ _ _ _ _ holds heads
    exact contract.raise _ _ _ _ _ popped raisable settled ⟨queue, holds, heads, rfl⟩ ran
  | onBegin ran =>
    exact begin_keeps contract phases facts popped (phases.admittedSignal _ _ _ _ holds heads)
      (.inr ⟨queue, holds, .inl ⟨rest, heads, rfl⟩⟩) ran
  | onComplete ran =>
    exact pipeline _ _ _ _ _ _ _ popped (fun request queued => phases.completeQueued _ _ _ _ _ _ holds head
      request (Laws.State.Queued.shrink (before := queue) (after := { queue with signals := rest })
        (by rw [heads]; exact List.sublist_cons_self _ _) (.refl _) queued))
      (fun occurrence member named => ⟨queue, holds, fun _ kept => kept, fun _ kept => kept,
        .inl ⟨occurrence, member, rfl, rfl, rfl⟩, fun selected same flow inside => .inr ⟨selected, _, _, inside,
          .inl (by rw [named, ← same]; exact head)⟩⟩) ran
  | onWrite stands ran => exact (contract.writeOutputs _ _ _ _ _ _ popped stands ran).1
  | onRemove stands ran => exact contract.removeVariables _ _ _ _ _ popped stands ran
  | onOccur stands ran =>
    obtain ⟨reserved, free⟩ := phases.reserve _ _ _ _ popped stands ⟨queue, holds, .inl ⟨_, _, _, _, head⟩⟩
    obtain ⟨occurrences, element, scope, placed⟩ := facts.reserve { queue with signals := rest } _ _
    obtain ⟨issue, scopes, instances⟩ := placed
    refine pipeline _ _ _ _ _ _ _ reserved free (fun occurrence member named => ?_) ran
    rw [occurrences] at member
    rcases List.mem_append.mp member with old | new
    · have := phases.issued _ _ _ popped old
      rw [named, issue] at this
      exact absurd this (Nat.lt_irrefl _)
    rw [List.mem_singleton.mp new]
    exact ⟨queue, holds, fun entry kept => instances ▸ kept, fun entry kept => scopes ▸ kept,
      .inr ⟨_, _, _, by rw [element, scope]; exact head⟩, fun selected same flow inside =>
        .inr ⟨selected, _, _, inside, .inr (by rw [element, scope, ← same]; exact head)⟩⟩
  | onCancel => exact phases.cancel _ _ _ popped
  | onFire fired =>
    rcases fired with ⟨item, open_, ran⟩ | same
    · exact fireItem_keeps contract popped open_ ran
    · exact same ▸ popped
  | onEndInstance => exact phases.endInstance _ _ _ _ popped (phases.endRecorded _ queue _ _ holds head)
  | onCompensate stands ran =>
    exact contract.compensate _ _ _ _ _ _ _ _ popped stands (fun _ same => phases.resumable _ _ _ _ _ _ _ _ holds
      (same ▸ heads)) (fun _ _ _ same => ⟨queue, holds, .inr (.inl ⟨_, _, _, _, _, _, same ▸ head⟩)⟩)
      ⟨queue, holds, heads, rfl⟩ ran
  | onCompensationFailed stands ran => exact contract.failCompensation _ _ _ _ _ _ _ popped stands ran

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

/-- A parked join offered again keeps `inv`: its gateway's hook ran on the state the closure reached, for an occurrence
that stands. -/
theorem reoffer_keeps (contract : HookContract hooks inv) (phases : ClosurePhases inv) (facts : StateFacts) {ctx : Ctx}
    {state : State} {gateway : ElementId} {scope : ScopeOccurrenceId} {offered : State} (holds : inv ctx.program state)
    (ran : reoffer? hooks ctx state = .ok (some (gateway, scope, offered))) : inv ctx.program offered := by
  obtain ⟨_, occurrence, _, rest⟩ := reoffer_ok ran
  obtain ⟨_, ⟨waiting, parked, named, gateway⟩, found, offering⟩ := rest
  obtain ⟨element, targeted, isGateway⟩ := gateway
  obtain ⟨member, same⟩ := facts.found _ _ _ found
  exact contract.arriveGateway _ _ _ _ _ _ holds member
    (phases.parkedBegun _ _ _ _ holds parked member (same.trans named.symm))
    ⟨element, isGateway, .inr ⟨waiting, parked, named.trans same.symm, targeted⟩⟩ offering

theorem transition_keeps (contract : HookContract hooks inv) (phases : ClosurePhases inv) {ctx : Ctx}
    {transition : State → Outcome} (runs : RunsTransition hooks ctx transition) {state after : State}
    (holds : inv ctx.program state) (ran : transition state = .ok after) : inv ctx.program after := by
  rcases runs with ⟨data, same⟩ | ⟨data, same⟩ | fires
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
  · obtain ⟨_, _, picked, fired⟩ := fires _ _ ran
    rcases picked with open_ | ⟨_, delivered⟩
    · exact fireItem_keeps contract holds open_ fired
    · exact fireItem_keeps contract holds (contract.delivered _ _ _ _ _ delivered) fired

/-! ### The closure -/

private theorem foldlM_keeps {α : Type} {program : Program} {f : State → α → Outcome}
    (each : ∀ state a after, inv program state → f state a = .ok after → inv program after) :
    ∀ (items : List α) (state after : State), inv program state → items.foldlM f state = .ok after → inv program after
  | [], state, after, holds, ran => by
    simp only [List.foldlM_nil] at ran
    exact (Except.ok.inj ran) ▸ holds
  | a :: rest, state, after, holds, ran => by
    simp only [List.foldlM_cons] at ran
    obtain ⟨mid, stepped, ran⟩ := bind_ok ran
    exact foldlM_keeps each rest mid after (each _ _ _ holds stepped) ran

theorem conclude_keeps (contract : HookContract hooks inv) (phases : ClosurePhases inv) {ctx : Ctx} {cause : Cause}
    {element : Option ElementId} {owner : ScopeOccurrenceId} {state after : State} (holds : inv ctx.program state)
    (ran : conclude hooks ctx cause element owner state = .ok after) : inv ctx.program after := by
  obtain ⟨notified, notifying, written⟩ := conclude_ok ran
  have journalled := phases.journal _ state ⟨cause, element, owner, state.draft.started, state.draft.ended⟩ holds
    (by simp) (by simp)
  exact contract.written _ _ _ _ (foldlM_keeps (fun _ _ _ kept ran => contract.cancelled _ _ _ _ kept ran) _ _ _
    journalled notifying) written

theorem absorb_keeps (phases : ClosurePhases inv) (pipeline : PipelineKeeps hooks inv) {ctx : Ctx} {before : Nat}
    {state after : State} (holds : inv ctx.program state) (ran : absorb hooks ctx before state = .ok after) :
    inv ctx.program after := by
  rcases absorb_ok ran with same | ⟨_, _, _, absorbed⟩
  · exact same ▸ holds
  · obtain ⟨_, sole, completed⟩ := absorbed
    have queued := List.mem_of_mem_drop (i := before) (sole ▸ List.mem_singleton_self _)
    exact pipeline _ _ _ _ _ _ _ (phases.dequeue _ _ _ holds (List.take_sublist _ _))
      (fun request inQueue => phases.completeQueued _ _ _ _ _ _ holds queued request
        (Laws.State.Queued.shrink (before := state) (after := { state with signals := state.signals.take before })
          (List.take_sublist _ _) (.refl _) inQueue))
      (fun occurrence member named => ⟨state, holds, fun _ kept => kept, fun _ kept => kept,
        .inl ⟨occurrence, member, rfl, rfl, rfl⟩, fun selected same flow inside => .inr ⟨selected, _, _, inside,
          .inl (by rw [named, ← same]; exact queued)⟩⟩) completed

/-- A micro-step whose body keeps `inv` keeps it. -/
theorem microStep_keeps (contract : HookContract hooks inv) (phases : ClosurePhases inv) (pipeline : PipelineKeeps hooks inv)
    {ctx : Ctx} {cause : Cause} {element : Option ElementId} {owner : ScopeOccurrenceId} {body : State → Outcome}
    {state after : State} (byBody : ∀ next, body state = .ok next → inv ctx.program next)
    (ran : microStep hooks ctx cause element owner body state = .ok after) : inv ctx.program after := by
  obtain ⟨next, absorbed, body_, ⟨absorbed_, concluded⟩⟩ := microStep_ok ran
  exact conclude_keeps contract phases (absorb_keeps phases pipeline (byBody _ body_) absorbed_) concluded

theorem moveToken_keeps (contract : HookContract hooks inv) (phases : ClosurePhases inv) (facts : StateFacts)
    (pipeline : PipelineKeeps hooks inv) {ctx : Ctx} {token : Token} {state after : State} (holds : inv ctx.program state)
    (admitted : ∀ request, token = .begin request → Admitted state request)
    (taken : ∃ queue, inv ctx.program queue ∧ TokenTaken ctx.program queue token state)
    (ran : moveToken hooks ctx token state = .ok after) : inv ctx.program after := by
  obtain ⟨queue, held, taken⟩ := taken
  cases token with
  | flow flow scope =>
    refine microStep_keeps contract phases pipeline (fun next arrived => ?_) (moveToken_flow ran)
    obtain ⟨_, target, begun⟩ := arrive_ok arrived
    exact begin_keeps contract phases facts holds admitted_fresh (.inl ⟨rfl, rfl, .inl ⟨queue, flow, held, target, taken⟩⟩)
      begun
  | begin request =>
    exact microStep_keeps contract phases pipeline
      (fun _ dispatched => begin_keeps contract phases facts holds (admitted request rfl) (.inr ⟨queue, held, .inr taken⟩)
        (dispatchBegin_ok dispatched))
      (moveToken_begin ran)

/-- A closure micro-step keeps `inv`: a queued signal's, a moved token's, an idle scope occurrence's completion, a parked
join's offer and the instance's completion. -/
theorem closureStep_keeps (contract : HookContract hooks inv) (phases : ClosurePhases inv) (facts : StateFacts)
    (pipeline : PipelineKeeps hooks inv) {ctx : Ctx} {state after : State} (holds : inv ctx.program state)
    (step : ClosureStep hooks ctx state after) : inv ctx.program after := by
  cases step with
  | signal _ queued ran =>
    exact microStep_keeps contract phases pipeline
      (fun _ dispatched => signal_keeps contract phases facts pipeline holds queued dispatched) ran
  | token _ quiet next ran =>
    exact moveToken_keeps contract phases facts pipeline (phases.untoken _ _ _ holds (nextToken_rest next))
      (fun request same => phases.admittedToken _ _ _ _ holds (same ▸ (nextToken_shape next).imp_left (·.2)))
      ⟨_, holds, quiet, _, nextToken_shape next, rfl⟩ ran
  | idle _ _ _ idle ran =>
    exact microStep_keeps contract phases pipeline
      (fun _ completed => completeIdleScope_keeps contract facts holds (idleScope_mem idle) completed) ran
  | reoffer _ _ _ _ offered ran =>
    refine microStep_keeps contract phases pipeline ?_ ran
    intro next made
    simp only [Except.ok.injEq] at made
    exact made ▸ reoffer_keeps contract phases facts holds offered
  | finish _ _ _ _ _ _ ran =>
    refine microStep_keeps contract phases pipeline ?_ ran
    intro next ended
    simp only [Except.ok.injEq] at ended
    exact ended ▸ phases.endInstance _ _ _ _ holds (by simp)

/-- The closure keeps `inv`. -/
theorem settle_keeps (contract : HookContract hooks inv) (phases : ClosurePhases inv) (facts : StateFacts)
    (pipeline : PipelineKeeps hooks inv) {ctx : Ctx} :
    ∀ (fuel work : Nat) (state after : State), inv ctx.program state → settle hooks ctx fuel work state = .ok after →
      inv ctx.program after :=
  settle_induction (inv ctx.program) fun _ _ holds step => closureStep_keeps contract phases facts pipeline holds step

/-- `Step.step` on a running instance settles in a state that keeps `inv` of the program it runs, whose journal reversed
(`Step.orderJournal`) is the committed state's, for hooks that keep their contract, when the input's start keeps it.
It needs no `Phases.runOrder`, so an invariant that reads the order of the journal's facts holds there. -/
theorem running_settles (contract : HookContract hooks inv) (phases : ClosurePhases inv) (facts : StateFacts)
    (pipeline : PipelineKeeps hooks inv) {program : Program} {before : State} {input : Input} {after : State}
    (holds : inv program { before with journal := [], outbox := [], draft := {}, writes := [] })
    (ran : step hooks program (some before) input = .ok after) :
    ∃ settled, inv program settled ∧ after = { settled with journal := settled.journal.reverse } := by
  rcases step_ok ran with ⟨_, _, fresh, _⟩ | ⟨_, _, runs, ran⟩
  · simp at fresh
  · obtain ⟨state, start, moved, rest⟩ := onRunning_ok ran
    obtain ⟨settled, present, _, rest⟩ := rest
    obtain ⟨clocked, stepped, settling, made⟩ := rest
    obtain rfl := Option.some.inj present
    have entered : inv (inputCtx hooks program input).program
        { before with journal := [], outbox := [], draft := {}, writes := [] } := by
      rw [inputCtx_program]
      exact holds
    have started := advanceClock_keeps phases entered clocked
    have movedHolds := microStep_keeps contract phases pipeline
      (fun _ transitioned => transition_keeps contract phases runs started transitioned) stepped
    have done := settle_keeps contract phases facts pipeline _ _ _ _ movedHolds settling
    rw [inputCtx_program] at done
    exact ⟨settled, done, made⟩

/-- `Step.step` on a running instance keeps `inv` of the program it runs for hooks that keep their contract, when the
input's start keeps it: the before-state with an empty journal, outbox, draft and write log. An invariant relative to
the before-state may hold there though not of the before-state itself. A start never runs here, so `inv` need not hold
of a fresh instance. -/
theorem running_keeps (contract : HookContract hooks inv) (phases : Phases inv) (facts : StateFacts)
    (pipeline : PipelineKeeps hooks inv) {program : Program} {before : State} {input : Input} {after : State}
    (holds : inv program { before with journal := [], outbox := [], draft := {}, writes := [] })
    (ran : step hooks program (some before) input = .ok after) : inv program after := by
  obtain ⟨settled, kept, made⟩ := running_settles contract phases.toClosurePhases facts pipeline holds ran
  exact made ▸ phases.runOrder _ _ kept

/-- `Step.step` settles in a state that keeps `inv` of the program it runs, whose journal reversed is the committed
state's, for hooks that keep their contract, from a before-state that keeps it, or, for a start, when a fresh instance
with its root's Event Sub-Process starts queued for arming keeps it. -/
theorem step_settles (contract : HookContract hooks inv) (phases : ClosurePhases inv) (facts : StateFacts)
    (pipeline : PipelineKeeps hooks inv)
    (reset : ∀ program state, inv program state →
      inv program { state with journal := [], outbox := [], draft := {}, writes := [] }) {program : Program}
    (initial : ∀ instanceId variables businessKey,
      inv program ((State.initial instanceId variables businessKey).signal (.armScope State.root)))
    {before : Option State} {input : Input} {after : State} (entry : ∀ state, before = some state → inv program state)
    (ran : step hooks program before input = .ok after) :
    ∃ settled, inv program settled ∧ after = { settled with journal := settled.journal.reverse } := by
  cases before with
  | some state => exact running_settles contract phases facts pipeline (reset _ _ (entry state rfl)) ran
  | none =>
    rcases step_ok ran with ⟨payload, rfl, _, ⟨_, _, _, settled, clocked, stepped, settling, made, chosen⟩⟩ | ⟨_, _, _, ran⟩
    · have fresh : inv (inputCtx hooks program (.start payload)).program
          ((State.initial payload.instanceId payload.variables payload.businessKey).signal (.armScope State.root)) := by
        rw [inputCtx_program]
        exact initial _ _ _
      obtain ⟨fired, admittedFired, picked⟩ := chosen
      rw [admittedStartsFired_eq] at admittedFired
      have firedRoot : hooks.startsFired (inputCtx hooks program (.start payload)) payload = .ok fired := by
        cases admitting : admitValues (payload.variables.map (·.2)) <;>
          simp_all [SeqRight.seqRight, Except.bind]
      have rooted := contract.startsFired _ _ _ firedRoot _ (Laws.Hooks.chooseStart_mem picked)
      have moved := microStep_keeps contract phases pipeline
        (fun _ begun => begin_keeps contract phases facts (advanceClock_keeps phases fresh clocked) admitted_fresh
          (.inl ⟨rfl, rfl, .inr ⟨rfl, rooted⟩⟩) begun)
        stepped
      have done := settle_keeps contract phases facts pipeline _ _ _ _ moved settling
      rw [inputCtx_program] at done
      exact ⟨settled, done, made⟩
    · obtain ⟨_, _, rest⟩ := onRunning_ok ran
      obtain ⟨_, _, present, _⟩ := rest
      simp at present

/-- `Step.step` keeps `inv` of the program it runs for hooks that keep their contract, from a before-state that keeps
it, or, for a start, when a fresh instance with its root's Event Sub-Process starts queued for arming keeps it. -/
theorem step_keeps (contract : HookContract hooks inv) (phases : Phases inv) (facts : StateFacts)
    (pipeline : PipelineKeeps hooks inv)
    (reset : ∀ program state, inv program state →
      inv program { state with journal := [], outbox := [], draft := {}, writes := [] }) {program : Program}
    (initial : ∀ instanceId variables businessKey,
      inv program ((State.initial instanceId variables businessKey).signal (.armScope State.root)))
    {before : Option State} {input : Input} {after : State} (entry : ∀ state, before = some state → inv program state)
    (ran : step hooks program before input = .ok after) : inv program after := by
  obtain ⟨settled, kept, made⟩ := step_settles contract phases.toClosurePhases facts pipeline reset initial entry ran
  exact made ▸ phases.runOrder _ _ kept

end Keeps

end Kernel.Laws.Step
