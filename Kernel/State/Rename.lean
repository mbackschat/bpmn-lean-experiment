module

public import Kernel.State

/-! # State: renaming at commit (DC12)

The renaming `Kernel.Step.compact` applies to every identity a committed state holds, by an issue renaming `r` that
fixes every committed issue: scope occurrence keys, occurrence keys and item keys, wherever the state holds them. Part of
the State layer, since it writes the state's families (guard 17); `Kernel.Step` chooses `r` and renames continuations.
-/

public section

namespace Kernel

section Rename

variable (r : Issue → Issue)

/-- `renameScope`'s walk down `scope`, whose segments are `segments`, reusing each parent's spine. -/
def renameWalk : (segments : List ScopeSegment) → (scope : ScopeOccurrenceId) → scope.segments = segments →
    ScopeOccurrenceId
  | [], scope, _ => scope
  | segment :: rest, scope, same =>
    match segment.ordinal with
    | .committed _ => scope
    | .fresh _ _ => (renameWalk rest (scope.up same) rfl).child segment.element (r segment.ordinal)

/-- `scope` with every fresh segment renamed by `r`. A committed segment has only committed segments above it, since a
scope occurrence entered in a closure is entered in one that stands, so the walk stops at the first committed segment
and a committed key is returned as it is. -/
def renameScope (scope : ScopeOccurrenceId) : ScopeOccurrenceId := renameWalk r scope.segments scope rfl

def renameId (id : OccurrenceId) : OccurrenceId :=
  { id with scope := renameScope r id.scope, ordinal := r id.ordinal }

def renameItemKey (key : ItemKey) : ItemKey := { key with occurrence := renameId r key.occurrence, ordinal := r key.ordinal }

/-- A public key with its process instance's name and its activation committed. -/
def renameKey (key : OccurrenceKey) : OccurrenceKey :=
  { key with processInstanceId := key.processInstanceId.rename r, activation := r key.activation }

def renameName (name : OccurrenceName) : OccurrenceName :=
  { name with processInstanceId := name.processInstanceId.rename r, activation := r name.activation }

def renameFailure (failure : InstanceFailure) : InstanceFailure :=
  { failure with occurrence := renameName r failure.occurrence
                 related := failure.related.map fun (role, name) => (role, renameName r name) }

def renameCompensable (record : Compensable) : Compensable :=
  { record with scope := renameScope r record.scope, occurrence := renameKey r record.occurrence
                children := record.children.map fun child => { child with occurrence := renameKey r child.occurrence } }

def renameResume : Resume → Resume
  | .complete occurrence leave => .complete (renameId r occurrence) leave
  | .occur element scope leave => .occur element (renameScope r scope) leave
  | .group context => .group (renameScope r context)

def renameIteration : Iteration → Iteration
  | .active scope => .active (renameScope r scope)
  | .waiting => .waiting
  | .completed output => .completed output

def renameSlots (slots : FeatureSlots) : FeatureSlots :=
  { parked := slots.parked.map fun parked =>
      { parked with occurrence := renameId r parked.occurrence, scope := renameScope r parked.scope }
    heldMap := slots.heldMap.foldl (fun renamed occurrence scope => renamed.insert (renameId r occurrence) (renameScope r scope)) ∅
    multiInstanceMap := slots.multiInstanceMap.foldl (fun renamed occurrence record => renamed.insert (renameId r occurrence)
      { record with scope := renameScope r record.scope, instances := record.instances.map (renameIteration r) }) ∅
    compensation := {
      retained := slots.compensation.retained.map (renameCompensable r)
      runMap := slots.compensation.runMap.foldl (fun renamed key record => renamed.insert
        { scope := renameScope r key.scope, trigger := renameName r key.trigger }
        { record with pending := record.pending.map (renameCompensable r)
                      running := record.running.map fun (context, record) => (renameScope r context, renameCompensable r record)
                      leave := record.leave.map (renameId r), resume := record.resume.map (renameResume r) }) ∅ }
    instances := slots.instances.map fun data => { data with root := renameScope r data.root } }

def renameCause : Cause → Cause
  | .idle scope => .idle (renameScope r scope)
  | .input tag => .input tag
  | .signal name => .signal name
  | .arrive flow => .arrive flow

def renameTransition (transition : Transition) : Transition :=
  { transition with cause := renameCause r transition.cause, owner := renameScope r transition.owner
                    started := transition.started.map fun fact =>
                      { fact with owner := renameScope r fact.owner, occurrence := renameKey r fact.occurrence }
                    ended := transition.ended.map fun (key, terminal) => (renameKey r key, terminal)
                    ready := transition.ready.map (renameKey r) }

/-- `r` applied to every identity a committed state holds: its scope occurrences (their called instances' names),
occurrences (their activations, their continuations
through `continuation`, which `Kernel.Step` supplies, since only it matches on `Continuation`, and their order
positions through `position`, since an occurrence's pending position is its identity's issue, which `r` numbers as an
ordinal), variable sets, open items, slots, journal, intents and failure. The counters are keyed by committed keys
already (`Step.advanceCounters` inserts renamed ones), and the families keyed by unit keys are empty
(`Step.orderJournal`). -/
def renameState (position : Issue → Issue) (continuation : Continuation → Continuation) (state : State) : State :=
  { state with
    scopeMap := state.scopeMap.foldl (fun renamed _ scope =>
      let scope := { scope with id := renameScope r scope.id, position := r scope.position, occurrence := scope.occurrence.map (renameId r)
                                calledInstance := scope.calledInstance.map (·.rename r) }
      renamed.insert scope.id scope) ∅
    occurrenceMap := state.occurrenceMap.foldl (fun renamed _ occurrence =>
      let occurrence := { occurrence with id := renameId r occurrence.id, scope := renameScope r occurrence.scope
                                          position := position occurrence.position, continuation := continuation occurrence.continuation
                                          activation := r occurrence.activation }
      renamed.insert occurrence.id occurrence) ∅
    variables := state.variables.foldl (fun renamed scope entries => renamed.insert (renameScope r scope) entries) ∅
    openItems := state.openItems.foldl (fun renamed _ item =>
      let item := { item with id := renameItemKey r item.id, position := r item.position, scope := renameScope r item.scope
                              attachedTo := item.attachedTo.map (renameId r) }
      renamed.insert item.id item) ∅
    slots := renameSlots r state.slots
    journal := state.journal.map (renameTransition r)
    intents := state.intents.map fun intent => { intent with origin := renameName r intent.origin }
    failure := state.failure.map (renameFailure r) }

end Rename

end Kernel
