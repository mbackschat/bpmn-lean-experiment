import BpmnSemantics.SemanticProcess.SequentialMultiInstanceLaws
import BpmnSemantics.ActivityBoundaryTimerConformance

/-! # Sequential Multi-Instance fixtures

The concrete run that makes the four transitions' *content* checked rather than merely defined: one
three-item batch review entered, iterated twice, completed naturally, and separately interrupted after
one accepted result. The account is
[the sequential Multi-Instance proposal](docs/capsules/SEQUENTIAL-MULTI-INSTANCE-PROPOSAL.md).

The quantified laws in [the laws owner](SemanticProcess/SequentialMultiInstanceLaws.lean) are all
preservation facts, and every one of them is satisfied by a transition that does nothing. That is not a
defect in the laws, which say what they say, but it means none of them witnesses that entry arms a
task and a deadline, that turnover advances the body while the deadline stands still, or that final
aggregation publishes anything at all. This module supplies that half, and the refusals beside it.

**The program is borrowed, and that boundary is exact.** The Lean `SemanticOperation` union carries no
`awaitSequentialMultiInstanceUserTask`, so these fixtures drive the transitions with an explicit arm
whose control-flow half is read out of the interrupting boundary-Timer capsule's own committed
operation. That is what lets the post-states be checked against the whole reviewed
`runtimeStateWellFormed` rather than against a hand-copied subset of its conjuncts: the three
program-agreement conjuncts read element identity, ownership scope, and declared control places, and
those coincide because the arm *is* that operation's. What the borrowed program does not establish is
that a Multi-Instance operation would declare the same facts, and it cannot: no such operation exists
in this language yet. Every fact below is therefore a fact about the transitions and the runtime-state
invariant, and none is evidence about lowering or admission.

No registered profile reaches any of these states, because no dispatcher arm drives these transitions.
The positive facts establish that the states they produce are ones the reviewed invariant admits, so
each refusal below is attributable to its own perturbation rather than to the shape being rejected
outright.
-/

namespace BpmnSemantics.SequentialMultiInstanceConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

/-! ## Instance-search budget

Every fact below compares one wide tuple, and the `DecidableEq` instance for a tuple is one
`instDecidableEqProd` application per component plus one for each component's own type. The default
`synthInstance.maxSize` of 128 is a budget on that total, and these fixtures cross it: a six-component
tuple of primitives resolves, a seven-component one does not, and a six-component one whose members
are lists of pairs does not either. The failure is a search that ran out of budget rather than a type
without an instance, which is why it is raised here instead of being worked around.

The alternatives were both worse. Projecting each tuple member to a narrower type would silently
shrink what the fixture compares, and splitting each fact into several narrow ones would reduce the
state chain once per fragment, which is the expensive half of this module. Raising the budget changes
no proposition, adds no axiom, and leaves every comparison exactly as wide as it was.

The figure is a cap with headroom rather than a measured requirement. The widest facts here, the
entry projection and the empty-collection closure, still fail at 400 because a member that is a list
of pairs, or a list of `VariableBinding` reaching `VariableValue`, costs far more than a primitive.
Fitting the cap to what those need exactly would turn one added tuple member into a build failure
rather than a fixture edit, and nothing is spent by a budget that is not reached.
-/

set_option synthInstance.maxSize 2000

/-- The admitted boundary-Timer program, reused so the arm cannot drift from a declared position. -/
def program : Program := ActivityBoundaryTimerConformance.program

def instanceId : SemanticId := ActivityBoundaryTimerConformance.instanceId

/-- The three binding names this batch-review slice mediates through. -/
def batchData : SequentialMultiInstanceData :=
  { inputDataObjectId := "DataObject_Batch"
    taskDataOutputId := "DataOutput_ReviewResult"
    outputDataObjectId := "DataObject_Reviewed" }

/-- The profile's own inclusive bounds. Pinned as a fixture value so the byte refusals below, which
use deliberately tight bounds to stay cheap to reduce, cannot be mistaken for the profile's. -/
def profileLimits : SequentialMultiInstanceLimits :=
  { maximumItems := 16
    maximumItemUtf8Bytes := 512
    maximumCanonicalCollectionUtf8Bytes := 8192 }

/-- The arm, with its control-flow half taken from the program's committed bounded-task operation.

