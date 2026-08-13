package org.bpmnlean.cibseven;

import static org.bpmnlean.cibseven.ScenarioProtocol.WaitKind.INCIDENT;

import java.util.ArrayList;
import java.util.List;
import org.bpmnlean.cibseven.CibSevenIncidentProtocol.FailedJobIncident;
import org.bpmnlean.cibseven.CibSevenIncidentProtocol.IncidentJob;
import org.bpmnlean.cibseven.CibSevenIncidentProtocol.IncidentJobSnapshot;
import org.bpmnlean.cibseven.ScenarioInteractionProtocol.EnabledInteraction;
import org.bpmnlean.cibseven.ScenarioInteractionProtocol.CancelIncidentProcessInteraction;
import org.bpmnlean.cibseven.ScenarioInteractionProtocol.RetryIncidentInteraction;
import org.bpmnlean.cibseven.ScenarioProtocol.ActiveWait;
import org.bpmnlean.cibseven.ScenarioProtocol.EffectIncidentId;
import org.bpmnlean.cibseven.ScenarioProtocol.OpenEffect;
import org.bpmnlean.cibseven.ScenarioProtocol.OpenEffectIncident;
import org.cibseven.bpm.engine.ProcessEngine;

/** Partitions one configured failed Service Task job into effect or incident semantic state. */
final class CibSevenIncidentProjector {

  IncidentProjection project(
      String profile,
      ProcessEngine engine,
      String engineInstanceId,
      String afterCommandId,
      List<CibSevenEffectProjector.ProjectedEffectWait> effects,
      boolean incidentCreationEnabled) {
    var cancellationProfile = CibSevenScenarioRunner.CANCELLATION_PROFILE.equals(profile);
    if (!CibSevenScenarioRunner.INCIDENT_PROFILE.equals(profile) && !cancellationProfile) {
      if (incidentCreationEnabled) {
        throw new IllegalStateException("old profile leaked into incident-enabled engine");
      }
      return new IncidentProjection(
          effects.stream().map(CibSevenEffectProjector.ProjectedEffectWait::openEffect).toList(),
          List.of(),
          List.of(),
          List.of(),
          null);
    }
    if (!incidentCreationEnabled) {
      throw new IllegalStateException("incident profile requires enabled engine configuration");
    }
    if (effects.size() > 1) {
      throw new IllegalStateException("incident profile requires at most one live effect job");
    }
    var rawIncidents =
        engine
            .getRuntimeService()
            .createIncidentQuery()
            .processInstanceId(engineInstanceId)
            .list();
    if (effects.isEmpty()) {
      if (!rawIncidents.isEmpty()) {
        throw new IllegalStateException("incident has no live public job partner");
      }
      return new IncidentProjection(
          List.of(),
          List.of(),
          List.of(),
          List.of(),
          new IncidentJobSnapshot(afterCommandId, true, List.of()));
    }
    var effect = effects.getFirst();
    var management = engine.getManagementService();
    var job = management.createJobQuery().jobId(effect.jobId()).singleResult();
    if (job == null) {
      throw new IllegalStateException("effect projection lost its public job");
    }
    var matching =
        rawIncidents.stream()
            .filter(incident -> effect.jobId().equals(incident.getConfiguration()))
            .toList();
    if (rawIncidents.size() != matching.size() || matching.size() > 1) {
      throw new IllegalStateException("public job requires at most one exact incident partner");
    }
    var rawIncident =
        matching.isEmpty()
            ? null
            : new FailedJobIncident(
                matching.getFirst().getId(),
                matching.getFirst().getIncidentType(),
                matching.getFirst().getConfiguration(),
                matching.getFirst().getProcessInstanceId(),
                matching.getFirst().getActivityId(),
                matching.getFirst().getCauseIncidentId(),
                matching.getFirst().getRootCauseIncidentId());
    var rawJob =
        new IncidentJob(
            effect.jobId(),
            job.getRetries(),
            management.createJobQuery().jobId(effect.jobId()).executable().count() == 1,
            job.getDuedate() != null,
            job.getProcessInstanceId(),
            effect.openEffect().id().elementId(),
            rawIncident);
    var snapshot = new IncidentJobSnapshot(afterCommandId, true, List.of(rawJob));
    if (rawIncident == null) {
      if (job.getRetries() == 0) {
        throw new IllegalStateException("retries-zero job omitted its failed-job incident");
      }
      return new IncidentProjection(
          List.of(effect.openEffect()), List.of(), List.of(), List.of(), snapshot);
    }
    if (job.getRetries() != 0 || rawJob.executable()) {
      throw new IllegalStateException("failed-job incident requires one nonexecutable retries-zero job");
    }
    var incidentId = new EffectIncidentId(effect.openEffect().id(), 1);
    var openIncident =
        new OpenEffectIncident("effectExecutionFailed", incidentId, effect.openEffect());
    var enabledInteractions = new ArrayList<EnabledInteraction>();
    enabledInteractions.add(new RetryIncidentInteraction(incidentId));
    if (cancellationProfile) {
      enabledInteractions.add(
          new CancelIncidentProcessInteraction(
              effect.openEffect().id().processInstanceId(), incidentId));
    }
    return new IncidentProjection(
        List.of(),
        List.of(openIncident),
        enabledInteractions,
        List.of(new ActiveWait(effect.openEffect().id().elementId(), INCIDENT, 1)),
        snapshot);
  }

  record IncidentProjection(
      List<OpenEffect> openEffects,
      List<OpenEffectIncident> openIncidents,
      List<EnabledInteraction> enabledInteractions,
      List<ActiveWait> incidentWaits,
      IncidentJobSnapshot evidence) {
    IncidentProjection {
      openEffects = List.copyOf(openEffects);
      openIncidents = List.copyOf(openIncidents);
      enabledInteractions = List.copyOf(enabledInteractions);
      incidentWaits = List.copyOf(incidentWaits);
    }
  }
}
