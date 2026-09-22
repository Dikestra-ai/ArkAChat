/**
 * Electron Fuses post-pack hook.
 *
 * Flips Electron's built-in security fuses in the final binary to harden
 * the packaged app. Runs after electron-builder packs the app but before
 * signing, so signed binaries reflect the fuse state.
 *
 * Fuses enabled:
 *   RunAsNode                          OFF  — prevents `electron --require` abuse
 *   EnableNodeOptionsEnvironmentVariable OFF — blocks NODE_OPTIONS injection
 *   EnableNodeCliInspectArguments       OFF — no debugger attach via --inspect
 *   EnableCookieEncryption              ON   — session cookies encrypted at rest
 *   EnableEmbeddedAsarIntegrityValidation ON — verifies asar hash on load
 *   OnlyLoadAppFromAsar                 ON   — app code must live in the asar
 *
 * Reference: https://www.electronjs.org/docs/latest/tutorial/fuses
 */

'use strict';

const path = require('node:path');
const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses');

// electron-builder calls this as: module.exports(context)
// The context is the AfterPackContext from electron-builder.
module.exports = async function afterPack(context) {
  const { appOutDir, packager } = context;
  const platform = packager.platform.nodeName; // 'darwin' | 'win32' | 'linux'
  const productName = packager.appInfo.productName;

  const electronBinaryPath = getElectronBinaryPath(platform, appOutDir, productName);

  console.log(`[afterPack] Flipping Electron Fuses on: ${electronBinaryPath}`);

  await flipFuses(electronBinaryPath, {
    version: FuseVersion.V1,

    // Disable Node.js execution modes that allow arbitrary code injection
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,

    // Enable integrity and isolation features
    [FuseV1Options.EnableCookieEncryption]: true,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
  });

  console.log(`[afterPack] Fuses applied successfully`);
};

function getElectronBinaryPath(platform, appOutDir, productName) {
  switch (platform) {
    case 'darwin':
      // macOS: <appOutDir>/<ProductName>.app/Contents/MacOS/<ProductName>
      return path.join(appOutDir, `${productName}.app`, 'Contents', 'MacOS', productName);
    case 'win32':
      // Windows: <appOutDir>/<ProductName>.exe
      return path.join(appOutDir, `${productName}.exe`);
    default:
      // Linux: <appOutDir>/<productname> (lowercase, spaces replaced)
      return path.join(appOutDir, productName.toLowerCase().replace(/\s+/g, '-'));
  }
}
