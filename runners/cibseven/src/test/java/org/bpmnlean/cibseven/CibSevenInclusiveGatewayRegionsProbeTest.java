package org.bpmnlean.cibseven;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
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
 * Calibrates the Inclusive regions specification's `CIB-INT-0005` and `CIB-AGR-0017` on its two witness models. CIB Seven
 * `2.2.0` takes every non-default outgoing flow whose condition is absent or true and the default only when none is
 * (`InclusiveGatewayActivityBehavior.java:61-86`), and its join activates once no other execution of the scope can reach
 * it (`activatesGateway`, `canReachActivity`). On these acyclic structured root regions that is exactly when every
 * selected branch has arrived: the next User Task after the join opens with the last selected branch and not before.
 * CIB does not execute the project's Simple Boolean v1 conditions, so each condition is rendered as JUEL under
 * `CIB-CFG-0005` before deployment; the probe compares activations, never condition truth. Expected values are built here
 * from the proposal's witness-model account, never read from a target result.
 */
public final class CibSevenInclusiveGatewayRegionsProbeTest {
  private static final Path MODELS = Path.of("../..").toAbsolutePath().normalize()
      .resolve("scenarios/inclusive-gateway-regions");
  private static final Pattern STRING_EQUALS = Pattern.compile("stringEquals\\((\\w+),\"([^\"]*)\"\\)");
  private static final String SIMPLE_BOOLEAN = " expressionLanguage=\"urn:bpmn-lean:expression:simple-boolean:v1\"";
  private static final List<String> ALL_CHECKS = List.of("CollectTaxResidencyForm", "VerifySourceOfFunds");
  private static final List<String> ALL_EXTRAS =
      List.of("BookTechnician", "BookVenue", "ConfirmAttendeeList", "OrderCatering", "RentProjector");

  @Test
  public void everyTrueCheckRunsWithoutTheDefaultAndTheJoinWaitsForTheLastInBothOrders() throws Exception {
    for (var identityLast : List.of(false, true)) {
      try (var session = account()) {
        var instance = session.assess("online", "foreign", "high");
        session.assertOpenTasks(instance, ALL_CHECKS);
        session.assertJobs(instance, 1);
        session.assertActivations(instance, "StandardVerification", 0);
        if (identityLast) {
          session.complete(instance, "VerifySourceOfFunds");
          session.complete(instance, "CollectTaxResidencyForm");
          session.assertOpenTasks(instance, List.of());
          session.runJob(instance);
        } else {
          session.runJob(instance);
          session.complete(instance, "CollectTaxResidencyForm");
          session.assertOpenTasks(instance, List.of("VerifySourceOfFunds"));
          session.complete(instance, "VerifySourceOfFunds");
        }
        session.assertOpenTasks(instance, List.of("OpenAccount"));
        session.assertActivations(instance, "OpenAccount", 1);
        session.complete(instance, "OpenAccount");
        session.assertEnded(instance);
      }
    }
  }

  @Test
  public void aSingleTrueCheckIsTheJoinsOnlyInput() throws Exception {
    try (var session = account()) {
      var instance = session.assess("branch", "foreign", "low");
      session.assertOpenTasks(instance, List.of("CollectTaxResidencyForm"));
      session.assertJobs(instance, 0);
      session.complete(instance, "CollectTaxResidencyForm");
      session.assertOpenTasks(instance, List.of("OpenAccount"));
      session.assertActivations(instance, "StandardVerification", 0);
      session.assertActivations(instance, "EnhancedDueDiligence", 0);
    }
  }

  @Test
  public void noTrueCheckTakesTheDefaultAlone() throws Exception {
    try (var session = account()) {
      var instance = session.assess("branch", "domestic", "low");
      session.assertOpenTasks(instance, List.of("StandardVerification"));
      session.assertJobs(instance, 0);
      session.complete(instance, "StandardVerification");
      session.assertOpenTasks(instance, List.of("OpenAccount"));
    }
  }

  @Test
  public void dueDiligenceAndTheIdentityCheckRunWhileTheResidencyFormIsSkipped() throws Exception {
    try (var session = account()) {
      var instance = session.assess("online", "domestic", "high");
      session.assertOpenTasks(instance, List.of("VerifySourceOfFunds"));
      session.assertJobs(instance, 1);
      session.runJob(instance);
      session.assertOpenTasks(instance, List.of("VerifySourceOfFunds"));
      session.complete(instance, "VerifySourceOfFunds");
      session.assertOpenTasks(instance, List.of("OpenAccount"));
      session.assertActivations(instance, "CollectTaxResidencyForm", 0);
    }
  }

