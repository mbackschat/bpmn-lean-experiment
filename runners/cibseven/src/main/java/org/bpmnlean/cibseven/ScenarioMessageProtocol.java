package org.bpmnlean.cibseven;

import java.util.Objects;

/** Message-specific canonical wire records retained as empty projections by the CIB runner. */
public final class ScenarioMessageProtocol {

  private ScenarioMessageProtocol() {}

  public record MessageSubscriptionId(
      String processInstanceId, String elementId, long activation) {
    public MessageSubscriptionId {
      Objects.requireNonNull(processInstanceId, "processInstanceId");
      Objects.requireNonNull(elementId, "elementId");
      if (activation < 1 || activation > ScenarioProtocol.MAX_SAFE_WIRE_INTEGER) {
        throw new IllegalArgumentException(
            "activation must be a positive safe wire integer");
      }
    }
  }

  public record MessageChannel(
      String interfaceId, String interfaceOperationId, String messageId) {
    public MessageChannel {
      Objects.requireNonNull(interfaceId, "interfaceId");
      Objects.requireNonNull(interfaceOperationId, "interfaceOperationId");
      Objects.requireNonNull(messageId, "messageId");
    }
  }

  public record OpenMessageSubscription(
      MessageSubscriptionId id, MessageChannel channel) {
    public OpenMessageSubscription {
      Objects.requireNonNull(id, "id");
      Objects.requireNonNull(channel, "channel");
    }
  }
}
