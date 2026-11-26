import { describe, expect, it } from 'vitest'

import { getZkCreate2Address } from './pairAddresses'

describe('getZkCreate2Address', () => {
    const factory = '0x50704Ac00064be03CEEd817f41E0Aa61F52ef4DC'
    // the H2 factory and pair bytecode hash on Cronos zkEVM
    const bytecodeHash = '0x010003b769eff14077b08cfa578449069839b9ccb7e566601190f93592d4a6bc'

    it('derives the pairs that were listed by hand, and any other', () => {
        const listed: Record<string, string> = {
            '0x10dac1b69a0ef99baf5786f77bf0aab84749fd564007f4fad53a9395afa06d6a':
                '0x20eDB5049461c9a6F490671742824c9F9aD05eD8',
            '0xdaa80bb10d1689abf76a659ce2e4b2c7e859fca2d05933a3d81c3636c0ef62f0':
                '0x006022eb9de7869e84f021605Ae23bE6C7D2d952',
            '0x91965e804433f989e92a043ea20a588fec7c4ca4ce64a380d6215f3992eadbb6':
                '0xA61947027caDbe9505d2a40E73EB21CB957e2daD',
        }
        for (const [salt, pair] of Object.entries(listed)) {
            expect(getZkCreate2Address(factory, salt, bytecodeHash)).toBe(pair)
        }
        expect(getZkCreate2Address(factory, `0x${'1'.repeat(64)}`, bytecodeHash)).toMatch(/^0x[0-9a-fA-F]{40}$/)
    })
})
