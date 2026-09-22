import BpmnSemantics.SemanticProcess.InternalTimerTaskCommutation
import BpmnSemantics.SemanticProcess.InternalCommutation
import BpmnSemantics.SemanticProcess.InternalRegionalPairDependencies

/-! Complete Timer-task preparation reads all three issuers and both untagged wait anchors.
Regional footprint independence supplies their separation and the Activity-association frame.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem timerTask_independent_separation (left right : InternalTimerTaskPatch)
    (independent : regionalStateFootprintsIndependent
      (timerTaskStateFootprint left) (timerTaskStateFootprint right) = true) :
    left.arm.input ≠ right.arm.input ∧
      left.arm.write.elementId ≠ right.arm.write.elementId ∧
      left.timer.elementId ≠ right.timer.elementId ∧
      (∀ first ∈ [left.arm.write.occurrence, timerWaitOccurrence left.timer],
        ∀ second ∈ [right.arm.write.occurrence, timerWaitOccurrence right.timer], first ≠ second) ∧
      regionalActivityAssociationsConflict left.record right.record = false := by
  have separated := regional_independent_write_write _ _ independent
  have input := separated (.ordinary (.tokenOwners left.arm.input))
    (.ordinary (.tokenOwners right.arm.input))
    (by simp [timerTaskStateFootprint, canonicalRegionalStateAtoms_mem])
    (by simp [timerTaskStateFootprint, canonicalRegionalStateAtoms_mem])
  have task := separated (.ordinary (.activation .userTask left.arm.write.elementId))
    (.ordinary (.activation .userTask right.arm.write.elementId))
    (by simp [timerTaskStateFootprint, canonicalRegionalStateAtoms_mem])
    (by simp [timerTaskStateFootprint, canonicalRegionalStateAtoms_mem])
  have timer := separated (.ordinary (.activation .timer left.timer.elementId))
    (.ordinary (.activation .timer right.timer.elementId))
    (by simp [timerTaskStateFootprint, canonicalRegionalStateAtoms_mem])
    (by simp [timerTaskStateFootprint, canonicalRegionalStateAtoms_mem])
  have activity := separated (.activityAssociation left.record) (.activityAssociation right.record)
    (by simp [timerTaskStateFootprint, canonicalRegionalStateAtoms_mem])
    (by simp [timerTaskStateFootprint, canonicalRegionalStateAtoms_mem])
  refine ⟨?_, ?_, ?_, ?_, activity⟩
  · intro same
    simp [regionalStateAtomsConflict, same] at input
  · intro same
    simp [regionalStateAtomsConflict, same] at task
  · intro same
    simp [regionalStateAtomsConflict, same] at timer
  · intro first firstMember second secondMember same
    have conflict := separated (.owned (.openWaitAnchor first) left.arm.owner)
      (.owned (.openWaitAnchor second) right.arm.owner)
      (by simp only [List.mem_cons, List.not_mem_nil, or_false] at firstMember
          rcases firstMember with rfl | rfl <;>
            simp [timerTaskStateFootprint, canonicalRegionalStateAtoms_mem])
      (by simp only [List.mem_cons, List.not_mem_nil, or_false] at secondMember
          rcases secondMember with rfl | rfl <;>
            simp [timerTaskStateFootprint, canonicalRegionalStateAtoms_mem])
    simp [regionalStateAtomsConflict, same] at conflict

theorem timerTaskOpenAnchorRead_frame (state : RuntimeState) (patch : InternalTimerTaskPatch)
    (wait : UserTaskWait) (taskWrite : patch.arm.write = .userTask wait)
    (queried : OccurrenceId) (taskDifferent : patch.arm.write.occurrence ≠ queried)
    (timerDifferent : timerWaitOccurrence patch.timer ≠ queried) :
    openWaitAnchorAbsent (applyInternalTimerTaskPatch state patch) queried =
      openWaitAnchorAbsent state queried := by
  have timerFrame := armingOpenAnchorRead_frame (applyInternalArmingPatch state patch.arm)
    { patch.arm with write := .timer patch.timer } queried timerDifferent
  have taskFrame := armingOpenAnchorRead_frame state patch.arm queried taskDifferent
  simpa [applyInternalTimerTaskPatch, applyInternalArmingPatch, taskWrite, openWaitAnchorAbsent,
    openWaitAnchors] using timerFrame.trans taskFrame

