package org.bpmnlean.cibseven;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertThrows;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import org.cibseven.bpm.engine.ProcessEngine;
import org.cibseven.bpm.engine.delegate.DelegateExecution;
import org.cibseven.bpm.engine.delegate.JavaDelegate;
import org.cibseven.bpm.engine.history.HistoricProcessInstance;
import org.cibseven.bpm.engine.runtime.Incident;
import org.junit.Test;

/**
 * Establishes the configured failed-job incident lifecycle that may back the bounded Service Task
 * incident compatibility profile. This is research evidence only and does not register a profile.
 */
public final class CibSevenServiceTaskIncidentPhaseZeroProbeTest {

  private static final Path PROJECT_ROOT = Path.of("../..").toAbsolutePath().normalize();
  private static final Path RESOURCE =
      PROJECT_ROOT.resolve("scenarios/service-task-effect/process.bpmn");
  private static final String PROCESS_ID = "Process_ServiceTaskEffectProbe";
  private static final String SERVICE_TASK_ID = "ServiceTask_Record";
  private static final String HANDLER_BEAN = CibSevenEffectProjector.SOURCE_HANDLER_BEAN;

  @Test
  public void provesConfiguredFailedJobIncidentCreationResolutionAndReplacement() throws Exception {
    var delegate = new ModeControlledDelegate();
    var engine =
        createEngine(
            "service-task-incident-enabled",
            true,
            delegate);
    String deploymentId = null;
    try {
      deploymentId = deploy(engine);
      var processInstance = engine.getRuntimeService().startProcessInstanceByKey(PROCESS_ID);
      var processInstanceId = processInstance.getId();
      var job = requireJob(engine, processInstanceId);

      failUntilRetriesReachZero(engine, job.getId(), 3);
      var firstIncident = requireSingleIncident(engine, processInstanceId, job.getId());

      engine.getManagementService().setJobRetries(job.getId(), 1);
      assertEquals(0, incidentCount(engine, processInstanceId));
      var reopenedJob = requireJob(engine, processInstanceId);
      assertEquals(job.getId(), reopenedJob.getId());
      assertEquals(1, reopenedJob.getRetries());

      failUntilRetriesReachZero(engine, job.getId(), 1);
      var secondIncident = requireSingleIncident(engine, processInstanceId, job.getId());
      assertNotEquals(firstIncident.getId(), secondIncident.getId());

      engine.getManagementService().setJobRetries(job.getId(), 1);
      delegate.succeed();
      engine.getManagementService().executeJob(job.getId());

      assertEquals(0, incidentCount(engine, processInstanceId));
      assertEquals(0, engine.getManagementService().createJobQuery().jobId(job.getId()).count());
      assertEquals(
          0,
          engine
              .getRuntimeService()
              .createProcessInstanceQuery()
              .processInstanceId(processInstanceId)
              .count());
      var completedHistory =
          engine
              .getHistoryService()
              .createHistoricProcessInstanceQuery()
              .processInstanceId(processInstanceId)
              .singleResult();
      assertNotNull(completedHistory);
      assertEquals(HistoricProcessInstance.STATE_COMPLETED, completedHistory.getState());
    } finally {
      deleteDeployment(engine, deploymentId);
      engine.close();
    }
  }

  @Test
  public void suppressesFailedJobIncidentWhenTheExactConfigurationIsDisabled() throws Exception {
    var engine =
        createEngine(
            "service-task-incident-disabled",
            false,
            new ModeControlledDelegate());
    String deploymentId = null;
    try {
      deploymentId = deploy(engine);
      var processInstance = engine.getRuntimeService().startProcessInstanceByKey(PROCESS_ID);
      var job = requireJob(engine, processInstance.getId());

      failUntilRetriesReachZero(engine, job.getId(), 3);

      assertEquals(0, incidentCount(engine, processInstance.getId()));
      assertEquals(0, requireJob(engine, processInstance.getId()).getRetries());
    } finally {
      deleteDeployment(engine, deploymentId);
      engine.close();
    }
  }

