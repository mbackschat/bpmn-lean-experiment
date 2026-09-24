import BpmnSemantics.SemanticProcess.InternalMessageTaskPreparation
import BpmnSemantics.SemanticProcess.InternalDataArmingMixedFrames
import BpmnSemantics.SemanticProcess.InternalLocalControlArmingCommutation
import BpmnSemantics.SemanticProcess.InternalRegionalPairDependencies

/-! Message-task and ordinary arming share the existing wait, counter, and owner-census frame laws.
The selected subscription account requires both anchors and the joined Activity to remain atomic.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics


theorem messageTaskOpenAnchorRead_frame (state : RuntimeState) (patch : InternalMessageTaskPatch)
    (wait : UserTaskWait) (taskWrite : patch.arm.write = .userTask wait)
    (queried : OccurrenceId) (taskDifferent : patch.arm.write.occurrence ≠ queried)
    (messageDifferent : messageWaitOccurrence patch.message ≠ queried) :
    openWaitAnchorAbsent (applyInternalMessageTaskPatch state patch) queried =
      openWaitAnchorAbsent state queried := by
  have messageFrame := armingOpenAnchorRead_frame (applyInternalArmingPatch state patch.arm)
    { patch.arm with write := .message patch.message } queried messageDifferent
  have taskFrame := armingOpenAnchorRead_frame state patch.arm queried taskDifferent
  simpa [applyInternalMessageTaskPatch, applyInternalArmingPatch, taskWrite, openWaitAnchorAbsent,
    openWaitAnchors] using messageFrame.trans taskFrame

theorem messageTask_ordinary_independent_separation (message : InternalMessageTaskPatch)
    (operation : SemanticOperation) (ordinary : InternalArmingPatch)
    (independent : regionalStateFootprintsIndependent (messageTaskStateFootprint message)
      (liftRegionalStateFootprint ordinary.owner
        (PreparedInternalArming.ordinary operation ordinary).stateFootprint) = true) :
    message.arm.input ≠ ordinary.input ∧
      (ordinary.write.kind = .userTask → ordinary.write.elementId ≠ message.arm.write.elementId) ∧
      (ordinary.write.kind = .message → ordinary.write.elementId ≠ message.message.elementId) ∧
      (∀ anchor ∈ [message.arm.write.occurrence, messageWaitOccurrence message.message],
        ordinary.write.occurrence ≠ anchor) := by
  have separated := regional_independent_write_write _ _ independent
  have ordinaryWrite (atom : InternalStateAtom) (member : atom ∈ (footprintOfPatch ordinary).writes) :
      liftRegionalStateAtom ordinary.owner atom ∈
        (liftRegionalStateFootprint ordinary.owner
          (PreparedInternalArming.ordinary operation ordinary).stateFootprint).writes :=
    List.mem_map.mpr ⟨atom, member, rfl⟩
  have input := separated (.ordinary (.tokenOwners message.arm.input))
    (.ordinary (.tokenOwners ordinary.input))
    (by simp [messageTaskStateFootprint, canonicalRegionalStateAtoms_mem])
    (ordinaryWrite _ (tokenOwners_mem_footprint_writes ordinary))
  have ordinaryCounter := ordinaryWrite
    (.activation ordinary.write.kind.activationKind ordinary.write.elementId)
    (by simp [footprintOfPatch, canonicalStateAtomSet, mem_sortBy])
  refine ⟨?_, ?_, ?_, ?_⟩
  · intro same
    simp [regionalStateAtomsConflict, same] at input
  · intro kind same
    have conflict := separated (.ordinary (.activation .userTask message.arm.write.elementId))
      _ (by simp [messageTaskStateFootprint, canonicalRegionalStateAtoms_mem]) ordinaryCounter
    simp [liftRegionalStateAtom, regionalStateAtomsConflict, kind,
      InternalWaitKind.activationKind, same] at conflict
  · intro kind same
    have conflict := separated (.ordinary (.activation .message message.message.elementId))
      _ (by simp [messageTaskStateFootprint, canonicalRegionalStateAtoms_mem]) ordinaryCounter
    simp [liftRegionalStateAtom, regionalStateAtomsConflict, kind,
      InternalWaitKind.activationKind, same] at conflict
  · intro anchor member same
    have conflict := separated (.owned (.openWaitAnchor anchor) message.arm.owner)
      (.owned (.openWaitAnchor ordinary.write.occurrence) ordinary.owner)
      (by simp only [List.mem_cons, List.not_mem_nil, or_false] at member
          rcases member with rfl | rfl <;>
            simp [messageTaskStateFootprint, canonicalRegionalStateAtoms_mem])
      (ordinaryWrite (.openWaitAnchor ordinary.write.occurrence)
        (by simp [footprintOfPatch, canonicalStateAtomSet, mem_sortBy]))
    simp [regionalStateAtomsConflict, same] at conflict

