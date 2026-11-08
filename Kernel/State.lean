module

public import Kernel.IL.Types

/-! # Kernel runtime state

Flat and identifier-indexed: scope occurrences refer to their parent by identifier, tokens sit on sequence flows,
and every open interaction is one `OpenItem` keyed by an engine-issued identity. The top-level shape is fixed; a
feature keeps its own data in its slot of `FeatureSlots`, which is always present and empty by default, so the state
codec never varies by program.
-/

public section

namespace Kernel

structure ScopeOccurrenceId where
  value : Nat
  deriving DecidableEq, Repr, Inhabited

/-- A scope occurrence: the process instance (`element = none`) or one activation of a Scope element. -/
structure ScopeOccurrence where
  id : ScopeOccurrenceId
  element : Option ElementId
  parent : Option ScopeOccurrenceId
  activation : Nat := 0
  deriving Repr

/-- A token on a sequence flow, inside a scope occurrence. -/
structure Token where
  flow : FlowId
  scope : ScopeOccurrenceId
  deriving DecidableEq, Repr

structure ScopeVariables where
  scope : ScopeOccurrenceId
  entries : List (String × Value)
  deriving Repr

/-- What an open User Task publishes besides its identity. Metadata is published only when the task carries
candidate groups; form fields are `(key, type)` pairs. -/
structure UserTaskDetail where
  name : Option String
  candidateGroups : List String := []
  formFields : List (String × String) := []
  inputs : List (String × Value) := []
  deriving Repr

/-- A Message address: the Message's identifier and, when the model routes it through an Operation, that
Operation. `messageId = none` is an unspecified Message. -/
structure MessageChannel where
  messageId : Option String
  interfaceRef : Option String := none
  operationRef : Option String := none
  deriving DecidableEq, Repr

structure MessageWaitDetail where
  channel : MessageChannel
  /-- The delivery carries a payload the wait writes. -/
  payload : Bool := false
  deriving Repr

/-- `period` re-arms a cycle Timer after it fires. -/
structure TimerDetail where
  deadlineMs : Nat
  period : Option Nat := none
  deriving Repr

structure EffectDetail where
  protocol : String
  operation : String
  arguments : List (String × Value) := []
  deriving Repr

/-- `cancellable` publishes the `cancelIncidentProcess` interaction beside `retryIncident`. -/
structure IncidentDetail where
  effect : EffectDetail
  generation : Nat := 1
  cancellable : Bool := false
  deriving Repr

/-- Guarded type: only `Kernel.Step` and `Kernel.Publish` match on it. Each kind carries the typed detail its
public observation needs, filled by the feature that opens the item. -/
inductive OpenKind where
  | userTask (detail : UserTaskDetail)
  | message (detail : MessageWaitDetail)
  | timer (detail : TimerDetail)
  | effect (detail : EffectDetail)
  | incident (detail : IncidentDetail)
  | evaluation (request : Nat)
  deriving Repr

def OpenKind.timer? : OpenKind → Option TimerDetail
  | .timer detail => some detail
  | .userTask _ => none
  | .message _ => none
  | .effect _ => none
  | .incident _ => none
  | .evaluation _ => none

def OpenKind.message? : OpenKind → Option MessageWaitDetail
  | .message detail => some detail
  | .userTask _ => none
  | .timer _ => none
  | .effect _ => none
  | .incident _ => none
  | .evaluation _ => none

/-- One open interaction. `activation` counts activations of `element` in this process instance, from 1.
`attachedTo` is the host an attached subscription belongs to: the id of the host's own item, or the value of the
host scope occurrence's id. A `passive` item, such as an Event Sub-Process start subscription, keeps no scope
occurrence alive and is removed when its scope completes. -/
structure OpenItem where
  id : Nat
  kind : OpenKind
  element : ElementId
  scope : ScopeOccurrenceId
  activation : Nat
  attachedTo : Option Nat := none
  passive : Bool := false
  deriving Repr

inductive InstanceStatus where
  | running
  | completed
  | cancelled
  | failed
  deriving DecidableEq, Repr

/-- A thrown event that propagates to a catcher. -/
inductive Raised where
  | error (code : String) (message : Option String)
  | escalation (code : String)
  | signal (name : String)
  | compensation (activity : Option ElementId) (waitForCompletion : Bool)
  | cancel
  deriving Repr

/-- Where a raised event starts its search: the throwing element, the scope occurrence it ran in, and, for an
Activity, the host id its boundaries are attached to. -/
structure Origin where
  element : ElementId
  scope : ScopeOccurrenceId
  host : Option Nat := none
  deriving Repr

