module

public import Kernel.State.Removal
import Kernel.Laws.State.Removal

/-! # Laws of the kernel state: what the counter and keying equations give

The consequences of `Kernel.Laws.State`'s full-record equations (`signal_eq`, `openSubscription_eq`, `reserve_reserves`,
`clearInside_eq`, `leaveScope_eq`, `keyed_eq`) that modules outside its importers read: queuing a signal, clearing and
leaving issue nothing, a subscription issues more, so a state that kept a property and issued no more bounds what the
later state names (`Laws.Flow.Anchored`), and one binding keys to itself. It imports `Kernel.Laws.State` privately, so
its readers see these statements alone. Nothing executable imports this module.
-/

public section

namespace Kernel.Laws.State

open Kernel

theorem signal_nextIssue (state : State) (signal : Signal) : (state.signal signal).nextIssue = state.nextIssue := by
  rw [signal_eq]

theorem openSubscription_issues (state : State) (kind : OpenKind) (element : ElementId) (scope : ScopeOccurrenceId)
    (host : Option Nat) (passive : Bool) :
    state.nextIssue ≤ (state.openSubscription kind element scope host passive).1.nextIssue := by
  rw [openSubscription_eq]
  show state.nextIssue ≤ (state.reserve element scope).1.nextIssue + 1
  rw [(reserve_reserves state element scope).nextIssue]
  omega

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
