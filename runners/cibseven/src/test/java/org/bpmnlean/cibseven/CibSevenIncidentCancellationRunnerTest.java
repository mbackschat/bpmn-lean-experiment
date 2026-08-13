package org.bpmnlean.cibseven;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

import java.nio.file.Path;
import org.bpmnlean.cibseven.ScenarioProtocol.StateObservation;
import org.junit.Test;

/** Locks incident-gated external root cancellation and its positive history discriminator. */
public final class CibSevenIncidentCancellationRunnerTest {

  private static final Path PROJECT_ROOT = Path.of("../..").toAbsolutePath().normalize();
  private static final String CANCELLATION_PROFILE =
      "cibseven-2.2.0-service-task-incident-cancellation-draft";

  @Test
  public void cancelsOnlyTheIncidentRootAndProjectsExternallyTerminatedHistory() throws Exception {
    var scenario =
        ScenarioJson.read(
            PROJECT_ROOT.resolve("scenarios/service-task-incident-cancellation/scenario.json"));
    try (var runner = CibSevenScenarioRunner.create()) {
      var result =
          runner.run(
              scenario,
              PROJECT_ROOT,
              CibEffectExecutionSchedule.fromWireValue("incidentReportCancel"));

      assertEquals("committed", result.outcome() instanceof ScenarioProtocol.SemanticOutcome outcome
          ? outcome.outcome().wireValue()
          : "non-semantic");
      var incident = (StateObservation) result.trace().get(4);
      assertEquals(2, incident.enabledInteractions().size());
      var encoded = ScenarioJson.write(result);
      assertTrue(encoded.indexOf("\"kind\":\"retryIncident\"")
          < encoded.indexOf("\"kind\":\"cancelIncidentProcess\""));

      var cancelled = (StateObservation) result.trace().get(6);
      assertEquals("cancelled", cancelled.status().wireValue());
      assertTrue(cancelled.activeWaits().isEmpty());
      assertTrue(cancelled.openEffects().isEmpty());
      assertTrue(cancelled.openIncidents().isEmpty());
      assertTrue(cancelled.enabledInteractions().isEmpty());
      assertEquals("preserved", cancelled.variables().getFirst().name());
      assertEquals(
          "before-cancel",
          ((ScenarioProtocol.StringValue) cancelled.variables().getFirst().value()).value());

      var historicStates = result.diagnostics().historicProcessStates();
      assertEquals(3, historicStates.size());
      assertEquals("ACTIVE", historicStates.get(0).state());
      assertEquals("ACTIVE", historicStates.get(1).state());
      assertEquals("EXTERNALLY_TERMINATED", historicStates.get(2).state());
      assertEquals(
          "incidentReportCancel",
          result.diagnostics().effectExecutions().getFirst().schedule());
      assertEquals(3, result.diagnostics().effectExecutions().getFirst().invocations());
      assertEquals(
          ScenarioDiagnosticsProtocol.CleanupProjection.clean(), result.diagnostics().cleanup());
    }
  }

  @Test
  public void refusesWrongStableRootAndIncidentIdentityWithoutDeletingTheProcess()
      throws Exception {
    var wrongRoot =
        ScenarioJson.read(cancellationScenario(CANCELLATION_PROFILE, "Wrong", "Instance_1"));
    var wrongIncident =
        ScenarioJson.read(cancellationScenario(CANCELLATION_PROFILE, "Instance_1", "Wrong"));
    try (var runner = CibSevenScenarioRunner.create()) {
      var wrongRootResult =
          runner.run(wrongRoot, PROJECT_ROOT, CibEffectExecutionSchedule.INCIDENT_REPORT_CANCEL);
      var wrongIncidentResult =
          runner.run(wrongIncident, PROJECT_ROOT, CibEffectExecutionSchedule.INCIDENT_REPORT_CANCEL);

      assertEquals("rejected", ((ScenarioProtocol.SemanticOutcome) wrongRootResult.outcome())
          .outcome().wireValue());
      assertEquals(wrongRootResult.trace().get(4), wrongRootResult.trace().get(6));
      assertEquals("rejected", ((ScenarioProtocol.SemanticOutcome) wrongIncidentResult.outcome())
          .outcome().wireValue());
      assertEquals(wrongIncidentResult.trace().get(4), wrongIncidentResult.trace().get(6));
    }
  }

