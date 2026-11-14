module

public import Kernel.Step
public import Kernel.Laws.IL
public import Kernel.Laws.Hooks
public import Kernel.Laws.Step.Contract
import all Kernel.Step
import all Kernel.Step.Jobs
import all Kernel.Step.Stale

/-! # Laws of the step function

The `Step`-generic facts the proof wave composes, for every hooks record: how a micro-step decomposes into its body,
its absorbed completion and its transition; the induction principle of a closure, which reduces an invariant of
`Step.settle` to one closure micro-step at a time (`ClosureStep`); how a flow token reaches the hook of the element at
the end of its flow; what a committed input and its completion pipeline are made of, phase by phase; and the
composition that carries any state invariant through `Step.step` from one obligation per hook (`HookContract`) and per
phase of `Step` (`Phases`). This is the one module that sees `Kernel.Step`'s bodies
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

/-- An instance end clears the instance root and records the status and failure. -/
theorem endInstance_eq {status : InstanceStatus} {failure : Option InstanceFailure} {state : State} :
    endInstance status failure state = { state.clearInside State.root with status, failure } := by
  simp only [endInstance]

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

/-! ## Preservation through the bodies of `Step`

The part of the composition (`Kernel.Laws.Step.Keeps`) that reads `Kernel.Step`'s bodies: each phase keeps an invariant
`inv` when the hooks and state operations it runs keep their obligations (`Kernel.Laws.Step.Contract`). -/

section Keeps

variable {hooks : Hooks} {inv : State → Prop}

private theorem requireScope_stands {state : State} {scope : ScopeOccurrenceId} {done : Unit}
    (ran : requireScope state scope = .ok done) : ScopeStands state scope := by
  unfold requireScope at ran
  split at ran
  · rename_i present
    obtain ⟨entry, member, same⟩ := List.any_eq_true.mp present
    exact ⟨entry, member, by simpa using same⟩
  · simp at ran

theorem advanceClock_keeps (phases : Phases inv) {at? : Option Nat} {state after : State} (holds : inv state)
    (ran : advanceClock at? state = .ok after) : inv after := by
  unfold advanceClock at ran
  split at ran
  · exact (Except.ok.inj ran) ▸ holds
  · split at ran
    · simp at ran
    · exact (Except.ok.inj ran) ▸ phases.clock _ _ holds

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
  have scopeKept : ∀ (frame : State), frame.scopes = left.scopes →
      ScopeStands frame (state.startReserved occurrence sourceType).2.scope := fun frame same => by
    obtain ⟨entry, inside, named⟩ := stands
    exact ⟨entry, same ▸ inside, named⟩
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
  unfold fireItem at ran
  split at ran
  · exact contract.triggerActivity _ _ _ _ _ _ _ holds open_ ran
  · exact contract.trigger _ _ _ _ _ holds open_ ran

/-- A begun occurrence's dispatch to its element's hook keeps `inv`. -/
theorem dispatch_keeps (contract : HookContract hooks inv) {ctx : Ctx} {occurrence : Occurrence} {entry : ScopeEntry}
    {trigger : StartTrigger} {state after : State} (holds : inv state) (member : occurrence ∈ state.occurrences)
    (ran : dispatch hooks ctx occurrence entry trigger state = .ok after) : inv after := by
  unfold dispatch at ran
  dsimp only at ran
  cases known : ctx.program.element? occurrence.element with
  | none => simp [known] at ran
  | some element =>
    simp only [known] at ran
    cases loop : bodyLoop? element occurrence with
    | some pair =>
      obtain ⟨envelope, multi⟩ := pair
      simp only [loop] at ran
      exact contract.arriveMultiInstance _ _ _ _ _ _ _ holds member ran
    | none =>
      simp only [loop] at ran
      cases element with
      | activity header payload =>
        dsimp only at ran
        exact contract.arriveActivity _ _ _ _ _ _ holds member ran
      | scope header payload =>
        dsimp only at ran
        exact contract.arriveScope _ _ _ _ _ _ _ holds member ran
      | gateway header payload =>
        dsimp only at ran
        exact contract.arriveGateway _ _ _ _ _ _ holds member ran
      | start header payload =>
        dsimp only at ran
        split at ran
        · simp at ran
        · exact contract.arriveStart _ _ _ _ _ _ _ holds member ran
      | event header payload =>
        dsimp only at ran
        cases role : payload.role with
        | «catch» subscription =>
          simp only [role] at ran
          exact contract.arriveCatch _ _ _ _ _ _ _ holds member ran
        | «throw» thrown =>
          simp only [role] at ran
          exact contract.arriveThrow _ _ _ _ _ _ _ holds member ran
        | linkCatch name =>
          simp only [role] at ran
          exact contract.arriveLink _ _ _ _ _ _ holds member ran
        | linkThrow name =>
          simp only [role] at ran
          exact contract.arriveLink _ _ _ _ _ _ holds member ran

