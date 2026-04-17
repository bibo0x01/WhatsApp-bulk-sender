const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const QRCode = require('qrcode');
const XLSX = require('xlsx');
const { Client, LocalAuth } = require('whatsapp-web.js');

let mainWindow = null;
let waClient = null;
let waReady = false;
let sendCancelled = false;

function normalizePhone(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(Math.trunc(value)).replace(/\D/g, '');
  }
  return String(value).replace(/\D/g, '');
}

function normalizeHeader(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function parseExcelBuffer(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];

  // Read as array-of-arrays to support arbitrary (including Arabic) headers
  const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (!Array.isArray(aoa) || aoa.length === 0) return [];

  const headerRow = Array.isArray(aoa[0]) ? aoa[0] : [];
  const normalizedHeaders = headerRow.map(normalizeHeader);

  const numberHeaders = new Set([
    'number',
    'phone',
    'phone number',
    'mobile',
    'mobile number',
    'whatsapp',
    'whatsapp number',
    'رقم',
    'رقم الهاتف',
    'رقم الموبايل',
    'موبايل',
    'هاتف',
    'واتساب',
    'رقم واتساب',
  ]);

  const nameHeaders = new Set([
    'name',
    'full name',
    'client name',
    'customer name',
    'اسم',
    'الاسم',
    'اسم العميل',
    'اسم الزبون',
  ]);

  let numberIdx = normalizedHeaders.findIndex((h) => numberHeaders.has(h));
  let nameIdx = normalizedHeaders.findIndex((h) => nameHeaders.has(h));

  // Fallback: assume first column is number, second is name
  if (numberIdx < 0) numberIdx = 0;
  if (nameIdx < 0) nameIdx = 1;

  const out = [];
  for (let r = 1; r < aoa.length; r++) {
    const row = aoa[r];
    if (!Array.isArray(row)) continue;
    const phone = normalizePhone(row[numberIdx]);
    const name = row[nameIdx] != null ? String(row[nameIdx]).trim() : '';
    if (phone) out.push({ number: phone, name });
  }
  return out;
}

async function destroyWhatsAppClient() {
  if (!waClient) return;
  try {
    await waClient.destroy();
  } catch (_) {
    /* ignore */
  }
  waClient = null;
  waReady = false;
}

function attachClientEvents(client) {
  client.on('qr', async (qr) => {
    const dataUrl = await QRCode.toDataURL(qr);
    mainWindow?.webContents.send('whatsapp:qr', dataUrl);
  });

  client.on('ready', () => {
    waReady = true;
    mainWindow?.webContents.send('whatsapp:ready');
  });

  client.on('authenticated', () => {
    mainWindow?.webContents.send('whatsapp:authenticated');
  });

  client.on('auth_failure', (msg) => {
    mainWindow?.webContents.send('whatsapp:auth_failure', String(msg));
  });

  client.on('disconnected', (reason) => {
    waReady = false;
    mainWindow?.webContents.send('whatsapp:disconnected', String(reason));
  });
}

async function connectWhatsApp() {
  if (waReady && waClient) return { ok: true };
  if (waClient && !waReady) {
    return { ok: true, pending: true };
  }

  waClient = new Client({
    authStrategy: new LocalAuth({
      dataPath: path.join(app.getPath('userData'), 'wwebjs-auth'),
    }),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
      ],
    },
  });

  attachClientEvents(waClient);
  await waClient.initialize();
  return { ok: true };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 920,
    height: 820,
    minWidth: 640,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadFile('index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  await destroyWhatsAppClient();
});

ipcMain.handle('whatsapp:connect', async () => {
  try {
    return await connectWhatsApp();
  } catch (err) {
    await destroyWhatsAppClient();
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle('whatsapp:disconnect', async () => {
  try {
    if (waClient) {
      await waClient.logout();
    }
  } catch (_) {
    /* ignore */
  }
  await destroyWhatsAppClient();
  return { ok: true };
});

ipcMain.handle('whatsapp:status', async () => ({
  ready: waReady,
  hasClient: !!waClient,
}));

ipcMain.handle('excel:parse', async (_e, buffer) => {
  try {
    let buf;
    if (Buffer.isBuffer(buffer)) {
      buf = buffer;
    } else if (buffer instanceof ArrayBuffer) {
      buf = Buffer.from(new Uint8Array(buffer));
    } else if (ArrayBuffer.isView(buffer)) {
      buf = Buffer.from(buffer);
    } else if (
      buffer &&
      typeof buffer === 'object' &&
      buffer.type === 'Buffer' &&
      Array.isArray(buffer.data)
    ) {
      // Some IPC paths serialize Buffers as { type: 'Buffer', data: number[] }
      buf = Buffer.from(buffer.data);
    } else {
      buf = Buffer.from(buffer);
    }
    const rows = parseExcelBuffer(buf);
    return { ok: true, rows };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle('send:cancel', async () => {
  sendCancelled = true;
  return { ok: true };
});

ipcMain.handle('send:bulk', async (_e, payload) => {
  try {
    const { rows, template, delayMs } = payload || {};
    if (!waClient || !waReady) {
      return { ok: false, error: 'WhatsApp is not connected.' };
    }
    if (!Array.isArray(rows) || rows.length === 0) {
      return { ok: false, error: 'No contacts loaded.' };
    }
    const tpl = typeof template === 'string' ? template : '';
    const delay = Math.max(0, Number(delayMs) || 0);

    sendCancelled = false;
    const results = [];

    for (let i = 0; i < rows.length; i++) {
      if (sendCancelled) break;
      const row = rows[i];
      const phone = normalizePhone(row.number);
      const name = row.name != null ? String(row.name) : '';
      const text = tpl.replace(/\{name\}/g, name);

    let lastError = '';
      try {
        await waClient.sendMessage(`${phone}@c.us`, text);
        results.push({ index: i, ok: true, phone });
      } catch (err) {
      lastError = err.message || String(err);
        results.push({
          index: i,
          ok: false,
          phone,
        error: lastError,
        });
      }

      mainWindow?.webContents.send('send:progress', {
        current: i + 1,
        total: rows.length,
        lastPhone: phone,
        lastOk: results[results.length - 1]?.ok,
      lastError,
      });

      if (i < rows.length - 1 && !sendCancelled && delay > 0) {
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    const summary = {
      cancelled: sendCancelled,
      total: rows.length,
      sent: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    };

    mainWindow?.webContents.send('send:done', summary);
    return { ok: true, summary };
  } catch (err) {
    const msg = err.message || String(err);
    mainWindow?.webContents.send('send:error', msg);
    return { ok: false, error: msg };
  }
});
