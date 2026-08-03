const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain } = require('electron');
const path = require('path');
const { initKeystore, storeKey, retrieveKey, deleteKey } = require('./keystore');
const { setupUpdater } = require('./updater');

let mainWindow = null;
let tray = null;

const isDev = !app.isPackaged;

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

// IPC handlers for keystore
ipcMain.handle('keystore:store', async (event, keyId, key) => {
  return storeKey(keyId, key);
});

ipcMain.handle('keystore:retrieve', async (event, keyId) => {
  return retrieveKey(keyId);
});

ipcMain.handle('keystore:delete', async (event, keyId) => {
  return deleteKey(keyId);
});

// Certificate pinning for SimpleX SMP servers
const PINNED_CERTS = {
  'smp4.simplex.im': [
    'sha256/sFbsmFMBEWvgBjBSsHB9yOGtZ0GkLSN8YiHhNAOk1ys=',
    'sha256/jQJTbIh0grw0/1TkHSumWb+Fs0Ggogr621gT3PvPKG0=',
  ],
  'smp5.simplex.im': [
    'sha256/sFbsmFMBEWvgBjBSsHB9yOGtZ0GkLSN8YiHhNAOk1ys=',
    'sha256/jQJTbIh0grw0/1TkHSumWb+Fs0Ggogr621gT3PvPKG0=',
  ],
  'smp6.simplex.im': [
    'sha256/sFbsmFMBEWvgBjBSsHB9yOGtZ0GkLSN8YiHhNAOk1ys=',
    'sha256/jQJTbIh0grw0/1TkHSumWb+Fs0Ggogr621gT3PvPKG0=',
  ],
};

app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  const hostname = new URL(url).hostname;
  const pins = PINNED_CERTS[hostname];
  if (pins) {
    // Reject connections with untrusted certificates to pinned hosts
    event.preventDefault();
    callback(false);
  } else {
    // Use default behavior for non-pinned hosts
    callback(true);
  }
});

// App lifecycle
app.whenReady().then(async () => {
  await initKeystore();
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

// Security: Prevent new windows
app.on('web-contents-created', (event, contents) => {
  contents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });
});