Resolved through the operation the program actually carries rather than a hand-written literal, so the
input place, the task identity, the normal route, and the whole boundary Timer arm are the admitted
ones. -/
def arm? : Option SequentialMultiInstanceArm :=
  match boundedTaskOperations program with
  | [(input, task, boundaryTimer)] =>
      some
        { input
          taskId := task.id
          taskName := task.name
          normalOutput := task.output
          boundaryTimer
          data := batchData
          limits := profileLimits }
  | _ => none

theorem arm_is_the_declared_activity_and_its_boundary_deadline :
    arm?.map (fun arm =>
      (arm.input.value, arm.taskId.value, arm.normalOutput.value,
        arm.boundaryTimer.elementId.value, arm.boundaryTimer.durationMs,
        arm.boundaryTimer.output.value, arm.limits)) =
      some ("place:Flow_Start", "BoundedTask", "place:Flow_Normal", "Deadline", 1000,
        "place:Flow_Boundary", profileLimits) := by
  decide +kernel

/-- A started Process holding one collection and one token on the Activity's input place.

Hand-placed rather than reached by `applyStimulus`, because the borrowed program's own start arms its
bounded task instead of this Activity. It is the state initiation leaves behind: the root occurrence
live, the pending flag consumed, and one owned token on the incoming Sequence Flow's place. -/
def preEntryWith (items : List String) : Option RuntimeState := do
  let arm ← arm?
  let started ← runningProgramStartState? program instanceId
    [{ name := arm.data.inputDataObjectId, value := .stringList items }]
  let owner ← rootScopeOccurrence? started
  pure
    { started with
      initiationPending := false
      tokens := [{ placeId := arm.input, owner }] }

def batch : List String := ["Invoice_1", "Invoice_2", "Invoice_3"]

def preEntry? : Option RuntimeState := preEntryWith batch

theorem pre_entry_state_is_well_formed_and_publishes_no_output :
    preEntry?.map (fun state =>
      (runtimeStateWellFormed program instanceId state,
        state.variables.process.bindings.map (·.name),
        state.tokens.map (·.placeId.value))) =
      some (true, ["DataObject_Batch"], ["place:Flow_Start"]) := by
  decide +kernel

def entered? : Option RuntimeState := do
  let arm ← arm?
  let state ← preEntry?
  enterSequentialMultiInstance? arm state

/-- One accepted result submitted against whatever inner task the state currently carries.

Resolved from the record's own body rather than from a written identity, so the chain cannot drift away
from the turnover that produced it; the stale-identity refusal below supplies the other direction. -/
private def completeInner (state? : Option RuntimeState) (value : String) : Option RuntimeState := do
  let arm ← arm?
  let state ← state?
  let record ← state.activityOccurrences.head?
  let body ← activityBodyTask? record
  completeSequentialMultiInstanceInnerTask? arm state body
    [{ name := arm.data.taskDataOutputId, value := .string value }]

def afterFirstResult? : Option RuntimeState := completeInner entered? "Reviewed_1"

def afterSecondResult? : Option RuntimeState := completeInner afterFirstResult? "Reviewed_2"

def afterThirdResult? : Option RuntimeState := completeInner afterSecondResult? "Reviewed_3"

/-- The interruption arm, fired at the exact instant the committed deadline carries. -/
def interruptedAfterFirstResult? : Option RuntimeState := do
  let arm ← arm?
  let state ← afterFirstResult?
  let record ← state.activityOccurrences.head?
  let timer ← record.attachedTimers.head?
  let deadline ← state.timerWaits.find? (timerIdNamesWait timer)
  interruptSequentialMultiInstance? arm state timer deadline.deadlineMs

/-- Every state this run reaches is one the reviewed runtime-state invariant admits.

The positive fact that keeps the refusals below honest, and the one the quantified laws do not supply:
preservation across these arms is an open lane, so this is the decided instance of it. -/
theorem every_state_of_the_run_is_well_formed :
    [entered?, afterFirstResult?, afterSecondResult?, afterThirdResult?,
      interruptedAfterFirstResult?].map
        (·.map (runtimeStateWellFormed program instanceId)) =
      [some true, some true, some true, some true, some true] := by
  decide +kernel

/-- `SMI-ENTER-01`, generating arm: one task, one deadline, one record, one controller, no output.

