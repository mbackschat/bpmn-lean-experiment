package org.bpmnlean.cibseven;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.cibseven.bpm.engine.ProcessEngine;
import org.cibseven.bpm.engine.runtime.EventSubscription;
import org.junit.AfterClass;
import org.junit.BeforeClass;
import org.junit.Test;

/**
 * Calibrates the public CIB Seven 2.2.0 subscription lifecycle for one project-authored,
 * Message-addressed Receive Task without assigning the host subscription its semantic address.
 */
public final class CibSevenReceiveTaskPhaseZeroProbeTest {

  private static final Path PROJECT_ROOT =
      Path.of("../..").toAbsolutePath().normalize();
  private static final Path RESOURCE =
      PROJECT_ROOT.resolve("scenarios/message-addressed-receive-task/process.bpmn");
  private static final String PROCESS_ID =
      "Process_MessageAddressedReceiveTaskProbe";
  private static final String RECEIVE_TASK_ID =
      "ReceiveTask_WaitForInvoice";
  private static final String MESSAGE_NAME = "newInvoiceMessage";
  private static ProcessEngine engine;

  @BeforeClass
  public static void createEngine() {
    engine = CibSevenTestEngine.create("receive-task-phase-zero");
  }

  @AfterClass
  public static void closeEngine() {
    engine.close();
  }

  @Test
  public void directMessageSubscriptionIsPublicConsumableAndCompletesProcess()
      throws Exception {
    try (var deployment = ProbeDeployment.open(engine)) {
      var processInstance =
          engine.getRuntimeService().startProcessInstanceByKey(PROCESS_ID);
      var processInstanceId = processInstance.getId();

      assertEquals(1, runningProcessCount(processInstanceId));
      var subscription = oneMessageSubscription(processInstanceId);
      assertEquals(RECEIVE_TASK_ID, subscription.getActivityId());
      assertEquals(MESSAGE_NAME, subscription.getEventName());
      assertEquals(processInstanceId, subscription.getProcessInstanceId());
      assertNotNull(subscription.getExecutionId());

      engine
          .getRuntimeService()
          .messageEventReceived(
              subscription.getEventName(), subscription.getExecutionId());

      assertEquals(0, messageSubscriptionCount(processInstanceId));
      assertEquals(0, runningProcessCount(processInstanceId));
    }
  }

  private static EventSubscription oneMessageSubscription(
      String processInstanceId) {
    assertEquals(1, messageSubscriptionCount(processInstanceId));
    return engine
        .getRuntimeService()
        .createEventSubscriptionQuery()
        .processInstanceId(processInstanceId)
        .eventType("message")
        .singleResult();
  }

  private static long messageSubscriptionCount(String processInstanceId) {
    return engine
        .getRuntimeService()
        .createEventSubscriptionQuery()
        .processInstanceId(processInstanceId)
        .eventType("message")
        .count();
  }

  private static long runningProcessCount(String processInstanceId) {
    return engine
        .getRuntimeService()
        .createProcessInstanceQuery()
        .processInstanceId(processInstanceId)
        .count();
  }

  private static String readResource() throws IOException {
    return Files.readString(RESOURCE);
  }

  private record ProbeDeployment(ProcessEngine owner, String deploymentId)
      implements AutoCloseable {

    private static ProbeDeployment open(ProcessEngine engine)
        throws IOException {
      var deployment =
          engine
              .getRepositoryService()
              .createDeployment()
              .addString("message-addressed-receive-task-phase-zero.bpmn", readResource())
              .deploy();
      return new ProbeDeployment(engine, deployment.getId());
    }

    @Override
    public void close() {
      owner
          .getRepositoryService()
          .deleteDeployment(deploymentId, true, true, true);
    }
  }
}
