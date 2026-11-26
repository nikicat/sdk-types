import { ChainId } from './constants'
import { beta, dev, mainnet, testnet } from './crosschain/config'
import type { EvmAddress } from './crosschain/types'

// New on-chain swap/zap routers (gateway-only approve + call), replacing the legacy
// FeeCollector addresses. Approve and onswap both target `gateway`; the inner DEX swap
// is executed by `executor` (onchainExecutorDontApprove — users must NOT approve it).
// The on-chain Symbiosis fee is read from the gateway contract at runtime (see
// CrosschainTxBuilder.onchainRouterScheme), not hardcoded here. This is the with-fee router
// used for regular on-chain swaps; BTC on-chain zaps use the zero-fee companion map
// ONCHAIN_ZERO_FEE_SWAP_ROUTERS below.
export interface OnchainSwapRouter {
    gateway: EvmAddress
    executor: EvmAddress
}

// The chain configs of every shipped deployment; where several have a chain, mainnet's entry wins (it comes last).
const shippedChainConfigs = [dev, testnet, beta, mainnet].flatMap((config) => config.chains)

/** @deprecated Read it from the deployment's ChainConfig instead (here: every shipped deployment's); kept for the packages that still use it. */
export const ONCHAIN_SWAP_ROUTERS: Partial<Record<ChainId, OnchainSwapRouter>> = Object.fromEntries(
    shippedChainConfigs.flatMap((chainConfig) =>
        chainConfig.onchainSwapRouter ? [[chainConfig.id, chainConfig.onchainSwapRouter]] : []
    )
)

/** @deprecated Read `onchainSwapRouter` from the deployment's chain config (`deployment.chain(id).config`) instead. */
export function getOnchainSwapRouter(chainId: ChainId): OnchainSwapRouter | undefined {
    return ONCHAIN_SWAP_ROUTERS[chainId]
}

// Zero-fee on-chain routers used for on-chain zaps into Bitcoin (the Symbiosis on-chain fee
// is waived there). Same gateway-only scheme as ONCHAIN_SWAP_ROUTERS. Only a few chains ship
// one; callers fall back to the with-fee router above when a chain is missing here.
/** @deprecated Read it from the deployment's ChainConfig instead (here: every shipped deployment's); kept for the packages that still use it. */
export const ONCHAIN_ZERO_FEE_SWAP_ROUTERS: Partial<Record<ChainId, OnchainSwapRouter>> = Object.fromEntries(
    shippedChainConfigs.flatMap((chainConfig) =>
        chainConfig.onchainZeroFeeSwapRouter ? [[chainConfig.id, chainConfig.onchainZeroFeeSwapRouter]] : []
    )
)

// On-chain zaps into Bitcoin prefer the zero-fee router; callers fall back to
// getOnchainSwapRouter when a chain has no zero-fee deployment.
/** @deprecated Read `onchainZeroFeeSwapRouter` from the deployment's chain config (`deployment.chain(id).config`) instead. */
export function getOnchainZeroFeeSwapRouter(chainId: ChainId): OnchainSwapRouter | undefined {
    return ONCHAIN_ZERO_FEE_SWAP_ROUTERS[chainId]
}

// ---- Legacy on-chain routers (old FeeCollector scheme) ----
// Partners that whitelisted our old FeeCollector contracts in their own contracts must keep
// using them (selected via CrosschainTxBuilder.usesLegacyRouter — the same partner set as
// the legacy metaRouter scheme). Everyone else uses the new gateway routers above. For legacy
// partners the fee and onchainGateway are read from the contract at runtime (not from config).
/** @deprecated Read it from the deployment's ChainConfig instead (here: every shipped deployment's); kept for the packages that still use it. */
export const LEGACY_ZERO_FEE_COLLECTOR_ADDRESSES: Partial<Record<ChainId, EvmAddress>> = Object.fromEntries(
    shippedChainConfigs.flatMap((chainConfig) =>
        chainConfig.legacyZeroFeeCollector ? [[chainConfig.id, chainConfig.legacyZeroFeeCollector]] : []
    )
)

/** @deprecated Read it from the deployment's ChainConfig instead (here: every shipped deployment's); kept for the packages that still use it. */
export const LEGACY_FEE_COLLECTOR_ADDRESSES: Partial<Record<ChainId, EvmAddress>> = Object.fromEntries(
    shippedChainConfigs.flatMap((chainConfig) =>
        chainConfig.legacyFeeCollector ? [[chainConfig.id, chainConfig.legacyFeeCollector]] : []
    )
)

// Legacy FeeCollector address for a chain (with-fee by default, zero-fee variant for BTC
// on-chain zaps). Returns undefined when the chain has no legacy deployment.
/** @deprecated Read `legacyFeeCollector or legacyZeroFeeCollector` from the deployment's chain config (`deployment.chain(id).config`) instead. */
export function getLegacyFeeCollector(chainId: ChainId, zeroFee = false): EvmAddress | undefined {
    return zeroFee ? LEGACY_ZERO_FEE_COLLECTOR_ADDRESSES[chainId] : LEGACY_FEE_COLLECTOR_ADDRESSES[chainId]
}

/** @deprecated Read it from the deployment's ChainConfig instead (here: every shipped deployment's); kept for the packages that still use it. */
export const MULTICALL_ROUTER_V2: Partial<Record<ChainId, EvmAddress>> = Object.fromEntries(
    shippedChainConfigs.flatMap((chainConfig) =>
        chainConfig.multicallRouterV2 ? [[chainConfig.id, chainConfig.multicallRouterV2]] : []
    )
)
