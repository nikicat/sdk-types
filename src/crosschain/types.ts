import type { ChainId, Icons } from '../constants'
import type { Percent, ProfilerItem, Token, TokenAmount, TokenConstructor } from '../entities'
import type { Cache } from './cache'
import type { TronTransactionData } from './tronTypes'
import type { ConfigCacheData } from './config/cache/types'
import type { SwapLabel } from './labels'
import { TradeProvider } from './tradeType'
import type { OneInchProtocols } from './tradeType'

// Structural stand-ins for the ethers types, defined locally (erased at build).
export type BytesLike = string | ArrayLike<number>
export type BigNumber = { _hex: string; _isBigNumber: boolean }
export type TransactionRequest = {
    to?: string
    from?: string
    data?: BytesLike
    value?: BigNumber | string | number
    chainId?: number
    gasLimit?: BigNumber | string | number
    gasPrice?: BigNumber | string | number
    [key: string]: unknown
}

export type { TronTransactionData }
export { TradeProvider }
export type { OneInchProtocols }
export type { SwapLabel }

// Opaque placeholders for class refs sdk-types never instantiates — used only in type
// positions and erased at runtime.
/** Opaque alias used by SwapExactInParams — avoids a circular import with Symbiosis. */
type Symbiosis = unknown
export type PartnerFeeCollector = unknown
/**
 * Opaque placeholder for the SymbiosisTrade class. SwapExactInResult.tradeA/tradeC reference it,
 * but consumers only read them opaquely. Minimal structural shape so `trade.tradeType` compiles.
 */
export interface SymbiosisTrade {
    readonly tradeType?: TradeProvider
    [k: string]: unknown
}

export enum Field {
    INPUT = 'INPUT',
    OUTPUT = 'OUTPUT',
}

export type EvmAddress = `0x${string}`
export type TronAddress = `T${string}`
export type TonBounceableAddress = `E${string}`
export type TonNonbounceableAddress = `U${string}`
export type TonAddress = TonBounceableAddress | TonNonbounceableAddress
export type BtcAddress = `bc1${string}` | `1${string}` | `3${string}`
export type EmptyAddress = ''
export type NonEmptyAddress = EvmAddress | TronAddress | TonAddress | BtcAddress
export type Address = NonEmptyAddress | EmptyAddress
/**
 * The checksummed address of a token's contract, in EVM form on Tron too. A native gas token (Token.isNative) has the
 * empty address.
 */
export type TokenAddress = EvmAddress | EmptyAddress

export interface VolumeFeeCollector {
    chainId: ChainId
    address: Address
    feeRate: string
    eligibleChains: ChainId[]
    default?: boolean
}

export type BridgeDirection = 'burn' | 'mint' | 'v2'

export type PriceEstimationConfig = {
    enabled: boolean
    slippageMax: number // Maximum slippage - used for tokenAmountOutMin calculation and delayed solving.
    slippageNorm: number // Normal slippage - used for tokenAmountOut calculation and immetiate solving.
}

// Addresses of Intent contracts (intent-based swap protocol)
export interface IntentConfig {
    depositorySrc: EvmAddress // Depository contract on the src chain
    depositoryDst: EvmAddress // Depository contract on the dst chain
    deadlineUnlocker: EvmAddress // DeadlineUnlocker contract on the src chain
    bridge: EvmAddress
}

// Addresses of Depository contracts
export interface DepositoryConfig {
    depository: EvmAddress
    withdrawUnlocker: EvmAddress
    branchedUnlocker: EvmAddress
    timedUnlocker: EvmAddress
    timedSwapUnlocker: EvmAddress
    btcRefundUnlocker?: EvmAddress
    priceEstimation: PriceEstimationConfig
    refundDelay?: number // Minimal delay before refund
    withdrawDelay: number // Minimal delay before withdraw
    minAmountDelay: number // Minimal delay before swap with minimal amount
}

/**
 * The data of a chain that is the same in every deployment. A deployment's setup on the chain is its ChainConfig
 * (README, "Deployments and chains").
 */
export type ChainData = {
    id: ChainId
    name: string
    explorer: string
    icons: Icons
    kind: ChainKind
    gasToken: TokenConstructor
    /** The wrapped gas token, such as WETH, WBNB or WTRX. */
    wrappedGasToken?: TokenConstructor
    multicall?: EvmAddress
    /** The Uniswap V2 factory whose pair addresses are derived (CREATE2), or the pairs' addresses themselves. */
    uniswapV2: { factory: EvmAddress; initCodeHash: string } | { pairs: UniV2PairAddress[] }
    coinGecko?: { platform?: string; gasTokenId?: string }
    /** The address format of a Bitcoin chain. */
    btcNetwork?: 'bitcoin' | 'testnet' | 'regtest'
}

