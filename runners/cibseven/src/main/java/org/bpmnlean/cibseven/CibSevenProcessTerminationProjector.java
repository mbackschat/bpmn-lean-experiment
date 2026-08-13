package org.bpmnlean.cibseven;

import static org.bpmnlean.cibseven.ScenarioProtocol.ProcessStatus.CANCELLED;

import java.util.LinkedHashSet;
import java.util.List;
import org.bpmnlean.cibseven.CibStateQueryEvidence.ProcessVariableSnapshot;
import org.bpmnlean.cibseven.CibStateQueryEvidence.StateQuerySnapshot;
import org.bpmnlean.cibseven.ScenarioDiagnosticsProtocol.HistoricProcessStateSnapshot;
import org.bpmnlean.cibseven.ScenarioProtocol.BooleanValue;
import org.bpmnlean.cibseven.ScenarioProtocol.NullValue;
import org.bpmnlean.cibseven.ScenarioProtocol.StateObservation;
import org.bpmnlean.cibseven.ScenarioProtocol.StringValue;
import org.bpmnlean.cibseven.ScenarioProtocol.VariableBinding;
import org.cibseven.bpm.engine.ProcessEngine;
import org.cibseven.bpm.engine.history.HistoricProcessInstance;

/** Projects cancellation only from positive external-termination and preservation evidence. */
final class CibSevenProcessTerminationProjector {

  HistoricProcessStateSnapshot projectRunningHistory(
      ProcessEngine engine, String rawRootId, String afterCommandId) {
    var histories =
        engine
            .getHistoryService()
            .createHistoricProcessInstanceQuery()
            .processInstanceId(rawRootId)
            .list();
    if (histories.size() != 1) {
      throw new IllegalStateException("running Process requires one historic Process root");
    }
    var history = histories.getFirst();
    if (!rawRootId.equals(history.getId())
        || !rawRootId.equals(history.getRootProcessInstanceId())
        || !HistoricProcessInstance.STATE_ACTIVE.equals(history.getState())) {
      throw new IllegalStateException("running Process requires exact active root history");
    }
    return new HistoricProcessStateSnapshot(afterCommandId, history.getState());
  }

  TerminatedProcessProjection project(
      ProcessEngine engine,
      String rawRootId,
      String stableInstanceId,
      String afterCommandId,
      Iterable<String> committedVariableNames,
      long engineClockTimeMs,
      long logicalTimeMs) {
    var names = new LinkedHashSet<String>();
    committedVariableNames.forEach(names::add);
    var rawVariables =
        names.stream()
            .flatMap(
                name ->
                    engine
                        .getHistoryService()
                        .createHistoricVariableInstanceQuery()
                        .processInstanceId(rawRootId)
                        .variableName(name)
                        .list()
                        .stream()
                        .map(variable -> new ProcessVariableSnapshot(variable.getName(), variable.getValue())))
            .toList();
    var historicProcesses =
        engine
            .getHistoryService()
            .createHistoricProcessInstanceQuery()
            .processInstanceId(rawRootId)
            .list()
            .stream()
            .map(
                process ->
                    new HistoricProcessFact(
                        process.getId(), process.getRootProcessInstanceId(), process.getState()))
            .toList();
    return projectFacts(
        stableInstanceId,
        afterCommandId,
        names,
        engineClockTimeMs,
        logicalTimeMs,
        new TerminationFacts(
            engine
                .getRuntimeService()
                .createProcessInstanceQuery()
                .list()
                .stream()
                .filter(process -> rawRootId.equals(process.getRootProcessInstanceId()))
                .count(),
            engine
                .getManagementService()
                .createJobQuery()
                .rootProcessInstanceId(rawRootId)
                .count(),
            engine
                .getRuntimeService()
                .createIncidentQuery()
                .processInstanceId(rawRootId)
                .count(),
            engine
                .getTaskService()
                .createTaskQuery()
                .processInstanceId(rawRootId)
                .count(),
            engine
                .getRuntimeService()
                .createExecutionQuery()
                .processInstanceId(rawRootId)
                .count(),
            rawRootId,
            historicProcesses,
            rawVariables));
  }

  static TerminatedProcessProjection projectFacts(
      String stableInstanceId,
      String afterCommandId,
      Iterable<String> committedVariableNames,
      long engineClockTimeMs,
      long logicalTimeMs,
      TerminationFacts facts) {
    if (facts.processInstances() != 0
        || facts.jobs() != 0
        || facts.incidents() != 0
        || facts.tasks() != 0
        || facts.executions() != 0) {
      throw new IllegalStateException("cancelled Process retained live CIB runtime state");
    }
    if (facts.historicProcesses().size() != 1) {
      throw new IllegalStateException("cancelled Process requires one historic Process root");
    }
    var history = facts.historicProcesses().getFirst();
    if (!facts.rawRootId().equals(history.id())
        || !facts.rawRootId().equals(history.rootProcessInstanceId())
        || !HistoricProcessInstance.STATE_EXTERNALLY_TERMINATED.equals(history.state())) {
      throw new IllegalStateException(
          "cancelled Process requires exact externally terminated root history");
    }

    var expectedNames = new LinkedHashSet<String>();
    committedVariableNames.forEach(expectedNames::add);
    var actualNames =
        facts.variables().stream()
            .map(ProcessVariableSnapshot::name)
            .collect(java.util.stream.Collectors.toCollection(LinkedHashSet::new));
    if (expectedNames.isEmpty()
        || expectedNames.size() != facts.variables().size()
        || !expectedNames.equals(actualNames)) {
      throw new IllegalStateException(
          "cancelled Process must preserve every committed Process variable exactly once");
    }
    var preserved =
        facts.variables().stream()
            .filter(variable -> "preserved".equals(variable.name()))
            .toList();
    if (preserved.size() != 1 || !"before-cancel".equals(preserved.getFirst().value())) {
      throw new IllegalStateException(
          "cancellation witness requires the committed preserved string variable");
    }
    var variables =
        facts.variables().stream()
            .map(CibSevenProcessTerminationProjector::projectVariable)
            .sorted((left, right) -> WireStrings.compare(left.name(), right.name()))
            .toList();
    return new TerminatedProcessProjection(
        new StateObservation(
            stableInstanceId,
            CANCELLED,
            List.of(),
            List.of(),
            List.of(),
            List.of(),
            List.of(),
            List.of(),
            variables,
            List.of(),
            logicalTimeMs),
        new StateQuerySnapshot(afterCommandId, 0, engineClockTimeMs, facts.variables()),
        new HistoricProcessStateSnapshot(afterCommandId, history.state()));
  }

  private static VariableBinding projectVariable(ProcessVariableSnapshot variable) {
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

  record TerminatedProcessProjection(
      StateObservation state,
      StateQuerySnapshot stateQuery,
      HistoricProcessStateSnapshot historicProcessState) {}

  record HistoricProcessFact(String id, String rootProcessInstanceId, String state) {}

  record TerminationFacts(
      long processInstances,
      long jobs,
      long incidents,
      long tasks,
      long executions,
      String rawRootId,
      List<HistoricProcessFact> historicProcesses,
      List<ProcessVariableSnapshot> variables) {
    TerminationFacts {
      historicProcesses = List.copyOf(historicProcesses);
      variables = List.copyOf(variables);
    }
  }
}
