/**
 * What the app knows about the muse.ai chat page: selectors, page snapshots and reply wording.
 *
 * Selectors and reply patterns are adapted from MUSE2API (https://github.com/czg86389-hub/muse2api):
 *
 * MIT License. Copyright (c) 2026 MUSE2API Authors
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
 * documentation files (the "Software"), to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and
 * to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of
 * the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO
 * THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF
 * CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
 * IN THE SOFTWARE.
 */

// Page scripts are strings: bundlers rewrite functions in ways that break inside the page.
const HELPERS = `
  const visible = (e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
  const composer = () => Array.from(document.querySelectorAll('textarea')).find(visible) || null;
  const roots = () => {
    const out = [];
    let el = composer();
    const form = el && el.closest('form');
    if (form) return [form];
    for (let i = 0; el && i < 4; i++) { el = el.parentElement; if (!el || el === document.body) break; out.push(el); }
    return out;
  };
  const BUBBLE = 'div[class*="hatch-chat-groupable-bubble"]';
  const bubbles = () => Array.from(document.querySelectorAll(BUBBLE));
  const isAgent = (b) => /hatch-agent-bubble-bg/.test(b.className || '');
  const isUser = (b) => /chat-user-bubble/.test(b.className || '');
  const flat = (s) => String(s || '').replace(/\\s+/g, ' ').trim();
`

const script = (body: string) => `(() => { ${HELPERS} ${body} })()`

export const READY_SCRIPT = script(`
  if (document.readyState !== 'complete') return 'loading';
  const body = document.body ? document.body.innerText : '';
  const input = composer();
  if (!input) return /log in|sign in|登录|create an account/i.test(body) ? 'login' : 'no-input';
  const shell = document.querySelector('[data-hatch-shell-hydration-state]');
  if (shell && shell.getAttribute('data-hatch-shell-hydration-state') !== 'hydrated') return 'loading';
  if (body.includes('Connecting...') || input.disabled) return 'connecting';
  return 'ready';
`)

export const COMPOSER_SCRIPT = script('return composer();')

export const FILE_INPUT_SCRIPT = script(`
  const inputs = Array.from(document.querySelectorAll('input[type="file"]'));
  for (const root of roots()) { const hit = inputs.find((x) => root.contains(x)); if (hit) return hit; }
  return null;
`)

export const ATTACHED_COUNT_SCRIPT = script(`
  for (const root of roots()) {
    const count = Array.from(root.querySelectorAll('button[aria-label]')).filter((b) =>
      /remove\\s*attachment|移除附件|删除附件/i.test(b.getAttribute('aria-label') || '') && !b.closest(BUBBLE)).length;
    if (count) return count;
  }
  return 0;
`)

/** The send button of the current composer only; chat history may contain its own "send" buttons. */
export const SEND_BUTTON_SCRIPT = script(`
  const input = composer();
  if (!input) return null;
  const label = /^(?:send(?:\\s+message)?|发送(?:消息)?|發送(?:訊息)?|傳送(?:訊息)?|送出)$/i;
  const testId = /^(?:hatch-composer-send-button|composer-send-button|send-button)$/i;
  const isSend = (b) => visible(b)
    && !b.closest('aside,nav,[role="navigation"],div[class*="chat-user-bubble"],' + BUBBLE)
    && (label.test((b.getAttribute('aria-label') || '').trim()) || testId.test(b.getAttribute('data-testid') || '') || label.test((b.innerText || '').trim()));
  for (let r = input.parentElement; r && r !== document.body; r = r.parentElement) {
    const hit = Array.from(r.querySelectorAll('button,[role="button"]')).find(isSend);
    if (hit) return hit;
    if (r.matches('form,main,[role="main"]')) break;
  }
  return null;
`)

export type MuseSnapshot = {
  path: string
  composerText: string
  attached: number
  stop: boolean
  userFound: boolean
  agentCount: number
  /** Text of the last reply that follows our message. */
  reply: string
  tail: string
  /** Muse itself says our message has not arrived. */
  undelivered: boolean
  videos: Array<{ src: string; width: number; height: number; duration: number; afterUser: boolean }>
}

