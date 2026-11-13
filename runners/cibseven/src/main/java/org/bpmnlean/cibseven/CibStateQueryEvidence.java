package org.bpmnlean.cibseven;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;
import java.util.Objects;
import org.bpmnlean.cibseven.ScenarioProtocol.VariableBinding;

/** Raw CIB runtime/history query shapes retained before canonical state projection. */
public final class CibStateQueryEvidence {

  private static final long MAX_SAFE_WIRE_INTEGER = 9_007_199_254_740_991L;

  private CibStateQueryEvidence() {}

  /**
   * A state query's facts. Its root variables are retained as wire-typed bindings, not as the raw Java values: a host
   * carrier such as BigDecimal, List or Map has no raw JSON spelling inside the strict wire integer domain.
   */
  public record StateQuerySnapshot(
      String afterCommandId,
      long processInstanceCount,
      long engineClockTimeMs,
      List<VariableBinding> variables) {
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

  /**
   * Raw public-subscription facts plus the adapter-decided deployed Message identity.
   *
   * <p>An addressless Receive Task wait has no event subscription in CIB Seven `2.2.0`, so its raw fact is
   * the waiting execution itself (`CIB-OP-0011`); the list is omitted when empty, keeping every
   * Message-addressed snapshot byte-identical.
   */
  public record MessageSubscriptionSnapshot(
      String afterCommandId,
      List<MessageSubscription> subscriptions,
      @JsonInclude(JsonInclude.Include.NON_EMPTY)
          List<AddresslessReceiveWait> addresslessReceiveWaits) {
    public MessageSubscriptionSnapshot {
      Objects.requireNonNull(afterCommandId, "afterCommandId");
      subscriptions = List.copyOf(subscriptions);
      // The writer omits the empty list, so a reader receives null for it.
      addresslessReceiveWaits =
          addresslessReceiveWaits == null ? List.of() : List.copyOf(addresslessReceiveWaits);
    }

    public MessageSubscriptionSnapshot(String afterCommandId, List<MessageSubscription> subscriptions) {
      this(afterCommandId, subscriptions, List.of());
    }
  }

  /** One active execution at a Receive Task that declares no `messageRef`. */
  public record AddresslessReceiveWait(String elementId) {
    public AddresslessReceiveWait {
      Objects.requireNonNull(elementId, "elementId");
    }
  }

  /**
   * One Message subscription. Its `eventName` is null when the Message's name expression resolved to null: CIB stores
   * the resolved value unchecked (`EventSubscriptionDeclaration.java:172-184`).
   */
  public record MessageSubscription(
      String elementId,
      String eventName,
      String messageId,
      boolean processInstanceIdMatches,
      boolean executionIdPresent) {
    public MessageSubscription {
      Objects.requireNonNull(elementId, "elementId");
      Objects.requireNonNull(messageId, "messageId");
    }
  }
}
