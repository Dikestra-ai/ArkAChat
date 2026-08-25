'use strict';
const WebSocket = require('ws');
const http = require('http');

function fetchTargets(port) {
  return new Promise((res, rej) => {
    http.get('http://localhost:' + port + '/json', (r) => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => { try { res(JSON.parse(d)); } catch(e) { rej(e); } });
    }).on('error', rej);
  });
}

function makeSession(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 1;
    const pending = {};
    ws.on('open', () => {
      const send = (method, params = {}) => new Promise((res, rej) => {
        const mid = id++;
        pending[mid] = res;
        ws.send(JSON.stringify({ id: mid, method, params }));
        setTimeout(() => { if (pending[mid]) { delete pending[mid]; rej(new Error('Timeout: ' + method)); } }, 30000);
      });
      resolve({ send, ws });
    });
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.id && pending[msg.id]) { pending[msg.id](msg); delete pending[msg.id]; }
    });
    ws.on('error', reject);
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  // Step 1: Generate invitation from Web Chrome
  console.log('=== Step 1: Generate invitation on Web ===');
  const webTargets = await fetchTargets(9222);
  const webTarget = webTargets.find(t => t.url && t.url.includes('3003'));
  if (!webTarget) { console.log('No web target on :9222'); return; }

  const web = await makeSession(webTarget.webSocketDebuggerUrl);
  await web.send('Console.enable', {});
  web.ws.on('message', m => {
    const msg = JSON.parse(m.toString());
    if (msg.method === 'Console.messageAdded') {
      console.log('[WEB console]', msg.params?.message?.text?.slice(0, 100));
    }
  });

  // Open "New Contact" modal
  await web.send('Runtime.evaluate', {expression: '(function(){const b=[...document.querySelectorAll("button")].find(b=>b.title==="New contact");if(b)b.click();})()'});
  await sleep(600);

  // Enter display name
  await web.send('Runtime.evaluate', {expression: `(function(){const inp=document.querySelector('[data-testid="display-name-input"]');if(!inp)return;Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(inp,'WebDebugUser');inp.dispatchEvent(new Event('input',{bubbles:true}));})()`});
  await sleep(200);

  // Click "Show QR"
  await web.send('Runtime.evaluate', {expression: `(function(){const b=document.querySelector('[data-testid="show-qr-button"]');if(b)b.click();})()`});
  await sleep(2000);

  const invResp = await web.send('Runtime.evaluate', {
    expression: `document.querySelector('[data-testid="qr-code"]')?.getAttribute('data-value')`,
    returnByValue: true
  });
  const invitation = invResp.result?.result?.value;
  if (!invitation) { console.log('No invitation found!'); web.ws.close(); return; }
  console.log('Got invitation (' + invitation.length + ' chars):', invitation.slice(0, 100) + '...');

  // Close modal
  await web.send('Runtime.evaluate', {expression: 'document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}))'});
  web.ws.close();

  // Step 2: Try acceptInvitation on Android with inner timeout
  console.log('\n=== Step 2: acceptInvitation on Android (with 15s inner timeout) ===');
  const androidTargets = await fetchTargets(9225);
  const androidTarget = androidTargets.find(t => t.url && (t.url.includes('10.0.2') || t.url.includes('3003')));
  if (!androidTarget) { console.log('No android target on :9225'); return; }
  console.log('Android target:', androidTarget.url);

  const android = await makeSession(androidTarget.webSocketDebuggerUrl);
  await android.send('Console.enable', {});
  android.ws.on('message', m => {
    const msg = JSON.parse(m.toString());
    if (msg.method === 'Console.messageAdded') {
      console.log('[AND console]', msg.params?.message?.text?.slice(0, 120));
    }
  });

  const t0 = Date.now();
  console.log('Starting CDP Runtime.evaluate with awaitPromise...');

  const invStr = JSON.stringify(invitation);
  const expr = `(async function() {
    try {
      let wr = null;
      if (typeof webpackChunk_N_E !== 'undefined') {
        webpackChunk_N_E.push([['_acc_dbg_'], {}, function(_wr) { wr = _wr; }]);
      } else {
        return JSON.stringify({err: 'no webpackChunk_N_E'});
      }
      if (!wr || !wr.c) return JSON.stringify({err: 'no wr.c'});

      for (const id of Object.keys(wr.c)) {
        const mod = wr.c[id]?.exports;
        if (mod && typeof mod.getBridgeInstance === 'function') {
          const bridge = mod.getBridgeInstance();
          if (!bridge) return JSON.stringify({err: 'bridge null'});
          console.log('[ANDROID] Found bridge, calling acceptInvitation...');
          const result = await Promise.race([
            bridge.acceptInvitation(${invStr}),
            new Promise((_, rej) => setTimeout(() => rej(new Error('acceptInvitation TIMED OUT after 15s')), 15000))
          ]);
          console.log('[ANDROID] acceptInvitation returned:', typeof result);
          return JSON.stringify({ok: true, contact: {id: result?.id?.slice(0,8), name: result?.displayName, isInit: result?.isInitiator}});
        }
      }
      return JSON.stringify({err: 'getBridgeInstance not in ' + Object.keys(wr.c).length + ' modules'});
    } catch(e) {
      console.log('[ANDROID] ERROR:', e.message);
      return JSON.stringify({err: e.message, stack: (e.stack || '').slice(0, 400)});
    }
  })()`;

  const result = await android.send('Runtime.evaluate', {
    expression: expr,
    awaitPromise: true,
    returnByValue: true
  });

  const elapsed = Date.now() - t0;
  console.log('Elapsed:', elapsed + 'ms');
  const rawValue = result?.result?.result?.value;
  const exDetails = result?.result?.exceptionDetails;
  if (exDetails) {
    console.log('CDP exception:', JSON.stringify(exDetails).slice(0, 400));
  } else if (rawValue) {
    try {
      const parsed = JSON.parse(rawValue);
      console.log('Result:', JSON.stringify(parsed, null, 2));
    } catch {
      console.log('Raw value:', rawValue.slice(0, 400));
    }
  } else {
    console.log('Full CDP response:', JSON.stringify(result?.result || result).slice(0, 600));
  }

  android.ws.close();
}

main().catch(e => { console.error('FATAL:', e.message, e.stack?.slice(0, 300)); process.exit(1); });
