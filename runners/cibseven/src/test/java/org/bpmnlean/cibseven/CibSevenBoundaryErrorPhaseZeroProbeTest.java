package org.bpmnlean.cibseven;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;
import static org.junit.Assume.assumeTrue;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import org.cibseven.bpm.engine.ProcessEngine;
import org.cibseven.bpm.engine.ProcessEngineException;
import org.cibseven.bpm.engine.delegate.BpmnError;
import org.cibseven.bpm.engine.delegate.DelegateExecution;
import org.cibseven.bpm.engine.delegate.JavaDelegate;
import org.cibseven.bpm.engine.impl.bpmn.parser.BpmnParse;
import org.junit.Test;

/**
 * Locks the packaged CIB Seven 2.0 facts required before boundary-error semantics are implemented.
 *
 * <p>The model is project-authored. The external A12 checkout is read only to confirm the exact
 * empty-attribute source fact; no A12 source is copied into this repository.
 */
public final class CibSevenBoundaryErrorPhaseZeroProbeTest {

  private static final Path PROJECT_ROOT =
      Path.of("../..").toAbsolutePath().normalize();
  private static final Path RESOURCE =
      PROJECT_ROOT.resolve("scenarios/boundary-error/process.bpmn");
  private static final Path A12_MODEL =
      PROJECT_ROOT.resolve(
          "../oss/a12/a12-workflows/workflows-engine/src/testFixtures/resources/bpmn/"
              + "TestProcessWithRelationshipModeledDocumentModels_DocRef.bpmn");
  private static final String PROCESS_ID = "Process_BoundaryError";
  private static final String SERVICE_TASK_ID = "CreateRelationshipLinkTask";
  private static final String HANDLER = "createRelationshipLinkDelegate";
  private static final String HANDLER_EXPRESSION = "#{" + HANDLER + "}";
  private static final String PROTOCOL = "urn:bpmn-lean:a12-delegate:v1";
  private static final String CAUGHT_CODE = "LinkLimitReachedError";
  private static final String UNMATCHED_CODE = "RelationshipLinkageError";
  private static final String ERROR_MESSAGE = "Link limit reached";
  private static final String BOUNDARY_TASK_ID =
      "ExpectedUserTaskAfterBPMNError";

  @Test
  public void derivesTheExactProfileAndMapsSuccessfulOutput() throws Exception {
    var observation = execute(ProbeMode.SUCCESS, readResource());

    requireExactProfile(observation.profile());
    assertEquals("RelationshipModel", observation.delegateInput());
    assertEquals(1, observation.delegateInvocations());
    assertFalse(observation.runtimeProcessExists());
    assertEquals("Link:42", observation.historicRelationshipLinkId());
    assertEquals(List.of(), observation.activeTaskKeys());
    assertEquals(0, observation.jobs());
    assertEquals(0, observation.incidents());

    var wrongCode =
        copyProfile(
            observation.profile(),
            observation.profile().attachedToRef(),
            "UnexpectedError");
    assertThrows(
        IllegalStateException.class, () -> requireExactProfile(wrongCode));
    var wrongAttachment =
        copyProfile(
            observation.profile(),
            "UnexpectedTask",
            observation.profile().errorCode());
    assertThrows(
        IllegalStateException.class, () -> requireExactProfile(wrongAttachment));
  }

  @Test
  public void recordsThatCaughtErrorsStillApplyTheOutputMapping()
      throws Exception {
    var codeOnly = execute(ProbeMode.CAUGHT_CODE_ONLY, readResource());
    requireCaughtState(codeOnly);
    assertNull(codeOnly.delegateMessage());

    var withMessage = execute(ProbeMode.CAUGHT_WITH_MESSAGE, readResource());
    requireCaughtState(withMessage);
    assertEquals(ERROR_MESSAGE, withMessage.delegateMessage());
  }

