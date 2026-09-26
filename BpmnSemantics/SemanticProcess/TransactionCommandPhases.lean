import BpmnSemantics.SemanticProcess.TransactionBranchPhases

/-! # Transaction command admission and continuation

The complete admitted operation inventory excludes the alternative Task dispatchers. This connects
ordinary command admission to the retention-aware completion law used by the continuation proof.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

private theorem transaction_parallel_task_absent (p : Program)
    (graph : transactionCancellationProgramGraph p = true) (taskId : TaskDefinitionId) :
    parallelMultiInstanceEntryForTask? p taskId = none := by
  unfold parallelMultiInstanceEntryForTask?
  split
  · rename_i entry selected
    have filteredMember := selected.symm ▸ List.mem_singleton_self entry
    obtain ⟨member, eligible⟩ := List.mem_filter.mp filteredMember
    have family := transactionCancellationProgramGraph_operation_families p graph entry member
    cases entry <;> simp_all [ParallelMultiInstanceArm.ofOperation?]
  · rfl

private theorem transaction_sequential_task_absent (p : Program)
    (graph : transactionCancellationProgramGraph p = true) (taskId : TaskDefinitionId) :
    sequentialMultiInstanceOperationForTask? p taskId = none := by
  unfold sequentialMultiInstanceOperationForTask?
  split
  · rename_i entry selected
    have filteredMember := selected.symm ▸ List.mem_singleton_self entry
    obtain ⟨member, eligible⟩ := List.mem_filter.mp filteredMember
    have family := transactionCancellationProgramGraph_operation_families p graph entry member
    cases entry <;> simp_all
  · rfl

private theorem transaction_alternative_task_inventories_empty (p : Program)
    (graph : transactionCancellationProgramGraph p = true) :
    messageMonitoredTaskDefinitions p = [] ∧ messageBoundedTaskOperations p = [] ∧
      boundedTaskOperations p = [] ∧ dataInputOutputTaskContracts p = [] ∧
      dataInputTaskOperations p = [] ∧ dataOutputTaskOperations p = [] ∧
      monitoredTaskOperations p = [] := by
  simp only [messageMonitoredTaskDefinitions, messageBoundedTaskOperations, boundedTaskOperations,
    dataInputOutputTaskContracts, dataInputTaskOperations, dataOutputTaskOperations,
    monitoredTaskOperations]
  repeat' apply And.intro
  all_goals
    apply List.filterMap_eq_nil_iff.mpr
    intro operation member
    have family := transactionCancellationProgramGraph_operation_families p graph operation member
    cases operation <;> simp_all

private theorem transaction_timer_dispatch_absent (p : Program)
    (graph : transactionCancellationProgramGraph p = true) (elementId : NodeId) :
    parallelMultiInstanceEntryForTimer? p elementId = none ∧
      sequentialMultiInstanceOperationForTimer? p elementId = none := by
  constructor
  · unfold parallelMultiInstanceEntryForTimer?
    split
    · rename_i entry selected
      have filteredMember := selected.symm ▸ List.mem_singleton_self entry
      obtain ⟨member, eligible⟩ := List.mem_filter.mp filteredMember
      have family := transactionCancellationProgramGraph_operation_families p graph entry member
      cases entry <;> simp_all [ParallelMultiInstanceArm.ofOperation?]
    · rfl
  · unfold sequentialMultiInstanceOperationForTimer?
    split
    · rename_i entry selected
      have filteredMember := selected.symm ▸ List.mem_singleton_self entry
      obtain ⟨member, eligible⟩ := List.mem_filter.mp filteredMember
      have family := transactionCancellationProgramGraph_operation_families p graph entry member
      cases entry <;> simp_all
    · rfl

/-- Every admitted ordinary Task uses the same completion path, regardless of its source identity. -/
theorem transaction_task_dispatch_selectors (p : Program)
    (graph : transactionCancellationProgramGraph p = true) (taskId : TaskDefinitionId) :
    parallelMultiInstanceEntryForTask? p taskId = none ∧
      sequentialMultiInstanceOperationForTask? p taskId = none ∧
      isMessageMonitoredTaskDefinition p taskId = false ∧
      isMessageBoundedTaskDefinition p taskId = false ∧
      isBoundedTaskDefinition p taskId = false ∧
      isDataInputOutputTaskDefinition p taskId = false ∧
      dataInputTaskOperations p = [] ∧ dataOutputTaskOperations p = [] ∧
      isMonitoredTaskDefinition p taskId = false := by
  obtain ⟨messageMonitored, messageBounded, bounded, composed, dataInput, dataOutput, monitored⟩ :=
    transaction_alternative_task_inventories_empty p graph
  exact ⟨transaction_parallel_task_absent p graph taskId,
    transaction_sequential_task_absent p graph taskId,
    by simp [isMessageMonitoredTaskDefinition, messageMonitored],
    by simp [isMessageBoundedTaskDefinition, messageBounded],
    by simp [isBoundedTaskDefinition, bounded],
    by simp [isDataInputOutputTaskDefinition, composed], dataInput, dataOutput,
    by simp [isMonitoredTaskDefinition, monitored]⟩

