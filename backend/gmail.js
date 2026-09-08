import { google } from 'googleapis';
import { query, logEvent } from './db.js';
import { parseEmailContent } from './parser.js';

let oauth2Client = null;
let pollingInterval = null;
let isPolling = false;
let broadcastCallback = null;

// Set callback for broadcasting new payments to WebSocket clients
export function setBroadcastCallback(callback) {
  broadcastCallback = callback;
}

/**
 * Carga las credenciales de Gmail desde la base de datos e inicializa el cliente OAuth2.
 */
export async function initGmailClient() {
  try {
    const clientIdRow = await query.get("SELECT value FROM gmail_config WHERE key = 'client_id'");
    const clientSecretRow = await query.get("SELECT value FROM gmail_config WHERE key = 'client_secret'");
    const redirectUriRow = await query.get("SELECT value FROM gmail_config WHERE key = 'redirect_uri'");

    if (!clientIdRow || !clientSecretRow || !redirectUriRow) {
      await logEvent('INFO', 'Credenciales de Gmail API no configuradas en la base de datos.');
      oauth2Client = null;
      return false;
    }

    oauth2Client = new google.auth.OAuth2(
      clientIdRow.value,
      clientSecretRow.value,
      redirectUriRow.value
    );

    const tokenRow = await query.get("SELECT value FROM gmail_config WHERE key = 'oauth_token'");
    if (tokenRow) {
      oauth2Client.setCredentials(JSON.parse(tokenRow.value));
      await logEvent('INFO', 'Cliente Gmail OAuth2 inicializado con token existente.');
      
      // Iniciar polling
      startPolling();
      return true;
    } else {
      await logEvent('WARNING', 'Cliente Gmail OAuth2 creado, pero falta el token de acceso del usuario.');
      return false;
    }
  } catch (err) {
    await logEvent('ERROR', 'Error al inicializar el cliente de Gmail:', err.message);
    oauth2Client = null;
    return false;
  }
}

/**
 * Obtiene la URL de autenticación de Google.
 */
export async function getAuthUrl() {
  if (!oauth2Client) {
    throw new Error('El cliente OAuth2 no está inicializado. Configure las credenciales primero.');
  }
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/gmail.readonly'],
    prompt: 'consent'
  });
}

/**
 * Intercambia el código de autorización por tokens y los guarda.
 */
export async function saveAuthCode(code) {
  if (!oauth2Client) {
    throw new Error('El cliente OAuth2 no está inicializado.');
  }

  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);

  // Guardar token en base de datos
  await query.run(
    "INSERT OR REPLACE INTO gmail_config (key, value) VALUES ('oauth_token', ?)",
    [JSON.stringify(tokens)]
  );

  await logEvent('INFO', 'Token de Gmail guardado exitosamente. Conexión autorizada.');
  
  // Iniciar el polling inmediatamente
  startPolling();
  
  // Ejecutar reconciliación de arranque
  reconcileInbox();

  return tokens;
}

/**
 * Desconecta la cuenta de Gmail (borra tokens).
 */
export async function disconnectGmail() {
  stopPolling();
  await query.run("DELETE FROM gmail_config WHERE key = 'oauth_token'");
  oauth2Client = null;
  await logEvent('INFO', 'Cuenta de Gmail desconectada y tokens eliminados.');
}

/**
 * Guarda las credenciales principales de Gmail API.
 */
export async function saveCredentials(clientId, clientSecret, redirectUri) {
  await query.run("INSERT OR REPLACE INTO gmail_config (key, value) VALUES ('client_id', ?)", [clientId]);
  await query.run("INSERT OR REPLACE INTO gmail_config (key, value) VALUES ('client_secret', ?)", [clientSecret]);
  await query.run("INSERT OR REPLACE INTO gmail_config (key, value) VALUES ('redirect_uri', ?)", [redirectUri]);
  
  await logEvent('INFO', 'Credenciales de Gmail API actualizadas. Reinicializando cliente...');
  return await initGmailClient();
}

/**
 * Extrae de forma recursiva el cuerpo en texto del correo y limpia el HTML.
 */