/** `marker`: start of our prompt, used to find the message this job sent. */
export const snapshotScript = (marker: string) => script(`
  const scrollers = Array.from(document.querySelectorAll('*')).filter((e) => {
    const s = getComputedStyle(e);
    return (s.overflowY === 'auto' || s.overflowY === 'scroll') && e.scrollHeight > e.clientHeight + 100;
  }).sort((a, b) => b.scrollHeight - a.scrollHeight);
  if (scrollers[0]) scrollers[0].scrollTop = scrollers[0].scrollHeight;
  const marker = ${JSON.stringify(marker)};
  const all = bubbles();
  const mine = all.filter((b) => isUser(b) && flat(b.innerText).includes(marker)).pop() || null;
  const after = (e) => Boolean(mine && (mine.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING));
  const replies = all.filter((b) => isAgent(b) && flat(b.innerText) && (!mine || after(b)));
  const seen = new Set();
  const videos = [];
  for (const v of document.querySelectorAll('[data-testid^="hatch-chat-attachment-presentation-"] video, div[class*="hatch-agent-bubble-bg"] video')) {
    if (v.closest('form,div[class*="chat-user-bubble"]')) continue;
    const src = v.currentSrc || v.src || '';
    if (!src || seen.has(src)) continue;
    seen.add(src);
    videos.push({ src, width: v.videoWidth || 0, height: v.videoHeight || 0, duration: Number.isFinite(v.duration) ? v.duration : 0, afterUser: after(v) });
  }
  const input = composer();
  let attached = 0;
  for (const root of roots()) {
    attached = Array.from(root.querySelectorAll('button[aria-label]')).filter((b) =>
      /remove\\s*attachment|移除附件|删除附件/i.test(b.getAttribute('aria-label') || '') && !b.closest(BUBBLE)).length;
    if (attached) break;
  }
  return {
    path: location.pathname,
    composerText: input ? input.value : '',
    attached,
    stop: Boolean(document.querySelector('[data-testid="hatch-composer-stop-button"],button[aria-label*="Stop" i],button[aria-label*="停止"]')),
    userFound: Boolean(mine),
    agentCount: replies.length,
    reply: replies.length ? replies[replies.length - 1].innerText.trim() : '',
    tail: (document.body.innerText || '').slice(-1200),
    // Whole lines outside replies only: a prompt may contain the same words.
    undelivered: (document.body.innerText || '').slice(-1200).split('\\n').some((line) => /^(?:still sending|delivery not confirmed|正在发送|未确认送达)(?:[.…。·]*)$/i.test(line.trim())),
    videos,
  };
`)

export const readMediaScript = (src: string) => `(async () => {
  const response = await fetch(${JSON.stringify(src)});
  if (!response.ok) throw new Error('media ' + response.status);
  const bytes = new Uint8Array(await response.arrayBuffer());
  let text = '';
  for (let i = 0; i < bytes.length; i += 32768) text += String.fromCharCode.apply(null, bytes.subarray(i, i + 32768));
  return btoa(text);
})()`

/** The download button that belongs to this exact video, never another one on the page. */
export const downloadButtonScript = (src: string) => script(`
  const video = Array.from(document.querySelectorAll('video')).find((v) => (v.currentSrc || v.src) === ${JSON.stringify(src)});
  const box = video && video.closest('[data-testid^="hatch-chat-attachment-presentation-"]');
  const scope = box && (box.closest('[class*="group/widget-presentation"]') || box);
  if (!scope) return null;
  return Array.from(scope.querySelectorAll('button,[role="button"]')).find((b) => /下载|保存|download/i.test(b.getAttribute('aria-label') || '')) || null;
`)

/** Structure only (no chat text, no URLs with query strings), kept locally to diagnose page changes. */
export const DIAGNOSTIC_SCRIPT = script(`
  const uniq = (list) => Array.from(new Set(list)).slice(0, 150);
  return {
    path: location.pathname,
    ready: document.readyState,
    testIds: uniq(Array.from(document.querySelectorAll('[data-testid]')).map((e) => e.getAttribute('data-testid'))),
    labels: uniq(Array.from(document.querySelectorAll('main button[aria-label],form button[aria-label]')).map((e) => (e.getAttribute('aria-label') || '').slice(0, 60))),
    bubbleClasses: uniq(bubbles().map((b) => b.className)),
    textareas: document.querySelectorAll('textarea').length,
    editables: document.querySelectorAll('[contenteditable="true"]').length,
    fileInputs: Array.from(document.querySelectorAll('input[type="file"]')).map((e) => e.accept),
    videos: Array.from(document.querySelectorAll('video')).map((v) => ({ scheme: (v.currentSrc || v.src || '').split(':')[0], w: v.videoWidth, h: v.videoHeight })),
  };
`)

