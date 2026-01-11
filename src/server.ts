/**
 * UCP Demo Merchant Server
 *
 * This is a minimal implementation of a UCP-compliant merchant server.
 * It demonstrates the core concepts of the Universal Commerce Protocol:
 *
 * 1. DISCOVERY (/.well-known/ucp)
 *    - Exposes merchant capabilities
 *    - Lists available payment handlers
 *    - Provides API endpoints
 *
 * 2. CHECKOUT (/api/shopping/checkout-sessions)
 *    - Create, read, update checkout sessions
 *    - Complete checkout (place order)
 *    - Cancel checkout
 *
 * Run with: npm run dev
 * Test with: npm run client
 */

import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import { discoveryRouter } from "./discovery.js";
import { checkoutRouter } from "./checkout.js";

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

// Shopping API - Checkout operations
// Base path matches what we advertise in discovery
app.route("/api/shopping", checkoutRouter);

// Health check
app.get("/health", (c) => c.json({ status: "ok", protocol: "UCP", version: "2026-01-11" }));

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
╔════════════════════════════════════════════════════════════════════╗
║                    UCP Demo Merchant Server                        ║
╠════════════════════════════════════════════════════════════════════╣
║                                                                    ║
║  Universal Commerce Protocol (UCP) is an open standard for        ║
║  seamless commerce interoperability between platforms, agents,     ║
║  and businesses.                                                   ║
║                                                                    ║
║  Discovery:    http://localhost:${port}/.well-known/ucp               ║
║  Products:     http://localhost:${port}/api/shopping/products         ║
║  Checkout:     http://localhost:${port}/api/shopping/checkout-sessions║
║                                                                    ║
║  Web UI:       http://localhost:${port}/                              ║
║  Run the test client: npm run client                               ║
║                                                                    ║
╚════════════════════════════════════════════════════════════════════╝
`);

// Start the server using Node.js adapter
serve({
  fetch: app.fetch,
  port,
});
