package org.bpmnlean.cibseven;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.io.StringReader;
import java.io.StringWriter;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import org.junit.Test;

public class CibSevenOracleMainTest {

  private static final Path PROJECT_ROOT = Path.of("../..").toAbsolutePath().normalize();
  @Test
  public void servesTheInteractionCapsuleInRequestOrderThroughOneEngine()
      throws Exception {
    var capsuleRoot =
        PROJECT_ROOT.resolve("scenarios/user-task-discovery-completion");
    var scenarios =
        List.of(
            ScenarioJson.read(capsuleRoot.resolve("scenario.json")),
            ScenarioJson.read(
                capsuleRoot.resolve("wrong-activation.scenario.json")),
            ScenarioJson.read(
                capsuleRoot.resolve("stale-completion.scenario.json")));
    var request = new StringBuilder();
    for (var scenario : scenarios) {
      request
          .append(ScenarioJson.writeScenario(scenario))
          .append(System.lineSeparator());
    }
    var output = new StringWriter();

    CibSevenOracleMain.serve(
        new StringReader(request.toString()), output, PROJECT_ROOT);

    var results = new ArrayList<ScenarioProtocol.ScenarioResult>();
    for (var line : output.toString().lines().toList()) {
      results.add(ScenarioJson.readResult(line));
    }
    assertEquals(
        scenarios.stream().map(ScenarioProtocol.ScenarioDefinition::id).toList(),
        results.stream().map(ScenarioProtocol.ScenarioResult::scenarioId).toList());
    assertTrue(
        results.stream()
            .allMatch(
                result ->
                    ScenarioProtocol.CleanupProjection.clean()
                        .equals(result.diagnostics().cleanup())));
    assertFalse(output.toString().contains("processDefinitionId"));
  }
}
