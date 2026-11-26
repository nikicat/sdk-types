import { getAddress } from '@ethersproject/address'
import { AddressZero } from '@ethersproject/constants'

import type { ChainId } from '../constants'
import { Chain, Token } from '../entities'
import { SdkError } from '../errors'
import { config as beta } from './config/beta'
import { chainData } from './chainData'
import betaCache from './config/cache/beta.json' with { type: 'json' }
import devCache from './config/cache/dev.json' with { type: 'json' }
import mainnetCache from './config/cache/mainnet.json' with { type: 'json' }
import testnetCache from './config/cache/testnet.json' with { type: 'json' }
import { type Id, type OmniPoolInfo, parseConfigCacheData, type TokenId, type TokenInfo } from './config/cache/types'
import { config as dev } from './config/dev'
import { config as mainnet } from './config/mainnet'
import { config as testnet } from './config/testnet'
import { DeployedToken, OmniPool, SyntheticToken } from './deployedToken'
import type { ChainConfig, Config, ConfigCacheData, ConfigName, OmniPoolConfig, TokenAddress } from './types'

/** A chain of a deployment: the chain, with the deployment's setup on it (`config`) and its tokens there. */
export class DeployedChain extends Chain {
    public constructor(public readonly config: ChainConfig) {
        if (config.id !== config.chain.id) {
            throw new SdkError(`chain config ${config.id} holds the data of chain ${config.chain.id}`)
        }
        super(config.chain)
    }

    readonly #tokens: DeployedToken[] = []
    // By address; a few addresses have one token per origin chain (see addToken).
    readonly #tokensByAddress = new Map<TokenAddress, DeployedToken[]>()

    /** The deployment's tokens on this chain, in the order of its data. */
    public tokens(): DeployedToken[] {
        return [...this.#tokens]
    }

    /** @internal The chain's token with `token`'s address and origin chain (`chainFromId`); Deployment.token for others. */
    public token(token: Token): DeployedToken | undefined {
        return this.#tokensByAddress.get(token.address)?.find((other) => other.chainFromId === token.chainFromId)
    }

    /** @internal While its Deployment is built. */
    public addToken(token: DeployedToken): void {
        this.#tokens.push(token)
        // The data can list a token twice: mainnet's sSIS (#113, #194) and sUSDC (#121, #195), whose originals are
        // themselves listed twice, as an original and as a synthetic (SIS on BSC #13 and #98, USDC on Telos #21 and
        // #100). A lookup gives the first entry, as the old search did; the second is reached only from its original's
        // synthetics.
        const sameAddress = this.#tokensByAddress.get(token.address)
        if (sameAddress) sameAddress.push(token)
        else this.#tokensByAddress.set(token.address, [token])
    }
}

/**
 * One Symbiosis deployment (mainnet, beta, testnet, dev, or a test's own), over its plain data: its Config and the
 * tokens and omni pools of its config cache. It gives its chains (DeployedChain), its tokens (DeployedToken) and its
 * omni pools (OmniPool), linked to each other.
 */
export class Deployment {
    private readonly chainsById: Map<ChainId, DeployedChain>
    readonly #tokens: DeployedToken[]
    // In the order of the data.
    readonly #pools: OmniPool[]

