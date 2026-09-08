/**
 * Módulo de parseo para extraer datos clave de correos financieros.
 */

/**
 * Limpia y formatea el monto extraído a un número flotante estándar.
 * Maneja formatos colombianos usuales (ej. 50.000, 50.000,00, 50000).
 */
export function parseAmount(amountStr) {
  if (!amountStr) return 0;
  
  // Eliminar el signo de pesos, espacios y caracteres no numéricos excepto puntos y comas
  let clean = amountStr.replace(/[\$\s]/g, '');
  
  const lastDot = clean.lastIndexOf('.');
  const lastComma = clean.lastIndexOf(',');
  
  if (lastComma > lastDot && lastComma > clean.length - 4) {
    // La coma es el separador decimal (ej: 50.000,00)
    // Eliminamos los puntos (miles) y reemplazamos la coma por punto
    clean = clean.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma && lastDot > clean.length - 4) {
    // El punto es el separador decimal (ej: 50,000.00)
    // Eliminamos las comas (miles)
    clean = clean.replace(/,/g, '');
  } else {
    // Sin decimales detectados, eliminar todos los puntos y comas (ej: 50.000 o 50,000)
    clean = clean.replace(/[.,]/g, '');
  }
  
  return parseFloat(clean) || 0;
}

/**
 * Ejecuta una expresión regular sobre un texto y retorna el grupo de captura correspondiente.
 */
function extractField(text, pattern) {
  if (!pattern) return null;
  try {
    const regex = new RegExp(pattern, 'i');
    const match = text.match(regex);
    if (match) {
      // Retorna el primer grupo capturado si existe, de lo contrario todo el match
      return match[1] ? match[1].trim() : match[0].trim();
    }
  } catch (err) {
    console.error(`Error en expresión regular: ${pattern}`, err.message);
  }
  return null;
}

/**
 * Parsea el correo usando la configuración de reglas provista.
 * @param {string} rawBody Texto plano del correo
 * @param {string} subject Asunto del correo
 * @param {object} parserConfig Configuración del parser (regexes de base de datos)
 * @returns {object|null} Retorna el objeto formateado o lanza error si faltan datos críticos.
 */
export function parseEmailContent(rawBody, subject, parserConfig) {
  if (!parserConfig) {
    throw new Error('Configuración de parser no definida.');
  }

  // Verificar si el asunto coincide con el patrón esperado
  const subjectRegex = new RegExp(parserConfig.subject_pattern, 'i');
  if (!subjectRegex.test(subject)) {
    throw new Error(`El asunto del correo no coincide con el patrón esperado para ${parserConfig.bank_name}.`);
  }

  // Combinar asunto y cuerpo para realizar la búsqueda por si los datos están en el asunto
  const fullText = `Asunto: ${subject}\n\n${rawBody}`;

  // Extraer campos utilizando las expresiones regulares configuradas
  const clientName = extractField(fullText, parserConfig.regex_client) || 'Cliente Desconocido';
  const rawAmount = extractField(fullText, parserConfig.regex_amount);
  const reference = extractField(fullText, parserConfig.regex_reference) || 'SIN REF';
  const paymentDate = extractField(fullText, parserConfig.regex_date) || new Date().toLocaleString();

  if (!rawAmount) {
    throw new Error(`No se pudo extraer el monto del pago utilizando el patrón configurado para ${parserConfig.bank_name}.`);
  }

  const amount = parseAmount(rawAmount);

  return {
    bank_name: parserConfig.bank_name,
    client_name: clientName,
    amount: amount,
    reference: reference,
    payment_date: paymentDate,
    received_at: new Date().toISOString(),
    raw_body: rawBody
  };
}
