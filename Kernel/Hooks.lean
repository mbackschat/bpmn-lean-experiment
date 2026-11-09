module

public import Kernel.State

/-! # Kernel hooks

The one seam between the generic step and the features. `Kernel.Step` dispatches on element, event role, input and
signal and calls the field for that case; `Kernel.Registry` fills the fields from the features. A lifecycle field a
registry leaves at its default refuses with `unsupported`, so an unregistered mechanism never silently drops a token;
the notification fields default to no-ops. The order in which `Step` calls hooks is semantic and owned by `Step`
alone.

Features never call each other. A feature that needs another feature's mechanism enqueues a `Signal`; the comment on
each field names the feature that owns it.
-/

public section

namespace Kernel

/-- An in-kernel evaluation: admission refuses every expression outside the kernel's subset, so a failure is an
absent reference (`.failure "unknown-variable"`), which `Mapping.dialect` reads. -/
inductive Evaluation where
  | value (result : Value)
  | failure (code : String)
  deriving Repr

/-- Whether a scope occurrence is a Multi-Instance instance, a compensation handler's context or ordinary. Filled by
`Kernel.Step`, which matches `Continuation` and reads the two feature slots that say so. -/
inductive ScopeRole where
  | ordinary
  | multiInstanceInstance
  | compensationHandler
  deriving DecidableEq, Repr

/-- The channel a Message trigger waits on, `none` for a Message named by an expression. -/
def MessageTrigger.channel? (trigger : MessageTrigger) : Option MessageChannel :=
  let address (messageId : Option String) : MessageChannel :=
    { messageId, interfaceRef := trigger.interfaceRef, operationRef := trigger.operationRef }
  match trigger.name with
  | none => some (address none)
  | some (.literal name) => some (address (some name))
  | some (.expression _) => none

def DeliveryTrigger.channel? : DeliveryTrigger → Option MessageChannel
  | .message channel => some channel
  | .signal _ => none

/-- The members of an input collection in order, `none` for a value that is not a collection; a String List's
members are Strings. -/
def MultiInstanceRun.items (run : MultiInstanceRun) : Option (List Value) :=
  match run.collection with
  | .stringList items => some (items.map .string)
  | .list items => some items
  | .null => none
  | .bool _ => none
  | .int _ => none
  | .decimal _ _ => none
  | .string _ => none
  | .map _ => none

/-- Hold an occurrence whose InputSet is unavailable (`FeatureSlots.held`). -/
def State.hold (state : State) (held : Parked) : State :=
  { state with slots := { state.slots with held := state.slots.held ++ [held] } }

/-- What an expression evaluated from `scope` reads. -/
def State.evalContext (state : State) (scope : ScopeOccurrenceId) : EvalContext :=
  { variables := state.visible scope, nowMs := state.logicalTimeMs }

/-- How a catch trigger catches a raised event: its precedence, lower first, and the variables it writes. -/
structure Catch where
  rank : Nat
  writes : List (String × Value) := []
  deriving Repr

/-- What every hook may read: the program, the evaluator the profile selects, and the cross-owner queries. A
feature that needs to inspect a guarded type it does not own asks that type's owner through one of these queries,
which `Step` fills from the `Hooks` field of the same name. -/
structure Ctx where
  program : Program
  evaluate : EvalContext → Expression → Evaluation
  /-- Subscriptions: how a catch trigger catches a raised event (an exact Error or Escalation code before a catch-all),
  or `none` when it does not catch it. -/
  catches : Raised → Trigger → Option Catch
  /-- Scopes: the start subscription and interrupting flag of an Event Sub-Process, `none` for another scope. -/
  eventStart : ScopePayload → Option (Subscription × Bool)
  /-- `Step`: what a scope occurrence is, for a search that must not treat it as ordinary. -/
  scopeRole : State → ScopeOccurrenceId → ScopeRole := fun _ _ => .ordinary

/-- Evaluate each mapping's source against `variables`, in order. An absent reference is read by the mapping's
dialect: a Data Association's source is unavailable (`none`, BPMN 2.0.2 §10.4.2, which the caller decides on), an
`ioParameter` expression rolls the command back, and a `callVariable` copy reads null (CIB-EXT-0021). Features share
it here because they never import each other. -/
def Ctx.evaluateMappings (ctx : Ctx) (context : EvalContext) (mappings : List Mapping) :
    Except Failure (Option (List (String × Value))) :=
  mappings.foldrM (fun mapping rest =>
    match ctx.evaluate context mapping.source with
    | .value value => .ok (rest.map ((mapping.target, value) :: ·))
    | .failure _ =>
      match mapping.dialect with
      | .dataAssociation => .ok none
      | .ioParameter => .error (.rolledBack "mapping-source-unavailable")
      | .callVariable => .ok (rest.map ((mapping.target, Value.null) :: ·))) (some [])

