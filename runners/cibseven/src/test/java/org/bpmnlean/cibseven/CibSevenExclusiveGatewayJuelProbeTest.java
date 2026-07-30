package org.bpmnlean.cibseven;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;
import static org.junit.Assume.assumeTrue;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.cibseven.bpm.engine.ProcessEngine;
import org.cibseven.bpm.engine.ProcessEngineException;
import org.junit.Test;

/**
 * Establishes the packaged CIB Seven 2.0 Exclusive Gateway facts needed before selecting a
 * read-only JUEL condition profile.
 *
 * <p>The project-authored sources deliberately vary Sequence Flow declaration order independently
 * of the gateway's outgoing-reference order. Runtime failures are checked at the public command
 * boundary so a failed condition cannot be mistaken for a committed semantic outcome.
 */
public final class CibSevenExclusiveGatewayJuelProbeTest {

  @Test
  public void followsSequenceFlowDeclarationOrderAndStopsAtTheFirstTrueCondition() {
    requireTargetRelease();
    var source =
        process(
            "Process_SourceOrder",
            null,
            List.of("Flow_Unreached", "Flow_Selected"),
            List.of(
                conditional("Flow_Selected", "Task_Selected", "${selected}"),
                conditional("Flow_Unreached", "Task_Unreached", "${missing}")));

    try (var session = deploy("juel-source-order", source)) {
      var instance =
          session
              .engine()
              .getRuntimeService()
              .startProcessInstanceByKey(
                  "Process_SourceOrder", Map.of("selected", true));

      assertEquals(
          List.of("Task_Selected"),
          activeTaskKeys(session.engine(), instance.getId()));
    }
  }

  @Test
  public void doesNotUseGatewayOutgoingReferenceOrderWhenSelectingAmongTrueConditions() {
    requireTargetRelease();
    var source =
        process(
            "Process_TwoTrue",
            null,
            List.of("Flow_Second", "Flow_First"),
            List.of(
                conditional("Flow_First", "Task_First", "${first}"),
                conditional("Flow_Second", "Task_Second", "${second}")));

    try (var session = deploy("juel-two-true", source)) {
      var instance =
          session
              .engine()
              .getRuntimeService()
              .startProcessInstanceByKey(
                  "Process_TwoTrue", Map.of("first", true, "second", true));

      assertEquals(
          List.of("Task_First"),
          activeTaskKeys(session.engine(), instance.getId()));
    }
  }

  @Test
  public void reachesTheDeclaredDefaultOnlyAfterEveryConditionIsFalse() {
    requireTargetRelease();
    var source =
        process(
            "Process_Default",
            "Flow_Default",
            List.of("Flow_Default", "Flow_False"),
            List.of(
                conditional("Flow_False", "Task_False", "${false}"),
                defaultFlow("Flow_Default", "Task_Default")));

    try (var session = deploy("juel-default", source)) {
      var instance =
          session
              .engine()
              .getRuntimeService()
              .startProcessInstanceByKey("Process_Default");

      assertEquals(
          List.of("Task_Default"),
          activeTaskKeys(session.engine(), instance.getId()));
    }
  }

