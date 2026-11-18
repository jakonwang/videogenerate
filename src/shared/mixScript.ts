/**
 * 混剪配音文案（电脑端混剪工作台和网页版生产中心共用）：提示词、解析、自动模式拼句。纯逻辑，不调模型。
 */
import { SPEECH_UNITS_PER_SEC, type MixDraft, type MixFormula, type MixLanguage } from './mixFormula'

/** The product facts the script writer needs (desktop Product and web SyncProduct both fit). */
export type ScriptProduct = {
  name: string
  type: string
  productAnalysis?: { summary?: string; materialDetails?: string; colorDetails?: string; sizeScale?: string } | null
}

const LANGUAGE_NAME: Record<MixLanguage, string> = {
  'vi-VN': 'Vietnamese (Vietnam, casual TikTok tone, use "mình/bạn")',
  'zh-CN': 'Simplified Chinese (casual Douyin/TikTok tone)',
  'en-US': 'American English (casual TikTok tone)',
  'th-TH': 'Thai (casual TikTok tone)',
  'id-ID': 'Indonesian (casual TikTok tone)',
}

const CART_PHRASE: Record<MixLanguage, string> = {
  'vi-VN': 'giỏ hàng màu vàng',
  'zh-CN': '左下角小黄车',
  'en-US': 'the orange cart',
  'th-TH': 'ตะกร้าสีเหลือง',
  'id-ID': 'keranjang kuning',
}

/** Rotated across a batch so every video tests a different opener. */
export const HOOK_STYLES = [
  'call out the exact buyer ("If you have sensitive ears...")',
  'result first (show-off line about how it looks / works)',
  'curiosity gap ("Nobody tells you this about ...")',
  'price shock (only if a price/offer is given; else value surprise)',
  'problem question ("Tired of ...?")',
  'social proof ("Everyone keeps asking where I got this")',
  'POV / mini story ("POV: you finally found ...")',
  'myth bust / contrarian ("Stop buying cheap ...")',
]

const UNIT_LABEL: Record<MixLanguage, string> = {
  'vi-VN': 'words',
  'zh-CN': 'Chinese characters',
  'en-US': 'words',
  'th-TH': 'Thai characters',
  'id-ID': 'words',
}

/** Seller SKUs like "A-223" / "E-33" / "D13": internal codes, meaningless (and odd) when read aloud. */
export function looksLikeSkuCode(name: string) {
  return /^[A-Za-z]{1,4}[-_ ]?\d{1,6}[A-Za-z]?$/.test(String(name || '').trim())
}

export function productBrief(product: ScriptProduct, sellingPoints?: string) {
  const a = product.productAnalysis
  const sku = looksLikeSkuCode(product.name)
  return [
    sku
      ? `Product type: ${product.type}. Its name "${product.name}" is an internal SKU code: NEVER say or write it; refer to the product by what it is (e.g. "this ring").`
      : `Product: ${product.name} (type: ${product.type})`,
    a?.summary ? `Summary: ${a.summary}` : '',
    a?.materialDetails ? `Material: ${a.materialDetails}` : '',
    a?.colorDetails ? `Color: ${a.colorDetails}` : '',
    a?.sizeScale ? `Size: ${a.sizeScale}` : '',
    sellingPoints?.trim() ? `Seller notes (selling points, price, offer, audience - the ONLY source of prices/discounts):\n${sellingPoints.trim()}` : 'No price or offer was given: do not mention any price, discount or free gift.',
  ]
    .filter(Boolean)
    .join('\n')
}

