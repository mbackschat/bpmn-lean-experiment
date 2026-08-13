package org.bpmnlean.cibseven;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.DigestInputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.EnumSet;
import java.util.HexFormat;
import java.util.Objects;
import org.bpmnlean.cibseven.ScenarioMessageProtocol.DeliverMessageStimulus;
import org.bpmnlean.cibseven.ScenarioProtocol.CompleteEffectStimulus;
import org.bpmnlean.cibseven.ScenarioProtocol.CancelIncidentProcessStimulus;
import org.bpmnlean.cibseven.ScenarioProtocol.CompleteUserTaskInstanceStimulus;
import org.bpmnlean.cibseven.ScenarioProtocol.FireTimerStimulus;
import org.bpmnlean.cibseven.ScenarioProtocol.ObservationKind;
import org.bpmnlean.cibseven.ScenarioProtocol.ReportEffectFailureStimulus;
import org.bpmnlean.cibseven.ScenarioProtocol.RetryIncidentStimulus;
import org.bpmnlean.cibseven.ScenarioProtocol.ScenarioDefinition;
import org.bpmnlean.cibseven.ScenarioProtocol.StartProcessStimulus;

/** Validates the closed scenario shape and binds its content-addressed BPMN resource. */
final class CibSevenScenarioValidator {

  private static final EnumSet<ObservationKind> SUPPORTED_OBSERVATIONS =
      EnumSet.of(
          ObservationKind.DEPLOYMENT,
          ObservationKind.COMMAND_RESULTS,
          ObservationKind.PROCESS_STATUS,
          ObservationKind.ACTIVE_WAITS,
          ObservationKind.OPEN_USER_TASKS,
          ObservationKind.OPEN_TIMERS,
          ObservationKind.OPEN_EFFECTS,
          ObservationKind.VARIABLES,
          ObservationKind.ENABLED_INTERACTIONS,
          ObservationKind.LOGICAL_TIME);

  private final CibSevenRelease release;

  CibSevenScenarioValidator(CibSevenRelease release) {
    this.release = Objects.requireNonNull(release, "release");
  }

  ValidatedScenario validate(ScenarioDefinition scenario, Path projectRoot) throws IOException {
    Objects.requireNonNull(scenario, "scenario");
    Objects.requireNonNull(projectRoot, "projectRoot");
    ScenarioVariableValuePolicy.requireScenarioSurfaces(scenario);
    release.requireScenarioRevision(scenario);
    if (!ScenarioProtocol.SCENARIO_KIND.equals(scenario.kind()) || scenario.profile().isBlank()) {
      throw new IllegalArgumentException("Scenario kind and profile identity are required");
    }
    if (scenario.observations().size() != SUPPORTED_OBSERVATIONS.size()
        || !EnumSet.copyOf(scenario.observations()).equals(SUPPORTED_OBSERVATIONS)) {
      throw new IllegalArgumentException(
          "Scenario requires its canonical observation kinds exactly once");
    }
    var startsOnce =
        !scenario.stimuli().isEmpty()
            && scenario.stimuli().getFirst() instanceof StartProcessStimulus;
    var hasExpectedCompletions =
        startsOnce
            && scenario.stimuli().subList(1, scenario.stimuli().size()).stream()
                .allMatch(
                    stimulus ->
                        stimulus instanceof CompleteUserTaskInstanceStimulus
                            || stimulus instanceof DeliverMessageStimulus
                            || stimulus instanceof FireTimerStimulus
                            || stimulus instanceof CompleteEffectStimulus
                            || stimulus instanceof ReportEffectFailureStimulus
                            || stimulus instanceof RetryIncidentStimulus
                            || stimulus instanceof CancelIncidentProcessStimulus);
    if (!startsOnce || !hasExpectedCompletions) {
      throw new IllegalArgumentException(
          "Scenario supports startProcess followed by task, Message, timer, effect, or incident commands");
    }

    var bpmnPath = projectRoot.resolve(scenario.bpmn().relativePath()).normalize();
    requireContainedByProject(projectRoot, bpmnPath);
    verifySha256(bpmnPath, scenario.bpmn().sha256());
    return new ValidatedScenario((StartProcessStimulus) scenario.stimuli().getFirst(), bpmnPath);
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

  record ValidatedScenario(StartProcessStimulus start, Path bpmnPath) {}
}
