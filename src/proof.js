// Groth16 decision-proof module (snarkjs) — CALIBRATION PENDING.
// The platform does not publish the gatekeeper circuit's witness field
// names/order (verified 2026-11-13: /build has no witness JSON; the zkey's
// VK shows 13 public signals). The mapping below is therefore kept in ONE
// place (witnessFor) and must be calibrated against practice tasks before
// scored rounds. Until calibrated, the agent answers WITHOUT a proof:
// a correct decision still scores +12, missing proof costs only −2, while
// a WRONG-format proof risks looking like a malformed response.
// Enable with env PROOF_ENABLED=1 once witnessFor is verified in practice.
'use strict';

const path = require('path');

const WASM = path.join(__dirname, '..', 'circuits', 'gatekeeper.wasm');
const ZKEY = path.join(__dirname, '..', 'circuits', 'gatekeeper_final.zkey');
const VK_HASH = '0x6b79c6012a6d8651f3e13bc4d2a20370280ab49700c90c5316d4168bfbad77b0';

// TODO(practice-calibration): fill with the circuit's real signal names.
// Candidate raw material = the 11 envelope input fields + decision; the
// circuit exposes 13 public signals.
function witnessFor(/* input, result */) {
  return null; // null = not calibrated yet
}

async function proveDecision(input, result) {
  if (process.env.PROOF_ENABLED !== '1') return null;
  const witness = witnessFor(input, result);
  if (!witness) return null;
  // snarkjs is a tooling dependency; required lazily so the HTTP server
  // itself stays zero-dependency.
  const snarkjs = require('snarkjs');
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(witness, WASM, ZKEY);
  return { proof, public_signals: publicSignals };
}

module.exports = { proveDecision, VK_HASH };
