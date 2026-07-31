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
import org.bpmnlean.cibseven.ScenarioProtocol.DeploymentObservation;
import org.bpmnlean.cibseven.ScenarioProtocol.OpenUserTask;
import org.bpmnlean.cibseven.ScenarioProtocol.PvmActivityProjection;
import org.bpmnlean.cibseven.ScenarioProtocol.PvmDefinitionProjection;
import org.bpmnlean.cibseven.ScenarioProtocol.SemanticOutcome;
import org.bpmnlean.cibseven.ScenarioProtocol.StateObservation;
import org.bpmnlean.cibseven.ScenarioProtocol.TransitionProjection;
import org.bpmnlean.cibseven.ScenarioProtocol.UserTaskInstanceId;
import org.cibseven.bpm.engine.ProcessEngine;
import org.junit.AfterClass;
import org.junit.BeforeClass;
import org.junit.Test;

public class CibSevenScenarioRunnerTest {

  private static final String PROCESS_ID = "Process_SequentialUserTask";
  private static final String INSTANCE_ID = "Instance_1";
  private static final Path PROJECT_ROOT = Path.of("../..").toAbsolutePath().normalize();
  private static final Path CAPSULE_ROOT =
      PROJECT_ROOT.resolve("scenarios/user-task-discovery-completion");
  private static final Path PARALLEL_ROOT =
      PROJECT_ROOT.resolve("scenarios/parallel-fork-join");
  private static CibSevenScenarioRunner runner;

  @BeforeClass
  public static void createRunner() {
    runner = CibSevenScenarioRunner.create();
  }

  @AfterClass
  public static void closeRunner() {
    runner.close();
  }

