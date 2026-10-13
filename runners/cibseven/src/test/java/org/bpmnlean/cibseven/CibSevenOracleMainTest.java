package org.bpmnlean.cibseven;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

import java.io.StringReader;
import java.io.StringWriter;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.PrintStream;
import java.nio.charset.MalformedInputException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import org.junit.Test;

public class CibSevenOracleMainTest {

  private static final Path PROJECT_ROOT = Path.of("../..").toAbsolutePath().normalize();

  @Test
  public void rejectsMalformedUtf8AtStdinBeforeJsonAdmission() throws Exception {
    var priorInput = System.in;
    var priorOutput = System.out;
    try (var output = new PrintStream(new ByteArrayOutputStream())) {
      System.setIn(new ByteArrayInputStream(new byte[] {(byte) 0xff}));
      System.setOut(output);
      assertThrows(MalformedInputException.class, () -> CibSevenOracleMain.main(
          new String[] {"--project-root", PROJECT_ROOT.toString()}));
    } finally {
      System.setIn(priorInput);
      System.setOut(priorOutput);
    }
  }
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
                    ScenarioDiagnosticsProtocol.CleanupProjection.clean()
                        .equals(result.diagnostics().cleanup())));
    assertFalse(output.toString().contains("processDefinitionId"));
  }
}