Three identities from three counter families, all at ordinal one, which is the coincidence every join
the ownership record retired used to read as a pair. The incoming token is consumed and no token is
produced, because the outer Activity is now open rather than finished. -/
theorem entry_arms_one_inner_task_one_lifetime_deadline_and_one_controller :
    entered?.map (fun state =>
      (state.waits.map fun wait => (wait.task.id.value, wait.activation),
        state.timerWaits.map fun wait => (wait.elementId.value, wait.activation, wait.deadlineMs),
        state.activityOccurrences.map (·.activation),
        state.sequentialMultiInstanceControllers.map fun controller =>
          (controller.snapshot, controller.outputSlots),
        state.tokens.map (·.placeId.value),
        state.variables.process.bindings.map (·.name))) =
      some ([("BoundedTask", 1)], [("Deadline", 1, 1000)], [1],
        [(["Invoice_1", "Invoice_2", "Invoice_3"], [])], [], ["DataObject_Batch"]) := by
  decide +kernel

/-- `SMI-ITERATE-01` twice: the body advances, the deadline does not, and slots fill in index order.

The three-tuple of activations is the whole content of the turnover amendment seen from this family.
After one iteration the body is at ordinal two while its handler and its Activity occurrence are still
at one, and after two iterations the body is at three while both are still at one. An evaluator that
re-armed the deadline for each iteration would answer `2` or `3` in the middle column, and one that
re-armed the outer Activity would answer it in the third. -/
theorem iteration_advances_the_body_and_stands_the_deadline_still :
    [afterFirstResult?, afterSecondResult?].map (·.map fun state =>
      (state.waits.map (·.activation),
        state.timerWaits.map fun wait => (wait.activation, wait.deadlineMs),
        state.activityOccurrences.map (·.activation),
        state.sequentialMultiInstanceControllers.map (·.outputSlots),
        state.variables.process.bindings.map (·.name))) =
      [some ([2], [(1, 1000)], [1], [["Reviewed_1"]], ["DataObject_Batch"]),
        some ([3], [(1, 1000)], [1], [["Reviewed_1", "Reviewed_2"]], ["DataObject_Batch"])] := by
  decide +kernel

/-- `SMI-COMPLETE-01`: the exact ordered collection, published once, and the repetition closed.

The published items are the slots in index order, and the Process scope holds exactly the input
collection it started with plus this one output binding, canonically ordered by name. The controller,
the record, the final inner task, and the lifetime deadline are all gone, and the only enabled route is
the normal one. -/
theorem final_completion_publishes_the_exact_ordered_collection_and_closes :
    afterThirdResult?.map (fun state =>
      (state.variables.process.bindings,
        state.waits.length, state.timerWaits.length, state.activityOccurrences.length,
        state.sequentialMultiInstanceControllers.length,
        state.tokens.map (·.placeId.value))) =
      some
        ([{ name := "DataObject_Batch"
            value := .stringList ["Invoice_1", "Invoice_2", "Invoice_3"] },
          { name := "DataObject_Reviewed"
            value := .stringList ["Reviewed_1", "Reviewed_2", "Reviewed_3"] }],
          0, 0, 0, 0, ["place:Flow_Normal"]) := by
  decide +kernel

/-- `SMI-CANCEL-01` after one accepted result: nothing published, only the boundary route enabled.

The accepted `Reviewed_1` is discarded with the controller that held it, so Process scope still holds
exactly the input collection and no output binding of any kind. Logical time advances to the committed
deadline rather than to a submitted instant. -/
theorem interruption_discards_partial_results_and_publishes_nothing :
    interruptedAfterFirstResult?.map (fun state =>
      (state.variables.process.bindings,
        state.waits.length, state.timerWaits.length, state.activityOccurrences.length,
        state.sequentialMultiInstanceControllers.length,
        state.tokens.map (·.placeId.value), state.logicalTimeMs)) =
      some
        ([{ name := "DataObject_Batch"
            value := .stringList ["Invoice_1", "Invoice_2", "Invoice_3"] }],
          0, 0, 0, 0, ["place:Flow_Boundary"], 1000) := by
  decide +kernel

/-- The entered state with a second live deadline listed by the same Activity occurrence record.

