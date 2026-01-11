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
// Sample Product Catalog - AI Gadgets Store
// ============================================================================

export const products: Map<string, Product> = new Map([
  [
    "ai-voice-assistant",
    {
      id: "ai-voice-assistant",
      name: "AI Voice Assistant",
      description: "Smart speaker with advanced voice AI and multi-room audio",
      price: 8999, // $89.99
      currency: "USD",
      image_url: "https://images.unsplash.com/photo-1543512214-318c7553f230?w=200&h=200&fit=crop",
      in_stock: true,
    },
  ],
  [
    "neural-earbuds",
    {
      id: "neural-earbuds",
      name: "Neural Earbuds Pro",
      description: "Wireless earbuds with real-time AI translation in 40+ languages",
      price: 14999, // $149.99
      currency: "USD",
      image_url: "https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=200&h=200&fit=crop",
      in_stock: true,
    },
  ],
  [
    "smart-glasses",
    {
      id: "smart-glasses",
      name: "AI Smart Glasses",
      description: "AR glasses with integrated AI assistant and heads-up display",
      price: 29999, // $299.99
      currency: "USD",
      image_url: "https://images.unsplash.com/photo-1574944985070-8f3ebc6b79d2?w=200&h=200&fit=crop",
      in_stock: true,
    },
  ],
  [
    "robot-companion",
    {
      id: "robot-companion",
      name: "Robot Companion",
      description: "Desktop AI robot for productivity, scheduling, and companionship",
      price: 19999, // $199.99
      currency: "USD",
      image_url: "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=200&h=200&fit=crop",
      in_stock: true,
    },
  ],
  [
    "brain-band",
    {
      id: "brain-band",
      name: "Brain Band",
      description: "EEG headband for AI-powered focus, meditation, and sleep tracking",
      price: 12999, // $129.99
      currency: "USD",
      image_url: "https://images.unsplash.com/photo-1589254065878-42c9da997008?w=200&h=200&fit=crop",
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
