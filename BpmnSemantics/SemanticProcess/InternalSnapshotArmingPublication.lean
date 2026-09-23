import BpmnSemantics.SemanticProcess.InternalArmingBatchPublication
import BpmnSemantics.SemanticProcess.CompensationTriggerHandlerFlowNodeOccurrence

/-! Ordinary arming inserts exactly one wait start while preserving the focused Compensation projection. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem compensation_open_projection_frame (program : Program)
    (before after : RuntimeState)
    (beforeValid : compensationExecutionStateValid program before = true)
    (afterValid : compensationExecutionStateValid program after = true)
    (controlFrame : after.control = before.control)
    (triggersFrame : after.compensationTriggers = before.compensationTriggers) :
    projectOpenCompensationFlowNodeOccurrences? program after =
      projectOpenCompensationFlowNodeOccurrences? program before := by
  simp only [projectOpenCompensationFlowNodeOccurrences?, beforeValid, afterValid,
    Bool.not_true, Bool.false_eq_true, if_false, controlFrame, triggersFrame]

/-- Program validity removes only the manual checkpoint projector's omitted admission check. -/
theorem focused_open_projection_eq (program : Program) (state : RuntimeState)
    (programValid : programWellFormed program = true) :
    projectOpenFlowNodeOccurrencesWithCompensation? program state = (do
      let ordinary ← projectOpenFlowNodeOccurrences? program state
      let compensation ← projectOpenCompensationFlowNodeOccurrences? program state
      let projected := sortFlowNodeOccurrenceStarts (ordinary ++ compensation)
      if projected.map (·.anchor) |>.Nodup then some projected else none) := by
  unfold projectOpenFlowNodeOccurrencesWithCompensation?
  congr 1
  change (match state.control with
    | .running _ => _
    | _ => projectOpenFlowNodeOccurrences? program state) = _
  cases control : state.control <;> try rfl
  simp only [projectOpenFlowNodeOccurrences?, control, programValid, Bool.not_true,
    Bool.false_or]

