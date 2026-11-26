import { ChainId } from './constants'
import { beta, dev, mainnet, testnet } from './crosschain/config'
import type { Address } from './crosschain/types'

// New metaRouter deployment (gateway-only approve + call). For partners NOT on the
// legacy list, approve and metaRoute both target `gateway`, and inner DEX swaps are
// executed by `executor` (metaRouterExecutorDontApprove — users must NOT approve it).
// Kept out of ChainConfig so contract addresses live in one focused mapping.
// Source of truth: metarouters.json.
export interface ApprovableMetaRouter {
    gateway: Address
    executor: Address
}

// The chain configs of every shipped deployment; where several have a chain, mainnet's entry wins (it comes last).
const shippedChainConfigs = [dev, testnet, beta, mainnet].flatMap((config) => config.chains)

const APPROVABLE_METAROUTERS: Partial<Record<ChainId, ApprovableMetaRouter>> = Object.fromEntries(
    shippedChainConfigs.flatMap((chainConfig) =>
        chainConfig.approvableMetaRouter ? [[chainConfig.id, chainConfig.approvableMetaRouter]] : []
    )
)

/** @deprecated Read `approvableMetaRouter` from the deployment's chain config (`deployment.chain(id).config`) instead. */
export function getApprovableMetaRouter(chainId: ChainId): ApprovableMetaRouter | undefined {
    return APPROVABLE_METAROUTERS[chainId]
}
