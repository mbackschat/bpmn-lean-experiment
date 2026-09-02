import BpmnSemantics.SemanticProcess.Incident
import BpmnSemantics.SemanticProcess.IncidentCancellation
import BpmnSemantics.SemanticProcess.MessageStartAdmission
import BpmnSemantics.SemanticProcess.ProfileAdmission
import BpmnSemantics.SemanticProcess.SequentialMultiInstanceTransition
import BpmnSemantics.SemanticProcess.ParallelMultiInstanceTransition
import BpmnSemantics.SemanticProcess.ValueDomain
import BpmnSemantics.SemanticProcess.WaitCompletion
import BpmnSemantics.SemanticProcess.ActivityDataInput
import BpmnSemantics.SemanticProcess.ActivityDataOutput
import BpmnSemantics.SemanticProcess.MessagePayload
import BpmnSemantics.SemanticProcess.MessageBoundedTask
import BpmnSemantics.SemanticProcess.MessageKeyCorrelation
import BpmnSemantics.SemanticProcess.CompensationActivityRetentionProducers
import BpmnSemantics.SemanticProcess.CompensationEventSubProcessSnapshot

/-! # Semantic Process external command admission

This module owns the complete external stimulus dispatch and the fail-closed runtime-state gate applied before dispatch. It separates command admission from bounded internal closure and rejects incident-bearing states unless they belong to the exact approved profile, program shape, and private association invariant.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

structure ExternalAdmission where
  outcome : CommandOutcome
  state : RuntimeState

/-! Closed raw dispatchers remain private because they do not enforce snapshot declaration admission. -/

private def dispatchCorrelatedPayloadMessage (program : Program) (state : RuntimeState)
    (delivery : DeliverCorrelatedPayloadMessageStimulus) : ExternalAdmission :=
  match state.control with
  | .running instanceId =>
      match deliverCorrelatedPayloadMessage program state delivery with
      | some successor =>
          if delivery.subscriptionId.processInstanceId = instanceId then
            { outcome := .committed, state := successor }
          else { outcome := .rejected, state }
      | none => { outcome := .rejected, state }
  | .notStarted | .completed _ | .cancelled _ | .failed .. =>
      { outcome := .rejected, state }

private def admitCorrelatedPayloadMessage (program : Program) (state : RuntimeState)
    (delivery : DeliverCorrelatedPayloadMessageStimulus) : ExternalAdmission :=
  if program.identity.semanticProfile = messageKeyCorrelationProfileId &&
      programWellFormed program && programProfileCapabilitiesValid program &&
      state.effectIncidents.isEmpty then
    dispatchCorrelatedPayloadMessage program state delivery
  else
    { outcome := .rejected, state }

def isCallActivityProgram (program : Program) : Bool :=
  program.identity.semanticProfile.value =
    "bpmn-2.0.2-called-process-call-activity-draft"

/-- Whether one exact selected profile admits the literal-generation incident family. -/
def serviceTaskIncidentProfileAdmitted (profile : ProfileId) : Bool :=
  profile = serviceTaskIncidentCheckpointProfileId ||
    profile = serviceTaskIncidentCancellationCheckpointProfileId

/-- An incident-free state remains admissible to every existing profile. A nonempty incident state is admitted only by one selected incident profile and its exact program shape with valid private associations. -/
def incidentStateAdmitted (program : Program) (state : RuntimeState) : Bool :=
  state.effectIncidents.isEmpty ||
    (serviceTaskIncidentProfileAdmitted program.identity.semanticProfile &&
      programWellFormed program &&
      programProfileCapabilitiesValid program &&
      effectIncidentAssociationsValid state)

private def sequentialMultiInstanceProgramAdmitted (program : Program) : Bool :=
  program.identity.semanticProfile = sequentialMultiInstanceUserTaskProfileId &&
    programWellFormed program && programProfileCapabilitiesValid program

private def parallelMultiInstanceProgramAdmitted (program : Program) : Bool :=
  program.identity.semanticProfile = parallelMultiInstanceUserTaskProfileId &&
    programWellFormed program && programProfileCapabilitiesValid program

private def parallelMultiInstanceStartBindingsAdmitted (program : Program)
    (bindings : List VariableBinding) : Bool :=
  match program.operations.filterMap ParallelMultiInstanceArm.ofOperation?, bindings with
  | [arm], [input, policy] =>
      input.name == arm.data.input.dataObjectReferenceId &&
        (match input.value with
        | .stringList items => withinParallelMultiInstanceLimits arm items
        | _ => false) &&
        policy.name == "completionPolicy" &&
        match policy.value with
        | .string value => value = "all" || value = "first"
        | _ => false
  | _, _ => false

