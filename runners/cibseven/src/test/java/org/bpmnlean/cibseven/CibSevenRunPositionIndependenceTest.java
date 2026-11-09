package org.bpmnlean.cibseven;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertThrows;

import java.nio.file.Path;
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

  /** The canonical answer without the run's diagnostics, whose timings differ on every run. */
  private static String outcomeAndTrace(String json) throws Exception {
    var node = new com.fasterxml.jackson.databind.ObjectMapper().readTree(json);
    return node.get("outcome").toString() + node.get("trace").toString();
  }
}
