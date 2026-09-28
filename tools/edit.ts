import fs from 'fs'
import path from 'path'
import { PhigrosSave } from '../src/save'
import { PhigrosCloudServiceAPI } from '../src/cloud/api'

// ---------------------------------------------------------------------------
// 参数配置
// ---------------------------------------------------------------------------

// 从仓库根目录的 .env 读取参数（PHIGROS_TOKEN / PHIGROS_PROFILE_NAME）
function loadEnv(file: string) {
    if (!fs.existsSync(file)) return
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^\s*([\w.]+)\s*=\s*(.*?)\s*$/)
        if (!m) continue
        const key = m[1]
        let value = m[2]
        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1)
        }
        if (!(key in process.env)) process.env[key] = value
    }
}

loadEnv(path.join(__dirname, '..', '.env'))

const TOKEN = process.env.PHIGROS_TOKEN ?? ''
const PROFILE_NAME = process.env.PHIGROS_PROFILE_NAME ?? ''

// ---------------------------------------------------------------------------
// 你要修改的内容：取消注释即可
// ---------------------------------------------------------------------------

export async function applyEdits(save: PhigrosSave) {
    // 1) 货币是 base-1024 的分段数字：[KB, MB, GB, TB, PB]
    //    [795,427,954,0,0] = 954 GB + 427 MB + 795 KB ≈ 954.42 GB
    save.gameProgress.money = [0, 0, 1024, 0, 0]

    // 2) 所有歌曲、所有难度全部 AP：
    //    补齐缺失的 EZ(0)/HD(1)/IN(2)/AT(3) 记录，并打开对应的 levelExsistanceFlag 位
    const makeRecord = () => ({
        score: 1000000,
        accuracy: 100,
        rks(diff: number) {
            if (this.accuracy < 70) return 0
            return diff * (((this.accuracy - 55) / 45) ** 2)
        }
    })

    for (const song of save.gameRecord.records) {
        const flag = song.records.levelExsistanceFlag
        // 若已使用第 5 个槽位(bit4)，就不补 AT(bit3)，避免冲突
        const maxDiff = (flag & (1 << 4)) ? 3 : 4
        for (let i = 0; i < maxDiff; i++) {
            if (!song.records.levelRecords[i]) {
                song.records.levelRecords[i] = makeRecord()
                song.records.levelExsistanceFlag |= (1 << i)
            }
        }
        for (const lv of song.records.levelRecords) {
            if (!lv) continue
            lv.score = 1000000
            lv.accuracy = 100
        }
    }

    // 3) 解锁并补齐「单曲精选集」里用 data 购买的歌
    //    解锁状态存在 gameKey：已解锁的歌都有一个条目（slot1=1）
    const lockedSingles = JSON.parse(
        fs.readFileSync(path.join(__dirname, 'locked_singles.json'), 'utf8')
    ) as { id: string, name: string, diffs: number }[]

    // 3a) 解锁：给缺少 gameKey 条目的歌补上（valueFlags=2, values=[exist=2, slot1=1]）
    const gkNames = new Set((save.gameKey.keys as any[]).map(k => k.songName))
    for (const s of lockedSingles) {
        if (!gkNames.has(s.name)) {
            (save.gameKey.keys as any[]).push({ songName: s.name, valueFlags: 2, values: [2, 1] })
            gkNames.add(s.name)
        }
    }

    // 3b) 成绩：补齐 gameRecord 条目并设为全 AP
    const existing = new Set(save.gameRecord.records.map(r => r.songName))
    for (const s of lockedSingles) {
        const songName = s.id + '.0'
        if (existing.has(songName)) continue
        const levelRecords: any[] = [0, 1, 2, 3, 4].map(i => (i < s.diffs ? makeRecord() : null))
        save.gameRecord.records.push({
            songName,
            records: {
                levelExsistanceFlag: (1 << s.diffs) - 1,
                fcFlag: (1 << s.diffs) - 1,
                levelRecords,
            },
        } as any)
    }

    // 4) 解锁全部收集品
    //    gameKey 槽位语义（推断）：slot0=已解锁，slot2=获得数。
    //    收集品条目用 slot0/slot2，把两者补成存在且取较大值。
    const getSlots = (k: any): number[] => {
        const e = k.values[0]
        const a = [0, 0, 0, 0, 0]
        let vi = 1
        for (let b = 0; b < 5; b++) if ((e >> b) & 1) a[b] = k.values[vi++]
        return a
    }
    const setSlots = (k: any, a: number[]) => {
        let e = 0
        for (let b = 0; b < 5; b++) if (a[b]) e |= 1 << b
        const v = [e]
        for (let b = 0; b < 5; b++) if ((e >> b) & 1) v.push(a[b])
        k.valueFlags = v.length
        k.values = v
    }
    let fixedCollections = 0
    for (const k of save.gameKey.keys as any[]) {
        const e = k.values[0]
        if ((e & 0b00101) === 0) continue // 不是收集品
        const a = getSlots(k)
        const v = Math.max(a[0], a[2], 1)
        if (a[0] !== v || a[2] !== v) {
            a[0] = v
            a[2] = v
            setSlots(k, a)
            fixedCollections++
        }
    }
    console.log('已处理收集品条目:', fixedCollections)

    // 5) 解锁曲绘：只给「有 slot1(已解锁的歌)」的条目补 slot3(曲绘)
    let fixedIllust = 0
    for (const k of save.gameKey.keys as any[]) {
        const e = k.values[0]
        if (!((e >> 1) & 1)) continue // 只处理有 slot1 的条目
        const a = getSlots(k)
        if (!a[3]) {
            a[3] = 1
            setSlots(k, a)
            fixedIllust++
        }
    }
    console.log('已补 slot3(曲绘) 的条目:', fixedIllust)

    // 6) 第九章「穹顶孤舟」：补 gameKey(slot1+slot3) 和 gameRecord，解锁曲绘
    const ch9: { id: string, name: string, diffs: number }[] = [
        { id: 'AboutTheUniverse.SOTUIMIssionary', name: 'About The Universe', diffs: 3 },
        { id: 'EntrancetotheChaos.打打だいずvssiromaru', name: 'Entrance to the Chaos', diffs: 4 },
        { id: 'Evanescent.LeaF', name: 'Evanescent', diffs: 3 },
        { id: 'ExoplanetaryMirage.かめりあ', name: 'Exoplanetary Mirage', diffs: 4 },
        { id: 'Implexrough.Silentroommommy', name: 'Implexrough', diffs: 3 },
    ]
    for (const s of ch9) {
        const entry: any = (save.gameKey.keys as any[]).find(k => k.songName === s.name)
        if (!entry) {
            (save.gameKey.keys as any[]).push({ songName: s.name, valueFlags: 3, values: [0b01010, 1, 1] })
        } else {
            const a = getSlots(entry)
            a[1] = a[1] || 1
            a[3] = 1
            setSlots(entry, a)
        }
        const songName = s.id + '.0'
        if (!existing.has(songName)) {
            const levelRecords: any[] = [0, 1, 2, 3, 4].map(i => (i < s.diffs ? makeRecord() : null))
            save.gameRecord.records.push({ songName, records: { levelExsistanceFlag: (1 << s.diffs) - 1, fcFlag: (1 << s.diffs) - 1, levelRecords } } as any)
        }
    }
    console.log('第九章曲目已处理:', ch9.length)

    // 7) 修正「贝多芬祝福」：谱面只有 EZ/HD/IN，去掉多出来的 AT
    const bev = save.gameRecord.records.find(r => r.songName.startsWith('贝多芬祝福')) as any
    if (bev) {
        bev.records.levelRecords[3] = null
        bev.records.levelRecords[4] = null
        bev.records.levelExsistanceFlag = 7
        bev.records.fcFlag = 7
        console.log('已修正贝多芬祝福为 3 难度')
    }
}

