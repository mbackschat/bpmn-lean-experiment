package org.bpmnlean.cibseven;

import static org.junit.Assert.assertEquals;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import org.cibseven.bpm.engine.ProcessEngine;
import org.cibseven.bpm.engine.delegate.JavaDelegate;
import org.junit.Test;

/**
 * Calibrates the scope host proposal's `CIB-AGR-0022` (`SCPH-START-01`, `SCPH-EXIT-01`) on its employee onboarding
 * model. CIB Seven `2.2.0` leaves a None Start and a completed embedded Sub-Process through
 * `BpmnActivityBehavior#performOutgoingBehavior`, which takes every unconditioned transition in one
 * `leaveActivityViaTransitions` and creates no activity instance for the split. So after each split both successors
 * are active in the same API call, the Start and the Sub-Process each have one historic activity instance, and no
 * element other than the model's own nodes has one. Expected values are built from the proposal's witness-model
 * account, never read from a target result.
 */
public final class CibSevenScopeHostSplitProbeTest {
  private static final Path MODEL = Path.of("../..").toAbsolutePath().normalize()
      .resolve("scenarios/scope-host-split/employee-onboarding.bpmn");

  /** A deployment of the onboarding model whose one delegate writes the employee number. */
  private static final class Session implements AutoCloseable {
    final ProcessEngine engine;
    final String deployment;

    Session() throws Exception {
      JavaDelegate register = execution -> execution.setVariableLocal("employeeNumber", "E-1042");
      engine = CibSevenTestEngine.create("scope-host-split", configuration -> configuration.setBeans(
          Map.<Object, Object>of("registerHire", register)));
      try {
        deployment = engine.getRepositoryService().createDeployment()
            .addString("employee-onboarding.bpmn", Files.readString(MODEL)).deploy().getId();
      } catch (Exception | Error failure) {
        engine.close();
        throw failure;
      }
    }

    String start() {
      return engine.getRuntimeService().startProcessInstanceByKey("Process_EmployeeOnboarding",
          new HashMap<>(Map.of("hireSummary", "Ada Lovelace, platform engineer, starts 2026-12-01"))).getId();
    }

    /** The open User Tasks and asynchronous continuations, by element, as one sorted list. A job names its element
     * only through its job definition. */
    List<String> active(String instance) {
      var management = engine.getManagementService();
      var elements = new ArrayList<String>();
      engine.getTaskService().createTaskQuery().processInstanceId(instance).list()
          .forEach(task -> elements.add(task.getTaskDefinitionKey()));
      management.createJobQuery().processInstanceId(instance).list().forEach(job -> elements.add("job:"
          + management.createJobDefinitionQuery().jobDefinitionId(job.getJobDefinitionId()).singleResult()
              .getActivityId()));
      Collections.sort(elements);
      return elements;
    }

    void runJob(String instance, String element) {
      var job = engine.getManagementService().createJobQuery().processInstanceId(instance).activityId(element)
          .singleResult();
      engine.getManagementService().executeJob(job.getId());
    }

    void complete(String instance, String element) {
      var task = engine.getTaskService().createTaskQuery().processInstanceId(instance).taskDefinitionKey(element)
          .singleResult();
      engine.getTaskService().complete(task.getId());
    }

    /** Historic activity instances per element of the instance. */
    Map<String, Long> history(String instance) {
      var counts = new TreeMap<String, Long>();
      for (var activity : engine.getHistoryService().createHistoricActivityInstanceQuery().processInstanceId(instance)
          .list()) {
        counts.merge(activity.getActivityId(), 1L, Long::sum);
      }
      return counts;
    }

    boolean ended(String instance) {
      return engine.getRuntimeService().createProcessInstanceQuery().processInstanceId(instance).count() == 0;
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

  private static final Map<String, Long> JOURNEY_HISTORY = new TreeMap<>(Map.ofEntries(
      Map.entry("HireConfirmed", 1L), Map.entry("RegisterHire", 1L), Map.entry("PrepareWorkstation", 1L),
      Map.entry("StartPrepared", 2L), Map.entry("IssueEquipment", 1L), Map.entry("EquipmentRequested", 1L),
      Map.entry("IssueBadge", 1L), Map.entry("IssueLaptop", 1L), Map.entry("EquipmentReady", 2L),
      Map.entry("EquipmentIssued", 1L), Map.entry("ConfirmItAccess", 1L), Map.entry("AccessConfirmed", 1L),
      Map.entry("NotifyFacilities", 1L)));

  private static void journey(boolean registerFirst, boolean badgeFirst) throws Exception {
    try (var session = new Session()) {
      var instance = session.start();
      assertEquals(List.of("PrepareWorkstation", "job:RegisterHire"), session.active(instance));
      if (registerFirst) {
        session.runJob(instance, "RegisterHire");
        session.complete(instance, "PrepareWorkstation");
      } else {
        session.complete(instance, "PrepareWorkstation");
        session.runJob(instance, "RegisterHire");
      }
      assertEquals(List.of("IssueBadge", "IssueLaptop"), session.active(instance));
      session.complete(instance, badgeFirst ? "IssueBadge" : "IssueLaptop");
      session.complete(instance, badgeFirst ? "IssueLaptop" : "IssueBadge");
      assertEquals(List.of("ConfirmItAccess"), session.active(instance));
      assertEquals(Long.valueOf(1), session.history(instance).get("NotifyFacilities"));
      assertEquals(false, session.ended(instance));
      session.complete(instance, "ConfirmItAccess");
      assertEquals(true, session.ended(instance));
      assertEquals(JOURNEY_HISTORY, session.history(instance));
    }
  }

  @Test
  public void theRootAndBodyStartsAndTheSubProcessOpenEveryOutgoingFlowInOneStep() throws Exception {
    journey(true, true);
  }

  @Test
  public void theSplitsAreIndependentOfTheBranchCompletionOrder() throws Exception {
    journey(false, false);
  }
}