/-- The exact task-local Process-start patch for the sequential Multi-Instance profile.

The reusable profile table decides value kinds, but it cannot decide the binding identity and
cardinality carried by one operation. This check therefore selects the sole reviewed arm and admits
exactly its input DataObjectReference, one String-list value, and the arm's complete bounds before
the start state is created. -/
private def sequentialMultiInstanceStartBindingsAdmitted (program : Program)
    (bindings : List VariableBinding) : Bool :=
  match program.operations.filterMap SequentialMultiInstanceArm.ofOperation?, bindings with
  | [arm], [binding] =>
      binding.name == arm.data.inputDataObjectReferenceId &&
        match binding.value with
        | .stringList items => withinSequentialMultiInstanceLimits arm items
        | _ => false
  | _, _ => false

@[simp] private def dispatchStimulusWithoutCompensationSnapshots (program : Program)
    (state : RuntimeState) :
    Stimulus → ExternalAdmission
  | .startProcess _ processId instanceId initialVariables =>
      match state.control with
      | .notStarted =>
          let bindingsAdmitted :=
            if parallelMultiInstanceProgramAdmitted program then
              parallelMultiInstanceStartBindingsAdmitted program initialVariables
            else if sequentialMultiInstanceProgramAdmitted program then
              sequentialMultiInstanceStartBindingsAdmitted program initialVariables
            else
              processDataBindingsAdmitted program.identity.semanticProfile
                .processStart initialVariables
          if ordinaryStartMatchesProgram program &&
              program.processId.value = processId.value &&
              bindingsAdmitted &&
              (!isCallActivityProgram program || initialVariables.isEmpty) then
            match runningProgramStartState? program instanceId initialVariables with
            | some started => { outcome := .committed, state := started }
            | none => { outcome := .semanticFailure, state }
          else
            { outcome := .rejected, state }
      | .running _
      | .completed _
      | .cancelled _
      | .failed .. => { outcome := .rejected, state }
  | .triggerMessageStart _ processId instanceId startEventId channel =>
      match admitMessageStart? program state processId instanceId startEventId
          channel with
      | some started => { outcome := .committed, state := started }
      | none => { outcome := .rejected, state }
  | .triggerTimerStart _ processId instanceId startEventId =>
      match admitTimerStart? program state processId instanceId startEventId with
      | some started => { outcome := .committed, state := started }
      | none => { outcome := .rejected, state }
  | .completeUserTaskInstance _ taskId submittedValues =>
      match state.control with
      | .running instanceId =>
          if let some operation := parallelMultiInstanceEntryForTask? program
              ({ value := taskId.elementId.value } : TaskDefinitionId) then
            match ParallelMultiInstanceArm.ofOperation? operation with
            | some arm =>
                match completeParallelMultiInstanceWithCompensation? program arm state taskId
                    submittedValues with
                | some successor =>
                    if parallelMultiInstanceProgramAdmitted program &&
                        taskId.processInstanceId = instanceId then
                      { outcome := .committed, state := successor }
                    else { outcome := .rejected, state }
                | none => { outcome := .rejected, state }
            | none => { outcome := .rejected, state }
          else if let some operation := sequentialMultiInstanceOperationForTask? program
              ({ value := taskId.elementId.value } : TaskDefinitionId) then
            match SequentialMultiInstanceArm.ofOperation? operation with
            | some arm =>
                match completeSequentialMultiInstanceWithCompensation? program arm state taskId
                    submittedValues with
                | some successor =>
                    if sequentialMultiInstanceProgramAdmitted program &&
                        taskId.processInstanceId = instanceId then
                      { outcome := .committed, state := successor }
                    else
                      { outcome := .rejected, state }
                | none => { outcome := .rejected, state }
            | none => { outcome := .rejected, state }
          else if isMessageBoundedTaskDefinition program ⟨taskId.elementId.value⟩ then
            match completeMessageBoundedUserTask? program state taskId.processInstanceId
                ⟨taskId.elementId.value⟩ taskId.activation submittedValues with
            | some successor =>
                if taskId.processInstanceId = instanceId then
                  { outcome := .committed, state := successor }
                else
                  { outcome := .rejected, state }
            | none => { outcome := .rejected, state }
          else if isBoundedTaskDefinition program ⟨taskId.elementId.value⟩ then
            match completeBoundedUserTask? program state taskId.processInstanceId
                ⟨taskId.elementId.value⟩ taskId.activation with
            | some successor =>
                if taskId.processInstanceId = instanceId && submittedValues.isEmpty then
                  { outcome := .committed, state := successor }
                else
                  { outcome := .rejected, state }
            | none => { outcome := .rejected, state }
          else if isDataInputTaskDefinition program ⟨taskId.elementId.value⟩ then
            match completeDataInputUserTask? program state
                taskId.processInstanceId ⟨taskId.elementId.value⟩
                taskId.activation with
            | some successor =>
                if taskId.processInstanceId = instanceId && submittedValues.isEmpty then
                  { outcome := .committed, state := successor }
                else
                  { outcome := .rejected, state }
            | none => { outcome := .rejected, state }
          else if isDataOutputTaskDefinition program ⟨taskId.elementId.value⟩ then
            match completeDataOutputUserTask? program state
                taskId.processInstanceId ⟨taskId.elementId.value⟩
                taskId.activation submittedValues with
            | some successor =>
                if taskId.processInstanceId = instanceId &&
                    processDataBindingsAdmitted program.identity.semanticProfile
                      .userTaskCompletion submittedValues then
                  { outcome := .committed, state := successor }
                else
                  { outcome := .rejected, state }
            | none => { outcome := .rejected, state }
          else if isMonitoredTaskDefinition program ⟨taskId.elementId.value⟩ then
            match completeMonitoredUserTask? program state
                taskId.processInstanceId ⟨taskId.elementId.value⟩
                taskId.activation with
            | some successor =>
                if taskId.processInstanceId = instanceId && submittedValues.isEmpty then
                  { outcome := .committed, state := successor }
                else
                  { outcome := .rejected, state }
            | none => { outcome := .rejected, state }
          else
          match completeOrdinaryUserTaskWithCompensation? completeUserTask program state taskId with
          | some successor =>
              if taskId.processInstanceId = instanceId &&
                  !isCallActivityProgram program &&
                  processDataBindingsAdmitted program.identity.semanticProfile
                    .userTaskCompletion submittedValues then
                { outcome := .committed
                  state :=
                    { successor with
                      variables :=
                        { successor.variables with
                          process :=
                            { bindings := mergeProcessVariableBindings
                                successor.variables.process.bindings
                                submittedValues } } } }
              else if isCallActivityProgram program && submittedValues.isEmpty then
                { outcome := .committed, state := successor }
              else
                { outcome := .rejected, state }
          | none => { outcome := .rejected, state }
      | .notStarted
      | .completed _
      | .cancelled _
      | .failed .. => { outcome := .rejected, state }
  | .deliverMessage _ subscriptionId channel =>
      match state.control with
      | .running instanceId =>
          let delivery :=
            if isMessageBoundaryDefinition program ⟨subscriptionId.elementId.value⟩ then
              interruptMessageBoundedUserTask? program state subscriptionId channel
            else
              deliverMessage program state subscriptionId channel
          match delivery with
          | some successor =>
              if subscriptionId.processInstanceId = instanceId then
                { outcome := .committed, state := successor }
              else
                { outcome := .rejected, state }
          | none => { outcome := .rejected, state }
      | .notStarted
      | .completed _
      | .cancelled _
      | .failed .. => { outcome := .rejected, state }
  | .deliverPayloadMessage _ subscriptionId channel payload =>
      match state.control with
      | .running instanceId =>
          match deliverPayloadMessage program state subscriptionId channel payload with
          | some successor =>
              if subscriptionId.processInstanceId = instanceId then
                { outcome := .committed, state := successor }
              else
                { outcome := .rejected, state }
          | none => { outcome := .rejected, state }
      | .notStarted
      | .completed _
      | .cancelled _
      | .failed .. => { outcome := .rejected, state }
  | .deliverCorrelatedPayloadMessage delivery =>
      dispatchCorrelatedPayloadMessage program state delivery
  | .fireTimer _ timerId logicalTimeMs =>
      match state.control with
      | .running instanceId =>
          if let some operation := parallelMultiInstanceEntryForTimer? program
              ({ value := timerId.elementId.value } : NodeId) then
            match ParallelMultiInstanceArm.ofOperation? operation with
            | some arm =>
                match interruptParallelMultiInstanceWithCompensation? program arm state timerId
                    logicalTimeMs with
                | some successor =>
                    if parallelMultiInstanceProgramAdmitted program &&
                        timerId.processInstanceId = instanceId then
                      { outcome := .committed, state := successor }
                    else { outcome := .rejected, state }
                | none => { outcome := .rejected, state }
            | none => { outcome := .rejected, state }
          else if let some operation := sequentialMultiInstanceOperationForTimer? program
              ({ value := timerId.elementId.value } : NodeId) then
            match SequentialMultiInstanceArm.ofOperation? operation with
            | some arm =>
                match interruptSequentialMultiInstanceWithCompensation? program arm state timerId
                    logicalTimeMs with
                | some successor =>
                    if sequentialMultiInstanceProgramAdmitted program &&
                        timerId.processInstanceId = instanceId then
                      { outcome := .committed, state := successor }
                    else
                      { outcome := .rejected, state }
                | none => { outcome := .rejected, state }
            | none => { outcome := .rejected, state }
          else
            match fireTimer program state timerId logicalTimeMs with
            | some successor =>
                if timerId.processInstanceId = instanceId then
                  { outcome := .committed, state := successor }
                else
                  { outcome := .rejected, state }
            | none => { outcome := .rejected, state }
      | .notStarted
      | .completed _
      | .cancelled _
      | .failed .. => { outcome := .rejected, state }
  | .completeEffect _ effectId result =>
      match state.control with
      | .running instanceId =>
          match completeEffect state effectId result with
          | some successor =>
              if effectId.processInstanceId = instanceId then
                { outcome := .committed, state := successor }
              else
                { outcome := .rejected, state }
          | none => { outcome := .rejected, state }
      | .notStarted
      | .completed _
      | .cancelled _
      | .failed .. => { outcome := .rejected, state }
  | .reportEffectFailure _ effectId generation =>
      match state.control with
      | .running instanceId =>
          match reportEffectFailure state effectId generation with
          | some successor =>
              if serviceTaskIncidentProfileAdmitted
                    program.identity.semanticProfile &&
                  programWellFormed program &&
                  programProfileCapabilitiesValid program &&
                  effectId.processInstanceId = instanceId then
                { outcome := .committed, state := successor }
              else
                { outcome := .rejected, state }
          | none => { outcome := .rejected, state }
      | .notStarted
      | .completed _
      | .cancelled _
      | .failed .. => { outcome := .rejected, state }
  | .retryIncident _ incidentId =>
      match state.control with
      | .running instanceId =>
          match retryEffectIncident state incidentId with
          | some successor =>
              if incidentId.effectId.processInstanceId = instanceId then
                { outcome := .committed, state := successor }
              else
                { outcome := .rejected, state }
          | none => { outcome := .rejected, state }
      | .notStarted
      | .completed _
      | .cancelled _
      | .failed .. => { outcome := .rejected, state }
  | .cancelIncidentProcess _ processInstanceId incidentId =>
      match cancelIncidentProcess program state processInstanceId incidentId with
      | some successor => { outcome := .committed, state := successor }
      | none => { outcome := .rejected, state }

