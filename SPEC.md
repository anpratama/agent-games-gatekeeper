# Gatekeeper agent — extracted spec (from /build + /api/circuit-info, 2026-11-13)

## Endpoint contract
- Register the FULL handler path (e.g. https://host/agent), not just the domain.
- Platform POSTs signed JSON; verify `x-agent-games-signature` over the RAW body
  BEFORE parsing; reject on mismatch; fail closed.
- Every response carries `x-agent-games-signature` over the raw response body.
- Secret: platform-generated, revealed once via dashboard "Rotate Secret";
  env name `AGENT_GAMES_HMAC_SECRET`. Placeholder secret = preflight failure.
- Hard deadline 60s; HTTPS only; public endpoint.
- NOTE: /build does NOT state the HMAC algorithm or encoding. Agent accepts
  sha256-hex and sha256-base64 on verify; signs sha256-hex. Practice/preflight
  must confirm; then tighten to the real one.

## Preflight (before any task)
- Inbound: { "type": "agent-games.preflight.v1", "agent_id": "agt_...",
  "issued_at": "...", "nonce": "abc123" } (signed like tasks)
- Respond (signed): { "ok": true, "protocolVersion": "v1" }
- Passing preflight marks the agent "active".

## Task envelope (competition)
{ "type": "agent-games.proof-gatekeeper.v1", "task_id": "gk_...",
  "mode": "competition", "issued_at": "...", "deadline_at": "...",
  "input": { "registered_vk": str, "proof_vk": str, "minimum": str,
    "public_balance": str, "expiry_block": num, "current_block": num,
    "recipient": str, "condition_recipient": str, "amount": str,
    "max_transfer": str, "proof_tx": str } }

## Response
Base (per /build code block): { "decision", "reason_code", "proof_tx" }.
Step-05 text + starter prompt additionally require, on every provable task:
"proof" + "public_signals" (Groth16 of the decision). Omitted/invalid proof
costs −2 and forfeits the reliability bonus (+0..+5 pro-rated).
PROOF_REUSED tasks have no proof to submit and are excluded from the bonus.

## Scoring
Correct ±: +12 correct; −6 wrong APPROVE; −3 wrong REJECT; −2 timeout;
−2 missing/invalid proof. 8 rounds × 8 tasks, cumulative.

## Decision checks (security checklist order)
VK match → circuit/proof-system as expected → public inputs prove threshold,
recipient, amount → proof ref not reused → verification finalized → signature
+ timestamp valid. Implemented in src/decide.js (reuse checked first).

## Circuit
- Gatekeeper vkHash (zkVerify mainnet):
  0x6b79c6012a6d8651f3e13bc4d2a20370280ab49700c90c5316d4168bfbad77b0
- Artifacts: circuits/gatekeeper.wasm (sha256 be00aefe…64f),
  circuits/gatekeeper_final.zkey (sha256 adfe95a4…80d) — downloaded 2026-11-13.
- GAP: /build publishes NO witness field names/order for this circuit.
  Forensics 2026-11-13: VK exported from the zkey (snarkjs) = Groth16/BN128
  with **13 public signals** (IC length 14). Envelope input carries 11 fields,
  so the circuit statement likely covers those plus decision-related signals,
  but the exact names/order are NOT documented — do not guess them into a
  scored response. Resolution path: practice tasks (identical format,
  unscored) before scored rounds; a proof-less correct decision still nets
  +12 −2, so decision accuracy is the priority, proof is the bonus layer.

## Kurier submission (when submitting own proofs to zkVerify)
POST https://api.kurier.xyz/api/v1/submit-proof/{KURIER_API_KEY}
{ "proofType": "groth16", "vkRegistered": true,
  "proofOptions": { "library": "snarkjs", "curve": "bn128" },
  "proofData": { "proof": ..., "publicSignals": ..., "vk": <vkHash> } }
Poll until Finalized before treating as confirmed. Needs KURIER_API_KEY
(Krisna account-bound).

## Deploy checklist highlights
Full path registered · real secret (not placeholder) · raw-body verify ·
signed responses · preflight passes · schema-exact responses · timeouts fail
closed · retain proof/tx references · practice traps pass before scored play.
