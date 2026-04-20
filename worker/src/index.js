/**
 * UCP Demo API - Cloudflare Worker
 * Aligned to UCP spec v2026-04-08
 *
 * Handles all UCP API endpoints for the demo:
 * - Discovery (/.well-known/ucp)
 * - Catalog (search, lookup)
 * - Cart (CRUD)
 * - Checkout (lifecycle + discount extension)
 * - Orders (get, list)
 */

const UCP_VERSION = "2026-04-08";

// ============================================================================
// Product Catalog - AI Gadgets
// ============================================================================

const products = [
    {
        id: "ai-voice-assistant",
        name: "AI Voice Assistant",
        description: "Smart speaker with advanced voice AI and multi-room audio",
        price: 8999,
        currency: "USD",
        category: "smart-home",
        image_url: "https://images.unsplash.com/photo-1543512214-318c7553f230?w=200&h=200&fit=crop",
        in_stock: true,
    },
    {
        id: "neural-earbuds",
        name: "Neural Earbuds Pro",
        description: "Wireless earbuds with real-time AI translation in 40+ languages",
        price: 14999,
        currency: "USD",
        category: "wearables",
        image_url: "https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=200&h=200&fit=crop",
        in_stock: true,
    },
    {
        id: "smart-glasses",
        name: "AI Smart Glasses",
        description: "AR glasses with integrated AI assistant and heads-up display",
        price: 29999,
        currency: "USD",
        category: "wearables",
        image_url: "https://images.unsplash.com/photo-1574944985070-8f3ebc6b79d2?w=200&h=200&fit=crop",
        in_stock: true,
    },
    {
        id: "robot-companion",
        name: "Robot Companion",
        description: "Desktop AI robot for productivity, scheduling, and companionship",
        price: 19999,
        currency: "USD",
        category: "robotics",
        image_url: "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=200&h=200&fit=crop",
        in_stock: true,
    },
    {
        id: "brain-band",
        name: "Brain Band",
        description: "EEG headband for AI-powered focus, meditation, and sleep tracking",
        price: 12999,
        currency: "USD",
        category: "health",
        image_url: "https://images.unsplash.com/photo-1589254065878-42c9da997008?w=200&h=200&fit=crop",
        in_stock: false,
    },
    {
        id: "ai-camera",
        name: "AI Security Camera",
        description: "Smart security camera with on-device person, pet, and package detection",
        price: 7999,
        currency: "USD",
        category: "smart-home",
        image_url: "https://images.unsplash.com/photo-1558002038-1055907df827?w=200&h=200&fit=crop",
        in_stock: true,
    },
];

// ============================================================================
// Discount Codes
// ============================================================================

const discountCodes = {
    SAVE10: { code: "SAVE10", type: "percentage", value: 10, description: "10% off your order" },
    FREESHIP: { code: "FREESHIP", type: "free_shipping", value: 0, description: "Free standard shipping" },
    FLAT20: { code: "FLAT20", type: "fixed", value: 2000, description: "$20 off your order", min_order_amount: 10000 },
};

// ============================================================================
// Fulfillment Options
// ============================================================================

const fulfillmentOptions = [
    { id: "standard-shipping", type: "shipping", name: "Standard Shipping", description: "5-7 business days", price: 599, currency: "USD", estimated_delivery: "P7D" },
    { id: "express-shipping", type: "shipping", name: "Express Shipping", description: "2-3 business days", price: 1299, currency: "USD", estimated_delivery: "P3D" },
    { id: "overnight-shipping", type: "shipping", name: "Overnight Shipping", description: "Next business day", price: 2499, currency: "USD", estimated_delivery: "P1D" },
    { id: "store-pickup", type: "pickup", name: "Store Pickup", description: "San Francisco store", price: 0, currency: "USD", estimated_delivery: "PT2H" },
];

// ============================================================================
// In-Memory Storage
// ============================================================================

const checkoutSessions = new Map();
const orders = new Map();
const carts = new Map();

// ============================================================================
// Helper Functions
// ============================================================================

function getProduct(id) { return products.find(p => p.id === id); }
function generateId() { return crypto.randomUUID(); }

function corsHeaders() {
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Content-Type": "application/json",
    };
}

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: corsHeaders() });
}

// ============================================================================
// Checkout Logic
// ============================================================================

