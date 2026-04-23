/**
 * UCP Demo - Dual Mode App
 *
 * Mode 1: Agent Flow - Step-by-step API explorer showing raw requests/responses
 * Mode 2: Shop Demo - Chat-style shopping experience powered by UCP APIs
 *
 * UCP Spec v2026-04-08
 */

const API_BASE = 'https://ucp-demo-api.hemanthhm.workers.dev/api';
const DISCOVERY_URL = 'https://ucp-demo-api.hemanthhm.workers.dev/.well-known/ucp';

// ============================================================================
// Navigation - Hash-based routing (#agent, #shop)
// ============================================================================

let currentMode = null;
let shopInitialized = false;
let agentInitialized = false;

function showDemo(mode, pushState = true) {
  document.getElementById('landing').style.display = 'none';
  document.getElementById('agent-app').classList.remove('active');
  document.getElementById('shop-app').classList.remove('active');

  if (mode === 'agent') {
    document.getElementById('agent-app').classList.add('active');
    currentMode = 'agent';
    if (!agentInitialized) { agentInitialized = true; initAgentFlow(); }
  } else {
    document.getElementById('shop-app').classList.add('active');
    currentMode = 'shop';
    if (!shopInitialized) { shopInitialized = true; initShopDemo(); }
  }

  if (pushState) window.location.hash = mode;
  document.title = `UCP - ${mode === 'agent' ? 'Agent Flow' : 'Shop Demo'}`;
}

function showLanding(pushState = true) {
  document.getElementById('landing').style.display = 'flex';
  document.getElementById('agent-app').classList.remove('active');
  document.getElementById('shop-app').classList.remove('active');
  currentMode = null;
  if (pushState) history.replaceState(null, '', window.location.pathname);
  document.title = 'UCP: Universal Commerce Protocol for AI Agents';
}

function switchMode(mode) {
  showDemo(mode);
}

// Route on hash change
function handleRoute() {
  const hash = window.location.hash.replace('#', '');
  if (hash === 'agent' || hash === 'shop') showDemo(hash, false);
  else showLanding(false);
}

window.addEventListener('hashchange', handleRoute);
window.addEventListener('DOMContentLoaded', handleRoute);

// ============================================================================
// ==================   AGENT FLOW - API EXPLORER   ==========================
// ============================================================================

const agentState = {
  currentStep: 0,
  completed: new Set(),
  responses: {},
  cartId: null,
  checkoutId: null,
  orderId: null,
};

