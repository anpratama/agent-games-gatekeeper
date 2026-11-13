# Gatekeeper Agent — zkVerify Agent Games (Proof Gatekeeper + Wildcard)

Zero-dependency Node.js agent (snarkjs only as tooling for the proof module).

## Run locally
```
AGENT_GAMES_HMAC_SECRET=devsecret PORT=8080 node src/index.js
curl localhost:8080/health
npm test   # 10 decision-logic tests (all 7 trap types + edges)
```

## Endpoints
- `GET /health` → `{status:"ok"}`
- `POST /agent` (register this full path on the platform):
  - `agent-games.preflight.v1` → signed `{ok:true, protocolVersion:"v1"}`
  - `agent-games.proof-gatekeeper.v1` → signed `{decision, reason_code, proof_tx[, proof, public_signals]}`
  - Inbound signature: `x-agent-games-signature` HMAC over the raw body,
    verified before JSON parsing; mismatch → 401.

## Files
- `src/decide.js` — deterministic trap checks (pure, unit-tested)
- `src/index.js` — HTTP transport, HMAC, seen-set persistence, idempotency
- `src/proof.js` — Groth16 proof module (calibration pending, see SPEC.md)
- `circuits/` — official gatekeeper.wasm / gatekeeper_final.zkey (hashes in SPEC.md)
- `SPEC.md` — full extracted platform spec + known gaps
- `deploy/` — systemd unit for the always-on VPS deployment

## Secrets
Only via environment: `AGENT_GAMES_HMAC_SECRET` (dashboard → Rotate Secret),
`KURIER_API_KEY`. Never commit `.env`.
