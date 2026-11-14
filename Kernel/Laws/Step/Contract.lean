module

public import Kernel.Step
public import Kernel.Laws.State.Invariant

/-! # Laws of the step function: the preservation contract

What `Step.step` needs of the hooks and of the state operations it applies for an invariant of the state to pass through
it: one obligation per field of `Hooks` (`HookContract`) and one per phase `Step` runs itself (`Phases`), each from
what `Step` establishes before it runs them, and what the state operations do to the fields `Step` and the hooks read,
whatever the invariant (`StateFacts`). `Kernel.Laws.Step.Keeps` composes them.

A feature proves the field of each hook it fills generically in the invariant, without importing `Laws.State` or this
module: its `Laws` module states, in `Kernel.State`'s vocabulary, an operations record of what its hooks' bodies need of
the state operations they apply (that each keeps the invariant under the conditions the hook establishes, and the
invariant-free facts it reads), and proves one lemma per hook from it. `Kernel.Proofs.Step` fills each feature's record
from `Operations` and `StateFacts` and assembles the registered hooks' contract; `Laws.State` proves `Operations` and
`Phases` of `Laws.State.WellFormed` and `StateFacts`. Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Laws.Step

open Kernel Kernel.Step

/-- The scope occurrence `scope` stands in `state`. -/
def ScopeStands (state : State) (scope : ScopeOccurrenceId) : Prop := ∃ entry ∈ state.scopes, entry.id = scope

/-- The occurrence `id` stands in `state`. -/
def OccurrenceStands (state : State) (id : Nat) : Prop := ∃ occurrence ∈ state.occurrences, occurrence.id = id

/-- A begin request `Step` may begin in `state`: the reservations it names are distinct, each beginnable in the
request's scope occurrence and claimed by nothing queued or slotted (`Laws.State.ReservationsClaimed`), and its Event
Sub-Process start reservation lies in that scope occurrence. A request an arrival or a start makes names none. -/
def Admitted (state : State) (request : BeginRequest) : Prop :=
  (Laws.State.names request).Nodup ∧ (∀ id ∈ Laws.State.names request,
    Laws.State.Beginnable state request.scope id ∧ Laws.State.Unclaimed state id) ∧
    Laws.State.InnerPlaced state request

/-- What the completion pipeline needs of each phase it runs between closing the completing occurrence's own items and
removing its record (`Step.complete`): the scope occurrences and the begun occurrences stay, and no open item is added,
so the record goes with nothing left waiting for it or hanging on it. -/
structure PipelineFrame (before after : State) : Prop where
  scopes : after.scopes = before.scopes
  begun : ∀ occurrence ∈ before.occurrences, occurrence.begun = true → occurrence ∈ after.occurrences
  items : ∀ item ∈ after.openItems, item ∈ before.openItems

