import BpmnSemantics.SemanticProcess.ControlPosition
import BpmnSemantics.SemanticProcess.InclusiveGateway

/-! # Runtime-state well-formedness

This module owns `runtimeStateWellFormed`, the executable predicate deciding which `RuntimeState`
values the semantic account admits, and `RuntimeStateMonotone`, the separate two-state relation for
facts that belong to a transition rather than to a state.

The two have different types on purpose. A high-water or non-reissue fact cannot be decided from one
state without inventing a history field, so encoding it as a state conjunct would either be
unprovable or force a representation change.

The predicate is indexed by the expected semantic instance identity as well as by the program,
because reading that identity out of the state under check would make the check self-consistent and
admit any internally consistent injected state; `runtimePositionValid` already takes the same
parameter for the same reason.

Where that index actually bites is worth stating exactly, because both installed call sites are
narrower than the parameter suggests. The Workflow-continuation boundary is the only one holding an
independent expectation, and it already refuses an instance mismatch before this predicate runs, so
the identity conjunct fires at neither site today. The parameter is what lets a future caller with a
genuine third-party expectation use it, and no evidence lane claims otherwise.

Each conjunct carries the `RSI-` rule identifier of the reviewed account and is a separately named
sub-predicate, so a fixture can assert which named conjunct rejects a malformed state rather than
only that the aggregate refused it. Rule identifiers are traceability labels and reach no wire
contract.

Conjuncts that an existing predicate already decides are consumed rather than restated:
`runtimePositionValid` supplies lifecycle agreement, unique live occurrence identity, scope binding,
the hosting-root count, token binding, and, for a running state, the called-process associations,
while `eventRaceAssociationsValid` and `effectIncidentAssociationsValid` supply their families'
association facts. This module adds only what none of them reaches: wait ownership, wait-identity
uniqueness, wait declaration binding, and canonical collection order.

`calledProcessAssociationsValid` is deliberately not conjoined here. It decides a running state and
answers `false` when there is no root instance identity, so stating it outside the running case
would make every not-started and terminal state ill-formed; inside the running case
`runtimePositionValid` already decides it, and a second statement would be one conjunct pretending
to be two.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- A list is in canonical order when no element strictly precedes the one before it. The insertion
helpers that maintain these collections place a new element ahead of the first element it precedes,
so consecutive pairs satisfy exactly this and nothing stronger: equal keys may appear in either
order, which is why this is not stated as strict sortedness. -/
def orderedBy {α : Type} (before : α → α → Bool) : List α → Bool
  | [] => true
  | [_] => true
  | left :: right :: rest => !before right left && orderedBy before (right :: rest)

/-! ## Layer 1: lifecycle and structure -/

/-- `RSI-LIFE-01`. A state that has not started holds no runtime work of any kind. `lifecyclePositionValid`
already rejects occurrences and tokens here; this adds the wait families, the hidden records, the
retained incident, and the pending-initiation flag, none of which it reaches. -/
def notStartedStateEmpty (state : RuntimeState) : Bool :=
  state.waits.isEmpty && state.messageWaits.isEmpty && state.timerWaits.isEmpty &&
    state.effectWaits.isEmpty && state.effectIncidents.isEmpty &&
    state.selectedBranchSets.isEmpty && state.eventRaces.isEmpty &&
    state.calledProcessOccurrences.isEmpty && !state.initiationPending

/-- `RSI-OWN-01`. Every wait, hidden record, and incident-retained wait names exactly one live scope
occurrence as its owner.

Tokens are excluded here because `tokenBindingValid` already requires exactly that of them, and a
second statement of the same fact would be one conjunct pretending to be two. -/
def waitOwnersLive (state : RuntimeState) : Bool :=
  state.waits.all (fun wait => exactLiveOccurrence state wait.owner) &&
    state.messageWaits.all (fun wait => exactLiveOccurrence state wait.owner) &&
    state.timerWaits.all (fun wait => exactLiveOccurrence state wait.owner) &&
    state.effectWaits.all (fun wait => exactLiveOccurrence state wait.owner) &&
    state.effectIncidents.all (fun incident => exactLiveOccurrence state incident.wait.owner) &&
    state.selectedBranchSets.all (fun record => exactLiveOccurrence state record.owner) &&
    state.eventRaces.all (fun race => exactLiveOccurrence state race.owner) &&
    state.calledProcessOccurrences.all (fun record => exactLiveOccurrence state record.caller)

def occursOnce {α : Type} (key : α → α → Bool) (values : List α) (value : α) : Bool :=
  (values.filter (key value)).length = 1

/-- `RSI-UNIQ-02`. Within each wait family the family's occurrence key appears at most once.