/**
 * The kind of a chain. It decides the chain's address format and how a transfer to it is built. A `perp` chain is a
 * perp venue (Hyperliquid, Lighter). It is a deposit destination only, and its balances come from the venue's API, not
 * from an RPC. An `other` chain is one that only partners (Changelly, THORChain) reach.
 */
export type ChainKind = 'evm' | 'btc' | 'tron' | 'ton' | 'solana' | 'quai' | 'perp' | 'other'

/** A Uniswap V2 pair's address. The order of the two tokens does not matter. */
export type UniV2PairAddress = {
    token0: EvmAddress
    token1: EvmAddress
    pair: EvmAddress
}

/**
 * A router that takes both the approval and the call at `gateway`. Users never approve `executor`, which runs the inner
 * DEX swaps.
 */
export type GatewayRouter = {
    gateway: EvmAddress
    executor: EvmAddress
}

/** @deprecated Use `GatewayRouter`. */
export type ApprovableMetaRouter = GatewayRouter

/** @deprecated Use `GatewayRouter`. */
export type OnchainSwapRouter = GatewayRouter

/** A deployment's setup on one chain (README, "Deployments and chains"). */
export type ChainConfig = {
    chain: ChainData
    /** Equals chain.id. A Deployment errors otherwise. */
    id: ChainId
    rpc: string
    headers?: Record<string, string>
    spareRpcs?: string[]
    dexFee: number
    filterBlockOffset: number
    stables: TokenConstructor[]
    metaRouter: Address
    metaRouterGateway: Address
    // Inner-swap executor for the legacy scheme. Only needed on new-metaRouter-only chains where
    // metaRouter points at the new gateway (which delegates inner swaps to a dedicated executor
    // instead of running them itself). When absent, the legacy scheme executes via metaRouter.
    metaRouterExecutor?: Address
    multicallRouter: Address
    router: Address
    bridge: Address
    synthesis: Address
    portal: Address
    pauser?: Address
    fabric: Address
    tonPortal?: string
    partnerFeeCollector?: string
    depository?: DepositoryConfig
    intentConfig?: IntentConfig
    multicallRouterV2?: EvmAddress
    /** The Symbiosis fee of a swap through this router is read from its gateway contract, not from the config. */
    onchainSwapRouter?: GatewayRouter
    /** The zero-fee router for on-chain zaps into Bitcoin. A chain without one uses `onchainSwapRouter`. */
    onchainZeroFeeSwapRouter?: GatewayRouter
    /** A legacy FeeCollector, for partners that whitelisted it in their contracts. */
    legacyFeeCollector?: EvmAddress
    /**
     * A zero-fee legacy FeeCollector for on-chain zaps into Bitcoin, for partners that whitelisted it in their
     * contracts.
     */
    legacyZeroFeeCollector?: EvmAddress
    approvableMetaRouter?: GatewayRouter
    /** The Unwrapper (core-contracts periphery/Unwrapper.sol), which pays out in the gas token. */
    unwrapper?: EvmAddress
}

export type AdvisorConfig = {
    url: string
}

// Solver service base URL (intent-based swaps)
export type SolverConfig = {
    url: string
}

// Perpbot aggregator base URL (perp deposit zaps into Hyperliquid/Lighter)
export type PerpbotConfig = {
    url: string
}

/** The omni pool contract on the host chain. It swaps between the synthetics of one asset's tokens. */
export type OmniPoolConfig = {
    /** The chain the pool's contract is on (the deployment's host chain). */
    chainId: ChainId
    address: EvmAddress
    /** The address of the pool's oracle contract (`OmniPoolOracle`), which quotes swaps through the pool. */
    oracle: EvmAddress
    /**
     * True if a route may swap on its source or destination chain to reach this pool's tokens (USDC, WETH on mainnet).
     * False if a route through the pool carries only the pool's own asset.
     */
    generalPurpose: boolean
    /** The CoinGecko id of the asset that the pool holds. It also names the pool. */
    coinGeckoId: OmniPoolCoinGeckoId
}

