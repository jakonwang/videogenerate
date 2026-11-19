/**
 * 服务器复刻引擎：网页传来的参数里的本地路径，只能落在这个用户自己的目录里。
 *
 * 参数会一路交给文件读写和 ffmpeg / ffprobe。ffmpeg 自己认一批「协议前缀」，
 * 比如 concat:/etc/passwd、subfile:…、file://localhost/…，它们不以 / 开头，
 * 却同样能读到服务器上的任意文件，所以也要拦下来。
 */
import { resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const DENIED = '只能使用自己上传的文件'

/** ffmpeg 能读本地文件或连出去的协议（file: 单独按路径检查） */
const FFMPEG_PROTOCOL = /^(?:async|bluray|cache|concat|concatf|crypto|fd|ftp|gopher|gophers|hls|md5|mmsh|mmst|pipe|prompeg|rtmps?|rtmpe|rtmpt|rtmpte|rtmpts|rtp|rtsp|sctp|sftp|smb|srt|srtp|subfile|tcp|tee|tls|udp|udplite|unix|zmq)[:,]/i

/** 像路径的字符串：盘符、斜杠开头、.. 开头（带 .. 段的另外判断） */
const PATH_LIKE = /^(?:[A-Za-z]:[\\/]|[\\/]|\.\.)/

function inside(root: string, full: string) {
  return full === root || full.startsWith(root + sep)
}

function fileUrlCandidates(item: string): string[] {
  // 两种读法都要在自己目录里：直接去掉前缀（文件系统看到的），和按网址解码（ffmpeg 等看到的）
  const naive = item.replace(/^file:[\\/]*/i, process.platform === 'win32' ? '' : '/')
  const out = [naive]
  try {
    out.push(fileURLToPath(new URL(item)))
  } catch {
    // 不是合法网址（比如 file://别的主机/…）：不让用
    throw new Error(DENIED)
  }
  return out
}

export function assertOwnPaths(value: unknown, userRoot: string) {
  const root = resolve(userRoot)
  const check = (item: unknown) => {
    if (typeof item === 'string') {
      const text = item.trim()
      if (!text) return
      // 文案里的「Tcp: …」之类不算：协议写法没有空白，且后面跟着路径或别的网址
      if (FFMPEG_PROTOCOL.test(text) && !/\s/.test(text) && /[\\/]/.test(text)) throw new Error(DENIED)
      if (/^file:/i.test(text)) {
        for (const candidate of fileUrlCandidates(text)) if (!inside(root, resolve(candidate))) throw new Error(DENIED)
        return
      }
      if (text.length > 4096) return
      if (PATH_LIKE.test(text) || /(^|[\\/])\.\.([\\/]|$)/.test(text)) {
        if (!inside(root, resolve(text))) throw new Error(DENIED)
      }
    } else if (Array.isArray(item)) item.forEach(check)
    else if (item && typeof item === 'object') Object.values(item).forEach(check)
  }
  check(value)
}
