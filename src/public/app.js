/**
 * UCP Demo Shop - Chat Interface
 *
 * AI Assistant-style checkout flow with debug mode
 * to show UCP API calls in real-time.
 */

// ============================================================================
// Navigation
// ============================================================================

function showDemo() {
  document.getElementById('landing').style.display = 'none';
  document.getElementById('demo-app').classList.add('active');
  init();
}

function showLanding() {
  document.getElementById('landing').style.display = 'flex';
  document.getElementById('demo-app').classList.remove('active');
}

// ============================================================================
// State
// ============================================================================

let initialized = false;
const state = {
  products: [],
  cart: [], // { product, quantity }
  checkout: null,
  discoveryProfile: null,
  debugMode: false,
  chatPhase: 'welcome', // welcome, browsing, checkout-review, checkout-info, checkout-payment, completed
  timeline: [],
  requests: [],
};

const productImages = {
  'rose-bouquet': 'https://images.unsplash.com/photo-1518882605630-8eb7c1f20667?w=200&h=200&fit=crop',
  'tulip-arrangement': 'https://images.unsplash.com/photo-1520763185298-1b434c919102?w=200&h=200&fit=crop',
  'orchid-plant': 'https://images.unsplash.com/photo-1566873535350-a3f5d4a804b7?w=200&h=200&fit=crop',
  'sunflower-bunch': 'https://images.unsplash.com/photo-1597848212624-a19eb35e2651?w=200&h=200&fit=crop',
  'mixed-wildflowers': 'https://images.unsplash.com/photo-1490750967868-88aa4486c946?w=200&h=200&fit=crop',
};

const API_BASE = '/api/shopping';

// ============================================================================
// API with Debug Logging
// ============================================================================

async function fetchApi(method, endpoint, body = null) {
  const startTime = Date.now();
  const requestId = Math.random().toString(36).substr(2, 9);

  // Log to debug
  addTimelineEntry(`${method} ${endpoint}`);

  const options = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  // Show API call in chat if in debug mode or during checkout
  if (state.debugMode || state.chatPhase.startsWith('checkout')) {
    addApiCallMessage(method, endpoint, body);
  }

  try {
    const response = await fetch(endpoint, options);
    const data = await response.json();
    const duration = Date.now() - startTime;

    // Log request
    state.requests.unshift({
      id: requestId,
      method,
      endpoint,
      body,
      status: response.status,
      response: data,
      duration,
      timestamp: new Date().toISOString(),
    });

    updateDebugPanel();

    if (!response.ok) {
      throw new Error(data.error || `Request failed: ${response.status}`);
    }

    return data;
  } catch (error) {
    addTimelineEntry(`Error: ${error.message}`, 'error');
    throw error;
  }
}

// ============================================================================
// Chat Messages
// ============================================================================

function addMessage(type, content, extra = null) {
  const container = document.getElementById('chat-messages');
  const msg = document.createElement('div');
  msg.className = `message ${type}`;

  if (type === 'assistant' || type === 'user') {
    msg.innerHTML = `<div class="message-bubble">${content}</div>`;
    if (extra) {
      msg.querySelector('.message-bubble').innerHTML += extra;
    }
  } else {
    msg.innerHTML = content;
  }

  container.appendChild(msg);
  container.scrollTop = container.scrollHeight;
}

function addApiCallMessage(method, endpoint, body) {
  const bodyStr = body ? JSON.stringify(body, null, 2) : '';
  const html = `
    <div class="api-call-bubble">
      <div class="api-call-header">
        <span class="api-method ${method.toLowerCase()}">${method}</span>
        <span class="api-endpoint">${endpoint}</span>
      </div>
      ${bodyStr ? `<div class="api-call-body">${escapeHtml(bodyStr)}</div>` : ''}
    </div>
  `;
  addMessage('api-call', html);
}

function addTypingIndicator() {
  const container = document.getElementById('chat-messages');
  const typing = document.createElement('div');
  typing.className = 'message assistant';
  typing.id = 'typing-indicator';
  typing.innerHTML = `
    <div class="typing-indicator">
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
    </div>
  `;
  container.appendChild(typing);
  container.scrollTop = container.scrollHeight;
}

