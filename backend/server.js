import express from 'express';
import cors from 'cors';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import dotenv from 'dotenv';
import { 
  initDb, 
  query, 
  logEvent 
} from './db.js';
import { 
  initGmailClient, 
  saveCredentials, 
  getAuthUrl, 
  saveAuthCode, 
  disconnectGmail, 
  isConnected,
  setBroadcastCallback,
  reconcileInbox
} from './gmail.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors({
  origin: '*', // Permitir cualquier origen en entorno local
  credentials: true
}));
app.use(express.json());

// Crear servidor HTTP para adjuntar WebSockets
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Set de conexiones activas de WebSockets
const clients = new Set();

wss.on('connection', async (ws) => {
  clients.add(ws);
  console.log('Cliente WebSocket conectado. Conexiones activas:', clients.size);

  try {
    // 1. Enviar estado de conexión inicial
    const connected = isConnected();
    const gmailConfigRow = await query.get("SELECT value FROM gmail_config WHERE key = 'client_id'");
    
    ws.send(JSON.stringify({
      type: 'STATUS_UPDATE',
      data: {
        gmailConnected: connected,
        gmailConfigured: !!gmailConfigRow
      }
    }));

    // 2. Enviar los últimos 50 pagos al conectarse
    const recentPayments = await query.all(
      'SELECT * FROM payments ORDER BY received_at DESC LIMIT 50'
    );
    ws.send(JSON.stringify({
      type: 'PAYMENTS_INIT',
      data: recentPayments
    }));

    // 3. Enviar los parsers activos
    const activeParsers = await query.all('SELECT bank_name, sender_email, is_active FROM parsers');
    ws.send(JSON.stringify({
      type: 'PARSERS_INIT',
      data: activeParsers
    }));

  } catch (err) {
    console.error('Error al inicializar sesión de WebSocket:', err.message);
  }

  ws.on('close', () => {
    clients.delete(ws);
    console.log('Cliente WebSocket desconectado. Conexiones activas:', clients.size);
  });
});

// Registrar callback para emitir nuevos pagos en tiempo real
setBroadcastCallback((payment) => {
  const message = JSON.stringify({
    type: 'NEW_PAYMENT',
    data: payment
  });
  
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
});

