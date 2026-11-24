// Fixture for the e2e test. Line numbers matter: the test refers to them.
export const listProducts = () => fetch("/api/v1/products/");
export const getProduct = (id: number) => fetch(`/api/v1/products/${id}/`);
export const checkout = () => fetch("/api/v1/checkout/", { method: "POST" });
export const external = () => fetch("https://example.com/other");
export const wrongMethod = () => fetch("/api/v1/checkout/");
export const missing = () => fetch("/api/v1/nope/");
export const noSlash = () => fetch("/api/v1/cart");
// fetchlens-ignore
export const ignored = () => fetch("/api/v1/nope2/");
