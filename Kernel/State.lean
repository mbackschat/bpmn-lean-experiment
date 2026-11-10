module

public import Kernel.State.Raise

/-! # Kernel runtime state

Flat and identifier-indexed: scope occurrences refer to their parent by identifier, tokens sit on sequence flows,
every begun flow-node occurrence is one `Occurrence`, and every open interaction is one `OpenItem`. The top-level
shape is fixed; a feature keeps its own data in its slot of `FeatureSlots`, which is always present and empty by
default, so the state codec never varies by program.

Occurrences and activations are created and removed only here and in `Kernel.Step`; variables are written only
through `setVariable`, whose one caller is `Kernel.Feature.Data`; tokens are added only by `emit`, whose one caller is
`Kernel.Feature.Flow` (guard 17).
-/

public section

namespace Kernel

/-- Guarded type: `Kernel.Step` owns matching on it. Whom `Step` tells when an occurrence completes. -/
inductive Continuation where
  /-- Leave through the outgoing flows. -/
  | flow
  /-- One instance of the Multi-Instance body occurrence `body`. -/
  | multiInstance (body : Nat)
  /-- A compensation handler of the run in that scope occurrence. -/
  | compensation (run : ScopeOccurrenceId)
  deriving Repr

/-- Which counter numbers an occurrence: a Multi-Instance body and its instances number apart, as CIB gives the body
an activity id of its own (`BpmnParse:185`). -/
inductive ActivationRole where
  | element
  | multiInstanceBody
  deriving DecidableEq, Repr

/-- One flow-node occurrence, from its issue until it ends. `activation` counts the activations of `element` in its
process instance under `role`, from 1. `incoming` is the flow the token arrived on, `none` for an occurrence no token
began.

`begun = false` is a subscription's reservation: a boundary, Event Sub-Process start or Event-Based Gateway arm has a
published identity from the moment it is armed, but its flow node runs only when the trigger arrives (CIB declares
the subscription on the event scope and starts the activity instance on receipt, `BpmnParse:3288-3298`). A reservation
keeps nothing alive and never appears in the journal until it begins. -/
structure Occurrence where
  id : Nat
  element : ElementId
  scope : ScopeOccurrenceId
  activation : Nat
  role : ActivationRole := .element
  continuation : Continuation := .flow
  incoming : Option FlowId := none
  begun : Bool := true
  deriving Repr

/-- A scope occurrence: the process instance (`element = none`), one activation of a Scope element, the root of a
called process instance, whose `element` is the Call Activity and `calledInstance` the instance's identifier, a
Multi-Instance body or instance, the occurrence holding a compensation handler's restored context, or an Activity's
local variables (CIB-EXT-0015), which live as long as the Activity. `occurrence` is the flow-node occurrence it belongs
to, `none` for the process root, a Multi-Instance instance and a handler's context, which
`Kernel.Feature.MultiInstance` and `Kernel.Feature.Compensation` leave themselves. -/
structure ScopeOccurrence where
  id : ScopeOccurrenceId
  element : Option ElementId
  parent : Option ScopeOccurrenceId
  occurrence : Option Nat := none
  calledInstance : Option String := none
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

/-- One open interaction. `occurrence` is the occurrence it waits for, or a subscription's reservation; the public
identity is the occurrence's activation of `element`. `attachedTo` is the occurrence the subscription hangs on (the
boundary's host, the Event-Based Gateway of an arm). A `passive` item, such as an Event Sub-Process start
subscription, keeps no scope occurrence alive and is removed when its scope completes. -/
structure OpenItem where
  id : Nat
  kind : OpenKind
  element : ElementId
  scope : ScopeOccurrenceId
  occurrence : Nat
  attachedTo : Option Nat := none
  passive : Bool := false
  deriving Repr

inductive InstanceStatus where
  | running
  | completed
  | cancelled
  | failed
  deriving DecidableEq, Repr

/-- Where writes land (`Kernel.Feature.Data`). -/
inductive WriteRule where
  /-- The innermost scope that binds the name, else the instance root when its process declares the name; any other
  name follows `ProfileOptions.undeclaredWrite`. -/
  | outward
  /-- The writing scope's own variables, the rule of one Multi-Instance instance's output. -/
  | own
  deriving Repr

