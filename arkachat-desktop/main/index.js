const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, session, shell, dialog } = require('electron');
const path = require('path');
const { initKeystore, storeKey, retrieveKey, deleteKey } = require('./keystore');
const { setupUpdater } = require('./updater');

let mainWindow = null;
let tray = null;

const isDev = !app.isPackaged;

// Origins the renderer is allowed to open network connections to.
// Keep this list minimal: the SimpleX SMP transport servers the app uses.
const ALLOWED_CONNECT_ORIGINS = [
  'https://smp4.simplex.im',
  'wss://smp4.simplex.im',
  'https://smp5.simplex.im',
  'wss://smp5.simplex.im',
  'https://smp6.simplex.im',
  'wss://smp6.simplex.im',
];

// Origin the top frame is pinned to (dev server in dev, packaged file: origin in prod).
const DEV_ORIGIN = 'http://localhost:3000';
const RENDERER_DIR = path.join(__dirname, '../renderer');

/**
 * Strict Content-Security-Policy for the renderer.
 *
 * - script-src: 'self' only (plus 'wasm-unsafe-eval' for the app's WASM crypto);
 *   no 'unsafe-inline' / 'unsafe-eval', so injected markup cannot execute script.
 * - connect-src: 'self' + the allow-listed SMP origins, so even if script were
 *   injected it could not exfiltrate keystore material to an attacker host.
 * - object-src 'none', base-uri 'none', form-action 'none', frame-ancestors 'none'.
 * - style-src allows 'unsafe-inline' because the static web export uses inline
 *   styles; this does not permit script execution.
 */