theorem makeInternalTimerTaskPatch_frame
    (program : Program) (state : RuntimeState) (left right : InternalTimerTaskContract)
    (leftOwner rightOwner : ScopeOccurrenceId) (leftInstance rightInstance : SemanticId)
    (leftProcess rightProcess : ProcessId) (leftOrigin rightOrigin : BpmnSequenceFlowOrigin)
    (tasksDifferent : left.task.id ≠ right.task.id)
    (timersDifferent : left.timer.elementId ≠ right.timer.elementId) :
    makeInternalTimerTaskPatch program
        (applyInternalTimerTaskPatch state
          (makeInternalTimerTaskPatch program state left leftOwner leftInstance leftProcess leftOrigin))
        right rightOwner rightInstance rightProcess rightOrigin =
      makeInternalTimerTaskPatch program state right rightOwner rightInstance rightProcess rightOrigin := by
  have taskFrame := activationCount_setActivationCount_other state left.task.id right.task.id
    (activationCount state left.task.id + 1) tasksDifferent.symm
  have activityFrame := activationCount_setActivationCount_other
    { state with activations := state.activityActivations } left.task.id right.task.id
    (activityActivationCount state left.task.id + 1) tasksDifferent.symm
  have timerFrame := timerActivationCount_set_other state left.timer.elementId right.timer.elementId
    (timerActivationCount state left.timer.elementId + 1) timersDifferent.symm
  simp only [activationCount] at taskFrame activityFrame
  simp only [activityActivationCount] at activityFrame
  simp only [timerActivationCount] at timerFrame
  simp only [makeInternalTimerTaskPatch, applyInternalTimerTaskPatch, applyInternalArmingPatch,
    activationCount, activityActivationCount, timerActivationCount, taskFrame, activityFrame, timerFrame]

theorem prepareInternalTimerTaskContract_preserved
    (program : Program) (state : RuntimeState)
    (left right : InternalTimerTaskContract) (leftPatch rightPatch : InternalTimerTaskPatch)
    (leftPrepared : prepareInternalTimerTaskContract? program state left = some leftPatch)
    (rightPrepared : prepareInternalTimerTaskContract? program state right = some rightPatch)
    (independent : regionalStateFootprintsIndependent
      (timerTaskStateFootprint leftPatch) (timerTaskStateFootprint rightPatch) = true) :
    prepareInternalTimerTaskContract? program (applyInternalTimerTaskPatch state leftPatch)
      right = some rightPatch := by
  obtain ⟨inputs, tasks, timers, anchors, associations⟩ :=
    timerTask_independent_separation leftPatch rightPatch independent
  obtain ⟨_, leftOwner, leftInstance, leftOrigin, leftProcess, _, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalTimerTaskContract_facts program state left leftPatch leftPrepared
  obtain ⟨snapshots, rightOwner, rightInstance, rightOrigin, rightProcess, owned, running,
    selected, live, originFound, processFound, uniqueTask, uniqueTimer, taskAbsent, timerAbsent,
    recordAbsent, rfl⟩ :=
    prepareInternalTimerTaskContract_facts program state right rightPatch rightPrepared
  let leftPatch := makeInternalTimerTaskPatch program state left leftOwner leftInstance leftProcess leftOrigin
  let rightPatch := makeInternalTimerTaskPatch program state right rightOwner rightInstance rightProcess rightOrigin
  let after := applyInternalTimerTaskPatch state leftPatch
  have tasksDifferent : left.task.id ≠ right.task.id := by
    intro same
    exact tasks (by simp [makeInternalTimerTaskPatch, InternalArmingWrite.elementId, same])
  have patchFrame : makeInternalTimerTaskPatch program after right rightOwner rightInstance
      rightProcess rightOrigin = rightPatch :=
    makeInternalTimerTaskPatch_frame program state left right leftOwner rightOwner leftInstance
      rightInstance leftProcess rightProcess leftOrigin rightOrigin tasksDifferent timers
  have ownerFrame : onlyTokenOwner? after right.input = some rightOwner := by
    change onlyTokenOwner? (applyInternalArmingPatch state leftPatch.arm) right.input = _
    rw [armingOwnerRead_frame state leftPatch.arm right.input inputs]
    exact owned
  have taskAnchorFrame : openWaitAnchorAbsent after rightPatch.arm.write.occurrence = true := by
    rw [timerTaskOpenAnchorRead_frame state leftPatch _ rfl _
      (anchors _ (by simp [leftPatch]) _ (by simp [rightPatch]))
      (anchors _ (by simp [leftPatch]) _ (by simp [rightPatch]))]
    exact taskAbsent
  have timerAnchorFrame : openWaitAnchorAbsent after (timerWaitOccurrence rightPatch.timer) = true := by
    rw [timerTaskOpenAnchorRead_frame state leftPatch _ rfl _
      (anchors _ (by simp [leftPatch]) _ (by simp [rightPatch]))
      (anchors _ (by simp [leftPatch]) _ (by simp [rightPatch]))]
    exact timerAbsent
  have recordFrame : after.activityOccurrences.any
      (regionalActivityAssociationsConflict · rightPatch.record) = false := by
    apply List.any_eq_false.mpr
    intro record member
    change record ∈ insertActivityOccurrence leftPatch.record state.activityOccurrences at member
    rw [BpmnSemantics.SemanticProcess.insertActivityOccurrence_eq_canonicalInsertBy,
      mem_canonicalInsertBy] at member
    rcases member with rfl | member
    · exact Bool.eq_false_iff.mp associations
    · exact List.any_eq_false.mp recordAbsent record member
  have runningFrame : runningInstance? after = some rightInstance := running
  have liveFrame : exactLiveOccurrence after rightOwner = true := live
  change prepareInternalTimerTaskContract? program after right = some rightPatch
  simp [prepareInternalTimerTaskContract?, snapshots, ownerFrame, runningFrame, selected,
    liveFrame, originFound, processFound, patchFrame, uniqueTask, uniqueTimer,
    taskAnchorFrame, timerAnchorFrame]
  intro record member
  exact Bool.eq_false_iff.mpr (List.any_eq_false.mp recordFrame record member)

