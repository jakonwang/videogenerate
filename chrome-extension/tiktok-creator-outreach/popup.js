/* Creator Outreach side panel. All page actions use visible DOM controls. */
let activeTabId = null;
let mode = 'invite';
let creators = [];
let selectedIds = new Set();
let failedIds = new Set();
let plans = [];
let planId = null;
let runState = { status: 'idle', index: 0, batches: [], done: 0, failed: 0 };

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function status(message, kind = '') { $('status').textContent = message; $('status').className = `status ${kind}`; }
function output(value) { $('result').textContent = JSON.stringify(value, null, 2); }
function postEvent(type, payload) { fetch('http://127.0.0.1:47960/plugins/tiktok-creator-outreach/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, payload }) }).catch(() => {}); }
function contextFromUrl(raw) { const u = new URL(raw); return { url: raw, shopRegion: (u.searchParams.get('shop_region') || '').toUpperCase(), shopId: u.searchParams.get('shop_id') || '', path: u.pathname }; }
function updateContext(ctx) { const box = $('context'); box.innerHTML = ''; const title = document.createElement('strong'); const detail = document.createElement('span'); title.textContent = ctx?.shopRegion ? `${ctx.shopRegion} Affiliate` : 'TikTok Affiliate page required'; detail.textContent = ctx?.shopRegion ? `${ctx.shopId || 'No shop id'} / ${ctx.path || ''}` : 'Open a signed-in Affiliate page in the active tab.'; box.append(title, detail); }

function pageRead() {
  const clean = (e) => (e?.textContent || '').replace(/\s+/g, ' ').trim();
  const u = new URL(location.href);
  const rows = [...document.querySelectorAll('tr,[role="row"],[data-e2e*="creator"],[class*="creator-card"],[class*="creator-item"],[data-creator-id]')];
  const checkboxRows = [...document.querySelectorAll('input[type="checkbox"]')].map((box) => box.closest('tr,[role="row"],[data-creator-id],[class*="item"],[class*="card"]')).filter(Boolean);
  checkboxRows.forEach((row) => { if (!rows.includes(row)) rows.push(row); });
  const creators = rows.map((row, index) => {
    const links = [...row.querySelectorAll('a')]; const link = links.find((a) => /creator|profile|tiktok/i.test(a.href)) || links[0];
    const raw = clean(row); const name = clean(link) || clean(row.querySelector('[class*="name"],strong')) || clean(row).split(' ').find((part) => part.length > 2);
    const id = link?.href || row.getAttribute('data-creator-id') || `${name}-${index}`;
    return { id, name: name.slice(0, 160), raw: raw.slice(0, 700), url: link?.href || '', invited: /invited|already|合作中|已邀请|đã mời|đã hợp tác/i.test(raw) };
  }).filter((x) => x.name && !/creator name|select all|全选|nhà sáng tạo$/i.test(x.name));
  return { context: { url: location.href, shopRegion: (u.searchParams.get('shop_region') || '').toUpperCase(), shopId: u.searchParams.get('shop_id') || '', path: u.pathname }, creators };
}

async function pageScan(input) {
  const clean = (e) => (e?.textContent || '').replace(/\s+/g, ' ').trim();
  const target = Math.min(10000, Math.max(1, Number(input?.limit) || 50)); const wanted = String(input?.search || '').toLowerCase();
  const seen = new Map(); let stable = 0; let lastHeight = -1;
  const read = () => {
    const rows = [...document.querySelectorAll('tr,[role="row"],[data-e2e*="creator"],[class*="creator-card"],[class*="creator-item"],[data-creator-id]')];
    [...document.querySelectorAll('input[type="checkbox"]')].map((box) => box.closest('tr,[role="row"],[data-creator-id],[class*="item"],[class*="card"]')).filter(Boolean).forEach((row) => { if (!rows.includes(row)) rows.push(row); });
    rows.forEach((row, index) => { const link = [...row.querySelectorAll('a')].find((a) => /creator|profile|tiktok/i.test(a.href)) || row.querySelector('a'); const raw = clean(row); const name = clean(link) || clean(row.querySelector('[class*="name"],strong')) || clean(row).split(' ').find((part) => part.length > 2); if (!name || /creator name|select all|全选|nhà sáng tạo$/i.test(name) || (wanted && !`${name} ${raw}`.toLowerCase().includes(wanted))) return; const id = link?.href || row.getAttribute('data-creator-id') || `${name}-${index}`; seen.set(id, { id, name: name.slice(0, 160), raw: raw.slice(0, 700), url: link?.href || '', invited: /invited|already|合作中|已邀请|đã mời|đã hợp tác/i.test(raw) }); });
    const candidates = [...document.querySelectorAll('[class*="scroll-container"],[data-testid*="scroll"],[class*="infinite-scroll"],main')].filter((e) => e.scrollHeight > e.clientHeight + 80); return candidates.sort((a, b) => b.scrollHeight - b.clientHeight)[0] || document.scrollingElement;
  };
  for (let i = 0; i < 120 && seen.size < target; i += 1) {
    const container = read(); const before = seen.size; const height = container?.scrollHeight || 0; const bottom = container === document.scrollingElement || container === document.documentElement || container === document.body;
    if (bottom) window.scrollTo(0, document.documentElement.scrollHeight); else { container.scrollTop = container.scrollHeight; container.dispatchEvent(new Event('scroll', { bubbles: true })); }
    const more = [...document.querySelectorAll('button,[role="button"]')].find((b) => /load more|show more|next|加载更多|下一页|xem thêm|tiếp/i.test(clean(b)) && !b.disabled && b.getAttribute('aria-disabled') !== 'true');
    if (more && more.getBoundingClientRect().top < innerHeight * 2) { more.click(); await new Promise((r) => setTimeout(r, 650)); }
    await new Promise((r) => setTimeout(r, 500)); read(); stable = seen.size === before && height === lastHeight ? stable + 1 : 0; lastHeight = height;
    if (stable >= 4 && !more) break;
  }
  const u = new URL(location.href); return { context: { url: location.href, shopRegion: (u.searchParams.get('shop_region') || '').toUpperCase(), shopId: u.searchParams.get('shop_id') || '', path: u.pathname }, creators: [...seen.values()].slice(0, target), exhausted: seen.size < target };
}

function setNativeValue(element, value) { const proto = element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set; setter?.call(element, String(value)); element.dispatchEvent(new Event('input', { bubbles: true })); element.dispatchEvent(new Event('change', { bubbles: true })); }
function findField(root, words, tags = 'input,textarea') { return [...root.querySelectorAll(tags)].find((e) => !e.disabled && new RegExp(words.join('|'), 'i').test(`${e.placeholder || ''} ${e.getAttribute('aria-label') || ''} ${e.name || ''} ${e.parentElement?.textContent || ''}`)); }
async function pageInvite(input) {
  const clean = (e) => (e?.textContent || '').replace(/\s+/g, ' ').trim(); const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  if (!/target-invitation\/create/.test(location.pathname)) return { ok: false, reason: 'INVITE_CREATE_PAGE_REQUIRED', url: location.href };
  const root = document; const c = input.config || {}; const missing = [];
  const fields = [[['invitation name','invite name','名称','邀约名称'], c.name], [['end date','expiry','截止','有效'], c.expiresAt], [['message','邀约内容','邀请内容'], c.message], [['zalo'], c.zalo], [['facebook'], c.facebook]];
  fields.forEach(([words, value]) => { if (!value) return; const field = findField(root, words); if (!field) missing.push(words[0]); else setNativeValue(field, value); });
  const content = [...root.querySelectorAll('[role="combobox"],button')].find((e) => /content type|优先内容|loại nội dung/i.test(clean(e))); if (content && c.contentType) { content.click(); await wait(150); [...document.querySelectorAll('[role="option"],li')].find((e) => clean(e).toLowerCase().includes(String(c.contentType).toLowerCase()))?.click(); }
  const product = findField(root, ['product','商品','sản phẩm']); if (product && c.product) { setNativeValue(product, c.product); product.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await wait(200); }
  if (missing.length) return { ok: false, reason: 'INVITE_FIELDS_NOT_FOUND', missing };
  const creatorNames = input.names || []; let chosen = 0;
  for (const name of creatorNames.slice(0, 50)) { const row = [...root.querySelectorAll('tr,[role="row"],[class*="creator"]')].find((r) => clean(r).toLowerCase().includes(name.toLowerCase())); const box = row?.querySelector('input[type="checkbox"]'); if (box && !box.checked) { box.click(); chosen += 1; } }
  const buttons = [...root.querySelectorAll('button,[role="button"]')].filter((b) => /send|submit|create|gửi|发送|确认|创建/i.test(clean(b)) && !b.disabled && b.getAttribute('aria-disabled') !== 'true');
  if (buttons.length !== 1) return { ok: false, reason: buttons.length ? 'AMBIGUOUS_INVITE_SUBMIT' : 'INVITE_SUBMIT_NOT_FOUND', chosen };
  buttons[0].click(); await wait(700); return { ok: true, sent: chosen, button: clean(buttons[0]) };
}
async function pageMessage(input) {
  const clean = (e) => (e?.textContent || '').replace(/\s+/g, ' ').trim(); const wait = (ms) => new Promise((r) => setTimeout(r, ms)); const name = input.name; const search = [...document.querySelectorAll('input')].find((e) => /Tìm kiếm liên hệ|search|creator|联系人/i.test(`${e.placeholder} ${e.getAttribute('aria-label')}`));
  if (!search) return { ok: false, reason: 'MESSAGE_SEARCH_NOT_FOUND' }; setNativeValue(search, name); await wait(650);
  const option = [...document.querySelectorAll('[role="option"],li,[class*="conversation"],[class*="contact"]')].find((e) => clean(e).toLowerCase().includes(name.toLowerCase())); if (!option) return { ok: false, reason: 'CREATOR_CONVERSATION_NOT_FOUND', name }; option.click(); await wait(400);
  const editor = [...document.querySelectorAll('textarea,[contenteditable="true"]')].find((e) => !e.disabled && e.getAttribute('aria-disabled') !== 'true'); if (!editor) return { ok: false, reason: 'MESSAGE_EDITOR_NOT_FOUND', name };
  const body = String(input.body || '').replace(/\{\{creatorName\}\}/g, name).replace(/\{\{shopName\}\}/g, input.shopName || '').replace(/\{\{productName\}\}/g, input.productName || '').replace(/\{\{commissionRate\}\}/g, input.commissionRate || ''); if (editor.tagName === 'TEXTAREA') setNativeValue(editor, body); else { editor.textContent = body; editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: body })); }
  const buttons = [...document.querySelectorAll('button,[role="button"]')].filter((b) => /^(send|gửi|发送)$/i.test(clean(b)) && !b.disabled && b.getAttribute('aria-disabled') !== 'true'); if (buttons.length !== 1) return { ok: false, reason: buttons.length ? 'AMBIGUOUS_SEND_BUTTON' : 'SEND_BUTTON_NOT_FOUND', name }; buttons[0].click(); await wait(600); return { ok: true, name, sent: true };
}
async function execute(fn, args) { if (!activeTabId) throw new Error('NO_ACTIVE_TAB'); const result = await chrome.scripting.executeScript({ target: { tabId: activeTabId }, func: fn, args: args || [] }); return result?.[0]?.result; }
async function navigate(path) { const current = await chrome.tabs.get(activeTabId); const u = new URL(current.url); const params = new URLSearchParams(u.search); if (!params.get('shop_region')) params.set('shop_region', 'VN'); if (!params.get('shop_id')) { const c = contextFromUrl(current.url); if (c.shopId) params.set('shop_id', c.shopId); } const url = `https://affiliate.tiktok.com${path}?${params.toString()}`; await chrome.tabs.update(activeTabId, { url }); for (let i = 0; i < 30; i += 1) { await sleep(300); const tab = await chrome.tabs.get(activeTabId); if (tab.status === 'complete' && tab.url?.includes(path.split('?')[0])) return; } throw new Error('PAGE_LOAD_TIMEOUT'); }

