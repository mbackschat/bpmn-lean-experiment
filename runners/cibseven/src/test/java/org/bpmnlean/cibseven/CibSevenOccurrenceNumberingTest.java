package org.bpmnlean.cibseven;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.List;
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

  /** A cycle successor takes a fresh activation, the next the kernel reserves (CIB-OP draft, I6). */
  @Test
  public void numbersACycleSuccessorAsTheElementsNextActivation() throws Exception {
    var seen = 0;
    for (var observation : trace("scenarios/repeatable-event-subscriptions/boundary-timer-repeat.scenario.json")) {
      for (var wait : waits(observation, "Reminder")) {
        assertEquals(wait.get("detail").get("deadlineMs").asLong() / 1000, wait.get("id").get("activation").asLong());
        seen++;
      }
    }
    assertTrue("the witness repeats the Reminder", seen > 1);
  }

  /**
   * A repeating Message firing begins a fresh activation, so the re-entered host's subscription takes the third (I6
   * rule 3); the host rule would give it the second.
   */
  @Test
  public void numbersASubscriptionArmedAfterARepeatingFiringAfterThatFiring() throws Exception {
    var trace =
        trace("scenarios/open-rows/message-boundary-repeated/user-host-reentered-after-delivery.scenario.json");
    var activations = new java.util.TreeSet<Long>();
    for (var observation : trace) {
      for (var wait : waits(observation, "Ping_Loop")) {
        activations.add(wait.get("id").get("activation").asLong());
      }
    }
    assertEquals(java.util.Set.of(1L, 3L), activations);
  }

  /** A finite cycle publishes the firings left including the open one, as the kernel counts them (I6 rule 6). */
  @Test
  public void countsDownTheFiringsLeftOfAFiniteCycle() throws Exception {
    var remaining = new java.util.ArrayList<Long>();
    for (var observation : trace("scenarios/open-rows/timer-recurrence/count-finite-overlap.scenario.json")) {
      for (var wait : waits(observation, "Cycle_Count")) {
        var count = wait.get("detail").get("recurrence").get("remaining").asLong();
        if (remaining.isEmpty() || remaining.getLast() != count) {
          remaining.add(count);
        }
      }
    }
    assertEquals(List.of(3L, 2L, 1L), remaining.subList(0, 3));
  }

  /** CIB's calendars read the JVM default zone, so the oracle refuses to run outside the zone its evidence records. */
  @Test
  public void refusesToRunOutsideUtc() {
    var original = java.util.TimeZone.getDefault();
    try {
      java.util.TimeZone.setDefault(java.util.TimeZone.getTimeZone("Europe/Berlin"));
      assertThrows(IllegalStateException.class, CibSevenScenarioRunner::create);
    } finally {
      java.util.TimeZone.setDefault(original);
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
