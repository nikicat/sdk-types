import JSBI from 'jsbi'
import invariant from 'tiny-invariant'

import type { EvmAddress } from '..'
import type { BigintIsh } from '../constants'
import { _1000, _997, ChainId, FIVE, MINIMUM_LIQUIDITY, ONE, ZERO } from '../constants'
import { CHAIN_DATA } from '../crosschain/chainData'
import { InsufficientInputAmountError, InsufficientReservesError } from '../errors'
import { parseBigintIsh, sqrt } from '../utils'
import { Price, TokenAmount } from './fractions'
import { getChainById } from './chainList'
import { Token } from './token'

/** @deprecated Read it from the chain data (CHAIN_DATA) instead; kept for the packages that still use it. */
export const FACTORY_ADDRESS = Object.fromEntries(
    CHAIN_DATA.flatMap(({ id, uniswapV2 }) => ('factory' in uniswapV2 ? [[id, uniswapV2.factory]] : []))
) as Record<ChainId, EvmAddress>

/** @deprecated Read it from the chain data (CHAIN_DATA) instead; kept for the packages that still use it. */
export const INIT_CODE_HASH = Object.fromEntries(
    CHAIN_DATA.flatMap(({ id, uniswapV2 }) => ('initCodeHash' in uniswapV2 ? [[id, uniswapV2.initCodeHash]] : []))
) as Record<ChainId, string>

export class MapWithDefault<K, V> extends Map<K, V> {
    #default: () => V
    get(key: K): V {
        if (!this.has(key)) {
            this.set(key, this.#default())
        }
        return super.get(key) as V
    }

    constructor(defaultFunction: () => V, entries?: readonly (readonly [K, V])[] | null) {
        super(entries)
        this.#default = defaultFunction
    }
}

/** A swap through a pair: the amount that comes out of it (or has to go in), and the pair after the swap. */
export interface PairSwap {
    amount: TokenAmount
    pairAfter: Pair
}

/**
 * A Uniswap V2 pair of two tokens on one chain, at given reserves: a snapshot of the pool, from which the amounts of a
 * swap are computed with the constant product formula (x * y = k). The pair does not change; a swap gives the pair
 * after it.
 *
 * Its tokens are kept sorted by address (`token0` before `token1`), as the pool contract sorts them, and its address
 * is the pool contract's (`liquidityToken`).
 */
export class Pair {
    /** The pool's LP token, whose address is the pool contract's. */
    public readonly liquidityToken: Token
    private readonly tokenAmounts: [TokenAmount, TokenAmount]

    /**
     * The address of the chain's Uniswap V2 pair of the two tokens, derived from its factory (CREATE2).
     * @deprecated Use the chain's `pairAddress(tokenA, tokenB)` (Chain) instead.
     */
    public static getAddress(tokenA: Token, tokenB: Token): EvmAddress {
        return getChainById(tokenA.chainId)!.pairAddress(tokenA, tokenB)
    }

    /** @param address The pair's address, such as its chain's `pairAddress(tokenA, tokenB)`. */
    public constructor(tokenAmountA: TokenAmount, tokenAmountB: TokenAmount, address: EvmAddress)
    /** @deprecated Pass the pair's address (`chain.pairAddress(tokenA, tokenB)`): without it, it is derived through the global chain list. */
    public constructor(tokenAmountA: TokenAmount, tokenAmountB: TokenAmount)
    public constructor(tokenAmountA: TokenAmount, tokenAmountB: TokenAmount, address?: EvmAddress) {
        const tokenAmounts = tokenAmountA.token.sortsBefore(tokenAmountB.token) // does safety checks
            ? [tokenAmountA, tokenAmountB]
            : [tokenAmountB, tokenAmountA]
        const lpToken = {
            chainId: tokenAmounts[0].token.chainId,
            address: address ?? Pair.getAddress(tokenAmounts[0].token, tokenAmounts[1].token),
            decimals: 18,
            symbol: 'UNI-V2',
            name: 'Uniswap V2',
        }
        const chain = tokenAmounts[0].token.chain
        this.liquidityToken = chain ? new Token(chain, lpToken) : new Token(lpToken)
        this.tokenAmounts = tokenAmounts as [TokenAmount, TokenAmount]
    }

    private get address(): EvmAddress {
        return this.liquidityToken.address as EvmAddress
    }

