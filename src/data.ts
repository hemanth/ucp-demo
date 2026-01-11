/**
 * Sample Data - In-memory storage for demo purposes
 *
 * In a real implementation, this would be replaced with a database.
 * This includes:
 * - Sample product catalog (flower shop theme)
 * - Checkout session storage
 * - Order storage
 */

import type { Product, CheckoutResponse, Order } from "./types.js";

// ============================================================================
// Sample Product Catalog - Flower Shop
// ============================================================================

export const products: Map<string, Product> = new Map([
  [
    "rose-bouquet",
    {
      id: "rose-bouquet",
      name: "Classic Rose Bouquet",
      description: "A dozen fresh red roses, beautifully arranged",
      price: 4999, // $49.99
      currency: "USD",
      image_url: "https://example.com/images/rose-bouquet.jpg",
      in_stock: true,
    },
  ],
  [
    "tulip-arrangement",
    {
      id: "tulip-arrangement",
      name: "Spring Tulip Arrangement",
      description: "Colorful tulips in a decorative vase",
      price: 3499, // $34.99
      currency: "USD",
      image_url: "https://example.com/images/tulips.jpg",
      in_stock: true,
    },
  ],
  [
    "orchid-plant",
    {
      id: "orchid-plant",
      name: "Phalaenopsis Orchid",
      description: "Elegant white orchid in a ceramic pot",
      price: 5999, // $59.99
      currency: "USD",
      image_url: "https://example.com/images/orchid.jpg",
      in_stock: true,
    },
  ],
  [
    "sunflower-bunch",
    {
      id: "sunflower-bunch",
      name: "Sunflower Bunch",
      description: "Bright and cheerful sunflowers, 6 stems",
      price: 2499, // $24.99
      currency: "USD",
      image_url: "https://example.com/images/sunflowers.jpg",
      in_stock: true,
    },
  ],
  [
    "mixed-wildflowers",
    {
      id: "mixed-wildflowers",
      name: "Mixed Wildflower Bouquet",
      description: "A rustic arrangement of seasonal wildflowers",
      price: 2999, // $29.99
      currency: "USD",
      image_url: "https://example.com/images/wildflowers.jpg",
      in_stock: false, // Out of stock example
    },
  ],
]);

// ============================================================================
// In-Memory Storage
// ============================================================================

export const checkoutSessions: Map<string, CheckoutResponse> = new Map();
export const orders: Map<string, Order> = new Map();

// ============================================================================
// Helper Functions
// ============================================================================

export function getProduct(id: string): Product | undefined {
  return products.get(id);
}

export function getAllProducts(): Product[] {
  return Array.from(products.values());
}

export function getCheckout(id: string): CheckoutResponse | undefined {
  return checkoutSessions.get(id);
}

export function saveCheckout(checkout: CheckoutResponse): void {
  checkoutSessions.set(checkout.id, checkout);
}

export function getOrder(id: string): Order | undefined {
  return orders.get(id);
}

export function saveOrder(order: Order): void {
  orders.set(order.id, order);
}
