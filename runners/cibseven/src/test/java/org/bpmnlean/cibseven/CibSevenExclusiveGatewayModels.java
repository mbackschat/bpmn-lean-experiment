package org.bpmnlean.cibseven;

import java.util.Objects;
import org.cibseven.bpm.model.bpmn.Bpmn;
import org.cibseven.bpm.model.bpmn.BpmnModelInstance;
import org.cibseven.bpm.model.bpmn.builder.ExclusiveGatewayBuilder;
import org.cibseven.bpm.model.bpmn.instance.ExclusiveGateway;
import org.cibseven.bpm.model.bpmn.instance.SequenceFlow;

/**
 * Builds the exact two-condition-plus-default Exclusive Gateway shape admitted by the capsule.
 *
 * <p>A probe uses literal XML instead when its discriminating fact is lexical and model
 * serialization would erase it.
 */
final class CibSevenExclusiveGatewayModels {

  private static final String GATEWAY_ID = "Gateway";
  private static final String PRECEDING_TASK_ID = "Task_Before";

  private CibSevenExclusiveGatewayModels() {}

  static BpmnModelInstance process(
      String processId,
      ConditionalBranch first,
      ConditionalBranch second,
      DefaultBranch fallback) {
    return build(
        processId,
        first,
        second,
        fallback,
        Bpmn.createExecutableProcess(processId)
            .startEvent("Start")
            .sequenceFlowId("Flow_Start")
            .exclusiveGateway(GATEWAY_ID));
  }

  static BpmnModelInstance processAfterUserTask(
      String processId,
      ConditionalBranch first,
      ConditionalBranch second,
      DefaultBranch fallback) {
    return build(
        processId,
        first,
        second,
        fallback,
        Bpmn.createExecutableProcess(processId)
            .startEvent("Start")
            .sequenceFlowId("Flow_ToUserTask")
            .userTask(PRECEDING_TASK_ID)
            .sequenceFlowId("Flow_ToGateway")
            .exclusiveGateway(GATEWAY_ID));
  }

  private static BpmnModelInstance build(
      String processId,
      ConditionalBranch first,
      ConditionalBranch second,
      DefaultBranch fallback,
      ExclusiveGatewayBuilder gateway) {
    Objects.requireNonNull(processId, "processId");
    Objects.requireNonNull(first, "first");
    Objects.requireNonNull(second, "second");
    Objects.requireNonNull(fallback, "fallback");

    var model =
        gateway
            .sequenceFlowId(first.sequenceFlowId())
            .condition(null, first.expression())
            .userTask(first.taskId())
            .moveToLastGateway()
            .sequenceFlowId(second.sequenceFlowId())
            .condition(null, second.expression())
            .userTask(second.taskId())
            .moveToLastGateway()
            .sequenceFlowId(fallback.sequenceFlowId())
            .userTask(fallback.taskId())
            .done();

    ExclusiveGateway exclusiveGateway = model.getModelElementById(GATEWAY_ID);
    SequenceFlow defaultFlow = model.getModelElementById(fallback.sequenceFlowId());
    exclusiveGateway.setDefault(defaultFlow);
    return model;
  }

  record ConditionalBranch(
      String sequenceFlowId,
      String taskId,
      String expression) {

    ConditionalBranch {
      Objects.requireNonNull(sequenceFlowId, "sequenceFlowId");
      Objects.requireNonNull(taskId, "taskId");
      Objects.requireNonNull(expression, "expression");
    }
  }

  record DefaultBranch(String sequenceFlowId, String taskId) {

    DefaultBranch {
      Objects.requireNonNull(sequenceFlowId, "sequenceFlowId");
      Objects.requireNonNull(taskId, "taskId");
    }
  }
}
