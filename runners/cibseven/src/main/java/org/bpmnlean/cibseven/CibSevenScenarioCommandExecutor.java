package org.bpmnlean.cibseven;

import static org.bpmnlean.cibseven.ScenarioProtocol.CommandOutcome.COMMITTED;
import static org.bpmnlean.cibseven.ScenarioProtocol.CommandOutcome.REJECTED;

import java.util.Date;
import org.bpmnlean.cibseven.ScenarioProtocol.CommandOutcome;
import org.bpmnlean.cibseven.ScenarioProtocol.CompleteEffectStimulus;
import org.bpmnlean.cibseven.ScenarioProtocol.CompleteUserTaskInstanceStimulus;
import org.bpmnlean.cibseven.ScenarioProtocol.EffectExecutionSnapshot;
import org.bpmnlean.cibseven.ScenarioProtocol.FireTimerStimulus;
import org.bpmnlean.cibseven.ScenarioProtocol.SuccessfulEffectResult;
import org.cibseven.bpm.engine.ProcessEngine;
import org.cibseven.bpm.engine.impl.util.ClockUtil;

/** Executes the three admitted CIB command realizations against one engine instance. */
final class CibSevenScenarioCommandExecutor {

  private final ProcessEngine processEngine;
  private final CibSevenEffectProjector effectProjector;
  private final CibSevenEffectProbe effectProbe;
  private final Date logicalEpoch;

  CibSevenScenarioCommandExecutor(
      ProcessEngine processEngine,
      CibSevenEffectProjector effectProjector,
      CibSevenEffectProbe effectProbe,
      Date logicalEpoch) {
    this.processEngine = processEngine;
    this.effectProjector = effectProjector;
    this.effectProbe = effectProbe;
    this.logicalEpoch = logicalEpoch;
  }

  CommandOutcome completeUserTaskInstance(
      String engineInstanceId,
      String stableInstanceId,
      CompleteUserTaskInstanceStimulus complete) {
    var taskId = complete.taskId();
    if (!taskId.processInstanceId().equals(stableInstanceId)
        || taskId.activation() != 1) {
      return REJECTED;
    }
    var tasks =
        processEngine
            .getTaskService()
            .createTaskQuery()
            .processInstanceId(engineInstanceId)
            .taskDefinitionKey(taskId.elementId())
            .list();
    if (tasks.size() != 1) {
      return REJECTED;
    }
    processEngine.getTaskService().complete(tasks.getFirst().getId());
    return COMMITTED;
  }

  /**
   * Advances the controlled clock only after proving the selected timer job is ineligible, then
   * executes it only after the engine's executable query admits the same job.
   */
  CommandOutcome fireTimer(
      String engineInstanceId,
      String stableInstanceId,
      FireTimerStimulus fire) {
    var timerId = fire.timerId();
    if (!timerId.processInstanceId().equals(stableInstanceId)
        || timerId.activation() != 1) {
      return REJECTED;
    }
    var jobs =
        processEngine
            .getManagementService()
            .createJobQuery()
            .processInstanceId(engineInstanceId)
            .activityId(timerId.elementId())
            .timers()
            .list();
    if (jobs.size() != 1) {
      return REJECTED;
    }
    var job = jobs.getFirst();
    var dueDateDeltaMs = job.getDuedate().getTime() - logicalEpoch.getTime();
    if (dueDateDeltaMs != fire.logicalTimeMs()) {
      return REJECTED;
    }
    var management = processEngine.getManagementService();
    if (management.createJobQuery().jobId(job.getId()).executable().count() != 0) {
      throw new IllegalStateException(
          "Timer job was executable before the controlled clock reached its due date");
    }
    ClockUtil.setCurrentTime(new Date(logicalEpoch.getTime() + fire.logicalTimeMs()));
    var executable =
        management.createJobQuery().jobId(job.getId()).executable().singleResult();
    if (executable == null) {
      throw new IllegalStateException(
          "Timer job was not executable when the controlled clock reached its due date");
    }
    management.executeJob(executable.getId());
    return COMMITTED;
  }

  EffectCompletion completeEffect(
      String engineInstanceId,
      String stableInstanceId,
      CompleteEffectStimulus complete,
      CibEffectExecutionSchedule schedule) {
    if (!(complete.result() instanceof SuccessfulEffectResult result)
        || !result.localPatch().isEmpty()) {
      return new EffectCompletion(REJECTED, null);
    }
    var submitted = complete.effectId();
    if (!submitted.processInstanceId().equals(stableInstanceId)
        || submitted.activation() != 1) {
      return new EffectCompletion(REJECTED, null);
    }
    var waits = effectProjector.project(processEngine, engineInstanceId, stableInstanceId);
    if (waits.size() != 1
        || !waits.getFirst().openEffect().id().equals(submitted)) {
      return new EffectCompletion(REJECTED, null);
    }
    var wait = waits.getFirst();
    var management = processEngine.getManagementService();
    var initialRetries = wait.evidence().retries();
    Long retriesAfterFirstFailure = null;
    try {
      management.executeJob(wait.jobId());
    } catch (RuntimeException failure) {
      if (schedule != CibEffectExecutionSchedule.FAIL_AFTER_MUTATION_ONCE) {
        throw failure;
      }
      var failedJob = management.createJobQuery().jobId(wait.jobId()).singleResult();
      if (failedJob == null || failedJob.getRetries() != initialRetries - 1) {
        throw new IllegalStateException(
            "CIB did not retain and decrement the failed Service Task job",
            failure);
      }
      retriesAfterFirstFailure = (long) failedJob.getRetries();
      if (management.createJobQuery().jobId(wait.jobId()).executable().count() != 1) {
        throw new IllegalStateException(
            "CIB failed Service Task job was not publicly executable",
            failure);
      }
      management.executeJob(wait.jobId());
    }
    if (management.createJobQuery().jobId(wait.jobId()).count() != 0) {
      throw new IllegalStateException("CIB retained the Service Task job after success");
    }
    return new EffectCompletion(
        COMMITTED,
        new EffectExecutionSnapshot(
            complete.commandId(),
            schedule.wireValue(),
            effectProbe.invocations(),
            effectProbe.mutations(),
            initialRetries,
            retriesAfterFirstFailure));
  }

  record EffectCompletion(
      CommandOutcome outcome, EffectExecutionSnapshot evidence) {}
}
