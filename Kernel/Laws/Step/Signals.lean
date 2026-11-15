module

public import Kernel.State

/-! # Laws of the step function: which signals differ

The constructor disequalities of `Signal` that modules outside its owners need, here because only `Kernel.Step`'s
`Laws` and `Proofs` modules may decide one (guard 1). It imports the state alone, so a witness module can read it without
entering a feature's rebuild cone. Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Laws.Step

open Kernel

/-- A queued reservation is no begin. -/
theorem occur_ne_begin {element : ElementId} {scope : ScopeOccurrenceId} {leave : Leave}
    {writes : List (String × Value)} {rule : WriteRule} {request : BeginRequest} :
    Signal.occur element scope leave writes rule ≠ .begin request := nofun

/-- A queued compensation is no begin. -/
theorem compensate_ne_begin {scope : ScopeOccurrenceId} {activity : Option ElementId} {trigger : OccurrenceRef}
    {leave : Option Nat} {resume : Option Resume} {request : BeginRequest} :
    Signal.compensate scope activity trigger leave resume ≠ .begin request := nofun

/-- Queued begins of one request are one request. -/
theorem begin_inj {request other : BeginRequest} (same : Signal.begin request = .begin other) : request = other :=
  Signal.begin.inj same

end Kernel.Laws.Step
