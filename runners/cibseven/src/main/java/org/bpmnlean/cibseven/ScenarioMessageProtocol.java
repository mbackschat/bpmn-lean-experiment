package org.bpmnlean.cibseven;

import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;
import java.util.Objects;

/** Message-specific canonical wire records shared by the CIB runner and scenario contract. */
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

  @JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "kind")
  @JsonSubTypes({
    @JsonSubTypes.Type(
        value = OperationMessageChannel.class,
        name = "operationMessage"),
    @JsonSubTypes.Type(value = DirectMessageChannel.class, name = "directMessage"),
    @JsonSubTypes.Type(value = UnspecifiedMessageChannel.class, name = "unspecifiedMessage")
  })
  public sealed interface MessageChannel
      permits OperationMessageChannel, DirectMessageChannel, UnspecifiedMessageChannel {}

  public record OperationMessageChannel(
      String interfaceId,
      String interfaceOperationId,
      String messageId) implements MessageChannel {
    public OperationMessageChannel {
      Objects.requireNonNull(interfaceId, "interfaceId");
      Objects.requireNonNull(interfaceOperationId, "interfaceOperationId");
      Objects.requireNonNull(messageId, "messageId");
    }
  }

  public record DirectMessageChannel(String messageId) implements MessageChannel {
    public DirectMessageChannel {
      Objects.requireNonNull(messageId, "messageId");
    }
  }

  /** The field-free channel of a Receive Task without a Message (`CIB-INT-0004`). */
  public record UnspecifiedMessageChannel() implements MessageChannel {}

  public record OpenMessageSubscription(
      MessageSubscriptionId id, MessageChannel channel) {
    public OpenMessageSubscription {
      Objects.requireNonNull(id, "id");
      Objects.requireNonNull(channel, "channel");
    }
  }

  public record DeliverMessageStimulus(
      String commandId,
      MessageSubscriptionId subscriptionId,
      MessageChannel channel) implements ScenarioProtocol.Stimulus {
    public DeliverMessageStimulus {
      Objects.requireNonNull(commandId, "commandId");
      Objects.requireNonNull(subscriptionId, "subscriptionId");
      Objects.requireNonNull(channel, "channel");
    }
  }

  public record DeliverMessageInteraction(
      MessageSubscriptionId subscriptionId, MessageChannel channel)
      implements ScenarioInteractionProtocol.EnabledInteraction {
    public DeliverMessageInteraction {
      Objects.requireNonNull(subscriptionId, "subscriptionId");
      Objects.requireNonNull(channel, "channel");
    }
  }
}
