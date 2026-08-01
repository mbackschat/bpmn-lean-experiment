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
import org.bpmnlean.cibseven.ScenarioInteractionProtocol.CompleteUserTaskInstanceInteraction;
import org.bpmnlean.cibseven.ScenarioProtocol.DeploymentObservation;
import org.bpmnlean.cibseven.ScenarioProtocol.OpenUserTask;
import org.bpmnlean.cibseven.ScenarioProtocol.NullValue;
import org.bpmnlean.cibseven.ScenarioProtocol.PvmActivityProjection;
import org.bpmnlean.cibseven.ScenarioProtocol.PvmDefinitionProjection;
import org.bpmnlean.cibseven.ScenarioProtocol.SemanticOutcome;
import org.bpmnlean.cibseven.ScenarioProtocol.StateObservation;
import org.bpmnlean.cibseven.ScenarioProtocol.StringValue;
import org.bpmnlean.cibseven.ScenarioProtocol.TransitionProjection;
import org.bpmnlean.cibseven.ScenarioProtocol.UserTaskInstanceId;
import org.bpmnlean.cibseven.ScenarioProtocol.VariableBinding;
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
  private static final Path EMBEDDED_SUBPROCESS_ROOT =
      PROJECT_ROOT.resolve("scenarios/embedded-subprocess-completion");
  private static final Path RECEIVE_TASK_ROOT =
      PROJECT_ROOT.resolve("scenarios/message-addressed-receive-task");
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
  public void projectsAndConsumesTheDirectMessageReceiveTaskSubscription()
      throws Exception {
    var scenario = ScenarioJson.read(RECEIVE_TASK_ROOT.resolve("scenario.json"));
    var evidence =
        ScenarioJson.readEvidenceResult(
            RECEIVE_TASK_ROOT.resolve("cibseven-evidence.json"));

    var result = runner.run(scenario, PROJECT_ROOT);

    assertEquals(evidence.outcome(), result.outcome());
    assertEquals(evidence.trace(), result.trace());
    assertEquals(
        "newInvoiceMessage",
        result
            .diagnostics()
            .messageSubscriptions()
            .getFirst()
            .subscriptions()
            .getFirst()
            .eventName());
    assertEquals(ScenarioProtocol.CleanupProjection.clean(), result.diagnostics().cleanup());
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

  @Test
  public void completesEmbeddedSubProcessOnlyAfterBothChildEnds()
      throws Exception {
    var aThenB =
        ScenarioJson.read(EMBEDDED_SUBPROCESS_ROOT.resolve("a-then-b.scenario.json"));
    var bThenA =
        ScenarioJson.read(EMBEDDED_SUBPROCESS_ROOT.resolve("b-then-a.scenario.json"));
    var staleWhileActive =
        ScenarioJson.read(
            EMBEDDED_SUBPROCESS_ROOT.resolve("stale-a-while-b-active.scenario.json"));
    var staleAfterScope =
        ScenarioJson.read(
            EMBEDDED_SUBPROCESS_ROOT.resolve("stale-a-after-scope.scenario.json"));

    var aThenBResult = runner.run(aThenB, PROJECT_ROOT);
    var bThenAResult = runner.run(bThenA, PROJECT_ROOT);
    var staleWhileActiveResult = runner.run(staleWhileActive, PROJECT_ROOT);
    var staleAfterScopeResult = runner.run(staleAfterScope, PROJECT_ROOT);

    assertEquals(
        ScenarioJson.readEvidenceResult(
            EMBEDDED_SUBPROCESS_ROOT.resolve("a-then-b.cibseven-evidence.json")),
        new ScenarioProtocol.CanonicalResult(aThenBResult.outcome(), aThenBResult.trace()));
    assertEquals(
        ScenarioJson.readEvidenceResult(
            EMBEDDED_SUBPROCESS_ROOT.resolve("b-then-a.cibseven-evidence.json")),
        new ScenarioProtocol.CanonicalResult(bThenAResult.outcome(), bThenAResult.trace()));
    assertEquals(
        ScenarioJson.readEvidenceResult(
            EMBEDDED_SUBPROCESS_ROOT.resolve(
                "stale-a-while-b-active.cibseven-evidence.json")),
        new ScenarioProtocol.CanonicalResult(
            staleWhileActiveResult.outcome(), staleWhileActiveResult.trace()));
    assertEquals(
        ScenarioJson.readEvidenceResult(
            EMBEDDED_SUBPROCESS_ROOT.resolve("stale-a-after-scope.cibseven-evidence.json")),
        new ScenarioProtocol.CanonicalResult(
            staleAfterScopeResult.outcome(), staleAfterScopeResult.trace()));

    var afterFirstA = (StateObservation) aThenBResult.trace().get(4);
    var afterFirstB = (StateObservation) bThenAResult.trace().get(4);
    assertEquals(List.of("UserTask_ChildB"), taskElementIds(afterFirstA));
    assertEquals(List.of("UserTask_ChildA"), taskElementIds(afterFirstB));
    assertEquals(
        (StateObservation) aThenBResult.trace().get(6),
        (StateObservation) bThenAResult.trace().get(6));
    assertEquals(
        List.of("UserTask_AfterScope"),
        taskElementIds((StateObservation) aThenBResult.trace().get(6)));
    assertEquals(COMPLETED, ((StateObservation) aThenBResult.trace().get(8)).status());
    assertEquals(
        staleWhileActiveResult.trace().get(4), staleWhileActiveResult.trace().get(6));
    assertEquals(staleAfterScopeResult.trace().get(6), staleAfterScopeResult.trace().get(8));
    assertEquals(
        ScenarioProtocol.CleanupProjection.clean(), aThenBResult.diagnostics().cleanup());
    assertEquals(
        ScenarioProtocol.CleanupProjection.clean(), bThenAResult.diagnostics().cleanup());
    assertEquals(
        ScenarioProtocol.CleanupProjection.clean(),
        staleWhileActiveResult.diagnostics().cleanup());
    assertEquals(
        ScenarioProtocol.CleanupProjection.clean(),
        staleAfterScopeResult.diagnostics().cleanup());
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
            List.of(
                new VariableBinding(
                    "requestTitle", new StringValue("Review invoice 42"))),
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
            List.of(
                new VariableBinding("decision", new StringValue("approved")),
                new VariableBinding(
                    "requestTitle", new StringValue("Review invoice 42")),
                new VariableBinding("reviewNote", new NullValue())),
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

  private static List<String> taskElementIds(StateObservation state) {
    return state.openUserTasks().stream().map(task -> task.id().elementId()).toList();
  }
}
