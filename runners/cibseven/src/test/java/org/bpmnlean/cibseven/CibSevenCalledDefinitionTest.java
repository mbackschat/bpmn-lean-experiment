package org.bpmnlean.cibseven;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Path;
import org.junit.Test;

/**
 * A single-instance scenario's called instance publishes the definition CIB runs as the kernel stamps it: its key and
 * its `camunda:versionTag`, engine-observed, and nothing its one document lacks.
 */
public class CibSevenCalledDefinitionTest {

  private static final Path PROJECT_ROOT = Path.of("../..").toAbsolutePath().normalize();

  @Test
  public void publishesTheCalledDefinitionsVersionTag() throws Exception {
    var seen = 0;
    for (var observation : trace("scenarios/open-rows/call-binding-time/tag-stable.scenario.json")) {
      if (!observation.has("openWaits")) {
        continue;
      }
      for (var wait : observation.get("openWaits")) {
        if (!"AssessRequest".equals(wait.get("id").get("elementId").asText())) {
          continue;
        }
        var definition = wait.get("definition");
        assertEquals("Process_Callee", definition.get("key").asText());
        assertEquals("stable", definition.get("versionTag").asText());
        assertTrue(definition.get("version").isNull());
        assertTrue(definition.get("deployment").isNull());
        seen++;
      }
    }
    assertTrue("the witness reaches the called AssessRequest", seen > 0);
  }

  private static JsonNode trace(String scenario) throws Exception {
    try (var runner = CibSevenScenarioRunner.create()) {
      var result =
          runner.run(ScenarioJson.read(PROJECT_ROOT.resolve(scenario)), PROJECT_ROOT,
              CibEffectExecutionSchedule.PLAIN_SUCCESS);
      return new ObjectMapper().readTree(ScenarioJson.write(result)).get("trace");
    }
  }
}
