import BpmnSemantics.SemanticProcess.InternalTimerTaskPreparationFrames
import BpmnSemantics.SemanticProcess.InternalDataArmingMixedFrames
import BpmnSemantics.SemanticProcess.InternalLocalControlArmingCommutation

/-! Timer-task and ordinary arming share the existing wait, counter, and owner-census frame laws.
Both public wait anchors are checked even though only the task receives a lifecycle publication.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem timerTask_ordinary_independent_separation (timer : InternalTimerTaskPatch)
    (operation : SemanticOperation) (ordinary : InternalArmingPatch)
    (independent : regionalStateFootprintsIndependent (timerTaskStateFootprint timer)
      (liftRegionalStateFootprint ordinary.owner
        (PreparedInternalArming.ordinary operation ordinary).stateFootprint) = true) :
    timer.arm.input ≠ ordinary.input ∧
      (ordinary.write.kind = .userTask → ordinary.write.elementId ≠ timer.arm.write.elementId) ∧
      (ordinary.write.kind = .timer → ordinary.write.elementId ≠ timer.timer.elementId) ∧
      (∀ anchor ∈ [timer.arm.write.occurrence, timerWaitOccurrence timer.timer],
        ordinary.write.occurrence ≠ anchor) := by
  have separated := regional_independent_write_write _ _ independent
  have ordinaryWrite (atom : InternalStateAtom) (member : atom ∈ (footprintOfPatch ordinary).writes) :
      liftRegionalStateAtom ordinary.owner atom ∈
        (liftRegionalStateFootprint ordinary.owner
          (PreparedInternalArming.ordinary operation ordinary).stateFootprint).writes :=
    List.mem_map.mpr ⟨atom, member, rfl⟩
  have input := separated (.ordinary (.tokenOwners timer.arm.input))
    (.ordinary (.tokenOwners ordinary.input))
    (by simp [timerTaskStateFootprint, canonicalRegionalStateAtoms_mem])
    (ordinaryWrite _ (tokenOwners_mem_footprint_writes ordinary))
  have ordinaryCounter := ordinaryWrite
    (.activation ordinary.write.kind.activationKind ordinary.write.elementId)
    (by simp [footprintOfPatch, canonicalStateAtomSet, mem_sortBy])
  refine ⟨?_, ?_, ?_, ?_⟩
  · intro same
    simp [regionalStateAtomsConflict, same] at input
  · intro kind same
    have conflict := separated (.ordinary (.activation .userTask timer.arm.write.elementId))
      _ (by simp [timerTaskStateFootprint, canonicalRegionalStateAtoms_mem]) ordinaryCounter
    simp [liftRegionalStateAtom, regionalStateAtomsConflict, kind,
      InternalWaitKind.activationKind, same] at conflict
  · intro kind same
    have conflict := separated (.ordinary (.activation .timer timer.timer.elementId))
      _ (by simp [timerTaskStateFootprint, canonicalRegionalStateAtoms_mem]) ordinaryCounter
    simp [liftRegionalStateAtom, regionalStateAtomsConflict, kind,
      InternalWaitKind.activationKind, same] at conflict
  · intro anchor member same
    have conflict := separated (.owned (.openWaitAnchor anchor) timer.arm.owner)
      (.owned (.openWaitAnchor ordinary.write.occurrence) ordinary.owner)
      (by simp only [List.mem_cons, List.not_mem_nil, or_false] at member
          rcases member with rfl | rfl <;>
            simp [timerTaskStateFootprint, canonicalRegionalStateAtoms_mem])
      (ordinaryWrite (.openWaitAnchor ordinary.write.occurrence)
        (by simp [footprintOfPatch, canonicalStateAtomSet, mem_sortBy]))
    simp [regionalStateAtomsConflict, same] at conflict

theorem makeInternalTimerTaskPatch_ordinary_frame
    (program : Program) (state : RuntimeState) (contract : InternalTimerTaskContract)
    (owner : ScopeOccurrenceId) (instanceId : SemanticId) (processId : ProcessId)
    (origin : BpmnSequenceFlowOrigin) (ordinary : InternalArmingPatch)
    (taskDifferent : ordinary.write.kind = .userTask →
      ordinary.write.elementId ≠ (⟨contract.task.id.value⟩ : NodeId))
    (timerDifferent : ordinary.write.kind = .timer → ordinary.write.elementId ≠ contract.timer.elementId) :
    makeInternalTimerTaskPatch program (applyInternalArmingPatch state ordinary)
        contract owner instanceId processId origin =
      makeInternalTimerTaskPatch program state contract owner instanceId processId origin := by
  have taskFrame := armingActivationRead_frame state ordinary .userTask ⟨contract.task.id.value⟩ taskDifferent
  have timerFrame := armingActivationRead_frame state ordinary .timer contract.timer.elementId timerDifferent
  simp only [internalActivationCount] at taskFrame timerFrame
  simp only [makeInternalTimerTaskPatch, armingTimeRead_frame, taskFrame, timerFrame,
    activityActivationCount, ordinary_arming_activity_counts]

