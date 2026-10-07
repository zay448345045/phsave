import fs from 'fs'
import path from 'path'
import { PhigrosSave } from '../src/save'
import { PhigrosCloudServiceAPI } from '../src/cloud/api'
import { encodeChallengeRank, decodeChallengeRank } from '../src/types/progress'

// ---------------------------------------------------------------------------
// 配置：从仓库根目录 .env 读取
// ---------------------------------------------------------------------------
function loadEnv(file: string) {
    if (!fs.existsSync(file)) return
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^\s*([\w.]+)\s*=\s*(.*?)\s*$/)
        if (!m) continue
        const key = m[1]
        let value = m[2]
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1)
        }
        if (!(key in process.env)) process.env[key] = value
    }
}
loadEnv(path.join(__dirname, '..', '.env'))
const TOKEN = process.env.PHIGROS_TOKEN ?? ''
const PROFILE_NAME = process.env.PHIGROS_PROFILE_NAME ?? ''

// ---------------------------------------------------------------------------
// 曲库数据（来自 phi-plugin，与游戏 4.0.1 对齐）
// ---------------------------------------------------------------------------
type Info = { id: string; name: string; diffs: number[] }

function parseInfoCsv(): Info[] {
    const text = fs.readFileSync(path.join(__dirname, 'phi_info.csv'), 'utf8')
    const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0)
    const header = lines[0].split('\t')
    const col = (n: string) => header.indexOf(n)
    const diffsOrder = ['EZ', 'HD', 'IN', 'AT']
    const out: Info[] = []
    for (let i = 1; i < lines.length; i++) {
        const c = lines[i].split('\t')
        if (!c[col('id')]) continue
        const diffs: number[] = []
        diffsOrder.forEach((d, idx) => {
            if ((c[col(d)] ?? '').trim().length > 0) diffs.push(idx)
        })
        out.push({ id: c[col('id')].trim(), name: (c[col('song')] ?? '').replace(/\r$/, ''), diffs })
    }
    return out
}

function parseAvatars(): string[] {
    return fs
        .readFileSync(path.join(__dirname, 'phi_avatars.txt'), 'utf8')
        .split(/\r?\n/)
        .map(s => s.trim())
        .filter(s => s.length > 0)
}

// 归一化：小写、去变音符号、去所有非字母数字（保留 CJK），用于识别同一首歌的变体写法
function normalizeName(s: string): string {
    return s
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9\u3400-\u9fff\u3040-\u30ff\uff66-\uff9f]/g, '')
}

// gameKey 槽位工具
function getSlots(k: any): number[] {
    const e = k.values[0]
    const a = [0, 0, 0, 0, 0]
    let vi = 1
    for (let b = 0; b < 5; b++) if ((e >> b) & 1) a[b] = k.values[vi++]
    return a
}
function setSlots(k: any, a: number[]) {
    let e = 0
    for (let b = 0; b < 5; b++) if (a[b]) e |= 1 << b
    const v = [e]
    for (let b = 0; b < 5; b++) if ((e >> b) & 1) v.push(a[b])
    k.valueFlags = v.length
    k.values = v
}

function makeLevel() {
    return {
        score: 1000000,
        accuracy: 100,
        rks(diff: number) {
            if (this.accuracy < 70) return 0
            return diff * (((this.accuracy - 55) / 45) ** 2)
        },
    }
}

// ---------------------------------------------------------------------------
// 课题模式（Challenge Mode）
//   存档里 gameProgress.challengeModeRank = rankLevel * 100 + rankNum
//   rankLevel: 1..5，5 为「彩色」（三首总分 >= 3,000,000）
//   rankNum  : 三首谱面定数之和（取整）
//   目标「彩色 52」 -> 5 * 100 + 52 = 552
// ---------------------------------------------------------------------------
const CHALLENGE_MODE_RANK = encodeChallengeRank(5, 52)

