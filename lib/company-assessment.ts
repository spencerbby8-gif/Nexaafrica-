/** Listing-level extraction and recycled model scores are not employer verification. */
export function companyAssessment(row:{company_legitimacy?:string|null;company_evidence?:string|null}|null|undefined):{label:string;tone:'positive'|'caution'|'neutral';detail?:string}{
 if(!row?.company_evidence)return {label:'Company legitimacy unknown',tone:'neutral',detail:'No supported company evidence in this listing assessment. A separate documented investigation is required.'}
 if(row.company_legitimacy==='suspicious')return {label:'Company concern flagged by model',tone:'caution',detail:'A model signal requiring investigation, not a finding of fraud.'}
 if(['verified','likely_legit'].includes(row.company_legitimacy||''))return {label:'Company claims recorded',tone:'neutral',detail:'Listing-level model assessment only. This does not independently verify company identity, reputation or this vacancy.'}
 return {label:'Company legitimacy unknown',tone:'neutral'}
}
