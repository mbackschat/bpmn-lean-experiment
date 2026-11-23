module

public import Kernel.State.Issue
public import Kernel.State.Items
public import Kernel.State.Journal
public import Kernel.State.Failure

/-! # Kernel runtime state

Flat and identifier-indexed: scope occurrences refer to their parent by identifier, tokens sit on sequence flows,
every begun flow-node occurrence is one `Occurrence`, and every open interaction is one `OpenItem`. The top-level
shape is fixed; a feature keeps its own data in its slot of `FeatureSlots`, which is always present and empty by
default, so the state codec never varies by program.

Occurrences and activations are created and removed only here, in `Kernel.State.Removal` and in `Kernel.Step`; variables are written only
through `Kernel.State.Variables`' `setVariable`, whose one caller is `Kernel.Feature.Data`; flow tokens are added only by `emit`, whose one caller
is `Kernel.Feature.Flow`, and deferred begins only by `deferBegins`, whose one caller is `Kernel.Feature.MultiInstance`
(guard 17).
-/

public section

namespace Kernel

/-- Guarded type: `Kernel.Step` owns matching on it. Whom `Step` tells when an occurrence completes. -/
inductive Continuation where
  /-- Leave through the outgoing flows. -/
  | flow
  /-- One instance of the Multi-Instance body occurrence `body`. -/
  | multiInstance (body : OccurrenceId)
  /-- A compensation handler of the run in that scope occurrence. -/
  | compensation (run : ScopeOccurrenceId)
  deriving Repr

/-- One flow-node occurrence, from its issue until it ends. `activation` counts the activations of `element` in its
process instance under `role`, from 1. `incoming` is the flow the token arrived on, `none` for an occurrence no token
began.

`begun = false` is a subscription's reservation: a boundary, Event Sub-Process start or Event-Based Gateway arm has a
published identity from the moment it is armed, but its flow node runs only when the trigger arrives (CIB declares
the subscription on the event scope and starts the activity instance on receipt, `BpmnParse:3288-3298`). A reservation
keeps nothing alive and never appears in the journal until it begins. -/
structure Occurrence where
  id : OccurrenceId
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
`Kernel.Feature.MultiInstance` and `Kernel.Feature.Compensation` leave themselves. Its parent is its key's
(`ScopeOccurrence.parent`), so no record can name another. -/
structure ScopeOccurrence where
  id : ScopeOccurrenceId
  element : Option ElementId
  occurrence : Option OccurrenceId := none
  calledInstance : Option String := none
  deriving Repr

/-- The scope occurrence `scope` was entered in, read from its key; `none` for the root. -/
abbrev ScopeOccurrence.parent (scope : ScopeOccurrence) : Option ScopeOccurrenceId := scope.id.parent?

structure ScopeVariables where
  scope : ScopeOccurrenceId
  entries : List (String × Value)
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

/-- Every write logs, same-value updates and entry writes included (PC-CONDITION-01, PC-CONDITION-04). -/
structure WriteEvent where
  scope : ScopeOccurrenceId
  name : String
  kind : VariableEvent
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
for an Event Sub-Process, `writes` are the values the start writes outward from the new occurrence (mapped Data Outputs,
then delivered variables; `Step.writeStart`) and `inner` the reservation of its start Event; `trigger` is what fired a
start Event. -/
structure BeginRequest where
  element : ElementId
  scope : ScopeOccurrenceId
  continuation : Continuation := .flow
  incoming : Option FlowId := none
  reserved : Option OccurrenceId := none
  writes : List (String × Value) := []
  inner : Option OccurrenceId := none
  trigger : StartTrigger := .none
  deriving Repr

/-- One entry of a closure's queued work (`State.queuedTokens`, `State.batchTokens`), which `Kernel.Step` owns matching on: a
token on a sequence flow inside a scope occurrence, or a deferred begin, the request of a `begin` signal queued as a
token, which `Kernel.Step` dispatches as that signal, with its journal cause, when the closure reaches it. -/
inductive Token where
  | flow (flow : FlowId) (scope : ScopeOccurrenceId)
  | begin (request : BeginRequest)
  deriving Repr

/-- The scope occurrence an entry keeps busy: a flow token's own, a deferred begin's the one its request begins in. -/
def Token.busyScope : Token → ScopeOccurrenceId
  | .flow _ scope => scope
  | .begin request => request.scope

