package org.bpmnlean.cibseven;

import static org.bpmnlean.cibseven.ScenarioProtocol.CommandOutcome.COMMITTED;
import static org.bpmnlean.cibseven.ScenarioProtocol.CommandOutcome.REJECTED;

import org.bpmnlean.cibseven.ScenarioProtocol.CommandOutcome;
import org.bpmnlean.cibseven.ScenarioDiagnosticsProtocol.EffectExecutionSnapshot;
import org.bpmnlean.cibseven.ScenarioProtocol.ReportEffectFailureStimulus;
import org.bpmnlean.cibseven.ScenarioProtocol.RetryIncidentStimulus;
import org.cibseven.bpm.engine.ProcessEngine;

/** Executes the bounded public CIB failed-job report and retry-reset lifecycle. */
final class CibSevenIncidentCommandExecutor {

  private final ProcessEngine engine;
  private final CibSevenEffectProjector effectProjector;
  private final CibSevenEffectProbe effectProbe;

  CibSevenIncidentCommandExecutor(
      ProcessEngine engine,
      CibSevenEffectProjector effectProjector,
      CibSevenEffectProbe effectProbe) {
    this.engine = engine;
    this.effectProjector = effectProjector;
    this.effectProbe = effectProbe;
  }

  IncidentReportExecution report(
      String engineInstanceId,
      String stableInstanceId,
      ReportEffectFailureStimulus report,
      CibEffectExecutionSchedule schedule) {
    var wait = matchingWait(engineInstanceId, stableInstanceId, report.effectId());
    if (wait == null || incidentCount(engineInstanceId) != 0) {
      return new IncidentReportExecution(REJECTED, null);
    }
    var management = engine.getManagementService();
    var initialRetries = wait.evidence().retries();
    Long retriesAfterFirstFailure = null;
    while (true) {
      var job = management.createJobQuery().jobId(wait.jobId()).singleResult();
      if (job == null) {
        throw new IllegalStateException("incident report unexpectedly completed the effect job");
      }
      if (job.getRetries() == 0) {
        break;
      }
      var before = job.getRetries();
      try {
        management.executeJob(wait.jobId());
        throw new IllegalStateException("incident report schedule unexpectedly succeeded");
      } catch (RuntimeException failure) {
        if ("incident report schedule unexpectedly succeeded".equals(failure.getMessage())) {
          throw failure;
        }
        var failed = management.createJobQuery().jobId(wait.jobId()).singleResult();
        if (failed == null || failed.getRetries() != before - 1) {
          throw new IllegalStateException("CIB did not decrement the failed public job", failure);
        }
        if (retriesAfterFirstFailure == null) {
          retriesAfterFirstFailure = (long) failed.getRetries();
        }
      }
    }
    var incidents =
        engine
            .getRuntimeService()
            .createIncidentQuery()
            .processInstanceId(engineInstanceId)
            .list();
    if (incidents.size() != 1
        || !wait.jobId().equals(incidents.getFirst().getConfiguration())) {
      throw new IllegalStateException("CIB did not create one matching failed-job incident");
    }
    return new IncidentReportExecution(
        COMMITTED,
        new EffectExecutionSnapshot(
            report.commandId(),
            schedule.wireValue(),
            effectProbe.invocations(),
            effectProbe.mutations(),
            initialRetries,
            retriesAfterFirstFailure));
  }

  CommandOutcome retry(
      String engineInstanceId,
      String stableInstanceId,
      RetryIncidentStimulus retry) {
    var wait =
        matchingWait(
            engineInstanceId,
            stableInstanceId,
            retry.incidentId().effectId());
    if (wait == null) {
      return REJECTED;
    }
    var incidents =
        engine
            .getRuntimeService()
            .createIncidentQuery()
            .processInstanceId(engineInstanceId)
            .list();
    if (incidents.size() != 1
        || !wait.jobId().equals(incidents.getFirst().getConfiguration())) {
      return REJECTED;
    }
    engine.getManagementService().setJobRetries(wait.jobId(), 1);
    if (incidentCount(engineInstanceId) != 0) {
      throw new IllegalStateException("public retry reset did not resolve the incident");
    }
    effectProbe.beginIncidentRetry();
    return COMMITTED;
  }

  private CibSevenEffectProjector.ProjectedEffectWait matchingWait(
      String engineInstanceId,
      String stableInstanceId,
      ScenarioProtocol.EffectOccurrenceId submitted) {
    if (!stableInstanceId.equals(submitted.processInstanceId()) || submitted.activation() != 1) {
      return null;
    }
    var waits = effectProjector.project(engine, engineInstanceId, stableInstanceId);
    return waits.size() == 1 && waits.getFirst().openEffect().id().equals(submitted)
        ? waits.getFirst()
        : null;
  }

  private long incidentCount(String engineInstanceId) {
    return engine
        .getRuntimeService()
        .createIncidentQuery()
        .processInstanceId(engineInstanceId)
        .count();
  }

  record IncidentReportExecution(
      CommandOutcome outcome, EffectExecutionSnapshot evidence) {}
}
