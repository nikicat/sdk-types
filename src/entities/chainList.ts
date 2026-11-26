import type { ChainId } from '../constants'
import { CHAIN_DATA } from '../crosschain/chainData'
import { Chain } from './chain'

// The global chain list, built on first use: a Chain makes its tokens when it is constructed, and the modules that
// read this list (Token, Pair, Route, Trade) load before Chain and Token can, so nothing here may run while they load.
let built: { list: Chain[]; byId: Map<ChainId, Chain> } | undefined
const catalogue = () => {
    if (!built) {
        const list = CHAIN_DATA.map((data) => new Chain(data))
        built = { list, byId: new Map(list.map((chain) => [chain.id, chain])) }
    }
    return built
}
const all = (): Chain[] => catalogue().list

/**
 * @deprecated Take the chain from a Deployment (`deployment.chain(id)`) instead; kept for the packages that still use
 * it. Every chain sdk-types knows, in the order of CHAIN_DATA.
 */
export const chains: Chain[] = new Proxy([] as Chain[], {
    get: (_, key) => Reflect.get(all(), key),
    has: (_, key) => Reflect.has(all(), key),
    ownKeys: () => Reflect.ownKeys(all()),
    getOwnPropertyDescriptor: (_, key) => Reflect.getOwnPropertyDescriptor(all(), key),
})

/** @deprecated Take the chain from a Deployment (`deployment.chain(id)`) instead. */
export const getChainById = (chainId: ChainId | undefined): Chain | undefined => {
    if (!chainId) return undefined
    return catalogue().byId.get(chainId)
}
