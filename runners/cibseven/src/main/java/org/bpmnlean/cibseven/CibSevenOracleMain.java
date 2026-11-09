package org.bpmnlean.cibseven;

import com.fasterxml.jackson.core.JsonProcessingException;
import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.io.Reader;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.nio.charset.CodingErrorAction;
import java.nio.file.Path;

/**
 * Persistent JSON Lines boundary for callers in other runtimes.
 *
 * <p>Each non-empty input line is one scenario and each output line is its result, or its harness failure when the
 * runner cannot run it. The engine is started once per process and scenario cleanup is enforced by
 * {@link CibSevenScenarioRunner}.
 */
public final class CibSevenOracleMain {

  private CibSevenOracleMain() {}

  public static void main(String[] args) throws Exception {
    var projectRoot = parseProjectRoot(args);
    serve(
        new InputStreamReader(System.in, StandardCharsets.UTF_8.newDecoder()
            .onMalformedInput(CodingErrorAction.REPORT)
            .onUnmappableCharacter(CodingErrorAction.REPORT)),
        new OutputStreamWriter(System.out, StandardCharsets.UTF_8),
        projectRoot);
  }

  static void serve(Reader input, Writer output, Path projectRoot) throws IOException {
    serve(input, output, projectRoot, CibEffectExecutionSchedule.PLAIN_SUCCESS);
  }

  static void serve(
      Reader input,
      Writer output,
      Path projectRoot,
      CibEffectExecutionSchedule effectSchedule)
      throws IOException {
    var reader = input instanceof BufferedReader buffered ? buffered : new BufferedReader(input);
    var writer = output instanceof BufferedWriter buffered ? buffered : new BufferedWriter(output);
    try (var runner = CibSevenScenarioRunner.create()) {
      String line;
      while ((line = reader.readLine()) != null) {
        if (line.isBlank()) {
          continue;
        }
        var scenarioId = ScenarioJson.scenarioIdOf(line);
        try {
          var scenario = ScenarioJson.read(line);
          writer.write(ScenarioJson.write(runner.run(scenario, projectRoot, effectSchedule)));
        } catch (RuntimeException | JsonProcessingException failed) {
          // A line naming no scenario cannot be answered for one, so it fails the whole batch.
          if (scenarioId == null) {
            throw failed;
          }
          writer.write(ScenarioJson.writeFailure(new ScenarioProtocol.ScenarioHarnessFailure(
              ScenarioProtocol.SCENARIO_HARNESS_FAILURE_KIND, scenarioId, failed.toString())));
        }
        writer.newLine();
        writer.flush();
      }
    }
  }

  private static Path parseProjectRoot(String[] args) {
    if (args.length != 2 || !"--project-root".equals(args[0])) {
      throw new IllegalArgumentException(
          "Usage: CibSevenOracleMain --project-root <absolute-or-relative-path>");
    }
    return Path.of(args[1]).toAbsolutePath().normalize();
  }
}
