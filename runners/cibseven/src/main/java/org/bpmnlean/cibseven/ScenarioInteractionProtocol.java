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
        name = "deliverMessage"),
    @JsonSubTypes.Type(value = RetryIncidentInteraction.class, name = "retryIncident"),
    @JsonSubTypes.Type(
        value = CancelIncidentProcessInteraction.class,
        name = "cancelIncidentProcess")
  })
  public sealed interface EnabledInteraction
      permits CompleteUserTaskInstanceInteraction,
          ScenarioMessageProtocol.DeliverMessageInteraction,
          RetryIncidentInteraction,
          CancelIncidentProcessInteraction {}

  public record CompleteUserTaskInstanceInteraction(
      ScenarioProtocol.UserTaskInstanceId taskId)
      implements EnabledInteraction {
    public CompleteUserTaskInstanceInteraction {
      Objects.requireNonNull(taskId, "taskId");
    }
  }

  public record RetryIncidentInteraction(
      ScenarioProtocol.EffectIncidentId incidentId) implements EnabledInteraction {
    public RetryIncidentInteraction {
      Objects.requireNonNull(incidentId, "incidentId");
    }
  }

  public record CancelIncidentProcessInteraction(
      String processInstanceId, ScenarioProtocol.EffectIncidentId incidentId)
      implements EnabledInteraction {
    public CancelIncidentProcessInteraction {
      Objects.requireNonNull(processInstanceId, "processInstanceId");
      Objects.requireNonNull(incidentId, "incidentId");
    }
  }
}
