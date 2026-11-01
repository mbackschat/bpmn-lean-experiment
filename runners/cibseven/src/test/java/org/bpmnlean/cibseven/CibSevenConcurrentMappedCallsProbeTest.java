package org.bpmnlean.cibseven;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;
import org.cibseven.bpm.engine.ProcessEngine;
import org.junit.Test;

/**
 * Calibrates the widening of `CIB-EXT-0021` and `CIB-EXT-0020` by the concurrent mapped Calls proposal
 * (`CMCALL-IN-01`, `CMCALL-OUT-01`, `CMCALL-ISOLATE-01`) on the two retained models, along the committed steps of their
 * three scenarios. Two live calls of one definition each hold only their own mapped input, and each output lands in its
 * own review's declared verdict, in both completion orders; on the travel request, both Calls invoked at Start copy an
 * absent traveller as a present null and the Budget check output reaches the Process, not Booking's local budget. The
 * caller's variables are asserted at the points the scenarios observe and each child instance's through CIB's query
 * API; refused steps are profile admission restrictions, so the probe does not drive them. No CIB child-instance or
 * task id is mapped to the project's derived called identity.
 */
public final class CibSevenConcurrentMappedCallsProbeTest {
  private static final Path PROJECT_ROOT = Path.of("../..").toAbsolutePath().normalize();
  private static final Path MODELS = PROJECT_ROOT.resolve("scenarios/concurrent-mapped-calls");

  @Test
  public void eachExpertReadsAndWritesItsOwnReviewWhenTheComplianceExpertAnswersFirst() throws Exception {
    try (var session = new Session("supplier-onboarding")) {
      var supplier = session.startSupplier();
      var financial = session.called(supplier, "FinancialExpertOpinion");
      var compliance = session.called(supplier, "ComplianceExpertOpinion");

      session.complete(compliance, "GiveExpertOpinion", Map.of("finding", "clear"));
      assertEquals("pending", session.local(supplier, "FinancialReview", "verdict"));
      assertEquals(Map.of("supplierName", "Acme", "complianceVerdict", "clear"), session.processVariables(supplier));

      session.complete(financial, "GiveExpertOpinion", Map.of("opinion", "solvent"));
      session.complete(supplier, "ApproveSupplier", Map.of());
      session.assertEnded(supplier,
          Map.of("supplierName", "Acme", "complianceVerdict", "clear", "financialVerdict", "solvent"));
    }
  }

  @Test
  public void aRevisedDossierStaysInItsCallAndOnlyTheFinancialVerdictReturnsFirst() throws Exception {
    try (var session = new Session("supplier-onboarding")) {
      var supplier = session.startSupplier();
      var financial = session.called(supplier, "FinancialExpertOpinion");
      var compliance = session.called(supplier, "ComplianceExpertOpinion");

      session.complete(financial, "GiveExpertOpinion", Map.of("dossier", "Acme revised", "opinion", "solvent"));
      assertEquals("pending", session.local(supplier, "ComplianceReview", "verdict"));
      assertEquals(Map.of("supplierName", "Acme", "financialVerdict", "solvent"), session.processVariables(supplier));

      session.complete(compliance, "GiveExpertOpinion", Map.of("finding", "clear"));
      session.complete(supplier, "ApproveSupplier", Map.of());
      session.assertEnded(supplier,
          Map.of("supplierName", "Acme", "complianceVerdict", "clear", "financialVerdict", "solvent"));
    }
  }

