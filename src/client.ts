/**
 * UCP Demo Client
 *
 * This script demonstrates the complete UCP checkout flow from a
 * platform/agent perspective. It shows how an AI agent or application
 * would interact with a UCP-compliant merchant.
 *
 * The flow:
 * 1. DISCOVER - Fetch /.well-known/ucp to understand merchant capabilities
 * 2. CREATE   - Create a checkout session with items
 * 3. UPDATE   - Add buyer information, select payment
 * 4. COMPLETE - Submit payment and place the order
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
  console.log("\n" + "=".repeat(60));
  console.log(`  ${title}`);
  console.log("=".repeat(60));
}

function printJson(label: string, data: unknown): void {
  console.log(`\n${label}:`);
  console.log(JSON.stringify(data, null, 2));
}

// ============================================================================
// UCP Flow Implementation
// ============================================================================

async function main() {
  console.log(`
╔════════════════════════════════════════════════════════════════════╗
║                     UCP Demo Client                                ║
║          Demonstrating the Universal Commerce Protocol             ║
╚════════════════════════════════════════════════════════════════════╝
`);

  // ==========================================================================
  // Step 1: DISCOVERY
  // ==========================================================================
  // First, discover what the merchant supports. This is always the first step
  // for any platform/agent interacting with a UCP merchant.

  printSection("Step 1: DISCOVERY - Fetch Merchant Capabilities");

  console.log(`\nFetching: ${BASE_URL}/.well-known/ucp`);

  const discovery = await fetchJson<{
    ucp: {
      version: string;
      services: Record<string, { rest?: { endpoint: string }; capabilities: Array<{ name: string }> }>;
    };
    payment?: { handlers: Array<{ id: string; name: string }> };
  }>(`${BASE_URL}/.well-known/ucp`);

  console.log("\n[Discovery Profile Received]");
  console.log(`  UCP Version: ${discovery.ucp.version}`);

  // Check what services and capabilities are available
  const shoppingService = discovery.ucp.services["dev.ucp.shopping"];
  if (shoppingService) {
    console.log(`  Shopping Service Endpoint: ${shoppingService.rest?.endpoint}`);
    console.log("  Capabilities:");
    shoppingService.capabilities.forEach((cap) => {
      console.log(`    - ${cap.name}`);
    });
  }

  // Check payment handlers
  if (discovery.payment?.handlers) {
    console.log("  Payment Handlers:");
    discovery.payment.handlers.forEach((h) => {
      console.log(`    - ${h.name} (${h.id})`);
    });
  }

  const checkoutEndpoint = shoppingService?.rest?.endpoint || `${BASE_URL}/api/shopping`;

  // ==========================================================================
  // Step 2: VIEW PRODUCTS (optional - not part of core UCP)
  // ==========================================================================

  printSection("Step 2: VIEW PRODUCTS (bonus endpoint)");

  const productsResponse = await fetchJson<{
    products: Array<{ id: string; name: string; price: number; currency: string; in_stock: boolean }>;
  }>(`${checkoutEndpoint}/products`);

  console.log("\n[Available Products]");
  productsResponse.products.forEach((p) => {
    const status = p.in_stock ? "In Stock" : "OUT OF STOCK";
    console.log(`  ${p.name} - ${formatCurrency(p.price, p.currency)} [${status}]`);
    console.log(`    ID: ${p.id}`);
  });

  // ==========================================================================
  // Step 3: CREATE CHECKOUT SESSION
  // ==========================================================================
  // Create a new checkout with items. The merchant will resolve item IDs
  // to full product details and calculate totals.

  printSection("Step 3: CREATE CHECKOUT - Add items to cart");

  const createPayload = {
    line_items: [
      { item: { id: "rose-bouquet" }, quantity: 2 },
      { item: { id: "tulip-arrangement" }, quantity: 1 },
    ],
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
  };

  console.log("\n[Request] Creating checkout with:");
  createPayload.line_items.forEach((item) => {
    console.log(`  - ${item.item.id} x ${item.quantity}`);
  });

  const checkout = await fetchJson<{
    id: string;
    status: string;
    line_items: Array<{ item: { name: string }; quantity: number; total_price: number }>;
    totals: { subtotal: number; tax: number; shipping: number; total: number };
    currency: string;
    payment: { instruments: Array<{ id: string }> };
  }>(`${checkoutEndpoint}/checkout-sessions`, {
    method: "POST",
    body: JSON.stringify(createPayload),
  });

  console.log("\n[Response] Checkout created:");
  console.log(`  Checkout ID: ${checkout.id}`);
  console.log(`  Status: ${checkout.status}`);
  console.log("\n  Line Items:");
  checkout.line_items.forEach((item) => {
    console.log(`    - ${item.item.name} x ${item.quantity} = ${formatCurrency(item.total_price, checkout.currency)}`);
  });
  console.log("\n  Totals:");
  console.log(`    Subtotal: ${formatCurrency(checkout.totals.subtotal, checkout.currency)}`);
  console.log(`    Tax:      ${formatCurrency(checkout.totals.tax, checkout.currency)}`);
  console.log(`    Shipping: ${formatCurrency(checkout.totals.shipping, checkout.currency)}`);
  console.log(`    ---------------------------------`);
  console.log(`    TOTAL:    ${formatCurrency(checkout.totals.total, checkout.currency)}`);

  // ==========================================================================
  // Step 4: UPDATE CHECKOUT - Add buyer info and select payment
  // ==========================================================================

  printSection("Step 4: UPDATE CHECKOUT - Add buyer & select payment");

  const updatePayload = {
    buyer: {
      email: "john.doe@example.com",
      name: "John Doe",
      phone: "+1-555-123-4567",
    },
    payment: {
      selected_instrument_id: checkout.payment.instruments[0].id,
    },
  };

  console.log("\n[Request] Updating with buyer info and payment selection");

  const updatedCheckout = await fetchJson<{
    id: string;
    status: string;
    buyer: { email: string; name: string };
    payment: { selected_instrument_id: string; status: string };
  }>(`${checkoutEndpoint}/checkout-sessions/${checkout.id}`, {
    method: "PUT",
    body: JSON.stringify(updatePayload),
  });

  console.log("\n[Response] Checkout updated:");
  console.log(`  Status: ${updatedCheckout.status}`);
  console.log(`  Buyer: ${updatedCheckout.buyer.name} (${updatedCheckout.buyer.email})`);
  console.log(`  Selected Payment: ${updatedCheckout.payment.selected_instrument_id}`);

  // ==========================================================================
  // Step 5: COMPLETE CHECKOUT - Submit payment and place order
  // ==========================================================================

  printSection("Step 5: COMPLETE CHECKOUT - Place the order");

  const completePayload = {
    payment_data: {
      handler_id: "mock-payment-handler",
      token: "success_token", // Use "fail_token" to simulate failure
    },
  };

  console.log("\n[Request] Completing checkout with payment data");

  const completedCheckout = await fetchJson<{
    id: string;
    status: string;
    payment: { status: string };
    order: { id: string; created_at: string };
    totals: { total: number };
    currency: string;
  }>(`${checkoutEndpoint}/checkout-sessions/${checkout.id}/complete`, {
    method: "POST",
    body: JSON.stringify(completePayload),
  });

  console.log("\n[Response] Order placed successfully!");
  console.log(`  Checkout Status: ${completedCheckout.status}`);
  console.log(`  Payment Status: ${completedCheckout.payment.status}`);
  console.log(`  Order ID: ${completedCheckout.order.id}`);
  console.log(`  Order Created: ${completedCheckout.order.created_at}`);
  console.log(`  Total Charged: ${formatCurrency(completedCheckout.totals.total, completedCheckout.currency)}`);

  // ==========================================================================
  // Summary
  // ==========================================================================

  printSection("SUMMARY - UCP Flow Complete");

  console.log(`
The demo walked through the complete UCP checkout flow:

1. DISCOVERY
   - Fetched merchant capabilities from /.well-known/ucp
   - Discovered supported services, capabilities, and payment handlers

2. CREATE CHECKOUT
   - Created a checkout session with line items
   - Merchant resolved product IDs and calculated totals

3. UPDATE CHECKOUT
   - Added buyer information
   - Selected a payment instrument
   - Status changed to "ready_for_complete"

4. COMPLETE CHECKOUT
   - Submitted payment data
   - Order was created and confirmed
   - Status changed to "completed"

Key UCP Concepts Demonstrated:
- Capability-based discovery
- Merchant-controlled pricing and totals
- Standardized checkout status flow
- Payment handler abstraction
`);

  console.log("Thanks for exploring UCP! Learn more at https://ucp.dev\n");
}

// Run the demo
main().catch((error) => {
  console.error("\n[ERROR] Demo failed:", error.message);
  console.error("\nMake sure the server is running: npm run dev");
  process.exit(1);
});
