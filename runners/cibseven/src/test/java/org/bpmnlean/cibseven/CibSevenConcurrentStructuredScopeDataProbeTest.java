package org.bpmnlean.cibseven;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;

import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.cibseven.bpm.engine.ProcessEngine;
import org.cibseven.bpm.engine.delegate.JavaDelegate;
import org.junit.Test;

/**
 * Calibrates the concurrent structured scope data proposal's widening of `CIB-EXT-0020`, `CIB-EXT-0021`, `CIB-OP-0010`
 * and `CIB-EXT-0015` (`CSSD-VALUE-01`, `CSSD-SNAPSHOT-01`, `CSSD-REUSE-01`) on the two retained models with Java
 * {@code Map} and {@code List} values. Each async-before continuation job runs before the next command, so a delegate's
 * call and completion commit together and the order fulfilment realizes the Pick items first order only: the probe
 * calibrates the arguments of that released-job schedule and does not drive a sibling command before a continuation
 * job, which the proposal's effect argument timing classifies. Delegate arguments, the caller's Process variables at the
 * scenarios' observation points and each called instance's variables are compared structurally; expected values are
 * built here from the proposal's witness-model account, never read from a target result.
 */
public final class CibSevenConcurrentStructuredScopeDataProbeTest {
  private static final Path PROJECT_ROOT = Path.of("../..").toAbsolutePath().normalize();
  private static final Path MODELS = PROJECT_ROOT.resolve("scenarios/concurrent-structured-scope-data");

  @Test
  public void eachBranchArmsWithItsOwnCopyAndTheJoinPublishesTheStructuredOutputs() throws Exception {
    var arguments = new LinkedHashMap<String, Map<String, Object>>();
    var beans = Map.<Object, Object>of(
        "pickItems", recording(arguments, "PickItems", "packed", Map.of("parcels", List.of(parcel(), parcel()))),
        "rateShipment", recording(arguments, "RateShipment", "quote", quote()),
        "notifyCustomer", recording(arguments, "NotifyCustomer", null, null));
    try (var session = new Session("order-fulfilment", beans)) {
      var instance = session.start("Process_OrderFulfilment", Map.of("order", order("Leeds")));
      session.runJob(instance);
      assertEquals(Map.of("instructions", "standard", "items", order("Leeds")), arguments.get("PickItems"));
      assertEquals(Map.of("order", order("Leeds")), session.processVariables(instance));

      session.complete(instance, "ReviewRoute", Map.of("instructions", fragile(), "shipment", order("York")));
      session.runJob(instance);
      assertEquals(Map.of("instructions", fragile(), "shipment", order("York")), arguments.get("RateShipment"));
      assertEquals(Map.of("carrierQuote", quote(), "order", order("Leeds")), session.processVariables(instance));

      session.runJob(instance);
      assertEquals(Map.of("quote", quote()), arguments.get("NotifyCustomer"));
      session.complete(instance, "ConfirmFulfilment", Map.of());
      session.complete(instance, "CloseOrder", Map.of());
      session.assertEnded(instance, Map.of("carrierQuote", quote(), "finalInstructions", fragile(), "order", order("Leeds"),
          "shippedParcels", Map.of("parcels", List.of(parcel(), parcel())), "shippingLabel", quote()));
    }
  }

  @Test
  public void eachExpertReviewsItsOwnDossierAndTheValuationBranchPublishesBeforeTheJoin() throws Exception {
    try (var session = new Session("loan-assessment", Map.of())) {
      var instance = session.start("Process_LoanAssessment", Map.of("application", application()));
      session.complete(instance, "PrepareValuation", Map.of("dossier", surveyed()));
      session.complete(instance, "PrepareCreditFile", Map.of());
      var credit = session.called(instance, "CreditExpertReview");
      var valuation = session.called(instance, "ValuationExpertReview");
      assertEquals(Map.of("case", application()), session.engine.getRuntimeService().getVariablesLocal(credit));
      assertEquals(Map.of("case", surveyed()), session.engine.getRuntimeService().getVariablesLocal(valuation));

      session.complete(valuation, "GiveOpinion", Map.of("opinion", opinion("sound")));
      assertEquals(Map.of("application", application(), "valuationFile", surveyed()), session.processVariables(instance));

      session.complete(credit, "GiveOpinion", Map.of("opinion", opinion("good")));
      session.complete(instance, "DecideLoan", Map.of());
      session.assertEnded(instance, Map.of("application", application(), "credit", opinion("good"),
          "creditFile", application(), "valuation", opinion("sound"), "valuationFile", surveyed()));
    }
  }

