package org.bpmnlean.cibseven;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertThrows;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import org.cibseven.bpm.engine.MismatchingMessageCorrelationException;
import org.cibseven.bpm.engine.ProcessEngine;
import org.junit.AfterClass;
import org.junit.BeforeClass;
import org.junit.Test;

/**
 * Calibrates whether CIB Seven 2.2.0 executes the BPMN CorrelationKey and
 * Process CorrelationSubscription account or only its public API correlation criteria.
 */
public final class CibSevenMessageCorrelationPhaseZeroProbeTest {

  private static final Path PROJECT_ROOT =
      Path.of("../..").toAbsolutePath().normalize();
  private static final Path RESOURCE =
      PROJECT_ROOT.resolve(
          "runners/cibseven/src/test/resources/org/bpmnlean/cibseven/"
              + "CibSevenMessageCorrelationPhaseZeroProbeTest.bpmn");
  private static final String PROCESS_ID =
      "Process_MessageCorrelationPhaseZero";
  private static final String MESSAGE_NAME = "correlatedOrderMessage";
  private static final String PROPERTY_ID = "Property_OrderId";
  private static ProcessEngine engine;

  @BeforeClass
  public static void createEngine() {
    engine = CibSevenTestEngine.create("message-correlation-phase-zero");
  }

  @AfterClass
  public static void closeEngine() {
    engine.close();
  }

  @Test
  public void modeledCorrelationIsIgnoredUntilApiCriteriaAreSupplied()
      throws Exception {
    try (var deployment = ProbeDeployment.open(engine)) {
      var selected =
          engine
              .getRuntimeService()
              .startProcessInstanceByKey(
                  PROCESS_ID, Map.of(PROPERTY_ID, "order-42"));
      var other =
          engine
              .getRuntimeService()
              .startProcessInstanceByKey(
                  PROCESS_ID, Map.of(PROPERTY_ID, "order-99"));

      assertEquals(2, messageSubscriptionCount());

      assertThrows(
          MismatchingMessageCorrelationException.class,
          () ->
              engine
                  .getRuntimeService()
                  .createMessageCorrelation(MESSAGE_NAME)
                  .setVariable("payload", "order-42")
                  .correlate());

      assertEquals(1, runningProcessCount(selected.getId()));
      assertEquals(1, runningProcessCount(other.getId()));
      assertEquals(2, messageSubscriptionCount());

      engine
          .getRuntimeService()
          .createMessageCorrelation(MESSAGE_NAME)
          .processInstanceVariableEquals(PROPERTY_ID, "order-42")
          .setVariable("payload", "order-42")
          .correlate();

      assertEquals(0, runningProcessCount(selected.getId()));
      assertEquals(1, runningProcessCount(other.getId()));
      assertEquals(1, messageSubscriptionCount());
    }
  }

  private static long messageSubscriptionCount() {
    return engine
        .getRuntimeService()
        .createEventSubscriptionQuery()
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
              .addString("message-correlation-phase-zero.bpmn", readResource())
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