theorem transaction_admitted_task_continuation (p : Program) (roles : TransactionAdmittedRoles p)
    (graph : transactionCancellationProgramGraph p = true)
    (before : RuntimeState) (phase : TransactionContinuationState roles before)
    (instanceId commandId : SemanticId) (taskId : UserTaskInstanceId)
    (submitted : List VariableBinding) (running : before.control = .running instanceId)
    (noIncidents : before.effectIncidents = []) (emptyTokens : before.tokens = []) :
    TransactionContinuationState roles
      (admitStimulusWithCompensationSnapshots p before
        (.completeUserTaskInstance commandId taskId submitted)).state := by
  obtain ⟨parallel, sequential, messageMonitored, messageBounded, bounded, composed,
      dataInput, dataOutput, monitored⟩ := transaction_task_dispatch_selectors p graph
    ⟨taskId.elementId.value⟩
  simp only [admitStimulusWithCompensationSnapshots, roles.snapshotsAbsent]
  simp [running, noIncidents, parallel, sequential, messageMonitored, messageBounded,
    bounded, composed, dataInput, dataOutput, monitored]
  cases completed : completeOrdinaryUserTaskWithCompensation? completeUserTask p before taskId with
  | none => dsimp only; exact phase
  | some successor =>
    dsimp only
    have continued := transaction_continuation_task_completion p roles before successor phase
      taskId emptyTokens completed
    split
    · exact ⟨continued.consumed, continued.tokenBound, continued.tokenPlaces, continued.waitOutputs⟩
    · split <;> first | exact continued | exact phase

theorem transaction_admitted_handler_continuation (p : Program) (roles : TransactionAdmittedRoles p)
    (before : RuntimeState) (phase : TransactionContinuationState roles before)
    (instanceId commandId : SemanticId) (effectId : EffectOccurrenceId) (result : EffectExecutionResult)
    (running : before.control = .running instanceId) (noIncidents : before.effectIncidents = [])
    (noEffects : before.effectWaits = []) (emptyTokens : before.tokens = []) :
    TransactionContinuationState roles
      (admitStimulusWithCompensationSnapshots p before (.completeEffect commandId effectId result)).state := by
  simp only [admitStimulusWithCompensationSnapshots, roles.snapshotsAbsent]
  simp [running, noIncidents, noEffects]
  split
  · cases completed : attemptCompensationHandlerEffectCompletion p before effectId result with
    | refused reason => dsimp only; exact phase
    | applied successor =>
        dsimp only
        have continued := transaction_continuation_handler_completion p roles before successor phase
          effectId result emptyTokens
          (attemptCompensationHandlerEffectCompletion_sound p before successor effectId result completed)
        split <;> first | exact continued | exact phase
  · contradiction
  · exact phase

/-- Transport failure reports and incident retries cannot introduce an ordinary effect into this profile. -/
theorem transaction_absent_incident_commands_preserve_state
    (p : Program) (roles : TransactionAdmittedRoles p) (before : RuntimeState)
    (commandId : SemanticId) (effectId : EffectOccurrenceId) (generation : Nat) (incidentId : EffectIncidentId)
    (noIncidents : before.effectIncidents = []) (noEffects : before.effectWaits = []) :
    (admitStimulusWithCompensationSnapshots p before
      (.reportEffectFailure commandId effectId generation)).state = before ∧
    (admitStimulusWithCompensationSnapshots p before
      (.retryIncident commandId incidentId)).state = before := by
  cases control : before.control <;>
    simp [admitStimulusWithCompensationSnapshots, roles.snapshotsAbsent, control,
      noIncidents, noEffects, reportEffectFailure, retryEffectIncident]

