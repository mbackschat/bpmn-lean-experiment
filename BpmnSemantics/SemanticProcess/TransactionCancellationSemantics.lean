import BpmnSemantics.SemanticProcess.CompensationTriggerHandlerCompletionSoundness

/-! # Transaction cancellation relations

TXC-CANCEL-01 selects retained sources before regional withdrawal. The declarative cases separate
an empty cancellation join from a capacity-checked handler frontier; TXC-FAIL-01 retains the existing
whole-Process failure disposition rather than asserting a regional frame for failure.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- Exact Program, token and live-child ownership required before selecting eligible records. -/
inductive TransactionCancellationReady (program : Program) (operation : SemanticOperation)
    (before : RuntimeState) (declaration : CompensationExecutionDeclaration)
    (operationId : OperationId) (scope : DefinitionScopeId)
    (input output : ControlPlaceId) (owner : ScopeOccurrenceId) : Prop where
  | ready (origin : BpmnElementOrigin) (boundary : NodeId)
      (declarationSelected : program.compensationExecution = some declaration)
      (operationSelected : operation = .cancelTransaction operationId origin scope input output boundary)
      (programAccepted : compensationTriggerProgramRejected program declaration operationId = false)
      (running : before.control = .running owner.processInstanceId)
      (tokenOwner : onlyTokenOwner? before input = some owner)
      (scopeMatches : owner.definitionScopeId = scope)
      (stateValid : compensationTriggerHandlerStateValid program before = true)
      (child : RuntimeScopeOccurrence) (parent : ScopeOccurrenceId)
      (childSelected : before.scopeOccurrences.filter (fun occurrence => occurrence.id == owner) = [child])
      (parentSelected : child.parent = some parent)
      (unclaimed : (before.compensationTriggers.any fun trigger =>
        trigger.owner == owner && trigger.lifecycle == .active) = false) :
      TransactionCancellationReady program operation before declaration operationId scope input output owner

/-- Cancellation's two semantic outcomes, independent of its executable dispatcher. -/
inductive TransactionCancellationStep (program : Program) (operation : SemanticOperation)
    (before : RuntimeState) : Bool → RuntimeState → Prop where
  | empty (declaration : CompensationExecutionDeclaration) (operationId : OperationId)
      (scope : DefinitionScopeId) (input output : ControlPlaceId) (owner : ScopeOccurrenceId)
      (after : RuntimeState)
      (ready : TransactionCancellationReady program operation before declaration operationId
        scope input output owner)
      (sources : selectedCompensationSubjects? program owner before = some [])
      (joined : TransactionCancellationJoin (cancelScopeSubtree before owner .retain)
        owner output after)
      (accepted : compensationTriggerHandlerStateValid program after = true) :
      TransactionCancellationStep program operation before false after
  | compensating (declaration : CompensationExecutionDeclaration) (operationId : OperationId)
      (scope : DefinitionScopeId) (input output : ControlPlaceId) (owner : ScopeOccurrenceId)
      (first : SelectedCompensationSubject) (rest : List SelectedCompensationSubject)
      (pending : CompensationTriggerExecution) (activated : CompensationFrontierActivation)
      (triggers : List CompensationTriggerExecution) (waits : List CompensationHandlerEffectWait)
      (after : RuntimeState)
      (ready : TransactionCancellationReady program operation before declaration operationId
        scope input output owner)
      (sources : selectedCompensationSubjects? program owner before = some (first :: rest))
      (pendingShape : pending =
        { id := nextOccurrence owner.processInstanceId operationId.value
            (before.compensationTriggers.map (·.id))
          owner, output, lifecycle := .active
          handlers := selectedHandlers before owner (first :: rest)
          dependencies := occurrenceDependencies program declaration
            (selectedHandlers before owner (first :: rest)) })
      (frontier : CompensationFrontierStep program before pending activated)
      (triggersShape : triggers = insertTrigger activated.trigger before.compensationTriggers)
      (waitsShape : waits = activated.waits.foldl (fun current wait =>
        insertCompensationHandlerEffectWait wait current) before.compensationHandlerEffectWaits)
      (capacity : compensationExecutionCapacityRefusal? declaration triggers waits = none)
      (afterShape : after =
        { cancelScopeSubtree before owner .retain with
          compensationActivityRetentions := clearClaimedActivityRecords owner before.compensationActivityRetentions
          compensationTriggers := triggers
          compensationHandlerEffectWaits := waits
          effectActivations := activated.effectActivations })
      (accepted : compensationTriggerHandlerStateValid program after = true) :
      TransactionCancellationStep program operation before true after

