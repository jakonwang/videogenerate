/**
 * 网页版的模特库：电脑端「模特库」页面（ModelLibraryView）在网页上原样显示。
 *
 * 模特方法（列表、生成、改名、删除、选用…）都是 window.api.clone，网页上本来就由**服务器引擎**执行（lib/desktopRelay），
 * 引擎里的模特库经云同步和电脑端互通。这里只替换和密钥有关的两项：
 * - 网页上的生成走云端 AI 代理（密钥在服务器），页面读到的是「已托管」的掩码密钥，用来判断可以生成；
 *   引擎会丢掉网页传来的任何密钥 / 平台地址（services/cloud/engine/credentialArgs.ts）。
 * - 保存密钥：网页上不改任何设置（电脑上的密钥留在电脑上）。
 */
import type { DesktopApi } from './contract'
import { SECRET_MASK_PREFIX } from '@shared/cloud/managedSettings'
import { getPathForFile, pickFiles } from './files'

type Clone = DesktopApi['clone']

const MANAGED = `${SECRET_MASK_PREFIX}云端`

const getModelCredentials = (async () => ({
  openaiApiKey: MANAGED,
  klingApiKey: MANAGED,
  grsaiApiKey: MANAGED,
  apifoxHub: { apiKey: MANAGED, baseUrl: '', imageModel: '' },
})) as unknown as Clone['getModelCredentials']

const setModelCredentials = (async () => ({ ok: true })) as unknown as Clone['setModelCredentials']

/** 这个页面打开期间替换的 window.api 部分（clone 的其余方法照旧交给服务器引擎） */
export default {
  clone: { getModelCredentials, setModelCredentials },
  pickFiles,
  getPathForFile,
}