const STEPS = [
  {
    title: 'Step 1: Discovery',
    desc: 'Fetch the merchant\'s UCP profile to discover capabilities, payment handlers, and API endpoints.',
    method: 'GET',
    path: '/.well-known/ucp',
    body: null,
    explain: 'The agent sends a GET request to <code>/.well-known/ucp</code>. The merchant responds with a JSON document listing all UCP capabilities (catalog, cart, checkout, fulfillment, discount, orders), available payment handlers, signing keys, and the API endpoint base URLs.',
  },
  {
    title: 'Step 2: Catalog Search',
    desc: 'Search the product catalog by text query.',
    method: 'POST',
    path: '/api/catalog/search',
    body: { query: 'AI', page_size: 10 },
    explain: 'The agent searches the catalog using a text query. The merchant returns matching items with structured data: id, name, description, price, category, availability. The agent uses this to select items for the cart.',
  },
  {
    title: 'Step 3: Create Cart',
    desc: 'Create a shopping cart with selected items.',
    method: 'POST',
    path: '/api/shopping/cart',
    getBody: () => ({
      currency: 'USD',
      items: [
        { item_id: 'neural-earbuds', quantity: 1 },
        { item_id: 'ai-voice-assistant', quantity: 2 },
      ],
    }),
    explain: 'The agent creates a server-side cart with item IDs and quantities. The merchant validates items, checks stock, calculates line totals, and returns the full cart with a subtotal. The cart has a 24-hour expiry.',
  },
  {
    title: 'Step 4: Create Checkout Session',
    desc: 'Convert the cart into a checkout session.',
    method: 'POST',
    path: '/api/shopping/checkout-sessions',
    getBody: () => ({
      cart_id: agentState.cartId,
      currency: 'USD',
      payment: {
        instruments: [
          { id: 'inst-mock', handler_id: 'mock-payment-handler', type: 'token', display_name: 'Test Payment' },
        ],
      },
      context: { locale: 'en-US', platform_id: 'ucp-agent-demo' },
    }),
    explain: 'The agent converts the cart to a checkout session by passing the <code>cart_id</code>. The merchant returns: line items with pricing, tax calculation, available fulfillment options (shipping/pickup), payment instruments, and links to terms/privacy policies. The checkout status starts as <code>incomplete</code>.',
  },
  {
    title: 'Step 5: Select Fulfillment + Buyer Info',
    desc: 'Update checkout with shipping selection, buyer details, payment method, and consent.',
    method: 'PUT',
    getPath: () => `/api/shopping/checkout-sessions/${agentState.checkoutId}`,
    getBody: () => ({
      fulfillment: {
        selected_option_id: 'express-shipping',
        shipping_address: {
          street_address: '123 AI Boulevard',
          locality: 'San Francisco',
          region: 'CA',
          postal_code: '94105',
          country_code: 'US',
        },
      },
      buyer: { name: 'AI Shopping Agent', email: 'agent@example.com' },
      payment: { selected_instrument_id: 'inst-mock' },
      consent: { terms_accepted: true, privacy_accepted: true },
    }),
    explain: 'The agent sends a single PUT to update the checkout with: selected fulfillment option (express shipping), shipping address, buyer identity, payment instrument selection, and buyer consent flags. The merchant recalculates totals (with shipping cost) and advances status to <code>ready_for_complete</code>.',
  },
  {
    title: 'Step 6: Apply Discount Code',
    desc: 'Apply a promo code to get 10% off.',
    method: 'POST',
    getPath: () => `/api/shopping/checkout-sessions/${agentState.checkoutId}/discount`,
    body: { code: 'SAVE10' },
    explain: 'The agent applies the promo code <code>SAVE10</code>. The merchant validates the code, calculates the 10% discount amount, and returns the updated checkout with recalculated totals. Other codes: <code>FREESHIP</code> (free shipping), <code>FLAT20</code> ($20 off orders over $100).',
  },
  {
    title: 'Step 7: Complete the Order',
    desc: 'Submit payment and finalize the order.',
    method: 'POST',
    getPath: () => `/api/shopping/checkout-sessions/${agentState.checkoutId}/complete`,
    body: {
      payment_data: {
        handler_id: 'mock-payment-handler',
        token: 'success_token',
      },
    },
    explain: 'The agent submits the payment token. The merchant processes the payment (mock in this demo), creates an order record with a tracking number, and returns the completed checkout. Status changes to <code>completed</code>, payment status to <code>captured</code>. The response includes the new order ID.',
  },
  {
    title: 'Step 8: Retrieve Order',
    desc: 'Fetch the completed order with tracking details.',
    method: 'GET',
    getPath: () => `/api/shopping/orders/${agentState.orderId}`,
    body: null,
    explain: 'The agent retrieves the full order details: items, totals, buyer info, fulfillment option, tracking number, discount applied, and timestamps. This endpoint can be polled to check order status updates (pending → processing → shipped → delivered).',
  },
];

function initAgentFlow() {
  renderStep(0);
}

function goToStep(index) {
  agentState.currentStep = index;
  // Update nav
  document.querySelectorAll('#steps-nav .step-item').forEach((el, i) => {
    el.classList.toggle('active', i === index);
  });
  renderStep(index);
}

function renderStep(index) {
  const step = STEPS[index];
  document.getElementById('api-step-title').textContent = step.title;
  document.getElementById('api-step-desc').textContent = step.desc;

  const method = step.method;
  const path = step.getPath ? step.getPath() : step.path;
  const body = step.getBody ? step.getBody() : step.body;

  document.getElementById('req-method').textContent = method;
  document.getElementById('req-method').className = `api-method-badge ${method.toLowerCase()}`;
  document.getElementById('req-url').textContent = path;

  const bodySection = document.getElementById('req-body-section');
  if (body) {
    bodySection.style.display = 'block';
    document.getElementById('req-body').textContent = JSON.stringify(body, null, 2);
  } else {
    bodySection.style.display = 'none';
  }

  // Show cached response if available
  if (agentState.responses[index]) {
    const r = agentState.responses[index];
    showResponse(r.status, r.data, r.duration);
  } else {
    document.getElementById('res-status').textContent = '-';
    document.getElementById('res-status').className = 'api-status-badge';
    document.getElementById('res-duration').textContent = '';
    document.getElementById('res-body').innerHTML = '<span class="placeholder">Click "Execute →" to run this step</span>';
  }

  document.getElementById('api-explanation-body').innerHTML = step.explain;

  // Enable/disable execute button
  const btn = document.getElementById('execute-btn');
  const needsPrior = index > 0 && !agentState.completed.has(index - 1);
  btn.disabled = needsPrior;
  btn.textContent = agentState.completed.has(index) ? 'Re-run →' : 'Execute →';
}

