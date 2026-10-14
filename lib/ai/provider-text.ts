/** Providers may return JSON objects or content blocks instead of a text string. */
export function normalizeProviderText(value:unknown):string {
 if(typeof value==='string'&&value.trim())return value
 if(Array.isArray(value)){
  const text=value.map(v=>v&&typeof v==='object'&&typeof v.text==='string'?v.text:'').filter(Boolean).join('\n')
  if(text.trim())return text
 }
 if(value&&typeof value==='object'&&!Array.isArray(value))return JSON.stringify(value)
 throw new Error('Empty or unsupported provider response')
}
