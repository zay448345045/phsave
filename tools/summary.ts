import fs from 'fs'
import path from 'path'
import { PhigrosCloudServiceAPI } from '../src/cloud/api'
function loadEnv(file:string){if(!fs.existsSync(file))return;for(const line of fs.readFileSync(file,'utf8').split(/\r?\n/)){const m=line.match(/^\s*([\w.]+)\s*=\s*(.*?)\s*$/);if(!m)continue;let v=m[2];if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1);if(!(m[1] in process.env))process.env[m[1]]=v}}
loadEnv(path.join(__dirname,'..','.env'))
const TOKEN=process.env.PHIGROS_TOKEN ?? ''
async function main(){
  const api=new PhigrosCloudServiceAPI(TOKEN)
  const me=await api.getCurrentUser()
  const saves=await api.readRemoteSaves()
  const mine=saves.results.filter(p=>p.user.objectId===me.objectId).sort((a,b)=>+new Date(b.updatedAt)-+new Date(a.updatedAt))
  const svc=await api.selectProfile(p=>p.objectId===mine[0].objectId)
  const s=svc.summary!
  console.log('summary.challengeModeRank =', s.challengeModeRank, '(level', Math.floor(s.challengeModeRank/100), 'num', s.challengeModeRank%100, ')')
  console.log('summary.rankingScore =', s.rankingScore, 'gameVersion', s.gameVersion, 'avatar', s.avatar)
  console.log('levelSummary =', JSON.stringify(s.levelSummary))
}
main().catch(e=>{console.error(e?.response?.data??e?.message??e);process.exit(1)})