async function executeCurrentStep() {
  const index = agentState.currentStep;
  const step = STEPS[index];
  const method = step.method;
  const path = step.getPath ? step.getPath() : step.path;
  const body = step.getBody ? step.getBody() : step.body;
  const fullUrl = path.startsWith('/') ? `https://ucp-demo-api.hemanthhm.workers.dev${path}` : path;

  // Re-render with latest dynamic values
  document.getElementById('req-url').textContent = path;
  if (body) document.getElementById('req-body').textContent = JSON.stringify(body, null, 2);

  const btn = document.getElementById('execute-btn');
  btn.disabled = true;
  btn.textContent = 'Running...';

  document.getElementById('res-body').innerHTML = '<span class="placeholder">Executing...</span>';
  document.getElementById('res-status').textContent = '...';

  const start = Date.now();
  try {
    const options = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) options.body = JSON.stringify(body);

    const response = await fetch(fullUrl, options);
    const data = await response.json();
    const duration = Date.now() - start;

    // Store state from responses
    if (index === 2 && data.id) agentState.cartId = data.id;
    if (index === 3 && data.id) agentState.checkoutId = data.id;
    if (index === 6 && data.order?.id) agentState.orderId = data.order.id;

    agentState.responses[index] = { status: response.status, data, duration };
    agentState.completed.add(index);

    showResponse(response.status, data, duration);

    // Update check mark
    document.getElementById(`check-${index}`).textContent = '✓';

    btn.textContent = 'Re-run →';
    btn.disabled = false;
  } catch (error) {
    document.getElementById('res-body').textContent = `Error: ${error.message}`;
    document.getElementById('res-status').textContent = 'ERR';
    document.getElementById('res-status').className = 'api-status-badge error';
    btn.textContent = 'Retry →';
    btn.disabled = false;
  }
}

function showResponse(status, data, duration) {
  document.getElementById('res-status').textContent = status;
  document.getElementById('res-status').className = `api-status-badge ${status < 400 ? 'success' : 'error'}`;
  document.getElementById('res-duration').textContent = `${duration}ms`;
  document.getElementById('res-body').textContent = JSON.stringify(data, null, 2);
}

async function runAllSteps() {
  for (let i = 0; i < STEPS.length; i++) {
    goToStep(i);
    await executeCurrentStep();
    if (i < STEPS.length - 1) await sleep(300);
  }
}

function resetAll() {
  agentState.currentStep = 0;
  agentState.completed.clear();
  agentState.responses = {};
  agentState.cartId = null;
  agentState.checkoutId = null;
  agentState.orderId = null;
  for (let i = 0; i < 8; i++) document.getElementById(`check-${i}`).textContent = '';
  goToStep(0);
}

// ============================================================================
// ==================   SHOP DEMO - CHAT EXPERIENCE   ========================
// ============================================================================

const shopState = {
  products: [],
  cart: [],
  checkout: null,
  orderId: null,
  debugMode: false,
  timeline: [],
  requests: [],
};

async function fetchShopApi(method, endpoint, body = null) {
  const startTime = Date.now();
  const displayPath = endpoint.replace(/^https?:\/\/[^\/]+/, '');
  addTimelineEntry(`${method} ${displayPath}`);

  const options = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) options.body = JSON.stringify(body);
  if (shopState.debugMode) addApiCallMessage(method, displayPath, body);

  try {
    const response = await fetch(endpoint, options);
    const data = await response.json();
    const duration = Date.now() - startTime;
    shopState.requests.unshift({ method, endpoint: displayPath, body, status: response.status, response: data, duration, timestamp: new Date().toISOString() });
    updateDebugPanel();
    if (!response.ok) throw new Error(data.error || `Request failed: ${response.status}`);
    return data;
  } catch (error) {
    addTimelineEntry(`Error: ${error.message}`, 'error');
    throw error;
  }
}