  @Test
  public void refusesWrongProfileScheduleAndIncidentConfiguration() throws Exception {
    var cancellation =
        ScenarioJson.read(cancellationScenario(CANCELLATION_PROFILE, "Instance_1", "Instance_1"));
    var wrongProfile =
        ScenarioJson.read(
            cancellationScenario(
                CibSevenScenarioRunner.INCIDENT_PROFILE, "Instance_1", "Instance_1"));
    try (var runner = CibSevenScenarioRunner.create()) {
      assertThrows(
          IllegalArgumentException.class,
          () -> runner.run(cancellation, PROJECT_ROOT, CibEffectExecutionSchedule.PLAIN_SUCCESS));
      assertThrows(
          IllegalArgumentException.class,
          () -> runner.run(
              cancellation,
              PROJECT_ROOT,
              CibEffectExecutionSchedule.INCIDENT_REPORT_RETRY_SUCCESS));
      assertThrows(
          IllegalArgumentException.class,
          () -> runner.run(
              wrongProfile,
              PROJECT_ROOT,
              CibEffectExecutionSchedule.INCIDENT_REPORT_CANCEL));
    }
    try (var wrongConfiguration = CibSevenEngineScenarioRunner.create(false)) {
      assertThrows(
          IllegalStateException.class,
          () -> wrongConfiguration.run(
              cancellation,
              PROJECT_ROOT,
              CibEffectExecutionSchedule.INCIDENT_REPORT_CANCEL));
    }
  }

  @Test
  public void omitsCancellationDiagnosticsFromThePredecessorProfile() throws Exception {
    var predecessor =
        ScenarioJson.read(PROJECT_ROOT.resolve("scenarios/service-task-incident/scenario.json"));
    try (var runner = CibSevenScenarioRunner.create()) {
      var result =
          runner.run(
              predecessor,
              PROJECT_ROOT,
              CibEffectExecutionSchedule.INCIDENT_REPORT_RETRY_SUCCESS);
      assertFalse(ScenarioJson.write(result).contains("historicProcessStates"));
    }
  }

  private static String cancellationScenario(
      String profile, String cancellationProcessInstanceId, String incidentProcessInstanceId) {
    return """
        {
          "kind": "scenario",
          "id": "service-task-incident-cancellation",
          "profile": "%s",
          "bpmn": {
            "id": "service-task-effect-phase-zero-probe",
            "relativePath": "scenarios/service-task-effect/process.bpmn",
            "sha256": "669083696c1706836fcaa487f7f5623408f658fb721145a8111a8b00b7fd7c7d",
            "sourceOverlay": null
          },
          "stimuli": [
            {
              "kind": "startProcess",
              "commandId": "start-process",
              "processId": "Process_ServiceTaskEffectProbe",
              "instanceId": "Instance_1",
              "initialVariables": [
                {"name": "preserved", "value": {"kind": "string", "value": "before-cancel"}}
              ]
            },
            {
              "kind": "reportEffectFailure",
              "commandId": "report-effect-failure",
              "effectId": {
                "processInstanceId": "Instance_1",
                "elementId": "ServiceTask_Record",
                "activation": 1
              },
              "generation": 1
            },
            {
              "kind": "cancelIncidentProcess",
              "commandId": "cancel-incident-process",
              "processInstanceId": "%s",
              "incidentId": {
                "effectId": {
                  "processInstanceId": "%s",
                  "elementId": "ServiceTask_Record",
                  "activation": 1
                },
                "generation": 1
              }
            }
          ],
          "observations": [
            "deployment",
            "commandResults",
            "processStatus",
            "activeWaits",
            "openUserTasks",
            "openTimers",
            "openEffects",
            "variables",
            "enabledInteractions",
            "logicalTime"
          ],
          "provenance": {
            "normativeRefs": [],
            "cibRevision": "834a9874760de8a0107f7c1b32806e37f17fb017",
            "cibRefs": []
          }
        }
        """.formatted(profile, cancellationProcessInstanceId, incidentProcessInstanceId);
  }
}