export const OMNI_POOL_COIN_GECKO_IDS = [
    'usd-coin',
    'weth',
    'bitcoin',
    'g-token',
    'binancecoin',
    'symbiosis-finance',
    'apecoin',
    'evaa-protocol',
    'dropee',
] as const

export type OmniPoolCoinGeckoId = (typeof OMNI_POOL_COIN_GECKO_IDS)[number]

export type SwapLimit = {
    chainId: ChainId
    address: string
    min: string
    max: string
}

export type BtcConfig = {
    btc: Token
    // The SymBtc helper contract, not the symBTC token: it packs the wrap tail
    // and computes BTC external IDs. chainId is where the portal mints symBTC.
    symBtcHelper: {
        address: EvmAddress
        chainId: ChainId
        // The portal's own Synthesis and Fabric on symBtcHelper.chainId, when they
        // differ from the chain's general ones in ChainConfig.
        synthesis?: EvmAddress
        fabric?: EvmAddress
    }
    forwarderUrl: string
}

export type CoinGeckoConfig = {
    url: string
}

export type Config = {
    advisor: AdvisorConfig
    coinGecko?: CoinGeckoConfig
    omniPools: OmniPoolConfig[]
    revertableAddress: Partial<Record<ChainId, EvmAddress>> & { default: EvmAddress }
    limits: SwapLimit[]
    chains: ChainConfig[]
    fallbackReceiver: EvmAddress
    btcConfigs: BtcConfig[]
    solver?: SolverConfig
    perpbot?: PerpbotConfig
}

export type OverrideChainConfig = {
    id: ChainId
    rpc: string
    headers?: Record<string, string>
    spareRpcs?: string[]
}
export type FeeConfig = {
    token: Token
    value: string
}

export type ApiConfig = {
    apiUrl: string
    apiKeys: string[]
}

export type ChangellyConfig = {
    apiUrl: string
    publicSwapPk: string
    privateSwapPk?: string
    privateSwapRefundAddress?: string
}

export type {
    ConfigCacheData,
    Id,
    OmniPoolId,
    OmniPoolInfo,
    OmniPoolToken,
    OmniPoolTokenIndex,
    TokenId,
    TokenInfo,
} from './config/cache/types'

export interface Logger {
    error(message: string, ...args: unknown[]): void
    warn(message: string, ...args: unknown[]): void
    info(message: string, ...args: unknown[]): void
    debug(message: string, ...args: unknown[]): void
}

export type OverrideConfig = {
    btcConfigs?: BtcConfig[]
    chains?: OverrideChainConfig[]
    limits?: SwapLimit[]
    fetch?: typeof fetch
    advisor?: AdvisorConfig
    solver?: SolverConfig
    perpbot?: PerpbotConfig
    oneInchConfig?: Partial<ApiConfig>
    openOceanConfig?: Partial<ApiConfig>
    zeroXConfig?: Partial<ApiConfig>
    changellyConfig?: Partial<ChangellyConfig>
    volumeFeeCollectors?: VolumeFeeCollector[]
    cache?: Cache
    config?: Config
    configCache?: ConfigCacheData
    logger?: Logger
}

export interface RevertableAddress {
    chainId: ChainId
    address: string
}

export type TradeAContext = 'metaRouter' | 'multicallRouter'

export interface SwapExactInParams {
    symbiosis: Symbiosis
    tokenAmountIn: TokenAmount
    tokenAmountInMin?: TokenAmount
    tokenOut: Token
    from: Address
    origin?: Address // in terms of 1inch it's a sender of the tx
    to: Address
    slippage: number
    deadline: number
    oneInchProtocols?: OneInchProtocols
    revertableAddresses?: RevertableAddress[]
    tradeAContext?: TradeAContext
    partnerAddress?: EvmAddress
    refundAddress?: Address
    fallbackReceiver?: EvmAddress
    generateDepositAddress?: boolean
    disableSrcChainRouting?: boolean
    disableDstChainRouting?: boolean
    depositoryEnabled?: boolean
    disabledProviders?: TradeProvider[]
    changellyExtraIdTo?: string // destination tag (XRP) or memo (XLM) for payout address
    // Route the swap privately through Monero (XMR) via Changelly. Default false.
    private?: boolean
    // EIP-712 signature for VotingEscrow gas discount.
    // undefined = fall back to legacy Symbiosis.setSignature() field; null = explicitly no signature.
    signature?: string | null
    // Per-call swap amount limits override.
    // undefined = fall back to legacy Symbiosis instance config.limits; null = no limits.
    limits?: SwapLimit[] | null
}

