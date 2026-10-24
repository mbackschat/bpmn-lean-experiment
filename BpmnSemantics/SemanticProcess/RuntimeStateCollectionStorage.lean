module

public import BpmnSemantics.SemanticProcess.CallActivity
public import BpmnSemantics.SemanticProcess.EventBasedGateway
public import BpmnSemantics.SemanticProcess.InclusiveGateway
public import BpmnSemantics.SemanticProcess.SequentialMultiInstance
public import BpmnSemantics.SemanticProcess.ParallelMultiInstanceController
import all BpmnSemantics.SemanticProcess.CallActivity

/-! RSI-ORDER-01 separates committed unique-key storage from raw evaluator frame laws.
Lean tokens are a unit bag: repeated equal tokens encode positive multiplicity, unlike
TypeScript's one bucket per key. Their canonical order is checked without deduplication.
-/

@[expose] public section

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

/-- `RSI-ORDER-01`. The collections whose every add site canonically inserts hold that order.

The membership rule is a criterion rather than a list: a collection belongs here when all of its add
sites insert canonically. Process bindings are excluded because they take submitted order at Process
start. Asserting order for them would be refuted by ordinary reachable states, since `RuntimeState`
derives `DecidableEq` and therefore retains list order as state.

The controller collection is included although this capsule adds no Lean insertion site for it, because
the independently written core does maintain and check that order: admitting an unordered controller
list here would be a state one target refuses and the other accepts. -/
def canonicalCollectionOrder (state : RuntimeState) : Bool :=
  orderedBy controlTokenBefore state.tokens &&
    orderedBy activationBefore state.activityActivations &&
    orderedBy userTaskWaitBefore state.waits &&
    orderedBy activationBefore state.activations &&
    orderedBy messageWaitBefore state.messageWaits &&
    orderedBy timerWaitBefore state.timerWaits &&
    orderedBy effectWaitBefore state.effectWaits &&
    orderedBy messageActivationBefore state.messageActivations &&
    orderedBy timerActivationBefore state.timerActivations &&
    orderedBy effectActivationBefore state.effectActivations &&
    orderedBy activityVariableScopeBefore state.variables.activities &&
    orderedBy selectionBefore state.selectedBranchSets &&
    orderedBy eventRaceBefore state.eventRaces &&
    orderedBy callRecordBefore state.calledProcessOccurrences &&
    orderedBy activityOccurrenceBefore state.activityOccurrences &&
    orderedBy sequentialMultiInstanceControllerBefore
      state.sequentialMultiInstanceControllers &&
    parallelMultiInstanceControllersOrdered state.parallelMultiInstanceControllers &&
    orderedBy scopeOccurrenceBefore state.scopeOccurrences &&
    orderedBy scopeActivationBefore state.scopeActivations &&
    orderedBy callActivationBefore state.callActivations &&
    orderedBy eventRaceActivationBefore state.eventRaceActivations

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

/-- Canonical Timer uniqueness key. `RuntimeStateWaitIdentity.timerIdNamesWait_key` equates it with
the occurrence matcher consumed by `fireTimer`, so lookup and withdrawal finality share this key. -/
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

/-- `AOO-ID-01`. The Activity occurrence triple appears at most once. -/
def activityIdentitiesUnique (state : RuntimeState) : Bool :=
  state.activityOccurrences.all
    (occursOnce sameActivityOccurrence state.activityOccurrences)

/-- Unique keys strengthen the existing weak order without changing its proof API.
Counter rows are keyed by element name, never by the retained count. -/
def uniqueCollectionKeys (state : RuntimeState) : Bool :=
  decide (state.activityActivations.map (·.taskId)).Nodup &&
    decide (state.activations.map (·.taskId)).Nodup &&
    decide (state.messageActivations.map (·.elementId)).Nodup &&
    decide (state.timerActivations.map (·.elementId)).Nodup &&
    decide (state.effectActivations.map (·.elementId)).Nodup &&
    decide (state.scopeActivations.map (·.scopeId)).Nodup &&
    decide (state.callActivations.map (·.elementId)).Nodup &&
    decide (state.eventRaceActivations.map (·.elementId)).Nodup &&
    decide (state.scopeOccurrences.map (·.id)).Nodup &&
    waitIdentitiesUnique state &&
    decide (state.variables.activities.map (·.owner)).Nodup &&
    decide (state.selectedBranchSets.map (fun row => (row.owner, row.selectionKey))).Nodup &&
    decide (state.eventRaces.map (fun row => (row.id, row.owner))).Nodup &&
    decide (state.calledProcessOccurrences.map (fun row =>
      (row.caller, row.id.elementId, row.id.activation))).Nodup &&
    activityIdentitiesUnique state &&
    decide (state.sequentialMultiInstanceControllers.map (fun row =>
      (row.processInstanceId, row.activityElementId, row.activation))).Nodup &&
    decide (state.parallelMultiInstanceControllers.map (·.id)).Nodup

inductive CommittedStateCollectionDefect where
  | unorderedCollection
  deriving Repr, DecidableEq

/-- The gated subset is collection order and key uniqueness, not full-state well-formedness. -/
def committedStateCollectionDefects (state : RuntimeState) : List CommittedStateCollectionDefect :=
  if canonicalCollectionOrder state && uniqueCollectionKeys state then [] else [.unorderedCollection]

def committedStateCollectionAdmitted (state : RuntimeState) : Bool :=
  (committedStateCollectionDefects state).isEmpty

end BpmnSemantics.SemanticProcess
