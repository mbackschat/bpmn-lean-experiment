package org.bpmnlean.cibseven;

import static org.bpmnlean.cibseven.ScenarioProtocol.CommandOutcome.COMMITTED;
import static org.bpmnlean.cibseven.ScenarioProtocol.ProcessStatus.COMPLETED;
import static org.bpmnlean.cibseven.ScenarioProtocol.ProcessStatus.RUNNING;
import static org.bpmnlean.cibseven.ScenarioProtocol.WaitKind.TIMER;
import static org.junit.Assert.assertEquals;

import java.nio.file.Path;
import java.util.List;
import org.bpmnlean.cibseven.ScenarioProtocol.ActiveWait;
import org.bpmnlean.cibseven.ScenarioProtocol.CommandObservation;
import org.bpmnlean.cibseven.ScenarioProtocol.DeploymentObservation;
import org.bpmnlean.cibseven.ScenarioProtocol.OpenTimer;
import org.bpmnlean.cibseven.ScenarioProtocol.SemanticOutcome;
import org.bpmnlean.cibseven.ScenarioProtocol.StateObservation;
import org.bpmnlean.cibseven.ScenarioDiagnosticsProtocol.TimerJob;
import org.bpmnlean.cibseven.ScenarioDiagnosticsProtocol.TimerJobSnapshot;
import org.bpmnlean.cibseven.ScenarioProtocol.TimerOccurrenceId;
import org.junit.Test;

/**
 * Locks the controlled-clock oracle account: the wait and due transition are engine-observed,
 * while the logical deadline is reconstructed from the job due-date delta.
 */
public class CibSevenIntermediateCatchTimerTest {

  private static final Path PROJECT_ROOT = Path.of("../..").toAbsolutePath().normalize();
  private static final Path SCENARIO_PATH =
      PROJECT_ROOT.resolve("scenarios/intermediate-catch-timer/scenario.json");
  private static final String FIRE_COMMAND_ID =
      "fire-timer-sha256:6abd9ffaf10c2bcefd54580956fd16ca64043ce25367c6f8a5b697033bca5c3b";

  @Test
  public void firesOnlyAfterControlledClockMakesTheTimerJobExecutable()
      throws Exception {
    var scenario = ScenarioJson.read(SCENARIO_PATH);
    var timerId = new TimerOccurrenceId("Instance_1", "TimerCatch_PT1S", 1);

    try (var runner = CibSevenScenarioRunner.create()) {
      var result = runner.run(scenario, PROJECT_ROOT);

      assertEquals(new SemanticOutcome(COMMITTED), result.outcome());
      assertEquals(
          List.of(
              new DeploymentObservation(COMMITTED),
              new CommandObservation("start-process", COMMITTED),
              new StateObservation(
                  "Instance_1",
                  RUNNING,
                  List.of(new ActiveWait("TimerCatch_PT1S", TIMER, 1)),
                  List.of(),
                  List.of(),
                  List.of(new OpenTimer(timerId, 1000)),
                  List.of(),
                  List.of(),
                  List.of(),
                  List.of(),
                  0),
              new CommandObservation(FIRE_COMMAND_ID, COMMITTED),
              new StateObservation(
                  "Instance_1",
                  COMPLETED,
                  List.of(),
                  List.of(),
                  List.of(),
                  List.of(),
                  List.of(),
                  List.of(),
                  List.of(),
                  List.of(),
                  1000)),
          result.trace());
      assertEquals(
          List.of(
              new TimerJobSnapshot(
                  "start-process",
                  List.of(new TimerJob("TimerCatch_PT1S", 1000, false))),
              new TimerJobSnapshot(FIRE_COMMAND_ID, List.of())),
          result.diagnostics().timerJobs());
      assertEquals(ScenarioDiagnosticsProtocol.CleanupProjection.clean(), result.diagnostics().cleanup());
    }
  }

  /**
   * Two lexemes of one exact duration reach one due date: CIB's `DurationHelper` reads both through
   * `javax.xml.datatype.Duration`, which the project's exact-duration owner mirrors (TED-PARSE-01).
   */
  @Test
  public void exactHourAndMinuteDurationsShareOneDueDate() throws Exception {
    assertSingleTimerDueAfter("pt1h30m", "TimerCatch_PT1H30M",
        "fire-timer-sha256:0b22c401e192e10af4f72585179aa3722971481b7fd87be3aee3028030dfe966", 5_400_000);
    assertSingleTimerDueAfter("pt90m", "TimerCatch_PT90M",
        "fire-timer-sha256:7e005eba3c85e677c23926e816457e49ad3cb15618b082aa84583f4bf4f5f8bf", 5_400_000);
  }

  private static void assertSingleTimerDueAfter(
      String suffix, String elementId, String fireCommandId, long durationMs) throws Exception {
    var name = "intermediate-catch-timer-" + suffix;
    var scenario = ScenarioJson.read(PROJECT_ROOT.resolve(
        "packages/bpmn-source/test/fixtures/intermediate-catch-timer-durations/" + suffix + "/scenario.json"));
    var timerId = new TimerOccurrenceId("Instance_1", elementId, 1);
    try (var runner = CibSevenScenarioRunner.create()) {
      var result = runner.run(scenario, PROJECT_ROOT);
      assertEquals(new SemanticOutcome(COMMITTED), result.outcome());
      assertEquals(
          List.of(
              new DeploymentObservation(COMMITTED),
              new CommandObservation("start-" + name, COMMITTED),
              new StateObservation("Instance_1", RUNNING, List.of(new ActiveWait(elementId, TIMER, 1)),
                  List.of(), List.of(), List.of(new OpenTimer(timerId, durationMs)),
                  List.of(), List.of(), List.of(), List.of(), 0),
              new CommandObservation(fireCommandId, COMMITTED),
              new StateObservation("Instance_1", COMPLETED, List.of(), List.of(), List.of(), List.of(),
                  List.of(), List.of(), List.of(), List.of(), durationMs)),
          result.trace());
      assertEquals(
          List.of(
              new TimerJobSnapshot("start-" + name, List.of(new TimerJob(elementId, durationMs, false))),
              new TimerJobSnapshot(fireCommandId, List.of())),
          result.diagnostics().timerJobs());
    }
  }
}
