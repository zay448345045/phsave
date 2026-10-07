import fs from 'fs'
import { PhigrosSave } from '../src/save'
import { decodeChallengeRank } from '../src/types/progress'

// 用法: npx ts-node tools/inspect.ts <某个存档.save>
const save = new PhigrosSave(fs.readFileSync(process.argv[2]))
const cp: any = save.gameProgress
const gk: any = save.gameKey

const cr = decodeChallengeRank(cp.challengeModeRank)
console.log('=== gameProgress ===')
console.log('completed          :', cp.completed)
console.log('songUpdateInfo     :', cp.songUpdateInfo)
console.log('challengeModeRank  :', cp.challengeModeRank, '=> rankLevel', cr.rankLevel, 'rankNum', cr.rankNum)
console.log('money              :', cp.money)
console.log('chapter8 passed    :', cp.chapter8Passed, ' songUnlocked', cp.chapter8SongUnlocked, `(0b${cp.chapter8SongUnlocked.toString(2)})`)

const bin = gk.binary
console.log('=== gameKey 尾部 ===')
console.log('lanotaReadKeys          :', gk.lanotaReadKeys)
console.log('camelliaReadKey         :', gk.camelliaReadKey)
console.log('sideStory4BeginReadKey  :', gk.sideStory4BeginReadKey)
console.log('oldScoreClearedV390     :', gk.oldScoreClearedV390)

console.log('=== 各文件 ===')
console.log('gameKey 条目   :', (gk.keys as any[]).length)
console.log('gameRecord 曲目:', (save.gameRecord.records as any[]).length)

let notFull = 0
for (const r of save.gameRecord.records as any[]) {
    for (const lv of r.records.levelRecords) {
        if (lv && (lv.score !== 1000000 || lv.accuracy !== 100)) notFull++
    }
}
console.log('非满分记录     :', notFull)
console.log('RKS(本库旧表)  :', save.rks().toFixed(3))
