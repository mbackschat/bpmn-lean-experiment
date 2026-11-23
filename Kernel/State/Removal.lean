module

public import Kernel.State.Tree

/-! # Removing occurrences

Disarming an occurrence's attached items, clearing a scope occurrence, leaving it, cancelling an occurrence, and
withdrawing the open items a cancellation will remove. Part of the State layer, above `Kernel.State`; `Kernel.Hooks` re-exports it to the features and `Kernel.Step`.
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

/-- Remove the items attached to the occurrence `host`, with the reservations they hold. The dropped reservations are
listed once, since a scan of the occurrences for every ordinal counter, run at every completion, made a closure that
leaves a wait at every pass take 49 s (`closure-work-bound.test.ts` through `kernelRun --batch`, measured 2026-11-17). -/
def disarm (state : State) (host : OccurrenceId) : State :=
  let attached := (itemList state.openItems).filter (·.attachedTo == some host)
  let dropped := (state.occurrences.filter fun occurrence =>
    !occurrence.begun && attached.any (·.id.occurrence == occurrence.id)).map (·.id)
  { state with
      openItems := state.openItems.filter fun _ item => item.attachedTo != some host
      occurrences := state.occurrences.filter fun occurrence =>
        occurrence.begun || !attached.any (·.id.occurrence == occurrence.id)
      itemOrdinals := state.itemOrdinals.filter fun id _ => !dropped.contains id }

/-- Remove every token, item, occurrence, slot entry, variable set and child scope occurrence inside `scope`, with the
ordinal counters of the removed scope occurrences and occurrences, keeping `scope` itself and the occurrences `keep`
names. Each begun occurrence is journalled cancelled, deepest scope first, each level by the order positions of its
scope occurrences under `le` (`subtree`), then in the order the state holds them; `Hooks.cancelled` tells the owning
features afterwards. -/
def clearInside (state : State) (le : Issue → Issue → Bool) (scope : ScopeOccurrenceId) (keep : List OccurrenceId := []) :
    State :=
  let inside := state.subtree le scope
  let nested := inside.filter (· != scope)
  let removed := inside.reverse.flatMap fun current =>
    state.occurrences.filter fun occurrence => occurrence.scope == current && !keep.contains occurrence.id
  let journalled := recordCancelled state removed
  { journalled with
      batchTokens := journalled.batchTokens.filter (!inside.contains ·.busyScope)
      queuedTokens := journalled.queuedTokens.filter fun _ token => !inside.contains token.busyScope
      openItems := journalled.openItems.filter fun _ item => !inside.contains item.scope || keep.contains item.id.occurrence
      itemOrdinals := journalled.itemOrdinals.filter fun id _ => !removed.any (·.id == id)
      occurrences := journalled.occurrences.filter fun occurrence => !inside.contains occurrence.scope || keep.contains occurrence.id
      scopes := journalled.scopes.filter (!nested.contains ·.id)
      scopeOrdinals := journalled.scopeOrdinals.filter fun slot _ => !nested.contains slot.parent
      occurrenceOrdinals := journalled.occurrenceOrdinals.filter fun slot _ => !nested.contains slot.parent
      variables := journalled.variables.filter fun scope _ => !nested.contains scope
      slots := journalled.slots.clear inside nested }

/-- Leave `scope`: clear it and remove the occurrence, its variables and the compensation records it retains, so the
Activities completed in a Sub-Process left before its own completion are never compensated: compensation is for
completed Activities only ([BPMN 2.0.2 §13.5.5](../docs/reference/bpmn-2.0.2/README.md), "presumed abort"). A called
instance's root takes its instance entry with it, which every reader finds only through a standing root
(`State.instanceRoot`), so a completed call retains nothing (DC24, #169). -/
def leaveScope (state : State) (le : Issue → Issue → Bool) (scope : ScopeOccurrenceId) : State :=
  let cleared := state.clearInside le scope
  { cleared with
      scopes := cleared.scopes.filter (·.id != scope)
      scopeOrdinals := cleared.scopeOrdinals.filter fun slot _ => slot.parent != scope
      occurrenceOrdinals := cleared.occurrenceOrdinals.filter fun slot _ => slot.parent != scope
      variables := cleared.variables.erase scope
      slots := { cleared.slots with
        compensation := { cleared.slots.compensation with
          retained := cleared.slots.compensation.retained.filter (·.scope != scope) }
        instances := cleared.slots.instances.filter (·.root != scope) } }

/-- Remove the occurrence record `id` and the scope occurrences it owns, if any, in the order of their positions under
`le`. The record goes first, so that leaving a scope does not cancel the occurrence that owns it. -/
def removeOccurrence (state : State) (le : Issue → Issue → Bool) (id : OccurrenceId) : State :=
  let removed := { state with
    occurrences := state.occurrences.filter (·.id != id), itemOrdinals := state.itemOrdinals.erase id }
  ((removed.scopes.filter (·.occurrence == some id)).mergeSort fun a b => le a.position b.position).foldl
    (fun state scope => state.leaveScope le scope.id) removed

/-- Close the open items inside `scope`, its own included; the occurrences they reserved go when the scope is
cleared. -/
def withdrawInside (state : State) (scope : ScopeOccurrenceId) : State :=
  let inside := state.inside scope
  { state with openItems := state.openItems.filter fun _ item => !inside.contains item.scope }

/-- Close the open items `cancelOccurrence` removes with the occurrence `id`: its own, those attached to it with
their reservations, and those inside the scope occurrences it owns. A firing that interrupts withdraws them at once,
while the cancellation itself is still queued, so that no firing queued before it finds them open. -/
def withdrawOccurrence (state : State) (id : OccurrenceId) : State :=
  let closed := (state.closeOwnItems id).disarm id
  (closed.scopes.filter (·.occurrence == some id)).foldl (fun state scope => state.withdrawInside scope.id) closed

/-- Cancel the occurrence `id` wherever it stands: its items and subscriptions go, the scope occurrence it owns is
left, and it is journalled cancelled. -/
def cancelOccurrence (state : State) (le : Issue → Issue → Bool) (id : OccurrenceId) : State :=
  match state.occurrence? id with
  | none => state
  | some occurrence => recordCancelled ((state.withdrawOccurrence id).removeOccurrence le id) [occurrence]

/-- Whether `scope` would be idle once the occurrence `id`, its items, what is attached to it and the scope occurrence
it owns were gone: nothing else remains there. -/
def idleWithout (state : State) (le : Issue → Issue → Bool) (scope : ScopeOccurrenceId) (id : OccurrenceId) : Bool :=
  (((state.closeOwnItems id).disarm id).removeOccurrence le id).idle scope

end State

end Kernel
