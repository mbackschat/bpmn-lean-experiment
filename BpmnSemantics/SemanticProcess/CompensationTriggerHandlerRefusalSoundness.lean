import BpmnSemantics.SemanticProcess.CompensationTriggerHandlerTransition

/-! # Compensation trigger disabled and refusal soundness -/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

theorem attemptCompensationTrigger_disabled_sound (program : Program)
    (operation : SemanticOperation) (before : RuntimeState)
    (selected : attemptCompensationTrigger program operation before = .disabled before) :
    CompensationTriggerDisabledStep program operation before := by
  cases declarationEq : program.compensationExecution with
  | none => simp [attemptCompensationTrigger, declarationEq] at selected
  | some declaration =>
      cases operation <;>
        simp only [attemptCompensationTrigger, declarationEq] at selected
      all_goals try { cases selected }
      case triggerCompensation operationId origin definitionScopeId input output =>
        cases programRejectedEq :
            compensationTriggerProgramRejected program declaration operationId with
        | true => simp [programRejectedEq] at selected
        | false =>
            let programReady : CompensationTriggerProgramReady program
                (.triggerCompensation operationId origin definitionScopeId input output)
                declaration operationId definitionScopeId input output :=
              .ready declaration operationId origin definitionScopeId input output
                declarationEq rfl programRejectedEq
            cases controlEq : before.control <;>
              simp only [programRejectedEq, controlEq] at selected
            case notStarted =>
              exact .nonrunning declaration operationId definitionScopeId input output
                programReady (by simp [controlEq])
            case completed instanceId =>
              exact .nonrunning declaration operationId definitionScopeId input output
                programReady (by simp [controlEq])
            case cancelled instanceId =>
              exact .nonrunning declaration operationId definitionScopeId input output
                programReady (by simp [controlEq])
            case failed instanceId failure =>
              exact .nonrunning declaration operationId definitionScopeId input output
                programReady (by simp [controlEq])
            case running instanceId =>
              simp only [Bool.false_eq_true, if_false] at selected
              cases ownerEq : onlyTokenOwner? before input with
              | none =>
                  exact .missingOwner declaration operationId definitionScopeId input output
                    instanceId programReady controlEq ownerEq
              | some owner =>
                  cases ownerRejectedEq :
                      compensationTriggerOwnerRejected before owner definitionScopeId with
                  | true =>
                      exact .invalidOwner declaration operationId definitionScopeId input output
                        instanceId owner programReady controlEq ownerEq ownerRejectedEq
                  | false =>
                      cases stateRejectedEq :
                          !compensationTriggerHandlerStateValid program before with
                      | true =>
                          simp [ownerEq, ownerRejectedEq, stateRejectedEq] at selected
                      | false =>
                          cases activeEq : (before.compensationTriggers.any fun trigger =>
                              trigger.lifecycle == .active && trigger.owner == owner) with
                          | true =>
                              simp [ownerEq, ownerRejectedEq, stateRejectedEq, activeEq]
                                at selected
                          | false =>
                              cases sourcesEq :
                                  selectedCompensationSubjects? program owner before with
                              | none =>
                                  simp [ownerEq, ownerRejectedEq, stateRejectedEq, activeEq,
                                    sourcesEq] at selected
                              | some subjects =>
                                  cases subjects with
                                  | nil =>
                                      cases validEq :
                                          compensationTriggerHandlerStateValid program
                                            { before with
                                              control := .running instanceId
                                              tokens := addToken
                                                (removeToken before.tokens input owner)
                                                output owner } <;>
                                        simp [ownerEq, ownerRejectedEq, stateRejectedEq, activeEq,
                                          sourcesEq, validEq] at selected
                                  | cons first rest =>
                                      cases frontierEq : constructCompensationTriggerFrontier
                                          program before
                                            (.triggerCompensation operationId origin
                                              definitionScopeId input output)
                                            owner (first :: rest) with
                                      | none =>
                                          simp [ownerEq, ownerRejectedEq, stateRejectedEq, activeEq,
                                            sourcesEq, frontierEq] at selected
                                      | some activated =>
                                          let triggers := insertTrigger activated.trigger
                                            before.compensationTriggers
                                          let waits := activated.waits.foldl (fun current wait =>
                                            insertCompensationHandlerEffectWait wait current)
                                            before.compensationHandlerEffectWaits
                                          cases capacityEq : compensationExecutionCapacityRefusal?
                                              declaration triggers waits with
                                          | some reason =>
                                              simp [ownerEq, ownerRejectedEq, stateRejectedEq,
                                                activeEq, sourcesEq, frontierEq, triggers,
                                                waits, capacityEq] at selected
                                          | none =>
                                              cases validEq :
                                                  compensationTriggerHandlerStateValid program
                                                    { before with
                                                      control := .running instanceId
                                                      tokens := removeToken before.tokens input owner
                                                      compensationActivityRetentions :=
                                                        clearClaimedActivityRecords owner
                                                          before.compensationActivityRetentions
                                                      compensationParentContextRetentions :=
                                                        before.compensationParentContextRetentions.filter
                                                          fun retention =>
                                                            !triggerRetentionOwnedByRoot retention owner
                                                      compensationTriggers := triggers
                                                      compensationHandlerEffectWaits := waits
                                                      effectActivations :=
                                                        activated.effectActivations } <;>
                                                simp [ownerEq, ownerRejectedEq, stateRejectedEq,
                                                  activeEq, sourcesEq, frontierEq, triggers,
                                                  waits, capacityEq, validEq]
                                                  at selected