/-- A begin keeps `inv`: it begins only in a scope occurrence that stands, and hands the begun occurrence on. -/
theorem begin_keeps (contract : HookContract hooks inv) (phases : Phases inv) (facts : StateFacts) {ctx : Ctx}
    {request : BeginRequest} {state after : State} (holds : inv state)
    (ran : begin hooks ctx request state = .ok after) : inv after := by
  unfold begin at ran
  split at ran
  · rename_i sourceType _
    obtain ⟨_, required, ran⟩ := bind_ok ran
    have begunHolds := phases.begin state request (roleOf ctx.program request) sourceType holds
      (requireScope_stands required)
    have begunMember := facts.begun state request (roleOf ctx.program request) sourceType
    rcases made : state.beginOccurrence request (roleOf ctx.program request) sourceType with ⟨begun, occurrence⟩
    simp only [made] at ran begunHolds begunMember
    exact dispatch_keeps contract begunHolds begunMember (deferred_ok ran)
  · simp at ran

theorem perform_ok {work : SignalWork} {state after : State} (ran : work.perform state = .ok after) :
    stale state work = false ∧ gone state work = false ∧ work.run state = .ok after := by
  unfold SignalWork.perform at ran
  split at ran
  · simp at ran
  · split at ran
    · simp at ran
    · exact ⟨by simpa using ‹¬stale state work = true›, by simpa using ‹¬gone state work = true›, ran⟩

private theorem scope_of_fresh {state : State} {work : SignalWork} {scope : ScopeOccurrenceId}
    (fresh : stale state work = false) (named : scope ∈ work.scopes) (issued : scope.value < state.nextIssue) :
    ScopeStands state scope := by
  cases present : state.scopes.any (·.id == scope) with
  | true =>
    obtain ⟨entry, member, same⟩ := List.any_eq_true.mp present
    exact ⟨entry, member, by simpa using same⟩
  | false =>
    have refused : stale state work = true := by
      unfold stale
      simp only [Bool.or_eq_true, List.any_eq_true]
      exact .inl ⟨scope, named, by simp [issued, present]⟩
    simp [refused] at fresh

private theorem occurrence_of_fresh (facts : StateFacts) {state : State} {work : SignalWork} {id : Nat}
    (fresh : stale state work = false) (named : id ∈ work.occurrences) (issued : id < state.nextIssue) :
    OccurrenceStands state id := by
  cases found : state.occurrence? id with
  | none =>
    have refused : stale state work = true := by
      unfold stale
      simp only [Bool.or_eq_true, List.any_eq_true]
      exact .inr ⟨id, named, by simp [issued, found]⟩
    simp [refused] at fresh
  | some occurrence =>
    obtain ⟨member, same⟩ := facts.found _ _ _ found
    exact ⟨occurrence, member, same⟩

private theorem scope_of_present {state : State} {work : SignalWork} {scope : ScopeOccurrenceId}
    (present : gone state work = false) (named : scope ∈ work.requires) : ScopeStands state scope := by
  cases standing : state.scopes.any (·.id == scope) with
  | true =>
    obtain ⟨entry, member, same⟩ := List.any_eq_true.mp standing
    exact ⟨entry, member, by simpa using same⟩
  | false =>
    have absent : gone state work = true := by
      unfold gone
      exact List.any_eq_true.mpr ⟨scope, named, by simp [standing]⟩
    simp [absent] at present