  @Test
  public void evaluatesBothJuelDelimitersAndNestedReadOnlyMapProperties() {
    requireTargetRelease();
    var immediate =
        process(
            "Process_Immediate",
            "Flow_ImmediateDefault",
            List.of("Flow_Immediate", "Flow_ImmediateDefault"),
            List.of(
                conditional(
                    "Flow_Immediate",
                    "Task_Immediate",
                    "${document.accepted}"),
                defaultFlow(
                    "Flow_ImmediateDefault",
                    "Task_ImmediateDefault")));
    var deferred =
        process(
            "Process_Deferred",
            "Flow_DeferredDefault",
            List.of("Flow_Deferred", "Flow_DeferredDefault"),
            List.of(
                conditional(
                    "Flow_Deferred",
                    "Task_Deferred",
                    "#{document.accepted}"),
                defaultFlow(
                    "Flow_DeferredDefault",
                    "Task_DeferredDefault")));

    try (var session =
        deploy(
            "juel-delimiters",
            Map.of(
                "immediate.bpmn", immediate,
                "deferred.bpmn", deferred))) {
      var variables =
          Map.<String, Object>of(
              "document", Map.of("accepted", true));
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
          List.of("Task_Immediate"),
          activeTaskKeys(session.engine(), immediateInstance.getId()));
      assertEquals(
          List.of("Task_Deferred"),
          activeTaskKeys(session.engine(), deferredInstance.getId()));
    }
  }

  @Test
  public void distinguishesPresentNullFromAnAbsentRootBinding() {
    requireTargetRelease();
    var source =
        process(
            "Process_Null",
            "Flow_NotNull",
            List.of("Flow_Null", "Flow_NotNull"),
            List.of(
                conditional("Flow_Null", "Task_Null", "${value == null}"),
                defaultFlow("Flow_NotNull", "Task_NotNull")));
    var variables = new HashMap<String, Object>();
    variables.put("value", null);

    try (var session = deploy("juel-null", source)) {
      var instance =
          session
              .engine()
              .getRuntimeService()
              .startProcessInstanceByKey("Process_Null", variables);
      assertEquals(
          List.of("Task_Null"),
          activeTaskKeys(session.engine(), instance.getId()));
    }

    requireRolledBackStart("juel-absent", source, Map.of(), "Unknown property");
  }

  @Test
  public void rejectsAStringResultInsteadOfCoercingItToBooleanAndRollsBack() {
    requireTargetRelease();
    var source =
        process(
            "Process_NonBoolean",
            "Flow_Default",
            List.of("Flow_Value", "Flow_Default"),
            List.of(
                conditional("Flow_Value", "Task_Value", "${value}"),
                defaultFlow("Flow_Default", "Task_Default")));

    requireRolledBackStart(
        "juel-non-boolean",
        source,
        Map.of("value", "true"),
        "condition expression returns non-Boolean");
  }

  @Test
  public void rollsBackFailedUserTaskCompletionToTheSameCommittedWait() {
    requireTargetRelease();
    var source =
        processAfterUserTask(
            "Process_UserTaskRollback",
            "Flow_Default",
            List.of("Flow_Failure", "Flow_Default"),
            List.of(
                conditional("Flow_Failure", "Task_Selected", "${missing != null}"),
                defaultFlow("Flow_Default", "Task_Default")));

    try (var session = deploy("juel-user-task-rollback", source)) {
      var instance =
          session
              .engine()
              .getRuntimeService()
              .startProcessInstanceByKey("Process_UserTaskRollback");
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
          List.of("Task_Selected"),
          activeTaskKeys(session.engine(), instance.getId()));
    }
  }

  @Test
  public void stopsOnAnEarlierResolutionFailureWithoutTryingALaterTrueFlow() {
    requireTargetRelease();
    var source =
        process(
            "Process_EarlierFailure",
            null,
            List.of("Flow_Later", "Flow_Failure"),
            List.of(
                conditional("Flow_Failure", "Task_Failure", "${missing}"),
                conditional("Flow_Later", "Task_Later", "${later}")));

    requireRolledBackStart(
        "juel-earlier-failure",
        source,
        Map.of("later", true),
        "Unknown property");
  }

  @Test
  public void rejectsInvalidJuelDuringDeploymentWithoutRetainingADefinition() {
    requireTargetRelease();
    var engine = CibSevenTestEngine.create("juel-syntax");
    try {
      var source =
          process(
              "Process_Syntax",
              "Flow_Default",
              List.of("Flow_Invalid", "Flow_Default"),
              List.of(
                  conditional("Flow_Invalid", "Task_Invalid", "${"),
                  defaultFlow("Flow_Default", "Task_Default")));

      assertThrows(
          ProcessEngineException.class,
          () ->
              engine
                  .getRepositoryService()
                  .createDeployment()
                  .addString("syntax.bpmn", source)
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

  private static void requireRolledBackStart(
      String name,
      String source,
      Map<String, Object> variables,
      String messageFragment) {
    try (var session = deploy(name, source)) {
      var failure =
          assertThrows(
              ProcessEngineException.class,
              () ->
                  session
                      .engine()
                      .getRuntimeService()
                      .startProcessInstanceByKey(
                          processId(source), variables));
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

  private static ProbeSession deploy(String name, String source) {
    return deploy(name, Map.of(name + ".bpmn", source));
  }

  private static ProbeSession deploy(
      String name, Map<String, String> resources) {
    var engine = CibSevenTestEngine.create(name);
    var builder = engine.getRepositoryService().createDeployment();
    for (var resource : resources.entrySet()) {
      builder.addString(resource.getKey(), resource.getValue());
    }
    var deployment = builder.deploy();
    return new ProbeSession(engine, deployment.getId());
  }

  private static String processId(String source) {
    var marker = "<bpmn:process id=\"";
    var start = source.indexOf(marker);
    if (start < 0) {
      throw new IllegalArgumentException("Process source has no Process id");
    }
    var valueStart = start + marker.length();
    var valueEnd = source.indexOf('"', valueStart);
    return source.substring(valueStart, valueEnd);
  }

  private static String process(
      String processId,
      String defaultFlowId,
      List<String> outgoingReferences,
      List<Flow> declaredFlows) {
    return process(
        processId,
        defaultFlowId,
        outgoingReferences,
        declaredFlows,
        false);
  }

  private static String processAfterUserTask(
      String processId,
      String defaultFlowId,
      List<String> outgoingReferences,
      List<Flow> declaredFlows) {
    return process(
        processId,
        defaultFlowId,
        outgoingReferences,
        declaredFlows,
        true);
  }

  private static String process(
      String processId,
      String defaultFlowId,
      List<String> outgoingReferences,
      List<Flow> declaredFlows,
      boolean includePrecedingUserTask) {
    var gatewayDefault =
        defaultFlowId == null ? "" : " default=\"" + defaultFlowId + "\"";
    var gatewayIncoming =
        includePrecedingUserTask ? "Flow_ToGateway" : "Flow_Start";
    var precedingTask =
        includePrecedingUserTask
            ? """
                <bpmn:userTask id="Task_Before">
                  <bpmn:incoming>Flow_Start</bpmn:incoming>
                  <bpmn:outgoing>Flow_ToGateway</bpmn:outgoing>
                </bpmn:userTask>
              """
            : "";
    var incomingFlows =
        includePrecedingUserTask
            ? """
                <bpmn:sequenceFlow id="Flow_Start" sourceRef="Start" targetRef="Task_Before"/>
                <bpmn:sequenceFlow id="Flow_ToGateway" sourceRef="Task_Before" targetRef="Gateway"/>
              """
            : """
                <bpmn:sequenceFlow id="Flow_Start" sourceRef="Start" targetRef="Gateway"/>
              """;
    var outgoing = new StringBuilder();
    for (var flowId : outgoingReferences) {
      outgoing
          .append("      <bpmn:outgoing>")
          .append(flowId)
          .append("</bpmn:outgoing>\n");
    }
    var tasks = new StringBuilder();
    var flows = new StringBuilder();
    for (var flow : declaredFlows) {
      tasks
          .append("    <bpmn:userTask id=\"")
          .append(flow.taskId())
          .append("\">\n")
          .append("      <bpmn:incoming>")
          .append(flow.id())
          .append("</bpmn:incoming>\n")
          .append("    </bpmn:userTask>\n");
      flows
          .append("    <bpmn:sequenceFlow id=\"")
          .append(flow.id())
          .append("\" sourceRef=\"Gateway\" targetRef=\"")
          .append(flow.taskId())
          .append("\">");
      if (flow.expression() == null) {
        flows.append("</bpmn:sequenceFlow>\n");
      } else {
        flows
            .append("\n")
            .append(
                "      <bpmn:conditionExpression"
                    + " xsi:type=\"bpmn:tFormalExpression\">")
            .append(flow.expression())
            .append("</bpmn:conditionExpression>\n")
            .append("    </bpmn:sequenceFlow>\n");
      }
    }

    return """
        <?xml version="1.0" encoding="UTF-8"?>
        <bpmn:definitions
          xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
          targetNamespace="urn:bpmn-lean:juel-probe">
          <bpmn:process id="%s" isExecutable="true">
            <bpmn:startEvent id="Start">
              <bpmn:outgoing>Flow_Start</bpmn:outgoing>
            </bpmn:startEvent>
        %s
            <bpmn:exclusiveGateway id="Gateway"%s>
              <bpmn:incoming>%s</bpmn:incoming>
        %s    </bpmn:exclusiveGateway>
        %s%s
        %s  </bpmn:process>
        </bpmn:definitions>
        """
        .formatted(
            processId,
            precedingTask,
            gatewayDefault,
            gatewayIncoming,
            outgoing,
            tasks,
            incomingFlows,
            flows);
  }

  private static Flow conditional(
      String id, String taskId, String expression) {
    return new Flow(id, taskId, expression);
  }

  private static Flow defaultFlow(String id, String taskId) {
    return new Flow(id, taskId, null);
  }

  private static void requireTargetRelease() {
    assumeTrue(
        "2.0.0".equals(
            ProcessEngine.class.getPackage().getImplementationVersion()));
  }

  private record Flow(String id, String taskId, String expression) {}

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
