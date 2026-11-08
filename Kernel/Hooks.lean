module

public import Kernel.State
public import Kernel.IL.Query

/-! # Kernel hooks

The one seam between the generic step and the features. `Kernel.Step` dispatches on element, event role, input,
open-item kind and signal and calls the field for that case; `Kernel.Registry` fills the fields from the features.
A field a registry leaves at its default refuses with `unsupported`, so an unregistered mechanism never silently
drops a token. The order in which `Step` calls hooks is semantic and owned by `Step` alone.

Features never call each other. A feature that needs another feature's mechanism enqueues a `Signal`; the hook
column below names the feature that owns each field.
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
  /-- Flow: start the process at `header`, already resolved by `Step`. -/
  startProcess : Ctx → Header → StartPayload → State → Outcome := fun _ _ _ => refuse "start"
  /-- Work. -/
  arriveActivity : Ctx → Header → ActivityPayload → Arrival → State → Outcome :=
    fun _ _ _ _ => refuse "activity"
  /-- Scopes. -/
  arriveScope : Ctx → Header → ScopePayload → Arrival → State → Outcome := fun _ _ _ _ => refuse "scope"
  /-- Flow. -/
  arriveGateway : Ctx → Header → GatewayPayload → Arrival → State → Outcome := fun _ _ _ _ => refuse "gateway"
  /-- Subscriptions. -/
  arriveCatch : Ctx → Header → EventPayload → Subscription → Arrival → State → Outcome :=
    fun _ _ _ _ _ => refuse "catchEvent"
  /-- Propagation. -/
  arriveThrow : Ctx → Header → EventPayload → Throw → Arrival → State → Outcome :=
    fun _ _ _ _ _ => refuse "throwEvent"
  /-- Flow. -/
  arriveLink : Ctx → Header → EventPayload → Arrival → State → Outcome := fun _ _ _ _ => refuse "linkEvent"
  /-- Scopes: the scope occurrence holds no token, no blocking item, no parked token and no child occurrence. -/
  completeScope : Ctx → Header → ScopePayload → ScopeOccurrence → State → Outcome :=
    fun _ _ _ _ => refuse "completeScope"
  /-- Work: complete an open User Task with the submitted values. -/
  completeUserTask : Ctx → Header → ActivityPayload → OpenItem → List (String × Value) → State → Outcome :=
    fun _ _ _ _ _ => refuse "completeUserTask"
  /-- Work: the outcome of an open effect. -/
  effectResult : Ctx → Header → ActivityPayload → OpenItem → EffectOutcome → State → Outcome :=
    fun _ _ _ _ _ => refuse "effectResult"
  /-- Work: retry an open incident or cancel its process (`CommandAction.retryIncident` or
  `.cancelIncidentProcess`). -/
  resolveIncident : Ctx → Header → ActivityPayload → OpenItem → CommandAction → State → Outcome :=
    fun _ _ _ _ _ => refuse "resolveIncident"
  /-- Work: a message or timer subscription an Activity opened itself (a Receive Task) fired. -/
  triggerActivity : Ctx → Header → ActivityPayload → OpenItem → Fired → State → Outcome :=
    fun _ _ _ _ _ => refuse "triggerActivity"
  /-- Subscriptions: any other message or timer subscription fired (catch Events, boundaries, Event Sub-Process
  starts, Event-Based Gateway arms). -/
  trigger : Ctx → OpenItem → Fired → State → Outcome := fun _ _ _ => refuse "trigger"
  /-- Subscriptions: `Signal.arm`. -/
  arm : Ctx → Nat → ElementId → ScopeOccurrenceId → State → Outcome := fun _ _ _ _ => refuse "arm"
  /-- Subscriptions: `Signal.armScope`. -/
  armScope : Ctx → ScopeOccurrenceId → State → Outcome := fun _ _ => refuse "armScope"
  /-- Subscriptions: `Signal.armGateway`. -/
  armGateway : Ctx → ElementId → ScopeOccurrenceId → State → Outcome := fun _ _ _ => refuse "armGateway"
  /-- Propagation: `Signal.raise`. -/
  raise : Ctx → Raised → Origin → State → Outcome := fun _ _ _ => refuse "raise"
  /-- Scopes: `Signal.startEventSubProcess`. -/
  startEventSubProcess : Ctx → ElementId → ScopeOccurrenceId → List (String × Value) → State → Outcome :=
    fun _ _ _ _ => refuse "startEventSubProcess"
  evaluate : List (String × Value) → Expression → Evaluation := fun _ _ => .failure "no-evaluator"

end Kernel
