package org.bpmnlean.cibseven;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import org.cibseven.bpm.engine.ProcessEngine;
import org.cibseven.bpm.engine.delegate.JavaDelegate;
import org.junit.Test;

/**
 * Calibrates the Exclusive choice arity proposal's widening of `CIB-AGR-0006` (`XCA-ORDER-01`, `XCA-DEFAULT-01`) on the
 * retained complaint handling model: a three-condition Choice and a one-condition Choice, each with a default, over the
 * four schedules of *Route complaint*. CIB does not execute the project's Simple Boolean v1 conditions, so each condition
 * is rendered as JUEL under `CIB-CFG-0005` before deployment; the probe compares which task or job each Choice selects
 * in declaration order, never condition truth. Expected values are built here from the proposal's witness-model account,
 * never read from a target result.
 */
public final class CibSevenExclusiveChoiceArityProbeTest {
  private static final Path MODEL = Path.of("../..").toAbsolutePath().normalize()
      .resolve("scenarios/exclusive-choice-arity/complaint-handling.bpmn");
  private static final Pattern STRING_EQUALS = Pattern.compile("stringEquals\\((\\w+),\"([^\"]*)\"\\)");
  private static final String SIMPLE_BOOLEAN = " expressionLanguage=\"urn:bpmn-lean:expression:simple-boolean:v1\"";
  private static final String PROCESS = "Process_ComplaintHandling";

  @Test
  public void anUrgentBillingComplaintSelectsTheFirstOfTwoTrueCandidates() throws Exception {
    routesToTask("billing", "urgent", "EscalateToSupervisor");
  }

  @Test
  public void aBillingComplaintAloneSelectsTheMiddleCandidate() throws Exception {
    routesToTask("billing", "normal", "CorrectInvoice");
  }

  @Test
  public void aProductComplaintTakesBothDefaultsAfterEveryCandidateIsFalse() throws Exception {
    routesToTask("product", "normal", "AnswerCustomer");
  }

  @Test
  public void aDeliveryComplaintReshipsAfterTwoFalseCandidatesThenConfirmsDelivery() throws Exception {
    var arguments = new HashMap<String, Object>();
    JavaDelegate reshipOrder = execution -> {
      arguments.putAll(execution.getVariablesLocal());
      execution.setVariableLocal("tracking", "TRK-42");
    };
    try (var session = new Session(Map.of("reshipOrder", reshipOrder))) {
      var complaint = session.classified("delivery", "normal");
      assertEquals(List.of(), session.openTasks(complaint));
      var job = session.engine.getManagementService().createJobQuery().processInstanceId(complaint).singleResult();
      assertNotNull("Reship order waits as its asynchronous continuation", job);
      session.engine.getManagementService().executeJob(job.getId());
      assertEquals(Map.of("order", "ORD-7"), arguments);
      // XCA-ORDER-01 for the one-condition Choice: its only candidate is true.
      assertEquals(List.of("ConfirmDelivery"), session.openTasks(complaint));
      session.completeOnly(complaint, "ConfirmDelivery");
      session.assertEnded(complaint, List.of("ConfirmDelivery", "ReshipOrder"));
    }
  }

  /** Classifies the complaint, expects `routed` to open alone, completes it and expects the Process to end there. */
  private static void routesToTask(String category, String priority, String routed) throws Exception {
    try (var session = new Session(Map.of())) {
      var complaint = session.classified(category, priority);
      assertEquals(List.of(routed), session.openTasks(complaint));
      session.completeOnly(complaint, routed);
      // XCA-DEFAULT-01 for the one-condition Choice: a non-delivery complaint takes its default.
      session.assertEnded(complaint, List.of(routed));
    }
  }

  /** The model with each Simple Boolean v1 `stringEquals(n,"v")` condition rendered as the JUEL `${n == "v"}`. */
  private static String juelRendition() throws Exception {
    var source = Files.readString(MODEL);
    assertEquals(4, STRING_EQUALS.matcher(source).results().count());
    return STRING_EQUALS.matcher(source.replace(SIMPLE_BOOLEAN, "")).replaceAll("\\${$1 == \"$2\"}");
  }

  private static final class Session implements AutoCloseable {
    final ProcessEngine engine;
    final String deployment;

    Session(Map<Object, Object> beans) throws Exception {
      engine = CibSevenTestEngine.create("exclusive-choice-arity", configuration -> configuration.setBeans(beans));
      try {
        deployment = engine.getRepositoryService().createDeployment()
            .addString("complaint-handling.bpmn", juelRendition()).deploy().getId();
      } catch (Exception | Error failure) {
        engine.close();
        throw failure;
      }
    }

    /** Starts a complaint for order ORD-7 and completes *Classify complaint*; every name a Choice reads is then written. */
    String classified(String category, String priority) {
      var complaint = engine.getRuntimeService()
          .startProcessInstanceByKey(PROCESS, new HashMap<>(Map.of("orderNumber", "ORD-7"))).getId();
      assertEquals(List.of("ClassifyComplaint"), openTasks(complaint));
      completeOnly(complaint, "ClassifyComplaint", Map.of("category", category, "priority", priority));
      return complaint;
    }

    List<String> openTasks(String instance) {
      return engine.getTaskService().createTaskQuery().processInstanceId(instance).list().stream()
          .map(task -> task.getTaskDefinitionKey()).sorted().toList();
    }

    void completeOnly(String instance, String element) {
      completeOnly(instance, element, Map.of());
    }

    void completeOnly(String instance, String element, Map<String, Object> variables) {
      var task = engine.getTaskService().createTaskQuery().processInstanceId(instance).taskDefinitionKey(element)
          .singleResult();
      assertNotNull(element, task);
      engine.getTaskService().complete(task.getId(), new HashMap<>(variables));
    }

    /** The Process ended, and of the four branch targets and *Confirm delivery* exactly `reached` were activated. */
    void assertEnded(String instance, List<String> reached) {
      assertEquals(0, engine.getRuntimeService().createProcessInstanceQuery().processInstanceId(instance).count());
      var activated = engine.getHistoryService().createHistoricActivityInstanceQuery().processInstanceId(instance).list()
          .stream().map(activity -> activity.getActivityId())
          .filter(List.of("EscalateToSupervisor", "CorrectInvoice", "ReshipOrder", "AnswerCustomer", "ConfirmDelivery")::contains)
          .sorted().toList();
      assertEquals(reached, activated);
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
