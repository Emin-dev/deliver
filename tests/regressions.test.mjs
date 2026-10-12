import test from 'node:test';import assert from 'node:assert/strict';import {readFile,mkdtemp,symlink,rm,cp,writeFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import vm from 'node:vm';import {spawnSync} from 'node:child_process';
import {createHash,webcrypto} from 'node:crypto';
import {detectContainer,formatBytes,readPolicy,presets} from '../web/domain.js';
const root=new URL('../',import.meta.url);const js=await readFile(new URL('web/app.js',root),'utf8');const html=await readFile(new URL('web/index.html',root),'utf8');
function exactLineFunction(name){const line=js.split('\n').find(line=>line.startsWith(`function ${name}(`));assert.ok(line,`source function ${name}`);return line;}
function uiHarness(){const messages=[];const elements=new Map();const get=id=>{if(!elements.has(id))elements.set(id,{textContent:'',value:'old',hidden:false,focus(){this.focused=true;}});return elements.get(id);};const context=vm.createContext({$:get,stopCurrent(){},hideResults(){},resetManual(){},message(...args){messages.push(args);},observation:{},origin:'user_selected',metadataWarning:'old'});vm.runInContext(['announce','setProgress','resetFile','clearFile'].map(exactLineFunction).join('\n')+'\nthis.api={announce,setProgress,resetFile,clearFile};',context);return{...context,context,elements,messages,get};}
test('inspection reset never announces removal or steals chooser focus',()=>{const h=uiHarness();h.get('live-status').textContent='Previous result';h.api.resetFile();assert.equal(h.get('live-status').textContent,'Previous result');assert.equal(h.get('file-input').focused,undefined);assert.equal(h.get('drop-zone').hidden,false);assert.doesNotMatch(js,/async function inspect[^]*?\n  clearFile\(\);/);});
test('meaningful progress reaches the persistent accessible live channel',()=>{const h=uiHarness();h.api.setProgress('Inspecting local video. Up to 15 seconds.');assert.equal(h.get('live-status').textContent,h.get('progress-text').textContent);assert.match(html,/id="live-status"[^>]*role="status"[^>]*aria-live="polite"/);assert.match(js,/setProgress\(`Inspecting \$\{file.name\}/);assert.match(js,/setProgress\('Metadata inspection finished/);assert.match(js,/setProgress\('Loading the bundled generated sample/);});
test('explicit remove and cancel announce the actual action and return focus',()=>{for(const text of [undefined,'Inspection canceled. No report was created.']){const h=uiHarness();h.api.clearFile(text);assert.equal(h.get('live-status').textContent,text||'File removed. Choose another video.');assert.equal(h.get('file-input').focused,true);assert.equal(h.get('file-input').value,'');}});
test('deployment is explicit static, without dependency installation or Rust',async()=>{const c=JSON.parse(await readFile(new URL('vercel.json',root)));assert.equal(c.framework,null);assert.equal(c.buildCommand,'node scripts/static-smoke.mjs');assert.match(c.installCommand,/^node -e /);assert.doesNotMatch(c.installCommand,/npm|playwright|cargo/);const p=JSON.parse(await readFile(new URL('package.json',root)));assert.equal(p.scripts.build,'node scripts/static-smoke.mjs');assert.equal(p.scripts['build:wasm'],'bash scripts/build.sh');const result=spawnSync(process.execPath,['scripts/static-smoke.mjs'],{cwd:root,encoding:'utf8'});assert.equal(result.status,0,result.stderr);});
test('exact Rust target pin and standalone prerequisite error exist',async()=>{const pin=await readFile(new URL('rust-toolchain.toml',root),'utf8');assert.match(pin,/channel = "1\.99\.0"/);assert.match(pin,/targets = \["wasm32-unknown-unknown"\]/);const build=await readFile(new URL('scripts/build.sh',root),'utf8');assert.doesNotMatch(build,/\.\.\/tooling/);assert.match(build,/Rust is required to rebuild/);assert.match(build,/Expected Rust 1\.99\.0/);});

test('standalone WASM rebuild exits with useful instructions when Rust is absent',async()=>{const bin=await mkdtemp(join(tmpdir(),'deliver-no-rust-'));try{await symlink('/usr/bin/dirname',join(bin,'dirname'));const result=spawnSync('/bin/bash',[new URL('scripts/build.sh',root).pathname],{env:{...process.env,PATH:bin},encoding:'utf8'});assert.equal(result.status,1);assert.match(result.stderr,/Install Rust 1\.99\.0 with the wasm32-unknown-unknown target/);assert.doesNotMatch(result.stderr,/tooling\/env/);}finally{await rm(bin,{recursive:true,force:true});}});
test('deployment smoke rejects a truncated public license bundle',async()=>{const fixture=await mkdtemp(join(tmpdir(),'deliver-license-test-'));try{for(const name of ['scripts','web','third-party','Cargo.lock','THIRD-PARTY-NOTICES.txt']) await cp(new URL(name,root),join(fixture,name),{recursive:true});await writeFile(join(fixture,'web/THIRD-PARTY-NOTICES.txt'),'truncated');const result=spawnSync(process.execPath,['scripts/static-smoke.mjs'],{cwd:fixture,encoding:'utf8'});assert.notEqual(result.status,0);assert.match(result.stderr,/served notices match source/);}finally{await rm(fixture,{recursive:true,force:true});}});
test('decorative icons are local accessible-hidden vectors, not font glyphs',()=>{const icons=[...html.matchAll(/<svg class="ui-icon"[^>]*>[\s\S]*?<\/svg>/g)].map(match=>match[0]);assert.equal(icons.length,14);for(const icon of icons){assert.match(icon,/viewBox="0 0 24 24"/);assert.match(icon,/aria-hidden="true"/);assert.match(icon,/focusable="false"/);assert.doesNotMatch(icon,/<(?:text|image|use|script)\b|\bhref=/);assert.match(icon,/<(?:path|circle)\b/);}assert.doesNotMatch(html,/>\s*[↗●✳▶▷×→◌☷↓]\s*</);assert.match(html,/id="clear"[^>]*aria-label="Remove selected file"/);assert.match(html,/Export JSON report/);});
test('report status changes preserve the inline vector and existing meaning',async()=>{assert.match(js,/\$\('result-icon'\)\.dataset\.state = report\.fail \? 'fail' : 'review';/);assert.doesNotMatch(js,/\$\('result-icon'\)\.(?:textContent|innerHTML)/);const css=await readFile(new URL('web/styles.css',root),'utf8');assert.match(css,/\.result-icon \.status-fail\{display:none\}/);assert.match(css,/\.result-icon\[data-state="fail"\] \.status-review\{display:none\}/);assert.match(css,/\.result-icon\[data-state="fail"\] \.status-fail\{display:inline\}/);});

// Execute the unchanged application functions and real WASM with deterministic
// media events/timers. These are lifecycle regressions, not browser decoding tests.
async function mediaHarness(){
  const elements=new Map(),probes=[],created=[],revoked=[],timers=new Map();let timerId=0;
  function element(){return{textContent:'',value:'',hidden:false,disabled:false,dataset:{},attributes:new Map(),srcAssignments:[],children:[],classList:{add(){},remove(){},toggle(){}},append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;},focus(){this.focused=true;},pause(){this.pauses=(this.pauses||0)+1;},load(){this.loads=(this.loads||0)+1;},removeAttribute(name){this.attributes.delete(name);},getAttribute(name){return this.attributes.get(name)??null;},set src(value){this.attributes.set('src',value);this.srcAssignments.push(value);},get src(){return this.getAttribute('src')||'';}};}
  const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);};
  class Reader{
    readAsArrayBuffer(blob){blob.arrayBuffer().then(result=>{if(!this.aborted){this.result=result;this.onload?.();}},()=>this.onerror?.());}
    abort(){this.aborted=true;this.onabort?.();}
  }
  const context=vm.createContext({TextEncoder,TextDecoder,File,FileReader:Reader,AbortController,DOMException,crypto:webcrypto,detectContainer,formatBytes,readPolicy,presets,
    document:{getElementById:get,querySelector:get,createElement(tag){const el=element();if(tag==='video')probes.push(el);return el;}},
    URL:{createObjectURL(file){const url=`blob:test-${created.length}`;created.push({url,file});return url;},revokeObjectURL(url){revoked.push(url);}},
    setTimeout(fn,delay){const id=++timerId;timers.set(id,{fn,delay});return id;},clearTimeout(id){timers.delete(id);},
    engineExports:(await WebAssembly.instantiate(await readFile(new URL('web/assets/deliver_core.wasm',root)),{})).instance.exports,
  });
  const functions=js.slice(js.indexOf('\n')+1,js.indexOf('\nfor (const [id, title] of manualItems)'));
  vm.runInContext(functions+'\nengine=engineExports; this.api={inspect,clearFile,policyChanged,getReport:()=>report};',context);
  get('preset').value='hd';for(const id of ['width','height','min-duration','max-duration','max-size','container'])get(id).value=String(presets.hd[id]);
  const sample=await readFile(new URL('web/assets/sample.mp4',root));
  async function start(name){const index=probes.length;const task=context.api.inspect(new File([sample],name,{type:'video/mp4'}));for(let n=0;n<100&&probes.length===index;n++)await new Promise(resolve=>setImmediate(resolve));assert.equal(probes.length,index+1,'metadata probe started');return{task,probe:probes[index]};}
  return{get,probes,created,revoked,timers,sample,api:context.api,start,timeout(){assert.equal(timers.size,1);const timer=[...timers.values()][0];assert.equal(timer.delay,15000);timer.fn();},loaded(probe){probe.videoWidth=1920;probe.videoHeight=1080;probe.duration=6;probe.onloadedmetadata();}};
}
function assertReleasedProbe(h,probe){assert.equal(probe.getAttribute('src'),null);assert.equal(probe.loads,1);assert.equal(probe.onloadedmetadata,null);assert.equal(probe.onerror,null);assert.ok(h.revoked.includes(probe.srcAssignments[0]));assert.equal(h.timers.size,0);}
function assertNoPreview(h){assert.equal(h.get('preview').getAttribute('src'),null);assert.equal(h.get('preview').hidden,true);assert.equal(h.get('preview-note').hidden,true);}
for(const failure of ['error','timeout'])test(`metadata ${failure} releases its source without starting a hidden preview`,async()=>{
  const h=await mediaHarness();const {task,probe}=await h.start(`${failure}.mp4`);
  if(failure==='error')probe.onerror();else h.timeout();await task;
  assertReleasedProbe(h,probe);assertNoPreview(h);assert.equal(h.created.length,1);assert.equal(h.get('preview').srcAssignments.length,0);
  assert.equal(h.get('results').hidden,false);assert.equal(h.get('export').disabled,false);assert.match(h.get('session-note').textContent,/Dimensions and duration remain unknown/);
  const report=h.api.getReport();assert.equal(report.unknown,8);assert.equal(report.asset.width,null);assert.equal(report.asset.height,null);assert.equal(report.asset.duration_seconds,null);assert.equal(report.asset.sha256,createHash('sha256').update(h.sample).digest('hex'));
  h.api.policyChanged();assertNoPreview(h);assert.equal(h.created.length,1);h.api.clearFile();assertNoPreview(h);assert.equal(h.get('export').disabled,true);
  const valid=await h.start('recovered.mp4');h.loaded(valid.probe);await valid.task;assertReleasedProbe(h,valid.probe);assert.equal(h.get('preview').hidden,false);assert.equal(h.get('preview-note').hidden,false);assert.equal(h.api.getReport().unknown,5);
  const preview=h.get('preview').getAttribute('src');assert.ok(preview);h.api.clearFile();assert.equal(h.get('preview').getAttribute('src'),null);assert.ok(h.revoked.includes(preview));assert.equal(h.revoked.length,h.created.length);
});
test('new selection revokes a valid preview and failed replacement stays source-free',async()=>{
  const h=await mediaHarness();const first=await h.start('valid.mp4');h.loaded(first.probe);await first.task;const url=h.get('preview').getAttribute('src');assert.ok(url);assert.equal(h.get('preview').hidden,false);assert.equal(h.api.getReport().pass,6);
  const replacement=await h.start('replacement.mp4');assert.ok(h.revoked.includes(url));assertNoPreview(h);replacement.probe.onerror();await replacement.task;assertNoPreview(h);assert.equal(h.api.getReport().asset.filename,'replacement.mp4');assert.equal(h.created.length,3);assert.equal(h.revoked.length,3);
});
test('clear or newer selection aborts pending metadata and rejects stale completion',async()=>{
  for(const action of ['clear','replace']){
    const h=await mediaHarness();const old=await h.start('old.mp4');const lateLoaded=old.probe.onloadedmetadata;
    let next;if(action==='clear')h.api.clearFile();else next=await h.start('new.mp4');await old.task;
    assert.equal(old.probe.getAttribute('src'),null);assert.equal(old.probe.onloadedmetadata,null);assert.ok(h.revoked.includes(old.probe.srcAssignments[0]));assertNoPreview(h);
    lateLoaded();assert.equal(h.get('results').hidden,true);assert.equal(h.get('export').disabled,true);
    if(next){h.loaded(next.probe);await next.task;assert.equal(h.api.getReport().asset.filename,'new.mp4');assert.equal(h.get('preview').hidden,false);h.api.clearFile();}
    assert.equal(h.timers.size,0);assert.equal(h.revoked.length,h.created.length);
  }
});
