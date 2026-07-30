package org.bpmnlean.cibseven;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;
import static org.junit.Assume.assumeTrue;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.bpmnlean.cibseven.CibSevenExclusiveGatewayModels.ConditionalBranch;
import org.bpmnlean.cibseven.CibSevenExclusiveGatewayModels.DefaultBranch;
import org.cibseven.bpm.engine.ProcessEngine;
import org.cibseven.bpm.engine.ProcessEngineException;
import org.cibseven.bpm.model.bpmn.Bpmn;
import org.cibseven.bpm.model.bpmn.BpmnModelInstance;
import org.cibseven.bpm.model.bpmn.instance.ConditionExpression;
import org.cibseven.bpm.model.bpmn.instance.SequenceFlow;
import org.junit.Test;

/**
 * Establishes the packaged CIB Seven 2.0 Exclusive Gateway facts needed by the read-only JUEL
 * condition profile.
 *
 * <p>Ordinary behavioral probes use CIB Seven's typed BPMN Model API and the exact admitted
 * two-condition-plus-default shape. The declaration-order witness remains literal XML because its
 * discriminating fact is the disagreement between two lexical orders. Runtime failures are checked
 * at the public command boundary so a failed condition cannot be mistaken for committed state.
 */
public final class CibSevenExclusiveGatewayJuelProbeTest {

  private static final String SOURCE_ORDER_RESOURCE =
      "org/bpmnlean/cibseven/exclusive-gateway-source-order.bpmn";
  private static final String BPMN_NAMESPACE =
      "http://www.omg.org/spec/BPMN/20100524/MODEL";

  @Test
  public void followsSequenceFlowDeclarationOrderAndStopsAtTheFirstTrueCondition() {
    requireTargetRelease();

    try (var session = deployClasspath("juel-source-order", SOURCE_ORDER_RESOURCE)) {
      var instance =
          session
              .engine()
              .getRuntimeService()
              .startProcessInstanceByKey(
                  "Process_SourceOrder", Map.of("first", "present"));

      assertEquals(
          List.of("Task_First"),
          activeTaskKeys(session.engine(), instance.getId()));
    }
  }

  @Test
  public void doesNotUseGatewayOutgoingReferenceOrderWhenBothConditionsAreTrue() {
    requireTargetRelease();

    try (var session = deployClasspath("juel-two-true", SOURCE_ORDER_RESOURCE)) {
      var instance =
          session
              .engine()
              .getRuntimeService()
              .startProcessInstanceByKey(
                  "Process_SourceOrder",
                  Map.of("first", "present", "second", "present"));

      assertEquals(
          List.of("Task_First"),
          activeTaskKeys(session.engine(), instance.getId()));
    }
  }

  @Test
  public void selectsTheSecondConditionAfterTheFirstEvaluatesFalse() {
    requireTargetRelease();
    var model =
        profileProcess(
            "Process_Second",
            "${first != null}",
            "${second != null}");
    var variables = variablesWithNulls("first");
    variables.put("second", "present");

    try (var session = deployModel("juel-second", model)) {
      var instance =
          session
              .engine()
              .getRuntimeService()
              .startProcessInstanceByKey("Process_Second", variables);

      assertEquals(
          List.of("Task_Second"),
          activeTaskKeys(session.engine(), instance.getId()));
    }
  }

  @Test
  public void reachesTheDeclaredDefaultOnlyAfterEveryConditionIsFalse() {
    requireTargetRelease();
    var model =
        profileProcess(
            "Process_Default",
            "${first != null}",
            "${second != null}");
    var variables = variablesWithNulls("first", "second");

    try (var session = deployModel("juel-default", model)) {
      var instance =
          session
              .engine()
              .getRuntimeService()
              .startProcessInstanceByKey("Process_Default", variables);

      assertEquals(
          List.of("Task_Default"),
          activeTaskKeys(session.engine(), instance.getId()));
    }
  }

