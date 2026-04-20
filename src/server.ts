/**
 * UCP Demo Merchant Server
 * Aligned to UCP spec v2026-04-08
 *
 * This is a comprehensive implementation of a UCP-compliant merchant server.
 * It demonstrates the core concepts of the Universal Commerce Protocol:
 *
 * 1. DISCOVERY (/.well-known/ucp)
 *    - Exposes merchant capabilities (catalog, cart, checkout, order)
 *    - Lists available payment handlers
 *    - Provides API endpoints and signing keys
 *
 * 2. CATALOG (/api/catalog)
 *    - Search products
 *    - Look up individual items
 *
 * 3. CART (/api/shopping/cart)
 *    - Create, read, update, delete carts
 *
 * 4. CHECKOUT (/api/shopping/checkout-sessions)
 *    - Create, read, update checkout sessions
 *    - Complete checkout (place order)
 *    - Cancel checkout
 *    - Discount extension (apply/remove promo codes)
 *
 * 5. ORDERS (/api/shopping/orders)
 *    - Get order by ID
 *    - List all orders
 *
 * Run with: npm run dev
 * Test with: npm run client
 */

import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import { UCP_VERSION } from "./types.js";
import { discoveryRouter } from "./discovery.js";
import { catalogRouter } from "./catalog.js";
import { cartRouter } from "./cart.js";
import { checkoutRouter } from "./checkout.js";
import { orderRouter } from "./order.js";

const app = new Hono();

// ============================================================================
// Middleware
// ============================================================================

// Request logging
app.use("*", logger());

// CORS for browser/agent access
app.use("*", cors());

// ============================================================================
// Routes
// ============================================================================

// UCP Discovery endpoint - THE entry point for any platform
// Platforms/agents will first hit this to understand what we support
app.route("/.well-known/ucp", discoveryRouter);

// Catalog API - Product search and lookup
app.route("/api/catalog", catalogRouter);

// Shopping API - Cart operations
app.route("/api/shopping/cart", cartRouter);

// Shopping API - Checkout operations
// Base path matches what we advertise in discovery
app.route("/api/shopping", checkoutRouter);

// Shopping API - Order operations
app.route("/api/shopping", orderRouter);

// Health check
app.get("/health", (c) => c.json({ status: "ok", protocol: "UCP", version: UCP_VERSION }));

// Static files - Serve the UI from /public directory
app.use("/styles.css", serveStatic({ path: "./src/public/styles.css" }));
app.use("/app.js", serveStatic({ path: "./src/public/app.js" }));

// Root - Serve the UI
app.get("/", serveStatic({ path: "./src/public/index.html" }));

// ============================================================================
// Server Start
// ============================================================================

const port = parseInt(process.env.PORT || "3000");

console.log(`
╔═══════════════════════════════════════════════════════════════════════╗
║                    UCP Demo Merchant Server                         ║
║                    Spec Version: ${UCP_VERSION}                        ║
╠═══════════════════════════════════════════════════════════════════════╣
║                                                                     ║
║  Universal Commerce Protocol (UCP) is an open standard for          ║
║  seamless commerce interoperability between platforms, agents,       ║
║  and businesses.                                                    ║
║                                                                     ║
║  Discovery:     http://localhost:${port}/.well-known/ucp                ║
║  Catalog:       http://localhost:${port}/api/catalog/search             ║
║  Cart:          http://localhost:${port}/api/shopping/cart               ║
║  Checkout:      http://localhost:${port}/api/shopping/checkout-sessions  ║
║  Orders:        http://localhost:${port}/api/shopping/orders             ║
║                                                                     ║
║  Web UI:        http://localhost:${port}/                               ║
║  Run the test:  npm run client                                      ║
║                                                                     ║
╚═══════════════════════════════════════════════════════════════════════╝
`);

// Start the server using Node.js adapter
serve({
  fetch: app.fetch,
  port,
});