/-- Direct dispatch is a legacy surface and therefore rejects every snapshot-declaring Program. -/
def dispatchStimulus (program : Program) (state : RuntimeState)
    (stimulus : Stimulus) : ExternalAdmission :=
  match program.compensationEventSubProcessSnapshots with
  | none => dispatchStimulusWithoutCompensationSnapshots program state stimulus
  | some _ => { outcome := .rejected, state }

theorem dispatchStimulus_withSnapshotDeclaration_rejects (program : Program)
    (state : RuntimeState) (stimulus : Stimulus)
    (declaration : CompensationEventSubProcessSnapshotDeclaration)
    (declared : program.compensationEventSubProcessSnapshots = some declaration) :
    (dispatchStimulus program state stimulus).outcome = .rejected ∧
      (dispatchStimulus program state stimulus).state = state := by
  simp [dispatchStimulus, declared]

@[simp] private def admitStimulusWithoutCompensationSnapshots (program : Program)
    (state : RuntimeState)
    (stimulus : Stimulus) : ExternalAdmission :=
  match stimulus with
  | .deliverCorrelatedPayloadMessage delivery =>
      admitCorrelatedPayloadMessage program state delivery
  | .cancelIncidentProcess _ processInstanceId incidentId =>
      if (incidentProcessCancellationRoot? program state processInstanceId incidentId).isSome then
        dispatchStimulusWithoutCompensationSnapshots program state stimulus
      else
        { outcome := .rejected, state }
  | .startProcess .. | .triggerMessageStart .. | .triggerTimerStart ..
  | .completeUserTaskInstance .. | .deliverMessage .. | .deliverPayloadMessage ..
  | .fireTimer ..
  | .completeEffect .. | .reportEffectFailure .. | .retryIncident .. =>
      match state.effectIncidents with
      | [] => dispatchStimulusWithoutCompensationSnapshots program state stimulus
      | _ :: _ =>
          if incidentStateAdmitted program state then
            dispatchStimulusWithoutCompensationSnapshots program state stimulus
          else
            { outcome := .rejected, state }