inductive WriteKind where
  | create
  | update
  | delete
  deriving DecidableEq, Repr

/-- Every write logs, same-value updates and entry writes included (PC-CONDITION-01, PC-CONDITION-04). -/
structure WriteEvent where
  scope : ScopeOccurrenceId
  name : String
  kind : WriteKind
  deriving Repr

/-- What fired a subscription. -/
inductive Fired where
  -- guard-exception(3): what a firing carried, handed to the one owner of `Trigger`; it adds no dispatch of its own.
  | timer (logicalTimeMs : Nat)
  | message (delivery : DeliveryInput)
  | signal (delivery : DeliveryInput)
  | condition (write : Option WriteEvent)
  deriving Repr

/-- What `Step.begin` starts: `reserved` names a subscription's reservation to begin instead of a fresh occurrence;
for an Event Sub-Process, `locals` are the new occurrence's extra locals and `inner` the reservation of its start
Event; `trigger` is what fired a start Event. -/
structure BeginRequest where
  element : ElementId
  scope : ScopeOccurrenceId
  continuation : Continuation := .flow
  incoming : Option FlowId := none
  reserved : Option Nat := none
  locals : List (String × Value) := []
  inner : Option Nat := none
  trigger : StartTrigger := .none
  deriving Repr

/-- Guarded type: `Kernel.Step` owns matching on it. The cross-feature protocol: a feature that needs another
feature's mechanism enqueues a signal, and `Step` hands it to the owning hook before any token moves. -/
inductive Signal where
  /-- Arm the boundaries of `element`, attached to the occurrence `host`, in `scope`. -/
  | arm (host : Nat) (element : ElementId) (scope : ScopeOccurrenceId)
  /-- Arm the Event Sub-Process starts of the scope occurrence `scope` (the process root included). -/
  | armScope (scope : ScopeOccurrenceId)
  /-- Arm the arms of the Event-Based Gateway occurrence `occurrence`, of `gateway`, reached in `scope`. -/
  | armGateway (occurrence : Nat) (gateway : ElementId) (scope : ScopeOccurrenceId)
  | raise (event : Raised) (origin : Origin)
  /-- Begin a flow-node occurrence without a token. -/
  | begin (request : BeginRequest)
  /-- The occurrence is done: `Step`'s one completion pipeline runs. -/
  | complete (occurrence : Nat) (leave : Leave) (writes : List (String × Value)) (rule : WriteRule)
  /-- Write without ending an occurrence: outputs passed by a non-interrupting Escalation, an external variable
  command (`EscalationHandler:60`, PC-SCOPE-06). -/
  | write (scope : ScopeOccurrenceId) (writes : List (String × Value)) (rule : WriteRule)
  /-- Delete variables, as seen from `scope`. -/
  | remove (scope : ScopeOccurrenceId) (names : List String)
  /-- Begin and complete a fresh occurrence of `element` at once: a boundary caught without a reservation, one firing
  of a subscription that stays open. -/
  | occur (element : ElementId) (scope : ScopeOccurrenceId) (leave : Leave) (writes : List (String × Value))
      (rule : WriteRule)
  /-- Cancel the occurrence wherever it stands. -/
  | cancel (occurrence : Nat)
  /-- Fire the open item, before anything queued behind this signal: a Signal's receivers run before its thrower leaves
  (`ThrowSignalEventActivityBehavior#execute`). -/
  | fire (item : Nat) (fired : Fired)
  /-- End the process instance with `status`, recording `failure`. -/
  | endInstance (status : InstanceStatus) (failure : Option InstanceFailure)
  /-- Run the compensation handlers retained in `scope` for `trigger`, those of `activity` when one is named; once all
  have completed, cancel the occurrence `leave` if any and go on as `resume` says. -/
  | compensate (scope : ScopeOccurrenceId) (activity : Option ElementId) (trigger : OccurrenceRef) (leave : Option Nat)
      (resume : Option Resume)
  /-- An Error left the compensation handler context `handler` uncaught. -/
  | compensationFailed (handler : ScopeOccurrenceId) (code : String) (message : Option String) (origin : Origin)
  deriving Repr

