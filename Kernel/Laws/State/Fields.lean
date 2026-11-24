module

public import Kernel.State

/-! # The state's field table (DC29)

Every field of `State`, and of every structure a field's type names that a state module (`Kernel.State` and its
submodules) defines, is classified here, once, as content or index ([DC29](../../../docs/REWRITE-2-PROPOSAL.md)).
Content is what the state means: the laws and KD2′'s `Frame` compare it. An index is derived from content, kept
coherent with it by a law in `WellFormed`, and outside content and `Frame`; a body's read of an index is declared as a
read of the content it summarizes. `strip`, the content projection, reads this table alone, so adding an index is one
row: its field, the content it summarizes and how `strip` erases it.

A List-typed content field names why its order is semantic, or the K0.12 container change that removes the order
(`ListOrder`), because an order of entry across units is schedule order in content (probes P02, P09, P10, P12, P13:
compensation records, variables, `held` and the activation counter). A key type, one with a lawful order, has no rows:
its fields are its key's components, which its order and the key laws cover; a value an inductive constructor carries is
part of the field that holds it. `scripts/kernel-fields.lean` fails a field without a row, a row without a field, an
index row whose summarized fields are not content, and a List-typed content field without an order reason, and checks
that every map key type in these fields has a lawful order. Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Laws.State

open Kernel

/-- Why a List-typed content field's order is part of its meaning, or the container change that removes the order. -/
inductive ListOrder where
  /-- The order is semantic, for the reason given: an order one unit writes sequentially, a model's order or the run
  order the commit fixes, never an order of entry across units. -/
  | semantic (reason : String)
  /-- The order is storage order, not meaning, until the K0.12 container change named keys the field (DC29). -/
  | container (change : String)

/-- A field's class (DC29). -/
inductive FieldClass where
  /-- Content; `order` is given exactly for a List-typed field. -/
  | content (order : Option ListOrder := none)
  /-- An index of the content fields `summarizes`, which `erase` resets. -/
  | index (summarizes : List Lean.Name) (erase : Kernel.State → Kernel.State)

/-- One row: a structure field, by its projection's name, and its class. -/
structure Field where
  field : Lean.Name
  fieldClass : FieldClass

/-- A content row whose order is semantic. -/
abbrev ordered (field : Lean.Name) (reason : String) : Field := ⟨field, .content (some (.semantic reason))⟩

/-- A content row whose storage order a K0.12 container change removes. -/
abbrev keyedLater (field : Lean.Name) (change : String) : Field := ⟨field, .content (some (.container change))⟩

/-- A content row that holds no list. -/
abbrev content (field : Lean.Name) : Field := ⟨field, .content⟩

/-- The rows of `State`. -/
def stateRows : List Field := [
  content ``Kernel.State.instanceId,
  content ``Kernel.State.status,
  content ``Kernel.State.scopeMap,
  content ``Kernel.State.occurrenceMap,
  ordered ``Kernel.State.batchTokens "the running unit's batch in the order it queued it, its index segment's order (DC4)",
  content ``Kernel.State.queuedTokens,
  content ``Kernel.State.variables,
  content ``Kernel.State.openItems,
  content ``Kernel.State.itemOrdinals,
  content ``Kernel.State.scopeOrdinals,
  content ``Kernel.State.occurrenceOrdinals,
  content ``Kernel.State.issuing,
  content ``Kernel.State.issueNext,
  content ``Kernel.State.issued,
  keyedLater ``Kernel.State.activations "K0.12 group 4: activations numbered at commit, keyed by the called root",
  content ``Kernel.State.nextCompletion,
  content ``Kernel.State.completionBase,
  content ``Kernel.State.nextOrder,
  content ``Kernel.State.logicalTimeMs,
  ordered ``Kernel.State.batchSignals "the running unit's batch in the order it queued it, its index segment's order (DC2, DC10)",
  content ``Kernel.State.queuedSignals,
  ordered ``Kernel.State.writes "the running unit's writes in the order it made them, which `Hooks.written` reads (PC-CONDITION-01)",
  ordered ``Kernel.State.batchIntents "the running unit's broadcast intents in the order it made them (DC4)",
  ordered ``Kernel.State.outboxes "each unit's intents in the order that unit made them, keyed by the unit (DC4)",
  content ``Kernel.State.slots,
  content ``Kernel.State.failure,
  ordered ``Kernel.State.journal "a committed input's transitions in run order, fixed at commit (`Step.orderJournal`)",
  ordered ``Kernel.State.intents "a committed input's broadcast intents in run order, fixed at commit (`Step.orderJournal`)",
  content ``Kernel.State.transitions,
  content ``Kernel.State.draft]