function getEmailBody(message) {
  let body = '';
  if (!message.payload) return '';

  if (message.payload.body && message.payload.body.data) {
    body = Buffer.from(message.payload.body.data, 'base64').toString('utf-8');
  } else if (message.payload.parts) {
    body = getPartsBody(message.payload.parts);
  }

  // Limpiar HTML si existe
  if (body.includes('<') && body.includes('>')) {
    body = body
      .replace(/<style([\s\S]*?)<\/style>/gi, '')
      .replace(/<script([\s\S]*?)<\/script>/gi, '')
      .replace(/<\/div>/ig, '\n')
      .replace(/<\/li>/ig, '\n')
      .replace(/<p[^>]*>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ');
  }

  return body.trim();
}

function getPartsBody(parts) {
  let body = '';
  for (const part of parts) {
    if (part.mimeType === 'text/plain' && part.body && part.body.data) {
      body += Buffer.from(part.body.data, 'base64').toString('utf-8');
    } else if (part.mimeType === 'text/html' && part.body && part.body.data) {
      body += Buffer.from(part.body.data, 'base64').toString('utf-8');
    } else if (part.parts) {
      body += getPartsBody(part.parts);
    }
  }
  return body;
}

/**
 * Procesa un correo individual y lo guarda en la base de datos.
 */
export async function processEmailMessage(gmail, messageId) {
  try {
    // Verificar duplicados antes de llamar a la API
    const existing = await query.get('SELECT id FROM payments WHERE id = ?', [messageId]);
    if (existing) return null;

    // Obtener detalles del correo
    const res = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full'
    });

    const msg = res.data;
    const headers = msg.payload.headers || [];
    const fromHeader = headers.find(h => h.name.toLowerCase() === 'from')?.value || '';
    const subjectHeader = headers.find(h => h.name.toLowerCase() === 'subject')?.value || '';

    // Extraer correo del remitente (ej. "Nequi <correo@nequi.com.co>" -> "correo@nequi.com.co")
    const senderEmailMatch = fromHeader.match(/<([^>]+)>/) || [null, fromHeader];
    const senderEmail = (senderEmailMatch[1] || fromHeader).trim();

    // Obtener el parser correspondiente al remitente en DB
    const parser = await query.get('SELECT * FROM parsers WHERE sender_email = ? AND is_active = 1', [senderEmail]);
    if (!parser) {
      // Ignorar correos que no correspondan a remitentes autorizados
      return null;
    }

    const rawBody = getEmailBody(msg);

    try {
      // Parsear
      const parsedData = parseEmailContent(rawBody, subjectHeader, parser);
      
      // Guardar pago exitoso
      await query.run(`
        INSERT INTO payments (id, bank_name, client_name, amount, reference, payment_date, received_at, raw_body, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PROCESADO')
      `, [
        messageId,
        parsedData.bank_name,
        parsedData.client_name,
        parsedData.amount,
        parsedData.reference,
        parsedData.payment_date,
        parsedData.received_at,
        parsedData.raw_body
      ]);

      const record = {
        id: messageId,
        ...parsedData,
        status: 'PROCESADO'
      };

      await logEvent('INFO', `Pago verificado: ${parsedData.bank_name} - ${parsedData.client_name} - $${parsedData.amount}`);
      
      // Retornar el registro para emitir vía WebSocket
      return record;
    } catch (parseErr) {
      // Guardar pago con error para auditoría/verificación del administrador
      await logEvent('ERROR', `Error al parsear correo de ${parser.bank_name}: ${parseErr.message}`);
      
      await query.run(`
        INSERT INTO payments (id, bank_name, client_name, amount, reference, payment_date, received_at, raw_body, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ERROR_PARSING')
      `, [
        messageId,
        parser.bank_name,
        'ERROR PARSING',
        0,
        'ERROR',
        new Date().toLocaleString(),
        new Date().toISOString(),
        rawBody
      ]);

      const record = {
        id: messageId,
        bank_name: parser.bank_name,
        client_name: 'ERROR DE PARSEO',
        amount: 0,
        reference: 'ERROR',
        payment_date: new Date().toLocaleString(),
        received_at: new Date().toISOString(),
        raw_body: rawBody,
        status: 'ERROR_PARSING'
      };

      return record;
    }
  } catch (err) {
    await logEvent('ERROR', `Error al procesar mensaje ${messageId}:`, err.message);
    return null;
  }
}

