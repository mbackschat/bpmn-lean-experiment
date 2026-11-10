package org.bpmnlean.cibseven;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertThrows;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import org.cibseven.bpm.engine.ProcessEngine;
import org.cibseven.bpm.engine.ProcessEngineException;
import org.cibseven.bpm.engine.delegate.JavaDelegate;
import org.cibseven.bpm.engine.history.HistoricActivityInstance;
import org.junit.Test;

/**
 * Calibrates the scope re-entry specification's widening of `CIB-EXT-0020` and `CIB-EXT-0021` from one activation to each
 * activation (`SRE-FRESH-01`, `SRE-INIT-01`, `SRE-RETAIN-01`, `SRE-STALE-01`, `SRE-OUTPUT-01`) on the two retained
 * models. Each retained model is deployed as it is, its conditions core JUEL
 * under `CIB-CFG-0011`; the probe compares re-entry, frames and identities, never condition truth.
 * The complaint handling tests calibrate the Exclusive choice arity specification's widening of `CIB-AGR-0006`
 * (`XCA-ORDER-01`, `XCA-DEFAULT-01`): a three-condition and a one-condition Choice, each with a default, over the four
 * schedules of *Route complaint*, compared by the task or job each Choice selects in declaration order. The travel request
 * tests calibrate the None End fan-in specification's `CIB-AGR-0015` (`NEF-END-01`): each of three journeys reaches *Request
 * closed* on a different incoming flow, and the token ends there alone, with no join. Expected values are built here from
 * the proposals' witness-model accounts, never read from a target result.
 */
public final class CibSevenScopeReentryProbeTest {
  private static final Path PROJECT_ROOT = Path.of("../..").toAbsolutePath().normalize();
  private static final Path MODELS = PROJECT_ROOT.resolve("scenarios/scope-reentry");
  private static final Path ARITY_MODELS = PROJECT_ROOT.resolve("scenarios/exclusive-choice-arity");
  private static final Path FAN_IN_MODELS = PROJECT_ROOT.resolve("scenarios/none-end-fan-in");
  private static final Pattern JUEL_EQUALS = Pattern.compile("\\$\\{\\w+ == '[^']*'\\}");

  @Test
  public void eachAssessmentStartsFromTheClaimSummaryAndTheStaleInspectionIsRefused() throws Exception {
    var arguments = new LinkedHashMap<String, Map<String, Object>>();
    var quotes = List.of("1200", "800").iterator();
    JavaDelegate priceRepair = execution -> {
      arguments.put("PriceRepair#" + (arguments.size() + 1), new HashMap<>(execution.getVariablesLocal()));
      execution.setVariableLocal("quote", quotes.next());
    };
    try (var session = new Session("claim-rework", Map.of("priceRepair", priceRepair))) {
      var claim = session.start("Process_ClaimRework", Map.of("claimSummary", "hail damage"));
      var first = session.task(claim, "InspectDamage");
      assertEquals(Map.of("decision", "pending", "notes", "hail damage"), session.locals(first));
      session.engine.getTaskService().complete(first, Map.of("decision", "rework", "notes", "photos missing"));
      session.runJob(claim);
      assertEquals(Map.of("damage", "photos missing"), arguments.get("PriceRepair#1"));

      var second = session.task(claim, "InspectDamage");
      assertNotEquals(first, second);
      assertEquals(Map.of("decision", "pending", "notes", "hail damage"), session.locals(second));
      assertEquals(Map.of("assessment", "rework", "claimSummary", "hail damage", "repairQuote", "1200"),
          session.processVariables(claim));
      assertThrows(ProcessEngineException.class,
          () -> session.engine.getTaskService().complete(first, Map.of("decision", "approve")));
      assertEquals(Map.of("decision", "pending", "notes", "hail damage"), session.locals(second));

      session.engine.getTaskService().complete(second, Map.of("decision", "approve"));
      session.runJob(claim);
      assertEquals(Map.of("damage", "hail damage"), arguments.get("PriceRepair#2"));
      assertEquals(Map.of("assessment", "approve", "claimSummary", "hail damage", "repairQuote", "800"),
          session.processVariables(claim));
      session.engine.getTaskService().complete(session.task(claim, "ApproveSettlement"));
      session.assertEnded(claim, Map.of("assessment", "approve", "claimSummary", "hail damage", "repairQuote", "800"));
      for (var element : List.of("AssessClaim", "InspectDamage", "PriceRepair")) {
        session.assertActivatedTwiceDistinctly(claim, element);
      }
    }
  }

