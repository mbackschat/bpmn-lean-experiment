# Platform foundation

Foundation packages own narrowly reusable product-2 infrastructure mechanisms. They may not depend on a business module or application composition root, and this directory must not become a generic utility collection.

M1 implements the [engine gateway](engine-gateway/README.md) and [artifact store](artifact-store/README.md). M3 adds the exact fake [identity policy](identity-policy/) and append-only [platform audit](audit/) foundations consumed by the Work module. Later foundation packages are created only with a real consumer. [ARCHITECTURE.md](../../docs/ARCHITECTURE.md#foundation-packages) owns the complete list and extraction rule.
