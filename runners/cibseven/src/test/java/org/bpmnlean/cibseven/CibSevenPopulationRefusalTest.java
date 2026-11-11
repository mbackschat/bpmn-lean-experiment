package org.bpmnlean.cibseven;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.Test;

/**
 * CIB's refusals of a population command, told apart by the catalogued identifier its command logger gives a refusal
 * rather than by its wording: a publication reaching several candidates is `ambiguous`, one reaching none `noMatch`,
 * both rolled back; an evaluation without a Conditional start in scope is `rejected`, since CIB refuses it before it
 * changes any state.
 */
public class CibSevenPopulationRefusalTest {

  private static final Path PROJECT_ROOT = Path.of("../..").toAbsolutePath().normalize();

  @Test
  public void resolvesAPublicationReachingTwoInstancesAsAmbiguous() throws Exception {
    var step = step("scenarios/open-rows/message-start-population/criteria-ambiguous-two-instances",
        "s03-publish-order-confirmed");
    assertEquals("rolledBack", step.get("outcome").asText());
    assertEquals("ambiguous", step.get("resolution").get("kind").asText());
  }

  @Test
  public void resolvesAPublicationReachingNothingAsNoMatch() throws Exception {
    var step = step("scenarios/open-rows/message-start-population/criteria-none-no-start-definition",
        "s02-publish-order-confirmed");
    assertEquals("rolledBack", step.get("outcome").asText());
    assertEquals("noMatch", step.get("resolution").get("kind").asText());
  }

  @Test
  public void rejectsAnEvaluationWithoutAConditionalStartInScope() throws Exception {
    var step = step("scenarios/open-rows/conditional-start-population/no-conditional-start-in-scope", "s01-evaluate");
    assertEquals("rejected", step.get("outcome").asText());
  }

  private static JsonNode step(String scenario, String commandId) throws Exception {
    var path = PROJECT_ROOT.resolve(scenario + ".population-scenario.json");
    try (var runner = CibSevenScenarioRunner.create()) {
      var result = runner.runPopulation(ScenarioJson.readPopulation(Files.readString(path)), PROJECT_ROOT);
      for (var step : new ObjectMapper().readTree(ScenarioJson.writePopulation(result)).get("steps")) {
        if (commandId.equals(step.get("commandId").asText())) {
          return step;
        }
      }
    }
    assertTrue("the witness reaches " + commandId, false);
    return null;
  }
}