  @Test
  public void eachRevisionInvokesAFreshLegalReviewAndTheStaleVerdictIsRefused() throws Exception {
    var filed = new LinkedHashMap<String, Map<String, Object>>();
    JavaDelegate fileContract = execution -> filed.put("FileContract", new HashMap<>(execution.getVariablesLocal()));
    try (var session = new Session("contract-revision", Map.of("fileContract", fileContract))) {
      var contract = session.start("Process_ContractRevision", Map.of("contractText", "v1"));
      var firstEdit = session.task(contract, "EditDraft");
      assertEquals(Map.of("draft", "v1"), session.locals(firstEdit));
      session.engine.getTaskService().complete(firstEdit, Map.of("draft", "v2"));
      var firstReview = session.called(contract, 1);
      assertEquals(Map.of("text", "v2"), session.engine.getRuntimeService().getVariablesLocal(firstReview));
      var firstClauses = session.task(firstReview, "ReviewClauses");
      session.engine.getTaskService().complete(firstClauses, Map.of("verdict", "revise"));
      assertEquals(Map.of("contractText", "v2", "legalVerdict", "revise"), session.processVariables(contract));

      var secondEdit = session.task(contract, "EditDraft");
      assertNotEquals(firstEdit, secondEdit);
      assertEquals(Map.of("draft", "v2"), session.locals(secondEdit));
      session.engine.getTaskService().complete(secondEdit, Map.of("draft", "v3"));
      var secondReview = session.called(contract, 2);
      assertNotEquals(firstReview, secondReview);
      assertEquals(Map.of("text", "v3"), session.engine.getRuntimeService().getVariablesLocal(secondReview));
      assertThrows(ProcessEngineException.class,
          () -> session.engine.getTaskService().complete(firstClauses, Map.of("verdict", "sign")));
      assertEquals(Map.of("contractText", "v3", "legalVerdict", "revise"), session.processVariables(contract));

      session.engine.getTaskService().complete(session.task(secondReview, "ReviewClauses"), Map.of("verdict", "sign"));
      assertEquals(Map.of("contractText", "v3", "legalVerdict", "sign"), session.processVariables(contract));
      session.engine.getTaskService().complete(session.task(contract, "SignContract"));
      session.runJob(contract);
      assertEquals(Map.of("document", "v3"), filed.get("FileContract"));
      session.assertEnded(contract, Map.of("contractText", "v3", "legalVerdict", "sign"));
      for (var element : List.of("PrepareDraft", "EditDraft", "LegalReview")) {
        session.assertActivatedTwiceDistinctly(contract, element);
      }
    }
  }

  @Test
  public void anUrgentBillingComplaintSelectsTheFirstOfTwoTrueCandidates() throws Exception {
    complaintRoutesTo("billing", "urgent", "EscalateToSupervisor");
  }

  @Test
  public void aBillingComplaintAloneSelectsTheMiddleCandidate() throws Exception {
    complaintRoutesTo("billing", "normal", "CorrectInvoice");
  }

  @Test
  public void aProductComplaintTakesBothDefaultsAfterEveryCandidateIsFalse() throws Exception {
    complaintRoutesTo("product", "normal", "AnswerCustomer");
  }

