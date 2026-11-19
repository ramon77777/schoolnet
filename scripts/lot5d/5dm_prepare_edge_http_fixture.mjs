// SCHOOLNET 5D-M: copy exactly the existing Edge source to a disposable
// Supabase CLI Docker stack. NEVER modify the repository's config.toml,
// never link a hosted project, never download real records or cloud keys.
import assert from "node:assert/strict";
import {cp,readFile,writeFile,mkdir} from "node:fs/promises";
import {resolve,join,relative} from "node:path";
const runner=process.env.RUNNER_TEMP??"";
const repo=process.env.GITHUB_WORKSPACE??"";
const dest=resolve(process.argv[2]??"");
const expected=resolve(runner,"schoolnet-5dm-stack");
if(process.env.CI!=="true"||!runner||!repo||dest!==expected)
 throw Error("5D-M: only GitHub Actions disposable scratch directory");
for(const name of ["SUPABASE_ACCESS_TOKEN","SUPABASE_DB_URL","DATABASE_URL",
  "SUPABASE_PROJECT_ID","VITE_SUPABASE_URL"]){
 if(process.env[name])throw Error("5D-M: external Supabase credentials are forbidden");
}
const files=[
 "supabase/functions/schoolnet-parent-current-class/index.ts",
 "supabase/functions/_shared/lot5diParentAnnualRead.ts",
 "supabase/functions/_shared/lot5dlParentSessionGate.ts",
 "src/features/parent/lib/parentYearClassProposal.ts",
];
const srcEdge=await readFile(join(repo,files[0]),"utf8");
assert.match(srcEdge,/EXPECTED_PROJECT = "https:\/\/anttmbhaphkhmkoqsofd\.supabase\.co"/);
assert.match(srcEdge,/SCHOOLNET_LOT5DM_DISPOSABLE_EDGE_HTTP/);
for(const f of files){
 const relativePath=relative(repo,join(repo,f));
 if(relativePath!==f)throw Error("refuse path traversal");
 await mkdir(join(dest,f.split("/").slice(0,-1).join("/")),{recursive:true});
 await cp(join(repo,f),join(dest,f));
 const src=await readFile(join(repo,f));
 const actual=await readFile(join(dest,f));
 assert.deepEqual(actual,src);
}
// supabase init --yes MUST have created this local file already.
const config=join(dest,"supabase/config.toml");
const cfg=await readFile(config,"utf8");
if(cfg.includes("[functions.schoolnet-parent-current-class]"))
 throw Error("Refuse to reuse an existing function config in scratch");
await writeFile(config,cfg+
 "\n# 5D-M disposable GitHub Actions HTTP-only configuration.\n"+
 "[functions.schoolnet-parent-current-class]\n"+
 "enabled = true\n"+
 // The gateway skips JWT verification ONLY in disposable test config
 // so malformed and revoked Bearer tokens reach our real Edge code.
 // Real Auth getUser + private SQL session guard remain mandatory.
 "verify_jwt = false\n"+
 'entrypoint = "./functions/schoolnet-parent-current-class/index.ts"\n');
await mkdir(join(dest,"supabase/functions"),{recursive:true});
await writeFile(join(dest,"supabase/functions/.env"),
 "SCHOOLNET_LOT5DI_PARENT_READ_ENABLED=true\n"+
 "SCHOOLNET_LOT5DM_DISPOSABLE_EDGE_HTTP=loopback-fixture-20261119\n",
 {mode:0o600});
console.log("5D-M: source Edge copied byte-for-byte; local-only function config prepared.");
