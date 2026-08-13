package org.bpmnlean.cibseven;

import java.io.IOException;
import java.nio.file.Path;
import java.util.EnumMap;
import org.bpmnlean.cibseven.ScenarioProtocol.ScenarioDefinition;
import org.bpmnlean.cibseven.ScenarioProtocol.ScenarioResult;

/** Routes each validated profile to an immutable engine bundle with the matching environment. */
public final class CibSevenScenarioRunner implements AutoCloseable {

  static final String INCIDENT_PROFILE =
      "cibseven-2.2.0-service-task-incident-draft";

  private final EnumMap<EngineEnvironment, CibSevenEngineScenarioRunner> runners =
      new EnumMap<>(EngineEnvironment.class);
  private boolean closed;

  private CibSevenScenarioRunner() {}

  public static CibSevenScenarioRunner create() {
    return new CibSevenScenarioRunner();
  }

  public synchronized ScenarioResult run(ScenarioDefinition scenario, Path projectRoot)
      throws IOException {
    return run(scenario, projectRoot, CibEffectExecutionSchedule.PLAIN_SUCCESS);
  }

  public synchronized ScenarioResult run(
      ScenarioDefinition scenario,
      Path projectRoot,
      CibEffectExecutionSchedule effectSchedule)
      throws IOException {
    if (closed) {
      throw new IllegalStateException("Runner is closed");
    }
    var incidentProfile = INCIDENT_PROFILE.equals(scenario.profile());
    var incidentSchedule =
        effectSchedule == CibEffectExecutionSchedule.INCIDENT_REPORT_RETRY_SUCCESS;
    if (incidentProfile != incidentSchedule) {
      throw new IllegalArgumentException(
          "incident profile and incident CIB schedule must be selected together");
    }
    var environment =
        incidentProfile ? EngineEnvironment.INCIDENT_ENABLED : EngineEnvironment.LEGACY_DEFAULT;
    var runner =
        runners.computeIfAbsent(
            environment,
            selected -> CibSevenEngineScenarioRunner.create(selected.incidentCreationEnabled));
    return runner.run(scenario, projectRoot, effectSchedule);
  }

  @Override
  public synchronized void close() {
    if (!closed) {
      runners.values().forEach(CibSevenEngineScenarioRunner::close);
      runners.clear();
      closed = true;
    }
  }

  private enum EngineEnvironment {
    LEGACY_DEFAULT(false),
    INCIDENT_ENABLED(true);

    private final boolean incidentCreationEnabled;

    EngineEnvironment(boolean incidentCreationEnabled) {
      this.incidentCreationEnabled = incidentCreationEnabled;
    }
  }
}