const TAX_RATE = 0.0875;

function resolveLineItems(requests, currency) {
    const items = [];
    const errors = [];
    for (const req of requests) {
        const product = getProduct(req.item.id);
        if (!product) { errors.push(`Product not found: ${req.item.id}`); continue; }
        if (!product.in_stock) { errors.push(`Product out of stock: ${product.name}`); continue; }
        items.push({
            id: generateId(),
            item: { id: product.id, name: product.name, description: product.description, image_url: product.image_url },
            quantity: req.quantity,
            unit_price: product.price,
            total_price: product.price * req.quantity,
        });
    }
    return { items, errors };
}

function calculateTotals(lineItems, checkout) {
    const subtotal = lineItems.reduce((sum, item) => sum + item.total_price, 0);
    const tax = Math.round(subtotal * TAX_RATE);

    let shipping = 0;
    if (checkout?.selected_fulfillment?.selected_option_id) {
        const opt = fulfillmentOptions.find(o => o.id === checkout.selected_fulfillment.selected_option_id);
        if (opt) shipping = opt.price;
    } else {
        shipping = subtotal >= 10000 ? 0 : 599;
    }

    let discount = 0;
    if (checkout?.discount) {
        discount = checkout.discount.amount;
        if (checkout.discount.type === "free_shipping") shipping = 0;
    }

    return { subtotal, tax, shipping, discount, total: subtotal + tax + shipping - discount };
}

// ============================================================================
// Route Handlers
// ============================================================================

function handleDiscovery(request) {
    const baseUrl = new URL(request.url).origin;
    return jsonResponse({
        ucp: {
            version: UCP_VERSION,
            services: {
                "dev.ucp.catalog": {
                    version: UCP_VERSION,
                    rest: { endpoint: `${baseUrl}/api/catalog` },
                    capabilities: [
                        { name: "dev.ucp.catalog", version: UCP_VERSION },
                        { name: "dev.ucp.catalog.search", version: UCP_VERSION },
                        { name: "dev.ucp.catalog.lookup", version: UCP_VERSION },
                    ],
                },
                "dev.ucp.shopping": {
                    version: UCP_VERSION,
                    rest: { endpoint: `${baseUrl}/api/shopping` },
                    capabilities: [
                        { name: "dev.ucp.cart", version: UCP_VERSION },
                        { name: "dev.ucp.shopping.checkout", version: UCP_VERSION },
                        { name: "dev.ucp.shopping.order", version: UCP_VERSION },
                        { name: "dev.ucp.shopping.checkout.discount", version: UCP_VERSION },
                        { name: "dev.ucp.shopping.checkout.fulfillment", version: UCP_VERSION },
                        { name: "dev.ucp.shopping.checkout.buyer_consent", version: UCP_VERSION },
                    ],
                },
            },
        },
        payment: {
            handlers: [
                { id: "mock-payment-handler", name: "Mock Payment (Testing)", type: "first_party", supported_tokens: ["success_token", "fail_token"] },
                { id: "card-handler", name: "Credit/Debit Card", type: "third_party", supported_networks: ["visa", "mastercard", "amex"] },
            ],
        },
        signing_keys: [{ kid: "ucp-demo-key-1", kty: "OKP", alg: "EdDSA", use: "sig" }],
    });
}

// Catalog
async function handleCatalogSearch(request) {
    const body = await request.json();
    let results = [...products];
    if (body.query) {
        const q = body.query.toLowerCase();
        results = results.filter(p => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q));
    }
    if (body.filters?.category) results = results.filter(p => p.category === body.filters.category);
    if (body.filters?.availability) results = results.filter(p => p.in_stock === (body.filters.availability === "in_stock"));

    const items = results.map(p => ({
        id: p.id, name: p.name, description: p.description,
        price: { amount: p.price, currency: p.currency },
        image_url: p.image_url, category: p.category,
        availability: p.in_stock ? "in_stock" : "out_of_stock",
    }));

    return jsonResponse({
        ucp: { version: UCP_VERSION, capabilities: [{ name: "dev.ucp.catalog", version: UCP_VERSION }] },
        items, total_count: items.length,
    });
}

