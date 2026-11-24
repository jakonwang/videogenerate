'use client'

import { useEffect, useState } from 'react'
import { Images } from 'lucide-react'

import { SCENE_CATEGORIES, type SceneSwapScene } from '@shared/sceneSwap'
import { AdminError, AdminField, AdminLoading, AdminPage, AdminPageHeader, AdminPanel, AdminTag, selectClass, useAdminData } from '@/components/admin/admin-ui'
import { Button } from '@/components/admin/controls'
import { adminClient } from '@/lib/admin-client'

function SceneImage({ scene }: { scene: SceneSwapScene }) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    let url = ''
    let gone = false
    adminClient.admin
      .downloadFile(scene.fileId)
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
  }, [scene.fileId])
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img src={src} alt={scene.name} className="aspect-[3/4] w-full rounded-lg object-cover" /> : <div className="aspect-[3/4] w-full rounded-lg" />
}

export default function AdminScenesPage() {
  const scenes = useAdminData(() => adminClient.admin.listScenes(), [])
  const [category, setCategory] = useState<string>(SCENE_CATEGORIES[0])
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')

  async function upload(files: FileList | null) {
    const list = Array.from(files ?? [])
    setError('')
    try {
      for (const [index, file] of list.entries()) {
        setProgress(`正在上传 ${index + 1} / ${list.length}`)
        const { fileId } = await adminClient.admin.uploadFile(file, file.type)
        await adminClient.admin.addScene({ fileId, name: file.name.replace(/\.[^.]+$/, ''), category })
      }
    } catch (cause) {
      setError((cause as Error).message)
    }
    setProgress('')
    void scenes.reload()
  }

  async function remove(scene: SceneSwapScene) {
    if (!window.confirm(`下架场景「${scene.name}」？用户之后选不到它，已经生成的图不受影响。`)) return
    try {
      await adminClient.admin.removeScene(scene.id)
    } catch (cause) {
      setError((cause as Error).message)
    }
    void scenes.reload()
  }

  return (
    <AdminPage>
      <AdminPageHeader icon={Images} title="换景场景库" description="批量换景里所有用户都能选的系统场景；建议用竖图，地面露出来，没有人和文字，并确认有使用权" />
      <AdminPanel>
        <div className="flex flex-wrap items-end gap-3">
          <AdminField label="分类">
            <select className={selectClass} value={category} onChange={(e) => setCategory(e.target.value)}>
              {SCENE_CATEGORIES.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </AdminField>
          <AdminField label="上传图片" hint={progress || '可多选，文件名就是场景名'}>
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
        {scenes.error ? <AdminError message={scenes.error} onRetry={() => void scenes.reload()} /> : null}
        {scenes.loading && !scenes.data ? <AdminLoading /> : null}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-6">
          {scenes.data?.scenes.map((scene) => (
            <div key={scene.id} className="flex flex-col gap-2">
              <SceneImage scene={scene} />
              <div className="flex items-center justify-between gap-2">
                <span className="truncate">{scene.name}</span>
                <AdminTag>{scene.category}</AdminTag>
              </div>
              <Button variant="secondary" onClick={() => void remove(scene)}>
                下架
              </Button>
            </div>
          ))}
        </div>
        {scenes.data && !scenes.data.scenes.length ? <p>还没有系统场景</p> : null}
      </AdminPanel>
    </AdminPage>
  )
}
