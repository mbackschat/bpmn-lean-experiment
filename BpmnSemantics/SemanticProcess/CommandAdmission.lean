import BpmnSemantics.SemanticProcess.Incident
import BpmnSemantics.SemanticProcess.MessageStartAdmission
import BpmnSemantics.SemanticProcess.ProfileAdmission
import BpmnSemantics.SemanticProcess.ValueDomain
import BpmnSemantics.SemanticProcess.WaitCompletion

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

/-- An incident-free state remains admissible to every existing profile. A nonempty incident state is admitted only by the exact successor profile and program shape with valid private associations. -/
def incidentStateAdmitted (program : Program) (state : RuntimeState) : Bool :=
  state.effectIncidents.isEmpty ||
    (program.identity.semanticProfile = serviceTaskIncidentCheckpointProfileId &&
      programWellFormed program &&
      programProfileCapabilitiesValid program &&
      effectIncidentAssociationsValid state)

def dispatchStimulus (program : Program) (state : RuntimeState) :
    Stimulus → ExternalAdmission
  | .startProcess _ processId instanceId initialVariables =>
      match state.control with
      | .notStarted =>
          if ordinaryStartMatchesProgram program &&
              program.processId.value = processId.value &&
              processDataBindingsAdmitted program.identity.semanticProfile
                .processStart initialVariables &&
              (!isCallActivityProgram program || initialVariables.isEmpty) then
            match runningProgramStartState? program instanceId initialVariables with
            | some started => { outcome := .committed, state := started }
            | none => { outcome := .semanticFailure, state }
          else
            { outcome := .rejected, state }
      | .running _
      | .completed _ => { outcome := .rejected, state }
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
          if isBoundedTaskDefinition program ⟨taskId.elementId.value⟩ then
            match completeBoundedUserTask? program state taskId.processInstanceId
                ⟨taskId.elementId.value⟩ taskId.activation with
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
      | .completed _ => { outcome := .rejected, state }
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
      | .completed _ => { outcome := .rejected, state }
  | .fireTimer _ timerId logicalTimeMs =>
      match state.control with
      | .running instanceId =>
          match fireTimer program state timerId logicalTimeMs with
          | some successor =>
              if timerId.processInstanceId = instanceId then
                { outcome := .committed, state := successor }
              else
                { outcome := .rejected, state }
          | none => { outcome := .rejected, state }
      | .notStarted
      | .completed _ => { outcome := .rejected, state }
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
      | .completed _ => { outcome := .rejected, state }
  | .reportEffectFailure _ effectId generation =>
      match state.control with
      | .running instanceId =>
          match reportEffectFailure state effectId generation with
          | some successor =>
              if program.identity.semanticProfile =
                    serviceTaskIncidentCheckpointProfileId &&
                  programWellFormed program &&
                  programProfileCapabilitiesValid program &&
                  effectId.processInstanceId = instanceId then
                { outcome := .committed, state := successor }
              else
                { outcome := .rejected, state }
          | none => { outcome := .rejected, state }
      | .notStarted
      | .completed _ => { outcome := .rejected, state }
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
      | .completed _ => { outcome := .rejected, state }

/-- Apply the fail-closed incident/program association gate before any external command dispatch. Refusal preserves the exact submitted state and never enters internal closure. -/
def admitStimulus (program : Program) (state : RuntimeState)
    (stimulus : Stimulus) : ExternalAdmission :=
  match state.effectIncidents with
  | [] => dispatchStimulus program state stimulus
  | _ :: _ =>
      if incidentStateAdmitted program state then
        dispatchStimulus program state stimulus
      else
        { outcome := .rejected, state }

end BpmnSemantics.SemanticProcess