theorem prepareInternalTimerTaskContract_ordinary_preserved
    (program : Program) (state : RuntimeState) (contract : InternalTimerTaskContract)
    (timer : InternalTimerTaskPatch) (operation : SemanticOperation) (ordinary : InternalArmingPatch)
    (prepared : prepareInternalTimerTaskContract? program state contract = some timer)
    (independent : regionalStateFootprintsIndependent (timerTaskStateFootprint timer)
      (liftRegionalStateFootprint ordinary.owner
        (PreparedInternalArming.ordinary operation ordinary).stateFootprint) = true) :
    prepareInternalTimerTaskContract? program (applyInternalArmingPatch state ordinary)
      contract = some timer := by
  obtain ⟨inputs, tasks, timers, anchors⟩ :=
    timerTask_ordinary_independent_separation timer operation ordinary independent
  obtain ⟨snapshots, owner, instanceId, origin, processId, owned, running, selected, live,
    originFound, processFound, uniqueTask, uniqueTimer, taskAbsent, timerAbsent, recordAbsent, rfl⟩ :=
    prepareInternalTimerTaskContract_facts program state contract timer prepared
  let timer := makeInternalTimerTaskPatch program state contract owner instanceId processId origin
  let after := applyInternalArmingPatch state ordinary
  have patchFrame := makeInternalTimerTaskPatch_ordinary_frame program state contract owner
    instanceId processId origin ordinary tasks timers
  have ownerFrame := armingOwnerRead_frame state ordinary contract.input inputs.symm
  have taskFrame := armingOpenAnchorRead_frame state ordinary timer.arm.write.occurrence
    (anchors _ (by simp [timer]))
  have timerFrame := armingOpenAnchorRead_frame state ordinary (timerWaitOccurrence timer.timer)
    (anchors _ (by simp [timer]))
  have runningFrame : runningInstance? after = some instanceId := by
    simpa only [after, runningInstance?, armingControlRead_frame] using running
  have recordFrame : after.activityOccurrences.any (regionalActivityAssociationsConflict · timer.record) = false := by
    rw [ordinary_arming_activity_records]
    exact recordAbsent
  change prepareInternalTimerTaskContract? program after contract = some timer
  dsimp only [timer] at taskFrame timerFrame
  simp [prepareInternalTimerTaskContract?, snapshots, after, timer, ownerFrame, owned,
    runningFrame, armingLiveOwnerRead_frame, selected, live, originFound, processFound,
    patchFrame, uniqueTask, uniqueTimer, taskFrame, timerFrame, taskAbsent, timerAbsent]
  intro record member
  exact Bool.eq_false_iff.mpr (List.any_eq_false.mp recordFrame record member)

theorem prepareInternalArm_timer_task_preserved
    (program : Program) (state : RuntimeState) (contract : InternalTimerTaskContract)
    (timer : InternalTimerTaskPatch) (operation : SemanticOperation) (ordinary : InternalArmingPatch)
    (timerPrepared : prepareInternalTimerTaskContract? program state contract = some timer)
    (ordinaryPrepared : prepareInternalArm? program state operation = some ordinary)
    (independent : regionalStateFootprintsIndependent (timerTaskStateFootprint timer)
      (liftRegionalStateFootprint ordinary.owner
        (PreparedInternalArming.ordinary operation ordinary).stateFootprint) = true) :
    prepareInternalArm? program (applyInternalTimerTaskPatch state timer) operation = some ordinary := by
  obtain ⟨inputs, tasks, timers, anchors⟩ :=
    timerTask_ordinary_independent_separation timer operation ordinary independent
  obtain ⟨_, owner, instanceId, origin, processId, _, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalTimerTaskContract_facts program state contract timer timerPrepared
  let timer := makeInternalTimerTaskPatch program state contract owner instanceId processId origin
  let after := applyInternalTimerTaskPatch state timer
  have counts : internalActivationCount after ordinary.write.kind ordinary.write.elementId =
      internalActivationCount state ordinary.write.kind ordinary.write.elementId := by
    cases kind : ordinary.write.kind with
    | userTask =>
        exact taskActivationRead_set_other state contract.task.id ordinary.write.elementId
          (activationCount state contract.task.id + 1) (tasks kind).symm
    | timer =>
        exact timerActivationRead_set_other state contract.timer.elementId ordinary.write.elementId
          (timerActivationCount state contract.timer.elementId + 1) (timers kind).symm
    | message | effect => rfl
  apply prepared_arm_read_frame program state after operation ordinary ordinaryPrepared
  · exact armingOwnerRead_frame state timer.arm ordinary.input inputs
  · rfl
  · rfl
  · intro queried
    rfl
  · rfl
  · exact counts
  · exact timerTaskOpenAnchorRead_frame state timer _ rfl ordinary.write.occurrence
      (anchors _ (by simp [timer])).symm (anchors _ (by simp [timer])).symm
  · cases write : ordinary.write <;> rfl

