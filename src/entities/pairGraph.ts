import invariant from 'tiny-invariant'

import { TradeType, ZERO } from '../constants'
import { InsufficientInputAmountError, InsufficientReservesError } from '../errors'
import { bestOf } from '../utils'
import type { Chain } from './chain'
import type { TokenAmount } from './fractions'
import type { Pair } from './pair'
import { Route } from './route'
import type { Token } from './token'
import { type BestTradeOptions, Trade, tradeComparator } from './trade'

/** The best trades a search found, and why the amount could not start through some pairs. */
export interface BestTrades {
    /** Best first: the most out for the least in, then the least price impact, then the fewest hops. */
    trades: Trade[]
    /**
     * For each pair at the exact amount's end that cannot take it, why: the amount in is too small to give anything
     * out, or the amount out is more than the pair holds.
     */
    errors: Error[]
}

/**
 * Uniswap V2 pairs on one chain, as a graph of the swaps between their tokens, to find the best trades through them.
 * The graph finds the routes; a Trade swaps along each, from its exact amount in or back from its exact amount out. A
 * trade takes one route: a split among routes could do better.
 */
export class PairGraph {
    public constructor(
        public readonly chain: Chain,
        public readonly pairs: Pair[]
    ) {
        invariant(
            pairs.every((pair) => pair.chainId === chain.id),
            'CHAIN_IDS'
        )
    }

    /** The best trades from an exact `amountIn` to `tokenOut`, of at most `maxHops` pairs. */
    public bestTradesExactIn(amountIn: TokenAmount, tokenOut: Token, options: BestTradeOptions = {}): BestTrades {
        return this.bestTrades(amountIn.token, tokenOut, amountIn, TradeType.EXACT_INPUT, options)
    }

    /** The best trades from `tokenIn` to an exact `amountOut`, of at most `maxHops` pairs. */
    public bestTradesExactOut(tokenIn: Token, amountOut: TokenAmount, options: BestTradeOptions = {}): BestTrades {
        return this.bestTrades(tokenIn, amountOut.token, amountOut, TradeType.EXACT_OUTPUT, options)
    }

    private bestTrades(
        input: Token,
        output: Token,
        amount: TokenAmount,
        type: TradeType,
        { maxNumResults = 3, maxHops = 3 }: BestTradeOptions
    ): BestTrades {
        invariant(maxHops > 0, 'MAX_HOPS')
        const tries = Array.from(this.paths(this.pairs, input.wrapped, output.wrapped, maxHops), (path) =>
            tryTrade(new Route(this.chain, path, input, output), amount, type)
        )
        // each pair at the exact amount's end, as a route of its own
        const exact = amount.token.wrapped
        const firstHops = this.pairs
            .filter((pair) => holds(pair, exact))
            .map((pair) => {
                const other = pair.token0.equals(exact) ? pair.token1 : pair.token0
                const [from, to] = exact.equals(input.wrapped) ? [input, other] : [other, output]
                return tryTrade(new Route(this.chain, [pair], from, to), amount, type)
            })
        return {
            trades: bestOf(
                tries.filter((tried) => tried instanceof Trade),
                maxNumResults,
                tradeComparator
            ),
            errors: firstHops.filter((tried) => tried instanceof Error),
        }
    }

    // Each path from `from` to `to` through `pairs`, each pair at most once, of at most `hops` pairs, in the order of
    // the search, which ranks equal trades.
    private *paths(pairs: Pair[], from: Token, to: Token, hops: number): Generator<Pair[]> {
        for (const [i, pair] of pairs.entries()) {
            if (!pair.involvesToken(from)) continue
            const next = pair.token0.equals(from) ? pair.token1 : pair.token0
            if (next.equals(to)) {
                yield [pair]
            } else if (hops > 1 && pairs.length > 1) {
                const others = pairs.slice(0, i).concat(pairs.slice(i + 1))
                for (const path of this.paths(others, next, to, hops - 1)) yield [pair, ...path]
            }
        }
    }
}

// Whether a swap can start through `pair` from `token`: it holds the token, and neither reserve is empty.
function holds(pair: Pair, token: Token): boolean {
    return pair.involvesToken(token) && !pair.reserve0.equalTo(ZERO) && !pair.reserve1.equalTo(ZERO)
}

// The trade along `route`, or the error when a pair on it cannot take the amount.
function tryTrade(route: Route, amount: TokenAmount, type: TradeType): Trade | Error {
    try {
        return new Trade(route, amount, type)
    } catch (error) {
        if (error instanceof InsufficientInputAmountError || error instanceof InsufficientReservesError) return error
        throw error
    }
}