theorem makeInternalMessageTaskPatch_ordinary_frame
    (program : Program) (state : RuntimeState) (contract : InternalMessageTaskContract)
    (owner : ScopeOccurrenceId) (instanceId : SemanticId) (processId : ProcessId)
    (origin : BpmnSequenceFlowOrigin) (ordinary : InternalArmingPatch)
    (taskDifferent : ordinary.write.kind = .userTask →
      ordinary.write.elementId ≠ (⟨contract.task.id.value⟩ : NodeId))
    (messageDifferent : ordinary.write.kind = .message → ordinary.write.elementId ≠ contract.message.elementId) :
    makeInternalMessageTaskPatch program (applyInternalArmingPatch state ordinary)
        contract owner instanceId processId origin =
      makeInternalMessageTaskPatch program state contract owner instanceId processId origin := by
  have taskFrame := armingActivationRead_frame state ordinary .userTask ⟨contract.task.id.value⟩ taskDifferent
  have messageFrame := armingActivationRead_frame state ordinary .message contract.message.elementId messageDifferent
  simp only [internalActivationCount] at taskFrame messageFrame
  simp only [makeInternalMessageTaskPatch, armingTimeRead_frame, taskFrame, messageFrame,
    activityActivationCount, ordinary_arming_activity_counts]

theorem prepareInternalMessageTaskContract_ordinary_preserved
    (program : Program) (state : RuntimeState) (contract : InternalMessageTaskContract)
    (message : InternalMessageTaskPatch) (operation : SemanticOperation) (ordinary : InternalArmingPatch)
    (prepared : prepareInternalMessageTaskContract? program state contract = some message)
    (independent : regionalStateFootprintsIndependent (messageTaskStateFootprint message)
      (liftRegionalStateFootprint ordinary.owner
        (PreparedInternalArming.ordinary operation ordinary).stateFootprint) = true) :
    prepareInternalMessageTaskContract? program (applyInternalArmingPatch state ordinary)
      contract = some message := by
  obtain ⟨inputs, tasks, messages, anchors⟩ :=
    messageTask_ordinary_independent_separation message operation ordinary independent
  obtain ⟨snapshots, owner, instanceId, origin, processId, owned, running, selected, live,
    originFound, processFound, uniqueTask, uniqueMessage, taskAbsent, messageAbsent, recordAbsent, armAdmitted, rfl⟩ :=
    prepareInternalMessageTaskContract_facts program state contract message prepared
  let message := makeInternalMessageTaskPatch program state contract owner instanceId processId origin
  let after := applyInternalArmingPatch state ordinary
  have patchFrame := makeInternalMessageTaskPatch_ordinary_frame program state contract owner
    instanceId processId origin ordinary tasks messages
  have ownerFrame := armingOwnerRead_frame state ordinary contract.input inputs.symm
  have taskFrame := armingOpenAnchorRead_frame state ordinary message.arm.write.occurrence
    (anchors _ (by simp [message]))
  have messageFrame := armingOpenAnchorRead_frame state ordinary (messageWaitOccurrence message.message)
    (anchors _ (by simp [message]))
  have runningFrame : runningInstance? after = some instanceId := by
    simpa only [after, runningInstance?, armingControlRead_frame] using running
  have recordFrame : after.activityOccurrences.any (regionalActivityAssociationsConflict · message.record) = false := by
    rw [ordinary_arming_activity_records]
    exact recordAbsent
  change prepareInternalMessageTaskContract? program after contract = some message
  dsimp only [message] at taskFrame messageFrame
  simp [prepareInternalMessageTaskContract?, snapshots, after, message, ownerFrame, owned,
    runningFrame, armingLiveOwnerRead_frame, selected, live, originFound, processFound,
    patchFrame, uniqueTask, uniqueMessage, taskFrame, messageFrame, taskAbsent, messageAbsent, armAdmitted]
  intro record member
  exact Bool.eq_false_iff.mpr (List.any_eq_false.mp recordFrame record member)

