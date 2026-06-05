const run = async () => {
  const repoMod = await import('./src/main/modules/clone/repo.ts')
  const serviceMod = await import('./src/main/modules/clone/service.ts')
  console.log('repoMod', repoMod)
  console.log('serviceMod', serviceMod)
}
run().catch((error) => { console.error(error); process.exit(1) })