function removeTypingIndicator() {
  const el = document.getElementById('typing-indicator');
  if (el) el.remove();
}

async function assistantSay(text, extra = null, delay = 500) {
  addTypingIndicator();
  await sleep(delay);
  removeTypingIndicator();
  addMessage('assistant', text, extra);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatCurrency(cents) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

// ============================================================================
// Quick Actions
// ============================================================================

function setQuickActions(actions) {
  const container = document.getElementById('quick-actions');
  container.innerHTML = actions
    .map(
      (a) => `
    <button
      class="quick-action-btn ${a.primary ? 'primary' : ''}"
      onclick="${a.action}"
    >${a.label}</button>
  `
    )
    .join('');
}

function clearQuickActions() {
  document.getElementById('quick-actions').innerHTML = '';
}

// ============================================================================
// Products
// ============================================================================

async function loadProducts() {
  const data = await fetchApi('GET', `${API_BASE}/products`);
  state.products = data.products;
}

function renderProductsInChat() {
  const productsHtml = state.products
    .map(
      (p) => `
    <div
      class="product-card-chat ${!p.in_stock ? 'out-of-stock' : ''}"
      onclick="${p.in_stock ? `addToCart('${p.id}')` : ''}"
    >
      <div class="product-image">
        <img src="${productImages[p.id] || p.image_url}" alt="${p.name}" />
      </div>
      <div class="product-info">
        <div class="product-name">${p.name}</div>
        <div class="product-price">${formatCurrency(p.price)}</div>
        ${!p.in_stock ? '<div class="product-stock">Out of Stock</div>' : ''}
      </div>
    </div>
  `
    )
    .join('');

  return `<div class="products-grid-chat">${productsHtml}</div>`;
}

// ============================================================================
// Cart
// ============================================================================

function addToCart(productId) {
  const product = state.products.find((p) => p.id === productId);
  if (!product || !product.in_stock) return;

  const existing = state.cart.find((i) => i.product.id === productId);
  if (existing) {
    existing.quantity++;
  } else {
    state.cart.push({ product, quantity: 1 });
  }

  updateCartBadge();
  updateDebugPanel();

  // Chat response
  addMessage('user', `Add ${product.name}`);

  const total = getCartTotal();
  assistantSay(
    `Added <strong>${product.name}</strong> to your cart.<br>` +
      `<span style="color: var(--text-muted)">Cart total: ${formatCurrency(total)}</span>`
  );

  // Update quick actions
  if (state.cart.length > 0) {
    setQuickActions([
      { label: 'Checkout', action: 'startCheckout()', primary: true },
      { label: 'Clear Cart', action: 'clearCart()' },
    ]);
  }

  state.chatPhase = 'browsing';
}

function clearCart() {
  state.cart = [];
  updateCartBadge();
  updateDebugPanel();
  addMessage('user', 'Clear cart');
  assistantSay('Cart cleared! Browse products on the left to add items.');
  clearQuickActions();
}

function updateCartBadge() {
  const count = state.cart.reduce((sum, i) => sum + i.quantity, 0);
  document.getElementById('cart-count').textContent = count;
}

function getCartTotal() {
  return state.cart.reduce((sum, i) => sum + i.product.price * i.quantity, 0);
}

// ============================================================================
// Checkout Flow
// ============================================================================

async function startCheckout() {
  if (state.cart.length === 0) {
    assistantSay("Your cart is empty. Add some products first.");
    return;
  }

  addMessage('user', 'Checkout');
  state.chatPhase = 'checkout-review';

  await assistantSay("Let's start the checkout process! First, I'll create a checkout session with the UCP API.");

  // Create checkout session
  const payload = {
    line_items: state.cart.map((i) => ({
      item: { id: i.product.id },
      quantity: i.quantity,
    })),
    currency: 'USD',
    payment: {
      instruments: [
        { id: 'inst-mock', handler_id: 'mock-payment-handler', type: 'token', display_name: 'Test Payment' },
        { id: 'inst-card', handler_id: 'card-handler', type: 'card', display_name: 'Credit Card' },
      ],
    },
  };

  try {
    state.checkout = await fetchApi('POST', `${API_BASE}/checkout-sessions`, payload);

    // Show order summary
    const summaryHtml = renderOrderSummary(state.checkout);
    await assistantSay(
      `Checkout session created! Here's your order summary:` + summaryHtml
    );

    await sleep(500);
    await assistantSay(
      "I'll need some information to complete your order. Please fill in your details:",
      renderBuyerForm()
    );

    state.chatPhase = 'checkout-info';
    clearQuickActions();
  } catch (error) {
    await assistantSay(`Oops! Something went wrong: ${error.message}`);
  }
}

function renderOrderSummary(checkout) {
  const items = checkout.line_items
    .map(
      (i) => `
    <div class="order-line">
      <span>${i.item.name} x${i.quantity}</span>
      <span>${formatCurrency(i.total_price)}</span>
    </div>
  `
    )
    .join('');

  return `
    <div class="order-summary-chat">
      ${items}
      <div class="order-line"><span>Subtotal</span><span>${formatCurrency(checkout.totals.subtotal)}</span></div>
      <div class="order-line"><span>Tax</span><span>${formatCurrency(checkout.totals.tax)}</span></div>
      <div class="order-line"><span>Shipping</span><span>${checkout.totals.shipping === 0 ? 'FREE' : formatCurrency(checkout.totals.shipping)}</span></div>
      <div class="order-line total"><span>Total</span><span>${formatCurrency(checkout.totals.total)}</span></div>
    </div>
  `;
}

function renderBuyerForm() {
  return `
    <div class="chat-form" id="buyer-form">
      <div class="chat-form-group">
        <label>Full Name</label>
        <input type="text" id="form-name" placeholder="John Doe">
      </div>
      <div class="chat-form-group">
        <label>Email</label>
        <input type="email" id="form-email" placeholder="john@example.com">
      </div>
      <div class="chat-form-group">
        <label>Phone (optional)</label>
        <input type="tel" id="form-phone" placeholder="+1-555-123-4567">
      </div>
      <button class="chat-form-submit" onclick="submitBuyerInfo()">Continue</button>
    </div>
  `;
}

async function submitBuyerInfo() {
  const name = document.getElementById('form-name').value;
  const email = document.getElementById('form-email').value;
  const phone = document.getElementById('form-phone').value;

  if (!name || !email) {
    assistantSay("Please fill in your name and email to continue.");
    return;
  }

  addMessage('user', `${name}, ${email}`);

  await assistantSay("Great! Now I'll update the checkout session with your information.");

  try {
    state.checkout = await fetchApi('PUT', `${API_BASE}/checkout-sessions/${state.checkout.id}`, {
      buyer: { name, email, phone },
      payment: { selected_instrument_id: state.checkout.payment.instruments[0].id },
    });

    await assistantSay(
      `Thanks ${name}! Now please select a payment method:`,
      renderPaymentOptions()
    );

    state.chatPhase = 'checkout-payment';
  } catch (error) {
    await assistantSay(`Error updating checkout: ${error.message}`);
  }
}

function renderPaymentOptions() {
  const instruments = state.checkout.payment.instruments;
  const buttons = instruments
    .map(
      (i) => `
    <button class="quick-action-btn" onclick="selectPayment('${i.id}')">
      ${i.display_name}
    </button>
  `
    )
    .join('');

  return `<div style="margin-top: 0.75rem; display: flex; gap: 0.5rem; flex-wrap: wrap;">${buttons}</div>`;
}

async function selectPayment(instrumentId) {
  const instrument = state.checkout.payment.instruments.find((i) => i.id === instrumentId);
  addMessage('user', `Pay with ${instrument.display_name}`);

  await assistantSay("Processing your payment...");

  // Update with selected payment
  await fetchApi('PUT', `${API_BASE}/checkout-sessions/${state.checkout.id}`, {
    payment: { selected_instrument_id: instrumentId },
  });

  // Complete checkout
  try {
    state.checkout = await fetchApi('POST', `${API_BASE}/checkout-sessions/${state.checkout.id}/complete`, {
      payment_data: {
        handler_id: instrument.handler_id,
        token: 'success_token',
      },
    });

    // Show confirmation
    const confirmationHtml = `
      <div class="confirmation-bubble">
        <div class="confirmation-icon">✓</div>
        <h3>Order Confirmed!</h3>
        <p>Thank you for your purchase.</p>
        <div class="order-id-display">${state.checkout.order.id}</div>
      </div>
    `;

    await assistantSay(confirmationHtml);
    await sleep(500);
    await assistantSay(
      `Your order <strong>${state.checkout.order.id}</strong> has been placed! ` +
        `Total charged: <strong>${formatCurrency(state.checkout.totals.total)}</strong>`
    );

    state.chatPhase = 'completed';
    state.cart = [];
    updateCartBadge();

    setQuickActions([{ label: 'Start New Order', action: 'resetChat()', primary: true }]);
  } catch (error) {
    await assistantSay(`Payment failed: ${error.message}`);
  }
}

function resetChat() {
  state.checkout = null;
  state.chatPhase = 'welcome';
  document.getElementById('chat-messages').innerHTML = '';
  clearQuickActions();
  initChat();
}

// ============================================================================
// Chat Input
// ============================================================================

function handleChatKeypress(event) {
  if (event.key === 'Enter') {
    sendMessage();
  }
}

function sendMessage() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text) return;

  input.value = '';
  addMessage('user', escapeHtml(text));
  processUserMessage(text);
}

