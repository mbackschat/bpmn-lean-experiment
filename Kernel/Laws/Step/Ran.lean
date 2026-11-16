module

public import Kernel.Laws.Step.Contract

/-! # Laws of the step function: what a committed body ran

The shapes `Kernel.Laws.Step`'s decomposition states of `Kernel.Step`'s bodies, one constructor or alternative per
hook or state operation a committed body can have run: a closure's micro-step (`ClosureStep`) and where a closure
stops (`Quiescent`), a start and a running input's transition (`StartRan`, `RunsTransition`), the end of the
completion pipeline (`Finishes`), a begun occurrence's dispatch (`Arrives`, `BodyArrives`), a queued signal's work
(`Performed`) and a command (`Commands`).
They name bodies without reading them, so they sit below `Kernel.Laws.Step`, which proves them of the bodies, and keep
that module to its body equations; so does the decomposition of a committed bind (`bind_ok`). Nothing executable
imports this module.
-/

@[expose] public section

namespace Kernel.Laws.Step

open Kernel Kernel.Step

/-- A committed bind committed both its parts, whatever the body it binds. -/
theorem bind_ok {α β ε : Type} {x : Except ε α} {f : α → Except ε β} {b : β} (ran : (x >>= f) = .ok b) :
    ∃ a, x = .ok a ∧ f a = .ok b := by
  cases x with
  | error failure => exact absurd ran (by simp [bind, Except.bind])
  | ok a => exact ⟨a, by simp, by simpa [bind, Except.bind] using ran⟩

/-- `ClosureStep hooks ctx before after`: `after` is what one micro-step of `Step.settle` commits from `before`, in the
order `settle` picks it: the next queued signal; else the next token (`Step.nextToken`); else an idle scope occurrence
(`Step.idleScope?`); else a parked join offered again (`Step.reoffer?`); else, once the root is idle, the instance's
completion. Each constructor names the micro-step's body, so a lane proves an invariant of the closure one body at a
time (`settle_induction`). -/
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


/-- The closure has nothing left to run in `state` but, once its root is idle, the instance's completion: no queued
signal, no token to move, no idle scope occurrence and no parked join that fires when it is offered again. -/
def Quiescent (hooks : Hooks) (ctx : Ctx) (state : State) : Prop :=
  state.signals = [] ∧ nextToken ctx state = none ∧ idleScope? ctx state = none ∧ reoffer? hooks ctx state = .ok none

/-- The context `Step.step` gives every hook of `input`'s closure. -/
def inputCtx (hooks : Hooks) (program : Program) (input : Input) : Ctx :=
  { context hooks program with conditionChoices := (inputHead input).2.2 }


/-- What a start input runs: its start Event's begin in a fresh instance whose root's Event Sub-Process starts are
queued for arming, as one micro-step after the clock advanced to the input's time; then the closure. The start is the
one `chooseStart` picked among the starts the input fired (`admittedStartsFired`). -/
structure StartRan (hooks : Hooks) (program : Program) (payload : StartInput) (after : State) : Prop where
  ran : ∃ start initial moved settled,
    advanceClock payload.atMs
      ((State.initial payload.instanceId payload.variables payload.businessKey).signal (.armScope State.root)) =
        .ok initial ∧
    microStep hooks (inputCtx hooks program (.start payload)) (.input .start) (some start) State.root
      (begin hooks (inputCtx hooks program (.start payload)) { element := start, scope := State.root, trigger := payload.trigger })
      initial = .ok moved ∧
    settle hooks (inputCtx hooks program (.start payload)) closureBound closureWorkBound moved = .ok settled ∧
    after = { settled with journal := settled.journal.reverse } ∧
    ∃ fired, admittedStartsFired hooks (inputCtx hooks program (.start payload)) payload = .ok fired ∧
      chooseStart payload.startEvent fired = .ok start

