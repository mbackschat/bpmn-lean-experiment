import BpmnSemantics.SemanticProcess.CompensationTriggerHandlerCompletion

/-! # Compensation handler completion soundness -/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

private theorem completeSuccess_sound (program : Program)
    (declaration : CompensationExecutionDeclaration) (before : RuntimeState)
    (effectId : EffectOccurrenceId) (result : EffectExecutionResult)
    (selected : SelectedCompensationHandler) (patch : List VariableBinding)
    (after : RuntimeState)
    (ready : CompensationHandlerCompletionReady program before effectId result
      declaration selected)
    (resultShape : result = .success patch)
    (applied : completeSuccess program declaration before selected = .applied after) :
    CompensationHandlerCompletionStep program before effectId result after := by
  let completed := terminalHandler selected.handler .compensated
  let handlers := replaceHandler selected.handler completed selected.trigger.handlers
  cases allEq : allHandlersCompensated handlers with
  | false =>
      let progressed : CompensationTriggerExecution :=
        { selected.trigger with lifecycle := .active, handlers }
      let remainingWaits := before.compensationHandlerEffectWaits.filter fun wait =>
        wait.id != selected.wait.id
      cases frontierEq : activateCompensationFrontier program
          { before with compensationHandlerEffectWaits := remainingWaits } progressed with
      | none =>
          simp [completeSuccess, completed, handlers, allEq, progressed, remainingWaits,
            frontierEq] at applied
      | some activated =>
          let triggers := replaceTrigger selected.trigger activated.trigger
            before.compensationTriggers
          let waits := activated.waits.foldl (fun current wait =>
            insertCompensationHandlerEffectWait wait current) remainingWaits
          let candidate : CompensationHandlerSuccessCandidate program before selected false
              activated triggers waits :=
            .advance completed handlers progressed remainingWaits activated triggers waits rfl
              rfl allEq rfl rfl
              (activateCompensationFrontier_sound program
                { before with compensationHandlerEffectWaits := remainingWaits }
                progressed activated frontierEq)
              rfl rfl
          cases capacityEq : completionCapacityRefusal? declaration triggers waits with
          | some reason =>
              simp [completeSuccess, completed, handlers, allEq, progressed, remainingWaits,
                frontierEq, triggers, waits, capacityEq] at applied
          | none =>
              let successor : RuntimeState :=
                { before with
                  compensationTriggers := triggers
                  compensationHandlerEffectWaits := waits
                  effectActivations := activated.effectActivations }
              cases validEq : compensationTriggerHandlerStateValid program successor with
              | false =>
                  simp [completeSuccess, completed, handlers, allEq, progressed,
                    remainingWaits, frontierEq, triggers, waits, capacityEq, successor,
                    validEq] at applied
              | true =>
                  simp [completeSuccess, completed, handlers, allEq, progressed,
                    remainingWaits, frontierEq, triggers, waits, capacityEq, successor,
                    validEq] at applied
                  cases applied
                  exact .successAdvance declaration selected patch activated triggers waits
                    successor ready resultShape candidate capacityEq rfl validEq
  | true =>
      let progressed : CompensationTriggerExecution :=
        { selected.trigger with lifecycle := .succeeded, handlers }
      let remainingWaits := before.compensationHandlerEffectWaits.filter fun wait =>
        wait.id != selected.wait.id
      let activated : CompensationFrontierActivation :=
        { trigger := progressed, waits := [], effectActivations := before.effectActivations }
      let triggers := replaceTrigger selected.trigger activated.trigger
        before.compensationTriggers
      let waits := remainingWaits
      let candidate : CompensationHandlerSuccessCandidate program before selected true
          activated triggers waits :=
        .final completed handlers progressed remainingWaits activated triggers waits rfl rfl
          allEq rfl rfl rfl rfl rfl
      cases capacityEq : completionCapacityRefusal? declaration triggers waits with
      | some reason =>
          simp [completeSuccess, completed, handlers, allEq, progressed, remainingWaits,
            activated, triggers, waits, capacityEq] at applied
      | none =>
          let successor : RuntimeState :=
            { before with
              tokens := addToken before.tokens selected.trigger.output selected.trigger.owner
              compensationTriggers := triggers
              compensationHandlerEffectWaits := waits
              effectActivations := activated.effectActivations }
          cases validEq : compensationTriggerHandlerStateValid program successor with
          | false =>
              simp [completeSuccess, completed, handlers, allEq, progressed, remainingWaits,
                activated, triggers, waits, capacityEq, successor, validEq] at applied
          | true =>
              simp [completeSuccess, completed, handlers, allEq, progressed, remainingWaits,
                activated, triggers, waits, capacityEq, successor, validEq] at applied
              cases applied
              exact .successFinal declaration selected patch activated triggers waits successor
                ready resultShape candidate capacityEq rfl validEq