/-- The flow a token arrives on; a deferred begin arrives on none. -/
def Token.arrivalFlow? : Token → Option FlowId
  | .flow sequenceFlow _ => some sequenceFlow
  | .begin _ => none

/-- Guarded type: `Kernel.Step` owns matching on it. The cross-feature protocol: a feature that needs another
feature's mechanism enqueues a signal, and `Step` hands it to the owning hook before any token moves. -/
inductive Signal where
  /-- Arm the boundaries of `element`, attached to the occurrence `host`, in `scope`. -/
  | arm (host : OccurrenceId) (element : ElementId) (scope : ScopeOccurrenceId)
  /-- Arm the Event Sub-Process starts of the scope occurrence `scope` (the process root included). -/
  | armScope (scope : ScopeOccurrenceId)
  /-- Arm the arms of the Event-Based Gateway occurrence `occurrence`, of `gateway`, reached in `scope`. -/
  | armGateway (occurrence : OccurrenceId) (gateway : ElementId) (scope : ScopeOccurrenceId)
  | raise (event : Raised) (origin : Origin)
  /-- Begin a flow-node occurrence without a token. -/
  | begin (request : BeginRequest)
  /-- The occurrence is done: `Step`'s one completion pipeline runs. -/
  | complete (occurrence : OccurrenceId) (leave : Leave) (writes : List (String × Value)) (rule : WriteRule)
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
  | cancel (occurrence : OccurrenceId)
  /-- Fire the open item, before anything queued behind this signal: a Signal's receivers run before its thrower leaves
  (`ThrowSignalEventActivityBehavior#execute`). -/
  | fire (item : ItemKey) (fired : Fired)
  /-- End the process instance with `status`, recording `failure`. -/
  | endInstance (status : InstanceStatus) (failure : Option InstanceFailure)
  /-- Run the compensation handlers retained in `scope` for `trigger`, those of `activity` when one is named; once all
  have completed, cancel the occurrence `leave` if any and go on as `resume` says. -/
  | compensate (scope : ScopeOccurrenceId) (activity : Option ElementId) (trigger : OccurrenceRef) (leave : Option OccurrenceId)
      (resume : Option Resume)
  /-- An Error left the compensation handler context `handler` uncaught. -/
  | compensationFailed (handler : ScopeOccurrenceId) (code : String) (message : Option String) (origin : Origin)
  deriving Repr

/-! ## The occurrence journal -/

/-- The facts of the micro-step in progress, which `Kernel.Step` turns into one `Transition`. `cancelled` holds the
occurrences cancelled, for `Hooks.cancelled` after the micro-step. -/
structure Draft where
  started : List StartedFact := []
  ended : List (OccurrenceKey × Terminal) := []
  cancelled : List Occurrence := []
  ready : List OccurrenceKey := []
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
  address : SignalAddress
  variables : List (String × Value) := []
  businessKey : Option String := none
  origin : OccurrenceRef
  deriving Repr

