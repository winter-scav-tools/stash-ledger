// Local test server: serves the page and runs the worker with an in-memory DB.
import http from "node:http";import fs from "node:fs";import worker from "./worker.js";
const PAGE=process.argv[2],PORT=+process.argv[3]||8787;
class FakeD1{constructor(){this.rows=new Map()}prepare(sql){const db=this;return{bind(...a){return{
 async first(){const r=db.rows.get(a[a.length-1]);return r?{...r}:null},
 async run(){if(sql.startsWith("UPDATE saves SET seen")){const r=db.rows.get(a[1]);if(r)r.seen=a[0];return{meta:{changes:r?1:0}}}
  if(sql.startsWith("UPDATE saves SET data")){const[data,u,s,id,rev]=a;const r=db.rows.get(id);if(r&&r.rev===rev){Object.assign(r,{data,rev:rev+1,updated:u,seen:s});return{meta:{changes:1}}}return{meta:{changes:0}}}
  if(sql.startsWith("INSERT")){const[id,data,u,s]=a;db.rows.set(id,{data,rev:1,updated:u,seen:s});return{meta:{changes:1}}}
  if(sql.startsWith("DELETE FROM saves WHERE id")){db.rows.delete(a[0]);return{meta:{changes:1}}}return{meta:{}}}}}}}}
const env={DB:new FakeD1(),ALLOWED_ORIGINS:`http://localhost:${PORT}`};
http.createServer(async(req,res)=>{
  if(req.url.startsWith("/v1/")){const chunks=[];for await(const c of req)chunks.push(c);const body=Buffer.concat(chunks);
    const r=await worker.fetch(new Request("http://localhost"+req.url,{method:req.method,headers:req.headers,body:["GET","HEAD","OPTIONS"].includes(req.method)?undefined:body}),env);
    res.writeHead(r.status,Object.fromEntries(r.headers));res.end(Buffer.from(await r.arrayBuffer()));return}
  res.writeHead(404);res.end()}).listen(PORT+1); // API on its own port: cross-origin, like github.io -> workers.dev
http.createServer(async(req,res)=>{
  if(req.url==="/__db"){res.end(JSON.stringify([...env.DB.rows.values()].map(r=>({rev:r.rev,data:JSON.parse(r.data)}))));return}
  let html=fs.readFileSync(PAGE,"utf8").replace('const SYNC_API="";',`const SYNC_API="http://localhost:${PORT+1}";`);
  res.writeHead(200,{"Content-Type":"text/html; charset=utf-8"});res.end(html);
}).listen(PORT,()=>console.log("listening "+PORT));
