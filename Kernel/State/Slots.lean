module

public import Kernel.State.Input
public import Kernel.State.Key
public import Kernel.State.Map

/-! # Feature slots

The feature-owned data of `FeatureSlots`, which is always present and empty by default, with the records a compensation
run resumes by. Part of `Kernel.State`, which re-exports it.
-/

public section

namespace Kernel

/-- One variable set, keyed by name (DC21): one value per name, as a Data Association's copy replaces its target's value
(BPMN 2.0.2 §10.4.2) and CIB keys a scope's variables by name (`VariableStore.java:39`). Its list view (`toList`) is
in name order, the form the state codec writes (T75); no reader takes another order from it. -/
abbrev Variables := TreeMap String Value compare

/-- `bindings` as a variable set: a name bound twice keeps the value bound last (#147). -/
def Variables.ofBindings (bindings : List (String × Value)) : Variables :=
  bindings.foldl (fun set binding => set.insert binding.1 binding.2) ∅

/-- How an occurrence leaves: its element's own outgoing selection, the flows given (`flows []` consumes the
token), or `raised` by an event, which runs no retention, outflow or continuation. -/
inductive Leave where
  | outgoing
  | flows (selected : List FlowId)
  | raised
  deriving Repr

/-- What a compensation run does once its handlers have completed: complete an existing occurrence, begin and complete
a fresh one (a caught Cancel's boundary, which `Step` numbers when the run ends), or, for a group's nested run, leave
the group's `context` and advance the run holding it as a completed handler does. -/
inductive Resume where
  | complete (occurrence : OccurrenceId) (leave : Leave)
  | occur (element : ElementId) (scope : ScopeOccurrenceId) (leave : Leave)
  | group (context : ScopeOccurrenceId)
  deriving Repr

/-- One instance of a Multi-Instance Activity: waiting to start, running in its instance scope occurrence, or
completed with the value its output data item received, `none` for a loop without one. -/
inductive Iteration where
  | waiting
  | active (scope : ScopeOccurrenceId)
  | completed (output : Option Value)
  deriving Repr

/-- Whether this instance runs in the scope occurrence `scope`. -/
def Iteration.holds (iteration : Iteration) (scope : ScopeOccurrenceId) : Bool :=
  match iteration with
  | .active held => held == scope
  | .waiting => false
  | .completed _ => false

/-- A running Multi-Instance Activity (`Kernel.Feature.MultiInstance`): the scope occurrence it holds its instances
in, its element and body occurrence, the input collection as evaluated once on entry, and one instance per item in
collection order. -/
structure MultiInstanceRun where
  scope : ScopeOccurrenceId
  element : ElementId
  occurrence : OccurrenceId
  collection : Value
  instances : List Iteration
  /-- The effect-result names earlier sequential instances left, which CIB keeps on the body until it ends
  (EXPRESSION-SEMANTICS-SPEC "Multi-Instance level", result locals). -/
  results : List String := []
  deriving Repr

/-- A record a completed Sub-Process's record keeps (`Compensable.children`), flat: the `Compensable` it was, without a
scope occurrence, which it takes only when its holder's handler or group begins, and its group key `group`, the
completion numbers of the kept records it lies within, outermost first, `[]` for one its holder keeps directly. The
key, not a nested list, says which records a begun record keeps in turn, so no state type nests. -/
structure CompensableChild where
  subject : ElementId
  handler : Option ElementId
  occurrence : Option OccurrenceRef := none
  completion : Nat := 0
  closure : Nat := 0
  snapshot : Variables := ∅
  group : List Nat := []
  deriving Repr

/-- A completed Activity or Scope whose compensation handler may still run: it completed in `scope`, and its
handler restores `snapshot` ([BPMN 2.0.2 §13.5.5](../docs/reference/bpmn-2.0.2/README.md)). `completion` numbers the
records in the order they completed, a kept record's key (`CompensableChild.group`) and the order under
`BranchSchedule.declarationDepthFirst`; `closure` stamps the closure it completed in (`State.completionBase`), which
under `orderInvariant` orders records of different closures (`Feature.Compensation.completedBefore`). `children` keeps the records of a completed Sub-Process at every depth, each under its group key,
for its handler to trigger recursively (§13.5.5; CIB moves them into an event-scope tree,
`CompensationUtil.createEventScopeExecution`). A record without a `handler` is a group whose compensation runs its
children. -/
structure Compensable where
  subject : ElementId
  handler : Option ElementId
  scope : ScopeOccurrenceId
  occurrence : Option OccurrenceRef := none
  completion : Nat := 0
  closure : Nat := 0
  snapshot : Variables := ∅
  children : List CompensableChild := []
  deriving Repr

/-- One compensation trigger in progress for the records retained in `scope`: handlers still `pending`, and those
`running` in their own context scope occurrence. Once all completed, the occurrence `leave` is cancelled and
`resume`'s occurrence completes. -/
structure CompensationRun where
  trigger : OccurrenceRef
  scope : ScopeOccurrenceId
  pending : List Compensable
  running : List (ScopeOccurrenceId × Compensable) := []
  leave : Option OccurrenceId
  resume : Option Resume
  deriving Repr

/-- `Kernel.Feature.Compensation`'s data: the retained records and the triggers in progress. -/
structure Compensations where
  retained : List Compensable := []
  runs : List CompensationRun := []
  deriving Repr

/-- An occurrence waiting at a join, with the flow its token arrived on. -/
structure Parked where
  occurrence : OccurrenceId
  flow : FlowId
  scope : ScopeOccurrenceId
  deriving DecidableEq, Repr

/-- The parked arrival of `entries` whose occurrence's issue comes first under `le`, the first of those tied. The
arrivals at one join in one scope occurrence are occurrences of one element there, so their issues are their order
positions (DC13): committed ordinals in the order the commit numbered them, then the closure's issues in its unit order. -/
def Parked.leastBy (le : Issue → Issue → Bool) (entries : List Parked) : Option Parked :=
  entries.foldl (init := none) fun found waiting =>
    match found with
    | some best => if le best.occurrence.ordinal waiting.occurrence.ordinal then found else some waiting
    | none => some waiting

/-- An occurrence waiting for an unavailable InputSet in its scope occurrence. It records no flow: it waits whether or
not a token began it, and only its scope occurrence's clearing ends the wait. -/
structure Held where
  occurrence : OccurrenceId
  scope : ScopeOccurrenceId
  deriving Repr

/-- A process instance's own facts: its root scope occurrence, its business key and, for a called instance, the
definition its Call bound, kept per instance so recovery never re-resolves it (PC-SCOPE-03, PC-MESSAGE-08). -/
structure InstanceData where
  root : ScopeOccurrenceId
  businessKey : Option String := none
  definition : Option DefinitionRef := none
  deriving Repr

/-- Feature-owned data. `parked` holds the occurrences that reached a join and wait for its other incoming flows
(`Kernel.Feature.Flow`); `held` holds those at an Activity whose InputSet is unavailable
([BPMN 2.0.2 §10.4.2](../docs/reference/bpmn-2.0.2/README.md), `Kernel.Feature.Work`). -/
structure FeatureSlots where
  parked : List Parked := []
  held : List Held := []
  multiInstances : List MultiInstanceRun := []
  compensation : Compensations := {}
  instances : List InstanceData := []
  deriving Repr

/-- The scope occurrences a slot keeps alive. Every slot's own entry is an open occurrence or a child occurrence
already, so only the join and held waits count here. One of the three places that enumerate the slots. -/
def FeatureSlots.keptAlive (slots : FeatureSlots) : List ScopeOccurrenceId :=
  slots.parked.map (·.scope) ++ slots.held.map (·.scope)

/-- The slot entries that survive removing the scope occurrences `inside`, of which `nested` are the children. One of
the three places that enumerate the slots. -/
def FeatureSlots.clear (slots : FeatureSlots) (inside nested : List ScopeOccurrenceId) : FeatureSlots :=
  { parked := slots.parked.filter (!inside.contains ·.scope)
    held := slots.held.filter (!inside.contains ·.scope)
    multiInstances := slots.multiInstances.filter (!inside.contains ·.scope)
    compensation := {
      retained := slots.compensation.retained.filter (!nested.contains ·.scope)
      runs := slots.compensation.runs.filter (!inside.contains ·.scope) }
    instances := slots.instances.filter (!nested.contains ·.root) }

/-- An occurrence a slot holds suspended: neither an open item nor a token, yet it continues in scope occurrence
`scope` once its wait ends, leaving as `leave` says. -/
structure Suspended where
  element : ElementId
  scope : ScopeOccurrenceId
  leave : Leave
  deriving Repr

/-- The suspended occurrences the slots hold, which an Inclusive join's waiting rule counts (`Feature.Flow.positions`,
CIB-INT-0016): each held occurrence, which leaves by its outgoing flows once its InputSet is available, and each
compensation run's resume, a waiting Compensation throw or a caught Cancel's boundary, which continues once its handlers
have completed. A group's nested run resumes the run holding it, whose own resume counts. The third place that
enumerates the slots. -/
def FeatureSlots.suspended (slots : FeatureSlots) : List Suspended :=
  slots.held.map (fun held => { element := held.occurrence.element, scope := held.scope, leave := .outgoing }) ++
    slots.compensation.runs.filterMap fun run =>
      match run.resume with
      | some (.complete occurrence leave) => some { element := occurrence.element, scope := occurrence.scope, leave }
      | some (.occur element scope leave) => some ({ element, scope, leave } : Suspended)
      | some (.group _) => none
      | none => none

end Kernel
