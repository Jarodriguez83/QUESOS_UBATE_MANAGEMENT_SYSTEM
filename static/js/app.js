(() => {
  const grid = document.querySelector('#product-grid');
  if (!grid) return;

  const cart = new Map();
  const itemsEl = document.querySelector('#cart-items');
  const totalEl = document.querySelector('#cart-total');
  const countEl = document.querySelector('#cart-count');
  const payload = document.querySelector('#cart-payload');
  const checkout = document.querySelector('#checkout-button');
  const formatCOP = (amount) => new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', maximumFractionDigits: 0,
  }).format(amount);

  function drawCart() {
    itemsEl.replaceChildren();
    let total = 0;
    let count = 0;
    for (const [id, item] of cart) {
      const subtotal = item.price * item.quantity;
      total += subtotal;
      count += item.quantity;
      const row = document.createElement('div');
      row.className = 'cart-row';
      const detail = document.createElement('div');
      detail.className = 'cart-detail';
      const name = document.createElement('strong');
      name.textContent = item.name;
      const price = document.createElement('small');
      price.textContent = `${formatCOP(item.price)} c/u`;
      detail.append(name, price);
      const controls = document.createElement('div');
      controls.className = 'quantity-control';
      const minus = document.createElement('button');
      minus.type = 'button'; minus.textContent = '−'; minus.setAttribute('aria-label', `Restar ${item.name}`);
      minus.addEventListener('click', () => changeQuantity(id, -1));
      const quantity = document.createElement('span'); quantity.textContent = String(item.quantity);
      const plus = document.createElement('button');
      plus.type = 'button'; plus.textContent = '+'; plus.setAttribute('aria-label', `Sumar ${item.name}`);
      plus.addEventListener('click', () => changeQuantity(id, 1));
      controls.append(minus, quantity, plus);
      const amount = document.createElement('strong'); amount.className = 'cart-subtotal'; amount.textContent = formatCOP(subtotal);
      row.append(detail, controls, amount);
      itemsEl.append(row);
    }
    if (!cart.size) {
      const empty = document.createElement('div'); empty.className = 'cart-empty';
      empty.textContent = 'Tu carrito está vacío. Agrega productos para comenzar.';
      itemsEl.append(empty);
    }
    totalEl.textContent = formatCOP(total);
    countEl.textContent = `${count} ${count === 1 ? 'producto' : 'productos'}`;
    payload.value = JSON.stringify([...cart].map(([id, item]) => ({ id, quantity: item.quantity })));
    checkout.disabled = cart.size === 0;
  }

  function changeQuantity(id, delta) {
    const item = cart.get(String(id));
    if (!item) return;
    item.quantity += delta;
    if (item.quantity < 1) cart.delete(String(id));
    drawCart();
  }

  grid.addEventListener('click', (event) => {
    const card = event.target.closest('[data-product-id]');
    if (!card) return;
    const id = card.dataset.productId;
    const item = cart.get(id) || { id, name: card.dataset.name, price: Number(card.dataset.price), quantity: 0 };
    if (item.quantity >= Number(card.dataset.stock)) {
      window.alert('No hay más unidades disponibles de este producto.');
      return;
    }
    item.quantity += 1;
    cart.set(id, item);
    drawCart();
  });

  document.querySelector('#clear-cart').addEventListener('click', () => { cart.clear(); drawCart(); });
  document.querySelector('#product-search').addEventListener('input', (event) => {
    const query = event.target.value.trim().toLocaleLowerCase('es');
    for (const card of grid.querySelectorAll('[data-product-id]')) {
      card.hidden = !`${card.dataset.name} ${card.dataset.category}`.toLocaleLowerCase('es').includes(query);
    }
  });
  document.querySelector('#checkout-form').addEventListener('submit', (event) => {
    if (!cart.size) { event.preventDefault(); return; }
    checkout.disabled = true;
    checkout.textContent = 'Registrando venta…';
  });
  drawCart();
})();
