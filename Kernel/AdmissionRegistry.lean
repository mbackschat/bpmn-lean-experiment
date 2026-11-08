module

public import Kernel.Admission.Flow
public import Kernel.Admission.Work
public import Kernel.Admission.Propagation
public import Kernel.Admission.Scopes
public import Kernel.Admission.Subscriptions

/-! # Admission registry: the first refusal of any element, in program order. Only `Kernel.Run` imports it. -/

public section

namespace Kernel.AdmissionRegistry

def element : Element → Option String
  | .activity _ payload => Admission.Work.activity payload
  | .scope _ payload => Admission.Scopes.scope payload
  | .event _ payload =>
    match payload.role with
    | .catch subscription => Admission.Subscriptions.catchEvent subscription
    | .throw record => Admission.Propagation.throwRecord record
    | .linkCatch _ => Admission.Flow.link payload
    | .linkThrow _ => Admission.Flow.link payload
  | .gateway _ payload => Admission.Flow.gateway payload
  | .start _ payload => Admission.Flow.start payload

def admit (program : Program) : Option String :=
  program.elements.findSome? element

end Kernel.AdmissionRegistry