/-! ## The occurrence journal -/

/-- An occurrence's public key in the journal. -/
structure OccurrenceKey where
  processInstanceId : String
  element : ElementId
  activation : Nat
  role : ActivationRole := .element
  deriving DecidableEq, Repr

inductive Terminal where
  | completed
  | cancelled
  deriving DecidableEq, Repr

/-- What caused a micro-step. -/
inductive Cause where
  | input (tag : InputTag)
  | signal (name : String)
  | arrive (flow : FlowId)
  | idle (scope : ScopeOccurrenceId)
  deriving Repr

/-- An occurrence began: its key, its owning scope occurrence and its element's source type, which semantic publication
shows. -/
structure StartedFact where
  occurrence : OccurrenceKey
  owner : ScopeOccurrenceId
  sourceType : String
  deriving Repr

/-- One micro-step's occurrence facts. -/
structure Transition where
  cause : Cause
  element : Option ElementId
  owner : ScopeOccurrenceId
  started : List StartedFact := []
  ended : List (OccurrenceKey × Terminal) := []
  deriving Repr

/-- The facts of the micro-step in progress, which `Kernel.Step` turns into one `Transition`. `cancelled` holds the
occurrences cancelled, for `Hooks.cancelled` after the micro-step. -/
structure Draft where
  started : List StartedFact := []
  ended : List (OccurrenceKey × Terminal) := []
  cancelled : List Occurrence := []
  deriving Repr

/-- One activation counter (R8: per process instance, element and role). -/
structure ActivationCount where
  processInstance : String
  element : ElementId
  role : ActivationRole
  count : Nat
  deriving Repr

/-- A Signal thrown to the population, which the host publishes after the input commits (PC-SIGNAL-01, PC-SIGNAL-04). -/
structure BroadcastIntent where
  name : String
  variables : List (String × Value) := []
  businessKey : Option String := none
  origin : OccurrenceRef
  deriving Repr

structure State where
  instanceId : String
  status : InstanceStatus := .running
  scopes : List ScopeOccurrence := []
  occurrences : List Occurrence := []
  tokens : List Token := []
  variables : List ScopeVariables := []
  openItems : List OpenItem := []
  activations : List ActivationCount := []
  nextIssue : Nat := 1
  logicalTimeMs : Nat := 0
  signals : List Signal := []
  /-- Every variable write since the last drain, same-value writes included: `Step` hands them to `Hooks.written`. -/
  writes : List WriteEvent := []
  outbox : List BroadcastIntent := []
  slots : FeatureSlots := {}
  /-- Present exactly when `status` is `failed`. -/
  failure : Option InstanceFailure := none
  /-- The occurrence facts of the input in progress; `Step.step` empties it first. -/
  journal : List Transition := []
  draft : Draft := {}

/-- Why a step does not commit. Harness failures never appear here. `rolledBack` is a command whose closure could
not continue (no outgoing flow to take): it ends the run with the state before the command. -/
inductive Failure where
  | rejected (code : String)
  | rolledBack (code : String)
  | semanticFailure (code : String)
  | unsupported (code : String)
  deriving DecidableEq, Repr

abbrev Outcome := Except Failure State

namespace State

def root : ScopeOccurrenceId := ⟨0⟩

/-- A fresh process instance: one root scope occurrence with the given variables. -/
def initial (instanceId : String) (variables : List (String × Value)) (businessKey : Option String := none) : State :=
  { instanceId
    scopes := [{ id := root, element := none, parent := none }]
    variables := [{ scope := root, entries := variables }]
    slots := { instances := [{ root, businessKey }] } }

def emit (state : State) (flows : List FlowId) (scope : ScopeOccurrenceId) : State :=
  { state with tokens := state.tokens ++ flows.map fun flow => { flow, scope } }

def issue (state : State) : State × Nat :=
  ({ state with nextIssue := state.nextIssue + 1 }, state.nextIssue)

def signal (state : State) (signal : Signal) : State :=
  { state with signals := state.signals ++ [signal] }

