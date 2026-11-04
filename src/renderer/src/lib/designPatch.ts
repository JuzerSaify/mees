import type {
  DesignSelection,
  EditPatch,
  TargetedEditPatch
} from '../../../shared/types'

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
    style.setAttribute('data-mees-edit-target', target.selector)
    style.textContent = patch.styles.trim()
    documentNode.head.appendChild(style)
  }

  return `<!doctype html>\n${documentNode.documentElement.outerHTML}`
}

export function applyDesignPatches(
  html: string,
  targets: DesignSelection[],
  patches: TargetedEditPatch[]
): string {
  if (targets.length === 0) {
    throw new Error('No selected elements are available for this edit.')
  }
  const expected = new Set(targets.map((target) => target.selector))
  const returned = new Set(patches.map((patch) => patch.selector))
  if (
    returned.size !== expected.size ||
    [...expected].some((selector) => !returned.has(selector))
  ) {
    throw new Error('The edit did not return one patch for every selected element.')
  }

  const documentNode = new DOMParser().parseFromString(html, 'text/html')
  const ordered = [...patches].sort(
    (left, right) =>
      right.selector.split('>').length - left.selector.split('>').length
  )
  for (const patch of ordered) {
    let selected: Element | null = null
    try {
      selected = documentNode.querySelector(patch.selector)
    } catch {
      throw new Error(`The selected element ${patch.selector} is not valid.`)
    }
    if (!selected) {
      throw new Error(`The selected element ${patch.selector} is no longer present.`)
    }
    const replacement = parseReplacement(patch.replacement)
    selected.replaceWith(documentNode.importNode(replacement, true))
    if (patch.styles?.trim()) {
      const style = documentNode.createElement('style')
      style.setAttribute('data-mees-edit-target', patch.selector)
      style.textContent = patch.styles.trim()
      documentNode.head.appendChild(style)
    }
  }
  return `<!doctype html>\n${documentNode.documentElement.outerHTML}`
}
