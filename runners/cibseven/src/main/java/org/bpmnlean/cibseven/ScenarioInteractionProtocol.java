package org.bpmnlean.cibseven;

import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;
import java.util.Objects;

/** Closed canonical interaction union exposed by CIB state observations. */
public final class ScenarioInteractionProtocol {

  private ScenarioInteractionProtocol() {}

  @JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "kind")
  @JsonSubTypes({
    @JsonSubTypes.Type(
        value = CompleteUserTaskInstanceInteraction.class,
        name = "completeUserTaskInstance"),
    @JsonSubTypes.Type(
        value = ScenarioMessageProtocol.DeliverMessageInteraction.class,
        name = "deliverMessage")
  })
  public sealed interface EnabledInteraction
      permits CompleteUserTaskInstanceInteraction,
          ScenarioMessageProtocol.DeliverMessageInteraction {}

  public record CompleteUserTaskInstanceInteraction(
      ScenarioProtocol.UserTaskInstanceId taskId)
      implements EnabledInteraction {
    public CompleteUserTaskInstanceInteraction {
      Objects.requireNonNull(taskId, "taskId");
    }
  }
}
