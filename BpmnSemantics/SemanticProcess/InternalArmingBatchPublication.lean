import BpmnSemantics.SemanticProcess.InternalArmingBatch
import BpmnSemantics.SemanticProcess.InternalDataArmingPairPublication

/-! Actual accepted bundles remain defined and canonical through every independent finite prefix. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

def preparedArmingPublication? (program : Program) (instanceId commandId : SemanticId)
    (state : RuntimeState) (prepared : PreparedInternalArming) :
    Option AcceptedInternalPublicationPair :=
  acceptedInternalPublicationForFootprint? program instanceId state (prepared.apply state)
    prepared.operation commandId prepared.footprint

def runPreparedArmingBatch? (program : Program) (instanceId commandId : SemanticId)
    (state : RuntimeState) : List PreparedInternalArming →
    Option (RuntimeState × List AcceptedInternalPublicationPair)
  | [] => some (state, [])
  | head :: tail => do
      let next ← applyPreparedInternalArming? program state head
      let publication ← acceptedInternalPublicationForFootprint? program instanceId state next
        head.operation commandId head.footprint
      let (final, publications) ← runPreparedArmingBatch? program instanceId commandId next tail
      return (final, publication :: publications)

def acceptedPreparedArmingBatch? (program : Program) (instanceId commandId : SemanticId)
    (firstTransitionIndex : Nat) (state : RuntimeState) (prepared : List PreparedInternalArming) :
    Option (RuntimeState × List NumberedInternalPublicationPair) := do
  let (final, publications) ← runPreparedArmingBatch? program instanceId commandId state prepared
  return (final, numberInternalPublicationPairs firstTransitionIndex
    (canonicalAcceptedInternalPublicationPairs publications))

theorem prepared_arming_applies (program : Program) (state : RuntimeState)
    (prepared : PreparedInternalArming)
    (snapshotAbsent : program.compensationEventSubProcessSnapshots = none)
    (selected : prepared.Prepared program state) :
    fire? program prepared.operation state = some (prepared.apply state) ∧
      applyPreparedInternalArming? program state prepared = some (prepared.apply state) := by
  constructor
  · cases prepared with
    | ordinary operation patch =>
        exact prepareInternalArm_applies program state operation patch snapshotAbsent selected
    | data contract patch =>
        exact prepareInternalDataArmingContract_applies program state contract patch snapshotAbsent
          selected
  · simp [applyPreparedInternalArming?, snapshotAbsent, selected]

theorem prepared_arming_time_frame (state : RuntimeState) (prepared : PreparedInternalArming) :
    (prepared.apply state).logicalTimeMs = state.logicalTimeMs := by
  cases prepared with
  | ordinary _ patch => exact armingTimeRead_frame state patch
  | data _ patch => exact armingTimeRead_frame state patch.arm

theorem prepared_arming_start_frame (program : Program) (state : RuntimeState)
    (prepared : PreparedInternalArming) (owner : ScopeOccurrenceId) (element : NodeId)
    (activation : Nat) :
    waitStart? program (prepared.apply state) owner element activation =
      waitStart? program state owner element activation := by
  cases prepared with
  | ordinary _ patch => exact armingWaitStart_frame program state patch owner element activation
  | data _ patch => exact dataArmingWaitStart_frame program state patch owner element activation

theorem prepared_arming_publication_frame (program : Program) (instanceId commandId : SemanticId)
    (before after : RuntimeState) (prepared : PreparedInternalArming)
    (programValid : programWellFormed program = true)
    (beforeValid : runtimeStateWellFormed program instanceId before = true)
    (afterValid : runtimeStateWellFormed program instanceId after = true)
    (openBefore : (projectOpenFlowNodeOccurrences? program before).isSome = true)
    (openAfter : (projectOpenFlowNodeOccurrences? program after).isSome = true)
    (beforePrepared : prepared.Prepared program before)
    (afterPrepared : prepared.Prepared program after)
    (timeFrame : after.logicalTimeMs = before.logicalTimeMs)
    (startFrame : ∀ owner element activation,
      waitStart? program after owner element activation =
        waitStart? program before owner element activation) :
    ∃ publication,
      publication.pair.footprint = prepared.footprint ∧
      preparedArmingPublication? program instanceId commandId before prepared = some publication ∧
      preparedArmingPublication? program instanceId commandId after prepared = some publication := by
  cases prepared with
  | ordinary operation patch =>
      exact prepared_ordinary_publication_frame program instanceId commandId before after operation
        patch programValid beforeValid afterValid openBefore openAfter beforePrepared afterPrepared
        timeFrame (startFrame _ _ _)
  | data contract patch =>
      exact prepared_data_publication_frame program instanceId commandId before after contract patch
        programValid beforeValid afterValid openBefore openAfter beforePrepared afterPrepared
        timeFrame (startFrame _ _ _)

