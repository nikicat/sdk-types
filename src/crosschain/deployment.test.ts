import { describe, expect, it } from 'vitest'

import { ChainId } from '../constants'
import { Token } from '../entities'
import { chainData } from './chainData'
import { beta, dev, mainnet } from './config'
import { ConfigCache, Deployment } from './deployment'
import { SyntheticToken } from './deployedToken'
import { Symbiosis } from './symbiosis'
import { parseConfigCacheData } from './config/cache/types'
import type { ChainData, Config } from './types'

const LOCAL = 31337 as ChainId
const local = (wethAddress: `0x${string}`): ChainData => ({
    id: LOCAL,
    name: 'Hardhat',
    explorer: '',
    icons: {},
    kind: 'evm',
    gasToken: { chainId: LOCAL, address: '', decimals: 18, symbol: 'ETH' },
    wrappedGasToken: { chainId: LOCAL, address: wethAddress, decimals: 18, symbol: 'WETH' },
    uniswapV2: { pairs: [] },
})
// A deployment of one local chain, built from plain data as a test writes it.
const localDeployment = (wethAddress: `0x${string}`) => {
    const config: Config = {
        ...dev,
        omniPools: [],
        btcConfigs: [],
        chains: [{ ...dev.chains[0], id: LOCAL, chain: local(wethAddress), rpc: 'http://127.0.0.1:8545' }],
    }
    const cache = parseConfigCacheData({
        tokens: [{ id: 1, chainId: LOCAL, address: wethAddress, decimals: 18, symbol: 'WETH' }],
        omniPools: [],
    })
    return new Deployment(config, cache)
}

