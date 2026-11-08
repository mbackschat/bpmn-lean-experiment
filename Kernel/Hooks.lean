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

/-- What every hook may read: the program, the evaluator the profile selects, and the cross-owner queries. A
feature that needs to inspect a guarded type it does not own asks that type's owner through one of these queries,
which `Step` fills from the `Hooks` field of the same name. -/
structure Ctx where
  program : Program
  evaluate : List (String × Value) → Expression → Evaluation
  /-- Subscriptions: the precedence with which a catch trigger catches a raised event, lower first (an exact
  Error or Escalation code before a catch-all), or `none` when it does not catch it. -/
  catches : Raised → Trigger → Option Nat
  /-- Scopes: the start subscription and interrupting flag of an Event Sub-Process, `none` for another scope. -/
  eventStart : ScopePayload → Option (Subscription × Bool)
  /-- Work: the item one instance of a Multi-Instance Activity opens, `none` for work that has no such item. -/
  bodyWait : ActivityPayload → Option OpenKind := fun _ => none

/-- Evaluate each mapping's source against `variables`, in order. A mapping whose source the kernel cannot
evaluate refuses the step, never drops the binding. Features share it here because they never import each other. -/
def Ctx.evaluateMappings (ctx : Ctx) (variables : List (String × Value)) (mappings : List Mapping) :
    Except Failure (List (String × Value)) :=
  mappings.mapM fun mapping =>
    match ctx.evaluate variables mapping.source with
    | .value value => .ok (mapping.target, value)
    | .needsHost => .error (.unsupported "host-evaluation")
    | .failure code => .error (.semanticFailure code)

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
  /-- Work: the root of a called process instance holds no token, no blocking item, no parked token and no child
  occurrence; the header and payload are its Call Activity's. -/
  completeCall : Ctx → Header → ActivityPayload → ScopeOccurrence → State → Outcome :=
    fun _ _ _ _ => refuse "completeCall"
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
  /-- Work: `Signal.startActivity`. -/
  startActivity : Ctx → Header → ActivityPayload → ScopeOccurrenceId → State → Outcome :=
    fun _ _ _ _ => refuse "startActivity"
  /-- Compensation: `Signal.completed`. -/
  retain : Ctx → ElementId → ScopeOccurrenceId → List (String × Value) → State → Outcome :=
    fun _ _ _ _ => refuse "retain"
  /-- Compensation: `Signal.compensate`. -/
  compensate : Ctx → ScopeOccurrenceId → OccurrenceRef → Bool → List Token → State → Outcome :=
    fun _ _ _ _ _ => refuse "compensate"
  /-- Compensation: a compensation handler's occurrence holds no token, no blocking item, no parked token and no
  child occurrence. -/
  completeCompensation : Ctx → ScopeOccurrence → State → Outcome := fun _ _ => refuse "completeCompensation"
  /-- Compensation: `Signal.compensationFailed`. -/
  failCompensation : Ctx → ScopeOccurrenceId → String → Option String → Origin → State → Outcome :=
    fun _ _ _ _ _ => refuse "failCompensation"
  evaluate : List (String × Value) → Expression → Evaluation := fun _ _ => .failure "no-evaluator"
  /-- Subscriptions: `Ctx.catches`. -/
  catches : Raised → Trigger → Option Nat := fun _ _ => none
  /-- Scopes: `Ctx.eventStart`. -/
  eventStart : ScopePayload → Option (Subscription × Bool) := fun _ => none
  /-- Work: `Ctx.bodyWait`. -/
  bodyWait : ActivityPayload → Option OpenKind := fun _ => none
  /-- Subscriptions: whether the open item is a correlated Message subscription on the channel whose criteria, evaluated
  in the current state, equal the delivered correlation; `false` for any other item. `Kernel.Population` asks it to
  find the candidates of a correlated publication. -/
  correlates : Ctx → OpenItem → MessageChannel → List (String × Value) → State → Except Failure Bool :=
    fun _ _ _ _ _ => .error (.unsupported "correlates")
  /-- MultiInstance: a token reached an Activity with Multi-Instance loop characteristics. -/
  arriveMultiInstance : Ctx → Header → ActivityPayload → MultiInstance → Arrival → State → Outcome :=
    fun _ _ _ _ _ => refuse "multiInstance"
  /-- MultiInstance: complete the open User Task of one instance with the submitted values. -/
  completeInstance : Ctx → Header → ActivityPayload → MultiInstance → OpenItem → List (String × Value) → State →
      Outcome := fun _ _ _ _ _ _ => refuse "completeInstance"
  /-- MultiInstance: the published `mode` of a Multi-Instance Activity, for `Kernel.Publish`. -/
  multiInstanceMode : MultiInstanceMode → String := fun _ => "unregistered"

end Kernel
