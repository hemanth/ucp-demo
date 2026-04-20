/**
 * UCP Checkout Service - Manages checkout sessions
 * Aligned to UCP spec v2026-04-08
 *
 * The checkout capability is the core of UCP commerce. It handles:
 * - Creating checkout sessions when items are added to cart
 * - Updating sessions (add/remove items, set payment, buyer info)
 * - Completing checkout (placing the order)
 * - Canceling checkout sessions
 *
 * Extensions:
 * - Fulfillment: Shipping options, address handling
 * - Discount: Promotional code application
 * - Buyer Consent: Terms and privacy acceptance
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
import { UCP_VERSION } from "./types.js";
import type {
  CheckoutCreateRequest,
  CheckoutUpdateRequest,
  CheckoutResponse,
  LineItemRequest,
  LineItemResponse,
  Totals,
  PaymentData,
  Order,
  AppliedDiscount,
} from "./types.js";
import {
  getProduct,
  getAllProducts,
  getCheckout,
  saveCheckout,
  saveOrder,
  getCart,
  getDiscountCode,
  getFulfillmentOptions,
  getFulfillmentOption,
} from "./data.js";

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
 * Accounts for tax, shipping (from fulfillment), and discounts.
 */
function calculateTotals(
  lineItems: LineItemResponse[],
  checkout?: Partial<CheckoutResponse>
): Totals {
  const subtotal = lineItems.reduce((sum, item) => sum + item.total_price, 0);
  const tax = Math.round(subtotal * TAX_RATE);

  // Shipping from fulfillment selection
  let shipping = 0;
  if (checkout?.selected_fulfillment?.selected_option_id) {
    const option = getFulfillmentOption(checkout.selected_fulfillment.selected_option_id);
    if (option) {
      shipping = option.price;
    }
  } else {
    // Default: standard shipping (free over $100)
    shipping = subtotal >= 10000 ? 0 : 599;
  }

  // Discount
  let discount = 0;
  if (checkout?.discount) {
    discount = checkout.discount.amount;
    // Free shipping discount overrides shipping cost
    if (checkout.discount.type === "free_shipping") {
      shipping = 0;
    }
  }

  return {
    subtotal,
    tax,
    shipping,
    discount,
    total: subtotal + tax + shipping - discount,
  };
}

/**
 * Calculates the discount amount for an applied code against current totals.
 */