async function processUserMessage(text) {
  const lower = text.toLowerCase();

  if (lower.includes('checkout') || lower.includes('buy') || lower.includes('purchase')) {
    startCheckout();
  } else if (lower.includes('clear') || lower.includes('empty')) {
    clearCart();
  } else if (lower.includes('help')) {
    await assistantSay(
      "I can help you shop! Here's what you can do:<br>" +
        "• Click products on the left to add them to your cart<br>" +
        "• Say <strong>checkout</strong> to start the checkout process<br>" +
        "• Say <strong>clear cart</strong> to empty your cart<br>" +
        "• Toggle <strong>Debug Mode</strong> to see UCP API calls"
    );
  } else if (lower.includes('cart')) {
    if (state.cart.length === 0) {
      await assistantSay("Your cart is empty. Click on products to add them.");
    } else {
      const items = state.cart
        .map((i) => `${i.product.name} x${i.quantity}`)
        .join('<br>');
      await assistantSay(`Your cart:<br>${items}<br><br>Total: ${formatCurrency(getCartTotal())}`);
    }
  } else {
    await assistantSay(
      "I'm not sure what you mean. Try saying <strong>checkout</strong>, <strong>help</strong>, or click a product to add it to your cart!"
    );
  }
}

// ============================================================================
// Debug Mode
// ============================================================================

