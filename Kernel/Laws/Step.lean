module

public import Kernel.Step
public import Kernel.Laws.Hooks
public import Kernel.Laws.Step.Ran
public import Kernel.Laws.Step.Commit
public import Kernel.Laws.Step.Order
public import Kernel.Laws.Step.Jobs
public import Kernel.Laws.Step.Stale
import all Kernel.Step
import all Kernel.Step.Inputs

/-! # Laws of the step function

The `Step`-generic facts the proof wave composes, for every hooks record, each read from one body of `Kernel.Step`: how
a micro-step decomposes into its body, its absorbed completion and its transition; the induction principle of a
closure, which reduces an invariant of `Step.settle` to one closure micro-step at a time (`ClosureStep`); how a flow
token reaches the hook of the element at the end of its flow; what a committed input and its completion pipeline are
made of, phase by phase; and which hook or state operation each committed body ran (the shapes of
`Kernel.Laws.Step.Ran`). This is the one module that sees `Kernel.Step`'s bodies
([module table](../../docs/kernel/ARCHITECTURE-SPEC.md#modules-and-build-shape)), and it holds only these body
equations; it names no feature, no registry and no law of a feature, so a feature edit never rebuilds it. The bodies of
`Kernel.Step.Commit`, `Kernel.Step.Jobs` and `Kernel.Step.Stale` are their own `Laws` modules' (`Kernel.Laws.Step.Commit`,
`Kernel.Laws.Step.Jobs`, `Kernel.Laws.Step.Stale`), whose facts this module composes and re-exports. Nothing executable imports this module.

What the registered hooks do is `Kernel.Laws.Registry`'s and each feature's `Laws` module's; an input body is restated
whole here (`step_eq` and its siblings) and `Kernel.Laws.Step.Inputs` derives from it what a committed or rejected input
ran; `Kernel.Laws.Step.Keeps` carries an invariant through `Step.step` from these equations, and `Kernel.Proofs`
composes them with the feature lemmas, never opening a body.
-/

public section

namespace Kernel.Laws.Step

open Kernel Kernel.Step

/-! ## Micro-steps -/

/-- A committed micro-step ran a unit the closure had not run and that is not the seed's (DC4), its body under that unit
as the issuer (DC12), absorbed the body's sole completion, if any, and concluded its transition. -/
theorem microStep_ok {hooks : Hooks} {ctx : Ctx} {unit : UnitKey} {cause : Cause} {element : Option ElementId}
    {owner : ScopeOccurrenceId} {body : State → Outcome} {state after : State}
    (ran : microStep hooks ctx unit cause element owner body state = .ok after) :
    state.transitions.contains unit = false ∧ unit ≠ .ofRoot .seed ∧
    ∃ next absorbed, body { state with issuing := unit, issueNext := 0 } = .ok next ∧ absorb hooks ctx state.batchSignals.length next = .ok absorbed ∧
      conclude hooks ctx unit cause element owner absorbed = .ok after := by
  unfold microStep at ran
  split at ran
  · simp at ran
  · rename_i fresh
    simp only [Bool.or_eq_true, beq_iff_eq, not_or] at fresh
    obtain ⟨next, body_, ran⟩ := bind_ok ran
    obtain ⟨absorbed, absorbed_, ran⟩ := bind_ok ran
    exact ⟨Bool.eq_false_iff.mpr fresh.1, fresh.2, next, absorbed, deferred_ok body_, deferred_ok absorbed_, deferred_ok ran⟩

/-! ## The closure -/

/-- The induction principle of a closure over its run log: an invariant of the run log and the state that every closure
micro-step preserves, the log gaining the unit it ran, is preserved by `Step.settle`, whatever its fuel and work bounds;
a closure that stops on either bound commits nothing. -/
theorem settle_induction_log {hooks : Hooks} {ctx : Ctx} (invariant : RunLog → State → Prop)
    (preserved : ∀ log unit before after, invariant log before → ClosureStep hooks ctx log unit before after →
      invariant (log.record unit) after) :
    ∀ (fuel work : Nat) (log : RunLog) (state : State) (after : State × RunLog), invariant log state →
      settle hooks ctx fuel work log state = .ok after → invariant after.2 after.1 := by
  intro fuel
  induction fuel with
  | zero => intro work log state after _ ran; simp [settle] at ran
  | succ fuel ih =>
    intro work log state after holds ran
    unfold settle at ran
    split at ran
    · simp at ran
    split at ran
    · cases ran; exact holds
    have running : state.status = .running := by simpa using ‹¬(state.status != .running) = true›
    split at ran
    · obtain ⟨mid, stepped, ran⟩ := bind_ok ran
      exact ih _ _ _ _ (preserved _ _ _ _ holds (.signal running (by assumption) stepped)) ran
    · split at ran
      · obtain ⟨mid, stepped, ran⟩ := bind_ok ran
        exact ih _ _ _ _ (preserved _ _ _ _ holds (.token running (by assumption) (by assumption) stepped)) ran
      · split at ran
        · split at ran
          · simp at ran
          · obtain ⟨mid, stepped, ran⟩ := bind_ok ran
            exact ih _ _ _ _ (preserved _ _ _ _ holds
              (.idle running (by assumption) (by assumption) (by assumption) (by assumption) stepped)) ran
        · obtain ⟨found, offered, ran⟩ := bind_ok ran
          split at ran
          · split at ran
            · simp at ran
            · obtain ⟨mid, stepped, ran⟩ := bind_ok ran
              exact ih _ _ _ _ (preserved _ _ _ _ holds
                (.reoffer running (by assumption) (by assumption) (by assumption) offered (by assumption) stepped)) ran
          · split at ran
            · obtain ⟨mid, stepped, ran⟩ := bind_ok ran
              cases ran
              have quiet := ‹(state.idle State.root && state.queuedSignals.isEmpty) = true›
              simp only [Bool.and_eq_true] at quiet
              exact preserved _ _ _ _ holds
                (.finish running (by assumption) (by assumption) (by assumption) offered quiet.1 quiet.2 stepped)
            · cases ran; exact holds

/-- The induction principle of a closure: an invariant that every closure micro-step preserves is preserved by
`Step.settle`, whatever its run log, fuel and work bounds; a closure that stops on either bound commits nothing. -/
theorem settle_induction {hooks : Hooks} {ctx : Ctx} (invariant : State → Prop)
    (preserved : ∀ log unit before after, invariant before → ClosureStep hooks ctx log unit before after → invariant after) :
    ∀ (fuel work : Nat) (log : RunLog) (state : State) (after : State × RunLog), invariant state →
      settle hooks ctx fuel work log state = .ok after → invariant after.1 :=
  settle_induction_log (fun _ state => invariant state) fun log unit before after holds step =>
    preserved log unit before after holds step

/-- A committed closure stopped where `Step.settle` stops: at a state that is not running, at a quiescent state whose
root is busy or that still queues a signal, or with the instance's completion micro-step from a quiescent state whose
root is idle and that queues no signal, the log gaining that unit. Which hooks `Step.conclude` then runs decides the
completed state's status, so it is not stated here. -/
theorem settle_ok_settled {hooks : Hooks} {ctx : Ctx} : ∀ {fuel work : Nat} {log : RunLog} {state : State}
    {after : State × RunLog}, settle hooks ctx fuel work log state = .ok after → after.1.status ≠ .running ∨
      (Quiescent hooks ctx after.2 after.1 ∧ (after.1.idle State.root && after.1.queuedSignals.isEmpty) = false) ∨
      ∃ last earlier, Quiescent hooks ctx earlier last ∧ last.idle State.root = true ∧ last.queuedSignals.isEmpty = true ∧
        microStep hooks (unitCtx ctx earlier) (.ofRoot (.idle [])) (.idle State.root) none State.root
          (fun state => .ok (endInstance .completed none state)) last = .ok after.1 ∧
        after.2 = earlier.record (.ofRoot (.idle [])) := by
  intro fuel
  induction fuel with
  | zero => intro _ _ _ _ ran; simp [settle] at ran
  | succ fuel ih =>
    intro work log state after ran
    unfold settle at ran
    split at ran
    · simp at ran
    split at ran
    · cases ran; exact .inl (by simpa using ‹(state.status != .running) = true›)
    split at ran
    · obtain ⟨_, _, ran⟩ := bind_ok ran; exact ih ran
    · split at ran
      · obtain ⟨_, _, ran⟩ := bind_ok ran; exact ih ran
      · split at ran
        · split at ran
          · simp at ran
          · obtain ⟨_, _, ran⟩ := bind_ok ran; exact ih ran
        · obtain ⟨found, offered, ran⟩ := bind_ok ran
          split at ran
          · split at ran
            · simp at ran
            · obtain ⟨_, _, ran⟩ := bind_ok ran; exact ih ran
          · have quiet : Quiescent hooks ctx log state := ⟨by assumption, by assumption, by assumption, offered⟩
            split at ran
            · obtain ⟨_, stepped, ran⟩ := bind_ok ran
              cases ran
              have idle := ‹(state.idle State.root && state.queuedSignals.isEmpty) = true›
              simp only [Bool.and_eq_true] at idle
              exact .inr (.inr ⟨state, log, quiet, idle.1, idle.2, stepped, rfl⟩)
            · cases ran
              exact .inr (.inl ⟨quiet, by simpa using ‹¬(state.idle State.root && state.queuedSignals.isEmpty) = true›⟩)

/-! ## Routing a flow token -/

/-- A committed move of a flow token is one micro-step whose body routes the token along its flow. -/
theorem moveToken_flow {hooks : Hooks} {ctx : Ctx} {unit : UnitKey} {flow : FlowId} {scope : ScopeOccurrenceId}
    {state after : State} (ran : moveToken hooks ctx unit (.flow flow scope) state = .ok after) :
    microStep hooks ctx unit (.arrive flow) (ctx.program.target? flow) scope (arrive hooks ctx flow scope) state =
      .ok after := by
  simpa [moveToken] using ran

/-- A committed move of a deferred begin is one micro-step whose body begins it, as its `begin` signal would, unless
what it begins in is gone (`perform_stale`). -/
theorem moveToken_begin {hooks : Hooks} {ctx : Ctx} {unit : UnitKey} {request : BeginRequest} {state after : State}
    (ran : moveToken hooks ctx unit (.begin request) state = .ok after) :
    microStep hooks ctx unit (.signal (signalName (.begin request))) none State.root
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

/-- A committed begin issued the occurrence `State.beginOccurrence` makes, numbered under `Step.roleOf`, dispatched it
to its element's hook and wrote its start's values (`writeStart_ok`). -/
theorem begin_ok {hooks : Hooks} {ctx : Ctx} {request : BeginRequest} {state next : State}
    (ran : begin hooks ctx request state = .ok next) :
    ∃ sourceType begun occurrence entered, ctx.program.sourceType? request.element = some sourceType ∧
      state.beginOccurrence request (roleOf ctx.program request) sourceType = (begun, occurrence) ∧
      dispatch hooks ctx occurrence { inner := request.inner } request.trigger begun = .ok entered ∧
      writeStart hooks ctx occurrence.id request.writes entered = .ok next := by
  unfold begin at ran
  split at ran
  · rename_i sourceType known
    obtain ⟨_, _, ran⟩ := bind_ok ran
    obtain ⟨entered, dispatched, written⟩ := bind_ok (deferred_ok ran)
    exact ⟨sourceType, _, _, entered, known, by simp, dispatched, written⟩
  · simp at ran

/-- A begin writes no start values, or writes them outward from the scope occurrence its occurrence owns. -/
theorem writeStart_ok {hooks : Hooks} {ctx : Ctx} {occurrence : OccurrenceId} {writes : List (String × Value)} {state after : State}
    (ran : writeStart hooks ctx occurrence writes state = .ok after) : (writes = [] ∧ after = state) ∨ writes ≠ [] ∧
      ∃ scope, state.localScope? occurrence = some scope ∧ hooks.writeOutputs ctx scope writes .outward state = .ok after := by
  unfold writeStart at ran
  split at ran
  · exact .inl ⟨List.isEmpty_iff.mp ‹_›, (Except.ok.inj ran).symm⟩
  · split at ran
    · exact .inr ⟨fun empty => by simp_all, _, ‹_›, ran⟩
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
pipeline (`complete_ok`, `continueAfter_ok`) and queued work whose target is gone; a proof never opens `Kernel.Step`. -/

/-- An instance end clears the instance root and records the status and failure. -/
theorem endInstance_eq {status : InstanceStatus} {failure : Option InstanceFailure} {state : State} :
    endInstance status failure state = { state.clearInside State.root with status, failure } := by
  simp only [endInstance]

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
            (((State.initial payload.instanceId payload.variables payload.businessKey).signal (.armScope State.root)).queueBatch
              (.ofRoot .seed))
          admitChoices hooks ctx
          let unit := UnitKey.ofRoot .input
          orderJournal ctx.program.options.branchSchedule initial <| settle hooks ctx closureBound closureWorkBound (RunLog.record {} unit) (← microStep hooks ctx unit
            (.input .start) (some start) State.root (begin hooks ctx { element := start, scope := State.root, trigger := payload.trigger })
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
          onRunning hooks ctx (.effectResult data) before (deliverEffectResult hooks ctx data)
      | .cancelInstance _ => .error (.unsupported "cancel-instance") := by
  unfold step; rfl

/-- `Step.admittedStartsFired` restated: a start's submitted values are admitted before its starts are fired. -/
theorem admittedStartsFired_eq {hooks : Hooks} {ctx : Ctx} {input : StartInput} :
    admittedStartsFired hooks ctx input =
      (admitValues ctx.program.options.bounds (input.variables.map (·.2)) *> hooks.startsFired ctx input) := by
  unfold admittedStartsFired; rfl

theorem onRunning_eq {hooks : Hooks} {ctx : Ctx} {input : Input} {before : Option State}
    {transition : State → Outcome} :
    onRunning hooks ctx input before transition =
      (match before with
      | none => .error (.rejected "instance-not-started")
      | some state =>
        if state.status != .running then .error (.rejected "instance-not-running")
        else do
          let (tag, at?, _) := inputHead input
          let start ← advanceClock at? { state with journal := [], intents := [], transitions := ∅, outboxes := ∅, draft := {}, writes := [] }
          admitChoices hooks ctx
          let unit := UnitKey.ofRoot .input
          orderJournal ctx.program.options.branchSchedule start (settle hooks ctx closureBound closureWorkBound (RunLog.record {} unit)
            (← microStep hooks ctx unit (.input tag) none State.root transition start))) := by
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
          | none => .error (.semanticFailure .invariant "activity-item-without-activity")
      | .retryIncident generation => incident fun item detail => hooks.retryIncident ctx item detail generation state
      | .cancelIncidentProcess generation => incident fun _ detail => hooks.cancelIncidentProcess ctx detail generation state
      | .setVariables values =>
        admitValues ctx.program.options.bounds (values.map (·.2)) *> variables fun scope => .write scope values .outward
      | .removeVariables names => variables fun scope => .remove scope names := by
  unfold command atActivity; rfl

theorem deliverEffectResult_eq {hooks : Hooks} {ctx : Ctx} {data : EffectInput} {state : State} :
    deliverEffectResult hooks ctx data state =
      match item? ctx state data.occurrence (·.effect) with
      | none => .error (.rejected "unknown-effect")
      | some item => hooks.effectResult ctx item data.outcome state := by
  unfold deliverEffectResult; rfl

/-- A micro-step of a unit the closure has not run whose body rejects rejects: no transaction boundary turns a rejection into another failure
(`Step.deferred`). -/
theorem microStep_rejected {hooks : Hooks} {ctx : Ctx} {unit : UnitKey} {cause : Cause} {element : Option ElementId}
    {owner : ScopeOccurrenceId} {body : State → Outcome} {state : State} {code : String}
    (unrun : state.transitions.contains unit = false) (unseeded : unit ≠ .ofRoot .seed)
    (rejected : body { state with issuing := unit, issueNext := 0 } = .error (.rejected code)) :
    microStep hooks ctx unit cause element owner body state = .error (.rejected code) := by
  simp [microStep, bind, Except.bind, unrun, unseeded, rejected, deferred_rejected]

/-- A micro-step of a unit the closure has not run whose body fails with an invariant failure fails with it, after a transaction boundary too (#148). -/
theorem microStep_invariant {hooks : Hooks} {ctx : Ctx} {unit : UnitKey} {cause : Cause} {element : Option ElementId}
    {owner : ScopeOccurrenceId} {body : State → Outcome} {state : State} {code : String}
    (unrun : state.transitions.contains unit = false) (unseeded : unit ≠ .ofRoot .seed)
    (faulted : body { state with issuing := unit, issueNext := 0 } = .error (.semanticFailure .invariant code)) :
    microStep hooks ctx unit cause element owner body state = .error (.semanticFailure .invariant code) := by
  simp [microStep, bind, Except.bind, unrun, unseeded, faulted, deferred_invariant]

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
    after = state ∨ ∃ occurrence leave writes rule, state.batchSignals.drop before = [.complete occurrence leave writes rule] ∧
      complete hooks ctx occurrence leave writes rule { state with batchSignals := state.batchSignals.take before } = .ok after := by
  unfold absorb at ran
  split at ran
  · rename_i sole queued
    dsimp only at ran
    split at ran
    · rename_i completion
      cases sole <;> simp only [signalWork, Bool.false_eq_true] at completion
      exact .inr ⟨_, _, _, _, queued, by simpa [signalWork] using (perform_ok ran).2.2⟩
    · exact .inl (Except.ok.inj ran).symm
  · exact .inl (Except.ok.inj ran).symm

/-- A committed transition journalled the draft under its unit, emptied the draft and the write log,
told `Hooks.cancelled` of each cancelled occurrence in order, then `Hooks.written` of the writes, and reset the issuer
to the seed's (DC12). -/
theorem conclude_ok {hooks : Hooks} {ctx : Ctx} {unit : UnitKey} {cause : Cause} {element : Option ElementId}
    {owner : ScopeOccurrenceId} {state after : State} (ran : conclude hooks ctx unit cause element owner state = .ok after) :
    ∃ notified written,
      state.draft.cancelled.foldlM (fun state occurrence => hooks.cancelled ctx occurrence state)
        { state with
          transitions := state.transitions.insert unit
            { cause, element, owner, started := state.draft.started, ended := state.draft.ended, ready := state.draft.ready },
          draft := {}, writes := [] } = .ok notified ∧
      hooks.written ctx state.writes notified = .ok written ∧
      after = { written.queueBatch unit with issuing := .ofRoot .seed, issueNext := 0 } := by
  unfold conclude at ran
  rw [journalDraft_eq] at ran
  obtain ⟨notified, folded, ran⟩ := bind_ok ran
  obtain ⟨written, wrote, ran⟩ := bind_ok ran
  exact ⟨notified, written, folded, wrote, (Except.ok.inj ran).symm⟩

/-- No running batch: what every micro-step leaves, since `Step.conclude` moves the batches under its unit. -/
abbrev Unbatched (state : State) : Prop :=
  state.batchSignals = [] ∧ state.batchTokens = [] ∧ state.batchIntents = []

/-- A committed micro-step leaves no running batch, since `State.queueBatch` leaves none
(`Laws.State.queueBatch_unbatched`, which this module cannot read). -/
theorem microStep_unbatched (queued : ∀ (state : State) unit, Unbatched (state.queueBatch unit)) {hooks : Hooks}
    {ctx : Ctx} {unit : UnitKey} {cause : Cause} {element : Option ElementId} {owner : ScopeOccurrenceId}
    {body : State → Outcome} {state after : State}
    (ran : microStep hooks ctx unit cause element owner body state = .ok after) : Unbatched after := by
  obtain ⟨_, _, _, ⟨_, _, _, concluded⟩⟩ := microStep_ok ran
  obtain ⟨_, _, ⟨_, _, rfl⟩⟩ := conclude_ok concluded
  exact queued _ _

/-- A closure micro-step leaves no running batch. -/
theorem closureStep_unbatched (queued : ∀ (state : State) unit, Unbatched (state.queueBatch unit)) {hooks : Hooks}
    {ctx : Ctx} {log : RunLog} {unit : UnitKey} {state after : State}
    (step : ClosureStep hooks ctx log unit state after) : Unbatched after := by
  cases step with
  | signal _ _ ran => exact microStep_unbatched queued ran
  | token _ _ _ ran => unfold moveToken at ran; split at ran <;> exact microStep_unbatched queued ran
  | idle _ _ _ _ _ ran => exact microStep_unbatched queued ran
  | reoffer _ _ _ _ _ _ ran => exact microStep_unbatched queued ran
  | finish _ _ _ _ _ _ _ ran => exact microStep_unbatched queued ran

/-- A committed closure from a micro-step's result settles with no running batch: what `Phases.runOrder` orders. -/
theorem settle_unbatched (queued : ∀ (state : State) unit, Unbatched (state.queueBatch unit)) {hooks : Hooks}
    {ctx : Ctx} {fuel work : Nat} {log : RunLog} {state : State} {after : State × RunLog} (unbatched : Unbatched state)
    (ran : settle hooks ctx fuel work log state = .ok after) : Unbatched after.1 :=
  settle_induction Unbatched (fun _ _ _ _ _ step => closureStep_unbatched queued step) fuel work log state after
    unbatched ran

/-- How a completed occurrence goes on (`Step.continueAfter`): by its continuation's hook, or, raised away, not at all
unless it was a compensation handler. -/
theorem continueAfter_ok {hooks : Hooks} {ctx : Ctx} {occurrence : Occurrence} {leave : Leave}
    {writes : List (String × Value)} {state after : State}
    (ran : continueAfter hooks ctx occurrence leave writes state = .ok after) :
    after = state ∨ hooks.outflow ctx occurrence leave state = .ok after ∨
      (∃ body, hooks.instanceCompleted ctx body occurrence writes state = .ok after) ∨
      hooks.handlerCompleted ctx occurrence state = .ok after ∨
        hooks.handlerEnded ctx occurrence state = .ok after := by
  unfold continueAfter at ran
  cases continuation : occurrence.continuation <;> cases leave <;>
    simp only [continuation, Bool.false_eq_true, ite_true, ite_false] at ran
  all_goals first
    | exact .inl (Except.ok.inj ran).symm
    | exact .inr (.inl ran)
    | exact .inr (.inr (.inl ⟨_, ran⟩))
    | exact .inr (.inr (.inr (.inl ran)))
    | exact .inr (.inr (.inr (.inr ran)))

/-- The completion pipeline (`Step.complete`): a committed completion found its occurrence; its reservation, if it
is one, starts, its own items close, `Hooks.leave` disarms what hangs on it, `Hooks.select` resolves how it leaves,
`Hooks.writeOutputs` makes its writes, and it finishes (`Finishes`). -/
theorem complete_ok {hooks : Hooks} {ctx : Ctx} {id : OccurrenceId} {leave : Leave} {writes : List (String × Value)}
    {rule : WriteRule} {state after : State} (ran : complete hooks ctx id leave writes rule state = .ok after) :
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
  | none => simp [found] at ran
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
      refine ⟨occurrence, sourceType, begun, left, selected, written, rfl, known, by simpa [reserved] using leaving,
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

What `Kernel/Step/Stale.lean` lets the closure meet: queued work naming a target issued and since removed, which is
inert. A begin, an arming and an `occur` whose target is gone fail the input (`perform_stale`, CIB-LIM-0055); a write, a
removal, a compensation or its failure whose scope occurrence is gone (#121), and a completion or a cancellation whose
occurrence is gone (#151), fail it as invariant failures (`perform_gone`, `complete_occurrence_gone`,
`cancel_occurrence_gone`, `complete_absent`); a firing of an item that is gone changes nothing (`fire_absent`). The
facts of `SignalWork.perform` itself are `Kernel.Laws.Step.Stale`'s. -/

theorem complete_absent {hooks : Hooks} {ctx : Ctx} {id : OccurrenceId} {leave : Leave} {writes : List (String × Value)}
    {rule : WriteRule} {state : State} (absent : state.occurrence? id = none) :
    complete hooks ctx id leave writes rule state = .error (.semanticFailure .invariant "queued-work-occurrence-gone") := by
  simp [complete, absent]

theorem complete_occurrence_gone {hooks : Hooks} {ctx : Ctx} {id : OccurrenceId} {leave : Leave} {writes : List (String × Value)}
    {rule : WriteRule} {state : State} (absent : state.occurrence? id = none) : dispatchSignal hooks ctx
      (.complete id leave writes rule) state = .error (.semanticFailure .invariant "queued-work-occurrence-gone") := by
  rw [dispatchSignal_eq]
  exact perform_gone (by simp [stale_eq, signalWork]) (by simp [gone_eq, signalWork, absent])

theorem cancel_occurrence_gone {hooks : Hooks} {ctx : Ctx} {id : OccurrenceId} {state : State} (absent : state.occurrence? id = none) :
    dispatchSignal hooks ctx (.cancel id) state = .error (.semanticFailure .invariant "queued-work-occurrence-gone") := by
  rw [dispatchSignal_eq]
  exact perform_gone (by simp [stale_eq, signalWork]) (by simp [gone_eq, signalWork, absent])

theorem fire_absent {hooks : Hooks} {ctx : Ctx} {item : ItemKey} {fired : Fired} {state : State}
    (absent : state.openItems[item]? = none) : (signalWork hooks ctx (.fire item fired)).run state = .ok state := by
  simp [signalWork, absent]

/-- What a signal's work names (`Step.stale`, `Step.gone`) is read from the signal alone, never from the hooks or the
context: a lane reads a queued signal's targets from `Step.signalWork` of any hooks and context, not `Signal`'s cases. -/
theorem signalWork_targets (hooks hooks' : Hooks) (ctx ctx' : Ctx) (signal : Signal) :
    (signalWork hooks ctx signal).scopes = (signalWork hooks' ctx' signal).scopes ∧
      (signalWork hooks ctx signal).occurrences = (signalWork hooks' ctx' signal).occurrences ∧
      (signalWork hooks ctx signal).requires = (signalWork hooks' ctx' signal).requires ∧
      (signalWork hooks ctx signal).acts = (signalWork hooks' ctx' signal).acts := by
  cases signal <;> simp [signalWork]

/-! ### What an addressed input's lookups read

The body fact behind `Kernel.Laws.Step.Inputs.step_unknown`: what an occurrence lookup finds; that a timer firing and an
effect result pass a rejection through is `Kernel.Laws.Step.Jobs`'. -/

/-- What `Step.occurrenceOf?` finds is an occurrence of the state with the reference's element, activation and
instance, numbered under its element's counter, and begun or waited for by an open item. -/
theorem occurrenceOf?_some {ctx : Ctx} {state : State} {ref : OccurrenceRef} {occurrence : Occurrence}
    (found : occurrenceOf? ctx state ref = some occurrence) : occurrence ∈ state.occurrences ∧
      (ctx.program.publicId occurrence.element = ref.element ∧ occurrence.activation = ref.activation ∧
        state.instanceOf occurrence.scope = ref.processInstanceId) ∧ occurrence.role = .element ∧
      (occurrence.begun = true ∨ ∃ item ∈ itemList state.openItems, item.id.occurrence = occurrence.id) := by
  unfold occurrenceOf? at found
  have holds := List.find?_some found
  simp only [Bool.and_eq_true, Bool.or_eq_true, beq_iff_eq, List.any_eq_true] at holds
  exact ⟨List.mem_of_find?_eq_some found, ⟨holds.1.2, holds.1.1.2, holds.2⟩, holds.1.1.1.2, holds.1.1.1.1⟩

/-! ### What each body ran

Which hook or state operation each committed body of `Kernel.Step` ran, and what `Step` had established when it ran it:
the facts `Kernel.Laws.Step.Keeps` composes into the preservation of an invariant without opening a body. -/

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

/-- What `completeIdleScope` ran, which `completeIdleScope_ok` and `completeIdleScope_called` state. -/
private theorem completeIdleScope_owner {hooks : Hooks} {ctx : Ctx} {scope : ScopeOccurrence} {state after : State}
    (ran : completeIdleScope hooks ctx scope state = .ok after) :
    ∃ id occurrence, scope.occurrence = some id ∧ state.occurrence? id = some occurrence ∧
      ((∃ header payload, hooks.completeScope ctx header payload scope occurrence state = .ok after) ∨
        (∃ header payload, scope.calledInstance.isSome = true ∧
          hooks.completeCall ctx header payload scope occurrence state = .ok after) ∨
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
          · exact .inr (.inl ⟨_, _, ‹_›, ran⟩)
          · simp at ran
        | event header payload => simp at ran
        | gateway header payload => simp at ran
        | start header payload => simp at ran

/-- An idle scope occurrence completes through the hook of the occurrence that owns it: a Scope's, a Call's or a
Multi-Instance body's. -/
theorem completeIdleScope_ok {hooks : Hooks} {ctx : Ctx} {scope : ScopeOccurrence} {state after : State}
    (ran : completeIdleScope hooks ctx scope state = .ok after) :
    ∃ id occurrence, scope.occurrence = some id ∧ state.occurrence? id = some occurrence ∧
      ((∃ header payload, hooks.completeScope ctx header payload scope occurrence state = .ok after) ∨
        (∃ header payload, hooks.completeCall ctx header payload scope occurrence state = .ok after) ∨
        ∃ header envelope loop, hooks.completeBody ctx header envelope loop occurrence state = .ok after) := by
  obtain ⟨id, occurrence, owned, ⟨found, completed⟩⟩ := completeIdleScope_owner ran
  exact ⟨id, occurrence, owned, found, completed.imp_right (.imp_left fun ⟨header, payload, _, ran⟩ => ⟨header, payload, ran⟩)⟩

/-- The closure moves a queued token: the one queued first under `orderInvariant`, the one queued last otherwise, by
the run log (`Step.earliest`, `Step.latest`). -/
theorem nextToken_mem {hooks : Hooks} {ctx : Ctx} {log : RunLog} {state : State} {unit : UnitKey} {token : Token}
    (next : nextToken hooks ctx log state = some (unit, token)) : state.queuedTokens[unit]? = some token ∧
      ((ctx.program.options.branchSchedule = .orderInvariant ∧ earliest log state.queuedTokens = some (unit, token)) ∨
        latest log state.queuedTokens = some (unit, token)) := by
  unfold nextToken at next
  split at next
  · exact ⟨earliest_mem next, .inl ⟨by assumption, next⟩⟩
  · split at next
    · simp at next
    · exact ⟨latest_mem next, .inr next⟩

theorem idleScope_mem {hooks : Hooks} {ctx : Ctx} {state : State} {scope : ScopeOccurrence}
    (idle : idleScope? hooks ctx state = some scope) : scope ∈ state.scopes := by
  unfold idleScope? at idle
  split at idle
  · simp at idle
  · exact List.mem_of_find?_eq_some idle

/-- The idle scope occurrence the closure completes has no child scope occurrence, since a parent is busy
(`StateFacts.parentBusy`): a nested Call's root keeps the scope occurrence it lies in from completing. -/
theorem idleScope?_childless (facts : StateFacts) {hooks : Hooks} {ctx : Ctx} {state : State} {scope : ScopeOccurrence}
    (idle : idleScope? hooks ctx state = some scope) : ∀ child ∈ state.scopes, child.parent ≠ some scope.id := by
  intro child member linked
  unfold idleScope? at idle
  split at idle
  · simp at idle
  · have chosen := List.find?_some idle
    simp only [Bool.and_eq_true, Bool.not_eq_true'] at chosen
    have busy := facts.parentBusy state child member scope.id linked
    simp [busy] at chosen

/-- An idle scope occurrence completes through the hook of the occurrence its own `occurrence` names, which stands,
never one found otherwise, and through `Hooks.completeCall` only as a called instance's root (`CALLN-RETURN-01`). -/
theorem completeIdleScope_called (facts : StateFacts) {hooks : Hooks} {ctx : Ctx} {scope : ScopeOccurrence}
    {state after : State} (ran : completeIdleScope hooks ctx scope state = .ok after) :
    ∃ occurrence ∈ state.occurrences, scope.occurrence = some occurrence.id ∧
      ((∃ header payload, hooks.completeScope ctx header payload scope occurrence state = .ok after) ∨
        (∃ header payload, scope.calledInstance.isSome = true ∧
          hooks.completeCall ctx header payload scope occurrence state = .ok after) ∨
        ∃ header envelope loop, hooks.completeBody ctx header envelope loop occurrence state = .ok after) := by
  obtain ⟨_, occurrence, owned, ⟨found, completed⟩⟩ := completeIdleScope_owner ran
  obtain ⟨member, named⟩ := facts.found _ _ _ found
  exact ⟨occurrence, member, named ▸ owned, completed⟩

/-- A parked join offered again ran its gateway's hook on the state the closure reached, for an occurrence it found,
under the offer's unit as the issuer (DC12). -/
theorem reoffer_ok {hooks : Hooks} {ctx : Ctx} {state : State} {gateway : ElementId} {scope : ScopeOccurrenceId}
    {named : OccurrenceId} {offered : State} (ran : reoffer? hooks ctx state = .ok (some (gateway, scope, named, offered))) :
    ∃ id occurrence header payload, (∃ waiting ∈ state.slots.parked, waiting.occurrence = id ∧ ∃ element,
      (ctx.program.target? waiting.flow).bind ctx.program.element? = some element ∧
        element.gateway? = some (header, payload)) ∧
      state.occurrence? id = some occurrence ∧ occurrence.id = named ∧ ∃ unit,
        UnitKey.offerUnit? occurrence.id (offerRound state occurrence.id) = some unit ∧
          hooks.arriveGateway ctx header payload occurrence { state with issuing := unit, issueNext := 0 } = .ok offered := by
  unfold reoffer? at ran
  refine foldlM_finds (fun found => ∃ id occurrence header payload, (∃ waiting ∈ state.slots.parked,
    waiting.occurrence = id ∧ ∃ element, (ctx.program.target? waiting.flow).bind ctx.program.element? = some element ∧
      element.gateway? = some (header, payload)) ∧ state.occurrence? id = some occurrence ∧ occurrence.id = found.2.2.1 ∧
      ∃ unit, UnitKey.offerUnit? occurrence.id (offerRound state occurrence.id) = some unit ∧
        hooks.arriveGateway ctx header payload occurrence { state with issuing := unit, issueNext := 0 } = .ok found.2.2.2)
    (fun found waiting result kept stepped => ?_) _ none _ (by simp) ran _ rfl
  split at stepped
  · exact (Except.ok.inj stepped) ▸ kept
  unfold offerParked at stepped
  split at stepped
  · simp at stepped
  · rename_i element targeted
    split at stepped
    · rename_i occurrence isGateway lookup
      split at stepped
      rotate_left
      · simp at stepped
      rename_i unit keyed
      obtain ⟨offeredState, offering, made⟩ := bind_ok stepped
      obtain ⟨last, isLast, found⟩ := Option.bind_eq_some_iff.mp lookup
      have kept := List.mem_filter.mp (List.mem_of_getLast? isLast)
      have sameTarget : ctx.program.target? last.flow = ctx.program.target? waiting.flow := by
        have matched := kept.2
        simp only [Bool.and_eq_true, beq_iff_eq] at matched
        exact matched.2
      intro result same
      rw [← Except.ok.inj made] at same
      split at same
      · simp at same
      · rw [← Option.some.inj same]
        exact ⟨_, _, _, _, ⟨last, kept.1, rfl, element, sameTarget ▸ targeted, isGateway⟩, found, rfl, unit, keyed, offering⟩
    · simp at stepped

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
    · rename_i found
      exact .onFire (.inl ⟨_, by
        exact Laws.State.mem_itemList.mpr ⟨_, by simpa using found⟩, ran⟩)
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
      | activity header payload =>
        exact .inr (.inr ⟨by simp [Laws.IL.start?_activity], single, .atActivity (Laws.IL.header_activity header payload ▸
          Laws.IL.element?_header known) (by rw [known]; exact Laws.IL.activity?_activity header payload) ran⟩)
      | scope header payload => exact .inr (.inr ⟨by simp [Laws.IL.start?_scope], single,
          .atScope (Laws.IL.header_scope header payload ▸ Laws.IL.element?_header known) ran⟩)
      | gateway header payload => exact .inr (.inr ⟨by simp [Laws.IL.start?_gateway], single,
          .atGateway (by rw [known]; exact Laws.IL.gateway?_gateway header payload) ran⟩)
      | event header payload =>
        refine .inr (.inr ⟨by simp [Laws.IL.start?_event], single, ?_⟩)
        dsimp only at ran
        cases role : payload.role with
        | «catch» subscription => simp only [role] at ran; exact .atCatch ran
        | «throw» thrown => simp only [role] at ran; exact .atThrow (Laws.IL.element?_event known) ran
        | linkCatch name => simp only [role] at ran; exact .atLink ⟨_, known, Laws.IL.header_event _ _⟩ ran
        | linkThrow name => simp only [role] at ran; exact .atLink ⟨_, known, Laws.IL.header_event _ _⟩ ran

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
