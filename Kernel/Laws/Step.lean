module

public import Kernel.Step
public import Kernel.Laws.IL
public import Kernel.Laws.Hooks
import all Kernel.Step
import all Kernel.Step.Jobs
import all Kernel.Step.Stale

/-! # Laws of the step function

The `Step`-generic facts the proof wave composes, for every hooks record: how a micro-step decomposes into its body,
its absorbed completion and its transition; the induction principle of a closure, which reduces an invariant of
`Step.settle` to one closure micro-step at a time (`ClosureStep`); how a flow token reaches the hook of the element at
the end of its flow; and what a committed input and its completion pipeline are made of, phase by phase. This is the
one module that sees `Kernel.Step`'s bodies
([module table](../../docs/kernel/ARCHITECTURE-SPEC.md#modules-and-build-shape)); it names no feature, no registry and
no law of a feature, so a feature edit never rebuilds it. Nothing executable imports this module.

What the registered hooks do is `Kernel.Laws.Registry`'s and each feature's `Laws` module's; `Kernel.Proofs` composes
them with the facts here and never opens a body.
-/

public section

namespace Kernel.Laws.Step

open Kernel Kernel.Step

/-! ## Outcomes -/

/-- A committed bind committed both its parts. -/
theorem bind_ok {α β ε : Type} {x : Except ε α} {f : α → Except ε β} {b : β} (ran : (x >>= f) = .ok b) :
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

/-- A committed move of a deferred begin is one micro-step whose body begins it, as its `begin` signal would, unless
what it begins in is gone (`perform_stale`). -/
theorem moveToken_begin {hooks : Hooks} {ctx : Ctx} {request : BeginRequest} {state after : State}
    (ran : moveToken hooks ctx (.begin request) state = .ok after) :
    microStep hooks ctx (.signal (signalName (.begin request))) none State.root
      (dispatchSignal hooks ctx (.begin request)) state = .ok after := by
  simpa [moveToken] using ran

/-- A queued signal runs its work unless what it names is gone (`Step.SignalWork.perform`). -/
theorem dispatchSignal_eq {hooks : Hooks} {ctx : Ctx} {signal : Signal} {state : State} :
    dispatchSignal hooks ctx signal state = (signalWork hooks ctx signal).perform state := by
  simp only [dispatchSignal]

/-- The work of a `begin` signal is its begin. -/
theorem beginWork_run {hooks : Hooks} {ctx : Ctx} {request : BeginRequest} :
    (signalWork hooks ctx (.begin request)).run = begin hooks ctx request := by
  simp [signalWork]

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

/-! ## Decomposition

What a committed `Step.step` is made of, one phase at a time, each read from one body of `Kernel.Step`: the input's
own transition and the closure (`step_ok`, `onRunning_ok`), a micro-step's absorbed completion and its transition
(`absorb_ok`, `conclude_ok`), the completion pipeline (`complete_ok`, `continueAfter_ok`) and the queued work of a
signal whose target is gone (`perform_stale`, `perform_gone`, `complete_absent`, `fire_absent`). A proof composes
these and never opens `Kernel.Step`. -/

/-- The context `Step.step` gives every hook of `input`'s closure. -/
def inputCtx (hooks : Hooks) (program : Program) (input : Input) : Ctx :=
  { context hooks program with conditionChoices := (inputHead input).2.2 }

/-- A committed timer firing committed its closure's outcome: `Step.timerJob` changes only a failure. -/
theorem timerJob_ok {failure : ContinuationFailure} {outcome : Outcome} {after : State}
    (ran : timerJob failure outcome = .ok after) : outcome = .ok after := by
  unfold timerJob at ran
  split at ran <;> simp_all

/-- A committed effect result committed the continuation of the result it reports, or of the technical failure
`Step.effectContinuation` substitutes. -/
theorem effectContinuation_ok {ctx : Ctx} {data : EffectInput} {run : EffectInput → Outcome} {after : State}
    (ran : effectContinuation ctx data run = .ok after) : ∃ reported, run reported = .ok after := by
  unfold effectContinuation at ran
  split at ran <;> first | exact ⟨_, ran⟩ | exact ⟨data, ran⟩

/-- The journal put in run order. -/
theorem orderJournal_ok {outcome : Outcome} {after : State} (ran : orderJournal outcome = .ok after) :
    ∃ settled, outcome = .ok settled ∧ after = { settled with journal := settled.journal.reverse } := by
  unfold orderJournal at ran
  cases outcome with
  | error failure => simp [Except.map] at ran
  | ok settled =>
    simp only [Except.map, Except.ok.injEq] at ran
    exact ⟨settled, by simp, ran.symm⟩

/-- A committed input on a running instance ran its transition as one micro-step, from the instance's state with an
empty journal and outbox and the clock advanced to the input's time; then the closure settled, and the journal was put
in run order. -/
theorem onRunning_ok {hooks : Hooks} {ctx : Ctx} {input : Input} {before : Option State}
    {transition : State → Outcome} {after : State} (ran : onRunning hooks ctx input before transition = .ok after) :
    ∃ state start moved settled, before = some state ∧ state.status = .running ∧
      advanceClock (inputHead input).2.1 { state with journal := [], outbox := [] } = .ok start ∧
      microStep hooks ctx (.input (inputHead input).1) none State.root transition start = .ok moved ∧
      settle hooks ctx closureBound closureWorkBound moved = .ok settled ∧
      after = { settled with journal := settled.journal.reverse } := by
  unfold onRunning at ran
  split at ran
  · simp at ran
  · rename_i state
    split at ran
    · simp at ran
    · rename_i running
      split at ran
      rename_i tag at? choices head
      obtain ⟨start, clocked, ran⟩ := bind_ok ran
      obtain ⟨_, _, ran⟩ := bind_ok ran
      obtain ⟨moved, stepped, ran⟩ := bind_ok ran
      obtain ⟨final, settled, made⟩ := orderJournal_ok ran
      exact ⟨state, start, moved, final, by simp, by simpa using running, by simpa [head] using clocked,
        by simpa [head] using stepped, settled, made⟩

/-- What a start input runs: its start Event's begin in a fresh instance whose root's Event Sub-Process starts are
queued for arming, as one micro-step after the clock advanced to the input's time; then the closure. -/
structure StartRan (hooks : Hooks) (program : Program) (payload : StartInput) (after : State) : Prop where
  ran : ∃ start initial moved settled,
    advanceClock payload.atMs
      ((State.initial payload.instanceId payload.variables payload.businessKey).signal (.armScope State.root)) =
        .ok initial ∧
    microStep hooks (inputCtx hooks program (.start payload)) (.input .start) (some start) State.root
      (begin hooks (inputCtx hooks program (.start payload)) { element := start, scope := State.root, trigger := payload.trigger })
      initial = .ok moved ∧
    settle hooks (inputCtx hooks program (.start payload)) closureBound closureWorkBound moved = .ok settled ∧
    after = { settled with journal := settled.journal.reverse }

/-- What the transition of a committed input on a running instance (`Step.onRunning`'s argument) is made of: it is
`Step.command`'s or `Step.deliverEffectResult`'s, or it fires, through `Step.fireItem`, an open item it found or the one
`Hooks.delivered` picked. -/
def RunsTransition (hooks : Hooks) (ctx : Ctx) (transition : State → Outcome) : Prop :=
  (∃ data, transition = command hooks ctx data) ∨ (∃ data, transition = deliverEffectResult hooks ctx data) ∨
    ∀ state after, transition state = .ok after → ∃ item fired,
      (item ∈ state.openItems ∨ ∃ data, hooks.delivered ctx data state = .ok (item, fired)) ∧
      fireItem hooks ctx item fired state = .ok after

/-- `Step.step` is a start's run, or a running input's transition and closure (`onRunning_ok`). -/
theorem step_ok {hooks : Hooks} {program : Program} {before : Option State} {input : Input} {after : State}
    (ran : step hooks program before input = .ok after) :
    (∃ payload, input = .start payload ∧ before = none ∧ StartRan hooks program payload after) ∨
      ∃ running transition, RunsTransition hooks (inputCtx hooks program input) transition ∧
        onRunning hooks (inputCtx hooks program input) running before transition = .ok after := by
  unfold step at ran
  split at ran
  · rename_i payload
    split at ran
    · simp at ran
    · left
      obtain ⟨fired, _, ran⟩ := bind_ok ran
      obtain ⟨start, _, ran⟩ := bind_ok ran
      obtain ⟨_, _, ran⟩ := bind_ok ran
      obtain ⟨initial, clocked, ran⟩ := bind_ok ran
      obtain ⟨_, _, ran⟩ := bind_ok ran
      obtain ⟨moved, stepped, ran⟩ := bind_ok ran
      obtain ⟨final, settled, made⟩ := orderJournal_ok ran
      exact ⟨payload, by simp, by simp, ⟨start, initial, moved, final, clocked, stepped, settled, made⟩⟩
  · exact .inr ⟨_, _, .inl ⟨_, rfl⟩, ran⟩
  · refine .inr ⟨_, _, .inr (.inr fun state after transition => ?_), ran⟩
    obtain ⟨⟨item, fired⟩, picked, fire⟩ := bind_ok transition
    exact ⟨item, fired, .inr ⟨_, picked⟩, fire⟩
  · refine .inr ⟨_, _, .inr (.inr fun state after transition => ?_), timerJob_ok ran⟩
    split at transition
    · simp at transition
    · exact ⟨_, _, .inl (Laws.Hooks.item?_mem ‹_›), transition⟩
  · obtain ⟨reported, ran⟩ := effectContinuation_ok ran
    exact .inr ⟨_, _, .inr (.inl ⟨reported, rfl⟩), ran⟩

/-- A committed absorb left the micro-step's state as it was, or ran the micro-step's sole completion after taking it
off the queue. -/
theorem absorb_ok {hooks : Hooks} {ctx : Ctx} {before : Nat} {state after : State}
    (ran : absorb hooks ctx before state = .ok after) :
    after = state ∨ ∃ occurrence leave writes rule, state.signals.drop before = [.complete occurrence leave writes rule] ∧
      complete hooks ctx occurrence leave writes rule { state with signals := state.signals.take before } = .ok after := by
  unfold absorb at ran
  split at ran
  · exact .inr ⟨_, _, _, _, by assumption, ran⟩
  · exact .inl (Except.ok.inj ran).symm

/-- A committed transition journalled the draft, emptied it and the write log, told `Hooks.cancelled` of each cancelled
occurrence in order, then `Hooks.written` of the writes. -/
theorem conclude_ok {hooks : Hooks} {ctx : Ctx} {cause : Cause} {element : Option ElementId}
    {owner : ScopeOccurrenceId} {state after : State} (ran : conclude hooks ctx cause element owner state = .ok after) :
    ∃ notified, state.draft.cancelled.foldlM (fun state occurrence => hooks.cancelled ctx occurrence state)
        { state with journal := { cause, element, owner, started := state.draft.started, ended := state.draft.ended } ::
            state.journal, draft := {}, writes := [] } = .ok notified ∧
      hooks.written ctx state.writes notified = .ok after := by
  unfold conclude at ran
  exact bind_ok ran

/-- How a completed occurrence goes on (`Step.continueAfter`): by its continuation's hook, or, raised away, not at all
unless it was a compensation handler. -/
theorem continueAfter_ok {hooks : Hooks} {ctx : Ctx} {occurrence : Occurrence} {leave : Leave}
    {writes : List (String × Value)} {state after : State}
    (ran : continueAfter hooks ctx occurrence leave writes state = .ok after) :
    after = state ∨ hooks.outflow ctx occurrence leave state = .ok after ∨
      (∃ body, hooks.instanceCompleted ctx body occurrence writes state = .ok after) ∨
      ∃ run, hooks.handlerCompleted ctx run occurrence state = .ok after ∨
        hooks.handlerEnded ctx run occurrence state = .ok after := by
  unfold continueAfter at ran
  cases continuation : occurrence.continuation <;> cases leave <;>
    simp only [continuation, Bool.false_eq_true, ite_true, ite_false] at ran
  all_goals first
    | exact .inl (Except.ok.inj ran).symm
    | exact .inr (.inl ran)
    | exact .inr (.inr (.inl ⟨_, ran⟩))
    | exact .inr (.inr (.inr ⟨_, .inl ran⟩))
    | exact .inr (.inr (.inr ⟨_, .inr ran⟩))

/-- How the completion pipeline goes on once the occurrence's writes are made: raised away, its record goes, it is
journalled cancelled and only a compensation run hears of it; otherwise `Hooks.completed` retains it, its record goes,
its continuation runs and it is journalled completed. Its key is read once its writes are made. -/
inductive Finishes (hooks : Hooks) (ctx : Ctx) (id : Nat) (occurrence : Occurrence) (writes : List (String × Value)) :
    Leave → State → State → Prop where
  | raised {state after : State} :
      continueAfter hooks ctx occurrence .raised writes
        ((state.removeOccurrence id).recordEnd (state.keyOf occurrence) .cancelled) = .ok after →
      Finishes hooks ctx id occurrence writes .raised state after
  | left {leave : Leave} {state retained continued : State} : leave ≠ .raised →
      hooks.completed ctx occurrence state = .ok retained →
      continueAfter hooks ctx occurrence leave writes (retained.removeOccurrence id) = .ok continued →
      Finishes hooks ctx id occurrence writes leave state (continued.recordEnd (state.keyOf occurrence) .completed)

/-- The completion pipeline (`Step.complete`): an occurrence that is gone is dropped; otherwise its reservation, if it
is one, starts, its own items close, `Hooks.leave` disarms what hangs on it, `Hooks.select` resolves how it leaves,
`Hooks.writeOutputs` makes its writes, and it finishes (`Finishes`). -/
theorem complete_ok {hooks : Hooks} {ctx : Ctx} {id : Nat} {leave : Leave} {writes : List (String × Value)}
    {rule : WriteRule} {state after : State} (ran : complete hooks ctx id leave writes rule state = .ok after) :
    (state.occurrence? id = none ∧ after = state) ∨
      ∃ occurrence sourceType begun left selected written,
        state.occurrence? id = some occurrence ∧ ctx.program.sourceType? occurrence.element = some sourceType ∧
        hooks.leave ctx (state.startReserved occurrence sourceType).2
          ((state.startReserved occurrence sourceType).1.closeOwnItems id) = .ok left ∧
        begun = (state.startReserved occurrence sourceType).2 ∧
        hooks.select ctx begun leave left = .ok selected ∧
        hooks.writeOutputs ctx begun.scope writes rule left = .ok written ∧
        Finishes hooks ctx id begun writes selected written after := by
  unfold complete at ran
  cases found : state.occurrence? id with
  | none => simp only [found] at ran; exact .inl ⟨rfl, (Except.ok.inj ran).symm⟩
  | some occurrence =>
    simp only [found] at ran
    cases known : ctx.program.sourceType? occurrence.element with
    | none => simp [known] at ran
    | some sourceType =>
      simp only [known] at ran
      rcases reserved : state.startReserved occurrence sourceType with ⟨started, begun⟩
      simp only [reserved] at ran
      obtain ⟨left, leaving, ran⟩ := bind_ok ran
      obtain ⟨selected, selecting, ran⟩ := bind_ok ran
      obtain ⟨written, writing, ran⟩ := bind_ok ran
      refine .inr ⟨occurrence, sourceType, begun, left, selected, written, rfl, known, by simpa [reserved] using leaving,
        by simp [reserved], selecting, writing, ?_⟩
      split at ran
      · exact .raised ran
      · obtain ⟨retained, retaining, ran⟩ := bind_ok ran
        obtain ⟨continued, continuing, ran⟩ := bind_ok ran
        rw [← Except.ok.inj ran]
        exact .left (by simp) retaining (deferred_ok continuing)
      · obtain ⟨retained, retaining, ran⟩ := bind_ok ran
        obtain ⟨continued, continuing, ran⟩ := bind_ok ran
        rw [← Except.ok.inj ran]
        exact .left (by simp) retaining (deferred_ok continuing)

/-! ### Queued work whose target is gone

What `Kernel/Step/Stale.lean` lets the closure meet: a queued signal naming a scope occurrence or occurrence that was
issued and has since been removed. Such work is inert: a begin, an arming and an `occur` whose target is gone fail the
input (`perform_stale`, CIB-LIM-0055's `interrupted-before-wait`); a write, a removal, a compensation and a
compensation's failure whose scope occurrence is gone fail it too (`perform_gone`, #121); a completion of an occurrence
that is gone and a firing of an item that is gone change nothing (`complete_absent`, `fire_absent`), and a
cancellation of an occurrence that is gone changes nothing (`Laws.State.cancelOccurrence_absent`). -/

theorem perform_stale {work : SignalWork} {state : State} (refused : stale state work = true) :
    work.perform state = .error (.unsupported "interrupted-before-wait") := by
  simp [SignalWork.perform, refused]

theorem perform_gone {work : SignalWork} {state : State} (fresh : stale state work = false) (absent : gone state work = true) :
    work.perform state = .error (.semanticFailure "queued-work-scope-gone") := by
  simp [SignalWork.perform, fresh, absent]

theorem complete_absent {hooks : Hooks} {ctx : Ctx} {id : Nat} {leave : Leave} {writes : List (String × Value)}
    {rule : WriteRule} {state : State} (absent : state.occurrence? id = none) :
    complete hooks ctx id leave writes rule state = .ok state := by
  simp [complete, absent]

theorem fire_absent {hooks : Hooks} {ctx : Ctx} {item : Nat} {fired : Fired} {state : State}
    (absent : state.openItems.find? (·.id == item) = none) : (signalWork hooks ctx (.fire item fired)).run state = .ok state := by
  simp [signalWork, absent]

end Kernel.Laws.Step
