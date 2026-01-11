/**
 * UCP Discovery - Implements the /.well-known/ucp endpoint
 *
 * The discovery profile allows platforms (AI agents, apps) to:
 * 1. Discover what capabilities this merchant supports
 * 2. Find the API endpoints for each service
 * 3. Understand available payment handlers
 *
 * Key concepts:
 * - Capabilities: Core functions like checkout, order management
 * - Extensions: Optional add-ons like discounts, fulfillment
 * - Payment Handlers: Supported payment methods
 */

import { Hono } from "hono";
import type { UCPDiscoveryProfile } from "./types.js";

const UCP_VERSION = "2026-01-11";

export const discoveryRouter = new Hono();

/**
 * GET /.well-known/ucp
 *
 * Returns the merchant's UCP discovery profile.
 * This is the entry point for any platform/agent to understand
 * what this merchant can do and how to interact with it.
 */
discoveryRouter.get("/", (c) => {
  const baseUrl = new URL(c.req.url).origin;

  const profile: UCPDiscoveryProfile = {
    ucp: {
      version: UCP_VERSION,
      services: {
        // The shopping service handles all checkout-related operations
        "dev.ucp.shopping": {
          version: UCP_VERSION,
          rest: {
            // Platforms use this endpoint for REST API calls
            endpoint: `${baseUrl}/api/shopping`,
          },
          capabilities: [
            // ============================================================
            // Core Capability: Checkout
            // ============================================================
            // This is the fundamental capability for any e-commerce merchant.
            // It handles cart management, pricing, and order placement.
            {
              name: "dev.ucp.shopping.checkout",
              version: UCP_VERSION,
              spec: "https://ucp.dev/specs/checkout",
              schema: "https://ucp.dev/schemas/shopping/checkout_resp.json",
            },

            // ============================================================
            // Core Capability: Order
            // ============================================================
            // Post-purchase order management - tracking, updates, etc.
            {
              name: "dev.ucp.shopping.order",
              version: UCP_VERSION,
              spec: "https://ucp.dev/specs/order",
              schema: "https://ucp.dev/schemas/shopping/order.json",
            },

            // ============================================================
            // Extension: Discount
            // ============================================================
            // Optional capability for applying promotional codes
            // Extensions are layered on top of core capabilities
            {
              name: "dev.ucp.shopping.checkout.discount",
              version: UCP_VERSION,
              spec: "https://ucp.dev/specs/discount",
              schema: "https://ucp.dev/schemas/shopping/discount_resp.json",
            },
          ],
        },
      },
    },

    // ======================================================================
    // Payment Handlers
    // ======================================================================
    // Define how payments can be collected. Each handler represents
    // a payment method that platforms/agents can use.
    payment: {
      handlers: [
        // Mock handler for testing - accepts specific tokens
        {
          id: "mock-payment-handler",
          name: "Mock Payment (Testing)",
          type: "first_party",
          supported_tokens: ["success_token", "fail_token"],
          config: {
            test_mode: true,
          },
        },

        // Example of a card payment handler (like Stripe, PayPal)
        {
          id: "card-handler",
          name: "Credit/Debit Card",
          type: "third_party",
          supported_networks: ["visa", "mastercard", "amex"],
          config: {
            gateway: "stripe",
            merchant_id: "demo_merchant",
          },
        },
      ],
    },
  };

  return c.json(profile);
});
