/**
 * UCP Demo API - Cloudflare Worker
 * 
 * Handles all UCP API endpoints for the demo.
 */

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
        image_url: "https://images.unsplash.com/photo-1543512214-318c7553f230?w=200&h=200&fit=crop",
        in_stock: true,
    },
    {
        id: "neural-earbuds",
        name: "Neural Earbuds Pro",
        description: "Wireless earbuds with real-time AI translation in 40+ languages",
        price: 14999,
        currency: "USD",
        image_url: "https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=200&h=200&fit=crop",
        in_stock: true,
    },
    {
        id: "smart-glasses",
        name: "AI Smart Glasses",
        description: "AR glasses with integrated AI assistant and heads-up display",
        price: 29999,
        currency: "USD",
        image_url: "https://images.unsplash.com/photo-1574944985070-8f3ebc6b79d2?w=200&h=200&fit=crop",
        in_stock: true,
    },
    {
        id: "robot-companion",
        name: "Robot Companion",
        description: "Desktop AI robot for productivity, scheduling, and companionship",
        price: 19999,
        currency: "USD",
        image_url: "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=200&h=200&fit=crop",
        in_stock: true,
    },
    {
        id: "brain-band",
        name: "Brain Band",
        description: "EEG headband for AI-powered focus, meditation, and sleep tracking",
        price: 12999,
        currency: "USD",
        image_url: "https://images.unsplash.com/photo-1589254065878-42c9da997008?w=200&h=200&fit=crop",
        in_stock: false,
    },
];

// ============================================================================
// In-Memory Storage
// ============================================================================

const checkoutSessions = new Map();
const orders = new Map();

// ============================================================================
// Helper Functions
// ============================================================================

function getProduct(id) {
    return products.find(p => p.id === id);
}

function generateId() {
    return crypto.randomUUID();
}

function corsHeaders() {
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Content-Type": "application/json",
    };
}

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: corsHeaders(),
    });
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
        if (!product) {
            errors.push(`Product not found: ${req.item.id}`);
            continue;
        }
        if (!product.in_stock) {
            errors.push(`Product out of stock: ${product.name}`);
            continue;
        }
        items.push({
            id: generateId(),
            item: {
                id: product.id,
                name: product.name,
                description: product.description,
                image_url: product.image_url,
            },
            quantity: req.quantity,
            unit_price: product.price,
            total_price: product.price * req.quantity,
        });
    }
    return { items, errors };
}

function calculateTotals(lineItems) {
    const subtotal = lineItems.reduce((sum, item) => sum + item.total_price, 0);
    const tax = Math.round(subtotal * TAX_RATE);
    const shipping = subtotal >= 5000 ? 0 : 599;
    return {
        subtotal,
        tax,
        shipping,
        discount: 0,
        total: subtotal + tax + shipping,
    };
}

// ============================================================================
// Route Handlers
// ============================================================================

async function handleDiscovery(request) {
    const url = new URL(request.url);
    const baseUrl = url.origin;

    return jsonResponse({
        ucp: {
            version: "2026-01-11",
            services: {
                "dev.ucp.shopping": {
                    version: "2026-01-11",
                    rest: { endpoint: `${baseUrl}/api/shopping` },
                    capabilities: [
                        { name: "dev.ucp.shopping.checkout", version: "2026-01-11" },
                        { name: "dev.ucp.shopping.order", version: "2026-01-11" },
                    ],
                },
            },
        },
        payment: {
            handlers: [
                { id: "mock-payment-handler", name: "Mock Payment", type: "first_party" },
                { id: "card-handler", name: "Credit/Debit Card", type: "third_party" },
            ],
        },
    });
}

async function handleProducts(request) {
    return jsonResponse({ products });
}

