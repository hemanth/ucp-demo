/**
 * UCP Cart Service - Cart management
 *
 * The cart capability (dev.ucp.cart) allows platforms and agents to:
 * - Create a cart with initial items
 * - Get cart details
 * - Update cart (add/remove/change quantity)
 * - Delete a cart
 *
 * Cart is separate from checkout — a cart can be converted to a checkout
 * session when the buyer is ready to purchase.
 */

import { Hono } from "hono";
import { v4 as uuidv4 } from "uuid";
import { UCP_VERSION } from "./types.js";
import type {
  Cart,
  CartCreateRequest,
  CartUpdateRequest,
  CartLineItem,
} from "./types.js";
import { getProduct, getCart, saveCart, deleteCart } from "./data.js";

const CART_TTL_HOURS = 24;

export const cartRouter = new Hono();

// ============================================================================
// Helpers
// ============================================================================

function resolveCartItems(
  itemRequests: Array<{ item_id: string; quantity: number }>,
  currency: string
): { items: CartLineItem[]; errors: string[] } {
  const items: CartLineItem[] = [];
  const errors: string[] = [];

  for (const req of itemRequests) {
    const product = getProduct(req.item_id);

    if (!product) {
      errors.push(`Product not found: ${req.item_id}`);
      continue;
    }

    if (!product.in_stock) {
      errors.push(`Product out of stock: ${product.name}`);
      continue;
    }

    if (product.currency !== currency) {
      errors.push(`Currency mismatch for ${product.name}`);
      continue;
    }

    items.push({
      id: uuidv4(),
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

function getExpiresAt(): string {
  const expires = new Date();
  expires.setHours(expires.getHours() + CART_TTL_HOURS);
  return expires.toISOString();
}

// ============================================================================
// Cart Endpoints
// ============================================================================

/**
 * POST /cart
 *
 * Create a new cart, optionally with initial items.
 */
cartRouter.post("/", async (c) => {
  const body = await c.req.json<CartCreateRequest>();

  if (!body.currency) {
    return c.json({ error: "currency is required" }, 400);
  }

  let items: CartLineItem[] = [];
  const messages: string[] = [];

  if (body.items && body.items.length > 0) {
    const resolved = resolveCartItems(body.items, body.currency);
    items = resolved.items;
    messages.push(...resolved.errors);
  }

  const now = new Date().toISOString();
  const cart: Cart = {
    ucp: {
      version: UCP_VERSION,
      capabilities: [{ name: "dev.ucp.cart", version: UCP_VERSION }],
    },
    id: uuidv4(),
    currency: body.currency,
    items,
    subtotal: items.reduce((sum, i) => sum + i.total_price, 0),
    created_at: now,
    updated_at: now,
    expires_at: getExpiresAt(),
  };

  saveCart(cart);

  return c.json(cart, 201);
});

/**
 * GET /cart/:id
 *
 * Get current cart state.
 */
cartRouter.get("/:id", (c) => {
  const cart = getCart(c.req.param("id"));

  if (!cart) {
    return c.json({ error: "Cart not found" }, 404);
  }

  return c.json(cart);
});

/**
 * PUT /cart/:id
 *
 * Update cart items. Replaces all items with the new set.
 */
cartRouter.put("/:id", async (c) => {
  const cart = getCart(c.req.param("id"));

  if (!cart) {
    return c.json({ error: "Cart not found" }, 404);
  }

  const body = await c.req.json<CartUpdateRequest>();

  if (body.items) {
    const { items, errors } = resolveCartItems(body.items, cart.currency);
    cart.items = items;
    cart.subtotal = items.reduce((sum, i) => sum + i.total_price, 0);

    if (errors.length > 0) {
      // Still update, but return errors
      cart.updated_at = new Date().toISOString();
      cart.expires_at = getExpiresAt();
      saveCart(cart);
      return c.json({ ...cart, messages: errors });
    }
  }

  cart.updated_at = new Date().toISOString();
  cart.expires_at = getExpiresAt();
  saveCart(cart);

  return c.json(cart);
});

/**
 * DELETE /cart/:id
 *
 * Delete a cart.
 */
cartRouter.delete("/:id", (c) => {
  const id = c.req.param("id");
  const existed = deleteCart(id);

  if (!existed) {
    return c.json({ error: "Cart not found" }, 404);
  }

  return c.json({ deleted: true }, 200);
});
