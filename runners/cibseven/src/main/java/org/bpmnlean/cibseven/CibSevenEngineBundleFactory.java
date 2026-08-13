package org.bpmnlean.cibseven;

import java.util.Map;
import java.util.UUID;
import org.cibseven.bpm.engine.ProcessEngine;
import org.cibseven.bpm.engine.ProcessEngineConfiguration;
import org.cibseven.bpm.engine.impl.cfg.ProcessEngineConfigurationImpl;

/** Builds one immutable-profile engine bundle for the streaming oracle facade. */
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
    var effectProbe = new CibSevenEffectProbe();
    var mappedSuccessProbe = new CibSevenMappedSuccessProbe();
    var mappedBoundaryErrorProbe = new CibSevenMappedBoundaryErrorProbe();
    configuration.setBeans(
        Map.of(
            CibSevenEffectProjector.SOURCE_HANDLER_BEAN,
            effectProbe,
            CibSevenMappedSuccessProbe.HANDLER_BEAN,
            mappedSuccessProbe,
            CibSevenMappedBoundaryErrorProbe.HANDLER_BEAN,
            mappedBoundaryErrorProbe));
    var engine = configuration.buildProcessEngine();
    return new EngineBundle(
        engine,
        configuration,
        effectProbe,
        mappedSuccessProbe,
        mappedBoundaryErrorProbe,
        incidentCreationEnabled,
        Math.max(1, System.nanoTime() - startedAt));
  }

  record EngineBundle(
      ProcessEngine engine,
      ProcessEngineConfigurationImpl configuration,
      CibSevenEffectProbe effectProbe,
      CibSevenMappedSuccessProbe mappedSuccessProbe,
      CibSevenMappedBoundaryErrorProbe mappedBoundaryErrorProbe,
      boolean incidentCreationEnabled,
      long startupNanos) {}
}