  @Test
  public void aDeliveryComplaintReshipsAfterTwoFalseCandidatesThenConfirmsDelivery() throws Exception {
    var arguments = new HashMap<String, Object>();
    JavaDelegate reshipOrder = execution -> {
      arguments.putAll(execution.getVariablesLocal());
      execution.setVariableLocal("tracking", "TRK-42");
    };
    try (var session = new Session(ARITY_MODELS, "complaint-handling", 4, Map.of("reshipOrder", reshipOrder))) {
      var complaint = session.classifiedComplaint("delivery", "normal");
      // Route complaint's third candidate arms Reship order's asynchronous continuation and opens no task.
      assertEquals(0, session.engine.getTaskService().createTaskQuery().processInstanceId(complaint).count());
      session.runJob(complaint);
      assertEquals(Map.of("order", "ORD-7"), arguments);
      // XCA-ORDER-01 for the one-condition Choice: its only candidate is true.
      session.engine.getTaskService().complete(session.task(complaint, "ConfirmDelivery"));
      session.assertEnded(complaint, Map.of("category", "delivery", "orderNumber", "ORD-7", "priority", "normal",
          "trackingNumber", "TRK-42"));
      session.assertRouted(complaint, List.of("ConfirmDelivery", "ReshipOrder"));
    }
  }

  @Test
  public void aRejectedRequestEndsStraightFromTheChoice() throws Exception {
    try (var session = new Session(FAN_IN_MODELS, "travel-request", 2, Map.of())) {
      var request = session.assessedRequest("reject", "email");
      session.assertClosedOnceAfter(request, List.of(), Map.of("channel", "email", "decision", "reject", "traveller", "Ada"));
    }
  }

  @Test
  public void aPhoneRequestEndsAfterTheTravellerIsCalled() throws Exception {
    try (var session = new Session(FAN_IN_MODELS, "travel-request", 2, Map.of())) {
      var request = session.assessedRequest("approve", "phone");
      session.engine.getTaskService().complete(session.task(request, "CallTraveller"));
      session.assertClosedOnceAfter(request, List.of("CallTraveller"),
          Map.of("channel", "phone", "decision", "approve", "traveller", "Ada"));
    }
  }

  @Test
  public void aBookedRequestEndsAfterTheBookingResult() throws Exception {
    var arguments = new HashMap<String, Object>();
    JavaDelegate bookTravel = execution -> {
      arguments.putAll(execution.getVariablesLocal());
      execution.setVariableLocal("booking", "BK-9");
    };
    try (var session = new Session(FAN_IN_MODELS, "travel-request", 2, Map.of("bookTravel", bookTravel))) {
      var request = session.assessedRequest("approve", "email");
      session.runJob(request);
      assertEquals(Map.of("traveller", "Ada"), arguments);
      session.assertClosedOnceAfter(request, List.of("BookTravel"),
          Map.of("bookingNumber", "BK-9", "channel", "email", "decision", "approve", "traveller", "Ada"));
    }
  }

  /** Classifies a complaint, completes the one task `routed` opens and expects the Process to end without a follow-up. */
  private static void complaintRoutesTo(String category, String priority, String routed) throws Exception {
    try (var session = new Session(ARITY_MODELS, "complaint-handling", 4, Map.of())) {
      var complaint = session.classifiedComplaint(category, priority);
      session.engine.getTaskService().complete(session.task(complaint, routed));
      // XCA-DEFAULT-01 for the one-condition Choice: a complaint other than delivery takes its default.
      session.assertEnded(complaint, Map.of("category", category, "orderNumber", "ORD-7", "priority", priority));
      session.assertRouted(complaint, List.of(routed));
    }
  }

  /** The retained model's bytes, which hold exactly `conditions` core-JUEL equality conditions. */
  private static String retainedModel(Path directory, String model, int conditions) throws Exception {
    var source = Files.readString(directory.resolve(model + ".bpmn"));
    assertEquals(conditions, JUEL_EQUALS.matcher(source).results().count());
    return source;
  }

  private static final class Session implements AutoCloseable {
    final ProcessEngine engine;
    final String deployment;

    Session(String model, Map<Object, Object> beans) throws Exception {
      this(MODELS, model, 2, beans);
    }

    Session(Path directory, String model, int conditions, Map<Object, Object> beans) throws Exception {
      engine = CibSevenTestEngine.create("scope-reentry-" + model, configuration -> configuration.setBeans(beans));
      try {
        deployment = engine.getRepositoryService().createDeployment()
            .addString(model + ".bpmn", retainedModel(directory, model, conditions)).deploy().getId();
      } catch (Exception | Error failure) {
        engine.close();
        throw failure;
      }
    }

    String start(String processId, Map<String, Object> variables) {
      return engine.getRuntimeService().startProcessInstanceByKey(processId, new HashMap<>(variables)).getId();
    }