// Chat Messages
function addMessage(type, content, extra = null) {
  const container = document.getElementById('chat-messages');
  const msg = document.createElement('div');
  msg.className = `message ${type}`;
  if (type === 'assistant' || type === 'user') {
    msg.innerHTML = `<div class="message-bubble">${content}</div>`;
    if (extra) msg.querySelector('.message-bubble').innerHTML += extra;
  } else {
    msg.innerHTML = content;
  }
  container.appendChild(msg);
  container.scrollTop = container.scrollHeight;
}

function addApiCallMessage(method, endpoint, body) {
  const bodyStr = body ? JSON.stringify(body, null, 2) : '';
  addMessage('api-call', `
    <div class="api-call-bubble">
      <div class="api-call-header">
        <span class="api-method ${method.toLowerCase()}">${method}</span>
        <span class="api-endpoint">${endpoint}</span>
      </div>
      ${bodyStr ? `<div class="api-call-body">${escapeHtml(bodyStr)}</div>` : ''}
    </div>
  `);
}

function addTypingIndicator() {
  const container = document.getElementById('chat-messages');
  const typing = document.createElement('div');
  typing.className = 'message assistant';
  typing.id = 'typing-indicator';
  typing.innerHTML = '<div class="typing-indicator"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div>';
  container.appendChild(typing);
  container.scrollTop = container.scrollHeight;
}

function removeTypingIndicator() { const el = document.getElementById('typing-indicator'); if (el) el.remove(); }

async function assistantSay(text, extra = null, delay = 400) {
  addTypingIndicator(); await sleep(delay); removeTypingIndicator();
  addMessage('assistant', text, extra);
}

// Quick Actions
function setQuickActions(actions) {
  document.getElementById('quick-actions').innerHTML = actions.map(a =>
    `<button class="quick-action-btn ${a.primary ? 'primary' : ''}" onclick="${a.action}">${a.label}</button>`
  ).join('');
}
function clearQuickActions() { document.getElementById('quick-actions').innerHTML = ''; }

// Catalog
async function searchCatalog(query = '') {
  addMessage('user', query ? `Search: "${query}"` : 'Browse products');
  try {
    const results = await fetchShopApi('POST', `${API_BASE}/catalog/search`, { query: query || undefined, page_size: 20 });
    shopState.products = results.items;
    if (!results.items.length) { await assistantSay('No products found.'); return; }
    await assistantSay(`Found <strong>${results.total_count}</strong> product${results.total_count !== 1 ? 's' : ''}:`, renderProductsInChat(results.items));
    updateBrowsingActions();
  } catch (e) { await assistantSay(`Search failed: ${e.message}`); }
}

async function searchByCategory(cat) {
  addMessage('user', `Filter: ${cat}`);
  try {
    const r = await fetchShopApi('POST', `${API_BASE}/catalog/search`, { filters: { category: cat } });
    shopState.products = r.items;
    await assistantSay(`${r.total_count} in <strong>${cat}</strong>:`, renderProductsInChat(r.items));
    updateBrowsingActions();
  } catch (e) { await assistantSay(`Error: ${e.message}`); }
}

function renderProductsInChat(items) {
  return `<div class="products-grid-chat">${items.map(p => `
    <div class="product-card-chat ${p.availability !== 'in_stock' ? 'out-of-stock' : ''}"
         onclick="${p.availability === 'in_stock' ? `addToCart('${p.id}')` : ''}">
      <div class="product-image"><img src="${p.image_url || ''}" alt="${p.name}" loading="lazy" /></div>
      <div class="product-info">
        <div class="product-name">${p.name}</div>
        <div class="product-price">${formatCurrency(p.price.amount)}</div>
        <div class="product-category">${p.category || ''}</div>
        ${p.availability !== 'in_stock' ? '<div class="product-stock">Out of Stock</div>' : ''}
      </div>
    </div>
  `).join('')}</div>`;
}

function updateBrowsingActions() {
  const a = [];
  if (shopState.cart.length > 0) {
    a.push({ label: `Checkout (${shopState.cart.length})`, action: 'startCheckout()', primary: true });
    a.push({ label: 'View Cart', action: 'viewCart()' });
  }
  a.push({ label: '🔍 Search', action: 'promptSearch()' });
  a.push({ label: '🏠 Smart Home', action: "searchByCategory('smart-home')" });
  a.push({ label: '⌚ Wearables', action: "searchByCategory('wearables')" });
  setQuickActions(a);
}

