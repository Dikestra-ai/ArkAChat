'use strict';
const WebSocket = require('ws');
const http = require('http');

function cdpSession(port) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:${port}/json`, (r) => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => {
        let targets;
        try { targets = JSON.parse(d); } catch (e) { return reject(new Error('parse: ' + d.slice(0, 100))); }
        const chatTarget = targets.find(t => t.url && (t.url.includes('3003') || t.url.includes('10.0.2.2')));
        if (!chatTarget) return reject(new Error(`No chat target on :${port}. Got: ${targets.map(t => t.url)}`));
        const ws = new WebSocket(chatTarget.webSocketDebuggerUrl);
        let msgId = 1;
        const pending = {};
        const logs = [];
        ws.on('open', () => {
          const send = (method, params = {}) => new Promise((res, rej) => {
            const id = msgId++;
            pending[id] = res;
            ws.send(JSON.stringify({ id, method, params }));
            setTimeout(() => { if (pending[id]) { delete pending[id]; rej(new Error(`CDP Timeout: ${method}`)); } }, 20000);
          });
          resolve({ send, ws, logs, port });
        });
        ws.on('message', (data) => {
          const msg = JSON.parse(data.toString());
          if (msg.method === 'Console.messageAdded') logs.push(`[${msg.params?.message?.level}] ${msg.params?.message?.text?.slice(0, 120)}`);
          if (pending[msg.id]) { pending[msg.id](msg); delete pending[msg.id]; }
        });
        ws.on('error', reject);
      });
    }).on('error', reject);
  });
}

async function eval_(s, expr, awaitP = false) {
  const r = await s.send('Runtime.evaluate', { expression: expr, awaitPromise: awaitP, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
  return r.result?.result?.value;
}

// Get __webpack_require__ via fake chunk push (works on both Chrome and Android WebView)
// Use window._wrcap as a persistent cache to survive re-calls in the same page lifecycle.
const GET_BRIDGE_SCRIPT = `(async function() {
  try {
    // Capture __webpack_require__ via Next.js chunk mechanism.
    // Use a window cache so repeated calls in the same session don't try to re-push
    // an already-installed chunk (webpack runtime ignores duplicate chunk IDs).
    if (!window._wrcap && typeof webpackChunk_N_E !== 'undefined') {
      webpackChunk_N_E.push([['_wrcap_' + Math.random().toString(36).slice(2)], {}, function(_wr) { window._wrcap = _wr; }]);
    } else if (!window._wrcap && typeof window.__webpack_require__ !== 'undefined') {
      window._wrcap = window.__webpack_require__;
    }
    const wr = window._wrcap;
    if (!wr || !wr.c) return JSON.stringify({ err: 'no webpack require, wr=' + typeof wr });
    
    // Find getBridgeInstance in module cache
    for (const id of Object.keys(wr.c)) {
      const mod = wr.c[id]?.exports;
      if (mod && typeof mod.getBridgeInstance === 'function') {
        const bridge = mod.getBridgeInstance();
        if (!bridge) return JSON.stringify({ err: 'getBridgeInstance returned null (BridgeProvider not mounted yet)' });
        return JSON.stringify({ ok: true, bridgeType: typeof bridge });
      }
    }
    return JSON.stringify({ err: 'getBridgeInstance not found in ' + Object.keys(wr.c).length + ' modules' });
  } catch (e) { return JSON.stringify({ err: e.message }); }
})()`;

async function callBridge(session, method, ...args) {
  const argsJson = args.map(a => JSON.stringify(a)).join(', ');
  const expr = `(async function() {
    try {
      if (!window._wrcap && typeof webpackChunk_N_E !== 'undefined') {
        webpackChunk_N_E.push([['_wrcap_' + Math.random().toString(36).slice(2)], {}, function(_wr) { window._wrcap = _wr; }]);
      } else if (!window._wrcap && typeof window.__webpack_require__ !== 'undefined') {
        window._wrcap = window.__webpack_require__;
      }
      const wr = window._wrcap;
      if (!wr || !wr.c) return JSON.stringify({err: 'no wr'});
      for (const id of Object.keys(wr.c)) {
        const mod = wr.c[id]?.exports;
        if (mod && typeof mod.getBridgeInstance === 'function') {
          const bridge = mod.getBridgeInstance();
          if (!bridge) return JSON.stringify({err: 'bridge null'});
          const result = await bridge.${method}(${argsJson});
          return JSON.stringify(result);
        }
      }
      return JSON.stringify({err: 'bridge not found'});
    } catch(e) { return JSON.stringify({err: e.message + ' | ' + (e.stack||'').split('\\n')[1]}); }
  })()`;
  const raw = await eval_(session, expr, true);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return raw; }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getContactsFromStore(session) {
  const raw = await eval_(session, `(function(){try{const d=JSON.parse(localStorage.getItem('arkachat-storage')||'{}');return JSON.stringify(d?.state?.contacts||[]);}catch(e){return'[]'}})()`) || '[]';
  return JSON.parse(raw);
}

async function getRecentIncoming(session, since) {
  const raw = await eval_(session, `(function(){try{const d=JSON.parse(localStorage.getItem('arkachat-storage')||'{}');const msgs=Object.values(d?.state?.messages||{}).flat();const r=msgs.filter(m=>!m.isOutgoing&&m.timestamp>${since});return JSON.stringify(r.map(m=>({txt:m.content?.slice(0,50),status:m.status,ts:m.timestamp})));}catch(e){return'[]'}})()`) || '[]';
  return JSON.parse(raw);
}

async function main() {
  const T0 = Date.now();
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  ArkAChat E2E: Non-headless Web Chrome ↔ Android WebView');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const [web, android] = await Promise.all([cdpSession(9222), cdpSession(9225)]);
  await Promise.all([web.send('Console.enable', {}), android.send('Console.enable', {})]);
  console.log('✅ Connected — user Chrome (:9222) + Android WebView (:9225)\n');

  // Verify bridge is accessible on both sides
  const webBridge = JSON.parse(await eval_(web, GET_BRIDGE_SCRIPT, true));
  const androidBridge = JSON.parse(await eval_(android, GET_BRIDGE_SCRIPT, true));
  if (webBridge.err) throw new Error('Web bridge: ' + webBridge.err);
  if (androidBridge.err) throw new Error('Android bridge: ' + androidBridge.err);
  console.log('✅ Bridge accessible on both sides\n');

  const webContacts0 = await getContactsFromStore(web);
  const androidContacts0 = await getContactsFromStore(android);
  console.log(`📊 Baseline — Web: ${webContacts0.length} contacts, Android: ${androidContacts0.length} contacts`);

  // ── [1] Web generates QR invitation ───────────────────────────────────────
  console.log('\n━━━ [1] Web → QR Invite ━━━');
  await eval_(web, `(function(){const b=[...document.querySelectorAll('button')].find(b=>b.title==='New contact');if(b)b.click();})()`);
  await sleep(600);
  await eval_(web, `(function(){const inp=document.querySelector('[data-testid="display-name-input"]');if(!inp)return;Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(inp,'WebUser');inp.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await sleep(200);
  await eval_(web, `(function(){const b=document.querySelector('[data-testid="show-qr-button"]');if(b)b.click();})()`);
  await sleep(2000);

  const invitation = await eval_(web, `document.querySelector('[data-testid="qr-code"]')?.getAttribute('data-value')`);
  if (!invitation || !invitation.includes('relay://')) throw new Error('No valid invitation in QR element');
  console.log(`✅ Invitation generated (${invitation.length} chars)`);

  const webContacts1 = await getContactsFromStore(web);
  // Find the contact created by THIS invitation run (diff vs baseline, newest Pending… wins)
  const prevIds = new Set(webContacts0.map(c => c.id));
  const newContacts = webContacts1.filter(c => !prevIds.has(c.id));
  const pending = newContacts.find(c => c.displayName === 'Pending…') || newContacts[0];
  if (!pending) throw new Error('New contact not created on web after QR. New contacts: ' + JSON.stringify(newContacts));
  console.log(`✅ "Pending…" contact on web (id: ${pending.id.slice(0, 8)})`);
  console.log(`   outboundQueueUri (→ Android): ${pending.outboundQueueUri?.slice(-40) || 'none'}`);

  // Close modal
  await eval_(web, `document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
  await sleep(300);

  // ── [2] Android accepts invitation ────────────────────────────────────────
  console.log('\n━━━ [2] Android ← Accept Invite ━━━');
  const contact = await callBridge(android, 'acceptInvitation', invitation);
  if (!contact || contact.err) throw new Error('acceptInvitation failed: ' + JSON.stringify(contact));
  console.log(`✅ Android accepted — contact: "${contact.displayName}" (id: ${contact.id.slice(0, 8)})`);
  console.log(`   isInitiator: ${contact.isInitiator}, queueUri: ${contact.simplexQueueUri?.slice(-30)}`);
  
  const androidContacts1 = await getContactsFromStore(android);
  console.log(`✅ Android contacts: ${androidContacts0.length} → ${androidContacts1.length}`);

  // ── [3] Android → Web: First message ────────────────────────────────────
  const testMsg1 = `Hello from Android WebView! 🔐 ${Date.now()}`;
  console.log(`\n━━━ [3] Android → Web: "${testMsg1.slice(0, 40)}..." ━━━`);
  const sendResult = await callBridge(android, 'sendTextMessage', contact.id, testMsg1);
  if (!sendResult || sendResult.err) throw new Error('sendTextMessage failed: ' + JSON.stringify(sendResult));
  console.log(`✅ Android sent message (id: ${sendResult.id?.slice(0, 8)}, status: ${sendResult.status})`);
  
  // Wait for delivery
  await sleep(2500);
  
  // Check web received it — the contact should now have a name from senderName
  const webContacts2 = await getContactsFromStore(web);
  const resolvedContact = webContacts2.find(c => c.displayName === 'AndroidUser' || (c.id === pending.id));
  console.log(`   Web pending contact name now: "${resolvedContact?.displayName || 'unknown'}"`);
  
  const webIncoming = await getRecentIncoming(web, T0 - 1000);
  if (webIncoming.length > 0) {
    console.log(`✅ Web received: "${webIncoming[0].txt}" (status: ${webIncoming[0].status})`);
  } else {
    console.log('⚠️  No incoming messages on web yet — checking store directly...');
    const allMsgs = await eval_(web, `(function(){try{const d=JSON.parse(localStorage.getItem('arkachat-storage')||'{}');const ms=Object.values(d?.state?.messages||{}).flat();return JSON.stringify(ms.slice(-5).map(m=>({txt:m.content?.slice(0,40),out:m.isOutgoing,status:m.status})));}catch(e){return'[]'}})()`);
    console.log('   Last 5 messages:', allMsgs);
  }

  // ── [4] Web → Android: Reply ─────────────────────────────────────────────
  const testMsg2 = `Reply from Web Chrome! Two-queue protocol ✅ ${Date.now()}`;
  console.log(`\n━━━ [4] Web → Android: "${testMsg2.slice(0, 40)}..." ━━━`);
  const replyResult = await callBridge(web, 'sendTextMessage', pending.id, testMsg2);
  if (!replyResult || replyResult.err) {
    console.log(`⚠️  sendTextMessage result: ${JSON.stringify(replyResult)}`);
  } else {
    console.log(`✅ Web sent reply (id: ${replyResult.id?.slice(0, 8)}, status: ${replyResult.status})`);
  }
  
  await sleep(2500);
  
  const androidIncoming = await getRecentIncoming(android, T0 - 1000);
  if (androidIncoming.length > 0) {
    console.log(`✅ Android received: "${androidIncoming[0].txt}" (status: ${androidIncoming[0].status})`);
  } else {
    console.log('⚠️  Android incoming not found');
    const allAndroid = await eval_(android, `(function(){try{const d=JSON.parse(localStorage.getItem('arkachat-storage')||'{}');const ms=Object.values(d?.state?.messages||{}).flat();return JSON.stringify(ms.slice(-5).map(m=>({txt:m.content?.slice(0,40),out:m.isOutgoing,status:m.status})));}catch(e){return'[]'}})()`);
    console.log('   Android last 5:', allAndroid);
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const elapsed = ((Date.now() - T0) / 1000).toFixed(1);
  const web3 = await getContactsFromStore(web);
  const android3 = await getContactsFromStore(android);
  
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`  Final contacts — Web: ${web3.length}, Android: ${android3.length} (${elapsed}s)`);
  const webIncoming2 = await getRecentIncoming(web, T0 - 1000);
  const androidIncoming2 = await getRecentIncoming(android, T0 - 1000);
  const webSent = (await eval_(web, `(function(){try{const d=JSON.parse(localStorage.getItem('arkachat-storage')||'{}');const ms=Object.values(d?.state?.messages||{}).flat();return String(ms.filter(m=>m.isOutgoing&&m.timestamp>${T0-1000}).length);}catch(e){return'0'}})()`) || '0');
  
  const pass = webIncoming2.length > 0 && androidIncoming2.length > 0;
  console.log(`  Bidirectional: Android→Web: ${webIncoming2.length > 0 ? '✅' : '❌'}, Web→Android: ${androidIncoming2.length > 0 ? '✅' : '❌'}`);
  console.log(`  ${pass ? '🎉 ALL TESTS PASSED' : '⚠️  SOME TESTS FAILED'}`);
  console.log('═══════════════════════════════════════════════════════════════');

  web.ws.close();
  android.ws.close();
  if (!pass) process.exit(1);
}

main().catch(e => { console.error('\n❌ FATAL:', e.message); process.exit(1); });
