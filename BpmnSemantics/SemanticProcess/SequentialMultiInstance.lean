import BpmnSemantics.SemanticProcess.RuntimeState

/-! # Sequential Multi-Instance outer controller

The derived quantities of one open outer controller, the record it binds to, and its canonical order.
The account is [the Sequential Multi-Instance specification](../../docs/capsules/SEQUENTIAL-MULTI-INSTANCE-SPEC.md),
whose implemented representation stores the owning identity, the immutable snapshot, and the dense
output slots and derives every other quantity.

Nothing here is a counter, and nothing here is a transition. Planned, generated, completed, and
pending are functions of the controller's two lists and active is a function of the body of the
record it binds to, so the equations the normative account states hold structurally rather than by
validation; `SMI-ENTER-01` through `SMI-CANCEL-01` are defined by
[the transition owner](SequentialMultiInstanceTransition.lean) and by nothing in this module.

Terminated instances are absent rather than a constant accessor. No stable state can show a nonzero
one, because interruption removes the controller in the same transition that terminates its active
instance, so a `0`-valued function would be a second name for a fact the representation already
carries by construction.

Scope boundary: representation and its canonical order. It adds no BPMN capability, no operation
kind, no admission rule, and no public observation.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- Completed instances, which is also the loop counter of the active iteration.

One accessor for one number: the filled slots are the completed instances, and the next slot to fill
is the loop counter the active iteration carries. -/
def completedInstanceCount (controller : SequentialMultiInstanceController) : Nat :=
  controller.outputSlots.length

/-- The snapshot item the active iteration carries as its task input. -/
def activeSnapshotItem (controller : SequentialMultiInstanceController) : Option String :=
  controller.snapshot[completedInstanceCount controller]?

/-- Instances generated so far: the completed ones plus the one still open.

Exact for this profile because it keeps exactly one active inner instance. A parallel profile
generates more and needs its own account rather than a wider reading of this one. -/
def generatedInstanceCount (controller : SequentialMultiInstanceController) : Nat :=
  completedInstanceCount controller + 1

/-- Snapshot items not yet generated.

Truncated rather than signed, which is a real difference from the independently written core: on an
exhausted controller `Nat` subtraction answers `0` where a signed difference answers `-1`. The law
below is what makes that safe, by showing the two agree on every controller the well-formedness
account admits. -/
def pendingItemCount (controller : SequentialMultiInstanceController) : Nat :=
  controller.snapshot.length - generatedInstanceCount controller

/-- Planned equals pending plus generated, for a controller that still has an item to generate.

The normative equation of the capsule's account, and the reason no planned or pending counter is
stored: it is a theorem about the snapshot length rather than an agreement between two fields. The
hypothesis is the exhaustion conjunct, which is exactly the state in which truncated subtraction is
the unbounded difference. -/
theorem pendingItemCount_add_generatedInstanceCount
    (controller : SequentialMultiInstanceController)
    (notExhausted : completedInstanceCount controller < controller.snapshot.length) :
    pendingItemCount controller + generatedInstanceCount controller =
      controller.snapshot.length := by
  simp only [pendingItemCount, generatedInstanceCount, completedInstanceCount] at notExhausted ⊢
  omega

/-- Whether one controller names one Activity occurrence record.

`sameActivityOccurrence` compares two records, so it cannot take a controller: both values carry the
identity triple flat, and this is that same comparison read across the two carriers rather than a
second identity notion.

Body-blind by construction, which is what lets Activity body turnover preserve every conjunct stated
through it: the projection it reads is part of the replacement frame. -/
def controllerNamesActivityOccurrence (controller : SequentialMultiInstanceController)
    (record : ActivityOccurrence) : Bool :=
  controller.processInstanceId == record.processInstanceId &&
    controller.activityElementId == record.activityElementId &&
    controller.activation == record.activation

/-- Active inner instances of one controller, read from the record its identity binds to.

