export const presets = {
  hd:{id:'hd-review',title:'HD review copy',version:1,width:1920,height:1080,'min-duration':1,'max-duration':120,'max-size':64,container:'mp4',description:'A 1920 × 1080 MP4 review copy, between 1 second and 2 minutes.'},
  vertical:{id:'vertical-social',title:'Vertical social',version:1,width:1080,height:1920,'min-duration':1,'max-duration':60,'max-size':32,container:'mp4',description:'A 1080 × 1920 vertical MP4, between 1 and 60 seconds. An illustrative customer requirement.'},
  web:{id:'web-preview',title:'Web preview',version:1,width:1280,height:720,'min-duration':1,'max-duration':30,'max-size':16,container:'webm',description:'A 1280 × 720 WebM preview, between 1 and 30 seconds.'},
};
export function formatBytes(n) { if (n < 1024) return `${n} bytes`; if (n < 1048576) return `${(n / 1024).toFixed(1)} KiB`; return `${(n / 1048576).toFixed(2)} MiB`; }
export function readPolicy(v) {
  const number = (id,min,max,integer=false) => { const n = Number(v[id]); if (!String(v[id]).trim() || !Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) throw new Error(`Check ${id.replaceAll('-',' ')}: use ${integer ? 'a whole number' : 'a number'} from ${min} to ${max}.`); return n; };
  const custom = v.preset === 'custom'; const preset = presets[v.preset];
  if (!custom && !preset) throw new Error('Choose a supported requirement set.');
  const p = { id:custom?'custom':preset.id, version:custom?number('policy-version',1,999999,true):preset.version, title:custom?v['policy-name'].trim():preset.title, width:number('width',1,16384,true),height:number('height',1,16384,true), min_duration_seconds:number('min-duration',0,86400),max_duration_seconds:number('max-duration',0.001,86400),max_bytes:Math.floor(number('max-size',0.001,64)*1048576),container:v.container };
  if (!p.title || new TextEncoder().encode(p.title).length > 160) throw new Error('Add a policy title up to 160 UTF-8 bytes.');
  if (p.min_duration_seconds > p.max_duration_seconds) throw new Error('Minimum duration cannot exceed maximum duration.');
  if (!['mp4','webm'].includes(p.container)) throw new Error('Choose MP4 or WebM.');
  return p;
}
function text(bytes,start,end) { return String.fromCharCode(...bytes.subarray(start,end)); }
function vint(bytes,offset,id=false) {
  const first=bytes[offset]; if (!first) return null; let mask=128,length=1;
  while (!(first&mask) && length<=8) { mask>>=1; length++; }
  if (length>8 || (id && length>4) || offset+length>bytes.length) return null;
  let value=id?first:first&(mask-1);
  for(let i=1;i<length;i++) value=value*256+bytes[offset+i];
  if (!Number.isSafeInteger(value)) return null;
  return {value,length};
}
export function detectContainer(bytes) {
  // A conservative signature only, never a MIME assertion or full container validation.
  if(bytes.length>=16 && text(bytes,4,8)==='ftyp') {
    const length=bytes[0]*16777216+bytes[1]*65536+bytes[2]*256+bytes[3];
    const brand=text(bytes,8,12);
    if(length>=16 && length<=bytes.length && ['isom','iso2','iso3','iso4','iso5','iso6','mp41','mp42','avc1','dash','M4V '].includes(brand)) return 'mp4';
  }
  if(bytes.length>=8 && bytes[0]===0x1a && bytes[1]===0x45 && bytes[2]===0xdf && bytes[3]===0xa3) {
    const size=vint(bytes,4); if(!size) return 'unknown'; let pos=4+size.length; const end=pos+size.value;
    if(end>bytes.length || end>65536) return 'unknown';
    while(pos<end) { const id=vint(bytes,pos,true); if(!id) break; pos+=id.length; const size=vint(bytes,pos); if(!size) break; pos+=size.length; if(pos+size.value>end) break; if(id.value===0x4282) return text(bytes,pos,pos+size.value)==='webm'?'webm':'unknown'; pos+=size.value; }
  }
  return 'unknown';
}
