import BpmnSemantics.SemanticProcess.Incident
import BpmnSemantics.SemanticProcess.IncidentCancellation
import BpmnSemantics.SemanticProcess.MessageStartAdmission
import BpmnSemantics.SemanticProcess.ProfileAdmission
import BpmnSemantics.SemanticProcess.SequentialMultiInstanceTransition
import BpmnSemantics.SemanticProcess.ParallelMultiInstanceTransition
import BpmnSemantics.SemanticProcess.ValueDomain
import BpmnSemantics.SemanticProcess.WaitCompletion
import BpmnSemantics.SemanticProcess.ActivityDataInput

/-! # Semantic Process external command admission

This module owns the complete external stimulus dispatch and the fail-closed runtime-state gate applied before dispatch. It separates command admission from bounded internal closure and rejects incident-bearing states unless they belong to the exact approved profile, program shape, and private association invariant.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

structure ExternalAdmission where
  outcome : CommandOutcome
  state : RuntimeState

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

def dispatchStimulus (program : Program) (state : RuntimeState) :
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
      | .cancelled _ => { outcome := .rejected, state }
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
                match completeSharedParallelMultiInstance? arm state taskId submittedValues with
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
                match completeSequentialMultiInstanceInnerTask? arm state taskId submittedValues with
                | some successor =>
                    if sequentialMultiInstanceProgramAdmitted program &&
                        taskId.processInstanceId = instanceId then
                      { outcome := .committed, state := successor }
                    else
                      { outcome := .rejected, state }
                | none => { outcome := .rejected, state }
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
          match completeUserTask state taskId.processInstanceId
              ⟨taskId.elementId.value⟩ taskId.activation with
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
      | .cancelled _ => { outcome := .rejected, state }
  | .deliverMessage _ subscriptionId channel =>
      match state.control with
      | .running instanceId =>
          match deliverMessage program state subscriptionId channel with
          | some successor =>
              if subscriptionId.processInstanceId = instanceId then
                { outcome := .committed, state := successor }
              else
                { outcome := .rejected, state }
          | none => { outcome := .rejected, state }
      | .notStarted
      | .completed _
      | .cancelled _ => { outcome := .rejected, state }
  | .fireTimer _ timerId logicalTimeMs =>
      match state.control with
      | .running instanceId =>
          if let some operation := parallelMultiInstanceEntryForTimer? program
              ({ value := timerId.elementId.value } : NodeId) then
            match ParallelMultiInstanceArm.ofOperation? operation with
            | some arm =>
                match interruptSharedParallelMultiInstance? arm state timerId logicalTimeMs with
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
                match interruptSequentialMultiInstance? arm state timerId logicalTimeMs with
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
      | .cancelled _ => { outcome := .rejected, state }
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
      | .cancelled _ => { outcome := .rejected, state }
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
      | .cancelled _ => { outcome := .rejected, state }
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
      | .cancelled _ => { outcome := .rejected, state }
  | .cancelIncidentProcess _ processInstanceId incidentId =>
      match cancelIncidentProcess program state processInstanceId incidentId with
      | some successor => { outcome := .committed, state := successor }
      | none => { outcome := .rejected, state }

/-- Apply the fail-closed incident/program association gate before any external command dispatch. Refusal preserves the exact submitted state and never enters internal closure. -/
def admitStimulus (program : Program) (state : RuntimeState)
    (stimulus : Stimulus) : ExternalAdmission :=
  match stimulus with
  | .cancelIncidentProcess _ processInstanceId incidentId =>
      if (incidentProcessCancellationRoot? program state processInstanceId incidentId).isSome then
        dispatchStimulus program state stimulus
      else
        { outcome := .rejected, state }
  | .startProcess .. | .triggerMessageStart .. | .triggerTimerStart ..
  | .completeUserTaskInstance .. | .deliverMessage .. | .fireTimer ..
  | .completeEffect .. | .reportEffectFailure .. | .retryIncident .. =>
      match state.effectIncidents with
      | [] => dispatchStimulus program state stimulus
      | _ :: _ =>
          if incidentStateAdmitted program state then
            dispatchStimulus program state stimulus
          else
            { outcome := .rejected, state }

end BpmnSemantics.SemanticProcess
