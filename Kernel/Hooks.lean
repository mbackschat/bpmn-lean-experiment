module

public import Kernel.State

/-! # Kernel hooks

The one seam between the generic step and the features. `Kernel.Step` dispatches on element, event role, input and
open-item kind and calls the field for that case; `Kernel.Registry` fills the fields from the features. A field a
registry leaves at its default refuses with `unsupported`, so an unregistered mechanism never silently drops a token.
The order in which `Step` calls hooks is semantic and owned by `Step` alone.
-/

public section

namespace Kernel

inductive Evaluation where
  | value (result : Value)
  | needsHost
  | failure (code : String)
  deriving Repr

/-- What every hook may read: the program and the evaluator the profile selects. -/
structure Ctx where
  program : Program
  evaluate : List (String × Value) → Expression → Evaluation

/-- A token that reached an element, removed from the flow it arrived on. -/
structure Arrival where
  flow : FlowId
  scope : ScopeOccurrenceId
  deriving Repr

/-- The default of every hook: the mechanism is not registered. -/
def refuse {α : Type} (code : String) : α → Outcome := fun _ => .error (.unsupported code)

structure Hooks where
  startProcess : Ctx → Header → StartPayload → State → Outcome := fun _ _ _ => refuse "start"
  arriveActivity : Ctx → Header → ActivityPayload → Arrival → State → Outcome :=
    fun _ _ _ _ => refuse "activity"
  arriveScope : Ctx → Header → ScopePayload → Arrival → State → Outcome := fun _ _ _ _ => refuse "scope"
  arriveGateway : Ctx → Header → GatewayPayload → Arrival → State → Outcome := fun _ _ _ _ => refuse "gateway"
  arriveCatch : Ctx → Header → EventPayload → Subscription → Arrival → State → Outcome :=
    fun _ _ _ _ _ => refuse "catchEvent"
  arriveThrow : Ctx → Header → EventPayload → Throw → Arrival → State → Outcome :=
    fun _ _ _ _ _ => refuse "throwEvent"
  arriveLink : Ctx → Header → EventPayload → Arrival → State → Outcome := fun _ _ _ _ => refuse "linkEvent"
  /-- Complete the work of an open User Task with the submitted values. -/
  completeUserTask : Ctx → Header → ActivityPayload → OpenItem → List (String × Value) → State → Outcome :=
    fun _ _ _ _ _ => refuse "completeUserTask"
  evaluate : List (String × Value) → Expression → Evaluation := fun _ _ => .failure "no-evaluator"

end Kernel
