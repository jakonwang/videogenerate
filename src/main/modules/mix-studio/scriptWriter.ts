import { callVision, type VisionTarget } from '../mix-pool/tagger'
import type { Product } from '../products/types'
import { buildScriptPrompt, parseScripts, type ScriptInput } from '../../../shared/mixScript'

// Prompt building, parsing and the auto-mode pools live in src/shared/mixScript.ts (shared with the web version).
export { HOOK_STYLES, looksLikeSkuCode, pickHookStyles, scriptFromPools, spokenProductName } from '../../../shared/mixScript'

export async function writeScriptsWithAi(input: Omit<ScriptInput, 'product'> & { target: VisionTarget; product: Product }): Promise<Array<{ title: string; voiceover: string; hookStyle: string } | null>> {
  const { system, prompt, styles } = buildScriptPrompt(input)
  const content = await callVision(input.target, system, [{ text: prompt }], 150_000)
  return parseScripts(content, input.drafts, styles)
}
