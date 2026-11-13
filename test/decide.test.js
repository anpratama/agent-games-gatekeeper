'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { decide } = require('../src/decide');

const base = {
  registered_vk: '0x7d3af291',
  proof_vk: '0x7d3af291',
  minimum: '1000',
  public_balance: '1460',
  expiry_block: 19842201,
  current_block: 19832000,
  recipient: '0xDe429f01',
  condition_recipient: '0xDe429f01',
  amount: '500',
  max_transfer: '1000',
  proof_tx: '0xa4c18ff1',
};
const fresh = () => new Set();

test('valid condition -> APPROVE / VALID_CONDITION', () => {
  assert.deepEqual(decide({ ...base }, fresh()),
    { decision: 'APPROVE', reason_code: 'VALID_CONDITION' });
});

test('vk substitution -> REJECT / VK_SUBSTITUTION', () => {
  assert.equal(decide({ ...base, proof_vk: '0xa4c1b8ff' }, fresh()).reason_code, 'VK_SUBSTITUTION');
});

test('threshold mismatch -> REJECT / THRESHOLD_MISMATCH', () => {
  assert.equal(decide({ ...base, public_balance: '999' }, fresh()).reason_code, 'THRESHOLD_MISMATCH');
});

test('proof reused -> REJECT / PROOF_REUSED', () => {
  const seen = new Set([base.proof_tx]);
  assert.equal(decide({ ...base }, seen).reason_code, 'PROOF_REUSED');
});

test('expired condition -> REJECT / EXPIRED_CONDITION', () => {
  assert.equal(decide({ ...base, current_block: 19842202 }, fresh()).reason_code, 'EXPIRED_CONDITION');
});

test('recipient mismatch -> REJECT / RECIPIENT_MISMATCH', () => {
  assert.equal(decide({ ...base, recipient: '0xBEEF' }, fresh()).reason_code, 'RECIPIENT_MISMATCH');
});

test('amount overflow -> REJECT / AMOUNT_OVERFLOW', () => {
  assert.equal(decide({ ...base, amount: '1001' }, fresh()).reason_code, 'AMOUNT_OVERFLOW');
});

test('edge: balance exactly at minimum approves; amount exactly at cap approves', () => {
  assert.equal(decide({ ...base, public_balance: '1000', amount: '1000' }, fresh()).decision, 'APPROVE');
});

test('edge: current_block exactly at expiry approves (not yet passed)', () => {
  assert.equal(decide({ ...base, current_block: 19842201 }, fresh()).decision, 'APPROVE');
});

test('case-insensitive address/vk comparison', () => {
  assert.equal(decide({ ...base, recipient: '0xde429f01' }, fresh()).decision, 'APPROVE');
});