function formConfig() { return { name: $('name').value.trim(), expiresAt: $('expires').value, product: $('product').value.trim(), contentType: $('contentType').value, commission: $('commission').value.trim(), adCommission: $('adCommission').value.trim(), inviteLink: $('inviteLink').value.trim(), message: $('messageBody').value, messageTemplate: $('messageBody').value }; }
function renderCreators() { const box = $('creatorList'); box.innerHTML = ''; creators.forEach((c) => { const row = document.createElement('label'); row.className = 'creator'; const input = document.createElement('input'); input.type = 'checkbox'; input.checked = selectedIds.has(c.id); input.addEventListener('change', () => { if (input.checked) selectedIds.add(c.id); else selectedIds.delete(c.id); }); const name = document.createElement('span'); name.className = 'creator-name'; name.textContent = c.name; const state = document.createElement('span'); state.className = `creator-state ${c.invited ? 'done' : ''}`; state.textContent = c.invited ? 'invited' : 'ready'; row.append(input, name, state); box.append(row); }); $('readCount').textContent = creators.length; }
function renderPlans() { const box = $('plans'); box.innerHTML = ''; plans.forEach((p) => { const row = document.createElement('div'); row.className = 'plan'; row.innerHTML = `<span>${p.name || 'Untitled plan'}<small> ${p.mode} / ${p.targetCount}</small></span><small>${p.status || 'draft'}</small>`; row.onclick = () => loadPlan(p); box.append(row); }); if (!plans.length) box.innerHTML = '<small style="color:#8da0b0">No saved plans yet.</small>'; }
function collectPlan() { return { id: planId || `campaign-${Date.now()}`, name: $('name').value.trim() || 'Untitled plan', mode, targetCount: Math.max(1, Number($('target').value) || 50), batchSize: Math.min(50, Math.max(1, Number($('batch').value) || 50)), expiresAt: $('expires').value, product: $('product').value.trim(), contentType: $('contentType').value, commission: $('commission').value.trim(), adCommission: $('adCommission').value.trim(), inviteLink: $('inviteLink').value.trim(), messageTemplate: $('messageBody').value, filters: { search: $('filterSearch').value.trim(), language: $('filterLanguage').value.trim() }, status: 'draft', updatedAt: new Date().toISOString() }; }
function loadPlan(p) { planId = p.id; mode = p.mode || 'invite'; $('name').value = p.name || ''; $('target').value = p.targetCount || 50; $('batch').value = p.batchSize || 50; $('expires').value = p.expiresAt || ''; $('product').value = p.product || ''; $('contentType').value = p.contentType || 'video'; $('commission').value = p.commission || ''; $('adCommission').value = p.adCommission || ''; $('inviteLink').value = p.inviteLink || ''; $('messageBody').value = p.messageTemplate || ''; $('filterSearch').value = p.filters?.search || ''; $('filterLanguage').value = p.filters?.language || ''; document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.mode === mode)); status(`Loaded plan: ${p.name}`, 'ok'); }
async function persistPlans() { await chrome.storage.local.set({ outreachPlans: plans }); renderPlans(); }
async function scan(full) { status(full ? 'Scanning internal creator container...' : 'Reading visible creators...'); const data = await execute(full ? pageScan : pageRead, [{ limit: Number($('target').value) || 50, search: $('filterSearch').value.trim() }]); creators = (data?.creators || []).filter((c) => mode === 'message' || !c.invited); selectedIds = new Set(creators.slice(0, Number($('target').value) || 50).map((c) => c.id)); updateContext(data?.context); renderCreators(); output(data); status(`Loaded ${creators.length} eligible creators. ${data?.exhausted ? 'No more results were found.' : 'Target reached.'}`, 'ok'); postEvent('scan.progress', { context: data?.context, count: creators.length, exhausted: data?.exhausted }); }
function buildBatches() { const chosen = creators.filter((c) => selectedIds.has(c.id)).slice(0, Math.max(1, Number($('target').value) || 50)); const size = Math.min(50, Math.max(1, Number($('batch').value) || 50)); const batches = []; for (let i = 0; i < chosen.length; i += size) batches.push(chosen.slice(i, i + size)); return batches; }
async function executeRun() {
  const batches = runState.batches.length ? runState.batches : buildBatches(); if (!batches.length) { status('Select at least one creator.', 'error'); return; } if (!confirm(`Confirm ${mode} for ${batches.reduce((n, b) => n + b.length, 0)} creators in ${batches.length} batches?`)) return;
  runState = { status: 'running', index: runState.index || 0, batches, done: runState.done || 0, failed: runState.failed || 0 }; $('batchCount').textContent = `${runState.index}/${batches.length}`; postEvent('campaign.created', { campaign: collectPlan(), batches: batches.length });
  if (mode === 'invite') { try { await navigate(`/affiliate/collaboration/target-invitation/create`); } catch (e) { runState.status = 'paused'; status(`Invite page failed to open: ${e}`, 'error'); return; } }
  else { try { await navigate(`/seller/im`); } catch (e) { runState.status = 'paused'; status(`Message page failed to open: ${e}`, 'error'); return; } }
  for (; runState.index < batches.length; runState.index += 1) {
    if (runState.status === 'cancelled' || runState.status === 'paused') break;
    const batch = batches[runState.index]; $('batchCount').textContent = `${runState.index + 1}/${batches.length}`; postEvent('batch.started', { index: runState.index + 1, count: batch.length });
    if (mode === 'invite') {
      if (runState.index > 0) { try { await navigate(`/affiliate/collaboration/target-invitation/create`); } catch (e) { runState.status = 'paused'; status(`Invite page failed to open: ${e}`, 'error'); break; } }
      let result;
      try { result = await execute(pageInvite, [{ names: batch.map((c) => c.name), config: formConfig() }]); } catch (e) { result = { ok: false, reason: String(e) }; }
      if (!result?.ok) { batch.forEach((c) => failedIds.add(c.id)); runState.failed += batch.length; runState.status = 'paused'; status(`Paused on batch ${runState.index + 1}: ${result?.reason || 'invite failed'}.`, 'error'); output(result); break; }
      runState.done += batch.length; batch.forEach((creator) => postEvent('creator.invited', { creator, result }));
    } else {
      for (const creator of batch) {
        while (runState.status === 'paused') await sleep(300); if (runState.status === 'cancelled') break; let result;
        try { result = await execute(pageMessage, [{ name: creator.name, body: $('messageBody').value, productName: $('product').value, commissionRate: $('commission').value }]); } catch (e) { result = { ok: false, reason: String(e) }; }
        if (result?.ok) { runState.done += 1; postEvent('creator.messaged', { creator, result }); } else { runState.failed += 1; failedIds.add(creator.id); postEvent('creator.failed', { creator, result }); runState.status = 'paused'; status(`Paused on ${creator.name}: ${result?.reason || 'message failed'}.`, 'error'); output(result); break; }
        $('doneCount').textContent = runState.done; $('failCount').textContent = runState.failed; $('progressBar').style.width = `${Math.round((runState.done / Math.max(1, batches.reduce((n, b) => n + b.length, 0))) * 100)}%`;
      }
    }
    $('doneCount').textContent = runState.done; $('failCount').textContent = runState.failed; $('progressBar').style.width = `${Math.round((runState.done / Math.max(1, batches.reduce((n, b) => n + b.length, 0))) * 100)}%`;
  }
  if (runState.status === 'running' && runState.index >= batches.length) { runState.status = 'completed'; status('All batches completed.', 'ok'); postEvent('campaign.completed', { done: runState.done, failed: runState.failed }); } await chrome.storage.local.set({ outreachRun: runState }); output(runState);
}

