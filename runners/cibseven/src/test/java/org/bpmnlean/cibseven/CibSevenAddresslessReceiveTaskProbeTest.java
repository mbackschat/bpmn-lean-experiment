package org.bpmnlean.cibseven;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertThrows;

import java.nio.file.Files;
import java.nio.file.Path;
import org.cibseven.bpm.engine.MismatchingMessageCorrelationException;
import org.cibseven.bpm.engine.ProcessEngine;
import org.cibseven.bpm.engine.ProcessEngineException;
import org.cibseven.bpm.engine.runtime.Execution;
import org.junit.AfterClass;
import org.junit.BeforeClass;
import org.junit.Test;

/**
 * Calibrates `CIB-INT-0004` on the parcel-handover witness of the addressless Receive Task account: CIB Seven
 * `2.2.0` declares no event subscription for a Receive Task without `messageRef` (`BpmnParse.parseReceiveTask`,
 * BpmnParse.java:2745-2757), waits there (`ReceiveTaskActivityBehavior#performExecution`) and leaves on an execution
 * signal (`#signal`, reached through `RuntimeService#signal(executionId)` and `SignalCmd`). Expected values are the
 * account's, never read from a target result.
 */
public final class CibSevenAddresslessReceiveTaskProbeTest {
  private static final Path RESOURCE = Path.of("../..").toAbsolutePath().normalize()
      .resolve("scenarios/addressless-receive-task/process.bpmn");
  private static final String PROCESS_ID = "Process_ParcelHandover";
  private static final String RECEIVE_TASK_ID = "ReceiveTask_AwaitCourierPickup";
  private static ProcessEngine engine;

  @BeforeClass
  public static void createEngine() {
    engine = CibSevenTestEngine.create("addressless-receive-task");
  }

  @AfterClass
  public static void closeEngine() {
    engine.close();
  }

  @Test
  public void theWaitHasNoSubscriptionAndOneExecutionSignalCompletesTheProcess() throws Exception {
    try (var deployment = Deployment.open()) {
      var instance = engine.getRuntimeService().startProcessInstanceByKey(PROCESS_ID).getId();

      assertEquals(0, eventSubscriptionCount(instance));
      var waiting = waitingExecution(instance);

      engine.getRuntimeService().signal(waiting.getId());

      assertEquals(0, runningProcessCount(instance));
      assertThrows(ProcessEngineException.class, () -> engine.getRuntimeService().signal(waiting.getId()));
    }
  }

  @Test
  public void noMessageCorrelationOrSignalBroadcastReachesTheWait() throws Exception {
    try (var deployment = Deployment.open()) {
      var instance = engine.getRuntimeService().startProcessInstanceByKey(PROCESS_ID).getId();
      var waiting = waitingExecution(instance);

      assertThrows(MismatchingMessageCorrelationException.class,
          () -> engine.getRuntimeService().correlateMessage(RECEIVE_TASK_ID));
      assertThrows(MismatchingMessageCorrelationException.class,
          () -> engine.getRuntimeService().correlateMessage("Await courier pickup"));
      engine.getRuntimeService().signalEventReceived(RECEIVE_TASK_ID);

      assertEquals(waiting.getId(), waitingExecution(instance).getId());
      assertEquals(1, runningProcessCount(instance));
    }
  }

  private static Execution waitingExecution(String instance) {
    var executions = engine.getRuntimeService().createExecutionQuery()
        .processInstanceId(instance).activityId(RECEIVE_TASK_ID).list();
    assertEquals(1, executions.size());
    return executions.get(0);
  }

  private static long eventSubscriptionCount(String instance) {
    return engine.getRuntimeService().createEventSubscriptionQuery().processInstanceId(instance).count();
  }

  private static long runningProcessCount(String instance) {
    return engine.getRuntimeService().createProcessInstanceQuery().processInstanceId(instance).count();
  }

  private record Deployment(String id) implements AutoCloseable {
    static Deployment open() throws Exception {
      return new Deployment(engine.getRepositoryService().createDeployment()
          .addString("addressless-receive-task.bpmn", Files.readString(RESOURCE)).deploy().getId());
    }

    @Override
    public void close() {
      engine.getRepositoryService().deleteDeployment(id, true, true, true);
    }
  }
}
