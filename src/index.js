// Proof Gatekeeper agent — Agent Games (zkVerify)
// Zero-dependency Node server.
//  - GET  /health  -> { status: "ok" }
//  - POST /task    -> signed task envelope in, signed decision out
// Env:
//  AGENT_SECRET  HMAC secret issued at agent registration (shown once) [required in prod]
//  PORT          listen port (default 8080)
//  SEEN_FILE     seen-set persistence path (default ./data/seen.json)
// Signature format (per platform rules): header `x-agent-games-signature`,
// HMAC over the RAW body. We accept both bare hex and `sha256=<hex>` on
// verify, and emit bare hex on responses, until the extracted spec pins the
// exact format — see SPEC.md.
'use strict';

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { decide } = require('./decide');
const { proveDecision } = require('./proof');

const PORT = process.env.PORT || 8080;
// Official env name per platform docs: AGENT_GAMES_HMAC_SECRET (AGENT_SECRET kept as fallback)
const SECRET = process.env.AGENT_GAMES_HMAC_SECRET || process.env.AGENT_SECRET || '';
const SEEN_FILE = process.env.SEEN_FILE || path.join(__dirname, '..', 'data', 'seen.json');

// ---- seen-set (proof_tx reuse detection), persisted to disk ----
let seen = new Set();
try { seen = new Set(JSON.parse(fs.readFileSync(SEEN_FILE, 'utf8'))); } catch {}
function markSeen(tx) {
  if (!tx || seen.has(tx)) return;
  seen.add(tx);
  try {
    fs.mkdirSync(path.dirname(SEEN_FILE), { recursive: true });
    fs.writeFileSync(SEEN_FILE, JSON.stringify([...seen]));
  } catch (e) { console.error('seen persist failed', e.message); }
}

// ---- idempotency: task_id -> response body (platform may retry) ----
const idempotency = new Map();

function hmacHex(raw) {
  return crypto.createHmac('sha256', SECRET).update(raw).digest('hex');
}
function verifySignature(raw, header) {
  if (!SECRET) return true; // local dev only; prod must set the secret
  if (!header) return false;
  const given = header.startsWith('sha256=') ? header.slice(7) : header;
  // The /build spec names the header and the raw-body rule but does NOT state
  // algorithm/encoding. Accept the plausible encodings on verify (sha256 hex,
  // sha256 base64); outbound signing uses sha256 hex. Preflight + practice
  // rounds will confirm which one the platform actually uses — then tighten.
  const candidates = [
    crypto.createHmac('sha256', SECRET).update(raw).digest('hex'),
    crypto.createHmac('sha256', SECRET).update(raw).digest('base64'),
  ];
  return candidates.some(expected => {
    const a = Buffer.from(given); const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}
function sendSigned(res, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(200, { 'content-type': 'application/json', 'x-agent-games-signature': hmacHex(body) });
  res.end(body);
  return body;
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && (req.url === '/health' || req.url === '/')) {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ status: 'ok', agent: 'gatekeeper' }));
  }
  if (req.method !== 'POST') { res.writeHead(404); return res.end(); }

  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', () => {
    const raw = Buffer.concat(chunks);
    // Fail closed: bad signature -> 401, never process the task.
    if (!verifySignature(raw, req.headers['x-agent-games-signature'])) {
      res.writeHead(401, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ error: 'bad signature' }));
    }
    let task;
    try { task = JSON.parse(raw.toString('utf8')); }
    catch { res.writeHead(400); return res.end(JSON.stringify({ error: 'bad json' })); }

    // Preflight handshake: platform verifies liveness + signing before any task.
    if (task.type === 'agent-games.preflight.v1') {
      return sendSigned(res, { ok: true, protocolVersion: 'v1' });
    }

    const taskId = task.task_id || task.taskId || '';
    if (taskId && idempotency.has(taskId)) {
      const body = idempotency.get(taskId);
      res.writeHead(200, { 'content-type': 'application/json', 'x-agent-games-signature': hmacHex(body) });
      return res.end(body);
    }

    const input = task.input || task;
    const result = decide(input, seen);
    // Record the reference as seen AFTER deciding (reuse = seen in a PRIOR task).
    markSeen(input.proof_tx);

    (async () => {
      const payload = {
        decision: result.decision,
        reason_code: result.reason_code,
        proof_tx: input.proof_tx,
      };
      // Attach the Groth16 decision proof when calibrated + enabled.
      // PROOF_REUSED tasks have no proof to submit (excluded by the rules).
      if (result.reason_code !== 'PROOF_REUSED') {
        try {
          const p = await proveDecision(input, result);
          if (p) { payload.proof = p.proof; payload.public_signals = p.public_signals; }
        } catch (e) { console.error('proof failed, answering without it', e.message); }
      }
      if (taskId) payload.task_id = taskId;
      const body = JSON.stringify(payload);
      if (taskId) idempotency.set(taskId, body);
      res.writeHead(200, { 'content-type': 'application/json', 'x-agent-games-signature': hmacHex(body) });
      res.end(body);
    })();
  });
});

server.listen(PORT, () => console.log(`gatekeeper listening on :${PORT}`));