/-- What each hook must keep of `inv`, given what `Step` establishes before it calls the hook: the occurrence it hands
over stands (a begun occurrence, an idle scope occurrence's owner, a parked join's latest occurrence, the completing
occurrence), and an arrival's is begun, as `Step.begin` hands it over and as a parked join's offer finds it, and an
activity's, catch's or throw's is of an element the program declares no start Event of (`Step.dispatch` sends those to
`Hooks.arriveStart`) and numbered under its element's counter (it sends a Multi-Instance body to
`Hooks.arriveMultiInstance`), a throw's header naming its element (`Program.element?` finds it by that name); the item it hands
over is open; the scope occurrence and occurrence a queued signal names stand (`Step.stale`, `Step.gone`), an arming's
host is begun in the scope occurrence the arming names, a compensation may end as it asks (`Laws.State.Resumable`),
and a raise finds what its origin names and a settled host (`Laws.State.Raisable`); a completed occurrence's continuation runs while its scope occurrence stands;
an Event Sub-Process's start Event reservation (`ScopeEntry.inner`) is beginnable in, and lies in, the scope occurrence
its occurrence began in, and nothing claims it. The completion pipeline's hooks also keep its frame (`PipelineFrame`),
and `Hooks.leave` leaves nothing hanging on the completing occurrence. `Hooks.delivered`, a query, picks an open item.
Each field keeps `inv` under the program of the hook's context, which is the program the step runs
(`Laws.Step.inputCtx_program`). Each feature's `Laws` module proves the fields of the hooks it fills. -/
structure HookContract (hooks : Hooks) (inv : Program → State → Prop) : Prop where
  arriveStart : ∀ ctx header payload trigger occurrence state after, inv ctx.program state →
    occurrence ∈ state.occurrences →
    occurrence.begun = true → hooks.arriveStart ctx header payload trigger occurrence state = .ok after →
    inv ctx.program after
  arriveActivity : ∀ ctx header payload occurrence state after, inv ctx.program state → occurrence ∈ state.occurrences →
    occurrence.begun = true → (ctx.program.element? occurrence.element).bind (·.start?) = none →
    occurrence.role = .element → hooks.arriveActivity ctx header payload occurrence state = .ok after →
    inv ctx.program after
  arriveMultiInstance : ∀ ctx header envelope loop occurrence state after, inv ctx.program state →
    occurrence ∈ state.occurrences →
    occurrence.begun = true → hooks.arriveMultiInstance ctx header envelope loop occurrence state = .ok after →
    inv ctx.program after
  arriveScope : ∀ ctx header payload occurrence entry state after, inv ctx.program state →
    occurrence ∈ state.occurrences →
    occurrence.begun = true →
    (∀ id ∈ entry.inner.toList, Laws.State.Beginnable state occurrence.scope id ∧ Laws.State.Unclaimed state id ∧
      ∀ found ∈ state.occurrences, found.id = id → found.scope = occurrence.scope) →
    hooks.arriveScope ctx header payload occurrence entry state = .ok after → inv ctx.program after
  arriveGateway : ∀ ctx header payload occurrence state after, inv ctx.program state → occurrence ∈ state.occurrences →
    occurrence.begun = true → hooks.arriveGateway ctx header payload occurrence state = .ok after →
    inv ctx.program after
  arriveCatch : ∀ ctx header payload subscription occurrence state after, inv ctx.program state →
    occurrence ∈ state.occurrences →
    occurrence.begun = true → (ctx.program.element? occurrence.element).bind (·.start?) = none →
    occurrence.role = .element → hooks.arriveCatch ctx header payload subscription occurrence state = .ok after →
    inv ctx.program after
  arriveThrow : ∀ ctx header payload thrown occurrence state after, inv ctx.program state →
    occurrence ∈ state.occurrences → occurrence.begun = true →
    (ctx.program.element? occurrence.element).bind (·.start?) = none → occurrence.role = .element →
    header.id = occurrence.element → hooks.arriveThrow ctx header payload thrown occurrence state = .ok after →
    inv ctx.program after
  arriveLink : ∀ ctx header payload occurrence state after, inv ctx.program state → occurrence ∈ state.occurrences →
    occurrence.begun = true → hooks.arriveLink ctx header payload occurrence state = .ok after → inv ctx.program after
  completeScope : ∀ ctx header payload scope occurrence state after, inv ctx.program state → scope ∈ state.scopes →
    occurrence ∈ state.occurrences → scope.occurrence = some occurrence.id →
    hooks.completeScope ctx header payload scope occurrence state = .ok after → inv ctx.program after
  completeCall : ∀ ctx header payload scope occurrence state after, inv ctx.program state → scope ∈ state.scopes →
    occurrence ∈ state.occurrences → scope.occurrence = some occurrence.id →
    hooks.completeCall ctx header payload scope occurrence state = .ok after → inv ctx.program after
  completeBody : ∀ ctx header envelope loop occurrence state after, inv ctx.program state →
    occurrence ∈ state.occurrences →
    hooks.completeBody ctx header envelope loop occurrence state = .ok after → inv ctx.program after
  /-- A task command, effect result, incident retry or Activity delivery addresses an item of an Activity, or one that
  waits for an effect or an incident, as `Step` finds it. -/
  completeUserTask : ∀ ctx header payload item values state after, inv ctx.program state → item ∈ state.openItems →
    (ctx.program.element? item.element).bind (·.activity?) = some (header, payload) → hooks.completeUserTask ctx header payload item values state = .ok after → inv ctx.program after
  effectResult : ∀ ctx item outcome state after, inv ctx.program state → item ∈ state.openItems →
    item.kind.view.effect.isSome = true → hooks.effectResult ctx item outcome state = .ok after → inv ctx.program after
  retryIncident : ∀ ctx item detail generation state after, inv ctx.program state → item ∈ state.openItems →
    item.kind.view.incident = some detail → hooks.retryIncident ctx item detail generation state = .ok after → inv ctx.program after
  cancelIncidentProcess : ∀ ctx detail generation state after, inv ctx.program state →
    hooks.cancelIncidentProcess ctx detail generation state = .ok after → inv ctx.program after
  triggerActivity : ∀ ctx header payload item fired state after, inv ctx.program state → item ∈ state.openItems →
    (ctx.program.element? item.element).bind (·.activity?) = some (header, payload) → hooks.triggerActivity ctx header payload item fired state = .ok after → inv ctx.program after
  trigger : ∀ ctx item fired state after, inv ctx.program state → item ∈ state.openItems →
    hooks.trigger ctx item fired state = .ok after → inv ctx.program after
  arm : ∀ ctx host element scope state after, inv ctx.program state → OccurrenceStands state host →
    ScopeStands state scope →
    (∀ occurrence ∈ state.occurrences, occurrence.id = host → occurrence.begun = true ∧ occurrence.scope = scope) →
    hooks.arm ctx host element scope state = .ok after → inv ctx.program after
  armScope : ∀ ctx scope state after, inv ctx.program state → ScopeStands state scope →
    hooks.armScope ctx scope state = .ok after → inv ctx.program after
  armGateway : ∀ ctx occurrence gateway scope state after, inv ctx.program state → OccurrenceStands state occurrence →
    ScopeStands state scope →
    (∀ found ∈ state.occurrences, found.id = occurrence → found.begun = true ∧ found.scope = scope) →
    hooks.armGateway ctx occurrence gateway scope state = .ok after → inv ctx.program after
  /-- A raise finds what its origin names and a settled host, as the closure takes it off the queue. -/
  raise : ∀ ctx event origin state after, inv ctx.program state → Laws.State.Raisable ctx.program state origin →
    (∀ host, origin.host = some host → Laws.State.Settled state host) → hooks.raise ctx event origin state = .ok after →
    inv ctx.program after
  compensate : ∀ ctx scope activity trigger leave resume state after, inv ctx.program state → ScopeStands state scope →
    (∀ next, resume = some next → Laws.State.Resumable state scope next) →
    hooks.compensate ctx scope activity trigger leave resume state = .ok after → inv ctx.program after
  failCompensation : ∀ ctx handler code message origin state after, inv ctx.program state → ScopeStands state handler →
    hooks.failCompensation ctx handler code message origin state = .ok after → inv ctx.program after
  leave : ∀ ctx occurrence state after, inv ctx.program state → occurrence ∈ state.occurrences →
    hooks.leave ctx occurrence state = .ok after →
    inv ctx.program after ∧ PipelineFrame state after ∧ ∀ item ∈ after.openItems, item.attachedTo ≠ some occurrence.id
  writeOutputs : ∀ ctx scope writes rule state after, inv ctx.program state → ScopeStands state scope →
    hooks.writeOutputs ctx scope writes rule state = .ok after → inv ctx.program after ∧ PipelineFrame state after
  removeVariables : ∀ ctx scope names state after, inv ctx.program state → ScopeStands state scope →
    hooks.removeVariables ctx scope names state = .ok after → inv ctx.program after
  completed : ∀ ctx occurrence state after, inv ctx.program state → occurrence ∈ state.occurrences →
    hooks.completed ctx occurrence state = .ok after → inv ctx.program after ∧ PipelineFrame state after
  outflow : ∀ ctx occurrence leave state after, inv ctx.program state → ScopeStands state occurrence.scope →
    hooks.outflow ctx occurrence leave state = .ok after → inv ctx.program after
  instanceCompleted : ∀ ctx body occurrence writes state after, inv ctx.program state →
    ScopeStands state occurrence.scope →
    hooks.instanceCompleted ctx body occurrence writes state = .ok after → inv ctx.program after
  handlerCompleted : ∀ ctx run occurrence state after, inv ctx.program state → ScopeStands state occurrence.scope →
    hooks.handlerCompleted ctx run occurrence state = .ok after → inv ctx.program after
  handlerEnded : ∀ ctx run occurrence state after, inv ctx.program state → ScopeStands state occurrence.scope →
    hooks.handlerEnded ctx run occurrence state = .ok after → inv ctx.program after
  cancelled : ∀ ctx occurrence state after, inv ctx.program state →
    hooks.cancelled ctx occurrence state = .ok after → inv ctx.program after
  written : ∀ ctx writes state after, inv ctx.program state → hooks.written ctx writes state = .ok after →
    inv ctx.program after
  delivered : ∀ ctx data state item fired, hooks.delivered ctx data state = .ok (item, fired) → item ∈ state.openItems

