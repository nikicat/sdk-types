import { describe, expect, it } from 'vitest'
import { ChainId } from '../constants'
import { Symbiosis } from './symbiosis'

describe('Symbiosis chain override', () => {
    it('replaces the spare RPCs when the override lists them', () => {
        const symbiosis = new Symbiosis('mainnet', 'test', {
            chains: [
                {
                    id: ChainId.TRON_MAINNET,
                    rpc: 'https://tron-rpc.publicnode.com',
                    spareRpcs: ['https://api.trongrid.io'],
                },
            ],
        })

        const chainConfig = symbiosis.chainConfig(ChainId.TRON_MAINNET)
        expect(chainConfig.rpc).toBe('https://tron-rpc.publicnode.com')
        expect(chainConfig.spareRpcs).toEqual(['https://api.trongrid.io'])
    })

    it('keeps the configured spare RPCs when the override has none', () => {
        const configured = new Symbiosis('mainnet', 'test').chainConfig(ChainId.SEI_EVM_MAINNET).spareRpcs

        const symbiosis = new Symbiosis('mainnet', 'test', {
            chains: [{ id: ChainId.SEI_EVM_MAINNET, rpc: 'https://evm-rpc.sei-apis.com' }],
        })

        expect(configured?.length).toBeGreaterThan(0)
        expect(symbiosis.chainConfig(ChainId.SEI_EVM_MAINNET).spareRpcs).toEqual(configured)
    })
})
