package org.bpmnlean.cibseven;

import static org.bpmnlean.cibseven.ScenarioProtocol.CommandOutcome.COMMITTED;
import static org.bpmnlean.cibseven.ScenarioProtocol.ProcessStatus.COMPLETED;
import static org.bpmnlean.cibseven.ScenarioProtocol.ProcessStatus.RUNNING;
import static org.bpmnlean.cibseven.ScenarioProtocol.WaitKind.USER_TASK;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.junit.Assume.assumeTrue;

import java.nio.file.Path;
import org.bpmnlean.cibseven.ScenarioProtocol.CommandObservation;
import org.bpmnlean.cibseven.ScenarioProtocol.NullValue;
import org.bpmnlean.cibseven.ScenarioProtocol.SemanticOutcome;
import org.bpmnlean.cibseven.ScenarioProtocol.StateObservation;
import org.cibseven.bpm.engine.ProcessEngine;
import org.junit.Test;

/** Locks the synchronous CIB Seven 2.0 host relation for one caught boundary Error. */
public final class CibSevenBoundaryErrorScenarioRunnerTest {

  private static final Path PROJECT_ROOT =
      Path.of("../..").toAbsolutePath().normalize();
  private static final Path SCENARIO_PATH =
      PROJECT_ROOT.resolve("scenarios/boundary-error/scenario.json");

  @Test
  public void catchesTheTypedErrorAndMapsNullBeforeBoundaryCompletion()
      throws Exception {
    assumeTrue(
        "2.0.0".equals(
            ProcessEngine.class.getPackage().getImplementationVersion()));
    var scenario = ScenarioJson.read(SCENARIO_PATH);

    try (var runner = CibSevenScenarioRunner.create()) {
      var result = runner.run(scenario, PROJECT_ROOT);
      var waiting = (StateObservation) result.trace().get(2);
      var completed = (StateObservation) result.trace().get(4);

      assertEquals(RUNNING, waiting.status());
      assertEquals(USER_TASK, waiting.activeWaits().getFirst().kind());
      assertEquals(
          "ExpectedUserTaskAfterBPMNError",
          waiting.openUserTasks().getFirst().id().elementId());
      assertEquals("relationshipLinkId", waiting.variables().getFirst().name());
      assertEquals(new NullValue(), waiting.variables().getFirst().value());
      assertEquals(
          "complete-boundary-user-task",
          ((CommandObservation) result.trace().get(3)).commandId());
      assertEquals(COMMITTED, ((CommandObservation) result.trace().get(3)).outcome());
      assertEquals(COMPLETED, completed.status());
      assertEquals(new SemanticOutcome(COMMITTED), result.outcome());
      assertEquals(1, result.diagnostics().mappingExecutions().size());
      assertEquals(
          new NullValue(),
          result
              .diagnostics()
              .mappingExecutions()
              .getFirst()
              .localPatch()
              .getFirst()
              .value());
      assertTrue(completed.variables().getFirst().value() instanceof NullValue);
      assertEquals(
          ScenarioProtocol.CleanupProjection.clean(),
          result.diagnostics().cleanup());
    }
  }
}
