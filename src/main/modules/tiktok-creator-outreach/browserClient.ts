import { BrowserWindow, session } from 'electron'
import type { CreatorRow } from './types'

export const CREATOR_OUTREACH_PARTITION_PREFIX = 'persist:tiktok-creator-outreach-'

function safeId(value: string) { return value.replace(/[^a-zA-Z0-9._-]/g, '_') }

export class TiktokCreatorOutreachBrowser {
  private window: BrowserWindow | null = null
  private accountId = ''

  async open(accountId: string, url: string) {
    const parsed = new URL(url)
    const region = parsed.searchParams.get('shop_region') || 'unknown'
    const shopId = parsed.searchParams.get('shop_id') || 'unknown'
    const sessionKey = `${safeId(accountId)}-${safeId(region)}-${safeId(shopId)}`
    const partition = `${CREATOR_OUTREACH_PARTITION_PREFIX}${sessionKey}`
    if (!this.window || this.window.isDestroyed() || this.accountId !== sessionKey) {
      this.window?.close()
      this.window = new BrowserWindow({ width: 1280, height: 900, show: true, title: 'TikTok Affiliate Creator Outreach', webPreferences: { partition, contextIsolation: true, nodeIntegration: false } })
      this.accountId = sessionKey
      this.window.webContents.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36')
      this.window.on('closed', () => { this.window = null; this.accountId = '' })
    }
    await this.window.loadURL(url)
    let fallbackUsed = false
    let finalUrl = this.window.webContents.getURL()
    if (/\/errorpage(?:\?|$)/i.test(finalUrl) && parsed.searchParams.get('shop_id')) {
      const fallback = new URL(url)
      fallback.searchParams.delete('shop_id')
      fallbackUsed = true
      await this.window.loadURL(fallback.toString())
      finalUrl = this.window.webContents.getURL()
    }
    this.window.show(); this.window.focus()
    const finalTitle = await this.window.webContents.executeJavaScript('document.title || ""', true).catch(() => '') as string
    const finalHost = (() => { try { return new URL(finalUrl).host } catch { return '' } })()
    const isAffiliateBackend = /(^|\.)affiliate\.tiktok\.com$/i.test(finalHost) && /\/affiliate\//i.test(finalUrl)
    console.log('[tiktok-creator-outreach] open', { requestedUrl: url, requestedRegion: region, shopId, finalUrl, finalHost, finalTitle, isAffiliateBackend })
    return { ok: true as const, url, requestedRegion: region, shopId, finalUrl, finalHost, finalTitle, isAffiliateBackend, fallbackUsed, redirected: finalUrl !== url }
  }

  async authStatus(accountId: string, shopRegion = 'unknown', shopId = 'unknown') {
    const partition = `${CREATOR_OUTREACH_PARTITION_PREFIX}${safeId(accountId)}-${safeId(shopRegion)}-${safeId(shopId)}`
    const cookies = await session.fromPartition(partition).cookies.get({ domain: 'tiktok.com' })
    const hasSession = cookies.some((cookie) => /session|sid_tt|uid_tt|ttwid/i.test(cookie.name))
    return { authenticated: hasSession, checkedAt: Date.now() }
  }

  async readCreators() {
    if (!this.window || this.window.isDestroyed()) throw new Error('OUTREACH_WINDOW_NOT_OPEN')
    return await this.window.webContents.executeJavaScript(`(${(): CreatorRow[] => {
      const text = (el: Element) => (el.textContent || '').replace(/\\s+/g, ' ').trim()
      const rows = Array.from(document.querySelectorAll('tr, [role="row"]')).slice(0, 500)
      return rows.map((row, index) => {
        const value = text(row)
        const link = row.querySelector('a')
        return { id: link?.getAttribute('href') || String(index), name: text(link || row).slice(0, 160), gmv: value.match(/GMV[^0-9]*([\\d.,KMB]+)/i)?.[1], followers: value.match(/([\\d.,KMB]+)\\s*followers/i)?.[1], invited: /invited|your creators|in affiliate program|message/i.test(value) }
      }).filter((item) => item.name && !/creator name|select all/i.test(item.name))
    }})()`, true) as CreatorRow[]
  }

