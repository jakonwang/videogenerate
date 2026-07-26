import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { HERMES_BUSINESS_ACTIONS, HERMES_BUSINESS_CATEGORIES } from '../src/shared/hermesBusinessActions'

async function main() {
  const root = process.cwd()
  const mcpSource = await readFile(join(root, 'src/main/modules/hermes/mcpServer.ts'), 'utf8')
  const registeredTools = [...mcpSource.matchAll(/registerTool\('(videogenerate_[a-z0-9_]+)'/g)]
    .map((match) => match[1])
  const infrastructureTools = new Set([
    'videogenerate_workspace_catalog',
    'videogenerate_workspace_open',
    'videogenerate_messaging_pairing_approve',
    'videogenerate_messaging_send',
  ])
  const businessToolKeys = registeredTools
    .filter((name) => !infrastructureTools.has(name))
    .map((name) => name.replace(/^videogenerate_/, ''))
    .sort()
  const catalogKeys = HERMES_BUSINESS_ACTIONS.map((item) => item.localeKey).sort()

  assert.deepEqual(catalogKeys, businessToolKeys, 'Every registered business tool must have one discoverable semantic action.')
  assert.equal(new Set(HERMES_BUSINESS_ACTIONS.map((item) => item.id)).size, HERMES_BUSINESS_ACTIONS.length)
  assert.equal(new Set(HERMES_BUSINESS_ACTIONS.map((item) => `${item.localeGroup}.${item.localeKey}`)).size, HERMES_BUSINESS_ACTIONS.length)
  for (const action of HERMES_BUSINESS_ACTIONS) {
    assert.ok(HERMES_BUSINESS_CATEGORIES.includes(action.category))
  }

  const dangerousKeyPattern = /(?:^|_)(?:delete|publish)(?:_|$)|queue_(?:pause|resume)|production_queue_control|production_task_(?:cancel|remove)|live_photo_(?:pause|resume)|publisher_account_save/
  for (const action of HERMES_BUSINESS_ACTIONS.filter((item) => dangerousKeyPattern.test(item.localeKey))) {
    assert.equal(action.mode, 'dangerous', `${action.id} must require explicit confirmation.`)
  }

  const serializedCatalog = JSON.stringify(HERMES_BUSINESS_ACTIONS)
  for (const forbidden of ['videogenerate_', 'clone.run', 'veo', 'seedance', 'apifox']) {
    assert.doesNotMatch(serializedCatalog, new RegExp(forbidden, 'i'))
  }

  for (const localeName of ['zh-CN', 'en-US', 'vi-VN']) {
    const source = await readFile(join(root, 'src/renderer/src/locales', `${localeName}.json`), 'utf8')
    const locale = JSON.parse(source) as Record<string, any>
    for (const action of HERMES_BUSINESS_ACTIONS) {
      const label = locale.agentOs?.[action.localeGroup]?.[action.localeKey]
      assert.equal(typeof label, 'string', `${localeName} is missing ${action.localeGroup}.${action.localeKey}`)
      assert.ok(label.trim(), `${localeName} has an empty label for ${action.localeGroup}.${action.localeKey}`)
    }
    for (const category of HERMES_BUSINESS_CATEGORIES) {
      assert.ok(locale.agentOs?.businessCommandCatalog?.categories?.[category])
    }
  }

  console.log(`hermes-business-command-catalog.smoke: ok (${HERMES_BUSINESS_ACTIONS.length} actions)`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
