package org.bpmnlean.cibseven;

import java.util.List;
import java.util.Objects;
import org.cibseven.bpm.engine.ProcessEngine;
import org.cibseven.bpm.engine.runtime.EventSubscription;
import org.cibseven.bpm.model.bpmn.instance.ReceiveTask;

/** Reads and consumes public CIB Message subscriptions without exporting generated host IDs. */
final class CibSevenMessageSubscriptionGateway {

  private final ProcessEngine processEngine;

  CibSevenMessageSubscriptionGateway(ProcessEngine processEngine) {
    this.processEngine = processEngine;
  }

  List<HostMessageSubscription> find(String engineInstanceId) {
    var subscriptions =
        processEngine
            .getRuntimeService()
            .createEventSubscriptionQuery()
            .processInstanceId(engineInstanceId)
            .eventType("message")
            .list();
    if (subscriptions.isEmpty()) {
      return List.of();
    }
    var processInstance =
        processEngine
            .getRuntimeService()
            .createProcessInstanceQuery()
            .processInstanceId(engineInstanceId)
            .singleResult();
    if (processInstance == null) {
      throw new IllegalStateException("Message subscription has no live Process instance");
    }
    var model =
        processEngine
            .getRepositoryService()
            .getBpmnModelInstance(processInstance.getProcessDefinitionId());
    return subscriptions.stream()
        .map(
            subscription -> {
              var element = model.getModelElementById(subscription.getActivityId());
              if (!(element instanceof ReceiveTask receiveTask)
                  || receiveTask.getMessage() == null) {
                throw new IllegalStateException(
                    "Bounded CIB Message projection requires a Message-addressed Receive Task");
              }
              var message = receiveTask.getMessage();
              if (!Objects.equals(message.getName(), subscription.getEventName())) {
                throw new IllegalStateException(
                    "CIB subscription name differs from its deployed Receive Task Message");
              }
              return new HostMessageSubscription(
                  subscription,
                  receiveTask.getId(),
                  message.getId());
            })
        .toList();
  }

  void deliver(HostMessageSubscription subscription) {
    processEngine
        .getRuntimeService()
        .messageEventReceived(
            subscription.host().getEventName(),
            subscription.host().getExecutionId());
  }

  record HostMessageSubscription(
      EventSubscription host, String elementId, String messageId) {
    HostMessageSubscription {
      Objects.requireNonNull(host, "host");
      Objects.requireNonNull(elementId, "elementId");
      Objects.requireNonNull(messageId, "messageId");
    }
  }
}
