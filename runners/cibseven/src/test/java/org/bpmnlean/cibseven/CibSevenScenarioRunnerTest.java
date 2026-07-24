package org.bpmnlean.cibseven;

import static org.bpmnlean.cibseven.ScenarioProtocol.CommandOutcome.COMMITTED;
import static org.bpmnlean.cibseven.ScenarioProtocol.ProcessStatus.COMPLETED;
import static org.bpmnlean.cibseven.ScenarioProtocol.ProcessStatus.RUNNING;
import static org.bpmnlean.cibseven.ScenarioProtocol.UserTaskLifecycleState.ACTIVE;
import static org.bpmnlean.cibseven.ScenarioProtocol.WaitKind.USER_TASK;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.nio.file.Path;
import java.util.List;
import org.bpmnlean.cibseven.ScenarioProtocol.ActiveWait;
import org.bpmnlean.cibseven.ScenarioProtocol.CommandObservation;
import org.bpmnlean.cibseven.ScenarioProtocol.CompleteUserTaskInstanceInteraction;
import org.bpmnlean.cibseven.ScenarioProtocol.CompleteUserTaskStimulus;
import org.bpmnlean.cibseven.ScenarioProtocol.DeploymentObservation;
import org.bpmnlean.cibseven.ScenarioProtocol.PvmActivityProjection;
import org.bpmnlean.cibseven.ScenarioProtocol.PvmDefinitionProjection;
import org.bpmnlean.cibseven.ScenarioProtocol.SemanticOutcome;
import org.bpmnlean.cibseven.ScenarioProtocol.StateObservation;
import org.bpmnlean.cibseven.ScenarioProtocol.TransitionProjection;
import org.bpmnlean.cibseven.ScenarioProtocol.OpenUserTask;
import org.bpmnlean.cibseven.ScenarioProtocol.UserTaskInstanceId;
import org.cibseven.bpm.engine.ProcessEngine;
import org.junit.Test;

public class CibSevenScenarioRunnerTest {

  private static final String PROCESS_ID = "Process_SequentialUserTask";
  private static final String INSTANCE_ID = "Instance_1";
  private static final Path PROJECT_ROOT = Path.of("../..").toAbsolutePath().normalize();
  private static final Path SCENARIO_PATH =
      PROJECT_ROOT.resolve("scenarios/m0-sequential-user-task/scenario.json");
  private static final Path EVIDENCE_PATH =
      PROJECT_ROOT.resolve("scenarios/m0-sequential-user-task/cibseven-evidence.json");
  private static final Path INTERACTION_SCENARIO_PATH =
      PROJECT_ROOT.resolve("scenarios/m1-user-task-discovery-completion/scenario.json");
  private static final Path INTERACTION_EVIDENCE_PATH =
      PROJECT_ROOT.resolve(
          "scenarios/m1-user-task-discovery-completion/cibseven-evidence.json");
  private static final Path WRONG_ACTIVATION_SCENARIO_PATH =
      PROJECT_ROOT.resolve(
          "scenarios/m1-user-task-discovery-completion/wrong-activation.scenario.json");
  private static final Path WRONG_ACTIVATION_EVIDENCE_PATH =
      PROJECT_ROOT.resolve(
          "scenarios/m1-user-task-discovery-completion/wrong-activation.cibseven-evidence.json");
  private static final Path STALE_COMPLETION_SCENARIO_PATH =
      PROJECT_ROOT.resolve(
          "scenarios/m1-user-task-discovery-completion/stale-completion.scenario.json");
  private static final Path STALE_COMPLETION_EVIDENCE_PATH =
      PROJECT_ROOT.resolve(
          "scenarios/m1-user-task-discovery-completion/stale-completion.cibseven-evidence.json");

  @Test
  public void calibratesSequentialUserTaskAndCleansEveryRun() throws Exception {
    var scenario = ScenarioJson.read(SCENARIO_PATH);
    var evidence = ScenarioJson.readEvidenceResult(EVIDENCE_PATH);
    var expectedTrace = List.of(
        new DeploymentObservation(COMMITTED),
        new CommandObservation("start-process", COMMITTED),
        new StateObservation(
            INSTANCE_ID,
            RUNNING,
            List.of(new ActiveWait("UserTask_Approve", USER_TASK, 1)),
            List.of(new CompleteUserTaskStimulus("complete-user-task", "UserTask_Approve")),
            0),
        new CommandObservation("complete-user-task", COMMITTED),
        new StateObservation(INSTANCE_ID, COMPLETED, List.of(), List.of(), 0));
    assertEquals(expectedTrace, evidence.trace());
    assertEquals(new SemanticOutcome(COMMITTED), evidence.outcome());
    assertEquals("0.1.0", scenario.traceSchemaVersion());

    try (var runner = CibSevenScenarioRunner.create()) {
      var first = runner.run(scenario, PROJECT_ROOT);
      var second = runner.run(scenario, PROJECT_ROOT);

      assertEquals(new SemanticOutcome(COMMITTED), first.outcome());
      assertEquals(expectedTrace, first.trace());
      assertEquals(expectedTrace, second.trace());
      assertEquals(expectedProjection(), first.diagnostics().pvmDefinition());
      assertEquals(first.diagnostics().pvmDefinition(), second.diagnostics().pvmDefinition());
      assertEquals(ScenarioProtocol.CleanupProjection.clean(), first.diagnostics().cleanup());
      assertEquals(ScenarioProtocol.CleanupProjection.clean(), second.diagnostics().cleanup());
      assertEquals(
          ProcessEngine.class.getPackage().getImplementationVersion(),
          first.diagnostics().engineVersion());
      assertEquals(
          Class.forName("org.h2.Driver").getPackage().getImplementationVersion(),
          first.diagnostics().databaseVersion());
      assertTrue(first.diagnostics().startupNanos() > 0);
      assertTrue(first.diagnostics().phases().totalNanos() > 0);
      assertTrue(second.diagnostics().phases().totalNanos() > 0);
    }
  }