function promptSearch() { document.getElementById('chat-input').focus(); }

// Cart
async function addToCart(id) {
  const p = shopState.products.find(x => x.id === id);
  if (!p) return;
  const ex = shopState.cart.find(i => i.id === id);
  if (ex) ex.quantity++; else shopState.cart.push({ id, name: p.name, price: p.price.amount, quantity: 1 });
  updateCartBadge();
  addMessage('user', `Add ${p.name}`);
  const total = shopState.cart.reduce((s, i) => s + i.price * i.quantity, 0);
  await assistantSay(`Added <strong>${p.name}</strong>. Cart: ${formatCurrency(total)}`);
  updateBrowsingActions();
}

function viewCart() {
  if (!shopState.cart.length) { assistantSay("Cart is empty!"); return; }
  addMessage('user', 'View cart');
  const total = shopState.cart.reduce((s, i) => s + i.price * i.quantity, 0);
  assistantSay('Your cart:', `<div class="order-summary-chat">${shopState.cart.map(i => `
    <div class="order-line"><span>${i.name} ×${i.quantity}</span><span>${formatCurrency(i.price * i.quantity)}</span></div>
  `).join('')}<div class="order-line total"><span>Subtotal</span><span>${formatCurrency(total)}</span></div></div>`);
  setQuickActions([
    { label: 'Checkout', action: 'startCheckout()', primary: true },
    { label: 'Clear Cart', action: 'clearCart()' },
  ]);
}

function clearCart() {
  shopState.cart = []; updateCartBadge();
  addMessage('user', 'Clear cart'); assistantSay('Cart cleared!'); updateBrowsingActions();
}

function updateCartBadge() {
  document.getElementById('cart-count').textContent = shopState.cart.reduce((s, i) => s + i.quantity, 0);
}

// Checkout
async function startCheckout() {
  if (!shopState.cart.length) { assistantSay("Cart is empty."); return; }
  addMessage('user', 'Checkout');
  await assistantSay("Creating cart and checkout session via UCP APIs...");
  try {
    const cart = await fetchShopApi('POST', `${API_BASE}/shopping/cart`, {
      currency: 'USD', items: shopState.cart.map(i => ({ item_id: i.id, quantity: i.quantity })),
    });
    shopState.checkout = await fetchShopApi('POST', `${API_BASE}/shopping/checkout-sessions`, {
      cart_id: cart.id, currency: 'USD',
      payment: { instruments: [{ id: 'inst-mock', handler_id: 'mock-payment-handler', type: 'token', display_name: 'Test Payment' }] },
    });
    await assistantSay('Checkout created! Select shipping:', renderFulfillmentOptions(shopState.checkout.fulfillment_options || []));
    clearQuickActions();
  } catch (e) { await assistantSay(`Error: ${e.message}`); }
}

function renderFulfillmentOptions(opts) {
  return `<div class="fulfillment-options">${opts.map(o => `
    <button class="fulfillment-option" onclick="selectFulfillment('${o.id}')">
      <div class="fulfillment-option-header"><span>${o.type === 'shipping' ? '📦' : '🏪'}</span> <strong>${o.name}</strong></div>
      <div class="fulfillment-option-detail">${o.description || ''}</div>
      <div class="fulfillment-option-price">${o.price === 0 ? 'FREE' : formatCurrency(o.price)}</div>
    </button>
  `).join('')}</div>`;
}

async function selectFulfillment(optId) {
  const opt = (shopState.checkout.fulfillment_options || []).find(o => o.id === optId);
  addMessage('user', `Ship: ${opt?.name}`);
  try {
    shopState.checkout = await fetchShopApi('PUT', `${API_BASE}/shopping/checkout-sessions/${shopState.checkout.id}`, {
      fulfillment: { selected_option_id: optId, shipping_address: { street_address: '123 AI Blvd', locality: 'San Francisco', region: 'CA', postal_code: '94105', country_code: 'US' } },
      buyer: { name: 'Demo User', email: 'demo@example.com' },
      payment: { selected_instrument_id: 'inst-mock' },
      consent: { terms_accepted: true, privacy_accepted: true },
    });
    await assistantSay(`Shipping: <strong>${opt?.name}</strong>. Got a promo code?`, `
      <div class="discount-input-group" style="margin-top: 0.5rem;">
        <input type="text" id="discount-code" class="chat-form-input" placeholder="SAVE10, FREESHIP, FLAT20">
        <button class="quick-action-btn primary" onclick="applyDiscount()">Apply</button>
      </div>
    `);
    setQuickActions([{ label: 'Skip → Pay Now', action: 'completeCheckout()', primary: true }]);
  } catch (e) { await assistantSay(`Error: ${e.message}`); }
}

