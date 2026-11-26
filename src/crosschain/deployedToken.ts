import type { ChainId } from '../constants'
import { type Chain, Token } from '../entities'
import { NoTransitTokenError, SdkError } from '../errors'
import type { OmniPoolInfo, OmniPoolTokenIndex, TokenInfo } from './config/cache/types'
import type { EvmAddress, OmniPoolCoinGeckoId, OmniPoolConfig } from './types'

/**
 * A token a deployment knows, with its synthetics on other chains. Get one from a Deployment (`deployment.tokens()`,
 * `deployment.token(token)`); the pool a token trades in is the deployment's to say (`deployment.omniPoolOf`), since a
 * token does not know the pools that hold it.
 */
export class DeployedToken extends Token {
    // Not serialized: it is the deployment's data.
    readonly #info: TokenInfo
    readonly #synthetics: SyntheticToken[] = []

    /** @internal Built by its Deployment. */
    public constructor(chain: Chain, info: TokenInfo) {
        super(chain, info)
        this.#info = info
    }

    /** @internal The token's entry in its deployment's data. */
    public get info(): TokenInfo {
        return this.#info
    }

    /**
     * The synthetics of this token on other chains. A synthetic can have its own: sSIS on the Symbiosis chain is a
     * synthetic of SIS on BSC, itself a synthetic of SIS on Ethereum. The gas token has none; its wrapped token has.
     */
    public get synthetics(): SyntheticToken[] {
        return [...this.#synthetics]
    }

    /** This token's synthetic on `chainId`, such as the one an omni pool on that chain holds. */
    public syntheticOn(chainId: ChainId): SyntheticToken | undefined {
        return this.#synthetics.find((synth) => synth.chainId === chainId)
    }

    /** @internal While its Deployment is built. */
    public addSynthetic(synthetic: SyntheticToken): void {
        this.#synthetics.push(synthetic)
    }
}

/** A synthetic token: one minted on its chain for its original on another (`chainFromId`). */
export class SyntheticToken extends DeployedToken {
    #original?: DeployedToken

    /** The token this one is minted for, on `chainFromId`. */
    public get original(): DeployedToken {
        if (!this.#original) throw new SdkError(`Synthetic token ${this.address} has no original`)
        return this.#original
    }

    /** @internal While its Deployment is built. */
    public setOriginal(original: DeployedToken): void {
        if (original.chainId !== this.chainFromId) {
            throw new SdkError(
                `Synthetic token ${this.address} of chain ${this.chainFromId} has an original on another`
            )
        }
        this.#original = original
        original.addSynthetic(this)
    }
}

/**
 * An omni pool of a deployment: the contract on the host chain that swaps between the synthetics of one asset's tokens,
 * with its tokens and their indexes in the contract. It is an OmniPoolConfig, so it goes where one does.
 */
export class OmniPool implements OmniPoolConfig {
    /** The chain the pool's contract is on (the deployment's host chain). */
    public readonly chainId: ChainId
    /** The pool contract's address. */
    public readonly address: EvmAddress
    /** The address of the pool's oracle contract (`OmniPoolOracle`), which quotes swaps through the pool. */
    public readonly oracle: EvmAddress
    /** Whether a route may swap on its source or destination chain to reach this pool's tokens (see OmniPoolConfig). */
    public readonly generalPurpose: boolean
    /** The CoinGecko id of the asset the pool holds; it also names the pool. */
    public readonly coinGeckoId: OmniPoolCoinGeckoId
    readonly #info: OmniPoolInfo
    // Each token's index in the pool contract.
    readonly #indexes = new Map<DeployedToken, OmniPoolTokenIndex>()

    /** @internal Built by its Deployment. */
    public constructor(info: OmniPoolInfo, tokens: { index: OmniPoolTokenIndex; token: DeployedToken }[]) {
        this.chainId = info.chainId
        this.address = info.address
        this.oracle = info.oracle
        this.generalPurpose = info.generalPurpose
        this.coinGeckoId = info.coinGeckoId
        this.#info = info
        for (const { index, token } of tokens) {
            if (!this.#indexes.has(token)) this.#indexes.set(token, index)
        }
    }

    /** @internal The pool's entry in its deployment's data. */
    public get info(): OmniPoolInfo {
        return this.#info
    }

    /** The pool's tokens, in the order of their indexes. */
    public get tokens(): DeployedToken[] {
        return [...this.#indexes.keys()]
    }

    /** Whether the pool holds `token`. */
    public has(token: DeployedToken): boolean {
        return this.#indexes.has(token)
    }

    /** The token's index in the pool. Errors for a token that is not in it. */
    public indexOf(token: DeployedToken): OmniPoolTokenIndex {
        const index = this.#indexes.get(token)
        if (index === undefined) {
            throw new NoTransitTokenError(`There is no token ${token.info.address} in omniPool ${this.address}`)
        }
        return index
    }

    /**
     * The tokens that enter the pool from `chainId`: the originals there of the synthetics it holds, and the tokens it
     * holds itself on its own chain; neither deprecated nor synthetic.
     */
    public transitTokens(chainId: ChainId): DeployedToken[] {
        const tokens = new Set<DeployedToken>()
        for (const token of this.#indexes.keys()) {
            const entering = token instanceof SyntheticToken ? token.original : token
            if (entering.chainId === chainId && !entering.isSynthetic && !entering.deprecated) tokens.add(entering)
        }
        return [...tokens]
    }

    /** The token that enters the pool from `chainId`. Errors when the chain has none, or more than one. */
    public transitToken(chainId: ChainId): DeployedToken {
        const tokens = this.transitTokens(chainId)
        if (tokens.length === 0) {
            throw new NoTransitTokenError(`Cannot find transitToken for chain ${chainId}. Pool: ${this.address}`)
        }
        if (tokens.length > 1) {
            const symbols = tokens.map((token) => token.symbol).join(', ')
            throw new SdkError(
                `Chain ${chainId} has ${tokens.length} transit tokens for pool ${this.address}: ${symbols}`
            )
        }
        return tokens[0]
    }
}
