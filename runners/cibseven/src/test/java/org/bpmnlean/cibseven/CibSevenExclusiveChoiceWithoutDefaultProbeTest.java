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
  public void anUrgentTravelExpenseTakesTheFirstTrueRouteToTheUrgentReview() throws Exception {
    try (var session = new Session("expense-routing", "reimburseClaimant", 5)) {
      var expense = session.start("Process_ExpenseRouting", expense("travel", "urgent", "bank"));
      session.assertOnlyOpenTask(expense, "ReviewUrgently");
    }
  }

  @Test
  public void aCateringExpenseMatchesNoRouteAndLeavesNoInstance() throws Exception {
    try (var session = new Session("expense-routing", "reimburseClaimant", 5)) {
      var failure = assertThrows(ProcessEngineException.class,
          () -> session.start("Process_ExpenseRouting", expense("catering", "normal", "bank")));
      assertNoFlowSelected(failure, "RouteExpense");
      assertEquals(0, session.engine.getRuntimeService().createProcessInstanceQuery().count());
      assertEquals(0, session.engine.getHistoryService().createHistoricProcessInstanceQuery().count());
      assertEquals(0, session.engine.getHistoryService().createHistoricActivityInstanceQuery().count());
    }
  }

  @Test
  public void aCashPayoutMatchesNoPayoutRouteAndLeavesTheReviewOpen() throws Exception {
    try (var session = new Session("expense-routing", "reimburseClaimant", 5)) {
      var expense = session.start("Process_ExpenseRouting", expense("travel", "normal", "cash"));
      var review = session.task(expense, "ReviewTravel");
      assertNoFlowSelected(assertThrows(ProcessEngineException.class,
          () -> session.engine.getTaskService().complete(review)), "PayOut");
      assertEquals(review, session.task(expense, "ReviewTravel"));
      assertEquals(expense("travel", "normal", "cash"), session.engine.getRuntimeService().getVariables(expense));
    }
  }

  @Test
  public void aBankPayoutArmsTheReimbursementWithTheClaimant() throws Exception {
    try (var session = new Session("expense-routing", "reimburseClaimant", 5)) {
      var expense = session.start("Process_ExpenseRouting", expense("equipment", "normal", "bank"));
      session.engine.getTaskService().complete(session.task(expense, "ReviewEquipment"));
      session.runOnlyJob(expense, "ReimburseClaimant");
      assertEquals(List.of("Ada"), session.received);
      session.assertEnded(expense);
    }
  }

  @Test
  public void aMediumSeverityMatchesNoRouteAndLeavesTheTriageOpenUntilItIsHigh() throws Exception {
    try (var session = new Session("ticket-triage", "autoCloseTicket", 2)) {
      var ticket = session.start("Process_TicketTriage", Map.of("ticket", "T-9"));
      var triage = session.task(ticket, "TriageTicket");
      var failure = assertThrows(ProcessEngineException.class,
          () -> session.engine.getTaskService().complete(triage, Map.of("severity", "medium")));
      assertNoFlowSelected(failure, "RouteBySeverity");
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
    try (var session = new Session("ticket-triage", "autoCloseTicket", 2)) {
      var ticket = session.start("Process_TicketTriage", Map.of("ticket", "T-9"));
      session.engine.getTaskService().complete(session.task(ticket, "TriageTicket"), Map.of("severity", "low"));
      session.runOnlyJob(ticket, "AutoClose");
      assertEquals(List.of("T-9"), session.received);
      session.assertEnded(ticket);
    }
  }

  private static Map<String, Object> expense(String category, String priority, String payout) {
    return Map.of("category", category, "claimant", "Ada", "payout", payout, "priority", priority);
  }

  /** `ENGINE-02004`, `BpmnBehaviorLogger#stuckExecutionException`, naming the Choice that selected no flow. */
  private static void assertNoFlowSelected(ProcessEngineException failure, String choice) {
    assertTrue(failure.getMessage(), failure.getMessage().contains(NO_FLOW_SELECTED));
    assertTrue(failure.getMessage(), failure.getMessage().contains("'" + choice + "'"));
  }

  private static final class Session implements AutoCloseable {
    final ProcessEngine engine;
    final String deployment;
    /** The one input each handler invocation saw, the model's only declared handler input. */
    final List<Object> received = new ArrayList<>();

    Session(String model, String handler, int conditions) throws Exception {
      JavaDelegate delegate = execution -> {
        assertEquals(1, execution.getVariableNamesLocal().size());
        received.add(execution.getVariableLocal(execution.getVariableNamesLocal().iterator().next()));
      };
      engine = CibSevenTestEngine.create("exclusive-choice-without-default-" + model,
          configuration -> configuration.setBeans(Map.<Object, Object>of(handler, delegate)));
      try {
        deployment = engine.getRepositoryService().createDeployment()
            .addString(model + ".bpmn", juelRendition(model, conditions)).deploy().getId();
      } catch (Exception | Error failure) {
        engine.close();
        throw failure;
      }
    }

    /** The model with each `stringEquals(n,"v")` condition rendered as the JUEL `${n == "v"}`, exactly `conditions` of them. */
    private static String juelRendition(String model, int conditions) throws Exception {
      var source = Files.readString(MODELS.resolve(model + ".bpmn"));
      assertEquals(conditions, STRING_EQUALS.matcher(source).results().count());
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

    /** The handler has not run: the instance's only job is the element's asynchronous continuation; run it. */
    void runOnlyJob(String instance, String element) {
      assertEquals(0, engine.getTaskService().createTaskQuery().processInstanceId(instance).count());
      var job = engine.getManagementService().createJobQuery().processInstanceId(instance).singleResult();
      assertNotNull(element, job);
      assertEquals(element, engine.getManagementService().createJobQuery().processInstanceId(instance).activityId(element)
          .singleResult().getId(), job.getId());
      assertEquals(0, received.size());
      engine.getManagementService().executeJob(job.getId());
    }

    void assertEnded(String instance) {
      assertEquals(0, engine.getRuntimeService().createProcessInstanceQuery().processInstanceId(instance).count());
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