/-- Whether `scope` is the root of a called process instance, which hides its caller's variables. -/
def calledRoot (state : State) (scope : ScopeOccurrenceId) : Bool :=
  ((state.scopes.find? (·.id == scope)).bind (·.calledInstance)).isSome

/-- The root of the process instance `scope` belongs to: the nearest called-instance root, else the process root. -/
def instanceRoot (state : State) (scope : ScopeOccurrenceId) : ScopeOccurrenceId :=
  let rec go (fuel : Nat) (current : ScopeOccurrenceId) : ScopeOccurrenceId :=
    match fuel with
    | 0 => root
    | fuel + 1 =>
      if state.calledRoot current then current
      else match (state.scopes.find? (·.id == current)).bind (·.parent) with
        | some parent => go fuel parent
        | none => root
  go state.scopes.length scope

/-- The scope occurrences in which something remains: a token, an open item that keeps it alive, a begun occurrence, a
child scope occurrence or a feature slot entry, in one pass over the state. -/
def busyScopes (state : State) : List ScopeOccurrenceId :=
  state.tokens.map (·.scope) ++ (state.openItems.filter fun item => !item.passive).map (·.scope) ++
    (state.occurrences.filter (·.begun)).map (·.scope) ++ state.scopes.filterMap (·.parent) ++ state.slots.keptAlive

/-- Whether nothing remains in `scope`: no token, no open item that keeps it alive, no begun occurrence, no child
scope occurrence and no feature slot entry. -/
def idle (state : State) (scope : ScopeOccurrenceId) : Bool :=
  !state.busyScopes.contains scope

/-- The entries a micro-step's scans run over: tokens, occurrences, open items, scope occurrences and queued signals.
`Step.closureWorkBound` sums it over a closure's micro-steps. -/
def entryCount (state : State) : Nat :=
  state.tokens.length + state.occurrences.length + state.openItems.length + state.scopes.length + state.signals.length

/-- The process instance identifier of `scope`. -/
def instanceOf (state : State) (scope : ScopeOccurrenceId) : String :=
  ((state.scopes.find? (·.id == state.instanceRoot scope)).bind (·.calledInstance)).getD state.instanceId

/-- The next activation of `element` under `role` in `processInstance`, recorded (R8: per process instance). -/
def activate (state : State) (processInstance : String) (element : ElementId) (role : ActivationRole) : State × Nat :=
  let key (entry : ActivationCount) :=
    entry.processInstance == processInstance && entry.element == element && entry.role == role
  let count := ((state.activations.find? key).map (·.count)).getD 0 + 1
  ({ state with activations := { processInstance, element, role, count } :: state.activations.filter (!key ·) }, count)

/-- A reservation for `element` in `scope`: issued and numbered now, begun only when its trigger arrives. -/
def reserve (state : State) (element : ElementId) (scope : ScopeOccurrenceId) : State × Occurrence :=
  let (state, activation) := state.activate (state.instanceOf scope) element .element
  let (state, id) := state.issue
  let occurrence : Occurrence := { id, element, scope, activation, begun := false }
  ({ state with occurrences := state.occurrences ++ [occurrence] }, occurrence)

def occurrence? (state : State) (id : Nat) : Option Occurrence :=
  state.occurrences.find? (·.id == id)

/-- The public key of an occurrence. -/
def keyOf (state : State) (occurrence : Occurrence) : OccurrenceKey :=
  { processInstanceId := state.instanceOf occurrence.scope, element := occurrence.element
    activation := occurrence.activation, role := occurrence.role }

/-- The journal fact that `occurrence` started, at the moment it begins. -/
private def recordStart (state : State) (occurrence : Occurrence) (sourceType : String) : State :=
  { state with draft := { state.draft with
      started := state.draft.started ++ [{ occurrence := state.keyOf occurrence, owner := occurrence.scope, sourceType }] } }

/-- The journal fact that `occurrence` ended. -/
def recordEnd (state : State) (key : OccurrenceKey) (terminal : Terminal) : State :=
  { state with draft := { state.draft with ended := state.draft.ended ++ [(key, terminal)] } }