/-- What each phase `Step` runs itself must keep of `inv`, and what the closure reads of `inv`: the arming a queued
signal asks for names issued identities, so one that `Step.stale` lets run finds them standing, and a host that stands
begun in the scope occurrence it names; a queued begin is
`Admitted` once it leaves the queue, and a queued completion completes no reservation a queued begin names; and a queued
instance end records a failure exactly when it fails. The state operations' obligations are `Laws.State`'s. The phases
only the completion pipeline runs are apart (`PipelinePhases`), and so is the reset that starts an input
(`Laws.Step.running_keeps`): an invariant that counts an input's end facts holds across the pipeline only as a unit and
from the input's start only (`Kernel.Laws.Step.Ends`). -/
structure Phases (inv : Program → State → Prop) : Prop where
  clock : ∀ program state atMs, inv program state → inv program { state with logicalTimeMs := atMs }
  /-- `Step.conclude` journals the draft and empties it and the write log. -/
  journal : ∀ program state (transition : Transition), inv program state → transition.started = state.draft.started →
    transition.ended = state.draft.ended →
    inv program { state with journal := transition :: state.journal, draft := {}, writes := [] }
  /-- `Step.orderJournal`. -/
  runOrder : ∀ program state, inv program state → inv program { state with journal := state.journal.reverse }
  /-- Signals leave the queue: the closure's next, or a micro-step's sole completion that `Step.absorb` runs. -/
  dequeue : ∀ program state signals, inv program state → signals.Sublist state.signals →
    inv program { state with signals := signals }
  /-- The closure's next token leaves the work stack. -/
  untoken : ∀ program state tokens, inv program state → tokens.Sublist state.tokens →
    inv program { state with tokens := tokens }
  /-- A variable command queues its write or its removal. -/
  queueWrite : ∀ program state scope writes rule, inv program state →
    inv program (state.signal (.write scope writes rule))
  queueRemove : ∀ program state scope names, inv program state → inv program (state.signal (.remove scope names))
  armIssued : ∀ program state host element scope, inv program state → Signal.arm host element scope ∈ state.signals →
    host < state.nextIssue ∧ scope.value < state.nextIssue ∧
      ∀ occurrence ∈ state.occurrences, occurrence.id = host → occurrence.begun = true ∧ occurrence.scope = scope
  armScopeIssued : ∀ program state scope, inv program state → Signal.armScope scope ∈ state.signals →
    scope.value < state.nextIssue
  armGatewayIssued : ∀ program state occurrence gateway scope, inv program state →
    Signal.armGateway occurrence gateway scope ∈ state.signals →
    occurrence < state.nextIssue ∧ scope.value < state.nextIssue ∧
      ∀ found ∈ state.occurrences, found.id = occurrence → found.begun = true ∧ found.scope = scope
  endRecorded : ∀ program state status failure, inv program state → Signal.endInstance status failure ∈ state.signals →
    (failure.isSome = true ↔ status = .failed)
  /-- The closure's next signal or token, a begin, may begin once it leaves the queue. -/
  admittedSignal : ∀ program state request rest, inv program state → state.signals = .begin request :: rest →
    Admitted { state with signals := rest } request
  admittedToken : ∀ program state request rest, inv program state →
    (state.tokens = .begin request :: rest ∨ state.tokens = rest ++ [.begin request]) →
    Admitted { state with tokens := rest } request
  completeQueued : ∀ program state id leave writes rule, inv program state →
    Signal.complete id leave writes rule ∈ state.signals →
    ∀ request, Laws.State.Queued state request → id ∉ Laws.State.names request
  /-- The closure's next signal, a compensation, may end as it asks once it leaves the queue. -/
  resumable : ∀ program state scope activity trigger leave resume rest, inv program state →
    state.signals = .compensate scope activity trigger leave (some resume) :: rest →
    Laws.State.Resumable { state with signals := rest } scope resume
  /-- The closure's next signal, a raise, finds what its origin names and a settled host once it leaves the queue. -/
  raisable : ∀ program state raised origin rest, inv program state → state.signals = .raise raised origin :: rest →
    Laws.State.Raisable program { state with signals := rest } origin ∧
      ∀ host, origin.host = some host → Laws.State.Settled { state with signals := rest } host
  /-- An occurrence's scope occurrence stands. -/
  housed : ∀ program state occurrence, inv program state → occurrence ∈ state.occurrences →
    ScopeStands state occurrence.scope
  /-- An occurrence numbered as a Multi-Instance body is of an element with a Multi-Instance envelope, so a dispatch
  hands every other hook an occurrence of the element role (`Laws.Step.dispatch_unstarted`). -/
  bodied : ∀ program state occurrence, inv program state → occurrence ∈ state.occurrences →
    occurrence.role = .multiInstanceBody →
      (((program.element? occurrence.element).bind (·.envelope?)).bind (·.multiInstance)).isSome = true
  /-- An occurrence parked at a join is begun while it stands, so a join offered again hands over a begun one. -/
  parkedBegun : ∀ program state waiting occurrence, inv program state → waiting ∈ state.slots.parked →
    occurrence ∈ state.occurrences →
    occurrence.id = waiting.occurrence → occurrence.begun = true
  /-- `Step.endInstance`, with a failure exactly when the instance fails. -/
  endInstance : ∀ program state status failure, inv program state → (failure.isSome = true ↔ status = .failed) →
    inv program (endInstance status failure state)
  /-- `State.beginOccurrence` of an admitted request, in a scope occurrence that stands (`Step.requireScope`); the
  request's start Event reservation stays beginnable, unclaimed and placed in the scope occurrence its begun occurrence
  runs in. An Event's occurrence numbers under its element's counter (`Laws.Step.roleOf_event`), and a body only an
  element with a Multi-Instance envelope's (`Laws.Step.roleOf_body`). -/
  begin : ∀ program state request role sourceType, inv program state → ScopeStands state request.scope →
    Admitted state request → (((program.element? request.element).bind (·.event?)).isSome = true → role = .element) →
    (role = .multiInstanceBody →
      (((program.element? request.element).bind (·.envelope?)).bind (·.multiInstance)).isSome = true) →
    inv program (state.beginOccurrence request role sourceType).1 ∧ ∀ id ∈ request.inner.toList,
      Laws.State.Beginnable (state.beginOccurrence request role sourceType).1
        (state.beginOccurrence request role sourceType).2.scope id ∧
      Laws.State.Unclaimed (state.beginOccurrence request role sourceType).1 id ∧
      ∀ found ∈ (state.beginOccurrence request role sourceType).1.occurrences, found.id = id →
        found.scope = (state.beginOccurrence request role sourceType).2.scope
  /-- `State.reserve` for `Signal.occur`, in a scope occurrence that stands; nothing queued names the reservation. -/
  reserve : ∀ program state element scope, inv program state → ScopeStands state scope →
    inv program (state.reserve element scope).1 ∧
    ∀ request, Laws.State.Queued (state.reserve element scope).1 request →
      (state.reserve element scope).2.id ∉ Laws.State.names request
  cancel : ∀ program state id, inv program state → inv program (state.cancelOccurrence id)