    /**
     * Returns true if the token is either token0 or token1
     * @param token to check
     */
    public involvesToken(token: Token): boolean {
        return token.equals(this.token0) || token.equals(this.token1)
    }

    /**
     * Returns the current mid price of the pair in terms of token0, i.e. the ratio of reserve1 to reserve0
     */
    public get token0Price(): Price {
        return new Price(this.token0, this.token1, this.tokenAmounts[0].raw, this.tokenAmounts[1].raw)
    }

    /**
     * Returns the current mid price of the pair in terms of token1, i.e. the ratio of reserve0 to reserve1
     */
    public get token1Price(): Price {
        return new Price(this.token1, this.token0, this.tokenAmounts[1].raw, this.tokenAmounts[0].raw)
    }

    /**
     * Return the price of the given token in terms of the other token in the pair.
     * @param token token to return price of
     */
    public priceOf(token: Token): Price {
        invariant(this.involvesToken(token), 'TOKEN')
        return token.equals(this.token0) ? this.token0Price : this.token1Price
    }

    /**
     * Returns the chain ID of the tokens in the pair.
     */
    public get chainId(): ChainId {
        return this.token0.chainId
    }

    public get token0(): Token {
        return this.tokenAmounts[0].token
    }

    public get token1(): Token {
        return this.tokenAmounts[1].token
    }

    public get reserve0(): TokenAmount {
        return this.tokenAmounts[0]
    }

    public get reserve1(): TokenAmount {
        return this.tokenAmounts[1]
    }

    public reserveOf(token: Token): TokenAmount {
        invariant(this.involvesToken(token), 'TOKEN')
        return token.equals(this.token0) ? this.reserve0 : this.reserve1
    }

    /**
     * What swapping `inputAmount` into the pair gives out, and the pair after the swap. The swap pays Uniswap V2's
     * 0.3% fee, whatever the DEX's own fee is.
     * @throws InsufficientReservesError when a reserve is empty
     * @throws InsufficientInputAmountError when the input is too small to give anything out
     */
    public getOutputAmount(inputAmount: TokenAmount): PairSwap {
        invariant(this.involvesToken(inputAmount.token), 'TOKEN')
        if (JSBI.equal(this.reserve0.raw, ZERO) || JSBI.equal(this.reserve1.raw, ZERO)) {
            throw new InsufficientReservesError()
        }
        const inputReserve = this.reserveOf(inputAmount.token)
        const outputReserve = this.reserveOf(inputAmount.token.equals(this.token0) ? this.token1 : this.token0)
        // Uniswap V2's 0.3% fee (997/1000), whatever the DEX's own fee is: on a DEX that charges less, such as
        // PancakeSwap V2 at 0.25% (ChainConfig.dexFee 25 on BSC), the amount out is a little short of the pool's
        // (svc-symbiosis-api task Th75nt).
        const inputAmountWithFee = JSBI.multiply(inputAmount.raw, _997)
        const numerator = JSBI.multiply(inputAmountWithFee, outputReserve.raw)
        const denominator = JSBI.add(JSBI.multiply(inputReserve.raw, _1000), inputAmountWithFee)
        const outputAmount = new TokenAmount(
            inputAmount.token.equals(this.token0) ? this.token1 : this.token0,
            JSBI.divide(numerator, denominator)
        )
        if (JSBI.equal(outputAmount.raw, ZERO)) {
            throw new InsufficientInputAmountError()
        }
        return {
            amount: outputAmount,
            pairAfter: new Pair(inputReserve.add(inputAmount), outputReserve.subtract(outputAmount), this.address),
        }
    }

