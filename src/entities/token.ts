import JSBI from 'jsbi'
import invariant from 'tiny-invariant'

import type { Address, TokenAddress } from '..'
import type { Icons } from '../constants'
import { ChainId, SolidityType } from '../constants'
import { tronAddressToEvm } from '../crypto/tronAddress'
import { validateAndParseAddress, validateSolidityTypeInstance } from '../utils'
import type { Chain } from './chain'
import { getChainById } from './chainList'
import { chainTable } from './chainTable'

export type TokenConstructor = {
    name?: string
    symbol?: string
    address: Address
    decimals: number
    chainId: ChainId
    chainFromId?: ChainId
    icons?: Icons
    userToken?: boolean
    deprecated?: boolean
    origin?: string
    attributes?: {
        solana?: string
        ton?: string
    }
}

/**
 * A token is any fungible financial instrument on Ethereum.
 *
 */
export class Token {
    public readonly decimals: number
    public readonly symbol?: string
    public readonly name?: string
    public readonly chainId: ChainId
    /** The token's contract address; empty for the chain's gas token. */
    public readonly address: TokenAddress
    public readonly icons?: Icons
    public readonly chainFromId?: ChainId
    public readonly userToken?: boolean
    public readonly deprecated: boolean
    public readonly attributes?: {
        solana?: string
        ton?: string
    }

    // Not serialized nor cloned: a deployment's chain leads back to its deployment.
    // TODO: make it `Chain` when the deprecated `new Token(params)` goes; only that constructor leaves it undefined, for
    // a chain id the global chain list does not know (svc-symbiosis-api task Trdyrn, step 5).
    readonly #chain: Chain | undefined

    /** A token of `chain`, which `params.chainId` names. */
    constructor(chain: Chain, params: TokenConstructor)
    /**
     * @deprecated Pass the token's chain (`new Token(chain, params)`): without it, it is looked up in the global chain
     * list by `params.chainId`, and a chain the list does not know leaves the token without one.
     */
    constructor(params: TokenConstructor)
    constructor(...args: [Chain, TokenConstructor] | [TokenConstructor]) {
        const [chain, params] = args.length === 2 ? args : [undefined, args[0]]
        if (chain && chain.id !== params.chainId) {
            throw new Error(`a token of chain ${params.chainId} given chain ${chain.id}`)
        }
        this.#chain = chain ?? getChainById(params.chainId)
        validateSolidityTypeInstance(JSBI.BigInt(params.decimals), SolidityType.uint8)

        this.decimals = params.decimals
        this.symbol = params.symbol
        this.name = params.name
        this.chainId = params.chainId
        this.icons = params.icons
        this.chainFromId = params.chainFromId
        this.userToken = params.userToken
        this.deprecated = !!params.deprecated
        this.attributes = params.attributes

        // A Tron address (base58 or hex) is kept in its EVM form; either way the address is checksummed.
        const address = this.#chain?.kind === 'tron' ? tronAddressToEvm(params.address) : params.address
        this.address = validateAndParseAddress(address)
    }

    public toString(): string {
        return `${this.symbol || this.name || this.address}@${this.chainId}`
    }

    public get isNative(): boolean {
        return this.address === '' && !this.attributes?.ton && !this.attributes?.solana
    }

    /**
     * The token that pools hold for this one: its chain's wrapped gas token for the gas token, else itself. The gas
     * token of a chain without a wrapped one stays as it is.
     */
    public get wrapped(): Token {
        return (this.isNative && this.#chain?.wrappedGasToken) || this
    }

    /**
     * Returns true if the two tokens are equivalent, i.e. have the same chainId and address.
     * @param other other token to compare
     */
    public equals(other: Token): boolean {
        // short circuit on reference equality
        if (this === other) {
            return true
        }
        return this.chainId === other.chainId && this.address === other.address
    }

    /**
     * Returns true if the address of this token sorts before the address of the other token
     * @param other other token to compare
     * @throws if the tokens have the same address
     * @throws if the tokens are on different chains
     */
    public sortsBefore(other: Token): boolean {
        invariant(this.chainId === other.chainId, 'CHAIN_IDS')
        invariant(this.address !== other.address, 'ADDRESSES')
        return this.address.toLowerCase() < other.address.toLowerCase()
    }
    get isSynthetic() {
        return !!this.chainFromId
    }

    /** The token's chain; undefined only for a token built without one (deprecated) on a chain sdk-types does not know. */
    get chain(): Chain | undefined {
        return this.#chain
    }

    /** @deprecated Take the chain from a Deployment (`deployment.chain(token.chainFromId)`) instead. */
    get chainFrom(): Chain | undefined {
        return getChainById(this.chainFromId)
    }

    get tonAddress(): string {
        if (!this.attributes?.ton) {
            throw new Error(`${this.name} has no ton address`)
        }
        return this.attributes.ton
    }

    get solAddress(): string {
        if (!this.attributes?.solana) {
            throw new Error(`${this.name} has no solana address`)
        }
        return this.attributes.solana
    }
}
/**
 * Compares two currencies for equality
 */
export function tokenEquals(tokenA: Token, tokenB: Token): boolean {
    return tokenA.equals(tokenB)
}

/** @deprecated Use the token's chain's `isTron` (Chain) instead. */
export function isTronToken(token: Token): boolean {
    return token.chain?.kind === 'tron'
}

/**
 * @deprecated Use the chain's `wrappedGasToken` (Chain), which is undefined on a chain without one. Whether the chain
 * has no wrapped gas token, so that WETH holds a placeholder for it.
 */
export function isFakeWETH(chainId: ChainId): boolean {
    const chain = getChainById(chainId)
    return chain !== undefined && chain.wrappedGasToken === undefined
}

/**
 * @deprecated Use the chain's `wrappedGasToken` (Chain) instead; kept for the packages that still use it. A chain without
 * a wrapped gas token has a placeholder here: a token with no address and no decimals.
 */
export const WETH = chainTable(
    (chain) => chain.wrappedGasToken ?? new Token(chain, { chainId: chain.id, address: '', decimals: 0 })
)
