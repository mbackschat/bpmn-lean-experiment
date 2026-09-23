import BpmnSemantics.SemanticProcess.InternalSnapshotArming
import BpmnSemantics.SemanticProcess.InternalSnapshotArmingRefinement
import BpmnSemantics.SemanticProcess.InternalSnapshotArmingPublication

/-! Ordinary snapshot-aware pair laws lift to finite prefixes with defined canonical accepted publication. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

def SnapshotPrepared (program : Program) (state : RuntimeState) : PreparedInternalArming → Prop
  | .ordinary operation patch =>
      prepareInternalArm? program state operation = some patch ∧
        snapshotArmingAnchorFresh program state patch = true
  | .data _ _ => False

theorem snapshot_prepared_base (program : Program) (state : RuntimeState)
    (prepared : PreparedInternalArming) (selected : SnapshotPrepared program state prepared) :
    prepared.Prepared program state := by
  cases prepared with
  | ordinary operation patch => exact selected.1
  | data _ _ => contradiction

theorem snapshot_prepared_fresh (program : Program) (state : RuntimeState)
    (patch : InternalArmingPatch) (fresh : snapshotArmingAnchorFresh program state patch = true)
    (compensation : List OpenSemanticFlowNodeOccurrence)
    (projected : projectOpenCompensationFlowNodeOccurrences? program state = some compensation) :
    SemanticFlowNodeOccurrenceAnchor.wait patch.write.occurrence ∉ compensation.map (·.anchor) := by
  simpa [snapshotArmingAnchorFresh, projected] using fresh

theorem snapshot_prepared_selection (program : Program) (state : RuntimeState)
    (prepared : PreparedInternalArming) (selected : SnapshotPrepared program state prepared) :
    prepareSnapshotArming? program state prepared.operation = some prepared := by
  cases prepared with
  | ordinary operation patch =>
      simp [prepareSnapshotArming?, PreparedInternalArming.operation, selected.1, selected.2]
  | data _ _ => contradiction

