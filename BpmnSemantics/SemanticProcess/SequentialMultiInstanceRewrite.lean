import BpmnSemantics.SemanticProcess.ActivityBodyTurnover
import BpmnSemantics.SemanticProcess.Data
import BpmnSemantics.SemanticProcess.SequentialMultiInstance
import BpmnSemantics.SemanticProcess.WaitActivation

/-! # Sequential Multi-Instance definition facts and state rewrites

What one admitted sequential Multi-Instance User Task is, which submitted values it admits, and what
each of its four rules does to committed runtime state. The account is
[the sequential Multi-Instance proposal](../../docs/capsules/SEQUENTIAL-MULTI-INSTANCE-PROPOSAL.md).
[The transition owner](SequentialMultiInstanceTransition.lean) states what a legal transition *is* and
proves the evaluators stay inside it; this module is the vocabulary both halves read.

**The definition facts arrive as an argument, not as a committed program operation.** The Lean
`SemanticOperation` union carries no `awaitSequentialMultiInstanceUserTask`, so `SequentialMultiInstanceArm`
is passed explicitly where the bounded-task family reads its operation out of the `Program`. That is a
real boundary rather than a convenience: nothing here or downstream states an admission rule, a
dispatcher arm, or any fact about which programs may drive these transitions, and no `applyStimulus`
path reaches them. Binding them to an operation is the lowering owner's change, and until it lands the
definition side's retained evidence is the independently written core's.

**Entry reuses the bounded arming operation.** The non-empty arm is `activateBoundedUserTask` plus one
controller, because the state the two families arm is the same state: one inner User Task occurrence,
one attached lifetime deadline, one Activity occurrence record binding them, and the incoming token
consumed. Sharing it keeps the deadline's identity and its logical instant derived in one place, so a
later iteration cannot silently re-derive either.

Each rewrite is separate from its evaluator so that the untouched collections are visible in the term
a relation concludes with, and so a law can be stated about the rewrite rather than about a lookup.
The iteration rewrite names no Timer collection and no variable scope, and the interruption rewrite
names no variable scope; both absences are propositions rather than accidents, and
[the laws owner](SequentialMultiInstanceLaws.lean) states them as such.

Scope boundary: definition facts, admitted submitted values, and five state rewrites. It owns no
relation, no evaluator, no admission of a source or program, no public observation, and no occurrence
projection.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-! ## The definition facts these transitions read

Three binding names and the control-flow arms, and nothing the transitions do not read. The admitted
source carries eleven further association identities; they constrain admission and lowering, have no
transition consumer, and belong to the checked-source and IL boundary rather than here.
-/

/-- The Process- and task-scope binding names one Multi-Instance Activity mediates through.

`inputDataObjectId` names the Process binding the snapshot is copied from once, `taskDataOutputId` the
sole binding an inner completion may submit, and `outputDataObjectId` the Process binding the final
aggregation publishes. All three are exact identities compared by equality, because this profile
selects direct index mediation with no expression, coercion, or transformation. -/
structure SequentialMultiInstanceData where
  inputDataObjectId : String
  taskDataOutputId : String
  outputDataObjectId : String
  deriving Repr, DecidableEq

/-- The profile's inclusive collection bounds, carried by the definition and checked at entry.

Runtime bounds rather than admission bounds: the definition admits the shape, and only entry sees the
collection a host supplied, so exceeding any of them leaves the transition undefined and the command
is refused rather than truncated. -/
structure SequentialMultiInstanceLimits where
  maximumItems : Nat
  maximumItemUtf8Bytes : Nat
  maximumCanonicalCollectionUtf8Bytes : Nat
  deriving Repr, DecidableEq

/-- One admitted sequential Multi-Instance Activity, as the four transitions read it. -/
structure SequentialMultiInstanceArm where
  input : ControlPlaceId
  taskId : TaskDefinitionId
  taskName : Option String
  normalOutput : ControlPlaceId
  boundaryTimer : BoundaryTimerArm
  data : SequentialMultiInstanceData
  limits : SequentialMultiInstanceLimits
  deriving Repr, DecidableEq

/-- The inner task as the shared bounded arming operation takes it.

Its `output` is the outer Activity's normal output, which is the choice the independently written core
makes as well: an inner instance's completion route is the outer Activity's, because no inner instance
has a Sequence Flow of its own. -/
def SequentialMultiInstanceArm.innerTask (arm : SequentialMultiInstanceArm) : BoundedTaskArm :=
  { id := arm.taskId, name := arm.taskName, output := arm.normalOutput }

/-! ## The admitted collection and the accepted result

Both lookups are exact-identity singletons. A second binding of one name makes "the" collection
ambiguous, and the output collection is a second `StringList` in the same scope, so a kind-based
lookup would silently pick the wrong binding from the first natural completion onward.
-/

/-- Bytes one item contributes to a canonical JSON array, its framing quotes included. -/
def jsonArrayItemUtf8Bytes (item : String) : Nat :=
  item.utf8ByteSize + 2

