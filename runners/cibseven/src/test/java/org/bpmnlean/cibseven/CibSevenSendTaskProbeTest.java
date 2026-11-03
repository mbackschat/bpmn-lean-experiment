package org.bpmnlean.cibseven;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.cibseven.bpm.engine.ProcessEngine;
import org.cibseven.bpm.engine.delegate.JavaDelegate;
import org.junit.Test;

/**
 * Calibrates the Send Task proposal's `CIB-EXT-0023` (`SEND-ADMIT-01`, `SEND-EFFECT-01`, `SEND-DATA-01`) on its two witness
 * models: CIB Seven `2.2.0` reads a Send Task carrying `camunda:delegateExpression` as a Service Task
 * (`BpmnParse.parseSendTask` delegating to `parseServiceTaskLike`, BpmnParse.java:2505-2541), so with
 * `camunda:asyncBefore` each activation is one job, then one delegate invocation that sees exactly the evaluated input
 * parameters as locals, and one historic activity instance of type `sendTask`. The probe runs every continuation job
 * before the next command, the schedule within `CIB-EXT-0015`'s boundary. Expected values are built here from the
 * proposal's witness-model account, never read from a target result.
 */
public final class CibSevenSendTaskProbeTest {
  private static final Path MODELS = Path.of("../..").toAbsolutePath().normalize().resolve("scenarios/send-task");
  private static final String SEND_TASK = "sendTask";

  @Test
  public void thePackedOrderSendsItsNoticeToTheCustomerWithTheOrderAsCorrelationKey() throws Exception {
    try (var session = new Session("shipping-notice", "sendShippingNotice", List.of("channel", "correlationId", "recipient"))) {
      var order = Map.<String, Object>of("customerEmail", "ada@example.org", "order", "A-17");
      var instance = session.start("Process_ShippingNotice", order);
      session.complete(instance, "PackOrder");
      session.assertWaitsOnJob(instance, "SendShippingNotice");
      assertEquals(order, session.engine.getRuntimeService().getVariables(instance));

      session.runJob(instance, "SendShippingNotice");
      assertEquals(List.of(Map.of("channel", "email", "correlationId", "A-17", "recipient", "ada@example.org")),
          session.received);
      session.assertSent(instance, "SendShippingNotice");
      session.assertEnded(instance);
    }
  }

  @Test
  public void anAssessmentBeforeTheAcknowledgementLeavesTheJoinToTheSend() throws Exception {
    try (var session = new Session("claim-acknowledgement", "acknowledgeClaim", List.of("claim"))) {
      var instance = session.start("Process_ClaimAcknowledgement", Map.of("claim", "CL-31"));
      session.assertWaitsOnJob(instance, "AcknowledgeClaim");
      session.complete(instance, "AssessClaim");
      session.assertWaitsOnJob(instance, "AcknowledgeClaim");

      session.runJob(instance, "AcknowledgeClaim");
      session.assertSettledAfterOneAcknowledgement(instance);
    }
  }

  @Test
  public void anAcknowledgementBeforeTheAssessmentLeavesTheJoinToTheAssessment() throws Exception {
    try (var session = new Session("claim-acknowledgement", "acknowledgeClaim", List.of("claim"))) {
      var instance = session.start("Process_ClaimAcknowledgement", Map.of("claim", "CL-31"));
      session.runJob(instance, "AcknowledgeClaim");
      session.assertSent(instance, "AcknowledgeClaim");
      session.assertOnlyOpenTask(instance, "AssessClaim");

      session.complete(instance, "AssessClaim");
      session.assertSettledAfterOneAcknowledgement(instance);
    }
  }

  private static final class Session implements AutoCloseable {
    final ProcessEngine engine;
    final String deployment;
    /** The locals each delegate invocation saw, keyed by the model's declared input names. */
    final List<Map<String, Object>> received = new ArrayList<>();

