// SCHOOLNET Lot 5D-N: stage exactly the existing Edge source inside an
// isolated GitHub Actions Supabase CLI stack, with JWT verification ENABLED.
// NEVER modify the repository config.toml, connect to hosted Supabase,
// or copy any production data/keys. The whole folder is disposable.
import assert from "node:assert/strict";
import {cp,readFile,writeFile,mkdir} from "node:fs/promises";
import {resolve,join,relative} from "node:path";
const runner=process.env.RUNNER_TEMP??"";
const repo=process.env.GITHUB_WORKSPACE??"";
const dest=resolve(process.argv[2]??"");
const expected=resolve(runner,"schoolnet-5dn-stack");
if(process.env.CI!=="true"||!runner||!repo||dest!==expected)
 throw Error("5D-N: only GitHub Actions disposable scratch directory");
for(const name of ["SUPABASE_ACCESS_TOKEN","SUPABASE_DB_URL","DATABASE_URL",
 "SUPABASE_PROJECT_ID","VITE_SUPABASE_URL"]){
 if(process.env[name])throw Error("5D-N: hosted Supabase credentials forbidden");
}
const files=[
 "supabase/functions/schoolnet-parent-current-class/index.ts",
 "supabase/functions/_shared/lot5diParentAnnualRead.ts",
 "supabase/functions/_shared/lot5dlParentSessionGate.ts",
 "src/features/parent/lib/parentYearClassProposal.ts",
];
const edge=await readFile(join(repo,files[0]),"utf8");
assert.match(edge,/EXPECTED_PROJECT = "https:\/\/anttmbhaphkhmkoqsofd\.supabase\.co"/);
assert.match(edge,/SCHOOLNET_LOT5DM_DISPOSABLE_EDGE_HTTP/);
for(const path of files){
 if(relative(repo,join(repo,path))!==path)throw Error("N: path traversal");
 await mkdir(join(dest,path.split("/").slice(0,-1).join("/")),{recursive:true});
 await cp(join(repo,path),join(dest,path));
 assert.deepEqual(await readFile(join(dest,path)),await readFile(join(repo,path)));
}
const config=join(dest,"supabase/config.toml");
const original=await readFile(config,"utf8");
if(original.includes("[functions.schoolnet-parent-current-class]"))
 throw Error("N: scratch function already configured");
await writeFile(config,original+
 "\n# SCHOOLNET 5D-N: disposable local HTTP fixture with gateway JWT ON.\n"+
 "[functions.schoolnet-parent-current-class]\n"+
 "enabled = true\n"+
 "verify_jwt = true\n"+
 'entrypoint = "./functions/schoolnet-parent-current-class/index.ts"\n');
const after=await readFile(config,"utf8");
assert.match(after,/\[functions\.schoolnet-parent-current-class\][\s\S]*?verify_jwt = true/);
await mkdir(join(dest,"supabase/functions"),{recursive:true});
await writeFile(join(dest,"supabase/functions/.env"),
 "SCHOOLNET_LOT5DI_PARENT_READ_ENABLED=true\n"+
 "SCHOOLNET_LOT5DM_DISPOSABLE_EDGE_HTTP=loopback-fixture-20261119\n",
 {mode:0o600});
console.log("5D-N: byte-identical Edge copied; disposable gateway JWT verification TRUE.");
