/**
 * UCP Types - Core type definitions for Universal Commerce Protocol
 *
 * These types represent the core data structures used in UCP for:
 * - Discovery profiles
 * - Checkout sessions
 * - Payment handling
 * - Order management
 */

// ============================================================================
// Discovery Types
// ============================================================================

export interface UCPCapability {
  name: string;           // Reverse-domain notation, e.g., "dev.ucp.shopping.checkout"
  version: string;        // YYYY-MM-DD format
  spec?: string;          // URI to human-readable documentation
  schema?: string;        // URI to JSON schema
  config?: Record<string, unknown>;
}

export interface UCPService {
  version: string;
  rest?: {
    endpoint: string;
  };
  mcp?: {
    endpoint: string;
  };
  capabilities: UCPCapability[];
}

export interface PaymentHandler {
  id: string;
  name: string;
  type: "first_party" | "third_party";
  supported_networks?: string[];
  supported_tokens?: string[];
  config?: Record<string, unknown>;
}

export interface UCPDiscoveryProfile {
  ucp: {
    version: string;
    services: Record<string, UCPService>;
  };
  payment?: {
    handlers: PaymentHandler[];
  };
  signing_keys?: Array<{
    kid: string;
    kty: string;
    [key: string]: unknown;
  }>;
}

// ============================================================================
// Product/Item Types
// ============================================================================

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;       // In cents
  currency: string;    // ISO 4217
  image_url?: string;
  in_stock: boolean;
}

export interface LineItemRequest {
  item: {
    id: string;        // Product ID
  };
  quantity: number;
}

export interface LineItemResponse {
  id: string;          // Line item ID (generated)
  item: {
    id: string;
    name: string;
    description: string;
    image_url?: string;
  };
  quantity: number;
  unit_price: number;
  total_price: number;
}

// ============================================================================
// Payment Types
// ============================================================================

export interface PaymentInstrument {
  id: string;
  handler_id: string;
  type: string;
  display_name?: string;
}

export interface PaymentRequest {
  selected_instrument_id?: string;
  instruments?: PaymentInstrument[];
}

export interface PaymentResponse {
  selected_instrument_id?: string;
  instruments: PaymentInstrument[];
  status: "pending" | "authorized" | "captured" | "failed";
}

export interface PaymentData {
  payment_data: {
    handler_id: string;
    token?: string;
    [key: string]: unknown;
  };
}

// ============================================================================
// Checkout Types
// ============================================================================

export type CheckoutStatus =
  | "incomplete"           // Missing required data
  | "requires_escalation"  // Needs human intervention
  | "ready_for_complete"   // Ready to place order
  | "complete_in_progress" // Order being processed
  | "completed"            // Order placed successfully
  | "canceled";            // Checkout canceled

export interface Totals {
  subtotal: number;
  tax: number;
  shipping: number;
  discount: number;
  total: number;
}

export interface Link {
  rel: string;
  href: string;
  title?: string;
}

export interface Buyer {
  email?: string;
  name?: string;
  phone?: string;
}

export interface Message {
  type: "info" | "warning" | "error";
  code: string;
  message: string;
}

export interface OrderConfirmation {
  id: string;
  created_at: string;
}

export interface CheckoutCreateRequest {
  line_items: LineItemRequest[];
  currency: string;
  payment?: PaymentRequest;
  buyer?: Buyer;
}

export interface CheckoutUpdateRequest {
  line_items?: LineItemRequest[];
  payment?: PaymentRequest;
  buyer?: Buyer;
}

export interface CheckoutResponse {
  ucp: {
    version: string;
    capabilities: Array<{ name: string; version: string }>;
  };
  id: string;
  status: CheckoutStatus;
  line_items: LineItemResponse[];
  currency: string;
  totals: Totals;
  payment: PaymentResponse;
  links: Link[];
  buyer?: Buyer;
  messages?: Message[];
  expires_at: string;
  continue_url?: string;      // Required when status is requires_escalation
  order?: OrderConfirmation;  // Present when status is completed
}

// ============================================================================
// Order Types
// ============================================================================

export interface Order {
  id: string;
  checkout_id: string;
  status: "pending" | "processing" | "shipped" | "delivered" | "canceled";
  line_items: LineItemResponse[];
  totals: Totals;
  buyer?: Buyer;
  created_at: string;
  updated_at: string;
}