/-- The bindings of `mappings` where an unavailable source has no state to wait in, a semantic failure. -/
def Ctx.requireMappings (ctx : Ctx) (context : EvalContext) (mappings : List Mapping) :
    Except Failure (List (String × Value)) := do
  match ← ctx.evaluateMappings context mappings with
  | some bindings => .ok bindings
  | none => .error (.semanticFailure "mapping-source-unavailable")

/-- The one way a boundary fires: an interrupting boundary first cancels the occurrence `host` it hangs on, if any; then
the boundary's occurrence, the reservation `reserved` or a fresh one, begins and leaves on its flows in `scope`
(BPMN 2.0.2 §13.5.3, §10.5.6). -/
def Boundary.fire (boundary : Boundary) (host reserved : Option Nat) (scope : ScopeOccurrenceId)
    (writes : List (String × Value)) (state : State) : State :=
  let interrupted := match boundary.interrupting, host with
    | true, some owner => state.signal (.cancel owner)
    | true, none => state
    | false, _ => state
  let leave : Leave := .flows boundary.outgoing
  interrupted.signal <| match reserved with
    | some id => .complete id leave writes .outward
    | none => .occur boundary.id scope leave writes .outward

/-- What a Scope begins with besides its evaluated inputs. `inner` is the reservation of an Event Sub-Process's start
Event, when a subscription triggered it. -/
structure ScopeEntry where
  locals : List (String × Value) := []
  inner : Option Nat := none
  deriving Repr

/-- The default of every lifecycle hook: the mechanism is not registered. -/
def refuse {α : Type} (code : String) : α → Outcome := fun _ => .error (.unsupported code)

