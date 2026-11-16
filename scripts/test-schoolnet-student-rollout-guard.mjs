import test from 'node:test';
import assert from 'node:assert/strict';
import {schoolnetStudentRolloutAllowed as allowed,schoolnetStudentRequestIdIsValid as valid}
 from '../supabase/functions/_shared/schoolnetStudentRolloutGuard.ts';
const P='4082dab6-8fbf-493a-8de7-06153fbd26e6';
const C='e43b7841-fb5a-434c-a3e7-a9f7565de350';
const X='6d86ca89-ae92-4b96-8387-1695b2f066a';
const call=(options)=>allowed({enabled:true,generalReleaseEnabled:false,pilotRequestId:P,canaryRequestId:C,requestId:X,...options});
test('01 - default rejects outside cohort',()=>assert.equal(call({}),false));
test('02 - pilot admitted',()=>assert.equal(call({requestId:P}),true));
test('03 - canary admitted',()=>assert.equal(call({requestId:C}),true));
test('04 - disabled rejects pilot',()=>assert.equal(call({enabled:false,requestId:P}),false));
test('05 - general release explicitly allows third valid request',()=>assert.equal(call({generalReleaseEnabled:true}),true));
test('06 - malformed id forbidden even in general release',()=>assert.equal(call({generalReleaseEnabled:true,requestId:'*'}),false));
test('07 - absent flags and cohorts fail closed',()=>assert.equal(call({pilotRequestId:null,canaryRequestId:undefined}),false));
test('08 - malformed canary cannot open unrelated request',()=>assert.equal(call({canaryRequestId:'*'}),false));
test('09 - case and whitespace normalize',()=>assert.equal(call({requestId:P.toUpperCase(),pilotRequestId:' '+P+' '}),true));
test('10 - zero UUID is not valid',()=>assert.equal(valid('00000000-0000-0000-0000-000000000000'),false));
