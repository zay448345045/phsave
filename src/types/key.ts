import { FieldEntry, PhigrosBinaryFile, PhigrosBinaryStructure } from "../phi-binary"

/**
 * Currently there is no document for this file.
 * I don't really know what is this.
 * 
 */
export class PlayerGameKey {
    static readonly VERSION = 3
    private binary: PhigrosBinaryFile
    
    private _keys: FieldEntry
    private _lanotaReadKeys: FieldEntry
    private _camelliaReadKey: FieldEntry

    /**
     * 
     * @param buff Decrypted buffer
     */
    constructor(buff: Buffer) {
        const version = buff.at(0)
        if (version !== 2 && version !== 3) {
            throw new Error(`Unsupported version of gameKey! Expected: 2 or 3, got: ${version}`)
        }

        const definition: PhigrosBinaryStructure[] = [
            {
                type: 'arr',
                len: 'varshort',
                field: 'keys',
                definition: {
                    type: 'object',
                    definition: [
                        { // Key
                            type: 'string',
                            field: 'songName'
                        },
                        { // Begin value // WTF This should be a dynamic length array why write like this??
                            type: 'byte',
                            field: 'valueFlags'
                        },
                        { 
                            type: 'arr',
                            field: 'values',
                            len: {
                                expectedLen: 4,
                                skip: (_f, ctx) => {
                                    return ctx.curr >= ctx.prev.ctx.valueFlags
                                }
                            },
                            definition: {
                                type: 'byte',
                            }
                        }
                    ]
                }
            },
            {
                type: 'byte',
                field: 'lanotaReadKeys'
            },
            {
                type: 'boolean',
                field: 'camelliaReadKey'
            }
        ]
        if (version >= 3) {
            // v3 尾部新增的 2 个字节。
            // 反编译 GameKeySaveModule 后确认它们就是：
            //   sideStory4BeginReadKey  —— Side Story 4「无相乡」是否已读过开场
            //   oldScoreClearedV390     —— 3.9.0 旧谱成绩是否已清零标记
            definition.push(
                { type: 'byte', field: 'sideStory4BeginReadKey' },
                { type: 'byte', field: 'oldScoreClearedV390' }
            )
        }
        this.binary = new PhigrosBinaryFile(definition, buff)

        this._keys = this.binary.getEntry('keys')!
        this._lanotaReadKeys = this.binary.getEntry('lanotaReadKeys')!
        this._camelliaReadKey = this.binary.getEntry('camelliaReadKey')!
    }

    /** Side Story 4「无相乡」开场是否已读（v3 新增字节 1） */
    get sideStory4BeginReadKey(): number {
        return this.binary.getEntry('sideStory4BeginReadKey')?.value ?? 0
    }

    set sideStory4BeginReadKey(v: number) {
        const e = this.binary.getEntry('sideStory4BeginReadKey')
        if (e) e.value = v
    }

    /** 3.9.0 旧谱成绩清零标记（v3 新增字节 2） */
    get oldScoreClearedV390(): number {
        return this.binary.getEntry('oldScoreClearedV390')?.value ?? 0
    }

    set oldScoreClearedV390(v: number) {
        const e = this.binary.getEntry('oldScoreClearedV390')
        if (e) e.value = v
    }

    get keys(): GameKeyEntry[] {
        return this._keys.value
    }

    set keys(keys: GameKeyEntry[]) {
        this._keys.value = keys
    }

    get lanotaReadKeys(): number {
        return this._lanotaReadKeys.value
    }

    set lanotaReadKeys(keys: number) {
        this._lanotaReadKeys.value = keys
    }

    get camelliaReadKey() {
        return this._camelliaReadKey.value
    }

    set camelliaReadKey(key: boolean) {
        this._camelliaReadKey.value = key
    }

    save(): Buffer {
        this.binary.clearBuffer()

        this.binary.setEntry(this._keys)
        this.binary.setEntry(this._lanotaReadKeys)
        this.binary.setEntry(this._camelliaReadKey)

        return this.binary.saveBuffer()
    }
}

export type GameKeyEntry = {
    name: string,
    valueFlags: number,
    values: number[]
}