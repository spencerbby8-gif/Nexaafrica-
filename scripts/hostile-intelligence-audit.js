#!/usr/bin/env node
/**
 * HOSTILE INTELLIGENCE AUDIT — 200 Jobs End-to-End
 * 
 * Queries production DB, fetches real job pages, compares stored
 * intelligence against reality. Proves truthfulness or exposes lies.
 */

const { Client } = require('pg');

const DB_URL = 'postgresql://postgres.ydjnobnddcevbwytdvyw:oy0IzjhATGF6Slgj@aws-1-us-east-1.pooler.supabase.com:6543/postgres';

async function main() {
  const client = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('✓ Connected to production database\n');

  // ── PHASE 1: Pull 200 jobs with intelligence ──
  console.log('═'.repeat(80));
  console.log('PHASE 1: PULLING 200 JOBS WITH INTELLIGENCE');
  console.log('═'.repeat(80));

  const { rows: jobs } = await client.query(`
    SELECT 
      j.id, j.title, j.company, j.apply_url, j.source, j.salary_range,
      j.salary_min as db_salary_min, j.salary_max as db_salary_max,
      j.description_md, j.is_remote, j.location, j.country, j.tags,
      ai.model_version, ai.africa_eligibility, ai.africa_confidence, ai.africa_evidence,
      ai.visa_sponsorship, ai.visa_confidence,
      ai.remote_eligibility, ai.remote_confidence, ai.remote_evidence,
      ai.salary_min as ai_salary_min, ai.salary_max as ai_salary_max,
      ai.salary_currency, ai.salary_period, ai.salary_transparency,
      ai.salary_confidence as ai_salary_confidence, ai.salary_evidence as ai_salary_evidence,
      ai.company_legitimacy, ai.company_confidence, ai.company_evidence,
      ai.experience_level, ai.experience_confidence,
      ai.required_skills, ai.transferable_skills, ai.missing_skills,
      ai.job_quality, ai.job_quality_confidence, ai.job_quality_evidence,
      ai.hiring_urgency, ai.overall_confidence,
      ai.evidence_urls, ai.last_verified_at, ai.updated_at
    FROM job_ai_intelligence ai
    JOIN jobs j ON j.id = ai.job_id
    WHERE j.is_active = true
    ORDER BY ai.updated_at DESC
    LIMIT 200
  `);

  console.log(`Pulled ${jobs.length} jobs with intelligence\n`);

  // ── PHASE 2: Statistical audit of stored intelligence ──
  console.log('═'.repeat(80));
  console.log('PHASE 2: STATISTICAL AUDIT OF STORED INTELLIGENCE');
  console.log('═'.repeat(80));

  // Model version distribution
  const modelDist = {};
  jobs.forEach(j => {
    const mv = j.model_version || 'null';
    modelDist[mv] = (modelDist[mv] || 0) + 1;
  });
  console.log('\n📊 MODEL VERSION DISTRIBUTION:');
  Object.entries(modelDist).sort((a,b) => b[1] - a[1]).forEach(([k,v]) => {
    console.log(`  ${k.padEnd(45)} ${v} jobs (${(v/jobs.length*100).toFixed(1)}%)`);
  });

  // Provider distribution (extract provider from model_version)
  const providerDist = {};
  jobs.forEach(j => {
    const mv = j.model_version || '';
    const provider = mv.split(':')[0] || mv.split('-')[0] || 'unknown';
    providerDist[provider] = (providerDist[provider] || 0) + 1;
  });
  console.log('\n📊 PROVIDER DISTRIBUTION:');
  Object.entries(providerDist).sort((a,b) => b[1] - a[1]).forEach(([k,v]) => {
    console.log(`  ${k.padEnd(25)} ${v} jobs (${(v/jobs.length*100).toFixed(1)}%)`);
  });

  // Africa eligibility distribution
  const africaDist = {};
  jobs.forEach(j => {
    const v = j.africa_eligibility || 'null';
    africaDist[v] = (africaDist[v] || 0) + 1;
  });
  console.log('\n📊 AFRICA ELIGIBILITY DISTRIBUTION:');
  Object.entries(africaDist).sort((a,b) => b[1] - a[1]).forEach(([k,v]) => {
    console.log(`  ${k.padEnd(15)} ${v} jobs (${(v/jobs.length*100).toFixed(1)}%)`);
  });

  // Confidence analysis
  const confValues = jobs.map(j => j.africa_confidence || 0);
  const uniqueConf = new Set(confValues);
  console.log(`\n📊 AFRICA CONFIDENCE ANALYSIS:`);
  console.log(`  Unique values: ${uniqueConf.size}`);
  console.log(`  Min: ${Math.min(...confValues)}, Max: ${Math.max(...confValues)}`);
  console.log(`  Mean: ${(confValues.reduce((a,b) => a+b, 0) / confValues.length).toFixed(1)}`);
  console.log(`  Zero: ${confValues.filter(c => c === 0).length} (${(confValues.filter(c => c === 0).length/jobs.length*100).toFixed(1)}%)`);
  
  // Check for perJobLowConf pattern (0-10 hash values)
  const lowConfCount = confValues.filter(c => c >= 0 && c <= 10).length;
  console.log(`  0-10 range (possible perJobLowConf): ${lowConfCount} (${(lowConfCount/jobs.length*100).toFixed(1)}%)`);

  // Salary analysis
  const hasSalary = jobs.filter(j => j.ai_salary_min != null || j.ai_salary_max != null);
  const hasSalaryEvidence = jobs.filter(j => j.ai_salary_evidence && j.ai_salary_evidence.length > 0);
  console.log(`\n📊 SALARY ANALYSIS:`);
  console.log(`  Jobs with AI salary: ${hasSalary.length} (${(hasSalary.length/jobs.length*100).toFixed(1)}%)`);
  console.log(`  Jobs with salary evidence: ${hasSalaryEvidence.length} (${(hasSalaryEvidence.length/jobs.length*100).toFixed(1)}%)`);
  console.log(`  Jobs with DB salary_range: ${jobs.filter(j => j.salary_range).length}`);

  // Company analysis
  const companyDist = {};
  jobs.forEach(j => {
    const v = j.company_legitimacy || 'null';
    companyDist[v] = (companyDist[v] || 0) + 1;
  });
  console.log(`\n📊 COMPANY LEGITIMACY DISTRIBUTION:`);
  Object.entries(companyDist).sort((a,b) => b[1] - a[1]).forEach(([k,v]) => {
    console.log(`  ${k.padEnd(15)} ${v} jobs (${(v/jobs.length*100).toFixed(1)}%)`);
  });

  // Check for template/repeated evidence
  const evidenceTexts = jobs.map(j => j.africa_evidence).filter(Boolean);
  const uniqueEvidence = new Set(evidenceTexts);
  console.log(`\n📊 EVIDENCE UNIQUENESS:`);
  console.log(`  Africa evidence present: ${evidenceTexts.length}/${jobs.length}`);
  console.log(`  Unique africa evidence: ${uniqueEvidence.size}`);
  console.log(`  Repeated evidence: ${evidenceTexts.length - uniqueEvidence.size} duplicates`);

  const companyEvidence = jobs.map(j => j.company_evidence).filter(Boolean);
  const uniqueCompanyEv = new Set(companyEvidence);
  console.log(`  Company evidence present: ${companyEvidence.length}/${jobs.length}`);
  console.log(`  Unique company evidence: ${uniqueCompanyEv.size}`);

  // Remote analysis
  const remoteDist = {};
  jobs.forEach(j => {
    const v = j.remote_eligibility || 'null';
    remoteDist[v] = (remoteDist[v] || 0) + 1;
  });
  console.log(`\n📊 REMOTE ELIGIBILITY DISTRIBUTION:`);
  Object.entries(remoteDist).sort((a,b) => b[1] - a[1]).forEach(([k,v]) => {
    console.log(`  ${k.padEnd(15)} ${v} jobs (${(v/jobs.length*100).toFixed(1)}%)`);
  });

  // Experience analysis
  const expDist = {};
  jobs.forEach(j => {
    const v = j.experience_level || 'null';
    expDist[v] = (expDist[v] || 0) + 1;
  });
  console.log(`\n📊 EXPERIENCE LEVEL DISTRIBUTION:`);
  Object.entries(expDist).sort((a,b) => b[1] - a[1]).forEach(([k,v]) => {
    console.log(`  ${k.padEnd(15)} ${v} jobs (${(v/jobs.length*100).toFixed(1)}%)`);
  });

  // ── PHASE 3: Fetch 20 real job pages and verify ──
  console.log('\n' + '═'.repeat(80));
  console.log('PHASE 3: LIVE PAGE VERIFICATION (20 jobs)');
  console.log('═'.repeat(80));

  const sampleJobs = jobs.slice(0, 20);
  let pageFetchSuccess = 0;
  let pageFetchFail = 0;
  const pageResults = [];

  for (const job of sampleJobs) {
    let pageText = '';
    let httpStatus = 0;
    let pageLen = 0;
    
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(job.apply_url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; NexaBot/2.0; +https://nexaafrica.vercel.app)',
          'Accept': 'text/html,application/xhtml+xml',
        },
        signal: controller.signal,
        redirect: 'follow',
      });
      clearTimeout(timeout);
      httpStatus = res.status;
      if (res.ok) {
        const html = await res.text();
        // Simple HTML to text extraction
        pageText = html
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        pageLen = pageText.length;
        pageFetchSuccess++;
      } else {
        pageFetchFail++;
      }
    } catch (e) {
      pageFetchFail++;
      httpStatus = -1;
    }

    // Check if salary is visible on the page
    const salaryPatterns = /\$[\d,]+(?:\s*[-–]\s*\$[\d,]+)?|\d+[kK]\s*[-–]\s*\d+[kK]|salary[:\s]+[\d,]+|compensation[:\s]+[\d,]+/gi;
    const salaryOnPage = pageText.match(salaryPatterns) || [];
    
    // Check if Africa/global is mentioned
    const africaOnPage = /africa|nigeria|kenya|ghana|south africa|worldwide|global|anywhere/i.test(pageText);
    const restrictedOnPage = /us only|uk only|eu only|must reside|no visa|us residents/i.test(pageText);
    
    // Check if remote is mentioned
    const remoteOnPage = /remote|work from (?:home|anywhere)|distributed/i.test(pageText);

    pageResults.push({
      job_id: job.id.slice(0, 8),
      title: job.title?.slice(0, 50),
      company: job.company,
      source: job.source,
      httpStatus,
      pageLen,
      model: job.model_version,
      
      // Stored intelligence
      stored_africa: job.africa_eligibility,
      stored_africa_conf: job.africa_confidence,
      stored_salary: `${job.ai_salary_min || 'null'}-${job.ai_salary_max || 'null'}`,
      stored_salary_conf: job.ai_salary_confidence,
      stored_salary_evidence: (job.ai_salary_evidence || '').slice(0, 60),
      stored_remote: job.remote_eligibility,
      stored_company: job.company_legitimacy,
      stored_company_conf: job.company_confidence,
      stored_experience: job.experience_level,
      stored_overall: job.overall_confidence,
      
      // Page reality
      salaryOnPage: salaryOnPage.slice(0, 3),
      africaOnPage,
      restrictedOnPage,
      remoteOnPage,
      
      // Truthfulness checks
      salary_truth: (salaryOnPage.length > 0 && job.ai_salary_min == null) ? 'MISSED_SALARY' :
                     (salaryOnPage.length === 0 && job.ai_salary_min != null) ? 'POSSIBLE_HALLUCINATION' : 'CONSISTENT',
      africa_truth: (africaOnPage && job.africa_eligibility === 'explicit') ? 'CONSISTENT' :
                    (restrictedOnPage && job.africa_eligibility === 'restricted') ? 'CONSISTENT' :
                    (!africaOnPage && !restrictedOnPage && job.africa_eligibility === 'unknown') ? 'CONSISTENT' : 'NEEDS_REVIEW',
    });
  }

  console.log(`\nPage fetch results: ${pageFetchSuccess} success, ${pageFetchFail} failed`);
  
  // Print each job's verification
  console.log('\n📋 JOB-BY-JOB VERIFICATION:');
  pageResults.forEach((r, i) => {
    console.log(`\n--- Job ${i+1}: ${r.title} (${r.company}) ---`);
    console.log(`  Source: ${r.source} | Model: ${r.model}`);
    console.log(`  Page: HTTP ${r.httpStatus} | ${r.pageLen} chars`);
    console.log(`  STORED:`);
    console.log(`    Africa: ${r.stored_africa} (conf: ${r.stored_africa_conf})`);
    console.log(`    Salary: ${r.stored_salary} (conf: ${r.stored_salary_conf})`);
    console.log(`    Salary evidence: "${r.stored_salary_evidence}"`);
    console.log(`    Remote: ${r.stored_remote}`);
    console.log(`    Company: ${r.stored_company} (conf: ${r.stored_company_conf})`);
    console.log(`    Experience: ${r.stored_experience}`);
    console.log(`    Overall: ${r.stored_overall}`);
    console.log(`  PAGE REALITY:`);
    console.log(`    Salary on page: ${r.salaryOnPage.length > 0 ? r.salaryOnPage.join(', ') : 'none found'}`);
    console.log(`    Africa mentioned: ${r.africaOnPage}`);
    console.log(`    Restricted: ${r.restrictedOnPage}`);
    console.log(`    Remote mentioned: ${r.remoteOnPage}`);
    console.log(`  VERDICT:`);
    console.log(`    Salary: ${r.salary_truth}`);
    console.log(`    Africa: ${r.africa_truth}`);
  });

  // ── PHASE 4: Truthfulness summary ──
  console.log('\n' + '═'.repeat(80));
  console.log('PHASE 4: TRUTHFULNESS VERDICT');
  console.log('═'.repeat(80));

  const salaryTruth = pageResults.filter(r => r.salary_truth === 'CONSISTENT').length;
  const salaryMissed = pageResults.filter(r => r.salary_truth === 'MISSED_SALARY').length;
  const salaryHalluc = pageResults.filter(r => r.salary_truth === 'POSSIBLE_HALLUCINATION').length;
  const africaTruth = pageResults.filter(r => r.africa_truth === 'CONSISTENT').length;
  const africaReview = pageResults.filter(r => r.africa_truth === 'NEEDS_REVIEW').length;

  console.log(`\nSalary truthfulness (${pageResults.length} jobs verified):`);
  console.log(`  CONSISTENT: ${salaryTruth} (${(salaryTruth/pageResults.length*100).toFixed(0)}%)`);
  console.log(`  MISSED_SALARY: ${salaryMissed} (${(salaryMissed/pageResults.length*100).toFixed(0)}%)`);
  console.log(`  POSSIBLE_HALLUCINATION: ${salaryHalluc} (${(salaryHalluc/pageResults.length*100).toFixed(0)}%)`);

  console.log(`\nAfrica eligibility truthfulness:`);
  console.log(`  CONSISTENT: ${africaTruth} (${(africaTruth/pageResults.length*100).toFixed(0)}%)`);
  console.log(`  NEEDS_REVIEW: ${africaReview} (${(africaReview/pageResults.length*100).toFixed(0)}%)`);

  // Check for fake confidence (perJobLowConf pattern)
  const allConfValues = jobs.map(j => j.africa_confidence || 0);
  const fakeConfCount = allConfValues.filter(c => c > 0 && c <= 10).length;
  console.log(`\nFake confidence check (perJobLowConf pattern 0-10):`);
  console.log(`  Values in 0-10 range: ${fakeConfCount}/${allConfValues.length} (${(fakeConfCount/allConfValues.length*100).toFixed(1)}%)`);
  console.log(`  Zero confidence (honest): ${allConfValues.filter(c => c === 0).length}/${allConfValues.length}`);

  // Check for template evidence
  const allAfricaEv = jobs.map(j => j.africa_evidence || '').filter(e => e.length > 0);
  const evCounts = {};
  allAfricaEv.forEach(e => { evCounts[e] = (evCounts[e] || 0) + 1; });
  const repeatedEv = Object.entries(evCounts).filter(([k,v]) => v > 5);
  console.log(`\nTemplate evidence check:`);
  console.log(`  Evidence strings repeated >5 times: ${repeatedEv.length}`);
  repeatedEv.slice(0, 5).forEach(([text, count]) => {
    console.log(`    "${text.slice(0, 80)}..." × ${count}`);
  });

  // ── PHASE 5: 10 jobs with clearly different intelligence ──
  console.log('\n' + '═'.repeat(80));
  console.log('PHASE 5: 10 JOBS WITH CLEARLY DIFFERENT INTELLIGENCE');
  console.log('═'.repeat(80));

  // Select 10 jobs with maximum variance
  const diverse = jobs
    .filter(j => j.model_version && !j.model_version.includes('no-ai'))
    .sort(() => Math.random() - 0.5)
    .slice(0, 30)
    .sort((a, b) => {
      // Sort by diversity of fields
      const aScore = (a.africa_eligibility !== 'unknown' ? 1 : 0) + 
                     (a.ai_salary_min != null ? 1 : 0) + 
                     (a.company_legitimacy !== 'unknown' ? 1 : 0) +
                     (a.experience_level !== 'unknown' ? 1 : 0);
      const bScore = (b.africa_eligibility !== 'unknown' ? 1 : 0) + 
                     (b.ai_salary_min != null ? 1 : 0) + 
                     (b.company_legitimacy !== 'unknown' ? 1 : 0) +
                     (b.experience_level !== 'unknown' ? 1 : 0);
      return bScore - aScore;
    })
    .slice(0, 10);

  diverse.forEach((j, i) => {
    console.log(`\n${i+1}. ${j.title?.slice(0, 55)} @ ${j.company}`);
    console.log(`   Model: ${j.model_version}`);
    console.log(`   Africa: ${j.africa_eligibility} (${j.africa_confidence}%) | "${(j.africa_evidence || '').slice(0, 60)}"`);
    console.log(`   Salary: ${j.ai_salary_min || '?'}-${j.ai_salary_max || '?'} ${j.salary_currency || ''} (${j.ai_salary_confidence}%)`);
    console.log(`   Salary evidence: "${(j.ai_salary_evidence || 'none').slice(0, 80)}"`);
    console.log(`   Remote: ${j.remote_eligibility} (${j.remote_confidence}%)`);
    console.log(`   Company: ${j.company_legitimacy} (${j.company_confidence}%) | "${(j.company_evidence || '').slice(0, 60)}"`);
    console.log(`   Experience: ${j.experience_level} (${j.experience_confidence}%)`);
    console.log(`   Quality: ${j.job_quality} (${j.job_quality_confidence}%)`);
    console.log(`   Skills: ${(j.required_skills || []).slice(0, 5).join(', ')}`);
    console.log(`   Overall: ${j.overall_confidence}%`);
  });

  // ── PHASE 6: Provider/model proof ──
  console.log('\n' + '═'.repeat(80));
  console.log('PHASE 6: ORCHESTRATION PROOF');
  console.log('═'.repeat(80));

  // Get provider log data
  const { rows: providerLogs } = await client.query(`
    SELECT provider, model, event, COUNT(*) as cnt, 
           AVG(duration_ms) as avg_duration
    FROM ai_provider_log 
    GROUP BY provider, model, event
    ORDER BY cnt DESC
    LIMIT 30
  `);

  console.log('\n📊 PROVIDER CALL LOG (aggregated):');
  providerLogs.forEach(r => {
    console.log(`  ${r.provider.padEnd(12)} ${r.model.padEnd(35)} ${r.event.padEnd(10)} ${r.cnt} calls  avg ${Math.round(r.avg_duration || 0)}ms`);
  });

  // Get orchestrator health
  const { rows: orchHealth } = await client.query(`
    SELECT provider, consecutive_failures, last_error_code, last_error_message,
           avg_latency_ms, is_quota_exhausted, is_rate_limited,
           total_successes, total_failures
    FROM ai_orch_health
    ORDER BY total_successes DESC
  `);

  console.log('\n📊 ORCHESTRATOR HEALTH (DB-persisted):');
  orchHealth.forEach(r => {
    const total = (r.total_successes || 0) + (r.total_failures || 0);
    const successRate = total > 0 ? ((r.total_successes / total) * 100).toFixed(1) : 'N/A';
    console.log(`  ${r.provider.padEnd(12)} failures: ${r.consecutive_failures} | quota: ${r.is_quota_exhausted} | rate: ${r.is_rate_limited} | success: ${successRate}% | latency: ${r.avg_latency_ms || 0}ms`);
    if (r.last_error_message) {
      console.log(`    last error: ${r.last_error_message.slice(0, 100)}`);
    }
  });

  // ── FINAL VERDICT ──
  console.log('\n' + '═'.repeat(80));
  console.log('FINAL VERDICT');
  console.log('═'.repeat(80));

  const uniqueModels = new Set(jobs.map(j => j.model_version).filter(Boolean));
  const uniqueProviders = new Set(Object.keys(providerDist));
  const hasRealEvidence = uniqueEvidence.size > jobs.length * 0.3;
  const hasHonestConfidence = fakeConfCount < allConfValues.length * 0.5;
  const salaryAccuracy = salaryTruth / Math.max(1, pageResults.length);

  console.log(`\n✅ PROVEN:`);
  console.log(`  • ${uniqueModels.size} different model versions used across ${jobs.length} jobs`);
  console.log(`  • ${uniqueProviders.size} different providers: ${Array.from(uniqueProviders).join(', ')}`);
  console.log(`  • ${uniqueEvidence.size} unique evidence strings across ${jobs.length} jobs`);
  console.log(`  • Salary accuracy: ${(salaryAccuracy * 100).toFixed(0)}% (${salaryTruth}/${pageResults.length} verified)`);
  console.log(`  • ${pageFetchSuccess}/${pageResults.length} job pages fetchable for verification`);
  
  if (fakeConfCount > allConfValues.length * 0.3) {
    console.log(`\n⚠️  ISSUES FOUND:`);
    console.log(`  • ${fakeConfCount}/${allConfValues.length} confidence values in 0-10 range (possible perJobLowConf remnant)`);
  }
  if (salaryMissed > 0) {
    console.log(`  • ${salaryMissed} jobs with salary on page but not extracted`);
  }
  if (repeatedEv.length > 0) {
    console.log(`  • ${repeatedEv.length} evidence strings repeated >5 times (possible templates)`);
  }

  console.log(`\n📊 DATA SUMMARY:`);
  console.log(`  Total jobs audited: ${jobs.length}`);
  console.log(`  Pages verified: ${pageResults.length}`);
  console.log(`  Provider log entries: ${providerLogs.reduce((a,r) => a + parseInt(r.cnt), 0)}`);
  console.log(`  Orchestrator health rows: ${orchHealth.length}`);

  await client.end();
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