/-- The closure's next queued signal keeps `inv`: its work runs only once what it names stands, or changes nothing
(the queued work whose target is gone above). -/
theorem signal_keeps (contract : HookContract hooks inv) (phases : Phases inv) (facts : StateFacts) {ctx : Ctx}
    {queue : State} {next : Signal} {rest : List Signal} {after : State} (holds : inv queue)
    (heads : queue.signals = next :: rest)
    (ran : dispatchSignal hooks ctx next { queue with signals := rest } = .ok after) : inv after := by
  have popped : inv { queue with signals := rest } := phases.dequeue _ _ holds (heads ▸ List.sublist_cons_self next rest)
  have head : next ∈ queue.signals := by simp [heads]
  obtain ⟨fresh, present, ran⟩ := perform_ok ran
  cases next with
  | arm host element scope =>
    obtain ⟨hostIssued, scopeIssued⟩ := phases.armIssued _ _ _ _ holds head
    exact contract.arm _ _ _ _ _ _ popped (occurrence_of_fresh facts fresh (by simp [signalWork]) hostIssued)
      (scope_of_fresh fresh (by simp [signalWork]) scopeIssued) ran
  | armScope scope =>
    exact contract.armScope _ _ _ _ popped
      (scope_of_fresh fresh (by simp [signalWork]) (phases.armScopeIssued queue _ holds head)) ran
  | armGateway occurrence gateway scope =>
    obtain ⟨occurrenceIssued, scopeIssued⟩ := phases.armGatewayIssued _ _ _ _ holds head
    exact contract.armGateway _ _ _ _ _ _ popped (occurrence_of_fresh facts fresh (by simp [signalWork]) occurrenceIssued)
      (scope_of_fresh fresh (by simp [signalWork]) scopeIssued) ran
  | raise event origin => exact contract.raise _ _ _ _ _ popped ran
  | begin request => exact begin_keeps contract phases facts popped ran
  | complete occurrence leave writes rule => exact complete_keeps contract phases facts popped ran
  | write scope writes rule =>
    exact (contract.writeOutputs _ _ _ _ _ _ popped (scope_of_present present (by simp [signalWork])) ran).1
  | remove scope names =>
    exact contract.removeVariables _ _ _ _ _ popped (scope_of_present present (by simp [signalWork])) ran
  | occur element scope leave writes rule =>
    simp only [signalWork] at ran
    obtain ⟨_, required, ran⟩ := bind_ok ran
    have reserved := phases.reserve _ element scope popped (requireScope_stands required)
    rcases made : State.reserve { queue with signals := rest } element scope with ⟨reservedState, occurrence⟩
    simp only [made] at ran reserved
    exact complete_keeps contract phases facts reserved ran
  | cancel occurrence =>
    simp only [signalWork] at ran
    exact (Except.ok.inj ran) ▸ phases.cancel _ _ popped
  | fire item fired =>
    simp only [signalWork] at ran
    split at ran
    · exact fireItem_keeps contract popped (List.mem_of_find?_eq_some ‹_›) ran
    · exact (Except.ok.inj ran) ▸ popped
  | endInstance status failure =>
    simp only [signalWork] at ran
    exact (Except.ok.inj ran) ▸ phases.endInstance _ _ _ popped (phases.endRecorded queue _ _ holds head)
  | compensate scope activity trigger leave resume =>
    exact contract.compensate _ _ _ _ _ _ _ _ popped (scope_of_present present (by simp [signalWork])) ran
  | compensationFailed handler code message origin =>
    exact contract.failCompensation _ _ _ _ _ _ _ popped (scope_of_present present (by simp [signalWork])) ran

theorem nextToken_rest {ctx : Ctx} {state : State} {token : Token} {rest : List Token}
    (next : nextToken ctx state = some (token, rest)) : rest.Sublist state.tokens := by
  unfold nextToken at next
  dsimp only at next
  split at next
  · split at next
    · simp at next
    · rename_i head tail queued
      obtain ⟨_, same⟩ := Prod.mk.inj (Option.some.inj next)
      rw [← same, queued]
      exact List.sublist_cons_self head tail
  · split at next
    · simp at next
    · obtain ⟨_, _, made⟩ := Option.map_eq_some_iff.mp next
      obtain ⟨_, same⟩ := Prod.mk.inj made
      rw [← same]
      exact List.dropLast_sublist _

theorem idleScope_mem {ctx : Ctx} {state : State} {scope : ScopeOccurrence}
    (idle : idleScope? ctx state = some scope) : scope ∈ state.scopes := by
  unfold idleScope? at idle
  split at idle
  · simp at idle
  · exact List.mem_of_find?_eq_some idle

theorem completeIdleScope_keeps (contract : HookContract hooks inv) (facts : StateFacts) {ctx : Ctx}
    {scope : ScopeOccurrence} {state after : State} (holds : inv state) (member : scope ∈ state.scopes)
    (ran : completeIdleScope hooks ctx scope state = .ok after) : inv after := by
  unfold completeIdleScope at ran
  dsimp only at ran
  cases owner : scope.occurrence.bind state.occurrence? with
  | none => simp [owner] at ran
  | some occurrence =>
    simp only [owner] at ran
    obtain ⟨_, _, found⟩ := Option.bind_eq_some_iff.mp owner
    obtain ⟨owned, _⟩ := facts.found _ _ _ found
    cases known : ctx.program.element? occurrence.element with
    | none => simp [known] at ran
    | some element =>
      simp only [known] at ran
      cases loop : bodyLoop? element occurrence with
      | some pair =>
        obtain ⟨envelope, multi⟩ := pair
        simp only [loop] at ran
        exact contract.completeBody _ _ _ _ _ _ _ holds owned ran
      | none =>
        simp only [loop] at ran
        cases element with
        | scope header payload =>
          dsimp only at ran
          exact contract.completeScope _ _ _ _ _ _ _ holds member owned ran
        | activity header payload =>
          dsimp only at ran
          split at ran
          · exact contract.completeCall _ _ _ _ _ _ _ holds member owned ran
          · simp at ran
        | event header payload => simp at ran
        | gateway header payload => simp at ran
        | start header payload => simp at ran