theorem prepared_timer_task_pair_commutes
    (program : Program) (state : RuntimeState)
    (left right : InternalTimerTaskContract) (leftPatch rightPatch : InternalTimerTaskPatch)
    (leftPrepared : prepareInternalTimerTaskContract? program state left = some leftPatch)
    (rightPrepared : prepareInternalTimerTaskContract? program state right = some rightPatch)
    (canonical : canonicalCollectionOrder state = true)
    (independent : regionalStateFootprintsIndependent
      (timerTaskStateFootprint leftPatch) (timerTaskStateFootprint rightPatch) = true) :
    prepareInternalTimerTaskContract? program (applyInternalTimerTaskPatch state leftPatch)
        right = some rightPatch ∧
      prepareInternalTimerTaskContract? program (applyInternalTimerTaskPatch state rightPatch)
        left = some leftPatch ∧
      applyInternalTimerTaskPatch (applyInternalTimerTaskPatch state leftPatch) rightPatch =
        applyInternalTimerTaskPatch (applyInternalTimerTaskPatch state rightPatch) leftPatch := by
  have forward := prepareInternalTimerTaskContract_preserved program state left right
    leftPatch rightPatch leftPrepared rightPrepared independent
  have reverse := prepareInternalTimerTaskContract_preserved program state right left
    rightPatch leftPatch rightPrepared leftPrepared
    (regionalStateFootprintsIndependent_symmetric _ _ independent)
  refine ⟨forward, reverse, ?_⟩
  have separated := timerTask_independent_separation leftPatch rightPatch independent
  obtain ⟨_, leftOwner, leftInstance, leftOrigin, leftProcess, _, leftRunning, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalTimerTaskContract_facts program state left leftPatch leftPrepared
  obtain ⟨_, rightOwner, rightInstance, rightOrigin, rightProcess, _, rightRunning, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalTimerTaskContract_facts program state right rightPatch rightPrepared
  have sameInstance := Option.some.inj (leftRunning.symm.trans rightRunning)
  subst rightInstance
  have tasksDifferent : left.task.id ≠ right.task.id := by
    intro same
    exact separated.2.1 (by simp [makeInternalTimerTaskPatch, InternalArmingWrite.elementId, same])
  apply makeInternalTimerTaskPatch_commutes program state left right leftOwner rightOwner
    leftInstance leftProcess rightProcess leftOrigin rightOrigin tasksDifferent separated.2.2.1
  all_goals simp_all only [canonicalCollectionOrder, Bool.and_eq_true]

end BpmnSemantics.SemanticProcess.InternalCommutation