/-- What the completion pipeline's own phases must keep of `inv` (`Step.complete`): starting the completing reservation
and closing its items, removing its record and journalling its end. -/
structure PipelinePhases (inv : Program → State → Prop) : Prop where
  /-- `State.startReserved` of an occurrence no queued begin names, which the completion pipeline starts, then
  `State.closeOwnItems` of it, which closes what waited for it. -/
  startReserved : ∀ program state occurrence sourceType, inv program state → occurrence ∈ state.occurrences →
    (∀ request, Laws.State.Queued state request → occurrence.id ∉ Laws.State.names request) →
    inv program ((state.startReserved occurrence sourceType).1.closeOwnItems occurrence.id)
  /-- `State.removeOccurrence` of an occurrence on which nothing waits or hangs; its scope occurrence stays. -/
  removeOccurrence : ∀ program state occurrence, inv program state → occurrence ∈ state.occurrences →
    (∀ item ∈ state.openItems, item.occurrence ≠ occurrence.id ∧ item.attachedTo ≠ some occurrence.id) →
    inv program (state.removeOccurrence occurrence.id) ∧ ScopeStands (state.removeOccurrence occurrence.id) occurrence.scope
  recordEnd : ∀ program state key terminal, inv program state → inv program (state.recordEnd key terminal)

