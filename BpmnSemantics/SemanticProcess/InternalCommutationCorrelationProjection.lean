import BpmnSemantics.SemanticProcess.InternalCommutationCore
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycleProofs
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceProgramValidityFrames

/-! # Correlated-message internal commutation projections

Proves the occurrence-projection facts specific to one prepared correlated Message catch arm.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

namespace InternalCommutation

theorem prepared_correlated_arm_anchor_shape (program : Program) (state : RuntimeState)
    (id : OperationId) (origin : BpmnElementOrigin) (input output : ControlPlaceId)
    (message : MessageDefinition) (correlationKeyId correlationPropertyId : String)
    (payloadSelector : CorrelationMessagePath)
    (processPropertySelector : CorrelationProcessPropertyPath) (patch : InternalArmingPatch)
    (prepared : prepareInternalArm? program state
      (.awaitCorrelatedPayloadMessage id origin input output message correlationKeyId
        correlationPropertyId payloadSelector processPropertySelector) = some patch) :
    patch.write.occurrence =
        { processInstanceId := patch.owner.processInstanceId,
          elementId := ⟨patch.write.elementId.value⟩,
          activation := patch.write.occurrence.activation } ∧
      openWaitAnchorAbsent state patch.write.occurrence = true := by
  simp_all [prepareInternalArm?, internalArmInput?, internalArmOrigin?]
  obtain ⟨owner, ownerEq, prepared⟩ := Option.bind_eq_some_iff.mp prepared
  split at prepared
  · simp at prepared
  · obtain ⟨inputOrigin, inputOriginEq, prepared⟩ :=
      Option.bind_eq_some_iff.mp prepared
    cases controlEq : state.control <;> simp_all
    cases filteredEq : state.variables.process.bindings.filter fun candidate =>
        candidate.name = processPropertySelector.propertyId with
    | nil => simp_all
    | cons binding rest =>
      cases rest with
      | cons _ _ => simp_all
      | nil =>
        cases valueEq : binding.value with
        | string value =>
          by_cases empty : value.isEmpty = true
          · simp_all
          · simp_all
            obtain ⟨_, _, _, patchEq⟩ := prepared
            simp_all [InternalArmingWrite.occurrence, InternalArmingWrite.elementId,
              messageWaitOccurrence]
        | boolean _ => simp_all
        | integer _ => simp_all
        | stringList _ => simp_all
        | null => simp_all