structure State where
  instanceId : String
  status : InstanceStatus := .running
  scopes : List ScopeOccurrence := []
  occurrences : List Occurrence := []
  /-- The running micro-step's batch: the tokens it queued, in the order it queued them; `Step.conclude` moves them into
  `queuedTokens` under the micro-step's unit key (`queueBatch`), so this is empty between micro-steps (DC4). Named for
  the batch, so no read can take it for the closure's queue, which `queuedTokens` holds (`allTokens` reads both). -/
  batchTokens : List Token := []
  /-- The closure's queued tokens, each keyed by the unit that queued it and its index in that unit's batch: content, with
  no order of entry. Which runs next is `Step.nextToken`'s, through the run log; empty at commit (DC4). -/
  queuedTokens : TreeMap UnitKey Token compare := ∅
  variables : List ScopeVariables := []
  openItems : OpenItems := ∅
  /-- The next item ordinal of each occurrence that opened an item, advanced at commit (DC12) and pruned with the
  occurrence (KD1). -/
  itemOrdinals : TreeMap OccurrenceId Nat compare := ∅
  /-- The next ordinal of each element in each scope occurrence that entered one, advanced at commit (DC12) and pruned
  with the scope occurrence (KD1). -/
  scopeOrdinals : TreeMap ScopeSlot Nat compare := ∅
  /-- The next ordinal of each element in each scope occurrence that issued an occurrence of it, advanced at commit (DC12)
  and pruned with the scope occurrence (KD1). -/
  occurrenceOrdinals : TreeMap ScopeSlot Nat compare := ∅
  /-- The running micro-step's unit, whose issues are `Issue.fresh issuing n`, and the index of its next issue (DC12):
  set when a micro-step begins (`Step.microStep`; `Step.reoffer?` for an offer it computes first) and reset when it
  concludes, so between micro-steps they read the seed's key, which no micro-step runs under, and 0. -/
  issuing : UnitKey := .ofRoot .seed
  issueNext : Nat := 0
  /-- Every identity issued in the closure in progress, with the slot it takes its committed ordinal in: written at issue,
  emptied by the commit's compaction, which renames each to its ordinal (`Step.compact`, DC12). Empty at commit. -/
  issued : TreeMap Issue ClaimSlot compare := ∅
  activations : List ActivationCount := []
  /-- The next compensation completion number (`takeCompletion`), taken in run order as a record completes, which only the
  sites that order records read. -/
  nextCompletion : Nat := 1
  /-- The counter of issued order positions (DC13): an open item's `position` is the running unit's issue in the
  position slot (`issuePosition`), numbered from here at commit in the closure's position order (`ClaimSlot.position`),
  which advances it. -/
  nextOrder : Nat := 1
  logicalTimeMs : Nat := 0
  /-- The running micro-step's batch of signals, in the order it queued them; moved into `queuedSignals` like
  `batchTokens`, and named for the batch like it. -/
  batchSignals : List Signal := []
  /-- The closure's queued signal batches, one per micro-step, each signal keyed like a queued token, so a batch keeps
  its order in its index segment (DC2, DC10); the closure runs them in breadth-first key order (`UnitKey.breadth`).
  Empty at commit (DC4). -/
  queuedSignals : TreeMap UnitKey Signal compare := ∅
  /-- Every variable write since the last drain, same-value writes included: `Step` hands them to `Hooks.written`. -/
  writes : List WriteEvent := []
  /-- The running micro-step's broadcast intents, in the order it made them; moved into `outboxes` like `batchTokens`, and
  named for the batch like it. -/
  batchIntents : List BroadcastIntent := []
  /-- The intents of the closure's micro-steps, keyed by the unit that made each batch; empty at commit (DC4). -/
  outboxes : TreeMap UnitKey (List BroadcastIntent) compare := ∅
  slots : FeatureSlots := {}
  /-- Present exactly when `status` is `failed`. -/
  failure : Option InstanceFailure := none
  /-- The occurrence facts of a committed input, its transitions in run order (`Step.orderJournal`); empty while the
  closure runs. -/
  journal : List Transition := []
  /-- A committed input's broadcast intents in run order (`Step.orderJournal`), which a host publishes as the input's own;
  empty while the closure runs. -/
  intents : List BroadcastIntent := []
  /-- The transitions of the closure in progress, each keyed by the unit that ran it: content, ordered into `journal` by
  the run log at commit, then emptied (DC4). -/
  transitions : TreeMap UnitKey Transition compare := ∅
  draft : Draft := {}

/-- Whether the input in progress has crossed a transaction boundary: begun an occurrence marked `asyncBefore`, or
completed one marked `asyncAfter`, in a transition of the closure or the micro-step's draft. The kernel's one reader of
the marks. -/
def crossed (program : Program) (state : State) : Bool :=
  let marked (started : List StartedFact) (ended : List (OccurrenceKey × Terminal)) :=
    started.any (fun fact => (marks program fact.occurrence).1) ||
      ended.any fun (key, terminal) => terminal == .completed && (marks program key).2
  state.transitions.any (fun _ transition => marked transition.started transition.ended) ||
    marked state.draft.started state.draft.ended

abbrev Outcome := Except Failure State

