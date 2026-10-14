import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
const context = new AsyncLocalStorage<{runId:string}>()
export class PilotBudgetError extends Error { constructor() {super('Pilot request budget unavailable or exhausted');this.name='PilotBudgetError'} }
export function withPilotBudget<T>(runId:string,work:()=>Promise<T>):Promise<T> {return context.run({runId},work)}
export async function reserveModelRequest(input:{jobId?:string;provider:string;model:string;agentId:string}) {
 const id=randomUUID(),runId=context.getStore()?.runId
 if(!runId)return {id,runId:null}
 if(!input.jobId)throw new PilotBudgetError()
 const {createServiceClient}=await import('@/lib/supabase/service')
 const {error}=await createServiceClient().rpc('reserve_pilot_request',{p_run_id:runId,p_request_id:id,p_job_id:input.jobId,p_provider:input.provider,p_model:input.model,p_agent_id:input.agentId})
 if(error)throw new PilotBudgetError()
 return {id,runId}
}
export async function finishModelRequest(reservation:{id:string;runId:string|null},outcome:'success'|'failure',errorType?:string) {
 if(!reservation.runId)return
 const {createServiceClient}=await import('@/lib/supabase/service')
 const {error}=await createServiceClient().from('ai_model_requests').update({outcome,finished_at:new Date().toISOString(),error_type:errorType||null}).eq('id',reservation.id)
 if(error)console.error(JSON.stringify({scope:'request_ledger',event:'outcome_write_failed',requestId:reservation.id}))
 // Reservation remains counted even when outcome recording fails.
}
