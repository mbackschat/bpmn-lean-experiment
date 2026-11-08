module

public import Kernel.Hooks

/-! # Subscriptions: catch Events, boundaries, Event Sub-Process starts and Event-Based Gateway arms

Owns matching on `Trigger`. A scope occurrence whose element declares no Event Sub-Process has nothing to arm.
-/

public section

namespace Kernel.Feature.Subscriptions

/-- The Event Sub-Processes declared directly in the element of scope occurrence `scope`. -/
def eventSubProcesses (ctx : Ctx) (state : State) (scope : ScopeOccurrenceId) : List Element :=
  let element := (state.scopes.find? (·.id == scope)).bind (·.element)
  (ctx.program.children element).filter fun
    | .scope _ payload =>
      match payload.kind with
      | .eventSubProcess _ _ => true
      | .embedded => false
      | .transaction => false
    | .activity _ _ => false
    | .event _ _ => false
    | .gateway _ _ => false
    | .start _ _ => false

def armScope (ctx : Ctx) (scope : ScopeOccurrenceId) (state : State) : Outcome :=
  if (eventSubProcesses ctx state scope).isEmpty then .ok state
  else .error (.unsupported "event-subprocess-start")

end Kernel.Feature.Subscriptions
