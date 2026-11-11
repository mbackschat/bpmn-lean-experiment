package org.bpmnlean.cibseven;

import static java.nio.charset.StandardCharsets.UTF_8;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.bpmnlean.cibseven.PopulationProtocol.Deployed;
import org.bpmnlean.cibseven.PopulationProtocol.DeploymentEntry;
import org.bpmnlean.cibseven.PopulationProtocol.DeploymentRefused;
import org.bpmnlean.cibseven.PopulationProtocol.FanOut;
import org.bpmnlean.cibseven.PopulationProtocol.NoMatch;
import org.bpmnlean.cibseven.PopulationProtocol.PopulationResult;
import org.bpmnlean.cibseven.PopulationProtocol.Started;
import org.bpmnlean.cibseven.PopulationProtocol.StepEntry;
import org.bpmnlean.cibseven.PopulationProtocol.VersionEntry;
import org.bpmnlean.cibseven.ScenarioProtocol.CommandOutcome;
import org.junit.Test;

/**
 * The population wire contract as the CIB runner reads and answers it, the derived instance identities it maps CIB's
 * instances to (population contract §4), and the root-process rule it shares with the kernel reader.
 */
public class PopulationContractTest {

  private static final Path PROJECT_ROOT = Path.of("../..").toAbsolutePath().normalize();

  @Test
  public void readsEveryRepositoryPopulationScenario() throws Exception {
    List<Path> scenarios;
    try (var files = Files.walk(PROJECT_ROOT.resolve("scenarios"))) {
      scenarios = files.filter(path -> path.getFileName().toString().endsWith(".population-scenario.json")).toList();
    }
    assertFalse(scenarios.isEmpty());
    for (var path : scenarios) {
      var scenario = ScenarioJson.readPopulation(Files.readString(path, UTF_8));
      assertTrue(path.toString(), ScenarioJson.isPopulation(Files.readString(path, UTF_8)));
      assertFalse(path.toString(), scenario.steps().isEmpty());
    }
  }

  @Test
  public void derivedIdentitiesPrefixEachPartByItsUtf8ByteLength() {
    assertEquals("start:10:publish-ä:2:12:7:Start_1",
        CibSevenPopulationCommands.startedInstanceId("publish-ä", 12, "Start_1"));
    assertEquals("timer:1:3:11:Timer_Start:60000",
        CibSevenPopulationCommands.timerInstanceId(3, "Timer_Start", 60000));
  }

  /**
   * The literals `packages/differential/test/cib-runner-identities.test.ts` pins for the kernel's `cascadeInstanceId`,
   * so the runner and the kernel name a cascade-started instance alike, byte for byte.
   */
  @Test
  public void cascadeIdentityExtendsTheStartIdentityByTheLengthPrefixedEmitterKey() {
    var emitter = CibSevenCascades.emitterKey("Antrag-ß", "Throw_1", 3);
    assertEquals("9:Antrag-ß:7:Throw_1:3", emitter);
    assertEquals("start:10:publish-ä:1:2:8:Start_Ü:23:9:Antrag-ß:7:Throw_1:3",
        CibSevenCascades.cascadeInstanceId("publish-ä", 2, "Start_Ü", emitter));
    assertEquals("start:3:c-1:1:3:5:Start:29:13:Bestellung-ä:8:Wurf-€:2",
        CibSevenCascades.cascadeInstanceId("c-1", 3, "Start", CibSevenCascades.emitterKey("Bestellung-ä", "Wurf-€", 2)));
  }

  private static String document(String calledElement, String declarations) {
    return """
        <?xml version="1.0" encoding="UTF-8"?>
        <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" %s
            targetNamespace="urn:population" id="Definitions_1">
          <process id="Callee" isExecutable="true"/>
          <process id="Caller" isExecutable="true">
            <callActivity id="Call" calledElement="%s"/>
          </process>
        </definitions>
        """.formatted(declarations, calledElement);
  }

  private static String root(String calledElement, String declarations) {
    return CibSevenModelAddresses.rootProcessId(document(calledElement, declarations).getBytes(UTF_8));
  }

  @Test
  public void rootIsTheFirstProcessNoCallOfItsNamespaceNames() {
    assertEquals("Caller", root("Callee", ""));
    assertEquals("Caller", root("tns:Callee", "xmlns:tns=\"urn:population\""));
    // A Call of another namespace, or through an unbound prefix, names no process of this document (`Semantic.xsd:149`).
    assertEquals("Callee", root("other:Callee", "xmlns:other=\"urn:elsewhere\""));
    assertEquals("Callee", root("unbound:Callee", ""));
  }

  @Test
  public void writesTheKernelResultShapesWithinCibsBoundary() throws Exception {
    var result = new PopulationResult(
        PopulationProtocol.POPULATION_RESULT_KIND,
        "population",
        List.of(
            new DeploymentEntry(1, "first", List.of(new VersionEntry("Process", 1)), new Deployed()),
            new DeploymentEntry(2, "second", List.of(), new DeploymentRefused())),
        List.of(
            new StepEntry("publish", 1, 0, CommandOutcome.COMMITTED,
                new FanOut(List.of(new Started("start:7:publish:1:1:5:Start", 1, 1, "Start")))),
            new StepEntry("again", 2, 5, CommandOutcome.ROLLED_BACK, new NoMatch())),
        List.of(),
        List.of(),
        null);
    var json = new ObjectMapper().readTree(ScenarioJson.writePopulation(result));
    assertFalse(json.has("inputFailures"));
    assertEquals("deploymentRefused", json.at("/deployments/1/outcome/kind").asText());
    assertEquals("fanOut", json.at("/steps/0/resolution/kind").asText());
    assertEquals("started", json.at("/steps/0/resolution/entries/0/kind").asText());
    assertEquals("rolledBack", json.at("/steps/1/outcome").asText());
    assertEquals("noMatch", json.at("/steps/1/resolution/kind").asText());
  }
}