function toggleDebugMode() {
  state.debugMode = document.getElementById('debug-mode').checked;
  const panel = document.getElementById('debug-panel');
  panel.style.display = state.debugMode ? 'flex' : 'none';
  updateDebugPanel();
}

function switchDebugTab(tab) {
  document.querySelectorAll('.debug-tab').forEach((t) => t.classList.remove('active'));
  document.querySelectorAll('.debug-tab-content').forEach((c) => c.classList.remove('active'));
  document.querySelector(`.debug-tab[data-tab="${tab}"]`).classList.add('active');
  document.getElementById(`debug-${tab}`).classList.add('active');
}

function updateDebugPanel() {
  // State
  document.getElementById('state-json').textContent = JSON.stringify(
    {
      chatPhase: state.chatPhase,
      cartItems: state.cart.length,
      checkoutId: state.checkout?.id || null,
      checkoutStatus: state.checkout?.status || null,
    },
    null,
    2
  );

  // Timeline
  const timelineEl = document.getElementById('debug-timeline');
  timelineEl.innerHTML = state.timeline
    .slice(0, 20)
    .map(
      (e) => `
    <div class="timeline-entry">
      <span class="timeline-time">${e.time}</span>
      <span class="timeline-event">${e.event}</span>
    </div>
  `
    )
    .join('');

  // Requests
  const requestsEl = document.getElementById('requests-log');
  requestsEl.innerHTML = state.requests
    .slice(0, 10)
    .map(
      (r) => `
    <div class="request-entry">
      <div class="request-entry-header" onclick="this.parentElement.classList.toggle('expanded')">
        <span class="api-method ${r.method.toLowerCase()}">${r.method}</span>
        <span>${r.endpoint}</span>
        <span class="status-badge ${r.status < 400 ? 'success' : 'error'}">${r.status}</span>
        <span style="margin-left: auto; color: var(--text-muted)">${r.duration}ms</span>
      </div>
      <div class="request-entry-body">
        <div><strong>Request:</strong></div>
        <pre style="color: #a5f3fc; margin: 0.5rem 0">${r.body ? JSON.stringify(r.body, null, 2) : 'null'}</pre>
        <div><strong>Response:</strong></div>
        <pre style="color: #86efac; margin: 0.5rem 0">${JSON.stringify(r.response, null, 2)}</pre>
      </div>
    </div>
  `
    )
    .join('');
}