  @Test
  public void recordsTheTargetShapedNullLocalWriteAndOutputMapping()
      throws Exception {
    var observation = execute(ProbeMode.CAUGHT_TARGET_NULL, readResource());

    assertEquals(List.of(BOUNDARY_TASK_ID), observation.activeTaskKeys());
    assertTrue(observation.processVariables().containsKey("relationshipLinkId"));
    assertNull(observation.processVariables().get("relationshipLinkId"));
    assertTrue(observation.historicRelationshipLinkPresent());
    assertNull(observation.historicRelationshipLinkId());
    assertEquals(0, observation.jobs());
    assertEquals(0, observation.incidents());
  }

  @Test
  public void recordsOutputMappingFailureAfterTheDefaultUnhandledPath()
      throws Exception {
    var observation = executeUnmatched(readResource());

    assertFalse(observation.exceptionsAfterUnhandledBpmnError());
    assertEquals(
        "Unknown property used in expression: ${newLinkId}. "
            + "Cause: Cannot resolve identifier 'newLinkId'",
        observation.failureMessage());
    assertEquals(0, observation.runtimeProcesses());
    assertEquals(0, observation.activeTasks());
    assertEquals(0, observation.jobs());
    assertEquals(0, observation.incidents());
    assertEquals(0, observation.historicProcesses());
    assertEquals(0, observation.historicActivities());
    assertEquals(0, observation.historicVariables());
  }

  @Test
  public void isolatesDefaultUnhandledBehaviorWithoutAnOutputMapping()
      throws Exception {
    var observation =
        executeUnmatchedWithoutOutputMapping(withoutOutputMapping(readResource()));

    assertFalse(observation.exceptionsAfterUnhandledBpmnError());
    assertEquals(0, observation.runtimeProcesses());
    assertEquals(0, observation.activeTasks());
    assertEquals(0, observation.jobs());
    assertEquals(0, observation.incidents());
    assertEquals(1, observation.historicProcesses());
    assertEquals(0, observation.normalEndExecutions());
    assertEquals(0, observation.boundaryTaskExecutions());
    assertEquals(
        Map.of(
            "newLinkId", "must-not-map",
            "relationshipModel", "RelationshipModel"),
        observation.historicVariables());
  }

  @Test
  public void preservesAndExecutesAnExplicitEmptyErrorCodeVariable()
      throws Exception {
    var source =
        readResource()
            .replace(
                "id=\"ErrorEventDefinition_LinkLimitReached\"",
                "id=\"ErrorEventDefinition_LinkLimitReached\" "
                    + "camunda:errorCodeVariable=\"\"");
    var observation = execute(ProbeMode.CAUGHT_CODE_ONLY, source);

    assertEquals("", observation.profile().errorCodeVariable());
    assertEquals(
        Map.of(
            "", CAUGHT_CODE,
            "relationshipLinkId", "must-not-map"),
        observation.processVariables());
    assertEquals(List.of(BOUNDARY_TASK_ID), observation.activeTaskKeys());
  }

  @Test
  public void externalTargetCarriesTheReviewedEmptyAttributeShape()
      throws Exception {
    assumeTrue(Files.isRegularFile(A12_MODEL));
    var source = Files.readString(A12_MODEL);

    assertEquals(
        1, countOccurrences(source, "camunda:errorCodeVariable=\"\""));
    assertEquals(
        1,
        countOccurrences(
            source,
            "camunda:delegateExpression=\"#{createRelationshipLinkDelegate}\""));
  }

  private static ExecutionObservation execute(
      ProbeMode mode, String source) throws Exception {
    try (var session = ProbeSession.open(mode, source)) {
      var processInstance =
          session.engine().getRuntimeService().startProcessInstanceByKey(PROCESS_ID);
      return observe(
          session.engine(),
          processInstance.getId(),
          session.delegate(),
          session.profile());
    }
  }

