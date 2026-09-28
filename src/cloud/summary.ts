import { FieldEntry, PhigrosBinaryFile, PhigrosBinaryStructure } from "../phi-binary";

export class GameSaveSummary {
    private binary: PhigrosBinaryFile

    private _saveVersion: FieldEntry
    private _challengeModeRank: FieldEntry
    private _rankingScore: FieldEntry
    private _gameVersion: FieldEntry
    private _avatar: FieldEntry
    private _levelSummary: FieldEntry
    
    constructor(buff: Buffer) {
        const definition: PhigrosBinaryStructure[] = [
            {
                type: 'byte',
                field: 'saveVersion'
            }, 
            {
                type: 'short',
                field: 'challengeModeRank'
            }, 
            {
                type: 'float',
                field: 'rankingScore'
            }, 
            {
                type: 'byte',
                field: 'gameVersion'
            },
        ]
        if ((buff.at(0) ?? 0) >= 7) {
            // v7 的 summary 在 gameVersion 后多一个字节，按原样保留
            definition.push({ type: 'byte', field: 'unknownV7' })
        }
        definition.push(
            {
                type: 'string',
                field: 'avatar'
            }, 
            {
                type: 'arr',
                field: 'levelSummary',
                len: 4,
                definition: {
                    type: 'object',
                    definition: [
                        {
                            type: 'short',
                            field: 'cleared'
                        },
                        {
                            type: 'short',
                            field: 'fc'
                        },
                        {
                            type: 'short',
                            field: 'phi'
                        },
                    ]
                }
            }
        )
        this.binary = new PhigrosBinaryFile(definition, buff, { encryption: false })

        this._saveVersion = this.binary.getEntry('saveVersion')!
        this._challengeModeRank = this.binary.getEntry('challengeModeRank')!
        this._rankingScore = this.binary.getEntry('rankingScore')!
        this._gameVersion = this.binary.getEntry('gameVersion')!
        this._avatar = this.binary.getEntry('avatar')!
        this._levelSummary = this.binary.getEntry('levelSummary')!

    }

    get saveVersion(): number {
        return this._saveVersion.value
    }

    set saveVersion(newVal: number) {
        this._saveVersion.value = newVal
    }

    get challengeModeRank(): number {
        return this._challengeModeRank.value
    }

    set challengeModeRank(newVal: number) {
        this._challengeModeRank.value = newVal
    }

    get rankingScore(): number {
        return this._rankingScore.value
    }

    set rankingScore(newVal: number) {
        this._rankingScore.value = newVal
    }

    get gameVersion(): number {
        return this._gameVersion.value
    }

    set gameVersion(newVal: number) {
        this._gameVersion.value = newVal
    }

    get avatar(): string {
        return this._avatar.value
    }

    set avatar(newVal: string) {
        this._avatar.value = newVal
    }

    get levelSummary(): LevelSummary[] {
        return this._levelSummary.value
    }

    set levelSummary(newVal: LevelSummary[]) {
        this._levelSummary.value = newVal
    }

    save(): Buffer {
        this.binary.clearBuffer()

        this.binary.setEntry(this._avatar)
        this.binary.setEntry(this._challengeModeRank)
        this.binary.setEntry(this._gameVersion)
        this.binary.setEntry(this._levelSummary)
        this.binary.setEntry(this._rankingScore)
        this.binary.setEntry(this._saveVersion)

        // The summary is stored as cleartext in the cloud, unlike the save
        // entries which are encrypted.
        return this.binary.saveCleartextBuffer()
    }
}

export type LevelSummary = {
    cleared: number,
    fc: number,
    phi: number
}