/-- The completion pipeline keeps `inv`, from a state in which no queued begin names the completing occurrence:
`Laws.Step.complete_keeps` gives it from the hook contract, `Phases` and `PipelinePhases`, and the walk of
`Laws.Step.Keeps` takes it as a premise. -/
def PipelineKeeps (hooks : Hooks) (inv : Program → State → Prop) : Prop :=
  ∀ (ctx : Ctx) (id : Nat) (leave : Leave) (writes : List (String × Value)) (rule : WriteRule) (state after : State),
    inv ctx.program state → (∀ request, Laws.State.Queued state request → id ∉ Laws.State.names request) →
    complete hooks ctx id leave writes rule state = .ok after → inv ctx.program after

/-- What the state operations `Step` applies do to the fields it reads, whatever the invariant (`Laws.State`). -/
structure StateFacts : Prop where
  found : ∀ (state : State) id occurrence, state.occurrence? id = some occurrence →
    occurrence ∈ state.occurrences ∧ occurrence.id = id
  begun : ∀ (state : State) request role sourceType,
    (state.beginOccurrence request role sourceType).2 ∈ (state.beginOccurrence request role sourceType).1.occurrences ∧
    (state.beginOccurrence request role sourceType).2.begun = true
  startReserved : ∀ (state : State) occurrence sourceType, occurrence ∈ state.occurrences →
    (state.startReserved occurrence sourceType).2 ∈ (state.startReserved occurrence sourceType).1.occurrences ∧
    (state.startReserved occurrence sourceType).2.begun = true ∧
    (state.startReserved occurrence sourceType).2.id = occurrence.id ∧
    (state.startReserved occurrence sourceType).2.scope = occurrence.scope ∧
    (state.startReserved occurrence sourceType).1.scopes = state.scopes
  closeOwnItems : ∀ (state : State) id,
    PipelineFrame state (state.closeOwnItems id) ∧ ∀ item ∈ (state.closeOwnItems id).openItems, item.occurrence ≠ id
  recordEnd : ∀ (state : State) key terminal, (state.recordEnd key terminal).scopes = state.scopes
  /-- A variable write or removal changes no scope occurrence, occurrence or open item. -/
  setVariable : ∀ (state : State) target name value, (state.setVariable target name value).scopes = state.scopes ∧
    (state.setVariable target name value).occurrences = state.occurrences ∧
    (state.setVariable target name value).openItems = state.openItems
  removeVariable : ∀ (state : State) target name, (state.removeVariable target name).scopes = state.scopes ∧
    (state.removeVariable target name).occurrences = state.occurrences ∧
    (state.removeVariable target name).openItems = state.openItems
  /-- A scope occurrence a lookup finds stands, or, for `State.owner?`, holds a variable set. -/
  declaring : ∀ (state : State) scope element found, state.declaring? scope element = some found →
    ScopeStands state found
  owner : ∀ (state : State) scope name found, state.owner? scope name = some found →
    ∃ variables ∈ state.variables, variables.scope = found
  /-- An instance root is the process root or a scope occurrence that stands. -/
  instanceRoot : ∀ (state : State) scope, state.instanceRoot scope = State.root ∨ ScopeStands state (state.instanceRoot scope)

/-- What the state operations the hooks' bodies apply must keep of `inv`, under the conditions a hook establishes, and
what `inv` tells a hook of the state it runs on: the obligations each feature's operations record draws on (see the
module documentation). An operation enters when a feature proof first needs it. -/
structure Operations (inv : Program → State → Prop) : Prop where
  /-- Every variable set belongs to a scope occurrence that stands. -/
  variablesHoused : ∀ program state, inv program state →
    ∀ variables ∈ state.variables, ScopeStands state variables.scope
  /-- The process root stands. -/
  rootStands : ∀ program state, inv program state → ScopeStands state State.root
  /-- A write to a scope occurrence that stands. -/
  setVariable : ∀ program state target name value, inv program state → ScopeStands state target →
    inv program (state.setVariable target name value)
  removeVariable : ∀ program state target name, inv program state → inv program (state.removeVariable target name)

end Kernel.Laws.Step
