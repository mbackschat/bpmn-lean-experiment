module

public import Kernel.Laws.Step

/-! # Laws of the step function: preservation through a step

`Step.step` keeps a state invariant `inv` for hooks that keep their contract (`HookContract`) when the phases of `Step`
keep it (`Phases`): `step_keeps` composes the decomposition and the per-body preservation of `Kernel.Laws.Step`
through `settle_preserves`, so a proof of an invariant proves the obligations and never opens `Kernel.Step`. It reads
no body itself. Nothing executable imports this module.
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
    refine microStep_keeps contract phases facts (fun next dispatched => ?_) (moveToken_begin ran)
    obtain ⟨_, _, ran⟩ := perform_ok (dispatchSignal_eq ▸ dispatched)
    exact begin_keeps contract phases facts holds (beginWork_run ▸ ran)

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