  private static UnmatchedObservation executeUnmatched(String source)
      throws Exception {
    try (var session = ProbeSession.open(ProbeMode.UNMATCHED, source)) {
      var engine = session.engine();
      var failure =
          assertThrows(
              ProcessEngineException.class,
              () ->
                  engine
                      .getRuntimeService()
                      .startProcessInstanceByKey(PROCESS_ID));
      return new UnmatchedObservation(
          engine
              .getProcessEngineConfiguration()
              .isEnableExceptionsAfterUnhandledBpmnError(),
          failure.getMessage(),
          engine.getRuntimeService().createProcessInstanceQuery().count(),
          engine.getTaskService().createTaskQuery().count(),
          engine.getManagementService().createJobQuery().count(),
          engine.getRuntimeService().createIncidentQuery().count(),
          engine.getHistoryService().createHistoricProcessInstanceQuery().count(),
          engine.getHistoryService().createHistoricActivityInstanceQuery().count(),
          engine.getHistoryService().createHistoricVariableInstanceQuery().count());
    }
  }

  private static MappingFreeUnmatchedObservation
      executeUnmatchedWithoutOutputMapping(String source) throws Exception {
    try (var session = ProbeSession.open(ProbeMode.UNMATCHED, source)) {
      var engine = session.engine();
      var processInstance =
          engine.getRuntimeService().startProcessInstanceByKey(PROCESS_ID);
      var processInstanceId = processInstance.getId();
      return new MappingFreeUnmatchedObservation(
          engine
              .getProcessEngineConfiguration()
              .isEnableExceptionsAfterUnhandledBpmnError(),
          engine.getRuntimeService().createProcessInstanceQuery().count(),
          engine.getTaskService().createTaskQuery().count(),
          engine.getManagementService().createJobQuery().count(),
          engine.getRuntimeService().createIncidentQuery().count(),
          engine
              .getHistoryService()
              .createHistoricProcessInstanceQuery()
              .processInstanceId(processInstanceId)
              .count(),
          engine
              .getHistoryService()
              .createHistoricActivityInstanceQuery()
              .processInstanceId(processInstanceId)
              .activityId("EndEvent_Normal")
              .count(),
          engine
              .getHistoryService()
              .createHistoricActivityInstanceQuery()
              .processInstanceId(processInstanceId)
              .activityId(BOUNDARY_TASK_ID)
              .count(),
          historicVariables(engine, processInstanceId));
    }
  }

  private static Map<String, Object> historicVariables(
      ProcessEngine engine, String processInstanceId) {
    var values = new LinkedHashMap<String, Object>();
    engine
        .getHistoryService()
        .createHistoricVariableInstanceQuery()
        .processInstanceId(processInstanceId)
        .list()
        .stream()
        .sorted(
            java.util.Comparator.comparing(
                variable -> variable.getName()))
        .forEach(variable -> values.put(variable.getName(), variable.getValue()));
    return Collections.unmodifiableMap(values);
  }

  private static ExecutionObservation observe(
      ProcessEngine engine,
      String processInstanceId,
      BoundaryErrorDelegate delegate,
      CibSevenBoundaryErrorProfileProjector.ProfileProjection profile) {
    var runtime = engine.getRuntimeService();
    var history = engine.getHistoryService();
    var processExists =
        runtime
                .createProcessInstanceQuery()
                .processInstanceId(processInstanceId)
                .count()
            == 1;
    Map<String, Object> processVariables =
        processExists ? runtime.getVariables(processInstanceId) : Map.of();
    var taskKeys =
        engine.getTaskService().createTaskQuery().processInstanceId(processInstanceId).list()
            .stream()
            .map(task -> task.getTaskDefinitionKey())
            .sorted()
            .toList();
    var historicOutput =
        history
            .createHistoricVariableInstanceQuery()
            .processInstanceId(processInstanceId)
            .variableName("relationshipLinkId")
            .singleResult();
    var historicProcess =
        history
            .createHistoricProcessInstanceQuery()
            .processInstanceId(processInstanceId)
            .singleResult();

    return new ExecutionObservation(
        profile,
        delegate.input(),
        delegate.message(),
        delegate.invocations(),
        processExists,
        taskKeys,
        Collections.unmodifiableMap(new LinkedHashMap<>(processVariables)),
        engine
            .getManagementService()
            .createJobQuery()
            .processInstanceId(processInstanceId)
            .count(),
        runtime.createIncidentQuery().processInstanceId(processInstanceId).count(),
        history
            .createHistoricActivityInstanceQuery()
            .processInstanceId(processInstanceId)
            .activityId("EndEvent_Normal")
            .count(),
        history
            .createHistoricActivityInstanceQuery()
            .processInstanceId(processInstanceId)
            .activityId(BOUNDARY_TASK_ID)
            .count(),
        historicProcess == null ? null : historicProcess.getEndTime(),
        historicOutput != null,
        historicOutput == null ? null : historicOutput.getValue(),
        engine
            .getProcessEngineConfiguration()
            .isEnableExceptionsAfterUnhandledBpmnError());
  }

