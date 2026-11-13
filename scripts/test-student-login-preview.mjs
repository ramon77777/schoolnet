import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveStudentLoginFormMode,
  validateStudentLoginPreview,
} from '../src/lib/studentLoginPreviewValidation.ts';

const valid = {phone: '07 12 34 56 78', studentCode: 'sn-abcd-efgh-jkmn', password: 'MyTestPassword!123'};

test('Local Vite development always uses preview only', () => {
  assert.equal(resolveStudentLoginFormMode({isDev:true, projectUrl:'https://anntmbhaphkhmkoqsofd.supabase.co', sandboxEnabled:true}), 'local-preview');
});
test('Production project hides preview even when sandbox flag was set', () => {
  assert.equal(resolveStudentLoginFormMode({isDev:false,projectUrl:'https://anntmbhaphkhmkoqsofd.supabase.co',sandboxEnabled:true}), 'hidden');
});
test('Sandbox connection requires exact URL and explicit flag in build mode', () => {
  assert.equal(resolveStudentLoginFormMode({isDev:false,projectUrl:'https://onqlsvphmrqhelislpry.supabase.co',sandboxEnabled:false}), 'hidden');
  assert.equal(resolveStudentLoginFormMode({isDev:false,projectUrl:'https://onqlsvphmrqhelislpry.supabase.co',sandboxEnabled:true}), 'sandbox');
});
test('Local preview normalizes CI phone and student code', () => {
  assert.deepEqual(validateStudentLoginPreview(valid), {phoneE164:'+2250712345678',studentCode:'SN-ABCD-EFGH-JKMN'});
});
test('Shared family phone is valid for more than one distinct code', () => {
  const one = validateStudentLoginPreview(valid);
  const two = validateStudentLoginPreview({...valid,studentCode:'SN-ABCD-EFGH-JKMP'});
  assert.equal(one.phoneE164,two.phoneE164);
  assert.notEqual(one.studentCode,two.studentCode);
});
test('Never accept truncated code or ambiguous characters', () => {
  for (const studentCode of ['SN-INVALID','SN-ABCD-EFGH-JKMI','SN-ABCD-EFGH-JKMO','SN-0000-0000-0000','SN-ABCD-EFGH-JKM']) {
    assert.throws(() => validateStudentLoginPreview({...valid,studentCode}));
  }
});
test('Never accept malformed phone or input exceeding limits', () => {
  for (const phone of ['+225+0712345678','071234567', '999999999999999999999', '07abcd1234', 'x'.repeat(65)]) {
    assert.throws(() => validateStudentLoginPreview({...valid,phone}));
  }
});
test('At least 12 password chars required for preview; passwords are not returned', () => {
  assert.throws(() => validateStudentLoginPreview({...valid,password:'short'}));
  const result = validateStudentLoginPreview(valid);
  assert.equal('password' in result,false);
});