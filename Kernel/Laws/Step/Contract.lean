module

public import Kernel.Step

/-! # Laws of the step function: the preservation contract

What `Step.step` needs of the hooks and of the state operations it applies for an invariant of the state to pass through
it: one obligation per field of `Hooks` (`HookContract`) and one per phase `Step` runs itself (`Phases`), each from
what `Step` establishes before it runs them, and what the state operations do to the fields `Step` and the hooks read,
whatever the invariant (`StateFacts`). `Kernel.Laws.Step` and `Kernel.Laws.Step.Keeps` compose them.

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

/-- What the completion pipeline needs of each phase it runs between closing the completing occurrence's own items and
removing its record (`Step.complete`): the scope occurrences and the begun occurrences stay, and no open item is added,
so the record goes with nothing left waiting for it or hanging on it. -/
structure PipelineFrame (before after : State) : Prop where
  scopes : after.scopes = before.scopes
  begun : ∀ occurrence ∈ before.occurrences, occurrence.begun = true → occurrence ∈ after.occurrences
  items : ∀ item ∈ after.openItems, item ∈ before.openItems

/-- What each hook must keep of `inv`, given what `Step` establishes before it calls the hook: the occurrence it hands
over stands (a begun occurrence, an idle scope occurrence's owner, a parked join's latest occurrence, the completing
occurrence); the item it hands over is open; the scope occurrence and occurrence a queued signal names stand (`Step.stale`,
`Step.gone`); a completed occurrence's continuation runs while its scope occurrence stands. The completion pipeline's
hooks also keep its frame (`PipelineFrame`), and `Hooks.leave` leaves nothing hanging on the completing occurrence.
`Hooks.delivered`, a query, picks an open item. Each feature's `Laws` module proves the fields of the hooks it fills. -/
structure HookContract (hooks : Hooks) (inv : State → Prop) : Prop where
  arriveStart : ∀ ctx header payload trigger occurrence state after, inv state → occurrence ∈ state.occurrences →
    hooks.arriveStart ctx header payload trigger occurrence state = .ok after → inv after
  arriveActivity : ∀ ctx header payload occurrence state after, inv state → occurrence ∈ state.occurrences →
    hooks.arriveActivity ctx header payload occurrence state = .ok after → inv after
  arriveMultiInstance : ∀ ctx header envelope loop occurrence state after, inv state → occurrence ∈ state.occurrences →
    hooks.arriveMultiInstance ctx header envelope loop occurrence state = .ok after → inv after
  arriveScope : ∀ ctx header payload occurrence entry state after, inv state → occurrence ∈ state.occurrences →
    hooks.arriveScope ctx header payload occurrence entry state = .ok after → inv after
  arriveGateway : ∀ ctx header payload occurrence state after, inv state → occurrence ∈ state.occurrences →
    hooks.arriveGateway ctx header payload occurrence state = .ok after → inv after
  arriveCatch : ∀ ctx header payload subscription occurrence state after, inv state → occurrence ∈ state.occurrences →
    hooks.arriveCatch ctx header payload subscription occurrence state = .ok after → inv after
  arriveThrow : ∀ ctx header payload thrown occurrence state after, inv state → occurrence ∈ state.occurrences →
    hooks.arriveThrow ctx header payload thrown occurrence state = .ok after → inv after
  arriveLink : ∀ ctx header payload occurrence state after, inv state → occurrence ∈ state.occurrences →
    hooks.arriveLink ctx header payload occurrence state = .ok after → inv after
  completeScope : ∀ ctx header payload scope occurrence state after, inv state → scope ∈ state.scopes →
    occurrence ∈ state.occurrences → hooks.completeScope ctx header payload scope occurrence state = .ok after → inv after
  completeCall : ∀ ctx header payload scope occurrence state after, inv state → scope ∈ state.scopes →
    occurrence ∈ state.occurrences → hooks.completeCall ctx header payload scope occurrence state = .ok after → inv after
  completeBody : ∀ ctx header envelope loop occurrence state after, inv state → occurrence ∈ state.occurrences →
    hooks.completeBody ctx header envelope loop occurrence state = .ok after → inv after
  completeUserTask : ∀ ctx header payload item values state after, inv state → item ∈ state.openItems →
    hooks.completeUserTask ctx header payload item values state = .ok after → inv after
  effectResult : ∀ ctx item outcome state after, inv state → item ∈ state.openItems →
    hooks.effectResult ctx item outcome state = .ok after → inv after
  retryIncident : ∀ ctx item detail generation state after, inv state → item ∈ state.openItems →
    hooks.retryIncident ctx item detail generation state = .ok after → inv after
  cancelIncidentProcess : ∀ ctx detail generation state after, inv state →
    hooks.cancelIncidentProcess ctx detail generation state = .ok after → inv after
  triggerActivity : ∀ ctx header payload item fired state after, inv state → item ∈ state.openItems →
    hooks.triggerActivity ctx header payload item fired state = .ok after → inv after
  trigger : ∀ ctx item fired state after, inv state → item ∈ state.openItems →
    hooks.trigger ctx item fired state = .ok after → inv after
  arm : ∀ ctx host element scope state after, inv state → OccurrenceStands state host → ScopeStands state scope →
    hooks.arm ctx host element scope state = .ok after → inv after
  armScope : ∀ ctx scope state after, inv state → ScopeStands state scope →
    hooks.armScope ctx scope state = .ok after → inv after
  armGateway : ∀ ctx occurrence gateway scope state after, inv state → OccurrenceStands state occurrence →
    ScopeStands state scope → hooks.armGateway ctx occurrence gateway scope state = .ok after → inv after
  raise : ∀ ctx event origin state after, inv state → hooks.raise ctx event origin state = .ok after → inv after
  compensate : ∀ ctx scope activity trigger leave resume state after, inv state → ScopeStands state scope →
    hooks.compensate ctx scope activity trigger leave resume state = .ok after → inv after
  failCompensation : ∀ ctx handler code message origin state after, inv state → ScopeStands state handler →
    hooks.failCompensation ctx handler code message origin state = .ok after → inv after
  leave : ∀ ctx occurrence state after, inv state → occurrence ∈ state.occurrences →
    hooks.leave ctx occurrence state = .ok after →
    inv after ∧ PipelineFrame state after ∧ ∀ item ∈ after.openItems, item.attachedTo ≠ some occurrence.id
  writeOutputs : ∀ ctx scope writes rule state after, inv state → ScopeStands state scope →
    hooks.writeOutputs ctx scope writes rule state = .ok after → inv after ∧ PipelineFrame state after
  removeVariables : ∀ ctx scope names state after, inv state → ScopeStands state scope →
    hooks.removeVariables ctx scope names state = .ok after → inv after
  completed : ∀ ctx occurrence state after, inv state → occurrence ∈ state.occurrences →
    hooks.completed ctx occurrence state = .ok after → inv after ∧ PipelineFrame state after
  outflow : ∀ ctx occurrence leave state after, inv state → ScopeStands state occurrence.scope →
    hooks.outflow ctx occurrence leave state = .ok after → inv after
  instanceCompleted : ∀ ctx body occurrence writes state after, inv state → ScopeStands state occurrence.scope →
    hooks.instanceCompleted ctx body occurrence writes state = .ok after → inv after
  handlerCompleted : ∀ ctx run occurrence state after, inv state → ScopeStands state occurrence.scope →
    hooks.handlerCompleted ctx run occurrence state = .ok after → inv after
  handlerEnded : ∀ ctx run occurrence state after, inv state → ScopeStands state occurrence.scope →
    hooks.handlerEnded ctx run occurrence state = .ok after → inv after
  cancelled : ∀ ctx occurrence state after, inv state → hooks.cancelled ctx occurrence state = .ok after → inv after
  written : ∀ ctx writes state after, inv state → hooks.written ctx writes state = .ok after → inv after
  delivered : ∀ ctx data state item fired, hooks.delivered ctx data state = .ok (item, fired) → item ∈ state.openItems

