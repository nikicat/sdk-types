import { describe, expect, it } from 'vitest'

import type { ChainId } from '../constants'
import { InsufficientInputAmountError, InsufficientReservesError } from '../errors'
import type { ChainData } from '../crosschain/types'
import { Chain } from './chain'
import { TokenAmount } from './fractions'
import { Pair } from './pair'
import { PairGraph } from './pairGraph'
import { Token } from './token'

const LOCAL = 31337 as ChainId
const [wethAddress, usdAddress, daiAddress] = [
    '0x5FbDB2315678afecb367f032d93F642f64180aa3',
    '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512',
    '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0',
] as const
const data: ChainData = {
    id: LOCAL,
    name: 'Hardhat',
    explorer: '',
    icons: {},
    kind: 'evm',
    gasToken: { chainId: LOCAL, address: '', decimals: 18, symbol: 'ETH' },
    wrappedGasToken: { chainId: LOCAL, address: wethAddress, decimals: 18, symbol: 'WETH' },
    uniswapV2: { pairs: [] },
}
const chain = new Chain(data)
const weth = chain.wrappedGasToken!
const usd = new Token(chain, { chainId: LOCAL, address: usdAddress, decimals: 6, symbol: 'USD' })
const dai = new Token(chain, { chainId: LOCAL, address: daiAddress, decimals: 18, symbol: 'DAI' })
const amount = (token: Token, raw: string) => new TokenAmount(token, raw)
const pair = (a: TokenAmount, b: TokenAmount, n: number) =>
    new Pair(a, b, `0x${n.toString(16).padStart(40, '0')}` as `0x${string}`)
// ETH -> USD only through DAI
const ethDai = pair(amount(weth, '1000000000000000000000'), amount(dai, '2000000000000000000000000'), 1)
const daiUsd = pair(amount(dai, '1000000000000000000000000'), amount(usd, '1000000000000'), 2)
const graph = new PairGraph(chain, [ethDai, daiUsd])

describe('PairGraph', () => {
    it('finds a trade of several hops, from and to the gas token', () => {
        const { trades, errors } = graph.bestTradesExactIn(amount(chain.gasToken, '1000000000000000000'), usd)
        expect(errors).toEqual([])
        expect(trades).toHaveLength(1)
        expect(trades[0].route.path.map((token) => token.symbol)).toEqual(['WETH', 'DAI', 'USD'])
        expect(trades[0].inputAmount.token).toBe(chain.gasToken)

        const [exactOut] = graph.bestTradesExactOut(chain.gasToken, amount(usd, '1000000')).trades
        expect(exactOut.route.path.map((token) => token.symbol)).toEqual(['WETH', 'DAI', 'USD'])
        expect(exactOut.outputAmount.raw.toString()).toBe('1000000')
    })

    it('takes no more hops than allowed', () => {
        expect(graph.bestTradesExactIn(amount(weth, '1000000000000000000'), usd, { maxHops: 1 }).trades).toEqual([])
    })

    it('says why the amount cannot start through a pair: too little in, or more out than it holds', () => {
        // one wei of DAI is worth less than a unit of either other token
        const exactIn = graph.bestTradesExactIn(amount(dai, '1'), usd)
        expect(exactIn.trades).toEqual([])
        expect(exactIn.errors).toHaveLength(2)
        for (const error of exactIn.errors) expect(error).toBeInstanceOf(InsufficientInputAmountError)

        const exactOut = graph.bestTradesExactOut(weth, amount(usd, '1000000000000'))
        expect(exactOut.trades).toEqual([])
        expect(exactOut.errors[0]).toBeInstanceOf(InsufficientReservesError)
    })
})