/-- The rows of the entries of `State`'s collections. -/
def entryRows : List Field := [
  -- `ScopeOccurrence`
  content ``Kernel.ScopeOccurrence.id,
  content ``Kernel.ScopeOccurrence.element,
  content ``Kernel.ScopeOccurrence.position,
  content ``Kernel.ScopeOccurrence.occurrence,
  content ``Kernel.ScopeOccurrence.calledInstance,
  -- `Occurrence`
  content ``Kernel.Occurrence.id,
  content ``Kernel.Occurrence.element,
  content ``Kernel.Occurrence.scope,
  content ``Kernel.Occurrence.activation,
  content ``Kernel.Occurrence.position,
  content ``Kernel.Occurrence.role,
  content ``Kernel.Occurrence.continuation,
  content ``Kernel.Occurrence.incoming,
  content ``Kernel.Occurrence.begun,
  -- `OpenItem`
  content ``Kernel.OpenItem.id,
  content ``Kernel.OpenItem.position,
  content ``Kernel.OpenItem.kind,
  content ``Kernel.OpenItem.element,
  content ``Kernel.OpenItem.scope,
  content ``Kernel.OpenItem.attachedTo,
  content ``Kernel.OpenItem.passive,
  -- `ActivationCount`
  content ``Kernel.ActivationCount.processInstance,
  content ``Kernel.ActivationCount.element,
  content ``Kernel.ActivationCount.role,
  content ``Kernel.ActivationCount.count,
  -- `WriteEvent`
  content ``Kernel.WriteEvent.scope,
  content ``Kernel.WriteEvent.name,
  content ``Kernel.WriteEvent.kind,
  -- `BroadcastIntent`
  content ``Kernel.BroadcastIntent.address,
  ordered ``Kernel.BroadcastIntent.variables "the throw's payload in the order its one unit evaluated the model's mappings",
  content ``Kernel.BroadcastIntent.businessKey,
  content ``Kernel.BroadcastIntent.origin]

/-- The rows of the journal, the draft and the failure. -/
def journalRows : List Field := [
  -- `InstanceFailure`
  content ``Kernel.InstanceFailure.code,
  content ``Kernel.InstanceFailure.message,
  content ``Kernel.InstanceFailure.occurrence,
  ordered ``Kernel.InstanceFailure.related "named roles in the fixed order the one failing unit lists them",
  -- `Transition`
  content ``Kernel.Transition.cause,
  content ``Kernel.Transition.element,
  content ``Kernel.Transition.owner,
  ordered ``Kernel.Transition.started "one unit's facts in the order it produced them",
  ordered ``Kernel.Transition.ended "one unit's facts in the order it produced them",
  ordered ``Kernel.Transition.ready "one unit's facts in the order it produced them",
  -- `Draft`
  ordered ``Kernel.Draft.started "the running unit's facts in the order it produces them",
  ordered ``Kernel.Draft.ended "the running unit's facts in the order it produces them",
  ordered ``Kernel.Draft.cancelled "the running unit's cancellations in its cancellation order, which `Hooks.cancelled` runs in (DC25)",
  ordered ``Kernel.Draft.ready "the running unit's facts in the order it produces them",
  -- `OccurrenceRef`
  content ``Kernel.OccurrenceRef.processInstanceId,
  content ``Kernel.OccurrenceRef.element,
  content ``Kernel.OccurrenceRef.activation,
  -- `StartedFact`
  content ``Kernel.StartedFact.occurrence,
  content ``Kernel.StartedFact.owner,
  content ``Kernel.StartedFact.sourceType,
  -- `OccurrenceKey`
  content ``Kernel.OccurrenceKey.processInstanceId,
  content ``Kernel.OccurrenceKey.element,
  content ``Kernel.OccurrenceKey.activation,
  content ``Kernel.OccurrenceKey.role]