  async executeConfirmed(action: 'invite' | 'message', count: number, creatorNames: string[] = [], body = '') {
    if (!this.window || this.window.isDestroyed()) throw new Error('OUTREACH_WINDOW_NOT_OPEN')
    if (!Number.isInteger(count) || count < 1 || count > 50) throw new Error('OUTREACH_BATCH_LIMIT')
    const labels = action === 'invite' ? ['Batch invite', 'Invite'] : ['Send', 'Send message']
    const result = await this.window.webContents.executeJavaScript(`(async () => {
      const action = ${JSON.stringify(action)};
      const labels = ${JSON.stringify(labels)}; const names = ${JSON.stringify(creatorNames)}; const message = ${JSON.stringify(body)};
      const text = (el: Element) => (el.textContent || '').replace(/\\s+/g, ' ').trim();
      if (action === 'message') {
        const search = Array.from(document.querySelectorAll('input')).find((el) => !el.disabled && /creator|search|name/i.test((el.placeholder || '') + ' ' + (el.getAttribute('aria-label') || '')));
        const editor = Array.from(document.querySelectorAll('textarea,[contenteditable="true"]')).find((el) => !el.hasAttribute('disabled'));
        if (!search || !editor) return { ok:false, reason:'MESSAGE_FIELDS_NOT_FOUND' };
        const results = [];
        for (const name of names) {
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
          setter?.call(search, name);
          search.dispatchEvent(new Event('input', { bubbles:true }));
          search.dispatchEvent(new Event('change', { bubbles:true }));
          await new Promise((resolve) => setTimeout(resolve, 700));
          const option = Array.from(document.querySelectorAll('[role="option"],li')).find((el) => text(el).toLowerCase().includes(name.toLowerCase()));
          if (!option) return { ok:false, reason:'CREATOR_NOT_FOUND', name, results };
          option.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          const personalized = message.replace(/\{\{creatorName\}\}/g, name);
          if (editor.tagName === 'TEXTAREA') {
            const editorSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
            editorSetter?.call(editor, personalized);
          } else {
            editor.textContent = personalized;
          }
          editor.dispatchEvent(new InputEvent('input', { bubbles:true, inputType:'insertText', data:personalized }));
          const buttons = Array.from(document.querySelectorAll('button,[role="button"]')).filter((el) => labels.includes(text(el)) && el.getAttribute('aria-disabled') !== 'true' && !el.hasAttribute('disabled'));
          if (buttons.length !== 1) return { ok:false, reason:buttons.length ? 'AMBIGUOUS_SEND_BUTTON' : 'SEND_BUTTON_NOT_FOUND', name, results };
          buttons[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
          await new Promise((resolve) => setTimeout(resolve, 700));
          results.push({ name, status: 'sent' });
        }
        return { ok:true, sent:names.length, results };
      }
      const rows = Array.from(document.querySelectorAll('tr,[role="row"]'));
      for (const name of names) {
        const row = rows.find((el) => text(el).toLowerCase().includes(name.toLowerCase()));
        if (!row) return { ok:false, reason:'CREATOR_ROW_NOT_FOUND', name };
        const checkbox = row.querySelector('input[type="checkbox"]');
        if (!checkbox) return { ok:false, reason:'CREATOR_CHECKBOX_NOT_FOUND', name };
        if (!checkbox.checked) checkbox.click();
      }
      const nodes = Array.from(document.querySelectorAll('button,[role="button"]')); const matches = nodes.filter((el) => labels.includes(text(el))); if (matches.length !== 1) return { ok:false, reason:matches.length ? 'AMBIGUOUS_BUTTON' : 'BUTTON_NOT_FOUND' }; matches[0].click(); return { ok:true, label:text(matches[0]) };
    })()`, true) as { ok: boolean; reason?: string; name?: string; sent?: number }
    if (!result.ok) throw new Error(result.reason || 'OUTREACH_ACTION_UNAVAILABLE')
    return { ok: true as const, prepared: true, clicked: true, sent: result.sent, note: 'The confirmed official-page action was completed. Review the result in TikTok.' }
  }

  close() { this.window?.close(); this.window = null; this.accountId = '' }
}