  @Test
  public void calibratesCurrentUserTaskScenarioAndCleansEveryRun() throws Exception {
    var scenario = ScenarioJson.read(CAPSULE_ROOT.resolve("scenario.json"));
    var evidence =
        ScenarioJson.readEvidenceResult(CAPSULE_ROOT.resolve("cibseven-evidence.json"));
    var expectedTrace = expectedCommittedTrace();
    assertEquals(expectedTrace, evidence.trace());
    assertEquals(new SemanticOutcome(COMMITTED), evidence.outcome());
    assertEquals(ScenarioProtocol.SCENARIO_KIND, scenario.kind());

    var first = runner.run(scenario, PROJECT_ROOT);
    var second = runner.run(scenario, PROJECT_ROOT);

    assertEquals(ScenarioProtocol.SCENARIO_RESULT_KIND, first.kind());
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

  @Test
  public void rejectsWrongAndStaleOccurrencesWithoutChangingSemanticState()
      throws Exception {
    var wrongScenario =
        ScenarioJson.read(CAPSULE_ROOT.resolve("wrong-activation.scenario.json"));
    var wrongEvidence =
        ScenarioJson.readEvidenceResult(
            CAPSULE_ROOT.resolve("wrong-activation.cibseven-evidence.json"));
    var staleScenario =
        ScenarioJson.read(CAPSULE_ROOT.resolve("stale-completion.scenario.json"));
    var staleEvidence =
        ScenarioJson.readEvidenceResult(
            CAPSULE_ROOT.resolve("stale-completion.cibseven-evidence.json"));

    // tag::cib-user-task-probe[]
    var rejected = runner.run(wrongScenario, PROJECT_ROOT);
    var stale = runner.run(staleScenario, PROJECT_ROOT);

    assertEquals(wrongEvidence.outcome(), rejected.outcome());
    assertEquals(wrongEvidence.trace(), rejected.trace());
    assertEquals(staleEvidence.outcome(), stale.outcome());
    assertEquals(staleEvidence.trace(), stale.trace());
    assertEquals(rejected.trace().get(2), rejected.trace().get(4));
    assertEquals(stale.trace().get(4), stale.trace().get(6));
    assertEquals(ScenarioProtocol.CleanupProjection.clean(), rejected.diagnostics().cleanup());
    assertEquals(ScenarioProtocol.CleanupProjection.clean(), stale.diagnostics().cleanup());
    // end::cib-user-task-probe[]
  }

  @Test
  public void projectsParallelTasksAndBothCompletionOrdersDeterministically()
      throws Exception {
    var aThenB =
        ScenarioJson.read(PARALLEL_ROOT.resolve("a-then-b.scenario.json"));
    var bThenA =
        ScenarioJson.read(PARALLEL_ROOT.resolve("b-then-a.scenario.json"));
    var aThenBEvidence =
        ScenarioJson.readEvidenceResult(
            PARALLEL_ROOT.resolve("a-then-b.cibseven-evidence.json"));
    var bThenAEvidence =
        ScenarioJson.readEvidenceResult(
            PARALLEL_ROOT.resolve("b-then-a.cibseven-evidence.json"));

    var aThenBResult = runner.run(aThenB, PROJECT_ROOT);
    var bThenAResult = runner.run(bThenA, PROJECT_ROOT);

    assertEquals(
        expectedParallelTrace("UserTask_A", "UserTask_B", "B"),
        aThenBResult.trace());
    assertEquals(
        expectedParallelTrace("UserTask_B", "UserTask_A", "A"),
        bThenAResult.trace());
    assertEquals(aThenBEvidence.trace(), aThenBResult.trace());
    assertEquals(bThenAEvidence.trace(), bThenAResult.trace());
    assertEquals(aThenBEvidence.outcome(), aThenBResult.outcome());
    assertEquals(bThenAEvidence.outcome(), bThenAResult.outcome());
    assertEquals(aThenBResult.trace().get(2), bThenAResult.trace().get(2));
    assertEquals(aThenBResult.trace().get(6), bThenAResult.trace().get(6));
    assertEquals(
        ScenarioProtocol.CleanupProjection.clean(),
        aThenBResult.diagnostics().cleanup());
    assertEquals(
        ScenarioProtocol.CleanupProjection.clean(),
        bThenAResult.diagnostics().cleanup());
  }

  private static List<ScenarioProtocol.CanonicalObservation> expectedCommittedTrace() {
    var taskId = new UserTaskInstanceId(INSTANCE_ID, "UserTask_Approve", 1);
    var openTask = new OpenUserTask(taskId, "Approve", ACTIVE);
    var completionInteraction = new CompleteUserTaskInstanceInteraction(taskId);
    return List.of(
        new DeploymentObservation(COMMITTED),
        new CommandObservation("start-process", COMMITTED),
        new StateObservation(
            INSTANCE_ID,
            RUNNING,
            List.of(new ActiveWait("UserTask_Approve", USER_TASK, 1)),
            List.of(openTask),
            List.of(),
            List.of(),
            List.of(),
            List.of(),
            List.of(completionInteraction),
            0),
        new CommandObservation("complete-user-task-instance", COMMITTED),
        new StateObservation(
            INSTANCE_ID,
            COMPLETED,
            List.of(),
            List.of(),
            List.of(),
            List.of(),
            List.of(),
            List.of(),
            List.of(),
            0));
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

  private static List<ScenarioProtocol.CanonicalObservation> expectedParallelTrace(
      String firstElementId,
      String secondElementId,
      String secondName) {
    var taskA = openTask("UserTask_A", "A");
    var taskB = openTask("UserTask_B", "B");
    var remaining = openTask(secondElementId, secondName);
    return List.of(
        new DeploymentObservation(COMMITTED),
        new CommandObservation("start-process", COMMITTED),
        new StateObservation(
            INSTANCE_ID,
            RUNNING,
            List.of(
                new ActiveWait("UserTask_A", USER_TASK, 1),
                new ActiveWait("UserTask_B", USER_TASK, 1)),
            List.of(taskA, taskB),
            List.of(),
            List.of(),
            List.of(),
            List.of(),
            List.of(
                new CompleteUserTaskInstanceInteraction(taskA.id()),
                new CompleteUserTaskInstanceInteraction(taskB.id())),
            0),
        new CommandObservation(
            "complete-user-task-" + firstElementId.substring("UserTask_".length()).toLowerCase(),
            COMMITTED),
        new StateObservation(
            INSTANCE_ID,
            RUNNING,
            List.of(new ActiveWait(secondElementId, USER_TASK, 1)),
            List.of(remaining),
            List.of(),
            List.of(),
            List.of(),
            List.of(),
            List.of(new CompleteUserTaskInstanceInteraction(remaining.id())),
            0),
        new CommandObservation(
            "complete-user-task-" + secondElementId.substring("UserTask_".length()).toLowerCase(),
            COMMITTED),
        new StateObservation(
            INSTANCE_ID,
            COMPLETED,
            List.of(),
            List.of(),
            List.of(),
            List.of(),
            List.of(),
            List.of(),
            List.of(),
            0));
  }

  private static OpenUserTask openTask(String elementId, String name) {
    return new OpenUserTask(
        new UserTaskInstanceId(INSTANCE_ID, elementId, 1),
        name,
        ACTIVE);
  }
}
