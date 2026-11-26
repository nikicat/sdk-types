import { describe, expect, it } from 'vitest'

import { ChainId } from '../constants'
import { CHAIN_DATA, chainData } from './chainData'
import { beta, dev, mainnet, testnet } from './config'

describe('CHAIN_DATA', () => {
    it('has every chain id once', () => {
        const ids = Object.values(ChainId).filter((value) => typeof value === 'number')
        expect(CHAIN_DATA).toHaveLength(ids.length)
        expect(new Set(CHAIN_DATA.map((data) => data.id)).size).toBe(ids.length)
        for (const id of ids) expect(chainData(id).id).toBe(id)
    })

    it('gives a Bitcoin network to the Bitcoin chains only', () => {
        const withNetwork = CHAIN_DATA.filter((data) => data.btcNetwork !== undefined).map((data) => data.id)
        expect(withNetwork.sort()).toEqual([ChainId.BTC_MAINNET, ChainId.BTC_MUTINY, ChainId.BTC_TESTNET4].sort())
        for (const data of CHAIN_DATA) expect(data.btcNetwork !== undefined).toBe(data.kind === 'btc')
    })

    it('gives Stellar, Cardano, Sui and Canton the kind other, not evm', () => {
        for (const id of [ChainId.XLM_MAINNET, ChainId.ADA_MAINNET, ChainId.SUI_MAINNET, ChainId.CANTON_MAINNET]) {
            expect(chainData(id).kind).toBe('other')
        }
    })

    it('puts each gas token and wrapped gas token on its own chain', () => {
        for (const data of CHAIN_DATA) {
            expect(data.gasToken.chainId).toBe(data.id)
            if (data.wrappedGasToken) expect(data.wrappedGasToken.chainId).toBe(data.id)
        }
    })

    it('gives each explorer as a base URL with no trailing slash', () => {
        for (const data of CHAIN_DATA) expect(data.explorer).not.toMatch(/\/$/)
    })
})

describe.each([
    ['mainnet', mainnet],
    ['beta', beta],
    ['testnet', testnet],
    ['dev', dev],
])('the %s config', (_, config) => {
    it('gives each chain its own chain data', () => {
        for (const chainConfig of config.chains) {
            expect(chainConfig.chain).toBe(chainData(chainConfig.id))
        }
    })
})