theorem attemptCompensationTrigger_refusal_sound (program : Program)
    (operation : SemanticOperation) (before : RuntimeState)
    (reason : CompensationTriggerRefusal)
    (selected : attemptCompensationTrigger program operation before = .refused reason) :
    CompensationTriggerRefusalStep program operation before reason := by
  cases declarationEq : program.compensationExecution with
  | none =>
      simp [attemptCompensationTrigger, declarationEq] at selected
      cases selected
      exact .invalidProgram (by simp [declarationEq])
  | some declaration =>
      cases operation <;>
        simp only [attemptCompensationTrigger, declarationEq] at selected
      all_goals try {
        have reasonEq : reason = .invalidProgram := by simpa using selected.symm
        subst reason
        exact .invalidProgram (by simp)
      }
      case triggerCompensation operationId origin definitionScopeId input output =>
        cases programRejectedEq :
            compensationTriggerProgramRejected program declaration operationId with
        | true =>
            simp [programRejectedEq] at selected
            cases selected
            exact .invalidProgram (by simp [declarationEq, programRejectedEq])
        | false =>
            let programReady : CompensationTriggerProgramReady program
                (.triggerCompensation operationId origin definitionScopeId input output)
                declaration operationId definitionScopeId input output :=
              .ready declaration operationId origin definitionScopeId input output
                declarationEq rfl programRejectedEq
            cases controlEq : before.control <;>
              simp only [programRejectedEq, controlEq] at selected
            all_goals try { cases selected }
            case running instanceId =>
              simp only [Bool.false_eq_true, if_false] at selected
              cases ownerEq : onlyTokenOwner? before input with
              | none => simp [ownerEq] at selected
              | some owner =>
                  cases ownerRejectedEq :
                      compensationTriggerOwnerRejected before owner definitionScopeId with
                  | true => simp [ownerEq, ownerRejectedEq] at selected
                  | false =>
                      let ownerReady : CompensationTriggerOwnerReady before
                          definitionScopeId input owner :=
                        .ready instanceId owner controlEq ownerEq ownerRejectedEq
                      cases stateRejectedEq :
                          !compensationTriggerHandlerStateValid program before with
                      | true =>
                          simp [ownerEq, ownerRejectedEq, stateRejectedEq] at selected
                          cases selected
                          exact .invalidState declaration operationId definitionScopeId input
                            output owner programReady ownerReady stateRejectedEq
                      | false =>
                          cases activeEq : (before.compensationTriggers.any fun trigger =>
                              trigger.lifecycle == .active && trigger.owner == owner) with
                          | true =>
                              simp [ownerEq, ownerRejectedEq, stateRejectedEq, activeEq]
                                at selected
                              cases selected
                              exact .activeTrigger declaration operationId definitionScopeId
                                input output owner programReady ownerReady stateRejectedEq activeEq
                          | false =>
                              have operationMatches :
                                  declaration.triggerOperationId = operationId := by
                                by_cases same :
                                    declaration.triggerOperationId = operationId
                                · exact same
                                · simp [compensationTriggerProgramRejected, same]
                                    at programRejectedEq
                              let ready : CompensationTriggerReady program
                                  (.triggerCompensation operationId origin definitionScopeId
                                    input output)
                                  before declaration operationId definitionScopeId input output
                                  owner :=
                                .ready declaration operationId definitionScopeId input output
                                  owner programReady ownerReady stateRejectedEq activeEq
                              cases sourcesEq :
                                  selectedCompensationSubjects? program owner before with
                              | none =>
                                  simp [ownerEq, ownerRejectedEq, stateRejectedEq, activeEq,
                                    sourcesEq] at selected
                                  cases selected
                                  exact .invalidSources declaration operationId definitionScopeId
                                    input output owner ready sourcesEq
                              | some subjects =>
                                  cases subjects with
                                  | nil =>
                                      let successor : RuntimeState :=
                                        { before with
                                          tokens := addToken
                                            (removeToken before.tokens input owner) output owner }
                                      cases validEq :
                                          compensationTriggerHandlerStateValid program successor with
                                      | false =>
                                          have evaluatorValidEq :
                                              compensationTriggerHandlerStateValid program
                                                { before with
                                                  control := .running instanceId
                                                  tokens := addToken
                                                    (removeToken before.tokens input owner)
                                                    output owner } = false := by
                                            simpa [successor, controlEq] using validEq
                                          simp [ownerEq, ownerRejectedEq, stateRejectedEq, activeEq,
                                            sourcesEq, evaluatorValidEq] at selected
                                          cases selected
                                          exact .invalidZeroSubjectSuccessor declaration operationId
                                            definitionScopeId input output owner successor ready
                                            sourcesEq rfl validEq
                                      | true =>
                                          have evaluatorValidEq :
                                              compensationTriggerHandlerStateValid program
                                                { before with
                                                  control := .running instanceId
                                                  tokens := addToken
                                                    (removeToken before.tokens input owner)
                                                    output owner } = true := by
                                            simpa [successor, controlEq] using validEq
                                          simp [ownerEq, ownerRejectedEq, stateRejectedEq, activeEq,
                                            sourcesEq, evaluatorValidEq] at selected
                                  | cons first rest =>
                                      let pending : CompensationTriggerExecution :=
                                        { id := nextOccurrence owner.processInstanceId
                                            operationId.value
                                            (before.compensationTriggers.map (·.id))
                                          owner
                                          output
                                          lifecycle := .active
                                          handlers := selectedHandlers before owner (first :: rest)
                                          dependencies := occurrenceDependencies program declaration
                                            (selectedHandlers before owner (first :: rest)) }
                                      cases frontierEq : constructCompensationTriggerFrontier
                                          program before
                                            (.triggerCompensation operationId origin
                                              definitionScopeId input output)
                                            owner (first :: rest) with
                                      | none =>
                                          simp [ownerEq, ownerRejectedEq, stateRejectedEq, activeEq,
                                            sourcesEq, frontierEq] at selected
                                          cases selected
                                          have refusedEq :
                                              activateCompensationFrontier program before pending =
                                                none := by
                                            simpa [constructCompensationTriggerFrontier,
                                              declarationEq, operationMatches, pending]
                                              using frontierEq
                                          exact .invalidFrontier declaration operationId
                                            definitionScopeId input output owner first rest pending
                                            ready sourcesEq rfl
                                            (activateCompensationFrontier_refusal_sound program before
                                              pending refusedEq)
                                      | some activated =>
                                          have activatedEq :
                                              activateCompensationFrontier program before pending =
                                                some activated := by
                                            simpa [constructCompensationTriggerFrontier,
                                              declarationEq, operationMatches, pending]
                                              using frontierEq
                                          let triggers := insertTrigger activated.trigger
                                            before.compensationTriggers
                                          let waits := activated.waits.foldl (fun current wait =>
                                            insertCompensationHandlerEffectWait wait current)
                                            before.compensationHandlerEffectWaits
                                          cases capacityEq : compensationExecutionCapacityRefusal?
                                              declaration triggers waits with
                                          | some capacityReason =>
                                              simp [ownerEq, ownerRejectedEq, stateRejectedEq,
                                                activeEq, sourcesEq, frontierEq, triggers,
                                                waits, capacityEq] at selected
                                              have reasonEq : reason = capacityReason := by
                                                simpa using selected.symm
                                              subst reason
                                              exact .capacity declaration operationId
                                                definitionScopeId input output owner first rest
                                                pending activated triggers waits capacityReason ready
                                                sourcesEq rfl
                                                (activateCompensationFrontier_sound program before
                                                  pending activated activatedEq)
                                                rfl rfl capacityEq
                                          | none =>
                                              let successor : RuntimeState :=
                                                { before with
                                                  tokens := removeToken before.tokens input owner
                                                  compensationActivityRetentions :=
                                                    clearClaimedActivityRecords owner
                                                      before.compensationActivityRetentions
                                                  compensationParentContextRetentions :=
                                                    before.compensationParentContextRetentions.filter
                                                      fun retention =>
                                                        !triggerRetentionOwnedByRoot retention owner
                                                  compensationTriggers := triggers
                                                  compensationHandlerEffectWaits := waits
                                                  effectActivations := activated.effectActivations }
                                              cases validEq :
                                                  compensationTriggerHandlerStateValid program
                                                    successor with
                                              | false =>
                                                  have evaluatorValidEq :
                                                      compensationTriggerHandlerStateValid program
                                                        { before with
                                                          control := .running instanceId
                                                          tokens := removeToken before.tokens input
                                                            owner
                                                          compensationActivityRetentions :=
                                                            clearClaimedActivityRecords owner
                                                              before.compensationActivityRetentions
                                                          compensationParentContextRetentions :=
                                                            before.compensationParentContextRetentions.filter
                                                              fun retention =>
                                                                !triggerRetentionOwnedByRoot retention owner
                                                          compensationTriggers := triggers
                                                          compensationHandlerEffectWaits := waits
                                                          effectActivations :=
                                                            activated.effectActivations } = false := by
                                                    simpa [successor, controlEq] using validEq
                                                  simp [ownerEq, ownerRejectedEq, stateRejectedEq,
                                                    activeEq, sourcesEq, frontierEq, triggers,
                                                    waits, capacityEq, evaluatorValidEq] at selected
                                                  cases selected
                                                  exact .invalidNonemptySuccessor declaration
                                                    operationId definitionScopeId input output owner
                                                    first rest pending activated triggers waits
                                                    successor ready sourcesEq rfl
                                                    (activateCompensationFrontier_sound program before
                                                      pending activated activatedEq)
                                                    rfl rfl capacityEq rfl validEq
                                              | true =>
                                                  have evaluatorValidEq :
                                                      compensationTriggerHandlerStateValid program
                                                        { before with
                                                          control := .running instanceId
                                                          tokens := removeToken before.tokens input
                                                            owner
                                                          compensationActivityRetentions :=
                                                            clearClaimedActivityRecords owner
                                                              before.compensationActivityRetentions
                                                          compensationParentContextRetentions :=
                                                            before.compensationParentContextRetentions.filter
                                                              fun retention =>
                                                                !triggerRetentionOwnedByRoot retention owner
                                                          compensationTriggers := triggers
                                                          compensationHandlerEffectWaits := waits
                                                          effectActivations :=
                                                            activated.effectActivations } = true := by
                                                    simpa [successor, controlEq] using validEq
                                                  simp [ownerEq, ownerRejectedEq, stateRejectedEq,
                                                    activeEq, sourcesEq, frontierEq, triggers,
                                                    waits, capacityEq, evaluatorValidEq] at selected

end BpmnSemantics.SemanticProcess
