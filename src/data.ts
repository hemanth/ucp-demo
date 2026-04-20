/**
 * Sample Data - In-memory storage for demo purposes
 * Aligned to UCP spec v2026-04-08
 *
 * In a real implementation, this would be replaced with a database.
 * This includes:
 * - Product catalog (AI Gadgets Store)
 * - Discount codes
 * - Fulfillment options
 * - In-memory stores for checkouts, carts, orders
 */

import type {
  Product,
  CheckoutResponse,
  Order,
  Cart,
  DiscountCode,
  FulfillmentOption,
} from "./types.js";

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
      category: "smart-home",
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
      category: "wearables",
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
      category: "wearables",
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
      category: "robotics",
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
      category: "health",
      image_url: "https://images.unsplash.com/photo-1589254065878-42c9da997008?w=200&h=200&fit=crop",
      in_stock: false, // Out of stock example
    },
  ],
  [
    "ai-camera",
    {
      id: "ai-camera",
      name: "AI Security Camera",
      description: "Smart security camera with on-device person, pet, and package detection",
      price: 7999, // $79.99
      currency: "USD",
      category: "smart-home",
      image_url: "https://images.unsplash.com/photo-1558002038-1055907df827?w=200&h=200&fit=crop",
      in_stock: true,
    },
  ],
]);

// ============================================================================
// Discount Codes
// ============================================================================

export const discountCodes: Map<string, DiscountCode> = new Map([
  [
    "SAVE10",
    {
      code: "SAVE10",
      type: "percentage",
      value: 10,
      description: "10% off your order",
    },
  ],
  [
    "FREESHIP",
    {
      code: "FREESHIP",
      type: "free_shipping",
      value: 0,
      description: "Free standard shipping",
    },
  ],
  [
    "FLAT20",
    {
      code: "FLAT20",
      type: "fixed",
      value: 2000, // $20 off
      description: "$20 off your order",
      min_order_amount: 10000, // Min $100
    },
  ],
]);

// ============================================================================
// Fulfillment Options
// ============================================================================

export const fulfillmentOptions: FulfillmentOption[] = [
  {
    id: "standard-shipping",
    type: "shipping",
    name: "Standard Shipping",
    description: "Delivered in 5-7 business days",
    price: 599, // $5.99
    currency: "USD",
    estimated_delivery: "P7D",
  },
  {
    id: "express-shipping",
    type: "shipping",
    name: "Express Shipping",
    description: "Delivered in 2-3 business days",
    price: 1299, // $12.99
    currency: "USD",
    estimated_delivery: "P3D",
  },
  {
    id: "overnight-shipping",
    type: "shipping",
    name: "Overnight Shipping",
    description: "Delivered next business day",
    price: 2499, // $24.99
    currency: "USD",
    estimated_delivery: "P1D",
  },
  {
    id: "store-pickup",
    type: "pickup",
    name: "Store Pickup",
    description: "Pick up at our San Francisco store",
    price: 0,
    currency: "USD",
    estimated_delivery: "PT2H",
  },
];

// ============================================================================
// In-Memory Storage
// ============================================================================

export const checkoutSessions: Map<string, CheckoutResponse> = new Map();
export const orders: Map<string, Order> = new Map();
export const carts: Map<string, Cart> = new Map();

// ============================================================================
// Helper Functions - Products
// ============================================================================

export function getProduct(id: string): Product | undefined {
  return products.get(id);
}

export function getAllProducts(): Product[] {
  return Array.from(products.values());
}

export function searchProducts(
  query?: string,
  filters?: {
    category?: string;
    min_price?: number;
    max_price?: number;
    availability?: string;
  }
): Product[] {
  let results = Array.from(products.values());

  if (query) {
    const q = query.toLowerCase();
    results = results.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        (p.category && p.category.toLowerCase().includes(q))
    );
  }

  if (filters?.category) {
    results = results.filter((p) => p.category === filters.category);
  }

  if (filters?.min_price !== undefined) {
    results = results.filter((p) => p.price >= filters.min_price!);
  }

  if (filters?.max_price !== undefined) {
    results = results.filter((p) => p.price <= filters.max_price!);
  }

  if (filters?.availability) {
    const wantInStock = filters.availability === "in_stock";
    results = results.filter((p) => p.in_stock === wantInStock);
  }

  return results;
}

// ============================================================================
// Helper Functions - Checkouts
// ============================================================================

export function getCheckout(id: string): CheckoutResponse | undefined {
  return checkoutSessions.get(id);
}

export function saveCheckout(checkout: CheckoutResponse): void {
  checkoutSessions.set(checkout.id, checkout);
}

// ============================================================================
// Helper Functions - Orders
// ============================================================================

export function getOrder(id: string): Order | undefined {
  return orders.get(id);
}

export function getAllOrders(): Order[] {
  return Array.from(orders.values());
}

export function saveOrder(order: Order): void {
  orders.set(order.id, order);
}

// ============================================================================
// Helper Functions - Carts
// ============================================================================

export function getCart(id: string): Cart | undefined {
  return carts.get(id);
}

export function saveCart(cart: Cart): void {
  carts.set(cart.id, cart);
}

export function deleteCart(id: string): boolean {
  return carts.delete(id);
}

// ============================================================================
// Helper Functions - Discounts
// ============================================================================

export function getDiscountCode(code: string): DiscountCode | undefined {
  return discountCodes.get(code.toUpperCase());
}

// ============================================================================
// Helper Functions - Fulfillment
// ============================================================================

export function getFulfillmentOptions(): FulfillmentOption[] {
  return fulfillmentOptions;
}

export function getFulfillmentOption(id: string): FulfillmentOption | undefined {
  return fulfillmentOptions.find((o) => o.id === id);
}
