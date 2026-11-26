import { describe, expect, it } from 'vitest'

import { ChainId } from '../constants'
import { chainData } from '../crosschain/chainData'
import type { ChainData } from '../crosschain/types'
import { Chain } from './chain'
import { TokenAmount } from './fractions'
import { Pair } from './pair'
import { PairGraph } from './pairGraph'
import { Route } from './route'
import { Token } from './token'

// A chain that none of sdk-types' global tables knows: what works on it reads nothing global.
const LOCAL = 31337 as ChainId
const wethAddress = '0x5FbDB2315678afecb367f032d93F642f64180aa3' as const
const usdAddress = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512' as const
const pairAddress = '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0' as const
const local: ChainData = {
    id: LOCAL,
    name: 'Hardhat',
    explorer: '',
    icons: {},
    kind: 'evm',
    gasToken: { chainId: LOCAL, address: '', decimals: 18, symbol: 'ETH' },
    wrappedGasToken: { chainId: LOCAL, address: wethAddress, decimals: 18, symbol: 'WETH' },
    uniswapV2: {
        pairs: [{ token0: usdAddress.toLowerCase() as `0x${string}`, token1: wethAddress, pair: pairAddress }],
    },
}
const chain = new Chain(local)
const usd = new Token({ chainId: LOCAL, address: usdAddress, decimals: 6, symbol: 'USD' })

describe('Chain', () => {
    it('wraps its gas token as its WETH and leaves other tokens', () => {
        expect(chain.gasToken.wrapped.address).toBe(wethAddress)
        expect(usd.wrapped).toBe(usd)
        expect(new TokenAmount(chain.gasToken, '5').wrapped.token.address).toBe(wethAddress)
    })

    it('leaves the gas token as it is on a chain without a wrapped one', () => {
        const btc = new Chain(chainData(ChainId.BTC_MAINNET))
        expect(btc.wrappedGasToken).toBeUndefined()
        expect(btc.gasToken.wrapped).toBe(btc.gasToken)
    })

    it('gives a known pair whatever the order and case of its tokens, and errors for an unknown one', () => {
        expect(chain.pairAddress(usd, chain.wrappedGasToken!)).toBe(pairAddress)
        expect(chain.pairAddress(chain.wrappedGasToken!, usd)).toBe(pairAddress)
        const other = new Token({ chainId: LOCAL, address: '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9', decimals: 18 })
        expect(() => chain.pairAddress(usd, other)).toThrow(/no Uniswap V2 pair/)
    })

    it('derives a pair from the factory and keeps it', () => {
        const eth = new Chain(chainData(ChainId.ETH_MAINNET))
        const [a, b] = [usdAddress, wethAddress].map(
            (address) => new Token({ chainId: ChainId.ETH_MAINNET, address, decimals: 18 })
        )
        const address = eth.pairAddress(a, b)
        expect(address).toMatch(/^0x[0-9a-fA-F]{40}$/)
        expect(eth.pairAddress(b, a)).toBe(address)
        const bsc = new Chain(chainData(ChainId.BSC_MAINNET))
        const onBsc = [usdAddress, wethAddress].map(
            (address) => new Token({ chainId: ChainId.BSC_MAINNET, address, decimals: 18 })
        )
        expect(bsc.pairAddress(onBsc[0], onBsc[1])).not.toBe(address)
    })

    it('finds the best trade from its gas token through its own WETH', () => {
        const weth = chain.wrappedGasToken!
        const pair = new Pair(
            new TokenAmount(weth, '1000000000000000000000'),
            new TokenAmount(usd, '3000000000000'),
            chain.pairAddress(weth, usd)
        )
        const { trades } = new PairGraph(chain, [pair]).bestTradesExactIn(
            new TokenAmount(chain.gasToken, '1000000000000000000'),
            usd
        )
        expect(trades).toHaveLength(1)
        expect(trades[0].route.chain).toBe(chain)
        expect(trades[0].route.path.map((token) => token.address)).toEqual([wethAddress, usdAddress])
        expect(trades[0].outputAmount.greaterThan('0')).toBe(true)
        expect(trades[0].priceBreakdown(30).realizedLPFee.token).toBe(chain.gasToken)

        const [exactOut] = new PairGraph(chain, [pair]).bestTradesExactOut(
            chain.gasToken,
            new TokenAmount(usd, '1000000')
        ).trades
        expect(exactOut.inputAmount.token).toBe(chain.gasToken)
        expect(new Route(chain, [pair], chain.gasToken, usd).path[0]).toBe(weth)
    })

    it('is of the kind its data gives, whatever its id', () => {
        expect(new Chain(chainData(ChainId.BTC_MAINNET)).kind).toBe('btc')
        expect(new Chain(chainData(ChainId.ETH_MAINNET)).kind).not.toBe('btc')
        expect(new Chain(chainData(ChainId.TRON_MAINNET)).kind).toBe('tron')
        expect(chain.kind).toBe('evm')
        const btcLike: ChainData = {
            ...local,
            id: 31338 as ChainId,
            kind: 'btc',
            btcNetwork: 'regtest',
            gasToken: { ...local.gasToken, chainId: 31338 as ChainId },
            wrappedGasToken: undefined,
        }
        expect(new Chain(btcLike).kind).toBe('btc')
    })

    it('makes its tokens with itself as their chain', () => {
        expect(chain.gasToken.chain).toBe(chain)
        expect(usd.chain).toBeUndefined() // built without a chain, on a chain the global list does not know
        const own = new Token(chain, { chainId: LOCAL, address: usdAddress, decimals: 6 })
        expect(own.chain).toBe(chain)
        expect(own.equals(usd)).toBe(true)
        expect(JSON.stringify(own)).not.toContain('Hardhat')
        expect(() => new Token(chain, { chainId: ChainId.ETH_MAINNET, address: usdAddress, decimals: 6 })).toThrow(
            /given chain/
        )
        const pair = new Pair(
            new TokenAmount(chain.wrappedGasToken!, '1000'),
            new TokenAmount(own, '1000'),
            chain.pairAddress(chain.wrappedGasToken!, own)
        )
        expect(pair.liquidityToken.chain).toBe(chain)
    })
})
