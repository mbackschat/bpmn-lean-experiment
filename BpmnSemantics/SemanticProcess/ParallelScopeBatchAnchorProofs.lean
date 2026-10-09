import BpmnSemantics.SemanticProcess.ParallelScopeBatchReadinessProofs
import BpmnSemantics.SemanticProcess.InternalCommutation

/-! # Frozen batch anchor and local-frame preservation

PMIS-SELECT-01 reserves distinct public anchors before raw application.
These laws reuse that certificate to preserve later members' anchor reads;
they do not assume that a prefix revalidates or applies successfully.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

/-- Certificate-wide uniqueness separates every earlier arming write from the selected later anchor. -/
theorem preparedOccurrenceBatch_prefix_anchor_separation (program : Program) (state : RuntimeState)
    (batch : InternalOccurrenceBatch) (prepared : prepareInternalOccurrenceBatch? program state = some batch)
    (prior rest : List InternalOccurrencePatch) (arm : InternalArmingPatch)
    (splitBatch : batch.members = prior ++ .arm arm :: rest) :
    ∀ earlier, InternalOccurrencePatch.arm earlier ∈ prior → earlier.write.occurrence ≠ arm.write.occurrence := by
  have unique := prepareInternalOccurrenceBatch_distinct_anchors program state batch prepared
  rw [splitBatch, List.filterMap_append] at unique
  obtain ⟨_, _, disjoint⟩ := List.nodup_append.mp unique
  intro earlier present same
  exact disjoint _ (List.mem_filterMap.mpr ⟨.arm earlier, present, rfl⟩)
    _ (by simp [InternalOccurrencePatch.waitOccurrence?]) same

/-- Distinct reserved anchors preserve the exact absence read across all preceding raw patches. -/
theorem rawOccurrencePrefix_anchor_frame (state : RuntimeState) (prior : List InternalOccurrencePatch)
    (query : OccurrenceId)
    (separate : ∀ arm, InternalOccurrencePatch.arm arm ∈ prior → arm.write.occurrence ≠ query) :
    openWaitAnchorAbsent (prior.foldl (fun before patch => patch.apply before) state) query =
      openWaitAnchorAbsent state query := by
  induction prior generalizing state with
  | nil => rfl
  | cons member rest ih =>
      rw [List.foldl_cons, ih _ (fun arm present => separate arm (by simp [present]))]
      cases member with
      | token => rfl
      | arm arm => exact armingOpenAnchorRead_frame state arm query (separate arm (by simp))

/-- Service local-frame availability follows the same frozen public-anchor separation. -/
theorem rawOccurrencePrefix_available_frame (state : RuntimeState) (prior : List InternalOccurrencePatch)
    (write : InternalArmingWrite)
    (separate : ∀ arm, InternalOccurrencePatch.arm arm ∈ prior → arm.write.occurrence ≠ write.occurrence) :
    write.available (prior.foldl (fun before patch => patch.apply before) state) = write.available state := by
  cases write with
  | userTask | message | timer => rfl
  | effect wait bindings =>
      induction prior generalizing state with
      | nil => rfl
      | cons member rest ih =>
          rw [List.foldl_cons, ih _ (fun arm present => separate arm (by simp [present]))]
          cases member with
          | token => rfl
          | arm arm => exact effectAvailableRead_frame state arm wait bindings (separate arm (by simp))

/-- Actual frozen preparation and certificate separation keep later Human/Service anchor gates open. -/
theorem preparedOccurrenceBatch_prefix_anchor_gates (program : Program) (state : RuntimeState)
    (batch : InternalOccurrenceBatch) (prepared : prepareInternalOccurrenceBatch? program state = some batch)
    (prior rest : List InternalOccurrencePatch) (arm : InternalArmingPatch)
    (splitBatch : batch.members = prior ++ .arm arm :: rest) :
    openWaitAnchorAbsent (prior.foldl (fun before patch => patch.apply before) state) arm.write.occurrence = true ∧
      arm.write.available (prior.foldl (fun before patch => patch.apply before) state) = true := by
  obtain ⟨_, _, _, _, _, _, _, _, offers, _, trace, _⟩ :=
    prepareInternalOccurrenceBatch_certificate program state batch prepared
  have present : InternalOccurrencePatch.arm arm ∈ batch.members := by rw [splitBatch]; simp
  obtain ⟨_, initial⟩ := (trace.arm_prepared program state [] batch.members (offers.map Prod.fst) arm present).resolve_left (by simp)
  obtain ⟨_, _, _, _, _, _, _, _, _, _, _, _, _, _, absent, available⟩ :=
    ParallelScopeReplay.prepareReservedOccurrenceArm_gate_provenance program state _ _ arm initial
  have separate := preparedOccurrenceBatch_prefix_anchor_separation program state batch prepared prior rest arm splitBatch
  exact ⟨(rawOccurrencePrefix_anchor_frame state prior arm.write.occurrence separate).trans absent,
    (rawOccurrencePrefix_available_frame state prior arm.write separate).trans available⟩

