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
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public class CibSevenOracleMainTest {

  private static final Path PROJECT_ROOT = Path.of("../..").toAbsolutePath().normalize();
  private static final String ORDER_INVOICE = "scenarios/open-rows/journey-order-invoice/";

  @Rule public final TemporaryFolder temporary = new TemporaryFolder();

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
  public void numbersEachArmingOfARearmedRaceByItsGatewayActivationWithoutIncomingReferences() throws Exception {
    // reply-race.bpmn declares no `incoming` references, so the arms' gateway is found from the Sequence Flows; a
    // delivery to the first race's arm after the second arming must not reach the second race.
    var scenario = ScenarioJson.writeScenario(ScenarioJson.read(PROJECT_ROOT.resolve(
        "scenarios/open-rows/event-race-compositions/reply-race-repeated-previous-race-identity.scenario.json")));
    var output = new StringWriter();

    CibSevenOracleMain.serve(new StringReader(scenario + System.lineSeparator()), output, PROJECT_ROOT);

    var trace = ScenarioJson.readResult(output.toString().lines().findFirst().orElseThrow()).trace();
    assertTrue(trace.contains(new ScenarioProtocol.CommandObservation(
        "s04-deliver-ReplyReceived-1", ScenarioProtocol.CommandOutcome.REJECTED)));
    assertTrue(trace.contains(new ScenarioProtocol.CommandObservation(
        "s06-fire-ReplyOverdue-2", ScenarioProtocol.CommandOutcome.COMMITTED)));
  }

  @Test
  public void passesASchemaValidValueBeyondTheKernelsIngressBoundsToCib() throws Exception {
    // The depth, node and byte bounds are the kernel's ingress predicate, which the scenario schema does not state
    // (DATA-SEMANTICS-SPEC "Values"), so the runner hands such a value to CIB and records what CIB does with it.
    var scenario = ScenarioJson.writeScenario(ScenarioJson.read(
        PROJECT_ROOT.resolve("scenarios/open-rows/structured-value-bounds/start-over-depth-bound.scenario.json")));
    var output = new StringWriter();

    CibSevenOracleMain.serve(new StringReader(scenario + System.lineSeparator()), output, PROJECT_ROOT);

    var result = ScenarioJson.readResult(output.toString().lines().findFirst().orElseThrow());
    assertEquals("structured-value-bounds-start-over-depth-bound", result.scenarioId());
  }

  @Test
  public void answersEveryHandlerTheScenariosOverlayNamesWithTheScenariosOwnResults() throws Exception {
    var scenario = ScenarioJson.writeScenario(
        ScenarioJson.read(PROJECT_ROOT.resolve(ORDER_INVOICE + "automatic-success.scenario.json")));
    var output = new StringWriter();

    CibSevenOracleMain.serve(new StringReader(scenario + System.lineSeparator()), output, PROJECT_ROOT);

    var line = output.toString().lines().findFirst().orElseThrow();
    var trace = ScenarioJson.readResult(line).trace();
    for (var command : List.of("s01-start", "s02-enter-1", "s03-post-1", "s04-notice-1")) {
      assertTrue(command, trace.contains(
          new ScenarioProtocol.CommandObservation(command, ScenarioProtocol.CommandOutcome.COMMITTED)));
    }
    // Each wait publishes the overlay's descriptor, the one the kernel reads from the same overlay.
    assertTrue(line.contains("\"operation\":\"postInvoice\""));
    assertTrue(line.contains("\"operation\":\"sendPostingNotice\""));
  }

  @Test
  public void failsLoudlyAtATaskWhoseTokenTheScenariosOverlayDoesNotDeclare() throws Exception {
    var journey = PROJECT_ROOT.resolve(ORDER_INVOICE);
    var root = temporary.getRoot().toPath();
    Files.copy(journey.resolve("order-invoice.bpmn"), root.resolve("order-invoice.bpmn"));
    Files.copy(journey.resolve("grade-decision.dmn"), root.resolve("grade-decision.dmn"));
    var overlay = "{\"kind\":\"bpmnSourceOverlay\",\"id\":\"posting-only\",\"semanticProfile\":\"cibseven-2.2.0\","
        + "\"effectBindings\":[{\"source\":{\"implementation\":\"urn:bpmn-lean:effect-protocol:activity-v1\","
        + "\"delegateExpression\":\"${postInvoice}\"},\"descriptor\":{\"protocol\":"
        + "\"urn:bpmn-lean:effect-protocol:activity-v1\",\"operation\":\"postInvoice\"}}],\"inertAttributes\":[]}";
    Files.writeString(root.resolve("posting-only-overlay.json"), overlay, StandardCharsets.UTF_8);
    var source = ScenarioJson.read(journey.resolve("automatic-success.scenario.json"));
    var scenario = ScenarioJson.writeScenario(source)
        .replace(ORDER_INVOICE, "")
        .replace(source.bpmn().sourceOverlay().sha256(), sha256(overlay))
        .replace("\"id\":\"order-invoice-handlers\"", "\"id\":\"posting-only\"");
    var output = new StringWriter();

    CibSevenOracleMain.serve(new StringReader(scenario + System.lineSeparator()), output, root);

    var line = output.toString().lines().findFirst().orElseThrow();
    assertTrue(line, line.startsWith("{\"kind\":\"scenarioHarnessFailure\""));
    assertTrue(line, line.contains("SendNotice has no effect binding"));
  }

  private static String sha256(String text) throws Exception {
    return HexFormat.of().formatHex(
        MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8)));
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