Hand-perturbed rather than reached by a transition, because this profile arms exactly one boundary
Timer and no admitted schedule reaches this state. What it perturbs is the number of deadlines and not
the shape of the join: each wait is still claimed by exactly one record and both are live under that
record's own owner, which is the state `attachedTimersUnambiguous` admits. -/
def enteredWithSecondDeadline? : Option RuntimeState := do
  let state ← entered?
  let record ← state.activityOccurrences.head?
  let fired ← record.attachedTimers.head?
  let deadline ← state.timerWaits.find? (timerIdNamesWait fired)
  pure
    { state with
      activityOccurrences :=
        [{ record with
            attachedTimers :=
              record.attachedTimers ++ [{ fired with activation := fired.activation + 1 }] }]
      timerWaits :=
        state.timerWaits ++
          [{ deadline with
              activation := deadline.activation + 1
              deadlineMs := deadline.deadlineMs + 1000 }] }

/-- Interruption withdraws every deadline the record listed, the one not yet due included.

The second deadline stands at 2000 while the fired one is at 1000, so a post-state that keeps it live
is exactly the stranding this withdrawal prevents: the record that named it is removed in the same
step, leaving a wait no record owns. Both deadlines, the active task, the record, and the controller
leave together, only the boundary route is enabled, and logical time advances to the fired instant
rather than to the later one. -/
theorem interruption_withdraws_both_deadlines_the_record_listed :
    (do
      let arm ← arm?
      let state ← enteredWithSecondDeadline?
      let record ← state.activityOccurrences.head?
      let fired ← record.attachedTimers.head?
      let deadline ← state.timerWaits.find? (timerIdNamesWait fired)
      let interrupted ← interruptSequentialMultiInstance? arm state fired deadline.deadlineMs
      pure
        (state.timerWaits.map (·.deadlineMs),
          interrupted.timerWaits.length, interrupted.waits.length,
          interrupted.activityOccurrences.length,
          interrupted.sequentialMultiInstanceControllers.length,
          interrupted.tokens.map (·.placeId.value), interrupted.logicalTimeMs)) =
      some ([1000, 2000], 0, 0, 0, 0, ["place:Flow_Boundary"], 1000) := by
  decide +kernel

/-- `SMI-ENTER-01`, empty arm: no inner instance, no deadline, and the empty collection published.

Its own fact rather than a variant of the generating arm, because the profile makes it a different
transition: a zero-item collection publishes the empty output collection and follows normal control in
one step, so no controller, record, task, or deadline ever exists to be resumed. -/
def emptyEntry? : Option RuntimeState := do
  let arm ← arm?
  let state ← preEntryWith []
  enterSequentialMultiInstance? arm state

theorem empty_collection_completes_atomically_and_publishes_an_empty_collection :
    emptyEntry?.map (fun state =>
      (runtimeStateWellFormed program instanceId state,
        state.waits.length, state.timerWaits.length, state.activityOccurrences.length,
        state.sequentialMultiInstanceControllers.length,
        state.tokens.map (·.placeId.value), state.variables.process.bindings)) =
      some (true, 0, 0, 0, 0, ["place:Flow_Normal"],
        [{ name := "DataObject_Batch", value := .stringList [] },
          { name := "DataObject_Reviewed", value := .stringList [] }]) := by
  decide +kernel

/-! ## The refusals

Each perturbs exactly one fact of a state or stimulus the positive facts above showed to be admitted,
so a refusal is attributable to its own perturbation. Every one of them commits nothing: the evaluator
answers `none`, and the caller's committed state is what it was.
-/

/-- A result named by the wrong binding is refused, even for the right task at the right time. -/
theorem a_result_under_the_wrong_output_binding_name_is_refused :
    (do
      let arm ← arm?
      let state ← entered?
      let record ← state.activityOccurrences.head?
      let body ← activityBodyTask? record
      completeSequentialMultiInstanceInnerTask? arm state body
        [{ name := arm.data.inputDataObjectId, value := .string "Reviewed_1" }]) = none := by
  decide +kernel

/-- A result carrying a collection where the profile admits one String is refused. -/
theorem a_result_of_the_wrong_value_kind_is_refused :
    (do
      let arm ← arm?
      let state ← entered?
      let record ← state.activityOccurrences.head?
      let body ← activityBodyTask? record
      completeSequentialMultiInstanceInnerTask? arm state body
        [{ name := arm.data.taskDataOutputId, value := .stringList ["Reviewed_1"] }]) = none := by
  decide +kernel

/-- The inner task of the previous iteration is stale once its successor has been armed.

