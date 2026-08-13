package org.bpmnlean.cibseven;

import static org.junit.Assert.assertThrows;

import java.nio.file.Path;
import org.bpmnlean.cibseven.ScenarioProtocol.ScenarioDefinition;
import org.junit.Test;

/** Proves the configured incident engine and schedule are selected as one closed pair. */
public final class CibSevenIncidentScheduleAlignmentTest {

  private static final Path PROJECT_ROOT = Path.of("../..").toAbsolutePath().normalize();
  private static final Path SCENARIO_PATH =
      PROJECT_ROOT.resolve("scenarios/service-task-effect/scenario.json");

  @Test
  public void rejectsIncidentScheduleForOldProfileAndPlainScheduleForSuccessor() throws Exception {
    var oldScenario = ScenarioJson.read(SCENARIO_PATH);
    var successor =
        new ScenarioDefinition(
            oldScenario.kind(),
            "service-task-incident-alignment",
            CibSevenScenarioRunner.INCIDENT_PROFILE,
            oldScenario.bpmn(),
            oldScenario.stimuli(),
            oldScenario.observations(),
            oldScenario.provenance());
    try (var runner = CibSevenScenarioRunner.create()) {
      assertThrows(
          IllegalArgumentException.class,
          () ->
              runner.run(
                  oldScenario,
                  PROJECT_ROOT,
                  CibEffectExecutionSchedule.INCIDENT_REPORT_RETRY_SUCCESS));
      assertThrows(
          IllegalArgumentException.class,
          () -> runner.run(successor, PROJECT_ROOT, CibEffectExecutionSchedule.PLAIN_SUCCESS));
    }
  }
}
