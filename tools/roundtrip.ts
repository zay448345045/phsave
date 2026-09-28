import fs from 'fs'
import AdmZip from 'adm-zip'
import { PhigrosSave } from '../src/save'
import { PhigrosBinaryFile } from '../src/phi-binary'

/**
 * 上传前安全检查：把一个本地存档 zip 解析后重新生成，
 * 逐文件解密对比，确认能无损往返（避免改档时损坏存档）。
 *
 * 用法: npx ts-node tools/roundtrip.ts <save.zip>
 */

const file = process.argv[2]
if (!file) {
    console.error('用法: npx ts-node tools/roundtrip.ts <save.zip>')
    process.exit(1)
}

const original = fs.readFileSync(file)
const rebuilt = new PhigrosSave(original).createSave()

const oz = new AdmZip(original)
const rz = new AdmZip(rebuilt)
let allSame = true
for (const e of oz.getEntries()) {
    const a = PhigrosBinaryFile.decrypt(oz.readFile(e)!)
    const b = PhigrosBinaryFile.decrypt(rz.readFile(e)!)
    const same = a.equals(b)
    if (!same) allSame = false
    console.log(`${e.entryName.padEnd(14)} v${oz.readFile(e)!.at(0)} ${a.length} -> ${b.length} ${same ? 'IDENTICAL' : 'DIFF'}`)
    if (!same) {
        for (let i = 0; i < Math.max(a.length, b.length); i++) {
            if (a[i] !== b[i]) { console.log(`   first diff at ${i}: ${a[i]} vs ${b[i]}`); break }
        }
    }
}
console.log(allSame ? '\n✅ 无损往返' : '\n❌ 存在差异，不要上传！')
process.exit(allSame ? 0 : 1)
