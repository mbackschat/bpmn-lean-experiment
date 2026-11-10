module

public import Kernel.State.Slots

/-! # Raised events and instance failures

What a thrown event carries and where its search starts, and how a process instance fails. Part of `Kernel.State`,
which re-exports it.
-/

public section

namespace Kernel

/-- Guarded type: `Kernel.Feature.Propagation` owns matching on it; `Kernel.Feature.Subscriptions`' `catches` is the
cross-owner query. A thrown event that propagates to a catcher. -/
inductive Raised where
  | error (code : String) (message : Option String)
  | escalation (code : String)
  | cancel
  deriving Repr

def Raised.isCancel : Raised → Bool
  | .cancel => true
  | .error _ _ => false
  | .escalation _ => false

/-- Where a raised event starts its search: the throwing element, the scope occurrence it ran in, and its
activation. `host` is the Activity occurrence that raised it, whose boundaries are searched first; `none` for a
throw Event. `patch` is the result an effect's business Error carries while `host` still runs, its mapped Error-path
outputs not yet written (`Propagation.raise`). -/
structure Origin where
  element : ElementId
  scope : ScopeOccurrenceId
  activation : Nat
  host : Option Nat := none
  patch : List (String × Value) := []
  deriving Repr

/-- The failure of a process instance: the Error, the occurrence it surfaced at, and the named occurrences related to
it (a compensation failure names its trigger and handler). -/
structure InstanceFailure where
  code : String
  message : Option String
  occurrence : OccurrenceRef
  related : List (String × OccurrenceRef) := []
  deriving Repr

end Kernel
