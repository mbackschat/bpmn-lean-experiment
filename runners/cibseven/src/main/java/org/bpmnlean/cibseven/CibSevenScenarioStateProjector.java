package org.bpmnlean.cibseven;

import static org.bpmnlean.cibseven.ScenarioProtocol.ProcessStatus.COMPLETED;
import static org.bpmnlean.cibseven.ScenarioProtocol.ProcessStatus.RUNNING;
import static org.bpmnlean.cibseven.ScenarioProtocol.WaitKind.EFFECT;
import static org.bpmnlean.cibseven.ScenarioProtocol.WaitKind.TIMER;

import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import org.bpmnlean.cibseven.CibSevenUserTaskProjector.HostUserTask;
import org.bpmnlean.cibseven.ScenarioProtocol.CleanupProjection;
import org.bpmnlean.cibseven.ScenarioProtocol.CompleteUserTaskInstanceInteraction;
import org.bpmnlean.cibseven.ScenarioProtocol.EffectJobSnapshot;
import org.bpmnlean.cibseven.ScenarioProtocol.EnabledInteraction;
import org.bpmnlean.cibseven.ScenarioProtocol.OpenTimer;
import org.bpmnlean.cibseven.ScenarioProtocol.StateObservation;
import org.bpmnlean.cibseven.ScenarioProtocol.TaskQuerySnapshot;
import org.bpmnlean.cibseven.ScenarioProtocol.TaskQueryTask;
import org.bpmnlean.cibseven.ScenarioProtocol.TimerJob;
import org.bpmnlean.cibseven.ScenarioProtocol.TimerJobSnapshot;
import org.bpmnlean.cibseven.ScenarioProtocol.TimerOccurrenceId;
import org.bpmnlean.cibseven.ScenarioProtocol.StringValue;
import org.bpmnlean.cibseven.ScenarioProtocol.NullValue;
import org.bpmnlean.cibseven.ScenarioProtocol.VariableBinding;
import org.cibseven.bpm.engine.ProcessEngine;
import org.cibseven.bpm.engine.impl.util.ClockUtil;
import org.cibseven.bpm.engine.task.Task;

/** Projects engine-owned runtime state into the capsule's canonical and raw evidence shapes. */
final class CibSevenScenarioStateProjector {

  private final ProcessEngine processEngine;
  private final CibSevenUserTaskProjector userTaskProjector;
  private final CibSevenEffectProjector effectProjector;
  private final Date logicalEpoch;

  CibSevenScenarioStateProjector(
      ProcessEngine processEngine,
      CibSevenUserTaskProjector userTaskProjector,
      CibSevenEffectProjector effectProjector,
      Date logicalEpoch) {
    this.processEngine = processEngine;
    this.userTaskProjector = userTaskProjector;
    this.effectProjector = effectProjector;
    this.logicalEpoch = logicalEpoch;
  }

  ObservedState observeState(
      String engineInstanceId,
      String stableInstanceId,
      String afterCommandId) {
    var isRunning =
        processEngine
                .getRuntimeService()
                .createProcessInstanceQuery()
                .processInstanceId(engineInstanceId)
                .count()
            == 1;
    var tasks =
        isRunning
            ? processEngine
                .getTaskService()
                .createTaskQuery()
                .processInstanceId(engineInstanceId)
                .list()
            : List.<Task>of();
    var hostTasks =
        tasks.stream()
            .map(task -> new HostUserTask(task.getTaskDefinitionKey(), task.getName()))
            .toList();
    var taskQuery =
        new TaskQuerySnapshot(
            afterCommandId,
            hostTasks.stream()
                .map(task -> new TaskQueryTask(task.elementId(), task.name()))
                .toList());
    var activeWaits = userTaskProjector.activeWaits(hostTasks);
    var openUserTasks =
        userTaskProjector.openUserTasks(stableInstanceId, hostTasks);
    var enabledInteractions =
        openUserTasks.stream()
            .<EnabledInteraction>map(
                task -> new CompleteUserTaskInstanceInteraction(task.id()))
            .toList();
    var timerJobSnapshot = observeTimerJobs(engineInstanceId, afterCommandId, isRunning);
    var openTimers =
        timerJobSnapshot.jobs().stream()
            .map(
                job ->
                    new OpenTimer(
                        new TimerOccurrenceId(
                            stableInstanceId,
                            job.elementId(),
                            1),
                        job.dueDateDeltaMs()))
            .toList();
    var timerWaits =
        openTimers.stream()
            .map(timer -> new ScenarioProtocol.ActiveWait(
                timer.id().elementId(), TIMER, 1))
            .toList();
    var projectedEffects =
        isRunning
            ? effectProjector.project(
                processEngine, engineInstanceId, stableInstanceId)
            : List.<CibSevenEffectProjector.ProjectedEffectWait>of();
    var openEffects =
        projectedEffects.stream()
            .map(CibSevenEffectProjector.ProjectedEffectWait::openEffect)
            .toList();
    var effectWaits =
        openEffects.stream()
            .map(effect -> new ScenarioProtocol.ActiveWait(
                effect.id().elementId(), EFFECT, 1))
            .toList();
    var allWaits = new ArrayList<>(activeWaits);
    allWaits.addAll(timerWaits);
    allWaits.addAll(effectWaits);
    allWaits.sort(
        (left, right) -> WireStrings.compare(left.elementId(), right.elementId()));
    var logicalTimeMs = ClockUtil.getCurrentTime().getTime() - logicalEpoch.getTime();
    var variables = observeProcessVariables(engineInstanceId);
    return new ObservedState(
        new StateObservation(
            stableInstanceId,
            isRunning ? RUNNING : COMPLETED,
            allWaits,
            openUserTasks,
            openTimers,
            openEffects,
            variables,
            enabledInteractions,
            logicalTimeMs),
        taskQuery,
        timerJobSnapshot,
        new EffectJobSnapshot(
            afterCommandId,
            projectedEffects.stream()
                .map(CibSevenEffectProjector.ProjectedEffectWait::evidence)
                .toList()));
  }