function handleCatalogLookup(id) {
    const p = getProduct(id);
    if (!p) return jsonResponse({ error: "Item not found" }, 404);
    return jsonResponse({
        ucp: { version: UCP_VERSION, capabilities: [{ name: "dev.ucp.catalog", version: UCP_VERSION }] },
        item: { id: p.id, name: p.name, description: p.description, price: { amount: p.price, currency: p.currency }, image_url: p.image_url, category: p.category, availability: p.in_stock ? "in_stock" : "out_of_stock" },
    });
}

// Cart
async function handleCreateCart(request) {
    const body = await request.json();
    const currency = body.currency || "USD";
    let items = [];
    if (body.items) {
        for (const req of body.items) {
            const p = getProduct(req.item_id);
            if (p && p.in_stock) {
                items.push({ id: generateId(), item: { id: p.id, name: p.name, description: p.description, image_url: p.image_url }, quantity: req.quantity, unit_price: p.price, total_price: p.price * req.quantity });
            }
        }
    }
    const now = new Date().toISOString();
    const cart = {
        ucp: { version: UCP_VERSION, capabilities: [{ name: "dev.ucp.cart", version: UCP_VERSION }] },
        id: generateId(), currency, items,
        subtotal: items.reduce((s, i) => s + i.total_price, 0),
        created_at: now, updated_at: now,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };
    carts.set(cart.id, cart);
    return jsonResponse(cart, 201);
}

function handleGetCart(id) {
    const cart = carts.get(id);
    return cart ? jsonResponse(cart) : jsonResponse({ error: "Cart not found" }, 404);
}

async function handleUpdateCart(request, id) {
    const cart = carts.get(id);
    if (!cart) return jsonResponse({ error: "Cart not found" }, 404);
    const body = await request.json();
    if (body.items) {
        cart.items = [];
        for (const req of body.items) {
            const p = getProduct(req.item_id);
            if (p && p.in_stock) {
                cart.items.push({ id: generateId(), item: { id: p.id, name: p.name }, quantity: req.quantity, unit_price: p.price, total_price: p.price * req.quantity });
            }
        }
        cart.subtotal = cart.items.reduce((s, i) => s + i.total_price, 0);
    }
    cart.updated_at = new Date().toISOString();
    carts.set(id, cart);
    return jsonResponse(cart);
}

function handleDeleteCart(id) {
    return carts.delete(id) ? jsonResponse({ deleted: true }) : jsonResponse({ error: "Cart not found" }, 404);
}

// Checkout
async function handleCreateCheckout(request) {
    const body = await request.json();

    let lineItemRequests = body.line_items || [];
    let currency = body.currency || "USD";

    if (body.cart_id) {
        const cart = carts.get(body.cart_id);
        if (!cart) return jsonResponse({ error: "Cart not found" }, 404);
        lineItemRequests = cart.items.map(i => ({ item: { id: i.item.id }, quantity: i.quantity }));
        currency = cart.currency;
    }

    if (!lineItemRequests.length) return jsonResponse({ error: "line_items is required" }, 400);

    const { items, errors } = resolveLineItems(lineItemRequests, currency);

    const checkout = {
        ucp: { version: UCP_VERSION, capabilities: [{ name: "dev.ucp.shopping.checkout", version: UCP_VERSION }] },
        id: generateId(),
        status: "incomplete",
        line_items: items,
        currency,
        totals: { subtotal: 0, tax: 0, shipping: 0, discount: 0, total: 0 },
        payment: {
            selected_instrument_id: body.payment?.selected_instrument_id,
            instruments: body.payment?.instruments || [
                { id: "mock-instrument-1", handler_id: "mock-payment-handler", type: "token", display_name: "Test Payment" },
            ],
            status: "pending",
        },
        links: [
            { rel: "terms", href: "https://example.com/terms", title: "Terms of Service" },
            { rel: "privacy", href: "https://example.com/privacy", title: "Privacy Policy" },
            { rel: "refund", href: "https://example.com/refund", title: "Refund Policy" },
        ],
        buyer: body.buyer,
        messages: errors.length > 0 ? errors.map(e => ({ type: "error", code: "ITEM_ERROR", message: e })) : undefined,
        expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
        fulfillment_options: fulfillmentOptions,
        context: body.context,
        signals: body.signals,
    };

    checkout.totals = calculateTotals(items, checkout);
    if (items.length > 0 && checkout.payment.selected_instrument_id) checkout.status = "ready_for_complete";

    checkoutSessions.set(checkout.id, checkout);
    return jsonResponse(checkout, 201);
}

