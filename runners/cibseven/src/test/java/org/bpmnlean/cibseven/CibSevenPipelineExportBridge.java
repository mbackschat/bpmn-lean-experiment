package org.bpmnlean.cibseven;

import static java.nio.charset.StandardCharsets.UTF_8;

import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.Test;

/**
 * Test-scope bridge used by the dependency-free Node differential harness.
 *
 * <p>Surefire already owns the approved CIB runtime classpath. This bridge keeps that classpath
 * concern outside the canonical comparator and exports one JSON-lines batch through the persistent
 * public-service runner without adding another Maven plugin or bundled runtime artifact.
 */
public final class CibSevenPipelineExportBridge {

  @Test
  public void exportsCanonicalScenarioBatch() throws Exception {
    var projectRoot = requiredPath("bpmn.pipeline.projectRoot");
    var inputPath = requiredPath("bpmn.pipeline.input");
    var outputPath = requiredPath("bpmn.pipeline.output");
    var effectSchedule =
        CibEffectExecutionSchedule.fromWireValue(
            System.getProperty("bpmn.pipeline.effectSchedule", "plainSuccess"));

    try (var input = Files.newBufferedReader(inputPath, UTF_8);
        var output = Files.newBufferedWriter(outputPath, UTF_8)) {
      CibSevenOracleMain.serve(input, output, projectRoot, effectSchedule);
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
