import fs from 'fs'
import { PhigrosSave } from '../src/save'
const a=new PhigrosSave(fs.readFileSync(process.argv[2]))
const b=new PhigrosSave(fs.readFileSync(process.argv[3]))
const am=new Map((a.gameRecord.records as any[]).map(r=>[r.songName,r]))
for(const r of b.gameRecord.records as any[]){
  const o=am.get(r.songName)
  if(!o){ console.log('+ 新记录', r.songName, 'flag='+r.records.levelExsistanceFlag.toString(2)); continue }
  for(let i=0;i<5;i++){
    const lo=o.records.levelRecords[i], ln=r.records.levelRecords[i]
    if(!lo && ln) console.log('+ 难度', r.songName, 'slot'+i, 'score='+ln.score)
  }
}
console.log('--- gameKey 新增 ---')
const an=new Set((a.gameKey.keys as any[]).map(k=>k.songName))
for(const k of b.gameKey.keys as any[]){ if(!an.has(k.songName)) console.log('+', JSON.stringify(k.songName), 'exist='+k.values[0].toString(2)) }
console.log('--- gameKey 变化 ---')
const amap=new Map((a.gameKey.keys as any[]).map(k=>[k.songName,k]))
for(const k of b.gameKey.keys as any[]){ const o=amap.get(k.songName); if(o && JSON.stringify(o.values)!==JSON.stringify(k.values)) console.log('~', JSON.stringify(k.songName), o.values, '->', k.values) }
