import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.resolve(__dirname, 'database.db');

// Connect to SQLite database
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to the SQLite database at:', dbPath);
  }
});

// Helper functions for DB operations (converting callbacks to Promises)
export const query = {
  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, changes: this.changes });
      });
    });
  },
  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  },
  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }
};

// Initialize the database schema
export async function initDb() {
  // --- USER AUTHENTICATION & ROLES ---
  await query.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL,
      name TEXT NOT NULL,
      cashierCode TEXT,
      document TEXT,
      phone TEXT,
      status TEXT DEFAULT 'Activo',
      createdDate TEXT
    )
  `);

  // Ensure older databases upgrade gracefully
  try { await query.run(`ALTER TABLE users ADD COLUMN cashierCode TEXT`); } catch (e) {}
  try { await query.run(`ALTER TABLE users ADD COLUMN document TEXT`); } catch (e) {}
  try { await query.run(`ALTER TABLE users ADD COLUMN phone TEXT`); } catch (e) {}
  try { await query.run(`ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'Activo'`); } catch (e) {}
  try { await query.run(`ALTER TABLE users ADD COLUMN createdDate TEXT`); } catch (e) {}

  // --- GMAIL PAYMENTS MODULE TABLES ---
  await query.run(`
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      bank_name TEXT NOT NULL,
      client_name TEXT NOT NULL,
      amount REAL NOT NULL,
      reference TEXT,
      payment_date TEXT,
      received_at TEXT NOT NULL,
      raw_body TEXT,
      status TEXT DEFAULT 'PROCESADO'
    )
  `);

  await query.run(`
    CREATE TABLE IF NOT EXISTS parsers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bank_name TEXT UNIQUE NOT NULL,
      sender_email TEXT NOT NULL,
      subject_pattern TEXT NOT NULL,
      regex_client TEXT NOT NULL,
      regex_amount TEXT NOT NULL,
      regex_reference TEXT NOT NULL,
      regex_date TEXT NOT NULL,
      is_active INTEGER DEFAULT 1
    )
  `);

  await query.run(`
    CREATE TABLE IF NOT EXISTS gmail_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  await query.run(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      level TEXT NOT NULL,
      message TEXT NOT NULL,
      details TEXT
    )
  `);

  // --- POS MODULE TABLES ---
  await query.run(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      sku TEXT UNIQUE,
      category TEXT,
      price REAL NOT NULL,
      cost REAL NOT NULL,
      stock REAL NOT NULL DEFAULT 0,
      min_stock REAL DEFAULT 2,
      unit TEXT DEFAULT 'Unidad',
      is_active INTEGER DEFAULT 1
    )
  `);

  await query.run(`
    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      nit TEXT,
      phone TEXT,
      email TEXT,
      contact_name TEXT
    )
  `);

  await query.run(`
    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT UNIQUE NOT NULL,
      client_name TEXT DEFAULT 'Cliente General',
      client_document TEXT,
      total REAL NOT NULL,
      payment_method TEXT NOT NULL,
      payment_reference TEXT,
      created_at TEXT NOT NULL
    )
  `);

  await query.run(`
    CREATE TABLE IF NOT EXISTS sale_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER REFERENCES sales(id) ON DELETE CASCADE,
      product_id INTEGER REFERENCES products(id),
      quantity REAL NOT NULL,
      unit_price REAL NOT NULL,
      subtotal REAL NOT NULL
    )
  `);

  await query.run(`
    CREATE TABLE IF NOT EXISTS purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplier_id INTEGER REFERENCES suppliers(id),
      total REAL NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  await query.run(`
    CREATE TABLE IF NOT EXISTS purchase_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_id INTEGER REFERENCES purchases(id) ON DELETE CASCADE,
      product_id INTEGER REFERENCES products(id),
      quantity REAL NOT NULL,
      unit_price REAL NOT NULL
    )
  `);

  // --- SEED DEFAULT DATA ---

  // 1. Seed Default Users
  const usersCount = await query.get('SELECT COUNT(*) as count FROM users');
  if (usersCount.count === 0) {
    console.log('Seeding default users credentials...');
    
    // Seed Admin
    await query.run(`
      INSERT INTO users (username, password, role, name, cashierCode, document, phone, status, createdDate)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, ['admin_queuba', 'ADM - 999', 'ADMIN', 'Carlos Gómez (Admin)', 'ADM-001', '80.123.456', '320 998 7766', 'Activo', new Date().toISOString().split('T')[0]]);

    // Seed Cashier
    await query.run(`
      INSERT INTO users (username, password, role, name, cashierCode, document, phone, status, createdDate)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, ['caja_queuba', 'OPE - 123', 'OPERATOR', 'Juan Rodríguez', 'CJ-101', '1.069.452.880', '314 589 2244', 'Activo', new Date().toISOString().split('T')[0]]);

    console.log('Users seeded successfully.');
  }

  // 2. Seed Gmail Parsers
  const parsersCount = await query.get('SELECT COUNT(*) as count FROM parsers');
  if (parsersCount.count === 0) {
    console.log('Seeding default parsers for Nequi, Daviplata, and Bancolombia...');
    await query.run(`
      INSERT INTO parsers (bank_name, sender_email, subject_pattern, regex_client, regex_amount, regex_reference, regex_date)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      'Nequi',
      'correo@nequi.com.co',
      'Te enviaron plata|¡Te enviaron plata!',
      '([A-Za-z\\s]+?)\\s+te envió|por parte de\\s+([A-Za-z\\s]+?)\\s+por',
      '\\$?([0-9.,]+)\\s*(?:de\\s*plata|pesos)?',
      '(?:Ref:|referencia|comprobante):?\\s*([0-9]+|M-[0-9]+)',
      '(?:el|fecha:?)\\s*([0-9/\\-:\\s]+(?:am|pm|AM|PM)?)'
    ]);

    await query.run(`
      INSERT INTO parsers (bank_name, sender_email, subject_pattern, regex_client, regex_amount, regex_reference, regex_date)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      'Daviplata',
      'notificaciones@daviplata.com',
      'Transaccion Exitosa|Te enviaron plata',
      '(?:De|Remitente):?\\s*([A-Za-z\\s]+?)(?:\\s*\\n|\\s*a\\s*Daviplata)',
      'Valor:?\\s*\\$?([0-9.,]+)',
      '(?:Ref|Aprobacion|Autorizacion):?\\s*([0-9]+)',
      'Fecha:?\\s*([0-9/\\-:\\s]+)'
    ]);

    await query.run(`
      INSERT INTO parsers (bank_name, sender_email, subject_pattern, regex_client, regex_amount, regex_reference, regex_date)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      'Bancolombia',
      'correos@bancolombia.com.co',
      'Transferencia Recibida|Notificación de transferencia',
      '(?:de|por parte de)\\s*([A-Za-z\\s]+?)\\s*por\\s*\\$',
      'por\\s*\\$\\s*([0-9.,]+)',
      'Ref\\.?\\s*([0-9]+)',
      'el\\s*([0-9/\\-:\\s]+)'
    ]);
  }

  // 3. Seed Default Products
  const productsCount = await query.get('SELECT COUNT(*) as count FROM products');
  if (productsCount.count === 0) {
    console.log('Seeding default food products for Quesos Ubaté POS...');
    const sampleProducts = [
      { name: 'Queso Campesino Ubaté', sku: 'Q001', category: 'Quesos', price: 14000, cost: 9500, stock: 24, min_stock: 5, unit: 'Bloque' },
      { name: 'Colaciones de Ubaté Caja', sku: 'A001', category: 'Acompañantes', price: 10000, cost: 6500, stock: 14, min_stock: 4, unit: 'Caja' }
    ];

    for (const p of sampleProducts) {
      await query.run(`
        INSERT INTO products (name, sku, category, price, cost, stock, min_stock, unit)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [p.name, p.sku, p.category, p.price, p.cost, p.stock, p.min_stock, p.unit]);
    }
  }

  // 4. Seed Default Suppliers
  const suppliersCount = await query.get('SELECT COUNT(*) as count FROM suppliers');
  if (suppliersCount.count === 0) {
    console.log('Seeding default suppliers...');
    const sampleSuppliers = [
      { name: 'Productora Lácteos San Jerónimo', nit: '800.124.958-3', phone: '3124567890', email: 'ventas@sanjeronimo.com', contact: 'Marta Rincón' },
      { name: 'Distribuidora Dulces de la Sabana', nit: '900.584.223-1', phone: '3159876543', email: 'pedidos@dulcessabana.com', contact: 'Eduardo Rojas' },
      { name: 'Envases y Empaques del Altiplano', nit: '860.985.334-0', phone: '3002224445', email: 'contacto@empaquesaltiplano.com', contact: 'Luz Marina Gómez' }
    ];

    for (const s of sampleSuppliers) {
      await query.run(`
        INSERT INTO suppliers (name, nit, phone, email, contact_name)
        VALUES (?, ?, ?, ?, ?)
      `, [s.name, s.nit, s.phone, s.email, s.contact]);
    }
  }
}

export async function logEvent(level, message, details = null) {
  const timestamp = new Date().toISOString();
  console.log(`[${level}] ${message}`, details ? details : '');
  try {
    await query.run(`
      INSERT INTO audit_logs (timestamp, level, message, details)
      VALUES (?, ?, ?, ?)
    `, [timestamp, level, message, details ? JSON.stringify(details) : null]);
  } catch (err) {
    console.error('Failed to write audit log:', err.message);
  }
}

export async function resetAllData(keepCatalogs = false) {
  await query.run('DELETE FROM sales');
  await query.run('DELETE FROM sale_items');
  await query.run('DELETE FROM purchases');
  await query.run('DELETE FROM purchase_items');
  await query.run('DELETE FROM payments');
  await query.run('DELETE FROM audit_logs');
  
  if (!keepCatalogs) {
    await query.run('DELETE FROM products');
    await query.run('DELETE FROM suppliers');
  }

  // Reset default admin & operator users
  await query.run('DELETE FROM users');
  await query.run(`
    INSERT INTO users (username, password, role, name, cashierCode, document, phone, status, createdDate)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, ['admin_queuba', 'ADM - 999', 'ADMIN', 'Carlos Gómez (Admin)', 'ADM-001', '80.123.456', '320 998 7766', 'Activo', new Date().toISOString().split('T')[0]]);

  await query.run(`
    INSERT INTO users (username, password, role, name, cashierCode, document, phone, status, createdDate)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, ['caja_queuba', 'OPE - 123', 'OPERATOR', 'Juan Rodríguez', 'CJ-101', '1.069.452.880', '314 589 2244', 'Activo', new Date().toISOString().split('T')[0]]);

  await logEvent('INFO', 'Base de datos limpiada completamente.');
}

export default db;