  private static void requireCaughtState(ExecutionObservation observation) {
    requireExactProfile(observation.profile());
    assertEquals("RelationshipModel", observation.delegateInput());
    assertEquals(1, observation.delegateInvocations());
    assertEquals(List.of(BOUNDARY_TASK_ID), observation.activeTaskKeys());
    assertEquals(
        Map.of("relationshipLinkId", "must-not-map"),
        observation.processVariables());
    assertEquals(
        "must-not-map", observation.historicRelationshipLinkId());
    assertEquals(0, observation.normalEndExecutions());
    assertEquals(1, observation.boundaryTaskExecutions());
    assertEquals(0, observation.jobs());
    assertEquals(0, observation.incidents());
  }

  private static void requireExactProfile(
      CibSevenBoundaryErrorProfileProjector.ProfileProjection actual) {
    var expected =
        new CibSevenBoundaryErrorProfileProjector.ProfileProjection(
            SERVICE_TASK_ID,
            PROTOCOL,
            HANDLER_EXPRESSION,
            new CibSevenBoundaryErrorProfileProjector.Mapping(
                "relationshipModel", "RelationshipModel"),
            new CibSevenBoundaryErrorProfileProjector.Mapping(
                "relationshipLinkId", "${newLinkId}"),
            "BoundaryEvent_LinkLimitReached",
            "Link Limit Reached Boundary",
            SERVICE_TASK_ID,
            null,
            "ErrorEventDefinition_LinkLimitReached",
            null,
            "Error_LinkLimitReached",
            "Link Limit Reached",
            CAUGHT_CODE,
            "Flow_ErrorToUserTask");
    if (!expected.equals(actual)) {
      throw new IllegalStateException(
          "Deployed boundary-error profile differs from the selected account: "
              + actual);
    }
  }

  private static CibSevenBoundaryErrorProfileProjector.ProfileProjection copyProfile(
      CibSevenBoundaryErrorProfileProjector.ProfileProjection source,
      String attachedToRef,
      String errorCode) {
    return new CibSevenBoundaryErrorProfileProjector.ProfileProjection(
        source.serviceTaskId(),
        source.implementation(),
        source.delegateExpression(),
        source.inputMapping(),
        source.outputMapping(),
        source.boundaryEventId(),
        source.boundaryEventName(),
        attachedToRef,
        source.cancelActivity(),
        source.errorDefinitionId(),
        source.errorCodeVariable(),
        source.errorId(),
        source.errorName(),
        errorCode,
        source.boundaryOutputFlowId());
  }

  private static String readResource() throws Exception {
    return Files.readString(RESOURCE);
  }

  private static String withoutOutputMapping(String source) {
    var output =
        "          <camunda:outputParameter name=\"relationshipLinkId\">"
            + "${newLinkId}</camunda:outputParameter>\n";
    if (countOccurrences(source, output) != 1) {
      throw new IllegalStateException(
          "Expected exactly one output mapping in the phase-zero fixture");
    }
    return source.replace(output, "");
  }

  private static int countOccurrences(String source, String needle) {
    var count = 0;
    var offset = 0;
    while ((offset = source.indexOf(needle, offset)) >= 0) {
      count += 1;
      offset += needle.length();
    }
    return count;
  }