/-- The selected grammar has no external Message, Timer or incident work to consume. -/
theorem transaction_other_admissions_preserve_state
    (p : Program) (roles : TransactionAdmittedRoles p)
    (graph : transactionCancellationProgramGraph p = true)
    (selectedProfile : p.identity.semanticProfile = transactionCancellationCheckpointProfileId)
    (before : RuntimeState) (stimulus : Stimulus)
    (noMessages : before.messageWaits = []) (noTimers : before.timerWaits = [])
    (noEffects : before.effectWaits = []) (noIncidents : before.effectIncidents = [])
    (other : match stimulus with
      | .startProcess .. | .completeUserTaskInstance .. | .completeEffect .. => False
      | _ => True) :
    (admitStimulusWithCompensationSnapshots p before stimulus).state = before := by
  obtain ⟨messageMonitored, messageBounded, _, _, _, _, _⟩ :=
    transaction_alternative_task_inventories_empty p graph
  have timers := transaction_timer_dispatch_absent p graph
  cases stimulus <;> try contradiction
  case deliverCorrelatedPayloadMessage delivery =>
    rw [admitStimulusWithCompensationSnapshots_unselected_correlation p before delivery
      roles.snapshotsAbsent (by simp [selectedProfile, transactionCancellationCheckpointProfileId,
        messageKeyCorrelationProfileId])]
  all_goals
    cases control : before.control
    all_goals simp [admitStimulusWithCompensationSnapshots, roles.snapshotsAbsent,
      control, noIncidents, noEffects, noMessages, noTimers, selectedProfile,
      admitMessageStart?, messageStartTargetMatchesProgram, messageStartProfileId,
      admitTimerStart?, timerStartTargetMatchesProgram, timerStartProfileId,
      transactionCancellationCheckpointProfileId,
      isMonitoredMessageBoundaryDefinition, messageMonitored,
      isMessageBoundaryDefinition, messageBounded, deliverMessage, deliverPayloadMessage,
      (timers _).1, (timers _).2, fireTimer, reportEffectFailure, retryEffectIncident,
      incidentProcessCancellationRoot?, incidentProcessCancellationEligibility?,
      serviceTaskIncidentCancellationCheckpointProfileId]

/-- Transaction's selected Process-data domain derives an empty Start patch from admission. -/
theorem transaction_start_data_is_empty (bindings : List VariableBinding)
    (admitted : processDataBindingsAdmitted transactionCancellationCheckpointProfileId
      .processStart bindings = true) : bindings = [] := by
  cases bindings with
  | nil => rfl
  | cons head rest =>
    have denied : variableValueAdmitted transactionCancellationCheckpointProfileId
        .processStart head.value = false := by cases head.value <;> rfl
    simp [processDataBindingsAdmitted, denied] at admitted

/-- Actual Start admission selects the empty Transaction data patch before building its root. -/
theorem transaction_committed_start_empty_normal_form (p : Program) (roles : TransactionAdmittedRoles p)
    (wellFormed : programWellFormed p = true) (commandId processId instanceId : SemanticId)
    (submitted : List VariableBinding)
    (committed : (admitStimulusWithCompensationSnapshots p initialState
      (.startProcess commandId processId instanceId submitted)).outcome = .committed) :
    (admitStimulusWithCompensationSnapshots p initialState
      (.startProcess commandId processId instanceId submitted)).state =
        transactionRootStartState roles instanceId [] := by
  simp only [admitStimulusWithCompensationSnapshots, roles.snapshotsAbsent] at committed ⊢
  simp only [initialState] at committed ⊢
  simp [roles.profileSelected, transactionCancellationCheckpointProfileId,
    compensationSourceCheckpointProfileId, activityDataInputOutputUserTaskProfileId] at committed ⊢
  simp only [transaction_start_builder_normal_form p roles wellFormed] at committed ⊢
  split at committed
  · rename_i parallel
    change (p.identity.semanticProfile = parallelMultiInstanceUserTaskProfileId &&
      programWellFormed p && programProfileCapabilitiesValid p) = true at parallel
    simp [roles.profileSelected, transactionCancellationCheckpointProfileId,
      parallelMultiInstanceUserTaskProfileId] at parallel
  · rename_i noParallel
    simp only [if_neg noParallel]
    split at committed
    · rename_i sequential
      change (p.identity.semanticProfile = sequentialMultiInstanceUserTaskProfileId &&
        programWellFormed p && programProfileCapabilitiesValid p) = true at sequential
      simp [roles.profileSelected, transactionCancellationCheckpointProfileId,
        sequentialMultiInstanceUserTaskProfileId] at sequential
    · rename_i noSequential
      simp only [if_neg noSequential]
      split at committed
      · rename_i accepted
        simp only [if_pos accepted]
        exact congrArg (transactionRootStartState roles instanceId)
          (transaction_start_data_is_empty submitted accepted.1.2)
      · contradiction

end BpmnSemantics.SemanticProcess
