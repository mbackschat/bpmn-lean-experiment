module

public import Kernel.Step
public import Kernel.Laws.IL
public import Kernel.Laws.Hooks
public import Kernel.Laws.Step.Ran
import all Kernel.Step
import all Kernel.Step.Jobs
import all Kernel.Step.Stale

/-! # Laws of the step function

The `Step`-generic facts the proof wave composes, for every hooks record, each read from one body of `Kernel.Step`: how
a micro-step decomposes into its body, its absorbed completion and its transition; the induction principle of a
closure, which reduces an invariant of `Step.settle` to one closure micro-step at a time (`ClosureStep`); how a flow
token reaches the hook of the element at the end of its flow; what a committed input and its completion pipeline are
made of, phase by phase; and which hook or state operation each committed body ran (the shapes of
`Kernel.Laws.Step.Ran`). This is the one module that sees `Kernel.Step`'s bodies
([module table](../../docs/kernel/ARCHITECTURE-SPEC.md#modules-and-build-shape)), and it holds only these body
equations; it names no feature, no registry and no law of a feature, so a feature edit never rebuilds it. Nothing
executable imports this module.

What the registered hooks do is `Kernel.Laws.Registry`'s and each feature's `Laws` module's; an input body is restated
whole here (`step_eq` and its siblings) and `Kernel.Laws.Step.Inputs` derives from it what a committed or rejected input
ran; `Kernel.Laws.Step.Keeps` carries an invariant through `Step.step` from these equations, and `Kernel.Proofs`
composes them with the feature lemmas, never opening a body.
-/

public section

namespace Kernel.Laws.Step

open Kernel Kernel.Step

/-! ## Outcomes -/

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

/-! ## The closure -/

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

/-- The closure has nothing left to run in `state` but, once its root is idle, the instance's completion: no queued
signal, no token to move, no idle scope occurrence and no parked join that fires when it is offered again. -/
@[expose] def Quiescent (hooks : Hooks) (ctx : Ctx) (state : State) : Prop :=
  state.signals = [] ∧ nextToken ctx state = none ∧ idleScope? ctx state = none ∧ reoffer? hooks ctx state = .ok none

/-- A committed closure stopped where `Step.settle` stops: at a state that is not running, at a quiescent state whose
root is busy, or with the instance's completion micro-step from a quiescent state whose root is idle. Which hooks
`Step.conclude` then runs decides the completed state's status, so it is not stated here. -/
theorem settle_ok_settled {hooks : Hooks} {ctx : Ctx} : ∀ {fuel work : Nat} {state after : State},
    settle hooks ctx fuel work state = .ok after → after.status ≠ .running ∨
      (Quiescent hooks ctx after ∧ after.idle State.root = false) ∨ ∃ last, Quiescent hooks ctx last ∧
        last.idle State.root = true ∧ microStep hooks ctx (.idle State.root) none State.root
          (fun state => .ok (endInstance .completed none state)) last = .ok after := by
  intro fuel
  induction fuel with
  | zero => intro _ _ _ ran; simp [settle] at ran
  | succ fuel ih =>
    intro work state after ran
    unfold settle at ran
    split at ran
    · simp at ran
    split at ran
    · cases ran; exact .inl (by simpa using ‹(state.status != .running) = true›)
    split at ran
    · obtain ⟨_, _, ran⟩ := bind_ok ran; exact ih ran
    · obtain ⟨_, _, ran⟩ := bind_ok ran; exact ih ran
    · split at ran
      · obtain ⟨_, _, ran⟩ := bind_ok ran; exact ih ran
      · obtain ⟨found, offered, ran⟩ := bind_ok ran
        split at ran
        · obtain ⟨_, _, ran⟩ := bind_ok ran; exact ih ran
        · have quiet : Quiescent hooks ctx state := ⟨by assumption, by assumption, by assumption, offered⟩
          split at ran
          · exact .inr (.inr ⟨state, quiet, by assumption, ran⟩)
          · cases ran; exact .inr (.inl ⟨quiet, by simpa using ‹¬state.idle State.root = true›⟩)

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
  split at ran <;> first | simp at ran; done | exact ⟨_, by assumption, ran⟩

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

/-- An Event's occurrence numbers under its element's counter: an Event has no envelope, so no Multi-Instance body. -/
theorem roleOf_event {program : Program} {request : BeginRequest}
    (event : ((program.element? request.element).bind (·.event?)).isSome = true) : roleOf program request = .element := by
  unfold roleOf
  cases found : program.element? request.element with
  | none => simp [found] at event
  | some element => cases element <;> split <;> simp_all [Laws.IL.envelope?_event, Laws.IL.event?_activity,
      Laws.IL.event?_scope, Laws.IL.event?_gateway, Laws.IL.event?_start]

/-- A body numbers apart exactly for an element with a Multi-Instance envelope begun as no instance. -/
theorem roleOf_body {program : Program} {request : BeginRequest} : roleOf program request = .multiInstanceBody ↔
    (((program.element? request.element).bind (·.envelope?)).bind (·.multiInstance)).isSome = true ∧
      ∀ body, request.continuation ≠ .multiInstance body := by
  unfold roleOf
  dsimp only
  generalize (((program.element? request.element).bind (·.envelope?)).bind (·.multiInstance)).isSome = loops
  cases request.continuation <;> cases loops <;> simp

/-- An occurrence of a Gateway goes to `Hooks.arriveGateway`: a Gateway has no envelope, so no loop wraps it. -/
theorem dispatch_gateway {hooks : Hooks} {ctx : Ctx} {occurrence : Occurrence} {entry : ScopeEntry}
    {trigger : StartTrigger} {state : State} {header : Header} {payload : GatewayPayload}
    (element : ctx.program.element? occurrence.element = some (.gateway header payload)) :
    dispatch hooks ctx occurrence entry trigger state = hooks.arriveGateway ctx header payload occurrence state := by
  simp [dispatch, element, bodyLoop?, Laws.IL.envelope?_gateway]

/-! ## Decomposition

What a committed `Step.step` is made of, one phase at a time, each read from one body of `Kernel.Step`: the input's
own transition and the closure (`step_eq`, `onRunning_eq`, from which `Kernel.Laws.Step.Inputs` derives `step_ok` and
`onRunning_ok`), a micro-step's absorbed completion and its transition (`absorb_ok`, `conclude_ok`), the completion
pipeline (`complete_ok`, `continueAfter_ok`) and the queued work of a signal whose target is gone (`perform_stale`,
`perform_gone`, `complete_absent`, `fire_absent`). A proof composes these and never opens `Kernel.Step`. -/

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
  cases outcome with
  | error failure => simp [orderJournal, Except.map] at ran
  | ok settled => exact ⟨settled, rfl, (Except.ok.inj ran).symm⟩

/-! ### The inputs' bodies

Each input body of `Kernel.Step` restated whole, so `Kernel.Laws.Step.Inputs` reads what a committed or rejected input
ran without opening `Kernel.Step`. -/

theorem step_eq {hooks : Hooks} {program : Program} {before : Option State} {input : Input} :
    step hooks program before input =
      let ctx := { context hooks program with conditionChoices := (inputHead input).2.2 }
      match input with
      | .start payload =>
        match before with
        | some _ => .error (.rejected "instance-already-started")
        | none => do
          let start ← chooseStart payload.startEvent (← admittedStartsFired hooks ctx payload)
          let initial ← advanceClock payload.atMs
            ((State.initial payload.instanceId payload.variables payload.businessKey).signal (.armScope State.root))
          admitChoices hooks ctx
          orderJournal <| settle hooks ctx closureBound closureWorkBound (← microStep hooks ctx (.input .start)
            (some start) State.root (begin hooks ctx { element := start, scope := State.root, trigger := payload.trigger })
            initial)
      | .command data => onRunning hooks ctx input before (command hooks ctx data)
      | .deliver data => onRunning hooks ctx input before fun state => do
        let (item, fired) ← hooks.delivered ctx data state
        fireItem hooks ctx item fired state
      | .timerFire data => timerJob ctx.program.options.continuationFailure <| onRunning hooks ctx input before fun state =>
        match item? ctx state data.occurrence (·.deadlineMs) with
        | none => .error (.rejected "unknown-timer")
        | some item => fireItem hooks ctx item (.timer data.logicalTimeMs) state
      | .effectResult data =>
        effectContinuation ctx data fun data =>
          onRunning hooks ctx (.effectResult data) before (deliverEffectResult hooks ctx data) := by
  unfold step; rfl

theorem onRunning_eq {hooks : Hooks} {ctx : Ctx} {input : Input} {before : Option State}
    {transition : State → Outcome} :
    onRunning hooks ctx input before transition =
      (match before with
      | none => .error (.rejected "instance-not-started")
      | some state =>
        if state.status != .running then .error (.rejected "instance-not-running")
        else do
          let (tag, at?, _) := inputHead input
          let start ← advanceClock at? { state with journal := [], outbox := [], draft := {}, writes := [] }
          admitChoices hooks ctx
          orderJournal (settle hooks ctx closureBound closureWorkBound
            (← microStep hooks ctx (.input tag) none State.root transition start))) := by
  unfold onRunning; rfl

/-- `Step.command` restated, with `Step.atActivity` unfolded. -/
theorem command_eq {hooks : Hooks} {ctx : Ctx} {data : CommandInput} {state : State} :
    command hooks ctx data state =
      let incident (resolve : OpenItem → IncidentDetail → Outcome) : Outcome :=
        match itemDetail? ctx state data.occurrence (·.incident) with
        | none => .error (.rejected "unknown-incident")
        | some (item, detail) => resolve item detail
      let variables (act : ScopeOccurrenceId → Signal) : Outcome :=
        match occurrenceOf? ctx state data.occurrence with
        | none => .error (.rejected "unknown-occurrence")
        | some occurrence => .ok (state.signal (act (state.ownScope occurrence.id occurrence.scope)))
      match data.action with
      | .completeUserTask values =>
        match item? ctx state data.occurrence (·.userTask) with
        | none => .error (.rejected "unknown-user-task")
        | some item =>
          match (ctx.program.element? item.element).bind (·.activity?) with
          | some (header, payload) => hooks.completeUserTask ctx header payload item values state
          | none => .error (.semanticFailure "activity-item-without-activity")
      | .retryIncident generation => incident fun item detail => hooks.retryIncident ctx item detail generation state
      | .cancelIncidentProcess generation => incident fun _ detail => hooks.cancelIncidentProcess ctx detail generation state
      | .setVariables values =>
        admitValues (values.map (·.2)) *> variables fun scope => .write scope values .outward
      | .removeVariables names => variables fun scope => .remove scope names := by
  unfold command atActivity; rfl

theorem deliverEffectResult_eq {hooks : Hooks} {ctx : Ctx} {data : EffectInput} {state : State} :
    deliverEffectResult hooks ctx data state =
      match item? ctx state data.occurrence (·.effect) with
      | none => .error (.rejected "unknown-effect")
      | some item => hooks.effectResult ctx item data.outcome state := by
  unfold deliverEffectResult; rfl

/-- A micro-step whose body rejects rejects: no transaction boundary turns a rejection into another failure
(`Step.deferred`). -/
theorem microStep_rejected {hooks : Hooks} {ctx : Ctx} {cause : Cause} {element : Option ElementId}
    {owner : ScopeOccurrenceId} {body : State → Outcome} {state : State} {code : String}
    (rejected : body state = .error (.rejected code)) :
    microStep hooks ctx cause element owner body state = .error (.rejected code) := by
  simp [microStep, bind, Except.bind, rejected, deferred]

/-- The clock fails only by rejecting the input's time. -/
theorem advanceClock_error {at? : Option Nat} {state : State} {failure : Failure}
    (ran : advanceClock at? state = .error failure) : ∃ code, failure = .rejected code := by
  unfold advanceClock at ran
  split at ran <;> (try split at ran) <;> first | simp at ran; done | exact ⟨_, (Except.error.inj ran).symm⟩

/-- An input's ranking of competing Conditional items fails only by being rejected. -/
theorem admitChoices_error {hooks : Hooks} {ctx : Ctx} {failure : Failure}
    (ran : admitChoices hooks ctx = .error failure) : ∃ code, failure = .rejected code := by
  unfold admitChoices at ran
  dsimp only at ran
  split at ran <;> (try split at ran) <;> first | simp at ran; done | exact ⟨_, (Except.error.inj ran).symm⟩

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

/-- What a signal's work names, as what it does something in or on (`Step.stale`) and what it acts from (`Step.gone`),
is read from the signal alone, never from the hooks or the context: a lane reads a queued signal's targets from
`Step.signalWork` of any hooks and context instead of enumerating `Signal`'s constructors. -/
theorem signalWork_targets (hooks hooks' : Hooks) (ctx ctx' : Ctx) (signal : Signal) :
    (signalWork hooks ctx signal).scopes = (signalWork hooks' ctx' signal).scopes ∧
      (signalWork hooks ctx signal).occurrences = (signalWork hooks' ctx' signal).occurrences ∧
      (signalWork hooks ctx signal).requires = (signalWork hooks' ctx' signal).requires := by
  cases signal <;> simp [signalWork]

/-- Work that does something in, or acts from, a scope occurrence that was issued and is gone fails the input, as
interrupted before its wait (`perform_stale`) or as an invariant failure (`perform_gone`), whatever its hooks would do
there: no write reaches the instance root or leaves a variable set for a removed scope occurrence (#121). -/
theorem perform_absent {work : SignalWork} {state : State} {scope : ScopeOccurrenceId}
    (names : scope ∈ work.scopes ∨ scope ∈ work.requires) (issued : scope.value < state.nextIssue)
    (absent : ∀ entry ∈ state.scopes, entry.id ≠ scope) :
    work.perform state = .error (.unsupported "interrupted-before-wait") ∨
      work.perform state = .error (.semanticFailure "queued-work-scope-gone") := by
  have none : state.scopes.any (·.id == scope) = false :=
    List.any_eq_false.mpr fun entry member same => absent entry member (by simpa using same)
  cases fresh : stale state work with
  | true => exact .inl (perform_stale fresh)
  | false =>
    refine .inr (perform_gone fresh ?_)
    rcases names with named | named
    · have refused : stale state work = true := by
        unfold stale
        simp only [Bool.or_eq_true, List.any_eq_true]
        exact .inl ⟨scope, named, by simp [issued, none]⟩
      simp [refused] at fresh
    · unfold gone
      exact List.any_eq_true.mpr ⟨scope, named, by simp [none]⟩

/-! ### What an addressed input's lookups and jobs read

The body facts behind `Kernel.Laws.Step.Inputs.step_unknown`: what an occurrence lookup finds, and that a timer firing
and an effect result pass a rejection through. -/

/-- What `Step.occurrenceOf?` finds is an occurrence of the state with the reference's element, activation and
instance, numbered under its element's counter, and begun or waited for by an open item. -/
theorem occurrenceOf?_some {ctx : Ctx} {state : State} {ref : OccurrenceRef} {occurrence : Occurrence}
    (found : occurrenceOf? ctx state ref = some occurrence) : occurrence ∈ state.occurrences ∧
      (ctx.program.publicId occurrence.element = ref.element ∧ occurrence.activation = ref.activation ∧
        state.instanceOf occurrence.scope = ref.processInstanceId) ∧ occurrence.role = .element ∧
      (occurrence.begun = true ∨ ∃ item ∈ state.openItems, item.occurrence = occurrence.id) := by
  unfold occurrenceOf? at found
  have holds := List.find?_some found
  simp only [Bool.and_eq_true, Bool.or_eq_true, beq_iff_eq, List.any_eq_true] at holds
  exact ⟨List.mem_of_find?_eq_some found, ⟨holds.1.2, holds.1.1.2, holds.2⟩, holds.1.1.1.2, holds.1.1.1.1⟩

theorem rejected_timerJob {failure : ContinuationFailure} {outcome : Outcome}
    (rejected : ∃ code, outcome = .error (.rejected code)) : ∃ code, timerJob failure outcome = .error (.rejected code) := by
  obtain ⟨code, same⟩ := rejected
  exact ⟨code, by subst same; cases failure <;> rfl⟩

theorem rejected_effectContinuation {ctx : Ctx} {data : EffectInput} {run : EffectInput → Outcome}
    (rejected : ∀ reported : EffectInput, reported.occurrence = data.occurrence → ∃ code, run reported = .error (.rejected code)) :
    ∃ code, effectContinuation ctx data run = .error (.rejected code) := by
  obtain ⟨code, same⟩ := rejected data rfl
  refine ⟨code, ?_⟩
  unfold effectContinuation
  split <;> simp_all


/-! ### What each body ran

Which hook or state operation each committed body of `Kernel.Step` ran, and what `Step` had established when it ran it:
the facts `Kernel.Laws.Step.Keeps` composes into the preservation of an invariant without opening a body. -/

private theorem requireScope_stands {state : State} {scope : ScopeOccurrenceId} {done : Unit}
    (ran : requireScope state scope = .ok done) : ScopeStands state scope := by
  unfold requireScope at ran
  split at ran
  · rename_i present
    obtain ⟨entry, member, same⟩ := List.any_eq_true.mp present
    exact ⟨entry, member, by simpa using same⟩
  · simp at ran

/-- A committed begin began in a scope occurrence that stands (`Step.requireScope`). -/
theorem begin_scope {hooks : Hooks} {ctx : Ctx} {request : BeginRequest} {state next : State}
    (ran : begin hooks ctx request state = .ok next) : ScopeStands state request.scope := by
  unfold begin at ran
  split at ran
  · obtain ⟨_, required, _⟩ := bind_ok ran
    exact requireScope_stands required
  · simp at ran

/-- The clock stays, or moves to the input's time. -/
theorem advanceClock_ok {at? : Option Nat} {state after : State} (ran : advanceClock at? state = .ok after) :
    after = state ∨ ∃ atMs, after = { state with logicalTimeMs := atMs } := by
  unfold advanceClock at ran
  split at ran
  · exact .inl (Except.ok.inj ran).symm
  · split at ran
    · simp at ran
    · exact .inr ⟨_, (Except.ok.inj ran).symm⟩

/-- A fired item goes back to its Activity's hook, or to `Hooks.trigger`. -/
theorem fireItem_ok {hooks : Hooks} {ctx : Ctx} {item : OpenItem} {fired : Fired} {state after : State}
    (ran : fireItem hooks ctx item fired state = .ok after) :
    (∃ header payload, (ctx.program.element? item.element).bind (·.activity?) = some (header, payload) ∧
      hooks.triggerActivity ctx header payload item fired state = .ok after) ∨
      hooks.trigger ctx item fired state = .ok after := by
  unfold fireItem at ran
  split at ran <;> first | exact .inl ⟨_, _, ‹_›, ran⟩ | exact .inr ran

/-- An idle scope occurrence completes through the hook of the occurrence that owns it: a Scope's, a Call's or a
Multi-Instance body's. -/
theorem completeIdleScope_ok {hooks : Hooks} {ctx : Ctx} {scope : ScopeOccurrence} {state after : State}
    (ran : completeIdleScope hooks ctx scope state = .ok after) :
    ∃ id occurrence, scope.occurrence = some id ∧ state.occurrence? id = some occurrence ∧
      ((∃ header payload, hooks.completeScope ctx header payload scope occurrence state = .ok after) ∨
        (∃ header payload, hooks.completeCall ctx header payload scope occurrence state = .ok after) ∨
        ∃ header envelope loop, hooks.completeBody ctx header envelope loop occurrence state = .ok after) := by
  unfold completeIdleScope at ran
  dsimp only at ran
  cases owner : scope.occurrence.bind state.occurrence? with
  | none => simp [owner] at ran
  | some occurrence =>
    simp only [owner] at ran
    obtain ⟨id, owned, found⟩ := Option.bind_eq_some_iff.mp owner
    refine ⟨id, occurrence, owned, found, ?_⟩
    cases known : ctx.program.element? occurrence.element with
    | none => simp [known] at ran
    | some element =>
      simp only [known] at ran
      cases loop : bodyLoop? element occurrence with
      | some pair =>
        simp only [loop] at ran
        exact .inr (.inr ⟨_, _, _, ran⟩)
      | none =>
        simp only [loop] at ran
        cases element with
        | scope header payload => exact .inl ⟨_, _, ran⟩
        | activity header payload =>
          dsimp only at ran
          split at ran
          · exact .inr (.inl ⟨_, _, ran⟩)
          · simp at ran
        | event header payload => simp at ran
        | gateway header payload => simp at ran
        | start header payload => simp at ran

/-- The closure takes the oldest token or the newest. -/
theorem nextToken_shape {ctx : Ctx} {state : State} {token : Token} {rest : List Token}
    (next : nextToken ctx state = some (token, rest)) : (ctx.program.options.branchSchedule = .orderInvariant ∧
      state.tokens = token :: rest) ∨ state.tokens = rest ++ [token] := by
  unfold nextToken at next
  dsimp only at next
  split at next
  · split at next
    · simp at next
    · rename_i head tail queued
      obtain ⟨first, same⟩ := Prod.mk.inj (Option.some.inj next)
      exact .inl ⟨by assumption, by rw [queued, first, same]⟩
  · split at next
    · simp at next
    · obtain ⟨last, found, made⟩ := Option.map_eq_some_iff.mp next
      obtain ⟨first, same⟩ := Prod.mk.inj made
      subst first same
      obtain ⟨front, split⟩ := List.getLast?_eq_some_iff.mp found
      exact .inr (by rw [split, List.dropLast_concat])

theorem nextToken_rest {ctx : Ctx} {state : State} {token : Token} {rest : List Token}
    (next : nextToken ctx state = some (token, rest)) : rest.Sublist state.tokens := by
  rcases nextToken_shape next with ⟨_, queued⟩ | queued <;> rw [queued]
  · exact List.sublist_cons_self token rest
  · exact List.sublist_append_left rest [token]

theorem idleScope_mem {ctx : Ctx} {state : State} {scope : ScopeOccurrence}
    (idle : idleScope? ctx state = some scope) : scope ∈ state.scopes := by
  unfold idleScope? at idle
  split at idle
  · simp at idle
  · exact List.mem_of_find?_eq_some idle

/-- A parked join offered again ran its gateway's hook on the state the closure reached, for an occurrence it found. -/
theorem reoffer_ok {hooks : Hooks} {ctx : Ctx} {state : State} {gateway : ElementId} {scope : ScopeOccurrenceId}
    {offered : State} (ran : reoffer? hooks ctx state = .ok (some (gateway, scope, offered))) :
    ∃ id occurrence header payload, (∃ waiting ∈ state.slots.parked, waiting.occurrence = id) ∧
      state.occurrence? id = some occurrence ∧ hooks.arriveGateway ctx header payload occurrence state = .ok offered := by
  unfold reoffer? at ran
  refine foldlM_finds (fun found => ∃ id occurrence header payload, (∃ waiting ∈ state.slots.parked,
    waiting.occurrence = id) ∧ state.occurrence? id = some occurrence ∧
      hooks.arriveGateway ctx header payload occurrence state = .ok found.2.2)
    (fun found waiting result kept stepped => ?_) _ none _ (by simp) ran _ rfl
  split at stepped
  · exact (Except.ok.inj stepped) ▸ kept
  · simp at stepped
  · split at stepped
    · rename_i occurrence lookup
      obtain ⟨offeredState, offering, made⟩ := bind_ok stepped
      obtain ⟨last, isLast, found⟩ := Option.bind_eq_some_iff.mp lookup
      intro result same
      rw [← Except.ok.inj made] at same
      split at same
      · simp at same
      · rw [← Option.some.inj same]
        exact ⟨_, _, _, _, ⟨last, (List.mem_filter.mp (List.mem_of_getLast? isLast)).1, rfl⟩, found, offering⟩
    · simp at stepped

private theorem perform_ok {work : SignalWork} {state after : State} (ran : work.perform state = .ok after) :
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

private theorem occurrence_of_fresh {state : State} {work : SignalWork} {id : Nat}
    (fresh : stale state work = false) (named : id ∈ work.occurrences) (issued : id < state.nextIssue) :
    ∃ occurrence, state.occurrence? id = some occurrence := by
  cases found : state.occurrence? id with
  | none =>
    have refused : stale state work = true := by
      unfold stale
      simp only [Bool.or_eq_true, List.any_eq_true]
      exact .inr ⟨id, named, by simp [issued, found]⟩
    simp [refused] at fresh
  | some occurrence => exact ⟨occurrence, rfl⟩

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

/-- A committed queued signal ran its work, once what it names stood (`Performed`). -/
theorem dispatchSignal_ok {hooks : Hooks} {ctx : Ctx} {signal : Signal} {state after : State}
    (ran : dispatchSignal hooks ctx signal state = .ok after) : Performed hooks ctx signal state after := by
  obtain ⟨fresh, present, ran⟩ := perform_ok (dispatchSignal_eq ▸ ran)
  cases signal with
  | arm host element scope =>
    exact .onArm (occurrence_of_fresh fresh (by simp [signalWork])) (scope_of_fresh fresh (by simp [signalWork])) ran
  | armScope scope => exact .onArmScope (scope_of_fresh fresh (by simp [signalWork])) ran
  | armGateway occurrence gateway scope =>
    exact .onArmGateway (occurrence_of_fresh fresh (by simp [signalWork])) (scope_of_fresh fresh (by simp [signalWork])) ran
  | raise event origin => exact .onRaise ran
  | begin request => exact .onBegin ran
  | complete occurrence leave writes rule => exact .onComplete ran
  | write scope writes rule => exact .onWrite (scope_of_present present (by simp [signalWork])) ran
  | remove scope names => exact .onRemove (scope_of_present present (by simp [signalWork])) ran
  | occur element scope leave writes rule =>
    simp only [signalWork] at ran
    obtain ⟨_, required, ran⟩ := bind_ok ran
    exact .onOccur (requireScope_stands required) ran
  | cancel occurrence =>
    simp only [signalWork] at ran
    exact (Except.ok.inj ran) ▸ .onCancel
  | fire item fired =>
    simp only [signalWork] at ran
    split at ran
    · exact .onFire (.inl ⟨_, List.mem_of_find?_eq_some ‹_›, ran⟩)
    · exact .onFire (.inr (Except.ok.inj ran).symm)
  | endInstance status failure =>
    simp only [signalWork] at ran
    exact (Except.ok.inj ran) ▸ .onEndInstance
  | compensate scope activity trigger leave resume =>
    exact .onCompensate (scope_of_present present (by simp [signalWork])) ran
  | compensationFailed handler code message origin =>
    exact .onCompensationFailed (scope_of_present present (by simp [signalWork])) ran

/-- A committed deferred begin ran its begin. -/
theorem dispatchBegin_ok {hooks : Hooks} {ctx : Ctx} {request : BeginRequest} {state after : State}
    (ran : dispatchSignal hooks ctx (.begin request) state = .ok after) : begin hooks ctx request state = .ok after := by
  obtain ⟨_, _, ran⟩ := perform_ok (dispatchSignal_eq ▸ ran)
  exact beginWork_run ▸ ran

/-! ## The program of a step and the elements a dispatch reaches

The context `Step.step` builds runs the step's program, so an invariant relative to the program (`Laws.State.WellFormed`)
passes through the closure; and an occurrence that a dispatch hands to an Activity's or an intermediate Event's hook is
of an element the program declares no start Event, which `Laws.State.Typed` reads, and is no body of an element with a
Multi-Instance envelope, which with `Laws.State.BodyRoles` makes it one of the element role. -/

theorem inputCtx_program {hooks : Hooks} {program : Program} {input : Input} :
    (inputCtx hooks program input).program = program := by
  simp only [inputCtx, context]

theorem context_program (hooks : Hooks) (program : Program) : (context hooks program).program = program := by
  simp only [context]

/-- The context `Step.step` gives every hook answers how a catch trigger catches, an Event Sub-Process's start and what
a scope occurrence is as the hooks record and `Step.scopeRole` do. -/
theorem inputCtx_queries (hooks : Hooks) (program : Program) (input : Input) :
    (inputCtx hooks program input).catches = hooks.catches ∧ (inputCtx hooks program input).eventStart = hooks.eventStart ∧
      (inputCtx hooks program input).scopeRole = scopeRole := by
  simp only [inputCtx, context, and_self]

/-- A committed dispatch ran a start Event's or a Multi-Instance body's hook, or the hook of its element (`Arrives`),
which is no start Event and declares no Multi-Instance envelope if the occurrence is numbered as a body. -/
theorem dispatch_unstarted {hooks : Hooks} {ctx : Ctx} {occurrence : Occurrence} {entry : ScopeEntry}
    {trigger : StartTrigger} {state after : State} (ran : dispatch hooks ctx occurrence entry trigger state = .ok after) :
    (∃ header payload, hooks.arriveStart ctx header payload trigger occurrence state = .ok after) ∨
      BodyArrives hooks ctx occurrence state after ∨
      ((ctx.program.element? occurrence.element).bind (·.start?) = none ∧ (occurrence.role = .multiInstanceBody →
        ((ctx.program.element? occurrence.element).bind (·.envelope?)).bind (·.multiInstance) = none) ∧
        Arrives hooks ctx occurrence entry trigger state after) := by
  unfold dispatch at ran
  dsimp only at ran
  cases known : ctx.program.element? occurrence.element with
  | none => simp [known] at ran
  | some element =>
    simp only [known] at ran
    cases loop : bodyLoop? element occurrence with
    | some pair =>
      simp only [loop] at ran; unfold bodyLoop? at loop; split at loop
      · obtain ⟨_, found, picked⟩ := Option.bind_eq_some_iff.mp loop
        obtain ⟨_, carried, rfl⟩ := Option.map_eq_some_iff.mp picked
        have named := Laws.IL.element?_header known
        exact .inr (.inl ⟨_, _, _, beq_iff_eq.mp ‹_›, named, by simp [named, known, found, carried], ran⟩)
      · cases loop
    | none =>
      simp only [loop] at ran
      have single : occurrence.role = .multiInstanceBody →
          ((some element).bind (·.envelope?)).bind (·.multiInstance) = none := fun body => by
        simpa [bodyLoop?, body] using loop
      cases element with
      | start header payload =>
        dsimp only at ran
        split at ran
        · simp at ran
        · exact .inl ⟨_, _, ran⟩
      | activity header payload => exact .inr (.inr ⟨by simp [Laws.IL.start?_activity], single, .atActivity ran⟩)
      | scope header payload => exact .inr (.inr ⟨by simp [Laws.IL.start?_scope], single, .atScope ran⟩)
      | gateway header payload => exact .inr (.inr ⟨by simp [Laws.IL.start?_gateway], single, .atGateway ran⟩)
      | event header payload =>
        refine .inr (.inr ⟨by simp [Laws.IL.start?_event], single, ?_⟩)
        dsimp only at ran
        cases role : payload.role with
        | «catch» subscription => simp only [role] at ran; exact .atCatch ran
        | «throw» thrown => simp only [role] at ran; exact .atThrow (Laws.IL.element?_event known) ran
        | linkCatch name => simp only [role] at ran; exact .atLink ran
        | linkThrow name => simp only [role] at ran; exact .atLink ran

/-- `Step` calls a scope occurrence a compensation handler's context (`Step.scopeRole`) exactly when a compensation
run holds it running. -/
theorem scopeRole_handler {state : State} {scope : ScopeOccurrenceId} :
    Step.scopeRole state scope = .compensationHandler ↔
      state.slots.compensation.runs.any (·.running.any (·.1 == scope)) = true := by
  unfold Step.scopeRole
  dsimp only
  split
  · simp_all
  · split <;> simp_all

end Kernel.Laws.Step