  private List<VariableBinding> observeProcessVariables(String engineInstanceId) {
    return List.of("myDocumentReference", "relationshipLinkId").stream()
        .flatMap(
            name ->
                processEngine
                    .getHistoryService()
                    .createHistoricVariableInstanceQuery()
                    .processInstanceId(engineInstanceId)
                    .variableName(name)
                    .list()
                    .stream()
                    .map(variable -> projectVariable(name, variable.getValue())))
        .sorted(
            (left, right) ->
                WireStrings.compare(left.name(), right.name()))
        .toList();
  }

  private VariableBinding projectVariable(String name, Object value) {
    if (value == null) {
      return new VariableBinding(name, new NullValue());
    }
    if (value instanceof String stringValue) {
      return new VariableBinding(name, new StringValue(stringValue));
    }
    throw new IllegalStateException(
        "Canonical Process variable must be string or null: " + name);
  }

  CleanupProjection observeCleanup() {
    return new CleanupProjection(
        processEngine.getRepositoryService().createDeploymentQuery().count(),
        processEngine.getRepositoryService().createProcessDefinitionQuery().count(),
        processEngine.getRuntimeService().createProcessInstanceQuery().count(),
        processEngine.getTaskService().createTaskQuery().count(),
        processEngine.getManagementService().createJobQuery().count(),
        processEngine.getRuntimeService().createIncidentQuery().count(),
        processEngine
            .getHistoryService()
            .createHistoricProcessInstanceQuery()
            .count());
  }

  private TimerJobSnapshot observeTimerJobs(
      String engineInstanceId,
      String afterCommandId,
      boolean isRunning) {
    if (!isRunning) {
      return new TimerJobSnapshot(afterCommandId, List.of());
    }
    var management = processEngine.getManagementService();
    var jobs =
        management
            .createJobQuery()
            .processInstanceId(engineInstanceId)
            .timers()
            .list();
    var projected =
        jobs.stream()
            .map(
                job -> {
                  var definition =
                      management
                          .createJobDefinitionQuery()
                          .jobDefinitionId(job.getJobDefinitionId())
                          .singleResult();
                  if (definition == null) {
                    throw new IllegalStateException(
                        "Timer job has no job definition " + job.getJobDefinitionId());
                  }
                  return new TimerJob(
                      definition.getActivityId(),
                      job.getDuedate().getTime() - logicalEpoch.getTime(),
                      management
                              .createJobQuery()
                              .jobId(job.getId())
                              .executable()
                              .count()
                          == 1);
                })
            .sorted((left, right) -> WireStrings.compare(left.elementId(), right.elementId()))
            .toList();
    return new TimerJobSnapshot(afterCommandId, projected);
  }

  record ObservedState(
      StateObservation state,
      TaskQuerySnapshot taskQuery,
      TimerJobSnapshot timerJobs,
      EffectJobSnapshot effectJobs) {}
}
