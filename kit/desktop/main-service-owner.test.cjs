const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{EventEmitter}=require('node:events');
const source=fs.readFileSync(__dirname+'/main.cjs','utf8');
function tracker(){const a=source.indexOf('function createServiceOwnerTracker()'),b=source.indexOf('\nfunction start(',a);assert(a>=0,'native service owner tracker is missing');return vm.runInNewContext('('+source.slice(a,b)+')')();}
function surface(){const wc=id=>Object.assign(new EventEmitter(),{id,mainFrame:{processId:id*10,routingId:id*10+1},isDestroyed:()=>false});const shell=wc(11),page=wc(12),win=Object.assign(new EventEmitter(),{id:1,isDestroyed:()=>false});const W={win,shellView:{webContents:shell},tabs:new Map([['a',{view:{webContents:page},tool:false}]]),active:'a'};return {W,shell,page,e:{sender:shell,senderFrame:shell.mainFrame}};}
test('native shell relay captures active WC and real document lifetime',()=>{const t=tracker(),s=surface(),o=t.capture(s.e,s.W,true);assert.equal(o.senderWebContentsId,11);assert.equal(o.sourceWebContentsId,12);assert.equal(o.sourceTabId,'a');assert(o.isCurrent());assert.equal(o.getWindow(),s.W.win);let cancelled=0;o.subscribe(()=>cancelled++);s.page.emit('did-start-navigation',{},'about:blank',false,true);assert(!o.isCurrent());assert.equal(cancelled,1);assert.equal(o.getWindow(),null);});
test('native active tab change invalidates the old lease',()=>{const t=tracker(),s=surface(),o=t.capture(s.e,s.W,true);let cancelled=0;o.subscribe(()=>cancelled++);s.W.active='b';t.activeChanged(s.W);assert(!o.isCurrent());assert.equal(cancelled,1);});
test('window closure, frame change and same-id WC replacement reject old owners',()=>{for(const change of [s=>s.W.win.emit('closed'),s=>s.page.mainFrame.routingId++,s=>s.W.tabs.set('a',{view:{webContents:{...s.page}},tool:false})]){const t=tracker(),s=surface(),o=t.capture(s.e,s.W,true);change(s);assert(!o.isCurrent());}});
test('direct page and subframe owners use the actual sender',()=>{const t=tracker(),s=surface(),o=t.capture({sender:s.page,senderFrame:s.page.mainFrame},s.W,false,'a');assert.equal(o.sourceWebContentsId,12);assert.equal(o.kind,'page');assert(o.isCurrent());assert.equal(t.capture({...s.e,senderFrame:{processId:999,routingId:999}},s.W,true),null);});
test('actual callback keeps from keys2 and passes owner only as third argument',async()=>{const t=tracker(),s=surface();let callback,seen;const a=source.indexOf("  ipcMain.handle('kit:service:call'"),b=source.indexOf("  ipcMain.on('kit:settings:load'",a);vm.runInNewContext(source.slice(a,b),{ipcMain:{handle(_n,f){callback=f;}},byContents:new Map(),shellOf:()=>s.W,serviceOwners:t,services:{'fixture.setup':(args,from,owner)=>{seen={args,from,owner};}},saveFile(){},appearanceBroker:{},updateBroker:{}});await callback(s.e,'fixture.setup',{owner:{sourceWebContentsId:999},approved:true});assert.deepEqual(Reflect.ownKeys(seen.from),['shell','mainFrame']);assert.equal(seen.owner.sourceWebContentsId,12);assert.notEqual(seen.owner,seen.args.owner);});
test('a service message for one document reaches only that in-app page, never a tool tab, another page or a closed one', () => {
  const a = source.indexOf('function serviceSendTo('), b = source.indexOf('\n}\n', a) + 2;
  assert(a >= 0, 'a per-document service message is missing');
  const sendTo = vm.runInNewContext('(' + source.slice(a, b) + ')');
  const got = [], wc = (id, destroyed = false) => ({ id, isDestroyed: () => destroyed, send: (...m) => got.push([id, ...m]) });
  const windows = new Set([{ tabs: new Map([['p', { view: { webContents: wc(5) }, tool: false }], ['t', { view: { webContents: wc(6) }, tool: true }], ['q', { view: { webContents: wc(7) }, tool: false }]]) },
    { tabs: new Map([['x', { view: { webContents: wc(8, true) }, tool: false }]]) }]);
  const emitTo = sendTo(windows);
  assert.equal(emitTo({ senderWebContentsId: 5 }, 'kube-watch', { sub: 'w1' }), true);
  assert.equal(emitTo({ senderWebContentsId: 6 }, 'kube-watch', {}), false);
  assert.equal(emitTo({ senderWebContentsId: 8 }, 'kube-watch', {}), false);
  assert.deepEqual(got, [[5, 'kit:service-event', 'kube-watch', { sub: 'w1' }]]);
});
test('a_closing_page_keeps_its_sender_until_destroyed_so_its_unload_calls_are_answered_not_refused', async () => {
  const at = (from, to) => { const a = source.indexOf(from), b = source.indexOf(to, a); assert(a >= 0 && b > a, from); return source.slice(a, b); };
  const page = Object.assign(new EventEmitter(), { id: 12, mainFrame: { processId: 120, routingId: 121 }, isDestroyed: () => false, close() {} });
  const W = { win: { contentView: { removeChildView() {} } }, tabs: new Map([['a', { view: { webContents: page }, tool: false }]]), detail: null };
  const byContents = new Map([[12, { W, tabId: 'a' }]]), ran = [];
  let callback;
  const context = { ipcMain: { handle(_n, f) { callback = f; } }, byContents, shellOf: () => null, serviceOwners: tracker(), clearTimeout,
    services: { 'sample.release': () => { ran.push('sample.release'); return { closed: true }; } }, saveFile() {}, appearanceBroker: {}, updateBroker: {} };
  vm.runInNewContext(at('  function closeTab(', '\n  const shellOf') + at("  ipcMain.handle('kit:service:call'", "  ipcMain.on('kit:settings:load'") + ';this.closeTab = closeTab;', context);
  context.closeTab(W, 'a');
  /* the tab is closed while its document still unloads: its watch release (sent on hide) gets an answer, and no service runs for it */
  assert.equal(JSON.stringify(await callback({ sender: page, senderFrame: page.mainFrame }, 'sample.release', { sub: 'w1' })), '{"error":"closed"}');
  assert.deepEqual(ran, []);
  page.emit('destroyed');
  await assert.rejects(callback({ sender: page, senderFrame: page.mainFrame }, 'sample.release', {}), /sender not allowed/);
});
/* B2-06: with the conversation card beside a page and the keyboard in the card, the page under it was "not current", so its services answered
   target (costs: "check the target"). A page placed under the open card is shown and current; it stops being current when it leaves the cards */
test('a_page_placed_beside_the_open_card_is_current_for_its_services', () => {
  const t = tracker(), s = surface();
  const o = t.capture({ sender: s.page, senderFrame: s.page.mainFrame }, s.W, false, 'a');
  s.W.tabs.set('card', { view: { webContents: Object.assign(new EventEmitter(), { id: 13, mainFrame: { processId: 130, routingId: 131 }, isDestroyed: () => false }) }, tool: false });
  s.W.active = 'card'; s.W.detail = { id: 'card', under: ['a'] };
  assert(o.isCurrent(), 'the page under the card is still current');
  s.W.detail = null;
  assert(!o.isCurrent(), 'once it is not placed it is not');
});
