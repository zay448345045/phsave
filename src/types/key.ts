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
            // v3 在尾部新增了 2 个字节，按原样保留以保证无损往返
            definition.push(
                { type: 'byte', field: 'unknownV3A' },
                { type: 'byte', field: 'unknownV3B' }
            )
        }
        this.binary = new PhigrosBinaryFile(definition, buff)

        this._keys = this.binary.getEntry('keys')!
        this._lanotaReadKeys = this.binary.getEntry('lanotaReadKeys')!
        this._camelliaReadKey = this.binary.getEntry('camelliaReadKey')!
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