package org.bpmnlean.cibseven;

import static org.bpmnlean.cibseven.ScenarioProtocol.CommandOutcome.COMMITTED;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.nio.file.Path;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.bpmnlean.cibseven.ScenarioProtocol.BooleanValue;
import org.bpmnlean.cibseven.ScenarioProtocol.OpenUserTask;
import org.bpmnlean.cibseven.ScenarioProtocol.SemanticOutcome;
import org.bpmnlean.cibseven.ScenarioProtocol.StateObservation;
import org.junit.AfterClass;
import org.junit.BeforeClass;
import org.junit.Test;

/** Combined CIB checkpoint for two element-bound metadata tasks and Boolean patches. */
public final class CibSevenParallelUserTaskMetadataCheckpointTest {

  private static final Path PROJECT_ROOT = Path.of("../..").toAbsolutePath().normalize();
  private static final Path SCENARIO_ROOT =
      PROJECT_ROOT.resolve("scenarios/parallel-user-task-metadata-composition");
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
  public void retainsBothMetadataBlocksAndBooleanPatchesContentThenRisk()
      throws Exception {
    verifyCombinedScenario(
        "content-then-risk.scenario.json",
        "UserTask_RiskReview",
        "riskApproved");
  }

  @Test
  public void retainsBothMetadataBlocksAndBooleanPatchesRiskThenContent()
      throws Exception {
    verifyCombinedScenario(
        "risk-then-content.scenario.json",
        "UserTask_ContentReview",
        "contentApproved");
  }

  @Test
  public void keepsProcessStartEmptyAndBooleanWritesOnTaskCompletionOnly() {
    var booleanBinding = java.util.List.of(
        new ScenarioProtocol.VariableBinding("approved", new BooleanValue(true)));
    assertFalse(
        ScenarioVariableValuePolicy.admits(
            CibSevenUserTaskMetadataProjector.PARALLEL_PROFILE,
            ScenarioVariableValuePolicy.Surface.PROCESS_START,
            booleanBinding));
    assertTrue(
        ScenarioVariableValuePolicy.admits(
            CibSevenUserTaskMetadataProjector.PARALLEL_PROFILE,
            ScenarioVariableValuePolicy.Surface.USER_TASK_COMPLETION,
            booleanBinding));
    assertFalse(
        ScenarioVariableValuePolicy.admits(
            CibSevenUserTaskMetadataProjector.PARALLEL_PROFILE,
            ScenarioVariableValuePolicy.Surface.EFFECT_PATCH,
            booleanBinding));
  }

  private static void verifyCombinedScenario(
      String scenarioFile,
      String expectedSiblingElementId,
      String expectedSiblingField)
      throws Exception {
    var result = runner.run(ScenarioJson.read(SCENARIO_ROOT.resolve(scenarioFile)), PROJECT_ROOT);

    assertEquals(new SemanticOutcome(COMMITTED), result.outcome());
    var rawStartTasks = result.diagnostics().taskQueries().getFirst().tasks();
    var rawByElement = rawStartTasks.stream().collect(
        Collectors.toMap(
            ScenarioDiagnosticsProtocol.TaskQueryTask::elementId,
            Function.identity()));
    assertEquals(2, rawByElement.size());
    requireRawMetadata(rawByElement, "UserTask_ContentReview", "contentApproved");
    requireRawMetadata(rawByElement, "UserTask_RiskReview", "riskApproved");

    var waiting = (StateObservation) result.trace().get(2);
    var canonicalByElement = waiting.openUserTasks().stream().collect(
        Collectors.toMap(task -> task.id().elementId(), Function.identity()));
    assertEquals(2, canonicalByElement.size());
    requireCanonicalMetadata(canonicalByElement, "UserTask_ContentReview", "contentApproved");
    requireCanonicalMetadata(canonicalByElement, "UserTask_RiskReview", "riskApproved");

    var intermediate = (StateObservation) result.trace().get(4);
    assertEquals(1, intermediate.openUserTasks().size());
    var sibling = intermediate.openUserTasks().getFirst();
    assertEquals(expectedSiblingElementId, sibling.id().elementId());
    requireCanonicalMetadata(
        Map.of(expectedSiblingElementId, sibling),
        expectedSiblingElementId,
        expectedSiblingField);

    var finalState = (StateObservation) result.trace().getLast();
    assertEquals("completed", finalState.status().wireValue());
    assertEquals(
        Map.of(
            "contentApproved", new BooleanValue(true),
            "riskApproved", new BooleanValue(true)),
        finalState.variables().stream().collect(
            Collectors.toMap(
                ScenarioProtocol.VariableBinding::name,
                ScenarioProtocol.VariableBinding::value)));
    assertEquals(
        Map.of("contentApproved", true, "riskApproved", true),
        result.diagnostics().stateQueries().getLast().variables().stream().collect(
            Collectors.toMap(
                CibStateQueryEvidence.ProcessVariableSnapshot::name,
                CibStateQueryEvidence.ProcessVariableSnapshot::value)));
  }

  private static void requireRawMetadata(
      Map<String, ScenarioDiagnosticsProtocol.TaskQueryTask> tasks,
      String elementId,
      String fieldId) {
    var task = tasks.get(elementId);
    assertEquals(
        new ScenarioDiagnosticsProtocol.IdentityLinkEvidence(
            "candidate", null, "reviewers"),
        task.identityLinks().getFirst());
    assertEquals(
        new ScenarioDiagnosticsProtocol.FormFieldEvidence(fieldId, "boolean"),
        task.formFields().getFirst());
  }

  private static void requireCanonicalMetadata(
      Map<String, OpenUserTask> tasks,
      String elementId,
      String fieldKey) {
    var metadata = tasks.get(elementId).metadata();
    assertEquals("reviewers", metadata.assignment().candidates().getFirst().id());
    assertEquals(fieldKey, metadata.form().fields().getFirst().key());
    assertEquals("boolean", metadata.form().fields().getFirst().type());
  }
}
