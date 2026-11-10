module

public import Kernel.State.Input

/-! # Feature slots

The scope occurrence identity every slot entry keys on, and the feature-owned data of `FeatureSlots`, which is
always present and empty by default, with the records a compensation run resumes by. Part of `Kernel.State`, which
re-exports it.
-/

public section

namespace Kernel

structure ScopeOccurrenceId where
  value : Nat
  deriving DecidableEq, Repr, Inhabited

/-- How an occurrence leaves: its element's own outgoing selection, the flows given (`flows []` consumes the
token), or `raised` by an event, which runs no retention, outflow or continuation. -/
inductive Leave where
  | outgoing
  | flows (selected : List FlowId)
  | raised
  deriving Repr

/-- What a compensation run does once its handlers have completed: complete an existing occurrence, or begin and
complete a fresh one (a caught Cancel's boundary, which `Step` numbers when the run ends). -/
inductive Resume where
  | complete (occurrence : Nat) (leave : Leave)
  | occur (element : ElementId) (scope : ScopeOccurrenceId) (leave : Leave)
  deriving Repr

/-- One instance of a Multi-Instance Activity: waiting to start, running in its instance scope occurrence, or
completed with the value its output data item received, `none` for a loop without one. -/
inductive Iteration where
  | waiting
  | active (scope : ScopeOccurrenceId)
  | completed (output : Option Value)
  deriving Repr

/-- A running Multi-Instance Activity (`Kernel.Feature.MultiInstance`): the scope occurrence it holds its instances
in, its element and body occurrence, the input collection as evaluated once on entry, and one instance per item in
collection order. -/
structure MultiInstanceRun where
  scope : ScopeOccurrenceId
  element : ElementId
  occurrence : Nat
  collection : Value
  instances : List Iteration
  /-- The effect-result names earlier sequential instances left, which CIB keeps on the body until it ends
  (EXPRESSION-SEMANTICS-SPEC "Multi-Instance level", result locals). -/
  results : List String := []
  deriving Repr

/-- A completed Activity or Scope whose compensation handler may still run: it completed in `scope`, and its
handler restores `snapshot` ([BPMN 2.0.2 §13.5.5](../docs/reference/bpmn-2.0.2/README.md)). `completion` orders the
records of one scope. `children` keeps the records of a completed Sub-Process, for its handler to trigger recursively
(§13.5.5; CIB moves them into an event-scope tree, `CompensationUtil.createEventScopeExecution`). -/
structure Compensable where
  subject : ElementId
  handler : ElementId
  scope : ScopeOccurrenceId
  occurrence : Option OccurrenceRef := none
  completion : Nat := 0
  snapshot : List (String × Value) := []
  children : List Compensable := []
  deriving Repr

/-- One compensation trigger in progress for the records retained in `scope`: handlers still `pending`, and those
`running` in their own context scope occurrence. Once all completed, the occurrence `leave` is cancelled and
`resume`'s occurrence completes. -/
structure CompensationRun where
  trigger : OccurrenceRef
  scope : ScopeOccurrenceId
  pending : List Compensable
  running : List (ScopeOccurrenceId × Compensable) := []
  leave : Option Nat
  resume : Option Resume
  deriving Repr

/-- `Kernel.Feature.Compensation`'s data: the retained records and the triggers in progress. -/
structure Compensations where
  retained : List Compensable := []
  runs : List CompensationRun := []
  deriving Repr

/-- An occurrence waiting at a join or for an unavailable InputSet, with the flow its token arrived on. -/
structure Parked where
  occurrence : Nat
  flow : FlowId
  scope : ScopeOccurrenceId
  deriving DecidableEq, Repr

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
  held : List Parked := []
  multiInstances : List MultiInstanceRun := []
  compensation : Compensations := {}
  instances : List InstanceData := []
  deriving Repr

/-- The scope occurrences a slot keeps alive. Every slot's own entry is an open occurrence or a child occurrence
already, so only the join and held waits count here. One of the two places that enumerate the slots. -/
def FeatureSlots.keptAlive (slots : FeatureSlots) : List ScopeOccurrenceId :=
  slots.parked.map (·.scope) ++ slots.held.map (·.scope)

/-- The slot entries that survive removing the scope occurrences `inside`, of which `nested` are the children. The
other place that enumerates the slots. -/
def FeatureSlots.clear (slots : FeatureSlots) (inside nested : List ScopeOccurrenceId) : FeatureSlots :=
  { parked := slots.parked.filter (!inside.contains ·.scope)
    held := slots.held.filter (!inside.contains ·.scope)
    multiInstances := slots.multiInstances.filter (!inside.contains ·.scope)
    compensation := {
      retained := slots.compensation.retained.filter (!nested.contains ·.scope)
      runs := slots.compensation.runs.filter (!inside.contains ·.scope) }
    instances := slots.instances.filter (!nested.contains ·.root) }

end Kernel