    public constructor(
        public readonly config: Config,
        public readonly cacheData: ConfigCacheData
    ) {
        this.chainsById = new Map(config.chains.map((chainConfig) => [chainConfig.id, new DeployedChain(chainConfig)]))
        // The data's ids wire the objects together; nothing keeps them afterwards.
        const byId = new Map<TokenId, DeployedToken>()
        this.#tokens = cacheData.tokens.map((info) => {
            const chain = this.findChain(info.chainId)
            if (!chain) {
                throw new SdkError(
                    `Token ${info.address} is on chain ${info.chainId}, which the deployment has no config for`
                )
            }
            if (info.chainFromId === undefined && info.originalId !== undefined) {
                throw new SdkError(`Token ${info.address} on chain ${info.chainId} has an original but no chainFromId`)
            }
            const token =
                info.chainFromId === undefined ? new DeployedToken(chain, info) : new SyntheticToken(chain, info)
            if (!byId.has(info.id)) byId.set(info.id, token)
            chain.addToken(token)
            return token
        })
        const tokenOfId = (id: TokenId) => {
            const token = byId.get(id)
            if (!token) throw new SdkError(`Can't get tokenInfo for id ${id}`)
            return token
        }
        for (const token of this.#tokens) {
            if (token instanceof SyntheticToken) {
                const { originalId } = token.info
                if (originalId === undefined) throw new SdkError(`Synthetic token ${token.address} has no original`)
                token.setOriginal(tokenOfId(originalId))
            }
        }
        this.#pools = []
        for (const info of cacheData.omniPools) {
            if (!this.findChain(info.chainId)) {
                throw new SdkError(
                    `Omni pool ${info.address} is on chain ${info.chainId}, which the deployment has no config for`
                )
            }
            if (this.#pools.some((pool) => pool.chainId === info.chainId && pool.address === info.address)) {
                throw new SdkError(`The data lists omni pool ${info.address} on chain ${info.chainId} twice`)
            }
            const entries = info.tokens.map(({ index, tokenId }) => ({ index, token: tokenOfId(tokenId) }))
            this.#pools.push(new OmniPool(info, entries))
        }
        this.checkConfigPools()
        this.checkOnePoolPerToken()
    }

    // The data's pools are built from the config's (the cache builder adds each pool's tokens), so a config that lists
    // pools lists the data's, in their order; one that does not is stale data or the wrong config.
    private checkConfigPools(): void {
        const configured = this.config.omniPools
        if (configured.length === 0) return
        const same =
            configured.length === this.#pools.length &&
            configured.every(
                (config, i) =>
                    config.chainId === this.#pools[i].chainId && getAddress(config.address) === this.#pools[i].address
            )
        if (!same) {
            const list = (pools: OmniPoolConfig[]) => pools.map((pool) => `${pool.chainId}:${pool.address}`).join(', ')
            throw new SdkError(
                `The config's omni pools (${list(configured)}) are not the data's (${list(this.#pools)})`
            )
        }
    }

    // A token trades in one pool at most, which omniPoolOf relies on: a synthetic, in the pool that holds it; another
    // token, in the pool that holds it or one of its synthetics.
    private checkOnePoolPerToken(): void {
        for (const token of this.#tokens) {
            const pools = this.#pools.filter((pool) => this.trades(pool, token))
            if (pools.length > 1) {
                const addresses = pools.map((pool) => pool.address).join(', ')
                throw new SdkError(`Token ${token.address} on chain ${token.chainId} trades in omni pools ${addresses}`)
            }
        }
    }

    private trades(pool: OmniPool, token: DeployedToken): boolean {
        return pool.has(token) || (!token.isSynthetic && token.synthetics.some((synthetic) => pool.has(synthetic)))
    }

    // The deployments sdk-types ships, the only place that knows them by name.
    private static readonly shipped: Record<ConfigName, Deployment> = {
        mainnet: new Deployment(mainnet, parseConfigCacheData(mainnetCache)),
        beta: new Deployment(beta, parseConfigCacheData(betaCache)),
        testnet: new Deployment(testnet, parseConfigCacheData(testnetCache)),
        dev: new Deployment(dev, parseConfigCacheData(devCache)),
    }

    /** A shipped deployment by its name. Errors for an unknown name. */
    public static named(name: ConfigName): Deployment {
        if (!Object.hasOwn(Deployment.shipped, name)) throw new SdkError('Unknown config name')
        return Deployment.shipped[name]
    }

    /** Errors when the deployment has no such chain. */
    public chain(chainId: ChainId): DeployedChain {
        const chain = this.findChain(chainId)
        if (!chain) throw new SdkError(`Could not config by given chainId: ${chainId}`)
        return chain
    }

    public findChain(chainId: ChainId): DeployedChain | undefined {
        return this.chainsById.get(chainId)
    }

    public chains(): DeployedChain[] {
        return [...this.chainsById.values()]
    }

    public tokens(): DeployedToken[] {
        return [...this.#tokens]
    }

    /**
     * The deployment's own token for `token` (one parsed from a request, read from a log, …), by chain, address and
     * origin chain; for the gas token, its wrapped token's when the data has not the gas token itself.
     */
    public token(token: Token): DeployedToken | undefined {
        const chain = this.findChain(token.chainId)
        return chain?.token(token) ?? (token.isNative ? chain?.token(token.wrapped) : undefined)
    }

    /** The deployment's omni pools, in the order of its data (and of its config, which lists the same). */
    public omniPools(): OmniPool[] {
        return [...this.#pools]
    }

    /** The omni pool `token` trades in: for a synthetic, the pool that holds it; for another token, the pool that holds
     * it or one of its synthetics. */
    public omniPoolOf(token: DeployedToken): OmniPool | undefined {
        return this.#pools.find((pool) => this.trades(pool, token))
    }
}

// A config for a deployment of `data` alone, for ConfigCache: each chain's shipped config, or a minimal one with no
// contracts.
function configOf(data: ConfigCacheData): Config {
    const chainIds = [
        ...new Set([...data.tokens.map((token) => token.chainId), ...data.omniPools.map((pool) => pool.chainId)]),
    ]
    const shipped = (['mainnet', 'beta', 'testnet', 'dev'] as const).map((name) => Deployment.named(name))
    return {
        advisor: { url: '' },
        omniPools: data.omniPools,
        revertableAddress: { default: AddressZero },
        limits: [],
        fallbackReceiver: AddressZero,
        btcConfigs: [],
        chains: chainIds.map(
            (chainId): ChainConfig =>
                shipped
                    .map((deployment) => deployment.findChain(chainId)?.config)
                    .find((config) => config !== undefined) ?? {
                    id: chainId,
                    chain: chainData(chainId),
                    rpc: '',
                    dexFee: 0,
                    filterBlockOffset: 0,
                    stables: [],
                    metaRouter: AddressZero,
                    metaRouterGateway: AddressZero,
                    multicallRouter: AddressZero,
                    router: AddressZero,
                    bridge: AddressZero,
                    synthesis: AddressZero,
                    portal: AddressZero,
                    fabric: AddressZero,
                }
        ),
    }
}

/**
 * @deprecated Use a Deployment instead (`Deployment.mainnet.token(token)?.syntheticOn(chainId)`, `omniPool.tokens`,
 * …); kept for the packages that still use it.
 */
export class ConfigCache {
    public readonly data: ConfigCacheData
    private readonly deployment: Deployment

    /** @param source A shipped deployment's name, its data alone, or the deployment itself. */
    public constructor(source: ConfigName | ConfigCacheData | Deployment) {
        this.deployment =
            source instanceof Deployment
                ? source
                : typeof source === 'string'
                  ? Deployment.named(source)
                  : new Deployment(configOf(source), source)
        this.data = this.deployment.cacheData
    }

    public tokens(): Token[] {
        return this.deployment.tokens()
    }

    /** A synthetic's original when it is on `chainId`; for any other token, its synthetic on `chainId`. */
    public getRepresentation(token: Token, chainId: ChainId): Token | undefined {
        const deployed = this.requireToken(token.isSynthetic ? token : token.wrapped)
        if (deployed instanceof SyntheticToken) {
            return deployed.original.chainId === chainId ? deployed.original : undefined
        }
        return deployed.syntheticOn(chainId)
    }

    public getOmniPoolByConfig(omniPoolConfig: OmniPoolConfig): OmniPoolInfo | undefined {
        return this.omniPool(omniPoolConfig)?.info
    }

    public getOmniPoolById(id: Id): OmniPoolInfo | undefined {
        return this.deployment.omniPools().find((pool) => pool.info.id === id)?.info
    }

    /**
     * For a synthetic, the pool that holds it; for another token, the pool that holds one of its wrapped form's
     * synthetics, or the token itself. Errors for a token the deployment has not.
     */
    public getOmniPoolByToken(token: Token): OmniPoolInfo | undefined {
        const deployed = this.requireToken(token.isSynthetic ? token : token.wrapped)
        return this.deployment.omniPoolOf(deployed)?.info
    }

    public getOmniPoolTokenIndex(omniPoolConfig: OmniPoolConfig, token: Token): number {
        const pool = this.omniPool(omniPoolConfig)
        if (!pool) {
            throw new SdkError(`getOmniPoolByConfig: cannot find omniPoolByConfig ${omniPoolConfig}`)
        }
        return pool.indexOf(this.requireToken(token))
    }

    public getOmniPoolTokens(omniPoolConfig: OmniPoolConfig): Token[] {
        const pool = this.omniPool(omniPoolConfig)
        if (!pool) {
            throw new SdkError('Cannot find omniPool')
        }
        return pool.tokens
    }

    public getTokenInfoById(id: Id): TokenInfo {
        const token = this.deployment.tokens().find((candidate) => candidate.info.id === id)
        if (!token) throw new SdkError(`Can't get tokenInfo for id ${id}`)
        return token.info
    }

    // The deployment's token with `token`'s chain, address and origin, with no gas token fallback.
    private requireToken(token: Token): DeployedToken {
        const found = this.deployment.findChain(token.chainId)?.token(token)
        if (!found) throw new SdkError(`Can't get tokenInfo by token ${token.address} ${token.chainId}`)
        return found
    }

    // A config's address is checksummed already, but its case is the caller's to choose.
    private omniPool(config: OmniPoolConfig): OmniPool | undefined {
        const at = (address: string) =>
            this.deployment.omniPools().find((pool) => pool.chainId === config.chainId && pool.address === address)
        return at(config.address) ?? at(getAddress(config.address))
    }
}