This is the fact the boundary-Timer stale-identity laws currently assume away: two Timer waits
sharing `(instance, element, activation)` make "the" wait for a fired deadline ambiguous, and the
evaluator would resolve the ambiguity by list order rather than by meaning. -/
def userTaskWaitKeyMatches (left right : UserTaskWait) : Bool :=
  decide (left.processInstanceId = right.processInstanceId) &&
    decide (left.task.id = right.task.id) &&
    decide (left.activation = right.activation)

def messageWaitKeyMatches (left right : MessageWait) : Bool :=
  decide (left.processInstanceId = right.processInstanceId) &&
    decide (left.elementId = right.elementId) &&
    decide (left.activation = right.activation)

/-- The key `fireTimer` looks a deadline up by. It is named rather than inlined so the uniqueness
conjunct and the withdrawal-finality law below cannot drift apart into two different keys. -/
def timerWaitKeyMatches (left right : TimerWait) : Bool :=
  decide (left.processInstanceId = right.processInstanceId) &&
    decide (left.elementId = right.elementId) &&
    decide (left.activation = right.activation)

def effectWaitKeyMatches (left right : EffectWait) : Bool :=
  decide (left.processInstanceId = right.processInstanceId) &&
    decide (left.elementId = right.elementId) &&
    decide (left.activation = right.activation)

def waitIdentitiesUnique (state : RuntimeState) : Bool :=
  state.waits.all (occursOnce userTaskWaitKeyMatches state.waits) &&
    state.messageWaits.all (occursOnce messageWaitKeyMatches state.messageWaits) &&
    state.timerWaits.all (occursOnce timerWaitKeyMatches state.timerWaits) &&
    state.effectWaits.all (occursOnce effectWaitKeyMatches state.effectWaits)

/-- `RSI-ORDER-01`. The five collections whose every add site canonically inserts hold that order.

The membership rule is a criterion rather than a list: a collection belongs here when all of its add
sites insert canonically, and is excluded when they disagree. `scopeOccurrences` is excluded because
Call Activity inserts canonically while `enterScope` prepends, and `variables` because process
bindings are merged canonically at User Task completion but take submitted order at Process start.
Asserting order for either would be refuted by ordinary reachable states, since `RuntimeState`
derives `DecidableEq` and therefore retains list order as state. -/
def canonicalCollectionOrder (state : RuntimeState) : Bool :=
  orderedBy userTaskWaitBefore state.waits &&
    orderedBy (fun left right => decide (left.taskId.value < right.taskId.value))
      state.activations &&
    orderedBy selectionBefore state.selectedBranchSets &&
    orderedBy eventRaceBefore state.eventRaces &&
    orderedBy callRecordBefore state.calledProcessOccurrences

/-! ## Layer 2: program agreement -/

private def operationOwningScope? (program : Program) (id : OperationId) :
    Option DefinitionScopeId :=
  (program.operationScopes.find? fun ownership =>
    decide (ownership.operationId = id)).map (·.scopeId)

/-- The operations that may declare a Timer wait for `elementId`.

A per-family declaring set is required rather than one matching operation kind, because composite
arming operations declare waits of a family they are not named after: a Timer wait may be declared
by `awaitTimer`, by either bounded-task family, by `enterBoundedScope`, or by `awaitEventRace`. A
single-kind reading would reject reachable states from four shipped capsules. -/
def timerWaitDeclarers (program : Program) (elementId : NodeId) : List SemanticOperation :=
  program.operations.filter fun
    | .awaitTimer _ _ _ _ timer => decide (timer.elementId = elementId)
    | .awaitBoundedUserTask _ _ _ _ boundaryTimer => decide (boundaryTimer.elementId = elementId)
    | .awaitMonitoredUserTask _ _ _ _ boundaryTimer => decide (boundaryTimer.elementId = elementId)
    | .enterBoundedScope _ _ _ _ _ boundaryTimer => decide (boundaryTimer.elementId = elementId)
    | .awaitEventRace _ _ _ _ timer => decide (timer.elementId = elementId)
    | _ => false

/-- The operations that may declare a Message wait for `elementId`. The Event-Based Gateway profile
carries no separate `awaitMessage` operation for its configured catch, so `awaitEventRace` is a
declarer here for the same reason it is one above. -/
def messageWaitDeclarers (program : Program) (elementId : NodeId) : List SemanticOperation :=
  program.operations.filter fun
    | .awaitMessage _ _ _ _ message => decide (message.elementId = elementId)
    | .awaitEventRace _ _ _ message _ => decide (message.elementId = elementId)
    | _ => false

