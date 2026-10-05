import BpmnSemantics.SemanticProcess.MessageStartAdmission
import BpmnSemantics.SemanticProcess.ProfileAdmission
import BpmnSemantics.SemanticProcess.StructuredCompositionCommandAdmission
import BpmnSemantics.SemanticProcess.SequentialScopeDataAdmission

/-! Pure scenario admission is independent of execution and projection, so SMIS-ADMIT-01 can be checked without compiling the executor's preservation proof tree. -/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

def hasMultiInstanceDefinitions (program : Program) : Bool :=
  program.operations.any fun operation => match operation with
    | .awaitSequentialMultiInstanceUserTask .. | .awaitParallelMultiInstanceUserTask ..
    | .enterSequentialMultiInstanceScope .. => true
    | _ => false

private def requiredObservations (program : Program) : List ObservationKind :=
  let baseline :=
    [ .deployment
  , .commandResults
  , .processStatus
  , .activeWaits
  , .openUserTasks
  , .openTimers
  , .openEffects ]
  let multiInstance := if hasMultiInstanceDefinitions program then [.openMultiInstances] else []
  baseline ++ multiInstance ++
  [ .variables
  , .enabledInteractions
  , .logicalTime ]

private def isProcessStartStimulus : Stimulus → Bool
  | .startProcess .. | .triggerMessageStart .. | .triggerTimerStart .. => true
  | .completeUserTaskInstance .. | .deliverMessage .. | .deliverPayloadMessage ..
  | .deliverCorrelatedPayloadMessage ..
  | .fireTimer ..
  | .completeEffect .. | .reportEffectFailure .. | .retryIncident ..
  | .cancelIncidentProcess .. => false

/-- A scenario starts exactly once, in its first position, through one member of the closed start family. -/
def stimulusSequenceSupported : List Stimulus → Bool
  | .startProcess .. :: remaining
  | .triggerMessageStart .. :: remaining
  | .triggerTimerStart .. :: remaining =>
      remaining.all fun stimulus => !isProcessStartStimulus stimulus
  | _ => false

private def firstStimulusMatchesProgram (program : Program) :
    List Stimulus → Bool
  | stimulus :: _ => startStimulusMatchesProgram program stimulus
  | [] => false

/-- Business-task scenario support requires the same initial data as TypeScript support admission; command refusal remains a separate outcome. -/
private def businessTaskScenarioStartAdmitted (program : Program) (stimuli : List Stimulus) : Bool :=
  if program.identity.semanticProfile != serialBusinessTaskProfileId &&
      program.identity.semanticProfile != mixedTaskControlFlowProfileId &&
      program.identity.semanticProfile != mixedTaskBusinessErrorProfileId then true
  else match stimuli with
    | .startProcess _ _ instanceId bindings :: _ =>
        !instanceId.value.isEmpty &&
          if program.identity.semanticProfile == mixedTaskControlFlowProfileId || program.identity.semanticProfile == mixedTaskBusinessErrorProfileId then
            MixedTaskControlFlow.startBindingsAdmitted program bindings
          else SerialBusinessTask.startBindingsAdmitted program bindings
    | _ => false

/-- Admit only the `scenario` document kind for a structurally well-formed, profile-capability-valid program whose profile and source identity match the scenario and whose requested observations are exactly the required observation list. -/
def supportsScenario (program : Program) (scenario : Scenario) : Bool :=
  programWellFormed program &&
    programProfileCapabilitiesValid program &&
    (scenario.stimuli.head?.all (SequentialScopeData.stimulusAdmitted program)) &&
    structuredCompositionScenarioStartAdmitted program scenario.stimuli &&
    businessTaskScenarioStartAdmitted program scenario.stimuli &&
    stimulusSequenceSupported scenario.stimuli &&
    firstStimulusMatchesProgram program scenario.stimuli &&
    decide (
      scenario.kind = .scenario &&
        scenario.profile = program.identity.semanticProfile &&
        scenario.bpmn.id = program.identity.sourceId &&
        scenario.bpmn.sha256 = program.identity.sourceSha256 &&
        scenario.bpmn.sourceOverlay = program.identity.sourceOverlay &&
        scenario.observations = requiredObservations program)

end BpmnSemantics.SemanticProcess