/-- Begin what `request` names: its reservation, placed in the request's scope, or a fresh occurrence numbered under
`role`. A reservation keeps its activation, so an armed subscription's number is its occurrence's number. -/
def beginOccurrence (state : State) (request : BeginRequest) (role : ActivationRole) (sourceType : String) :
    State × Occurrence :=
  let reservedOccurrence := request.reserved.bind state.occurrence?
  let (state, occurrence) :=
    match reservedOccurrence with
    | some reserved => (state, reserved)
    | none =>
      let (state, activation) := state.activate (state.instanceOf request.scope) request.element role
      let (state, id) := state.issue
      (state, ({ id, element := request.element, scope := request.scope, activation, role } : Occurrence))
  let begun : Occurrence := { occurrence with
    scope := request.scope, continuation := request.continuation, incoming := request.incoming, begun := true }
  let others := state.occurrences.filter (·.id != begun.id)
  (recordStart { state with occurrences := others ++ [begun] } begun sourceType, begun)

/-- Start a reservation's occurrence where it stands: the journal fact only. -/
def startReserved (state : State) (occurrence : Occurrence) (sourceType : String) : State × Occurrence :=
  if occurrence.begun then (state, occurrence)
  else
    let begun : Occurrence := { occurrence with begun := true }
    (recordStart { state with occurrences := state.occurrences.map fun other =>
      if other.id == begun.id then begun else other } begun sourceType, begun)

/-- An item waiting for the begun `occurrence`. -/
def openItem (state : State) (kind : OpenKind) (occurrence : Occurrence) : State :=
  let (state, id) := state.issue
  { state with openItems := state.openItems ++
      [{ id, kind, element := occurrence.element, scope := occurrence.scope, occurrence := occurrence.id }] }

/-- A subscription item for `element`, with a fresh reservation; `host` is the occurrence it hangs on. -/
def openSubscription (state : State) (kind : OpenKind) (element : ElementId) (scope : ScopeOccurrenceId)
    (host : Option Nat) (passive : Bool) : State × OpenItem :=
  let (state, occurrence) := state.reserve element scope
  let (state, id) := state.issue
  let item : OpenItem := { id, kind, element, scope, occurrence := occurrence.id, attachedTo := host, passive }
  ({ state with openItems := state.openItems ++ [item] }, item)

def closeItem (state : State) (id : Nat) : State :=
  { state with openItems := state.openItems.filter (·.id != id) }

/-- Remove the items waiting for the occurrence `id`. -/
def closeOwnItems (state : State) (id : Nat) : State :=
  { state with openItems := state.openItems.filter (·.occurrence != id) }

/-- Remove the items attached to the occurrence `host`, with the reservations they hold. -/
def disarm (state : State) (host : Nat) : State :=
  let attached := state.openItems.filter (·.attachedTo == some host)
  { state with
      openItems := state.openItems.filter (·.attachedTo != some host)
      occurrences := state.occurrences.filter fun occurrence =>
        occurrence.begun || !attached.any (·.occurrence == occurrence.id) }

/-- Enter a new scope occurrence of `element` inside `parent`, with the given local variables. The scope belongs to
`occurrence`, when it has one. -/
def enterScope (state : State) (element : ElementId) (parent : ScopeOccurrenceId)
    (locals : List (String × Value)) (occurrence : Option Nat) : State × ScopeOccurrenceId :=
  let (state, issued) := state.issue
  let id : ScopeOccurrenceId := ⟨issued⟩
  ({ state with
      scopes := state.scopes ++ [{ id, element := some element, parent := some parent, occurrence }]
      variables := state.variables ++ [{ scope := id, entries := locals }] }, id)

/-- The identifier of the process instance a Call Activity's `activation` calls from the instance `caller`: each
part prefixed by its UTF-8 byte length, so that nested identifiers never collide. -/
def calledInstanceId (caller : String) (call : ElementId) (activation : Nat) : String :=
  s!"call:{caller.utf8ByteSize}:{caller}:{call.value.utf8ByteSize}:{call.value}:{activation}"

