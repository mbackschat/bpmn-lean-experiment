package org.bpmnlean.cibseven;

import static org.bpmnlean.cibseven.ScenarioProtocol.CommandOutcome.COMMITTED;
import static org.bpmnlean.cibseven.ScenarioProtocol.CommandOutcome.REJECTED;

import java.util.List;
import org.bpmnlean.cibseven.CibSevenIncidentProtocol.FailedJobIncident;
import org.bpmnlean.cibseven.CibSevenIncidentProtocol.IncidentJob;
import org.bpmnlean.cibseven.ScenarioProtocol.CancelIncidentProcessStimulus;
import org.bpmnlean.cibseven.ScenarioProtocol.CommandOutcome;
import org.bpmnlean.cibseven.ScenarioProtocol.EffectOccurrenceId;
import org.cibseven.bpm.engine.ProcessEngine;

/** Resolves and deletes only the raw root addressed by one exact public incident partner. */
final class CibSevenIncidentCancellationCommandExecutor {

  private static final String PRIVATE_DELETE_REASON = "bpmn-lean-incident-root-cancellation";

  private final ProcessEngine engine;
  private final CibSevenEffectProjector effectProjector;
  private final boolean incidentCreationEnabled;

  CibSevenIncidentCancellationCommandExecutor(
      ProcessEngine engine,
      CibSevenEffectProjector effectProjector,
      boolean incidentCreationEnabled) {
    this.engine = engine;
    this.effectProjector = effectProjector;
    this.incidentCreationEnabled = incidentCreationEnabled;
  }

  CommandOutcome cancel(
      String profile,
      String engineInstanceId,
      String stableInstanceId,
      CancelIncidentProcessStimulus cancellation) {
    if (!CibSevenScenarioRunner.CANCELLATION_PROFILE.equals(profile)) {
      return REJECTED;
    }
    if (!incidentCreationEnabled) {
      throw new IllegalStateException("cancellation profile requires enabled incident configuration");
    }
    if (!stableInstanceId.equals(cancellation.processInstanceId())
        || !stableInstanceId.equals(
            cancellation.incidentId().effectId().processInstanceId())) {
      return REJECTED;
    }

    var waits = effectProjector.project(engine, engineInstanceId, stableInstanceId);
    if (waits.size() != 1
        || !waits.getFirst().openEffect().id().equals(cancellation.incidentId().effectId())) {
      return REJECTED;
    }
    var rootCandidates =
        engine
            .getRuntimeService()
            .createProcessInstanceQuery()
            .processInstanceId(engineInstanceId)
            .list();
    if (rootCandidates.size() != 1) {
      return REJECTED;
    }
    var rawProcess = rootCandidates.getFirst();
    var rawRootId = rawProcess.getRootProcessInstanceId();

    var wait = waits.getFirst();
    var job = engine.getManagementService().createJobQuery().jobId(wait.jobId()).singleResult();
    if (job == null) {
      throw new IllegalStateException("cancellation incident lost its public job partner");
    }
    var incidents =
        engine
            .getRuntimeService()
            .createIncidentQuery()
            .processInstanceId(engineInstanceId)
            .list();
    var rawIncidentPartners =
        incidents.stream()
            .map(
                incident ->
                    new FailedJobIncident(
                        incident.getId(),
                        incident.getIncidentType(),
                        incident.getConfiguration(),
                        incident.getProcessInstanceId(),
                        incident.getActivityId(),
                        incident.getCauseIncidentId(),
                        incident.getRootCauseIncidentId()))
            .toList();
    var candidateJobs =
        rawIncidentPartners.stream()
            .map(
                incident ->
                    new IncidentJob(
                        wait.jobId(),
                        job.getRetries(),
                        engine.getManagementService().createJobQuery().jobId(wait.jobId()).executable().count()
                            == 1,
                        job.getDuedate() != null,
                        job.getProcessInstanceId(),
                        wait.openEffect().id().elementId(),
                        incident))
            .toList();
    requireExactCandidate(
        new CancellationCandidate(
            rawProcess.getId(),
            rawRootId,
            cancellation.incidentId().effectId(),
            candidateJobs));

    engine
        .getRuntimeService()
        .deleteProcessInstance(rawRootId, PRIVATE_DELETE_REASON, false, true);
    return COMMITTED;
  }

  static void requireExactCandidate(CancellationCandidate candidate) {
    if (candidate.rawProcessId() == null
        || !candidate.rawProcessId().equals(candidate.rawRootId())
        || candidate.jobs().size() != 1) {
      throw new IllegalStateException("cancellation requires one exact raw hosting root and partner");
    }
    var job = candidate.jobs().getFirst();
    if (job.retries() != 0
        || job.executable()
        || job.incident() == null
        || !candidate.rawRootId().equals(job.processInstanceId())
        || !candidate.effectId().elementId().equals(job.elementId())) {
      throw new IllegalStateException(
          "cancellation requires one nonexecutable retries-zero incident job on the root");
    }
  }

  record CancellationCandidate(
      String rawProcessId,
      String rawRootId,
      EffectOccurrenceId effectId,
      List<IncidentJob> jobs) {
    CancellationCandidate {
      jobs = List.copyOf(jobs);
    }
  }
}