Zero or one, and derived rather than stored for the reason the owning account gives for the record's
own body: a stored active count beside the body that generates it is a second fact that can disagree
with it. The lookup is `controllersOwnLiveActivity`'s own test, so "the record this controller binds
to" has one spelling; an unbound or ambiguously bound controller answers `0`, which is unreachable in
an admitted state and is the only answer that names no record the state does not carry.

Body kind decides the arm because this profile's inner instance is a User Task. A child-scope body
belongs to no Multi-Instance model admitted here, so it contributes no active inner instance rather
than being refused: refusing would place a profile fact inside a derivation the profile-independent
invariant reads. -/
def activeInstanceCount (state : RuntimeState)
    (controller : SequentialMultiInstanceController) : Nat :=
  match state.activityOccurrences.filter (controllerNamesActivityOccurrence controller) with
  | [record] =>
      match record.body with
      | .userTask _ => 1
      | .parallelUserTasks .. => 0
      | .childScope _ => 0
  | _ => 0

/-- Generated equals active plus completed, for a controller bound to one live task-bodied record.

The capsule's first minimum law. Its `numberOfTerminatedInstances` term is absent rather than written
as `+ 0`: no stable state carries a terminated inner instance, because interruption removes the
controller in the transition that terminates its active one, so a term for it would be a second name
for a fact the representation already carries by construction.

Both hypotheses are load-bearing and neither is bookkeeping. Without the binding this would relate a
controller to an arbitrary record, and the active count would be read off a body that is not this
controller's; without the task body the record is a shape this profile does not generate and the
active arm is `0`, which makes the equation false for every nonempty snapshot. -/
theorem generatedInstanceCount_eq_active_add_completed
    (state : RuntimeState) (controller : SequentialMultiInstanceController)
    (record : ActivityOccurrence) (task : OccurrenceId)
    (bound : state.activityOccurrences.filter
      (controllerNamesActivityOccurrence controller) = [record])
    (bodyIsTask : record.body = .userTask task) :
    generatedInstanceCount controller =
      activeInstanceCount state controller + completedInstanceCount controller := by
  simp [activeInstanceCount, bound, bodyIsTask, generatedInstanceCount, Nat.add_comm]

/-- Identity equality for two controllers, over the same triple. -/
def sameSequentialMultiInstanceController
    (left right : SequentialMultiInstanceController) : Bool :=
  left.processInstanceId == right.processInstanceId &&
    left.activityElementId == right.activityElementId &&
    left.activation == right.activation

/-- The controller one Activity occurrence owns, or `none`.

Keyed by the record rather than by a bare identity because Lean carries the triple inside the record
and names no separate identity type; a caller holding the record holds the key.

`none` for an ambiguous state rather than the first match, for the reason
`activityOccurrenceForTimer?` gives: two controllers sharing one identity is invalid before
evaluation, so answering with either would hide the defect the uniqueness conjunct exists to
reject. -/
def sequentialMultiInstanceControllerFor?
    (controllers : List SequentialMultiInstanceController) (record : ActivityOccurrence) :
    Option SequentialMultiInstanceController :=
  match controllers.filter (controllerNamesActivityOccurrence · record) with
  | [controller] => some controller
  | _ => none

/-- Canonical order: Process instance, then Activity element, then activation.

The same key in the same field order as `activityOccurrenceBefore`, because a controller and the
record it binds to are keyed by one identity. Stated here rather than beside that comparator because
this capsule adds no insertion site: an ordering transition would move it next to its insert, exactly
as the Activity occurrence order sits next to `insertActivityOccurrence`. -/
def sequentialMultiInstanceControllerBefore
    (left right : SequentialMultiInstanceController) : Bool :=
  if left.processInstanceId.value ≠ right.processInstanceId.value then
    left.processInstanceId.value < right.processInstanceId.value
  else if left.activityElementId.value ≠ right.activityElementId.value then
    left.activityElementId.value < right.activityElementId.value
  else
    left.activation < right.activation

end BpmnSemantics.SemanticProcess