function handleGetCheckout(id) {
    const checkout = checkoutSessions.get(id);
    return checkout ? jsonResponse(checkout) : jsonResponse({ error: "Checkout not found" }, 404);
}

async function handleUpdateCheckout(request, id) {
    const checkout = checkoutSessions.get(id);
    if (!checkout) return jsonResponse({ error: "Checkout not found" }, 404);
    if (checkout.status === "completed" || checkout.status === "canceled") return jsonResponse({ error: `Cannot update ${checkout.status} checkout` }, 400);

    const body = await request.json();

    if (body.line_items) {
        const { items } = resolveLineItems(body.line_items, checkout.currency);
        checkout.line_items = items;
    }
    if (body.payment) {
        checkout.payment.selected_instrument_id = body.payment.selected_instrument_id;
        if (body.payment.instruments) checkout.payment.instruments = body.payment.instruments;
    }
    if (body.buyer) checkout.buyer = { ...checkout.buyer, ...body.buyer };
    if (body.fulfillment) {
        const opt = fulfillmentOptions.find(o => o.id === body.fulfillment.selected_option_id);
        if (opt) checkout.selected_fulfillment = body.fulfillment;
    }
    if (body.consent) checkout.consent = { ...body.consent, accepted_at: new Date().toISOString() };
    if (body.context) checkout.context = body.context;
    if (body.signals) checkout.signals = body.signals;

    checkout.totals = calculateTotals(checkout.line_items, checkout);
    if (checkout.line_items.length > 0 && checkout.payment.selected_instrument_id) checkout.status = "ready_for_complete";

    checkoutSessions.set(id, checkout);
    return jsonResponse(checkout);
}

async function handleCompleteCheckout(request, id) {
    const checkout = checkoutSessions.get(id);
    if (!checkout) return jsonResponse({ error: "Checkout not found" }, 404);
    if (checkout.status !== "ready_for_complete") return jsonResponse({ error: "Checkout not ready" }, 400);

    const body = await request.json();

    if (body.payment_data?.token === "fail_token") {
        checkout.payment.status = "failed";
        checkout.messages = [{ type: "error", code: "PAYMENT_FAILED", message: "Payment was declined" }];
        checkoutSessions.set(id, checkout);
        return jsonResponse(checkout, 400);
    }

    const order = {
        ucp: { version: UCP_VERSION, capabilities: [{ name: "dev.ucp.shopping.order", version: UCP_VERSION }] },
        id: `ORD-${generateId().slice(0, 8).toUpperCase()}`,
        checkout_id: id,
        status: "pending",
        line_items: checkout.line_items,
        totals: checkout.totals,
        buyer: checkout.buyer,
        discount: checkout.discount,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };

    if (checkout.selected_fulfillment) {
        const opt = fulfillmentOptions.find(o => o.id === checkout.selected_fulfillment.selected_option_id);
        if (opt) order.fulfillment = { ...checkout.selected_fulfillment, option: opt, tracking_number: `TRK-${generateId().slice(0, 8).toUpperCase()}` };
    }

    orders.set(order.id, order);

    checkout.status = "completed";
    checkout.payment.status = "captured";
    checkout.order = { id: order.id, created_at: order.created_at };
    checkoutSessions.set(id, checkout);
    return jsonResponse(checkout);
}

function handleCancelCheckout(id) {
    const checkout = checkoutSessions.get(id);
    if (!checkout) return jsonResponse({ error: "Checkout not found" }, 404);
    if (checkout.status === "completed") return jsonResponse({ error: "Cannot cancel completed checkout" }, 400);
    checkout.status = "canceled";
    checkout.messages = [...(checkout.messages || []), { type: "info", code: "CANCELED", message: "Checkout was canceled" }];
    checkoutSessions.set(id, checkout);
    return jsonResponse(checkout);
}