theorem prepareInternalArm_message_task_preserved
    (program : Program) (state : RuntimeState) (contract : InternalMessageTaskContract)
    (message : InternalMessageTaskPatch) (operation : SemanticOperation) (ordinary : InternalArmingPatch)
    (messagePrepared : prepareInternalMessageTaskContract? program state contract = some message)
    (ordinaryPrepared : prepareInternalArm? program state operation = some ordinary)
    (independent : regionalStateFootprintsIndependent (messageTaskStateFootprint message)
      (liftRegionalStateFootprint ordinary.owner
        (PreparedInternalArming.ordinary operation ordinary).stateFootprint) = true) :
    prepareInternalArm? program (applyInternalMessageTaskPatch state message) operation = some ordinary := by
  obtain ⟨inputs, tasks, messages, anchors⟩ :=
    messageTask_ordinary_independent_separation message operation ordinary independent
  obtain ⟨_, owner, instanceId, origin, processId, _, _, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalMessageTaskContract_facts program state contract message messagePrepared
  let message := makeInternalMessageTaskPatch program state contract owner instanceId processId origin
  let after := applyInternalMessageTaskPatch state message
  have counts : internalActivationCount after ordinary.write.kind ordinary.write.elementId =
      internalActivationCount state ordinary.write.kind ordinary.write.elementId := by
    cases kind : ordinary.write.kind with
    | userTask =>
        exact taskActivationRead_set_other state contract.task.id ordinary.write.elementId
          (activationCount state contract.task.id + 1) (tasks kind).symm
    | message =>
        exact messageActivationRead_set_other state contract.message.elementId ordinary.write.elementId
          (messageActivationCount state contract.message.elementId + 1) (messages kind).symm
    | timer | effect => rfl
  apply prepared_arm_read_frame program state after operation ordinary ordinaryPrepared
  · exact armingOwnerRead_frame state message.arm ordinary.input inputs
  · rfl
  · rfl
  · intro queried
    rfl
  · rfl
  · exact counts
  · exact messageTaskOpenAnchorRead_frame state message _ rfl ordinary.write.occurrence
      (anchors _ (by simp [message])).symm (anchors _ (by simp [message])).symm
  · cases write : ordinary.write <;> rfl

