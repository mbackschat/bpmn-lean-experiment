module

public import Kernel.IL.Types

/-! # Admission of catch Events. A refusal carries a stable code. -/

public section

namespace Kernel.Admission.Subscriptions

def catchEvent (_ : Subscription) : Option String := some "event.catch"

end Kernel.Admission.Subscriptions
