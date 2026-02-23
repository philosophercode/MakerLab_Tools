#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"
pass(){ echo "[PASS] $1"; }
fail(){ echo "[FAIL] $1"; exit 1; }

code=$(curl -s -o /tmp/smoke_home.out -w "%{http_code}" "$BASE_URL/")
[[ "$code" == "200" ]] && pass "Home page reachable" || fail "Home page expected 200 got $code"

code=$(curl -s -o /tmp/smoke_imgsearch.out -w "%{http_code}" "$BASE_URL/api/image-search?q=drill")
[[ "$code" == "200" ]] && pass "image-search basic request" || fail "image-search expected 200 got $code"

# Rate limit check: 15/min configured; by 16th request we expect at least one 429.
rl_hit=0
for i in $(seq 1 16); do
  code=$(curl -s -o /tmp/smoke_rl_$i.out -w "%{http_code}" "$BASE_URL/api/image-search?q=drill")
  if [[ "$code" == "429" ]]; then
    rl_hit=1
    break
  fi
done
[[ "$rl_hit" == "1" ]] && pass "image-search rate limit enforced" || fail "image-search did not return 429 within limit window"

code=$(curl -s -o /tmp/smoke_ssrf.out -w "%{http_code}" \
  -X POST "$BASE_URL/api/image" \
  -H 'Content-Type: application/json' \
  -d '{"toolName":"Form 2","action":"replace-from-url","sourceUrl":"https://localhost/test.png"}')
[[ "$code" == "400" ]] && pass "SSRF guard blocks localhost source URL" || fail "SSRF guard expected 400 got $code"

# Chat payload guard
big=$(python3 - <<'PY'
print('a'*60000)
PY
)
code=$(curl -s -o /tmp/smoke_chat_big.out -w "%{http_code}" \
  -X POST "$BASE_URL/api/chat" \
  -H 'Content-Type: application/json' \
  --data-binary "{\"messages\":[{\"id\":\"1\",\"role\":\"user\",\"parts\":[{\"type\":\"text\",\"text\":\"$big\"}]}]}" )
[[ "$code" == "413" ]] && pass "chat payload size cap enforced" || fail "chat payload cap expected 413 got $code"

code=$(curl -s -o /tmp/smoke_mcp.out -w "%{http_code}" -X POST "$BASE_URL/api/mcp" -H 'Content-Type: application/json' -d '{}')
if [[ "$code" == "401" || "$code" == "503" ]]; then
  pass "MCP auth/config gate active ($code)"
else
  fail "MCP expected 401 or 503, got $code"
fi

echo "All smoke checks passed against $BASE_URL"