// ---------------------------------------------------------------------------
// 核心：全解锁 + 全 AP
// ---------------------------------------------------------------------------
function applyEdits(save: PhigrosSave) {
    const info = parseInfoCsv()
    const avatars = parseAvatars()
    const infoById = new Map(info.map(i => [i.id, i]))

    const gk = save.gameKey.keys as any[]

    // ---- 1) 货币：base-1024 分段，每段 0..1023 ----
    save.gameProgress.money = [1023, 1023, 1023, 1023, 0]
    // 剧情解锁标志拉满
    save.gameProgress.unlockFlagOfSpasmodic = 15
    save.gameProgress.unlockFlagOfIgallta = 15
    save.gameProgress.unlockFlagOfRrharil = 15
    save.gameProgress.flagOfSongRecordKey = 127
    save.gameProgress.challengeModeRank = CHALLENGE_MODE_RANK
    save.rere8()

    // ---- 2) gameKey：曲绘 / 头像 / 收集品 ----
    const gkByName = new Map<string, any[]>()
    for (const k of gk) {
        if (!gkByName.has(k.songName)) gkByName.set(k.songName, [])
        gkByName.get(k.songName)!.push(k)
    }

    let addedSongKey = 0
    let addedIllust = 0
    let addedAvatar = 0
    let fixedCollection = 0

    // 已存在名字的归一化集合，用于跳过变体写法（如 Aventyr / Äventyr）
    const gkNorm = [...gkByName.keys()].map(normalizeName)

    // 2a) 每首歌补 slot3(曲绘)。单曲补 slot1(解锁)。
    for (const s of info) {
        const ks = gkByName.get(s.name)
        if (!ks || ks.length === 0) {
            // 没有同名条目：如果不是同一首歌的变体写法，则新建（slot1+slot3）
            const n = normalizeName(s.name)
            const isVariant = n.length >= 4 && gkNorm.some(g => g.length >= 3 && (g === n || g.startsWith(n) || n.startsWith(g)))
            if (isVariant) continue
            const entry = { songName: s.name, valueFlags: 3, values: [0b01010, 1, 1] }
            gk.push(entry)
            gkByName.set(s.name, [entry])
            gkNorm.push(n)
            addedSongKey++
            console.log('    + 曲目条目:', JSON.stringify(s.name), '(', s.id, ')')
            continue
        }
        // 已存在：确保曲绘位打开
        for (const k of ks) {
            const a = getSlots(k)
            if (!a[3]) {
                a[3] = 1
                setSlots(k, a)
                addedIllust++
            }
        }
    }

    // 2b) 头像补 slot4
    for (const name of avatars) {
        const ks = gkByName.get(name)
        if (!ks || ks.length === 0) {
            const entry = { songName: name, valueFlags: 2, values: [0b10000, 1] }
            gk.push(entry)
            gkByName.set(name, [entry])
            addedAvatar++
            continue
        }
        for (const k of ks) {
            const a = getSlots(k)
            if (!a[4]) {
                a[4] = 1
                setSlots(k, a)
                addedAvatar++
            }
        }
    }

    // 2c) 收集品：按游戏 CollectionDatabase 的真实总数补齐（phi_collections.json: key -> 最大 subIndex）
    const collDefs = JSON.parse(
        fs.readFileSync(path.join(__dirname, 'phi_collections.json'), 'utf8')
    ) as Record<string, number>
    for (const [key, total] of Object.entries(collDefs)) {
        const ks = gkByName.get(key)
        if (!ks || ks.length === 0) {
            // 存档里完全没有这个收集品（如第九章未获得的），新建 slot0+slot2
            const entry = { songName: key, valueFlags: 3, values: [0b00101, total, total] }
            gk.push(entry)
            gkByName.set(key, [entry])
            fixedCollection++
            continue
        }
        for (const k of ks) {
            const a = getSlots(k)
            const v = Math.max(a[0], a[2], total)
            if (a[0] !== v || a[2] !== v) {
                a[0] = v
                a[2] = v
                setSlots(k, a)
                fixedCollection++
            }
        }
    }
    // 保险：存档里有但清单外的收集品也确保解锁
    for (const k of gk) {
        const e = k.values[0]
        if ((e & 0b00101) === 0) continue
        if (collDefs[k.songName] !== undefined) continue
        const a = getSlots(k)
        if (a[0] < 1) {
            a[0] = Math.max(a[2], 1)
            setSlots(k, a)
            fixedCollection++
        }
    }

    // ---- 3) gameRecord：全曲全难度 AP ----
    const records = save.gameRecord.records as any[]
    const recById = new Map<string, any>()
    for (const r of records) recById.set(r.songName.replace(/\.0$/, ''), r)

    let apExisting = 0
    let addedLevel = 0
    let addedRecord = 0

    for (const r of records) {
        const id = r.songName.replace(/\.0$/, '')
        const meta = infoById.get(id)
        const hasBit4 = (r.records.levelExsistanceFlag & (1 << 4)) !== 0
        // 已有记录全部拉满
        for (const lv of r.records.levelRecords) {
            if (!lv) continue
            if (lv.score !== 1000000 || lv.accuracy !== 100) apExisting++
            lv.score = 1000000
            lv.accuracy = 100
        }
        // 补齐真实存在的难度
        if (meta) {
            for (const d of meta.diffs) {
                if (d === 3 && hasBit4) continue // bit4 歌曲不往 bit3 塞 AT
                if (!r.records.levelRecords[d]) {
                    r.records.levelRecords[d] = makeLevel()
                    r.records.levelExsistanceFlag |= 1 << d
                    addedLevel++
                }
            }
        }
        r.records.fcFlag = r.records.levelExsistanceFlag
    }

    // 缺失整条记录的曲目（用真实难度建记录）
    for (const s of info) {
        if (recById.has(s.id)) continue
        const flag = s.diffs.reduce((m, d) => m | (1 << d), 0)
        const levelRecords: any[] = [0, 1, 2, 3, 4].map(i => (s.diffs.includes(i) ? makeLevel() : null))
        const rec = {
            songName: s.id + '.0',
            records: { levelExsistanceFlag: flag, fcFlag: flag, levelRecords },
        }
        records.push(rec)
        recById.set(s.id, rec)
        addedRecord++
    }

    console.log('--- 改动统计 ---')
    console.log('新增 gameKey 曲目条目 :', addedSongKey)
    console.log('补曲绘 slot3          :', addedIllust)
    console.log('补头像 slot4          :', addedAvatar)
    console.log('修复收集品            :', fixedCollection)
    console.log('原非满分记录(已拉满)  :', apExisting)
    console.log('补难度记录            :', addedLevel)
    console.log('新增整条曲目记录      :', addedRecord)
}

