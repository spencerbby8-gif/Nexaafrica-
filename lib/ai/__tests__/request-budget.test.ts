import {describe,it,expect,vi,beforeEach} from 'vitest'
const fake=vi.hoisted(()=>({used:0,cap:1,outcomes:[] as string[]}))
vi.mock('@/lib/supabase/service',()=>({createServiceClient:()=>({rpc:async()=>fake.used++<fake.cap?{error:null}:{error:{message:'exhausted'}},from:()=>({update:(v:any)=>({eq:async()=>{fake.outcomes.push(v.outcome);return {error:null}}})})})}))
vi.mock('@/lib/ai/providers/dynamic-registry',()=>({getProvider:()=>({enabled:true,model:'test-model',envKey:'TEST_AI_KEY',timeoutMs:1000,costPer1kTokens:0}),getProviders:()=>[],refreshProviderRegistry:async()=>{}}))
import {withPilotBudget,reserveModelRequest} from '@/lib/ai/request-budget'
import {callProvider} from '@/lib/ai/gateway'
beforeEach(()=>{fake.used=0;fake.cap=1;fake.outcomes=[];vi.unstubAllGlobals();vi.stubEnv('TEST_AI_KEY','test-only-placeholder')})
describe('hard pilot request budget',()=>{
 it('refuses a second transport call once the reservation limit is reached',async()=>{
  const transport=vi.fn(async()=>({ok:true,json:async()=>({choices:[{message:{content:'{}'}}],usage:{prompt_tokens:1,completion_tokens:1}})}))
  vi.stubGlobal('fetch',transport)
  await withPilotBudget('run',async()=>{
    const d:any[]=[];await callProvider('mistral',{prompt:'test',agentId:'test',jobId:'job'},0,d)
    expect(d.filter(x=>x.event==='attempt')).toHaveLength(1)
    expect(d[0].requestId).toBeTruthy()
    await expect(callProvider('mistral',{prompt:'test',agentId:'test',jobId:'job'},1,[])).rejects.toThrow('budget')
  })
  expect(transport).toHaveBeenCalledTimes(1);expect(fake.outcomes).toEqual(['success'])
 })
 it('counts failed transports and does not allow calls without an authorized job',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>{throw new Error('offline')}))
  await withPilotBudget('run',async()=>{
    await expect(callProvider('mistral',{prompt:'test',agentId:'test',jobId:'job'},0,[])).rejects.toThrow('offline')
    await expect(reserveModelRequest({provider:'mistral',model:'x',agentId:'test'})).rejects.toThrow('budget')
  });expect(fake.outcomes).toEqual(['failure']);expect(fake.used).toBe(1)
 })
})
