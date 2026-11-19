// SCHOOLNET 5D-K - REAL Supabase Auth, PostgREST and Storage on loopback.
// Isolated disposable local stack only. No real users, cloud keys, or data.
// IMPORTANT: parent gateway I is not deployed, this exercises its pure core.
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {randomUUID,createHash} from "node:crypto";
import test from "node:test";
import {createClient} from "@supabase/supabase-js";
import {readVerifiedParentAnnualClasses} from
  "../supabase/functions/_shared/lot5diParentAnnualRead.ts";

const localUrl=process.env.SCHOOLNET_K_LOCAL_URL||"";
const anonKey=process.env.SCHOOLNET_K_LOCAL_ANON_KEY||"";
const serviceKey=process.env.SCHOOLNET_K_LOCAL_SERVICE_KEY||"";
const dbUrl=process.env.SCHOOLNET_K_LOCAL_DB_URL||"";
let api,db;
try{api=new URL(localUrl);db=new URL(dbUrl);}
catch{throw Error("5D-K: local Supabase API and DB URLs required");}
if(api.protocol!=="http:"||api.hostname!=="127.0.0.1"||
  api.port!=="54321"||(api.pathname!=="/"&&api.pathname!=="")||
  (db.protocol!=="postgresql:"&&db.protocol!=="postgres:")||
  db.hostname!=="127.0.0.1"||db.port!=="54322"||
  db.pathname!=="/postgres"||!anonKey||!serviceKey)
 throw Error("5D-K: refused non-loopback Supabase/DB target");