/-- Guarded type: `Kernel.Step` owns matching on it. The cross-feature protocol: a feature that needs another
feature's mechanism enqueues a signal, and `Step` hands it to the owning hook before any token moves. -/
inductive Signal where
  /-- Arm the boundaries of `element`, attached to `host`, in `scope`. -/
  | arm (host : Nat) (element : ElementId) (scope : ScopeOccurrenceId)
  /-- Arm the Event Sub-Process starts of the scope occurrence `scope` (the process root included). -/
  | armScope (scope : ScopeOccurrenceId)
  /-- Arm the arms of the Event-Based Gateway `gateway`, reached in `scope`. -/
  | armGateway (gateway : ElementId) (scope : ScopeOccurrenceId)
  | raise (event : Raised) (origin : Origin)
  /-- Start the Event Sub-Process `element` inside `parent`, writing `variables` into its new occurrence. -/
  | startEventSubProcess (element : ElementId) (parent : ScopeOccurrenceId) (variables : List (String × Value))
  deriving Repr

/-- Feature-owned data. Each slot is fixed at W0.1 from the row traceability table and starts empty.
`parked` holds tokens that reached a join and wait for its other incoming flows (`Kernel.Feature.Flow`). -/
structure FeatureSlots where
  parked : List Token := []
  deriving Repr

structure State where
  instanceId : String
  status : InstanceStatus := .running
  scopes : List ScopeOccurrence := []
  tokens : List Token := []
  variables : List ScopeVariables := []
  openItems : List OpenItem := []
  activations : List (ElementId × Nat) := []
  nextIssue : Nat := 1
  logicalTimeMs : Nat := 0
  signals : List Signal := []
  slots : FeatureSlots := {}
  deriving Repr

/-- Why a step does not commit. Harness failures never appear here. -/
inductive Failure where
  | rejected (code : String)
  | semanticFailure (code : String)
  | unsupported (code : String)
  deriving DecidableEq, Repr

abbrev Outcome := Except Failure State

/-! ## Inputs -/

structure StartInput where
  instanceId : String
  startEvent : Option ElementId := none
  variables : List (String × Value) := []
  deriving Repr

/-- The public identity of an occurrence: the element and its activation number in the instance. -/
structure OccurrenceRef where
  element : ElementId
  activation : Nat
  deriving DecidableEq, Repr

inductive CommandAction where
  | completeUserTask (values : List (String × Value))
  | retryIncident
  | cancelIncidentProcess
  deriving Repr

structure CommandInput where
  occurrence : OccurrenceRef
  action : CommandAction
  deriving Repr

/-- A Message delivered to the subscription `occurrence` names. -/
structure DeliveryInput where
  occurrence : OccurrenceRef
  channel : MessageChannel
  correlation : List (String × Value) := []
  payload : Option Value := none
  deriving Repr

/-- What fired a message or timer subscription. -/
inductive Fired where
  | timer (logicalTimeMs : Nat)
  | message (delivery : DeliveryInput)
  deriving Repr

structure TimerInput where
  occurrence : OccurrenceRef
  logicalTimeMs : Nat
  deriving Repr

inductive EffectOutcome where
  | success (outputs : List (String × Value))
  | businessFailure (code : String) (message : Option String) (outputs : List (String × Value))
  | technicalFailure
  deriving Repr

structure EffectInput where
  occurrence : OccurrenceRef
  outcome : EffectOutcome
  deriving Repr

/-- The host's answer to an evaluation request, bound to the request's content digest. -/
structure EvaluationInput where
  request : Nat
  contentSha256 : String
  result : Except String Value
  deriving Repr

/-- Guarded type: `Kernel.Step` owns matching on it. -/
inductive Input where
  | start (payload : StartInput)
  | command (payload : CommandInput)
  | deliver (payload : DeliveryInput)
  | timerFire (payload : TimerInput)
  | effectResult (payload : EffectInput)
  | evaluationResult (payload : EvaluationInput)
  deriving Repr

namespace State

def root : ScopeOccurrenceId := ⟨0⟩

/-- A fresh process instance: one root scope occurrence with the given variables. -/
def initial (instanceId : String) (variables : List (String × Value)) : State :=
  { instanceId
    scopes := [{ id := root, element := none, parent := none }]
    variables := [{ scope := root, entries := variables }] }

def emit (state : State) (flows : List FlowId) (scope : ScopeOccurrenceId) : State :=
  { state with tokens := state.tokens ++ flows.map fun flow => { flow, scope } }

/-- The next activation number of `element`, recorded. -/
def activate (state : State) (element : ElementId) : State × Nat :=
  let count := ((state.activations.find? (·.1 == element)).map (·.2)).getD 0 + 1
  ({ state with activations := (element, count) :: state.activations.filter (·.1 != element) }, count)

def issue (state : State) : State × Nat :=
  ({ state with nextIssue := state.nextIssue + 1 }, state.nextIssue)

def openItem (state : State) (kind : OpenKind) (element : ElementId) (scope : ScopeOccurrenceId) : State :=
  let (state, activation) := state.activate element
  let (state, id) := state.issue
  { state with openItems := state.openItems ++ [{ id, kind, element, scope, activation }] }