theorem prepared_arm_compensation_open_frame (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (patch : InternalArmingPatch)
    (instanceId : SemanticId)
    (stateValid : runtimeStateWellFormed program instanceId state = true)
    (prepared : prepareInternalArm? program state operation = some patch) :
    projectOpenCompensationFlowNodeOccurrences? program (applyInternalArmingPatch state patch) =
      projectOpenCompensationFlowNodeOccurrences? program state := by
  have afterValid := prepared_arm_preserves_runtime program state operation patch instanceId
    stateValid prepared
  have executionBefore : compensationExecutionStateValid program state = true := by
    simp only [runtimeStateWellFormed, Bool.and_eq_true] at stateValid
    exact stateValid.2.2
  have executionAfter : compensationExecutionStateValid program
      (applyInternalArmingPatch state patch) = true := by
    simp only [runtimeStateWellFormed, Bool.and_eq_true] at afterValid
    exact afterValid.2.2
  apply compensation_open_projection_frame program state _ executionBefore executionAfter
  all_goals cases patch with | mk _ _ _ _ _ _ _ _ _ write => cases write <;> rfl

theorem focused_open_projection_parts (program : Program) (state : RuntimeState)
    (current : List OpenSemanticFlowNodeOccurrence)
    (programValid : programWellFormed program = true)
    (selected : projectOpenFlowNodeOccurrencesWithCompensation? program state = some current) :
    ∃ ordinary compensation,
      projectOpenFlowNodeOccurrences? program state = some ordinary ∧
      projectOpenCompensationFlowNodeOccurrences? program state = some compensation ∧
      current = sortFlowNodeOccurrenceStarts (ordinary ++ compensation) ∧
      (current.map (·.anchor)).Nodup := by
  rw [focused_open_projection_eq program state programValid] at selected
  simp only [Option.bind_eq_bind] at selected
  obtain ⟨ordinary, ordinaryEq, selected⟩ := Option.bind_eq_some_iff.mp selected
  obtain ⟨compensation, compensationEq, selected⟩ := Option.bind_eq_some_iff.mp selected
  split at selected
  · next distinct =>
      cases selected
      exact ⟨ordinary, compensation, ordinaryEq, compensationEq, rfl, distinct⟩
  · simp at selected

theorem focused_open_projection_insert (program : Program) (before after : RuntimeState)
    (ordinaryBefore ordinaryAfter compensation current : List OpenSemanticFlowNodeOccurrence)
    (newStart : OpenSemanticFlowNodeOccurrence)
    (programValid : programWellFormed program = true)
    (beforeOrdinary : projectOpenFlowNodeOccurrences? program before = some ordinaryBefore)
    (afterOrdinary : projectOpenFlowNodeOccurrences? program after = some ordinaryAfter)
    (ordinaryInserted : ordinaryAfter = sortFlowNodeOccurrenceStarts (newStart :: ordinaryBefore))
    (beforeCompensation : projectOpenCompensationFlowNodeOccurrences? program before =
      some compensation)
    (compensationFrame : projectOpenCompensationFlowNodeOccurrences? program after =
      projectOpenCompensationFlowNodeOccurrences? program before)
    (beforeFocused : projectOpenFlowNodeOccurrencesWithCompensation? program before = some current)
    (compensationFresh : newStart.anchor ∉ compensation.map (·.anchor)) :
    projectOpenFlowNodeOccurrencesWithCompensation? program after =
      some (sortFlowNodeOccurrenceStarts (newStart :: current)) := by
  have rawBefore := focused_open_projection_eq program before programValid
  rw [rawBefore, beforeOrdinary, beforeCompensation] at beforeFocused
  simp only [Option.bind_eq_bind, Option.bind_some] at beforeFocused
  by_cases combinedNodup :
      ((sortFlowNodeOccurrenceStarts (ordinaryBefore ++ compensation)).map (·.anchor)).Nodup
  · have currentEq : sortFlowNodeOccurrenceStarts (ordinaryBefore ++ compensation) = current := by
      simpa only [combinedNodup, if_true, Option.some.injEq] using beforeFocused
    have currentPerm : current.Perm (ordinaryBefore ++ compensation) := by
      rw [← currentEq]
      exact sortFlowNodeOccurrenceStarts_perm _
    have currentNodup : (current.map (·.anchor)).Nodup := by
      simpa only [currentEq] using combinedNodup
    have ordinaryAfterNodup := projectOpenFlowNodeOccurrences_anchor_nodup program after
      ordinaryAfter afterOrdinary
    have ordinaryPerm : ordinaryAfter.Perm (newStart :: ordinaryBefore) := by
      rw [ordinaryInserted]
      exact sortFlowNodeOccurrenceStarts_perm _
    have ordinaryFresh : newStart.anchor ∉ ordinaryBefore.map (·.anchor) :=
      (List.nodup_cons.mp ((ordinaryPerm.map (·.anchor)).nodup_iff.mp ordinaryAfterNodup)).1
    have currentFresh : newStart.anchor ∉ current.map (·.anchor) := by
      intro present
      have rawPresent := (currentPerm.map (·.anchor)).mem_iff.mp present
      simp only [List.map_append, List.mem_append] at rawPresent
      exact rawPresent.elim ordinaryFresh compensationFresh
    have insertedNodup : ((newStart :: current).map (·.anchor)).Nodup :=
      List.nodup_cons.mpr ⟨currentFresh, currentNodup⟩
    have rawAfterPerm : (ordinaryAfter ++ compensation).Perm (newStart :: current) :=
      (ordinaryPerm.append (List.Perm.refl compensation)).trans
        (List.Perm.cons newStart currentPerm.symm)
    have sortedAfterPerm := (sortFlowNodeOccurrenceStarts_perm
      (ordinaryAfter ++ compensation)).trans rawAfterPerm
    have afterNodup :
        ((sortFlowNodeOccurrenceStarts (ordinaryAfter ++ compensation)).map (·.anchor)).Nodup :=
      (sortedAfterPerm.map (·.anchor)).nodup_iff.mpr insertedNodup
    have sortedEq := sortFlowNodeOccurrenceStarts_perm_eq rawAfterPerm
    rw [focused_open_projection_eq program after programValid, afterOrdinary,
      compensationFrame, beforeCompensation]
    simp only [Option.bind_eq_bind, Option.bind_some]
    rw [if_pos afterNodup, sortedEq]
  · simp only [combinedNodup, if_false, reduceCtorEq] at beforeFocused

theorem prepared_arm_focused_open_projection_exact (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (patch : InternalArmingPatch) (instanceId : SemanticId)
    (current : List OpenSemanticFlowNodeOccurrence)
    (programValid : programWellFormed program = true)
    (stateValid : runtimeStateWellFormed program instanceId state = true)
    (beforeFocused : projectOpenFlowNodeOccurrencesWithCompensation? program state = some current)
    (prepared : prepareInternalArm? program state operation = some patch)
    (compensationFresh : ∀ compensation,
      projectOpenCompensationFlowNodeOccurrences? program state = some compensation →
        SemanticFlowNodeOccurrenceAnchor.wait patch.write.occurrence ∉ compensation.map (·.anchor)) :
    ∃ newStart,
      waitStart? program state patch.owner patch.write.elementId patch.write.occurrence.activation =
        some newStart ∧
      projectOpenFlowNodeOccurrencesWithCompensation? program (applyInternalArmingPatch state patch) =
        some (sortFlowNodeOccurrenceStarts (newStart :: current)) ∧
      runtimeStateWellFormed program instanceId (applyInternalArmingPatch state patch) = true := by
  obtain ⟨ordinary, compensation, ordinaryEq, compensationEq, _, _⟩ :=
    focused_open_projection_parts program state current programValid beforeFocused
  have ordinarySome : (projectOpenFlowNodeOccurrences? program state).isSome = true := by
    simp only [ordinaryEq, Option.isSome_some]
  obtain ⟨old, newStart, next, oldEq, started, nextEq, inserted, valid⟩ :=
    prepared_arm_preserves_runtime_and_open_projection_exact program state operation patch
      instanceId programValid stateValid ordinarySome prepared
  have oldSame : old = ordinary := Option.some.inj (oldEq.symm.trans ordinaryEq)
  subst old
  have anchorEq : newStart.anchor = .wait patch.write.occurrence :=
    (waitStart_anchor_of_eq program state patch.owner patch.write.elementId
      patch.write.occurrence.activation newStart started).trans
        (congrArg SemanticFlowNodeOccurrenceAnchor.wait
          (prepared_arm_anchor_shape program state operation patch prepared).1).symm
  refine ⟨newStart, started, ?_, valid⟩
  exact focused_open_projection_insert program state _ ordinary next compensation current newStart
    programValid ordinaryEq nextEq inserted compensationEq
    (prepared_arm_compensation_open_frame program state operation patch instanceId stateValid prepared)
    beforeFocused (by rw [anchorEq]; exact compensationFresh compensation compensationEq)

theorem focused_open_projection_nonTransition (program : Program) (state : RuntimeState)
    (current : List OpenSemanticFlowNodeOccurrence)
    (programValid : programWellFormed program = true)
    (selected : projectOpenFlowNodeOccurrencesWithCompensation? program state = some current) :
    ¬ ∃ start, start ∈ current ∧ transitionAnchor start.anchor = true := by
  obtain ⟨ordinary, compensation, ordinaryEq, compensationEq, currentEq, _⟩ :=
    focused_open_projection_parts program state current programValid selected
  rintro ⟨start, member, transition⟩
  rw [currentEq] at member
  have rawMember := (sortFlowNodeOccurrenceStarts_perm _).mem_iff.mp member
  rcases List.mem_append.mp rawMember with ordinaryMember | compensationMember
  · exact projectOpenFlowNodeOccurrences_transitionAnchor_false program state ordinary ordinaryEq
      ⟨start, ordinaryMember, transition⟩
  · exact projectOpenCompensationFlowNodeOccurrences_nonTransition program state compensation
      compensationEq ⟨start, compensationMember, transition⟩

private theorem focused_single_start_candidate_accepted (program : Program)
    (state after : RuntimeState) (operation : SemanticOperation) (patch : InternalArmingPatch)
    (commandId : SemanticId) (current : List OpenSemanticFlowNodeOccurrence)
    (newStart : OpenSemanticFlowNodeOccurrence) (next : List OpenSemanticFlowNodeOccurrence)
    (programValid : programWellFormed program = true)
    (prepared : prepareInternalArm? program state operation = some patch)
    (beforeEq : projectOpenFlowNodeOccurrencesWithCompensation? program state = some current)
    (afterEq : projectOpenFlowNodeOccurrencesWithCompensation? program after = some next)
    (nextEq : next = sortFlowNodeOccurrenceStarts (newStart :: current))
    (candidate : candidateFlowNodeOccurrenceDeltaForOperation? program state after operation
      commandId 0 = some (canonicalFlowNodeOccurrenceDelta [newStart] []))
    (nonTransition : transitionAnchor newStart.anchor = false) :
    flowNodeOccurrenceDeltaForOperationWithCompensation? program state after operation commandId 0 =
      some (canonicalFlowNodeOccurrenceDelta [newStart] []) := by
  have nextNodup := (focused_open_projection_parts program after next programValid
    afterEq).choose_spec.choose_spec.2.2.2
  rw [nextEq] at nextNodup
  have consNodup : ((newStart :: current).map (·.anchor)).Nodup :=
    ((sortFlowNodeOccurrenceStarts_perm (newStart :: current)).map (·.anchor)).nodup_iff.mp nextNodup
  have appendNodup : ((current ++ [newStart]).map (·.anchor)).Nodup :=
    ((List.perm_append_singleton newStart current).map (·.anchor)).nodup_iff.mpr consNodup
  have availableEq : sortFlowNodeOccurrenceStarts (current ++ [newStart]) = next := by
    rw [nextEq]
    exact sortFlowNodeOccurrenceStarts_perm_eq (List.perm_append_singleton newStart current)
  have nextNonTransition := focused_open_projection_nonTransition program after next
    programValid afterEq
  have candidatePath :
      flowNodeOccurrenceDeltaForOperationWithCompensation? program state after operation commandId 0 =
        (do
          let delta ← candidateFlowNodeOccurrenceDeltaForOperation? program state after operation
            commandId 0
          let openBefore ← projectOpenFlowNodeOccurrencesWithCompensation? program state
          let openAfter ← projectOpenFlowNodeOccurrencesWithCompensation? program after
          let folded ← applyFlowNodeOccurrenceDelta? openBefore delta
          if folded = openAfter then some delta else none) := by
    cases operation <;>
      try { solve | simp [prepareInternalArm?, internalArmInput?] at prepared }
    all_goals rfl
  rw [candidatePath, candidate]
  simp only [Option.bind_eq_bind, Option.bind_some, beforeEq, afterEq]
  have startSort : sortFlowNodeOccurrenceStarts [newStart] = [newStart] := rfl
  have endSort : sortFlowNodeOccurrenceEnds [] = [] := rfl
  simp only [canonicalFlowNodeOccurrenceDelta]
  unfold applyFlowNodeOccurrenceDelta?
  rw [startSort, endSort]
  simp only [List.map_append, List.map_cons, List.map_nil] at appendNodup
  simp [availableAfterStarts, removeEndedFlowNodeOccurrences, nonTransition, availableEq,
    nextNonTransition, appendNodup]

theorem prepared_arm_focused_lifecycle_singleton (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (patch : InternalArmingPatch) (instanceId commandId : SemanticId)
    (current : List OpenSemanticFlowNodeOccurrence)
    (programValid : programWellFormed program = true)
    (stateValid : runtimeStateWellFormed program instanceId state = true)
    (beforeFocused : projectOpenFlowNodeOccurrencesWithCompensation? program state = some current)
    (prepared : prepareInternalArm? program state operation = some patch)
    (compensationFresh : ∀ compensation,
      projectOpenCompensationFlowNodeOccurrences? program state = some compensation →
        SemanticFlowNodeOccurrenceAnchor.wait patch.write.occurrence ∉ compensation.map (·.anchor)) :
    ∃ newStart,
      waitStart? program state patch.owner patch.write.elementId patch.write.occurrence.activation =
        some newStart ∧
      flowNodeOccurrenceDeltaForOperationWithCompensation? program state
          (applyInternalArmingPatch state patch) operation commandId 0 =
        some (canonicalFlowNodeOccurrenceDelta [newStart] []) := by
  obtain ⟨newStart, started, afterFocused, _⟩ := prepared_arm_focused_open_projection_exact
    program state operation patch instanceId current programValid stateValid beforeFocused
    prepared compensationFresh
  obtain ⟨ordinary, _, ordinaryEq, _, _, _⟩ :=
    focused_open_projection_parts program state current programValid beforeFocused
  have ordinarySome : (projectOpenFlowNodeOccurrences? program state).isSome = true := by
    simp only [ordinaryEq, Option.isSome_some]
  obtain ⟨baseStart, baseStarted, baseAccepted⟩ := prepared_arm_lifecycle_singleton program state
    operation patch instanceId commandId programValid stateValid ordinarySome prepared
  have sameStart : baseStart = newStart := Option.some.inj (baseStarted.symm.trans started)
  subst baseStart
  have candidate : candidateFlowNodeOccurrenceDeltaForOperation? program state
      (applyInternalArmingPatch state patch) operation commandId 0 =
        some (canonicalFlowNodeOccurrenceDelta [newStart] []) := by
    unfold flowNodeOccurrenceDeltaForOperation? at baseAccepted
    obtain ⟨delta, candidateEq, accepted⟩ := Option.bind_eq_some_iff.mp baseAccepted
    unfold acceptFlowNodeOccurrenceCandidate? at accepted
    simp only [Option.bind_eq_bind] at accepted
    obtain ⟨_, _, accepted⟩ := Option.bind_eq_some_iff.mp accepted
    obtain ⟨_, _, accepted⟩ := Option.bind_eq_some_iff.mp accepted
    obtain ⟨_, _, accepted⟩ := Option.bind_eq_some_iff.mp accepted
    split at accepted <;> simp_all
  refine ⟨newStart, started, focused_single_start_candidate_accepted program state _ operation patch
    commandId current newStart _ programValid prepared beforeFocused afterFocused rfl candidate ?_⟩
  rw [waitStart_anchor_of_eq program state _ _ _ _ started]
  rfl

end BpmnSemantics.SemanticProcess.InternalCommutation
