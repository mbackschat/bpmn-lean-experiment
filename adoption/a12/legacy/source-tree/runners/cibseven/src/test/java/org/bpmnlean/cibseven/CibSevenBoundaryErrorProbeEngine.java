package org.bpmnlean.cibseven;

import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import org.cibseven.bpm.engine.ProcessEngine;
import org.cibseven.bpm.engine.delegate.BpmnError;
import org.cibseven.bpm.engine.delegate.DelegateExecution;
import org.cibseven.bpm.engine.delegate.JavaDelegate;
import org.cibseven.bpm.engine.impl.bpmn.parser.BpmnParse;

/**
 * Owns the one packaged CIB Seven engine shared by boundary-error phase-zero tests.
 *
 * <p>Each session resets the probe delegate, deploys exactly one definition, and deletes that
 * deployment with all runtime and history data before another session may begin.
 */
final class CibSevenBoundaryErrorProbeEngine implements AutoCloseable {

  static final String PROCESS_ID = "Process_BoundaryError";
  static final String HANDLER = "createRelationshipLinkDelegate";
  static final String CAUGHT_CODE = "LinkLimitReachedError";
  static final String UNMATCHED_CODE = "RelationshipLinkageError";
  static final String ERROR_MESSAGE = "Link limit reached";

  private final AtomicReference<BpmnParse> capturedParse = new AtomicReference<>();
  private final BoundaryErrorDelegate delegate = new BoundaryErrorDelegate();
  private final ProcessEngine engine;
  private boolean sessionOpen;

  CibSevenBoundaryErrorProbeEngine() {
    engine =
        CibSevenTestEngine.create(
            "boundary-error-phase-zero",
            configuration -> {
              configuration.setBeans(Map.of(HANDLER, delegate));
              configuration.setBpmnParseFactory(
                  parser -> {
                    var parse = new BpmnParse(parser);
                    capturedParse.set(parse);
                    return parse;
                  });
            });
  }

  synchronized ProbeSession deploy(ProbeMode mode, String source) {
    if (sessionOpen) {
      throw new IllegalStateException("Boundary-error probe session is already open");
    }
    requireClean();
    delegate.begin(mode);
    capturedParse.set(null);
    String deploymentId = null;
    try {
      deploymentId =
          engine
              .getRepositoryService()
              .createDeployment()
              .addString("boundary-error-probe.bpmn", source)
              .deploy()
              .getId();
      var parse = capturedParse.get();
      if (parse == null || parse.hasWarnings()) {
        throw new IllegalStateException(
            "Boundary-error probe deployment did not parse without warnings");
      }
      var definition =
          engine
              .getRepositoryService()
              .createProcessDefinitionQuery()
              .processDefinitionKey(PROCESS_ID)
              .singleResult();
      if (definition == null) {
        throw new IllegalStateException(
            "Boundary-error probe deployment has no selected Process");
      }
      sessionOpen = true;
      return new ProbeSession(this, engine, deploymentId, delegate);
    } catch (RuntimeException failure) {
      if (deploymentId != null) {
        deleteDeployment(deploymentId);
      }
      throw failure;
    }
  }

  private synchronized void closeSession(String deploymentId) {
    deleteDeployment(deploymentId);
    sessionOpen = false;
    requireClean();
  }

  private void deleteDeployment(String deploymentId) {
    engine
        .getRepositoryService()
        .deleteDeployment(deploymentId, true, true, true);
  }

  private void requireClean() {
    var dirtyCount =
        engine.getRepositoryService().createDeploymentQuery().count()
            + engine.getRuntimeService().createProcessInstanceQuery().count()
            + engine.getTaskService().createTaskQuery().count()
            + engine.getManagementService().createJobQuery().count()
            + engine.getRuntimeService().createIncidentQuery().count()
            + engine.getHistoryService().createHistoricProcessInstanceQuery().count()
            + engine.getHistoryService().createHistoricActivityInstanceQuery().count()
            + engine.getHistoryService().createHistoricVariableInstanceQuery().count();
    if (dirtyCount != 0) {
      throw new IllegalStateException(
          "Boundary-error probe engine retained state between sessions");
    }
  }

  @Override
  public synchronized void close() {
    if (sessionOpen) {
      throw new IllegalStateException(
          "Cannot close boundary-error probe engine with an open session");
    }
    engine.close();
  }

  enum ProbeMode {
    SUCCESS,
    CAUGHT_CODE_ONLY,
    CAUGHT_WITH_MESSAGE,
    CAUGHT_TARGET_NULL,
    UNMATCHED
  }

  static final class BoundaryErrorDelegate implements JavaDelegate {

    private ProbeMode mode;
    private int invocations;
    private String input;
    private String message;

    void begin(ProbeMode nextMode) {
      mode = nextMode;
      invocations = 0;
      input = null;
      message = null;
    }

    @Override
    public void execute(DelegateExecution execution) {
      invocations += 1;
      input = (String) execution.getVariableLocal("relationshipModel");
      switch (mode) {
        case SUCCESS -> execution.setVariableLocal("newLinkId", "Link:42");
        case CAUGHT_CODE_ONLY -> {
          execution.setVariableLocal("newLinkId", "must-not-map");
          throw new BpmnError(CAUGHT_CODE);
        }
        case CAUGHT_WITH_MESSAGE -> {
          execution.setVariableLocal("newLinkId", "must-not-map");
          message = ERROR_MESSAGE;
          throw new BpmnError(CAUGHT_CODE, message);
        }
        case CAUGHT_TARGET_NULL -> {
          execution.setVariableLocal("newLinkId", null);
          throw new BpmnError(CAUGHT_CODE);
        }
        case UNMATCHED -> {
          execution.setVariableLocal("newLinkId", "must-not-map");
          throw new BpmnError(
              UNMATCHED_CODE, "Relationship linkage failed");
        }
      }
    }

    int invocations() {
      return invocations;
    }

    String input() {
      return input;
    }

    String message() {
      return message;
    }
  }

  record ProbeSession(
      CibSevenBoundaryErrorProbeEngine owner,
      ProcessEngine engine,
      String deploymentId,
      BoundaryErrorDelegate delegate)
      implements AutoCloseable {

    CibSevenBoundaryErrorProfileProjector.ProfileProjection profile() {
      var definition =
          engine
              .getRepositoryService()
              .createProcessDefinitionQuery()
              .processDefinitionKey(PROCESS_ID)
              .singleResult();
      if (definition == null) {
        throw new IllegalStateException(
            "Boundary-error probe session lost its Process definition");
      }
      return CibSevenBoundaryErrorProfileProjector.project(
          engine, definition.getId());
    }

    @Override
    public void close() {
      owner.closeSession(deploymentId);
    }
  }
}
