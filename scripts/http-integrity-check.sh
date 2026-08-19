#!/usr/bin/env bash
# HTTP 404 integrity regression — run against any deployed base URL.
# Usage: BASE_URL=https://preview.vercel.app bash scripts/http-integrity-check.sh
# Requires: RESTRICTED_SLUG + VALID_ROLE_SLUG env overrides or defaults below.
set -u
BASE="${BASE_URL:?set BASE_URL}"
RESTRICTED_SLUG="${RESTRICTED_SLUG:-solutions-engineer-french-notion-a14987}"
VALID_ROLE_SLUG="${VALID_ROLE_SLUG:-account-executive-large-enterprise-gartner-united-states}"
VALID_COMPANY="${VALID_COMPANY:-adaptive-teams}"
VALID_GUIDE="${VALID_GUIDE:-how-africans-get-remote-jobs}"
UA='Mozilla/5.0 (compatible; NexaIntegrityCheck/1.0)'
pass=0; fail=0

check() { # name expected_code url [must_not_contain] [must_contain]
  local name="$1" want="$2" url="$3" not_expect="${4:-}" expect="${5:-}"
  local body; body="$(mktemp)"
  local code; code=$(timeout 45 curl -s -A "$UA" -o "$body" -w '%{http_code}' "$url")
  local ok=1
  [ "$code" = "$want" ] || ok=0
  if [ -n "$not_expect" ] && grep -qi "$not_expect" "$body"; then ok=0; fi
  if [ -n "$expect" ] && ! grep -qi "$expect" "$body"; then ok=0; fi
  if [ $ok = 1 ]; then echo "PASS  $name ($code)"; pass=$((pass+1));
  else echo "FAIL  $name (got $code, want $want) $url"; fail=$((fail+1)); fi
  rm -f "$body"
}

check "valid role 200 + JobPosting"        200 "$BASE/role/$VALID_ROLE_SLUG"  '' 'JobPosting'
check "restricted role 404 + no leak"      404 "$BASE/role/$RESTRICTED_SLUG"  'gh_jid' 'Page not found'
check "nonexistent role 404"               404 "$BASE/role/zz-does-not-exist-$(date +%s)"
check "nonexistent company 404"            404 "$BASE/companies/zz-does-not-exist-$(date +%s)"
check "nonexistent guide 404"              404 "$BASE/guides/zz-does-not-exist-$(date +%s)"
check "nonexistent jobs hub path 404"      404 "$BASE/jobs/zz-no-category/worldwide"
check "valid company 200"                  200 "$BASE/companies/$VALID_COMPANY" '' 'organization'
check "valid guide 200"                    200 "$BASE/guides/$VALID_GUIDE"
check "homepage 200"                       200 "$BASE/" '' 'Nexa Intelligence'
check "jobs hub 200"                       200 "$BASE/jobs"

echo "----------------------------------------"
echo "pass=$pass fail=$fail"
[ $fail = 0 ]
