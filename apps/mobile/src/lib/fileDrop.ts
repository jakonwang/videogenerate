/**
 * Drag files from the computer onto any picker. Every picker in the app is a button next to a hidden
 * <input type="file">; on drop we walk up from the drop point, take the nearest file input whose
 * `accept` matches the files, hand it the files and fire `change` — the picker's own code does the rest.
 */

function accepts(input: HTMLInputElement, file: File) {
  const rules = input.accept.split(',').map((rule) => rule.trim().toLowerCase()).filter(Boolean)
  if (!rules.length) return true
  const type = file.type.toLowerCase()
  const name = file.name.toLowerCase()
  return rules.some((rule) => (rule.endsWith('/*') ? type.startsWith(rule.slice(0, -1)) : rule.startsWith('.') ? name.endsWith(rule) : type === rule))
}

function targetFor(start: EventTarget | null, files: File[]) {
  let node = start instanceof Element ? start : null
  while (node && node !== document.documentElement) {
    const inputs = Array.from(node.querySelectorAll<HTMLInputElement>('input[type="file"]:not([disabled])'))
    const match = inputs.find((input) => files.some((file) => accepts(input, file)))
    if (match) return match
    node = node.parentElement
  }
  return null
}

let highlighted: Element | null = null
function highlight(element: Element | null) {
  if (highlighted === element) return
  highlighted?.classList.remove('m-drop-target')
  highlighted = element
  highlighted?.classList.add('m-drop-target')
}

function draggedFiles(event: DragEvent) {
  return Array.from(event.dataTransfer?.types || []).includes('Files')
}

export function installFileDrop() {
  // Without this the browser would navigate to a dropped file and leave the app.
  window.addEventListener('dragover', (event) => {
    if (!draggedFiles(event)) return
    event.preventDefault()
    // Types are known while dragging, the files themselves only on drop: match by the input that is there.
    let node = event.target instanceof Element ? event.target : null
    let found: Element | null = null
    while (node && node !== document.documentElement && !found) {
      if (node.querySelector('input[type="file"]:not([disabled])')) found = node
      node = node.parentElement
    }
    if (event.dataTransfer) event.dataTransfer.dropEffect = found ? 'copy' : 'none'
    // Only outline a picker-sized area, never the whole page.
    highlight(found && !found.matches('body, main, .m-page, #app') ? found : null)
  })
  window.addEventListener('dragleave', (event) => {
    if (!event.relatedTarget) highlight(null)
  })
  window.addEventListener('drop', (event) => {
    if (!draggedFiles(event)) return
    event.preventDefault()
    highlight(null)
    const files = Array.from(event.dataTransfer?.files || [])
    if (!files.length) return
    const input = targetFor(event.target, files)
    if (!input) return
    const accepted = files.filter((file) => accepts(input, file))
    const transfer = new DataTransfer()
    for (const file of input.multiple ? accepted : accepted.slice(0, 1)) transfer.items.add(file)
    input.files = transfer.files
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
}