theorem prepared_arming_publication_defined (program : Program) (instanceId commandId : SemanticId)
    (state : RuntimeState) (prepared : PreparedInternalArming)
    (programValid : programWellFormed program = true)
    (stateValid : runtimeStateWellFormed program instanceId state = true)
    (openBefore : (projectOpenFlowNodeOccurrences? program state).isSome = true)
    (selected : prepared.Prepared program state) :
    ∃ publication,
      publication.pair.footprint = prepared.footprint ∧
      preparedArmingPublication? program instanceId commandId state prepared = some publication := by
  obtain ⟨publication, footprint, accepted, _⟩ := prepared_arming_publication_frame program
    instanceId commandId state state prepared programValid stateValid stateValid openBefore openBefore
    selected selected rfl (fun _ _ _ => rfl)
  exact ⟨publication, footprint, accepted⟩

private theorem mapM_option_congr_on (left right : α → Option β) (values : List α)
    (same : ∀ value ∈ values, left value = right value) :
    values.mapM left = values.mapM right := by
  induction values with
  | nil => rfl
  | cons head tail ih =>
      simp only [List.mapM_cons, same head (by simp),
        ih (fun value present => same value (by simp [present]))]

/-- Every accepted bundle equals its complete predecessor bundle; neither projection is assumed. -/
theorem prepared_arming_batch_publications (program : Program) (instanceId commandId : SemanticId)
    (state : RuntimeState) (prepared : List PreparedInternalArming)
    (programValid : programWellFormed program = true)
    (stateValid : runtimeStateWellFormed program instanceId state = true)
    (openBefore : (projectOpenFlowNodeOccurrences? program state).isSome = true)
    (snapshotAbsent : program.compensationEventSubProcessSnapshots = none)
    (selected : PreparedArmingList program state prepared)
    (independent : prepared.Pairwise PreparedInternalArming.Independent) :
    ∃ publications,
      prepared.mapM (preparedArmingPublication? program instanceId commandId state) =
        some publications ∧
      runPreparedArmingBatch? program instanceId commandId state prepared =
        some (applyInternalArmingBatch state prepared, publications) := by
  induction prepared generalizing state with
  | nil => exact ⟨[], rfl, rfl⟩
  | cons head tail ih =>
      have headPrepared := selected head (by simp)
      have valid := prepared_arming_preserves program state head instanceId programValid
        stateValid openBefore headPrepared
      have canonical := runtimeStateWellFormed_canonicalCollectionOrder program instanceId state
        stateValid
      have remaining := prepared_arming_tail program state head tail selected canonical independent
      obtain ⟨publications, tailMap, tailRun⟩ := ih (head.apply state) valid.1 valid.2 remaining
        (List.pairwise_cons.mp independent).2
      have mapFrame : tail.mapM (preparedArmingPublication? program instanceId commandId state) =
          tail.mapM (preparedArmingPublication? program instanceId commandId (head.apply state)) := by
        apply mapM_option_congr_on
        intro member present
        obtain ⟨publication, _, beforeEq, afterEq⟩ := prepared_arming_publication_frame program
          instanceId commandId state (head.apply state) member programValid stateValid valid.1
          openBefore valid.2 (selected member (by simp [present])) (remaining member present)
          (prepared_arming_time_frame state head) (prepared_arming_start_frame program state head)
        exact beforeEq.trans afterEq.symm
      obtain ⟨publication, _, accepted⟩ := prepared_arming_publication_defined program instanceId
        commandId state head programValid stateValid openBefore headPrepared
      refine ⟨publication :: publications, ?_, ?_⟩
      · simp [List.mapM_cons, accepted, mapFrame, tailMap]
      · have applied := (prepared_arming_applies program state head snapshotAbsent headPrepared).2
        simp only [runPreparedArmingBatch?, applied]
        change (do
          let current ← preparedArmingPublication? program instanceId commandId state head
          let (final, rest) ← runPreparedArmingBatch? program instanceId commandId
            (head.apply state) tail
          pure (final, current :: rest)) = _
        simp [accepted, tailRun, applyInternalArmingBatch]

