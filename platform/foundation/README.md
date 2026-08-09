# Platform foundation

Foundation packages own narrowly reusable product-2 infrastructure mechanisms. They may not depend on a business module or application composition root, and this directory must not become a generic utility collection.

M1 instantiates the ownership locations for the [engine gateway](engine-gateway/README.md) and [artifact store](artifact-store/README.md). Later foundation packages are created only with a real consumer. [ARCHITECTURE.md](../../docs/ARCHITECTURE.md#foundation-packages) owns the complete list and extraction rule.
