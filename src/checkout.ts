/**
 * UCP Checkout Service - Manages checkout sessions
 *
 * The checkout capability is the core of UCP commerce. It handles:
 * - Creating checkout sessions when items are added to cart
 * - Updating sessions (add/remove items, set payment, buyer info)
 * - Completing checkout (placing the order)
 * - Canceling checkout sessions
 *
 * Key UCP Checkout Concepts:
 *
 * 1. STATUS FLOW:
 *    incomplete -> ready_for_complete -> complete_in_progress -> completed
 *                                    \-> canceled
 *    If escalation needed: incomplete -> requires_escalation -> (human action) -> ready_for_complete
 *
 * 2. LINE ITEMS:
 *    - Platform provides item IDs (must match merchant's product catalog)
 *    - Merchant resolves IDs to full product details and pricing
 *
 * 3. PAYMENT:
 *    - Platform selects from available payment instruments
 *    - Each instrument is tied to a handler defined in discovery
 *
 * 4. TOTALS:
 *    - Merchant always calculates totals (subtotal, tax, shipping, discounts)
 *    - Platform trusts merchant's calculations
 */

import { Hono } from "hono";
import { v4 as uuidv4 } from "uuid";
import type {
  CheckoutCreateRequest,
  CheckoutUpdateRequest,
  CheckoutResponse,
  LineItemRequest,
  LineItemResponse,
  Totals,
  PaymentData,
  Order,
} from "./types.js";
import {
  getProduct,
  getAllProducts,
  getCheckout,
  saveCheckout,
  saveOrder,
} from "./data.js";

const UCP_VERSION = "2026-01-11";
const TAX_RATE = 0.0875; // 8.75% tax rate for demo
const CHECKOUT_TTL_HOURS = 6;

export const checkoutRouter = new Hono();

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Resolves line item requests to full line item responses.
 * The platform sends just item IDs; we look up full product details.
 */
