/**
 * UCP Order Service - Order retrieval and management
 *
 * The order capability (dev.ucp.shopping.order) allows platforms and agents to:
 * - Get order details by ID
 * - List all orders
 *
 * Orders are created during checkout completion. This module provides
 * the read-side of the order lifecycle.
 */

import { Hono } from "hono";
import { UCP_VERSION } from "./types.js";
import { getOrder, getAllOrders } from "./data.js";

export const orderRouter = new Hono();

// ============================================================================
// Order Endpoints
// ============================================================================

/**
 * GET /orders
 *
 * List all orders. In a real system, this would be filtered by
 * authenticated buyer/platform identity.
 */
orderRouter.get("/orders", (c) => {
  const orders = getAllOrders();

  return c.json({
    ucp: {
      version: UCP_VERSION,
      capabilities: [
        { name: "dev.ucp.shopping.order", version: UCP_VERSION },
      ],
    },
    orders,
    total_count: orders.length,
  });
});

/**
 * GET /orders/:id
 *
 * Get a specific order by ID.
 */
orderRouter.get("/orders/:id", (c) => {
  const id = c.req.param("id");
  const order = getOrder(id);

  if (!order) {
    return c.json(
      {
        ucp: { version: UCP_VERSION },
        error: { code: "ORDER_NOT_FOUND", message: `Order not found: ${id}` },
      },
      404
    );
  }

  return c.json(order);
});