  @Test
  public void treatsImmediateAndDeferredDelimitersEquallyWithinTheProfileDomain() {
    requireTargetRelease();
    var immediate =
        profileProcess(
            "Process_Immediate",
            "${value != null}",
            "${other != null}");
    var deferred =
        profileProcess(
            "Process_Deferred",
            "#{value != null}",
            "#{other != null}");
    var variables = variablesWithNulls("other");
    variables.put("value", "present");

    try (var session =
        deployModels(
            "juel-delimiters",
            Map.of(
                "immediate.bpmn", immediate,
                "deferred.bpmn", deferred))) {
      var immediateInstance =
          session
              .engine()
              .getRuntimeService()
              .startProcessInstanceByKey("Process_Immediate", variables);
      var deferredInstance =
          session
              .engine()
              .getRuntimeService()
              .startProcessInstanceByKey("Process_Deferred", variables);

      assertEquals(
          List.of("Task_First"),
          activeTaskKeys(session.engine(), immediateInstance.getId()));
      assertEquals(
          List.of("Task_First"),
          activeTaskKeys(session.engine(), deferredInstance.getId()));
    }
  }

  @Test
  public void distinguishesPresentNullFromAnAbsentRootBinding() {
    requireTargetRelease();
    var model =
        profileProcess(
            "Process_Null",
            "${value == null}",
            "${other != null}");
    var presentNull = variablesWithNulls("value", "other");

    try (var session = deployModel("juel-null", model)) {
      var instance =
          session
              .engine()
              .getRuntimeService()
              .startProcessInstanceByKey("Process_Null", presentNull);
      assertEquals(
          List.of("Task_First"),
          activeTaskKeys(session.engine(), instance.getId()));
    }

    requireRolledBackStart(
        "juel-absent",
        "Process_Null",
        model,
        variablesWithNulls("other"),
        "Unknown property");
  }

  @Test
  public void rejectsAStringResultInsteadOfCoercingItToBooleanAndRollsBack() {
    requireTargetRelease();
    var model =
        profileProcess(
            "Process_NonBoolean",
            "${value}",
            "${other != null}");
    var variables = variablesWithNulls("other");
    variables.put("value", "true");

    requireRolledBackStart(
        "juel-non-boolean",
        "Process_NonBoolean",
        model,
        variables,
        "condition expression returns non-Boolean");
  }

  @Test
  public void treatsDelimiterFreeTrueAsANonBooleanString() {
    requireTargetRelease();
    var model =
        profileProcess(
            "Process_LiteralText",
            "true",
            "${other != null}");

    requireRolledBackStart(
        "juel-literal-text",
        "Process_LiteralText",
        model,
        variablesWithNulls("other"),
        "condition expression returns non-Boolean");
  }

  @Test
  public void rollsBackFailedUserTaskCompletionToTheSameCommittedWait() {
    requireTargetRelease();
    var model =
        CibSevenExclusiveGatewayModels.processAfterUserTask(
            "Process_UserTaskRollback",
            branch("Flow_First", "Task_First", "${missing != null}"),
            branch("Flow_Second", "Task_Second", "${other != null}"),
            fallback());
    var initialVariables = variablesWithNulls("other");

    try (var session = deployModel("juel-user-task-rollback", model)) {
      var instance =
          session
              .engine()
              .getRuntimeService()
              .startProcessInstanceByKey(
                  "Process_UserTaskRollback", initialVariables);
      var task =
          session
              .engine()
              .getTaskService()
              .createTaskQuery()
              .processInstanceId(instance.getId())
              .singleResult();

      var failure =
          assertThrows(
              ProcessEngineException.class,
              () -> session.engine().getTaskService().complete(task.getId()));
      assertTrue(failure.getMessage(), failure.getMessage().contains("Unknown property"));
      assertEquals(
          List.of("Task_Before"),
          activeTaskKeys(session.engine(), instance.getId()));

      session
          .engine()
          .getRuntimeService()
          .setVariable(instance.getId(), "missing", "present");
      session.engine().getTaskService().complete(task.getId());
      assertEquals(
          List.of("Task_First"),
          activeTaskKeys(session.engine(), instance.getId()));
    }
  }

