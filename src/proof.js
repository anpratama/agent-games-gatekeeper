// Groth16 decision-proof module (snarkjs) — CALIBRATED 2026-11-15.
// The platform never published the gatekeeper circuit's witness format;
// it was reverse-engineered locally from the official artifacts
// (gatekeeper.wasm + gatekeeper_final.zkey + vk.json):
//   - Input signals discovered via the circom FNV-1a name-hash oracle
//     (getInputSignalSize): registeredVkHash, proofVkHash, minimum,
//     publicBalance, expiryBlock, currentBlock, recipient,
//     conditionRecipient, amount, maxTransfer, decision, taskId, salt
//     (all size 1; getInputSize = 13).
//   - Public signals (nPublic = 13), in order: a computed commitment
//     X = f(taskId, salt), then the 12 inputs above except salt.
//     salt is the only private input.
//   - The circuit ENFORCES decision == verdict computed from the
//     condition fields: witness generation fails for an inconsistent
//     decision, so a proof can only ever back a correct decision.
//   - Verified end-to-end locally 2026-11-15: groth16 prove with the
//     official zkey + verify against the official vk.json = OK.
// Value mapping: vk hashes and addresses are passed as integers
// (the witness calculator reduces mod the BN128 prime); taskId is the
// numeric proof_tx (the task's unique on-chain proof reference);
// salt is a fresh random 128-bit value per proof. PROOF_REUSED
// decisions are not provable (reuse is stateful, the circuit is
// stateless) and are answered without a proof, per the spec.
// Any proving error returns null — the decision response is never
// blocked or delayed by a proof failure.
'use strict';

const path = require('path');
const crypto = require('crypto');

const WASM = path.join(__dirname, '..', 'circuits', 'gatekeeper.wasm');
const ZKEY = path.join(__dirname, '..', 'circuits', 'gatekeeper_final.zkey');
const VK_HASH = '0x6b79c6012a6d8651f3e13bc4d2a20370280ab49700c90c5316d4168bfbad77b0';

function witnessFor(input, result) {
  if (!input || !result) return null;
  if (result.reason_code === 'PROOF_REUSED') return null;
  const salt = BigInt('0x' + crypto.randomBytes(16).toString('hex')).toString();
  return {
    registeredVkHash: BigInt(input.registered_vk).toString(),
    proofVkHash: BigInt(input.proof_vk).toString(),
    minimum: String(input.minimum),
    publicBalance: String(input.public_balance),
    expiryBlock: String(input.expiry_block),
    currentBlock: String(input.current_block),
    recipient: BigInt(input.recipient).toString(),
    conditionRecipient: BigInt(input.condition_recipient).toString(),
    amount: String(input.amount),
    maxTransfer: String(input.max_transfer),
    decision: result.decision === 'APPROVE' ? '1' : '0',
    taskId: BigInt(input.proof_tx).toString(),
    salt,
  };
}

async function proveDecision(input, result) {
  if (process.env.PROOF_ENABLED !== '1') return null;
  try {
    const witness = witnessFor(input, result);
    if (!witness) return null;
    // snarkjs is a tooling dependency; required lazily so the HTTP server
    // itself stays zero-dependency.
    const snarkjs = require('snarkjs');
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(witness, WASM, ZKEY);
    return { proof, public_signals: publicSignals };
  } catch (err) {
    console.error('PROOF_FAIL', err && err.message ? err.message : err);
    return null;
  }
}

module.exports = { proveDecision, witnessFor, VK_HASH };
