// Tests purement locaux, sans réseau ni mutation.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
 schoolnetStudentAllowedOrigin as allowed,
 STUDENT_PRODUCTION_PROJECT as prod,
 STUDENT_SANDBOX_PROJECT as sandbox,
 STUDENT_PRODUCTION_ORIGIN as productionOrigin,
} from '../supabase/functions/_shared/schoolnetStudentRuntimeGate.ts';

const preview='https://schoolnet-git-feature-schoolnet-lot-9ba86b-ramon77777s-projects.vercel.app';
const args=(overrides={})=>({
 projectUrl:prod,
 requestOrigin:productionOrigin,
 executionMode:null,
 sandboxEnabled:null,
 sandboxOrigin:null,
 ...overrides,
});
test('01 - production only on its exact origin',()=>{
 assert.equal(allowed(args()),productionOrigin);
 assert.equal(allowed(args({requestOrigin:preview})),null);
 assert.equal(allowed(args({requestOrigin:'https://schoolnet-snowy.vercel.app.evil.test'})),null);
});
test('02 - sandbox mode cannot unlock production project',()=>{
 assert.equal(allowed(args({executionMode:'sandbox',sandboxEnabled:'true',sandboxOrigin:productionOrigin})),null);
});
test('03 - sandbox defaults deny every request',()=>{
 assert.equal(allowed(args({projectUrl:sandbox,requestOrigin:preview})),null);
 assert.equal(allowed(args({projectUrl:sandbox,requestOrigin:preview,executionMode:'sandbox'})),null);
});
test('04 - sandbox must have explicit enable and exact origin',()=>{
 const base=args({projectUrl:sandbox,executionMode:'sandbox',sandboxEnabled:'true',sandboxOrigin:preview});
 assert.equal(allowed(base),null);
 assert.equal(allowed({...base,requestOrigin:preview}),preview);
});
test('05 - unknown project is denied even if every flag is on',()=>{
 assert.equal(allowed(args({projectUrl:'https://third.supabase.co',executionMode:'sandbox',sandboxEnabled:'true',sandboxOrigin:preview,requestOrigin:preview})),null);
});
test('06 - sandbox must not share production origin',()=>{
 assert.equal(allowed(args({projectUrl:sandbox,requestOrigin:productionOrigin,executionMode:'sandbox',sandboxEnabled:'true',sandboxOrigin:productionOrigin})),null);
});
test('07 - invalid preview origins are rejected',()=>{
 for(const bad of [
  'https://schoolnet-preview.vercel.app.evil.test',
  'https://evil.vercel.app',
  'https://schoolnet-preview.vercel.app/extra',
  'https://schoolnet-preview.vercel.app?evil=yes',
  'http://schoolnet-preview.vercel.app',
  'https://schoolnet-preview.vercel.app:8443',
 ])assert.equal(allowed(args({
   projectUrl:sandbox,executionMode:'sandbox',sandboxEnabled:'true',
   requestOrigin:bad,sandboxOrigin:bad,
 })),null,bad);
});
test('08 - optional local development only on exact localhost:5173',()=>{
 const local='http://localhost:5173';
 assert.equal(allowed(args({projectUrl:sandbox,executionMode:'sandbox',sandboxEnabled:'true',requestOrigin:local,sandboxOrigin:local})),local);
 assert.equal(allowed(args({projectUrl:sandbox,executionMode:'sandbox',sandboxEnabled:'true',requestOrigin:'http://localhost:5174',sandboxOrigin:'http://localhost:5174'})),null);
});
test('09 - typo or missing mode blocks production and sandbox',()=>{
 assert.equal(allowed(args({executionMode:'snaodbox'})),null);
 assert.equal(allowed(args({projectUrl:sandbox,executionMode:'production',sandboxEnabled:'true',requestOrigin:preview,sandboxOrigin:preview})),null);
});