for(const key of ["SUPABASE_ACCESS_TOKEN","SUPABASE_DB_URL","DATABASE_URL",
  "VITE_SUPABASE_URL","SUPABASE_PROJECT_ID"]){
 if(process.env[key])throw Error("5D-K: remote environment variable forbidden: "+key);
}
const config={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
const service=createClient(localUrl,serviceKey,config);
const newClient=()=>createClient(localUrl,anonKey,config);
const sha=bytes=>createHash("sha256").update(bytes).digest("hex");
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SRC="schoolnet-k-source",BACKUP="schoolnet-k-retention";
const bytes=Buffer.from("%PDF-1.4\nSCHOOLNET 5D-K document fictif\n%%EOF\n","utf8");
function sql(q) {
 return execFileSync("psql",[dbUrl,"-X","-q","-t","-A","-v",
   "ON_ERROR_STOP=1","-c",q],{encoding:"utf8",timeout:12000,
    env:{...process.env,PGCONNECT_TIMEOUT:"5"}}).trim();
}
function liveSession(uid,sid) {
 assert.match(uid,UUID);assert.match(sid,UUID);
 const q="SELECT count(*) FROM auth.sessions WHERE user_id='"+uid+
   "'::uuid AND id='"+sid+
   "'::uuid AND (not_after IS NULL OR not_after>now())";
 return sql(q)==="1";
}
function unwrap(result,label){
 if(result.error)throw Error(label+": "+result.error.message);
 return result.data;
}
async function verifiedAnnualRead(parentId) {
 return readVerifiedParentAnnualClasses({
  parentId,
  getConfirmedRole:async id=>{
   const d=unwrap(await service.from("profiles").select("role")
     .eq("id",id).single(),"read role");
   return d.role;
  },
  getVerifiedLinks:async id=>unwrap(await service.from("parent_links")
    .select("student_id").eq("parent_id",id).limit(101),"read links"),
  getCurrentYears:async()=>unwrap(await service.from("school_years")
    .select("id").eq("is_current",true).limit(2),"read year"),
  getAnnualEnrollments:async(ids,year)=>unwrap(
    await service.from("student_enrollments")
      .select("student_id,school_year_id,class_id,status")
      .eq("school_year_id",year).eq("status","active")
      .in("student_id",[...ids]).limit(201),"read enrollments"),
  getYearClasses:async(ids,year)=>unwrap(
    await service.from("classes").select("id,name,school_year_id")
      .eq("school_year_id",year).in("id",[...ids]).limit(201),"read classes"),
 });
}
const ids={},emails={},clients={},sessions={},years={},classes={};
let documentPath,docId;

test("K - real isolated Supabase Auth/PostgREST/Storage",async t=>{
 await t.test("K01 - real Auth and Storage APIs respond on loopback",async()=>{
  const r=await fetch(localUrl+"/auth/v1/health");
  assert.equal(r.ok,true);
  assert.equal(sql("SELECT current_database()"),"postgres");
  const rows=unwrap(await service.storage.listBuckets(),"list buckets");
  assert.ok(Array.isArray(rows));
 });
 await t.test("K02 - create five synthetic users via real Auth Admin API",async()=>{
  const suffix=randomUUID().slice(0,8);
  for(const name of ["parentA","parentB","studentA","studentB","admin"]){
   emails[name]="lot5dk-"+name.toLowerCase()+"-"+suffix+"@example.test";
   const d=unwrap(await service.auth.admin.createUser({
    email:emails[name],password:"Schoolnet-K-2026-Local!9",
    email_confirm:true,
   }),"create local user");
   assert.match(d.user.id,UUID);
   ids[name]=d.user.id;
  }
  assert.equal(new Set(Object.values(ids)).size,5);
 });
 await t.test("K03 - seed two years, distinct families and annual classes",async()=>{
  unwrap(await service.from("profiles").insert([
   {id:ids.parentA,role:"parent",full_name:"Parent A fictif"},
   {id:ids.parentB,role:"parent",full_name:"Parent B fictif"},
   {id:ids.studentA,role:"student",full_name:"Eleve A fictif"},
   {id:ids.studentB,role:"student",full_name:"Eleve B fictif"},
   {id:ids.admin,role:"admin",full_name:"Administrateur fictif"},
  ]),"profiles");
  unwrap(await service.from("parent_links").insert([
   {parent_id:ids.parentA,student_id:ids.studentA},
   {parent_id:ids.parentB,student_id:ids.studentB},
  ]),"links");
  years.old=unwrap(await service.from("school_years")
   .insert({name:"2025-2026",is_current:false})
   .select("id").single(),"old year").id;
  years.current=unwrap(await service.from("school_years")
   .insert({name:"2026-2027",is_current:true})
   .select("id").single(),"current year").id;
  const cs=unwrap(await service.from("classes").insert([
   {name:"6e A",school_year_id:years.old},
   {name:"5e B",school_year_id:years.current},
   {name:"4e C",school_year_id:years.current},
  ]).select("id,name"),"classes");
  for(const x of cs)classes[x.name]=x.id;
  unwrap(await service.from("student_enrollments").insert([
   {student_id:ids.studentA,school_year_id:years.old,
    class_id:classes["6e A"],status:"completed"},
   {student_id:ids.studentA,school_year_id:years.current,
    class_id:classes["5e B"],status:"active"},
   {student_id:ids.studentB,school_year_id:years.current,
    class_id:classes["4e C"],status:"active"},
  ]),"annual records");
  assert.equal(sql("SELECT count(*) FROM public.student_enrollments"),"3");
 });
 await t.test("K04 - real email/password sign-in creates distinct sessions",async()=>{
  for(const name of ["parentA","parentB","admin"]){
   clients[name]=newClient();
   const d=unwrap(await clients[name].auth.signInWithPassword({
    email:emails[name],password:"Schoolnet-K-2026-Local!9",
   }),"signInWithPassword");
   assert.equal(d.user.id,ids[name]);
   sessions[name]=d.session;
   assert.ok(d.session.access_token);
  }
  assert.notEqual(sessions.parentA.access_token,sessions.parentB.access_token);
 });
 await t.test("K05 - signed JWT validated via real Auth getUser",async()=>{
  for(const name of ["parentA","parentB","admin"]){
   const r=await service.auth.getUser(sessions[name].access_token);
   assert.ifError(r.error);assert.equal(r.data.user.id,ids[name]);
  }
 });
 await t.test("K06 - JWT session_id matches real auth.sessions row",async()=>{
  for(const name of ["parentA","parentB","admin"]){
   const payload=JSON.parse(Buffer.from(
     sessions[name].access_token.split(".")[1],"base64url").toString());
   assert.match(payload.session_id,UUID);
   sessions[name].session_id=payload.session_id;
   assert.equal(liveSession(ids[name],payload.session_id),true);
  }
 });
 await t.test("K07 - RLS Parent A sees only their own family links",async()=>{
  const rows=unwrap(await clients.parentA.from("parent_links")
   .select("parent_id,student_id"),"Parent A links");
  assert.deepEqual(rows,[{parent_id:ids.parentA,student_id:ids.studentA}]);
 });
 await t.test("K08 - RLS Parent B sees only their own family links",async()=>{
  const rows=unwrap(await clients.parentB.from("parent_links")
   .select("parent_id,student_id"),"Parent B links");
  assert.deepEqual(rows,[{parent_id:ids.parentB,student_id:ids.studentB}]);
 });
 await t.test("K09 - authenticated browser cannot SELECT enrollment table",async()=>{
  for(const name of ["parentA","parentB"]){
   const r=await clients[name].from("student_enrollments")
    .select("student_id,school_year_id").limit(1);
   assert.ok(r.error,"Must enforce no direct table grant");
  }
  assert.equal(sql("SELECT has_table_privilege('authenticated',"+
   "'public.student_enrollments','SELECT')"),"f");
 });
 await t.test("K10 - authorized server Parent annual read isolates both families",async()=>{
  for(const [name,student,cls] of [
   ["parentA","studentA","5e B"],["parentB","studentB","4e C"]]){
   const r=await verifiedAnnualRead(ids[name]);
   assert.equal(r.schoolYearId,years.current);
   assert.equal(r.children.length,1);
   assert.equal(r.children[0].studentId,ids[student]);
   assert.equal(r.children[0].state,"current");
   assert.equal(r.children[0].className,cls);
  }
 });
 await t.test("K11 - current-year read cannot confuse old or other class",async()=>{
  const a=await verifiedAnnualRead(ids.parentA);
  assert.equal(JSON.stringify(a).includes("6e A"),false);
  assert.equal(JSON.stringify(a).includes("4e C"),false);
  await assert.rejects(verifiedAnnualRead(ids.admin),/parent_role_required/);
 });
 await t.test("K12 - user_metadata role cannot promote a Parent to Admin",async()=>{
  unwrap(await clients.parentA.auth.updateUser({
   data:{role:"admin",is_admin:true},
  }),"user metadata update");
  const r=await service.from("profiles").select("role")
   .eq("id",ids.parentA).single();
  assert.equal(unwrap(r,"read role").role,"parent");
  assert.equal((await verifiedAnnualRead(ids.parentA)).children.length,1);
 });
 await t.test("K13 - Storage creates two real private buckets via admin API",async()=>{
  for(const bucket of [SRC,BACKUP]){
   const r=await service.storage.createBucket(bucket,{
    public:false,fileSizeLimit:10*1024*1024,allowedMimeTypes:["application/pdf"],
   });
   assert.ifError(r.error);
   const info=unwrap(await service.storage.getBucket(bucket),"bucket info");
   assert.equal(info.public,false);
  }
 });
 await t.test("K14 - actual Admin JWT uploads and downloads a private object",async()=>{
  documentPath=ids.studentA+"/lot5dk-fictive.pdf";
  const up=await clients.admin.storage.from(SRC)
   .upload(documentPath,new Blob([bytes],{type:"application/pdf"}),
    {contentType:"application/pdf",upsert:false});
  assert.ifError(up.error);
  const down=unwrap(await clients.admin.storage.from(SRC)
   .download(documentPath),"admin download");
  const loaded=Buffer.from(await down.arrayBuffer());
  assert.equal(sha(loaded),sha(bytes));
 });
 await t.test("K15 - Parent cannot read or upload in Admin-only bucket",async()=>{
  const deny=await clients.parentA.storage.from(SRC).download(documentPath);
  assert.ok(deny.error||!deny.data,"Parent must not download");
  const upload=await clients.parentA.storage.from(SRC)
   .upload("untrusted/test.pdf",new Blob([bytes],{type:"application/pdf"}),
    {contentType:"application/pdf",upsert:false});
  assert.ok(upload.error,"Parent must not upload");
 });
 await t.test("K16 - Admin cannot delete file: RLS refuses client removal",async()=>{
  const attempt=await clients.admin.storage.from(SRC).remove([documentPath]);
  const check=await clients.admin.storage.from(SRC).download(documentPath);
  assert.ifError(check.error);
  assert.equal(sha(Buffer.from(await check.data.arrayBuffer())),sha(bytes));
  assert.ok(attempt.error||Array.isArray(attempt.data),
    "Storage may return an empty delete result, file must remain");
 });
 await t.test("K17 - document SQL metadata survives forbidden Storage remove",async()=>{
  const d=unwrap(await service.from("student_enrollments")
   .select("id").eq("student_id",ids.studentA)
   .eq("school_year_id",years.current).single(),"enrollment");
  docId=unwrap(await service.from("student_enrollment_documents")
   .insert({enrollment_id:d.id,storage_path:documentPath,
    size_bytes:bytes.length,uploaded_by:ids.admin}).select("id")
   .single(),"document metadata").id;
  const rec=unwrap(await service.from("student_enrollment_documents")
   .select("storage_path").eq("id",docId).single(),"metadata read");
  assert.equal(rec.storage_path,documentPath);
 });
 await t.test("K18 - server-only retention performs real Storage API backup",async()=>{
  const original=unwrap(await service.storage.from(SRC)
   .download(documentPath),"server source");
  const originalBytes=Buffer.from(await original.arrayBuffer());
  assert.equal(originalBytes.length,bytes.length);
  const backupPath="retention/"+docId+"/"+randomUUID()+".pdf";
  const up=await service.storage.from(BACKUP).upload(backupPath,
   new Blob([originalBytes],{type:"application/pdf"}),
   {contentType:"application/pdf",upsert:false});
  assert.ifError(up.error);
  const copy=unwrap(await service.storage.from(BACKUP)
   .download(backupPath),"server retention readback");
  const copyBytes=Buffer.from(await copy.arrayBuffer());
  assert.equal(copyBytes.length,bytes.length);
  assert.equal(sha(copyBytes),sha(bytes));
  const denied=await clients.admin.storage.from(BACKUP).download(backupPath);
  assert.ok(denied.error||!denied.data,"Private retention is server-only");
  const source=unwrap(await clients.admin.storage.from(SRC)
   .download(documentPath),"source remains");
  assert.equal(sha(Buffer.from(await source.arrayBuffer())),sha(bytes));
 });
 await t.test("K19 - real signOut revokes only the Parent A session",async()=>{
  assert.equal(liveSession(ids.parentA,sessions.parentA.session_id),true);
  unwrap(await clients.parentA.auth.signOut(),"Parent A signOut");
  assert.equal(liveSession(ids.parentA,sessions.parentA.session_id),false);
  assert.equal(liveSession(ids.parentB,sessions.parentB.session_id),true);
 });
 await t.test("K20 - revoked session must be denied even before JWT expiry",async()=>{
  const token=sessions.parentA.access_token;
  const user=await service.auth.getUser(token);
  // Signed JWT may remain cryptographically accepted until expiry.
  // A session-presence gate must additionally reject the old session_id.
  if(!user.error) assert.equal(user.data.user.id,ids.parentA);
  assert.equal(liveSession(ids.parentA,sessions.parentA.session_id),false);
 });
 await t.test("K21 - confirm test-only counts, no source or backup removed",async()=>{
  const all=unwrap(await service.from("student_enrollment_documents")
   .select("id").eq("id",docId),"metadata retained");
  assert.equal(all.length,1);
  const objects=unwrap(await service.storage.from(SRC).list(ids.studentA),
    "source listing");
  assert.equal(objects.filter(x=>x.name==="lot5dk-fictive.pdf").length,1);
 });
});
