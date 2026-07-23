package org.bpmnlean.cibseven;

import static org.bpmnlean.cibseven.ScenarioProtocol.CommandOutcome.COMMITTED;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;

import java.io.StringReader;
import java.io.StringWriter;
import java.nio.file.Path;
import org.bpmnlean.cibseven.ScenarioProtocol.SemanticOutcome;
import org.junit.Test;

public class CibSevenOracleMainTest {

  private static final Path PROJECT_ROOT = Path.of("../..").toAbsolutePath().normalize();
  private static final Path SCENARIO_PATH =
      PROJECT_ROOT.resolve("scenarios/m0-sequential-user-task/scenario.json");

  @Test
  public void servesTwoScenariosThroughOneJsonLinesProcess() throws Exception {
    var request = ScenarioJson.writeScenario(ScenarioJson.read(SCENARIO_PATH));
    var input = new StringReader(request + System.lineSeparator() + request);
    var output = new StringWriter();

    CibSevenOracleMain.serve(input, output, PROJECT_ROOT);

    var lines = output.toString().lines().toList();
    assertEquals(2, lines.size());
    var first = ScenarioJson.readResult(lines.get(0));
    var second = ScenarioJson.readResult(lines.get(1));
    assertEquals(new SemanticOutcome(COMMITTED), first.outcome());
    assertEquals(first.trace(), second.trace());
    assertEquals(ScenarioProtocol.CleanupProjection.clean(), first.diagnostics().cleanup());
    assertEquals(ScenarioProtocol.CleanupProjection.clean(), second.diagnostics().cleanup());
    assertFalse(lines.get(0).contains("processInstanceId"));
    assertFalse(lines.get(0).contains("processDefinitionId"));
  }
}