    /**
     * What has to go into the pair to get `outputAmount` out, rounded up, and the pair after the swap. The swap pays
     * Uniswap V2's 0.3% fee, as in getOutputAmount.
     * @throws InsufficientReservesError when a reserve is empty or holds no more than `outputAmount`
     */
    public getInputAmount(outputAmount: TokenAmount): PairSwap {
        invariant(this.involvesToken(outputAmount.token), 'TOKEN')
        if (
            JSBI.equal(this.reserve0.raw, ZERO) ||
            JSBI.equal(this.reserve1.raw, ZERO) ||
            JSBI.greaterThanOrEqual(outputAmount.raw, this.reserveOf(outputAmount.token).raw)
        ) {
            throw new InsufficientReservesError()
        }

        const outputReserve = this.reserveOf(outputAmount.token)
        const inputReserve = this.reserveOf(outputAmount.token.equals(this.token0) ? this.token1 : this.token0)
        // Uniswap V2's 0.3% fee, as in getOutputAmount.
        const numerator = JSBI.multiply(JSBI.multiply(inputReserve.raw, outputAmount.raw), _1000)
        const denominator = JSBI.multiply(JSBI.subtract(outputReserve.raw, outputAmount.raw), _997)
        const inputAmount = new TokenAmount(
            outputAmount.token.equals(this.token0) ? this.token1 : this.token0,
            JSBI.add(JSBI.divide(numerator, denominator), ONE)
        )
        return {
            amount: inputAmount,
            pairAfter: new Pair(inputReserve.add(inputAmount), outputReserve.subtract(outputAmount), this.address),
        }
    }

    public getLiquidityMinted(
        totalSupply: TokenAmount,
        tokenAmountA: TokenAmount,
        tokenAmountB: TokenAmount
    ): TokenAmount {
        invariant(totalSupply.token.equals(this.liquidityToken), 'LIQUIDITY')
        const tokenAmounts = tokenAmountA.token.sortsBefore(tokenAmountB.token) // does safety checks
            ? [tokenAmountA, tokenAmountB]
            : [tokenAmountB, tokenAmountA]
        invariant(tokenAmounts[0].token.equals(this.token0) && tokenAmounts[1].token.equals(this.token1), 'TOKEN')

        let liquidity: JSBI
        if (JSBI.equal(totalSupply.raw, ZERO)) {
            liquidity = JSBI.subtract(sqrt(JSBI.multiply(tokenAmounts[0].raw, tokenAmounts[1].raw)), MINIMUM_LIQUIDITY)
        } else {
            const amount0 = JSBI.divide(JSBI.multiply(tokenAmounts[0].raw, totalSupply.raw), this.reserve0.raw)
            const amount1 = JSBI.divide(JSBI.multiply(tokenAmounts[1].raw, totalSupply.raw), this.reserve1.raw)
            liquidity = JSBI.lessThanOrEqual(amount0, amount1) ? amount0 : amount1
        }
        if (!JSBI.greaterThan(liquidity, ZERO)) {
            throw new InsufficientInputAmountError()
        }
        return new TokenAmount(this.liquidityToken, liquidity)
    }

    public getLiquidityValue(
        token: Token,
        totalSupply: TokenAmount,
        liquidity: TokenAmount,
        feeOn = false,
        kLast?: BigintIsh
    ): TokenAmount {
        invariant(this.involvesToken(token), 'TOKEN')
        invariant(totalSupply.token.equals(this.liquidityToken), 'TOTAL_SUPPLY')
        invariant(liquidity.token.equals(this.liquidityToken), 'LIQUIDITY')
        invariant(JSBI.lessThanOrEqual(liquidity.raw, totalSupply.raw), 'LIQUIDITY')

        let totalSupplyAdjusted: TokenAmount
        if (!feeOn) {
            totalSupplyAdjusted = totalSupply
        } else {
            invariant(!!kLast, 'K_LAST')
            const kLastParsed = parseBigintIsh(kLast)
            if (!JSBI.equal(kLastParsed, ZERO)) {
                const rootK = sqrt(JSBI.multiply(this.reserve0.raw, this.reserve1.raw))
                const rootKLast = sqrt(kLastParsed)
                if (JSBI.greaterThan(rootK, rootKLast)) {
                    const numerator = JSBI.multiply(totalSupply.raw, JSBI.subtract(rootK, rootKLast))
                    const denominator = JSBI.add(JSBI.multiply(rootK, FIVE), rootKLast)
                    const feeLiquidity = JSBI.divide(numerator, denominator)
                    totalSupplyAdjusted = totalSupply.add(new TokenAmount(this.liquidityToken, feeLiquidity))
                } else {
                    totalSupplyAdjusted = totalSupply
                }
            } else {
                totalSupplyAdjusted = totalSupply
            }
        }

        return new TokenAmount(
            token,
            JSBI.divide(JSBI.multiply(liquidity.raw, this.reserveOf(token).raw), totalSupplyAdjusted.raw)
        )
    }
}