// Discount
async function handleApplyDiscount(request, id) {
    const checkout = checkoutSessions.get(id);
    if (!checkout) return jsonResponse({ error: "Checkout not found" }, 404);

    const body = await request.json();
    const dc = discountCodes[body.code?.toUpperCase()];
    if (!dc) return jsonResponse({ error: "Invalid discount code" }, 400);
    if (dc.min_order_amount && checkout.totals.subtotal < dc.min_order_amount) return jsonResponse({ error: "Minimum order not met" }, 400);

    let amount = 0;
    if (dc.type === "percentage") amount = Math.round(checkout.totals.subtotal * (dc.value / 100));
    else if (dc.type === "fixed") amount = Math.min(dc.value, checkout.totals.subtotal);

    checkout.discount = { code: dc.code, type: dc.type, description: dc.description, amount };
    checkout.totals = calculateTotals(checkout.line_items, checkout);
    checkoutSessions.set(id, checkout);
    return jsonResponse(checkout);
}

function handleRemoveDiscount(id) {
    const checkout = checkoutSessions.get(id);
    if (!checkout) return jsonResponse({ error: "Checkout not found" }, 404);
    checkout.discount = undefined;
    checkout.totals = calculateTotals(checkout.line_items, checkout);
    checkoutSessions.set(id, checkout);
    return jsonResponse(checkout);
}

// Orders
function handleListOrders() {
    const allOrders = [...orders.values()];
    return jsonResponse({
        ucp: { version: UCP_VERSION, capabilities: [{ name: "dev.ucp.shopping.order", version: UCP_VERSION }] },
        orders: allOrders, total_count: allOrders.length,
    });
}

function handleGetOrder(id) {
    const order = orders.get(id);
    return order ? jsonResponse(order) : jsonResponse({ error: "Order not found" }, 404);
}

// ============================================================================
// Main Router
// ============================================================================

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname;
        const method = request.method;

        if (method === "OPTIONS") return new Response(null, { headers: corsHeaders() });

        // Discovery
        if (path === "/.well-known/ucp" && method === "GET") return handleDiscovery(request);

        // Catalog
        if (path === "/api/catalog/search" && method === "POST") return handleCatalogSearch(request);
        const catalogItemMatch = path.match(/^\/api\/catalog\/items\/([^/]+)$/);
        if (catalogItemMatch && method === "GET") return handleCatalogLookup(catalogItemMatch[1]);

        // Cart
        if (path === "/api/shopping/cart" && method === "POST") return handleCreateCart(request);
        const cartMatch = path.match(/^\/api\/shopping\/cart\/([^/]+)$/);
        if (cartMatch) {
            if (method === "GET") return handleGetCart(cartMatch[1]);
            if (method === "PUT") return handleUpdateCart(request, cartMatch[1]);
            if (method === "DELETE") return handleDeleteCart(cartMatch[1]);
        }

        // Checkout
        if (path === "/api/shopping/checkout-sessions" && method === "POST") return handleCreateCheckout(request);

        // Products (legacy bonus endpoint)
        if (path === "/api/shopping/products" && method === "GET") return jsonResponse({ products });

        const checkoutMatch = path.match(/^\/api\/shopping\/checkout-sessions\/([^/]+)$/);
        if (checkoutMatch) {
            if (method === "GET") return handleGetCheckout(checkoutMatch[1]);
            if (method === "PUT") return handleUpdateCheckout(request, checkoutMatch[1]);
        }

        const completeMatch = path.match(/^\/api\/shopping\/checkout-sessions\/([^/]+)\/complete$/);
        if (completeMatch && method === "POST") return handleCompleteCheckout(request, completeMatch[1]);

        const cancelMatch = path.match(/^\/api\/shopping\/checkout-sessions\/([^/]+)\/cancel$/);
        if (cancelMatch && method === "POST") return handleCancelCheckout(cancelMatch[1]);

        const discountMatch = path.match(/^\/api\/shopping\/checkout-sessions\/([^/]+)\/discount$/);
        if (discountMatch) {
            if (method === "POST") return handleApplyDiscount(request, discountMatch[1]);
            if (method === "DELETE") return handleRemoveDiscount(discountMatch[1]);
        }

        // Orders
        if (path === "/api/shopping/orders" && method === "GET") return handleListOrders();
        const orderMatch = path.match(/^\/api\/shopping\/orders\/([^/]+)$/);
        if (orderMatch && method === "GET") return handleGetOrder(orderMatch[1]);

        // Health
        if (path === "/health") return jsonResponse({ status: "ok", protocol: "UCP", version: UCP_VERSION });

        return jsonResponse({ error: "Not found" }, 404);
    },
};