document.querySelectorAll('.tab').forEach((tab) => tab.onclick = () => { mode = tab.dataset.mode; document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === tab)); scan(false).catch(() => {}); });
$('scan').onclick = () => scan(true).catch((e) => { status(`Scan failed: ${e}`, 'error'); output({ ok: false, reason: String(e) }); }); $('read').onclick = () => scan(false).catch((e) => status(`Read failed: ${e}`, 'error')); $('refresh').onclick = () => scan(false).catch((e) => status(`Refresh failed: ${e}`, 'error')); $('selectAll').onclick = () => { selectedIds = new Set(creators.map((c) => c.id)); renderCreators(); }; $('clearAll').onclick = () => { selectedIds.clear(); renderCreators(); }; $('run').onclick = () => executeRun().catch((e) => { runState.status = 'paused'; status(String(e), 'error'); }); $('pause').onclick = () => { if (runState.status === 'running') { runState.status = 'paused'; postEvent('campaign.paused', runState); status('Paused. Resume continues from the current creator.'); } }; $('resume').onclick = () => { if (runState.status === 'paused') { runState.status = 'running'; postEvent('campaign.resumed', runState); status('Resuming current batch.', 'ok'); executeRun().catch((e) => status(String(e), 'error')); } }; $('cancel').onclick = () => { runState.status = 'cancelled'; postEvent('campaign.cancelled', runState); status('Cancelled. No further official buttons will be clicked.', 'error'); }; $('retry').onclick = () => { selectedIds = new Set([...selectedIds].filter((id) => failedIds.has(id))); runState = { status: 'idle', index: 0, batches: [], done: 0, failed: 0 }; executeRun().catch((e) => status(String(e), 'error')); }; $('newPlan').onclick = () => { planId = null; document.querySelectorAll('input,textarea').forEach((e) => { if (e.id !== 'target' && e.id !== 'batch') e.value = ''; }); mode = 'invite'; document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.mode === mode)); status('New plan ready.'); }; $('savePlan').onclick = async () => { const p = collectPlan(); const index = plans.findIndex((x) => x.id === p.id); if (index >= 0) plans[index] = p; else plans.push(p); planId = p.id; await persistPlans(); status('Plan saved for reuse.', 'ok'); }; $('deletePlan').onclick = async () => { if (!planId) return; plans = plans.filter((p) => p.id !== planId); planId = null; await persistPlans(); status('Plan deleted.', 'ok'); };

(async function init() { const stored = await chrome.storage.local.get(['outreachPlans', 'outreachRun']); plans = stored.outreachPlans || []; runState = stored.outreachRun || runState; renderPlans(); $('doneCount').textContent = runState.done || 0; $('failCount').textContent = runState.failed || 0; const tabs = await chrome.tabs.query({ active: true, currentWindow: true }); activeTabId = tabs[0]?.id; if (!activeTabId || !/^https:\/\/affiliate\.tiktok\.com\//.test(tabs[0]?.url || '')) { status('Open a signed-in TikTok Affiliate page in the active tab.', 'error'); return; } try { updateContext(contextFromUrl(tabs[0].url)); await scan(false); } catch (e) { status(`Waiting for page: ${e}`, 'error'); } })();
