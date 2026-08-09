package org.bpmnlean.cibseven;

import java.util.List;
import org.bpmnlean.cibseven.ScenarioProtocol.BpmnErrorEffectResult;
import org.bpmnlean.cibseven.ScenarioProtocol.CompleteEffectStimulus;
import org.bpmnlean.cibseven.ScenarioProtocol.NullValue;
import org.bpmnlean.cibseven.ScenarioProtocol.ScenarioDefinition;
import org.bpmnlean.cibseven.ScenarioProtocol.StringValue;
import org.bpmnlean.cibseven.ScenarioProtocol.VariableBinding;
import org.cibseven.bpm.engine.delegate.BpmnError;
import org.cibseven.bpm.engine.delegate.DelegateExecution;
import org.cibseven.bpm.engine.delegate.JavaDelegate;

/**
 * Test-only realization of the selected synchronous boundary-error host relation.
 *
 * <p>The scenario supplies the business result. This delegate independently requires the exact
 * mapped input, writes the declared Activity-local null, and raises the corresponding CIB
 * {@link BpmnError}; the engine remains authority for caught-path output mapping and routing.
 */
final class CibSevenBoundaryErrorProbe implements JavaDelegate {

  static final String HANDLER_BEAN = "createRelationshipLinkDelegate";
  static final String INPUT_NAME = "relationshipModel";
  static final String INPUT_VALUE = "RelationshipModel";
  static final String LOCAL_OUTPUT_NAME = "newLinkId";

  private BpmnErrorEffectResult result;
  private int invocations;
  private String observedInput;

  void beginExecution(ScenarioDefinition scenario) {
    result = requiredResult(scenario);
    invocations = 0;
    observedInput = null;
  }

  @Override
  public void execute(DelegateExecution execution) {
    if (result == null) {
      throw new IllegalStateException(
          "Boundary-error probe was not configured from one scenario result");
    }
    invocations += 1;
    var input = execution.getVariableLocal(INPUT_NAME);
    if (!(input instanceof String value) || !INPUT_VALUE.equals(value)) {
      throw new IllegalStateException(
          "Boundary-error input mapping did not produce the exact local string");
    }
    observedInput = value;
    execution.setVariableLocal(LOCAL_OUTPUT_NAME, null);
    if (result.message() == null) {
      throw new BpmnError(result.code());
    }
    throw new BpmnError(result.code(), result.message());
  }

  void requireCaughtExecution() {
    if (invocations != 1 || !INPUT_VALUE.equals(observedInput)) {
      throw new IllegalStateException(
          "Boundary-error delegate did not observe one exact mapped input");
    }
  }

  MappingExecutionSnapshot snapshot(String afterCommandId) {
    requireCaughtExecution();
    return new MappingExecutionSnapshot(
        afterCommandId,
        HANDLER_BEAN,
        List.of(
            new VariableBinding(
                INPUT_NAME,
                new StringValue(observedInput))),
        result.localPatch(),
        invocations);
  }

  private static BpmnErrorEffectResult requiredResult(
      ScenarioDefinition scenario) {
    var completions =
        scenario.stimuli().stream()
            .filter(CompleteEffectStimulus.class::isInstance)
            .map(CompleteEffectStimulus.class::cast)
            .toList();
    if (completions.size() != 1
        || !(completions.getFirst().result()
            instanceof BpmnErrorEffectResult result)
        || result.localPatch().size() != 1) {
      throw new IllegalArgumentException(
          "Boundary-error scenario requires one typed BPMN Error result");
    }
    var binding = result.localPatch().getFirst();
    if (!LOCAL_OUTPUT_NAME.equals(binding.name())
        || !(binding.value() instanceof NullValue)) {
      throw new IllegalArgumentException(
          "Boundary-error result requires the exact declared null local patch");
    }
    return result;
  }
}