private theorem completeSuccess_refusal_sound (program : Program)
    (declaration : CompensationExecutionDeclaration) (before : RuntimeState)
    (effectId : EffectOccurrenceId) (result : EffectExecutionResult)
    (selected : SelectedCompensationHandler) (patch : List VariableBinding)
    (reason : CompensationHandlerCompletionRefusal)
    (ready : CompensationHandlerCompletionReady program before effectId result
      declaration selected)
    (resultShape : result = .success patch)
    (refused : completeSuccess program declaration before selected = .refused reason) :
    CompensationHandlerCompletionRefusalStep program before effectId result reason := by
  let completed := terminalHandler selected.handler .compensated
  let handlers := replaceHandler selected.handler completed selected.trigger.handlers
  cases allEq : allHandlersCompensated handlers with
  | false =>
      let progressed : CompensationTriggerExecution :=
        { selected.trigger with lifecycle := .active, handlers }
      let remainingWaits := before.compensationHandlerEffectWaits.filter fun wait =>
        wait.id != selected.wait.id
      cases frontierEq : activateCompensationFrontier program
          { before with compensationHandlerEffectWaits := remainingWaits } progressed with
      | none =>
          simp [completeSuccess, completed, handlers, allEq, progressed, remainingWaits,
            frontierEq] at refused
          have reasonEq : reason = .invalidState := by simpa using refused.symm
          subst reason
          exact .invalidFrontier declaration selected patch completed handlers progressed
            remainingWaits ready resultShape rfl rfl allEq rfl rfl
            (activateCompensationFrontier_refusal_sound program
              { before with compensationHandlerEffectWaits := remainingWaits }
              progressed frontierEq)
      | some activated =>
          let triggers := replaceTrigger selected.trigger activated.trigger
            before.compensationTriggers
          let waits := activated.waits.foldl (fun current wait =>
            insertCompensationHandlerEffectWait wait current) remainingWaits
          let candidate : CompensationHandlerSuccessCandidate program before selected false
              activated triggers waits :=
            .advance completed handlers progressed remainingWaits activated triggers waits rfl
              rfl allEq rfl rfl
              (activateCompensationFrontier_sound program
                { before with compensationHandlerEffectWaits := remainingWaits }
                progressed activated frontierEq)
              rfl rfl
          cases capacityEq : completionCapacityRefusal? declaration triggers waits with
          | some capacityReason =>
              simp [completeSuccess, completed, handlers, allEq, progressed, remainingWaits,
                frontierEq, triggers, waits, capacityEq] at refused
              have reasonEq : reason = capacityReason := by simpa using refused.symm
              subst reason
              exact .capacity declaration selected patch false activated triggers waits
                capacityReason ready resultShape candidate capacityEq
          | none =>
              let successor : RuntimeState :=
                { before with
                  compensationTriggers := triggers
                  compensationHandlerEffectWaits := waits
                  effectActivations := activated.effectActivations }
              cases validEq : compensationTriggerHandlerStateValid program successor with
              | false =>
                  simp [completeSuccess, completed, handlers, allEq, progressed,
                    remainingWaits, frontierEq, triggers, waits, capacityEq, successor,
                    validEq] at refused
                  have reasonEq : reason = .invalidState := by simpa using refused.symm
                  subst reason
                  exact .invalidSuccessor declaration selected patch false activated triggers
                    waits successor ready resultShape candidate capacityEq rfl validEq
              | true =>
                  simp [completeSuccess, completed, handlers, allEq, progressed,
                    remainingWaits, frontierEq, triggers, waits, capacityEq, successor,
                    validEq] at refused
  | true =>
      let progressed : CompensationTriggerExecution :=
        { selected.trigger with lifecycle := .succeeded, handlers }
      let remainingWaits := before.compensationHandlerEffectWaits.filter fun wait =>
        wait.id != selected.wait.id
      let activated : CompensationFrontierActivation :=
        { trigger := progressed, waits := [], effectActivations := before.effectActivations }
      let triggers := replaceTrigger selected.trigger activated.trigger
        before.compensationTriggers
      let waits := remainingWaits
      let candidate : CompensationHandlerSuccessCandidate program before selected true
          activated triggers waits :=
        .final completed handlers progressed remainingWaits activated triggers waits rfl rfl
          allEq rfl rfl rfl rfl rfl
      cases capacityEq : completionCapacityRefusal? declaration triggers waits with
      | some capacityReason =>
          simp [completeSuccess, completed, handlers, allEq, progressed, remainingWaits,
            activated, triggers, waits, capacityEq] at refused
          have reasonEq : reason = capacityReason := by simpa using refused.symm
          subst reason
          exact .capacity declaration selected patch true activated triggers waits
            capacityReason ready resultShape candidate capacityEq
      | none =>
          let successor : RuntimeState :=
            { before with
              tokens := addToken before.tokens selected.trigger.output selected.trigger.owner
              compensationTriggers := triggers
              compensationHandlerEffectWaits := waits
              effectActivations := activated.effectActivations }
          cases validEq : compensationTriggerHandlerStateValid program successor with
          | false =>
              simp [completeSuccess, completed, handlers, allEq, progressed, remainingWaits,
                activated, triggers, waits, capacityEq, successor, validEq] at refused
              have reasonEq : reason = .invalidState := by simpa using refused.symm
              subst reason
              exact .invalidSuccessor declaration selected patch true activated triggers waits
                successor ready resultShape candidate capacityEq rfl validEq
          | true =>
              simp [completeSuccess, completed, handlers, allEq, progressed, remainingWaits,
                activated, triggers, waits, capacityEq, successor, validEq] at refused

