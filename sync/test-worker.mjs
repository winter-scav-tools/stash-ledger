// Tests the worker with an in-memory stand-in for D1. Run: node test-worker.mjs
import worker from "./worker.js";
import assert from "node:assert/strict";
class FakeD1 { constructor(){this.rows=new Map()}
  prepare(sql){const db=this;return{bind(...a){return{
    async first(){const r=db.rows.get(a[a.length-1]);if(!r)return null;return {...r}},
    async run(){
      if(db.beforeRun){const f=db.beforeRun;db.beforeRun=null;f(sql,a)}  // lets a test slip in "another device" just before a write
      if(sql.startsWith("UPDATE saves SET seen")){const r=db.rows.get(a[1]);if(r)r.seen=a[0];return{meta:{changes:r?1:0}}}
      if(sql.startsWith("UPDATE saves SET data")){const [data,u,s,id,rev]=a;const r=db.rows.get(id);if(r&&r.rev===rev){Object.assign(r,{data,rev:rev+1,updated:u,seen:s});return{meta:{changes:1}}}return{meta:{changes:0}}}
      if(sql.startsWith("INSERT")){const [id,data,u,s]=a;if(db.rows.has(id))return{meta:{changes:0}};db.rows.set(id,{data,rev:1,updated:u,seen:s});return{meta:{changes:1}}}
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
// a read only refreshes "seen" when it's a day old
await call("PUT",{body:JSON.stringify({data:{x:1},baseRev:0})});let row=[...env.DB.rows.values()][0];
row.seen=Date.now()-3600e3;let before=row.seen;await call("GET");assert.equal(row.seen,before);
row.seen=Date.now()-2*864e5;await call("GET");assert.ok(row.seen>Date.now()-5000);
await call("DELETE");
// rate limits: a fake limiter per binding, counting per IP key
const fakeLimit=n=>{const seen=new Map();return{async limit({key}){seen.set(key,(seen.get(key)||0)+1);return{success:seen.get(key)<=n}},seen}};
env.LIMITER=fakeLimit(4);env.CREATE_LIMITER=fakeLimit(1);
const code=i=>"ABCD-EFGH-JKLM-NPQR-"+"23456"[i]+"AAA";
assert.equal((await call("PUT",{code:code(0),body:JSON.stringify({data:{x:1},baseRev:0})})).status,201);
assert.equal((await call("PUT",{code:code(1),body:JSON.stringify({data:{x:1},baseRev:0})})).status,429); // 2nd new save: create limit
assert.equal(env.DB.rows.size,1);
assert.equal((await call("GET",{code:code(0)})).status,200);                                          // reads don't touch the create limit
assert.equal(env.CREATE_LIMITER.seen.get("unknown"),2);
assert.equal((await call("GET",{code:code(0)})).status,200);
assert.equal((await call("GET",{code:code(0)})).status,429);                                          // 5th request: general limit
assert.equal(env.DB.rows.size,1);
// updating an existing save, or a missing save with baseRev>0, doesn't use the create limit; another IP has its own count
env.LIMITER=fakeLimit(99);env.CREATE_LIMITER=fakeLimit(1);
[...env.DB.rows.values()][0].updated-=5000;
assert.equal((await call("PUT",{code:code(0),body:JSON.stringify({data:{x:2},baseRev:1})})).status,200);
assert.equal((await call("PUT",{code:code(2),body:JSON.stringify({data:{x:2},baseRev:3})})).status,404);
assert.equal(env.CREATE_LIMITER.seen.size,0);
const callIp=(ip,c)=>worker.fetch(new Request("https://x/v1/save",{method:"PUT",headers:{Origin:O,"X-Sync-Code":c,"CF-Connecting-IP":ip},body:JSON.stringify({data:{x:1},baseRev:0})}),env);
assert.equal((await callIp("1.1.1.1",code(3))).status,201);
assert.equal((await callIp("1.1.1.1",code(4))).status,429);
assert.equal((await callIp("2.2.2.2",code(4))).status,201);
// a limiter that errors lets the request through
env.LIMITER={async limit(){throw new Error("down")}};
assert.equal((await call("GET",{code:code(0)})).status,200);
delete env.LIMITER;delete env.CREATE_LIMITER;env.DB.rows.clear();
// race on update: another device saves between the check and the write -> 409 with that device's data
await call("PUT",{body:JSON.stringify({data:{a:1},baseRev:0})});row=[...env.DB.rows.values()][0];row.updated-=5000;
env.DB.beforeRun=()=>{row.rev=2;row.data=JSON.stringify({other:1})};
r=await j(await call("PUT",{body:JSON.stringify({data:{a:2},baseRev:1})}));assert.equal(r.s,409);assert.deepEqual(r.b.data,{other:1});assert.equal(r.b.rev,2);
// race on create: two devices create the same code at once -> second gets 409 with the first one's save, not a crash
env.DB.rows.clear();
env.DB.beforeRun=(sql,a)=>{env.DB.rows.set(a[0],{data:JSON.stringify({first:1}),rev:1,updated:1,seen:1})};
r=await j(await call("PUT",{body:JSON.stringify({data:{second:1},baseRev:0})}));assert.equal(r.s,409);assert.deepEqual(r.b.data,{first:1});
// race where the save is deleted in between -> 404, not a crash
row=[...env.DB.rows.values()][0];row.updated-=5000;env.DB.beforeRun=()=>env.DB.rows.clear();
assert.equal((await call("PUT",{body:JSON.stringify({data:{a:3},baseRev:1})})).status,404);
// big body refused from its Content-Length before reading
assert.equal((await worker.fetch(new Request("https://x/v1/save",{method:"PUT",headers:{Origin:O,"X-Sync-Code":CODE,"Content-Length":"999999"},body:"{}"}),env)).status,413);
// database down -> 503 that still carries CORS headers
const realDB=env.DB;env.DB={prepare(){throw new Error("D1 down")}};
let e=await call("GET");assert.equal(e.status,503);assert.equal(e.headers.get("Access-Control-Allow-Origin"),O);assert.equal((await e.json()).error,"server problem");
env.DB=realDB;
console.log("worker tests: all passed");