The identity the first iteration completed, replayed against the state that turnover produced. It names
no live body, so no record answers for it and no result is stored twice. -/
theorem the_previous_iterations_task_identity_is_refused :
    (do
      let arm ← arm?
      let entry ← entered?
      let record ← entry.activityOccurrences.head?
      let staleBody ← activityBodyTask? record
      let state ← afterFirstResult?
      completeSequentialMultiInstanceInnerTask? arm state staleBody
        [{ name := arm.data.taskDataOutputId, value := .string "Reviewed_2" }]) = none := by
  decide +kernel

/-- Firing the lifetime deadline at any instant but the committed one is refused. -/
theorem firing_the_deadline_off_its_committed_instant_is_refused :
    (do
      let arm ← arm?
      let state ← afterFirstResult?
      let record ← state.activityOccurrences.head?
      let timer ← record.attachedTimers.head?
      let deadline ← state.timerWaits.find? (timerIdNamesWait timer)
      interruptSequentialMultiInstance? arm state timer (deadline.deadlineMs + 1)) = none := by
  decide +kernel

/-- A collection of more items than the profile admits is refused at entry.

Seventeen against the profile's own sixteen, which is the exact-16-fit and exact-17-refusal pair the
capsule's hosting budget names. The count is tested before either byte measure, so this refusal costs
no byte reduction. -/
theorem a_collection_of_seventeen_items_is_refused_at_entry :
    (do
      let arm ← arm?
      let state ← preEntryWith (List.replicate 17 "Invoice")
      enterSequentialMultiInstance? arm state) = none := by
  decide +kernel

/-- Sixteen items are admitted, which is what makes the refusal above about the bound and not the size.

The complement of the exact-17 refusal. Without it, a limit of one would pass the same test. -/
theorem a_collection_of_sixteen_items_is_admitted_at_entry :
    (do
      let arm ← arm?
      let state ← preEntryWith (List.replicate 16 "Invoice")
      let entry ← enterSequentialMultiInstance? arm state
      pure (entry.sequentialMultiInstanceControllers.map fun controller =>
        controller.snapshot.length)) = some [16] := by
  decide +kernel

/-- An item longer than the item-byte bound is refused at entry.

The bound is tightened to four bytes rather than exercised at the profile's five hundred and twelve,
because a literal that long would be reduced character by character in the kernel by every fixture in
this module. What the refusal is about is the arm's bound, and
`arm_is_the_declared_activity_and_its_boundary_deadline` pins the profile's own numbers separately. -/
theorem an_item_over_the_item_byte_bound_is_refused_at_entry :
    (do
      let arm ← arm?
      let state ← preEntryWith ["Invoice_1"]
      enterSequentialMultiInstance?
        { arm with limits := { arm.limits with maximumItemUtf8Bytes := 4 } } state) = none := by
  decide +kernel

/-- A collection whose canonical encoding exceeds the canonical-byte bound is refused at entry.

Tightened for the same reason as the item bound above. Three nine-byte items encode to thirty-seven
canonical bytes, against a bound of eight. -/
theorem a_collection_over_the_canonical_byte_bound_is_refused_at_entry :
    (do
      let arm ← arm?
      let state ← preEntry?
      enterSequentialMultiInstance?
        { arm with
          limits := { arm.limits with maximumCanonicalCollectionUtf8Bytes := 8 } } state) = none := by
  decide +kernel

/-- Sixteen accepted results of exactly `maximumItemUtf8Bytes` bytes each. -/
private def maximalOutputCollection (result : String) : List String :=
  [result, result, result, result, result, result, result, result,
    result, result, result, result, result, result, result, result]

/-- Sixteen results at the profile's own item bound cross its canonical collection bound.

The case the output-side bound exists for, at the profile's declared numbers rather than at the
tightened ones the refusals below use. Stated over an arbitrary maximal result so it needs no
five-hundred-and-twelve-byte literal, which every decided fixture in this module would otherwise
reduce: sixteen items are exactly `maximumItems`, each is exactly `maximumItemUtf8Bytes`, and their
canonical array measures 8241 against a declared 8192. Entry admits such a snapshot, every submitted
result is individually admissible, and the collection is over the bound only once the last slot is
filled, which is why an entry-side or item-only measure cannot refuse it. -/
theorem sixteen_results_at_the_item_byte_bound_cross_the_canonical_collection_bound
    (result : String) (maximal : result.utf8ByteSize = profileLimits.maximumItemUtf8Bytes) :
    (maximalOutputCollection result).length = profileLimits.maximumItems ∧
      canonicalCollectionUtf8Bytes (maximalOutputCollection result) = 8241 ∧
      profileLimits.maximumCanonicalCollectionUtf8Bytes <
        canonicalCollectionUtf8Bytes (maximalOutputCollection result) := by
  simp only [profileLimits] at maximal
  refine ⟨rfl, ?_, ?_⟩ <;>
    simp only [maximalOutputCollection, canonicalCollectionUtf8Bytes, jsonArrayItemUtf8Bytes,
      List.foldl_cons, List.foldl_nil, profileLimits] <;>
    omega

