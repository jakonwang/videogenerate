const { app, ipcMain } = require('electron');
const path = require('node:path');
const handlers = new Map();
const originalHandle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (channel, listener) => { handlers.set(channel, listener); return originalHandle(channel, listener); };
require(path.resolve(process.cwd(), 'out/main/index.js'));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  await app.whenReady();
  for (let i = 0; i < 100; i += 1) {
    if (handlers.has('clone:listModelIdentityLibrary') && handlers.has('clone:getModelCredentials')) break;
    await wait(200);
  }
  const list = await handlers.get('clone:listModelIdentityLibrary')({}, undefined);
  const creds = await handlers.get('clone:getModelCredentials')({}, undefined);
  console.log(JSON.stringify({
    modelCount: Array.isArray(list) ? list.length : -1,
    firstModels: Array.isArray(list) ? list.slice(0, 3).map((x) => ({ id: x.id, name: x.name, imageCount: Array.isArray(x.imagePaths) ? x.imagePaths.length : 0 })) : [],
    creds: {
      chatProviderPrimary: creds?.chatProviderPrimary || null,
      videoProviderPrimary: creds?.videoProviderPrimary || null,
      hasGrsaiKey: Boolean(creds?.grsaiApiKey),
      hasApifoxHub: Boolean(creds?.apifoxHub?.apiKey || creds?.apifoxHub?.token),
      allowMockWhenNoKey: Boolean(creds?.allowMockWhenNoKey),
      grsaiAnalysisModel: creds?.grsaiAnalysisModel || null
    }
  }, null, 2));
  await app.quit();
})();
