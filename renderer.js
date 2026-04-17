const btnConnect = document.getElementById('btnConnect');
const btnDisconnect = document.getElementById('btnDisconnect');
const connStatus = document.getElementById('connStatus');
const qrWrap = document.getElementById('qrWrap');
const qrImg = document.getElementById('qrImg');
const fileInput = document.getElementById('fileInput');
const fileStatus = document.getElementById('fileStatus');
const templateEl = document.getElementById('template');
const delayEl = document.getElementById('delay');
const btnSend = document.getElementById('btnSend');
const btnCancel = document.getElementById('btnCancel');
const progressWrap = document.getElementById('progressWrap');
const progressBar = document.getElementById('progressBar');
const sendStatus = document.getElementById('sendStatus');
const elapsedEl = document.getElementById('elapsed');
const sentCountEl = document.getElementById('sentCount');
const failedCountEl = document.getElementById('failedCount');
const totalCountEl = document.getElementById('totalCount');
const sendLogEl = document.getElementById('sendLog');
const btnClearLog = document.getElementById('btnClearLog');

let rows = [];
let connected = false;
let sending = false;
let sentCount = 0;
let failedCount = 0;
let sendStartedAt = 0;
let timerId = null;

function setConnText(text) {
  connStatus.textContent = text;
}

function setFileText(text) {
  fileStatus.textContent = text;
}

