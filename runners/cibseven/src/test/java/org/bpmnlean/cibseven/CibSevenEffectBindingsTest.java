package org.bpmnlean.cibseven;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertThrows;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import org.bpmnlean.cibseven.CibSevenEffectBindings.BoundEffect;
import org.bpmnlean.cibseven.ScenarioProtocol.SourceOverlayIdentity;
import org.junit.Test;

public class CibSevenEffectBindingsTest {

  private static final Path JOURNEY =
      Path.of("../..").toAbsolutePath().normalize().resolve("scenarios/open-rows/journey-order-invoice");
  private static final String ACTIVITY = "urn:bpmn-lean:effect-protocol:activity-v1";

  @Test
  public void registersEveryTokenTheOverlayDeclaresBesideTheBuiltInOnes() throws Exception {
    var bindings = orderInvoice();

    var expected = new ArrayList<>(CibSevenScriptedEffect.HANDLER_BEANS);
    expected.addAll(List.of("postInvoice", "sendPostingNotice"));
    assertEquals(expected, bindings.handlerTokens());
  }

  @Test
  public void publishesTheOverlayDescriptorOfAnExactlyMatchingSource() throws Exception {
    assertEquals(
        new BoundEffect("sendPostingNotice", ACTIVITY, "sendPostingNotice"),
        orderInvoice().effect("SendNotice", ACTIVITY, "${sendPostingNotice}"));
  }

  @Test
  public void refusesATokenTheOverlayDoesNotDeclare() throws Exception {
    var bindings = orderInvoice();

    assertThrows(IllegalStateException.class, () -> bindings.effect("Other", ACTIVITY, "${checkCredit}"));
    assertThrows(IllegalStateException.class, () -> bindings.effect("Other", null, "${postInvoice}"));
    assertThrows(
        IllegalStateException.class,
        () -> CibSevenEffectBindings.BUILT_IN.effect("PostInvoice", ACTIVITY, "${postInvoice}"));
  }

  @Test
  public void keepsTheBuiltInProbeForATokenNoBeanCarries() throws Exception {
    // CIB-LIM-0051: the probe protocol's wait is projected whatever its token, and CIB fails the job.
    assertEquals(
        new BoundEffect(
            "noSuchHandler", CibSevenScriptedEffect.EFFECT_PROTOCOL, CibSevenScriptedEffect.EFFECT_OPERATION),
        orderInvoice().effect("Task", CibSevenScriptedEffect.SOURCE_PROTOCOL, "${noSuchHandler}"));
  }

  @Test
  public void refusesAnOverlayOtherThanTheOneTheScenarioNames() throws Exception {
    var identity = identity();
    var other = new SourceOverlayIdentity("other-handlers", identity.sha256());

    assertThrows(IllegalArgumentException.class, () -> CibSevenEffectBindings.read(other, overlayJson()));
  }

  @Test
  public void refusesADelegateExpressionThatIsNotOneBeanToken() {
    var json = "{\"kind\":\"bpmnSourceOverlay\",\"id\":\"composite\",\"semanticProfile\":\"cibseven-2.2.0\","
        + "\"effectBindings\":[{\"source\":{\"implementation\":null,\"delegateExpression\":\"${a.b}\"},"
        + "\"descriptor\":{\"protocol\":\"p\",\"operation\":\"o\"}}],\"inertAttributes\":[]}";

    assertThrows(
        IllegalArgumentException.class,
        () -> CibSevenEffectBindings.read(new SourceOverlayIdentity("composite", "0".repeat(64)), json));
  }

  @Test
  public void refusesAPopulationWhoseDefinitionsBindDifferentOverlays() throws Exception {
    var bindings = orderInvoice();

    assertEquals(bindings, CibSevenEffectBindings.shared(List.of(bindings, bindings)));
    assertThrows(
        IllegalStateException.class,
        () -> CibSevenEffectBindings.shared(List.of(bindings, CibSevenEffectBindings.BUILT_IN)));
  }

  @Test
  public void bindingAScenarioReplacesThePreviousScenariosBeans() throws Exception {
    var effects = new CibSevenScriptedEffect();
    effects.bind(orderInvoice());

    effects.bind(CibSevenEffectBindings.BUILT_IN);

    assertEquals(
        List.copyOf(CibSevenScriptedEffect.HANDLER_BEANS).stream().sorted().toList(),
        effects.beans().keySet().stream().map(String.class::cast).sorted().toList());
  }

  private static CibSevenEffectBindings orderInvoice() throws Exception {
    return CibSevenEffectBindings.read(identity(), overlayJson());
  }

  private static SourceOverlayIdentity identity() throws Exception {
    return ScenarioJson.read(JOURNEY.resolve("automatic-success.scenario.json")).bpmn().sourceOverlay();
  }

  private static String overlayJson() throws Exception {
    return Files.readString(JOURNEY.resolve("order-invoice-overlay.json"), StandardCharsets.UTF_8);
  }
}
