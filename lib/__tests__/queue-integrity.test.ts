import {describe,it,expect} from 'vitest'
import {isProviderResult,shouldDeferReverification,retryOutcome} from '@/lib/ai/queue-policy'
import {pipelineState} from '@/lib/ai/pipelineState'
import fs from 'node:fs'
describe('truthful queue outcomes',()=>{
 it('never marks fallback or failed extraction as a provider result',()=>{
  for(const m of ['regex-extracted-1000bytes','no-ai-providers','failed-no-evidence','verifyJobReal-threw'])expect(isProviderResult(m)).toBe(false)
  expect(isProviderResult('mistral:codestral-2508')).toBe(true)
 })
 it('backs off failures and ends retries without a false completion',()=>{
  expect(retryOutcome(1,3,0)).toMatchObject({status:'pending',outcome:'retry_scheduled',completed_at:null})
  expect(retryOutcome(3,3,0)).toMatchObject({status:'failed',outcome:'provider_failed',next_retry_at:null})
 })
 it('does not requeue recently attempted stale intelligence',()=>{
  expect(shouldDeferReverification({status:'completed',last_attempt_at:new Date().toISOString()})).toBe(true)
  expect(shouldDeferReverification({status:'failed',last_attempt_at:'2020-01-01'})).toBe(false)
 })
 it('old AI never hides a current rejection or failure',()=>{
  expect(pipelineState({modelVersion:'mistral:model',queueStatus:'completed',queueError:'Rejected: US only'})).toBe('rejected')
  expect(pipelineState({modelVersion:'mistral:model',queueStatus:'failed'})).toBe('failed')
 })
 it('maintenance locks only selected rows and retains immutable before/after history',()=>{
  const sql=fs.readFileSync('supabase/migrations/20261014000200_ai_attempt_integrity.sql','utf8')
  expect(sql).toContain('FOR UPDATE OF q SKIP LOCKED');expect(sql).toContain("interval '24 hours'")
  expect(sql).toContain('to_jsonb(OLD)');expect(sql).toContain('requests_reserved<max_requests')
  expect(sql).not.toMatch(/DELETE FROM|DROP TABLE|TRUNCATE/i)
 })
})