    Session(String model, String handler, List<String> inputs) throws Exception {
      JavaDelegate delegate = execution -> {
        var locals = new HashMap<String, Object>();
        for (var input : inputs) locals.put(input, execution.getVariableLocal(input));
        assertEquals(inputs.size(), execution.getVariableNamesLocal().size());
        received.add(locals);
      };
      engine = CibSevenTestEngine.create("send-task-" + model,
          configuration -> configuration.setBeans(Map.<Object, Object>of(handler, delegate)));
      try {
        deployment = engine.getRepositoryService().createDeployment()
            .addString(model + ".bpmn", Files.readString(MODELS.resolve(model + ".bpmn"))).deploy().getId();
      } catch (Exception | Error failure) {
        engine.close();
        throw failure;
      }
    }

    String start(String processId, Map<String, Object> variables) {
      return engine.getRuntimeService().startProcessInstanceByKey(processId, new HashMap<>(variables)).getId();
    }

    /** The send has not run: its one asynchronous continuation is the instance's only job, its activity not yet entered. */
    void assertWaitsOnJob(String instance, String element) {
      var job = engine.getManagementService().createJobQuery().processInstanceId(instance).singleResult();
      assertNotNull(element, job);
      assertEquals(element, engine.getManagementService().createJobQuery().processInstanceId(instance)
          .activityId(element).singleResult().getId(), job.getId());
      assertEquals(element, 0, received.size());
    }

    void runJob(String instance, String element) {
      var job = engine.getManagementService().createJobQuery().processInstanceId(instance).activityId(element)
          .singleResult();
      assertNotNull(element, job);
      engine.getManagementService().executeJob(job.getId());
    }

    /** One ended historic activity instance of type `sendTask`, no job left for it and no task entity ever. */
    void assertSent(String instance, String element) {
      var activations = engine.getHistoryService().createHistoricActivityInstanceQuery().processInstanceId(instance)
          .activityId(element).list();
      assertEquals(element, 1, activations.size());
      assertEquals(element, SEND_TASK, activations.get(0).getActivityType());
      assertNotNull(element, activations.get(0).getEndTime());
      assertEquals(element, 0, engine.getManagementService().createJobQuery().processInstanceId(instance)
          .activityId(element).count());
      assertEquals(element, 0, engine.getHistoryService().createHistoricTaskInstanceQuery().processInstanceId(instance)
          .taskDefinitionKey(element).count());
    }

    /** The acknowledgement ran once with the claim, the join fired, and no input leaked into the Process variables. */
    void assertSettledAfterOneAcknowledgement(String instance) {
      assertEquals(List.of(Map.of("claim", "CL-31")), received);
      assertSent(instance, "AcknowledgeClaim");
      assertOnlyOpenTask(instance, "SettleClaim");
      assertEquals(Map.of("claim", "CL-31"), engine.getRuntimeService().getVariables(instance));
      assertNull(engine.getManagementService().createJobQuery().processInstanceId(instance).singleResult());
      complete(instance, "SettleClaim");
      assertEnded(instance);
    }

    void complete(String instance, String element) {
      var task = engine.getTaskService().createTaskQuery().processInstanceId(instance).taskDefinitionKey(element)
          .singleResult();
      assertNotNull(element, task);
      engine.getTaskService().complete(task.getId());
    }

    void assertOnlyOpenTask(String instance, String element) {
      var tasks = engine.getTaskService().createTaskQuery().processInstanceId(instance).list();
      assertEquals(1, tasks.size());
      assertEquals(element, tasks.get(0).getTaskDefinitionKey());
    }

    void assertEnded(String instance) {
      assertEquals(0, engine.getRuntimeService().createProcessInstanceQuery().processInstanceId(instance).count());
    }

    @Override
    public void close() {
      try {
        engine.getRepositoryService().deleteDeployment(deployment, true, true, true);
      } finally {
        engine.close();
      }
    }
  }
}
