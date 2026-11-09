package org.bpmnlean.cibseven;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.DigestInputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Objects;
import org.bpmnlean.cibseven.ScenarioProtocol.ScenarioDefinition;
import org.bpmnlean.cibseven.ScenarioProtocol.Start;

/** Validates the closed scenario shape and binds its content-addressed BPMN resource. */
final class CibSevenScenarioValidator {

  private final CibSevenRelease release;

  CibSevenScenarioValidator(CibSevenRelease release) {
    this.release = Objects.requireNonNull(release, "release");
  }

  ValidatedScenario validate(ScenarioDefinition scenario, Path projectRoot) throws IOException {
    Objects.requireNonNull(scenario, "scenario");
    Objects.requireNonNull(projectRoot, "projectRoot");
    release.requireScenarioRevision(scenario);
    if (!ScenarioProtocol.SCENARIO_KIND.equals(scenario.kind()) || scenario.profile().isBlank()) {
      throw new IllegalArgumentException("Scenario kind and profile identity are required");
    }
    var stimuli = scenario.stimuli();
    if (stimuli.isEmpty()
        || !(stimuli.getFirst() instanceof Start start)
        || stimuli.stream().skip(1).anyMatch(Start.class::isInstance)) {
      throw new IllegalArgumentException("Scenario starts exactly once, with its first stimulus");
    }
    var bpmnPath = projectRoot.resolve(scenario.bpmn().relativePath()).normalize();
    requireContainedByProject(projectRoot, bpmnPath);
    verifySha256(bpmnPath, scenario.bpmn().sha256());
    return new ValidatedScenario(start, bpmnPath);
  }

  private static void requireContainedByProject(Path projectRoot, Path resource)
      throws IOException {
    var realRoot = projectRoot.toRealPath();
    var realResource = resource.toRealPath();
    if (!realResource.startsWith(realRoot)) {
      throw new IllegalArgumentException("BPMN resource escapes project root: " + resource);
    }
  }

  private static void verifySha256(Path path, String expected) throws IOException {
    try {
      var digest = MessageDigest.getInstance("SHA-256");
      try (InputStream input = new DigestInputStream(Files.newInputStream(path), digest)) {
        input.transferTo(OutputStream.nullOutputStream());
      }
      var actual = HexFormat.of().formatHex(digest.digest());
      if (!actual.equals(expected)) {
        throw new IllegalArgumentException(
            "BPMN SHA-256 mismatch for " + path + ": expected " + expected + ", got " + actual);
      }
    } catch (NoSuchAlgorithmException impossible) {
      throw new IllegalStateException("Java runtime does not provide SHA-256", impossible);
    }
  }

  record ValidatedScenario(Start start, Path bpmnPath) {}
}