async function applyDiscount() {
  const code = document.getElementById('discount-code')?.value?.trim();
  if (!code) return;
  addMessage('user', `Promo: ${code}`);
  try {
    shopState.checkout = await fetchShopApi('POST', `${API_BASE}/shopping/checkout-sessions/${shopState.checkout.id}/discount`, { code });
    const d = shopState.checkout.discount;
    await assistantSay(`✅ <strong>${d.description}</strong> applied! Discount: -${formatCurrency(d.amount)}`);
    setQuickActions([{ label: 'Pay Now', action: 'completeCheckout()', primary: true }]);
  } catch (e) { await assistantSay(`❌ ${e.message}`); }
}

async function completeCheckout() {
  addMessage('user', 'Complete order');
  await assistantSay("Processing payment...");
  try {
    shopState.checkout = await fetchShopApi('POST', `${API_BASE}/shopping/checkout-sessions/${shopState.checkout.id}/complete`, {
      payment_data: { handler_id: 'mock-payment-handler', token: 'success_token' },
    });
    shopState.orderId = shopState.checkout.order?.id;
    await assistantSay(`
      <div class="confirmation-bubble">
        <div class="confirmation-icon">✓</div>
        <h3>Order Confirmed!</h3>
        <div class="order-id-display">${shopState.checkout.order.id}</div>
        <p style="margin-top:0.5rem">Total: <strong>${formatCurrency(shopState.checkout.totals.total)}</strong></p>
      </div>
    `);
    shopState.cart = []; updateCartBadge();
    setQuickActions([
      { label: '📦 View Order', action: 'viewOrder()', primary: true },
      { label: '🔁 New Order', action: 'resetShop()' },
    ]);
  } catch (e) { await assistantSay(`Payment failed: ${e.message}`); }
}

async function viewOrder() {
  if (!shopState.orderId) return;
  addMessage('user', `View order ${shopState.orderId}`);
  try {
    const order = await fetchShopApi('GET', `${API_BASE}/shopping/orders/${shopState.orderId}`);
    const items = order.line_items.map(i => `<div class="order-line"><span>${i.item.name} ×${i.quantity}</span><span>${formatCurrency(i.total_price)}</span></div>`).join('');
    const tracking = order.fulfillment?.tracking_number ? `<div class="tracking-number">Tracking: ${order.fulfillment.tracking_number}</div>` : '';
    await assistantSay(`Order ${order.id}:`, `
      <div class="order-summary-chat">
        <div class="order-status-badge ${order.status}">${order.status.toUpperCase()}</div>
        ${items}
        <div class="order-line total"><span>Total</span><span>${formatCurrency(order.totals.total)}</span></div>
        ${tracking}
      </div>
    `);
    setQuickActions([{ label: '🔁 New Order', action: 'resetShop()', primary: true }]);
  } catch (e) { await assistantSay(`Error: ${e.message}`); }
}

// Chat Input
function handleChatKeypress(e) { if (e.key === 'Enter') sendMessage(); }

function sendMessage() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim(); if (!text) return;
  input.value = '';
  addMessage('user', escapeHtml(text));
  processUserMessage(text);
}

async function processUserMessage(text) {
  const l = text.toLowerCase();
  if (l.includes('checkout') || l.includes('buy')) startCheckout();
  else if (l.includes('cart')) viewCart();
  else if (l.includes('clear')) clearCart();
  else if (l.includes('order') && shopState.orderId) viewOrder();
  else if (l.includes('help')) {
    await assistantSay(
      "Commands:<br>• <strong>search [query]</strong> - Search catalog<br>• Click products to add to cart<br>" +
      "• <strong>cart</strong> / <strong>checkout</strong> / <strong>order</strong><br>" +
      "• Promo codes: <code>SAVE10</code> <code>FREESHIP</code> <code>FLAT20</code>"
    );
  } else { searchCatalog(text); }
}

