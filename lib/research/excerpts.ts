import type {CitableSource} from './contract'
/** Models select short retained excerpt IDs; the server supplies the quotation.
 * This removes transcription errors without accepting invented evidence. */
export function researchExcerptPacket(sources:CitableSource[]) {
 const packet=sources.filter(s=>s.status==='fetched').map((source,index)=>{
  const text=source.content.slice(0,11000),excerpts:{id:string;text:string}[]=[]
  let start=0
  while(start<text.length){let end=Math.min(start+160,text.length);if(end<text.length){const space=text.lastIndexOf(' ',end);if(space>start+70)end=space}const quote=text.slice(start,end).trim();if(quote.length>=12)excerpts.push({id:'E'+(excerpts.length+1),text:quote});start=end;while(text[start]===' ')start++}
  return {id:'S'+(index+1),record_id:source.id,url:source.url,kind:source.source_kind,published_at:source.published_at||null,retrieved_at:source.fetched_at,excerpts}
 })
 function resolve(raw:any):unknown {
  if(!raw||!Array.isArray(raw.paragraphs))return raw
  return {...raw,paragraphs:raw.paragraphs.map((paragraph:any)=>({...paragraph,citations:Array.isArray(paragraph.citations)?paragraph.citations.map((citation:any)=>{
   const source=packet.find(s=>s.id===citation.source_id||s.record_id===citation.source_id)
   const excerpt=source?.excerpts.find(e=>e.id===citation.excerpt_id)
   if(!source||!excerpt)throw new Error(`Unknown retained excerpt reference: ${citation.source_id}/${citation.excerpt_id}`)
   return {source_id:source.record_id,quote:excerpt.text}
  }):paragraph.citations}))}
 }
 return {packet,resolve}
}