  @Test
  public void stopsOnAnEarlierResolutionFailureWithoutTryingALaterTrueFlow() {
    requireTargetRelease();
    var model =
        profileProcess(
            "Process_EarlierFailure",
            "${missing != null}",
            "${later != null}");

    requireRolledBackStart(
        "juel-earlier-failure",
        "Process_EarlierFailure",
        model,
        Map.of("later", "present"),
        "Unknown property");
  }

  @Test
  public void rejectsInvalidJuelDuringDeploymentWithoutRetainingADefinition() {
    requireTargetRelease();
    var model =
        profileProcess(
            "Process_Syntax",
            "${",
            "${other != null}");

    requireRejectedDeployment("juel-syntax", model);
  }

  @Test
  public void routesALanguageQualifiedConditionToScriptHandling() {
    requireTargetRelease();
    var model =
        profileProcess(
            "Process_Language",
            "${first != null}",
            "${second != null}");
    qualifyAsScriptCondition(
        model, "Flow_First", "unsupported-language");
    var source = Bpmn.convertToString(model);

    assertTrue(
        source,
        source.contains(":type=\"bpmn:tFormalExpression\""));
    assertTrue(source, source.contains("language=\"unsupported-language\""));

    try (var session = deployModel("juel-language", model)) {
      assertEquals(
          1,
          session
              .engine()
              .getRepositoryService()
              .createProcessDefinitionQuery()
              .count());

      var failure =
          assertThrows(
              ProcessEngineException.class,
              () ->
                  session
                      .engine()
                      .getRuntimeService()
                      .startProcessInstanceByKey(
                          "Process_Language",
                          Map.of("first", "present", "second", "present")));
      assertTrue(
          failure.getMessage(),
          failure.getMessage().contains("unsupported-language"));
      assertEquals(
          0,
          session
              .engine()
              .getRuntimeService()
              .createProcessInstanceQuery()
              .count());
    }
  }

  @Test
  public void rejectsAConditionOnTheDeclaredDefaultFlowAtDeployment() {
    requireTargetRelease();
    var model =
        profileProcess(
            "Process_ConditionalDefault",
            "${first != null}",
            "${second != null}");
    var defaultCondition = model.newInstance(ConditionExpression.class);
    defaultCondition.setTextContent("${fallback != null}");
    sequenceFlow(model, "Flow_Default").setConditionExpression(defaultCondition);

    requireRejectedDeployment("juel-conditional-default", model);
  }

  @Test
  public void modelBuilderProducesTheAdmittedTypeAbsentConditionShape() {
    requireTargetRelease();
    var model =
        profileProcess(
            "Process_ModelShape",
            "${first != null}",
            "${second != null}");
    var source = Bpmn.convertToString(model);

    assertEquals(
        "tFormalExpression",
        condition(model, "Flow_First").getType());
    assertFalse(source, source.contains(":type="));
    assertFalse(source, source.contains("camunda:resource"));
    assertFalse(source, source.contains("language="));
  }

  private static BpmnModelInstance profileProcess(
      String processId, String firstExpression, String secondExpression) {
    return CibSevenExclusiveGatewayModels.process(
        processId,
        branch("Flow_First", "Task_First", firstExpression),
        branch("Flow_Second", "Task_Second", secondExpression),
        fallback());
  }

  private static ConditionalBranch branch(
      String sequenceFlowId, String taskId, String expression) {
    return new ConditionalBranch(sequenceFlowId, taskId, expression);
  }

  private static DefaultBranch fallback() {
    return new DefaultBranch("Flow_Default", "Task_Default");
  }

  private static ConditionExpression condition(
      BpmnModelInstance model, String sequenceFlowId) {
    return sequenceFlow(model, sequenceFlowId).getConditionExpression();
  }