function updateSendButton() {
  btnSend.disabled = !connected || rows.length === 0 || sending;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatElapsed(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${pad2(m)}:${pad2(s)}`;
}

function setStats({ elapsedMs, sent, failed, total }) {
  if (typeof elapsedMs === 'number') elapsedEl.textContent = formatElapsed(elapsedMs);
  if (typeof sent === 'number') sentCountEl.textContent = String(sent);
  if (typeof failed === 'number') failedCountEl.textContent = String(failed);
  if (typeof total === 'number') totalCountEl.textContent = String(total);
}

function resetSendUi() {
  sentCount = 0;
  failedCount = 0;
  sendStartedAt = 0;
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
  setStats({ elapsedMs: 0, sent: 0, failed: 0, total: rows.length });
  progressBar.style.width = '0%';
  progressWrap.classList.add('hidden');
  btnCancel.disabled = true;
}

function appendLogLine({ ok, phone, message }) {
  const time = new Date().toLocaleTimeString();
  const status = ok ? 'OK' : 'FAILED';
  const line = `[${time}] ${status} ${phone}${message ? ` - ${message}` : ''}\n`;
  const span = document.createElement('span');
  span.className = ok ? 'log-ok' : 'log-fail';
  span.textContent = line;
  sendLogEl.appendChild(span);
  sendLogEl.scrollTop = sendLogEl.scrollHeight;
}

function readFileAsBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

btnConnect.addEventListener('click', async () => {
  setConnText('Starting…');
  qrWrap.classList.add('hidden');
  const res = await window.api.connect();
  if (!res.ok) {
    setConnText(`Error: ${res.error || 'Unknown'}`);
    return;
  }
  setConnText('Waiting for QR or session…');
});

btnDisconnect.addEventListener('click', async () => {
  await window.api.disconnect();
  connected = false;
  qrWrap.classList.add('hidden');
  setConnText('Disconnected');
  btnDisconnect.disabled = true;
  btnConnect.disabled = false;
  updateSendButton();
});

fileInput.addEventListener('change', async () => {
  const file = fileInput.files && fileInput.files[0];
  if (!file) {
    rows = [];
    setFileText('No file loaded');
    setStats({ total: 0 });
    updateSendButton();
    return;
  }
  try {
    const buf = await readFileAsBuffer(file);
    const res = await window.api.parseExcel(buf);
    if (!res.ok) {
      rows = [];
      setFileText(`Could not read file: ${res.error}`);
      setStats({ total: 0 });
      updateSendButton();
      return;
    }
    rows = res.rows || [];
    setFileText(`Loaded ${rows.length} contact(s) from ${file.name}`);
    setStats({ total: rows.length });
  } catch (e) {
    rows = [];
    setFileText(`Error: ${e.message || e}`);
    setStats({ total: 0 });
  }
  updateSendButton();
});

btnSend.addEventListener('click', async () => {
  if (!connected || rows.length === 0) return;
  sending = true;
  btnSend.disabled = true;
  btnCancel.disabled = false;
  progressWrap.classList.remove('hidden');
  progressBar.style.width = '0%';
  sendStatus.textContent = '';
  sendLogEl.textContent = '';
  sentCount = 0;
  failedCount = 0;
  sendStartedAt = Date.now();
  setStats({ elapsedMs: 0, sent: 0, failed: 0, total: rows.length });
  if (timerId) clearInterval(timerId);
  timerId = setInterval(() => {
    if (!sending) return;
    setStats({ elapsedMs: Date.now() - sendStartedAt });
  }, 1000);

  const delaySec = Number(delayEl.value);
  const delayMs = Math.max(0, (Number.isFinite(delaySec) ? delaySec : 3) * 1000);

  try {
    const res = await window.api.sendBulk({
      rows,
      template: templateEl.value,
      delayMs,
    });
    if (!res.ok) {
      sendStatus.textContent = res.error || 'Send could not start.';
      progressWrap.classList.add('hidden');
      sending = false;
      btnCancel.disabled = true;
      if (timerId) {
        clearInterval(timerId);
        timerId = null;
      }
      updateSendButton();
    }
  } catch (e) {
    sendStatus.textContent = `Error: ${e.message || e}`;
    progressWrap.classList.add('hidden');
    sending = false;
    btnCancel.disabled = true;
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
    updateSendButton();
  }
});

btnCancel.addEventListener('click', async () => {
  await window.api.cancelSend();
});

btnClearLog.addEventListener('click', () => {
  sendLogEl.textContent = '';
});

window.api.onQr((dataUrl) => {
  qrImg.src = dataUrl;
  qrWrap.classList.remove('hidden');
  setConnText('Scan the QR code with WhatsApp');
});

window.api.onAuthenticated(() => {
  setConnText('Authenticated, loading…');
});

window.api.onReady(() => {
  connected = true;
  qrWrap.classList.add('hidden');
  setConnText('Connected');
  btnDisconnect.disabled = false;
  btnConnect.disabled = true;
  updateSendButton();
});

window.api.onAuthFailure((msg) => {
  connected = false;
  setConnText(`Auth failed: ${msg}`);
  btnDisconnect.disabled = true;
  btnConnect.disabled = false;
  updateSendButton();
});

window.api.onDisconnected((reason) => {
  connected = false;
  setConnText(`Disconnected: ${reason}`);
  btnDisconnect.disabled = true;
  btnConnect.disabled = false;
  qrWrap.classList.add('hidden');
  updateSendButton();
});

window.api.onSendProgress((data) => {
  const pct = data.total ? (data.current / data.total) * 100 : 0;
  progressBar.style.width = `${pct}%`;
  sendStatus.textContent = `Sending ${data.current} / ${data.total}…`;
  if (data.total) setStats({ total: data.total });

  if (data.lastPhone) {
    if (data.lastOk) sentCount += 1;
    else failedCount += 1;
    setStats({ sent: sentCount, failed: failedCount });
    appendLogLine({
      ok: !!data.lastOk,
      phone: data.lastPhone,
      message: data.lastOk ? '' : (data.lastError || 'Unknown error'),
    });
  }
});

window.api.onSendDone((summary) => {
  sending = false;
  btnCancel.disabled = true;
  updateSendButton();
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
  if (sendStartedAt) setStats({ elapsedMs: Date.now() - sendStartedAt });
  if (summary.cancelled) {
    sendStatus.textContent = `Stopped. Sent ${summary.sent} before cancel (${summary.failed} failed).`;
  } else {
    sendStatus.textContent = `Done. Sent ${summary.sent}, failed ${summary.failed}.`;
  }
  progressBar.style.width = summary.total ? '100%' : '0%';
});

window.api.onSendError((err) => {
  sending = false;
  btnCancel.disabled = true;
  updateSendButton();
  progressWrap.classList.add('hidden');
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
  sendStatus.textContent = `Send error: ${err}`;
});

(async () => {
  const st = await window.api.getStatus();
  if (st.ready) {
    connected = true;
    setConnText('Connected');
    btnDisconnect.disabled = false;
    btnConnect.disabled = true;
  }
  setStats({ elapsedMs: 0, sent: 0, failed: 0, total: rows.length });
  updateSendButton();
})();
