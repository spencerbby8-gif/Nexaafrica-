import {describe,it,expect} from 'vitest'
import {companyAssessment} from '@/lib/company-assessment'
import {reconciledCompany} from '@/components/opportunity-intelligence'
describe('company assessments do not manufacture identity verification',()=>{
 it('does not turn repeated model scores into an established employer',()=>{
  const result=reconciledCompany({company_legitimacy:'unknown',company_evidence:null} as any,{total_jobs:500,scam_reports:0,trust_avg:99,verification_rate:1},true)
  expect(result.label).toBe('Company legitimacy unknown');expect(result.tone).toBe('neutral')
 })
 it('does not accept a legacy verified flag without evidence',()=>{
  expect(companyAssessment({company_legitimacy:'verified'}).label).toBe('Company legitimacy unknown')
 })
 it('describes supported extraction as claims, not independent verification',()=>{
  expect(companyAssessment({company_legitimacy:'verified',company_evidence:'A statement on a company website.'})).toMatchObject({label:'Company claims recorded',tone:'neutral'})
 })
})
