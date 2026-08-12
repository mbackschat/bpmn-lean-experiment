package org.bpmnlean.cibseven;

import org.bpmnlean.cibseven.ScenarioProtocol.BooleanValue;
import org.bpmnlean.cibseven.ScenarioProtocol.BpmnErrorEffectResult;
import org.bpmnlean.cibseven.ScenarioProtocol.CompleteEffectStimulus;
import org.bpmnlean.cibseven.ScenarioProtocol.CompleteUserTaskInstanceStimulus;
import org.bpmnlean.cibseven.ScenarioProtocol.FireTimerStimulus;
import org.bpmnlean.cibseven.ScenarioProtocol.NullValue;
import org.bpmnlean.cibseven.ScenarioProtocol.ScenarioDefinition;
import org.bpmnlean.cibseven.ScenarioProtocol.StartProcessStimulus;
import org.bpmnlean.cibseven.ScenarioProtocol.StringValue;
import org.bpmnlean.cibseven.ScenarioProtocol.SuccessfulEffectResult;
import org.bpmnlean.cibseven.ScenarioProtocol.VariableBinding;
import org.bpmnlean.cibseven.ScenarioMessageProtocol.DeliverMessageStimulus;

/** Owns the exact profile and command-surface matrix for scenario variable values. */
final class ScenarioVariableValuePolicy {

  private static final String BOOLEAN_COMPLETION_PROFILE =
      "cibseven-2.2.0-user-task-boolean-completion-data-draft";

  enum Surface {
    PROCESS_START,
    USER_TASK_COMPLETION,
    EFFECT_PATCH
  }

  private ScenarioVariableValuePolicy() {}

  static boolean admits(
      String profile, Surface surface, Iterable<VariableBinding> bindings) {
    for (var binding : bindings) {
      var admitted =
          switch (binding.value()) {
            case StringValue ignored -> true;
            case NullValue ignored -> true;
            case BooleanValue ignored ->
                surface == Surface.USER_TASK_COMPLETION
                    && BOOLEAN_COMPLETION_PROFILE.equals(profile);
          };
      if (!admitted) {
        return false;
      }
    }
    return true;
  }

  static void requireScenarioSurfaces(ScenarioDefinition scenario) {
    for (var stimulus : scenario.stimuli()) {
      switch (stimulus) {
        case StartProcessStimulus start ->
            requireAdmitted(scenario.profile(), Surface.PROCESS_START, start.initialVariables());
        case CompleteEffectStimulus complete -> {
          var patch =
              switch (complete.result()) {
                case SuccessfulEffectResult result -> result.localPatch();
                case BpmnErrorEffectResult result -> result.localPatch();
              };
          requireAdmitted(scenario.profile(), Surface.EFFECT_PATCH, patch);
        }
        case CompleteUserTaskInstanceStimulus ignored -> {
          // User Task completion is admitted at execution so a mismatch remains a semantic refusal.
        }
        case DeliverMessageStimulus ignored -> {}
        case FireTimerStimulus ignored -> {}
      }
    }
  }

  private static void requireAdmitted(
      String profile, Surface surface, Iterable<VariableBinding> bindings) {
    if (!admits(profile, surface, bindings)) {
      throw new IllegalArgumentException(
          "Scenario variable value is outside " + surface + " for profile " + profile);
    }
  }
}