  private static void qualifyAsScriptCondition(
      BpmnModelInstance model,
      String sequenceFlowId,
      String language) {
    model
        .getDefinitions()
        .getDomElement()
        .registerNamespace("bpmn", BPMN_NAMESPACE);
    var condition = condition(model, sequenceFlowId);
    condition.setType("bpmn:tFormalExpression");
    condition.setLanguage(language);
  }

  private static SequenceFlow sequenceFlow(
      BpmnModelInstance model, String sequenceFlowId) {
    return model.getModelElementById(sequenceFlowId);
  }

  private static Map<String, Object> variablesWithNulls(String... names) {
    var variables = new HashMap<String, Object>();
    for (var name : names) {
      variables.put(name, null);
    }
    return variables;
  }

  private static List<String> activeTaskKeys(
      ProcessEngine engine, String processInstanceId) {
    return engine
        .getTaskService()
        .createTaskQuery()
        .processInstanceId(processInstanceId)
        .list()
        .stream()
        .map(task -> task.getTaskDefinitionKey())
        .sorted()
        .toList();
  }

  private static ProbeSession deployClasspath(String name, String resource) {
    var engine = CibSevenTestEngine.create(name);
    var deployment =
        engine
            .getRepositoryService()
            .createDeployment()
            .addClasspathResource(resource)
            .deploy();
    return new ProbeSession(engine, deployment.getId());
  }

  private static ProbeSession deployModel(
      String name, BpmnModelInstance model) {
    return deployModels(name, Map.of(name + ".bpmn", model));
  }

  private static ProbeSession deployModels(
      String name, Map<String, BpmnModelInstance> models) {
    var engine = CibSevenTestEngine.create(name);
    var builder = engine.getRepositoryService().createDeployment();
    for (var model : models.entrySet()) {
      builder.addModelInstance(model.getKey(), model.getValue());
    }
    var deployment = builder.deploy();
    return new ProbeSession(engine, deployment.getId());
  }

  private static void requireRolledBackStart(
      String name,
      String processId,
      BpmnModelInstance model,
      Map<String, Object> variables,
      String messageFragment) {
    try (var session = deployModel(name, model)) {
      var failure =
          assertThrows(
              ProcessEngineException.class,
              () ->
                  session
                      .engine()
                      .getRuntimeService()
                      .startProcessInstanceByKey(processId, variables));
      assertTrue(failure.getMessage(), failure.getMessage().contains(messageFragment));
      assertEquals(
          0,
          session
              .engine()
              .getRuntimeService()
              .createProcessInstanceQuery()
              .count());
      assertEquals(
          0,
          session
              .engine()
              .getHistoryService()
              .createHistoricProcessInstanceQuery()
              .count());
      assertEquals(
          0,
          session
              .engine()
              .getHistoryService()
              .createHistoricActivityInstanceQuery()
              .count());
      assertEquals(
          0,
          session
              .engine()
              .getHistoryService()
              .createHistoricVariableInstanceQuery()
              .count());
    }
  }

  private static void requireRejectedDeployment(
      String name, BpmnModelInstance model) {
    var engine = CibSevenTestEngine.create(name);
    try {
      assertThrows(
          ProcessEngineException.class,
          () ->
              engine
                  .getRepositoryService()
                  .createDeployment()
                  .addModelInstance(name + ".bpmn", model)
                  .deploy());
      assertEquals(
          0,
          engine
              .getRepositoryService()
              .createProcessDefinitionQuery()
              .count());
      assertEquals(
          0,
          engine.getRepositoryService().createDeploymentQuery().count());
    } finally {
      engine.close();
    }
  }

  private static void requireTargetRelease() {
    assumeTrue(
        "2.0.0".equals(
            ProcessEngine.class.getPackage().getImplementationVersion()));
  }

  private record ProbeSession(ProcessEngine engine, String deploymentId)
      implements AutoCloseable {

    @Override
    public void close() {
      engine
          .getRepositoryService()
          .deleteDeployment(deploymentId, true, true, true);
      engine.close();
    }
  }
}
