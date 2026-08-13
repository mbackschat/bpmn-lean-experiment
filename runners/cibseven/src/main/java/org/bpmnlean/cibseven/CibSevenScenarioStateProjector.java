package org.bpmnlean.cibseven;

import static org.bpmnlean.cibseven.ScenarioProtocol.ProcessStatus.COMPLETED;
import static org.bpmnlean.cibseven.ScenarioProtocol.ProcessStatus.RUNNING;

import java.util.Date;
import java.util.LinkedHashSet;
import java.util.List;
import org.bpmnlean.cibseven.CibStateQueryEvidence.ProcessVariableSnapshot;
import org.bpmnlean.cibseven.CibStateQueryEvidence.MessageSubscriptionSnapshot;
import org.bpmnlean.cibseven.CibStateQueryEvidence.StateQuerySnapshot;
import org.bpmnlean.cibseven.CibSevenUserTaskProjector.HostUserTask;
import org.bpmnlean.cibseven.ScenarioProtocol.BooleanValue;
import org.bpmnlean.cibseven.ScenarioDiagnosticsProtocol.CleanupProjection;
import org.bpmnlean.cibseven.ScenarioInteractionProtocol.CompleteUserTaskInstanceInteraction;
import org.bpmnlean.cibseven.ScenarioDiagnosticsProtocol.EffectJobSnapshot;
import org.bpmnlean.cibseven.ScenarioInteractionProtocol.EnabledInteraction;
import org.bpmnlean.cibseven.ScenarioProtocol.OpenTimer;
import org.bpmnlean.cibseven.ScenarioProtocol.StateObservation;
import org.bpmnlean.cibseven.ScenarioDiagnosticsProtocol.TaskQuerySnapshot;
import org.bpmnlean.cibseven.ScenarioDiagnosticsProtocol.TaskQueryTask;
import org.bpmnlean.cibseven.ScenarioDiagnosticsProtocol.TimerJob;
import org.bpmnlean.cibseven.ScenarioDiagnosticsProtocol.TimerJobSnapshot;
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
  private final CibSevenUserTaskMetadataProjector userTaskMetadataProjector;
  private final CibSevenEffectProjector effectProjector;
  private final CibSevenMessageProjector messageProjector;
  private final CibSevenActiveWaitProjector activeWaitProjector;
  private final CibSevenIncidentProjector incidentProjector;
  private final boolean incidentCreationEnabled;
  private final Date logicalEpoch;

  CibSevenScenarioStateProjector(
      ProcessEngine processEngine,
      CibSevenUserTaskProjector userTaskProjector,
      CibSevenUserTaskMetadataProjector userTaskMetadataProjector,
      CibSevenEffectProjector effectProjector,
      CibSevenMessageProjector messageProjector,
      CibSevenActiveWaitProjector activeWaitProjector,
      CibSevenIncidentProjector incidentProjector,
      boolean incidentCreationEnabled,
      Date logicalEpoch) {
    this.processEngine = processEngine;
    this.userTaskProjector = userTaskProjector;
    this.userTaskMetadataProjector = userTaskMetadataProjector;
    this.effectProjector = effectProjector;
    this.messageProjector = messageProjector;
    this.activeWaitProjector = activeWaitProjector;
    this.incidentProjector = incidentProjector;
    this.incidentCreationEnabled = incidentCreationEnabled;
    this.logicalEpoch = logicalEpoch;
  }

  CibSevenScenarioStateProjector(
      ProcessEngine processEngine,
      CibSevenUserTaskProjector userTaskProjector,
      CibSevenUserTaskMetadataProjector userTaskMetadataProjector,
      CibSevenEffectProjector effectProjector,
      CibSevenMessageProjector messageProjector,
      CibSevenActiveWaitProjector activeWaitProjector,
      Date logicalEpoch) {
    this(
        processEngine,
        userTaskProjector,
        userTaskMetadataProjector,
        effectProjector,
        messageProjector,
        activeWaitProjector,
        new CibSevenIncidentProjector(),
        false,
        logicalEpoch);
  }

  ObservedState observeState(
      String engineInstanceId,
      String stableInstanceId,
      String afterCommandId,
      Iterable<String> committedCompletionVariableNames,
      String scenarioProfile) {
    var runtime = processEngine.getRuntimeService();
    var childInstances =
        runtime
            .createProcessInstanceQuery()
            .superProcessInstanceId(engineInstanceId)
            .count();
    if (childInstances != 0) {
      throw new IllegalStateException(
          "Bounded CIB projection does not support child Process instances");
    }
    var processInstanceCount =
        runtime
            .createProcessInstanceQuery()
            .processInstanceId(engineInstanceId)
            .count();
    if (processInstanceCount > 1) {
      throw new IllegalStateException(
          "Engine Process-instance identity is not unique");
    }
    var isRunning = processInstanceCount == 1;
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
    var activeWaits = userTaskProjector.activeWaits(hostTasks);
    var baseOpenUserTasks =
        userTaskProjector.openUserTasks(stableInstanceId, hostTasks);
    var taskMetadata =
        userTaskMetadataProjector.project(scenarioProfile, tasks, baseOpenUserTasks);
    var taskQuery = new TaskQuerySnapshot(afterCommandId, taskMetadata.rawTasks());
    var openUserTasks = taskMetadata.openUserTasks();
    var taskInteractions =
        openUserTasks.stream()
            .<EnabledInteraction>map(
                task -> new CompleteUserTaskInstanceInteraction(task.id()))
            .toList();
    var messages =
        messageProjector.project(
            engineInstanceId, stableInstanceId, afterCommandId);
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
    var projectedEffects =
        isRunning
            ? effectProjector.project(
                processEngine, engineInstanceId, stableInstanceId)
            : List.<CibSevenEffectProjector.ProjectedEffectWait>of();
    var incidents =
        incidentProjector.project(
            scenarioProfile,
            processEngine,
            engineInstanceId,
            afterCommandId,
            projectedEffects,
            incidentCreationEnabled);
    var openEffects = incidents.openEffects();
    var allWaits =
        activeWaitProjector.project(
            activeWaits,
            messages.activeWaits(),
            openTimers,
            openEffects,
            incidents.incidentWaits());
    var enabledInteractions =
        java.util.stream.Stream.of(
                taskInteractions,
                messages.enabledInteractions(),
                incidents.enabledInteractions())
            .flatMap(List::stream)
            .toList();
    var engineClockTimeMs = ClockUtil.getCurrentTime().getTime();
    var logicalTimeMs = engineClockTimeMs - logicalEpoch.getTime();
    var rawVariables =
        observeProcessVariables(
            engineInstanceId, committedCompletionVariableNames);
    var variables =
        rawVariables.stream()
            .map(this::projectVariable)
            .sorted(
                (left, right) ->
                    WireStrings.compare(left.name(), right.name()))
            .toList();
    return new ObservedState(
        new StateObservation(
            stableInstanceId,
            isRunning ? RUNNING : COMPLETED,
            allWaits,
            openUserTasks,
            messages.openSubscriptions(),
            openTimers,
            openEffects,
            incidents.openIncidents(),
            variables,
            enabledInteractions,
            logicalTimeMs),
        new StateQuerySnapshot(
            afterCommandId,
            processInstanceCount,
            engineClockTimeMs,
            rawVariables),
        taskQuery,
        messages.evidence(),
        timerJobSnapshot,
        new EffectJobSnapshot(
            afterCommandId,
            projectedEffects.stream()
                .map(CibSevenEffectProjector.ProjectedEffectWait::evidence)
                .toList()),
        incidents.evidence());
  }

  private List<ProcessVariableSnapshot> observeProcessVariables(
      String engineInstanceId,
      Iterable<String> committedCompletionVariableNames) {
    var observableNames = new LinkedHashSet<String>();
    committedCompletionVariableNames.forEach(observableNames::add);
    return observableNames.stream()
        .flatMap(
            name ->
                processEngine
                    .getHistoryService()
                    .createHistoricVariableInstanceQuery()
                    .processInstanceId(engineInstanceId)
                    .variableName(name)
                    .list()
                    .stream()
                    .map(
                        variable ->
                            observeProcessVariable(
                                variable.getName(),
                                variable.getValue())))
        .toList();
  }

  private ProcessVariableSnapshot observeProcessVariable(
      String name,
      Object value) {
    if (value == null) {
      return new ProcessVariableSnapshot(name, null);
    }
    if (value instanceof String stringValue) {
      return new ProcessVariableSnapshot(name, stringValue);
    }
    if (value instanceof Boolean booleanValue) {
      return new ProcessVariableSnapshot(name, booleanValue);
    }
    throw new IllegalStateException(
        "Canonical Process variable must be string, Boolean, or null: " + name);
  }

  private VariableBinding projectVariable(ProcessVariableSnapshot variable) {
    var value =
        switch (variable.value()) {
          case null -> new NullValue();
          case String stringValue -> new StringValue(stringValue);
          case Boolean booleanValue -> new BooleanValue(booleanValue);
          default ->
              throw new IllegalStateException(
                  "Unsupported retained Process variable " + variable.name());
        };
    return new VariableBinding(variable.name(), value);
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
      StateQuerySnapshot stateQuery,
      TaskQuerySnapshot taskQuery,
      MessageSubscriptionSnapshot messageSubscriptions,
      TimerJobSnapshot timerJobs,
      EffectJobSnapshot effectJobs,
      CibSevenIncidentProtocol.IncidentJobSnapshot incidentJobs) {}
}