// ---------------------------------------------------------------------------
// 以下为执行逻辑，一般不需要改
// ---------------------------------------------------------------------------

async function connect() {
    if (!TOKEN) {
        throw new Error('未设置 PHIGROS_TOKEN，请先抓包并把 token 填到仓库根目录的 .env')
    }
    const api = new PhigrosCloudServiceAPI(TOKEN)
    const me = await api.getCurrentUser()
    const saves = await api.readRemoteSaves()

    // 云端可能有多个账号的存档，只取当前 token 对应用户、且最近更新的那个
    const profiles = saves.results
        .filter(p => p.user.objectId === me.objectId)
        .filter(p => !PROFILE_NAME || p.name === PROFILE_NAME)
        .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))

    if (profiles.length === 0) {
        throw new Error('当前账号下没有找到任何云存档')
    }
    return await api.selectProfile(p => p.objectId === profiles[0].objectId)
}

function printProfile(save: PhigrosSave, name: string, id: string) {
    console.log('档案名称 :', name)
    console.log('用户 ID  :', id)
    console.log('RKS      :', save.rks().toFixed(3))
    console.log('货币     :', save.gameProgress.money)
    console.log('简介     :', save.user.description)
}

async function main() {
    const cmd = process.argv[2] ?? 'get'
    const service = await connect()
    const profile = service.profile!

    if (cmd === 'get') {
        printProfile(await service.getPlayerSave(), profile.name, profile.objectId)
        return
    }

    if (cmd === 'backup') {
        const dir = path.join(__dirname, '..', 'backups')
        fs.mkdirSync(dir, { recursive: true })
        const file = path.join(dir, `${profile.name}-${Date.now()}.save`)
        fs.writeFileSync(file, await service.getPlayerSaveBytes())
        console.log('备份已保存到:', file)
        return
    }

    if (cmd === 'apply') {
        const save = await service.getPlayerSave()

        // 上传前先自动备份原始云端存档
        const dir = path.join(__dirname, '..', 'backups')
        fs.mkdirSync(dir, { recursive: true })
        const backupFile = path.join(dir, `${profile.name}-${Date.now()}.save`)
        fs.writeFileSync(backupFile, await service.getPlayerSaveBytes())
        console.log('已自动备份原始存档到:', backupFile)

        await applyEdits(save)
        await service.uploadSave(save.createSave())

        // 重新拉取一次确认结果
        const fresh = await (await connect()).getPlayerSave()
        console.log('--- 上传完成 ---')
        printProfile(fresh, profile.name, profile.objectId)
        return
    }

    console.error(`未知命令: ${cmd}`)
    console.error('可用命令: get | backup | apply')
    process.exit(1)
}

if (require.main === module) {
    main().catch(e => {
        console.error('出错:', e?.response?.data ?? e?.message ?? e)
        process.exit(1)
    })
}
