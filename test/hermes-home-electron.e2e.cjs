const assert = require('node:assert/strict')
const { mkdir, mkdtemp, readFile, rm, writeFile } = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { _electron: electron } = require('playwright')

async function main() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'videogenerate-hermes-home-'))
  const useRealData = process.env.VIDEOGENERATE_E2E_REAL_DATA === '1'
  const artifacts = path.join(process.cwd(), 'test-artifacts')
  await mkdir(artifacts, { recursive: true })
  const app = await electron.launch({
    args: ['.'],
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...(useRealData ? {} : { VIDEOGENERATE_DATA_DIR: root }),
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
    },
    timeout: 60_000,
  })
  try {
    const page = await app.firstWindow()
    await page.waitForSelector('.hermes-workspace', { timeout: 60_000 })
    await page.evaluate(() => {
      localStorage.setItem('videogenerate.ui.theme', 'dark-teal')
      localStorage.setItem('videogenerate-app-settings', JSON.stringify({ theme: 'dark-teal' }))
      localStorage.removeItem('videogenerate.hermes.activeSessionId')
    })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.hermes-workspace')
    const initial = await page.evaluate(() => {
      const workspace = document.querySelector('.hermes-workspace').getBoundingClientRect()
      const stage = document.querySelector('.conversation-surface').getBoundingClientRect()
      const activityRail = document.querySelector('.activity-rail').getBoundingClientRect()
      const employeeDock = document.querySelector('.employee-dock').getBoundingClientRect()
      return {
        width: window.innerWidth,
        height: window.innerHeight,
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
        workspace: { left: workspace.left, top: workspace.top, right: workspace.right, bottom: workspace.bottom },
        stage: { left: stage.left, top: stage.top, right: stage.right, bottom: stage.bottom },
        activityRail: { left: activityRail.left, top: activityRail.top, right: activityRail.right, bottom: activityRail.bottom },
        employeeDock: { left: employeeDock.left, top: employeeDock.top, right: employeeDock.right, bottom: employeeDock.bottom },
        theme: document.documentElement.dataset.appTheme,
      }
    })
    console.log('computed-styles', await page.evaluate(() => Object.fromEntries(
      ['.hermes-workspace', '.conversation-surface', '.conversation-scroll', '.idle-state', '.runtime-gate'].map((selector) => {
        const element = document.querySelector(selector)
        if (!element) return [selector, null]
        const style = getComputedStyle(element)
        return [selector, {
          background: style.background,
          borderRadius: style.borderRadius,
          clipPath: style.clipPath,
          overflow: style.overflow,
          transform: style.transform,
        }]
      }),
    )))
    console.log('stage-radius-rules', await page.evaluate(() => {
      const element = document.querySelector('.conversation-surface')
      const matches = []
      const visit = (rules) => {
        for (const rule of rules) {
          if (rule.cssRules) visit(rule.cssRules)
          if (!rule.selectorText || !rule.style?.borderRadius) continue
          try {
            if (element.matches(rule.selectorText)) matches.push({ selector: rule.selectorText, value: rule.style.borderRadius, priority: rule.style.getPropertyPriority('border-radius') })
          } catch {}
        }
      }
      for (const sheet of document.styleSheets) visit(sheet.cssRules)
      return matches
    }))
    assert.ok(initial.workspace.left >= 0 && initial.workspace.right <= initial.width)
    assert.ok(initial.workspace.top >= 0 && initial.workspace.bottom <= initial.height)
    assert.ok(initial.activityRail.left >= initial.stage.right)
    assert.ok(initial.activityRail.right <= initial.workspace.right)
    assert.ok(initial.employeeDock.right <= initial.stage.left)
    assert.equal(initial.scrollWidth, initial.width)
    assert.equal(initial.scrollHeight, initial.height)
    const darkSurfaceColor = await page.locator('.conversation-surface').evaluate((element) => getComputedStyle(element).backgroundColor)
    await page.screenshot({ path: path.join(artifacts, 'hermes-home-dark.png') })

    await page.waitForFunction(() => document.body.textContent.includes('Hermes is ready') || document.body.textContent.includes('Hermes 已就绪'), null, { timeout: 60_000 })
    assert.equal(await page.locator('.starter-command-grid button').count(), 3)
    await page.locator('.starter-command-grid button').nth(1).click()
    assert.ok((await page.locator('.composer textarea').inputValue()).trim().length > 10)
    await page.locator('.composer textarea').fill('')
    await page.locator('.command-button').click()
    await page.locator('.command-center').waitFor({ state: 'visible' })
    assert.equal(await page.locator('[data-command-id="workflow.video"]').count(), 1)
    assert.equal(await page.locator('[data-command-id="workspace.settings"]').count(), 0)
    await page.locator('[data-command-scope="business"]').click()
    assert.equal(await page.locator('[data-command-group="business"]').count(), 87)
    assert.equal(await page.locator('[data-command-id="business.publishing.publishVideo"]').count(), 1)
    assert.doesNotMatch(String(await page.locator('.command-center').textContent()), /mcp_videogenerate_|videogenerate_[a-z0-9_]+/i)
    await page.screenshot({ path: path.join(artifacts, 'hermes-home-business-command-center.png') })
    await page.locator('[data-command-id="business.publishing.publishVideo"]').click()
    const dangerousPrompt = await page.locator('.composer textarea').inputValue()
    assert.match(dangerousPrompt, /confirm|确认|xac nhan/i)
    assert.doesNotMatch(dangerousPrompt, /mcp_videogenerate_|videogenerate_[a-z0-9_]+/i)
    await page.locator('.composer textarea').fill('')
    await page.locator('.command-button').click()
    await page.locator('[data-command-scope="workspace"]').click()
    assert.equal(await page.locator('[data-command-id="workspace.settings"]').count(), 1)
    assert.equal(await page.locator('[data-command-group="workspace"]').count(), 17)
    await page.locator('[data-command-scope="management"]').click()
    assert.equal(await page.locator('[data-command-id="management.skills"]').count(), 1)
    assert.equal(await page.locator('[data-command-id="management.channels"]').count(), 1)
    assert.doesNotMatch(String(await page.locator('.command-center').textContent()), /mcp_videogenerate_|videogenerate_[a-z0-9_]+/i)
    await page.locator('[data-command-scope="recommended"]').click()
    await page.screenshot({ path: path.join(artifacts, 'hermes-home-command-center.png') })
    await page.locator('[data-command-id="workflow.video"]').click()
    assert.ok((await page.locator('.composer textarea').inputValue()).trim().length > 10)
    await page.locator('.composer textarea').fill('')
    await page.locator('.composer textarea').focus()
    await page.keyboard.press('/')
    await page.locator('.command-center').waitFor({ state: 'visible' })
    await page.keyboard.press('Escape')
    await page.locator('.command-center').waitFor({ state: 'hidden' })
    await page.keyboard.press('Control+K')
    await page.locator('.command-center').waitFor({ state: 'visible' })
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    assert.ok((await page.locator('.composer textarea').inputValue()).trim().length > 10)
    await page.locator('.composer textarea').fill('')
    const sessionRows = page.locator('.session-row')
    console.log('session-management-rows', await sessionRows.count())
    if (await sessionRows.count()) {
      const firstSession = sessionRows.first()
      await firstSession.locator('.session-menu-trigger').click()
      assert.equal(await firstSession.locator('.session-menu button').count(), 2)
      await page.screenshot({ path: path.join(artifacts, 'hermes-session-menu.png') })
      await firstSession.locator('.session-menu button').first().click()
      await page.waitForSelector('.session-modal input')
      assert.ok((await page.locator('.session-modal input').inputValue()).trim())
      await page.locator('.session-modal footer button').first().click()
      await firstSession.locator('.session-menu-trigger').click()
      await firstSession.locator('.session-menu button').nth(1).click()
      await page.waitForSelector('.session-delete-copy')
      await page.screenshot({ path: path.join(artifacts, 'hermes-session-delete-confirm.png') })
      await page.locator('.session-modal footer button').first().click()
    }
    await page.locator('.session-rail .rail-header .icon-button').click()
    await page.waitForFunction(() => (
      Boolean(localStorage.getItem('videogenerate.hermes.activeSessionId'))
      && Boolean(document.querySelector('.hermes-workspace')?.getAttribute('data-conversation-id'))
    ), null, { timeout: 30_000 })
    await page.waitForFunction(() => {
      const button = document.querySelector('.surface-actions .icon-button')
      return button instanceof HTMLButtonElement && !button.disabled
    }, null, { timeout: 30_000 })
    const selectedAttachmentPath = path.join(root, 'selected-attachment.png')
    await writeFile(selectedAttachmentPath, await readFile(path.join(process.cwd(), 'resources', 'icon-brand-ui-v2.png')))
    await page.evaluate((filePath) => {
      window.__VG_TEST_pickFiles = async () => [filePath]
    }, selectedAttachmentPath)
    await page.locator('.composer > footer .icon-button:not(.command-button)').click()
    await page.waitForFunction(() => document.querySelectorAll('.composer .attachment-list article').length === 1)
    assert.equal(await page.locator('.error-banner').count(), 0)
    await page.locator('.composer').evaluate((element) => {
      const transfer = new DataTransfer()
      transfer.items.add(new File(['desktop attachment'], 'dropped-attachment.txt', { type: 'text/plain' }))
      element.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }))
    })
    await page.waitForFunction(() => document.querySelectorAll('.composer .attachment-list article').length === 2)
    assert.equal(await page.locator('.error-banner').count(), 0)
    assert.match(String(await page.locator('.composer .attachment-list').textContent()), /selected-attachment\.png/)
    assert.match(String(await page.locator('.composer .attachment-list').textContent()), /dropped-attachment\.txt/)
    const promptTransportResult = await page.evaluate(async (imagePath) => {
      const payload = {
        sessionId: '__vg_missing_clone_guard_session__',
        text: 'Inspect the attached image.',
        attachments: [{ path: imagePath, name: 'selected-attachment.png', mediaType: 'image' }],
      }
      try {
        await window.api.hermes.sendPrompt(payload)
        return ''
      } catch (error) {
        return String(error?.message || error)
      }
    }, selectedAttachmentPath)
    assert.doesNotMatch(promptTransportResult, /could not be cloned/i)
    while (await page.locator('.composer .attachment-list article button').count()) {
      await page.locator('.composer .attachment-list article button').first().click()
    }
    const currentStoredSessionId = await page.evaluate(() => localStorage.getItem('videogenerate.hermes.activeSessionId') || '')
    const currentConversation = (await page.evaluate(async () => await window.api.agentOs.listConversations(100)))
      .find((item) => item.hermesStoredSessionId === currentStoredSessionId || item.hermesStoredSessionIds?.includes(currentStoredSessionId))
    assert.ok(currentConversation)
    await page.waitForFunction((conversationId) => (
      document.querySelector('.hermes-workspace')?.getAttribute('data-conversation-id') === conversationId
    ), currentConversation.id, { timeout: 10_000 })
    const artifactImagePath = path.join(root, 'home-artifact-preview.png')
    const artifactImageBytes = await readFile(path.join(process.cwd(), 'resources', 'icon-brand-ui-v2.png'))
    await writeFile(artifactImagePath, artifactImageBytes)
    const agentDbPath = path.join(root, 'db', 'agent-os.json')
    const agentDb = JSON.parse(await readFile(agentDbPath, 'utf8'))
    const artifactRunId = 'home-artifact-run'
    const artifactId = 'home-artifact-image'
    const timestamp = Date.now()
    agentDb.runs.push({
      id: artifactRunId,
      shortId: 'ARTIFACT',
      conversationId: currentConversation.id,
      employeeId: 'employee.supervisor',
      status: 'completed',
      activeRevision: 1,
      revisions: [{
        version: 1,
        summary: 'Preview the generated artifact.',
        requestSnapshot: 'Preview the generated artifact.',
        contextSnapshot: {},
        capabilityPolicySnapshot: {},
        workflowVersion: 1,
        quantity: 1,
        budget: {},
        promptSnapshot: 'Preview the generated artifact.',
        stepIds: ['artifact-test-step'],
        hash: 'artifact-test-hash',
        createdAt: timestamp,
      }],
      artifactIds: [artifactId],
      warningCount: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
      startedAt: timestamp - 5200,
      completedAt: timestamp,
    })
    agentDb.runs.push({
      id: 'home-waiting-run',
      shortId: 'WAITING',
      conversationId: currentConversation.id,
      employeeId: 'employee.supervisor',
      status: 'waiting_approval',
      activeRevision: 2,
      revisions: [{
        version: 2,
        summary: 'Approve a second business workflow.',
        requestSnapshot: 'Approve a second business workflow.',
        contextSnapshot: {},
        capabilityPolicySnapshot: {},
        workflowVersion: 1,
        quantity: 2,
        budget: {},
        promptSnapshot: 'Approve a second business workflow.',
        stepIds: [],
        hash: 'waiting-test-hash',
        createdAt: timestamp + 1000,
      }],
      artifactIds: [],
      warningCount: 1,
      createdAt: timestamp + 1000,
      updatedAt: timestamp + 1000,
    })
    agentDb.runs.push({
      id: 'home-failed-run',
      shortId: 'FAILED',
      conversationId: currentConversation.id,
      employeeId: 'employee.supervisor',
      status: 'failed',
      activeRevision: 1,
      revisions: [{
        version: 1,
        summary: 'Previous publishing workflow.',
        requestSnapshot: 'Previous publishing workflow.',
        contextSnapshot: {},
        capabilityPolicySnapshot: {},
        workflowVersion: 1,
        quantity: 1,
        budget: {},
        promptSnapshot: 'Previous publishing workflow.',
        stepIds: [],
        hash: 'failed-test-hash',
        createdAt: timestamp - 1000,
      }],
      artifactIds: [],
      warningCount: 0,
      error: 'Publishing account is unavailable.',
      createdAt: timestamp - 1000,
      updatedAt: timestamp - 1000,
      startedAt: timestamp - 1000,
      completedAt: timestamp - 500,
    })
    agentDb.steps.push({
      id: 'artifact-test-step',
      runId: artifactRunId,
      revision: 1,
      order: 0,
      title: 'Export the generated artifact',
      intentType: 'Intent.ArtifactExport',
      intentVersion: 1,
      input: {},
      dependsOn: [],
      employeeId: 'employee.package',
      status: 'completed',
      repairCount: 1,
      currentAttemptId: 'artifact-test-attempt',
      startedAt: timestamp - 5000,
      completedAt: timestamp - 500,
      updatedAt: timestamp - 500,
    })
    agentDb.attempts.push({
      id: 'artifact-test-attempt',
      runId: artifactRunId,
      stepId: 'artifact-test-step',
      sequence: 1,
      capabilityId: 'Artifact.Export',
      capabilityVersion: 1,
      bindingId: 'internal-binding-must-not-render',
      adapterVersion: 'internal-adapter-must-not-render',
      modelSnapshot: { provider: 'internal-provider-must-not-render' },
      inputSnapshot: {},
      idempotencyKey: 'internal-idempotency-must-not-render',
      status: 'completed',
      result: {
        success: true,
        status: 'partial',
        artifactIds: [artifactId],
        logs: ['Artifact export completed.'],
        warnings: ['The delivery receipt is pending.'],
        cost: { credits: 2, usd: 0.125 },
        retryable: false,
        externalRefs: { jobId: 'external-job-123', apiKey: 'secret-must-not-render' },
      },
      createdAt: timestamp - 5000,
      completedAt: timestamp - 500,
    })
    agentDb.approvals.push({
      id: 'artifact-test-approval',
      runId: artifactRunId,
      revision: 1,
      planHash: 'artifact-test-hash',
      status: 'approved',
      channel: 'desktop',
      approverId: 'desktop-local',
      createdAt: timestamp - 5100,
    })
    const runEventTypes = [
      'agent.run.planning',
      'agent.run.waiting_approval',
      'agent.run.approved',
      'agent.step.started',
      'agent.step.reviewing',
      'agent.step.completed',
      'agent.artifact.created',
      'agent.run.reviewing',
      'agent.delivery.completed',
      'agent.run.completed',
    ]
    for (const [index, type] of runEventTypes.entries()) {
      agentDb.events.push({
        id: `home-artifact-event-${index}`,
        sequence: 7_000_000 + index,
        schemaVersion: 1,
        type,
        aggregateType: type.includes('artifact') ? 'artifact' : type.includes('step') ? 'step' : 'run',
        aggregateId: artifactRunId,
        conversationId: currentConversation.id,
        runId: artifactRunId,
        ...(type.includes('step') ? { stepId: 'artifact-test-step' } : {}),
        correlationId: artifactRunId,
        payload: index === 9 ? { summary: 'Artifact workflow completed.' } : {},
        createdAt: timestamp + index,
      })
    }
    agentDb.artifacts.push({
      id: artifactId,
      kind: 'image',
      name: 'home-artifact-preview.png',
      uri: artifactImagePath,
      localPath: artifactImagePath,
      mimeType: 'image/png',
      size: artifactImageBytes.length,
      metadata: { source: 'desktop-e2e' },
      sourceArtifactIds: [],
      producerRunId: artifactRunId,
      producerStepId: 'artifact-test-step',
      lifecycle: 'managed',
      createdAt: timestamp,
    })
    await writeFile(agentDbPath, JSON.stringify(agentDb, null, 2), 'utf8')
    assert.equal(await page.locator('.employee-dock').isVisible(), true)
    assert.deepEqual(await page.evaluate(() => ({
      retry: typeof window.api.tasks.retry,
      cancel: typeof window.api.tasks.cancel,
      remove: typeof window.api.tasks.remove,
    })), { retry: 'function', cancel: 'function', remove: 'function' })
    const employees = await page.evaluate(async () => await window.api.agentOs.listEmployees())
    for (const employeeId of ['employee.supervisor', 'employee.clone']) {
      const employee = employees.find((item) => item.id === employeeId)
      assert.ok(employee, `${employeeId} should exist`)
      assert.ok(employee.allowedIntents.includes('Intent.CloneProjectManage'))
      assert.ok(employee.allowedCapabilities.includes('Video.Clone.Manage'))
      assert.ok(employee.allowedIntents.includes('Intent.ModelIdentityManage'))
      assert.ok(employee.allowedCapabilities.includes('ModelIdentity.Manage'))
    }
    const supervisor = employees.find((item) => item.id === 'employee.supervisor')
    const packageEmployee = employees.find((item) => item.id === 'employee.package')
    for (const employee of [supervisor, packageEmployee]) {
      assert.ok(employee)
      assert.ok(employee.allowedIntents.includes('Intent.TemplateManage'))
      assert.ok(employee.allowedCapabilities.includes('Template.Manage'))
      assert.ok(employee.allowedIntents.includes('Intent.ProductionTaskManage'))
      assert.ok(employee.allowedCapabilities.includes('Production.TaskManage'))
    }
    const materialEmployee = employees.find((item) => item.id === 'employee.material')
    const cloneEmployee = employees.find((item) => item.id === 'employee.clone')
    for (const employee of [supervisor, materialEmployee]) {
      assert.ok(employee)
      assert.ok(employee.allowedIntents.includes('Intent.ProductManage'))
      assert.ok(employee.allowedCapabilities.includes('Product.Manage'))
    }
    for (const employee of [supervisor, packageEmployee]) {
      assert.ok(employee)
      assert.ok(employee.allowedIntents.includes('Intent.ListingManage'))
      assert.ok(employee.allowedCapabilities.includes('Listing.Manage'))
    }
    for (const employee of [supervisor, cloneEmployee]) {
      assert.ok(employee)
      assert.ok(employee.allowedIntents.includes('Intent.TiktokCreativeManage'))
      assert.ok(employee.allowedCapabilities.includes('TiktokCreative.Manage'))
    }
    for (const employee of [supervisor, packageEmployee]) {
      assert.ok(employee)
      assert.ok(employee.allowedIntents.includes('Intent.VideoSlice'))
      assert.ok(employee.allowedCapabilities.includes('Video.Slice'))
    }
    const publishEmployee = employees.find((item) => item.id === 'employee.publish')
    for (const employee of [supervisor, publishEmployee]) {
      assert.ok(employee)
      assert.ok(employee.allowedIntents.includes('Intent.PublishingManage'))
      assert.ok(employee.allowedCapabilities.includes('Publishing.Manage'))
    }
    await page.evaluate(() => {
      window.__VG_TEST_HERMES_EVENTS = []
      window.__VG_TEST_HERMES_UNSUBSCRIBE = window.api.hermes.subscribeEvents(0, (events) => {
        window.__VG_TEST_HERMES_EVENTS.push(...events)
      })
    })
    await app.evaluate(({ shell }) => {
      global.__VG_TEST_EXTERNAL_URLS = []
      shell.openExternal = async (url) => {
        global.__VG_TEST_EXTERNAL_URLS.push(String(url))
      }
    })
    await app.evaluate(({ BrowserWindow }, { selectedAttachmentPath }) => {
      BrowserWindow.getAllWindows()[0].webContents.send('hermes:event', [
        {
          sequence: 999_997,
          type: 'message.user',
          payload: {
            message_id: 'editable-user-message',
            text: 'Create three product videos.',
            attachments: [{
              id: 'editable-attachment',
              name: 'selected-attachment.png',
              path: selectedAttachmentPath,
              mediaType: 'image',
              size: 1,
            }],
          },
          createdAt: Date.now() - 1_000,
        },
        {
          sequence: 999_998,
          type: 'tool.start',
          payload: { tool_id: 'friendly-tool-name-test', name: 'videogenerate_product_analyze' },
          createdAt: Date.now(),
        },
        {
          sequence: 999_999,
          type: 'tool.start',
          payload: { tool_id: 'friendly-material-tool-name-test', name: 'videogenerate_material_batch_retry' },
          createdAt: Date.now(),
        },
        {
          sequence: 1_000_000,
          type: 'tool.start',
          payload: { tool_id: 'friendly-live-photo-tool-name-test', name: 'videogenerate_live_photo_resume' },
          createdAt: Date.now(),
        },
        {
          sequence: 1_000_001,
          type: 'tool.start',
          payload: { tool_id: 'friendly-clone-tool-name-test', name: 'videogenerate_clone_final_compose' },
          createdAt: Date.now(),
        },
        {
          sequence: 1_000_002,
          type: 'tool.start',
          payload: { tool_id: 'friendly-identity-tool-name-test', name: 'videogenerate_model_identity_generate' },
          createdAt: Date.now(),
        },
        {
          sequence: 1_000_003,
          type: 'tool.start',
          payload: { tool_id: 'friendly-template-tool-name-test', name: 'videogenerate_template_duplicate' },
          createdAt: Date.now(),
        },
        {
          sequence: 1_000_004,
          type: 'tool.start',
          payload: { tool_id: 'friendly-production-task-tool-name-test', name: 'videogenerate_production_task_retry' },
          createdAt: Date.now(),
        },
        {
          sequence: 1_000_005,
          type: 'tool.start',
          payload: { tool_id: 'friendly-product-delete-tool-name-test', name: 'videogenerate_product_delete' },
          createdAt: Date.now(),
        },
        {
          sequence: 1_000_006,
          type: 'tool.start',
          payload: { tool_id: 'friendly-listing-save-tool-name-test', name: 'videogenerate_listing_save' },
          createdAt: Date.now(),
        },
        {
          sequence: 1_000_007,
          type: 'tool.start',
          payload: { tool_id: 'friendly-creative-tool-name-test', name: 'videogenerate_tiktok_creative_shot_start' },
          createdAt: Date.now(),
        },
        {
          sequence: 1_000_008,
          type: 'tool.start',
          payload: { tool_id: 'friendly-video-slice-tool-name-test', name: 'videogenerate_video_slice' },
          createdAt: Date.now(),
        },
        {
          sequence: 1_000_009,
          type: 'tool.start',
          payload: { tool_id: 'friendly-publisher-account-tool-name-test', name: 'videogenerate_publisher_account_save' },
          createdAt: Date.now(),
        },
        {
          sequence: 1_000_010,
          type: 'tool.start',
          payload: { tool_id: 'friendly-publisher-sync-tool-name-test', name: 'videogenerate_publisher_task_sync' },
          createdAt: Date.now(),
        },
        {
          sequence: 1_000_011,
          type: 'tool.complete',
          payload: {
            tool_id: 'friendly-tool-name-test',
            name: 'videogenerate_product_analyze',
            args: { productId: 'product-1', apiKey: '[redacted]' },
            result: { success: true, report: `Product analysis complete\n${'Result line\n'.repeat(80)}`, token: '[redacted]' },
            summary: 'Product analysis completed',
            duration_s: 1.25,
          },
          createdAt: Date.now(),
        },
        {
          sequence: 1_000_012,
          type: 'tool.complete',
          payload: {
            tool_id: 'friendly-material-tool-name-test',
            name: 'videogenerate_material_batch_retry',
            args: { batchId: 'batch-1' },
            result: { success: false, error: 'Material batch retry failed' },
            summary: 'Material batch retry failed',
            duration_s: 0.5,
          },
          createdAt: Date.now(),
        },
        {
          sequence: 1_000_013,
          type: 'message.start',
          payload: {},
          createdAt: Date.now(),
        },
        {
          sequence: 1_000_014,
          type: 'message.complete',
          payload: {
            text: [
              '## Structured response',
              '',
              '- First item',
              '- Second item with `inline code`',
              '',
              '```ts',
              'const ready = true',
              '```',
              '',
              '| Feature | State |',
              '| --- | --- |',
              '| Messages | Ready |',
              '',
              'Open https://example.com/docs.',
            ].join('\n'),
          },
          createdAt: Date.now(),
        },
      ])
    }, { selectedAttachmentPath })
    await page.waitForFunction(() => window.__VG_TEST_HERMES_EVENTS.length >= 18, null, { timeout: 10_000 })
    const editableUserMessage = page.locator('.message-row.is-user').filter({ hasText: 'Create three product videos.' })
    await editableUserMessage.waitFor({ state: 'visible' })
    await editableUserMessage.hover()
    await editableUserMessage.locator('.message-actions button').nth(1).click()
    assert.equal(await page.locator('.composer textarea').inputValue(), 'Create three product videos.')
    assert.equal(await page.locator('.composer .attachment-list article').count(), 1)
    await page.locator('.message-edit-band').waitFor({ state: 'visible' })
    await page.screenshot({ path: path.join(artifacts, 'hermes-home-message-edit.png') })
    await page.locator('.message-edit-band button').click()
    assert.equal(await page.locator('.message-edit-band').count(), 0)
    assert.equal(await page.locator('.composer textarea').inputValue(), '')
    assert.equal(await page.locator('.composer .attachment-list article').count(), 0)
    const structuredMessage = page.locator('.message-row.is-assistant').filter({ hasText: 'Structured response' })
    await structuredMessage.waitFor({ state: 'visible', timeout: 10_000 })
    const messageAlignment = await page.evaluate(() => {
      const userRow = Array.from(document.querySelectorAll('.message-row.is-user')).find((row) => row.textContent?.includes('Create three product videos.'))
      const assistantRow = Array.from(document.querySelectorAll('.message-row.is-assistant')).find((row) => row.textContent?.includes('Structured response'))
      const stream = document.querySelector('.message-stream')
      if (!userRow || !assistantRow || !stream) throw new Error('Expected message rows are unavailable')
      const userAvatar = userRow.querySelector('.message-avatar')?.getBoundingClientRect()
      const userBody = userRow.querySelector('.message-body')?.getBoundingClientRect()
      const assistantAvatar = assistantRow.querySelector('.message-avatar')?.getBoundingClientRect()
      const assistantBody = assistantRow.querySelector('.message-body')?.getBoundingClientRect()
      const userRect = userRow.getBoundingClientRect()
      const assistantRect = assistantRow.getBoundingClientRect()
      const streamRect = stream.getBoundingClientRect()
      if (!userAvatar || !userBody || !assistantAvatar || !assistantBody) throw new Error('Expected message content is unavailable')
      return {
        userAvatarLeft: userAvatar.left,
        userBodyRight: userBody.right,
        assistantAvatarRight: assistantAvatar.right,
        assistantBodyLeft: assistantBody.left,
        userRightGap: streamRect.right - userRect.right,
        assistantLeftGap: assistantRect.left - streamRect.left,
      }
    })
    assert.ok(messageAlignment.userAvatarLeft > messageAlignment.userBodyRight)
    assert.ok(messageAlignment.assistantAvatarRight < messageAlignment.assistantBodyLeft)
    assert.ok(Math.abs(messageAlignment.userRightGap) < 1)
    assert.ok(Math.abs(messageAlignment.assistantLeftGap) < 1)
    assert.equal(await structuredMessage.locator('.hermes-message-content h3').textContent(), 'Structured response')
    assert.equal(await structuredMessage.locator('.hermes-message-content li').count(), 2)
    assert.match(String(await structuredMessage.locator('.message-code-block pre').textContent()), /const ready = true/)
    assert.equal(await structuredMessage.locator('.message-table-wrap tbody tr').count(), 1)
    await structuredMessage.locator('.inline-link').dispatchEvent('click')
    await page.waitForTimeout(100)
    assert.deepEqual(await app.evaluate(() => global.__VG_TEST_EXTERNAL_URLS), ['https://example.com/docs'])
    const unsafeLinkError = await page.evaluate(async () => {
      try {
        await window.api.shell.openExternal('file:///C:/Windows/System32/cmd.exe')
        return ''
      } catch (error) {
        return String(error?.message || error)
      }
    })
    assert.match(unsafeLinkError, /Only HTTP and HTTPS links can be opened/)
    await structuredMessage.hover()
    await structuredMessage.locator('.message-actions button').first().click()
    await page.waitForFunction(() => {
      const message = Array.from(document.querySelectorAll('.message-row.is-assistant')).find((row) => row.textContent?.includes('Structured response'))
      return /Copied|\u5df2\u590d\u5236|Da sao chep/.test(message?.querySelector('.message-actions button')?.getAttribute('title') || '')
    })
    await structuredMessage.locator('.message-code-block button').click()
    assert.match(String(await structuredMessage.locator('.message-code-block button').getAttribute('title')), /Copied|\u5df2\u590d\u5236|Da sao chep/)
    const completedToolCard = page.locator('.activity-row').filter({ hasText: /Refresh product analysis|\u5237\u65b0\u5546\u54c1\u5206\u6790|Phan tich lai san pham/ })
    await completedToolCard.waitFor({ state: 'visible' })
    const failedToolCard = page.locator('.activity-row').filter({ hasText: /Retry material batch|\u91cd\u8bd5\u7d20\u6750\u6279\u6b21|Thu lai lo tai nguyen/ })
    await failedToolCard.waitFor({ state: 'visible' })
    assert.equal(await failedToolCard.evaluate((element) => element.classList.contains('is-failed')), true)
    const delegationBefore = await page.evaluate(async () => await window.api.hermes.getDelegationStatus())
    await page.locator('.activity-rail-actions .activity-control').click()
    await page.waitForFunction((expected) => window.api.hermes.getDelegationStatus().then((status) => status.paused === expected), !Boolean(delegationBefore.paused))
    await page.locator('.activity-rail-actions .activity-control').click()
    await page.waitForFunction((expected) => window.api.hermes.getDelegationStatus().then((status) => status.paused === expected), Boolean(delegationBefore.paused))
    assert.equal(await completedToolCard.evaluate((element) => element.classList.contains('is-completed')), true)
    await completedToolCard.locator('.activity-expand').click()
    assert.equal(await completedToolCard.locator('.activity-details section').count(), 2)
    const completedToolDetails = String(await completedToolCard.locator('.activity-details').textContent())
    assert.match(completedToolDetails, /product-1/)
    assert.match(completedToolDetails, /\[redacted\]/)
    assert.match(completedToolDetails, /Product analysis complete/)
    const copiedSectionText = String(await completedToolCard.locator('.activity-details section').last().locator('pre').textContent())
    await completedToolCard.locator('.activity-details section').last().locator('button').dispatchEvent('click')
    const clipboardSectionText = await page.evaluate(async () => await navigator.clipboard.readText())
    assert.equal(clipboardSectionText.replace(/\r\n/g, '\n'), copiedSectionText.replace(/\r\n/g, '\n'))
    const activityTitles = await page.locator('.activity-main > strong').allTextContents()
    const activityTitleText = activityTitles.join('\n')
    await page.screenshot({ path: path.join(artifacts, 'hermes-home-structured-message.png') })
    for (const titlePattern of [
      /Refresh product analysis|\u5237\u65b0\u5546\u54c1\u5206\u6790|Phan tich lai san pham/,
      /Retry material batch|\u91cd\u8bd5\u7d20\u6750\u6279\u6b21|Thu lai lo tai nguyen/,
      /Resume Live Photos|\u6062\u590d\u52a8\u6001\u7167\u7247|Tiep tuc Live Photo/,
      /Compose clone final video|\u5408\u6210\u590d\u523b\u6210\u7247|Ghep video cuoi/,
      /Generate model identity|\u751f\u6210\u6a21\u7279\u8d44\u6599|Tao ho so nguoi mau/,
      /Duplicate production template|\u590d\u5236\u751f\u4ea7\u6a21\u677f|Sao chep mau san xuat/,
      /Retry production task|\u91cd\u8bd5\u751f\u4ea7\u4efb\u52a1|Thu lai tac vu san xuat/,
      /Delete product|\u5220\u9664\u5546\u54c1|Xoa san pham/,
      /Save listing|\u4fdd\u5b58\u5546\u54c1\u520a\u767b|Luu danh sach san pham/,
      /Start TikTok creative shot|\u542f\u52a8 TikTok \u521b\u610f\u955c\u5934|Bat dau canh sang tao TikTok/,
      /Split long video|\u5207\u5206\u957f\u89c6\u9891|Cat video dai/,
      /Save publishing account|\u4fdd\u5b58\u53d1\u5e03\u8d26\u6237|Luu tai khoan dang/,
      /Synchronize publishing task|\u540c\u6b65\u53d1\u5e03\u4efb\u52a1|Dong bo tac vu dang/,
    ]) {
      assert.match(activityTitleText, titlePattern)
    }
    assert.doesNotMatch(activityTitleText, /videogenerate_/)

    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].webContents.send('agentOs:event', [{
        sequence: 9_000_000,
        conversationId: 'another-conversation',
        runId: 'missing-run',
      }])
    })
    await page.waitForTimeout(100)
    assert.equal(await page.locator('.run-band').count(), 0)
    const seededRunDetail = await page.evaluate(async (runId) => await window.api.agentOs.getRun(runId), artifactRunId)
    assert.equal(seededRunDetail.run.id, artifactRunId)
    await app.evaluate(({ BrowserWindow }, payload) => {
      BrowserWindow.getAllWindows()[0].webContents.send('agentOs:event', [payload])
    }, { sequence: 9_000_001, conversationId: currentConversation.id, runId: artifactRunId })
    const runHistoryToggle = page.locator('.run-history-toggle')
    await runHistoryToggle.waitFor({ state: 'visible', timeout: 10_000 })
    assert.match(String(await runHistoryToggle.textContent()), /3/)
    await runHistoryToggle.click()
    assert.equal(await page.locator('.run-history-row').count(), 3)
    await page.screenshot({ path: path.join(artifacts, 'hermes-home-run-history.png') })
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(680, 640))
    await page.waitForTimeout(200)
    const narrowMessageLayout = await page.evaluate(() => {
      const userRow = Array.from(document.querySelectorAll('.message-row.is-user')).find((row) => row.textContent?.includes('Create three product videos.'))
      const assistantRow = Array.from(document.querySelectorAll('.message-row.is-assistant')).find((row) => row.textContent?.includes('Structured response'))
      if (!userRow || !assistantRow) throw new Error('Expected narrow message rows are unavailable')
      const userRect = userRow.getBoundingClientRect()
      const assistantRect = assistantRow.getBoundingClientRect()
      return {
        userLeft: userRect.left,
        userRight: userRect.right,
        assistantLeft: assistantRect.left,
        assistantRight: assistantRect.right,
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
      }
    })
    assert.ok(narrowMessageLayout.userLeft > narrowMessageLayout.assistantLeft)
    assert.ok(narrowMessageLayout.userRight <= narrowMessageLayout.viewportWidth)
    assert.ok(narrowMessageLayout.assistantRight <= narrowMessageLayout.viewportWidth)
    assert.equal(narrowMessageLayout.documentWidth, narrowMessageLayout.viewportWidth)
    const runHistoryBounds = await page.locator('.run-history-panel').evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        documentWidth: document.documentElement.scrollWidth,
      }
    })
    assert.ok(runHistoryBounds.left >= 0 && runHistoryBounds.right <= runHistoryBounds.viewportWidth)
    assert.ok(runHistoryBounds.top >= 0 && runHistoryBounds.bottom <= runHistoryBounds.viewportHeight)
    assert.equal(runHistoryBounds.documentWidth, runHistoryBounds.viewportWidth)
    await page.screenshot({ path: path.join(artifacts, 'hermes-home-run-history-narrow.png') })
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1080, 720))
    await page.waitForTimeout(200)
    await page.locator('.run-filter-tabs button').nth(3).click()
    assert.equal(await page.locator('.run-history-row').count(), 1)
    assert.match(String(await page.locator('.run-history-row').textContent()), /FAILED/)
    assert.match(String(await page.locator('.run-history-row').textContent()), /Publishing account is unavailable/)
    await page.locator('.run-history-row').click()
    await page.waitForFunction(() => document.querySelector('.run-band')?.textContent?.includes('#FAILED'))
    const recoveryAction = page.locator('.run-recovery-action')
    await recoveryAction.waitFor({ state: 'visible' })
    assert.match(String(await recoveryAction.textContent()), /Hermes/)
    assert.match(String(await recoveryAction.textContent()), /Publishing account is unavailable/)
    await app.evaluate(({ BrowserWindow }, payload) => {
      BrowserWindow.getAllWindows()[0].webContents.send('agentOs:event', [payload])
    }, { sequence: 9_000_002, conversationId: currentConversation.id, runId: artifactRunId })
    await page.waitForTimeout(150)
    assert.match(String(await page.locator('.run-band').textContent()), /#FAILED/)
    await runHistoryToggle.click()
    await page.locator('.run-filter-tabs button').first().click()
    await page.locator('.run-history-row').filter({ hasText: 'ARTIFACT' }).click()
    assert.match(String(await page.locator('.run-metrics').textContent()), /2(?:\.0+)?\s*\/\s*usd: 0\.125|credits: 2/i)
    assert.match(String(await page.locator('.run-review').textContent()), /desktop/)
    assert.match(String(await page.locator('.run-review').textContent()), /Manual attention required|\u9700\u8981\u4eba\u5de5\u5904\u7406|Can xu ly thu cong/)
    const executionStep = page.locator('.step-list > article').filter({ hasText: 'Export the generated artifact' })
    await executionStep.locator('.step-summary').click()
    const attemptDetails = String(await executionStep.locator('.attempt-list').textContent())
    assert.match(attemptDetails, /Artifact Export/)
    assert.match(attemptDetails, /The delivery receipt is pending/)
    assert.match(attemptDetails, /external-job-123/)
    assert.doesNotMatch(attemptDetails, /internal-binding|internal-adapter|internal-provider|internal-idempotency|secret-must-not-render/)
    await page.locator('.run-band').scrollIntoViewIfNeeded()
    await page.screenshot({ path: path.join(artifacts, 'hermes-home-run-execution-details.png') })
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(680, 640))
    await page.waitForTimeout(200)
    const executionBounds = await page.locator('.run-band').evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return {
        left: rect.left,
        right: rect.right,
        viewportWidth: window.innerWidth,
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
      }
    })
    assert.ok(executionBounds.left >= 0 && executionBounds.right <= executionBounds.viewportWidth)
    assert.equal(executionBounds.scrollWidth, executionBounds.clientWidth)
    await page.screenshot({ path: path.join(artifacts, 'hermes-home-run-execution-details-narrow.png') })
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1080, 720))
    await page.waitForTimeout(200)
    await executionStep.locator('.step-summary').click()
    assert.equal(await page.locator('.run-timeline-list article').count(), 8)
    await page.locator('.run-timeline > header button').click()
    assert.equal(await page.locator('.run-timeline-list article').count(), runEventTypes.length)
    assert.match(String(await page.locator('.run-timeline').textContent()), /Artifact workflow completed/)
    await page.locator('.run-band').scrollIntoViewIfNeeded()
    await page.waitForTimeout(100)
    await page.screenshot({ path: path.join(artifacts, 'hermes-home-run-timeline.png') })
    const artifactCard = page.locator('.artifact-list > article').filter({ hasText: 'home-artifact-preview.png' })
    await artifactCard.waitFor({ state: 'visible', timeout: 10_000 })
    await artifactCard.locator('.artifact-main').click()
    await page.locator('.artifact-modal').waitFor({ state: 'visible' })
    assert.equal(await page.locator('.artifact-preview-stage > img').isVisible(), true)
    assert.match(String(await page.locator('.artifact-preview-stage > img').getAttribute('src')), /^vg:\/\/file\?path=/)
    assert.match(String(await page.locator('.artifact-metadata').textContent()), /desktop-e2e/)
    await app.evaluate(({ dialog, shell }) => {
      global.__VG_TEST_REVEALED_ARTIFACTS = []
      dialog.showSaveDialog = async () => ({ canceled: true, filePath: undefined })
      shell.showItemInFolder = (filePath) => {
        global.__VG_TEST_REVEALED_ARTIFACTS.push(String(filePath))
      }
    })
    await page.locator('.artifact-modal footer button').first().click()
    assert.deepEqual(await app.evaluate(() => global.__VG_TEST_REVEALED_ARTIFACTS), [artifactImagePath])
    await page.locator('.artifact-modal footer .primary-button').click()
    await page.screenshot({ path: path.join(artifacts, 'hermes-home-artifact-preview.png') })
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(680, 640))
    await page.waitForTimeout(250)
    const artifactModalBounds = await page.locator('.artifact-modal').evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: window.innerWidth, height: window.innerHeight }
    })
    assert.ok(artifactModalBounds.left >= 0 && artifactModalBounds.right <= artifactModalBounds.width)
    assert.ok(artifactModalBounds.top >= 0 && artifactModalBounds.bottom <= artifactModalBounds.height)
    await page.screenshot({ path: path.join(artifacts, 'hermes-home-artifact-preview-narrow-v2.png') })
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1080, 720))
    await page.waitForTimeout(250)
    await page.locator('.artifact-modal > header .icon-button').click()

    await page.evaluate(() => {
      localStorage.setItem('videogenerate.ui.theme', 'warm-paper')
      localStorage.setItem('videogenerate-app-settings', JSON.stringify({ theme: 'warm-paper' }))
    })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.hermes-workspace')
    assert.equal(await page.evaluate(() => document.documentElement.dataset.appTheme), 'warm-paper')
    const surfaceColor = await page.locator('.conversation-surface').evaluate((element) => getComputedStyle(element).backgroundColor)
    assert.notEqual(surfaceColor, darkSurfaceColor)
    await page.screenshot({ path: path.join(artifacts, 'hermes-home-warm-paper.png') })

    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(680, 640))
    await page.waitForTimeout(300)
    const narrow = await page.evaluate(() => ({
      width: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      sessionVisible: getComputedStyle(document.querySelector('.session-rail')).display !== 'none',
      activityVisible: getComputedStyle(document.querySelector('.activity-rail')).display !== 'none',
      composer: (() => {
        const rect = document.querySelector('.composer').getBoundingClientRect()
        return { left: rect.left, right: rect.right, bottom: rect.bottom }
      })(),
    }))
    assert.equal(narrow.scrollWidth, narrow.width)
    assert.equal(narrow.sessionVisible, false)
    assert.equal(narrow.activityVisible, false)
    assert.ok(narrow.composer.left >= 0 && narrow.composer.right <= narrow.width)
    await page.screenshot({ path: path.join(artifacts, 'hermes-home-narrow.png') })
    await page.locator('.activity-rail-trigger').click()
    await page.locator('.activity-rail').waitFor({ state: 'visible' })
    const narrowActivityBounds = await page.locator('.activity-rail').boundingBox()
    assert.ok(narrowActivityBounds && narrowActivityBounds.x >= 0 && narrowActivityBounds.x + narrowActivityBounds.width <= narrow.width)
    await page.screenshot({ path: path.join(artifacts, 'hermes-home-activity-drawer-narrow.png') })
    await page.locator('.activity-rail-close').click()
    await page.locator('.activity-rail').waitFor({ state: 'hidden' })
    await page.evaluate(async () => await window.api.hermes.openWorkspace({ workspaceId: 'settings', settingsSection: 'hermes-skills' }))
    await page.waitForURL(/#\/settings\?section=hermes-skills$/)
    await page.waitForSelector('.settings-console')
    assert.equal(await page.locator('[data-settings-section="hermes-skills"]').evaluate((element) => element.classList.contains('active')), true)
    await page.evaluate(async () => await window.api.hermes.openWorkspace({ workspaceId: 'home' }))
    await page.waitForURL(/#\/home$/)
    await page.waitForSelector('.hermes-workspace')
    console.log(JSON.stringify({ initial, narrow, darkSurfaceColor, surfaceColor }))
    console.log('hermes-home-electron.e2e: ok')
  } finally {
    await app.close().catch(() => undefined)
    await rm(root, { recursive: true, force: true })
  }
}

void main()
