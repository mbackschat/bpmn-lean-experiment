package org.bpmnlean.cibseven;

import java.util.ArrayList;
import java.util.List;
import javax.xml.parsers.DocumentBuilderFactory;
import org.bpmnlean.cibseven.ScenarioProtocol.EffectDescriptor;
import org.bpmnlean.cibseven.ScenarioProtocol.EffectJob;
import org.bpmnlean.cibseven.ScenarioProtocol.EffectOccurrenceId;
import org.bpmnlean.cibseven.ScenarioProtocol.OpenEffect;
import org.cibseven.bpm.engine.ProcessEngine;
import org.w3c.dom.Element;

/**
 * Projects the bounded async-before Service Task host wait from public deployment and job state.
 *
 * <p>Activity, protocol, handler, retry, and executability facts are host-derived. Mapping the sole
 * live job to semantic activation one is deliberately adapter-decided.
 */
final class CibSevenEffectProjector {

  static final String BPMN_NAMESPACE = "http://www.omg.org/spec/BPMN/20100524/MODEL";
  static final String CAMUNDA_NAMESPACE = "http://camunda.org/schema/1.0/bpmn";
  static final String EFFECT_PROTOCOL = "urn:bpmn-lean:effect:probe-v1";
  static final String HANDLER_BEAN = "bpmnLeanEffectHandler";

  List<ProjectedEffectWait> project(
      ProcessEngine engine, String processInstanceId, String stableInstanceId) {
    var projected = new ArrayList<ProjectedEffectWait>();
    var management = engine.getManagementService();
    for (var job :
        management.createJobQuery().processInstanceId(processInstanceId).list()) {
      var definition =
          management
              .createJobDefinitionQuery()
              .jobDefinitionId(job.getJobDefinitionId())
              .singleResult();
      if (definition == null) {
        throw new IllegalStateException(
            "Async job has no public JobDefinition " + job.getJobDefinitionId());
      }
      var serviceTask =
          findDeployedServiceTask(
              engine, job.getProcessDefinitionId(), definition.getActivityId());
      if (serviceTask == null) {
        continue;
      }
      var activationCount =
          management
              .createJobQuery()
              .processInstanceId(processInstanceId)
              .jobDefinitionId(definition.getId())
              .count();
      if (activationCount != 1) {
        throw new IllegalStateException(
            "Bounded Service Task profile requires exactly one live continuation job");
      }
      var protocol = requireAttribute(serviceTask, null, "implementation");
      var handler =
          requireBeanToken(
              requireAttribute(serviceTask, CAMUNDA_NAMESPACE, "delegateExpression"));
      if (!EFFECT_PROTOCOL.equals(protocol) || !HANDLER_BEAN.equals(handler)) {
        throw new IllegalStateException(
            "Deployed Service Task binding does not match the admitted profile");
      }
      var activation = Math.toIntExact(activationCount);
      var occurrence =
          new EffectOccurrenceId(stableInstanceId, definition.getActivityId(), activation);
      var descriptor = new EffectDescriptor(protocol, handler);
      projected.add(
          new ProjectedEffectWait(
              job.getId(),
              new OpenEffect(occurrence, descriptor, List.of()),
              new EffectJob(
                  definition.getActivityId(),
                  activation,
                  protocol,
                  handler,
                  job.getRetries(),
                  management.createJobQuery().jobId(job.getId()).executable().count() == 1,
                  job.getDuedate() != null)));
    }
    projected.sort(
        (left, right) ->
            WireStrings.compare(
                left.openEffect().id().elementId(),
                right.openEffect().id().elementId()));
    return List.copyOf(projected);
  }

  private static Element findDeployedServiceTask(
      ProcessEngine engine, String processDefinitionId, String elementId) {
    var factory = DocumentBuilderFactory.newInstance();
    factory.setNamespaceAware(true);
    try (var input =
        engine.getRepositoryService().getProcessModel(processDefinitionId)) {
      if (input == null) {
        throw new IllegalStateException("Missing deployed BPMN model for async job");
      }
      var elements =
          factory
              .newDocumentBuilder()
              .parse(input)
              .getElementsByTagNameNS(BPMN_NAMESPACE, "serviceTask");
      for (var index = 0; index < elements.getLength(); index += 1) {
        var element = (Element) elements.item(index);
        if (elementId.equals(element.getAttribute("id"))) {
          return element;
        }
      }
      return null;
    } catch (Exception failure) {
      throw new IllegalStateException("Cannot project deployed Service Task", failure);
    }
  }

  private static String requireAttribute(
      Element element, String namespace, String localName) {
    var attribute =
        namespace == null
            ? element.getAttributeNode(localName)
            : element.getAttributeNodeNS(namespace, localName);
    if (attribute == null || attribute.getValue().isEmpty()) {
      throw new IllegalStateException(
          "Deployed Service Task is missing attribute " + localName);
    }
    return attribute.getValue();
  }

  private static String requireBeanToken(String delegateExpression) {
    if (!delegateExpression.startsWith("${")
        || !delegateExpression.endsWith("}")
        || delegateExpression.length() <= 3) {
      throw new IllegalStateException(
          "Delegate expression is not one exact bean-token reference");
    }
    return delegateExpression.substring(2, delegateExpression.length() - 1);
  }

  record ProjectedEffectWait(
      String jobId, OpenEffect openEffect, EffectJob evidence) {}
}
