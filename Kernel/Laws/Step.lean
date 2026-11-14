module

public import Kernel.Step
public import Kernel.Laws.IL
import all Kernel.Step
import all Kernel.Step.Jobs
import all Kernel.Step.Stale

/-! # Laws of the step function

The `Step`-generic facts the proof wave composes, for every hooks record: how a micro-step decomposes into its body,
its absorbed completion and its transition; the induction principle of a closure, which reduces an invariant of
`Step.settle` to one closure micro-step at a time (`ClosureStep`); and how a flow token reaches the hook of the element
at the end of its flow. This is the one module that sees `Kernel.Step`'s bodies
([module table](../../docs/kernel/ARCHITECTURE-SPEC.md#modules-and-build-shape)); it names no feature, no registry and
no law of a feature, so a feature edit never rebuilds it. Nothing executable imports this module.

What the registered hooks do is `Kernel.Laws.Registry`'s and each feature's `Laws` module's; `Kernel.Proofs` composes
them with the facts here and never opens a body.
-/

public section

namespace Kernel.Laws.Step

open Kernel Kernel.Step

/-! ## Outcomes -/

private theorem bind_ok {α β ε : Type} {x : Except ε α} {f : α → Except ε β} {b : β} (ran : (x >>= f) = .ok b) :
    ∃ a, x = .ok a ∧ f a = .ok b := by
  cases x with
  | error failure => exact absurd ran (by simp [bind, Except.bind])
  | ok a => exact ⟨a, by simp, by simpa [bind, Except.bind] using ran⟩

/-- A transaction boundary changes only a failure: a committed outcome passes through it. -/
private theorem deferred_ok {program : Program} {state after : State} {outcome : Outcome}
    (ran : deferred program state outcome = .ok after) : outcome = .ok after := by
  unfold deferred at ran
  split at ran <;> (try split at ran) <;> simp_all

/-! ## Micro-steps -/

/-- A committed micro-step ran its body, absorbed the body's sole completion, if any, and concluded its transition. -/
theorem microStep_ok {hooks : Hooks} {ctx : Ctx} {cause : Cause} {element : Option ElementId}
    {owner : ScopeOccurrenceId} {body : State → Outcome} {state after : State}
    (ran : microStep hooks ctx cause element owner body state = .ok after) :
    ∃ next absorbed, body state = .ok next ∧ absorb hooks ctx state.signals.length next = .ok absorbed ∧
      conclude hooks ctx cause element owner absorbed = .ok after := by
  unfold microStep at ran
  obtain ⟨next, body_, ran⟩ := bind_ok ran
  obtain ⟨absorbed, absorbed_, ran⟩ := bind_ok ran
  exact ⟨next, absorbed, deferred_ok body_, deferred_ok absorbed_, deferred_ok ran⟩

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

/-! ## The closure

`ClosureStep hooks ctx before after`: `after` is what one micro-step of `Step.settle` commits from `before`, in the
order `settle` picks it: the next queued signal; else the next token (`Step.nextToken`); else an idle scope
occurrence (`Step.idleScope?`); else a parked join offered again (`Step.reoffer?`); else, once the root is idle, the
instance's completion. Each constructor names the micro-step's body, so a lane proves an invariant of the closure one
body at a time (`settle_induction`). -/

inductive ClosureStep (hooks : Hooks) (ctx : Ctx) : State → State → Prop where
  | signal {state after : State} {next : Signal} {rest : List Signal} :
      state.status = .running → state.signals = next :: rest →
      microStep hooks ctx (.signal (signalName next)) none State.root (dispatchSignal hooks ctx next)
        { state with signals := rest } = .ok after → ClosureStep hooks ctx state after
  | token {state after : State} {token : Token} {rest : List Token} :
      state.status = .running → state.signals = [] → nextToken ctx state = some (token, rest) →
      moveToken hooks ctx token { state with tokens := rest } = .ok after → ClosureStep hooks ctx state after
  | idle {state after : State} {scope : ScopeOccurrence} :
      state.status = .running → state.signals = [] → nextToken ctx state = none → idleScope? ctx state = some scope →
      microStep hooks ctx (.idle scope.id) scope.element scope.id (completeIdleScope hooks ctx scope) state = .ok after →
      ClosureStep hooks ctx state after
  | reoffer {state after offered : State} {gateway : ElementId} {scope : ScopeOccurrenceId} :
      state.status = .running → state.signals = [] → nextToken ctx state = none → idleScope? ctx state = none →
      reoffer? hooks ctx state = .ok (some (gateway, scope, offered)) →
      microStep hooks ctx (.idle scope) (some gateway) scope (fun _ => .ok offered) state = .ok after →
      ClosureStep hooks ctx state after
  | finish {state after : State} :
      state.status = .running → state.signals = [] → nextToken ctx state = none → idleScope? ctx state = none →
      reoffer? hooks ctx state = .ok none → state.idle State.root = true →
      microStep hooks ctx (.idle State.root) none State.root (fun state => .ok (endInstance .completed none state))
        state = .ok after → ClosureStep hooks ctx state after

/-- The induction principle of a closure: an invariant that every closure micro-step preserves is preserved by
`Step.settle`, whatever its fuel and work bounds; a closure that stops on either bound commits nothing. -/
theorem settle_induction {hooks : Hooks} {ctx : Ctx} (invariant : State → Prop)
    (preserved : ∀ before after, invariant before → ClosureStep hooks ctx before after → invariant after) :
    ∀ (fuel work : Nat) (state after : State), invariant state → settle hooks ctx fuel work state = .ok after →
      invariant after := by
  intro fuel
  induction fuel with
  | zero => intro work state after _ ran; simp [settle] at ran
  | succ fuel ih =>
    intro work state after holds ran
    unfold settle at ran
    split at ran
    · simp at ran
    split at ran
    · cases ran; exact holds
    have running : state.status = .running := by simpa using ‹¬(state.status != .running) = true›
    split at ran
    · obtain ⟨mid, stepped, ran⟩ := bind_ok ran
      exact ih _ _ _ (preserved _ _ holds (.signal running (by assumption) stepped)) ran
    · obtain ⟨mid, stepped, ran⟩ := bind_ok ran
      exact ih _ _ _ (preserved _ _ holds (.token running (by assumption) (by assumption) stepped)) ran
    · split at ran
      · obtain ⟨mid, stepped, ran⟩ := bind_ok ran
        exact ih _ _ _ (preserved _ _ holds (.idle running (by assumption) (by assumption) (by assumption) stepped)) ran
      · obtain ⟨found, offered, ran⟩ := bind_ok ran
        split at ran
        · obtain ⟨mid, stepped, ran⟩ := bind_ok ran
          exact ih _ _ _ (preserved _ _ holds
            (.reoffer running (by assumption) (by assumption) (by assumption) offered stepped)) ran
        · split at ran
          · exact preserved _ _ holds
              (.finish running (by assumption) (by assumption) (by assumption) offered (by assumption) ran)
          · cases ran; exact holds

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

/-! ## Routing a flow token -/

/-- A committed move of a flow token is one micro-step whose body routes the token along its flow. -/
theorem moveToken_flow {hooks : Hooks} {ctx : Ctx} {flow : FlowId} {scope : ScopeOccurrenceId} {state after : State}
    (ran : moveToken hooks ctx (.flow flow scope) state = .ok after) :
    microStep hooks ctx (.arrive flow) (ctx.program.target? flow) scope (arrive hooks ctx flow scope) state = .ok after := by
  simpa [moveToken] using ran

/-- A committed arrival begins an occurrence of the element at the end of the flow, in the token's scope occurrence. -/
theorem arrive_ok {hooks : Hooks} {ctx : Ctx} {flow : FlowId} {scope : ScopeOccurrenceId} {state next : State}
    (ran : arrive hooks ctx flow scope state = .ok next) :
    ∃ target, ctx.program.target? flow = some target ∧
      begin hooks ctx { element := target, scope, incoming := some flow } state = .ok next := by
  unfold arrive at ran
  split at ran
  · simp at ran
  · exact ⟨_, by assumption, ran⟩

/-- A committed begin issued the occurrence `State.beginOccurrence` makes, numbered under `Step.roleOf`, and dispatched
it to its element's hook. -/
theorem begin_ok {hooks : Hooks} {ctx : Ctx} {request : BeginRequest} {state next : State}
    (ran : begin hooks ctx request state = .ok next) :
    ∃ sourceType begun occurrence, ctx.program.sourceType? request.element = some sourceType ∧
      state.beginOccurrence request (roleOf ctx.program request) sourceType = (begun, occurrence) ∧
      dispatch hooks ctx occurrence { locals := request.locals, inner := request.inner } request.trigger begun =
        .ok next := by
  unfold begin at ran
  split at ran
  · rename_i sourceType known
    obtain ⟨_, _, ran⟩ := bind_ok ran
    exact ⟨sourceType, _, _, known, by simp, deferred_ok ran⟩
  · simp at ran

/-- An occurrence of a Gateway goes to `Hooks.arriveGateway`: a Gateway has no envelope, so no loop wraps it. -/
theorem dispatch_gateway {hooks : Hooks} {ctx : Ctx} {occurrence : Occurrence} {entry : ScopeEntry}
    {trigger : StartTrigger} {state : State} {header : Header} {payload : GatewayPayload}
    (element : ctx.program.element? occurrence.element = some (.gateway header payload)) :
    dispatch hooks ctx occurrence entry trigger state = hooks.arriveGateway ctx header payload occurrence state := by
  simp [dispatch, element, bodyLoop?, Laws.IL.envelope?_gateway]

/-! ## Queued work whose scope occurrence is gone -/

/-! A queued write, removal, compensation or compensation failure whose scope occurrence is absent fails the input as an
invariant failure, whatever its hooks would do there (#121): no write reaches the instance root or leaves a variable set
for a removed scope occurrence. -/

theorem write_scope_gone {hooks : Hooks} {ctx : Ctx} {scope : ScopeOccurrenceId} {writes : List (String × Value)}
    {rule : WriteRule} {state : State} (absent : ∀ entry ∈ state.scopes, entry.id ≠ scope) :
    (signalWork hooks ctx (.write scope writes rule)).perform state = .error (.semanticFailure "queued-work-scope-gone") := by
  simp_all [signalWork, SignalWork.perform, stale, gone]

theorem remove_scope_gone {hooks : Hooks} {ctx : Ctx} {scope : ScopeOccurrenceId} {names : List String} {state : State}
    (absent : ∀ entry ∈ state.scopes, entry.id ≠ scope) :
    (signalWork hooks ctx (.remove scope names)).perform state = .error (.semanticFailure "queued-work-scope-gone") := by
  simp_all [signalWork, SignalWork.perform, stale, gone]

theorem compensate_scope_gone {hooks : Hooks} {ctx : Ctx} {scope : ScopeOccurrenceId} {activity : Option ElementId}
    {trigger : OccurrenceRef} {leave : Option Nat} {resume : Option Resume} {state : State}
    (absent : ∀ entry ∈ state.scopes, entry.id ≠ scope) :
    (signalWork hooks ctx (.compensate scope activity trigger leave resume)).perform state =
      .error (.semanticFailure "queued-work-scope-gone") := by
  simp_all [signalWork, SignalWork.perform, stale, gone]

theorem compensationFailed_scope_gone {hooks : Hooks} {ctx : Ctx} {handler : ScopeOccurrenceId} {code : String}
    {message : Option String} {origin : Origin} {state : State} (absent : ∀ entry ∈ state.scopes, entry.id ≠ handler) :
    (signalWork hooks ctx (.compensationFailed handler code message origin)).perform state =
      .error (.semanticFailure "queued-work-scope-gone") := by
  simp_all [signalWork, SignalWork.perform, stale, gone]

end Kernel.Laws.Step
