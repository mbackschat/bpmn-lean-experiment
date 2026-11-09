package org.bpmnlean.cibseven;

import java.io.IOException;
import java.nio.file.Path;
import java.util.EnumMap;
import org.bpmnlean.cibseven.ScenarioProtocol.ScenarioDefinition;
import org.bpmnlean.cibseven.ScenarioProtocol.ScenarioResult;

/** Routes each scenario to an engine bundle with the environment its declared options select. */
public final class CibSevenScenarioRunner implements AutoCloseable {

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

  /**
   * An incident schedule names a harness run whose effects fail into incidents, so it and the scenario's
   * `options.incidents` are selected together.
   */
  public synchronized ScenarioResult run(
      ScenarioDefinition scenario,
      Path projectRoot,
      CibEffectExecutionSchedule effectSchedule)
      throws IOException {
    if (closed) {
      throw new IllegalStateException("Runner is closed");
    }
    var incidents = scenario.declaredOptions().incidentsEnabled();
    var incidentSchedule =
        effectSchedule == CibEffectExecutionSchedule.INCIDENT_REPORT_RETRY_SUCCESS
            || effectSchedule == CibEffectExecutionSchedule.INCIDENT_REPORT_CANCEL;
    if (incidents != incidentSchedule) {
      throw new IllegalArgumentException(
          "options.incidents and an incident CIB schedule must be selected together");
    }
    var environment =
        incidents ? EngineEnvironment.INCIDENT_ENABLED : EngineEnvironment.DEFAULT;
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
    DEFAULT(false),
    INCIDENT_ENABLED(true);

    private final boolean incidentCreationEnabled;

    EngineEnvironment(boolean incidentCreationEnabled) {
      this.incidentCreationEnabled = incidentCreationEnabled;
    }
  }
}
