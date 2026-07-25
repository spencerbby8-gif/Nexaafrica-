import type { Job } from "@/lib/types"
export async function verifyFreshnessReal(job: Job) {
  const now = Date.now()
  const postedAt = job.posted_at ? new Date(job.posted_at).getTime() : null
  const lastSeenRaw = (job as any).last_seen_at || job.created_at
  const lastSeen = lastSeenRaw ? new Date(lastSeenRaw).getTime() : now
  const expiresAt = job.expires_at ? new Date(job.expires_at).getTime() : null
  let status: "active"|"expired"|"stale"|"ghost"|"unknown" = "unknown"
  let confidence=30
  let evidence=""
  if(expiresAt && expiresAt < now){status="expired"; confidence=90; evidence=`Expires at ${job.expires_at} in past`}
  else if(postedAt){
    const ageDays=(now-postedAt)/(1000*60*60*24)
    if(ageDays>90){status="stale"; confidence=80; evidence=`Posted ${Math.floor(ageDays)}d ago (>90d)`}
    else if(ageDays>60){status="stale"; confidence=60; evidence=`Posted ${Math.floor(ageDays)}d ago`}
    else{status="active"; confidence=85; evidence=`Posted ${Math.floor(ageDays)}d ago, fresh`}
  } else {status="unknown"; confidence=20; evidence="No posted_at"}
  const lastSeenAgeDays=(now-lastSeen)/(1000*60*60*24)
  if(lastSeenAgeDays>14 && status==="active"){status="ghost"; confidence=70; evidence+=`; Not seen in feed for ${Math.floor(lastSeenAgeDays)}d, may be ghost`}
  return {status,confidence,evidence,lastSeenAgeDays:Math.floor(lastSeenAgeDays),postedAgeDays:postedAt?Math.floor((now-postedAt)/(1000*60*60*24)):null,sourceUrls:[job.apply_url],lastVerified:new Date().toISOString(),modelVersion:"rule-based-v1"}
}
