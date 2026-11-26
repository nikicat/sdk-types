import invariant from 'tiny-invariant'

import type { ChainId } from '../constants'
import { Price } from './fractions'
import type { Pair } from './pair'
import type { Token } from './token'
import type { Chain } from './chain'
import { getChainById } from './chainList'

/**
 * A path through Uniswap V2 pairs on one chain, from `input` to `output`. A cross-chain swap has one route per chain
 * it trades on.
 *
 * Pairs hold the chain's wrapped gas token, never the gas token itself, so a route from or to the gas token goes
 * through its wrapped form; the route keeps its `chain` for that.
 */
export class Route {
    public readonly pairs: Pair[]
    /** The tokens the route passes through, the gas token wrapped. */
    public readonly path: Token[]
    public readonly input: Token
    public readonly output: Token
    /** How much `output` one `input` buys at the pairs' reserves, before any trade moves them. */
    public readonly midPrice: Price
    public readonly chain: Chain

    /** A route from `input` to `output` through `pairs`, all of them on `chain`. */
    public constructor(chain: Chain, pairs: Pair[], input: Token, output: Token)
    /** @deprecated Pass the pairs' chain first (`new Route(chain, pairs, input, output)`): without it, it is looked up in the global chain list. */
    public constructor(pairs: Pair[], input: Token, output: Token)
    public constructor(...args: [Chain, Pair[], Token, Token] | [Pair[], Token, Token]) {
        const [chain, pairs, input, output] = Array.isArray(args[0])
            ? [undefined, ...(args as [Pair[], Token, Token])]
            : (args as [Chain, Pair[], Token, Token])
        invariant(pairs.length > 0, 'PAIRS')
        invariant(
            pairs.every((pair) => pair.chainId === pairs[0].chainId),
            'CHAIN_IDS'
        )
        this.chain = chain ?? getChainById(pairs[0].chainId)!
        invariant(this.chain.id === pairs[0].chainId, 'CHAIN')
        const first = pairs[0]
        const last = pairs[pairs.length - 1]
        invariant(first.involvesToken(input.wrapped), 'INPUT')
        invariant(last.involvesToken(output.wrapped), 'OUTPUT')

        const path: Token[] = [input.wrapped]
        for (const [i, pair] of pairs.entries()) {
            const currentInput = path[i]
            invariant(currentInput.equals(pair.token0) || currentInput.equals(pair.token1), 'PATH')
            const output = currentInput.equals(pair.token0) ? pair.token1 : pair.token0
            path.push(output)
        }

        this.pairs = pairs
        this.path = path
        this.midPrice = Price.fromRoute(this)
        this.input = input
        this.output = output
    }

    public get chainId(): ChainId {
        return this.pairs[0].chainId
    }
}