theorem prepared_arming_footprint_id (program : Program) (state : RuntimeState)
    (prepared : PreparedInternalArming) (selected : prepared.Prepared program state) :
    prepared.footprint.operationId = prepared.operation.id := by
  cases prepared with
  | ordinary operation patch =>
      exact congrArg SemanticOperation.id (prepared_operation_eq program state operation patch selected)
  | data contract patch =>
      exact congrArg SemanticOperation.id (prepared_data_operation_eq program state contract patch selected)

theorem prepared_arming_ids_ne (program : Program) (state : RuntimeState)
    (left right : PreparedInternalArming) (programValid : programWellFormed program = true)
    (leftPrepared : left.Prepared program state) (rightPrepared : right.Prepared program state)
    (independent : left.Independent right) : left.operation.id ≠ right.operation.id := by
  cases left with
  | ordinary leftOperation leftPatch =>
      cases right with
      | ordinary rightOperation rightPatch =>
          intro sameId
          have sameOperation := internalTransitionRecords_same_id_same_operation program state
            leftOperation rightOperation _ _
            (internalTransitionRecord_prepared program state leftOperation leftPatch
              programValid leftPrepared)
            (internalTransitionRecord_prepared program state rightOperation rightPatch
              programValid rightPrepared) sameId
          change prepareInternalArm? program state leftOperation = some leftPatch at leftPrepared
          change prepareInternalArm? program state rightOperation = some rightPatch at rightPrepared
          rw [sameOperation] at leftPrepared
          have samePatch := Option.some.inj (leftPrepared.symm.trans rightPrepared)
          exact noninterfering_occurrence_ne leftPatch rightPatch independent.1
            (congrArg (fun patch => patch.write.occurrence) samePatch)
      | data contract patch =>
          exact Ne.symm (prepared_data_ordinary_operation_ids_ne program state contract patch
            leftOperation leftPatch programValid rightPrepared leftPrepared)
  | data leftContract leftPatch =>
      cases right with
      | ordinary operation patch =>
          exact prepared_data_ordinary_operation_ids_ne program state leftContract leftPatch
            operation patch programValid leftPrepared rightPrepared
      | data rightContract rightPatch =>
          intro sameId
          have sameOperation := internalTransitionRecords_same_id_same_operation program state
            leftContract.operation rightContract.operation _ _
            (internalTransitionRecord_prepared_data program state leftContract leftPatch
              programValid leftPrepared)
            (internalTransitionRecord_prepared_data program state rightContract rightPatch
              programValid rightPrepared) sameId
          have sameContract : leftContract = rightContract :=
            Option.some.inj (congrArg dataArmingContract? sameOperation)
          exact (noninterfering_data_inputs_and_tasks_ne program state leftContract rightContract
            leftPatch rightPatch leftPrepared rightPrepared independent.1).2
            (congrArg (fun contract => contract.taskId) sameContract)

private theorem filterMap_eq_of_mapM_some (function : α → Option β) (values : List α)
    (results : List β) (mapped : values.mapM function = some results) :
    values.filterMap function = results := by
  induction values generalizing results with
  | nil => simpa using mapped
  | cons head tail ih =>
      cases headEq : function head with
      | none => simp [List.mapM_cons, headEq] at mapped
      | some result =>
          cases tailEq : tail.mapM function with
          | none => simp [List.mapM_cons, headEq, tailEq] at mapped
          | some rest =>
              simp [List.mapM_cons, headEq, tailEq] at mapped
              rw [← mapped]
              simp [headEq, ih rest tailEq]

private theorem prepared_publication_id (program : Program) (instanceId commandId : SemanticId)
    (state : RuntimeState) (prepared : PreparedInternalArming)
    (publication : AcceptedInternalPublicationPair)
    (programValid : programWellFormed program = true)
    (stateValid : runtimeStateWellFormed program instanceId state = true)
    (openBefore : (projectOpenFlowNodeOccurrences? program state).isSome = true)
    (selected : prepared.Prepared program state)
    (accepted : preparedArmingPublication? program instanceId commandId state prepared =
      some publication) : publication.pair.footprint.operationId = prepared.operation.id := by
  obtain ⟨actual, footprint, actualEq⟩ := prepared_arming_publication_defined program instanceId
    commandId state prepared programValid stateValid openBefore selected
  rw [accepted] at actualEq
  cases actualEq
  rw [footprint]
  exact prepared_arming_footprint_id program state prepared selected