structure Hooks where
  /-- Subscriptions: a start Event's occurrence began, fired by the trigger. -/
  arriveStart : Ctx → Header → StartPayload → StartTrigger → Occurrence → State → Outcome :=
    fun _ _ _ _ _ => refuse "start"
  /-- Work: an Activity's occurrence began. -/
  arriveActivity : Ctx → Header → ActivityPayload → Occurrence → State → Outcome :=
    fun _ _ _ _ => refuse "activity"
  /-- MultiInstance: the body occurrence of an element with Multi-Instance loop characteristics began. -/
  arriveMultiInstance : Ctx → Header → Envelope → MultiInstance → Occurrence → State → Outcome :=
    fun _ _ _ _ _ => refuse "multiInstance"
  /-- Scopes. -/
  arriveScope : Ctx → Header → ScopePayload → Occurrence → ScopeEntry → State → Outcome :=
    fun _ _ _ _ _ => refuse "scope"
  /-- Flow. -/
  arriveGateway : Ctx → Header → GatewayPayload → Occurrence → State → Outcome := fun _ _ _ _ => refuse "gateway"
  /-- Subscriptions. -/
  arriveCatch : Ctx → Header → EventPayload → Subscription → Occurrence → State → Outcome :=
    fun _ _ _ _ _ => refuse "catchEvent"
  /-- Propagation. -/
  arriveThrow : Ctx → Header → EventPayload → Throw → Occurrence → State → Outcome :=
    fun _ _ _ _ _ => refuse "throwEvent"
  /-- Flow. -/
  arriveLink : Ctx → Header → EventPayload → Occurrence → State → Outcome := fun _ _ _ _ => refuse "linkEvent"
  /-- Scopes: the scope occurrence of a Scope element is idle. The last argument is its owning occurrence. -/
  completeScope : Ctx → Header → ScopePayload → ScopeOccurrence → Occurrence → State → Outcome :=
    fun _ _ _ _ _ => refuse "completeScope"
  /-- Work: the root of a called process instance is idle; the header and payload are its Call Activity's. -/
  completeCall : Ctx → Header → ActivityPayload → ScopeOccurrence → Occurrence → State → Outcome :=
    fun _ _ _ _ _ => refuse "completeCall"
  /-- MultiInstance: the scope occurrence of a Multi-Instance body is idle. -/
  completeBody : Ctx → Header → Envelope → MultiInstance → Occurrence → State → Outcome :=
    fun _ _ _ _ _ => refuse "completeBody"
  /-- Work: complete an open User Task with the submitted values. -/
  completeUserTask : Ctx → Header → ActivityPayload → OpenItem → List (String × Value) → State → Outcome :=
    fun _ _ _ _ _ => refuse "completeUserTask"
  /-- Work: the outcome of an open effect. -/
  effectResult : Ctx → OpenItem → EffectOutcome → State → Outcome := fun _ _ _ => refuse "effectResult"
  /-- Work: retry an open incident or cancel its process (`CommandAction.retryIncident` or
  `.cancelIncidentProcess`). -/
  resolveIncident : Ctx → OpenItem → CommandAction → State → Outcome := fun _ _ _ => refuse "resolveIncident"
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
  armGateway : Ctx → Nat → ElementId → ScopeOccurrenceId → State → Outcome := fun _ _ _ _ => refuse "armGateway"
  /-- Propagation: `Signal.raise`. -/
  raise : Ctx → Raised → Origin → State → Outcome := fun _ _ _ => refuse "raise"
  /-- Compensation: `Signal.compensate`. -/
  compensate : Ctx → ScopeOccurrenceId → Option ElementId → OccurrenceRef → Option Nat → Option Resume → State → Outcome :=
    fun _ _ _ _ _ _ => refuse "compensate"
  /-- Compensation: `Signal.compensationFailed`. -/
  failCompensation : Ctx → ScopeOccurrenceId → String → Option String → Origin → State → Outcome :=
    fun _ _ _ _ _ => refuse "failCompensation"
  -- The completion pipeline, in the order `Step` runs it
  /-- Subscriptions: disarm the items attached to the completing occurrence. -/
  leave : Ctx → Occurrence → State → Outcome := fun _ _ => refuse "leave"
  /-- Flow: resolve a completion's outgoing flows when the profile evaluates its conditions before its output writes
  (`ConditionOrder.beforeOutputs`); otherwise the leave is unchanged and `outflow` resolves it. -/
  select : Ctx → Occurrence → Leave → State → Except Failure Leave :=
    fun _ _ _ _ => .error (.unsupported "select") -- dynamic-only: a registry without the hook
  /-- Data: apply writes from a scope occurrence: a completion's, and `Signal.write`. -/
  writeOutputs : Ctx → ScopeOccurrenceId → List (String × Value) → WriteRule → State → Outcome :=
    fun _ _ _ _ => refuse "writeOutputs"
  /-- Data: `Signal.remove`. -/
  removeVariables : Ctx → ScopeOccurrenceId → List String → State → Outcome := fun _ _ _ => refuse "removeVariables"
  /-- Compensation: retain the completed occurrence when its element has a handler. -/
  completed : Ctx → Occurrence → State → Outcome := fun _ _ => refuse "completed"
  /-- Flow: leave through flows. -/
  outflow : Ctx → Occurrence → Leave → State → Outcome := fun _ _ _ => refuse "outflow"
  /-- MultiInstance: one instance of the body occurrence completed. -/
  instanceCompleted : Ctx → Nat → Occurrence → List (String × Value) → State → Outcome :=
    fun _ _ _ _ => refuse "instanceCompleted"
  /-- Compensation: a handler of the run in that scope occurrence completed. -/
  handlerCompleted : Ctx → ScopeOccurrenceId → Occurrence → State → Outcome :=
    fun _ _ _ => refuse "handlerCompleted"
  -- Notifications
  /-- A generic cancellation removed the occurrence; a feature that must react has this one place. -/
  cancelled : Ctx → Occurrence → State → Outcome := fun _ _ state => .ok state
  /-- Subscriptions: variables were written (PC-CONDITION-01). -/
  written : Ctx → List WriteEvent → State → Outcome := fun _ _ state => .ok state
  -- Queries and the evaluator
  evaluate : EvalContext → Expression → Evaluation := fun _ _ => .failure "no-evaluator"
  /-- Subscriptions: `Ctx.catches`. -/
  catches : Raised → Trigger → Option Catch := fun _ _ => none
  /-- Scopes: `Ctx.eventStart`. -/
  eventStart : ScopePayload → Option (Subscription × Bool) := fun _ => none
  /-- Subscriptions: the root start Event an input selects: the one it names, else the one its trigger fires (a none
  trigger, the sole none start). `Kernel.Population` asks it too. -/
  selectStart : Ctx → Option ElementId → StartTrigger → Option ElementId := fun _ _ _ => none
  /-- Subscriptions: whether the open item is a correlated Message subscription on the channel whose criteria, evaluated
  in the current state, equal the delivered correlation; `false` for any other item. `Kernel.Population` asks it to
  find the candidates of a correlated publication. -/
  correlates : Ctx → OpenItem → MessageChannel → List CorrelationMatch → State → Except Failure Bool :=
    fun _ _ _ _ _ => .error (.unsupported "correlates") -- dynamic-only: a registry without the hook

end Kernel
