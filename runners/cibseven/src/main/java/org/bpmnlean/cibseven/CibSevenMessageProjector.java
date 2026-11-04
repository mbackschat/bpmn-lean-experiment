package org.bpmnlean.cibseven;

import static org.bpmnlean.cibseven.ScenarioProtocol.WaitKind.MESSAGE;

import java.util.List;
import java.util.stream.Stream;
import org.bpmnlean.cibseven.CibStateQueryEvidence.MessageSubscription;
import org.bpmnlean.cibseven.CibStateQueryEvidence.MessageSubscriptionSnapshot;
import org.bpmnlean.cibseven.CibSevenMessageSubscriptionGateway.HostMessageSubscription;
import org.bpmnlean.cibseven.ScenarioMessageProtocol.DeliverMessageInteraction;
import org.bpmnlean.cibseven.ScenarioMessageProtocol.DirectMessageChannel;
import org.bpmnlean.cibseven.ScenarioMessageProtocol.MessageSubscriptionId;
import org.bpmnlean.cibseven.ScenarioMessageProtocol.OpenMessageSubscription;
import org.bpmnlean.cibseven.ScenarioMessageProtocol.UnspecifiedMessageChannel;
import org.bpmnlean.cibseven.ScenarioProtocol.ActiveWait;
import org.bpmnlean.cibseven.ScenarioInteractionProtocol.EnabledInteraction;

/** Maps the admitted singleton CIB Receive Task subscription or addressless wait into canonical Message state. */
final class CibSevenMessageProjector {

  private final CibSevenMessageSubscriptionGateway gateway;

  CibSevenMessageProjector(CibSevenMessageSubscriptionGateway gateway) {
    this.gateway = gateway;
  }

  ProjectedMessageState project(
      String engineInstanceId, String stableInstanceId, String afterCommandId) {
    var hosts = gateway.find(engineInstanceId);
    var addressless = gateway.findAddressless(engineInstanceId);
    if (hosts.size() + addressless.size() > 1) {
      throw new IllegalStateException(
          "Repeated or concurrent Message waits require activation derivation");
    }
    var subscriptions =
        Stream.concat(
                hosts.stream().map(host -> openSubscription(stableInstanceId, host)),
                addressless.stream()
                    .map(
                        wait ->
                            new OpenMessageSubscription(
                                new MessageSubscriptionId(stableInstanceId, wait.elementId(), 1),
                                new UnspecifiedMessageChannel())))
            .toList();
    var activeWaits =
        subscriptions.stream()
            .map(
                subscription ->
                    new ActiveWait(subscription.id().elementId(), MESSAGE, 1))
            .toList();
    var interactions =
        subscriptions.stream()
            .<EnabledInteraction>map(
                subscription ->
                    new DeliverMessageInteraction(
                        subscription.id(), subscription.channel()))
            .toList();
    var raw =
        new MessageSubscriptionSnapshot(
            afterCommandId,
            hosts.stream()
                .map(host -> rawSubscription(engineInstanceId, host))
                .toList(),
            addressless.stream()
                .map(wait -> new CibStateQueryEvidence.AddresslessReceiveWait(wait.elementId()))
                .toList());
    return new ProjectedMessageState(activeWaits, subscriptions, interactions, raw);
  }

  private OpenMessageSubscription openSubscription(
      String stableInstanceId, HostMessageSubscription host) {
    return new OpenMessageSubscription(
        new MessageSubscriptionId(stableInstanceId, host.elementId(), 1),
        new DirectMessageChannel(host.messageId()));
  }

  private MessageSubscription rawSubscription(
      String engineInstanceId, HostMessageSubscription host) {
    return new MessageSubscription(
        host.elementId(),
        host.host().getEventName(),
        host.messageId(),
        engineInstanceId.equals(host.host().getProcessInstanceId()),
        host.host().getExecutionId() != null);
  }

  record ProjectedMessageState(
      List<ActiveWait> activeWaits,
      List<OpenMessageSubscription> openSubscriptions,
      List<EnabledInteraction> enabledInteractions,
      MessageSubscriptionSnapshot evidence) {
    ProjectedMessageState {
      activeWaits = List.copyOf(activeWaits);
      openSubscriptions = List.copyOf(openSubscriptions);
      enabledInteractions = List.copyOf(enabledInteractions);
    }
  }
}
