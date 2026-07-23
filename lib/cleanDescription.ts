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
  let decoded = decodeEntities(raw)
  // Strip HTML properly
  let cleaned = stripHtmlProper(decoded)
  // Second decode in case nested encoding &amp;lt;
  cleaned = decodeEntities(cleaned)
  // Cleanup whitespace
  return cleaned
    .replace(/\u0000/g, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function generateExcerpt(raw: string | null | undefined, minLen = 180, maxLen = 250): string {
  const cleaned = cleanDescription(raw)
  if (!cleaned) return ''
  let text = cleaned.replace(/\s+/g, ' ').trim()
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

// For job cards specifically — ensure 180-250 chars, clean, no HTML
export function getJobCardExcerpt(descriptionMd: string | null | undefined): string {
  return generateExcerpt(descriptionMd, 180, 250)
}
