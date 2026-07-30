package org.bpmnlean.cibseven;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;

import java.nio.file.Path;
import org.bpmnlean.cibseven.ScenarioProtocol.CommandObservation;
import org.bpmnlean.cibseven.ScenarioProtocol.CommandOutcome;
import org.bpmnlean.cibseven.ScenarioProtocol.StateObservation;
import org.bpmnlean.cibseven.ScenarioProtocol.SemanticOutcome;
import org.bpmnlean.cibseven.ScenarioProtocol.WaitKind;
import org.junit.AfterClass;
import org.junit.BeforeClass;
import org.junit.Test;

/** Locks the ordinary JSON-scenario path and its separate Service Task host schedules. */
public final class CibSevenServiceTaskScenarioRunnerTest {

  private static final Path PROJECT_ROOT =
      Path.of("../..").toAbsolutePath().normalize();
  private static final Path SCENARIO_PATH =
      PROJECT_ROOT.resolve("scenarios/service-task-effect/scenario.json");
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
  public void plainSuccessProjectsOneAdapterDecidedEffectWait() throws Exception {
    var scenario = ScenarioJson.read(SCENARIO_PATH);
    var result =
        runner.run(
            scenario,
            PROJECT_ROOT,
            CibEffectExecutionSchedule.PLAIN_SUCCESS);

    var waiting = (StateObservation) result.trace().get(2);
    assertEquals(WaitKind.EFFECT, waiting.activeWaits().getFirst().kind());
    assertEquals("ServiceTask_Record", waiting.openEffects().getFirst().id().elementId());
    assertEquals(
        CibSevenEffectProjector.EFFECT_PROTOCOL,
        waiting.openEffects().getFirst().descriptor().protocol());
    assertEquals(
        CibSevenEffectProjector.EFFECT_OPERATION,
        waiting.openEffects().getFirst().descriptor().operation());
    assertEquals(
        CommandOutcome.COMMITTED,
        ((CommandObservation) result.trace().get(3)).outcome());
    assertEquals(1, result.diagnostics().effectExecutions().size());
    var execution = result.diagnostics().effectExecutions().getFirst();
    assertEquals("plainSuccess", execution.schedule());
    assertEquals(1, execution.invocations());
    assertEquals(1, execution.mutations());
    assertEquals(3, execution.initialRetries());
    assertEquals(null, execution.retriesAfterFirstFailure());
    assertFalse(result.diagnostics().effectJobs().getFirst().jobs().isEmpty());
    assertEquals(0, result.diagnostics().cleanup().jobs());
  }

  @Test
  public void failAfterMutationOnceRetainsRetryAsRawEvidence() throws Exception {
    var scenario = ScenarioJson.read(SCENARIO_PATH);
    var result =
        runner.run(
            scenario,
            PROJECT_ROOT,
            CibEffectExecutionSchedule.FAIL_AFTER_MUTATION_ONCE);

    var execution = result.diagnostics().effectExecutions().getFirst();
    assertEquals("failAfterMutationOnce", execution.schedule());
    assertEquals(2, execution.invocations());
    assertEquals(1, execution.mutations());
    assertEquals(3, execution.initialRetries());
    assertEquals(Long.valueOf(2), execution.retriesAfterFirstFailure());
    assertEquals(0, result.diagnostics().cleanup().jobs());
    assertEquals(
        CommandOutcome.COMMITTED,
        ((SemanticOutcome) result.outcome()).outcome());
  }
}