function buildCsp() {
  const connectSrc = ["'self'", ...ALLOWED_CONNECT_ORIGINS];
  if (isDev) {
    // Dev server + HMR websocket only.
    connectSrc.push(DEV_ORIGIN, 'ws://localhost:3000');
  }
  return [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    `connect-src ${connectSrc.join(' ')}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}

function installCsp() {
  const csp = buildCsp();
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    });
  });
}

/** True if `url` is inside the app's own origin (packaged renderer or dev server). */
function isAppUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (isDev && parsed.origin === DEV_ORIGIN) {
    return true;
  }
  if (parsed.protocol === 'file:') {
    // Only files inside the packaged renderer directory (or the main dir in dev).
    const filePath = path.normalize(decodeURIComponent(parsed.pathname));
    const rendererRoot = path.normalize(RENDERER_DIR + path.sep);
    return filePath.startsWith(rendererRoot);
  }
  return false;
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    titleBarStyle: 'hiddenInset',
    show: false,
  });

  // Load the app
  if (isDev) {
    await mainWindow.loadURL('http://localhost:3000/chat');
  } else {
    await mainWindow.loadFile(path.join(__dirname, '../renderer/chat.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray() {
  const iconPath = path.join(__dirname, '../assets/tray-icon.png');
  const icon = nativeImage.createFromPath(iconPath);

  tray = new Tray(icon.resize({ width: 16, height: 16 }));

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open ArkAChat',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quantum-safe: Active',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setToolTip('ArkAChat - Quantum-safe messaging');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });
}

// --- IPC input validation -------------------------------------------------
// All keystore IPC arguments come from the (potentially compromised) renderer
// and must be treated as untrusted.

const KEY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,255}$/;
const MAX_KEY_BYTES = 8192;

// Allow-listed key-ID prefixes. The renderer may only read/write keys whose
// IDs start with one of these strings. This limits the blast radius of a
// renderer XSS: an attacker that can call ipcRenderer.invoke('keystore:*')
// is restricted to the known per-contact key namespace and cannot enumerate
// or overwrite arbitrary secrets even with a valid-format key ID.
const KEY_ID_ALLOWED_PREFIXES = [
  'shared_key_',
  'media_key_',
  'session_key_',
  'device_key_',
];

function assertValidKeyId(keyId) {
  if (typeof keyId !== 'string' || !KEY_ID_PATTERN.test(keyId)) {
    throw new Error('keystore: invalid keyId');
  }
  const allowed = KEY_ID_ALLOWED_PREFIXES.some(p => keyId.startsWith(p));
  if (!allowed) {
    throw new Error(`keystore: keyId must start with one of: ${KEY_ID_ALLOWED_PREFIXES.join(', ')}`);
  }
}

function assertValidKeyMaterial(key) {
  if (typeof key === 'string') {
    if (key.length === 0 || key.length > MAX_KEY_BYTES) {
      throw new Error('keystore: invalid key material');
    }
    return;
  }
  // Structured clone delivers Uint8Array as-is and ArrayBuffer as ArrayBuffer.
  const byteLength =
    key instanceof Uint8Array ? key.byteLength :
    key instanceof ArrayBuffer ? key.byteLength :
    null;
  if (byteLength === null || byteLength === 0 || byteLength > MAX_KEY_BYTES) {
    throw new Error('keystore: invalid key material');
  }
}

// IPC handlers for keystore.
// SECURITY NOTE: retrieve() still hands raw key bytes to the renderer.
// Prefer the crypto:encrypt / crypto:decrypt handlers added below — they keep
// raw key bytes in the main process and expose only plaintext/ciphertext over
// the bridge. A renderer XSS can abuse retrieve() but cannot abuse crypto:*
// to read the raw key.
ipcMain.handle('keystore:store', async (event, keyId, key) => {
  assertValidKeyId(keyId);
  assertValidKeyMaterial(key);
  return storeKey(keyId, key instanceof ArrayBuffer ? new Uint8Array(key) : key);
});

ipcMain.handle('keystore:retrieve', async (event, keyId) => {
  assertValidKeyId(keyId);
  return retrieveKey(keyId);
});

ipcMain.handle('keystore:delete', async (event, keyId) => {
  assertValidKeyId(keyId);
  return deleteKey(keyId);
});

// --- In-process crypto (frontend-012) -----------------------------------
// These handlers perform AES-256-GCM encrypt/decrypt in the main process
// using a key from the OS keychain, so the renderer never sees raw key bytes.
// Use these instead of keystore:retrieve whenever possible.
//
// Wire format: iv(12) || ciphertext || GCM-tag(16) (same as Shield quickEncrypt)
const nodeCrypto = require('node:crypto');
const AES_GCM_ALGO = 'aes-256-gcm';
const AES_IV_BYTES = 12;
const AES_TAG_BYTES = 16;

ipcMain.handle('crypto:encrypt', async (event, keyId, plaintext) => {
  assertValidKeyId(keyId);
  const keyBytes = await retrieveKey(keyId);
  if (!keyBytes) throw new Error(`crypto:encrypt — key not found: ${keyId}`);
  const key = Buffer.isBuffer(keyBytes) ? keyBytes : Buffer.from(keyBytes);
  if (key.length !== 32) throw new Error('crypto:encrypt — key must be 32 bytes');
  const iv = nodeCrypto.randomBytes(AES_IV_BYTES);
  const data = plaintext instanceof ArrayBuffer ? Buffer.from(plaintext) : Buffer.from(plaintext);
  const cipher = nodeCrypto.createCipheriv(AES_GCM_ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const tag = cipher.getAuthTag();
  return new Uint8Array(Buffer.concat([iv, encrypted, tag]));
});

ipcMain.handle('crypto:decrypt', async (event, keyId, ciphertext) => {
  assertValidKeyId(keyId);
  const keyBytes = await retrieveKey(keyId);
  if (!keyBytes) throw new Error(`crypto:decrypt — key not found: ${keyId}`);
  const key = Buffer.isBuffer(keyBytes) ? keyBytes : Buffer.from(keyBytes);
  if (key.length !== 32) throw new Error('crypto:decrypt — key must be 32 bytes');
  const buf = ciphertext instanceof ArrayBuffer ? Buffer.from(ciphertext) : Buffer.from(ciphertext);
  if (buf.length < AES_IV_BYTES + AES_TAG_BYTES) throw new Error('crypto:decrypt — ciphertext too short');
  const iv = buf.slice(0, AES_IV_BYTES);
  const tag = buf.slice(buf.length - AES_TAG_BYTES);
  const enc = buf.slice(AES_IV_BYTES, buf.length - AES_TAG_BYTES);
  const decipher = nodeCrypto.createDecipheriv(AES_GCM_ALGO, key, iv);
  decipher.setAuthTag(tag);
  return new Uint8Array(Buffer.concat([decipher.update(enc), decipher.final()]));
});

// App version for the renderer (preload is sandboxed and must not require()
// arbitrary files).
ipcMain.handle('app:get-version', () => app.getVersion());

// NOTE on certificate handling: the previous 'certificate-error' handler was
// removed. It never compared the presented certificate against any pin set
// ('certificate-error' only fires AFTER Chromium has already rejected the
// cert), and its `callback(true)` branch for non-pinned hosts was the classic
// TLS-validation-bypass anti-pattern. Chromium's default validation (reject on
// any certificate error) now applies to all hosts. If real pinning of the SMP
// servers is desired, implement it with ses.setCertificateVerifyProc(), compare
// the presented chain's SPKI hashes against known pins on the SUCCESS path as
// well, and never accept a certificate Chromium has rejected.

// App lifecycle
app.whenReady().then(async () => {
  installCsp();

  const keystoreOk = await initKeystore();
  if (!keystoreOk) {
    // Do not silently degrade to in-memory key storage (LOW-1): surface it.
    if (isDev) {
      console.warn(
        'WARNING: OS keychain unavailable; using volatile in-memory keystore (dev only).'
      );
    } else {
      dialog.showErrorBox(
        'ArkAChat - Secure keystore unavailable',
        'The OS keychain could not be initialized. ArkAChat cannot store ' +
          'encryption keys securely on this system and will exit.'
      );
      app.exit(1);
      return;
    }
  }

  await createWindow();
  createTray();

  if (!isDev) {
    setupUpdater(mainWindow);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else if (mainWindow) {
      mainWindow.show();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
});

// Security: pin top-frame navigation to the app origin and deny new windows.
app.on('web-contents-created', (event, contents) => {
  // Block any top-frame navigation away from the app's own origin. External
  // https links are handed to the OS browser instead of navigating the window
  // that holds the preload/keystore bridge.
  const guardNavigation = (navEvent, url) => {
    if (isAppUrl(url)) {
      return;
    }
    navEvent.preventDefault();
    if (url.startsWith('https://')) {
      shell.openExternal(url).catch(() => {});
    }
  };
  contents.on('will-navigate', guardNavigation);
  contents.on('will-redirect', guardNavigation);

  // Never create new Electron windows. Validated https links open externally.
  contents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) {
      shell.openExternal(url).catch(() => {});
    }
    return { action: 'deny' };
  });
});
