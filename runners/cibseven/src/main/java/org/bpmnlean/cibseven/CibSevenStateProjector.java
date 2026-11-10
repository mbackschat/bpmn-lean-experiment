package org.bpmnlean.cibseven;

import java.util.Comparator;
import java.util.Date;
import java.util.List;
import org.bpmnlean.cibseven.CibSevenIncidentProtocol.IncidentJobSnapshot;
import org.bpmnlean.cibseven.CibSevenOpenWaitProjector.ProjectedWait;
import org.bpmnlean.cibseven.CibStateQueryEvidence.MessageSubscriptionSnapshot;
import org.bpmnlean.cibseven.CibStateQueryEvidence.ProcessVariableSnapshot;
import org.bpmnlean.cibseven.CibStateQueryEvidence.StateQuerySnapshot;
import org.bpmnlean.cibseven.ScenarioDiagnosticsProtocol.CleanupProjection;
import org.bpmnlean.cibseven.ScenarioDiagnosticsProtocol.EffectJobSnapshot;
import org.bpmnlean.cibseven.ScenarioDiagnosticsProtocol.HistoricProcessStateSnapshot;
import org.bpmnlean.cibseven.ScenarioDiagnosticsProtocol.TaskQuerySnapshot;
import org.bpmnlean.cibseven.ScenarioDiagnosticsProtocol.TimerJobSnapshot;
import org.bpmnlean.cibseven.ScenarioProtocol.ProcessStatus;
import org.bpmnlean.cibseven.ScenarioProtocol.StateObservation;
import org.bpmnlean.cibseven.ScenarioProtocol.VariableBinding;
import org.cibseven.bpm.engine.ProcessEngine;
import org.cibseven.bpm.engine.history.HistoricProcessInstance;
import org.cibseven.bpm.engine.impl.util.ClockUtil;

/**
 * Projects one scenario's engine state into the canonical state observation and its aligned raw evidence: the
 * status from the root's runtime and history, the root scope's variables, and the open waits of
 * {@link CibSevenOpenWaitProjector}.
 */
final class CibSevenStateProjector {

  private final ProcessEngine engine;
  private final Date logicalEpoch;
  private final boolean incidentsEnabled;
  private final CibSevenOpenWaitProjector waits;
  /** One per scenario, so that an activation keeps its number across the scenario's observations. */
  private final CibSevenOccurrences occurrences;

  CibSevenStateProjector(
      ProcessEngine engine, Date logicalEpoch, boolean incidentsEnabled, boolean incidentsCancellable) {
    this.engine = engine;
    this.logicalEpoch = logicalEpoch;
    this.incidentsEnabled = incidentsEnabled;
    this.waits = new CibSevenOpenWaitProjector(engine, logicalEpoch, incidentsCancellable);
    this.occurrences = new CibSevenOccurrences(engine);
  }

  /** The occurrence numbering the executor reports its firings to. */
  CibSevenOccurrences occurrences() {
    return occurrences;
  }

  /** The open waits as commands see them, with their engine handles. */
  List<ProjectedWait> openWaits(String engineRootId, String stableRootId) {
    return waits.project(occurrences.running(engineRootId, stableRootId), occurrences).waits();
  }

  ObservedState observe(String engineRootId, String stableRootId, String afterCommandId) {
    var running =
        engine.getRuntimeService().createProcessInstanceQuery().processInstanceId(engineRootId).count();
    var history =
        engine.getHistoryService().createHistoricProcessInstanceQuery().processInstanceId(engineRootId).list();
    if (history.size() != 1) {
      throw new IllegalStateException("Process root requires exactly one historic Process instance");
    }
    var historicState = history.getFirst().getState();
    var engineClockTimeMs = ClockUtil.getCurrentTime().getTime();
    var projection = waits.project(occurrences.running(engineRootId, stableRootId), occurrences);
    var rawVariables = rootVariables(engineRootId);
    var variables =
        rawVariables.stream()
            .map(ScenarioVariableValueProjection::project)
            .sorted(Comparator.comparing(VariableBinding::name, WireStrings::compare))
            .toList();
    var state =
        new StateObservation(
            stableRootId,
            status(running == 1, historicState),
            engineClockTimeMs - logicalEpoch.getTime(),
            variables,
            null,
            projection.waits().stream().map(ProjectedWait::openWait).toList());
    return new ObservedState(
        state,
        new StateQuerySnapshot(afterCommandId, running, engineClockTimeMs, variables),
        new TaskQuerySnapshot(afterCommandId, projection.tasks()),
        new MessageSubscriptionSnapshot(afterCommandId, projection.subscriptions(), projection.addressless()),
        new TimerJobSnapshot(afterCommandId, projection.timers()),
        new EffectJobSnapshot(afterCommandId, projection.effects()),
        incidentsEnabled ? new IncidentJobSnapshot(afterCommandId, true, projection.incidents()) : null,
        new HistoricProcessStateSnapshot(afterCommandId, historicState));
  }

  /**
   * CIB records a terminate End Event as internal termination, which completes the instance; only an external
   * deletion cancels it.
   */
  private static ProcessStatus status(boolean running, String historicState) {
    if (running) {
      return ProcessStatus.RUNNING;
    }
    return switch (historicState) {
      case HistoricProcessInstance.STATE_COMPLETED, HistoricProcessInstance.STATE_INTERNALLY_TERMINATED ->
          ProcessStatus.COMPLETED;
      case HistoricProcessInstance.STATE_EXTERNALLY_TERMINATED -> ProcessStatus.CANCELLED;
      default -> throw new IllegalStateException("Ended Process has historic state " + historicState);
    };
  }

  /**
   * The root scope's variables, from history so that they stay observable after the instance ends. They are the ones
   * held by the process instance's own execution: a variable's history activity instance is its execution's parent
   * activity instance (`DefaultHistoryEventProducer#createHistoricVariableEvent`), which for a Sub-Process's input
   * locals, written as it enters, is still the root's. A task-local variable of a User Task in the root holds that
   * execution too, and belongs to the task.
   */
  private List<ProcessVariableSnapshot> rootVariables(String engineRootId) {
    return engine.getHistoryService().createHistoricVariableInstanceQuery()
        .processInstanceId(engineRootId).executionIdIn(engineRootId).list().stream()
        .filter(variable -> variable.getTaskId() == null)
        .map(variable -> new ProcessVariableSnapshot(variable.getName(), variable.getValue()))
        .sorted(Comparator.comparing(ProcessVariableSnapshot::name, WireStrings::compare))
        .toList();
  }

  CleanupProjection observeCleanup() {
    return new CleanupProjection(
        engine.getRepositoryService().createDeploymentQuery().count(),
        engine.getRepositoryService().createProcessDefinitionQuery().count(),
        engine.getRuntimeService().createProcessInstanceQuery().count(),
        engine.getTaskService().createTaskQuery().count(),
        engine.getManagementService().createJobQuery().count(),
        engine.getRuntimeService().createIncidentQuery().count(),
        engine.getHistoryService().createHistoricProcessInstanceQuery().count());
  }

  record ObservedState(
      StateObservation state,
      StateQuerySnapshot stateQuery,
      TaskQuerySnapshot taskQuery,
      MessageSubscriptionSnapshot messageSubscriptions,
      TimerJobSnapshot timerJobs,
      EffectJobSnapshot effectJobs,
      IncidentJobSnapshot incidentJobs,
      HistoricProcessStateSnapshot historicProcessState) {}
}