/-- What the transition of a committed input on a running instance (`Step.onRunning`'s argument) is made of: it is
`Step.command`'s or `Step.deliverEffectResult`'s, or it fires, through `Step.fireItem`, an open item it found or the one
`Hooks.delivered` picked. -/
def RunsTransition (hooks : Hooks) (ctx : Ctx) (transition : State → Outcome) : Prop :=
  (∃ data, transition = command hooks ctx data) ∨ (∃ data, transition = deliverEffectResult hooks ctx data) ∨
    ∀ state after, transition state = .ok after → ∃ item fired,
      (item ∈ state.openItems ∨ ∃ data, hooks.delivered ctx data state = .ok (item, fired)) ∧
      fireItem hooks ctx item fired state = .ok after


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


/-- The Multi-Instance hook a begun body occurrence's dispatch ran (`Step.dispatch`, `Step.bodyLoop?`): the occurrence
is numbered as a body, and the header handed over names its element, whose envelope carries the loop handed over. -/
def BodyArrives (hooks : Hooks) (ctx : Ctx) (occurrence : Occurrence) (state after : State) : Prop :=
  ∃ header envelope loop, occurrence.role = .multiInstanceBody ∧ header.id = occurrence.element ∧
    ((ctx.program.element? header.id).bind (·.envelope?)).bind (·.multiInstance) = some loop ∧
    hooks.arriveMultiInstance ctx header envelope loop occurrence state = .ok after

/-- The element hook a begun occurrence's dispatch ran (`Step.dispatch`) when it is no Multi-Instance body's. -/
inductive Arrives (hooks : Hooks) (ctx : Ctx) (occurrence : Occurrence) (entry : ScopeEntry) (trigger : StartTrigger)
    (state after : State) : Prop where
  | atStart {header : Header} {payload : StartPayload} :
      hooks.arriveStart ctx header payload trigger occurrence state = .ok after →
      Arrives hooks ctx occurrence entry trigger state after
  | atActivity {header : Header} {payload : ActivityPayload} : header.id = occurrence.element →
      (ctx.program.element? occurrence.element).bind (·.activity?) = some (header, payload) →
      hooks.arriveActivity ctx header payload occurrence state = .ok after →
      Arrives hooks ctx occurrence entry trigger state after
  | atScope {header : Header} {payload : ScopePayload} : header.id = occurrence.element →
      hooks.arriveScope ctx header payload occurrence entry state = .ok after →
      Arrives hooks ctx occurrence entry trigger state after
  | atGateway {header : Header} {payload : GatewayPayload} :
      (ctx.program.element? occurrence.element).bind (·.gateway?) = some (header, payload) →
      hooks.arriveGateway ctx header payload occurrence state = .ok after →
      Arrives hooks ctx occurrence entry trigger state after
  | atCatch {header : Header} {payload : EventPayload} {subscription : Subscription} :
      hooks.arriveCatch ctx header payload subscription occurrence state = .ok after →
      Arrives hooks ctx occurrence entry trigger state after
  | atThrow {header : Header} {payload : EventPayload} {thrown : Throw} : header.id = occurrence.element →
      hooks.arriveThrow ctx header payload thrown occurrence state = .ok after →
      Arrives hooks ctx occurrence entry trigger state after
  | atLink {header : Header} {payload : EventPayload} :
      (∃ element, ctx.program.element? occurrence.element = some element ∧ element.header = header) →
      hooks.arriveLink ctx header payload occurrence state = .ok after →
      Arrives hooks ctx occurrence entry trigger state after


/-- What a committed queued signal ran (`Step.signalWork`), with what `Step.stale` and `Step.gone` let it find standing:
an issued scope occurrence or occurrence it names, and the scope occurrence it acts from. -/
inductive Performed (hooks : Hooks) (ctx : Ctx) : Signal → State → State → Prop where
  | onArm {host : Nat} {element : ElementId} {scope : ScopeOccurrenceId} {state after : State} :
      (host < state.nextIssue → ∃ occurrence, state.occurrence? host = some occurrence) →
      (scope.value < state.nextIssue → ScopeStands state scope) →
      hooks.arm ctx host element scope state = .ok after → Performed hooks ctx (.arm host element scope) state after
  | onArmScope {scope : ScopeOccurrenceId} {state after : State} :
      (scope.value < state.nextIssue → ScopeStands state scope) →
      hooks.armScope ctx scope state = .ok after → Performed hooks ctx (.armScope scope) state after
  | onArmGateway {occurrence : Nat} {gateway : ElementId} {scope : ScopeOccurrenceId} {state after : State} :
      (occurrence < state.nextIssue → ∃ found, state.occurrence? occurrence = some found) →
      (scope.value < state.nextIssue → ScopeStands state scope) →
      hooks.armGateway ctx occurrence gateway scope state = .ok after →
      Performed hooks ctx (.armGateway occurrence gateway scope) state after
  | onRaise {event : Raised} {origin : Origin} {state after : State} :
      hooks.raise ctx event origin state = .ok after → Performed hooks ctx (.raise event origin) state after
  | onBegin {request : BeginRequest} {state after : State} :
      begin hooks ctx request state = .ok after → Performed hooks ctx (.begin request) state after
  | onComplete {occurrence : Nat} {leave : Leave} {writes : List (String × Value)} {rule : WriteRule} {state after : State} :
      complete hooks ctx occurrence leave writes rule state = .ok after →
      Performed hooks ctx (.complete occurrence leave writes rule) state after
  | onWrite {scope : ScopeOccurrenceId} {writes : List (String × Value)} {rule : WriteRule} {state after : State} :
      ScopeStands state scope → hooks.writeOutputs ctx scope writes rule state = .ok after →
      Performed hooks ctx (.write scope writes rule) state after
  | onRemove {scope : ScopeOccurrenceId} {names : List String} {state after : State} :
      ScopeStands state scope → hooks.removeVariables ctx scope names state = .ok after →
      Performed hooks ctx (.remove scope names) state after
  | onOccur {element : ElementId} {scope : ScopeOccurrenceId} {leave : Leave} {writes : List (String × Value)}
      {rule : WriteRule} {state after : State} : ScopeStands state scope →
      complete hooks ctx (state.reserve element scope).2.id leave writes rule (state.reserve element scope).1 = .ok after →
      Performed hooks ctx (.occur element scope leave writes rule) state after
  | onCancel {occurrence : Nat} {state : State} :
      Performed hooks ctx (.cancel occurrence) state (state.cancelOccurrence occurrence)
  | onFire {item : Nat} {fired : Fired} {state after : State} :
      ((∃ open_ ∈ state.openItems, fireItem hooks ctx open_ fired state = .ok after) ∨ after = state) →
      Performed hooks ctx (.fire item fired) state after
  | onEndInstance {status : InstanceStatus} {failure : Option InstanceFailure} {state : State} :
      Performed hooks ctx (.endInstance status failure) state (endInstance status failure state)
  | onCompensate {scope : ScopeOccurrenceId} {activity : Option ElementId} {trigger : OccurrenceRef} {leave : Option Nat}
      {resume : Option Resume} {state after : State} : ScopeStands state scope →
      hooks.compensate ctx scope activity trigger leave resume state = .ok after →
      Performed hooks ctx (.compensate scope activity trigger leave resume) state after
  | onCompensationFailed {handler : ScopeOccurrenceId} {code : String} {message : Option String} {origin : Origin}
      {state after : State} : ScopeStands state handler →
      hooks.failCompensation ctx handler code message origin state = .ok after →
      Performed hooks ctx (.compensationFailed handler code message origin) state after


/-- What a committed variable, task or incident command ran (`Step.command`). -/
inductive Commands (hooks : Hooks) (ctx : Ctx) (state after : State) : Prop where
  | completeUserTask {header : Header} {payload : ActivityPayload} {item : OpenItem} {values : List (String × Value)} :
      item ∈ state.openItems → (ctx.program.element? item.element).bind (·.activity?) = some (header, payload) →
      hooks.completeUserTask ctx header payload item values state = .ok after →
      Commands hooks ctx state after
  | retryIncident {item : OpenItem} {detail : IncidentDetail} {generation : Nat} :
      item ∈ state.openItems → item.kind.view.incident = some detail →
      hooks.retryIncident ctx item detail generation state = .ok after →
      Commands hooks ctx state after
  | cancelIncidentProcess {detail : IncidentDetail} {generation : Nat} :
      hooks.cancelIncidentProcess ctx detail generation state = .ok after → Commands hooks ctx state after
  | write {scope : ScopeOccurrenceId} {writes : List (String × Value)} :
      after = state.signal (.write scope writes .outward) → Commands hooks ctx state after
  | remove {scope : ScopeOccurrenceId} {names : List String} :
      after = state.signal (.remove scope names) → Commands hooks ctx state after

/-- What a monadic fold over `Option` keeps of the value it found. -/
theorem foldlM_finds {α β : Type} {f : Option β → α → Except Failure (Option β)} (property : β → Prop)
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

end Kernel.Laws.Step