/-- `bindings` with only the last binding of each name, where that binding stands: a variable set holds one value per
name, as a Data Association's copy replaces its target's value (BPMN 2.0.2 §10.4.2) and CIB keys a scope's variables by
name (`VariableStore.java:39`), so a name bound twice keeps the value bound last (#147). -/
def keyed (bindings : List (String × Value)) : List (String × Value) :=
  bindings.foldr (fun binding kept => if kept.any (·.1 == binding.1) then kept else binding :: kept) []

namespace State

def root : ScopeOccurrenceId := .ofSegments []

/-- A fresh process instance: one root scope occurrence with the given variables, `keyed`. -/
def initial (instanceId : String) (variables : List (String × Value)) (businessKey : Option String := none) : State :=
  { instanceId
    scopes := [{ id := root, element := none }]
    variables := [{ scope := root, entries := keyed variables }]
    slots := { instances := [{ root, businessKey }] } }

def emit (state : State) (flows : List FlowId) (scope : ScopeOccurrenceId) : State :=
  { state with batchTokens := state.batchTokens ++ flows.map (Token.flow · scope) }

/-- Defer the begins `requests` onto the work stack, the first on top: above every token queued before them, so under
`declarationDepthFirst` each begins, and runs to its next wait, join or end, before the next. -/
def deferBegins (state : State) (requests : List BeginRequest) : State :=
  { state with batchTokens := state.batchTokens ++ (requests.map Token.begin).reverse }

/-- The next compensation completion number (`nextCompletion`), counted up in run order. -/
def takeCompletion (state : State) : State × Nat :=
  ({ state with nextCompletion := state.nextCompletion + 1 }, state.nextCompletion)

/-- The one issuer of every identity inside a closure (DC12): the running unit's next issue, recorded in the issue table
with the slot it takes its committed ordinal in at commit. -/
def issue (state : State) (slot : ClaimSlot) : State × Issue :=
  let issue := Issue.fresh state.issuing state.issueNext
  ({ state with issueNext := state.issueNext + 1, issued := state.issued.insert issue slot }, issue)

/-- A fresh order position (DC13): the running unit's next issue in the position slot, which the commit numbers from
`nextOrder` in the closure's position order. -/
def issuePosition (state : State) : State × Issue := state.issue .position

/-- A fresh key for an occurrence of `element` issued in `scope`: the running unit's next issue, which the commit renames
to the next ordinal of its (scope occurrence, element) counter. The one issuer of occurrence keys (KD1, DC12). -/
def issueOccurrence (state : State) (scope : ScopeOccurrenceId) (element : ElementId) : State × OccurrenceId :=
  let (state, ordinal) := state.issue (.occurrence { parent := scope, element })
  (state, { scope, element, ordinal })

def signal (state : State) (signal : Signal) : State :=
  { state with batchSignals := state.batchSignals ++ [signal] }

/-- Every queued token: the closure's queued content and the running micro-step's batch. A membership view, read only
as a multiset (`busyScopes`, `Feature.Flow.positions`, `Feature.Propagation.busyCalledRoot`): its order is the map's key
order, which is no order of entry (KD7). -/
def allTokens (state : State) : List Token :=
  state.queuedTokens.toList.map (·.2) ++ state.batchTokens

/-- Move the running micro-step's batches under its unit key `unit` (DC4): each signal and token keyed by its index in
the batch (`UnitKey.signalUnit`, `UnitKey.tokenUnit`), the micro-step's intents as one entry, so every writer keeps appending to
the running batch and the feature layer never sees a key. -/
def queueBatch (state : State) (unit : UnitKey) : State :=
  { state with
      queuedSignals := state.batchSignals.zipIdx.foldl (fun queued (signal, index) => queued.insert (unit.signalUnit index) signal)
        state.queuedSignals
      queuedTokens := state.batchTokens.zipIdx.foldl (fun queued (token, index) => queued.insert (unit.tokenUnit index) token)
        state.queuedTokens
      outboxes := if state.batchIntents.isEmpty then state.outboxes else state.outboxes.insert unit state.batchIntents
      batchSignals := [], batchTokens := [], batchIntents := [] }

/-- Whether `scope` is the root of a called process instance, which hides its caller's variables. -/
def calledRoot (state : State) (scope : ScopeOccurrenceId) : Bool :=
  ((state.scopes.find? (·.id == scope)).bind (·.calledInstance)).isSome

/-- The local or child scope occurrence an occurrence `host` owns, when its inputs or its Scope gave it one. A called
instance's root belongs to the callee and is never the host's own. -/
def localScope? (state : State) (host : OccurrenceId) : Option ScopeOccurrenceId :=
  (state.scopes.find? fun own => own.occurrence == some host && own.calledInstance.isNone).map (·.id)

/-- The scope occurrence an occurrence `host` reads from and writes outward from: its own scope (`localScope?`), so its
input-mapped locals are visible (`PvmExecutionImpl.java:1304-1318`), otherwise `scope`, the enclosing one. -/
def ownScope (state : State) (host : OccurrenceId) (scope : ScopeOccurrenceId) : ScopeOccurrenceId :=
  (state.localScope? host).getD scope

/-- Whether the scope occurrence `scope` stands. -/
def stands (state : State) (scope : ScopeOccurrenceId) : Bool :=
  state.scopes.any (·.id == scope)

/-- The root of the process instance `scope` belongs to: the nearest called-instance root, else the process root. The
search climbs `scope`'s key while its scope occurrences stand. -/
def instanceRoot (state : State) (scope : ScopeOccurrenceId) : ScopeOccurrenceId :=
  let rec go : (segments : List ScopeSegment) → (scope : ScopeOccurrenceId) → scope.segments = segments → ScopeOccurrenceId
    | [], _, _ => root
    | _ :: rest, scope, segments =>
      if state.calledRoot scope then scope
      else if state.stands scope then go rest (scope.up segments) rfl
      else root
  go scope.segments scope rfl

/-- The scope occurrences in which something remains: a queued token, an open item that keeps it alive, a begun
occurrence, a child scope occurrence or a feature slot entry, in one pass over the state. The queued signals that keep a
scope occurrence busy are `Step.idleScope?`'s, which alone builds a signal's work (DC5). -/
def busyScopes (state : State) : List ScopeOccurrenceId :=
  state.allTokens.map (·.busyScope) ++ ((itemList state.openItems).filter fun item => !item.passive).map (·.scope) ++
    (state.occurrences.filter (·.begun)).map (·.scope) ++ state.scopes.filterMap (·.parent) ++ state.slots.keptAlive

/-- Whether nothing remains in `scope`: no token, no open item that keeps it alive, no begun occurrence, no child
scope occurrence and no feature slot entry. -/
def idle (state : State) (scope : ScopeOccurrenceId) : Bool :=
  !state.busyScopes.contains scope

/-- The entries a micro-step's scans run over: tokens, occurrences, open items, scope occurrences and queued signals.
`Step.closureWorkBound` sums it over a closure's micro-steps. -/
def entryCount (state : State) : Nat :=
  state.batchTokens.length + state.queuedTokens.size + state.occurrences.length + state.openItems.size + state.scopes.length +
    state.batchSignals.length + state.queuedSignals.size

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
  let (state, id) := state.issueOccurrence scope element
  let occurrence : Occurrence := { id, element, scope, activation, begun := false }
  ({ state with occurrences := state.occurrences ++ [occurrence] }, occurrence)

def occurrence? (state : State) (id : OccurrenceId) : Option Occurrence :=
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

/-- Begin what `request` names: its reservation, placed in the request's scope and re-keyed there when its key leads
with another scope occurrence (DC26), or a fresh occurrence numbered under `role`. A reservation keeps its activation,
so an armed subscription's number is its occurrence's number. -/
def beginOccurrence (state : State) (request : BeginRequest) (role : ActivationRole) (sourceType : String) :
    State × Occurrence :=
  let reservedOccurrence := request.reserved.bind state.occurrence?
  let (state, occurrence) :=
    match reservedOccurrence with
    | some reserved =>
      if reserved.id.scope == request.scope then (state, reserved)
      else
        -- DC26: a reservation begun in a scope occurrence other than the one its key leads with (an Event
        -- Sub-Process start, reserved in the parent) takes the running unit's next issue there, keeping its element,
        -- activation and role; its old record and item counter go, as `State.removeOccurrence` drops them.
        let (state, id) := { state with
            occurrences := state.occurrences.filter (·.id != reserved.id)
            itemOrdinals := state.itemOrdinals.erase reserved.id }.issueOccurrence request.scope reserved.element
        (state, { reserved with id })
    | none =>
      let (state, activation) := state.activate (state.instanceOf request.scope) request.element role
      let (state, id) := state.issueOccurrence request.scope request.element
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

/-- A fresh key for an item of `occurrence` in `role`: the running unit's next issue, which the commit renames to the
occurrence's next item ordinal (DC12). -/
def issueItem (state : State) (occurrence : OccurrenceId) (role : ItemRole) : State × ItemKey :=
  let (state, ordinal) := state.issue (.item occurrence)
  (state, { occurrence, role, ordinal })

/-- Add `item` under its own key. -/
def putItem (state : State) (item : OpenItem) : State :=
  { state with openItems := state.openItems.insert item.id item }

/-- An item waiting for the begun `occurrence`, with its key, which a reader of the item just opened looks it up by. -/
def openItemKey (state : State) (kind : OpenKind) (occurrence : Occurrence) : State × ItemKey :=
  let (state, position) := state.issuePosition
  let (state, id) := state.issueItem occurrence.id .wait
  (state.putItem { id, position, kind, element := occurrence.element, scope := occurrence.scope }, id)

/-- An item waiting for the begun `occurrence`. -/
def openItem (state : State) (kind : OpenKind) (occurrence : Occurrence) : State :=
  (state.openItemKey kind occurrence).1

/-- A subscription item for `element`, with a fresh reservation; `host` is the occurrence it hangs on. -/
def openSubscription (state : State) (kind : OpenKind) (element : ElementId) (scope : ScopeOccurrenceId)
    (host : Option OccurrenceId) (passive : Bool) : State × OpenItem :=
  let (state, occurrence) := state.reserve element scope
  let (state, position) := state.issuePosition
  let (state, id) := state.issueItem occurrence.id .subscription
  let item : OpenItem := { id, position, kind, element, scope, attachedTo := host, passive }
  (state.putItem item, item)

def closeItem (state : State) (id : ItemKey) : State :=
  { state with openItems := state.openItems.erase id }

/-- Remove the items waiting for the occurrence `id`. -/
def closeOwnItems (state : State) (id : OccurrenceId) : State :=
  { state with openItems := state.openItems.filter fun _ item => item.id.occurrence != id }

/-- Enter a new scope occurrence of `element` inside `parent`, with the given local variables, `keyed`. The scope
belongs to `occurrence`, when it has one. -/
def enterScope (state : State) (element : ElementId) (parent : ScopeOccurrenceId)
    (locals : List (String × Value)) (occurrence : Option OccurrenceId) : State × ScopeOccurrenceId :=
  let (state, ordinal) := state.issue (.scope { parent, element })
  let id := parent.child element ordinal
  ({ state with
      scopes := state.scopes ++ [{ id, element := some element, occurrence }]
      variables := state.variables ++ [{ scope := id, entries := keyed locals }] }, id)

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

/-- Whether the frame of `scope` shows its binding of `name`: a Scope's item only in an occurrence of the Scope that
declares it, any other name in every frame. BPMN references data by element identity (§10.4.1), so another frame's
binding of an item's identifier neither shadows the item nor stands in for it while it is unset. -/
def shows (state : State) (program : Program) (scope : ScopeOccurrenceId) (name : String) : Bool :=
  match program.itemScope? name with
  | none => true
  | some declaring => ((state.scopes.find? (·.id == scope)).bind (·.element)) == some declaring

/-- The bindings the frame of `scope` shows (`shows`). -/
def frame (state : State) (program : Program) (scope : ScopeOccurrenceId) : List (String × Value) :=
  (((state.variables.find? (·.scope == scope)).map (·.entries)).getD []).filter (state.shows program scope ·.1)

/-- Variables visible from `scope`, innermost first, up to the root of its process instance, each frame's as it
`shows` them. -/
def visible (state : State) (program : Program) (scope : ScopeOccurrenceId) : List (String × Value) :=
  let rec go : (segments : List ScopeSegment) → (scope : ScopeOccurrenceId) → scope.segments = segments →
      List (String × Value)
    | [], _, _ => state.frame program root
    | _ :: rest, scope, segments =>
      state.frame program scope ++
        if state.calledRoot scope then [] else if state.stands scope then go rest (scope.up segments) rfl else []
  go scope.segments scope rfl

end State

end Kernel