function calculateDiscountAmount(
  code: { type: string; value: number },
  subtotal: number
): number {
  switch (code.type) {
    case "percentage":
      return Math.round(subtotal * (code.value / 100));
    case "fixed":
      return Math.min(code.value, subtotal);
    case "free_shipping":
      return 0; // Handled in totals calculation
    default:
      return 0;
  }
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

/**
 * Returns the default capabilities array for checkout responses.
 */
function getCheckoutCapabilities(checkout?: Partial<CheckoutResponse>) {
  const caps = [
    { name: "dev.ucp.shopping.checkout", version: UCP_VERSION },
  ];
  if (checkout?.discount) {
    caps.push({ name: "dev.ucp.shopping.checkout.discount", version: UCP_VERSION });
  }
  if (checkout?.fulfillment_options || checkout?.selected_fulfillment) {
    caps.push({ name: "dev.ucp.shopping.checkout.fulfillment", version: UCP_VERSION });
  }
  if (checkout?.consent) {
    caps.push({ name: "dev.ucp.shopping.checkout.buyer_consent", version: UCP_VERSION });
  }
  return caps;
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
 * Can also create from an existing cart via `cart_id`.
 */
checkoutRouter.post("/checkout-sessions", async (c) => {
  const body = await c.req.json<CheckoutCreateRequest>();

  // If creating from a cart, pull items from there
  let lineItemRequests = body.line_items || [];
  let currency = body.currency;

  if (body.cart_id) {
    const cart = getCart(body.cart_id);
    if (!cart) {
      return c.json({ error: "Cart not found" }, 404);
    }
    lineItemRequests = cart.items.map((i) => ({
      item: { id: i.item.id },
      quantity: i.quantity,
    }));
    currency = cart.currency;
  }

  // Validate required fields
  if (!lineItemRequests || lineItemRequests.length === 0) {
    return c.json({ error: "line_items is required and cannot be empty" }, 400);
  }

  if (!currency) {
    return c.json({ error: "currency is required" }, 400);
  }

  // Resolve line items (look up products)
  const { items, errors } = resolveLineItems(lineItemRequests, currency);

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
    currency,
    totals: { subtotal: 0, tax: 0, shipping: 0, discount: 0, total: 0 }, // Calculated below
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
    // Include fulfillment options
    fulfillment_options: getFulfillmentOptions(),
    // Include context/signals if provided
    context: body.context,
    signals: body.signals,
  };

  // Calculate totals (after all state is set)
  checkout.totals = calculateTotals(items, checkout);

  // Determine status based on completeness
  checkout.status = determineStatus(checkout);

  // Update capabilities
  checkout.ucp.capabilities = getCheckoutCapabilities(checkout);

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
 * - Select fulfillment option
 * - Add buyer consent
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
    checkout.buyer = { ...checkout.buyer, ...body.buyer };
  }

  // Update fulfillment selection if provided
  if (body.fulfillment) {
    const option = getFulfillmentOption(body.fulfillment.selected_option_id);
    if (!option) {
      return c.json({ error: "Invalid fulfillment option" }, 400);
    }
    checkout.selected_fulfillment = body.fulfillment;
  }

  // Update buyer consent if provided
  if (body.consent) {
    checkout.consent = {
      ...body.consent,
      accepted_at: new Date().toISOString(),
    };
  }

  // Update context/signals if provided
  if (body.context) checkout.context = body.context;
  if (body.signals) checkout.signals = body.signals;

  // Recalculate totals (shipping may change with fulfillment)
  checkout.totals = calculateTotals(checkout.line_items, checkout);

  // Recalculate status
  checkout.status = determineStatus(checkout);
  checkout.expires_at = getExpiresAt(); // Extend TTL on update
  checkout.ucp.capabilities = getCheckoutCapabilities(checkout);

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
    ucp: {
      version: UCP_VERSION,
      capabilities: [
        { name: "dev.ucp.shopping.order", version: UCP_VERSION },
      ],
    },
    id: `ORD-${uuidv4().slice(0, 8).toUpperCase()}`,
    checkout_id: checkout.id,
    status: "pending",
    line_items: checkout.line_items,
    totals: checkout.totals,
    buyer: checkout.buyer,
    discount: checkout.discount,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // Include fulfillment in order if selected
  if (checkout.selected_fulfillment) {
    const option = getFulfillmentOption(checkout.selected_fulfillment.selected_option_id);
    if (option) {
      order.fulfillment = {
        ...checkout.selected_fulfillment,
        option,
        tracking_number: `TRK-${uuidv4().slice(0, 8).toUpperCase()}`,
      };
    }
  }

  saveOrder(order);

  // Update checkout
  checkout.status = "completed";
  checkout.payment.status = "captured";
  checkout.order = {
    id: order.id,
    created_at: order.created_at,
  };

  checkout.ucp.capabilities = getCheckoutCapabilities(checkout);
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
// Discount Extension Endpoints
// ============================================================================

/**
 * POST /checkout-sessions/:id/discount
 *
 * Apply a discount code to the checkout session.
 */
checkoutRouter.post("/checkout-sessions/:id/discount", async (c) => {
  const id = c.req.param("id");
  const checkout = getCheckout(id);

  if (!checkout) {
    return c.json({ error: "Checkout session not found" }, 404);
  }

  if (checkout.status === "completed" || checkout.status === "canceled") {
    return c.json({ error: `Cannot modify ${checkout.status} checkout` }, 400);
  }

  const body = await c.req.json<{ code: string }>();

  if (!body.code) {
    return c.json({ error: "code is required" }, 400);
  }

  const discountCode = getDiscountCode(body.code);

  if (!discountCode) {
    return c.json({
      error: "Invalid discount code",
      code: "INVALID_DISCOUNT",
    }, 400);
  }

  // Check minimum order amount
  if (discountCode.min_order_amount && checkout.totals.subtotal < discountCode.min_order_amount) {
    return c.json({
      error: `Minimum order of $${(discountCode.min_order_amount / 100).toFixed(2)} required for this code`,
      code: "MIN_ORDER_NOT_MET",
    }, 400);
  }

  const amount = calculateDiscountAmount(discountCode, checkout.totals.subtotal);

  checkout.discount = {
    code: discountCode.code,
    type: discountCode.type,
    description: discountCode.description,
    amount,
  };

  // Recalculate totals with discount
  checkout.totals = calculateTotals(checkout.line_items, checkout);
  checkout.ucp.capabilities = getCheckoutCapabilities(checkout);

  saveCheckout(checkout);

  return c.json(checkout);
});

/**
 * DELETE /checkout-sessions/:id/discount
 *
 * Remove the applied discount from the checkout session.
 */
checkoutRouter.delete("/checkout-sessions/:id/discount", (c) => {
  const id = c.req.param("id");
  const checkout = getCheckout(id);

  if (!checkout) {
    return c.json({ error: "Checkout session not found" }, 404);
  }

  if (checkout.status === "completed" || checkout.status === "canceled") {
    return c.json({ error: `Cannot modify ${checkout.status} checkout` }, 400);
  }

  checkout.discount = undefined;

  // Recalculate totals without discount
  checkout.totals = calculateTotals(checkout.line_items, checkout);
  checkout.ucp.capabilities = getCheckoutCapabilities(checkout);

  saveCheckout(checkout);

  return c.json(checkout);
});

// ============================================================================
// Products Endpoint (bonus - not part of core UCP but helpful for demos)
// ============================================================================

checkoutRouter.get("/products", (c) => {
  return c.json({ products: getAllProducts() });
});
