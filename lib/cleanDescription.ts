/**
 * Clean job descriptions for display — proper HTML parsing, not regex.
 * Used for job cards, search, and detail pages to ensure no raw HTML like
 * &lt;div class="content-intro"&gt; appears.
 */

function decodeEntities(text: string): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    // @ts-ignore - he has no types in this context
    const he = require('he')
    return he.decode(text)
  } catch {
    return text
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x27;/g, "'")
  }
}

function stripHtmlProper(html: string): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    // @ts-ignore
    const { parse } = require('node-html-parser')
    const root = parse(html, { comment: false })
    root.querySelectorAll('script, style, noscript, iframe, form, button').forEach((el: any) => el.remove())

    // Preserve paragraph breaks
    const blockTags = ['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'br', 'tr']
    blockTags.forEach(tag => {
      root.querySelectorAll(tag).forEach((el: any) => {
        if (tag === 'br') {
          el.replaceWith('\n')
        } else if (tag === 'li') {
          el.insertAdjacentHTML('beforebegin', '- ')
          el.insertAdjacentHTML('afterend', '\n')
        } else {
          el.insertAdjacentHTML('beforebegin', '\n\n')
          el.insertAdjacentHTML('afterend', '\n\n')
        }
      })
    })

    let text = root.text || root.innerText || ''
    return text
  } catch {
    // Fallback regex if parser fails
    return html.replace(/<[^>]+>/g, ' ')
  }
}

export function cleanDescription(raw: string | null | undefined): string {
  if (!raw) return ''
  // First decode entities — so &lt;div&gt; becomes <div> and can be stripped as tag
  // Double decode handles &amp;lt; double encoding
  let decoded = decodeEntities(raw)
  decoded = decodeEntities(decoded)
  // Strip HTML properly
  let cleaned = stripHtmlProper(decoded)
  // Second round decode + strip after HTML removal in case nested encoding remained
  cleaned = decodeEntities(cleaned)
  cleaned = stripHtmlProper(cleaned)
  cleaned = decodeEntities(cleaned)

  // Also strip any remaining HTML-like fragments that parser might have missed
  // e.g. leftover <div class="content-intro"> from failed parse or plain text attributes
  cleaned = cleaned.replace(/<[^>]*>/g, ' ')

  // Cleanup whitespace
  return cleaned
    .replace(/\u0000/g, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Strip markdown syntax to plain readable text for excerpts.
 * Keeps the semantic content but removes formatting markers so
 * job cards never show **bold** or [link](url) or # heading markers.
 */
function stripMarkdown(md: string): string {
  if (!md) return ''
  let text = md

  // Remove code blocks ```...```
  text = text.replace(/```[\s\S]*?```/g, ' ')
  // Inline code `code` -> code
  text = text.replace(/`([^`]+)`/g, '$1')
  // Images ![alt](url) -> alt
  text = text.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
  // Links [label](url) -> label
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
  // Bold **text** or __text__ -> text
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1')
  text = text.replace(/__([^_]+)__/g, '$1')
  // Italic *text* or _text_ -> text (careful not to break apostrophes)
  text = text.replace(/\*([^*]{1,200}?)\*/g, '$1')
  text = text.replace(/(?:^|\s)_([^_]{1,200}?)_(?:\s|$)/g, ' $1 ')
  // Strikethrough ~~text~~ -> text
  text = text.replace(/~~([^~]+)~~/g, '$1')
  // Headings # ## ### -> remove markers but keep text, line by line
  text = text.replace(/^\s{0,3}#{1,6}\s+/gm, '')
  // Blockquotes > -> remove
  text = text.replace(/^\s{0,3}>\s?/gm, '')
  // Unordered list markers -, *, + at start of line -> remove
  text = text.replace(/^\s*[-*+]\s+/gm, '')
  // Ordered list 1. 2. etc -> remove number
  text = text.replace(/^\s*\d+\.\s+/gm, '')
  // Horizontal rules ---, ***, ___ alone on line -> remove
  text = text.replace(/^\s*[-*_]{3,}\s*$/gm, '')
  // Remaining stray markdown chars that leak as tokens
  // e.g. leftover "##" or "**" from broken formatting
  text = text.replace(/^\s*[*_#]{1,3}\s*/gm, '')
  // Collapse whitespace
  text = text.replace(/\s+/g, ' ').trim()
  return text
}

export function generateExcerpt(raw: string | null | undefined, minLen = 180, maxLen = 250): string {
  const cleaned = cleanDescription(raw)
  if (!cleaned) return ''
  // For preview, strip markdown to plain sentence
  const plain = stripMarkdown(cleaned)
  let text = plain.replace(/\s+/g, ' ').trim()
  if (!text) return ''
  if (text.length <= maxLen) return text

  let excerpt = text.slice(0, maxLen)
  const lastPeriod = excerpt.lastIndexOf('. ')
  const lastExcl = excerpt.lastIndexOf('! ')
  const lastQ = excerpt.lastIndexOf('? ')
  const lastSentenceEnd = Math.max(lastPeriod, lastExcl, lastQ)

  if (lastSentenceEnd > minLen) {
    excerpt = excerpt.slice(0, lastSentenceEnd + 1)
  } else {
    const lastSpace = excerpt.lastIndexOf(' ')
    if (lastSpace > minLen) {
      excerpt = excerpt.slice(0, lastSpace)
    }
  }

  if (!/[.!?…]$/.test(excerpt.trim())) {
    excerpt = excerpt.trim() + '…'
  }

  return excerpt.trim()
}

// For job cards specifically — ensure 180-250 chars, clean, no HTML, no markdown
export function getJobCardExcerpt(descriptionMd: string | null | undefined): string {
  return generateExcerpt(descriptionMd, 180, 250)
}

/**
 * For detail page markdown rendering, we still want cleaned description
 * but keep markdown structure (headings, bullets, bold, links). This
 * version only strips HTML, not markdown.
 */
export function getCleanMarkdownForRender(raw: string | null | undefined): string {
  const cleaned = cleanDescription(raw)
  return cleaned
}
