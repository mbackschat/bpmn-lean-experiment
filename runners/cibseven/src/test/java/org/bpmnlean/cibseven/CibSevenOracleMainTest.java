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
  public void answersAScenarioItCannotRunWithAHarnessFailureAndRunsTheNext() throws Exception {
    var capsuleRoot = PROJECT_ROOT.resolve("scenarios/user-task-discovery-completion");
    var good = ScenarioJson.writeScenario(ScenarioJson.read(capsuleRoot.resolve("scenario.json")));
    var refused = good.replaceFirst("\"kind\":\"scenario\"", "\"kind\":\"scenario\",\"unknownField\":true");
    var output = new StringWriter();

    CibSevenOracleMain.serve(
        new StringReader(refused + System.lineSeparator() + good + System.lineSeparator()), output, PROJECT_ROOT);

    var lines = output.toString().lines().toList();
    assertEquals(2, lines.size());
    assertTrue(lines.get(0).startsWith("{\"kind\":\"scenarioHarnessFailure\""));
    assertTrue(lines.get(0).contains("unknownField"));
    assertEquals(ScenarioProtocol.SCENARIO_RESULT_KIND, ScenarioJson.readResult(lines.get(1)).kind());
  }

  /**
   * CIB's cascade delete throws for this witness's instance, stopped inside a Transaction's compensation
   * (`PvmAtomicOperationDeleteCascade` reaching `CompensationBehavior#getParentActivityInstanceId`), so the scenario
   * fails as a harness failure; the next scenario in the same engine must still start from an empty engine.
   */
  @Test
  public void leavesNoResidueForTheNextScenarioWhenCibCannotDeleteAFailedOne() throws Exception {
    var undeletable = ScenarioJson.writeScenario(ScenarioJson.read(
        PROJECT_ROOT.resolve("scenarios/open-rows/transaction-cancel-mixed/subjects-effect-first.scenario.json")));
    var good = ScenarioJson.writeScenario(ScenarioJson.read(
        PROJECT_ROOT.resolve("scenarios/user-task-discovery-completion/scenario.json")));
    var output = new StringWriter();

    CibSevenOracleMain.serve(
        new StringReader(undeletable + System.lineSeparator() + good + System.lineSeparator()), output, PROJECT_ROOT);

    var lines = output.toString().lines().toList();
    assertEquals(2, lines.size());
    assertTrue(lines.get(0).startsWith("{\"kind\":\"scenarioHarnessFailure\""));
    assertEquals(
        ScenarioDiagnosticsProtocol.CleanupProjection.clean(),
        ScenarioJson.readResult(lines.get(1)).diagnostics().cleanup());
  }

  @Test
  public void recordsAnUncheckedExceptionCibThrowsInsideACommandAsThatCommandsRollback() throws Exception {
    // CIB parses a text cardinality with Integer.parseInt (MultiInstanceActivityBehavior:148-151), so " 2" throws a raw
    // NumberFormatException out of the start command: CIB's behaviour, not a harness failure.
    var scenario = ScenarioJson.writeScenario(ScenarioJson.read(
        PROJECT_ROOT.resolve("scenarios/open-rows/multi-instance-expression-results/count-text-padded.scenario.json")));
    var output = new StringWriter();

    CibSevenOracleMain.serve(new StringReader(scenario + System.lineSeparator()), output, PROJECT_ROOT);

    var result = ScenarioJson.readResult(output.toString().lines().findFirst().orElseThrow());
    assertTrue(result.trace().contains(
        new ScenarioProtocol.CommandObservation("s01-start", ScenarioProtocol.CommandOutcome.ROLLED_BACK)));
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