  private enum ProbeMode {
    SUCCESS,
    CAUGHT_CODE_ONLY,
    CAUGHT_WITH_MESSAGE,
    CAUGHT_TARGET_NULL,
    UNMATCHED
  }

  private static final class BoundaryErrorDelegate implements JavaDelegate {

    private final ProbeMode mode;
    private int invocations;
    private String input;
    private String message;

    private BoundaryErrorDelegate(ProbeMode mode) {
      this.mode = mode;
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
          throw new BpmnError(UNMATCHED_CODE, "Relationship linkage failed");
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

  private record ProbeSession(
      ProcessEngine engine,
      String deploymentId,
      BoundaryErrorDelegate delegate)
      implements AutoCloseable {

    static ProbeSession open(ProbeMode mode, String source) {
      assumeTrue(
          "2.0.0".equals(
              ProcessEngine.class.getPackage().getImplementationVersion()));
      var delegate = new BoundaryErrorDelegate(mode);
      var capturedParse = new AtomicReference<BpmnParse>();
      var engine =
          CibSevenTestEngine.create(
              "boundary-error-" + mode.name().toLowerCase(),
              configuration -> {
                configuration.setBeans(Map.of(HANDLER, delegate));
                configuration.setBpmnParseFactory(
                    parser -> {
                      var parse = new BpmnParse(parser);
                      capturedParse.set(parse);
                      return parse;
                    });
              });
      String deploymentId = null;
      try {
        deploymentId =
            engine
                .getRepositoryService()
                .createDeployment()
                .addString("boundary-error-probe.bpmn", source)
                .deploy()
                .getId();
        assertNotNull(capturedParse.get());
        assertFalse(capturedParse.get().hasWarnings());
        var definition =
            engine
                .getRepositoryService()
                .createProcessDefinitionQuery()
                .processDefinitionKey(PROCESS_ID)
                .singleResult();
        assertNotNull(definition);
        return new ProbeSession(engine, deploymentId, delegate);
      } catch (RuntimeException failure) {
        if (deploymentId != null) {
          engine
              .getRepositoryService()
              .deleteDeployment(deploymentId, true, true, true);
        }
        engine.close();
        throw failure;
      }
    }

    CibSevenBoundaryErrorProfileProjector.ProfileProjection profile() {
      var definition =
          engine
              .getRepositoryService()
              .createProcessDefinitionQuery()
              .processDefinitionKey(PROCESS_ID)
              .singleResult();
      assertNotNull(definition);
      return CibSevenBoundaryErrorProfileProjector.project(
          engine, definition.getId());
    }

    @Override
    public void close() {
      engine
          .getRepositoryService()
          .deleteDeployment(deploymentId, true, true, true);
      engine.close();
    }
  }

  private record ExecutionObservation(
      CibSevenBoundaryErrorProfileProjector.ProfileProjection profile,
      String delegateInput,
      String delegateMessage,
      int delegateInvocations,
      boolean runtimeProcessExists,
      List<String> activeTaskKeys,
      Map<String, Object> processVariables,
      long jobs,
      long incidents,
      long normalEndExecutions,
      long boundaryTaskExecutions,
      java.util.Date historicProcessEndTime,
      boolean historicRelationshipLinkPresent,
      Object historicRelationshipLinkId,
      boolean exceptionsAfterUnhandledBpmnError) {}

  private record UnmatchedObservation(
      boolean exceptionsAfterUnhandledBpmnError,
      String failureMessage,
      long runtimeProcesses,
      long activeTasks,
      long jobs,
      long incidents,
      long historicProcesses,
      long historicActivities,
      long historicVariables) {}

  private record MappingFreeUnmatchedObservation(
      boolean exceptionsAfterUnhandledBpmnError,
      long runtimeProcesses,
      long activeTasks,
      long jobs,
      long incidents,
      long historicProcesses,
      long normalEndExecutions,
      long boundaryTaskExecutions,
      Map<String, Object> historicVariables) {}
}