/-- Canonical byte size of the collection, as its JSON array encoding.

Exact for every collection whose items contain no `"`, no `\`, and no character below `U+0020`, and an
undercount otherwise, because JSON escaping expands exactly those and this measure does not model it.
The escape-aware measure is what the independently written core computes, and it is deliberately not
written here: reaching a `String`'s characters decodes its byte array, which the kernel does not
reduce, so a faithful model would make every decided fixture in this family unreducible, while an
unfaithful one hidden behind the same name would be worse. The residual disagreement is one class, an
escape-bearing collection near the byte bound that this side admits and the core refuses, and it is
recorded as an open cross-target lane rather than claimed as agreement. -/
def canonicalCollectionUtf8Bytes : List String → Nat
  | [] => 2
  | first :: rest =>
      rest.foldl (fun total item => total + jsonArrayItemUtf8Bytes item + 1)
        (jsonArrayItemUtf8Bytes first) + 2

/-- Whether a collection fits every profile bound. Item count is tested first, so a refusal for count
alone never pays for the byte measures. -/
def withinSequentialMultiInstanceLimits (arm : SequentialMultiInstanceArm)
    (items : List String) : Bool :=
  decide (items.length ≤ arm.limits.maximumItems) &&
    items.all (fun item => decide (item.utf8ByteSize ≤ arm.limits.maximumItemUtf8Bytes)) &&
    decide (canonicalCollectionUtf8Bytes items ≤
      arm.limits.maximumCanonicalCollectionUtf8Bytes)

/-- The collection this entry snapshots, when Process scope binds exactly one usable one. -/
def admittedSnapshot? (arm : SequentialMultiInstanceArm) (state : RuntimeState) :
    Option (List String) :=
  match state.variables.process.bindings.filter fun candidate =>
      candidate.name == arm.data.inputDataObjectId with
  | [binding] =>
      match binding.value with
      | .stringList items =>
          if withinSequentialMultiInstanceLimits arm items then some items else none
      | _ => none
  | _ => none

/-- The exact scalar result an inner completion may submit.

One binding, named by the task's own DataOutput, carrying a String. Anything else leaves the
transition undefined rather than partially applied: an accepted completion writes one output slot, so
a submission this account cannot place in a slot must not commit. -/
def acceptedIterationResult (arm : SequentialMultiInstanceArm) :
    List VariableBinding → Option String
  | [binding] =>
      match binding.value with
      | .string result =>
          if binding.name = arm.data.taskDataOutputId then some result else none
      | _ => none
  | _ => none

/-! ## The state rewrites

Named apart from the evaluators so each relation's conclusion is an expression whose untouched
collections are visible, and so a law can be stated about the rewrite rather than about a lookup.
-/

/-- Publishes the output collection into Process scope through the shared canonical merge.

The merge is the one User Task completion already uses, so publication replaces an equal name, retains
every unrelated binding, and leaves Process scope canonically ordered by name. -/
def publishProcessCollection (arm : SequentialMultiInstanceArm)
    (variables : ScopedVariables) (items : List String) : ScopedVariables :=
  { variables with
    process :=
      { bindings := mergeProcessVariableBindings variables.process.bindings
          [{ name := arm.data.outputDataObjectId, value := .stringList items }] } }

/-- `SMI-ENTER-01`, empty arm: no inner instance, no deadline, no record, no controller.

Not a degenerate case of the other arm. A zero-item collection generates no inner instance, so there
is no body for a record to own and no iteration for a deadline to bound; arming a deadline and
withdrawing it in the same transition would reach the same observable outcome through a state the
profile says never becomes stable. -/
def emptyCollectionEntryState (arm : SequentialMultiInstanceArm) (state : RuntimeState)
    (owner : ScopeOccurrenceId) : RuntimeState :=
  { state with
    tokens := addToken (removeToken state.tokens arm.input owner) arm.normalOutput owner
    variables := publishProcessCollection arm state.variables [] }

/-- The controller one entry creates: the immutable snapshot and no filled slot.

Its activation is the arming operation's own, recomputed from the same pre-state counter rather than
passed in, so the controller cannot name an Activity occurrence that step did not mint. -/
def enteredController (arm : SequentialMultiInstanceArm) (state : RuntimeState)
    (instanceId : SemanticId) (items : List String) : SequentialMultiInstanceController :=
  { processInstanceId := instanceId
    activityElementId := ⟨arm.taskId.value⟩
    activation := activityActivationCount state arm.taskId + 1
    snapshot := items
    outputSlots := [] }

/-- `SMI-ENTER-01`, non-empty arm: the bounded arming plus one controller at loop counter zero.

Three identities from three independent counter families, the inner task's, the outer Timer's, and the
outer Activity's, all minted by the shared arming operation. The Activity's is advanced here and never
again for this occurrence, which is what makes the body's activation diverge from its handler's at the
first iteration boundary. -/
def firstIterationEntryState (arm : SequentialMultiInstanceArm) (state : RuntimeState)
    (instanceId : SemanticId) (owner : ScopeOccurrenceId) (items : List String) : RuntimeState :=
  { activateBoundedUserTask state instanceId owner arm.input arm.innerTask arm.boundaryTimer with
    sequentialMultiInstanceControllers :=
      enteredController arm state instanceId items ::
        state.sequentialMultiInstanceControllers }

/-- Everything about a controller that storing a result must leave alone.

Bundled so one equation carries the immutability obligation, and so the canonical order key is visibly
a projection of it: that order compares Process instance, Activity element, and activation, and every
one of them is here. -/
def sequentialMultiInstanceControllerFrame (controller : SequentialMultiInstanceController) :
    SemanticId × NodeId × Nat × List String :=
  (controller.processInstanceId, controller.activityElementId, controller.activation,
    controller.snapshot)

/-- Appends one accepted result to the slots of the controller carrying this identity.

A per-record rewrite rather than a filter, an append, and a re-sort. The identity fields and the
snapshot are untouched, so the canonical order is preserved by the frame instead of restored by
sorting, and the slots stay dense because appending is the only way this rewrite extends them. -/
def storeIterationResult (controllers : List SequentialMultiInstanceController)
    (target : SequentialMultiInstanceController) (result : String) :
    List SequentialMultiInstanceController :=
  controllers.map fun candidate =>
    if sameSequentialMultiInstanceController candidate target then
      { candidate with outputSlots := candidate.outputSlots ++ [result] }
    else candidate

/-- `SMI-ITERATE-01`: store the result and turn the body over, touching nothing else.

The body swap is [the Activity occurrence account's replacement](ActivityBodyTurnover.lean), which
withdraws the outgoing wait, arms the incoming one from the body element's own counter, advances that
counter, and leaves the record's identity, owner, and attached-wait list exactly as they were. Nothing
here names `timerWaits`, `timerActivations`, `activityActivations`, or `variables`, and that absence is
the proposition: the lifetime deadline survives the turnover with its identity and its instant, and no
Process output appears before natural completion. -/
def iteratedState (state : RuntimeState) (record : ActivityOccurrence) (wait : UserTaskWait)
    (body : OccurrenceId) (target : SequentialMultiInstanceController) (result : String) :
    RuntimeState :=
  { replacedState state record wait body with
    sequentialMultiInstanceControllers :=
      storeIterationResult state.sequentialMultiInstanceControllers target result }

/-- `SMI-COMPLETE-01`: publish the exact ordered collection once and close the repetition.

The controller, the record, the final inner task, and the lifetime deadline leave together, and the
normal output is the only route enabled. The published items are the slots in index order, which is
the order they were written in; completion order cannot differ from it under this profile, because one
active instance means the two coincide in every admitted schedule. -/
def finalCompletionState (arm : SequentialMultiInstanceArm) (state : RuntimeState)
    (record : ActivityOccurrence) (body : OccurrenceId)
    (target : SequentialMultiInstanceController) (items : List String) : RuntimeState :=
  { state with
    tokens := addToken state.tokens arm.normalOutput record.owner
    waits := state.waits.filter fun candidate => !taskIdNamesWait body candidate
    timerWaits := state.timerWaits.filter fun candidate =>
      !anyTimerIdNamesWait record.attachedTimers candidate
    activityOccurrences := state.activityOccurrences.filter fun candidate =>
      !sameActivityOccurrence candidate record
    sequentialMultiInstanceControllers := state.sequentialMultiInstanceControllers.filter
      fun candidate => !sameSequentialMultiInstanceController candidate target
    variables := publishProcessCollection arm state.variables items }

/-- `SMI-CANCEL-01`: the exact outer deadline interrupts the whole repetition.

Not a completion with a different route. It withdraws the one active inner task, generates no pending
item, discards every accepted result, removes the controller and the record, and enables only the
boundary output. `variables` is carried over verbatim, and that is the selected resolution rather than
an omission: a partial collection would be observable state no clause defines, and BPMN's own caution
against exposing the output collection before every item is written applies most sharply where the
remaining items never will be.

Logical time advances to the deadline the committed state carries, never to a submitted instant. -/
def interruptionState (arm : SequentialMultiInstanceArm) (state : RuntimeState)
    (record : ActivityOccurrence) (body : OccurrenceId) (deadline : TimerWait)
    (target : SequentialMultiInstanceController) : RuntimeState :=
  { state with
    logicalTimeMs := deadline.deadlineMs
    tokens := addToken state.tokens arm.boundaryTimer.output record.owner
    waits := state.waits.filter fun candidate => !taskIdNamesWait body candidate
    timerWaits := state.timerWaits.filter fun candidate =>
      !timerWaitKeyMatches deadline candidate
    activityOccurrences := state.activityOccurrences.filter fun candidate =>
      !sameActivityOccurrence candidate record
    sequentialMultiInstanceControllers := state.sequentialMultiInstanceControllers.filter
      fun candidate => !sameSequentialMultiInstanceController candidate target }

end BpmnSemantics.SemanticProcess
