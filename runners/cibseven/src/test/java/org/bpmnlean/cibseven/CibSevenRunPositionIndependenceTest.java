package org.bpmnlean.cibseven;

import static org.junit.Assert.assertEquals;

import java.nio.file.Path;
import org.junit.Test;

/**
 * A scenario's answer does not depend on how many scenarios one runner ran before it. CIB orders compensation
 * subscriptions by their creation timestamp (`CompensationUtil#throwCompensationEvent`), and under a frozen logical clock
 * every timestamp ties, so the database's row order decides; that order follows the string order of engine-generated
 * identifiers, which flips where an identifier gains a digit. The witness completes two compensable tasks at one
 * logical time, and its runs consume identifiers across at least one such boundary.
 */
public class CibSevenRunPositionIndependenceTest {

  private static final Path PROJECT_ROOT = Path.of("../..").toAbsolutePath().normalize();
  private static final Path WITNESS =
      PROJECT_ROOT.resolve(
          "scenarios/open-rows/compensation-handler-failures/late-failure-after-success.scenario.json");
  private static final int RUNS = 40;

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

  /** The canonical answer without the run's diagnostics, whose timings differ on every run. */
  private static String outcomeAndTrace(String json) throws Exception {
    var node = new com.fasterxml.jackson.databind.ObjectMapper().readTree(json);
    return node.get("outcome").toString() + node.get("trace").toString();
  }
}
