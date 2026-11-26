import type { ChainId } from '../constants'
import type { Chain } from '../entities'
import { Token } from '../entities'
import { NoTransitTokenError, SdkError } from '../errors'
import { formatBytes32String } from '@ethersproject/strings'
import { Cache } from './cache'
import { CHAIN_DATA } from './chainData'
import { ConfigCache, Deployment } from './deployment'
import type { Id, OmniPoolInfo, TokenInfo } from './config/cache/types'
import type { ChainConfig, Config, ConfigName, EvmAddress, OmniPoolConfig, OverrideConfig } from './types'

export type { ConfigName } from './types'

/**
 * @deprecated Use a Deployment (`Deployment.named('mainnet')`, or `new Deployment(config, cache)`), which this builds
 * its lookups on.
 */
export class Symbiosis {
    public readonly configName: ConfigName
    public readonly config: Config
    public readonly cache: Cache
    public readonly configCache: ConfigCache
    public readonly clientId: string
    public readonly deployment: Deployment

    public constructor(configName: ConfigName, clientId: string, overrideConfig?: OverrideConfig) {
        this.configName = configName
        if (overrideConfig?.config) {
            this.config = overrideConfig.config
        } else {
            this.config = structuredClone(Deployment.named(configName).config)

            // restore Token objects after structuredClone
            this.config.btcConfigs = this.config.btcConfigs.map((btcConfig) => {
                return { ...btcConfig, btc: new Token(btcConfig.btc) }
            })

            if (overrideConfig?.chains) {
                const { chains: overrideChains } = overrideConfig
                this.config.chains = this.config.chains.map((chainConfig) => {
                    const found = overrideChains.find((i) => i.id === chainConfig.id)
                    if (found) {
                        chainConfig.rpc = found.rpc
                        chainConfig.headers = found.headers
                        if (found.spareRpcs) {
                            chainConfig.spareRpcs = found.spareRpcs
                        }
                    }
                    return chainConfig
                })
            }
            if (overrideConfig?.limits) this.config.limits = overrideConfig.limits
            if (overrideConfig?.advisor) this.config.advisor = overrideConfig.advisor
            if (overrideConfig?.solver) this.config.solver = overrideConfig.solver
            if (overrideConfig?.perpbot) this.config.perpbot = overrideConfig.perpbot
            if (overrideConfig?.btcConfigs) this.config.btcConfigs = overrideConfig.btcConfigs
        }

        this.cache = overrideConfig?.cache || new Cache()
        this.deployment = new Deployment(
            this.config,
            overrideConfig?.configCache ?? Deployment.named(configName).cacheData
        )
        this.configCache = new ConfigCache(this.deployment)
        this.clientId = formatBytes32String(clientId)
    }

    public getBtcConfig(btc: Token) {
        const config = this.config.btcConfigs.find((btcConfig) => btcConfig.btc.equals(btc))
        if (!config) {
            throw new SdkError('BTC config not found')
        }
        return config
    }

    /** In the order of CHAIN_DATA, as the global chain list was; a chain it does not list comes last. */
    public chains(): Chain[] {
        const listed = CHAIN_DATA.flatMap((data) => this.deployment.findChain(data.id) ?? [])
        const seen = new Set<Chain>(listed)
        return [...listed, ...this.deployment.chains().filter((chain) => !seen.has(chain))]
    }

    public chainConfig(chainId: ChainId): ChainConfig {
        return this.deployment.chain(chainId).config
    }

    public dexFee(chainId: ChainId): number {
        return this.chainConfig(chainId).dexFee
    }

    public filterBlockOffset(chainId: ChainId): number {
        return this.chainConfig(chainId).filterBlockOffset
    }

    public tokens(): Token[] {
        return this.configCache.tokens()
    }

    public findToken(address: string, chainId: ChainId, chainFromId?: ChainId): Token | undefined {
        return this.tokens().find(
            (token) =>
                token.chainId === chainId &&
                token.address.toLowerCase() === address.toLowerCase() &&
                (chainFromId === undefined || token.chainFromId === chainFromId)
        )
    }

