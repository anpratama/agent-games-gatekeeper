// Proof Gatekeeper decision logic — Agent Games (zkVerify)
// Pure function: given a task `input` object and a seen-set of proof_tx
// references, return { decision, reason_code }.
//
// Trap priority (when several traps overlap, first match wins).
// Order rationale: reuse is a property of OUR history, checked first so a
// replayed proof can never slip through on otherwise-valid fields; VK next
// (identity of what was proven), then expiry, threshold, recipient, amount —
// mirroring the build checklist order on the event page.
'use strict';

function normHex(v) {
  return typeof v === 'string' ? v.toLowerCase() : v;
}

function toBig(v) {
  // Amounts arrive as decimal strings; fall back to Number for small ints.
  try { return BigInt(v); } catch { return BigInt(Math.trunc(Number(v) || 0)); }
}

function decide(input, seen) {
  const proofTx = input.proof_tx;

  // 1) PROOF_REUSED — reference already accepted/seen in a previous task.
  if (proofTx && seen && seen.has(proofTx)) {
    return { decision: 'REJECT', reason_code: 'PROOF_REUSED' };
  }

  // 2) VK_SUBSTITUTION — proof's VK != registered condition VK.
  if (input.proof_vk !== undefined && input.registered_vk !== undefined &&
      normHex(input.proof_vk) !== normHex(input.registered_vk)) {
    return { decision: 'REJECT', reason_code: 'VK_SUBSTITUTION' };
  }

  // 3) EXPIRED_CONDITION — current block has passed the expiry block.
  if (input.expiry_block !== undefined && input.current_block !== undefined &&
      toBig(input.current_block) > toBig(input.expiry_block)) {
    return { decision: 'REJECT', reason_code: 'EXPIRED_CONDITION' };
  }

  // 4) THRESHOLD_MISMATCH — public balance below required minimum.
  if (input.public_balance !== undefined && input.minimum !== undefined &&
      toBig(input.public_balance) < toBig(input.minimum)) {
    return { decision: 'REJECT', reason_code: 'THRESHOLD_MISMATCH' };
  }

  // 5) RECIPIENT_MISMATCH — proof recipient != condition recipient.
  if (input.recipient !== undefined && input.condition_recipient !== undefined &&
      normHex(input.recipient) !== normHex(input.condition_recipient)) {
    return { decision: 'REJECT', reason_code: 'RECIPIENT_MISMATCH' };
  }

  // 6) AMOUNT_OVERFLOW — requested amount exceeds single-transfer cap.
  if (input.amount !== undefined && input.max_transfer !== undefined &&
      toBig(input.amount) > toBig(input.max_transfer)) {
    return { decision: 'REJECT', reason_code: 'AMOUNT_OVERFLOW' };
  }

  // All checks passed.
  return { decision: 'APPROVE', reason_code: 'VALID_CONDITION' };
}

module.exports = { decide };