  @Test
  public void bothChecksStartAtOnceAndTheBudgetOutputBypassesBookingsLocal() throws Exception {
    try (var session = new Session("travel-request")) {
      var travel = session.engine.getRuntimeService()
          .startProcessInstanceByKey("Process_TravelRequest", Map.of("approvedBudget", "1200")).getId();
      var budget = session.called(travel, "BudgetCheck");
      var visa = session.called(travel, "VisaCheck");
      var absentTraveller = new HashMap<String, Object>();
      absentTraveller.put("traveller", null);
      assertEquals(absentTraveller, session.engine.getRuntimeService().getVariablesLocal(budget));
      assertEquals(absentTraveller, session.engine.getRuntimeService().getVariablesLocal(visa));
      assertEquals("1200", session.local(travel, "Booking", "budget"));

      session.complete(budget, "CheckBudget", Map.of("confirmedBudget", "1100"));
      assertEquals("1200", session.local(travel, "Booking", "budget"));
      assertEquals(Map.of("approvedBudget", "1100"), session.processVariables(travel));

      session.complete(visa, "CheckVisa", Map.of("visaDecision", "granted"));
      session.complete(travel, "BookTravel", Map.of());
      session.assertEnded(travel, Map.of("approvedBudget", "1100", "visaStatus", "granted"));
    }
  }

  private static final class Session implements AutoCloseable {
    final ProcessEngine engine;
    final String deployment;

    Session(String model) throws Exception {
      engine = CibSevenTestEngine.create("concurrent-mapped-calls-" + model);
      try {
        deployment = engine.getRepositoryService().createDeployment()
            .addString(model + ".bpmn", Files.readString(MODELS.resolve(model + ".bpmn"))).deploy().getId();
      } catch (RuntimeException | Error failure) {
        engine.close();
        throw failure;
      }
    }

    /** Starts the supplier onboarding, prepares both files and checks that each expert holds only its own input. */
    String startSupplier() {
      var supplier = engine.getRuntimeService()
          .startProcessInstanceByKey("Process_SupplierOnboarding", Map.of("supplierName", "Acme")).getId();
      complete(supplier, "PrepareFinancialFile", Map.of());
      complete(supplier, "PrepareComplianceFile", Map.of());
      assertEquals(Map.of("dossier", "Acme"),
          engine.getRuntimeService().getVariablesLocal(called(supplier, "FinancialExpertOpinion")));
      assertEquals(Map.of("screeningFile", "sanctions screening"),
          engine.getRuntimeService().getVariablesLocal(called(supplier, "ComplianceExpertOpinion")));
      return supplier;
    }

    /** The child instance that the Call `callActivity` of `caller` started; both calls of one definition are live. */
    String called(String caller, String callActivity) {
      var call = engine.getHistoryService().createHistoricActivityInstanceQuery().processInstanceId(caller)
          .activityId(callActivity).singleResult();
      assertNotNull(call);
      assertNotNull(call.getCalledProcessInstanceId());
      return call.getCalledProcessInstanceId();
    }

    /**
     * The live local `name` of the Sub-Process `subProcess`, read on the execution of its activity instance. An
     * execution query by the Sub-Process's activity id finds none while its body waits in a Call or User Task
     * (observed 2026-11-01), so the activity-instance tree selects the scope.
     */
    Object local(String caller, String subProcess, String name) {
      for (var child : engine.getRuntimeService().getActivityInstance(caller).getChildActivityInstances()) {
        if (child.getActivityId().equals(subProcess)) {
          assertEquals(1, child.getExecutionIds().length);
          return engine.getRuntimeService().getVariableLocal(child.getExecutionIds()[0], name);
        }
      }
      throw new AssertionError(subProcess + " is not live in " + caller);
    }

    Map<String, Object> processVariables(String caller) {
      return engine.getRuntimeService().getVariablesLocal(caller);
    }

    void complete(String instance, String element, Map<String, Object> patch) {
      var task = engine.getTaskService().createTaskQuery().processInstanceId(instance).taskDefinitionKey(element)
          .singleResult();
      assertNotNull(task);
      engine.getTaskService().complete(task.getId(), new HashMap<>(patch));
    }

    /** The Process-scope variables at completion; Sub-Process locals have their own executions and are skipped. */
    void assertEnded(String caller, Map<String, Object> expected) {
      assertEquals(0, engine.getRuntimeService().createProcessInstanceQuery().processInstanceId(caller).count());
      var actual = new HashMap<String, Object>();
      for (var variable : engine.getHistoryService().createHistoricVariableInstanceQuery().processInstanceId(caller).list()) {
        if (variable.getExecutionId().equals(caller)) {
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
