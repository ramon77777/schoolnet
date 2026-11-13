// Offline verification; this test never contacts Supabase and makes no writes.
import test from 'node:test';
import assert from 'node:assert/strict';
import {assertKnownPartialState} from './schoolnet-b2d-resume-after-timeout.mjs';
const base=(email,id,student,when)=>({
  email,id,phone:null,
  app_metadata:{schoolnet_sandbox:true,schoolnet_sandbox_student_b2b:student},
  updated_at:when,last_sign_in_at:when,
});
const older='2026-11-13T08:40:01.980Z';
const partial='2026-11-13T09:50:46.115Z';
const users=[
  base('schoolnet-b3-parent@example.test','10000000-0000-4000-8000-000000000001',false,older),
  base('schoolnet-b3-student@example.test','10000000-0000-4000-8000-000000000002',false,older),
  base('schoolnet-b2b-student-01@schoolnet.invalid','10000000-0000-4000-8000-000000000003',true,partial),
  base('schoolnet-b2b-student-02@schoolnet.invalid','10000000-0000-4000-8000-000000000004',true,older),
];
const cleanInventory=[{identity_count:0,enabled_count:0}];
test('accepts only precisely observed half-complete sandbox state',()=>{
  assert.equal(assertKnownPartialState(users,cleanInventory),true);
});
test('refuses prior or ambiguous first-account update',()=>{
  const mismatched=structuredClone(users);
  mismatched[2].updated_at=older;
  assert.throws(()=>assertKnownPartialState(mismatched,cleanInventory),/FIRST_ACCOUNT_UPDATE_NOT_OBSERVED/);
});
test('refuses first-account sign-in that did not happen',()=>{
  const mismatched=structuredClone(users);
  mismatched[2].last_sign_in_at=older;
  assert.throws(()=>assertKnownPartialState(mismatched,cleanInventory),/FIRST_ACCOUNT_SIGNIN_NOT_OBSERVED/);
});
test('refuses second account already modified',()=>{
  const mismatched=structuredClone(users);
  mismatched[3].updated_at=partial;
  assert.throws(()=>assertKnownPartialState(mismatched,cleanInventory),/SECOND_ACCOUNT_CHANGED_OR_AMBIGUOUS/);
});
test('refuses any already created identity mapping',()=>{
  assert.throws(()=>assertKnownPartialState(users,[{identity_count:1}]),/INVENTORY_MISMATCH/);
});
test('refuses additional real or unexpected accounts',()=>{
  const mismatched=structuredClone(users);
  mismatched[0].email='real-person@example.com';
  assert.throws(()=>assertKnownPartialState(mismatched,cleanInventory),/UNEXPECTED_ACCOUNT/);
});
test('refuses if B2B user has phone Auth or wrong private marker',()=>{
  const mismatched=structuredClone(users);
  mismatched[3].phone='+2250700000000';
  assert.throws(()=>assertKnownPartialState(mismatched,cleanInventory),/INVALID_B2B_MARKER/);
});