describe('Deployment', () => {
    it('gives the shipped deployments’ chains with their configs', () => {
        const eth = Deployment.named('mainnet').chain(ChainId.ETH_MAINNET)
        expect(eth.config).toBe(mainnet.chains.find((chainConfig) => chainConfig.id === ChainId.ETH_MAINNET))
        expect(eth.name).toBe('Ethereum')
        expect(Deployment.named('mainnet').chains()).toHaveLength(mainnet.chains.length)
        expect(() => Deployment.named('mainnet').chain(LOCAL)).toThrow()
        expect(Deployment.named('mainnet').findChain(LOCAL)).toBeUndefined()
    })

    it('serves a test’s own chain, and two deployments of one chain id keep their own data', () => {
        const first = localDeployment('0x5FbDB2315678afecb367f032d93F642f64180aa3')
        const second = localDeployment('0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512')
        expect(first.chain(LOCAL).gasToken.wrapped.address).toBe('0x5FbDB2315678afecb367f032d93F642f64180aa3')
        expect(second.chain(LOCAL).gasToken.wrapped.address).toBe('0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512')
        expect(first.tokens().map((token) => token.address)).toEqual(['0x5FbDB2315678afecb367f032d93F642f64180aa3'])
        expect(first.chain(LOCAL).config.rpc).toBe('http://127.0.0.1:8545')
    })

    it('makes its tokens with its own chains', () => {
        const deployment = localDeployment('0x5FbDB2315678afecb367f032d93F642f64180aa3')
        const [token] = deployment.tokens()
        expect(token.chain).toBe(deployment.chain(LOCAL))
        expect(
            Deployment.named('mainnet')
                .tokens()
                .every((token) => token.chain === Deployment.named('mainnet').chain(token.chainId))
        ).toBe(true)
    })

    it('errors for a chain config that holds another chain’s data', () => {
        const config: Config = { ...dev, chains: [{ ...dev.chains[0], chain: chainData(ChainId.ETH_MAINNET) }] }
        expect(() => new Deployment(config, Deployment.named('dev').cacheData)).toThrow(/holds the data of chain/)
    })

    it('gives the shipped deployments by name, and errors for another name', () => {
        expect(Deployment.named('mainnet').config).toBe(mainnet)
        expect(Deployment.named('beta').config).toBe(beta)
        expect(() => Deployment.named('staging' as 'mainnet')).toThrow(/Unknown config name/)
    })

    it('gives its own token for any token of the same chain, address and origin', () => {
        const deployment = Deployment.named('mainnet')
        for (const token of deployment.tokens()) {
            const copy = new Token(deployment.chain(token.chainId), token)
            // the data's first entry of that chain, address and origin (sSIS and sUSDC are listed twice)
            const first = deployment
                .tokens()
                .find((other) => other.equals(token) && other.chainFromId === token.chainFromId)
            expect(deployment.token(copy)).toBe(first)
        }
        const eth = deployment.chain(ChainId.ETH_MAINNET)
        expect(deployment.token(eth.gasToken) ?? deployment.token(eth.gasToken.wrapped)).toBeDefined()
    })

    it('links each synthetic and its original both ways, synthetics of synthetics too', () => {
        const deployment = Deployment.named('mainnet')
        for (const token of deployment.tokens()) {
            if (!(token instanceof SyntheticToken)) continue
            expect(token.original.chainId).toBe(token.chainFromId)
            expect(token.original.synthetics).toContain(token)
        }
        // sSIS on the Symbiosis chain (#194) is a synthetic of SIS on BSC, itself a synthetic of SIS on Ethereum
        const sisOnBsc = deployment
            .tokens()
            .find(
                (token) =>
                    token instanceof SyntheticToken && token.chainId === ChainId.BSC_MAINNET && token.symbol === 'SIS'
            )
        expect(sisOnBsc).toBeDefined()
        expect(sisOnBsc!.syntheticOn(ChainId.SYMBIOSIS_MAINNET)?.symbol).toBe('sSIS')
    })

    it('keeps the deprecated getRepresentation: a synthetic’s original on the chain, else the synthetic on it', () => {
        const deployment = Deployment.named('mainnet')
        const cache = new ConfigCache('mainnet')
        for (const token of deployment.tokens()) {
            for (const { id } of deployment.chains()) {
                const deployed = deployment.token(token)!
                const expected =
                    deployed instanceof SyntheticToken
                        ? deployed.original.chainId === id
                            ? deployed.original
                            : undefined
                        : deployed.syntheticOn(id)
                expect(cache.getRepresentation(token, id)?.address).toBe(expected?.address)
            }
        }
    })

    it('gives each pool its tokens, their indexes and its transit tokens, as the deprecated lookups do', () => {
        const deployment = Deployment.named('mainnet')
        const symbiosis = new Symbiosis('mainnet', 'test')
        for (const pool of deployment.omniPools()) {
            expect(pool.tokens.map((token) => token.address)).toEqual(
                symbiosis.getOmniPoolTokens(pool).map((token) => token.address)
            )
            for (const token of pool.tokens) {
                expect(pool.indexOf(token)).toBe(symbiosis.getOmniPoolTokenIndex(pool, token))
                expect(deployment.omniPoolOf(token)).toBe(pool)
            }
            for (const { id } of deployment.chains()) {
                const transit = pool.transitTokens(id)
                // in the pool's order; the deprecated list is in the data's
                expect(transit.map((token) => token.address).sort()).toEqual(
                    symbiosis
                        .transitTokens(id, pool)
                        .map((token) => token.address)
                        .sort()
                )
                for (const token of transit) expect(deployment.omniPoolOf(token)).toBe(pool)
            }
        }
    })

    it('rejects deployment data that does not parse', () => {
        const token = { id: 1, chainId: LOCAL, address: '0x0000000000000000000000000000000000000001', decimals: 18 }
        expect(() => parseConfigCacheData({ tokens: [token], omniPools: [] })).not.toThrow()
        expect(() => parseConfigCacheData({ tokens: [{ ...token, id: -1 }], omniPools: [] })).toThrow()
        expect(() => parseConfigCacheData({ tokens: [{ ...token, address: 'nope' }], omniPools: [] })).toThrow()
        expect(() => parseConfigCacheData({ tokens: [token] })).toThrow()
    })

    it('checksums the data’s EVM addresses, and finds its tokens and pools by an address in any case', () => {
        const weth = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
        const pool = '0x6148FD6C649866596C3d8a971fC313E5eCE84882'
        const lower = (address: `0x${string}`) => address.toLowerCase() as `0x${string}`
        const data = parseConfigCacheData({
            tokens: [{ id: 1, chainId: LOCAL, address: weth.toLowerCase(), decimals: 18, symbol: 'WETH' }],
            omniPools: [
                {
                    id: 1,
                    chainId: LOCAL,
                    address: pool.toLowerCase(),
                    oracle: pool.toLowerCase(),
                    generalPurpose: true,
                    coinGeckoId: 'weth',
                    tokens: [{ index: 0, tokenId: 1 }],
                },
            ],
        })
        expect(data.tokens[0].address).toBe(weth)
        expect(data.omniPools[0].address).toBe(pool)
        expect(data.omniPools[0].oracle).toBe(pool)

        const deployment = new Deployment(localDeployment(weth).config, data)
        const chain = deployment.chain(LOCAL)
        const [token] = deployment.tokens()
        expect(deployment.token(new Token(chain, { chainId: LOCAL, address: lower(weth), decimals: 18 }))).toBe(token)
        const [omniPool] = deployment.omniPools()
        expect(new ConfigCache(deployment).getOmniPoolByConfig({ ...omniPool, address: lower(pool) })).toBe(
            omniPool.info
        )
    })

    it('finds a Tron token by its base58 address', () => {
        const tron = Deployment.named('mainnet').chain(ChainId.TRON_MAINNET)
        const usdt = new Token(tron, {
            chainId: ChainId.TRON_MAINNET,
            address: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
            decimals: 6,
        })
        expect(usdt.address).toBe('0xa614f803B6FD780986A42c78Ec9c7f77e6DeD13C')
        expect(Deployment.named('mainnet').token(usdt)?.symbol).toBe('USDT')
    })

    describe('with two pools on a local chain', () => {
        const weth = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
        const other = '0x6B175474E89094C44Da98b954EedeAC495271d0F'
        const pool = (id: number, address: string, tokenIds: number[]) => ({
            id,
            chainId: LOCAL,
            address,
            oracle: address,
            generalPurpose: true,
            coinGeckoId: 'weth',
            tokens: tokenIds.map((tokenId, index) => ({ index, tokenId })),
        })
        const build = (pools: ReturnType<typeof pool>[]) =>
            new Deployment(
                localDeployment(weth).config,
                parseConfigCacheData({
                    tokens: [
                        { id: 1, chainId: LOCAL, address: weth, decimals: 18, symbol: 'WETH' },
                        { id: 2, chainId: LOCAL, address: other, decimals: 18, symbol: 'DAI' },
                    ],
                    omniPools: pools,
                })
            )
        const first = '0x6148FD6C649866596C3d8a971fC313E5eCE84882'
        const second = '0x2d877Fe148dBCB056Bf71ED5232E8d580195c0f1'

        it('errors for a config whose pools are not the data’s', () => {
            const deployment = build([pool(1, first, [1]), pool(2, second, [2])])
            const config = (addresses: string[]) => ({
                ...deployment.config,
                omniPools: addresses.map((address) => ({
                    ...deployment.omniPools()[0],
                    address: address as `0x${string}`,
                })),
            })
            const data = deployment.cacheData
            expect(() => new Deployment(config([first.toLowerCase(), second]), data)).not.toThrow()
            expect(() => new Deployment(config([second, first]), data)).toThrow(/are not the data's/)
            expect(() => new Deployment(config([first]), data)).toThrow(/are not the data's/)
        })

        it('errors for data that lists a pool twice', () => {
            expect(() => build([pool(1, first, [1]), pool(2, first, [2])])).toThrow(/twice/)
        })

        it('errors for data that puts a token in two pools', () => {
            expect(() => build([pool(1, first, [1]), pool(2, second, [1, 2])])).toThrow(/trades in omni pools/)
        })

        it('gives the one transit token of a chain, and errors when there are several', () => {
            const one = build([pool(1, first, [1]), pool(2, second, [2])])
            const [wethPool, daiPool] = one.omniPools()
            expect(wethPool.transitToken(LOCAL).symbol).toBe('WETH')
            expect(daiPool.transitToken(LOCAL).symbol).toBe('DAI')
            const [bothPool] = build([pool(1, first, [1, 2])]).omniPools()
            expect(() => bothPool.transitToken(LOCAL)).toThrow(/2 transit tokens/)
        })
    })

    it('gives no transit token on the pool’s own chain for a pool its tokens do not trade in', () => {
        const deployment = Deployment.named('mainnet')
        const symbiosis = new Symbiosis('mainnet', 'test')
        const usdc = deployment.omniPools().find((pool) => pool.coinGeckoId === 'usd-coin')!
        expect(() => usdc.transitToken(usdc.chainId)).toThrow(/Cannot find transitToken/)
        // the deprecated rule gave the chain's first token, whatever its pool
        expect(symbiosis.transitToken(usdc.chainId, usdc).symbol).toBe('WSIS')
    })

    it('serializes its tokens as plain tokens', () => {
        const [token] = Deployment.named('mainnet').tokens()
        const plain = new Token(Deployment.named('mainnet').chain(token.chainId), token)
        expect(JSON.stringify(token)).toBe(JSON.stringify(plain))
    })
})