function addTimelineEntry(event, type = 'info') {
  const now = new Date();
  const time = now.toTimeString().split(' ')[0];
  state.timeline.unshift({ time, event, type });
  if (state.debugMode) {
    updateDebugPanel();
  }
}

// ============================================================================
// Discovery Modal
// ============================================================================

async function loadDiscovery() {
  const response = await fetch('/.well-known/ucp');
  state.discoveryProfile = await response.json();
}

function showDiscovery() {
  document.getElementById('discovery-json').textContent = JSON.stringify(
    state.discoveryProfile,
    null,
    2
  );
  document.getElementById('discovery-modal').classList.add('active');
}

function hideDiscovery() {
  document.getElementById('discovery-modal').classList.remove('active');
}

document.getElementById('discovery-modal').addEventListener('click', (e) => {
  if (e.target.id === 'discovery-modal') hideDiscovery();
});

// ============================================================================
// Initialize
// ============================================================================

async function initChat() {
  await assistantSay(
    "Welcome to the <strong>UCP Demo Shop</strong>.<br><br>" +
      "I'll help you checkout using the <strong>Universal Commerce Protocol</strong>. " +
      "Click on a product below to add it to your cart, then say <strong>checkout</strong> when you're ready.",
    null,
    800
  );

  await sleep(400);

  // Show products in chat
  await assistantSay(
    "Here are our available products:",
    renderProductsInChat(),
    300
  );

  await sleep(400);
  await assistantSay(
    "<em>Tip: Toggle <strong>Debug Mode</strong> in the header to see the UCP API calls behind the scenes.</em>",
    null,
    300
  );
}

async function init() {
  if (initialized) return;
  initialized = true;

  document.getElementById('loading').style.display = 'flex';

  await Promise.all([loadProducts(), loadDiscovery()]);

  document.getElementById('loading').style.display = 'none';

  initChat();
}

// Don't auto-init - wait for user to click "Try Demo"

// ============================================================================
// Debug Panel Resize
// ============================================================================

function initDebugResize() {
  const handle = document.getElementById('debug-resize-handle');
  const panel = document.getElementById('debug-panel');

  if (!handle || !panel) return;

  let isResizing = false;
  let startY = 0;
  let startHeight = 0;

  handle.addEventListener('mousedown', (e) => {
    isResizing = true;
    startY = e.clientY;
    startHeight = panel.offsetHeight;
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const delta = startY - e.clientY;
    const newHeight = Math.min(Math.max(startHeight + delta, 100), window.innerHeight * 0.6);
    panel.style.height = newHeight + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
  });
}

// Initialize resize when DOM is ready
document.addEventListener('DOMContentLoaded', initDebugResize);
