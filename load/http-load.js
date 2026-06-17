// k6 HTTP load test for the REST API.
//   Install k6: https://k6.io/docs/get-started/installation/
//   Run:  k6 run load/http-load.js
//   Override base URL:  k6 run -e BASE_URL=http://localhost:4000 load/http-load.js
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000';

export const options = {
  scenarios: {
    api: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 50 }, // ramp up
        { duration: '1m', target: 50 }, // sustain
        { duration: '20s', target: 0 }, // ramp down
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'], // <1% errors
    http_req_duration: ['p(95)<400'], // 95% under 400ms
  },
};

export default function () {
  // Each VU registers a unique user, then exercises the document list.
  const email = `load_${__VU}_${__ITER}_${Date.now()}@example.com`;
  const signup = http.post(
    `${BASE_URL}/api/auth/signup`,
    JSON.stringify({ email, password: 'password123', displayName: `Load ${__VU}` }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  check(signup, { 'signup 201': (r) => r.status === 201 });

  const token = signup.json('accessToken');
  if (!token) return;
  const authHeaders = { headers: { Authorization: `Bearer ${token}` } };

  const created = http.post(
    `${BASE_URL}/api/documents`,
    JSON.stringify({ title: 'Load test doc' }),
    { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } },
  );
  check(created, { 'create 201': (r) => r.status === 201 });

  const list = http.get(`${BASE_URL}/api/documents`, authHeaders);
  check(list, { 'list 200': (r) => r.status === 200 });

  sleep(1);
}