// Función para notificar cambios de estado general por WebSocket
function broadcastStatusUpdate(statusData) {
  const message = JSON.stringify({
    type: 'STATUS_UPDATE',
    data: statusData
  });
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// ==========================================
// RUTA DE AUTENTICACIÓN
// ==========================================

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña obligatorios.' });
  }

  try {
    const user = await query.get('SELECT * FROM users WHERE username = ? AND password = ?', [username, password]);
    if (user) {
      await logEvent('INFO', `Sesión iniciada correctamente: ${user.username} (${user.role})`);
      res.json({
        success: true,
        user: {
          username: user.username,
          role: user.role,
          name: user.name
        }
      });
    } else {
      await logEvent('WARNING', `Intento fallido de inicio de sesión para el usuario: ${username}`);
      res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// RUTAS DE LA API REST (GMAIL)
// ==========================================

// Estado general del sistema
app.get('/api/status', async (req, res) => {
  try {
    const connected = isConnected();
    const clientRow = await query.get("SELECT value FROM gmail_config WHERE key = 'client_id'");
    const activeParsers = await query.all('SELECT bank_name, sender_email, is_active FROM parsers');
    
    res.json({
      gmailConnected: connected,
      gmailConfigured: !!clientRow,
      parsers: activeParsers
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Guardar configuración de Gmail API
app.post('/api/gmail/config', async (req, res) => {
  const { clientId, clientSecret, redirectUri } = req.body;
  if (!clientId || !clientSecret || !redirectUri) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }

  try {
    const success = await saveCredentials(clientId, clientSecret, redirectUri);
    broadcastStatusUpdate({
      gmailConfigured: true,
      gmailConnected: isConnected()
    });
    res.json({ success: true, isConnected: success });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Obtener URL de autorización de Google
app.get('/api/gmail/auth-url', async (req, res) => {
  try {
    const authUrl = await getAuthUrl();
    res.json({ url: authUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Ruta Callback para recibir la redirección de Google OAuth
app.get('/api/gmail/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) {
    return res.status(400).send('Código de autorización no provisto.');
  }

  try {
    await saveAuthCode(code);
    broadcastStatusUpdate({
      gmailConnected: true,
      gmailConfigured: true
    });
    
    res.send(`
      <html>
        <head>
          <title>Autenticación Exitosa</title>
          <style>
            body { font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; background-color: #0f172a; color: #f8fafc; text-align: center; }
            .card { background: #1e293b; padding: 2.5rem; border-radius: 12px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); border: 1px solid #334155; }
            h1 { color: #38bdf8; margin-bottom: 1rem; }
            button { background: #0284c7; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 6px; font-weight: bold; cursor: pointer; transition: 0.2s; }
            button:hover { background: #0369a1; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>¡Conexión Exitosa con Gmail!</h1>
            <p>El sistema se ha conectado correctamente a tu cuenta de Gmail.</p>
            <p>Ya puedes cerrar esta pestaña y regresar a la aplicación de pagos.</p>
            <button onclick="window.close()">Cerrar Ventana</button>
          </div>
          <script>
            setTimeout(() => {
              window.close();
            }, 3000);
          </script>
        </html>
      `);
  } catch (err) {
    res.status(500).send(`Error de autorización: ${err.message}`);
  }
});

// Desconectar Gmail
app.post('/api/gmail/disconnect', async (req, res) => {
  try {
    await disconnectGmail();
    broadcastStatusUpdate({
      gmailConnected: false
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Obtener historial de pagos de Gmail con filtros
app.get('/api/payments', async (req, res) => {
  const { status, bank, search } = req.query;
  let sql = 'SELECT * FROM payments WHERE 1=1';
  const params = [];

  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }
  if (bank) {
    sql += ' AND bank_name = ?';
    params.push(bank);
  }
  if (search) {
    sql += ' AND (client_name LIKE ? OR reference LIKE ? OR raw_body LIKE ?)';
    const searchParam = `%${search}%`;
    params.push(searchParam, searchParam, searchParam);
  }

  sql += ' ORDER BY received_at DESC';

  try {
    const payments = await query.all(sql, params);
    res.json(payments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Actualizar un pago de Gmail manualmente (corregir error de parseo)
app.post('/api/payments/manual-update', async (req, res) => {
  const { id, client_name, amount, reference, payment_date } = req.body;
  if (!id || !client_name || !amount) {
    return res.status(400).json({ error: 'Faltan campos obligatorios para actualizar' });
  }

  try {
    await query.run(`
      UPDATE payments 
      SET client_name = ?, amount = ?, reference = ?, payment_date = ?, status = 'PROCESADO'
      WHERE id = ?
    `, [client_name, parseFloat(amount), reference, payment_date, id]);

    const updatedPayment = await query.get('SELECT * FROM payments WHERE id = ?', [id]);
    
    // Broadcast el pago actualizado
    clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({
          type: 'PAYMENT_UPDATED',
          data: updatedPayment
        }));
      }
    });

    await logEvent('INFO', `Pago corregido manualmente: ID ${id} - ${client_name} - $${amount}`);
    res.json({ success: true, payment: updatedPayment });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Obtener parsers de Gmail
app.get('/api/parsers', async (req, res) => {
  try {
    const parsers = await query.all('SELECT * FROM parsers');
    res.json(parsers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Guardar o actualizar un parser
app.post('/api/parsers', async (req, res) => {
  const { 
    id, bank_name, sender_email, subject_pattern, 
    regex_client, regex_amount, regex_reference, regex_date, is_active 
  } = req.body;

  if (!bank_name || !sender_email || !subject_pattern || !regex_client || !regex_amount || !regex_reference || !regex_date) {
    return res.status(400).json({ error: 'Faltan campos obligatorios en el parser' });
  }

  try {
    if (id) {
      await query.run(`
        UPDATE parsers 
        SET bank_name = ?, sender_email = ?, subject_pattern = ?, 
            regex_client = ?, regex_amount = ?, regex_reference = ?, regex_date = ?, is_active = ?
        WHERE id = ?
      `, [bank_name, sender_email, subject_pattern, regex_client, regex_amount, regex_reference, regex_date, is_active ?? 1, id]);
      await logEvent('INFO', `Parser de banco ${bank_name} actualizado.`);
    } else {
      await query.run(`
        INSERT INTO parsers (bank_name, sender_email, subject_pattern, regex_client, regex_amount, regex_reference, regex_date, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [bank_name, sender_email, subject_pattern, regex_client, regex_amount, regex_reference, regex_date, is_active ?? 1]);
      await logEvent('INFO', `Nuevo parser de banco ${bank_name} creado.`);
    }

    const allParsers = await query.all('SELECT bank_name, sender_email, is_active FROM parsers');
    broadcastStatusUpdate({ parsers: allParsers });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Eliminar un parser
app.delete('/api/parsers/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const parser = await query.get('SELECT bank_name FROM parsers WHERE id = ?', [id]);
    if (parser) {
      await query.run('DELETE FROM parsers WHERE id = ?', [id]);
      await logEvent('INFO', `Parser del banco ${parser.bank_name} eliminado.`);
      
      const allParsers = await query.all('SELECT bank_name, sender_email, is_active FROM parsers');
      broadcastStatusUpdate({ parsers: allParsers });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Obtener logs de auditoría
app.get('/api/logs', async (req, res) => {
  try {
    const logs = await query.all('SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 100');
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint de simulación de pagos de Gmail
app.post('/api/simulate-payment', async (req, res) => {
  const { bank_name, client_name, amount, reference, is_valid } = req.body;
  
  const simId = 'SIM-' + Math.random().toString(36).substr(2, 9).toUpperCase();
  const timestamp = new Date().toISOString();
  
  try {
    let paymentRecord;
    
    if (is_valid === false) {
      await query.run(`
        INSERT INTO payments (id, bank_name, client_name, amount, reference, payment_date, received_at, raw_body, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ERROR_PARSING')
      `, [
        simId,
        bank_name || 'Nequi',
        'ERROR PARSING',
        0,
        'ERROR',
        new Date().toLocaleString(),
        timestamp,
        `CORREO SIMULADO CON ERROR: Transferencia fallida de dinero por falta de regex adecuado.`
      ]);

      paymentRecord = {
        id: simId,
        bank_name: bank_name || 'Nequi',
        client_name: 'ERROR DE PARSEO',
        amount: 0,
        reference: 'ERROR',
        payment_date: new Date().toLocaleString(),
        received_at: timestamp,
        raw_body: 'CORREO SIMULADO CON ERROR: Transferencia fallida de dinero por falta de regex adecuado.',
        status: 'ERROR_PARSING'
      };

      await logEvent('WARNING', `Simulación: Registro de error de parseo en banco ${bank_name || 'Nequi'}`);
    } else {
      const finalAmount = parseFloat(amount) || 45000;
      await query.run(`
        INSERT INTO payments (id, bank_name, client_name, amount, reference, payment_date, received_at, raw_body, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PROCESADO')
      `, [
        simId,
        bank_name || 'Nequi',
        client_name || 'Juan Fernando Pérez',
        finalAmount,
        reference || '1029485731',
        new Date().toLocaleString(),
        timestamp,
        `CORREO SIMULADO: ${client_name || 'Juan Fernando Pérez'} te envió $${finalAmount}. Comprobante: ${reference || '1029485731'}`
      ]);

      paymentRecord = {
        id: simId,
        bank_name: bank_name || 'Nequi',
        client_name: client_name || 'Juan Fernando Pérez',
        amount: finalAmount,
        reference: reference || '1029485731',
        payment_date: new Date().toLocaleString(),
        received_at: timestamp,
        raw_body: `CORREO SIMULADO: ${client_name || 'Juan Fernando Pérez'} te envió $${finalAmount}. Comprobante: ${reference || '1029485731'}`,
        status: 'PROCESADO'
      };

      await logEvent('INFO', `Simulación: Pago recibido: ${paymentRecord.bank_name} - ${paymentRecord.client_name} - $${paymentRecord.amount}`);
    }

    clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({
          type: 'NEW_PAYMENT',
          data: paymentRecord
        }));
      }
    });

    res.json({ success: true, payment: paymentRecord });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ==========================================
// RUTAS DE LA API REST (SISTEMA POS)
// ==========================================

// --- 1. PRODUCTOS Y CONTROL DE INVENTARIO ---

// Obtener todos los productos (activos)
app.get('/api/products', async (req, res) => {
  try {
    const products = await query.all('SELECT * FROM products WHERE is_active = 1 ORDER BY name ASC');
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Guardar o actualizar un producto
app.post('/api/products', async (req, res) => {
  const { id, name, sku, category, price, cost, stock, min_stock, unit } = req.body;
  if (!name || !price || !cost) {
    return res.status(400).json({ error: 'Faltan campos obligatorios (Nombre, Precio, Costo)' });
  }

  try {
    if (id) {
      await query.run(`
        UPDATE products 
        SET name = ?, sku = ?, category = ?, price = ?, cost = ?, stock = ?, min_stock = ?, unit = ?
        WHERE id = ?
      `, [name, sku || null, category || 'Otros', parseFloat(price), parseFloat(cost), parseFloat(stock || 0), parseFloat(min_stock || 0), unit || 'Unidad', id]);
      await logEvent('INFO', `Producto ID ${id} (${name}) actualizado en inventario.`);
    } else {
      if (sku) {
        const existing = await query.get('SELECT id FROM products WHERE sku = ? AND is_active = 1', [sku]);
        if (existing) {
          return res.status(400).json({ error: 'Ya existe otro producto con el mismo código SKU.' });
        }
      }
      await query.run(`
        INSERT INTO products (name, sku, category, price, cost, stock, min_stock, unit)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [name, sku || null, category || 'Otros', parseFloat(price), parseFloat(cost), parseFloat(stock || 0), parseFloat(min_stock || 2), unit || 'Unidad']);
      await logEvent('INFO', `Nuevo producto registrado: ${name}.`);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Eliminar (desactivar) un producto
app.delete('/api/products/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await query.run('UPDATE products SET is_active = 0 WHERE id = ?', [id]);
    await logEvent('INFO', `Producto ID ${id} desactivado del catálogo.`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// --- 2. PROVEEDORES Y COMPRAS DE RESTOCK ---

// Obtener todos los proveedores
app.get('/api/suppliers', async (req, res) => {
  try {
    const suppliers = await query.all('SELECT * FROM suppliers ORDER BY name ASC');
    res.json(suppliers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Guardar o actualizar proveedor
app.post('/api/suppliers', async (req, res) => {
  const { id, name, nit, phone, email, contact_name } = req.body;
  if (!name) return res.status(400).json({ error: 'Nombre del proveedor requerido' });

  try {
    if (id) {
      await query.run(`
        UPDATE suppliers 
        SET name = ?, nit = ?, phone = ?, email = ?, contact_name = ?
        WHERE id = ?
      `, [name, nit, phone, email, contact_name, id]);
    } else {
      await query.run(`
        INSERT INTO suppliers (name, nit, phone, email, contact_name)
        VALUES (?, ?, ?, ?, ?)
      `, [name, nit, phone, email, contact_name]);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Registrar una compra de mercancía (reabastecimiento)
app.post('/api/purchases', async (req, res) => {
  const { supplier_id, total, items } = req.body;
  if (!supplier_id || !items || items.length === 0) {
    return res.status(400).json({ error: 'Datos de compra o productos inválidos.' });
  }

  const timestamp = new Date().toISOString();

  try {
    const result = await query.run(
      'INSERT INTO purchases (supplier_id, total, created_at) VALUES (?, ?, ?)',
      [supplier_id, parseFloat(total), timestamp]
    );
    const purchaseId = result.id;

    for (const item of items) {
      await query.run(`
        INSERT INTO purchase_items (purchase_id, product_id, quantity, unit_price)
        VALUES (?, ?, ?, ?)
      `, [purchaseId, item.product_id, parseFloat(item.quantity), parseFloat(item.unit_price)]);

      await query.run(`
        UPDATE products 
        SET stock = stock + ?, cost = ?
        WHERE id = ?
      `, [parseFloat(item.quantity), parseFloat(item.unit_price), item.product_id]);
    }

    await logEvent('INFO', `Compra registrada ID ${purchaseId} para reabastecimiento. Total: $${total}`);
    res.json({ success: true, purchaseId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// --- 3. REGISTRO DE VENTAS (FACTURACIÓN) ---

// Realizar venta (checkout de caja)
app.post('/api/sales', async (req, res) => {
  const { client_name, client_document, total, payment_method, payment_reference, items } = req.body;

  if (!items || items.length === 0 || !payment_method || !total) {
    return res.status(400).json({ error: 'Carrito de compras vacío o datos incompletos.' });
  }

  const timestamp = new Date().toISOString();

  try {
    const countRow = await query.get('SELECT COUNT(*) as count FROM sales');
    const nextNum = countRow.count + 1;
    const invoiceNumber = `FV-${String(nextNum).padStart(5, '0')}`;

    const result = await query.run(`
      INSERT INTO sales (invoice_number, client_name, client_document, total, payment_method, payment_reference, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      invoiceNumber,
      client_name || 'Cliente General',
      client_document || null,
      parseFloat(total),
      payment_method,
      payment_reference || null,
      timestamp
    ]);
    const saleId = result.id;

    for (const item of items) {
      await query.run(`
        INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, subtotal)
        VALUES (?, ?, ?, ?, ?)
      `, [saleId, item.product_id, parseFloat(item.quantity), parseFloat(item.unit_price), parseFloat(item.subtotal)]);

      await query.run(`
        UPDATE products 
        SET stock = MAX(0, stock - ?) 
        WHERE id = ?
      `, [parseFloat(item.quantity), item.product_id]);
    }

    await logEvent('INFO', `Venta facturada: ${invoiceNumber}. Total: $${total} (${payment_method})`);

    res.json({
      success: true,
      sale: {
        id: saleId,
        invoice_number: invoiceNumber,
        client_name: client_name || 'Cliente General',
        client_document: client_document || '',
        total,
        payment_method,
        payment_reference,
        created_at: timestamp,
        items
      }
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Obtener todas las ventas registradas
app.get('/api/sales', async (req, res) => {
  try {
    const sales = await query.all('SELECT * FROM sales ORDER BY id DESC');
    res.json(sales);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Obtener los detalles de una venta
app.get('/api/sales/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const sale = await query.get('SELECT * FROM sales WHERE id = ?', [id]);
    if (!sale) return res.status(404).json({ error: 'Factura no encontrada.' });

    const items = await query.all(`
      SELECT si.*, p.name as product_name, p.unit 
      FROM sale_items si 
      JOIN products p ON si.product_id = p.id 
      WHERE si.sale_id = ?
    `, [id]);

    res.json({ ...sale, items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// --- 4. GESTIÓN DE CUENTAS DE TRABAJADORES (ADMIN ONLY) ---

// Obtener todos los usuarios
app.get('/api/users', async (req, res) => {
  try {
    const users = await query.all('SELECT id, username, password, role, name FROM users ORDER BY name ASC');
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Crear usuario (Trabajador o Administrador)
app.post('/api/users', async (req, res) => {
  const { username, password, role, name } = req.body;
  if (!username || !password || !role || !name) {
    return res.status(400).json({ error: 'Faltan campos obligatorios.' });
  }

  try {
    // Validar nombre de usuario duplicado
    const existing = await query.get('SELECT id FROM users WHERE username = ?', [username]);
    if (existing) {
      return res.status(400).json({ error: 'El nombre de usuario ya está en uso.' });
    }

    await query.run(`
      INSERT INTO users (username, password, role, name)
      VALUES (?, ?, ?, ?)
    `, [username, password, role, name]);

    await logEvent('INFO', `Cuenta de usuario creada: ${username} (Rol: ${role})`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Eliminar cuenta de usuario
app.delete('/api/users/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const user = await query.get('SELECT username FROM users WHERE id = ?', [id]);
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    // Proteger cuenta administrativa por defecto
    if (user.username === 'admin_queuba') {
      return res.status(400).json({ error: 'No se puede eliminar la cuenta principal de administración.' });
    }

    await query.run('DELETE FROM users WHERE id = ?', [id]);
    await logEvent('INFO', `Cuenta de usuario eliminada: ${user.username}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// --- 5. PANEL ANALÍTICO Y REPORTES DE NEGOCIO ---

// Obtener estadísticas agregadas para el Dashboard
app.get('/api/dashboard/stats', async (req, res) => {
  try {
    const totalSalesRow = await query.get('SELECT SUM(total) as total, COUNT(*) as count FROM sales');
    const totalSales = totalSalesRow.total || 0;
    const totalTransactions = totalSalesRow.count || 0;

    const lowStockRow = await query.get('SELECT COUNT(*) as count FROM products WHERE stock <= min_stock AND is_active = 1');
    const lowStockCount = lowStockRow.count || 0;

    const profitRow = await query.get(`
      SELECT SUM(si.quantity * (si.unit_price - p.cost)) as profit 
      FROM sale_items si
      JOIN products p ON si.product_id = p.id
    `);
    const totalProfits = profitRow.profit || 0;

    const invValueRow = await query.get(`
      SELECT SUM(stock * cost) as totalCost, SUM(stock * price) as totalValue 
      FROM products 
      WHERE is_active = 1
    `);
    const inventoryCostValue = invValueRow.totalCost || 0;
    const inventorySaleValue = invValueRow.totalValue || 0;

    const methodStats = await query.all(`
      SELECT payment_method, SUM(total) as amount, COUNT(*) as count 
      FROM sales 
      GROUP BY payment_method
    `);

    const topProducts = await query.all(`
      SELECT p.name, SUM(si.quantity) as totalQty, SUM(si.subtotal) as totalAmount
      FROM sale_items si
      JOIN products p ON si.product_id = p.id
      GROUP BY si.product_id
      ORDER BY totalQty DESC
      LIMIT 5
    `);

    const rawDailySales = await query.all(`
      SELECT substr(created_at, 1, 10) as dateDay, SUM(total) as dayTotal, COUNT(*) as txCount
      FROM sales
      GROUP BY dateDay
      ORDER BY dateDay DESC
      LIMIT 7
    `);

    res.json({
      summary: {
        totalSales,
        totalProfits,
        totalTransactions,
        lowStockCount,
        inventoryCostValue,
        inventorySaleValue
      },
      paymentMethods: methodStats,
      topProducts,
      dailySales: rawDailySales.reverse()
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ==========================================
// INICIALIZACIÓN
// ==========================================

async function startServer() {
  await initDb();
  await initGmailClient();
  
  if (isConnected()) {
    reconcileInbox();
  }

  server.listen(port, () => {
    console.log(`Servidor de pagos y POS corriendo en http://localhost:${port}`);
  });
}

startServer().catch(err => {
  console.error('Error durante el arranque del servidor:', err);
});
