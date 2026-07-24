package org.bpmnlean.cibseven;

import static java.nio.charset.StandardCharsets.UTF_8;

import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.Test;

/**
 * Test-scope bridge used by the dependency-free Node differential harness.
 *
 * <p>Surefire already owns the approved CIB runtime classpath. This bridge keeps that classpath
 * concern outside the canonical comparator and exports one ordinary public-service runner result
 * without adding another Maven plugin or bundled runtime artifact.
 */
public final class CibSevenPipelineExportBridge {

  @Test
  public void exportsCanonicalScenarioResult() throws Exception {
    var projectRoot = requiredPath("bpmn.pipeline.projectRoot");
    var scenarioPath = requiredPath("bpmn.pipeline.scenario");
    var outputPath = requiredPath("bpmn.pipeline.output");
    var scenario = ScenarioJson.read(scenarioPath);

    try (var runner = CibSevenScenarioRunner.create()) {
      var result = runner.run(scenario, projectRoot);
      Files.writeString(outputPath, ScenarioJson.write(result), UTF_8);
    }
  }

  private static Path requiredPath(String propertyName) {
    var value = System.getProperty(propertyName);
    if (value == null || value.isBlank()) {
      throw new IllegalArgumentException("Missing system property: " + propertyName);
    }
    return Path.of(value).toAbsolutePath().normalize();
  }
}