/-- Enter the called process instance of the Call occurrence `call`, with the given variables: a scope occurrence
that is the called instance's root, recording the definition the Call bound for this instance. -/
def enterCalled (state : State) (call : Occurrence) (variables : List (String × Value)) (definition : DefinitionRef) :
    State × ScopeOccurrenceId :=
  let caller := state.instanceOf call.scope
  let (state, id) := state.enterScope call.element call.scope variables (some call.id)
  ({ state with
      scopes := state.scopes.map fun occurrence =>
        if occurrence.id == id then
          { occurrence with calledInstance := some (calledInstanceId caller call.element call.activation) }
        else occurrence
      slots := { state.slots with instances := state.slots.instances ++ [{ root := id, definition := some definition }] } }, id)

/-- The elements the scope occurrence `scope` declares: for a called root, the process-level elements of the process its
Call bound (its `slots.instances` entry), not the Call Activity's, since a called Process behaves as a normal Process
(BPMN 2.0.2 §13.3.4); otherwise the children of its element. -/
def childrenOf (state : State) (program : Program) (scope : ScopeOccurrenceId) : List Element :=
  let occurrence := state.scopes.find? (·.id == scope)
  let bound := (state.slots.instances.find? (·.root == scope)).bind (·.definition)
  match occurrence.bind (·.calledInstance), bound with
  | some _, some definition =>
    ((program.processes.find? (·.definition == definition)).map program.processChildren).getD []
  | _, _ => program.children (occurrence.bind (·.element))

/-- The scope occurrences inside `scope`, transitively, including `scope`, the deepest last. -/
def subtree (state : State) (scope : ScopeOccurrenceId) : List ScopeOccurrenceId :=
  let rec go (fuel : Nat) (frontier : List ScopeOccurrenceId) (seen : List ScopeOccurrenceId) :
      List ScopeOccurrenceId :=
    match fuel, frontier with
    | 0, _ | _, [] => seen
    | fuel + 1, next :: rest =>
      let children := (state.scopes.filter (·.parent == some next)).map (·.id)
      go fuel (rest ++ children) (seen ++ [next])
  go (state.scopes.length + 1) [scope] []

/-- The journal facts of removing the begun `occurrences`, cancelled. -/
private def recordCancelled (state : State) (occurrences : List Occurrence) : State :=
  let begun := occurrences.filter (·.begun)
  let ended := begun.map fun occurrence => (state.keyOf occurrence, Terminal.cancelled)
  { state with draft := { state.draft with
      ended := state.draft.ended ++ ended, cancelled := state.draft.cancelled ++ begun } }

/-- Remove every token, item, occurrence, slot entry, variable set and child scope occurrence inside `scope`, keeping
`scope` itself and the occurrences `keep` names. Each begun occurrence is journalled cancelled, deepest scope first,
then by id; `Hooks.cancelled` tells the owning features afterwards. -/
def clearInside (state : State) (scope : ScopeOccurrenceId) (keep : List Nat := []) : State :=
  let inside := state.subtree scope
  let nested := inside.filter (· != scope)
  let removed := inside.reverse.flatMap fun current =>
    state.occurrences.filter fun occurrence => occurrence.scope == current && !keep.contains occurrence.id
  let journalled := recordCancelled state removed
  { journalled with
      tokens := journalled.tokens.filter (!inside.contains ·.scope)
      openItems := journalled.openItems.filter fun item => !inside.contains item.scope || keep.contains item.occurrence
      occurrences := journalled.occurrences.filter fun occurrence => !inside.contains occurrence.scope || keep.contains occurrence.id
      scopes := journalled.scopes.filter (!nested.contains ·.id)
      variables := journalled.variables.filter (!nested.contains ·.scope)
      slots := journalled.slots.clear inside nested }

/-- Leave `scope`: clear it and remove the occurrence, its variables and the compensation records it retains, so the
Activities completed in a Sub-Process left before its own completion are never compensated: compensation is for
completed Activities only ([BPMN 2.0.2 §13.5.5](../docs/reference/bpmn-2.0.2/README.md), "presumed abort"). -/
def leaveScope (state : State) (scope : ScopeOccurrenceId) : State :=
  let cleared := state.clearInside scope
  { cleared with
      scopes := cleared.scopes.filter (·.id != scope)
      variables := cleared.variables.filter (·.scope != scope)
      slots := { cleared.slots with compensation := { cleared.slots.compensation with
        retained := cleared.slots.compensation.retained.filter (·.scope != scope) } } }