  /** A delegate that records its mapped inputs and, when `output` is named, sets that local result. */
  private static JavaDelegate recording(Map<String, Map<String, Object>> arguments, String element, String output,
      Object result) {
    return execution -> {
      arguments.put(element, new HashMap<>(execution.getVariablesLocal()));
      if (output != null) {
        execution.setVariableLocal(output, result);
      }
    };
  }

  /** A fresh copy each time, so no comparison can pass through a shared reference. */
  private static Map<String, Object> order(String city) {
    var line = Map.<String, Object>of("quantity", "2", "sku", "A-17");
    var shipTo = new HashMap<String, Object>();
    shipTo.put("city", city);
    shipTo.put("unit", null);
    return new HashMap<>(Map.of("discount", new BigDecimal("-1.25"), "lines", new ArrayList<>(List.of(line, line)),
        "shipTo", shipTo));
  }

  /** Review route's structured `instructions`, written over the declared String. */
  private static Map<String, Object> fragile() {
    return new HashMap<>(Map.of("handling", "fragile"));
  }

  private static Map<String, Object> parcel() {
    return Map.of("weight", new BigDecimal("1.525"));
  }

  private static Map<String, Object> quote() {
    return Map.of("carrier", "north", "price", new BigDecimal("12.49"));
  }

  private static Map<String, Object> application() {
    var applicant = new HashMap<String, Object>();
    applicant.put("employer", null);
    applicant.put("name", "Ada");
    var flat = Map.<String, Object>of("kind", "flat");
    return new HashMap<>(Map.of("amount", new BigDecimal("25000.75"), "applicant", applicant,
        "collateral", new ArrayList<>(List.of(flat, flat))));
  }

  private static Map<String, Object> surveyed() {
    var surveyed = application();
    surveyed.put("survey", "done");
    return surveyed;
  }

  private static Map<String, Object> opinion(String verdict) {
    var opinion = new HashMap<String, Object>();
    opinion.put("conditions", new ArrayList<>(List.of("insured", "insured")));
    opinion.put("notes", null);
    opinion.put("verdict", verdict);
    return opinion;
  }

  private static final class Session implements AutoCloseable {
    final ProcessEngine engine;
    final String deployment;

    Session(String model, Map<Object, Object> beans) throws Exception {
      engine = CibSevenTestEngine.create("concurrent-structured-scope-data-" + model,
          configuration -> configuration.setBeans(beans));
      try {
        deployment = engine.getRepositoryService().createDeployment()
            .addString(model + ".bpmn", Files.readString(MODELS.resolve(model + ".bpmn"))).deploy().getId();
      } catch (RuntimeException | Error failure) {
        engine.close();
        throw failure;
      }
    }

    String start(String processId, Map<String, Object> variables) {
      return engine.getRuntimeService().startProcessInstanceByKey(processId, new HashMap<>(variables)).getId();
    }

    void complete(String instance, String element, Map<String, Object> patch) {
      var task = engine.getTaskService().createTaskQuery().processInstanceId(instance).taskDefinitionKey(element)
          .singleResult();
      assertNotNull(task);
      engine.getTaskService().complete(task.getId(), new HashMap<>(patch));
    }

    /** Runs the one open asynchronous continuation before the next command. */
    void runJob(String instance) {
      var job = engine.getManagementService().createJobQuery().processInstanceId(instance).singleResult();
      assertNotNull(job);
      engine.getManagementService().executeJob(job.getId());
    }

    /** The child instance that the Call `callActivity` of `caller` started. */
    String called(String caller, String callActivity) {
      var call = engine.getHistoryService().createHistoricActivityInstanceQuery().processInstanceId(caller)
          .activityId(callActivity).singleResult();
      assertNotNull(call);
      assertNotNull(call.getCalledProcessInstanceId());
      return call.getCalledProcessInstanceId();
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
