package org.bpmnlean.cibseven;

import java.util.HashMap;
import java.util.UUID;
import org.cibseven.bpm.engine.ProcessEngine;
import org.cibseven.bpm.engine.ProcessEngineConfiguration;
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
    return new EngineBundle(
        engine,
        configuration,
        effects,
        incidentCreationEnabled,
        Math.max(1, System.nanoTime() - startedAt));
  }

  record EngineBundle(
      ProcessEngine engine,
      ProcessEngineConfigurationImpl configuration,
      CibSevenScriptedEffect effects,
      boolean incidentCreationEnabled,
      long startupNanos) {}
}