/-- The rows of the feature slots. -/
def slotRows : List Field := [
  -- `FeatureSlots`
  keyedLater ``Kernel.FeatureSlots.parked "K0.12 DC14: the parked map keyed (scope occurrence, flow, occurrence)",
  content ``Kernel.FeatureSlots.heldMap,
  keyedLater ``Kernel.FeatureSlots.multiInstances "K0.12 group 3a: Multi-Instance records keyed",
  content ``Kernel.FeatureSlots.compensation,
  keyedLater ``Kernel.FeatureSlots.instances "keyed by the instance's root scope occurrence; no K0.12 group names it yet",
  -- `Parked`
  content ``Kernel.Parked.occurrence,
  content ``Kernel.Parked.flow,
  content ``Kernel.Parked.scope,
  -- `MultiInstanceRun`
  content ``Kernel.MultiInstanceRun.scope,
  content ``Kernel.MultiInstanceRun.element,
  content ``Kernel.MultiInstanceRun.occurrence,
  content ``Kernel.MultiInstanceRun.collection,
  ordered ``Kernel.MultiInstanceRun.instances "one instance per item in collection order (BPMN 2.0.2 §10.2.8, `loopCounter`)",
  keyedLater ``Kernel.MultiInstanceRun.results "a name set read by membership; K0.12 group 3a keys it with its record",
  -- `Compensations`
  keyedLater ``Kernel.Compensations.retained "K0.12 group 3b: compensation records keyed",
  keyedLater ``Kernel.Compensations.runs "K0.12 group 3b: compensation runs keyed, with a keyed index from a running context to its run",
  -- `InstanceData`
  content ``Kernel.InstanceData.root,
  content ``Kernel.InstanceData.businessKey,
  content ``Kernel.InstanceData.definition]

/-- The rows of the compensation records. -/
def compensationRows : List Field := [
  -- `Compensable`
  content ``Kernel.Compensable.subject,
  content ``Kernel.Compensable.handler,
  content ``Kernel.Compensable.scope,
  content ``Kernel.Compensable.occurrence,
  content ``Kernel.Compensable.completion,
  content ``Kernel.Compensable.closure,
  content ``Kernel.Compensable.snapshot,
  keyedLater ``Kernel.Compensable.children "K0.12 group 3b: compensation records keyed",
  -- `CompensationRun`
  content ``Kernel.CompensationRun.trigger,
  content ``Kernel.CompensationRun.scope,
  keyedLater ``Kernel.CompensationRun.pending "K0.12 group 3b: compensation records keyed",
  keyedLater ``Kernel.CompensationRun.running "K0.12 group 3b: running handlers keyed by their context scope occurrence",
  content ``Kernel.CompensationRun.leave,
  content ``Kernel.CompensationRun.resume,
  -- `CompensableChild`
  content ``Kernel.CompensableChild.subject,
  content ``Kernel.CompensableChild.handler,
  content ``Kernel.CompensableChild.occurrence,
  content ``Kernel.CompensableChild.completion,
  content ``Kernel.CompensableChild.closure,
  content ``Kernel.CompensableChild.snapshot,
  ordered ``Kernel.CompensableChild.group "a group key: completion numbers outermost first, a path"]

/-- The table, kept in blocks under guard 6's literal bound; rows follow each structure's field order. -/
def fields : List Field :=
  stateRows ++ entryRows ++ journalRows ++ slotRows ++ compensationRows

/-- The content projection: the state with every index the table lists erased (DC29), which KD2′'s `Frame` and every
law over several fields compare, so no law reads an index as content. -/
def strip (state : Kernel.State) : Kernel.State :=
  fields.foldl (init := state) fun state row =>
    match row.fieldClass with
    | .index _ erase => erase state
    | .content _ => state

end Kernel.Laws.State
