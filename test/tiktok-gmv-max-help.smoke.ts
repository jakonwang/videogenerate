import assert from 'node:assert/strict'
import path from 'node:path'
import { readFile } from 'node:fs/promises'
import { GMV_MAX_ISSUE_CODES } from '../src/main/modules/tiktok-gmv-max/resolutions'
import { GMV_MAX_HELP_CHAPTERS, GMV_MAX_HELP_ISSUES, GMV_MAX_HELP_ISSUE_CODES } from '../src/renderer/src/ui/components/gmv-max/helpCatalog'

async function json(relativePath: string) {
  return JSON.parse(await readFile(path.join(process.cwd(), relativePath), 'utf8'))
}

async function run() {
  const expectedIssueCodes = [...GMV_MAX_ISSUE_CODES, 'external_verification_pending'].sort()
  assert.deepEqual([...GMV_MAX_HELP_ISSUE_CODES].sort(), expectedIssueCodes)
  assert.equal(new Set(GMV_MAX_HELP_ISSUE_CODES).size, GMV_MAX_HELP_ISSUE_CODES.length)
  assert.equal(GMV_MAX_HELP_CHAPTERS.length, 14)

  const baseLocales = await Promise.all([
    json('src/renderer/src/locales/zh-CN.json'),
    json('src/renderer/src/locales/en-US.json'),
    json('src/renderer/src/locales/vi-VN.json'),
  ])
  const helpLocales = await Promise.all([
    json('src/renderer/src/locales/gmv-max-help/zh-CN.json'),
    json('src/renderer/src/locales/gmv-max-help/en-US.json'),
    json('src/renderer/src/locales/gmv-max-help/vi-VN.json'),
  ])

  for (const help of helpLocales) {
    for (const field of ['title', 'subtitle', 'searchPlaceholder', 'useFeature', 'externalNote']) {
      assert.equal(typeof help[field], 'string')
      assert.ok(help[field].trim())
    }
    for (const tab of ['overview', 'sop', 'campaigns', 'growth', 'rules', 'creatives', 'profit', 'actions', 'audit']) {
      assert.equal(typeof help.navigation[tab], 'string')
      assert.ok(help.navigation[tab].trim())
    }
    for (const chapter of GMV_MAX_HELP_CHAPTERS) {
      const content = help.chapters[chapter.id]
      assert.ok(content, `Missing help chapter ${chapter.id}`)
      for (const field of ['title', 'summary', 'purpose', 'when', 'data', 'logic', 'result', 'risk']) {
        assert.equal(typeof content[field], 'string', `${chapter.id}.${field}`)
        assert.ok(content[field].trim(), `${chapter.id}.${field}`)
      }
      for (let index = 1; index <= chapter.stepCount; index += 1) {
        assert.equal(typeof content.steps[String(index)], 'string', `${chapter.id}.steps.${index}`)
        assert.ok(content.steps[String(index)].trim(), `${chapter.id}.steps.${index}`)
      }
    }
  }

  for (const [localeIndex, locale] of baseLocales.entries()) {
    for (const entry of GMV_MAX_HELP_ISSUES) {
      assert.ok(entry.targetTab)
      assert.ok(entry.actionTarget)
      assert.ok(entry.steps.length > 0)
      if (entry.code !== 'external_verification_pending') {
        const content = locale.gmvMaxIssueResolutions.items[entry.code]
        assert.ok(content, `Missing issue ${entry.code} in locale ${localeIndex}`)
        for (const field of ['title', 'reason', 'solution', 'completion']) {
          assert.equal(typeof content[field], 'string', `${entry.code}.${field}`)
          assert.ok(content[field].trim(), `${entry.code}.${field}`)
        }
      } else {
        for (const field of ['title', 'reason', 'solution', 'completion']) {
          assert.equal(typeof locale.gmvMaxOperations.verification[field], 'string')
        }
      }
      for (const step of entry.steps) {
        assert.equal(typeof locale.gmvMaxIssueResolutions.steps[step], 'string', `${entry.code}.${step}`)
      }
    }
  }

  const component = await readFile(path.join(process.cwd(), 'src/renderer/src/ui/components/gmv-max/GmvMaxHelpCenter.vue'), 'utf8')
  assert.doesNotMatch(component, /window\.api|syncData\(|approve\(|rollback\(/)
  assert.match(component, /data-testid="gmv-help-search"/)
  assert.match(component, /data-testid="gmv-help-issue-evidence"/)
  assert.match(component, /emit\('navigate'/)

  const view = await readFile(path.join(process.cwd(), 'src/renderer/src/ui/views/TiktokGmvMaxOptimizerView.vue'), 'utf8')
  assert.match(view, /openHelpIssue\(primarySopIssue\.code\)/)
  assert.match(view, /:focus-issue-code="helpFocusIssueCode"/)

  console.log('TikTok GMV MAX help center smoke tests passed')
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
