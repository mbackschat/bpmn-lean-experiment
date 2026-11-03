package org.bpmnlean.cibseven;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import org.cibseven.bpm.engine.ProcessEngine;
import org.cibseven.bpm.engine.ProcessEngineException;
import org.cibseven.bpm.engine.delegate.JavaDelegate;
import org.junit.Test;

/**
 * Calibrates the default-less Exclusive Choice account's `CIB-INT-0003` on its two witness models: CIB Seven `2.2.0`
 * (`ExclusiveGatewayActivityBehavior#doLeave`, pinned `5a45b47e`) takes the first true conditional flow in declaration
 * order and, when none holds and no default is declared, raises `ENGINE-02004`
 * (`BpmnBehaviorLogger#stuckExecutionException`), which aborts the engine command: a Start leaves no runtime or historic
 * Process instance, and a User Task completion leaves the task open with its values. CIB does not execute the project's
 * Simple Boolean v1 conditions, so each is rendered as JUEL under `CIB-CFG-0005`. Expected values are built here from the
 * account's journeys, never read from a target result.
 */
public final class CibSevenExclusiveChoiceWithoutDefaultProbeTest {
  private static final Path MODELS =
      Path.of("../..").toAbsolutePath().normalize().resolve("scenarios/exclusive-choice-without-default");
  private static final Pattern STRING_EQUALS = Pattern.compile("stringEquals\\((\\w+),\"([^\"]*)\"\\)");
  private static final String SIMPLE_BOOLEAN = " expressionLanguage=\"urn:bpmn-lean:expression:simple-boolean:v1\"";
  private static final String NO_FLOW_SELECTED = "ENGINE-02004";

  @Test
  public void aTravelExpenseOpensItsTravelReview() throws Exception {
    try (var session = new Session("expense-routing", "reimburseClaimant")) {
      var expense = session.start("Process_ExpenseRouting", Map.of("category", "travel", "claimant", "Ada"));
      session.assertOnlyOpenTask(expense, "ReviewTravel");
    }
  }

  @Test
  public void aCateringExpenseMatchesNoCategoryAndLeavesNoInstance() throws Exception {
    try (var session = new Session("expense-routing", "reimburseClaimant")) {
      var failure = assertThrows(ProcessEngineException.class,
          () -> session.start("Process_ExpenseRouting", Map.of("category", "catering", "claimant", "Ada")));
      assertTrue(failure.getMessage(), failure.getMessage().contains(NO_FLOW_SELECTED));
      assertTrue(failure.getMessage(), failure.getMessage().contains("'RouteByCategory'"));
      assertEquals(0, session.engine.getRuntimeService().createProcessInstanceQuery().count());
      assertEquals(0, session.engine.getHistoryService().createHistoricProcessInstanceQuery().count());
      assertEquals(0, session.engine.getHistoryService().createHistoricActivityInstanceQuery().count());
    }
  }

  @Test
  public void aMediumSeverityMatchesNoRouteAndLeavesTheTriageOpenUntilItIsHigh() throws Exception {
    try (var session = new Session("ticket-triage", "autoCloseTicket")) {
      var ticket = session.start("Process_TicketTriage", Map.of("ticket", "T-9"));
      var triage = session.task(ticket, "TriageTicket");
      var failure = assertThrows(ProcessEngineException.class,
          () -> session.engine.getTaskService().complete(triage, Map.of("severity", "medium")));
      assertTrue(failure.getMessage(), failure.getMessage().contains(NO_FLOW_SELECTED));
      assertTrue(failure.getMessage(), failure.getMessage().contains("'RouteBySeverity'"));
      assertEquals(triage, session.task(ticket, "TriageTicket"));
      assertEquals(Map.of("ticket", "T-9"), session.engine.getRuntimeService().getVariables(ticket));
      assertEquals("unassessed", session.engine.getTaskService().getVariable(triage, "severity"));

      session.engine.getTaskService().complete(triage, Map.of("severity", "high"));
      session.assertOnlyOpenTask(ticket, "Escalate");
      assertEquals(Map.of("severity", "high", "ticket", "T-9"), session.engine.getRuntimeService().getVariables(ticket));
    }
  }

  @Test
  public void aLowSeverityArmsTheAutoCloseWithTheTicket() throws Exception {
    try (var session = new Session("ticket-triage", "autoCloseTicket")) {
      var ticket = session.start("Process_TicketTriage", Map.of("ticket", "T-9"));
      session.engine.getTaskService().complete(session.task(ticket, "TriageTicket"), Map.of("severity", "low"));
      assertEquals(0, session.engine.getTaskService().createTaskQuery().processInstanceId(ticket).count());
      var job = session.engine.getManagementService().createJobQuery().processInstanceId(ticket).activityId("AutoClose")
          .singleResult();
      assertNotNull(job);
      assertEquals(0, session.received.size());

      session.engine.getManagementService().executeJob(job.getId());
      assertEquals(List.of("T-9"), session.received);
      assertEquals(0, session.engine.getRuntimeService().createProcessInstanceQuery().processInstanceId(ticket).count());
    }
  }

  private static final class Session implements AutoCloseable {
    final ProcessEngine engine;
    final String deployment;
    /** The one input each handler invocation saw, the model's only declared handler input. */
    final List<Object> received = new ArrayList<>();

    Session(String model, String handler) throws Exception {
      JavaDelegate delegate = execution -> {
        assertEquals(1, execution.getVariableNamesLocal().size());
        received.add(execution.getVariableLocal(execution.getVariableNamesLocal().iterator().next()));
      };
      engine = CibSevenTestEngine.create("exclusive-choice-without-default-" + model,
          configuration -> configuration.setBeans(Map.<Object, Object>of(handler, delegate)));
      try {
        deployment = engine.getRepositoryService().createDeployment()
            .addString(model + ".bpmn", juelRendition(model)).deploy().getId();
      } catch (Exception | Error failure) {
        engine.close();
        throw failure;
      }
    }

    /** The model with each `stringEquals(n,"v")` condition rendered as the JUEL `${n == "v"}`; each model has two. */
    private static String juelRendition(String model) throws Exception {
      var source = Files.readString(MODELS.resolve(model + ".bpmn"));
      assertEquals(2, STRING_EQUALS.matcher(source).results().count());
      return STRING_EQUALS.matcher(source.replace(SIMPLE_BOOLEAN, "")).replaceAll("\\${$1 == \"$2\"}");
    }

    String start(String processId, Map<String, Object> variables) {
      return engine.getRuntimeService().startProcessInstanceByKey(processId, new HashMap<>(variables)).getId();
    }

    String task(String instance, String element) {
      var task = engine.getTaskService().createTaskQuery().processInstanceId(instance).taskDefinitionKey(element)
          .singleResult();
      assertNotNull(element, task);
      return task.getId();
    }

    void assertOnlyOpenTask(String instance, String element) {
      var tasks = engine.getTaskService().createTaskQuery().processInstanceId(instance).list();
      assertEquals(1, tasks.size());
      assertEquals(element, tasks.get(0).getTaskDefinitionKey());
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