  @Test
  public void everyExtraJoinsBeforeTheEventIsReadyWhetherTheVenueIsBookedFirstOrLast() throws Exception {
    for (var venueFirst : List.of(true, false)) {
      try (var session = booking()) {
        var instance = session.quote("yes");
        session.assertOpenTasks(instance, ALL_EXTRAS);
        if (venueFirst) session.complete(instance, "BookVenue");
        for (var extra : List.of("OrderCatering", "RentProjector", "BookTechnician", "ConfirmAttendeeList")) {
          assertFalse(extra, session.openTasks(instance).contains("SendConfirmation"));
          session.complete(instance, extra);
        }
        session.assertOpenTasks(instance, venueFirst ? List.of("SendConfirmation") : List.of("BookVenue"));
        if (!venueFirst) {
          session.complete(instance, "BookVenue");
          session.assertOpenTasks(instance, List.of("SendConfirmation"));
        }
        session.complete(instance, "SendConfirmation");
        session.assertEnded(instance);
      }
    }
  }

  @Test
  public void theUnconditionedAttendeeListRunsAloneWhenNoExtraIsOrdered() throws Exception {
    try (var session = booking()) {
      var instance = session.quote("no");
      session.assertOpenTasks(instance, List.of("BookVenue", "ConfirmAttendeeList"));
      session.complete(instance, "ConfirmAttendeeList");
      session.assertOpenTasks(instance, List.of("BookVenue"));
      session.complete(instance, "BookVenue");
      session.assertOpenTasks(instance, List.of("SendConfirmation"));
      session.assertActivations(instance, "OrderCatering", 0);
      session.assertActivations(instance, "ArrangeTechnology", 0);
    }
  }

  private static Session account() throws Exception {
    return new Session("account-opening", 3, "verifyIdentityDocument", "identityCheck", "passed");
  }

  private static Session booking() throws Exception {
    return new Session("event-booking", 2, "quoteEvent", "quote", "Q-42");
  }

  private static final class Session implements AutoCloseable {
    final ProcessEngine engine;
    final String deployment;

    /** `handler` names the model's one Service Task delegate, which writes `result` as a local the output mapping reads. */
    Session(String model, int conditions, String handler, String result, String value) throws Exception {
      JavaDelegate delegate = execution -> execution.setVariableLocal(result, value);
      engine = CibSevenTestEngine.create("inclusive-gateway-regions-" + model,
          configuration -> configuration.setBeans(Map.<Object, Object>of(handler, delegate)));
      try {
        var source = Files.readString(MODELS.resolve(model + ".bpmn"));
        assertEquals(conditions, STRING_EQUALS.matcher(source).results().count());
        var rendition = STRING_EQUALS.matcher(source.replace(SIMPLE_BOOLEAN, "")).replaceAll("\\${$1 == \"$2\"}");
        deployment = engine.getRepositoryService().createDeployment().addString(model + ".bpmn", rendition).deploy()
            .getId();
      } catch (Exception | Error failure) {
        engine.close();
        throw failure;
      }
    }

    /** Starts an account opening and completes the assessment, whose output mappings return the three ratings. */
    String assess(String channel, String residency, String riskRating) {
      var instance = engine.getRuntimeService().startProcessInstanceByKey("Process_AccountOpening",
          new HashMap<>(Map.of("application", "ACC-1"))).getId();
      complete(instance, "AssessApplicantTask", Map.of("channel", channel, "residency", residency, "riskRating", riskRating));
      return instance;
    }

    /** Starts an event booking with both extras set to `extras` and runs the quote. */
    String quote(String extras) {
      var instance = engine.getRuntimeService().startProcessInstanceByKey("Process_EventBooking",
          new HashMap<>(Map.of("event", "Summer party", "catering", extras, "technology", extras))).getId();
      runJob(instance);
      return instance;
    }

    void runJob(String instance) {
      var job = engine.getManagementService().createJobQuery().processInstanceId(instance).singleResult();
      assertNotNull(job);
      engine.getManagementService().executeJob(job.getId());
    }

    void assertJobs(String instance, int count) {
      assertEquals(count, engine.getManagementService().createJobQuery().processInstanceId(instance).count());
    }

    void complete(String instance, String element) {
      complete(instance, element, Map.of());
    }

    void complete(String instance, String element, Map<String, Object> variables) {
      var task = engine.getTaskService().createTaskQuery().processInstanceId(instance).taskDefinitionKey(element)
          .singleResult();
      assertNotNull(element, task);
      engine.getTaskService().complete(task.getId(), new HashMap<>(variables));
    }

    List<String> openTasks(String instance) {
      return engine.getTaskService().createTaskQuery().processInstanceId(instance).list().stream()
          .map(task -> task.getTaskDefinitionKey()).sorted().toList();
    }

    /** Exactly `elements` are open as User Tasks, in any order. */
    void assertOpenTasks(String instance, List<String> elements) {
      assertEquals(elements.stream().sorted().toList(), openTasks(instance));
    }

    void assertActivations(String instance, String element, int count) {
      assertEquals(element, count, engine.getHistoryService().createHistoricActivityInstanceQuery()
          .processInstanceId(instance).activityId(element).count());
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
