/**
 * UCP Demo Client — Full End-to-End Flow
 * Aligned to UCP spec v2026-04-08
 *
 * This script demonstrates the complete UCP flow from a platform/agent
 * perspective, exercising all implemented capabilities:
 *
 * 1. DISCOVER  — Fetch /.well-known/ucp to understand merchant capabilities
 * 2. SEARCH    — Search the catalog for products
 * 3. CART      — Create a cart and add items
 * 4. CHECKOUT  — Create checkout from cart
 * 5. FULFILL   — Select a fulfillment option
 * 6. DISCOUNT  — Apply a promo code
 * 7. COMPLETE  — Submit payment and place the order
 * 8. ORDER     — Retrieve the completed order
 *
 * Run with: npm run client (while server is running)
 */

const BASE_URL = process.env.UCP_SERVER || "http://localhost:3000";

// ============================================================================
// Helper Functions
// ============================================================================

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    console.error("Request failed:", data);
    throw new Error(`HTTP ${response.status}: ${JSON.stringify(data)}`);
  }

  return data as T;
}

function formatCurrency(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

function printSection(title: string): void {
  console.log("\n" + "═".repeat(64));
  console.log(`  ${title}`);
  console.log("═".repeat(64));
}

function printSubsection(title: string): void {
  console.log(`\n  ── ${title} ──`);
}

// ============================================================================
// UCP Flow Implementation
// ============================================================================

async function main() {
  console.log(`
╔═══════════════════════════════════════════════════════════════════════╗
║                      UCP Demo Client v2026-04-08                    ║
║           Complete End-to-End Universal Commerce Protocol           ║
╚═══════════════════════════════════════════════════════════════════════╝
`);

  // ==========================================================================
  // Step 1: DISCOVERY
  // ==========================================================================

  printSection("Step 1: DISCOVERY — Fetch Merchant Capabilities");

  console.log(`\n  Fetching: ${BASE_URL}/.well-known/ucp`);

  const discovery = await fetchJson<{
    ucp: {
      version: string;
      services: Record<string, {
        rest?: { endpoint: string };
        capabilities: Array<{ name: string; version: string; config?: Record<string, unknown> }>;
      }>;
    };
    payment?: { handlers: Array<{ id: string; name: string; type: string }> };
    signing_keys?: Array<{ kid: string; kty: string }>;
  }>(`${BASE_URL}/.well-known/ucp`);

  console.log(`\n  UCP Version: ${discovery.ucp.version}`);

  // List all services and capabilities
  for (const [serviceId, service] of Object.entries(discovery.ucp.services)) {
    console.log(`\n  Service: ${serviceId}`);
    console.log(`    Endpoint: ${service.rest?.endpoint}`);
    console.log(`    Capabilities:`);
    service.capabilities.forEach((cap) => {
      console.log(`      • ${cap.name} (${cap.version})`);
    });
  }

  if (discovery.payment?.handlers) {
    console.log(`\n  Payment Handlers:`);
    discovery.payment.handlers.forEach((h) => {
      console.log(`    • ${h.name} [${h.type}] (${h.id})`);
    });
  }

  if (discovery.signing_keys) {
    console.log(`\n  Signing Keys: ${discovery.signing_keys.length} key(s)`);
  }

  const catalogEndpoint = discovery.ucp.services["dev.ucp.catalog"]?.rest?.endpoint || `${BASE_URL}/api/catalog`;
  const shoppingEndpoint = discovery.ucp.services["dev.ucp.shopping"]?.rest?.endpoint || `${BASE_URL}/api/shopping`;

  // ==========================================================================
  // Step 2: CATALOG SEARCH
  // ==========================================================================

  printSection("Step 2: CATALOG — Search for Products");

  const searchResults = await fetchJson<{
    items: Array<{
      id: string;
      name: string;
      description: string;
      price: { amount: number; currency: string };
      category?: string;
      availability: string;
    }>;
    total_count: number;
  }>(`${catalogEndpoint}/search`, {
    method: "POST",
    body: JSON.stringify({ query: "AI", page_size: 10 }),
  });

  console.log(`\n  Found ${searchResults.total_count} item(s) matching "AI":\n`);
  searchResults.items.forEach((item) => {
    const status = item.availability === "in_stock" ? "✓" : "✗";
    console.log(`  ${status} ${item.name} — ${formatCurrency(item.price.amount, item.price.currency)}`);
    console.log(`    ${item.description}`);
    console.log(`    Category: ${item.category || "—"} | ID: ${item.id}`);
  });

  // Look up a specific item
  printSubsection("Catalog Lookup");

  const itemDetail = await fetchJson<{
    item: { id: string; name: string; price: { amount: number; currency: string } };
  }>(`${catalogEndpoint}/items/neural-earbuds`);

  console.log(`  Looked up: ${itemDetail.item.name} — ${formatCurrency(itemDetail.item.price.amount, itemDetail.item.price.currency)}`);

  // ==========================================================================
  // Step 3: CART CREATION
  // ==========================================================================

  printSection("Step 3: CART — Create and Manage Cart");

  const cartPayload = {
    currency: "USD",
    items: [
      { item_id: "neural-earbuds", quantity: 1 },
      { item_id: "ai-voice-assistant", quantity: 2 },
    ],
  };

  console.log(`\n  Creating cart with:`);
  cartPayload.items.forEach((i) => console.log(`    • ${i.item_id} × ${i.quantity}`));

  const cart = await fetchJson<{
    id: string;
    items: Array<{ item: { name: string }; quantity: number; total_price: number }>;
    subtotal: number;
    currency: string;
  }>(`${shoppingEndpoint}/cart`, {
    method: "POST",
    body: JSON.stringify(cartPayload),
  });

  console.log(`\n  Cart ID: ${cart.id}`);
  cart.items.forEach((item) => {
    console.log(`    • ${item.item.name} × ${item.quantity} = ${formatCurrency(item.total_price, cart.currency)}`);
  });
  console.log(`    Subtotal: ${formatCurrency(cart.subtotal, cart.currency)}`);

  // ==========================================================================
  // Step 4: CREATE CHECKOUT (from cart)
  // ==========================================================================

  printSection("Step 4: CHECKOUT — Create Session from Cart");

  const checkoutPayload = {
    cart_id: cart.id,
    currency: "USD",
    payment: {
      instruments: [
        {
          id: "inst-1",
          handler_id: "mock-payment-handler",
          type: "token",
          display_name: "Test Card",
        },
      ],
    },
    context: {
      locale: "en-US",
      timezone: "America/Los_Angeles",
      platform_id: "ucp-demo-client",
    },
  };

  const checkout = await fetchJson<{
    id: string;
    status: string;
    line_items: Array<{ item: { name: string }; quantity: number; total_price: number }>;
    totals: { subtotal: number; tax: number; shipping: number; discount: number; total: number };
    currency: string;
    payment: { instruments: Array<{ id: string }> };
    fulfillment_options?: Array<{ id: string; name: string; price: number; type: string }>;
  }>(`${shoppingEndpoint}/checkout-sessions`, {
    method: "POST",
    body: JSON.stringify(checkoutPayload),
  });

  console.log(`\n  Checkout ID: ${checkout.id}`);
  console.log(`  Status: ${checkout.status}`);
  console.log(`\n  Line Items:`);
  checkout.line_items.forEach((item) => {
    console.log(`    • ${item.item.name} × ${item.quantity} = ${formatCurrency(item.total_price, checkout.currency)}`);
  });
  console.log(`\n  Totals:`);
  console.log(`    Subtotal: ${formatCurrency(checkout.totals.subtotal, checkout.currency)}`);
  console.log(`    Tax:      ${formatCurrency(checkout.totals.tax, checkout.currency)}`);
  console.log(`    Shipping: ${formatCurrency(checkout.totals.shipping, checkout.currency)}`);
  console.log(`    Total:    ${formatCurrency(checkout.totals.total, checkout.currency)}`);

  if (checkout.fulfillment_options) {
    console.log(`\n  Available Fulfillment Options:`);
    checkout.fulfillment_options.forEach((opt) => {
      console.log(`    • ${opt.name} [${opt.type}] — ${formatCurrency(opt.price, checkout.currency)}`);
    });
  }

  // ==========================================================================
  // Step 5: UPDATE — Buyer info, fulfillment, payment
  // ==========================================================================

  printSection("Step 5: UPDATE — Add Buyer, Select Fulfillment & Payment");

  const updatePayload = {
    buyer: {
      email: "agent@example.com",
      name: "AI Shopping Agent",
      phone: "+1-555-AGENT",
      address: {
        street_address: "123 AI Boulevard",
        locality: "San Francisco",
        region: "CA",
        postal_code: "94105",
        country_code: "US",
      },
    },
    fulfillment: {
      selected_option_id: "express-shipping",
      shipping_address: {
        street_address: "123 AI Boulevard",
        locality: "San Francisco",
        region: "CA",
        postal_code: "94105",
        country_code: "US",
      },
    },
    payment: {
      selected_instrument_id: checkout.payment.instruments[0].id,
    },
    consent: {
      terms_accepted: true,
      privacy_accepted: true,
      marketing_opt_in: false,
    },
    signals: {
      is_gift: false,
      priority: "express",
    },
  };

  const updated = await fetchJson<{
    status: string;
    buyer: { name: string; email: string };
    selected_fulfillment: { selected_option_id: string };
    totals: { subtotal: number; tax: number; shipping: number; discount: number; total: number };
    currency: string;
    consent: { terms_accepted: boolean; accepted_at: string };
  }>(`${shoppingEndpoint}/checkout-sessions/${checkout.id}`, {
    method: "PUT",
    body: JSON.stringify(updatePayload),
  });

  console.log(`\n  Status: ${updated.status}`);
  console.log(`  Buyer: ${updated.buyer.name} (${updated.buyer.email})`);
  console.log(`  Fulfillment: ${updated.selected_fulfillment.selected_option_id}`);
  console.log(`  Consent: terms_accepted=${updated.consent.terms_accepted} at ${updated.consent.accepted_at}`);
  console.log(`\n  Updated Totals (with express shipping):`);
  console.log(`    Subtotal: ${formatCurrency(updated.totals.subtotal, updated.currency)}`);
  console.log(`    Tax:      ${formatCurrency(updated.totals.tax, updated.currency)}`);
  console.log(`    Shipping: ${formatCurrency(updated.totals.shipping, updated.currency)}`);
  console.log(`    Total:    ${formatCurrency(updated.totals.total, updated.currency)}`);

  // ==========================================================================
  // Step 6: DISCOUNT — Apply promo code
  // ==========================================================================

  printSection("Step 6: DISCOUNT — Apply Promo Code");

  console.log(`\n  Applying code: SAVE10`);

  const discounted = await fetchJson<{
    discount: { code: string; description: string; amount: number };
    totals: { subtotal: number; tax: number; shipping: number; discount: number; total: number };
    currency: string;
  }>(`${shoppingEndpoint}/checkout-sessions/${checkout.id}/discount`, {
    method: "POST",
    body: JSON.stringify({ code: "SAVE10" }),
  });

  console.log(`  Applied: ${discounted.discount.description}`);
  console.log(`  Discount: -${formatCurrency(discounted.discount.amount, discounted.currency)}`);
  console.log(`\n  Updated Totals (with discount):`);
  console.log(`    Subtotal: ${formatCurrency(discounted.totals.subtotal, discounted.currency)}`);
  console.log(`    Tax:      ${formatCurrency(discounted.totals.tax, discounted.currency)}`);
  console.log(`    Shipping: ${formatCurrency(discounted.totals.shipping, discounted.currency)}`);
  console.log(`    Discount: -${formatCurrency(discounted.totals.discount, discounted.currency)}`);
  console.log(`    ─────────────────────`);
  console.log(`    TOTAL:    ${formatCurrency(discounted.totals.total, discounted.currency)}`);

  // ==========================================================================
  // Step 7: COMPLETE — Submit payment
  // ==========================================================================

  printSection("Step 7: COMPLETE — Place the Order");

  const completePayload = {
    payment_data: {
      handler_id: "mock-payment-handler",
      token: "success_token",
    },
  };

  const completed = await fetchJson<{
    status: string;
    payment: { status: string };
    order: { id: string; created_at: string };
    totals: { total: number };
    currency: string;
  }>(`${shoppingEndpoint}/checkout-sessions/${checkout.id}/complete`, {
    method: "POST",
    body: JSON.stringify(completePayload),
  });

  console.log(`\n  ✅ Order placed successfully!`);
  console.log(`  Checkout Status: ${completed.status}`);
  console.log(`  Payment Status:  ${completed.payment.status}`);
  console.log(`  Order ID:        ${completed.order.id}`);
  console.log(`  Created:         ${completed.order.created_at}`);
  console.log(`  Total Charged:   ${formatCurrency(completed.totals.total, completed.currency)}`);

  // ==========================================================================
  // Step 8: ORDER — Retrieve the order
  // ==========================================================================

  printSection("Step 8: ORDER — Retrieve Order Details");

  const order = await fetchJson<{
    id: string;
    status: string;
    line_items: Array<{ item: { name: string }; quantity: number; total_price: number }>;
    totals: { total: number };
    buyer?: { name: string };
    fulfillment?: { option: { name: string }; tracking_number?: string };
    discount?: { code: string; amount: number };
    created_at: string;
  }>(`${shoppingEndpoint}/orders/${completed.order.id}`);

  console.log(`\n  Order ID: ${order.id}`);
  console.log(`  Status: ${order.status}`);
  console.log(`  Buyer: ${order.buyer?.name || "—"}`);
  console.log(`  Items:`);
  order.line_items.forEach((item) => {
    console.log(`    • ${item.item.name} × ${item.quantity}`);
  });
  if (order.fulfillment) {
    console.log(`  Shipping: ${order.fulfillment.option.name}`);
    console.log(`  Tracking: ${order.fulfillment.tracking_number || "pending"}`);
  }
  if (order.discount) {
    console.log(`  Discount: ${order.discount.code}`);
  }

  // Also test order listing
  const orderList = await fetchJson<{
    orders: Array<{ id: string }>;
    total_count: number;
  }>(`${shoppingEndpoint}/orders`);

  console.log(`\n  Total Orders in System: ${orderList.total_count}`);

  // ==========================================================================
  // Summary
  // ==========================================================================

  printSection("SUMMARY — UCP Flow Complete");

  console.log(`
  The demo walked through the complete UCP v2026-04-08 flow:

  1. DISCOVERY
     • Fetched merchant capabilities from /.well-known/ucp
     • Discovered catalog, cart, checkout, order, + extensions

  2. CATALOG SEARCH
     • Searched catalog via POST /catalog/search
     • Looked up individual item via GET /catalog/items/:id

  3. CART
     • Created cart with 2 products (3 total items)

  4. CHECKOUT
     • Created checkout session from cart (cart_id)
     • Received fulfillment options and pricing

  5. UPDATE
     • Added buyer info and shipping address
     • Selected express shipping fulfillment
     • Selected payment instrument
     • Accepted buyer consent (terms, privacy)

  6. DISCOUNT
     • Applied "SAVE10" promo code (10% off)

  7. COMPLETE
     • Submitted payment token
     • Order created and confirmed

  8. ORDER
     • Retrieved order with tracking number
     • Listed all orders

  UCP Capabilities Demonstrated:
  ─────────────────────────────
  • dev.ucp.catalog (search, lookup)
  • dev.ucp.cart (CRUD)
  • dev.ucp.shopping.checkout (lifecycle)
  • dev.ucp.shopping.checkout.discount (apply/remove)
  • dev.ucp.shopping.checkout.fulfillment (options/selection)
  • dev.ucp.shopping.checkout.buyer_consent (terms/privacy)
  • dev.ucp.shopping.order (get/list)
`);

  console.log("  Learn more at https://ucp.dev  |  Spec: v2026-04-08\n");
}

// Run the demo
main().catch((error) => {
  console.error("\n[ERROR] Demo failed:", error.message);
  console.error("\nMake sure the server is running: npm run dev");
  process.exit(1);
});