/-- Carry a pre-start root reservation into the independently constructed running state.

The reservation is decided against the submitted not-started state because start mutation must not precede capacity refusal. The running-state builder remains the authority for every other field. -/
def reserveRootCompensationParentContextBeforeStart (program : Program)
    (before started : RuntimeState) : CompensationParentContextResult :=
  match program.compensationEventSubProcessSnapshots with
  | none =>
      if before.compensationParentContextRetentions.isEmpty then .disabled started
      else .refused .invalidState before
  | some _ =>
      match started.scopeOccurrences.filter fun occurrence => occurrence.parent.isNone with
      | [root] =>
          match reserveCompensationParentContext program before root with
          | .disabled _ => .disabled started
          | .applied reserved =>
              .applied
                { started with
                  compensationParentContextRetentions :=
                    reserved.compensationParentContextRetentions }
          | .refused reason _ => .refused reason before
      | _ => .refused .invalidState before

theorem reserveRootCompensationParentContextBeforeStart_refusal_preserves_before
    (program : Program) (before started returned : RuntimeState)
    (reason : CompensationParentContextRefusal)
    (refused : reserveRootCompensationParentContextBeforeStart program before started =
      .refused reason returned) :
    returned = before := by
  grind [reserveRootCompensationParentContextBeforeStart,
    reserveCompensationParentContext_refusal_preserves_state]

