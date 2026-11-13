import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const file = new URL('../supabase/proposals/20261113_align_public_school_levels_REVIEW_ONLY.sql',import.meta.url);
const sql = readFileSync(file,'utf8');
test('proposal explicitly requires a separate authorization and a backup',()=>{
  assert.match(sql,/REVIEW ONLY/);assert.match(sql,/backup/);assert.match(sql,/authorization/);
});
test('public catalog is SELECT-only, no edits to classes or enrollments',()=>{
  assert.doesNotMatch(sql,/\b(?:UPDATE|DELETE\s+FROM|INSERT\s+INTO|TRUNCATE)\s+public\.public_levels\b/i);
  assert.doesNotMatch(sql,/\b(?:UPDATE|DELETE\s+FROM|INSERT\s+INTO|TRUNCATE)\s+public\.classes\b/i);
  assert.doesNotMatch(sql,/\b(?:UPDATE|DELETE\s+FROM|INSERT\s+INTO|TRUNCATE)\s+public\.student_enrollments\b/i);
});
test('checks for conflicts before writing and preserves sixth grade ID',()=>{
  assert.match(sql,/ordering conflict/);assert.match(sql,/unrecognized academic level/);
  assert.match(sql,/v_existing_sixth_id/);assert.match(sql,/existing 6e ID changed/);
});
test('only inserts missing level labels from the visible public catalog',()=>{
  assert.match(sql,/INSERT INTO public\.levels \(name,order_index\)/);
  assert.match(sql,/NOT EXISTS \(/);assert.match(sql,/p\.is_visible/);
  assert.match(sql,/order_index = p\.sort_order/);
});
test('transaction is bounded and releases changes only after postconditions',()=>{
  assert.match(sql,/^BEGIN;/m);assert.match(sql,/^COMMIT;/m);
  assert.match(sql,/SET LOCAL lock_timeout = '5s'/);
  assert.match(sql,/sync result incomplete/);
});