/**
 * UCP Types - Core type definitions for Universal Commerce Protocol
 * Aligned to UCP spec v2026-04-08
 *
 * These types represent the core data structures used in UCP for:
 * - Discovery profiles
 * - Catalog (search/lookup)
 * - Cart management
 * - Checkout sessions
 * - Payment handling
 * - Order management
 * - Extensions (fulfillment, discounts, buyer consent)
 */

export const UCP_VERSION = "2026-04-08";

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

export interface SigningKey {
  kid: string;
  kty: string;
  alg?: string;
  use?: string;
  [key: string]: unknown;
}

export interface UCPDiscoveryProfile {
  ucp: {
    version: string;
    services: Record<string, UCPService>;
  };
  payment?: {
    handlers: PaymentHandler[];
  };
  signing_keys?: SigningKey[];
}

// ============================================================================
// Catalog Types
// ============================================================================

export interface CatalogItem {
  id: string;
  name: string;
  description: string;
  price: {
    amount: number;        // In minor units (cents)
    currency: string;      // ISO 4217
  };
  image_url?: string;
  category?: string;
  availability: "in_stock" | "out_of_stock" | "preorder";
  attributes?: Record<string, string>;
}

export interface CatalogSearchRequest {
  query?: string;
  filters?: {
    category?: string;
    min_price?: number;
    max_price?: number;
    availability?: "in_stock" | "out_of_stock" | "preorder";
  };
  page_size?: number;
  cursor?: string;
}

export interface CatalogSearchResponse {
  ucp: {
    version: string;
    capabilities: Array<{ name: string; version: string }>;
  };
  items: CatalogItem[];
  total_count: number;
  next_cursor?: string;
}

export interface CatalogLookupResponse {
  ucp: {
    version: string;
    capabilities: Array<{ name: string; version: string }>;
  };
  item: CatalogItem;
}

// ============================================================================
// Cart Types
// ============================================================================

export interface CartLineItem {
  id: string;              // Line item ID (generated)
  item: {
    id: string;            // Catalog item ID
    name: string;
    description?: string;
    image_url?: string;
  };
  quantity: number;
  unit_price: number;
  total_price: number;
}

export interface CartCreateRequest {
  currency: string;
  items?: Array<{
    item_id: string;
    quantity: number;
  }>;
}

export interface CartUpdateRequest {
  items?: Array<{
    item_id: string;
    quantity: number;
  }>;
}

export interface Cart {
  ucp: {
    version: string;
    capabilities: Array<{ name: string; version: string }>;
  };
  id: string;
  currency: string;
  items: CartLineItem[];
  subtotal: number;
  created_at: string;
  updated_at: string;
  expires_at: string;
}

// ============================================================================
// Product/Item Types (internal, mapped to CatalogItem for API)
// ============================================================================

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;       // In cents
  currency: string;    // ISO 4217
  image_url?: string;
  category?: string;
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
// Fulfillment Types
// ============================================================================

export interface PostalAddress {
  street_address: string;
  locality: string;        // City
  region?: string;         // State/Province
  postal_code: string;
  country_code: string;    // ISO 3166-1 alpha-2
}

export interface FulfillmentOption {
  id: string;
  type: "shipping" | "pickup" | "digital";
  name: string;
  description?: string;
  price: number;           // In minor units (cents)
  currency: string;
  estimated_delivery?: string; // ISO 8601 duration or date
}

export interface FulfillmentSelection {
  selected_option_id: string;
  shipping_address?: PostalAddress;
}

// ============================================================================
// Discount Types
// ============================================================================

export interface DiscountCode {
  code: string;
  type: "percentage" | "fixed" | "free_shipping";
  value: number;           // Percentage (0-100) or fixed amount in cents
  description: string;
  min_order_amount?: number;
}

export interface AppliedDiscount {
  code: string;
  type: "percentage" | "fixed" | "free_shipping";
  description: string;
  amount: number;          // Calculated discount in cents
}

// ============================================================================
// Buyer Consent Types
// ============================================================================

export interface BuyerConsent {
  terms_accepted: boolean;
  privacy_accepted: boolean;
  marketing_opt_in?: boolean;
  accepted_at?: string;
}

// ============================================================================
// Context & Signals Types
// ============================================================================

export interface CheckoutContext {
  locale?: string;           // e.g., "en-US"
  timezone?: string;         // e.g., "America/New_York"
  user_agent?: string;
  platform_id?: string;      // Platform making the request
}

export interface CheckoutSignals {
  is_gift?: boolean;
  priority?: "standard" | "express" | "urgent";
  notes?: string;
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
  address?: PostalAddress;
}

export interface Message {
  type: "info" | "warning" | "error";
  code: string;
  message: string;
  presentation?: "notice" | "disclosure";  // Warning presentation type
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
  cart_id?: string;          // Create checkout from existing cart
  context?: CheckoutContext;
  signals?: CheckoutSignals;
}

export interface CheckoutUpdateRequest {
  line_items?: LineItemRequest[];
  payment?: PaymentRequest;
  buyer?: Buyer;
  fulfillment?: FulfillmentSelection;
  consent?: BuyerConsent;
  context?: CheckoutContext;
  signals?: CheckoutSignals;
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
  continue_url?: string;          // Required when status is requires_escalation
  order?: OrderConfirmation;      // Present when status is completed
  fulfillment_options?: FulfillmentOption[];
  selected_fulfillment?: FulfillmentSelection;
  discount?: AppliedDiscount;
  consent?: BuyerConsent;
  context?: CheckoutContext;
  signals?: CheckoutSignals;
}

// ============================================================================
// Order Types
// ============================================================================

export interface Order {
  ucp: {
    version: string;
    capabilities: Array<{ name: string; version: string }>;
  };
  id: string;
  checkout_id: string;
  status: "pending" | "processing" | "shipped" | "delivered" | "canceled";
  line_items: LineItemResponse[];
  totals: Totals;
  buyer?: Buyer;
  fulfillment?: FulfillmentSelection & {
    option: FulfillmentOption;
    tracking_number?: string;
    tracking_url?: string;
  };
  discount?: AppliedDiscount;
  created_at: string;
  updated_at: string;
}