theorem reserveRootCompensationParentContextBeforeStart_applied_shape
    (program : Program) (before started after : RuntimeState)
    (applied : reserveRootCompensationParentContextBeforeStart program before started =
      .applied after) :
    ∃ root declaration target,
      started.scopeOccurrences.filter (fun occurrence => occurrence.parent.isNone) = [root] ∧
        program.compensationEventSubProcessSnapshots = some declaration ∧
        targetForParent? program root.id.definitionScopeId = some target ∧
        ∃ reserved,
          reserveCompensationParentContext program before root = .applied reserved ∧
            after = { started with
              compensationParentContextRetentions :=
                reserved.compensationParentContextRetentions } := by
  grind (gen := 16) [reserveRootCompensationParentContextBeforeStart,
    reserveCompensationParentContext_applied_shape]

/-- A declaration-free Program preserves the original start state exactly when no hidden snapshot state has been injected. This is both the byte-compatibility rule and the fast path that keeps old kernel-decided fixtures out of the snapshot validator. -/
theorem reserveRootCompensationParentContextBeforeStart_withoutDeclaration
    (program : Program) (before started : RuntimeState)
    (absent : program.compensationEventSubProcessSnapshots = none)
    (empty : before.compensationParentContextRetentions = []) :
    reserveRootCompensationParentContextBeforeStart program before started =
      .disabled started := by
  simp [reserveRootCompensationParentContextBeforeStart, absent, empty]

def prepareStartedSnapshotState (program : Program) (before : RuntimeState)
    (admission : ExternalAdmission) : ExternalAdmission :=
  match admission.outcome with
  | .committed =>
      match reserveRootCompensationParentContextBeforeStart program before admission.state with
      | .disabled successor | .applied successor =>
          { outcome := .committed, state := successor }
      | .refused _ _ => { outcome := .rejected, state := before }
  | .rolledBack | .rejected | .semanticFailure | .unsupported => admission

/- A committed command with invalid hidden state would make the next command reject a state this
dispatcher itself exposed. `COMPENSATION-EVENT-SUB-PROCESS-SNAPSHOT-PROPOSAL.md` § Reservation,
promotion, purge, and capacity therefore makes the post-state check part of admission, while the
transition-specific laws still prove why valid commands remain committed. -/
private def retainValidSnapshotAdmission (program : Program) (before : RuntimeState)
    (admission : ExternalAdmission) : ExternalAdmission :=
  match admission.outcome with
  | .committed =>
      if compensationEventSubProcessSnapshotStateValid program admission.state then admission
      else { outcome := .rejected, state := before }
  | .rolledBack | .rejected | .semanticFailure | .unsupported => admission