function resetShop() {
  shopState.checkout = null; shopState.orderId = null; shopState.cart = [];
  updateCartBadge();
  document.getElementById('chat-messages').innerHTML = '';
  clearQuickActions(); initShopChat();
}

// Debug
function toggleDebugMode() {
  shopState.debugMode = document.getElementById('debug-mode').checked;
  document.getElementById('debug-panel').style.display = shopState.debugMode ? 'flex' : 'none';
  updateDebugPanel();
}

function switchDebugTab(tab) {
  document.querySelectorAll('.debug-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.debug-tab-content').forEach(c => c.classList.remove('active'));
  document.querySelector(`.debug-tab[data-tab="${tab}"]`).classList.add('active');
  document.getElementById(`debug-${tab}`).classList.add('active');
}

function updateDebugPanel() {
  const tl = document.getElementById('debug-timeline');
  if (tl) tl.innerHTML = shopState.timeline.slice(0, 30).map(e => `
    <div class="timeline-entry"><span class="timeline-time">${e.time}</span><span class="timeline-event">${e.event}</span></div>
  `).join('');

  const rl = document.getElementById('requests-log');
  if (rl) rl.innerHTML = shopState.requests.slice(0, 15).map(r => `
    <div class="request-entry">
      <div class="request-entry-header" onclick="this.parentElement.classList.toggle('expanded')">
        <span class="api-method ${r.method.toLowerCase()}">${r.method}</span>
        <span>${r.endpoint}</span>
        <span class="status-badge ${r.status < 400 ? 'success' : 'error'}">${r.status}</span>
        <span style="margin-left:auto;color:var(--text-muted)">${r.duration}ms</span>
      </div>
      <div class="request-entry-body">
        <div><strong>Request:</strong></div><pre style="color:#a5f3fc;margin:0.5rem 0">${r.body ? JSON.stringify(r.body, null, 2) : 'null'}</pre>
        <div><strong>Response:</strong></div><pre style="color:#86efac;margin:0.5rem 0">${JSON.stringify(r.response, null, 2)}</pre>
      </div>
    </div>
  `).join('');
}

function addTimelineEntry(event, type = 'info') {
  shopState.timeline.unshift({ time: new Date().toTimeString().split(' ')[0], event, type });
  if (shopState.debugMode) updateDebugPanel();
}

// Init
async function initShopChat() {
  await assistantSay("Welcome to the <strong>UCP Shop Demo</strong>!<br><br>This shows a chat-style shopping experience backed by UCP APIs. Toggle <strong>Debug</strong> to see raw API calls.", null, 600);
  await sleep(300);
  await assistantSay("Searching the catalog...");
  try {
    const r = await fetchShopApi('POST', `${API_BASE}/catalog/search`, { page_size: 20 });
    shopState.products = r.items;
    await assistantSay(`<strong>${r.total_count}</strong> products available. Click to add:`, renderProductsInChat(r.items), 300);
  } catch (e) { await assistantSay(`Failed to load: ${e.message}`); }
  updateBrowsingActions();
}

async function initShopDemo() {
  document.getElementById('loading').style.display = 'flex';
  await sleep(300);
  document.getElementById('loading').style.display = 'none';
  initShopChat();
}

// ============================================================================
// Helpers
// ============================================================================

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function escapeHtml(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function formatCurrency(cents) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100); }

// Debug panel resize
document.addEventListener('DOMContentLoaded', () => {
  const handle = document.getElementById('debug-resize-handle');
  const panel = document.getElementById('debug-panel');
  if (!handle || !panel) return;
  let resizing = false, startY = 0, startH = 0;
  handle.addEventListener('mousedown', e => { resizing = true; startY = e.clientY; startH = panel.offsetHeight; document.body.style.cursor = 'ns-resize'; e.preventDefault(); });
  document.addEventListener('mousemove', e => { if (!resizing) return; panel.style.height = Math.min(Math.max(startH + (startY - e.clientY), 100), window.innerHeight * 0.6) + 'px'; });
  document.addEventListener('mouseup', () => { if (resizing) { resizing = false; document.body.style.cursor = ''; } });
});
