'use client'

import { useEffect, useState } from 'react'
import { Users } from 'lucide-react'

import { MODEL_BODIES, MODEL_GENDERS, MODEL_SKINS, type SwapModel } from '@shared/sceneSwap'
import { AdminError, AdminField, AdminLoading, AdminPage, AdminPageHeader, AdminPanel, AdminTag, selectClass, useAdminData } from '@/components/admin/admin-ui'
import { Button } from '@/components/admin/controls'
import { adminClient } from '@/lib/admin-client'

function ModelImage({ model }: { model: SwapModel }) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    let url = ''
    let gone = false
    adminClient.admin
      .downloadFile(model.fileId)
      .then((blob) => {
        if (gone) return
        url = URL.createObjectURL(blob)
        setSrc(url)
      })
      .catch(() => undefined)
    return () => {
      gone = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [model.fileId])
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img src={src} alt={model.name} className="aspect-[3/4] w-full rounded-lg object-cover" /> : <div className="aspect-[3/4] w-full rounded-lg" />
}

export default function AdminModelsPage() {
  const models = useAdminData(() => adminClient.admin.listModels(), [])
  const [tags, setTags] = useState<Record<'gender' | 'skin' | 'body', string>>({ gender: MODEL_GENDERS[0], skin: MODEL_SKINS[0], body: MODEL_BODIES[0] })
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')

  async function upload(files: FileList | null) {
    const list = Array.from(files ?? [])
    setError('')
    try {
      for (const [index, file] of list.entries()) {
        setProgress(`正在上传 ${index + 1} / ${list.length}`)
        const { fileId } = await adminClient.admin.uploadFile(file, file.type)
        await adminClient.admin.addModel({ fileId, name: file.name.replace(/\.[^.]+$/, ''), ...tags })
      }
    } catch (cause) {
      setError((cause as Error).message)
    }
    setProgress('')
    void models.reload()
  }

  async function remove(model: SwapModel) {
    if (!window.confirm(`下架模特「${model.name}」？用户之后选不到它，已经生成的图不受影响。`)) return
    try {
      await adminClient.admin.removeModel(model.id)
    } catch (cause) {
      setError((cause as Error).message)
    }
    void models.reload()
  }

  return (
    <AdminPage>
      <AdminPageHeader icon={Users} title="系统模特" description="生成模特图和换模特里所有用户都能选的模特；建议用 AI 虚拟人的正面全身竖图，脸清楚、衣服简单、背景干净" />
      <AdminPanel>
        <div className="flex flex-wrap items-end gap-3">
          {(
            [
              ['gender', '性别', MODEL_GENDERS],
              ['skin', '肤色', MODEL_SKINS],
              ['body', '身材', MODEL_BODIES],
            ] as const
          ).map(([key, label, options]) => (
            <AdminField key={key} label={label}>
              <select className={selectClass} value={tags[key]} onChange={(e) => setTags({ ...tags, [key]: e.target.value })}>
                {options.map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
            </AdminField>
          ))}
          <AdminField label="上传图片" hint={progress || '可多选，文件名就是模特名；同一次上传用同样的性别、肤色、身材'}>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              disabled={Boolean(progress)}
              onChange={(e) => {
                const input = e.currentTarget
                void upload(input.files).finally(() => {
                  input.value = ''
                })
              }}
            />
          </AdminField>
        </div>
        {error ? <AdminError message={error} /> : null}
      </AdminPanel>
      <AdminPanel>
        {models.error ? <AdminError message={models.error} onRetry={() => void models.reload()} /> : null}
        {models.loading && !models.data ? <AdminLoading /> : null}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-6">
          {models.data?.models.map((model) => (
            <div key={model.id} className="flex flex-col gap-2">
              <ModelImage model={model} />
              <div className="flex items-center justify-between gap-2">
                <span className="truncate">{model.name}</span>
                <AdminTag>{[model.gender, model.skin, model.body].filter(Boolean).join(' · ')}</AdminTag>
              </div>
              <Button variant="secondary" onClick={() => void remove(model)}>
                下架
              </Button>
            </div>
          ))}
        </div>
        {models.data && !models.data.models.length ? <p>还没有系统模特</p> : null}
      </AdminPanel>
    </AdminPage>
  )
}