/-- Validate the optional hidden snapshot state once per command and stage root reservation after ordinary start admission but before internal closure. -/
def admitStimulusWithCompensationSnapshots (program : Program) (state : RuntimeState)
    (stimulus : Stimulus) : ExternalAdmission :=
  match program.compensationEventSubProcessSnapshots with
  | none => admitStimulusWithoutCompensationSnapshots program state stimulus
  | some _ =>
      if !compensationEventSubProcessSnapshotStateValid program state then
        { outcome := .rejected, state }
      else
        let admission := admitStimulusWithoutCompensationSnapshots program state stimulus
        let prepared :=
          match stimulus with
          | .startProcess .. | .triggerMessageStart .. | .triggerTimerStart .. =>
              prepareStartedSnapshotState program state admission
          | .completeUserTaskInstance .. | .deliverMessage .. | .deliverPayloadMessage ..
          | .deliverCorrelatedPayloadMessage .. | .fireTimer .. | .completeEffect ..
          | .reportEffectFailure .. | .retryIncident .. | .cancelIncidentProcess .. => admission
        retainValidSnapshotAdmission program state prepared

/-- Every committed snapshot-aware admission carries a valid hidden lifecycle into closure. -/
theorem admitStimulusWithCompensationSnapshots_committed_stateValid
    (program : Program) (state : RuntimeState) (stimulus : Stimulus)
    (declaration : CompensationEventSubProcessSnapshotDeclaration)
    (declared : program.compensationEventSubProcessSnapshots = some declaration)
    (committed :
      (admitStimulusWithCompensationSnapshots program state stimulus).outcome = .committed) :
    compensationEventSubProcessSnapshotStateValid program
      (admitStimulusWithCompensationSnapshots program state stimulus).state = true := by
  simp only [admitStimulusWithCompensationSnapshots, declared] at committed ⊢
  cases beforeValid : compensationEventSubProcessSnapshotStateValid program state with
  | false => simp [beforeValid] at committed
  | true =>
    simp only [beforeValid, Bool.not_true, Bool.false_eq_true, if_false] at committed ⊢
    generalize preparedEq : (let admission :=
          admitStimulusWithoutCompensationSnapshots program state stimulus
        match stimulus with
        | .startProcess .. | .triggerMessageStart .. | .triggerTimerStart .. =>
            prepareStartedSnapshotState program state admission
        | .completeUserTaskInstance .. | .deliverMessage .. | .deliverPayloadMessage ..
        | .deliverCorrelatedPayloadMessage .. | .fireTimer .. | .completeEffect ..
        | .reportEffectFailure .. | .retryIncident .. | .cancelIncidentProcess .. => admission) =
        prepared at committed ⊢
    cases outcome : prepared.outcome with
    | committed =>
        simp only [retainValidSnapshotAdmission, outcome] at committed ⊢
        by_cases afterValid :
            compensationEventSubProcessSnapshotStateValid program prepared.state = true
        · simp only [if_pos afterValid]
          exact afterValid
        · simp [if_neg afterValid] at committed
    | rolledBack | rejected | semanticFailure | unsupported =>
        simp [retainValidSnapshotAdmission, outcome] at committed

/-- The legacy admission surface is mechanically restricted to declaration-free Programs. -/
def admitStimulus (program : Program) (state : RuntimeState)
    (stimulus : Stimulus) : ExternalAdmission :=
  match program.compensationEventSubProcessSnapshots with
  | none => admitStimulusWithoutCompensationSnapshots program state stimulus
  | some _ => { outcome := .rejected, state }

theorem admitStimulus_withSnapshotDeclaration_rejects (program : Program)
    (state : RuntimeState) (stimulus : Stimulus)
    (declaration : CompensationEventSubProcessSnapshotDeclaration)
    (declared : program.compensationEventSubProcessSnapshots = some declaration) :
    (admitStimulus program state stimulus).outcome = .rejected ∧
      (admitStimulus program state stimulus).state = state := by
  simp [admitStimulus, declared]

theorem admitStimulusWithCompensationSnapshots_withoutDeclaration
    (program : Program) (state : RuntimeState) (stimulus : Stimulus)
    (absent : program.compensationEventSubProcessSnapshots = none) :
    admitStimulusWithCompensationSnapshots program state stimulus =
      admitStimulus program state stimulus := by
  simp [admitStimulusWithCompensationSnapshots, admitStimulus, absent]

end BpmnSemantics.SemanticProcess
