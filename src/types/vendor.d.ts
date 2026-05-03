declare module 'ffprobe-static' {
  const ffprobeStatic: string | { path?: string }
  export default ffprobeStatic
}

declare module 'fontkit' {
  const fontkit: any
  export default fontkit
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, any>
  export default component
}