/-- What each phase `Step` runs itself must keep of `inv`, and what the closure reads of `inv`: the arming a queued
signal asks for names issued identities, so one that `Step.stale` lets run finds them standing, and a queued instance
end records a failure exactly when it fails. The state operations' obligations are `Laws.State`'s. -/
structure Phases (inv : State → Prop) : Prop where
  /-- A start's fresh instance, with its root's Event Sub-Process starts queued for arming. -/
  initial : ∀ instanceId variables businessKey,
    inv ((State.initial instanceId variables businessKey).signal (.armScope State.root))
  /-- An input on a running instance starts from an empty journal and outbox. -/
  reset : ∀ state, inv state → inv { state with journal := [], outbox := [] }
  clock : ∀ state atMs, inv state → inv { state with logicalTimeMs := atMs }
  /-- `Step.conclude` journals the draft and empties it and the write log. -/
  journal : ∀ state (transition : Transition), inv state → transition.started = state.draft.started →
    transition.ended = state.draft.ended → inv { state with journal := transition :: state.journal, draft := {}, writes := [] }
  /-- `Step.orderJournal`. -/
  runOrder : ∀ state, inv state → inv { state with journal := state.journal.reverse }
  /-- Signals leave the queue: the closure's next, or a micro-step's sole completion that `Step.absorb` runs. -/
  dequeue : ∀ state signals, inv state → signals.Sublist state.signals → inv { state with signals := signals }
  /-- The closure's next token leaves the work stack. -/
  untoken : ∀ state tokens, inv state → tokens.Sublist state.tokens → inv { state with tokens := tokens }
  /-- A variable command queues its write or its removal. -/
  queueWrite : ∀ state scope writes rule, inv state → inv (state.signal (.write scope writes rule))
  queueRemove : ∀ state scope names, inv state → inv (state.signal (.remove scope names))
  armIssued : ∀ state host element scope, inv state → Signal.arm host element scope ∈ state.signals →
    host < state.nextIssue ∧ scope.value < state.nextIssue
  armScopeIssued : ∀ state scope, inv state → Signal.armScope scope ∈ state.signals → scope.value < state.nextIssue
  armGatewayIssued : ∀ state occurrence gateway scope, inv state → Signal.armGateway occurrence gateway scope ∈ state.signals →
    occurrence < state.nextIssue ∧ scope.value < state.nextIssue
  endRecorded : ∀ state status failure, inv state → Signal.endInstance status failure ∈ state.signals →
    (failure.isSome = true ↔ status = .failed)
  /-- An occurrence's scope occurrence stands. -/
  housed : ∀ state occurrence, inv state → occurrence ∈ state.occurrences → ScopeStands state occurrence.scope
  /-- `Step.endInstance`, with a failure exactly when the instance fails. -/
  endInstance : ∀ state status failure, inv state → (failure.isSome = true ↔ status = .failed) →
    inv (endInstance status failure state)
  /-- `State.beginOccurrence`, in a scope occurrence that stands (`Step.requireScope`). -/
  begin : ∀ state request role sourceType, inv state → ScopeStands state request.scope →
    inv (state.beginOccurrence request role sourceType).1
  /-- `State.reserve` for `Signal.occur`, in a scope occurrence that stands. -/
  reserve : ∀ state element scope, inv state → ScopeStands state scope → inv (state.reserve element scope).1
  startReserved : ∀ state occurrence sourceType, inv state → occurrence ∈ state.occurrences →
    inv (state.startReserved occurrence sourceType).1
  closeOwnItems : ∀ state id, inv state → inv (state.closeOwnItems id)
  /-- `State.removeOccurrence` of an occurrence on which nothing waits or hangs; its scope occurrence stays. -/
  removeOccurrence : ∀ state occurrence, inv state → occurrence ∈ state.occurrences →
    (∀ item ∈ state.openItems, item.occurrence ≠ occurrence.id ∧ item.attachedTo ≠ some occurrence.id) →
    inv (state.removeOccurrence occurrence.id) ∧ ScopeStands (state.removeOccurrence occurrence.id) occurrence.scope
  recordEnd : ∀ state key terminal, inv state → inv (state.recordEnd key terminal)
  cancel : ∀ state id, inv state → inv (state.cancelOccurrence id)

