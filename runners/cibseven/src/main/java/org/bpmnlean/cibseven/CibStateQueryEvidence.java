package org.bpmnlean.cibseven;

import java.util.List;
import java.util.Objects;

/** Raw CIB runtime/history query shapes retained before canonical state projection. */
public final class CibStateQueryEvidence {

  private static final long MAX_SAFE_WIRE_INTEGER = 9_007_199_254_740_991L;

  private CibStateQueryEvidence() {}

  public record StateQuerySnapshot(
      String afterCommandId,
      long processInstanceCount,
      long engineClockTimeMs,
      List<ProcessVariableSnapshot> variables) {
    public StateQuerySnapshot {
      Objects.requireNonNull(afterCommandId, "afterCommandId");
      if (processInstanceCount < 0 || processInstanceCount > 1) {
        throw new IllegalArgumentException(
            "processInstanceCount must identify zero or one Process instance");
      }
      if (engineClockTimeMs < 0 || engineClockTimeMs > MAX_SAFE_WIRE_INTEGER) {
        throw new IllegalArgumentException(
            "engineClockTimeMs must be a non-negative safe wire integer");
      }
      variables = List.copyOf(variables);
    }
  }

  public record ProcessVariableSnapshot(String name, Object value) {
    public ProcessVariableSnapshot {
      Objects.requireNonNull(name, "name");
      value = ScenarioVariableValueProjection.requireHostValue(value);
    }
  }

  /** Raw public-subscription facts plus the adapter-decided deployed Message identity. */
  public record MessageSubscriptionSnapshot(
      String afterCommandId, List<MessageSubscription> subscriptions) {
    public MessageSubscriptionSnapshot {
      Objects.requireNonNull(afterCommandId, "afterCommandId");
      subscriptions = List.copyOf(subscriptions);
    }
  }

  public record MessageSubscription(
      String elementId,
      String eventName,
      String messageId,
      boolean processInstanceIdMatches,
      boolean executionIdPresent) {
    public MessageSubscription {
      Objects.requireNonNull(elementId, "elementId");
      Objects.requireNonNull(eventName, "eventName");
      Objects.requireNonNull(messageId, "messageId");
    }
  }
}
