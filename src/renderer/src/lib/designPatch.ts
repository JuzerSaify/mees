import type { DesignSelection, EditPatch } from '../../../shared/types'

function parseReplacement(value: string): Element {
  const template = document.createElement('template')
  template.innerHTML = value.trim()
  const elements = Array.from(template.content.children)
  if (elements.length !== 1) {
    throw new Error('A selected-element edit must return exactly one replacement element.')
  }
  return elements[0]
}

export function applyDesignPatch(
  html: string,
  target: DesignSelection,
  patch: EditPatch
): string {
  const documentNode = new DOMParser().parseFromString(html, 'text/html')
  let selected: Element | null = null
  try {
    selected = documentNode.querySelector(target.selector)
  } catch {
    throw new Error('The selected element no longer has a valid target.')
  }
  if (!selected) {
    throw new Error('The selected element is no longer present in this design.')
  }

  const replacement = parseReplacement(patch.replacement)
  selected.replaceWith(documentNode.importNode(replacement, true))

  if (patch.styles?.trim()) {
    const style = documentNode.createElement('style')
    style.setAttribute('data-kern-edit-target', target.selector)
    style.textContent = patch.styles.trim()
    documentNode.head.appendChild(style)
  }

  return `<!doctype html>\n${documentNode.documentElement.outerHTML}`
}