/-- PMIS raw patches introduce only effect-local frames, preserving every activity-occurrence frame query. -/
theorem rawOccurrencePrefix_activity_frame (state : RuntimeState) (prior : List InternalOccurrencePatch)
    (query : ActivityOccurrenceId → Bool) :
    ((prior.foldl (fun before patch => patch.apply before) state).variables.activities.any fun frame =>
      match frame.owner with | .activityOccurrence id => query id | _ => false) =
    (state.variables.activities.any fun frame =>
      match frame.owner with | .activityOccurrence id => query id | _ => false) := by
  induction prior generalizing state with
  | nil => rfl
  | cons member rest ih =>
      rw [List.foldl_cons, ih]
      cases member with
      | token => rfl
      | arm arm =>
          cases write : arm.write <;> simp only [InternalOccurrencePatch.apply, applyInternalArmingPatch, write]
          case effect wait bindings =>
            simp only [List.any_eq_not_all_not, all_insertActivityVariableScope, Bool.not_false, Bool.true_and]

/-- Reserved patches cannot create Compensation waits; the scheduler's existing absence invariant survives raw prefixes. -/
theorem rawOccurrencePrefix_compensation_frame (state : RuntimeState) (prior : List InternalOccurrencePatch) :
    (prior.foldl (fun before patch => patch.apply before) state).compensationHandlerEffectWaits =
      state.compensationHandlerEffectWaits := by
  induction prior generalizing state with
  | nil => rfl
  | cons member rest ih =>
      rw [List.foldl_cons, ih]
      cases member with
      | token => rfl
      | arm arm => cases write : arm.write <;> simp only [InternalOccurrencePatch.apply, applyInternalArmingPatch, write]

/-- The take-indexed counter law applies to an exact member split without assuming prefix execution. -/
theorem preparedOccurrenceBatch_split_counters (program : Program) (state : RuntimeState)
    (batch : InternalOccurrenceBatch) (prepared : prepareInternalOccurrenceBatch? program state = some batch)
    (prior rest : List InternalOccurrencePatch) (splitBatch : batch.members = prior ++ rest) :
    ReservationCountersAgree state prior := by
  have counts := preparedOccurrenceBatch_prefix_counters program state batch prepared prior.length
  simpa only [splitBatch, List.take_left] using counts