/-- The operations that may declare a User Task wait for `taskId`. -/
def userTaskWaitDeclarers (program : Program) (taskId : TaskDefinitionId) :
    List SemanticOperation :=
  program.operations.filter fun
    | .awaitUserTask _ _ _ _ task => decide (task.id = taskId)
    | .awaitBoundedUserTask _ _ _ task _ => decide (task.id = taskId)
    | .awaitMonitoredUserTask _ _ _ task _ => decide (task.id = taskId)
    | _ => false

/-- The operations that may declare an effect wait for `elementId`. -/
def effectWaitDeclarers (program : Program) (elementId : NodeId) : List SemanticOperation :=
  program.operations.filter fun
    | .awaitEffect _ origin _ _ _ _ => decide (origin.elementId = elementId)
    | _ => false

private def declaredByExactlyOneOwnedOperation (program : Program)
    (declarers : List SemanticOperation) (owner : ScopeOccurrenceId) : Bool :=
  match declarers with
  | [operation] =>
      match operationOwningScope? program operation.id with
      | some scopeId => decide (scopeId = owner.definitionScopeId)
      | none => false
  | _ => false

/-- `RSI-BIND-04`. Each wait of the hosting instance is declared by exactly one program operation
from that wait family's declaring set, and that operation is owned by the wait owner's definition
scope.

The scope agreement is what makes this more than an existence check: a wait whose declaring
operation lives in a different scope would be owned by an occurrence that cannot have armed it.

Waits of a called instance are outside it, and the restriction is a fact about what this program can
decide rather than a claim that such a wait is undeclared. A called Process is a separate definition
that `RuntimeState` does not carry, so its waits name elements the caller's operations never declare
and requiring otherwise would reject every live Call Activity tree. Broadening this needs the called
definitions reachable from the state, which is a representation change with its own witnesses. -/
def waitDeclarationsValid (program : Program) (instanceId : SemanticId)
    (state : RuntimeState) : Bool :=
  (state.waits.filter (fun wait => decide (wait.processInstanceId = instanceId))).all (fun wait =>
    declaredByExactlyOneOwnedOperation program
      (userTaskWaitDeclarers program wait.task.id) wait.owner) &&
  (state.messageWaits.filter (fun wait => decide (wait.processInstanceId = instanceId))).all
    (fun wait =>
      declaredByExactlyOneOwnedOperation program
        (messageWaitDeclarers program wait.elementId) wait.owner) &&
  (state.timerWaits.filter (fun wait => decide (wait.processInstanceId = instanceId))).all
    (fun wait =>
      declaredByExactlyOneOwnedOperation program
        (timerWaitDeclarers program wait.elementId) wait.owner) &&
  (state.effectWaits.filter (fun wait => decide (wait.processInstanceId = instanceId))).all
    (fun wait =>
      declaredByExactlyOneOwnedOperation program
        (effectWaitDeclarers program wait.elementId) wait.owner) &&
  (state.effectIncidents.filter
      (fun incident => decide (incident.wait.processInstanceId = instanceId))).all
    (fun incident =>
      declaredByExactlyOneOwnedOperation program
        (effectWaitDeclarers program incident.wait.elementId) incident.wait.owner)

/-- The `selectMany` and `awaitEventRace` halves of `RSI-BIND-05`: each selected-branch record
matches exactly one `selectMany` and each event race exactly one `awaitEventRace`.

The rule's third clause is **not** decided here or anywhere else in this predicate. Binding a called
record to its paired `invokeProcess` and `returnProcess` is a program-side fact, and
`calledProcessAssociationsValid` cannot supply it: that predicate takes only a `RuntimeState` and
decides runtime-to-runtime association, never reading `program.operations`. Supplying it needs the
paired operations looked up by the record's `returnOperationId`, and is recorded as absent rather
than assumed. -/
def hiddenRecordDeclarationsValid (program : Program) (state : RuntimeState) : Bool :=
  state.selectedBranchSets.all (fun record =>
    (program.operations.filter fun
      | .selectMany _ _ _ _ _ selectionKey => decide (selectionKey = record.selectionKey)
      | _ => false).length = 1) &&
  state.eventRaces.all (fun race =>
    (program.operations.filter fun
      | .awaitEventRace _ origin _ _ _ => decide (origin.elementId.value = race.id.elementId.value)
      | _ => false).length = 1)

/-! ## The predicate -/

/-- Which `RuntimeState` values the semantic account admits, for one program and one expected
semantic instance identity.

