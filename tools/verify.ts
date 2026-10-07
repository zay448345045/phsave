import fs from 'fs'
import path from 'path'
import { PhigrosSave } from '../src/save'

const save = new PhigrosSave(fs.readFileSync(process.argv[2]))
function norm(s:string){return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9\u3400-\u9fff\u3040-\u30ff\uff66-\uff9f]/g,'')}

const info: {id:string,name:string,diffs:number[]}[] = []
{
  const text=fs.readFileSync(path.join(__dirname,'phi_info.csv'),'utf8')
  const lines=text.split(/\r?\n/).filter(l=>l.trim())
  const header=lines[0].split('\t'); const col=(n:string)=>header.indexOf(n)
  for(let i=1;i<lines.length;i++){const c=lines[i].split('\t')
    const diffs:number[]=[]; ['EZ','HD','IN','AT'].forEach((d,idx)=>{ if((c[col(d)]??'').trim()) diffs.push(idx) })
    info.push({id:c[col('id')].trim(),name:(c[col('song')]??'').replace(/\r$/,''),diffs})
  }
}
const avatars=fs.readFileSync(path.join(__dirname,'phi_avatars.txt'),'utf8').split(/\r?\n/).map(s=>s.trim()).filter(Boolean)

const records=save.gameRecord.records as any[]
const recById=new Map(records.map(r=>[r.songName.replace(/\.0$/,''),r]))
const gk=save.gameKey.keys as any[]
const gkNames=new Set(gk.map(k=>k.songName))
const gkNorm=new Map<string,any[]>()
for(const k of gk){ const n=norm(k.songName); if(!gkNorm.has(n)) gkNorm.set(n,[]); gkNorm.get(n)!.push(k) }
function findGk(name:string):any[]{
  if(gkNames.has(name)) return gk.filter(k=>k.songName===name)
  const n=norm(name)
  for(const [gn,ks] of gkNorm){ if(gn.length>=3 && (gn===n||(n.length>=4&&(gn.startsWith(n)||n.startsWith(gn))))) return ks }
  return []
}
function slots(k:any){const e=k.values[0];const a=[0,0,0,0,0];let vi=1;for(let b=0;b<5;b++)if((e>>b)&1)a[b]=k.values[vi++];return a}

let fail=0
// 1) 每首歌 AP
for(const s of info){
  const r=recById.get(s.id)
  if(!r){ console.log('❌ 无记录:',s.id); fail++; continue }
  const hasBit4=(r.records.levelExsistanceFlag&(1<<4))!==0
  for(const d of s.diffs){
    if(d===3&&hasBit4) continue
    const lv=r.records.levelRecords[d]
    if(!lv){ console.log('❌ 缺难度:',s.id,'d'+d); fail++; continue }
    if(lv.score!==1000000||lv.accuracy!==100){ console.log('❌ 非满分:',s.id,'d'+d,lv.score,lv.accuracy); fail++ }
  }
}
// 2) 每首歌有曲绘条目
for(const s of info){
  const ks=findGk(s.name)
  if(ks.length===0){ console.log('❌ 无 gameKey 条目:',s.name); fail++; continue }
  if(!ks.some(k=>slots(k)[3])){ console.log('❌ 无曲绘:',s.name); fail++ }
}
// 3) 头像
for(const a of avatars){
  const ks=findGk(a)
  if(!ks.some(k=>slots(k)[4])){ console.log('❌ 头像未解锁:',a); fail++ }
}
// 4) 收集品：按游戏真实清单校验
const collDefs=JSON.parse(fs.readFileSync(path.join(__dirname,'phi_collections.json'),'utf8')) as Record<string,number>
for(const [key,total] of Object.entries(collDefs)){
  const ks=findGk(key)
  if(!ks.length){ console.log('❌ 收集品缺失:',key); fail++; continue }
  if(!ks.some(k=>slots(k)[2]>=total && slots(k)[0]>=1)){ console.log('❌ 收集品未满:',key,'need',total,'got',ks.map(k=>slots(k))); fail++ }
}

// 5) 课题模式排名
{
  const cr=save.gameProgress.challengeModeRank
  const level=Math.floor(cr/100), num=cr%100
  console.log('课题模式 :', cr, '=> rankLevel', level, 'rankNum', num)
  if(level<5||num<52){ console.log('❌ 课题模式未达到彩色52: level',level,'num',num); fail++ }
}

console.log(fail===0?'\n✅ 全部通过：327 首歌全难度 AP、曲绘/头像/收集品齐全':`\n共 ${fail} 处问题`)
