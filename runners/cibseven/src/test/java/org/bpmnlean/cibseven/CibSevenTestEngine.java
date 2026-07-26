package org.bpmnlean.cibseven;

import java.util.UUID;
import org.cibseven.bpm.engine.ProcessEngine;
import org.cibseven.bpm.engine.ProcessEngineConfiguration;
import org.cibseven.bpm.engine.impl.cfg.ProcessEngineConfigurationImpl;

final class CibSevenTestEngine {

  private CibSevenTestEngine() {}

  static ProcessEngine create(String name) {
    var databaseName =
        "bpmn_lean_"
            + name.replace("-", "_")
            + "_"
            + UUID.randomUUID().toString().replace("-", "");
    var configuration =
        (ProcessEngineConfigurationImpl)
            ProcessEngineConfiguration
                .createStandaloneInMemProcessEngineConfiguration();
    configuration.setProcessEngineName("bpmn-lean-" + name);
    configuration.setJdbcUrl(
        "jdbc:h2:mem:"
            + databaseName
            + ";DB_CLOSE_DELAY=-1;LOCK_TIMEOUT=10000");
    configuration.setJobExecutorActivate(false);
    configuration.setHistory(ProcessEngineConfiguration.HISTORY_AUDIT);
    configuration.setHistoryTimeToLive("P180D");
    configuration.setEnforceHistoryTimeToLive(true);
    return configuration.buildProcessEngine();
  }
}
