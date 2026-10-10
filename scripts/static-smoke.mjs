// Deployment-safe: Node built-ins only, no Cargo, npm install, browser, or network.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
for(const path of ['web/index.html','web/styles.css','web/app.js','web/domain.js','web/assets/sample.mp4','web/assets/favicon.svg']) assert.ok((await read(path)).length>0,`${path} exists`);
const lock=await read('Cargo.lock');
const licenses=JSON.parse(await read('third-party/manifest.json'));
assert.equal(licenses.cargo_lock_sha256,sha(lock),'license manifest matches the exact dependency lockfile');
const deps=lock.toString().split('[[package]]').slice(1).map(block=>({name:block.match(/name = "([^"]+)"/)[1],version:block.match(/version = "([^"]+)"/)[1],registry:block.includes('source = "registry+')})).filter(p=>p.registry);
assert.deepEqual(licenses.packages.map(p=>`${p.name}@${p.version}`).sort(),deps.map(p=>`${p.name}@${p.version}`).sort(),'all pinned crates have notices');
const servedNotices=await read('web/THIRD-PARTY-NOTICES.txt');
assert.ok(servedNotices.equals(await read('THIRD-PARTY-NOTICES.txt')),'served notices match source');
for(const dependency of licenses.packages){
 assert.ok(dependency.files.length,`${dependency.name} has license files`);
 assert.ok(servedNotices.toString().includes(`${dependency.name} ${dependency.version}\n`),`${dependency.name} version is attributed`);
 for(const file of dependency.files){const bytes=await read(file.path);assert.equal(sha(bytes),file.sha256,`${file.path} retains upstream bytes`);assert.ok(servedNotices.toString().includes(bytes.toString()),`${file.path} is included verbatim in public notices`);}
}
const rust=licenses.rust_standard_library;
assert.equal(rust.toolchain,'1.99.0');
assert.equal(sha(await read(rust.path)),rust.sha256);
assert.ok((await read(rust.served_path)).equals(await read(rust.path)),'standard-library notices ship unmodified');
const binary=await read('web/assets/deliver_core.wasm');
assert.doesNotMatch(binary.toString('latin1'),/\/(?:workspace|home|root|tmp)\//,'distributed WASM contains no machine-specific workspace, home, or temporary paths');
assert.deepEqual([...binary.subarray(0,8)],[0,97,115,109,1,0,0,0],'prebuilt WASM magic/version');
const {instance}=await WebAssembly.instantiate(binary,{});const e=instance.exports;
const request={policy:{id:'static-smoke',version:1,title:'Static deployment smoke',width:1920,height:1080,min_duration_seconds:1,max_duration_seconds:120,max_bytes:67108864,container:'mp4'},asset:{filename:'smoke.mp4',bytes:1000,container:'mp4',width:1920,height:1080,duration_seconds:6,sha256:'a'.repeat(64)}};
const bytes=new TextEncoder().encode(JSON.stringify(request));const ptr=e.allocate(bytes.length);assert.ok(ptr);new Uint8Array(e.memory.buffer,ptr,bytes.length).set(bytes);let packed;try{packed=e.evaluate(ptr,bytes.length);}finally{e.release(ptr,bytes.length);}const out=Number(packed&0xffffffffn),length=Number(packed>>32n);let result;try{result=JSON.parse(new TextDecoder().decode(new Uint8Array(e.memory.buffer,out,length)));}finally{e.release(out,length);}
assert.equal(result.ok,true);assert.equal(result.report.engine,'deliver-core/0.1.0');assert.deepEqual([result.report.pass,result.report.fail,result.report.unknown],[6,0,5]);
console.log(`Static bundle passed: real WASM executes; ${deps.length} pinned crate notices and Rust 1.99.0 standard-library notices are packaged.`);
