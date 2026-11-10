package org.bpmnlean.cibseven;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Path;
import java.util.HashMap;
import org.junit.Test;

/**
 * The runner numbers an element's activations as the kernel does: in begin order, fixed once an activation is seen.
 * CIB orders historic activity instances only partially (`orderPartiallyByOccurrence` compares sequence counters, which
 * concurrent executions do not share), so a history order read afresh at every state can place a later activation
 * before an earlier one and renumber it, and cannot order the activations one step begins in concurrent instances.
 */
public class CibSevenOccurrenceNumberingTest {

  private static final Path PROJECT_ROOT = Path.of("../..").toAbsolutePath().normalize();

  /** A wait's `seenStatus` input names the occurrence that reached it; each keeps its first activation. */
  @Test
  public void keepsAnActivationOnceSeenWhileALaterOneBegins() throws Exception {
    var trace = trace("scenarios/open-rows/same-definition-scope-lifetimes/reentry-while-other-live.scenario.json");
    var first = new HashMap<String, Long>();
    var seen = 0;
    for (var observation : trace) {
      for (var wait : waits(observation, "UserTask_Sign")) {
        var activation = wait.get("id").get("activation").asLong();
        var label = input(wait, "seenStatus");
        assertEquals(label, first.computeIfAbsent(label, ignored -> activation), Long.valueOf(activation));
        seen++;
      }
    }
    assertTrue("the witness reaches Sign", seen > 0);
  }

  /** Each inner User Task's `position` input is its instance's `loopCounter`, generated in that order. */
  @Test
  public void numbersTheActivationsOfConcurrentInstancesInGenerationOrder() throws Exception {
    var trace = trace("scenarios/open-rows/multi-instance-sub-process/parallel-sixteen-bodies-natural.scenario.json");
    var state = trace.get(2);
    var inspected = waits(state, "UserTask_Inspect");
    assertEquals(16, inspected.size());
    for (var wait : inspected) {
      assertEquals(
          Long.parseLong(input(wait, "position")) + 1, wait.get("id").get("activation").asLong());
    }
  }

  private static JsonNode trace(String scenario) throws Exception {
    try (var runner = CibSevenScenarioRunner.create()) {
      var result =
          runner.run(ScenarioJson.read(PROJECT_ROOT.resolve(scenario)), PROJECT_ROOT,
              CibEffectExecutionSchedule.PLAIN_SUCCESS);
      return new ObjectMapper().readTree(ScenarioJson.write(result)).get("trace");
    }
  }

  private static java.util.List<JsonNode> waits(JsonNode observation, String elementId) {
    var found = new java.util.ArrayList<JsonNode>();
    if (observation.has("openWaits")) {
      for (var wait : observation.get("openWaits")) {
        if (elementId.equals(wait.get("id").get("elementId").asText())) {
          found.add(wait);
        }
      }
    }
    return found;
  }

  private static String input(JsonNode wait, String name) {
    for (var binding : wait.get("detail").get("inputs")) {
      if (name.equals(binding.get("name").asText())) {
        return binding.get("value").get("value").asText();
      }
    }
    throw new AssertionError("wait has no input " + name);
  }
}