theorem applyInternalTimerTaskPatch_ordinary_commutes
    (program : Program) (state : RuntimeState) (contract : InternalTimerTaskContract)
    (timer : InternalTimerTaskPatch) (operation : SemanticOperation) (ordinary : InternalArmingPatch)
    (prepared : prepareInternalTimerTaskContract? program state contract = some timer)
    (canonical : canonicalCollectionOrder state = true)
    (independent : regionalStateFootprintsIndependent (timerTaskStateFootprint timer)
      (liftRegionalStateFootprint ordinary.owner
        (PreparedInternalArming.ordinary operation ordinary).stateFootprint) = true) :
    applyInternalArmingPatch (applyInternalTimerTaskPatch state timer) ordinary =
      applyInternalTimerTaskPatch (applyInternalArmingPatch state ordinary) timer := by
  obtain ⟨_, tasks, timers, _⟩ := timerTask_ordinary_independent_separation timer operation ordinary independent
  obtain ⟨_, owner, instanceId, origin, processId, _, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalTimerTaskContract_facts program state contract timer prepared
  have taskOrder : orderedBy activationBefore state.activations = true := by
    simp_all only [canonicalCollectionOrder, Bool.and_eq_true]
  have timerOrder : orderedBy timerActivationBefore state.timerActivations = true := by
    simp_all only [canonicalCollectionOrder, Bool.and_eq_true]
  clear independent prepared canonical
  cases write : ordinary.write with
  | userTask wait =>
      have different : wait.task.id ≠ contract.task.id := by
        intro same
        apply tasks (by simp [write, InternalArmingWrite.kind])
        simp [write, InternalArmingWrite.elementId, makeInternalTimerTaskPatch, same]
      simp only [applyInternalTimerTaskPatch, makeInternalTimerTaskPatch, applyInternalArmingPatch, write]
      congr 1
      · exact removeToken_commutes state.tokens contract.input ordinary.input owner ordinary.owner
      · exact insertUserTaskWait_commutes _ _ different state.waits
      · exact (setActivationCount_commutes_of_ordered _ _ _ _ different _ taskOrder).symm
  | timer wait =>
      have different : wait.elementId ≠ contract.timer.elementId := by
        simpa [write, InternalArmingWrite.elementId, makeInternalTimerTaskPatch] using
          timers (by simp [write, InternalArmingWrite.kind])
      simp only [applyInternalTimerTaskPatch, makeInternalTimerTaskPatch, applyInternalArmingPatch, write]
      congr 1
      · exact removeToken_commutes state.tokens contract.input ordinary.input owner ordinary.owner
      · exact insertTimerWait_commutes _ _ different state.timerWaits
      · exact (setTimerActivationCount_commutes_of_ordered _ _ _ _ different _ timerOrder).symm
  | message wait | effect wait bindings =>
      simp only [applyInternalTimerTaskPatch, makeInternalTimerTaskPatch, applyInternalArmingPatch, write]
      congr 1
      exact removeToken_commutes state.tokens contract.input ordinary.input owner ordinary.owner

theorem prepared_timer_task_ordinary_pair_commutes
    (program : Program) (state : RuntimeState) (contract : InternalTimerTaskContract)
    (timer : InternalTimerTaskPatch) (operation : SemanticOperation) (ordinary : InternalArmingPatch)
    (timerPrepared : prepareInternalTimerTaskContract? program state contract = some timer)
    (ordinaryPrepared : prepareInternalArm? program state operation = some ordinary)
    (canonical : canonicalCollectionOrder state = true)
    (independent : regionalStateFootprintsIndependent (timerTaskStateFootprint timer)
      (liftRegionalStateFootprint ordinary.owner
        (PreparedInternalArming.ordinary operation ordinary).stateFootprint) = true) :
    prepareInternalTimerTaskContract? program (applyInternalArmingPatch state ordinary)
        contract = some timer ∧
      prepareInternalArm? program (applyInternalTimerTaskPatch state timer) operation = some ordinary ∧
      applyInternalArmingPatch (applyInternalTimerTaskPatch state timer) ordinary =
        applyInternalTimerTaskPatch (applyInternalArmingPatch state ordinary) timer :=
  ⟨prepareInternalTimerTaskContract_ordinary_preserved program state contract timer operation ordinary
      timerPrepared independent,
    prepareInternalArm_timer_task_preserved program state contract timer operation ordinary
      timerPrepared ordinaryPrepared independent,
    applyInternalTimerTaskPatch_ordinary_commutes program state contract timer operation ordinary
      timerPrepared canonical independent⟩

end BpmnSemantics.SemanticProcess.InternalCommutation