theorem prepared_correlated_arm_projectWaits_insert (program : Program) (state : RuntimeState)
    (id : OperationId) (origin : BpmnElementOrigin) (input output : ControlPlaceId)
    (message : MessageDefinition) (correlationKeyId correlationPropertyId : String)
    (payloadSelector : CorrelationMessagePath)
    (processPropertySelector : CorrelationProcessPropertyPath) (patch : InternalArmingPatch)
    (prepared : prepareInternalArm? program state
      (.awaitCorrelatedPayloadMessage id origin input output message correlationKeyId
        correlationPropertyId payloadSelector processPropertySelector) = some patch)
    (newStart : OpenSemanticFlowNodeOccurrence)
    (started : waitStart? program state patch.owner patch.write.elementId
      patch.write.occurrence.activation = some newStart) :
    ∀ beforeWaits, projectWaits? program state = some beforeWaits →
      ∃ afterWaits, projectWaits? program (applyInternalArmingPatch state patch) = some afterWaits ∧
        afterWaits.Perm (newStart :: beforeWaits) := by
  intro beforeWaits beforeProjected
  obtain ⟨tasks, messages, timers, effects, incidents, tasksEq, messagesEq, timersEq,
      effectsEq, incidentsEq, rfl⟩ :=
    (projectWaits_eq_some_iff program state beforeWaits).mp beforeProjected
  simp_all [prepareInternalArm?, internalArmInput?, internalArmOrigin?]
  obtain ⟨owner, ownerEq, prepared⟩ := Option.bind_eq_some_iff.mp prepared
  split at prepared <;> try simp at prepared
  obtain ⟨inputOrigin, inputOriginEq, prepared⟩ := Option.bind_eq_some_iff.mp prepared
  cases controlEq : state.control <;> simp_all
  rename_i instanceId selection
  cases filteredEq : state.variables.process.bindings.filter fun candidate =>
      candidate.name = processPropertySelector.propertyId with
  | nil => simp_all
  | cons binding rest =>
    cases rest with
    | cons _ _ => simp_all
    | nil =>
      cases valueEq : binding.value with
      | string value =>
        by_cases empty : value.isEmpty = true
        · simp_all
        · simp_all
          obtain ⟨nonempty, unique, absent, available, patchEq⟩ := prepared
          let wait : MessageWait :=
            { processInstanceId := owner.processInstanceId, owner,
              elementId := message.elementId,
              activation := messageActivationCount state message.elementId + 1,
              channel := message.channel, output }
          let currentPatch : InternalArmingPatch :=
            { operation := .awaitCorrelatedPayloadMessage id origin input output message
                correlationKeyId correlationPropertyId payloadSelector processPropertySelector,
              definition := program.identity, processId := program.processId, origin,
              runtimeInstanceId := instanceId, logicalTimeMs := state.logicalTimeMs,
              input, inputOrigin, owner, write := .message wait }
          have startEq : waitStart? program state wait.owner wait.elementId wait.activation =
              some newStart := by
            simpa [currentPatch, wait, InternalArmingWrite.elementId,
              InternalArmingWrite.occurrence, messageWaitOccurrence] using started
          have newMapped : waitStart? program (applyInternalArmingPatch state currentPatch)
              wait.owner wait.elementId wait.activation = some newStart := by
            rw [show waitStart? program (applyInternalArmingPatch state currentPatch)
                wait.owner wait.elementId wait.activation =
                  waitStart? program state wait.owner wait.elementId wait.activation by
              rfl]
            exact startEq
          have oldMessagesMapped : state.messageWaits.mapM (fun current => waitStart? program
              (applyInternalArmingPatch state currentPatch) current.owner current.elementId
              current.activation) = some messages := by
            rw [mapM_eq_of_pointwise state.messageWaits _ _ (fun current => by rfl)]
            exact messagesEq
          obtain ⟨afterMessages, afterMessagesEq, messagePerm⟩ :=
            mapM_canonicalInsertBy_some messageWaitBefore _ wait newStart state.messageWaits
              messages newMapped oldMessagesMapped
          have tasksAfterEq : state.waits.mapM (fun current => waitStart? program
              (applyInternalArmingPatch state currentPatch) current.owner
              ⟨current.task.id.value⟩ current.activation) = some tasks := by
            rw [mapM_eq_of_pointwise state.waits _ _ (fun current => by rfl)]
            exact tasksEq
          have timersAfterEq : (state.timerWaits.filter fun current =>
              !flowNodeOccurrenceBoundaryTimerBound program state current).mapM
              (fun current => waitStart? program (applyInternalArmingPatch state currentPatch)
                current.owner current.elementId current.activation) = some timers := by
            rw [mapM_eq_of_pointwise _ _ _ (fun current => by rfl)]
            exact timersEq
          have effectsAfterEq : state.effectWaits.mapM (fun current => waitStart? program
              (applyInternalArmingPatch state currentPatch) current.owner current.elementId
              current.activation) = some effects := by
            rw [mapM_eq_of_pointwise state.effectWaits _ _ (fun current => by rfl)]
            exact effectsEq
          have incidentsAfterEq : state.effectIncidents.mapM (fun current => waitStart? program
              (applyInternalArmingPatch state currentPatch) current.wait.owner
              current.wait.elementId current.wait.activation) = some incidents := by
            rw [mapM_eq_of_pointwise state.effectIncidents _ _ (fun current => by rfl)]
            exact incidentsEq
          refine ⟨tasks ++ (afterMessages ++ (timers ++ (effects ++ incidents))), ?_, ?_⟩
          · apply (projectWaits_eq_some_iff _ _ _).mpr
            exact ⟨tasks, afterMessages, timers, effects, incidents, tasksAfterEq,
              by simpa [currentPatch, applyInternalArmingPatch, wait, insertMessageWait] using
                afterMessagesEq,
              timersAfterEq, effectsAfterEq, incidentsAfterEq, rfl⟩
          · exact append_component_insert_perm tasks afterMessages messages
              (timers ++ (effects ++ incidents)) newStart messagePerm
      | boolean _ => simp_all
      | integer _ => simp_all
      | stringList _ => simp_all
      | null => simp_all

