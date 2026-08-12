package org.bpmnlean.cibseven;

import static org.bpmnlean.cibseven.ScenarioProtocol.CommandOutcome.COMMITTED;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.nio.file.Path;
import org.bpmnlean.cibseven.ScenarioProtocol.BooleanValue;
import org.bpmnlean.cibseven.ScenarioProtocol.SemanticOutcome;
import org.bpmnlean.cibseven.ScenarioProtocol.StateObservation;
import org.junit.AfterClass;
import org.junit.BeforeClass;
import org.junit.Test;

/** Public-service and canonical checkpoint for one literal group and typed field. */
public final class CibSevenUserTaskMetadataCheckpointTest {

  private static final Path PROJECT_ROOT = Path.of("../..").toAbsolutePath().normalize();
  private static final Path METADATA_SCENARIO =
      PROJECT_ROOT.resolve("scenarios/user-task-assignment-form-metadata/scenario.json");
  private static final Path OLD_SCENARIO =
      PROJECT_ROOT.resolve("scenarios/user-task-discovery-completion/scenario.json");
  private static CibSevenScenarioRunner runner;

  @BeforeClass
  public static void createRunner() {
    runner = CibSevenScenarioRunner.create();
  }

  @AfterClass
  public static void closeRunner() {
    runner.close();
  }

  @Test
  public void retainsPublicIdentityLinkAndFormFactsAndProjectsNeutralMetadata()
      throws Exception {
    assertFalse(
        ScenarioVariableValuePolicy.admits(
            CibSevenUserTaskMetadataProjector.PROFILE,
            ScenarioVariableValuePolicy.Surface.PROCESS_START,
            java.util.List.of(
                new ScenarioProtocol.VariableBinding("approved", new BooleanValue(true)))));
    assertFalse(
        ScenarioVariableValuePolicy.admits(
            CibSevenUserTaskMetadataProjector.PROFILE,
            ScenarioVariableValuePolicy.Surface.EFFECT_PATCH,
            java.util.List.of(
                new ScenarioProtocol.VariableBinding("approved", new BooleanValue(true)))));
    var result = runner.run(ScenarioJson.read(METADATA_SCENARIO), PROJECT_ROOT);

    assertEquals(new SemanticOutcome(COMMITTED), result.outcome());
    var rawTask = result.diagnostics().taskQueries().getFirst().tasks().getFirst();
    assertEquals(
        new ScenarioDiagnosticsProtocol.IdentityLinkEvidence(
            "candidate", null, "reviewers"),
        rawTask.identityLinks().getFirst());
    assertEquals(
        new ScenarioDiagnosticsProtocol.FormFieldEvidence("approved", "boolean"),
        rawTask.formFields().getFirst());

    var waiting = (StateObservation) result.trace().get(2);
    var metadata = waiting.openUserTasks().getFirst().metadata();
    assertEquals("reviewers", metadata.assignment().candidates().getFirst().id());
    assertEquals("approved", metadata.form().fields().getFirst().key());
    assertEquals("boolean", metadata.form().fields().getFirst().type());

    var finalState = (StateObservation) result.trace().getLast();
    var approved = finalState.variables().stream()
        .filter(variable -> variable.name().equals("approved"))
        .findFirst()
        .orElseThrow();
    assertEquals(new BooleanValue(true), approved.value());
    assertTrue(
        result.diagnostics().stateQueries().getLast().variables().stream()
            .filter(variable -> variable.name().equals("approved"))
            .findFirst()
            .orElseThrow()
            .value() instanceof Boolean);
  }

  @Test
  public void oldProfileOmitsRawAndCanonicalMetadataFromJson() throws Exception {
    var result = runner.run(ScenarioJson.read(OLD_SCENARIO), PROJECT_ROOT);
    var rawTask = result.diagnostics().taskQueries().getFirst().tasks().getFirst();

    assertNull(rawTask.identityLinks());
    assertNull(rawTask.formFields());
    assertNull(((StateObservation) result.trace().get(2)).openUserTasks().getFirst().metadata());
    var json = ScenarioJson.write(result);
    assertFalse(json.contains("\"identityLinks\""));
    assertFalse(json.contains("\"formFields\""));
    assertFalse(json.contains("\"metadata\""));
  }
}
