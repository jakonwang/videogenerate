export function cleanAiText(value: unknown, fallback = '') {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  return text || fallback
}

function tryParseJsonObject(text: string): any | null {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function flattenContentNode(node: any): string {
  if (typeof node === 'string') return node
  if (typeof node?.text === 'string') return node.text
  if (typeof node?.content === 'string') return node.content
  if (Array.isArray(node)) return node.map((item) => flattenContentNode(item)).filter(Boolean).join('\n')
  return ''
}

export function extractModelMessageContent(raw: string) {
  const text = String(raw || '').trim()
  if (!text) return ''
  const parsed = tryParseJsonObject(text)
  if (!parsed) return text

  const candidates = [
    parsed?.choices?.[0]?.message?.content,
    parsed?.choices?.[0]?.delta?.content,
    parsed?.choices?.[0]?.text,
    parsed?.message?.content,
    parsed?.output_text,
    parsed?.output?.[0]?.content,
    parsed?.data?.output_text,
    parsed?.data?.content,
    parsed?.result,
    parsed?.response,
  ]

  for (const candidate of candidates) {
    const flattened = flattenContentNode(candidate).trim()
    if (flattened) return flattened
  }

  if (typeof parsed === 'object' && parsed !== null) {
    const merged = Object.values(parsed)
      .map((item) => flattenContentNode(item))
      .filter(Boolean)
      .join('\n')
      .trim()
    if (merged) return merged
  }

  return text
}

export function extractJsonObjectText(raw: string) {
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

export function parseModelJsonPayload(raw: string) {
  const content = extractModelMessageContent(raw)
  const jsonText = extractJsonObjectText(content)
  return {
    content,
    jsonText,
    parsed: JSON.parse(jsonText),
  }
}