private theorem prepared_arming_batch_publication_lists_perm (program : Program)
    (instanceId commandId : SemanticId) (state : RuntimeState)
    (left right : List PreparedInternalArming)
    (programValid : programWellFormed program = true)
    (stateValid : runtimeStateWellFormed program instanceId state = true)
    (openBefore : (projectOpenFlowNodeOccurrences? program state).isSome = true)
    (snapshotAbsent : program.compensationEventSubProcessSnapshots = none)
    (selected : PreparedArmingList program state left)
    (independent : left.Pairwise PreparedInternalArming.Independent)
    (permutation : left.Perm right) :
    ∃ leftPublications rightPublications,
      runPreparedArmingBatch? program instanceId commandId state left =
        some (applyInternalArmingBatch state left, leftPublications) ∧
      runPreparedArmingBatch? program instanceId commandId state right =
        some (applyInternalArmingBatch state left, rightPublications) ∧
      canonicalAcceptedInternalPublicationPairs leftPublications =
        canonicalAcceptedInternalPublicationPairs rightPublications := by
  have rightSelected : PreparedArmingList program state right :=
    fun member present => selected member (permutation.mem_iff.mpr present)
  have rightIndependent := independent.perm permutation PreparedInternalArming.independent_symm
  obtain ⟨leftPublications, leftMap, leftRun⟩ := prepared_arming_batch_publications program instanceId
    commandId state left programValid stateValid openBefore snapshotAbsent selected independent
  obtain ⟨rightPublications, rightMap, rightRun⟩ := prepared_arming_batch_publications program instanceId
    commandId state right programValid stateValid openBefore snapshotAbsent rightSelected rightIndependent
  have leftFilter := filterMap_eq_of_mapM_some _ _ _ leftMap
  have rightFilter := filterMap_eq_of_mapM_some _ _ _ rightMap
  have publicationPerm : leftPublications.Perm rightPublications := by
    rw [← leftFilter, ← rightFilter]
    exact permutation.filterMap _
  have distinct : leftPublications.Pairwise (fun first second =>
      first.pair.footprint.operationId ≠ second.pair.footprint.operationId) := by
    rw [← leftFilter, List.pairwise_filterMap]
    apply List.Pairwise.imp_of_mem _ independent
    intro first second firstMember secondMember separated firstPublication firstAccepted
      secondPublication secondAccepted
    rw [prepared_publication_id program instanceId commandId state first firstPublication
      programValid stateValid openBefore (selected first firstMember) firstAccepted,
      prepared_publication_id program instanceId commandId state second secondPublication
        programValid stateValid openBefore (selected second secondMember) secondAccepted]
    exact prepared_arming_ids_ne program state first second programValid
      (selected first firstMember) (selected second secondMember) separated
  have sorted := canonicalAcceptedInternalPublicationPairs_perm leftPublications rightPublications
    distinct publicationPerm
  have stateEq := prepared_arming_batch_perm program state left right instanceId programValid
    stateValid openBefore selected independent permutation
  exact ⟨leftPublications, rightPublications, leftRun, by simpa [stateEq] using rightRun, sorted⟩

/-- Canonical, defined E1/E2 publication and raw state agree for every finite independent order. -/
theorem prepared_arming_batch_publication_perm (program : Program)
    (instanceId commandId : SemanticId) (firstTransitionIndex : Nat) (state : RuntimeState)
    (left right : List PreparedInternalArming)
    (programValid : programWellFormed program = true)
    (stateValid : runtimeStateWellFormed program instanceId state = true)
    (openBefore : (projectOpenFlowNodeOccurrences? program state).isSome = true)
    (snapshotAbsent : program.compensationEventSubProcessSnapshots = none)
    (selected : PreparedArmingList program state left)
    (independent : left.Pairwise PreparedInternalArming.Independent)
    (permutation : left.Perm right) :
    ∃ final publications,
      runtimeStateWellFormed program instanceId final = true ∧
      (projectOpenFlowNodeOccurrences? program final).isSome = true ∧
      canonicalCollectionOrder final = true ∧
      acceptedPreparedArmingBatch? program instanceId commandId firstTransitionIndex state left =
        some (final, publications) ∧
      acceptedPreparedArmingBatch? program instanceId commandId firstTransitionIndex state right =
        some (final, publications) := by
  obtain ⟨leftPublications, rightPublications, leftRun, rightRun, sorted⟩ :=
    prepared_arming_batch_publication_lists_perm program instanceId commandId state left right
      programValid stateValid openBefore snapshotAbsent selected independent permutation
  have finalValid := prepared_arming_batch_preserves program state left instanceId programValid
    stateValid openBefore selected independent
  refine ⟨applyInternalArmingBatch state left,
    numberInternalPublicationPairs firstTransitionIndex
      (canonicalAcceptedInternalPublicationPairs leftPublications), finalValid.1, finalValid.2,
    runtimeStateWellFormed_canonicalCollectionOrder program instanceId _ finalValid.1, ?_, ?_⟩
  · simp [acceptedPreparedArmingBatch?, leftRun]
  · simp [acceptedPreparedArmingBatch?, rightRun, ← sorted]

