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
import java.util.List;
import java.util.stream.Stream;
import org.junit.Test;

/**
 * The runner reproduces every retained CIB evidence result of its packaged release: the scenario next to each
 * `*cibseven-evidence.json` under `scenarios/`, discovered by name, runs through one runner and its canonical result,
 * or a population's deployments, steps, input failures and states, equal the retained ones. Open waits compare in the
 * canonical order of `canonical-result.schema.json`.
 *
 * <p>The system property {@value #BATCH_PROPERTY}, {@code i/n}, replays only the i-th of n contiguous slices of the sorted
 * evidence list, so each Maven call stays within its deadline as the evidence grows (#70); without it every file runs.
 * The slices partition this test's own discovery, so together they cover every file whatever n is.
 */
public class CibSevenRetainedEvidenceTest {

  private static final Path PROJECT_ROOT = Path.of("../..").toAbsolutePath().normalize();
  private static final ObjectMapper MAPPER = new ObjectMapper();
  private static final String POPULATION_EVIDENCE_KIND = "cibSevenPopulationEvidence";
  private static final String BATCH_PROPERTY = "bpmnlean.retainedEvidenceBatch";

  @Test
  public void reproducesEveryRetainedEvidenceResultOfThePackagedRelease() throws Exception {
    var version = CibSevenRelease.current().version();
    var compared = 0;
    List<Path> discovered;
    try (var files = Files.walk(PROJECT_ROOT.resolve("scenarios"))) {
      discovered = files.filter(path -> path.getFileName().toString().endsWith("cibseven-evidence.json")).sorted().toList();
    }
    try (var runner = CibSevenScenarioRunner.create()) {
      for (var evidencePath : batch(discovered, System.getProperty(BATCH_PROPERTY))) {
        var evidence = MAPPER.readTree(evidencePath.toFile());
        if (!version.equals(evidence.at("/producer/engineVersion").asText())) {
          continue;
        }
        var scenarioPath =
            evidencePath.resolveSibling(evidencePath.getFileName().toString()
                .replace("cibseven-evidence.json", "scenario.json"));
        if (POPULATION_EVIDENCE_KIND.equals(evidence.at("/kind").asText())) {
          var population = ScenarioJson.readPopulation(Files.readString(scenarioPath));
          var answer = MAPPER.readTree(ScenarioJson.writePopulation(runner.runPopulation(population, PROJECT_ROOT)));
          for (var member : List.of("deployments", "steps", "inputFailures", "processStates")) {
            assertEquals(scenarioPath + " " + member,
                canonical(evidence.at("/result").path(member)), canonical(answer.path(member)));
          }
          assertClean(scenarioPath, answer);
          compared += 1;
          continue;
        }
        var scenario = ScenarioJson.read(scenarioPath);
        var result = runner.run(scenario, PROJECT_ROOT, schedule(scenario));
        var actual = MAPPER.readTree(ScenarioJson.write(result));
        var expected = evidence.get("result");
        assertEquals(scenarioPath.toString(), canonical(expected.get("outcome")), canonical(actual.get("outcome")));
        assertEquals(scenarioPath.toString(), canonical(expected.get("trace")), canonical(actual.get("trace")));
        assertClean(scenarioPath, actual);
        compared += 1;
      }
    }
    assertFalse("no retained evidence of CIB Seven " + version, compared == 0);
  }

  /** The {@code i/n} slice of `files`: indices from floor((i-1)N/n) to floor(iN/n), all of them when `selector` is null. */
  private static List<Path> batch(List<Path> files, String selector) {
    if (selector == null) {
      return files;
    }
    var parts = selector.split("/", -1);
    if (parts.length != 2) {
      throw new IllegalArgumentException(BATCH_PROPERTY + " must be i/n, received " + selector);
    }
    var index = Integer.parseInt(parts[0]);
    var count = Integer.parseInt(parts[1]);
    if (count < 1 || index < 1 || index > count) {
      throw new IllegalArgumentException(BATCH_PROPERTY + " must be i/n with 1 <= i <= n, received " + selector);
    }
    var size = (long) files.size();
    return files.subList((int) ((index - 1) * size / count), (int) (index * size / count));
  }

  /**
   * The run removed everything it created. Both sides come from JSON text: `valueToTree` keeps the record's `long`
   * counts as long nodes, a parsed small number is an int node, and Jackson's node equality compares node types.
   */
  private static void assertClean(Path scenarioPath, JsonNode answer) throws IOException {
    assertEquals(
        scenarioPath.toString(),
        MAPPER.readTree(MAPPER.writeValueAsString(ScenarioDiagnosticsProtocol.CleanupProjection.clean())),
        answer.at("/diagnostics/cleanup"));
  }

  /**
   * The harness schedule an evidence run used: a scenario without incident options runs the plain schedule, and one
   * with them runs the cancellation schedule when its stimuli cancel the incident's Process and the retry schedule
   * otherwise. Cancellability itself is no schedule input, because CIB always offers public deletion.
   */
  private static CibEffectExecutionSchedule schedule(ScenarioProtocol.ScenarioDefinition scenario) {
    if (!scenario.declaredOptions().incidentsEnabled()) {
      return CibEffectExecutionSchedule.PLAIN_SUCCESS;
    }
    var cancels = scenario.stimuli().stream()
        .anyMatch(stimulus -> stimulus instanceof ScenarioProtocol.Command command
            && command.action() instanceof ScenarioProtocol.CancelIncidentProcess);
    return cancels
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
