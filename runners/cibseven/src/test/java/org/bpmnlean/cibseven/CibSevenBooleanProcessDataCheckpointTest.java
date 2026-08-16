package org.bpmnlean.cibseven;

import static org.bpmnlean.cibseven.ScenarioProtocol.CommandOutcome.COMMITTED;
import static org.bpmnlean.cibseven.ScenarioProtocol.CommandOutcome.REJECTED;
import static org.bpmnlean.cibseven.ScenarioProtocol.ProcessStatus.RUNNING;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

import java.nio.file.Path;
import java.util.List;
import org.bpmnlean.cibseven.ScenarioProtocol.BooleanValue;
import org.bpmnlean.cibseven.ScenarioProtocol.CommandObservation;
import org.bpmnlean.cibseven.ScenarioProtocol.CompleteUserTaskInstanceStimulus;
import org.bpmnlean.cibseven.ScenarioProtocol.SemanticOutcome;
import org.bpmnlean.cibseven.ScenarioProtocol.StateObservation;
import org.bpmnlean.cibseven.ScenarioProtocol.StringValue;
import org.bpmnlean.cibseven.ScenarioProtocol.VariableBinding;
import org.junit.AfterClass;
import org.junit.BeforeClass;
import org.junit.Test;

/** Typed Boolean preservation and profile-refusal checks for the CIB scenario boundary. */
public final class CibSevenBooleanProcessDataCheckpointTest {

  private static final String BOOLEAN_PROFILE =
      "cibseven-2.2.0-user-task-boolean-completion-data-draft";
  private static final String OLD_PROFILE =
      "cibseven-2.2.0-user-task-process-data-draft";
  private static final Path PROJECT_ROOT = Path.of("../..").toAbsolutePath().normalize();
  private static final Path SCENARIO_PATH =
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
  public void newProfilePreservesTrueAndFalseAsBooleanRawAndCanonicalValues()
      throws Exception {
    for (var value : List.of(true, false)) {
      var parsed =
          ScenarioJson.read(
              ScenarioJson.writeScenario(withCompletion(BOOLEAN_PROFILE, value)));
      var result = runner.run(parsed, PROJECT_ROOT);

      assertEquals(new SemanticOutcome(COMMITTED), result.outcome());
      var finalState = (StateObservation) result.trace().getLast();
      assertEquals(
          new VariableBinding("decision", new BooleanValue(value)),
          finalState.variables().getFirst());
      var rawDecision =
          result
              .diagnostics()
              .stateQueries()
              .getLast()
              .variables()
              .stream()
              .filter(variable -> variable.name().equals("decision"))
              .findFirst()
              .orElseThrow()
              .value();
      assertTrue(rawDecision instanceof Boolean);
      assertEquals(value, rawDecision);
      assertFalse(Boolean.toString(value).equals(rawDecision));
    }
  }

  @Test
  public void oldProfileRefusesBooleanBeforeCompletingAndPreservesLiveState()
      throws Exception {
    var result = runner.run(withCompletion(OLD_PROFILE, true), PROJECT_ROOT);

    assertEquals(new SemanticOutcome(REJECTED), result.outcome());
    assertEquals(new CommandObservation("complete-user-task-instance", REJECTED), result.trace().get(3));
    assertEquals(result.trace().get(2), result.trace().get(4));
    assertEquals(RUNNING, ((StateObservation) result.trace().getLast()).status());
    assertEquals(
        result.diagnostics().stateQueries().getFirst().variables(),
        result.diagnostics().stateQueries().getLast().variables());
  }

  @Test
  public void booleanStartAndEffectPatchRemainOutsideBooleanCompletionProfile() throws Exception {
    var scenario = ScenarioJson.read(SCENARIO_PATH);
    var start = (ScenarioProtocol.StartProcessStimulus) scenario.stimuli().getFirst();
    var booleanStart =
        new ScenarioProtocol.StartProcessStimulus(
            start.commandId(),
            start.processId(),
            start.instanceId(),
            List.of(new VariableBinding("approved", new BooleanValue(true))));
    var invalid =
        new ScenarioProtocol.ScenarioDefinition(
            scenario.kind(),
            scenario.id(),
            BOOLEAN_PROFILE,
            scenario.bpmn(),
            List.of(booleanStart, scenario.stimuli().get(1)),
            scenario.observations(),
            scenario.provenance());

    assertThrows(IllegalArgumentException.class, () -> runner.run(invalid, PROJECT_ROOT));
    assertFalse(
        ScenarioVariableValuePolicy.admits(
            BOOLEAN_PROFILE,
            ScenarioVariableValuePolicy.Surface.EFFECT_PATCH,
            List.of(new VariableBinding("approved", new BooleanValue(true)))));
  }

  private static ScenarioProtocol.ScenarioDefinition withCompletion(
      String profile, boolean value) throws Exception {
    var scenario = ScenarioJson.read(SCENARIO_PATH);
    var existing =
        (CompleteUserTaskInstanceStimulus) scenario.stimuli().get(1);
    var completion =
        new CompleteUserTaskInstanceStimulus(
            existing.commandId(),
            existing.taskId(),
            List.of(new VariableBinding("decision", new BooleanValue(value))));
    return new ScenarioProtocol.ScenarioDefinition(
        scenario.kind(),
        scenario.id(),
        profile,
        scenario.bpmn(),
        List.of(scenario.stimuli().getFirst(), completion),
        scenario.observations(),
        scenario.provenance());
  }
}