async function handleCreateCheckout(request) {
    const body = await request.json();

    if (!body.line_items || body.line_items.length === 0) {
        return jsonResponse({ error: "line_items is required" }, 400);
    }

    const { items, errors } = resolveLineItems(body.line_items, body.currency || "USD");

    const checkout = {
        ucp: { version: "2026-01-11", capabilities: [{ name: "dev.ucp.shopping.checkout" }] },
        id: generateId(),
        status: items.length > 0 ? "incomplete" : "incomplete",
        line_items: items,
        currency: body.currency || "USD",
        totals: calculateTotals(items),
        payment: {
            selected_instrument_id: body.payment?.selected_instrument_id,
            instruments: [
                { id: "inst-mock", handler_id: "mock-payment-handler", type: "token", display_name: "Test Payment" },
                { id: "inst-card", handler_id: "card-handler", type: "card", display_name: "Credit Card" },
            ],
            status: "pending",
        },
        buyer: body.buyer,
        messages: errors.length > 0 ? errors.map(e => ({ type: "error", message: e })) : undefined,
        expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
    };

    if (items.length > 0 && checkout.payment.selected_instrument_id) {
        checkout.status = "ready_for_complete";
    }

    checkoutSessions.set(checkout.id, checkout);
    return jsonResponse(checkout, 201);
}

async function handleGetCheckout(request, id) {
    const checkout = checkoutSessions.get(id);
    if (!checkout) {
        return jsonResponse({ error: "Checkout not found" }, 404);
    }
    return jsonResponse(checkout);
}

async function handleUpdateCheckout(request, id) {
    const checkout = checkoutSessions.get(id);
    if (!checkout) {
        return jsonResponse({ error: "Checkout not found" }, 404);
    }

    const body = await request.json();

    if (body.line_items) {
        const { items } = resolveLineItems(body.line_items, checkout.currency);
        checkout.line_items = items;
        checkout.totals = calculateTotals(items);
    }

    if (body.payment) {
        checkout.payment.selected_instrument_id = body.payment.selected_instrument_id;
    }

    if (body.buyer) {
        checkout.buyer = body.buyer;
    }

    if (checkout.line_items.length > 0 && checkout.payment.selected_instrument_id) {
        checkout.status = "ready_for_complete";
    }

    checkoutSessions.set(id, checkout);
    return jsonResponse(checkout);
}

async function handleCompleteCheckout(request, id) {
    const checkout = checkoutSessions.get(id);
    if (!checkout) {
        return jsonResponse({ error: "Checkout not found" }, 404);
    }

    if (checkout.status !== "ready_for_complete") {
        return jsonResponse({ error: "Checkout not ready" }, 400);
    }

    const body = await request.json();

    if (body.payment_data?.token === "fail_token") {
        checkout.payment.status = "failed";
        return jsonResponse(checkout, 400);
    }

    const order = {
        id: `ORD-${generateId().slice(0, 8).toUpperCase()}`,
        checkout_id: id,
        status: "pending",
        created_at: new Date().toISOString(),
    };

    orders.set(order.id, order);

    checkout.status = "completed";
    checkout.payment.status = "captured";
    checkout.order = { id: order.id, created_at: order.created_at };

    checkoutSessions.set(id, checkout);
    return jsonResponse(checkout);
}

// ============================================================================
// Main Router
// ============================================================================

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname;
        const method = request.method;

        // Handle CORS preflight
        if (method === "OPTIONS") {
            return new Response(null, { headers: corsHeaders() });
        }

        // Routes
        if (path === "/.well-known/ucp" && method === "GET") {
            return handleDiscovery(request);
        }

        if (path === "/api/shopping/products" && method === "GET") {
            return handleProducts(request);
        }

        if (path === "/api/shopping/checkout-sessions" && method === "POST") {
            return handleCreateCheckout(request);
        }

        const checkoutMatch = path.match(/^\/api\/shopping\/checkout-sessions\/([^/]+)$/);
        if (checkoutMatch) {
            const id = checkoutMatch[1];
            if (method === "GET") return handleGetCheckout(request, id);
            if (method === "PUT") return handleUpdateCheckout(request, id);
        }

        const completeMatch = path.match(/^\/api\/shopping\/checkout-sessions\/([^/]+)\/complete$/);
        if (completeMatch && method === "POST") {
            return handleCompleteCheckout(request, completeMatch[1]);
        }

        // Health check
        if (path === "/health") {
            return jsonResponse({ status: "ok", protocol: "UCP" });
        }

        return jsonResponse({ error: "Not found" }, 404);
    },
};
