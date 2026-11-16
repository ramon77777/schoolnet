// UI-only source assertions: no API calls and no private data.
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const modal=source('src/features/admin/pages/AdminEnrollmentRequests.tsx');
const student=source('src/features/enrollments/components/AdminStudentNoEmailPanel.tsx');
const family=source('src/features/enrollments/components/AdminRequestResolutionPanel.tsx');
test('01 - responsive modal has fixed header and action footer',()=>{
 assert.match(modal,/max-h-\[88dvh\]/);
 assert.match(modal,/overflow-y-auto overscroll-contain/);
 assert.match(modal,/<header className/);
 assert.match(modal,/<footer className/);
});
test('02 - clear tabs replace stacked views',()=>{
 for(const label of ['1. Accès Apprenant','Famille & finalisation','Dossier & suivi'])
  assert.ok(modal.includes(label));
 assert.match(modal,/currentTab === 'family'/);
});
test('03 - modal keeps invitation view mounted on tab change',()=>{
 assert.match(modal,/currentTab === 'access' \? 'block' : 'hidden'/);
 assert.match(modal,/<AdminStudentNoEmailPanel request=\{selected\}/);
});
test('04 - expensive family panels are lazily mounted and kept',()=>{
 assert.match(modal,/familyVisited \|\| currentTab === 'family'/);
 assert.match(modal,/setFamilyVisited\(true\)/);
});
test('05 - no dangerous status action without confirmation',()=>{
 assert.match(modal,/status === 'rejected' && !window\.confirm/);
 assert.match(modal,/admin_review_public_enrollment_request/);
});
test('06 - real no-email status is read from server on request open',()=>{
 assert.match(student,/studentNoEmailAdminAction\(\{action:'inspect',requestId:request\.id\}\)/);
 assert.match(student,/status=inspection\?\.status\?\?null/);
});
test('07 - no-email state and technical detail separate',()=>{
 assert.match(student,/Diagnostic technique/);
 assert.match(student,/inspection\?\.family_linked===true/);
 assert.match(student,/status==='requires_review'/);
});
test('08 - family and classroom reviews remain available as accordions',()=>{
 assert.match(family,/Gérer les invitations Parent \/ Tuteur/);
 assert.match(family,/Reconnaissance des comptes et classes/);
 assert.match(family,/admin_finalize_public_enrollment_request/);
});

const api=source('src/features/enrollments/lib/adminStudentNoEmailApi.ts');
test('09 - preview never invokes student admin and displays read-only explanation',()=>{
 assert.match(api,/window\.location\.origin !== PROD_ORIGIN/);
 assert.match(api,/!schoolnetAdminPreviewOnly/);
 assert.match(student,/Prévisualisation en lecture seule/);
 assert.match(modal,/disabled=\{Boolean\(user\?\.isDemo\) \|\| previewOnly\}/);
});
test('10 - preview disables review mutations and hides destructive actions',()=>{
 assert.match(modal,/saving \|\| resolving \|\| schoolnetAdminPreviewOnly/);
 assert.match(modal,/!previewOnly && selected\.status !== 'processed'/);
 assert.match(modal,/Aperçu en lecture seule/);
});
test('11 - mobile steps remain legible without horizontal clipping',()=>{
 assert.match(modal,/grid-cols-2/);
 assert.match(modal,/col-span-2/);
 assert.match(modal,/sm:overflow-x-auto/);
});
test('12 - next step is based on inspected server status',()=>{
 assert.match(student,/const nextAction=status==='enabled'/);
 assert.match(student,/inspection\?\.family_linked===true/);
 assert.match(modal,/onOpenFamily=\{openFamily\}/);
 assert.match(student,/status==='requires_review'/);
});
