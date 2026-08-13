package org.bpmnlean.cibseven;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

import java.nio.file.Path;
import org.bpmnlean.cibseven.CibSevenIncidentProtocol.FailedJobIncident;
import org.bpmnlean.cibseven.CibSevenIncidentProtocol.IncidentJob;
import org.bpmnlean.cibseven.ScenarioInteractionProtocol.RetryIncidentInteraction;
import org.bpmnlean.cibseven.ScenarioProtocol.StateObservation;
import org.bpmnlean.cibseven.ScenarioProtocol.WaitKind;
import org.junit.Test;

/** Locks the configured CIB failed-job incident partition and one exact public retry reset. */
public final class CibSevenIncidentRunnerTest {

  private static final Path PROJECT_ROOT = Path.of("../..").toAbsolutePath().normalize();
  private static final Path SCENARIO =
      PROJECT_ROOT.resolve("scenarios/service-task-incident/scenario.json");

  @Test
  public void reportsRetriesAndCompletesTheSameEffectOccurrence() throws Exception {
    try (var runner = CibSevenScenarioRunner.create()) {
      var result =
          runner.run(
              ScenarioJson.read(SCENARIO),
              PROJECT_ROOT,
              CibEffectExecutionSchedule.INCIDENT_REPORT_RETRY_SUCCESS);

      var initial = (StateObservation) result.trace().get(2);
      var incident = (StateObservation) result.trace().get(4);
      var retried = (StateObservation) result.trace().get(6);
      var completed = (StateObservation) result.trace().get(8);
      assertEquals(initial.openEffects().getFirst(), retried.openEffects().getFirst());
      assertEquals(WaitKind.INCIDENT, incident.activeWaits().getFirst().kind());
      assertTrue(incident.openEffects().isEmpty());
      assertEquals(initial.openEffects().getFirst(), incident.openIncidents().getFirst().effect());
      assertEquals(
          incident.openIncidents().getFirst().id().effectId(),
          incident.openIncidents().getFirst().effect().id());
      assertEquals(
          incident.openIncidents().getFirst().id(),
          ((RetryIncidentInteraction) incident.enabledInteractions().getFirst()).incidentId());
      assertTrue(completed.openEffects().isEmpty());
      assertTrue(completed.openIncidents().isEmpty());

      var raw = result.diagnostics().incidentJobs();
      assertEquals(4, raw.size());
      assertEquals(3, raw.get(0).jobs().getFirst().retries());
      assertEquals(0, raw.get(1).jobs().getFirst().retries());
      assertEquals(
          raw.get(1).jobs().getFirst().publicJobId(),
          raw.get(1).jobs().getFirst().incident().configurationJobId());
      assertEquals(1, raw.get(2).jobs().getFirst().retries());
      assertTrue(raw.get(3).jobs().isEmpty());
      assertEquals(0, result.diagnostics().cleanup().incidents());
    }
  }

  @Test
  public void refusesRawIncidentWhoseConfigurationNamesAnotherJob() {
    var incident =
        new FailedJobIncident(
            "incident-1",
            "failedJob",
            "job-2",
            "process-1",
            "ServiceTask_Record",
            "incident-1",
            "incident-1");
    assertThrows(
        IllegalArgumentException.class,
        () ->
            new IncidentJob(
                "job-1",
                0,
                false,
                false,
                "process-1",
                "ServiceTask_Record",
                incident));
  }
}