theorem prepared_correlated_arm_preserves_flowNodeOccurrenceProgramValidity
    (program : Program) (state : RuntimeState) (id : OperationId) (origin : BpmnElementOrigin)
    (input output : ControlPlaceId) (message : MessageDefinition)
    (correlationKeyId correlationPropertyId : String)
    (payloadSelector : CorrelationMessagePath)
    (processPropertySelector : CorrelationProcessPropertyPath) (patch : InternalArmingPatch)
    (programAdmitted : programWellFormed program = true)
    (valid : flowNodeOccurrenceProgramValidity program state = true)
    (prepared : prepareInternalArm? program state
      (.awaitCorrelatedPayloadMessage id origin input output message correlationKeyId
        correlationPropertyId payloadSelector processPropertySelector) = some patch) :
    flowNodeOccurrenceProgramValidity program (applyInternalArmingPatch state patch) = true := by
  have structural : flowNodeOccurrenceStructuralProgramValidity program state = true := by
    have parts := valid
    simp only [flowNodeOccurrenceProgramValidity, Bool.and_eq_true] at parts
    exact parts.1.1.1
  simp_all [prepareInternalArm?, internalArmInput?, internalArmOrigin?]
  obtain ⟨owner, ownerEq, prepared⟩ := Option.bind_eq_some_iff.mp prepared
  split at prepared <;> try simp at prepared
  obtain ⟨inputOrigin, inputOriginEq, prepared⟩ := Option.bind_eq_some_iff.mp prepared
  cases controlEq : state.control <;> simp_all
  rename_i instanceId selection
  cases filteredEq : state.variables.process.bindings.filter fun candidate =>
      candidate.name = processPropertySelector.propertyId with
  | nil => simp_all
  | cons binding rest =>
    cases rest with
    | cons _ _ => simp_all
    | nil =>
      cases valueEq : binding.value with
      | string value =>
        by_cases empty : value.isEmpty = true
        · simp_all
        · simp_all
          obtain ⟨nonempty, unique, absent, available, patchEq⟩ := prepared
          let wait : MessageWait :=
            { processInstanceId := owner.processInstanceId, owner,
              elementId := message.elementId,
              activation := messageActivationCount state message.elementId + 1,
              channel := message.channel, output }
          have declarers : messageWaitDeclarers program message.elementId =
              [.awaitCorrelatedPayloadMessage id origin input output message correlationKeyId
                correlationPropertyId payloadSelector processPropertySelector] := by
            simpa [uniqueFamilyDeclarer?, InternalArmingWrite.kind,
              InternalArmingWrite.elementId, wait] using unique.1.1
          have operationMember :
              .awaitCorrelatedPayloadMessage id origin input output message correlationKeyId
                correlationPropertyId payloadSelector processPropertySelector ∈
                  program.operations := by
            have member :
                .awaitCorrelatedPayloadMessage id origin input output message correlationKeyId
                  correlationPropertyId payloadSelector processPropertySelector ∈
                    messageWaitDeclarers program message.elementId := by
              rw [declarers]
              simp
            exact (List.mem_filter.mp member).1
          have declared := declaredByExactlyOneOwnedOperation_of_exactSelection program
            (.awaitCorrelatedPayloadMessage id origin input output message correlationKeyId
              correlationPropertyId payloadSelector processPropertySelector) owner _ declarers
                selection.1
          have live : flowNodeOccurrenceOwnerLiveUnique state owner = true := by
            simpa [flowNodeOccurrenceOwnerLiveUnique, exactLiveOccurrence] using selection.2
          have processId := flowNodeOccurrenceStructuralProgramValidity_live_owner_nonempty
            program state owner structural selection.2
          have elementId := programWellFormed_internalArm_element_nonempty program
            (.awaitCorrelatedPayloadMessage id origin input output message correlationKeyId
              correlationPropertyId payloadSelector processPropertySelector) programAdmitted
                operationMember
          have referenceValid :=
            flowNodeOccurrenceProgramValidity_insertCorrelatedPayloadMessage program state id
              origin input message correlationKeyId correlationPropertyId payloadSelector
                processPropertySelector wait valid declarers declared live processId
                  (by simpa [wait] using elementId) (by simp [wait]) rfl rfl rfl
          apply flowNodeOccurrenceProgramValidity_from_reference program state
            { state with messageWaits := insertMessageWait wait state.messageWaits } _ valid
              referenceValid
          all_goals rfl
      | boolean _ => simp_all
      | integer _ => simp_all
      | stringList _ => simp_all
      | null => simp_all

end InternalCommutation

end BpmnSemantics.SemanticProcess