export function draftBrief(draft: MixDraft, formula: MixFormula | undefined, index: number, style: string, lang: MixLanguage) {
  const speakSec = Math.max(4, draft.totalDurationSec - 0.8)
  const units = Math.round(speakSec * SPEECH_UNITS_PER_SEC[lang])
  let t = 0
  const shots = draft.shots
    .map((s, i) => {
      const beat = formula?.beats.find((b) => b.role === s.role)
      const line = `  ${i + 1}. ${t.toFixed(1)}-${(t + s.durationSec).toFixed(1)}s [${s.role}] ${s.description || ''}${beat?.scriptHint ? ` — say: ${beat.scriptHint}` : ''}`
      t += s.durationSec
      return line
    })
    .join('\n')
  return [
    `### Video ${index + 1}`,
    `Angle: ${formula?.name ?? draft.formulaName}${formula?.description ? ` — ${formula.description}` : ''}`,
    `Hook style to use: ${style}`,
    `Length: ${draft.totalDurationSec.toFixed(1)}s → voiceover of ${Math.round(units * 0.8)}-${units} ${UNIT_LABEL[lang]}. HARD LIMIT ${units} ${UNIT_LABEL[lang]}: a longer voiceover gets cut off mid-sentence.`,
    'Shots in order:',
    shots,
    formula?.referenceScript?.voiceover ? `Style reference from a proven video (do not copy, match the rhythm): ${formula.referenceScript.voiceover.slice(0, 400)}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

export const SCRIPT_SYSTEM = [
  'You write voiceovers for TikTok Shop product videos that convert. Rules you always follow:',
  '- The first sentence is the hook and must stop the scroll in under 2 seconds; never start with greetings or the brand.',
  '- Speak like a real person who bought and uses the product (UGC), not like an ad. Short sentences, one idea per shot.',
  '- Every sentence matches the shot on screen at that moment.',
  '- Name concrete benefits and details visible in the shots; no vague praise. Describe only what the shots and product notes support; never invent sizes, materials or specs.',
  '- End with a clear CTA that points to the shopping cart.',
  '- TikTok Shop compliance: no "best/No.1/100%", no medical or guaranteed-result claims, no invented prices, discounts, stock or reviews.',
  '- Reply with strict JSON only.',
].join('\n')


export type ScriptInput = {
  product: ScriptProduct
  drafts: MixDraft[]
  formulas: Map<string, MixFormula>
  language: MixLanguage
  sellingPoints?: string
  /** Hook style per draft (same order as drafts). */
  styles: string[]
  /** Scripts of past S/A-grade videos: proof of what converts for this audience. */
  winners?: Array<{ grade: string; title: string; voiceover: string }>
  /** Winner remake: keep this video's hook idea, rewrite everything else. */
  keepHookFrom?: { title: string; voiceover: string }
}

/** Builds the system + user prompt for one batch of drafts (desktop and web send it to their own model). */
export function buildScriptPrompt(input: ScriptInput): { system: string; prompt: string; styles: string[] } {
  const lang = input.language
  const styles = input.drafts.map((_, i) => input.styles[i] ?? HOOK_STYLES[i % HOOK_STYLES.length]!)
  const winnerBlock = input.winners?.length
    ? [
        'These scripts already converted well (GMV Max grade in brackets). Learn what works - hook angle, rhythm, proof, CTA - but never copy sentences:',
        ...input.winners.map((w, i) => `  W${i + 1} [${w.grade}] title: ${w.title} | voiceover: ${w.voiceover.slice(0, 360)}`),
      ].join('\n')
    : ''
  const keepHook = input.keepHookFrom
    ? `This batch remakes a winning video. Every script must open with the same hook idea as: "${input.keepHookFrom.voiceover.split(/(?<=[.!?。！？])\s*/)[0]}" (rephrase it, same promise), then use a different body and CTA wording each time.`
    : ''
  const prompt = [
    `Write ${input.drafts.length} different voiceover scripts in ${LANGUAGE_NAME[lang]}.`,
    productBrief(input.product, input.sellingPoints),
    `CTA should mention ${CART_PHRASE[lang]}.`,
    winnerBlock,
    keepHook,
    '',
    ...input.drafts.map((d, i) => draftBrief(d, input.formulas.get(d.formulaId), i, styles[i]!, lang)),
    '',
    'For each video return:',
    '- "title": on-screen hook text, max 8 words (max 14 characters for Chinese/Thai), can differ from the spoken hook, no hashtags, at most one emoji.',
    '- "voiceover": the full spoken text, hook first, CTA last, plain text, no shot numbers, no emojis.',
    input.keepHookFrom ? 'Do not reuse body sentences across videos.' : 'Every video must open with a different hook. Do not reuse sentences across videos.',
    `Return: {"scripts":[{"index":1,"title":"","voiceover":""}]} with ${input.drafts.length} items.`,
  ].join('\n')
  return { system: SCRIPT_SYSTEM, prompt, styles }
}

/** Pulls the JSON object / array out of a model reply (code fences and chatter allowed). */
export function extractJsonText(raw: string) {
  const text = String(raw || '').trim()
  if (!text) return ''
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const body = fenced?.[1]?.trim() || text
  const objectStart = body.indexOf('{')
  const objectEnd = body.lastIndexOf('}')
  if (objectStart >= 0 && objectEnd > objectStart) return body.slice(objectStart, objectEnd + 1)
  const arrayStart = body.indexOf('[')
  const arrayEnd = body.lastIndexOf(']')
  if (arrayStart >= 0 && arrayEnd > arrayStart) return body.slice(arrayStart, arrayEnd + 1)
  return body
}

/** Maps the model reply back onto the drafts (null where the model returned nothing usable). */
export function parseScripts(content: string, drafts: MixDraft[], styles: string[]): Array<{ title: string; voiceover: string; hookStyle: string } | null> {
  const parsed = JSON.parse(extractJsonText(content))
  const list: any[] = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.scripts) ? parsed.scripts : []
  return drafts.map((_, i) => {
    const item = list.find((x) => Number(x?.index) === i + 1) ?? list[i]
    const voiceover = String(item?.voiceover ?? '').replace(/\s+/g, ' ').trim()
    const title = String(item?.title ?? '').replace(/\s+/g, ' ').trim()
    if (!voiceover) return null
    return { title: title.slice(0, 60) || voiceover.split(/[.!?。！？]/)[0]!.slice(0, 40), voiceover: voiceover.slice(0, 1200), hookStyle: styles[i]! }
  })
}

/** Hook styles for a batch: best-scoring styles first, but every style gets tried before any repeats. */
export function pickHookStyles(n: number, weights: Map<string, number> | null) {
  const ranked = HOOK_STYLES.map((s, i) => ({ s, w: (weights?.get(s) ?? 1) + Math.random() * 0.15 - i * 0.001 })).sort((a, b) => b.w - a.w)
  return Array.from({ length: n }, (_, i) => ranked[i % ranked.length]!.s)
}

const TYPE_NOUN: Record<MixLanguage, Record<string, string>> = {
  'vi-VN': { phone_case: 'ốp lưng này', earring: 'đôi bông tai này', necklace: 'sợi dây chuyền này', ring: 'chiếc nhẫn này', bracelet: 'chiếc vòng tay này', clothes: 'bộ đồ này', bag: 'chiếc túi này', shoes: 'đôi giày này', toy: 'món đồ chơi này', general: 'món này' },
  'zh-CN': { phone_case: '这款手机壳', earring: '这对耳环', necklace: '这条项链', ring: '这款戒指', bracelet: '这条手链', clothes: '这件衣服', bag: '这个包', shoes: '这双鞋', toy: '这个玩具', general: '这个宝贝' },
  'en-US': { phone_case: 'this phone case', earring: 'these earrings', necklace: 'this necklace', ring: 'this ring', bracelet: 'this bracelet', clothes: 'this outfit', bag: 'this bag', shoes: 'these shoes', toy: 'this toy', general: 'this' },
  'th-TH': { phone_case: 'เคสนี้', earring: 'ต่างหูคู่นี้', necklace: 'สร้อยเส้นนี้', ring: 'แหวนวงนี้', bracelet: 'กำไลนี้', clothes: 'ชุดนี้', bag: 'กระเป๋าใบนี้', shoes: 'รองเท้าคู่นี้', toy: 'ของเล่นนี้', general: 'ชิ้นนี้' },
  'id-ID': { phone_case: 'casing ini', earring: 'anting ini', necklace: 'kalung ini', ring: 'cincin ini', bracelet: 'gelang ini', clothes: 'baju ini', bag: 'tas ini', shoes: 'sepatu ini', toy: 'mainan ini', general: 'produk ini' },
}

/** What `{product}` becomes in spoken lines: the real name, or "this ring"-style wording for SKU codes. */
export function spokenProductName(product: ScriptProduct, language: MixLanguage = 'vi-VN') {
  if (!looksLikeSkuCode(product.name)) return product.name
  const nouns = TYPE_NOUN[language] ?? TYPE_NOUN['en-US']
  return nouns[product.type] ?? nouns.general!
}

const fill = (s: string, product: ScriptProduct, language?: MixLanguage) => s.replace(/\{product\}/g, spokenProductName(product, language)).trim()

/** Auto mode: stitch hook / body / CTA lines from the seller's pools; rotates so neighbours differ. */
export function scriptFromPools(input: {
  product: ScriptProduct
  index: number
  hookLines?: string[]
  bodyLines?: string[]
  ctaLines?: string[]
  language?: MixLanguage
}): { title: string; voiceover: string; hookStyle: string } | null {
  const clean = (arr?: string[]) => (arr ?? []).map((x) => String(x || '').trim()).filter(Boolean)
  const hooks = clean(input.hookLines)
  const bodies = clean(input.bodyLines)
  const ctas = clean(input.ctaLines)
  if (!hooks.length && !bodies.length && !ctas.length) return null
  const hook = hooks.length ? fill(hooks[input.index % hooks.length]!, input.product, input.language) : ''
  const pickBodies: string[] = []
  if (bodies.length) {
    const start = (input.index * 2) % bodies.length
    pickBodies.push(bodies[start]!)
    if (bodies.length > 2) pickBodies.push(bodies[(start + 1) % bodies.length]!)
  }
  const cta = ctas.length ? fill(ctas[input.index % ctas.length]!, input.product, input.language) : ''
  const voiceover = [hook, ...pickBodies.map((b) => fill(b, input.product, input.language)), cta].filter(Boolean).join(' ')
  return { title: hook, voiceover, hookStyle: `pool#${hooks.length ? input.index % hooks.length : 0}` }
}
