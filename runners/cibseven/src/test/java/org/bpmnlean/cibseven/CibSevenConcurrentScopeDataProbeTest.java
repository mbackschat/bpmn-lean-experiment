package org.bpmnlean.cibseven;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.cibseven.bpm.engine.ProcessEngine;
import org.cibseven.bpm.engine.delegate.JavaDelegate;
import org.junit.Test;

/**
 * Calibrates `CIB-EXT-0020`'s concurrent widening (concurrent scope data specification, `CSD-CHAIN-01`, `CSD-ISOLATE-01`,
 * `CSD-INIT-01`, `CSD-RETIRE-01`) on the two retained models. Each live Price damage execution owns its estimate and
 * adjuster, so each Fetch rates input reads its own occurrence's values and the later completer's output wins; the
 * Fire safety check's input reads the enclosing Inspection's result, not its concurrently entered sibling's literal.
 * The delegates record their mapped inputs, and the Process variables are read at completion from CIB's history.
 */
public final class CibSevenConcurrentScopeDataProbeTest {
  private static final Path PROJECT_ROOT = Path.of("../..").toAbsolutePath().normalize();
  private static final Path MODELS = PROJECT_ROOT.resolve("scenarios/concurrent-scope-data");

  @Test
  public void eachPriceDamageOccurrenceReadsItsOwnFrameWhenFetchRatesOneCompletesFirst() throws Exception {
    assertClaim(1, 2, "4200");
  }

  @Test
  public void eachPriceDamageOccurrenceReadsItsOwnFrameWhenFetchRatesTwoCompletesFirst() throws Exception {
    assertClaim(2, 1, "pending");
  }

  private static void assertClaim(int first, int second, String lastEstimate) throws Exception {
    var inputs = new ArrayList<List<Object>>();
    JavaDelegate rateLookup = execution ->
        inputs.add(Arrays.asList(execution.getVariable("estimate"), execution.getVariable("adjuster")));
    try (var session = new Session("claim-damage-assessment", "rateLookup", rateLookup)) {
      var variables = new HashMap<String, Object>();
      variables.put("adjuster", "desk");
      variables.put("noAdjuster", null);
      var claim = session.start("Process_ClaimDamageAssessment", variables);
      session.complete(claim, "InspectVehicle", Map.of());
      var assessOne = session.task(claim, "AssessDamage");
      session.complete(claim, "InspectProperty", Map.of());
      var assessTwo = session.engine.getTaskService().createTaskQuery().processInstanceId(claim)
          .taskDefinitionKey("AssessDamage").list().stream().filter(task -> !task.getId().equals(assessOne)).findFirst()
          .orElseThrow().getId();

      session.engine.getTaskService().complete(assessOne, new HashMap<>());
      var fetchOne = session.job(claim);
      var patch = new HashMap<String, Object>();
      patch.put("estimate", "4200");
      session.engine.getTaskService().complete(assessTwo, patch);
      var fetchTwo = session.engine.getManagementService().createJobQuery().processInstanceId(claim).list().stream()
          .filter(job -> !job.getId().equals(fetchOne)).findFirst().orElseThrow().getId();

      var jobs = Map.of(1, fetchOne, 2, fetchTwo);
      session.engine.getManagementService().executeJob(jobs.get(first));
      session.engine.getManagementService().executeJob(jobs.get(second));
      var pending = Arrays.<Object>asList("pending", null);
      var priced = Arrays.<Object>asList("4200", null);
      // The frame's present null shadows the Process adjuster "desk" for both occurrences.
      assertEquals(first == 1 ? List.of(pending, priced) : List.of(priced, pending), inputs);

      session.complete(claim, "ReviewClaim", Map.of());
      var expected = new HashMap<String, Object>();
      expected.put("adjuster", "desk");
      expected.put("noAdjuster", null);
      expected.put("lastEstimate", lastEstimate);
      session.assertEnded(claim, expected);
    }
  }

  @Test
  public void fireSafetyReadsTheEnclosingResultAndBothChecksWriteTheSharedFindings() throws Exception {
    var inputs = new ArrayList<Map<String, Object>>();
    JavaDelegate inspectionSummary = execution -> inputs.add(Map.of(
        "electricalResult", execution.getVariable("electricalResult"), "findings", execution.getVariable("findings"),
        "fireResult", execution.getVariable("fireResult")));
    try (var session = new Session("facility-inspection", "inspectionSummary", inspectionSummary)) {
      var inspection = session.start("Process_FacilityInspection", new HashMap<>());
      session.complete(inspection, "RecordElectricalFindings", Map.of("findings", "wiring-ok", "result", "electrical-pass"));
      session.complete(inspection, "RecordFireSafetyFindings", Map.of("findings", "extinguishers-due"));
      session.engine.getManagementService().executeJob(session.job(inspection));
      assertEquals(List.of(Map.of("electricalResult", "electrical-pass", "findings", "extinguishers-due", "fireResult", "none")),
          inputs);
      session.assertEnded(inspection, Map.of("electricalResult", "electrical-pass", "fireResult", "none"));
    }
  }

  private static final class Session implements AutoCloseable {
    final ProcessEngine engine;
    final String deployment;

    Session(String model, String beanName, JavaDelegate delegate) throws Exception {
      engine = CibSevenTestEngine.create("concurrent-scope-data-" + model,
          configuration -> configuration.setBeans(Map.of(beanName, delegate)));
      try {
        deployment = engine.getRepositoryService().createDeployment()
            .addString(model + ".bpmn", Files.readString(MODELS.resolve(model + ".bpmn"))).deploy().getId();
      } catch (RuntimeException | Error failure) {
        engine.close();
        throw failure;
      }
    }

    String start(String processId, Map<String, Object> variables) {
      return engine.getRuntimeService().startProcessInstanceByKey(processId, variables).getId();
    }

    /** The one open task of `element`. */
    String task(String instance, String element) {
      var task = engine.getTaskService().createTaskQuery().processInstanceId(instance).taskDefinitionKey(element)
          .singleResult();
      assertNotNull(task);
      return task.getId();
    }

    void complete(String instance, String element, Map<String, Object> patch) {
      engine.getTaskService().complete(task(instance, element), new HashMap<>(patch));
    }

    /** The one open asynchronous continuation. */
    String job(String instance) {
      var job = engine.getManagementService().createJobQuery().processInstanceId(instance).singleResult();
      assertNotNull(job);
      return job.getId();
    }

    /**
     * The Process-scope variables at completion, selected by execution alone: CIB records a Sub-Process local that its
     * input mapping creates at entry under the enclosing activity instance, so Inspection's locals carry the process
     * instance's activity instance id although they live on Inspection's own scope execution (observed 2026-10-31).
     */
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
