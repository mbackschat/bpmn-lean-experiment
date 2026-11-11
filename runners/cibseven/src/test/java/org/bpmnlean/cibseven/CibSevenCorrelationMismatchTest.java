package org.bpmnlean.cibseven;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Path;
import org.junit.Test;

/**
 * A delivery whose criteria CIB matches to no execution is `rejected`, not rolled back: CIB throws
 * `MismatchingMessageCorrelationException` while it selects the target, before it changes any state, so the addressed
 * wait stays open and the run continues to the next input.
 */
public class CibSevenCorrelationMismatchTest {

  private static final Path PROJECT_ROOT = Path.of("../..").toAbsolutePath().normalize();

  @Test
  public void rejectsACorrelationWithoutATarget() throws Exception {
    var trace = trace("scenarios/open-rows/message-correlation-criteria/type-mismatch.scenario.json");
    var mismatch = indexOf(trace, "s02-deliver-ticket-as-text");
    assertEquals("rejected", trace.get(mismatch).get("outcome").asText());
    var after = trace.get(mismatch + 1);
    var open = false;
    for (var wait : after.get("openWaits")) {
      open |= "AwaitConfirmation".equals(wait.get("id").get("elementId").asText());
    }
    assertTrue("the addressed wait stays open", open);
    assertTrue("the run continues", indexOf(trace, "s03-deliver-ticket-as-integer") > mismatch);
  }

  private static int indexOf(JsonNode trace, String commandId) {
    for (var index = 0; index < trace.size(); index++) {
      if (commandId.equals(trace.get(index).path("commandId").asText())) {
        return index;
      }
    }
    return -1;
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