private theorem foldlM_finds {α β : Type} {f : Option β → α → Except Failure (Option β)} (property : β → Prop)
    (each : ∀ found a result, (∀ b, found = some b → property b) → f found a = .ok result →
      ∀ b, result = some b → property b) :
    ∀ (items : List α) (init result : Option β), (∀ b, init = some b → property b) →
      items.foldlM f init = .ok result → ∀ b, result = some b → property b
  | [], init, result, kept, ran => by
    simp only [List.foldlM_nil] at ran
    exact (Except.ok.inj ran) ▸ kept
  | a :: rest, init, result, kept, ran => by
    simp only [List.foldlM_cons] at ran
    obtain ⟨mid, stepped, ran⟩ := bind_ok ran
    exact foldlM_finds property each rest mid result (each _ _ _ kept stepped) ran

/-- A parked join offered again keeps `inv`: its gateway's hook ran on the state the closure reached, for an occurrence
that stands. -/
theorem reoffer_keeps (contract : HookContract hooks inv) (facts : StateFacts) {ctx : Ctx} {state : State}
    {gateway : ElementId} {scope : ScopeOccurrenceId} {offered : State} (holds : inv state)
    (ran : reoffer? hooks ctx state = .ok (some (gateway, scope, offered))) : inv offered := by
  unfold reoffer? at ran
  refine foldlM_finds (fun found => inv found.2.2) (fun found waiting result kept stepped => ?_) _ none _ (by simp) ran
    _ rfl
  split at stepped
  · exact (Except.ok.inj stepped) ▸ kept
  · simp at stepped
  · split at stepped
    · rename_i occurrence lookup
      obtain ⟨offeredState, offering, made⟩ := bind_ok stepped
      obtain ⟨_, _, found⟩ := Option.bind_eq_some_iff.mp lookup
      obtain ⟨member, _⟩ := facts.found _ _ _ found
      have offeredHolds := contract.arriveGateway _ _ _ _ _ _ holds member offering
      intro found same
      rw [← Except.ok.inj made] at same
      split at same
      · simp at same
      · rw [← Option.some.inj same]
        exact offeredHolds
    · simp at stepped

private theorem command_keeps (contract : HookContract hooks inv) (phases : Phases inv) {ctx : Ctx}
    {data : CommandInput} {state after : State} (holds : inv state) (ran : command hooks ctx data state = .ok after) :
    inv after := by
  unfold command at ran
  cases action : data.action with
  | completeUserTask values =>
    simp only [action] at ran
    cases found : item? ctx state data.occurrence (·.userTask) with
    | none => simp [found] at ran
    | some item =>
      simp only [found] at ran
      unfold atActivity at ran
      split at ran
      · exact contract.completeUserTask _ _ _ _ _ _ _ holds (Laws.Hooks.item?_mem found) ran
      · simp at ran
  | retryIncident generation =>
    simp only [action] at ran
    split at ran
    · simp at ran
    · exact contract.retryIncident _ _ _ _ _ _ holds (Laws.Hooks.itemDetail?_mem ‹_›) ran
  | cancelIncidentProcess generation =>
    simp only [action] at ran
    split at ran
    · simp at ran
    · exact contract.cancelIncidentProcess _ _ _ _ _ holds ran
  | setVariables values =>
    simp only [action] at ran
    obtain ⟨_, _, ran⟩ := bind_ok ran
    split at ran
    · simp at ran
    · exact (Except.ok.inj ran) ▸ phases.queueWrite _ _ _ _ holds
  | removeVariables names =>
    simp only [action] at ran
    split at ran
    · simp at ran
    · exact (Except.ok.inj ran) ▸ phases.queueRemove _ _ _ holds

theorem transition_keeps (contract : HookContract hooks inv) (phases : Phases inv) {ctx : Ctx}
    {transition : State → Outcome} (runs : RunsTransition hooks ctx transition) {state after : State}
    (holds : inv state) (ran : transition state = .ok after) : inv after := by
  rcases runs with ⟨data, same⟩ | ⟨data, same⟩ | fires
  · subst same
    exact command_keeps contract phases holds ran
  · subst same
    unfold deliverEffectResult at ran
    split at ran
    · simp at ran
    · exact contract.effectResult _ _ _ _ _ holds (Laws.Hooks.item?_mem ‹_›) ran
  · obtain ⟨_, _, picked, fired⟩ := fires _ _ ran
    rcases picked with open_ | ⟨_, delivered⟩
    · exact fireItem_keeps contract holds open_ fired
    · exact fireItem_keeps contract holds (contract.delivered _ _ _ _ _ delivered) fired

end Keeps

end Kernel.Laws.Step