  @Test
  public void calibratesTaskDiscoveryAndRejectsWrongActivationWithoutStateChange()
      throws Exception {
    var scenario = ScenarioJson.read(INTERACTION_SCENARIO_PATH);
    var evidence = ScenarioJson.readEvidenceResult(INTERACTION_EVIDENCE_PATH);
    var wrongScenario = ScenarioJson.read(WRONG_ACTIVATION_SCENARIO_PATH);
    var wrongEvidence =
        ScenarioJson.readEvidenceResult(WRONG_ACTIVATION_EVIDENCE_PATH);
    var staleScenario = ScenarioJson.read(STALE_COMPLETION_SCENARIO_PATH);
    var staleEvidence =
        ScenarioJson.readEvidenceResult(STALE_COMPLETION_EVIDENCE_PATH);
    assertEquals("0.2.0", scenario.traceSchemaVersion());
    assertEquals(scenario.traceSchemaVersion(), wrongScenario.traceSchemaVersion());
    assertEquals(scenario.traceSchemaVersion(), staleScenario.traceSchemaVersion());
    var taskId = new UserTaskInstanceId(INSTANCE_ID, "UserTask_Approve", 1);
    var openTask = new OpenUserTask(taskId, "Approve", ACTIVE);
    var completionInteraction = new CompleteUserTaskInstanceInteraction(taskId);
    var expectedTrace =
        List.of(
            new DeploymentObservation(COMMITTED),
            new CommandObservation("start-process", COMMITTED),
            new StateObservation(
                INSTANCE_ID,
                RUNNING,
                List.of(new ActiveWait("UserTask_Approve", USER_TASK, 1)),
                List.of(openTask),
                null,
                List.of(completionInteraction),
                0),
            new CommandObservation("complete-user-task-instance", COMMITTED),
            new StateObservation(
                INSTANCE_ID, COMPLETED, List.of(), List.of(), null, List.of(), 0));
    assertEquals(expectedTrace, evidence.trace());

    // tag::cib-user-task-probe[]
    try (var runner = CibSevenScenarioRunner.create()) {
      var calibrated = runner.run(scenario, PROJECT_ROOT);
      var rejected = runner.run(wrongScenario, PROJECT_ROOT);
      var stale = runner.run(staleScenario, PROJECT_ROOT);

      assertEquals(evidence.outcome(), calibrated.outcome());
      assertEquals(expectedTrace, calibrated.trace());
      assertEquals(wrongEvidence.outcome(), rejected.outcome());
      assertEquals(wrongEvidence.trace(), rejected.trace());
      assertEquals(staleEvidence.outcome(), stale.outcome());
      assertEquals(staleEvidence.trace(), stale.trace());
      assertEquals(calibrated.trace().get(2), rejected.trace().get(2));
      assertEquals(rejected.trace().get(2), rejected.trace().get(4));
      assertEquals(stale.trace().get(4), stale.trace().get(6));
      assertEquals(ScenarioProtocol.CleanupProjection.clean(), rejected.diagnostics().cleanup());
      assertEquals(ScenarioProtocol.CleanupProjection.clean(), stale.diagnostics().cleanup());
    }
    // end::cib-user-task-probe[]
  }

  private static PvmDefinitionProjection expectedProjection() {
    return new PvmDefinitionProjection(
        PROCESS_ID,
        "StartEvent_1",
        List.of(
            new PvmActivityProjection(
                "StartEvent_1",
                "startEvent",
                "NoneStartEventActivityBehavior",
                PROCESS_ID,
                null,
                List.of(new TransitionProjection("Flow_StartToTask", "UserTask_Approve"))),
            new PvmActivityProjection(
                "UserTask_Approve",
                "userTask",
                "UserTaskActivityBehavior",
                PROCESS_ID,
                null,
                List.of(new TransitionProjection("Flow_TaskToEnd", "EndEvent_1"))),
            new PvmActivityProjection(
                "EndEvent_1",
                "noneEndEvent",
                "NoneEndEventActivityBehavior",
                PROCESS_ID,
                null,
                List.of())));
  }
}
