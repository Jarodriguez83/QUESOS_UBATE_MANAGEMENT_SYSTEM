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

  function addProductCard(card, fromScanner = false) {
    const id = card.dataset.productId;
    const item = cart.get(id) || { id, name: card.dataset.name, price: Number(card.dataset.price), quantity: 0 };
    if (item.quantity >= Number(card.dataset.stock)) {
      if (fromScanner) setScannerStatus(`No hay existencias disponibles de ${card.dataset.name}.`, 'error');
      else window.alert('No hay más unidades disponibles de este producto.');
      return false;
    }
    item.quantity += 1;
    cart.set(id, item);
    drawCart();
    return true;
  }

  grid.addEventListener('click', (event) => {
    const card = event.target.closest('[data-product-id]');
    if (!card) return;
    addProductCard(card);
  });

  document.querySelector('#clear-cart').addEventListener('click', () => { cart.clear(); drawCart(); });
  document.querySelector('#product-search').addEventListener('input', (event) => {
    const query = event.target.value.trim().toLocaleLowerCase('es');
    for (const card of grid.querySelectorAll('[data-product-id]')) {
      card.hidden = !`${card.dataset.name} ${card.dataset.category} ${card.dataset.sku}`.toLocaleLowerCase('es').includes(query);
    }
  });
  document.querySelector('#checkout-form').addEventListener('submit', (event) => {
    if (!cart.size) { event.preventDefault(); return; }
    checkout.disabled = true;
    checkout.textContent = 'Registrando venta…';
  });
  drawCart();

  const scannerDialog = document.querySelector('#barcode-panel');
  if (!scannerDialog) return;
  const scannerStatus = document.querySelector('#scanner-status');
  const startScannerButton = document.querySelector('#start-barcode-camera');
  const stopScannerButton = document.querySelector('#stop-barcode-camera');
  const scannerReaderId = 'barcode-reader';
  let scanner = null;
  let scannerRunning = false;
  let scannerLocked = false;
  let nativeStream = null;
  let nativeVideo = null;
  let nativeScanFrame = null;
  let nativeDetectionBusy = false;

  function setScannerStatus(message, kind = '') {
    scannerStatus.textContent = message;
    scannerStatus.dataset.kind = kind;
  }

  function findProductByCode(code) {
    const normalizedCode = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!normalizedCode) return null;
    return [...grid.querySelectorAll('[data-product-id]')].find((card) => {
      const normalizedSku = card.dataset.sku.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      return normalizedSku && normalizedSku === normalizedCode;
    }) || null;
  }

  async function stopScanner(clear = true) {
    if (scanner && scannerRunning) {
      try { await scanner.stop(); } catch (_) { /* Stream may already have stopped. */ }
      scannerRunning = false;
    }
    if (nativeScanFrame !== null) {
      window.cancelAnimationFrame(nativeScanFrame);
      nativeScanFrame = null;
    }
    if (nativeStream) {
      nativeStream.getTracks().forEach((track) => track.stop());
      nativeStream = null;
      scannerRunning = false;
    }
    if (nativeVideo) {
      nativeVideo.pause();
      nativeVideo.srcObject = null;
      nativeVideo.remove();
      nativeVideo = null;
    }
    stopScannerButton.hidden = true;
    startScannerButton.hidden = false;
    if (scanner && clear) {
      try { scanner.clear(); } catch (_) { /* Reader may not have initialized. */ }
      scanner = null;
    }
  }

  async function acceptScannedCode(code, formatName = '') {
    if (scannerLocked) return;
    scannerLocked = true;
    const card = findProductByCode(code);
    if (!card) {
      const format = formatName ? ` (${formatName})` : '';
      setScannerStatus(`Código leído${format}: ${code}. No hay un producto con ese SKU. En Productos, edita el artículo y guarda este valor en SKU.`, 'error');
      scannerLocked = false;
      return;
    }
    await stopScanner();
    const added = addProductCard(card, true);
    if (added) {
      document.querySelector('#product-search').value = '';
      for (const productCard of grid.querySelectorAll('[data-product-id]')) productCard.hidden = false;
      setScannerStatus(`${card.dataset.name} agregado al carrito.`, 'success');
      window.setTimeout(() => {
        if (!scannerDialog.hidden) closeScannerDialog();
      }, 650);
    }
    scannerLocked = false;
  }

  async function startNativeScanner() {
    const Detector = window.BarcodeDetector;
    if (!Detector || !navigator.mediaDevices?.getUserMedia) {
      setScannerStatus('Este navegador no pudo cargar el lector de códigos. Prueba con conexión a internet o ingresa el SKU manualmente.', 'error');
      return false;
    }
    const availableFormats = typeof Detector.getSupportedFormats === 'function'
      ? await Detector.getSupportedFormats()
      : ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'upc_ean_extension', 'code_128', 'code_39', 'code_93', 'codabar', 'itf', 'qr_code', 'data_matrix', 'pdf417', 'aztec'];
    const formats = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'upc_ean_extension', 'code_128', 'code_39', 'code_93', 'codabar', 'itf', 'qr_code', 'data_matrix', 'pdf417', 'aztec']
      .filter((format) => availableFormats.includes(format));
    if (!formats.length) {
      setScannerStatus('Este navegador no detecta formatos de barras compatibles. Ingresa el SKU manualmente.', 'error');
      return false;
    }
    const detector = new Detector({ formats });
    nativeStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' } },
    });
    nativeVideo = document.createElement('video');
    nativeVideo.className = 'barcode-native-video';
    nativeVideo.autoplay = true;
    nativeVideo.playsInline = true;
    nativeVideo.muted = true;
    nativeVideo.srcObject = nativeStream;
    document.querySelector(`#${scannerReaderId}`).replaceChildren(nativeVideo);
    await nativeVideo.play();
    scannerRunning = true;
    const scanFrame = async () => {
      if (!scannerRunning || !nativeVideo) return;
      if (nativeVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && !nativeDetectionBusy) {
        nativeDetectionBusy = true;
        try {
          const codes = await detector.detect(nativeVideo);
          if (codes.length) await acceptScannedCode(codes[0].rawValue, codes[0].format);
        } catch (_) { /* Keep scanning while the camera is adjusting. */ }
        finally { nativeDetectionBusy = false; }
      }
      if (scannerRunning && nativeVideo) nativeScanFrame = window.requestAnimationFrame(scanFrame);
    };
    nativeScanFrame = window.requestAnimationFrame(scanFrame);
    return true;
  }

  function openScannerDialog() {
    scannerDialog.hidden = false;
    document.body.classList.add('scanner-open');
  }

  function closeScannerDialog() {
    scannerDialog.hidden = true;
    document.body.classList.remove('scanner-open');
    scannerLocked = false;
    stopScanner();
  }

  document.querySelector('#open-barcode-scanner').addEventListener('click', () => {
    scannerLocked = false;
    openScannerDialog();
    setScannerStatus('La cámara se abrirá ahora. Permite el acceso si el navegador lo solicita.');
    startScannerButton.focus({ preventScroll: true });
    // The camera prompt is started from the user's click so it doesn't require
    // a second interaction after the dialog opens.
    startScannerButton.click();
  });

  startScannerButton.addEventListener('click', async () => {
    startScannerButton.disabled = true;
    setScannerStatus('Solicitando acceso a la cámara…');
    try {
      if (window.Html5Qrcode && window.Html5QrcodeSupportedFormats) {
        const formats = window.Html5QrcodeSupportedFormats;
        const supportedFormats = [formats.EAN_13, formats.EAN_8, formats.UPC_A, formats.UPC_E,
          formats.UPC_EAN_EXTENSION, formats.CODE_128, formats.CODE_39, formats.CODE_93,
          formats.CODABAR, formats.ITF, formats.QR_CODE, formats.DATA_MATRIX, formats.PDF_417, formats.AZTEC]
          .filter((format) => format !== undefined);
        scanner = new window.Html5Qrcode(scannerReaderId, { formatsToSupport: supportedFormats });
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 12, qrbox: (width, height) => ({ width: Math.max(1, Math.min(width - 24, 480)), height: Math.max(1, Math.min(210, height - 24)) }), aspectRatio: 1.333334 },
          (decodedText, result) => acceptScannedCode(decodedText, result?.result?.format?.formatName),
          () => {},
        );
        scannerRunning = true;
      } else {
        const started = await startNativeScanner();
        if (!started) return;
      }
      startScannerButton.hidden = true;
      stopScannerButton.hidden = false;
      setScannerStatus('Lector activo: EAN, UPC, Code 128, QR y más. Centra el código frente a la cámara.');
    } catch (error) {
      await stopScanner();
      const detail = error && error.name === 'NotAllowedError'
        ? 'Permite el acceso a la cámara en los ajustes del navegador.'
        : 'No fue posible iniciar la cámara. Abre el sistema en localhost o HTTPS y verifica los permisos.';
      setScannerStatus(detail, 'error');
    } finally {
      startScannerButton.disabled = false;
    }
  });

  stopScannerButton.addEventListener('click', async () => {
    await stopScanner();
    setScannerStatus('Cámara detenida. Puedes volver a iniciarla o ingresar un SKU.');
  });

  document.querySelector('#close-barcode-scanner').addEventListener('click', closeScannerDialog);
  scannerDialog.addEventListener('click', (event) => {
    if (event.target === scannerDialog) closeScannerDialog();
  });
  scannerDialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeScannerDialog();
  });
  document.querySelector('#manual-code-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = document.querySelector('#manual-product-code');
    if (!input.value.trim()) return;
    await acceptScannedCode(input.value);
    if (scannerDialog.open) input.select();
  });
})();