/-- `SMI-REFUSE-01`, non-final arm: a result whose candidate output collection crosses the canonical
byte bound is refused, and the entered state is what it was.

The perturbation is the bound alone, against the same state and the same accepted result the positive
iteration fact above stores. Tightened to eight canonical bytes for the reason the entry refusals
give, while `sixteen_results_at_the_item_byte_bound_cross_the_canonical_collection_bound` carries the
profile's own numbers; `"Reviewed_1"` alone encodes to fourteen. -/
theorem a_non_final_result_over_the_candidate_collection_byte_bound_is_refused :
    (do
      let arm ← arm?
      let state ← entered?
      let record ← state.activityOccurrences.head?
      let body ← activityBodyTask? record
      completeSequentialMultiInstanceInnerTask?
        { arm with limits := { arm.limits with maximumCanonicalCollectionUtf8Bytes := 8 } }
        state body
        [{ name := arm.data.taskDataOutputId, value := .string "Reviewed_1" }]) = none := by
  decide +kernel

/-- `SMI-REFUSE-01`, final arm: the completion that would publish an over-bound collection is refused.

The arm the bound is really for. The measure grows with every slot, so the completion that fills the
last one is the first that a maximal collection can cross, and a bound carried only by the non-final
arm would leave exactly this step unchecked and publish the result. -/
theorem a_final_result_over_the_candidate_collection_byte_bound_is_refused :
    (do
      let arm ← arm?
      let state ← afterSecondResult?
      let record ← state.activityOccurrences.head?
      let body ← activityBodyTask? record
      completeSequentialMultiInstanceInnerTask?
        { arm with limits := { arm.limits with maximumCanonicalCollectionUtf8Bytes := 8 } }
        state body
        [{ name := arm.data.taskDataOutputId, value := .string "Reviewed_3" }]) = none := by
  decide +kernel

/-- `SMI-REFUSE-01`: a submitted result longer than the item byte bound is refused.

The item bound needs its own completion-side refusal rather than following from the collection bound:
one oversized result among few can leave the array inside its own bound, so a collection measure alone
would store it. -/
theorem a_result_over_the_item_byte_bound_is_refused :
    (do
      let arm ← arm?
      let state ← entered?
      let record ← state.activityOccurrences.head?
      let body ← activityBodyTask? record
      completeSequentialMultiInstanceInnerTask?
        { arm with limits := { arm.limits with maximumItemUtf8Bytes := 4 } }
        state body
        [{ name := arm.data.taskDataOutputId, value := .string "Reviewed_1" }]) = none := by
  decide +kernel

/-- The candidate collection bound is inclusive, and one byte under the measure it is not met.

The complement that makes the two refusals above about their numbers rather than about a tightened arm
refusing everything. Stated over the predicate rather than over a completion because the positive
completion facts above already store results at the profile's own bounds, and a second entry chain
would be reduced here for a fact about one comparison. -/
theorem the_candidate_collection_byte_bound_is_inclusive :
    (do
      let arm ← arm?
      pure
        (withinSequentialMultiInstanceLimits
            { arm with limits := { arm.limits with maximumCanonicalCollectionUtf8Bytes := 14 } }
            ["Reviewed_1"],
          withinSequentialMultiInstanceLimits
            { arm with limits := { arm.limits with maximumCanonicalCollectionUtf8Bytes := 13 } }
            ["Reviewed_1"])) = some (true, false) := by
  decide +kernel

/-- The canonical measure counts the JSON array encoding, framing and separators included. -/
theorem the_canonical_collection_measure_counts_its_json_array_encoding :
    (canonicalCollectionUtf8Bytes [], canonicalCollectionUtf8Bytes ["a"],
        canonicalCollectionUtf8Bytes ["a", "b"], canonicalCollectionUtf8Bytes batch) =
      (2, 5, 9, 37) := by
  decide +kernel

end BpmnSemantics.SequentialMultiInstanceConformance
