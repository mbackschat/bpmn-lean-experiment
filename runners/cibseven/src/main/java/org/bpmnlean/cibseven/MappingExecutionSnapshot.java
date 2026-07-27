package org.bpmnlean.cibseven;

import java.util.List;
import java.util.Objects;
import org.bpmnlean.cibseven.ScenarioProtocol.VariableBinding;

/** Raw delegate-boundary facts retained for the exact synchronous data-mapping probe. */
public record MappingExecutionSnapshot(
    String afterCommandId,
    String handler,
    List<VariableBinding> arguments,
    List<VariableBinding> localPatch,
    long invocations) {

  public MappingExecutionSnapshot {
    Objects.requireNonNull(afterCommandId, "afterCommandId");
    Objects.requireNonNull(handler, "handler");
    arguments = List.copyOf(arguments);
    localPatch = List.copyOf(localPatch);
    if (invocations < 1) {
      throw new IllegalArgumentException("invocations must be positive");
    }
  }
}