private theorem completeFailure_sound (program : Program)
    (declaration : CompensationExecutionDeclaration) (before : RuntimeState)
    (effectId : EffectOccurrenceId) (result : EffectExecutionResult)
    (selected : SelectedCompensationHandler) (code : String) (message : Option String)
    (patch : List VariableBinding) (after : RuntimeState)
    (ready : CompensationHandlerCompletionReady program before effectId result
      declaration selected)
    (resultShape : result = .bpmnError code message patch)
    (applied : completeFailure program before selected code message = .applied after) :
    CompensationHandlerCompletionStep program before effectId result after := by
  let successor := compensationFailureSuccessor before selected code message
  cases validEq : compensationTriggerHandlerStateValid program successor with
  | false => simp [completeFailure, successor, validEq] at applied
  | true =>
      simp [completeFailure, successor, validEq] at applied
      cases applied
      exact .failure declaration selected code message patch successor ready resultShape
        (compensationFailureSuccessor_cancellation_sound before selected code message) validEq

private theorem completeFailure_refusal_sound (program : Program)
    (declaration : CompensationExecutionDeclaration) (before : RuntimeState)
    (effectId : EffectOccurrenceId) (result : EffectExecutionResult)
    (selected : SelectedCompensationHandler) (code : String) (message : Option String)
    (patch : List VariableBinding) (reason : CompensationHandlerCompletionRefusal)
    (ready : CompensationHandlerCompletionReady program before effectId result
      declaration selected)
    (resultShape : result = .bpmnError code message patch)
    (refused : completeFailure program before selected code message = .refused reason) :
    CompensationHandlerCompletionRefusalStep program before effectId result reason := by
  let successor := compensationFailureSuccessor before selected code message
  cases validEq : compensationTriggerHandlerStateValid program successor with
  | false =>
      simp [completeFailure, successor, validEq] at refused
      have reasonEq : reason = .invalidState := by simpa using refused.symm
      subst reason
      exact .invalidFailureSuccessor declaration selected code message patch successor ready
        resultShape (compensationFailureSuccessor_cancellation_sound before selected code message)
        validEq
  | true => simp [completeFailure, successor, validEq] at refused

theorem attemptCompensationHandlerEffectCompletion_sound (program : Program)
    (before after : RuntimeState) (effectId : EffectOccurrenceId)
    (result : EffectExecutionResult)
    (applied : attemptCompensationHandlerEffectCompletion program before effectId result =
      .applied after) :
    CompensationHandlerCompletionStep program before effectId result after := by
  cases declarationEq : program.compensationExecution with
  | none => simp [attemptCompensationHandlerEffectCompletion, declarationEq] at applied
  | some declaration =>
      cases programRejectedEq : !compensationExecutionDeclarationValid program with
      | true =>
          simp [attemptCompensationHandlerEffectCompletion, declarationEq,
            programRejectedEq] at applied
      | false =>
          let programReady : CompensationHandlerCompletionProgramReady program declaration :=
            .ready declaration declarationEq programRejectedEq
          cases stateRejectedEq : compensationHandlerCompletionStateRejected program before with
          | true =>
              simp [attemptCompensationHandlerEffectCompletion, declarationEq,
                programRejectedEq, stateRejectedEq] at applied
          | false =>
              let stateReady : CompensationHandlerCompletionStateReady program before
                  declaration := .ready declaration programReady stateRejectedEq
              cases patchRejectedEq : compensationHandlerCompletionPatchRejected result with
              | true =>
                  simp [attemptCompensationHandlerEffectCompletion, declarationEq,
                    programRejectedEq, stateRejectedEq, patchRejectedEq] at applied
              | false =>
                  let inputReady : CompensationHandlerCompletionInputReady program before result
                      declaration := .ready declaration stateReady patchRejectedEq
                  cases handlerEq : selectCompensationHandler? before effectId with
                  | none =>
                      simp [attemptCompensationHandlerEffectCompletion, declarationEq,
                        programRejectedEq, stateRejectedEq, patchRejectedEq, handlerEq] at applied
                  | some selected =>
                      let ready : CompensationHandlerCompletionReady program before effectId
                          result declaration selected :=
                        .ready declaration selected inputReady handlerEq
                      cases result with
                      | success patch =>
                          apply completeSuccess_sound program declaration before effectId
                            (.success patch) selected patch after ready rfl
                          simpa [attemptCompensationHandlerEffectCompletion, declarationEq,
                            programRejectedEq, stateRejectedEq, patchRejectedEq, handlerEq]
                            using applied
                      | bpmnError code message patch =>
                          apply completeFailure_sound program declaration before effectId
                            (.bpmnError code message patch) selected code message patch after ready rfl
                          simpa [attemptCompensationHandlerEffectCompletion, declarationEq,
                            programRejectedEq, stateRejectedEq, patchRejectedEq, handlerEq]
                            using applied

