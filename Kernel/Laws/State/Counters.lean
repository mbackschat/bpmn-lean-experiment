module

public import Kernel.Laws.State.History
public import Kernel.State.Removal
import Kernel.Laws.State.Removal

/-! # Laws of the kernel state: what the counter and keying equations give

The consequences of `Kernel.Laws.State`'s full-record equations (`signal_eq`, `openSubscription_eq`, `reserve_reserves`,
`clearInside_eq`, `leaveScope_eq`, `keyed_eq`) that modules outside its importers read: queuing a signal and opening a
subscription keep every scope-key history, so a state that kept a property and issued no more bounds what the later
state names (`Laws.Flow.Anchored`), clearing and leaving issue nothing, and one binding keys to itself. It imports `Kernel.Laws.State` privately, so
its readers see these statements alone. Nothing executable imports this module.
-/

public section

namespace Kernel.Laws.State

open Kernel

theorem signal_grows (state : State) (signal : Signal) : ScopeGrows state (state.signal signal) := by
  rw [signal_eq]
  exact .of_same rfl rfl

theorem openSubscription_grows (state : State) (kind : OpenKind) (element : ElementId) (scope : ScopeOccurrenceId)
    (host : Option Nat) (passive : Bool) : ScopeGrows state (state.openSubscription kind element scope host passive).1 := by
  have reserves := reserve_reserves state element scope
  rw [openSubscription_eq]
  exact .of_same (congrArg (List.map (·.id)) reserves.scopes) reserves.scopeOrdinals

theorem clearInside_nextIssue (s : State) (scope : ScopeOccurrenceId) (keep : List Nat) :
    (s.clearInside scope keep).nextIssue = s.nextIssue := by
  obtain ⟨_, shape⟩ := clearInside_eq s scope keep
  rw [shape]

theorem leaveScope_nextIssue (s : State) (scope : ScopeOccurrenceId) : (s.leaveScope scope).nextIssue = s.nextIssue := by
  rw [(leaveScope_eq s scope).1]
  exact clearInside_nextIssue s scope []

theorem keyed_single (binding : String × Value) : keyed [binding] = [binding] := by
  rw [keyed_eq.2, keyed_eq.1]
  rfl

end Kernel.Laws.State