    public getRepresentation(token: Token, chainId: ChainId): Token | undefined {
        return this.configCache.getRepresentation(token, chainId)
    }

    public getOmniPoolByConfig(config: OmniPoolConfig): OmniPoolInfo | undefined {
        return this.configCache.getOmniPoolByConfig(config)
    }

    public getOmniPoolByToken(token: Token): OmniPoolInfo | undefined {
        return this.configCache.getOmniPoolByToken(token)
    }

    public getOmniPoolTokens(omniPoolConfig: OmniPoolConfig): Token[] {
        return this.configCache.getOmniPoolTokens(omniPoolConfig)
    }

    public getOmniPoolTokenIndex(omniPoolConfig: OmniPoolConfig, token: Token): number {
        return this.configCache.getOmniPoolTokenIndex(omniPoolConfig, token)
    }

    public getTokenInfoById(tokenId: Id): TokenInfo {
        return this.configCache.getTokenInfoById(tokenId)
    }

    /** The chain's tokens, neither deprecated nor synthetic, that trade in the pool, in the order of the data. */
    public transitTokens(chainId: ChainId, omniPoolConfig: OmniPoolConfig): Token[] {
        const pool = this.configCache.getOmniPoolByConfig(omniPoolConfig)
        if (!pool) {
            throw new SdkError(`Cannot find omniPool for chainId ${omniPoolConfig.chainId}`)
        }
        return this.ownTokens(chainId).filter((token) => this.configCache.getOmniPoolByToken(token) === pool)
    }

    /**
     * On the pool's own chain, the chain's first token, whatever pool it trades in; elsewhere the first of its tokens
     * in the pool. A Deployment's pools give the one token that enters them (`pool.transitToken(chainId)`).
     */
    public transitToken(chainId: ChainId, omniPoolConfig: OmniPoolConfig): Token {
        const pool = this.configCache.getOmniPoolByConfig(omniPoolConfig)
        if (!pool) {
            throw new NoTransitTokenError(`Cannot find omniPool ${pool}`)
        }
        const tokens = this.ownTokens(chainId)
        if (tokens.length === 0) {
            throw new NoTransitTokenError(`Cannot find token for chain ${chainId}`)
        }
        if (chainId === pool.chainId) return tokens[0]
        const transitToken = tokens.find((token) => this.configCache.getOmniPoolByToken(token) === pool)
        if (!transitToken) {
            throw new NoTransitTokenError(`Cannot find transitToken for chain ${chainId}. Pool: ${pool.id}`)
        }
        return transitToken
    }

    public getTransitCombinations({
        poolConfig,
        tokenIn,
        tokenOut,
        disableSrcChainRouting,
        disableDstChainRouting,
    }: {
        poolConfig: OmniPoolConfig
        tokenIn: Token
        tokenOut: Token
        disableSrcChainRouting?: boolean
        disableDstChainRouting?: boolean
    }): { transitTokenIn: Token; transitTokenOut: Token }[] {
        const combinations: { transitTokenIn: Token; transitTokenOut: Token }[] = []
        for (const transitTokenIn of this.transitTokens(tokenIn.chainId, poolConfig)) {
            for (const transitTokenOut of this.transitTokens(tokenOut.chainId, poolConfig)) {
                if (transitTokenIn.equals(transitTokenOut)) continue
                if (disableSrcChainRouting && !transitTokenIn.equals(tokenIn.wrapped)) continue
                if (disableDstChainRouting && !transitTokenOut.equals(tokenOut.wrapped)) continue
                combinations.push({ transitTokenIn, transitTokenOut })
            }
        }
        return combinations
    }

    getRevertableAddress(chainId: ChainId): EvmAddress {
        return this.config.revertableAddress[chainId] ?? this.config.revertableAddress.default
    }

    private ownTokens(chainId: ChainId): Token[] {
        const tokens = this.deployment.findChain(chainId)?.tokens() ?? []
        return tokens.filter((token) => !token.deprecated && !token.isSynthetic)
    }
}