/-- What the state operations `Step` applies do to the fields it reads, whatever the invariant (`Laws.State`). -/
structure StateFacts : Prop where
  found : ∀ (state : State) id occurrence, state.occurrence? id = some occurrence →
    occurrence ∈ state.occurrences ∧ occurrence.id = id
  begun : ∀ (state : State) request role sourceType,
    (state.beginOccurrence request role sourceType).2 ∈ (state.beginOccurrence request role sourceType).1.occurrences
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
  declaring : ∀ (state : State) scope element found, state.declaring? scope element = some found → ScopeStands state found
  owner : ∀ (state : State) scope name found, state.owner? scope name = some found →
    ∃ variables ∈ state.variables, variables.scope = found
  /-- An instance root is the process root or a scope occurrence that stands. -/
  instanceRoot : ∀ (state : State) scope, state.instanceRoot scope = State.root ∨ ScopeStands state (state.instanceRoot scope)

/-- What the state operations the hooks' bodies apply must keep of `inv`, under the conditions a hook establishes, and
what `inv` tells a hook of the state it runs on: the obligations each feature's operations record draws on (see the
module documentation). An operation enters when a feature proof first needs it. -/
structure Operations (inv : State → Prop) : Prop where
  /-- Every variable set belongs to a scope occurrence that stands. -/
  variablesHoused : ∀ state, inv state → ∀ variables ∈ state.variables, ScopeStands state variables.scope
  /-- The process root stands. -/
  rootStands : ∀ state, inv state → ScopeStands state State.root
  /-- A write to a scope occurrence that stands. -/
  setVariable : ∀ state target name value, inv state → ScopeStands state target → inv (state.setVariable target name value)
  removeVariable : ∀ state target name, inv state → inv (state.removeVariable target name)

end Kernel.Laws.Step
