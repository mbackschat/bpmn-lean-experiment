module

public import Kernel.State

/-! # Removing occurrences

Clearing a scope occurrence, leaving it, cancelling an occurrence, and withdrawing the open items a cancellation will
remove. Part of the State layer, above `Kernel.State`; `Kernel.Hooks` re-exports it to the features and `Kernel.Step`.
-/

public section

namespace Kernel

namespace State

/-- The journal facts of removing the begun `occurrences`, cancelled. -/
private def recordCancelled (state : State) (occurrences : List Occurrence) : State :=
  let begun := occurrences.filter (·.begun)
  let ended := begun.map fun occurrence => (state.keyOf occurrence, Terminal.cancelled)
  { state with draft := { state.draft with
      ended := state.draft.ended ++ ended, cancelled := state.draft.cancelled ++ begun } }

/-- Remove every token, item, occurrence, slot entry, variable set and child scope occurrence inside `scope`, keeping
`scope` itself and the occurrences `keep` names. Each begun occurrence is journalled cancelled, deepest scope first,
then by id; `Hooks.cancelled` tells the owning features afterwards. -/
def clearInside (state : State) (scope : ScopeOccurrenceId) (keep : List Nat := []) : State :=
  let inside := state.subtree scope
  let nested := inside.filter (· != scope)
  let removed := inside.reverse.flatMap fun current =>
    state.occurrences.filter fun occurrence => occurrence.scope == current && !keep.contains occurrence.id
  let journalled := recordCancelled state removed
  { journalled with
      tokens := journalled.tokens.filter (!inside.contains ·.busyScope)
      openItems := journalled.openItems.filter fun item => !inside.contains item.scope || keep.contains item.occurrence
      occurrences := journalled.occurrences.filter fun occurrence => !inside.contains occurrence.scope || keep.contains occurrence.id
      scopes := journalled.scopes.filter (!nested.contains ·.id)
      variables := journalled.variables.filter (!nested.contains ·.scope)
      slots := journalled.slots.clear inside nested }

/-- Leave `scope`: clear it and remove the occurrence, its variables and the compensation records it retains, so the
Activities completed in a Sub-Process left before its own completion are never compensated: compensation is for
completed Activities only ([BPMN 2.0.2 §13.5.5](../docs/reference/bpmn-2.0.2/README.md), "presumed abort"). -/
def leaveScope (state : State) (scope : ScopeOccurrenceId) : State :=
  let cleared := state.clearInside scope
  { cleared with
      scopes := cleared.scopes.filter (·.id != scope)
      variables := cleared.variables.filter (·.scope != scope)
      slots := { cleared.slots with compensation := { cleared.slots.compensation with
        retained := cleared.slots.compensation.retained.filter (·.scope != scope) } } }

/-- Remove the occurrence record `id` and the scope occurrences it owns, if any. The record goes first, so that
leaving a scope does not cancel the occurrence that owns it. -/
def removeOccurrence (state : State) (id : Nat) : State :=
  let removed := { state with occurrences := state.occurrences.filter (·.id != id) }
  (removed.scopes.filter (·.occurrence == some id)).foldl (fun state scope => state.leaveScope scope.id) removed

/-- Close the open items inside `scope`, its own included; the occurrences they reserved go when the scope is
cleared. -/
def withdrawInside (state : State) (scope : ScopeOccurrenceId) : State :=
  let inside := state.subtree scope
  { state with openItems := state.openItems.filter (!inside.contains ·.scope) }

/-- Close the open items `cancelOccurrence` removes with the occurrence `id`: its own, those attached to it with
their reservations, and those inside the scope occurrences it owns. A firing that interrupts withdraws them at once,
while the cancellation itself is still queued, so that no firing queued before it finds them open. -/
def withdrawOccurrence (state : State) (id : Nat) : State :=
  let closed := (state.closeOwnItems id).disarm id
  (closed.scopes.filter (·.occurrence == some id)).foldl (fun state scope => state.withdrawInside scope.id) closed

/-- Cancel the occurrence `id` wherever it stands: its items and subscriptions go, the scope occurrence it owns is
left, and it is journalled cancelled. -/
def cancelOccurrence (state : State) (id : Nat) : State :=
  match state.occurrence? id with
  | none => state
  | some occurrence => recordCancelled ((state.withdrawOccurrence id).removeOccurrence id) [occurrence]

/-- Whether `scope` would be idle once the occurrence `id`, its items, what is attached to it and the scope occurrence
it owns were gone: nothing else remains there. -/
def idleWithout (state : State) (scope : ScopeOccurrenceId) (id : Nat) : Bool :=
  (((state.closeOwnItems id).disarm id).removeOccurrence id).idle scope

end State

end Kernel
