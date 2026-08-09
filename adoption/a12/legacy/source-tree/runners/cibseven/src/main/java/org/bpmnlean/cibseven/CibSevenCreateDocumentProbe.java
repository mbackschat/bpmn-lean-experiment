package org.bpmnlean.cibseven;

import java.util.List;
import org.bpmnlean.cibseven.ScenarioProtocol.StringValue;
import org.bpmnlean.cibseven.ScenarioProtocol.VariableBinding;
import org.cibseven.bpm.engine.delegate.DelegateExecution;
import org.cibseven.bpm.engine.delegate.JavaDelegate;

/**
 * Test-only realization of the exact A12 CreateDocument delegate contract.
 *
 * <p>The probe reads and writes Activity-local variables so the engine's input and output mappings,
 * rather than the adapter, establish the final Process variable.
 */
final class CibSevenCreateDocumentProbe implements JavaDelegate {

  static final String HANDLER_BEAN = "createDocumentDelegate";
  static final String INPUT_NAME = "documentModelName";
  static final String INPUT_VALUE = "MyDocumentModel";
  static final String LOCAL_OUTPUT_NAME = "newDocRef";
  static final String LOCAL_OUTPUT_VALUE = "Document:42";

  private int invocations;
  private String observedInput;

  void beginExecution() {
    invocations = 0;
    observedInput = null;
  }

  @Override
  public void execute(DelegateExecution execution) {
    invocations += 1;
    var input = execution.getVariableLocal(INPUT_NAME);
    if (!(input instanceof String value) || !INPUT_VALUE.equals(value)) {
      throw new IllegalStateException(
          "CreateDocument input mapping did not produce the exact local string");
    }
    observedInput = value;
    execution.setVariableLocal(LOCAL_OUTPUT_NAME, LOCAL_OUTPUT_VALUE);
  }

  void requireSuccessfulExecution() {
    if (invocations != 1 || !INPUT_VALUE.equals(observedInput)) {
      throw new IllegalStateException(
          "CreateDocument delegate did not observe one exact mapped input");
    }
  }

  MappingExecutionSnapshot snapshot(String afterCommandId) {
    requireSuccessfulExecution();
    return new MappingExecutionSnapshot(
        afterCommandId,
        HANDLER_BEAN,
        List.of(
            new VariableBinding(INPUT_NAME, new StringValue(observedInput))),
        List.of(
            new VariableBinding(
                LOCAL_OUTPUT_NAME,
                new StringValue(LOCAL_OUTPUT_VALUE))),
        invocations);
  }
}