theorem runPreparedArmingBatch_erases_to_evaluator (program : Program)
    (instanceId commandId : SemanticId) (state : RuntimeState)
    (prepared : List PreparedInternalArming) (final : RuntimeState)
    (publications : List AcceptedInternalPublicationPair)
    (ran : runPreparedArmingBatch? program instanceId commandId state prepared =
      some (final, publications)) :
    fireInternalBatch? program commandId state prepared =
      some { state := final, publications := publications.map (·.pair) } := by
  induction prepared generalizing state final publications with
  | nil =>
      simp only [runPreparedArmingBatch?, Option.some.injEq, Prod.mk.injEq] at ran
      obtain ⟨rfl, rfl⟩ := ran
      rfl
  | cons head tail ih =>
      simp only [runPreparedArmingBatch?] at ran
      obtain ⟨next, applied, ran⟩ := Option.bind_eq_some_iff.mp ran
      obtain ⟨publication, accepted, ran⟩ := Option.bind_eq_some_iff.mp ran
      obtain ⟨⟨last, rest⟩, tailRan, ran⟩ := Option.bind_eq_some_iff.mp ran
      cases ran
      have pairAccepted : internalPublicationPairForFootprint? program state next head.operation
          commandId head.footprint = some publication.pair := by
        unfold acceptedInternalPublicationForFootprint? at accepted
        obtain ⟨pair, pairFound, accepted⟩ := Option.bind_eq_some_iff.mp accepted
        obtain ⟨position, _, accepted⟩ := Option.bind_eq_some_iff.mp accepted
        cases accepted
        exact pairFound
      simp [fireInternalBatch?, applied, pairAccepted, ih next last rest tailRan]

/-- The production batch fold inherits raw-state and complete record/lifecycle order equality. -/
theorem prepared_arming_evaluator_batch_perm (program : Program)
    (instanceId commandId : SemanticId) (state : RuntimeState)
    (left right : List PreparedInternalArming)
    (programValid : programWellFormed program = true)
    (stateValid : runtimeStateWellFormed program instanceId state = true)
    (openBefore : (projectOpenFlowNodeOccurrences? program state).isSome = true)
    (snapshotAbsent : program.compensationEventSubProcessSnapshots = none)
    (selected : PreparedArmingList program state left)
    (independent : left.Pairwise PreparedInternalArming.Independent)
    (permutation : left.Perm right) :
    ∃ final leftPublications rightPublications,
      fireInternalBatch? program commandId state left =
        some { state := final, publications := leftPublications } ∧
      fireInternalBatch? program commandId state right =
        some { state := final, publications := rightPublications } ∧
      canonicalPublicationPairs leftPublications = canonicalPublicationPairs rightPublications := by
  obtain ⟨leftPublications, rightPublications, leftRun, rightRun, sorted⟩ :=
    prepared_arming_batch_publication_lists_perm program instanceId commandId state left right
      programValid stateValid openBefore snapshotAbsent selected independent permutation
  refine ⟨applyInternalArmingBatch state left, leftPublications.map (·.pair),
    rightPublications.map (·.pair),
    runPreparedArmingBatch_erases_to_evaluator program instanceId commandId state left _ _ leftRun,
    runPreparedArmingBatch_erases_to_evaluator program instanceId commandId state right _ _ rightRun, ?_⟩
  rw [← canonicalAcceptedInternalPublicationPairs_map_pair,
    ← canonicalAcceptedInternalPublicationPairs_map_pair, sorted]

end BpmnSemantics.SemanticProcess.InternalCommutation
