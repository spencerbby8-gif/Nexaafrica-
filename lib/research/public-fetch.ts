import https from 'node:https'
import {lookup} from 'node:dns/promises'
import {isIP} from 'node:net'
import {createHash} from 'node:crypto'
import {parse} from 'node-html-parser'
export function isPublicAddress(address:string):boolean {
 if(isIP(address)===4){const [a,b]=address.split('.').map(Number);return !(a===0||a===10||a===127||a>=224||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&(b===168||b===0))||(a===100&&b>=64&&b<=127)||(a===198&&(b===18||b===19)))}
 return isIP(address)===6 && /^[23][0-9a-f]{3}:/i.test(address) && !address.toLowerCase().startsWith('2001:db8:')
}
export function researchURL(value:string):URL {
 const u=new URL(value)
 if(u.protocol!=='https:'||u.username||u.password||(u.port&&u.port!=='443')||isIP(u.hostname.replace(/^\[|\]$/g,'')))throw new Error('Unsafe research URL')
 return u
}
async function request(url:URL):Promise<{status:number;headers:any;body:string}> {
 const addresses=await lookup(url.hostname,{all:true})
 if(!addresses.length||addresses.some(a=>!isPublicAddress(a.address)))throw new Error('Non-public research host')
 return new Promise((resolve,reject)=>{
  const req=https.request(url,{method:'GET',headers:{'User-Agent':'NexaResearch/1.0 public-source verification','Accept':'text/html,application/json,text/plain'},lookup:((_host:any,options:any,cb:any)=>options?.all?cb(null,addresses):cb(null,addresses[0].address,addresses[0].family)) as any},res=>{
   const chunks:Buffer[]=[];let bytes=0
   res.on('data',(chunk:Buffer)=>{bytes+=chunk.length;if(bytes>2_000_000){req.destroy(new Error('Source exceeds size limit'));return}chunks.push(chunk)})
   res.on('end',()=>resolve({status:res.statusCode||0,headers:res.headers,body:Buffer.concat(chunks).toString('utf8')}))
   res.on('error',reject)
  })
  req.setTimeout(12000,()=>req.destroy(new Error('Research fetch timeout')));req.on('error',reject);req.end()
 })
}
export async function fetchResearchSource(input:{url:string;kind:string}) {
 let url=researchURL(input.url)
 try {
  for(let redirect=0;redirect<4;redirect++){
   const response=await request(url)
   if(response.status>=300&&response.status<400&&response.headers.location){url=researchURL(new URL(response.headers.location,url).toString());continue}
   const root=parse(response.body)
   const title=(root.querySelector('title')?.text || '').trim().slice(0,300)
   const published=root.querySelector('meta[property="article:published_time"]')?.getAttribute('content') || root.querySelector('time[datetime]')?.getAttribute('datetime') || null
   root.querySelectorAll('script,style,noscript,nav,footer,header').forEach(el=>el.remove())
   const text=(root.querySelector('main') || root.querySelector('body') || root).text.replace(/\s+/g,' ').trim().slice(0,50000)
   const blocked=[401,403,429].includes(response.status)||/^(?:just a moment|access denied|attention required)/i.test(title)
   const status=blocked?'blocked':response.status===200&&text.length>=80?'fetched':'failed'
   return {url:input.url,final_url:url.toString(),source_kind:input.kind,title,published_at:published,http_status:response.status,status,content:status==='fetched'?text:'',content_hash:status==='fetched'?createHash('sha256').update(text).digest('hex'):null,error_type:null}
  }
  throw new Error('Too many source redirects')
 } catch(e){return {url:input.url,final_url:url.toString(),source_kind:input.kind,title:null,published_at:null,http_status:null,status:'failed',content:'',content_hash:null,error_type:e instanceof Error?e.message.slice(0,80):'Fetch error'}}
}
