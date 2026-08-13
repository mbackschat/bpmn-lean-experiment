package org.bpmnlean.cibseven;

import static org.bpmnlean.cibseven.ScenarioProtocol.CommandOutcome.COMMITTED;
import static org.bpmnlean.cibseven.ScenarioProtocol.ProcessStatus.COMPLETED;
import static org.junit.Assert.assertEquals;
import static org.junit.Assume.assumeTrue;

import java.nio.file.Path;
import java.util.List;
import org.bpmnlean.cibseven.ScenarioProtocol.CommandObservation;
import org.bpmnlean.cibseven.ScenarioProtocol.DeploymentObservation;
import org.bpmnlean.cibseven.ScenarioProtocol.SemanticOutcome;
import org.bpmnlean.cibseven.ScenarioProtocol.StateObservation;
import org.bpmnlean.cibseven.ScenarioProtocol.StringValue;
import org.bpmnlean.cibseven.ScenarioProtocol.VariableBinding;
import org.cibseven.bpm.engine.ProcessEngine;
import org.junit.Test;

/** Locks the exact synchronous CIB Seven 2.0 mapped-success host realization. */
public final class CibSevenMappedSuccessScenarioRunnerTest {

  private static final Path PROJECT_ROOT =
      Path.of("../..").toAbsolutePath().normalize();
  private static final Path SCENARIO_PATH =
      PROJECT_ROOT.resolve("scenarios/mapped-success-service-task/scenario.json");

  @Test
  public void mapsDelegateLocalOutputToFinalProcessVariable() throws Exception {
    assumeTrue(
        "2.0.0".equals(
            ProcessEngine.class.getPackage().getImplementationVersion()));
    var scenario = ScenarioJson.read(SCENARIO_PATH);

    try (var runner = CibSevenScenarioRunner.create()) {
      var result = runner.run(scenario, PROJECT_ROOT);
      var expectedVariable =
          new VariableBinding(
              "resultValue",
              new StringValue("example-result"));

      assertEquals(
          List.of(
              new DeploymentObservation(COMMITTED),
              new CommandObservation("start-mapped-success", COMMITTED),
              new StateObservation(
                  "Instance_1",
                  COMPLETED,
                  List.of(),
                  List.of(),
                  List.of(),
                  List.of(),
                  List.of(),
                  List.of(),
                  List.of(expectedVariable),
                  List.of(),
                  0)),
          result.trace());
      assertEquals(new SemanticOutcome(COMMITTED), result.outcome());
      assertEquals("2.0.0", result.diagnostics().engineVersion());
      assertEquals(1, result.diagnostics().mappingExecutions().size());
      var mapping = result.diagnostics().mappingExecutions().getFirst();
      assertEquals("mappedSuccessHandler", mapping.handler());
      assertEquals(
          List.of(
              new VariableBinding(
                  "requestValue",
                  new StringValue("example-input"))),
          mapping.arguments());
      assertEquals(
          List.of(
              new VariableBinding(
                  "result",
                  new StringValue("example-result"))),
          mapping.localPatch());
      assertEquals(1, mapping.invocations());
      assertEquals(
          ScenarioDiagnosticsProtocol.CleanupProjection.clean(),
          result.diagnostics().cleanup());
    }
  }
}
