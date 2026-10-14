export function isProviderResult(modelVersion:string):boolean {
 return modelVersion.includes(':') && !/^(?:regex|no-ai|failed|verifyJobReal)/i.test(modelVersion)
}
export function shouldDeferReverification(row:{status:string;completed_at?:string|null;last_attempt_at?:string|null;next_retry_at?:string|null},now=Date.now()):boolean {
 if(['pending','processing'].includes(row.status))return true
 if(row.next_retry_at && Date.parse(row.next_retry_at)>now)return true
 const last=row.last_attempt_at || row.completed_at
 return Boolean(last && Date.parse(last)>now-24*86400000)
}
export function retryOutcome(attempts:number,maxAttempts:number,now=Date.now()) {
 const exhausted=attempts>=maxAttempts
 return {status:exhausted?'failed':'pending',outcome:exhausted?'provider_failed':'retry_scheduled',completed_at:exhausted?new Date(now).toISOString():null,next_retry_at:exhausted?null:new Date(now+Math.min(6*3600000,60000*2**Math.min(attempts,8))).toISOString()}
}
