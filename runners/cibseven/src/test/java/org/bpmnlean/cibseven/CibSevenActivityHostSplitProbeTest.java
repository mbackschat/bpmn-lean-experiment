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
 * Calibrates the split proposal's `CIB-AGR-0023` (`ACSP-COMPLETE-01`) on its insurance claim intake model. CIB Seven
 * `2.2.0` leaves a completed User Task and a completed Service or Send Task through
 * `AbstractBpmnActivityBehavior#leave`, whose `BpmnActivityBehavior#performOutgoingBehavior` takes every unconditioned
 * transition in one `leaveActivityViaTransitions` and creates no activity instance for the split. So after each split
 * both successors are active in the same API call, each splitting Task has one historic activity instance, and no
 * element other than the model's own nodes has one. Expected values are built from the proposal's witness-model
 * account, never read from a target result.
 */
public final class CibSevenActivityHostSplitProbeTest {
  private static final Path MODEL = Path.of("../..").toAbsolutePath().normalize()
      .resolve("scenarios/activity-host-split/insurance-claim-intake.bpmn");

  /** A deployment of the intake model whose delegates write the claim number and the assessment reference. */
  private static final class Session implements AutoCloseable {
    final ProcessEngine engine;
    final String deployment;

    Session() throws Exception {
      JavaDelegate register = execution -> execution.setVariableLocal("claimNumber", "CLM-2026-0418");
      JavaDelegate notify = execution -> { };
      JavaDelegate assess = execution -> execution.setVariableLocal("assessmentReference", "ASM-7731");
      engine = CibSevenTestEngine.create("activity-host-split", configuration -> configuration.setBeans(
          Map.<Object, Object>of("registerClaim", register, "notifyBroker", notify, "orderAssessment", assess)));
      try {
        deployment = engine.getRepositoryService().createDeployment()
            .addString("insurance-claim-intake.bpmn", Files.readString(MODEL)).deploy().getId();
      } catch (Exception | Error failure) {
        engine.close();
        throw failure;
      }
    }

    String start() {
      return engine.getRuntimeService().startProcessInstanceByKey("Process_InsuranceClaimIntake",
          new HashMap<>(Map.of("claimSummary", "CLM-2026-0418: water damage in kitchen, EUR 3,150"))).getId();
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
      Map.entry("ClaimReported", 1L), Map.entry("Intake", 1L), Map.entry("IntakeOpened", 1L),
      Map.entry("RegisterClaim", 1L), Map.entry("ArchiveDocuments", 1L), Map.entry("NotifyBroker", 1L),
      Map.entry("DocumentsArchived", 1L), Map.entry("BrokerNotified", 1L), Map.entry("ReviewClaim", 1L),
      Map.entry("OrderAssessment", 1L), Map.entry("InformCustomer", 1L), Map.entry("ReviewDone", 2L),
      Map.entry("DecideClaim", 1L), Map.entry("ClaimDecided", 1L)));

  private static void journey(boolean archiveFirst, boolean assessmentFirst) throws Exception {
    try (var session = new Session()) {
      var instance = session.start();
      assertEquals(List.of("job:RegisterClaim"), session.active(instance));
      session.runJob(instance, "RegisterClaim");
      assertEquals(List.of("ArchiveDocuments", "job:NotifyBroker"), session.active(instance));
      if (archiveFirst) {
        session.complete(instance, "ArchiveDocuments");
        session.runJob(instance, "NotifyBroker");
      } else {
        session.runJob(instance, "NotifyBroker");
        session.complete(instance, "ArchiveDocuments");
      }
      assertEquals(List.of("ReviewClaim"), session.active(instance));
      session.complete(instance, "ReviewClaim");
      assertEquals(List.of("InformCustomer", "job:OrderAssessment"), session.active(instance));
      if (assessmentFirst) {
        session.runJob(instance, "OrderAssessment");
        session.complete(instance, "InformCustomer");
      } else {
        session.complete(instance, "InformCustomer");
        session.runJob(instance, "OrderAssessment");
      }
      assertEquals(List.of("DecideClaim"), session.active(instance));
      session.complete(instance, "DecideClaim");
      assertEquals(true, session.ended(instance));
      assertEquals(JOURNEY_HISTORY, session.history(instance));
    }
  }

  @Test
  public void aCompletedServiceTaskAndUserTaskOpenEveryOutgoingFlowInOneStep() throws Exception {
    journey(true, true);
  }

  @Test
  public void theSplitsAreIndependentOfTheBranchCompletionOrder() throws Exception {
    journey(false, false);
  }
}