theorem applyInternalMessageTaskPatch_ordinary_commutes
    (program : Program) (state : RuntimeState) (contract : InternalMessageTaskContract)
    (message : InternalMessageTaskPatch) (operation : SemanticOperation) (ordinary : InternalArmingPatch)
    (prepared : prepareInternalMessageTaskContract? program state contract = some message)
    (canonical : canonicalCollectionOrder state = true)
    (independent : regionalStateFootprintsIndependent (messageTaskStateFootprint message)
      (liftRegionalStateFootprint ordinary.owner
        (PreparedInternalArming.ordinary operation ordinary).stateFootprint) = true) :
    applyInternalArmingPatch (applyInternalMessageTaskPatch state message) ordinary =
      applyInternalMessageTaskPatch (applyInternalArmingPatch state ordinary) message := by
  obtain ⟨_, tasks, messages, _⟩ := messageTask_ordinary_independent_separation message operation ordinary independent
  obtain ⟨_, owner, instanceId, origin, processId, _, _, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalMessageTaskContract_facts program state contract message prepared
  have taskOrder : orderedBy activationBefore state.activations = true := by
    simp_all only [canonicalCollectionOrder, Bool.and_eq_true]
  have messageOrder : orderedBy messageActivationBefore state.messageActivations = true := by
    simp_all only [canonicalCollectionOrder, Bool.and_eq_true]
  clear independent prepared canonical
  cases write : ordinary.write with
  | userTask wait =>
      have different : wait.task.id ≠ contract.task.id := by
        intro same
        apply tasks (by simp [write, InternalArmingWrite.kind])
        simp [write, InternalArmingWrite.elementId, makeInternalMessageTaskPatch, same]
      simp only [applyInternalMessageTaskPatch, makeInternalMessageTaskPatch, applyInternalArmingPatch, write]
      congr 1
      · exact removeToken_commutes state.tokens contract.input ordinary.input owner ordinary.owner
      · exact insertUserTaskWait_commutes _ _ different state.waits
      · exact (setActivationCount_commutes_of_ordered _ _ _ _ different _ taskOrder).symm
  | message wait =>
      have different : wait.elementId ≠ contract.message.elementId := by
        simpa [write, InternalArmingWrite.elementId, makeInternalMessageTaskPatch] using
          messages (by simp [write, InternalArmingWrite.kind])
      simp only [applyInternalMessageTaskPatch, makeInternalMessageTaskPatch, applyInternalArmingPatch, write]
      congr 1
      · exact removeToken_commutes state.tokens contract.input ordinary.input owner ordinary.owner
      · exact insertMessageWait_commutes _ _ different state.messageWaits
      · exact (setMessageActivationCount_commutes_of_ordered _ _ _ _ different _ messageOrder).symm
  | timer wait | effect wait bindings =>
      simp only [applyInternalMessageTaskPatch, makeInternalMessageTaskPatch, applyInternalArmingPatch, write]
      congr 1
      exact removeToken_commutes state.tokens contract.input ordinary.input owner ordinary.owner

theorem prepared_message_task_ordinary_pair_commutes
    (program : Program) (state : RuntimeState) (contract : InternalMessageTaskContract)
    (message : InternalMessageTaskPatch) (operation : SemanticOperation) (ordinary : InternalArmingPatch)
    (messagePrepared : prepareInternalMessageTaskContract? program state contract = some message)
    (ordinaryPrepared : prepareInternalArm? program state operation = some ordinary)
    (canonical : canonicalCollectionOrder state = true)
    (independent : regionalStateFootprintsIndependent (messageTaskStateFootprint message)
      (liftRegionalStateFootprint ordinary.owner
        (PreparedInternalArming.ordinary operation ordinary).stateFootprint) = true) :
    prepareInternalMessageTaskContract? program (applyInternalArmingPatch state ordinary)
        contract = some message ∧
      prepareInternalArm? program (applyInternalMessageTaskPatch state message) operation = some ordinary ∧
      applyInternalArmingPatch (applyInternalMessageTaskPatch state message) ordinary =
        applyInternalMessageTaskPatch (applyInternalArmingPatch state ordinary) message :=
  ⟨prepareInternalMessageTaskContract_ordinary_preserved program state contract message operation ordinary
      messagePrepared independent,
    prepareInternalArm_message_task_preserved program state contract message operation ordinary
      messagePrepared ordinaryPrepared independent,
    applyInternalMessageTaskPatch_ordinary_commutes program state contract message operation ordinary
      messagePrepared canonical independent⟩

end BpmnSemantics.SemanticProcess.InternalCommutation