    /** Starts a complaint for order ORD-7 and classifies it, so every name a Choice reads is written before it. */
    String classifiedComplaint(String category, String priority) {
      var complaint = start("Process_ComplaintHandling", Map.of("orderNumber", "ORD-7"));
      engine.getTaskService().complete(task(complaint, "ClassifyComplaint"), Map.of("category", category, "priority", priority));
      return complaint;
    }

    /** Starts a request for traveller Ada and completes *Check request*, so both names *Route request* reads are written. */
    String assessedRequest(String decision, String channel) {
      var request = start("Process_TravelRequest", Map.of("traveller", "Ada"));
      engine.getTaskService().complete(task(request, "CheckRequest"), Map.of("decision", decision, "channel", channel));
      return request;
    }

    /**
     * The request ended with `expected` Process values after activating exactly `reached` of *Route request*'s two
     * Activity targets, and *Request closed* ran once: the arriving token ended alone, never waiting for another flow.
     */
    void assertClosedOnceAfter(String instance, List<String> reached, Map<String, Object> expected) {
      assertEnded(instance, expected);
      assertEquals(reached, List.of("BookTravel", "CallTraveller").stream()
          .filter(element -> !activations(instance, element).isEmpty()).toList());
      assertEquals(1, activations(instance, "RequestClosed").size());
    }

    /** Of the four branch targets of *Route complaint* and *Confirm delivery*, exactly `reached` were activated. */
    void assertRouted(String instance, List<String> reached) {
      var targets = List.of("AnswerCustomer", "ConfirmDelivery", "CorrectInvoice", "EscalateToSupervisor", "ReshipOrder");
      assertEquals(reached, targets.stream().filter(element -> !activations(instance, element).isEmpty()).toList());
    }

    /** The id of the one open task of `element`. */
    String task(String instance, String element) {
      var task = engine.getTaskService().createTaskQuery().processInstanceId(instance).taskDefinitionKey(element)
          .singleResult();
      assertNotNull(task);
      return task.getId();
    }

    /** The variables of the execution the task waits in, which is the enclosing Sub-Process scope's own execution. */
    Map<String, Object> locals(String task) {
      var execution = engine.getTaskService().createTaskQuery().taskId(task).singleResult().getExecutionId();
      return engine.getRuntimeService().getVariablesLocal(execution);
    }

    /** Runs the one open asynchronous continuation before the next command. */
    void runJob(String instance) {
      var job = engine.getManagementService().createJobQuery().processInstanceId(instance).singleResult();
      assertNotNull(job);
      engine.getManagementService().executeJob(job.getId());
    }

    /** The child instance that the `ordinal`-th activation of the caller's `LegalReview` Call started. */
    String called(String caller, int ordinal) {
      var calls = activations(caller, "LegalReview");
      assertEquals(ordinal, calls.size());
      var child = calls.get(ordinal - 1).getCalledProcessInstanceId();
      assertNotNull(child);
      return child;
    }

    List<HistoricActivityInstance> activations(String instance, String element) {
      return engine.getHistoryService().createHistoricActivityInstanceQuery().processInstanceId(instance)
          .activityId(element).orderPartiallyByOccurrence().asc().list();
    }

    void assertActivatedTwiceDistinctly(String instance, String element) {
      var activations = activations(instance, element);
      assertEquals(element, 2, activations.size());
      assertNotEquals(element, activations.get(0).getId(), activations.get(1).getId());
    }

    Map<String, Object> processVariables(String instance) {
      return engine.getRuntimeService().getVariablesLocal(instance);
    }

    /** The Process-scope variables at completion; Sub-Process locals have their own executions and are skipped. */
    void assertEnded(String instance, Map<String, Object> expected) {
      assertEquals(0, engine.getRuntimeService().createProcessInstanceQuery().processInstanceId(instance).count());
      var actual = new HashMap<String, Object>();
      for (var variable : engine.getHistoryService().createHistoricVariableInstanceQuery().processInstanceId(instance).list()) {
        if (variable.getExecutionId().equals(instance)) {
          actual.put(variable.getName(), variable.getValue());
        }
      }
      assertEquals(expected, actual);
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
