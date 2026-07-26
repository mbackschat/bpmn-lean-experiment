package org.bpmnlean.cibseven;

import static org.bpmnlean.cibseven.ScenarioProtocol.UserTaskLifecycleState.ACTIVE;
import static org.bpmnlean.cibseven.ScenarioProtocol.WaitKind.USER_TASK;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertThrows;

import java.util.List;
import org.bpmnlean.cibseven.CibSevenUserTaskProjector.HostUserTask;
import org.bpmnlean.cibseven.ScenarioProtocol.ActiveWait;
import org.bpmnlean.cibseven.ScenarioProtocol.OpenUserTask;
import org.bpmnlean.cibseven.ScenarioProtocol.UserTaskInstanceId;
import org.junit.Test;

/** Contract tests for semantic task identity, ordering, and multiplicity at the CIB boundary. */
public class CibSevenUserTaskProjectorTest {

  private final CibSevenUserTaskProjector projector =
      new CibSevenUserTaskProjector();

  @Test
  public void sortsOpenTasksBySemanticIdentityInsteadOfHostOrder() {
    assertEquals(
        List.of(
            openTask("UserTask_A", "A"),
            openTask("UserTask_B", "B")),
        projector.openUserTasks(
            "Instance_1",
            List.of(
                new HostUserTask("UserTask_B", "B"),
                new HostUserTask("UserTask_A", "A"))));
  }

  @Test
  public void sortsOpenTasksByUnicodeScalarValue() {
    assertEquals(
        List.of(
            openTask("\uE000", "BMP"),
            openTask("\uD800\uDC00", "supplementary")),
        projector.openUserTasks(
            "Instance_1",
            List.of(
                new HostUserTask("\uD800\uDC00", "supplementary"),
                new HostUserTask("\uE000", "BMP"))));
  }

  @Test
  public void preservesWaitMultiplicityPerTaskElement() {
    assertEquals(
        List.of(
            new ActiveWait("UserTask_A", USER_TASK, 2),
            new ActiveWait("UserTask_B", USER_TASK, 1)),
        projector.activeWaits(
            List.of(
                new HostUserTask("UserTask_B", "B"),
                new HostUserTask("UserTask_A", "A"),
                new HostUserTask("UserTask_A", "A"))));
  }

  @Test
  public void rejectsRepeatedTaskElementsWithoutInventingActivationOrder() {
    assertThrows(
        IllegalStateException.class,
        () ->
            projector.openUserTasks(
                "Instance_1",
                List.of(
                    new HostUserTask("UserTask_A", "A"),
                    new HostUserTask("UserTask_A", "A"))));
  }

  private static OpenUserTask openTask(String elementId, String name) {
    return new OpenUserTask(
        new UserTaskInstanceId("Instance_1", elementId, 1),
        name,
        ACTIVE);
  }
}