export type BtcTransactionData = {
    depositAddress: string
    validUntil: string
    tokenAmountOut: TokenAmount
}

export type TonTransactionData = {
    validUntil: number
    messages: {
        address: string
        amount: string
        payload?: string
    }[]
}

export type SolanaTransactionData = {
    instructions: string
}

export type ChangellyTransactionData = {
    changellyTxId: string
    depositAddress: string
    depositExtraId?: string
    amountExpectedFrom: string
    amountExpectedTo: string
    networkFee: string
    validUntil: number
    currencyFrom: string
    currencyTo: string
    refundAddress?: string
    refundExtraId?: string
}

export type SwapExactInTransactionPayload =
    | {
          transactionType: 'evm'
          transactionRequest: TransactionRequest
      }
    | {
          transactionType: 'tron'
          transactionRequest: TronTransactionData
      }
    | {
          transactionType: 'btc'
          transactionRequest: BtcTransactionData
      }
    | {
          transactionType: 'ton'
          transactionRequest: TonTransactionData
      }
    | {
          transactionType: 'solana'
          transactionRequest: SolanaTransactionData
      }
    | {
          transactionType: 'changelly'
          transactionRequest: ChangellyTransactionData
      }

export type RouteItem = {
    provider: TradeProvider
    tokens: Token[]
}

export type FeeItem = {
    provider: TradeProvider
    value: TokenAmount
    save?: TokenAmount
    description?: string
}

export type OperationType =
    | 'onchain-swap'
    | 'crosschain-swap'
    | 'wrap'
    | 'unwrap'
    | 'bridge'
    | 'from-btc-swap'
    | 'changelly-trade'
    | 'changelly-deposit'
    | 'private-swap'
    | 'intent-swap'

export type PrivateSwapData = {
    tradeATxId: string
    tradeBTxId: string
}

// Result of swapExactIn() method.
export type SwapExactInResult = SwapExactInTransactionPayload & {
    operationType: OperationType
    tokenAmountOut: TokenAmount
    tokenAmountOutMin: TokenAmount
    priceImpact: Percent
    approveTo: string
    routes: RouteItem[]
    fees: FeeItem[]
    labels: SwapLabel[]

    amountInUsd?: TokenAmount
    timeLog?: ProfilerItem[]
    routeType?: string
    poolAddress?: string
    tradeA?: SymbiosisTrade
    tradeC?: SymbiosisTrade
    changellyData?: ChangellyTransactionData
    privateSwap?: PrivateSwapData
    permit2Approve?: { to: string; callData: string }
}

export type MulticallV2Item = {
    data: BytesLike
    to: string
    path: string
    offset: number
    isNative: boolean
}

export interface MultiCallItem {
    to: string
    data: BytesLike
    offset: number
    value: string
    amountIn: TokenAmount // is used as approveToken as well
    amountOut: TokenAmount
    amountOutMin: TokenAmount
    priceImpact: Percent
    fees: FeeItem[]
    routes: RouteItem[]
}

export type PartnerFeeCallParams = {
    partnerAddress: string
    partnerFeeCollector: PartnerFeeCollector
    feeRate: BigNumber
    fixedFee: BigNumber
}

export type MetricParams = {
    operation: string
    kind: string
    tokenIn?: Token
    tokenOut?: Token
}

export type AggregatorErrorCounterParams = {
    provider: string
    reason: string
    chain_id: string
}

export type PriceImpactCounterParams = {
    poolConfig: OmniPoolConfig
    tokenAmountFrom: TokenAmount
    tokenTo: Token
    priceImpact: Percent
}

export interface DiscountTier {
    amount: string
    discount: number
}

export enum PendingRequestState {
    Default = 0,
    Sent,
    Reverted,
}

export type PendingRequestType = 'burn' | 'synthesize' | 'burn-v2' | 'burn-v2-revert' | 'synthesize-v2'

export interface PendingRequest {
    originalFromTokenAmount: TokenAmount
    fromTokenAmount: TokenAmount
    transactionHash: string
    state: PendingRequestState
    internalId: string
    externalId: string
    type: PendingRequestType
    from: string
    to: string
    revertableAddress: string
    chainIdFrom: ChainId
    chainIdTo: ChainId
    revertChainId: ChainId
}

export interface BtcDepositAcceptedResult {
    commitTx: string
    btcConfig: BtcConfig
}