theorem prepareSnapshotArming_sound (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (prepared : PreparedInternalArming)
    (selected : prepareSnapshotArming? program state operation = some prepared) :
    SnapshotPrepared program state prepared ∧ prepared.operation = operation := by
  unfold prepareSnapshotArming? at selected
  obtain ⟨patch, patchEq, selected⟩ := Option.bind_eq_some_iff.mp selected
  split at selected
  · next fresh =>
      cases selected
      exact ⟨⟨patchEq, fresh⟩, rfl⟩
  · contradiction

theorem snapshot_prepared_applies (program : Program) (state : RuntimeState)
    (prepared : PreparedInternalArming) (instanceId : SemanticId)
    (stateValid : runtimeStateWellFormed program instanceId state = true)
    (selected : SnapshotPrepared program state prepared) :
    applyPreparedSnapshotArming? program state prepared = some (prepared.apply state) := by
  have selectedAgain := snapshot_prepared_selection program state prepared selected
  cases prepared with
  | ordinary operation patch =>
      have actual := prepareInternalArm_attempt_applies program state operation patch instanceId
        stateValid selected.1
      simp only [PreparedInternalArming.operation] at selectedAgain
      simp [applyPreparedSnapshotArming?, selectedAgain, PreparedInternalArming.operation,
        actual, PreparedInternalArming.apply]
  | data _ _ => contradiction

theorem snapshot_prepared_frame (program : Program) (state : RuntimeState)
    (left right : PreparedInternalArming) (instanceId : SemanticId)
    (stateValid : runtimeStateWellFormed program instanceId state = true)
    (leftSelected : SnapshotPrepared program state left)
    (rightSelected : SnapshotPrepared program state right)
    (independent : left.Independent right) :
    SnapshotPrepared program (left.apply state) right := by
  have rawFrame := (prepared_arming_pair program state left right
    (snapshot_prepared_base program state left leftSelected)
    (snapshot_prepared_base program state right rightSelected)
    (runtimeStateWellFormed_canonicalCollectionOrder program instanceId state stateValid)
    independent).1
  cases left with
  | data _ _ => contradiction
  | ordinary leftOperation leftPatch =>
      cases right with
      | data _ _ => contradiction
      | ordinary rightOperation rightPatch =>
          refine ⟨rawFrame, ?_⟩
          have projectedFrame := prepared_arm_compensation_open_frame program state leftOperation
            leftPatch instanceId stateValid leftSelected.1
          change snapshotArmingAnchorFresh program (applyInternalArmingPatch state leftPatch)
            rightPatch = true
          unfold snapshotArmingAnchorFresh
          rw [projectedFrame]
          exact rightSelected.2

theorem snapshot_prepared_preserves (program : Program) (state : RuntimeState)
    (prepared : PreparedInternalArming) (instanceId : SemanticId)
    (programValid : programWellFormed program = true)
    (stateValid : runtimeStateWellFormed program instanceId state = true)
    (openBefore : (projectOpenFlowNodeOccurrencesWithCompensation? program state).isSome = true)
    (selected : SnapshotPrepared program state prepared) :
    runtimeStateWellFormed program instanceId (prepared.apply state) = true ∧
      (projectOpenFlowNodeOccurrencesWithCompensation? program (prepared.apply state)).isSome = true := by
  cases projected : projectOpenFlowNodeOccurrencesWithCompensation? program state with
  | none => simp [projected] at openBefore
  | some current =>
      cases prepared with
      | data _ _ => contradiction
      | ordinary operation patch =>
          obtain ⟨newStart, _, afterProjected, valid⟩ := prepared_arm_focused_open_projection_exact
            program state operation patch instanceId current programValid stateValid projected
            selected.1 (snapshot_prepared_fresh program state patch selected.2)
          exact ⟨valid, by simp only [PreparedInternalArming.apply, afterProjected, Option.isSome_some]⟩

theorem snapshot_open_implies_base (program : Program) (state : RuntimeState)
    (programValid : programWellFormed program = true)
    (opened : (projectOpenFlowNodeOccurrencesWithCompensation? program state).isSome = true) :
    (projectOpenFlowNodeOccurrences? program state).isSome = true := by
  cases currentEq : projectOpenFlowNodeOccurrencesWithCompensation? program state with
  | none => simp [currentEq] at opened
  | some current =>
      obtain ⟨ordinary, _, ordinaryEq, _, _, _⟩ :=
        focused_open_projection_parts program state current programValid currentEq
      simp [ordinaryEq]

def SnapshotPreparedList (program : Program) (state : RuntimeState)
    (prepared : List PreparedInternalArming) : Prop :=
  ∀ member ∈ prepared, SnapshotPrepared program state member

theorem snapshot_prepared_tail (program : Program) (state : RuntimeState)
    (head : PreparedInternalArming) (tail : List PreparedInternalArming) (instanceId : SemanticId)
    (stateValid : runtimeStateWellFormed program instanceId state = true)
    (selected : SnapshotPreparedList program state (head :: tail))
    (independent : (head :: tail).Pairwise PreparedInternalArming.Independent) :
    SnapshotPreparedList program (head.apply state) tail := by
  intro member present
  exact snapshot_prepared_frame program state head member instanceId stateValid
    (selected head (by simp)) (selected member (by simp [present]))
    ((List.pairwise_cons.mp independent).1 member present)

theorem snapshot_prepared_batch_preserves (program : Program) (state : RuntimeState)
    (prepared : List PreparedInternalArming) (instanceId : SemanticId)
    (programValid : programWellFormed program = true)
    (stateValid : runtimeStateWellFormed program instanceId state = true)
    (openBefore : (projectOpenFlowNodeOccurrencesWithCompensation? program state).isSome = true)
    (selected : SnapshotPreparedList program state prepared)
    (independent : prepared.Pairwise PreparedInternalArming.Independent) :
    runtimeStateWellFormed program instanceId (applyInternalArmingBatch state prepared) = true ∧
      (projectOpenFlowNodeOccurrencesWithCompensation? program
        (applyInternalArmingBatch state prepared)).isSome = true := by
  induction prepared generalizing state with
  | nil => exact ⟨stateValid, openBefore⟩
  | cons head tail ih =>
      have valid := snapshot_prepared_preserves program state head instanceId programValid
        stateValid openBefore (selected head (by simp))
      exact ih (head.apply state) valid.1 valid.2
        (snapshot_prepared_tail program state head tail instanceId stateValid selected independent)
        (List.pairwise_cons.mp independent).2

theorem snapshot_prepared_publication_eq (program : Program) (state : RuntimeState)
    (prepared : PreparedInternalArming) (instanceId commandId : SemanticId)
    (programValid : programWellFormed program = true)
    (stateValid : runtimeStateWellFormed program instanceId state = true)
    (openBefore : (projectOpenFlowNodeOccurrencesWithCompensation? program state).isSome = true)
    (selected : SnapshotPrepared program state prepared) :
    snapshotArmingPublicationForFootprint? program state (prepared.apply state) prepared.operation
        commandId prepared.footprint =
      internalPublicationPairForFootprint? program state (prepared.apply state) prepared.operation
        commandId prepared.footprint := by
  cases prepared with
  | data _ _ => contradiction
  | ordinary operation patch =>
      cases currentEq : projectOpenFlowNodeOccurrencesWithCompensation? program state with
      | none => simp [currentEq] at openBefore
      | some current =>
          obtain ⟨focusedStart, focusedStarted, focusedLifecycle⟩ :=
            prepared_arm_focused_lifecycle_singleton program state operation patch instanceId
              commandId current programValid stateValid currentEq selected.1
              (snapshot_prepared_fresh program state patch selected.2)
          obtain ⟨baseStart, baseStarted, baseLifecycle⟩ := prepared_arm_lifecycle_singleton
            program state operation patch instanceId commandId programValid stateValid
            (snapshot_open_implies_base program state programValid openBefore) selected.1
          have same : baseStart = focusedStart :=
            Option.some.inj (baseStarted.symm.trans focusedStarted)
          subst baseStart
          simp only [snapshotArmingPublicationForFootprint?, internalPublicationPairForFootprint?,
            PreparedInternalArming.apply, PreparedInternalArming.operation,
            focusedLifecycle, baseLifecycle]

def acceptedSnapshotArmingPublication? (program : Program) (instanceId commandId : SemanticId)
    (state : RuntimeState) (prepared : PreparedInternalArming) :
    Option AcceptedInternalPublicationPair := do
  let pair ← snapshotArmingPublicationForFootprint? program state (prepared.apply state)
    prepared.operation commandId prepared.footprint
  let positionDelta ← controlPositionDelta? program instanceId state (prepared.apply state)
  pure { pair, logicalTimeMs := state.logicalTimeMs, positionDelta }

theorem snapshot_accepted_publication_eq (program : Program) (state : RuntimeState)
    (prepared : PreparedInternalArming) (instanceId commandId : SemanticId)
    (programValid : programWellFormed program = true)
    (stateValid : runtimeStateWellFormed program instanceId state = true)
    (openBefore : (projectOpenFlowNodeOccurrencesWithCompensation? program state).isSome = true)
    (selected : SnapshotPrepared program state prepared) :
    acceptedSnapshotArmingPublication? program instanceId commandId state prepared =
      preparedArmingPublication? program instanceId commandId state prepared := by
  unfold acceptedSnapshotArmingPublication? preparedArmingPublication?
    acceptedInternalPublicationForFootprint?
  rw [snapshot_prepared_publication_eq program state prepared instanceId commandId
    programValid stateValid openBefore selected]

def runPreparedSnapshotArmingBatch? (program : Program) (instanceId commandId : SemanticId)
    (state : RuntimeState) : List PreparedInternalArming →
    Option (RuntimeState × List AcceptedInternalPublicationPair)
  | [] => some (state, [])
  | head :: tail => do
      let next ← applyPreparedSnapshotArming? program state head
      let publication ← acceptedSnapshotArmingPublication? program instanceId commandId state head
      let (final, publications) ← runPreparedSnapshotArmingBatch? program instanceId commandId next tail
      return (final, publication :: publications)

private theorem snapshot_mapM_congr (left right : α → Option β) (values : List α)
    (same : ∀ value ∈ values, left value = right value) :
    values.mapM left = values.mapM right := by
  induction values with
  | nil => rfl
  | cons head tail ih =>
      simp only [List.mapM_cons, same head (by simp),
        ih (fun value present => same value (by simp [present]))]

theorem snapshot_prepared_batch_publications (program : Program) (instanceId commandId : SemanticId)
    (state : RuntimeState) (prepared : List PreparedInternalArming)
    (programValid : programWellFormed program = true)
    (stateValid : runtimeStateWellFormed program instanceId state = true)
    (openBefore : (projectOpenFlowNodeOccurrencesWithCompensation? program state).isSome = true)
    (selected : SnapshotPreparedList program state prepared)
    (independent : prepared.Pairwise PreparedInternalArming.Independent) :
    ∃ publications,
      prepared.mapM (preparedArmingPublication? program instanceId commandId state) = some publications ∧
      runPreparedSnapshotArmingBatch? program instanceId commandId state prepared =
        some (applyInternalArmingBatch state prepared, publications) := by
  induction prepared generalizing state with
  | nil => exact ⟨[], rfl, rfl⟩
  | cons head tail ih =>
      have headSelected := selected head (by simp)
      have valid := snapshot_prepared_preserves program state head instanceId programValid
        stateValid openBefore headSelected
      have remaining := snapshot_prepared_tail program state head tail instanceId stateValid
        selected independent
      obtain ⟨publications, tailMap, tailRun⟩ := ih (head.apply state) valid.1 valid.2 remaining
        (List.pairwise_cons.mp independent).2
      have baseOpen := snapshot_open_implies_base program state programValid openBefore
      have afterOpen := snapshot_open_implies_base program (head.apply state) programValid valid.2
      have mapFrame : tail.mapM (preparedArmingPublication? program instanceId commandId state) =
          tail.mapM (preparedArmingPublication? program instanceId commandId (head.apply state)) := by
        apply snapshot_mapM_congr
        intro member present
        obtain ⟨publication, _, beforeEq, afterEq⟩ := prepared_arming_publication_frame program
          instanceId commandId state (head.apply state) member programValid stateValid valid.1
          baseOpen afterOpen
          (snapshot_prepared_base program state member (selected member (by simp [present])))
          (snapshot_prepared_base program (head.apply state) member (remaining member present))
          (prepared_arming_time_frame state head) (prepared_arming_start_frame program state head)
        exact beforeEq.trans afterEq.symm
      obtain ⟨publication, _, accepted⟩ := prepared_arming_publication_defined program instanceId
        commandId state head programValid stateValid baseOpen
        (snapshot_prepared_base program state head headSelected)
      refine ⟨publication :: publications, ?_, ?_⟩
      · simp [List.mapM_cons, accepted, mapFrame, tailMap]
      · have applied := snapshot_prepared_applies program state head instanceId stateValid headSelected
        have publicationEq := snapshot_accepted_publication_eq program state head instanceId
          commandId programValid stateValid openBefore headSelected
        simp only [runPreparedSnapshotArmingBatch?, applied]
        change (do
          let current ← acceptedSnapshotArmingPublication? program instanceId commandId state head
          let (final, rest) ← runPreparedSnapshotArmingBatch? program instanceId commandId
            (head.apply state) tail
          pure (final, current :: rest)) = _
        simp [publicationEq, accepted, tailRun, applyInternalArmingBatch]

private theorem snapshot_prepare_list_sound (program : Program) (state : RuntimeState)
    (operations : List SemanticOperation) (prepared : List PreparedInternalArming)
    (selected : operations.mapM (prepareSnapshotArming? program state) = some prepared) :
    SnapshotPreparedList program state prepared ∧ prepared.map PreparedInternalArming.operation = operations := by
  induction operations generalizing prepared with
  | nil =>
      simp at selected
      cases selected
      simp [SnapshotPreparedList]
  | cons operation rest ih =>
      simp only [List.mapM_cons] at selected
      obtain ⟨head, headSelected, selected⟩ := Option.bind_eq_some_iff.mp selected
      obtain ⟨tail, tailSelected, selected⟩ := Option.bind_eq_some_iff.mp selected
      cases selected
      obtain ⟨headPrepared, headOperation⟩ := prepareSnapshotArming_sound program state
        operation head headSelected
      obtain ⟨tailPrepared, tailOperations⟩ := ih tail tailSelected
      exact ⟨by simpa [SnapshotPreparedList] using And.intro headPrepared tailPrepared,
        by simp [headOperation, tailOperations]⟩

theorem prepareSnapshotArmingBatch_sound (program : Program) (state : RuntimeState)
    (operations : List SemanticOperation) (prepared : List PreparedInternalArming)
    (selected : prepareSnapshotArmingBatch? program state operations = some prepared) :
    2 ≤ prepared.length ∧
      (projectOpenFlowNodeOccurrencesWithCompensation? program state).isSome = true ∧
      SnapshotPreparedList program state prepared ∧
      prepared.Pairwise PreparedInternalArming.Independent ∧
      prepared.map PreparedInternalArming.operation = operations := by
  unfold prepareSnapshotArmingBatch? at selected
  split at selected
  · simp at selected
  · next projectable =>
      dsimp only [Pure.pure, Bind.bind, Option.bind] at selected
      split at selected
      · simp at selected
      · next sufficient =>
          obtain ⟨members, allSelected, selected⟩ := Option.bind_eq_some_iff.mp selected
          split at selected
          · next independent =>
              cases selected
              obtain ⟨allPrepared, sameOperations⟩ :=
                snapshot_prepare_list_sound program state operations prepared allSelected
              have sameLength := congrArg List.length sameOperations
              simp only [List.length_map] at sameLength
              exact ⟨by omega, by
                cases opened : projectOpenFlowNodeOccurrencesWithCompensation? program state <;>
                  simp_all, allPrepared, independent, sameOperations⟩
          · simp at selected

private theorem snapshot_filterMap_of_mapM (function : α → Option β) (values : List α)
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

theorem snapshot_prepared_batch_publication_perm (program : Program)
    (instanceId commandId : SemanticId) (state : RuntimeState)
    (left right : List PreparedInternalArming)
    (programValid : programWellFormed program = true)
    (stateValid : runtimeStateWellFormed program instanceId state = true)
    (openBefore : (projectOpenFlowNodeOccurrencesWithCompensation? program state).isSome = true)
    (selected : SnapshotPreparedList program state left)
    (independent : left.Pairwise PreparedInternalArming.Independent)
    (permutation : left.Perm right) :
    ∃ final leftPublications rightPublications,
      runtimeStateWellFormed program instanceId final = true ∧
      (projectOpenFlowNodeOccurrencesWithCompensation? program final).isSome = true ∧
      runPreparedSnapshotArmingBatch? program instanceId commandId state left =
        some (final, leftPublications) ∧
      runPreparedSnapshotArmingBatch? program instanceId commandId state right =
        some (final, rightPublications) ∧
      canonicalAcceptedInternalPublicationPairs leftPublications =
        canonicalAcceptedInternalPublicationPairs rightPublications := by
  have rightSelected : SnapshotPreparedList program state right :=
    fun member present => selected member (permutation.mem_iff.mpr present)
  have rightIndependent := independent.perm permutation PreparedInternalArming.independent_symm
  obtain ⟨leftPublications, leftMap, leftRun⟩ := snapshot_prepared_batch_publications program
    instanceId commandId state left programValid stateValid openBefore selected independent
  obtain ⟨rightPublications, rightMap, rightRun⟩ := snapshot_prepared_batch_publications program
    instanceId commandId state right programValid stateValid openBefore rightSelected rightIndependent
  have leftFilter := snapshot_filterMap_of_mapM _ _ _ leftMap
  have rightFilter := snapshot_filterMap_of_mapM _ _ _ rightMap
  have publicationPerm : leftPublications.Perm rightPublications := by
    rw [← leftFilter, ← rightFilter]
    exact permutation.filterMap _
  have baseSelected : PreparedArmingList program state left :=
    fun member present => snapshot_prepared_base program state member (selected member present)
  have baseOpen := snapshot_open_implies_base program state programValid openBefore
  have distinct : leftPublications.Pairwise (fun first second =>
      first.pair.footprint.operationId ≠ second.pair.footprint.operationId) := by
    rw [← leftFilter, List.pairwise_filterMap]
    apply List.Pairwise.imp_of_mem _ independent
    intro first second firstMember secondMember separated firstPublication firstAccepted
      secondPublication secondAccepted
    obtain ⟨firstActual, firstFootprint, firstEq⟩ := prepared_arming_publication_defined program
      instanceId commandId state first programValid stateValid baseOpen (baseSelected first firstMember)
    obtain ⟨secondActual, secondFootprint, secondEq⟩ := prepared_arming_publication_defined program
      instanceId commandId state second programValid stateValid baseOpen (baseSelected second secondMember)
    rw [firstAccepted] at firstEq
    rw [secondAccepted] at secondEq
    cases firstEq
    cases secondEq
    rw [firstFootprint, secondFootprint,
      prepared_arming_footprint_id program state first (baseSelected first firstMember),
      prepared_arming_footprint_id program state second (baseSelected second secondMember)]
    exact prepared_arming_ids_ne program state first second programValid
      (baseSelected first firstMember) (baseSelected second secondMember) separated
  have stateEq := prepared_arming_batch_perm program state left right instanceId programValid
    stateValid baseOpen baseSelected independent permutation
  have valid := snapshot_prepared_batch_preserves program state left instanceId programValid
    stateValid openBefore selected independent
  exact ⟨applyInternalArmingBatch state left, leftPublications, rightPublications, valid.1, valid.2,
    leftRun, by simpa [stateEq] using rightRun,
    canonicalAcceptedInternalPublicationPairs_perm leftPublications rightPublications distinct publicationPerm⟩

end BpmnSemantics.SemanticProcess.InternalCommutation