/-- Constructor selection connects the executable Cancel dispatcher to its independent cases. -/
theorem attemptTransactionCancellation_sound (program : Program) (operation : SemanticOperation)
    (before after : RuntimeState)
    (applied : attemptTransactionCancellation program operation before = .applied after) :
    ∃ compensating, TransactionCancellationStep program operation before compensating after := by
  cases operation <;> cases declarationEq : program.compensationExecution <;>
    simp only [attemptTransactionCancellation, declarationEq] at applied
  all_goals try { cases applied }
  rename_i operationId origin scope input output boundary declaration
  cases running : before.control <;> cases ownerEq : onlyTokenOwner? before input <;>
    simp only [running, ownerEq] at applied
  all_goals try { cases applied }
  rename_i instanceId owner
  split at applied
  · cases applied
  · rename_i programAccepted
    split at applied
    · cases applied
    · rename_i accepted
      have programReady : compensationTriggerProgramRejected program declaration operationId = false :=
        Bool.eq_false_iff.mpr programAccepted
      have parts := Bool.eq_false_iff.mpr accepted
      simp only [Bool.or_eq_false_iff, bne_eq_false_iff_eq, Bool.not_eq_false'] at parts
      have ownerInstance : owner.processInstanceId = instanceId := parts.1.1
      have scopeMatches : owner.definitionScopeId = scope := parts.1.2
      have stateValid : compensationTriggerHandlerStateValid program before = true := parts.2
      split at applied
      · rename_i childId parent childSelected
        split at applied
        · cases applied
        · rename_i unclaimed
          let ready : TransactionCancellationReady program
              (.cancelTransaction operationId origin scope input output boundary) before
              declaration operationId scope input output owner :=
            .ready origin boundary declarationEq rfl programReady
              (by simpa only [ownerInstance] using running) ownerEq scopeMatches stateValid
              { id := childId, parent := some parent } parent childSelected rfl
              (Bool.eq_false_iff.mpr unclaimed)
          cases sourcesEq : selectedCompensationSubjects? program owner before with
          | none => simp [sourcesEq] at applied
          | some subjects =>
            cases subjects with
            | nil =>
                simp only [sourcesEq] at applied
                cases joinEq : finishTransactionCancellation?
                    (cancelScopeSubtree before owner .retain) owner output with
                | none => simp [joinEq] at applied
                | some successor =>
                    simp only [joinEq] at applied
                    change (if compensationTriggerHandlerStateValid program successor then
                      CompensationTriggerAttempt.applied successor else .refused .invalidState) = .applied after at applied
                    split at applied
                    · rename_i valid
                      have same : successor = after := CompensationTriggerAttempt.applied.inj applied
                      rw [← same]
                      exact ⟨false, .empty declaration operationId scope input output owner successor ready
                        sourcesEq (finishTransactionCancellation_sound _ _ _ _ joinEq) valid⟩
                    · cases applied
            | cons first rest =>
                simp only [sourcesEq] at applied
                cases frontierEq : constructCompensationTriggerFrontier program before
                    (.cancelTransaction operationId origin scope input output boundary) owner (first :: rest) with
                | none => simp [frontierEq] at applied
                | some activated =>
                    simp only [frontierEq] at applied
                    let triggers := insertTrigger activated.trigger before.compensationTriggers
                    let waits := activated.waits.foldl (fun current wait =>
                      insertCompensationHandlerEffectWait wait current) before.compensationHandlerEffectWaits
                    cases capacityEq : compensationExecutionCapacityRefusal? declaration triggers waits with
                    | some reason => simp [triggers, waits, capacityEq] at applied
                    | none =>
                        rw [capacityEq] at applied
                        let successor : RuntimeState :=
                          { cancelScopeSubtree before owner .retain with
                            compensationActivityRetentions := clearClaimedActivityRecords owner before.compensationActivityRetentions
                            compensationTriggers := triggers
                            compensationHandlerEffectWaits := waits
                            effectActivations := activated.effectActivations }
                        change (if compensationTriggerHandlerStateValid program successor then
                          CompensationTriggerAttempt.applied successor else .refused .invalidState) = .applied after at applied
                        split at applied
                        · rename_i valid
                          have same : successor = after := CompensationTriggerAttempt.applied.inj applied
                          rw [← same]
                          have operationMatches : declaration.triggerOperationId = operationId := by
                            have parts := programReady
                            simp only [compensationTriggerProgramRejected, Bool.or_eq_false_iff,
                              bne_eq_false_iff_eq] at parts
                            exact parts.1
                          let pending : CompensationTriggerExecution :=
                            { id := nextOccurrence owner.processInstanceId operationId.value
                                (before.compensationTriggers.map (·.id))
                              owner, output, lifecycle := .active
                              handlers := selectedHandlers before owner (first :: rest)
                              dependencies := occurrenceDependencies program declaration
                                (selectedHandlers before owner (first :: rest)) }
                          have selectedFrontier : activateCompensationFrontier program before pending = some activated := by
                            simp only [constructCompensationTriggerFrontier, declarationEq, operationMatches,
                              bne_self_eq_false, Bool.false_eq_true, if_false] at frontierEq
                            split at frontierEq
                            · contradiction
                            · exact frontierEq
                          exact ⟨true, .compensating declaration operationId scope input output owner first rest
                            pending activated triggers waits successor ready sourcesEq rfl
                            (activateCompensationFrontier_sound program before pending activated selectedFrontier)
                            rfl rfl capacityEq rfl valid⟩
                        · cases applied
      · cases applied

/-- TXC-CANCEL-01 emits no token while compensation is active, at either continuation. -/
theorem transaction_cancellation_active_emits_no_token
    (program : Program) (operation : SemanticOperation) (before after : RuntimeState)
    (step : TransactionCancellationStep program operation before true after) :
    ∀ token ∈ after.tokens, token ∈ before.tokens := by
  cases step with
  | compensating declaration operationId scope input output owner first rest pending activated
      triggers waits after ready sources pendingShape frontier triggersShape waitsShape capacity afterShape accepted =>
      subst after
      intro token member
      exact (List.mem_filter.mp member).1

/-- TXC-JOIN-01 keeps an absent Cancel or normal parent continuation absent while compensation is active. -/
theorem transaction_cancellation_active_preserves_continuation_absence
    (program : Program) (operation : SemanticOperation) (before after : RuntimeState)
    (parent : ScopeOccurrenceId) (output : ControlPlaceId)
    (step : TransactionCancellationStep program operation before true after)
    (absent : { placeId := output, owner := parent } ∉ before.tokens) :
    { placeId := output, owner := parent } ∉ after.tokens := by
  intro present
  exact absent (transaction_cancellation_active_emits_no_token program operation before after
    step _ present)

/-- TXC-FRAME-01 retains exactly ordinary work whose complete owner is outside the cancelled region. -/
theorem transaction_cancellation_active_region_frame
    (program : Program) (operation : SemanticOperation) (before after : RuntimeState)
    (step : TransactionCancellationStep program operation before true after) :
    ∃ owner,
      (∀ token, token ∈ after.tokens ↔ token ∈ before.tokens ∧
        (occurrenceInSubtree before.scopeOccurrences owner token.owner ||
          (calledInstanceClosure before owner).contains token.owner.processInstanceId) = false) ∧
      (∀ wait, wait ∈ after.waits ↔ wait ∈ before.waits ∧
        (occurrenceInSubtree before.scopeOccurrences owner wait.owner ||
          (calledInstanceClosure before owner).contains wait.owner.processInstanceId) = false) ∧
      after.activations = before.activations ∧ after.scopeActivations = before.scopeActivations ∧
      after.variables.process = before.variables.process := by
  cases step with
  | compensating declaration operationId scope input output owner first rest pending activated
      triggers waits after ready sources pendingShape frontier triggersShape waitsShape capacity afterShape accepted =>
      subst after
      refine ⟨owner, ?_, ?_, rfl, rfl, rfl⟩
      · intro token
        simp only [cancelScopeSubtree, List.mem_filter, Bool.not_eq_true']
      · intro wait
        simp only [cancelScopeSubtree, List.mem_filter, Bool.not_eq_true']

/-- TXC-EMPTY-01 delegates its sole parent route to the independently specified cancellation join. -/
theorem transaction_cancellation_empty_joins_parent
    (program : Program) (operation : SemanticOperation) (before after : RuntimeState)
    (step : TransactionCancellationStep program operation before false after) :
    ∃ owner output, selectedCompensationSubjects? program owner before = some [] ∧
      TransactionCancellationJoin (cancelScopeSubtree before owner .retain) owner output after := by
  cases step with
  | empty declaration operationId scope input output owner after ready sources joined accepted =>
      exact ⟨owner, output, sources, joined⟩

/-- Eligibility reads completed records, never the ordinary waits being interrupted. -/
theorem transaction_selected_subjects_ignore_live_waits (program : Program)
    (state : RuntimeState) (owner : ScopeOccurrenceId) (waits : List UserTaskWait) :
    selectedCompensationSubjects? program owner { state with waits } =
      selectedCompensationSubjects? program owner state := rfl

/-- A disjoint owner's records cannot enter or remove the selected owner's compensation sources. -/
theorem transaction_selected_subjects_exact_owner_frame (program : Program)
    (before after : RuntimeState) (owner : ScopeOccurrenceId)
    (records : after.compensationActivityRetentions.filter (fun record => record.owner == owner) =
      before.compensationActivityRetentions.filter (fun record => record.owner == owner))
    (contexts : after.compensationParentContextRetentions.filter (fun record =>
        triggerRetentionOwnedByRoot record owner) =
      before.compensationParentContextRetentions.filter (fun record =>
        triggerRetentionOwnedByRoot record owner)) :
    selectedCompensationSubjects? program owner after =
      selectedCompensationSubjects? program owner before := by
  simp only [selectedCompensationSubjects?, records, contexts]

private theorem cleared_records_empty (owner : ScopeOccurrenceId)
    (records : List CompensationActivityRetention) :
    ∀ record ∈ clearClaimedActivityRecords owner records,
      record.owner = owner → record.records = [] := by
  induction records with
  | nil => simp [clearClaimedActivityRecords]
  | cons head rest ih =>
      intro record member selected
      simp only [clearClaimedActivityRecords, List.mem_cons] at member
      rcases member with same | tail
      · by_cases owns : head.owner = owner
        · simp only [owns, if_true] at same
          subst record
          rfl
        · simp only [owns, if_false] at same
          subst record
          exact False.elim (owns selected)
      · exact ih record tail selected

/-- TXC-CANCEL-01 consumes all selected completed records in the active compensation successor. -/
theorem transaction_cancellation_consumes_selected_records
    (program : Program) (operation : SemanticOperation) (before after : RuntimeState)
    (step : TransactionCancellationStep program operation before true after) :
    ∃ owner, ∀ record ∈ after.compensationActivityRetentions,
      record.owner = owner → record.records = [] := by
  cases step with
  | compensating declaration operationId scope input output owner first rest pending activated
      triggers waits after ready sources pendingShape frontier triggersShape waitsShape capacity afterShape accepted =>
      subst after
      exact ⟨owner, cleared_records_empty owner before.compensationActivityRetentions⟩

/-- TXC-FAIL-01 removes every live runtime collection, including parent work outside the child. -/
theorem transaction_handler_failure_clears_all_live_work
    (before after : RuntimeState) (wait : CompensationHandlerEffectWait)
    (trigger : CompensationTriggerExecution) (handler : CompensationHandlerExecution)
    (code : String) (message : Option String)
    (failed : CompensationHandlerFailureCancellationStep before wait trigger handler code message after) :
    after.scopeOccurrences = [] ∧ after.tokens = [] ∧ after.waits = [] ∧
      after.messageWaits = [] ∧ after.timerWaits = [] ∧ after.effectWaits = [] ∧
      after.effectIncidents = [] ∧ after.selectedBranchSets = [] ∧ after.eventRaces = [] ∧
      after.calledProcessOccurrences = [] ∧ after.activityOccurrences = [] ∧
      after.sequentialMultiInstanceControllers = [] ∧ after.parallelMultiInstanceControllers = [] ∧
      after.compensationActivityRetentions = [] ∧ after.compensationParentContextRetentions = [] ∧
      after.compensationHandlerEffectWaits = [] ∧ after.variables.activities = [] := by
  cases failed with
  | cancel handlers failedTrigger failure after terminalized triggerShape failureShape afterShape =>
      subst after
      simp

/-- TXC-JOIN-01 preserves every ordinary collection except the explicit parent token insertion. -/
theorem transaction_join_frames_ordinary_work (before after : RuntimeState)
    (owner : ScopeOccurrenceId) (output : ControlPlaceId)
    (joined : TransactionCancellationJoin before owner output after) :
    after.control = before.control ∧ after.waits = before.waits ∧
      after.messageWaits = before.messageWaits ∧ after.timerWaits = before.timerWaits ∧
      after.effectWaits = before.effectWaits ∧ after.effectIncidents = before.effectIncidents ∧
      after.selectedBranchSets = before.selectedBranchSets ∧ after.eventRaces = before.eventRaces ∧
      after.calledProcessOccurrences = before.calledProcessOccurrences ∧
      after.activityOccurrences = before.activityOccurrences ∧
      after.sequentialMultiInstanceControllers = before.sequentialMultiInstanceControllers ∧
      after.parallelMultiInstanceControllers = before.parallelMultiInstanceControllers ∧
      after.variables = before.variables ∧ after.activations = before.activations ∧
      after.scopeActivations = before.scopeActivations ∧ after.effectActivations = before.effectActivations := by
  cases joined
  simp

end BpmnSemantics.SemanticProcess
