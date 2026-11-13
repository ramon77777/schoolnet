import test from 'node:test';
import assert from 'node:assert/strict';
import {validateStudentNoEmailRequest,technicalSchoolnetAlias,canAdvanceNoEmailStatus,validateAdminVerification} from '../supabase/functions/_shared/studentNoEmailPolicy.ts';
const request={
 id:'8c3e7e58-df49-4249-8b90-8a57868cf3a4',request_type:'student_enrollment',
 status:'contacted',student_full_name:'Enfant Fictif',student_email:null,
 guardian_email:'parent@example.org',guardian_phone:'07 12 34 56 78',
};
const parent={recipient:'parent',expected_role:'parent',status:'activated',
 email:'parent@example.org',user_id:'e270362f-18a2-4f6e-a8b9-57ded300e3bb'};
test('apprenant sans email: accepte uniquement parent active et telephone partageable',()=>{
 const x=validateStudentNoEmailRequest(request,parent);
 assert.equal(x.parentId,parent.user_id);
 assert.equal(x.familyPhone,'+2250712345678');
 assert.equal(x.studentName,'Enfant Fictif');
});
test('demande refusee, deja traitee, autre type ou email apprenant personnel: refuse',()=>{
 for(const patch of [{status:'rejected'},{status:'processed'},{request_type:'parent_access'},{student_email:'enfant@example.org'}])
  assert.throws(()=>validateStudentNoEmailRequest({...request,...patch},parent),/INELIGIBLE_REQUEST/);
});
test('preuve parent obligatoire, strictement le meme dossier et adresse',()=>{
 for(const patch of [{status:'prepared'},{recipient:'student'},{expected_role:'student'},
  {email:'autre@example.org'},{user_id:null}])
  assert.throws(()=>validateStudentNoEmailRequest(request,{...parent,...patch}),/PARENT_PROOF_REQUIRED/);
});
test('code technique deterministic et domaine controle, jamais email parent',()=>{
 const a=technicalSchoolnetAlias(request.id,'identites.ecole.example.org');
 assert.equal(a,'sn-8c3e7e58df4942498b908a57868cf3a4@identites.ecole.example.org');
 assert.notEqual(a,parent.email);
 for(const domain of ['schoolnet.invalid','gmail.com','localhost','schoolnet.test',''])
  assert.throws(()=>technicalSchoolnetAlias(request.id,domain),/TECHNICAL_DOMAIN_NOT_APPROVED/);
});
test('transitions refusees : pas de lien sans preuve ni reactivation de revoke',()=>{
 assert.equal(canAdvanceNoEmailStatus('reserved','sent_declared'),false);
 assert.equal(canAdvanceNoEmailStatus('prepared','sent_declared'),true);
 assert.equal(canAdvanceNoEmailStatus('sent_declared','enabled'),true);
 assert.equal(canAdvanceNoEmailStatus('enabled','reserved'),false);
 assert.equal(canAdvanceNoEmailStatus('revoked','enabled'),false);
});
test('justification administrative 10-1000 caracteres et non vide',()=>{
 assert.equal(validateAdminVerification('Verification avec dossier parental validee.'),'Verification avec dossier parental validee.');
 for(const invalid of ['',undefined,'court',' '.repeat(15),'a'.repeat(1001)])
  assert.throws(()=>validateAdminVerification(invalid),/ADMIN_VERIFICATION_REQUIRED/);
});