package org.bpmnlean.cibseven;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertThrows;

import java.nio.file.Path;
import java.sql.BatchUpdateException;
import java.sql.SQLIntegrityConstraintViolationException;
import org.apache.ibatis.exceptions.PersistenceException;
import org.cibseven.bpm.engine.ProcessEngineException;
import org.junit.Test;

/**
 * A scenario's answer does not depend on how many scenarios one runner ran before it. CIB orders compensation
 * subscriptions by their creation timestamp (`CompensationUtil#throwCompensationEvent`); under a frozen logical clock
 * every timestamp ties, and the stable sort keeps the `HashSet` order of their identifiers
 * (`#collectCompensateEventSubscriptionsForScope`). The witness completes two compensable tasks at one logical time;
 * before every scenario restarted from the boot identifiers, its sixth run in one engine flipped the outcome.
 */
public class CibSevenRunPositionIndependenceTest {

  private static final Path PROJECT_ROOT = Path.of("../..").toAbsolutePath().normalize();
  private static final Path WITNESS =
      PROJECT_ROOT.resolve(
          "scenarios/open-rows/compensation-handler-failures/late-failure-after-success.scenario.json");
  private static final int RUNS = 12;

  @Test
  public void answersATiedCompensationOrderIdenticallyAtEveryPositionInARun() throws Exception {
    var scenario = ScenarioJson.read(WITNESS);
    try (var runner = CibSevenScenarioRunner.create()) {
      var first = ScenarioJson.write(runner.run(scenario, PROJECT_ROOT, CibEffectExecutionSchedule.PLAIN_SUCCESS));
      for (var run = 2; run <= RUNS; run++) {
        var next = ScenarioJson.write(runner.run(scenario, PROJECT_ROOT, CibEffectExecutionSchedule.PLAIN_SUCCESS));
        assertEquals("run " + run, outcomeAndTrace(first), outcomeAndTrace(next));
      }
    }
  }

  /** Identifier reuse is sound only on a clean database, so a collision is the harness's failure, never an answer. */
  @Test
  public void classifiesAnIntegrityViolationAsAHarnessFailureAndAnyOtherEngineExceptionAsAnAnswer() {
    var collision =
        new ProcessEngineException(
            "flush failed", new PersistenceException(new SQLIntegrityConstraintViolationException("PRIMARY KEY")));
    assertThrows(
        IllegalStateException.class, () -> CibSevenEngineScenarioRunner.requireNoIntegrityViolation(collision));
    CibSevenEngineScenarioRunner.requireNoIntegrityViolation(new ProcessEngineException("Unknown property used"));
  }

  /** H2 reports a batched insert's key violation as the next exception of a BatchUpdateException, not as its cause. */
  @Test
  public void classifiesABatchedIntegrityViolationAsAHarnessFailure() {
    var batch = new BatchUpdateException("batch failed", new int[0]);
    batch.setNextException(new SQLIntegrityConstraintViolationException("PRIMARY KEY"));
    var collision = new ProcessEngineException("flush failed", new PersistenceException(batch));
    assertThrows(
        IllegalStateException.class, () -> CibSevenEngineScenarioRunner.requireNoIntegrityViolation(collision));
  }

  /**
   * A condition start's evaluation leaves its serialized start variable's runtime byte array without an owner, which no
   * deployment cascade removes (CIB Seven `2.2.0`, observed 2026-11-10); under the restarted boot identifiers the next
   * scenario's first serialized variable collided with it on `ACT_GE_BYTEARRAY` and its start rolled back.
   */
  @Test
  public void answersAScenarioIdenticallyAfterAConditionStartThatLeftARuntimeByteArray() throws Exception {
    var conditionStart = ScenarioJson.read(PROJECT_ROOT.resolve(
        "scenarios/open-rows/conditional-start-compositions/large-order-decimal-true.scenario.json"));
    var witness = ScenarioJson.read(PROJECT_ROOT.resolve(
        "scenarios/open-rows/human-task-result-identity/items-parallel-item-named-submission.scenario.json"));
    String alone;
    try (var runner = CibSevenScenarioRunner.create()) {
      alone = outcomeAndTrace(ScenarioJson.write(runner.run(witness, PROJECT_ROOT, CibEffectExecutionSchedule.PLAIN_SUCCESS)));
    }
    try (var runner = CibSevenScenarioRunner.create()) {
      runner.run(conditionStart, PROJECT_ROOT, CibEffectExecutionSchedule.PLAIN_SUCCESS);
      var after = ScenarioJson.write(runner.run(witness, PROJECT_ROOT, CibEffectExecutionSchedule.PLAIN_SUCCESS));
      assertEquals(alone, outcomeAndTrace(after));
    }
  }

  /** The canonical answer without the run's diagnostics, whose timings differ on every run. */
  private static String outcomeAndTrace(String json) throws Exception {
    var node = new com.fasterxml.jackson.databind.ObjectMapper().readTree(json);
    return node.get("outcome").toString() + node.get("trace").toString();
  }
}
