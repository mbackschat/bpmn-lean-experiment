module

public import Kernel.State.Journal
public import Kernel.State.Map

/-! # Occurrences

The records of a begun flow-node occurrence and of a scope occurrence and the continuation `Step` tells when an
occurrence completes. Part of `Kernel.State`, which re-exports it.
-/

public section

namespace Kernel

/-- Guarded type: `Kernel.Step` owns matching on it. Whom `Step` tells when an occurrence completes. -/
inductive Continuation where
  /-- Leave through the outgoing flows. -/
  | flow
  /-- One instance of the Multi-Instance body occurrence `body`. -/
  | multiInstance (body : OccurrenceId)
  /-- A compensation handler of the run in that scope occurrence. -/
  | compensation (run : ScopeOccurrenceId)
  deriving Repr

/-- One flow-node occurrence, from its issue until it ends. `activation` counts the activations of `element` in its
process instance under `role`, from 1. `incoming` is the flow the token arrived on, `none` for an occurrence no token
began.

`begun = false` is a subscription's reservation: a boundary, Event Sub-Process start or Event-Based Gateway arm has a
published identity from the moment it is armed, but its flow node runs only when the trigger arrives (CIB declares
the subscription on the event scope and starts the activity instance on receipt, `BpmnParse:3288-3298`). A reservation
keeps nothing alive and never appears in the journal until it begins. -/
structure Occurrence where
  id : OccurrenceId
  element : ElementId
  scope : ScopeOccurrenceId
  activation : Nat
  /-- Its order position (DC25): its identity's issue while that is pending (`State.reserve`, or `State.beginOccurrence`
  without a reservation), which the commit numbers on the position counter beside its ordinal (`Step.positionsOf`), so
  an occurrence takes one issue only; a begun reservation keeps its reservation's, as it keeps its activation. The
  cancellation order within a scope occurrence (`State.clearInside`) reads it. -/
  position : Issue
  role : ActivationRole := .element
  continuation : Continuation := .flow
  incoming : Option FlowId := none
  begun : Bool := true
  deriving Repr

/-- A scope occurrence: the process instance (`element = none`), one activation of a Scope element, the root of a
called process instance, whose `element` is the Call Activity and `calledInstance` the instance's identifier, a
Multi-Instance body or instance, the occurrence holding a compensation handler's restored context, or an Activity's
local variables (CIB-EXT-0015), which live as long as the Activity. `occurrence` is the flow-node occurrence it belongs
to, `none` for the process root, a Multi-Instance instance and a handler's context, which
`Kernel.Feature.MultiInstance` and `Kernel.Feature.Compensation` leave themselves. Its parent is its key's
(`ScopeOccurrence.parent`), so no record can name another. -/
structure ScopeOccurrence where
  id : ScopeOccurrenceId
  element : Option ElementId
  /-- The order position it took when it was entered (`State.enterScope`, DC25), pending under the entering unit until
  the commit numbers it; the root's is committed `0`. The readers that order scope occurrences read it: the idle check
  (`Step.idleScope?`), the cancellation order (`State.subtree`) and an owner's removal (`State.removeOccurrence`). -/
  position : Issue
  occurrence : Option OccurrenceId := none
  calledInstance : Option InstanceName := none
  deriving Repr

/-- The occurrences issued and not yet removed, keyed by their structural key (DC21); a value's `id` is its key
(`State.reserve`, `State.beginOccurrence`). -/
abbrev OccurrenceMap := TreeMap OccurrenceId Occurrence compare

/-- The occurrences of `occurrences` in key order, the list view the state codec writes. One reader takes this order:
a clearing journals the occurrences of one scope occurrence cancelled in it (`State.clearInside`), an order no
schedule changes. -/
def occurrenceList (occurrences : OccurrenceMap) : List Occurrence := occurrences.toList.map (·.2)

/-- The scope occurrence `scope` was entered in, read from its key; `none` for the root. -/
abbrev ScopeOccurrence.parent (scope : ScopeOccurrence) : Option ScopeOccurrenceId := scope.id.parent?

/-- The standing scope occurrences, keyed by their structural key (DC21); a value's `id` is its key (`State.enterScope`).
Keys order outermost first, so a subtree is one key range (KD1). -/
abbrev ScopeMap := TreeMap ScopeOccurrenceId ScopeOccurrence compare

/-- The scope occurrences of `scopes` in key order, the list view the state codec writes. A reader that orders scope
occurrences reads their positions (DC25), never this order. -/
def scopeList (scopes : ScopeMap) : List ScopeOccurrence := scopes.toList.map (·.2)

end Kernel
