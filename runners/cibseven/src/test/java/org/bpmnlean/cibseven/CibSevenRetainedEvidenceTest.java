package org.bpmnlean.cibseven;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.stream.Stream;
import org.junit.Test;

/**
 * The runner reproduces every retained CIB evidence result of its packaged release: the scenario next to each
 * `*cibseven-evidence.json` under `scenarios/`, discovered by name, runs through one runner and its canonical result
 * equals the retained one. Open waits compare in the canonical order of `canonical-result.schema.json`.
 */
public class CibSevenRetainedEvidenceTest {

  private static final Path PROJECT_ROOT = Path.of("../..").toAbsolutePath().normalize();
  private static final ObjectMapper MAPPER = new ObjectMapper();

  @Test
  public void reproducesEveryRetainedEvidenceResultOfThePackagedRelease() throws Exception {
    var version = CibSevenRelease.current().version();
    var compared = 0;
    try (var runner = CibSevenScenarioRunner.create(); var files = Files.walk(PROJECT_ROOT.resolve("scenarios"))) {
      for (var evidencePath : files.filter(path -> path.getFileName().toString().endsWith("cibseven-evidence.json"))
          .sorted().toList()) {
        var evidence = MAPPER.readTree(evidencePath.toFile());
        if (!version.equals(evidence.at("/producer/engineVersion").asText())) {
          continue;
        }
        var scenarioPath =
            evidencePath.resolveSibling(evidencePath.getFileName().toString()
                .replace("cibseven-evidence.json", "scenario.json"));
        var scenario = ScenarioJson.read(scenarioPath);
        var result = runner.run(scenario, PROJECT_ROOT, schedule(scenario));
        var actual = MAPPER.readTree(ScenarioJson.write(result));
        var expected = evidence.get("result");
        assertEquals(scenarioPath.toString(), canonical(expected.get("outcome")), canonical(actual.get("outcome")));
        assertEquals(scenarioPath.toString(), canonical(expected.get("trace")), canonical(actual.get("trace")));
        assertEquals(
            scenarioPath.toString(),
            MAPPER.valueToTree(ScenarioDiagnosticsProtocol.CleanupProjection.clean()),
            actual.at("/diagnostics/cleanup"));
        compared += 1;
      }
    }
    assertFalse("no retained evidence of CIB Seven " + version, compared == 0);
  }

  /** The harness schedule an evidence run used: incidents select the incident schedule of their cancellability. */
  private static CibEffectExecutionSchedule schedule(ScenarioProtocol.ScenarioDefinition scenario) {
    var options = scenario.declaredOptions();
    if (!options.incidentsEnabled()) {
      return CibEffectExecutionSchedule.PLAIN_SUCCESS;
    }
    return options.incidentsCancellable()
        ? CibEffectExecutionSchedule.INCIDENT_REPORT_CANCEL
        : CibEffectExecutionSchedule.INCIDENT_REPORT_RETRY_SUCCESS;
  }

  /** A copy with every `openWaits` list in the canonical wait order. */
  private static JsonNode canonical(JsonNode node) throws IOException {
    var copy = node.deepCopy();
    sortWaits(copy);
    return copy;
  }

  private static void sortWaits(JsonNode node) {
    if (node instanceof ObjectNode object) {
      object.properties().forEach(entry -> sortWaits(entry.getValue()));
      if (object.get("openWaits") instanceof ArrayNode waits) {
        var sorted = new ArrayList<JsonNode>();
        waits.forEach(sorted::add);
        sorted.sort(
            Comparator.comparing((JsonNode wait) -> wait.at("/id/processInstanceId").asText(), WireStrings::compare)
                .thenComparing(wait -> wait.at("/id/elementId").asText(), WireStrings::compare)
                .thenComparingLong(wait -> wait.at("/id/activation").asLong())
                .thenComparing(wait -> wait.at("/detail/kind").asText(), WireStrings::compare));
        waits.removeAll();
        sorted.forEach(waits::add);
      }
    } else if (node instanceof ArrayNode array) {
      Stream.iterate(0, index -> index < array.size(), index -> index + 1).forEach(index -> sortWaits(array.get(index)));
    }
  }
}
