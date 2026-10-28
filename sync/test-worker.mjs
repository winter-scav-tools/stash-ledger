// Tests the worker with an in-memory stand-in for D1. Run: node test-worker.mjs
import worker from "./worker.js";
import assert from "node:assert/strict";
class FakeD1 { constructor(){this.rows=new Map()}
  prepare(sql){const db=this;return{bind(...a){return{
    async first(){const r=db.rows.get(a[a.length-1]);if(!r)return null;return {...r}},
    async run(){
      if(sql.startsWith("UPDATE saves SET seen")){const r=db.rows.get(a[1]);if(r)r.seen=a[0];return{meta:{changes:r?1:0}}}
      if(sql.startsWith("UPDATE saves SET data")){const [data,u,s,id,rev]=a;const r=db.rows.get(id);if(r&&r.rev===rev){Object.assign(r,{data,rev:rev+1,updated:u,seen:s});return{meta:{changes:1}}}return{meta:{changes:0}}}
      if(sql.startsWith("INSERT")){const [id,data,u,s]=a;db.rows.set(id,{data,rev:1,updated:u,seen:s});return{meta:{changes:1}}}
      if(sql.startsWith("DELETE FROM saves WHERE id")){db.rows.delete(a[0]);return{meta:{changes:1}}}
      if(sql.startsWith("DELETE FROM saves WHERE seen")){for(const[k,r]of db.rows)if(r.seen<a[0])db.rows.delete(k);return{meta:{}}}
      throw new Error("unexpected sql "+sql)}}}}}}
const env={DB:new FakeD1(),ALLOWED_ORIGINS:"https://winter-scav-tools.github.io"};
const O="https://winter-scav-tools.github.io",CODE="ABCD-EFGH-JKLM-NPQR-ST23";
const call=(method,{code=CODE,origin=O,body}={})=>worker.fetch(new Request("https://x/v1/save",{method,headers:{Origin:origin,"X-Sync-Code":code,"Content-Type":"application/json"},body}),env);
const j=async r=>({s:r.status,b:await r.json()});
let r;
r=await j(await call("GET"));assert.equal(r.s,404);
r=await j(await call("PUT",{body:JSON.stringify({data:{done:{a:1}},baseRev:0})}));assert.equal(r.s,201);assert.equal(r.b.rev,1);
r=await j(await call("GET"));assert.equal(r.s,200);assert.deepEqual(r.b.data,{done:{a:1}});assert.equal(r.b.rev,1);
// too fast
r=await j(await call("PUT",{body:JSON.stringify({data:{done:{b:1}},baseRev:1})}));assert.equal(r.s,429);
// age the row, then normal update
[...env.DB.rows.values()][0].updated-=5000;
r=await j(await call("PUT",{body:JSON.stringify({data:{done:{b:1}},baseRev:1})}));assert.equal(r.s,200);assert.equal(r.b.rev,2);
// stale device -> conflict with current data
[...env.DB.rows.values()][0].updated-=5000;
r=await j(await call("PUT",{body:JSON.stringify({data:{done:{c:1}},baseRev:1})}));assert.equal(r.s,409);assert.deepEqual(r.b.data,{done:{b:1}});assert.equal(r.b.rev,2);
// bad inputs
assert.equal((await call("GET",{code:"short"})).status,400);
assert.equal((await call("GET",{origin:"https://evil.example"})).status,403);
assert.equal((await call("PUT",{body:"x".repeat(40000)})).status,413);
assert.equal((await call("PUT",{body:"[1,2]"})).status,400);
assert.equal((await call("PUT",{body:"{nope"})).status,400);
// preflight
let p=await worker.fetch(new Request("https://x/v1/save",{method:"OPTIONS",headers:{Origin:O}}),env);assert.equal(p.status,204);assert.equal(p.headers.get("Access-Control-Allow-Origin"),O);
p=await worker.fetch(new Request("https://x/v1/save",{method:"OPTIONS",headers:{Origin:"https://evil.example"}}),env);assert.equal(p.status,403);assert.equal(p.headers.get("Access-Control-Allow-Origin"),null);
// db never stores the code
assert.ok(![...env.DB.rows.keys()].some(k=>k.includes(CODE)));assert.equal([...env.DB.rows.keys()][0].length,64);
// clean-up
[...env.DB.rows.values()][0].seen=Date.now()-181*864e5;await worker.scheduled({},env);assert.equal(env.DB.rows.size,0);
// delete
await call("PUT",{body:JSON.stringify({data:{x:1},baseRev:0})});r=await j(await call("DELETE"));assert.equal(r.s,200);assert.equal(env.DB.rows.size,0);
console.log("worker tests: all passed");