export type MuseReplyKind = 'quota' | 'busy' | 'refused' | 'other'

/** The video is being made or is done, whatever else the reply says. */
const IN_PROGRESS = new RegExp([
  '(?<!没有?|不是|未|无法|不能)正在(?:为你|为您|帮你|帮您)?(?:生成|制作|渲染|处理|重试)',
  '(?:还在|仍在)[^。！？!?]{0,6}(?:生成|制作|渲染|处理)',
  '(?:还没有?|尚未|仍未)[^。！？!?，,]{0,6}(?:生成|制作|渲染)(?:完成|完|好|结束)',
  '(?:我会|我将|现在|马上|立即|已经|并)(?:开始|为你|为您)(?:生成|制作)',
  '请稍[候等后](?![^。！？!?]{0,4}(?:再|重)试)',
  '(?<!没|未)(?:已经?|成功)生成(?!失败)',
  "\\bstill (?:being )?(?:render|generat|process|creat|working)",
  '\\bis being (?:render|generat|process|creat)',
  "\\b(?:i['’]m|i am|currently|now) (?:render|generat|creat|working on)",
  "\\bi(?:['’]ll| will) (?:now )?(?:start|begin|generate|create|make)",
  '\\bworking on (?:it|your|the)',
  '\\bwill be ready',
  '\\b(?:has|have) been (?:generated|created|rendered)',
  "\\b(?:video|clip) is (?:now )?ready",
].join('|'), 'i')

/** Says the allowance is gone; merely naming a limit, or talking about what would happen, is not enough. */
const QUOTA_GONE = /(?:额度|积分)(?:已经?)?(?:不足|用完|用尽|耗尽)(?!时|的话|[^。！？!?，,]{0,4}(?:会|将|可能))|已(?:经)?达到[^。！？!?，,]{0,10}上限|\b(?:you(?:['’]re| are)|you(?:['’]ve| have) run|(?:the )?account is|run|ran) out of (?:\w+ )?(?:credits|tokens|quota)|\b(?:reached|hit|exceeded|used up)\b[^.!?]{0,30}\b(?:limit|quota|allowance)\b|\b(?:quota|limit) (?:has been |was |is )?(?:exceeded|reached)/i
const HYPOTHETICAL = /如果|假如|若是|一旦|可能会|以免|避免|没有达到|未达到|不会达到|还没|尚未|\b(?:if|unless|when|once|before|avoid|until)\b[^.!?]{0,40}\b(?:limit|quota|credits|tokens|allowance)\b|(?:\bnot|n['’]t|\bnever)\b[^.!?]{0,20}\b(?:reached|hit|exceeded|out of|used up)\b/i

const sentences = (text: string) => text.split(/(?<=[。！？!?])|(?<=\.)\s+/)

/**
 * A wrong "quota" sends the prompt again and a wrong "refused" invites a retry, and both cost quota. So anything
 * unclear is `other`: the job waits, then goes to a person, and the result can still be collected.
 */
export function classifyMuseReply(text: string): MuseReplyKind {
  const reply = String(text || '').replace(/\s+/g, ' ').trim()
  if (IN_PROGRESS.test(reply)) return 'other'
  if (sentences(reply).some((sentence) => QUOTA_GONE.test(sentence) && !HYPOTHETICAL.test(sentence))) return 'quota'
  const failed = /(?:未能?|没(?:有)?|无法|不能)(?!(?:有|能)?(?:保证|确保|使用))[^。！？!?，,]{0,16}(?:生成|制作|提供|完成)|没生成成|生成失败|\b(?:can(?:no|['’])t|cannot|could(?: not|n['’]t)|unable to|failed to|won['’]t)\b(?! (?:guarantee|promise|ensure))[^.]{0,60}\b(?:generat|creat|mak|render|provide|help)/i.test(reply)
  if (failed && /国家|地区|country|region|违规|政策|policy|policies|安全|safety|不允许|not allowed|guidelines/i.test(reply)) return 'refused'
  if (/\b50[234]\b|过载|超载|繁忙|暂时不可用|暂不可用|\boverload(?:ed)?\b|temporarily unavailable|service unavailable/i.test(reply)) return 'busy'
  return failed ? 'refused' : 'other'
}