// ---------------------------------------------------------------------------
// 云端连接与执行
// ---------------------------------------------------------------------------
async function connect() {
    if (!TOKEN) throw new Error('未设置 PHIGROS_TOKEN')
    const api = new PhigrosCloudServiceAPI(TOKEN)
    const me = await api.getCurrentUser()
    const saves = await api.readRemoteSaves()
    const profiles = saves.results
        .filter(p => p.user.objectId === me.objectId)
        .filter(p => !PROFILE_NAME || p.name === PROFILE_NAME)
        .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))
    if (profiles.length === 0) throw new Error('当前账号下没有找到任何云存档')
    return await api.selectProfile(p => p.objectId === profiles[0].objectId)
}

function printProfile(save: PhigrosSave, name: string, id: string) {
    console.log('档案名称 :', name)
    console.log('档案 ID  :', id)
    console.log('RKS      :', save.rks().toFixed(3))
    console.log('货币     :', save.gameProgress.money)
    const cr = decodeChallengeRank(save.gameProgress.challengeModeRank)
    console.log('课题模式 :', save.gameProgress.challengeModeRank, `(rankLevel ${cr.rankLevel}, rankNum ${cr.rankNum})`)
    console.log('曲目记录 :', save.gameRecord.records.length)
    console.log('gameKey  :', (save.gameKey.keys as any[]).length)
}

async function main() {
    const cmd = process.argv[2] ?? 'plan'
    const service = await connect()
    const profile = service.profile!

    if (cmd === 'plan') {
        const save = await service.getPlayerSave()
        console.log('=== 改档前 ===')
        printProfile(save, profile.name, profile.objectId)
        applyEdits(save)
        if (service.summary) {
            service.summary.challengeModeRank = CHALLENGE_MODE_RANK
        }
        const out = path.join(__dirname, '..', 'backups', `preview-${profile.name || 'profile'}-${Date.now()}.save`)
        fs.mkdirSync(path.dirname(out), { recursive: true })
        fs.writeFileSync(out, save.createSave())
        console.log('=== 改档后（预演，未上传） ===')
        printProfile(save, profile.name, profile.objectId)
        console.log('预览文件:', out)
        return
    }

    if (cmd === 'apply') {
        const save = await service.getPlayerSave()
        const dir = path.join(__dirname, '..', 'backups')
        fs.mkdirSync(dir, { recursive: true })
        const backupFile = path.join(dir, `${profile.name || 'profile'}-${Date.now()}.save`)
        fs.writeFileSync(backupFile, await service.getPlayerSaveBytes())
        console.log('已自动备份原始存档到:', backupFile)

        applyEdits(save)
        // 云摘要里的课题模式排名也同步更新
        if (service.summary) {
            service.summary.challengeModeRank = CHALLENGE_MODE_RANK
        }
        await service.uploadSave(save.createSave())

        // 重新拉取确认
        const fresh = await (await connect()).getPlayerSave()
        console.log('=== 上传完成 ===')
        printProfile(fresh, profile.name, profile.objectId)
        fs.writeFileSync(path.join(dir, `after-${Date.now()}.save`), fresh.createSave())
        return
    }

    console.error('未知命令:', cmd)
    console.error('可用: plan | apply')
    process.exit(1)
}

if (require.main === module) {
    main().catch(e => {
        console.error('出错:', e?.response?.data ?? e?.message ?? e)
        process.exit(1)
    })
}
