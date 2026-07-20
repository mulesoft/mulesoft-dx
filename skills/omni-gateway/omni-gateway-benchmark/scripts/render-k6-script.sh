#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "usage: $0 <output-path>" >&2
  exit 2
fi
out="$1"

cat > "$out" <<'JS'
import http from 'k6/http';
import { check } from 'k6';

function intEnv(name) {
  const n = parseInt(__ENV[name], 10);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`env ${name} must be a positive integer, got: ${JSON.stringify(__ENV[name])}`);
  }
  return n;
}
function strEnv(name) {
  const v = __ENV[name];
  if (!v) throw new Error(`env ${name} is required`);
  return v;
}

const N_APIS = intEnv('N_APIS');
const BASE   = strEnv('FLEX_URL');
const CID    = __ENV.CLIENT_ID || '';
const CSEC   = __ENV.CLIENT_SECRET || '';

export const options = {
  scenarios: {
    constant_load: {
      executor: 'constant-arrival-rate',
      rate: intEnv('RPS'),
      timeUnit: '1s',
      duration: strEnv('DURATION'),
      preAllocatedVUs: intEnv('VUS'),
      maxVUs: intEnv('VUS') * 2,
    },
  },
  thresholds: {
    http_req_failed:   ['rate<0.01'],
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
  },
};

export default function () {
  const i = (__VU + __ITER) % N_APIS + 1;
  const res = http.get(`${BASE}/api-${i}/echo`, {
    headers: { client_id: CID, client_secret: CSEC },
  });
  check(res, { 'status 200': r => r.status === 200 });
}
JS

# Example output (a static k6 script — env vars are read at k6 runtime, not
# render time, so the file is identical regardless of N_APIS/RPS/etc.):
#
#   import http from 'k6/http';
#   import { check } from 'k6';
#
#   function intEnv(name) { ... throws on missing/non-numeric ... }
#   function strEnv(name) { ... throws on missing ... }
#
#   const N_APIS = intEnv('N_APIS');
#   const BASE   = strEnv('FLEX_URL');
#   const CID    = __ENV.CLIENT_ID || '';
#   const CSEC   = __ENV.CLIENT_SECRET || '';
#
#   export const options = {
#     scenarios: {
#       constant_load: {
#         executor: 'constant-arrival-rate',
#         rate: intEnv('RPS'),       // e.g. 1000 req/s
#         timeUnit: '1s',
#         duration: strEnv('DURATION'), // e.g. '2m'
#         preAllocatedVUs: intEnv('VUS'),
#         maxVUs: intEnv('VUS') * 2,
#       },
#     },
#     thresholds: {
#       http_req_failed:   ['rate<0.01'],
#       http_req_duration: ['p(95)<500', 'p(99)<1000'],
#     },
#   };
#
#   export default function () {
#     const i = (__VU + __ITER) % N_APIS + 1;
#     const res = http.get(`${BASE}/api-${i}/echo`, {
#       headers: { client_id: CID, client_secret: CSEC },
#     });
#     check(res, { 'status 200': r => r.status === 200 });
#   }