This is a representation obligation, not an admission capability: it changes no admitted model, no
accepted transition, and no canonical projection. Preservation is proved before the predicate gates
anything, so a gate built on it can only reject states that were never reachable. -/
def runtimeStateWellFormed (program : Program) (instanceId : SemanticId)
    (state : RuntimeState) : Bool :=
  runtimePositionValid program instanceId state &&
    eventRaceAssociationsValid state &&
    effectIncidentAssociationsValid state &&
    waitOwnersLive state &&
    waitIdentitiesUnique state &&
    waitDeclarationsValid program instanceId state &&
    hiddenRecordDeclarationsValid program state &&
    canonicalCollectionOrder state &&
    (match state.control with
     | .notStarted => notStartedStateEmpty state
     | _ => true)

/-! ## Layer 3: monotonicity -/

private def taskCountFor (activations : List TaskActivation) (taskId : TaskDefinitionId) : Nat :=
  (activations.find? fun activation => decide (activation.taskId = taskId)).map (·.count) |>.getD 0

private def nodeCountFor {α : Type} (key : α → NodeId) (count : α → Nat) (values : List α)
    (elementId : NodeId) : Nat :=
  (values.find? fun value => decide (key value = elementId)).map count |>.getD 0

private def scopeCountFor (activations : List ScopeActivation) (scopeId : DefinitionScopeId) :
    Nat :=
  (activations.find? fun activation => decide (activation.scopeId = scopeId)).map (·.count)
    |>.getD 0

/-- `RSI-MONO-01` and `RSI-MONO-02`. Every activation counter family is a per-key high-water mark
that never decreases across a committed transition, and `endOccurrences` never decreases.

`RSI-MONO-04` is deliberately **not** stated here. Non-reissue needs the further fact that a newly
issued identity is numbered strictly above its key's recorded count, which is a property of the
issuing transition rather than of the counter pair; asserting it in this relation would make it an
unstated premise of every use. It remains an explicit absence, and the adapter's assumption that a
Timer or task identity stays retired once withdrawn rests on it rather than on this relation.

`logicalTimeMs` is deliberately absent. Every time-advancing arm takes its time from a fired
deadline, so monotonic time holds only under the hypothesis that the fired deadline is at or after
current logical time; `RuntimeStateTimeMonotone` below carries that hypothesis explicitly rather
than hiding it in a conjunct this relation could not prove. -/
def RuntimeStateMonotone (before after : RuntimeState) : Prop :=
  (∀ taskId, taskCountFor before.activations taskId ≤ taskCountFor after.activations taskId) ∧
  (∀ elementId,
    nodeCountFor (·.elementId) (·.count) before.messageActivations elementId ≤
      nodeCountFor (·.elementId) (·.count) after.messageActivations elementId) ∧
  (∀ elementId,
    nodeCountFor (·.elementId) (·.count) before.timerActivations elementId ≤
      nodeCountFor (·.elementId) (·.count) after.timerActivations elementId) ∧
  (∀ elementId,
    nodeCountFor (·.elementId) (·.count) before.effectActivations elementId ≤
      nodeCountFor (·.elementId) (·.count) after.effectActivations elementId) ∧
  (∀ elementId,
    nodeCountFor (·.elementId) (·.count) before.eventRaceActivations elementId ≤
      nodeCountFor (·.elementId) (·.count) after.eventRaceActivations elementId) ∧
  (∀ elementId,
    nodeCountFor (·.elementId) (·.count) before.callActivations elementId ≤
      nodeCountFor (·.elementId) (·.count) after.callActivations elementId) ∧
  (∀ scopeId, scopeCountFor before.scopeActivations scopeId ≤
    scopeCountFor after.scopeActivations scopeId) ∧
  before.endOccurrences ≤ after.endOccurrences

/-- `RSI-MONO-03`. Logical time never decreases, under the named firing hypothesis.

The hypothesis is bound to the deadline a `fireTimer` stimulus commits rather than to a list of
arms, because that single ingress reaches every time-advancing arm: the ordinary timer, the bounded
task, bounded scope, and monitored task victories, and the Event-Based Gateway timer win. An
enumeration of arms is the wrong shape and has already failed twice on this class, once by omitting
the gateway win and once because the bounded task's evaluator never assigns the field literally.

Promoting the hypothesis to a state conjunct is deliberately not done: "no live deadline below
logical time" is refutable as soon as two Timer waits with different deadlines are concurrently live
and the later one fires first. No admitted profile reaches that state today, so which shape is right
depends on the multi-timer account that internal commutation and parallel Multi-Instance must
settle. -/
def RuntimeStateTimeMonotone (firedDeadlineMs : Nat) (before after : RuntimeState) : Prop :=
  before.logicalTimeMs ≤ firedDeadlineMs → before.logicalTimeMs ≤ after.logicalTimeMs

end BpmnSemantics.SemanticProcess
