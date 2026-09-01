import BpmnSemantics.SequentialMultiInstanceConformanceFixtures

/-! # Sequential Multi-Instance refusal conformance

Admission, identity, deadline, and resource-bound refusals for the shared Sequential Multi-Instance
fixture chain.
-/

namespace BpmnSemantics.SequentialMultiInstanceConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess
open BpmnSemantics.SequentialMultiInstanceProgramBindingConformance

set_option synthInstance.maxSize 2000

/-! ## The refusals

Each perturbs exactly one fact of a state or stimulus the positive facts above showed to be admitted,
so a refusal is attributable to its own perturbation. Every one of them commits nothing: the evaluator
answers `none`, and the caller's committed state is what it was.
-/

/-- Replacing the Process input reference by its backing DataObject makes the exact source-bound
entry fail. The runtime may not infer one identity from the other. -/
theorem a_runtime_arm_that_looks_up_the_backing_input_object_is_refused :
    (do
      let operation ← sequentialMultiInstanceOperationForTask?
        dataObjectInputProgram ⟨"UserTask_Review"⟩
      let arm ← SequentialMultiInstanceArm.ofOperation? operation
      let state ← preEntry?
      enterSequentialMultiInstance? arm state) = none := by
  decide +kernel

/-- The exact profile admits Process-start `StringList`, not a scalar String. -/
theorem a_scalar_process_start_binding_is_refused :
    (applyStimulus scenarioClosureLimit program initialState
      (.startProcess ⟨"wrong-start-value-kind"⟩
        ⟨"Process_SequentialMultiInstanceReview"⟩ instanceId
        [{ name := "DataObjectReference_InputItems", value := .string "Invoice_1" }])).outcome =
      .rejected := by
  decide +kernel

/-- A result named by the wrong binding is refused, even for the right task at the right time. -/
theorem a_result_under_the_wrong_output_binding_name_is_refused :
    (do
      let arm ← arm?
      let state ← entered?
      let record ← state.activityOccurrences.head?
      let body ← activityBodyTask? record
      completeSequentialMultiInstanceInnerTask? arm state body
        [{ name := arm.data.inputDataObjectReferenceId, value := .string "Reviewed_1" }]) = none := by
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
      let timer ← record.timerHandlerOccurrences.head?
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
tightened ones the refusals below use. Stated over an arbitrary maximal escape-free result so it needs
no five-hundred-and-twelve-byte literal: sixteen items are exactly `maximumItems`, each is exactly
`maximumItemUtf8Bytes`, and their canonical array measures 8241 against a declared 8192. Entry admits
such a snapshot, every submitted result is individually admissible, and the collection is over the
bound only once the last slot is filled, which is why an entry-side or item-only measure cannot refuse
it. -/
theorem sixteen_results_at_the_item_byte_bound_cross_the_canonical_collection_bound
    (result : String) (maximal : result.utf8ByteSize = profileLimits.maximumItemUtf8Bytes)
    (canonical : canonicalJsonStringUtf8Bytes result =
      profileLimits.maximumItemUtf8Bytes + 2) :
    result.utf8ByteSize = profileLimits.maximumItemUtf8Bytes ∧
      (maximalOutputCollection result).length = profileLimits.maximumItems ∧
      canonicalCollectionUtf8Bytes (maximalOutputCollection result) = 8241 ∧
      profileLimits.maximumCanonicalCollectionUtf8Bytes <
        canonicalCollectionUtf8Bytes (maximalOutputCollection result) := by
  refine ⟨maximal, rfl, ?_, ?_⟩ <;>
    simp only [maximalOutputCollection, canonicalCollectionUtf8Bytes,
      canonicalJsonStringCollectionUtf8Bytes, canonical, List.foldl_cons, List.foldl_nil,
      profileLimits] <;>
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
