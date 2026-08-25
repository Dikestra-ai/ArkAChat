/**
 * Auto-updater for desktop app.
 * Uses electron-updater for automatic updates.
 *
 * SECURITY MODEL (see security-review HIGH-2):
 *  - The feed is the hard-coded GitHub provider from package.json `build.publish`
 *    (always https://github.com / objects.githubusercontent.com). Any explicitly
 *    configured non-HTTPS feed URL disables updates (fail closed).
 *  - Downloaded updates are only trustworthy if the installed app is code-signed:
 *    on Windows electron-updater verifies the new installer's Authenticode
 *    signature against the installed app's publisher (`win.publisherName` +
 *    `verifyUpdateCodeSignature` in package.json); on macOS Squirrel.Mac refuses
 *    updates that do not match the app's Developer ID signature. On platforms
 *    with no signature verification (Linux AppImage) we fail closed: updates are
 *    never downloaded or installed automatically.
 *  - `forceCodeSigning: true` in package.json makes electron-builder refuse to
 *    produce unsigned release artifacts, so an unsigned build cannot ship.
 */

const { app } = require('electron');
const { autoUpdater } = require('electron-updater');

/** Platforms where the update pipeline enforces a code signature. */
function signatureVerificationAvailable() {
  return process.platform === 'darwin' || process.platform === 'win32';
}

/** Reject any explicitly configured plaintext feed. */
function feedIsHttps() {
  let feedURL = null;
  try {
    feedURL = autoUpdater.getFeedURL();
  } catch {
    // No explicit feed configured: electron-updater falls back to the
    // package.json GitHub provider, which is HTTPS-only.
    return true;
  }
  if (!feedURL) return true;
  return String(feedURL).startsWith('https://');
}

function setupUpdater(mainWindow) {
  const disabledReason = !app.isPackaged
    ? 'updates disabled in development'
    : !signatureVerificationAvailable()
      ? 'no update signature verification on this platform'
      : !feedIsHttps()
        ? 'update feed is not HTTPS'
        : null;

  if (disabledReason) {
    // Fail closed: no unauthenticated code may be fetched or installed.
    console.warn(`Auto-update disabled: ${disabledReason}`);
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    const disabled = () => Promise.reject(new Error(`Auto-update disabled: ${disabledReason}`));
    return {
      checkForUpdates: disabled,
      downloadUpdate: disabled,
      quitAndInstall: () => {},
    };
  }

  // Configure auto-updater
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowDowngrade = false;
  autoUpdater.allowPrerelease = false;
  autoUpdater.forceDevUpdateConfig = false;

  // Check for updates
  autoUpdater.checkForUpdates().catch((err) => {
    console.log('Update check failed:', err.message);
  });

  // Events
  autoUpdater.on('update-available', (info) => {
    console.log('Update available:', info.version);
    mainWindow?.webContents.send('update-available', info);
  });

  autoUpdater.on('update-not-available', () => {
    console.log('No updates available');
  });

  autoUpdater.on('download-progress', (progress) => {
    mainWindow?.webContents.send('update-progress', progress);
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('Update downloaded:', info.version);
    mainWindow?.webContents.send('update-downloaded', info);
  });

  autoUpdater.on('error', (error) => {
    console.error('Auto-updater error:', error);
  });

  return {
    checkForUpdates: () => autoUpdater.checkForUpdates(),
    downloadUpdate: () => autoUpdater.downloadUpdate(),
    quitAndInstall: () => autoUpdater.quitAndInstall(),
  };
}

module.exports = { setupUpdater };
