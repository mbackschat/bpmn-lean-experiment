package org.bpmnlean.cibseven;

import java.util.ArrayList;
import java.util.List;
import org.bpmnlean.cibseven.CibStateQueryEvidence.MessageSubscriptionSnapshot;
import org.bpmnlean.cibseven.CibStateQueryEvidence.StateQuerySnapshot;
import org.bpmnlean.cibseven.CibSevenIncidentProtocol.IncidentJobSnapshot;
import org.bpmnlean.cibseven.ScenarioDiagnosticsProtocol.EffectJobSnapshot;
import org.bpmnlean.cibseven.ScenarioDiagnosticsProtocol.HistoricProcessStateSnapshot;
import org.bpmnlean.cibseven.ScenarioDiagnosticsProtocol.TaskQuerySnapshot;
import org.bpmnlean.cibseven.ScenarioDiagnosticsProtocol.TimerJobSnapshot;

/** Collects the aligned raw snapshots emitted after each canonical state observation. */
final class CibSevenObservationEvidence {

  private final List<StateQuerySnapshot> stateQueries = new ArrayList<>();
  private final List<TaskQuerySnapshot> taskQueries = new ArrayList<>();
  private final List<MessageSubscriptionSnapshot> messageSubscriptions = new ArrayList<>();
  private final List<TimerJobSnapshot> timerJobs = new ArrayList<>();
  private final List<EffectJobSnapshot> effectJobs = new ArrayList<>();
  private final List<IncidentJobSnapshot> incidentJobs = new ArrayList<>();
  private final List<HistoricProcessStateSnapshot> historicProcessStates = new ArrayList<>();

  void add(CibSevenScenarioStateProjector.ObservedState observed) {
    stateQueries.add(observed.stateQuery());
    taskQueries.add(observed.taskQuery());
    messageSubscriptions.add(observed.messageSubscriptions());
    timerJobs.add(observed.timerJobs());
    effectJobs.add(observed.effectJobs());
    if (observed.incidentJobs() != null) {
      incidentJobs.add(observed.incidentJobs());
    }
    if (observed.historicProcessState() != null) {
      historicProcessStates.add(observed.historicProcessState());
    }
  }

  List<StateQuerySnapshot> stateQueries() {
    return List.copyOf(stateQueries);
  }

  List<TaskQuerySnapshot> taskQueries() {
    return List.copyOf(taskQueries);
  }

  List<MessageSubscriptionSnapshot> messageSubscriptions() {
    return List.copyOf(messageSubscriptions);
  }

  List<TimerJobSnapshot> timerJobs() {
    return List.copyOf(timerJobs);
  }

  List<EffectJobSnapshot> effectJobs() {
    return List.copyOf(effectJobs);
  }

  List<IncidentJobSnapshot> incidentJobs() {
    return List.copyOf(incidentJobs);
  }

  List<HistoricProcessStateSnapshot> historicProcessStates() {
    return List.copyOf(historicProcessStates);
  }
}