/**
 * Reconciliación: verifica los correos de las últimas 24 horas y procesa los pendientes.
 */
export async function reconcileInbox() {
  if (!oauth2Client) return;
  await logEvent('INFO', 'Iniciando reconciliación de correos pendientes...');
  
  try {
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    
    // Obtener remitentes activos
    const parsers = await query.all('SELECT sender_email FROM parsers WHERE is_active = 1');
    if (parsers.length === 0) return;

    // Crear consulta: de cada remitente
    const fromQuery = parsers.map(p => `from:${p.sender_email}`).join(' OR ');
    
    // Buscar mensajes de las últimas 24 horas
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    const dateQuery = `after:${Math.floor(oneDayAgo.getTime() / 1000)}`;

    const fullQuery = `(${fromQuery}) ${dateQuery}`;

    const res = await gmail.users.messages.list({
      userId: 'me',
      q: fullQuery,
      maxResults: 100
    });

    const messages = res.data.messages || [];
    await logEvent('INFO', `Reconciliación: Encontrados ${messages.length} correos candidatos.`);

    // Procesar en orden cronológico inverso (los más antiguos primero para FIFO)
    const reversedMessages = messages.reverse();

    for (const msg of reversedMessages) {
      const record = await processEmailMessage(gmail, msg.id);
      if (record && broadcastCallback) {
        broadcastCallback(record);
      }
    }
    
    await logEvent('INFO', 'Reconciliación finalizada.');
  } catch (err) {
    await logEvent('ERROR', 'Error durante la reconciliación:', err.message);
  }
}

/**
 * Hace una consulta rápida (polling) para los últimos correos entrantes.
 */
async function pollInbox() {
  if (isPolling || !oauth2Client) return;
  isPolling = true;

  try {
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    
    // Obtener remitentes activos
    const parsers = await query.all('SELECT sender_email FROM parsers WHERE is_active = 1');
    if (parsers.length === 0) {
      isPolling = false;
      return;
    }

    const fromQuery = parsers.map(p => `from:${p.sender_email}`).join(' OR ');
    // Polling rápido: correos de los últimos 10 minutos
    const fiveMinsAgo = new Date();
    fiveMinsAgo.setMinutes(fiveMinsAgo.getMinutes() - 10);
    const dateQuery = `after:${Math.floor(fiveMinsAgo.getTime() / 1000)}`;

    const fullQuery = `(${fromQuery}) ${dateQuery}`;

    const res = await gmail.users.messages.list({
      userId: 'me',
      q: fullQuery,
      maxResults: 20
    });

    const messages = res.data.messages || [];

    // Procesar los mensajes en orden
    for (const msg of messages.reverse()) {
      const record = await processEmailMessage(gmail, msg.id);
      if (record && broadcastCallback) {
        broadcastCallback(record);
      }
    }
  } catch (err) {
    // Si el token expira o falla, loguear
    if (err.message.includes('invalid_grant') || err.message.includes('No access, refresh or API key is set')) {
      await logEvent('ERROR', 'La sesión de Gmail ha expirado o es inválida. Requiere re-autorización.');
      stopPolling();
    } else {
      await logEvent('ERROR', 'Error durante el polling de Gmail:', err.message);
    }
  } finally {
    isPolling = false;
  }
}

/**
 * Inicia el ciclo de polling cada 30 segundos.
 */
export function startPolling() {
  if (pollingInterval) return;
  
  logEvent('INFO', 'Iniciando servicio de verificación de correos (polling de 30 segundos).');
  // Ejecutar una vez al inicio
  pollInbox();
  // Configurar intervalo
  pollingInterval = setInterval(pollInbox, 30000);
}

/**
 * Detiene el ciclo de polling.
 */
export function stopPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
    logEvent('INFO', 'Servicio de verificación de correos detenido.');
  }
}

export function isConnected() {
  return oauth2Client !== null && pollingInterval !== null;
}
