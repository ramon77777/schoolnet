// SCHOOLNET pilot: pure, no Supabase connection or side effects.
import test from 'node:test';
import assert from 'node:assert/strict';
import { schoolnetStudentPilotWriteAllowed as allowed } from '../supabase/functions/_shared/schoolnetStudentPilotGuard.ts';
const A = '8c3e7e58-df49-4249-8b90-8a57868cf3a4';
const B = '458a6912-45dd-42da-8d8b-c0653150a5da';

test('reject when flag is false, even for correct pilot', () => {
  assert.equal(allowed({ accountsEnabled: false, pilotRequestId: A, requestId: A }), false);
});
test('reject when pilot request id is missing', () => {
  for (const v of [null, undefined, '', '  '])
    assert.equal(allowed({ accountsEnabled: true, pilotRequestId: v, requestId: A }), false);
});
test('reject different request even if accounts are enabled', () => {
  assert.equal(allowed({ accountsEnabled: true, pilotRequestId: A, requestId: B }), false);
});
test('reject malformed or forbidden pilot IDs', () => {
  for (const v of ['test', '00000000-0000-0000-0000-000000000000', A + '-extra'])
    assert.equal(allowed({ accountsEnabled: true, pilotRequestId: v, requestId: A }), false);
});
test('reject malformed current request', () => {
  assert.equal(allowed({ accountsEnabled: true, pilotRequestId: A, requestId: A + '-extra' }), false);
});
test('permit only an exact matching request under explicit activation', () => {
  assert.equal(allowed({ accountsEnabled: true, pilotRequestId: A, requestId: A }), true);
});
test('normalize case and surrounding whitespace', () => {
  assert.equal(allowed({ accountsEnabled: true, pilotRequestId: ' ' + A.toUpperCase() + ' ', requestId: A }), true);
});
test('fail closed for malformed runtime input', () => {
  assert.equal(allowed({ accountsEnabled: true, pilotRequestId: 123, requestId: A }), false);
  assert.equal(allowed({ accountsEnabled: true, pilotRequestId: A, requestId: null }), false);
});