  @Test
  public void provesExternalRootDeletionRemovesIncidentWorkAndPreservesCommittedHistory()
      throws Exception {
    var engine =
        createEngine(
            "service-task-incident-cancellation",
            true,
            new ModeControlledDelegate());
    String deploymentId = null;
    try {
      deploymentId = deploy(engine);
      var processInstance =
          engine
              .getRuntimeService()
              .startProcessInstanceByKey(PROCESS_ID, Map.of("preserved", "before-cancel"));
      var processInstanceId = processInstance.getId();
      var job = requireJob(engine, processInstanceId);

      failUntilRetriesReachZero(engine, job.getId(), 3);
      requireSingleIncident(engine, processInstanceId, job.getId());

      engine
          .getRuntimeService()
          .deleteProcessInstance(processInstanceId, "owner-requested", false, true);

      assertEquals(
          0,
          engine
              .getRuntimeService()
              .createProcessInstanceQuery()
              .processInstanceId(processInstanceId)
              .count());
      assertEquals(0, incidentCount(engine, processInstanceId));
      assertEquals(
          0,
          engine
              .getManagementService()
              .createJobQuery()
              .processInstanceId(processInstanceId)
              .count());
      assertEquals(
          0,
          engine
              .getRuntimeService()
              .createExecutionQuery()
              .processInstanceId(processInstanceId)
              .count());
      assertEquals(
          0,
          engine
              .getTaskService()
              .createTaskQuery()
              .processInstanceId(processInstanceId)
              .count());
      var history =
          engine
              .getHistoryService()
              .createHistoricProcessInstanceQuery()
              .processInstanceId(processInstanceId)
              .singleResult();
      assertNotNull(history);
      assertEquals(HistoricProcessInstance.STATE_EXTERNALLY_TERMINATED, history.getState());
      var preserved =
          engine
              .getHistoryService()
              .createHistoricVariableInstanceQuery()
              .processInstanceId(processInstanceId)
              .variableName("preserved")
              .singleResult();
      assertNotNull(preserved);
      assertEquals("before-cancel", preserved.getValue());
      assertNull(
          engine
              .getRuntimeService()
              .createIncidentQuery()
              .processInstanceId(processInstanceId)
              .singleResult());
    } finally {
      deleteDeployment(engine, deploymentId);
      engine.close();
    }
  }

  private static ProcessEngine createEngine(
      String name,
      boolean createIncidentOnFailedJob,
      ModeControlledDelegate delegate) {
    return CibSevenTestEngine.create(
        name,
        configuration -> {
          configuration.setBeans(Map.of(HANDLER_BEAN, delegate));
          configuration.setCreateIncidentOnFailedJobEnabled(createIncidentOnFailedJob);
        });
  }

  private static String deploy(ProcessEngine engine) throws Exception {
    return engine
        .getRepositoryService()
        .createDeployment()
        .addString(RESOURCE.getFileName().toString(), Files.readString(RESOURCE))
        .deploy()
        .getId();
  }

  private static org.cibseven.bpm.engine.runtime.Job requireJob(
      ProcessEngine engine,
      String processInstanceId) {
    var job =
        engine
            .getManagementService()
            .createJobQuery()
            .processInstanceId(processInstanceId)
            .activityId(SERVICE_TASK_ID)
            .singleResult();
    assertNotNull(job);
    return job;
  }

  private static void failUntilRetriesReachZero(
      ProcessEngine engine,
      String jobId,
      int initialRetries) {
    for (var expectedRetries = initialRetries - 1; expectedRetries >= 0; expectedRetries -= 1) {
      var failure =
          assertThrows(
              RuntimeException.class,
              () -> engine.getManagementService().executeJob(jobId));
      assertEquals("mode-controlled technical failure", failure.getMessage());
      var failedJob = engine.getManagementService().createJobQuery().jobId(jobId).singleResult();
      assertNotNull(failedJob);
      assertEquals(expectedRetries, failedJob.getRetries());
    }
  }

  private static Incident requireSingleIncident(
      ProcessEngine engine,
      String processInstanceId,
      String jobId) {
    var incident =
        engine
            .getRuntimeService()
            .createIncidentQuery()
            .processInstanceId(processInstanceId)
            .singleResult();
    assertNotNull(incident);
    assertEquals(Incident.FAILED_JOB_HANDLER_TYPE, incident.getIncidentType());
    assertEquals(jobId, incident.getConfiguration());
    assertEquals(SERVICE_TASK_ID, incident.getActivityId());
    assertEquals(incident.getId(), incident.getCauseIncidentId());
    assertEquals(incident.getId(), incident.getRootCauseIncidentId());
    return incident;
  }

  private static long incidentCount(ProcessEngine engine, String processInstanceId) {
    return engine
        .getRuntimeService()
        .createIncidentQuery()
        .processInstanceId(processInstanceId)
        .count();
  }

  private static void deleteDeployment(ProcessEngine engine, String deploymentId) {
    if (deploymentId != null) {
      engine.getRepositoryService().deleteDeployment(deploymentId, true, true, true);
    }
  }

  private static final class ModeControlledDelegate implements JavaDelegate {

    private boolean succeeds;

    @Override
    public void execute(DelegateExecution execution) {
      if (!succeeds) {
        throw new IllegalStateException("mode-controlled technical failure");
      }
    }

    void succeed() {
      succeeds = true;
    }
  }
}
