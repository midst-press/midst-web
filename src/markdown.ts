/*
 * Markdown as sanitised HTML, for process notes and Annelyse's texts (#340: marked 18 and DOMPurify, in place of
 * marked 0.7 and insane). The configuration keeps what insane kept: an allowed tag keeps only the attributes listed
 * for it, a disallowed tag goes with what is inside it, and a link or source may be http, https, mailto or relative.
 * Measured against the old pipeline on the archive's notes and content/: what differs is non-breaking spaces the
 * poet typed, now kept, and one emphasis edge case where marked now follows CommonMark.
 *
 * DOMPurify needs a DOM. In the browser it uses the page's; a test that renders runs under jsdom.
 */
import { marked } from 'marked'
import DOMPurify, { DOMPurify as DOMPurifyInstance, UponSanitizeAttributeHook, UponSanitizeElementHook } from 'dompurify'

export type Attributes = Readonly<Record<string, readonly string[]>>

export interface Allowed {
  tags: readonly string[]
  attributes: Attributes
  /** Hosts an iframe may embed from, over https. Any other iframe becomes a link to its address. */
  iframeHosts?: readonly string[]
}

// http, https and mailto; anything without a scheme (a path, #fragment, ?query) is relative and stays. DOMPurify's
// default, less its other schemes.
const ALLOWED_URI = /^(?:(?:https?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i

// The attributes of the call in progress. sanitize runs synchronously, so one hook serves every call. DOMPurify lets
// an img's src be a data: URI whatever ALLOWED_URI_REGEXP says; insane did not, so the hook refuses it too.
let current: Attributes = {}
const keepAttribute: UponSanitizeAttributeHook = (node, data) => {
  if (!(current[node.nodeName.toLowerCase()] || []).includes(data.attrName)) data.keepAttr = false
  else if ((data.attrName === 'href' || data.attrName === 'src') && !ALLOWED_URI.test(data.attrValue)) data.keepAttr = false
}

// Embedded players only from the hosts the call allows (Annelyse, 26 Oct, #292): any other iframe would put another
// site's page, a fake sign-in for one, inside ours. It is replaced by a link to its address, so nothing is lost but the
// embedding; one with no http(s) address is dropped.
let iframeHosts: readonly string[] = []
const embedsFrom = (src: string | null): boolean => {
  try {
    const url = new URL(src ?? '')
    return url.protocol === 'https:' && iframeHosts.includes(url.hostname)
  } catch {
    return false
  }
}
const replaceForeignIframe: UponSanitizeElementHook = (node, data) => {
  if (data.tagName !== 'iframe') return
  const iframe = node as Element
  const src = iframe.getAttribute('src')
  if (embedsFrom(src)) return
  let address: URL | null = null
  try {
    address = new URL(src ?? '')
  } catch {
    address = null
  }
  if (address && (address.protocol === 'https:' || address.protocol === 'http:')) {
    const link = iframe.ownerDocument.createElement('a')
    link.setAttribute('href', address.href)
    link.textContent = address.href
    iframe.replaceWith(link)
  } else {
    iframe.remove()
  }
}

// This module's own instance, so the hook never reaches the shared DOMPurify. Made at the first render, not at
// import: the end-to-end specs import app modules in Node, where there is no window until a spec makes one. With no
// window DOMPurify's sanitize returns its input unchanged, so rendering with none throws instead.
let purifier: DOMPurifyInstance | undefined
function purify(): DOMPurifyInstance {
  if (!purifier) {
    const made = DOMPurify(globalThis.window)
    if (!made.isSupported) throw new Error('markdown: no DOM to sanitise with')
    made.addHook('uponSanitizeAttribute', keepAttribute)
    made.addHook('uponSanitizeElement', replaceForeignIframe)
    purifier = made
  }
  return purifier
}

/** `markdown` as HTML holding only the tags and attributes in `allowed`. */
export function renderMarkdown(markdown: string, allowed: Allowed): string {
  const html = marked.parse(markdown, { async: false })
  current = allowed.attributes
  iframeHosts = allowed.iframeHosts ?? []
  try {
    return purify().sanitize(html, {
      ALLOWED_TAGS: [...allowed.tags, '#text'],
      ALLOWED_ATTR: [...new Set(Object.values(allowed.attributes).flat())],
      ALLOWED_URI_REGEXP: ALLOWED_URI,
      KEEP_CONTENT: false,
    })
  } finally {
    current = {}
    iframeHosts = []
  }
}