/-- Frozen Human/Service slots are exactly the next native activation after their raw prefix, including shared-element cohorts. -/
theorem preparedOccurrenceBatch_prefix_next_activation (program : Program) (state : RuntimeState)
    (batch : InternalOccurrenceBatch) (prepared : prepareInternalOccurrenceBatch? program state = some batch)
    (prior rest : List InternalOccurrencePatch) (arm : InternalArmingPatch)
    (splitBatch : batch.members = prior ++ .arm arm :: rest) :
    let current := prior.foldl (fun before patch => patch.apply before) state
    match arm.write with
    | .userTask wait => wait.activation = activationCount current wait.task.id + 1
    | .effect wait _ => wait.activation = effectActivationCount current wait.elementId + 1
    | _ => False := by
  let current := prior.foldl (fun before patch => patch.apply before) state
  have before := preparedOccurrenceBatch_split_counters program state batch prepared prior (.arm arm :: rest) splitBatch
  have after := preparedOccurrenceBatch_split_counters program state batch prepared (prior ++ [.arm arm]) rest
    (by simpa only [List.append_assoc, List.singleton_append] using splitBatch)
  obtain ⟨_, _, _, _, _, _, _, _, offers, _, trace, _⟩ :=
    prepareInternalOccurrenceBatch_certificate program state batch prepared
  have present : InternalOccurrencePatch.arm arm ∈ batch.members := by rw [splitBatch]; simp
  obtain ⟨_, initial⟩ := (trace.arm_prepared program state [] batch.members (offers.map Prod.fst) arm present).resolve_left (by simp)
  obtain ⟨_, operation, _, _, _, _, _, _, _, _, _, _, _, shape, _, _⟩ :=
    ParallelScopeReplay.prepareReservedOccurrenceArm_gate_provenance program state _ _ arm initial
  have supported : arm.write.kind = .userTask ∨ arm.write.kind = .effect := by
    cases operation <;> simp only [ParallelScopeReplay.ReservedArmWriteShape] at shape <;> try contradiction
    case awaitUserTask => rw [shape]; exact Or.inl rfl
    case awaitEffect => obtain ⟨_, _, same⟩ := shape; rw [same]; exact Or.inr rfl
  change (∀ task, activationCount current task = _) ∧ (∀ element, effectActivationCount current element = _) at before
  unfold ReservationCountersAgree at after
  simp only [List.foldl_append, List.foldl_cons, List.foldl_nil] at after
  cases write : arm.write with
  | userTask wait =>
      have count := after.1 wait.task.id
      simp only [InternalOccurrencePatch.apply, applyInternalArmingPatch, write] at count
      change activationCount { current with activations := setActivationCount current.activations wait.task.id wait.activation } wait.task.id = _ at count
      rw [activationCount_setActivationCount_self] at count
      change wait.activation = activationCount current wait.task.id + 1
      rw [count, before.1]
      simp [reservedCohortSize, List.filter_append, write, InternalArmingWrite.kind, InternalArmingWrite.elementId, Nat.add_assoc]
  | effect wait bindings =>
      have count := after.2 wait.elementId
      simp only [InternalOccurrencePatch.apply, applyInternalArmingPatch, write] at count
      change effectActivationCount { current with effectActivations := setEffectActivationCount current.effectActivations wait.elementId wait.activation } wait.elementId = _ at count
      rw [effectActivationCount_set_self] at count
      change wait.activation = effectActivationCount current wait.elementId + 1
      rw [count, before.2]
      simp [reservedCohortSize, List.filter_append, write, InternalArmingWrite.kind, InternalArmingWrite.elementId, Nat.add_assoc]
  | message | timer => simp [write, InternalArmingWrite.kind] at supported

/-- Under the scheduler's Compensation absence invariant, every accepted raw prefix retains reservation validity. -/
theorem preparedOccurrenceBatch_prefix_reservation_valid (program : Program) (state : RuntimeState)
    (batch : InternalOccurrenceBatch) (prepared : prepareInternalOccurrenceBatch? program state = some batch)
    (wellFormed : programWellFormed program = true) (noCompensation : state.compensationHandlerEffectWaits = [])
    (prior rest : List InternalOccurrencePatch) (splitBatch : batch.members = prior ++ rest) :
    occurrenceReservationStateValid (prior.foldl (fun before patch => patch.apply before) state) = true := by
  have reversedValid (reversed : List InternalOccurrencePatch) : ∀ rest,
      batch.members = reversed.reverse ++ rest →
        occurrenceReservationStateValid (reversed.reverse.foldl (fun before patch => patch.apply before) state) = true := by
    induction reversed with
    | nil =>
        intro rest splitBatch
        exact (prepareInternalOccurrenceBatch_certificate program state batch prepared).2.2.1
    | cons member reversed ih =>
        intro rest splitBatch
        simp only [List.reverse_cons] at splitBatch ⊢
        have splitHead : batch.members = reversed.reverse ++ member :: rest := by
          simpa only [List.append_assoc, List.singleton_append] using splitBatch
        have valid := ih (member :: rest) splitHead
        simp only [List.foldl_append, List.foldl_cons, List.foldl_nil]
        cases member with
        | token patch => exact valid
        | arm arm =>
            obtain ⟨_, positive, safe, nonempty, _⟩ :=
              preparedOccurrenceBatch_arm_provenance program state batch prepared wellFormed reversed.reverse rest arm splitHead
            obtain ⟨absent, available⟩ := preparedOccurrenceBatch_prefix_anchor_gates program state batch prepared reversed.reverse rest arm splitHead
            have next := preparedOccurrenceBatch_prefix_next_activation program state batch prepared reversed.reverse rest arm splitHead
            apply applyInternalArmingPatch_reservation_valid _ arm valid nonempty positive safe
            · cases write : arm.write <;> simp only [write] at next ⊢ <;> omega
            · rw [rawOccurrencePrefix_compensation_frame, noCompensation]
              simpa [openWaitAnchorAbsent, List.contains_eq_mem] using absent
            · exact available
  simpa only [List.reverse_reverse] using reversedValid prior.reverse rest (by simpa only [List.reverse_reverse] using splitBatch)

end BpmnSemantics.SemanticProcess.InternalCommutation
