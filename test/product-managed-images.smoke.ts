import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { tmpdir } from 'node:os'

async function exists(filePath: string) {
  return await stat(filePath).then(() => true).catch(() => false)
}

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'videogenerate-product-images-'))
  const dataDir = join(root, 'data')
  const sourceDir = join(root, 'source')
  process.env.VIDEOGENERATE_USER_DATA_DIR = root
  process.env.VIDEOGENERATE_DATA_DIR = dataDir

  try {
    await mkdir(join(dataDir, 'db'), { recursive: true })
    await mkdir(sourceDir, { recursive: true })
    const firstSource = join(sourceDir, 'first.png')
    await writeFile(firstSource, Buffer.from('first-image'))

    const { productsRepo } = await import('../src/main/modules/products/repo')
    const created = await productsRepo.upsert({
      name: 'Managed product',
      type: 'earring',
      images: [{
        id: 'image-first',
        productId: '',
        filePath: firstSource,
        fileName: 'first.png',
        fileSize: 11,
        thumbnailPath: firstSource,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        isCover: true,
      }],
      coverImagePath: firstSource,
      livePhotoReferenceImagePath: firstSource,
    })

    const managedRoot = join(dataDir, 'product-library', 'images')
    const firstManagedPath = String(created.images?.[0]?.filePath || '')
    assert.equal(relative(managedRoot, firstManagedPath).startsWith('..'), false)
    assert.equal(created.coverImagePath, firstManagedPath)
    assert.equal(created.livePhotoReferenceImagePath, firstManagedPath)
    assert.equal(await exists(firstManagedPath), true)
    assert.equal(await readFile(firstManagedPath, 'utf8'), 'first-image')

    await rm(firstSource, { force: true })
    const afterSourceRemoval = (await productsRepo.list()).find((item) => item.id === created.id)
    assert.equal(afterSourceRemoval?.coverImagePath, firstManagedPath)
    assert.equal(await exists(String(afterSourceRemoval?.coverImagePath || '')), true)

    const secondSource = join(sourceDir, 'second.webp')
    await writeFile(secondSource, Buffer.from('second-image'))
    const updated = await productsRepo.upsert({
      ...afterSourceRemoval!,
      images: [{
        id: 'image-second',
        productId: created.id,
        filePath: secondSource,
        fileName: 'second.webp',
        fileSize: 12,
        thumbnailPath: secondSource,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        isCover: true,
      }],
      coverImagePath: secondSource,
      livePhotoReferenceImagePath: secondSource,
    })
    const secondManagedPath = String(updated.images?.[0]?.filePath || '')
    assert.equal(relative(managedRoot, secondManagedPath).startsWith('..'), false)
    assert.notEqual(secondManagedPath, secondSource)
    assert.equal(updated.coverImagePath, secondManagedPath)
    assert.equal(updated.livePhotoReferenceImagePath, secondManagedPath)
    assert.equal(await readFile(secondManagedPath, 'utf8'), 'second-image')

    const legacySource = join(sourceDir, 'legacy.jpg')
    const missingSource = join(sourceDir, 'missing.jpg')
    await writeFile(legacySource, Buffer.from('legacy-image'))
    const dbPath = join(dataDir, 'db', 'products.json')
    const db = JSON.parse(await readFile(dbPath, 'utf8'))
    db.products.push({
      id: 'legacy-product',
      name: 'Legacy product',
      type: 'earring',
      assets: { hook: [], show: [], detail: [] },
      images: [{
        id: 'legacy-image',
        productId: 'legacy-product',
        filePath: legacySource,
        fileName: 'legacy.jpg',
        fileSize: 12,
        thumbnailPath: legacySource,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        isCover: true,
      }],
      coverImagePath: legacySource,
      livePhotoReferenceImagePath: legacySource,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }, {
      id: 'missing-product',
      name: 'Missing product',
      type: 'earring',
      assets: { hook: [], show: [], detail: [] },
      images: [{
        id: 'missing-image',
        productId: 'missing-product',
        filePath: missingSource,
        fileName: 'missing.jpg',
        fileSize: 0,
        thumbnailPath: missingSource,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        isCover: true,
      }],
      coverImagePath: missingSource,
      livePhotoReferenceImagePath: missingSource,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    await writeFile(dbPath, JSON.stringify(db, null, 2), 'utf8')

    const migration = await productsRepo.migrateExternalImages()
    assert.equal(migration.migrated, 1)
    assert.equal(migration.missing, 1)

    const migratedProducts = await productsRepo.list()
    const legacyProduct = migratedProducts.find((item) => item.id === 'legacy-product')
    const missingProduct = migratedProducts.find((item) => item.id === 'missing-product')
    assert.equal(relative(managedRoot, String(legacyProduct?.coverImagePath || '')).startsWith('..'), false)
    assert.equal(await exists(String(legacyProduct?.coverImagePath || '')), true)
    assert.equal(missingProduct?.coverImagePath, missingSource)
    assert.equal(await exists(String(missingProduct?.coverImagePath || '')), false)

    console.log('[product-managed-images] passed')
  } finally {
    delete process.env.VIDEOGENERATE_USER_DATA_DIR
    delete process.env.VIDEOGENERATE_DATA_DIR
    await rm(root, { recursive: true, force: true })
  }
}

void main().catch((error) => {
  console.error('[product-managed-images] failed', error)
  process.exitCode = 1
})
