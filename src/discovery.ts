/**
 * UCP Discovery - Implements the /.well-known/ucp endpoint
 * Aligned to UCP spec v2026-04-08
 *
 * The discovery profile allows platforms (AI agents, apps) to:
 * 1. Discover what capabilities this merchant supports
 * 2. Find the API endpoints for each service
 * 3. Understand available payment handlers
 * 4. Access signing keys for message verification
 *
 * Key concepts:
 * - Capabilities: Core functions like checkout, catalog, cart, order management
 * - Extensions: Optional add-ons like discounts, fulfillment, buyer consent
 * - Payment Handlers: Supported payment methods
 */

import { Hono } from "hono";
import { UCP_VERSION } from "./types.js";
import type { UCPDiscoveryProfile } from "./types.js";

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
        // ============================================================
        // Catalog Service
        // ============================================================
        // Product discovery — search and lookup before purchasing
        "dev.ucp.catalog": {
          version: UCP_VERSION,
          rest: {
            endpoint: `${baseUrl}/api/catalog`,
          },
          capabilities: [
            {
              name: "dev.ucp.catalog",
              version: UCP_VERSION,
              spec: "https://ucp.dev/latest/specification/catalog/",
            },
            {
              name: "dev.ucp.catalog.search",
              version: UCP_VERSION,
              spec: "https://ucp.dev/latest/specification/catalog/search/",
            },
            {
              name: "dev.ucp.catalog.lookup",
              version: UCP_VERSION,
              spec: "https://ucp.dev/latest/specification/catalog/lookup/",
            },
          ],
        },

        // ============================================================
        // Shopping Service
        // ============================================================
        // Handles cart, checkout, and order operations
        "dev.ucp.shopping": {
          version: UCP_VERSION,
          rest: {
            endpoint: `${baseUrl}/api/shopping`,
          },
          capabilities: [
            // --------------------------------------------------------
            // Core: Cart
            // --------------------------------------------------------
            {
              name: "dev.ucp.cart",
              version: UCP_VERSION,
              spec: "https://ucp.dev/latest/specification/cart/",
            },

            // --------------------------------------------------------
            // Core: Checkout
            // --------------------------------------------------------
            {
              name: "dev.ucp.shopping.checkout",
              version: UCP_VERSION,
              spec: "https://ucp.dev/latest/specification/checkout/",
              schema: "https://ucp.dev/schemas/shopping/checkout_resp.json",
            },

            // --------------------------------------------------------
            // Core: Order
            // --------------------------------------------------------
            {
              name: "dev.ucp.shopping.order",
              version: UCP_VERSION,
              spec: "https://ucp.dev/latest/specification/checkout/#order-confirmation",
            },

            // --------------------------------------------------------
            // Extension: Discount
            // --------------------------------------------------------
            {
              name: "dev.ucp.shopping.checkout.discount",
              version: UCP_VERSION,
              spec: "https://ucp.dev/latest/specification/discount/",
              config: {
                supported_codes: ["SAVE10", "FREESHIP", "FLAT20"],
              },
            },

            // --------------------------------------------------------
            // Extension: Fulfillment
            // --------------------------------------------------------
            {
              name: "dev.ucp.shopping.checkout.fulfillment",
              version: UCP_VERSION,
              spec: "https://ucp.dev/latest/specification/fulfillment/",
              config: {
                supports_shipping: true,
                supports_pickup: true,
              },
            },

            // --------------------------------------------------------
            // Extension: Buyer Consent
            // --------------------------------------------------------
            {
              name: "dev.ucp.shopping.checkout.buyer_consent",
              version: UCP_VERSION,
              spec: "https://ucp.dev/latest/specification/buyer-consent/",
            },
          ],
        },
      },
    },

    // ======================================================================
    // Payment Handlers
    // ======================================================================
    payment: {
      handlers: [
        // Mock handler for testing
        {
          id: "mock-payment-handler",
          name: "Mock Payment (Testing)",
          type: "first_party",
          supported_tokens: ["success_token", "fail_token"],
          config: {
            test_mode: true,
          },
        },

        // Example card payment handler
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

    // ======================================================================
    // Signing Keys (demo — not used for actual signing in this demo)
    // ======================================================================
    signing_keys: [
      {
        kid: "ucp-demo-key-1",
        kty: "OKP",
        alg: "EdDSA",
        use: "sig",
      },
    ],
  };

  return c.json(profile);
});
