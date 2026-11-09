package org.bpmnlean.cibseven;

import java.util.HashMap;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;
import org.cibseven.bpm.engine.ProcessEngine;
import org.cibseven.bpm.engine.ProcessEngineConfiguration;
import org.cibseven.bpm.engine.impl.cfg.IdGenerator;
import org.cibseven.bpm.engine.impl.cfg.ProcessEngineConfigurationImpl;

/** Builds one engine bundle per environment for the streaming oracle facade. */
final class CibSevenEngineBundleFactory {

  private CibSevenEngineBundleFactory() {}

  static EngineBundle create(boolean incidentCreationEnabled) {
    var startedAt = System.nanoTime();
    var databaseName = "bpmn_lean_cibseven_" + UUID.randomUUID().toString().replace("-", "");
    var configuration =
        (ProcessEngineConfigurationImpl)
            ProcessEngineConfiguration.createStandaloneInMemProcessEngineConfiguration();
    configuration.setProcessEngineName(
        incidentCreationEnabled
            ? "bpmn-lean-cibseven-incident-oracle"
            : "bpmn-lean-cibseven-oracle");
    configuration.setJdbcUrl(
        "jdbc:h2:mem:" + databaseName + ";DB_CLOSE_DELAY=-1;LOCK_TIMEOUT=10000");
    configuration.setJobExecutorActivate(false);
    var ids = new ScenarioIds();
    configuration.setIdGenerator(ids);
    // Metric rows take generated identifiers and outlive a deployment's cascading deletion, so they would keep the
    // database from returning to its boot state between scenarios.
    configuration.setMetricsEnabled(false);
    configuration.setDbMetricsReporterActivate(false);
    configuration.setTaskMetricsEnabled(false);
    configuration.setHistory(ProcessEngineConfiguration.HISTORY_AUDIT);
    configuration.setHistoryTimeToLive("P180D");
    configuration.setEnforceHistoryTimeToLive(true);
    if (incidentCreationEnabled) {
      configuration.setCreateIncidentOnFailedJobEnabled(true);
    }
    var effects = new CibSevenScriptedEffect();
    var beans = new HashMap<Object, Object>();
    for (var handler : CibSevenScriptedEffect.HANDLER_BEANS) {
      beans.put(handler, effects.delegate(handler));
    }
    configuration.setBeans(beans);
    var engine = configuration.buildProcessEngine();
    ids.markBoot();
    return new EngineBundle(
        engine,
        configuration,
        effects,
        ids,
        incidentCreationEnabled,
        Math.max(1, System.nanoTime() - startedAt));
  }

  /**
   * Sequential identifiers that every scenario receives from the same start, so an answer does not depend on the
   * scenarios the engine ran before it. CIB keys the compensation subscriptions of a scope by identifier in a
   * `HashSet` and keeps that order for subscriptions created at one instant
   * (`CompensationUtil#collectCompensateEventSubscriptionsForScope`, `#throwCompensationEvent`), so under the frozen
   * logical clock the issued identifiers chose a witness's handler order (`CibSevenRunPositionIndependenceTest`).
   * One engine owns its in-memory database, so no shared identifier block is needed.
   */
  static final class ScenarioIds implements IdGenerator {
    private final AtomicLong next = new AtomicLong(1);
    private long firstScenarioId;

    @Override
    public String getNextId() {
      return Long.toString(next.getAndIncrement());
    }

    void markBoot() {
      firstScenarioId = next.get();
    }

    /**
     * Restarts after the boot identifiers. A row an earlier scenario left behind would collide, which
     * `CibSevenEngineScenarioRunner#requireNoIntegrityViolation` turns into a harness failure.
     */
    void restart() {
      next.set(firstScenarioId);
    }
  }

  record EngineBundle(
      ProcessEngine engine,
      ProcessEngineConfigurationImpl configuration,
      CibSevenScriptedEffect effects,
      ScenarioIds ids,
      boolean incidentCreationEnabled,
      long startupNanos) {}
}