/-- Remove the occurrence record `id` and the scope occurrences it owns, if any. The record goes first, so that
leaving a scope does not cancel the occurrence that owns it. -/
def removeOccurrence (state : State) (id : Nat) : State :=
  let removed := { state with occurrences := state.occurrences.filter (·.id != id) }
  (removed.scopes.filter (·.occurrence == some id)).foldl (fun state scope => state.leaveScope scope.id) removed

/-- Cancel the occurrence `id` wherever it stands: its items and subscriptions go, the scope occurrence it owns is
left, and it is journalled cancelled. -/
def cancelOccurrence (state : State) (id : Nat) : State :=
  match state.occurrence? id with
  | none => state
  | some occurrence =>
    let closed := (state.closeOwnItems id).disarm id
    (recordCancelled (closed.removeOccurrence id) [occurrence])

/-- Whether `scope` would be idle once the occurrence `id`, its items, what is attached to it and the scope occurrence
it owns were gone: nothing else remains there. -/
def idleWithout (state : State) (scope : ScopeOccurrenceId) (id : Nat) : Bool :=
  (((state.closeOwnItems id).disarm id).removeOccurrence id).idle scope

/-- Variables visible from `scope`, innermost first, up to the root of its process instance. -/
def visible (state : State) (scope : ScopeOccurrenceId) : List (String × Value) :=
  let rec go (fuel : Nat) (current : Option ScopeOccurrenceId) : List (String × Value) :=
    match fuel, current with
    | 0, _ | _, none => []
    | fuel + 1, some id =>
      let own := ((state.variables.find? (·.scope == id)).map (·.entries)).getD []
      if state.calledRoot id then own else own ++ go fuel ((state.scopes.find? (·.id == id)).bind (·.parent))
  go state.scopes.length (some scope)

/-- The innermost scope visible from `scope` that declares `name`, up to the root of its process instance. -/
def owner? (state : State) (scope : ScopeOccurrenceId) (name : String) : Option ScopeOccurrenceId :=
  let declares (id : ScopeOccurrenceId) :=
    ((state.variables.find? (·.scope == id)).map (·.entries.any (·.1 == name))).getD false
  let rec go (fuel : Nat) (current : ScopeOccurrenceId) : Option ScopeOccurrenceId :=
    match fuel with
    | 0 => none
    | fuel + 1 =>
      if declares current then some current
      else if state.calledRoot current then none
      else ((state.scopes.find? (·.id == current)).bind (·.parent)).bind (go fuel)
  go state.scopes.length scope

/-- Set `name` in `target`'s own variables and log the write. -/
def setVariable (state : State) (target : ScopeOccurrenceId) (name : String) (value : Value) : State :=
  let replace (entries : List (String × Value)) :=
    if entries.any (·.1 == name) then entries.map fun entry => if entry.1 == name then (name, value) else entry
    else entries ++ [(name, value)]
  let kind : WriteKind :=
    if ((state.variables.find? (·.scope == target)).map (·.entries.any (·.1 == name))).getD false then .update
    else .create
  let written := { state with writes := state.writes ++ [({ scope := target, name, kind } : WriteEvent)] }
  if written.variables.any (·.scope == target) then
    { written with variables := written.variables.map fun vars =>
        if vars.scope == target then { vars with entries := replace vars.entries } else vars }
  else
    { written with variables := written.variables ++ [{ scope := target, entries := [(name, value)] }] }

/-- Delete `name` from `target`'s own variables and log the deletion. -/
def removeVariable (state : State) (target : ScopeOccurrenceId) (name : String) : State :=
  { state with
      writes := state.writes ++ [({ scope := target, name, kind := .delete } : WriteEvent)]
      variables := state.variables.map fun vars =>
        if vars.scope == target then { vars with entries := vars.entries.filter (·.1 != name) } else vars }

end State

end Kernel