theorem attemptCompensationHandlerEffectCompletion_refusal_sound (program : Program)
    (before : RuntimeState) (effectId : EffectOccurrenceId)
    (result : EffectExecutionResult) (reason : CompensationHandlerCompletionRefusal)
    (refused : attemptCompensationHandlerEffectCompletion program before effectId result =
      .refused reason) :
    CompensationHandlerCompletionRefusalStep program before effectId result reason := by
  cases declarationEq : program.compensationExecution with
  | none =>
      simp [attemptCompensationHandlerEffectCompletion, declarationEq] at refused
      have reasonEq : reason = .invalidProgram := by simpa using refused.symm
      subst reason
      exact .invalidProgram (by simp [declarationEq])
  | some declaration =>
      cases programRejectedEq : !compensationExecutionDeclarationValid program with
      | true =>
          simp [attemptCompensationHandlerEffectCompletion, declarationEq,
            programRejectedEq] at refused
          have reasonEq : reason = .invalidProgram := by simpa using refused.symm
          subst reason
          exact .invalidProgram (by simp [declarationEq, programRejectedEq])
      | false =>
          let programReady : CompensationHandlerCompletionProgramReady program declaration :=
            .ready declaration declarationEq programRejectedEq
          cases stateRejectedEq : compensationHandlerCompletionStateRejected program before with
          | true =>
              simp [attemptCompensationHandlerEffectCompletion, declarationEq,
                programRejectedEq, stateRejectedEq] at refused
              have reasonEq : reason = .invalidState := by simpa using refused.symm
              subst reason
              exact .invalidState declaration programReady stateRejectedEq
          | false =>
              let stateReady : CompensationHandlerCompletionStateReady program before
                  declaration := .ready declaration programReady stateRejectedEq
              cases patchRejectedEq : compensationHandlerCompletionPatchRejected result with
              | true =>
                  simp [attemptCompensationHandlerEffectCompletion, declarationEq,
                    programRejectedEq, stateRejectedEq, patchRejectedEq] at refused
                  have reasonEq : reason = .nonemptyPatch := by simpa using refused.symm
                  subst reason
                  exact .nonemptyPatch declaration stateReady patchRejectedEq
              | false =>
                  let inputReady : CompensationHandlerCompletionInputReady program before result
                      declaration := .ready declaration stateReady patchRejectedEq
                  cases handlerEq : selectCompensationHandler? before effectId with
                  | none =>
                      simp [attemptCompensationHandlerEffectCompletion, declarationEq,
                        programRejectedEq, stateRejectedEq, patchRejectedEq, handlerEq] at refused
                      have reasonEq : reason = .staleEffect := by simpa using refused.symm
                      subst reason
                      exact .staleEffect declaration inputReady handlerEq
                  | some selected =>
                      let ready : CompensationHandlerCompletionReady program before effectId
                          result declaration selected :=
                        .ready declaration selected inputReady handlerEq
                      cases result with
                      | success patch =>
                          apply completeSuccess_refusal_sound program declaration before effectId
                            (.success patch) selected patch reason ready rfl
                          simpa [attemptCompensationHandlerEffectCompletion, declarationEq,
                            programRejectedEq, stateRejectedEq, patchRejectedEq, handlerEq]
                            using refused
                      | bpmnError code message patch =>
                          apply completeFailure_refusal_sound program declaration before effectId
                            (.bpmnError code message patch) selected code message patch reason ready rfl
                          simpa [attemptCompensationHandlerEffectCompletion, declarationEq,
                            programRejectedEq, stateRejectedEq, patchRejectedEq, handlerEq]
                            using refused

end BpmnSemantics.SemanticProcess