def signal (state : State) (signal : Signal) : State :=
  { state with signals := state.signals ++ [signal] }

def closeItem (state : State) (id : Nat) : State :=
  { state with openItems := state.openItems.filter (·.id != id) }

/-- Remove the items attached to `host`. -/
def disarm (state : State) (host : Nat) : State :=
  { state with openItems := state.openItems.filter (·.attachedTo != some host) }

def openAttached (state : State) (kind : OpenKind) (element : ElementId) (scope : ScopeOccurrenceId)
    (host : Option Nat) : State × Nat :=
  let (state, activation) := state.activate element
  let (state, id) := state.issue
  ({ state with openItems := state.openItems ++ [{ id, kind, element, scope, activation, attachedTo := host }] }, id)

/-- Enter a new scope occurrence of `element` inside `parent`, with the given local variables. -/
def enterScope (state : State) (element : ElementId) (parent : ScopeOccurrenceId)
    (locals : List (String × Value)) : State × ScopeOccurrenceId :=
  let (state, activation) := state.activate element
  let (state, issued) := state.issue
  let id : ScopeOccurrenceId := ⟨issued⟩
  ({ state with
      scopes := state.scopes ++ [{ id, element := some element, parent := some parent, activation }]
      variables := state.variables ++ [{ scope := id, entries := locals }] }, id)

/-- The scope occurrences inside `scope`, transitively, including `scope`. -/
def subtree (state : State) (scope : ScopeOccurrenceId) : List ScopeOccurrenceId :=
  let rec go (fuel : Nat) (frontier : List ScopeOccurrenceId) (seen : List ScopeOccurrenceId) :
      List ScopeOccurrenceId :=
    match fuel, frontier with
    | 0, _ | _, [] => seen
    | fuel + 1, next :: rest =>
      let children := (state.scopes.filter (·.parent == some next)).map (·.id)
      go fuel (rest ++ children) (seen ++ [next])
  go (state.scopes.length + 1) [scope] []

/-- Remove every token, item, parked token, variable set and child scope occurrence inside `scope`, keeping
`scope` itself. The owning features are told nothing: what a removal means is the caller's account. -/
def clearInside (state : State) (scope : ScopeOccurrenceId) : State :=
  let inside := state.subtree scope
  let nested := inside.filter (· != scope)
  { state with
      tokens := state.tokens.filter (!inside.contains ·.scope)
      openItems := state.openItems.filter (!inside.contains ·.scope)
      scopes := state.scopes.filter (!nested.contains ·.id)
      variables := state.variables.filter (!nested.contains ·.scope)
      slots := { state.slots with parked := state.slots.parked.filter (!inside.contains ·.scope) } }

/-- Leave `scope`: clear it and remove the occurrence and its variables. -/
def leaveScope (state : State) (scope : ScopeOccurrenceId) : State :=
  let cleared := state.clearInside scope
  { cleared with
      scopes := cleared.scopes.filter (·.id != scope)
      variables := cleared.variables.filter (·.scope != scope) }

/-- Variables visible from `scope`, innermost first. -/
def visible (state : State) (scope : ScopeOccurrenceId) : List (String × Value) :=
  let rec go (fuel : Nat) (current : Option ScopeOccurrenceId) : List (String × Value) :=
    match fuel, current with
    | 0, _ | _, none => []
    | fuel + 1, some id =>
      let own := ((state.variables.find? (·.scope == id)).map (·.entries)).getD []
      own ++ go fuel ((state.scopes.find? (·.id == id)).bind (·.parent))
  go state.scopes.length (some scope)

/-- Write `name` in the innermost visible scope that declares it, else in `scope` itself. -/
def write (state : State) (scope : ScopeOccurrenceId) (name : String) (value : Value) : State :=
  let declares (id : ScopeOccurrenceId) :=
    ((state.variables.find? (·.scope == id)).map (·.entries.any (·.1 == name))).getD false
  let rec owner (fuel : Nat) (current : ScopeOccurrenceId) : ScopeOccurrenceId :=
    match fuel with
    | 0 => scope
    | fuel + 1 =>
      if declares current then current
      else match (state.scopes.find? (·.id == current)).bind (·.parent) with
        | some parent => owner fuel parent
        | none => scope
  let target := owner state.scopes.length scope
  let replace (entries : List (String × Value)) :=
    if entries.any (·.1 == name) then entries.map fun entry => if entry.1 == name then (name, value) else entry
    else entries ++ [(name, value)]
  if state.variables.any (·.scope == target) then
    { state with variables := state.variables.map fun vars =>
        if vars.scope == target then { vars with entries := replace vars.entries } else vars }
  else
    { state with variables := state.variables ++ [{ scope := target, entries := [(name, value)] }] }

end State

end Kernel
