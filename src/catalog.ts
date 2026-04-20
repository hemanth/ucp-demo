/**
 * UCP Catalog Service - Product search and lookup
 *
 * The catalog capability (dev.ucp.catalog) allows platforms and agents to:
 * - Search for products by text query and filters
 * - Look up individual product details by ID
 *
 * This maps our internal Product type to the UCP CatalogItem schema.
 */

import { Hono } from "hono";
import { UCP_VERSION } from "./types.js";
import type {
  CatalogItem,
  CatalogSearchRequest,
  CatalogSearchResponse,
  CatalogLookupResponse,
  Product,
} from "./types.js";
import { getProduct, searchProducts } from "./data.js";

export const catalogRouter = new Hono();

// ============================================================================
// Helpers
// ============================================================================

/** Convert internal Product to UCP CatalogItem */
function toCatalogItem(product: Product): CatalogItem {
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    price: {
      amount: product.price,
      currency: product.currency,
    },
    image_url: product.image_url,
    category: product.category,
    availability: product.in_stock ? "in_stock" : "out_of_stock",
  };
}

// ============================================================================
// Catalog Endpoints
// ============================================================================

/**
 * POST /search
 *
 * Search the product catalog. Supports text query and structured filters.
 */
catalogRouter.post("/search", async (c) => {
  const body = await c.req.json<CatalogSearchRequest>();

  const results = searchProducts(body.query, {
    category: body.filters?.category,
    min_price: body.filters?.min_price,
    max_price: body.filters?.max_price,
    availability: body.filters?.availability,
  });

  // Simple cursor-based pagination
  const pageSize = body.page_size || 20;
  const startIndex = body.cursor ? parseInt(body.cursor, 10) : 0;
  const page = results.slice(startIndex, startIndex + pageSize);
  const nextCursor =
    startIndex + pageSize < results.length
      ? String(startIndex + pageSize)
      : undefined;

  const response: CatalogSearchResponse = {
    ucp: {
      version: UCP_VERSION,
      capabilities: [
        { name: "dev.ucp.catalog", version: UCP_VERSION },
      ],
    },
    items: page.map(toCatalogItem),
    total_count: results.length,
    next_cursor: nextCursor,
  };

  return c.json(response);
});

/**
 * GET /items/:id
 *
 * Look up a single catalog item by ID.
 */
catalogRouter.get("/items/:id", (c) => {
  const id = c.req.param("id");
  const product = getProduct(id);

  if (!product) {
    return c.json(
      {
        ucp: { version: UCP_VERSION },
        error: { code: "ITEM_NOT_FOUND", message: `Item not found: ${id}` },
      },
      404
    );
  }

  const response: CatalogLookupResponse = {
    ucp: {
      version: UCP_VERSION,
      capabilities: [
        { name: "dev.ucp.catalog", version: UCP_VERSION },
      ],
    },
    item: toCatalogItem(product),
  };

  return c.json(response);
});
