import { ChainId, type Icons } from '../constants'
import type { ChainData, ChainKind, EvmAddress } from '../crosschain/types'
import { type PairAddressOf, pairAddressesOf } from './pairAddresses'
import { Token } from './token'

/**
 * A chain: its own data (CHAIN_DATA, or a test's) and what depends only on it, such as its wrapped gas token and its
 * Uniswap V2 pair addresses. A Deployment gives each of its chains with the deployment's setup on it (DeployedChain).
 */
export class Chain {
    /** The chain's id: the chain's own id where it has one (Ethereum's 1, Tron's), else one Symbiosis gives it. */
    public readonly id: ChainId
    /** The chain's name as people know it, such as `Ethereum` or `BNB`. */
    public readonly name: string
    /** The base URL of the chain's block explorer, such as `https://etherscan.io`. */
    public readonly explorer: string
    /** The URLs of the chain's logo, small and large, either of which can be missing. */
    public readonly icons: Icons
    /** What kind of chain it is (ChainKind), which decides its address format and how a transfer to it is built. */
    public readonly kind: ChainKind
    /**
     * @deprecated Always false: whether an app shows a chain as out of service is the app's to keep, in its own type
     * of chain. Kept as an own field so that copies of chains (`{ ...chain }`) keep it too.
     */
    public readonly disabled: boolean = false
    /**
     * @deprecated Always true: whether an app offers a chain for swaps is the app's to keep, in its own type of chain.
     */
    public readonly swappable: boolean = true

    /**
     * The token that pays for gas, such as ETH or BNB: its address is empty, except on chains whose gas token is also a
     * contract (Metis, Tempo, Stable, Arc).
     */
    public readonly gasToken: Token
    /** The wrapped gas token, such as WETH, WBNB or WTRX, or undefined for a chain without one. */
    public readonly wrappedGasToken?: Token
    private readonly pairAddressOf: PairAddressOf

    /** @param data The chain's plain data: its CHAIN_DATA entry, or a test's own. */
    public constructor(public readonly data: ChainData) {
        this.id = data.id
        this.name = data.name
        this.explorer = data.explorer
        this.icons = data.icons
        this.kind = data.kind
        this.gasToken = new Token(this, data.gasToken)
        this.wrappedGasToken = data.wrappedGasToken && new Token(this, data.wrappedGasToken)
        this.pairAddressOf = pairAddressesOf(data)
    }

    /** The address of this chain's Uniswap V2 pair of two of its tokens: a known pair's, or the factory's CREATE2. */
    public pairAddress(tokenA: Token, tokenB: Token): EvmAddress {
        const [token0, token1] = tokenA.sortsBefore(tokenB) ? [tokenA, tokenB] : [tokenB, tokenA] // does safety checks
        return this.pairAddressOf(token0.address, token1.address)
    }
}

/**
 * A chain's plain fields, without its behaviour: what a copy of a chain (`{ ...chain }`) keeps, for code that passes
 * chains around as records.
 */
export type ChainMetadata = Pick<Chain, 'id' | 'name' | 'explorer' | 'icons' | 'kind' | 'disabled' | 'swappable'>