function resolveLineItems(
  requests: LineItemRequest[],
  currency: string
): { items: LineItemResponse[]; errors: string[] } {
  const items: LineItemResponse[] = [];
  const errors: string[] = [];

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

    if (product.currency !== currency) {
      errors.push(`Currency mismatch for ${product.name}: expected ${currency}, got ${product.currency}`);
      continue;
    }

    items.push({
      id: uuidv4(), // Generate unique line item ID
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

/**
 * Calculates totals for a checkout session.
 * In a real implementation, this would include:
 * - Complex tax calculations (state, local, product-specific)
 * - Shipping cost estimation
 * - Discount/promotion application
 */
function calculateTotals(lineItems: LineItemResponse[]): Totals {
  const subtotal = lineItems.reduce((sum, item) => sum + item.total_price, 0);
  const tax = Math.round(subtotal * TAX_RATE);
  const shipping = subtotal >= 5000 ? 0 : 599; // Free shipping over $50
  const discount = 0; // No discounts in basic demo

  return {
    subtotal,
    tax,
    shipping,
    discount,
    total: subtotal + tax + shipping - discount,
  };
}

/**
 * Determines checkout status based on current state.
 */
function determineStatus(
  checkout: Partial<CheckoutResponse>
): CheckoutResponse["status"] {
  // Check if we have the minimum required data
  const hasItems = checkout.line_items && checkout.line_items.length > 0;
  const hasPayment = checkout.payment?.selected_instrument_id;

  if (!hasItems) {
    return "incomplete";
  }

  // In a real system, we might check if escalation is needed:
  // - Age verification required
  // - High-value order needs approval
  // - Address validation failed
  // For demo, we skip escalation

  if (!hasPayment) {
    return "incomplete";
  }

  return "ready_for_complete";
}

/**
 * Generates the expiration timestamp for a checkout session.
 */
function getExpiresAt(): string {
  const expires = new Date();
  expires.setHours(expires.getHours() + CHECKOUT_TTL_HOURS);
  return expires.toISOString();
}

// ============================================================================
// Checkout Endpoints
// ============================================================================

/**
 * POST /checkout-sessions
 *
 * Creates a new checkout session. This is called when a platform/agent
 * wants to start a purchase flow on behalf of a user.
 *
 * Required fields:
 * - line_items: Array of {item: {id}, quantity}
 * - currency: ISO 4217 code (e.g., "USD")
 * - payment: Payment instrument selection
 *
 * Optional fields:
 * - buyer: Customer information (email, name, phone)
 */
checkoutRouter.post("/checkout-sessions", async (c) => {
  const body = await c.req.json<CheckoutCreateRequest>();

  // Validate required fields
  if (!body.line_items || body.line_items.length === 0) {
    return c.json({ error: "line_items is required and cannot be empty" }, 400);
  }

  if (!body.currency) {
    return c.json({ error: "currency is required" }, 400);
  }

  // Resolve line items (look up products)
  const { items, errors } = resolveLineItems(body.line_items, body.currency);

  // Build the checkout response
  const checkout: CheckoutResponse = {
    ucp: {
      version: UCP_VERSION,
      capabilities: [
        { name: "dev.ucp.shopping.checkout", version: UCP_VERSION },
      ],
    },
    id: uuidv4(),
    status: "incomplete", // Will be updated below
    line_items: items,
    currency: body.currency,
    totals: calculateTotals(items),
    payment: {
      selected_instrument_id: body.payment?.selected_instrument_id,
      instruments: body.payment?.instruments || [
        // Provide default available payment instruments
        {
          id: "mock-instrument-1",
          handler_id: "mock-payment-handler",
          type: "token",
          display_name: "Test Payment",
        },
      ],
      status: "pending",
    },
    links: [
      // Required legal links
      { rel: "terms", href: "https://example.com/terms", title: "Terms of Service" },
      { rel: "privacy", href: "https://example.com/privacy", title: "Privacy Policy" },
      { rel: "refund", href: "https://example.com/refund", title: "Refund Policy" },
    ],
    buyer: body.buyer,
    messages: errors.length > 0
      ? errors.map((e) => ({ type: "error" as const, code: "ITEM_ERROR", message: e }))
      : undefined,
    expires_at: getExpiresAt(),
  };

  // Determine status based on completeness
  checkout.status = determineStatus(checkout);

  // Save to storage
  saveCheckout(checkout);

  // Return 201 Created with the checkout
  return c.json(checkout, 201);
});

/**
 * GET /checkout-sessions/:id
 *
 * Retrieves the current state of a checkout session.
 * Platforms call this to get updated pricing, status, etc.
 */
checkoutRouter.get("/checkout-sessions/:id", (c) => {
  const id = c.req.param("id");
  const checkout = getCheckout(id);

  if (!checkout) {
    return c.json({ error: "Checkout session not found" }, 404);
  }

  // Check if expired
  if (new Date(checkout.expires_at) < new Date()) {
    checkout.status = "canceled";
    checkout.messages = [
      ...(checkout.messages || []),
      { type: "error", code: "EXPIRED", message: "Checkout session has expired" },
    ];
    saveCheckout(checkout);
  }

  return c.json(checkout);
});

/**
 * PUT /checkout-sessions/:id
 *
 * Updates an existing checkout session. Used to:
 * - Add/remove/update line items
 * - Set payment instrument
 * - Add buyer information
 *
 * Note: Optional fields, if provided, replace existing data entirely.
 */
checkoutRouter.put("/checkout-sessions/:id", async (c) => {
  const id = c.req.param("id");
  const checkout = getCheckout(id);

  if (!checkout) {
    return c.json({ error: "Checkout session not found" }, 404);
  }

  if (checkout.status === "completed" || checkout.status === "canceled") {
    return c.json({ error: `Cannot update ${checkout.status} checkout` }, 400);
  }

  const body = await c.req.json<CheckoutUpdateRequest>();

  // Update line items if provided
  if (body.line_items) {
    const { items, errors } = resolveLineItems(body.line_items, checkout.currency);
    checkout.line_items = items;
    checkout.totals = calculateTotals(items);

    if (errors.length > 0) {
      checkout.messages = errors.map((e) => ({
        type: "error" as const,
        code: "ITEM_ERROR",
        message: e,
      }));
    }
  }

  // Update payment if provided
  if (body.payment) {
    checkout.payment = {
      ...checkout.payment,
      selected_instrument_id: body.payment.selected_instrument_id,
      instruments: body.payment.instruments || checkout.payment.instruments,
    };
  }

  // Update buyer if provided
  if (body.buyer) {
    checkout.buyer = body.buyer;
  }

  // Recalculate status
  checkout.status = determineStatus(checkout);
  checkout.expires_at = getExpiresAt(); // Extend TTL on update

  saveCheckout(checkout);

  return c.json(checkout);
});

/**
 * POST /checkout-sessions/:id/complete
 *
 * Completes the checkout and places the order.
 * This is the final step in the checkout flow.
 *
 * Required: Payment data with selected instrument
 *
 * The response will have status "completed" and include
 * an order confirmation.
 */
checkoutRouter.post("/checkout-sessions/:id/complete", async (c) => {
  const id = c.req.param("id");
  const checkout = getCheckout(id);

  if (!checkout) {
    return c.json({ error: "Checkout session not found" }, 404);
  }

  if (checkout.status === "completed") {
    return c.json({ error: "Checkout already completed" }, 400);
  }

  if (checkout.status === "canceled") {
    return c.json({ error: "Cannot complete canceled checkout" }, 400);
  }

  if (checkout.status !== "ready_for_complete") {
    return c.json({
      error: "Checkout not ready for completion",
      current_status: checkout.status,
      hint: "Ensure all required fields are set (line_items, payment selection)",
    }, 400);
  }

  // Get payment data from request body
  const body = await c.req.json<PaymentData>();

  // Validate payment data
  if (!body.payment_data?.handler_id) {
    return c.json({ error: "payment_data.handler_id is required" }, 400);
  }

  // Simulate payment processing
  checkout.status = "complete_in_progress";
  saveCheckout(checkout);

  // In a real system, we'd:
  // 1. Call the payment gateway
  // 2. Wait for confirmation
  // 3. Create the order in our system
  // 4. Potentially trigger webhooks

  // Simulate success/failure based on mock token
  const token = body.payment_data.token;
  if (token === "fail_token") {
    checkout.status = "ready_for_complete"; // Revert
    checkout.payment.status = "failed";
    checkout.messages = [
      { type: "error", code: "PAYMENT_FAILED", message: "Payment was declined" },
    ];
    saveCheckout(checkout);
    return c.json(checkout, 400);
  }

  // Success - create order
  const order: Order = {
    id: `ORD-${uuidv4().slice(0, 8).toUpperCase()}`,
    checkout_id: checkout.id,
    status: "pending",
    line_items: checkout.line_items,
    totals: checkout.totals,
    buyer: checkout.buyer,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  saveOrder(order);

  // Update checkout
  checkout.status = "completed";
  checkout.payment.status = "captured";
  checkout.order = {
    id: order.id,
    created_at: order.created_at,
  };

  saveCheckout(checkout);

  return c.json(checkout);
});

/**
 * POST /checkout-sessions/:id/cancel
 *
 * Cancels a checkout session. This releases any holds
 * and prevents further modifications.
 */
checkoutRouter.post("/checkout-sessions/:id/cancel", (c) => {
  const id = c.req.param("id");
  const checkout = getCheckout(id);

  if (!checkout) {
    return c.json({ error: "Checkout session not found" }, 404);
  }

  if (checkout.status === "completed") {
    return c.json({ error: "Cannot cancel completed checkout" }, 400);
  }

  if (checkout.status === "canceled") {
    return c.json(checkout); // Already canceled, return current state
  }

  checkout.status = "canceled";
  checkout.messages = [
    ...(checkout.messages || []),
    { type: "info", code: "CANCELED", message: "Checkout was canceled" },
  ];

  saveCheckout(checkout);

  return c.json(checkout);
});

// ============================================================================
// Products Endpoint (bonus - not part of core UCP but helpful for demos)
// ============================================================================

checkoutRouter.get("/products", (c) => {
  return c.json({ products: getAllProducts() });
});
