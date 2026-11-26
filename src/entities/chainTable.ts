import type { ChainId } from '../constants'
import { CHAIN_DATA } from '../crosschain/chainData'
import type { Chain } from './chain'
import { getChainById } from './chainList'

/**
 * A table by chain id of what `read` takes from each chain sdk-types knows, read when an entry is first read: the
 * deprecated tables of Tokens are built while the entities load, before a Chain can make a Token.
 * @deprecated It reads the global chain list, and exists only for the deprecated WETH and GAS_TOKEN: it goes with them.
 */
export function chainTable<T>(read: (chain: Chain) => T): Record<ChainId, T> {
    const table = {} as Record<ChainId, T>
    for (const { id } of CHAIN_DATA) {
        Object.defineProperty(table, id, {
            get() {
                const value = read(getChainById(id)!)
                Object.defineProperty(table, id, { value, enumerable: true })
                return value
            },
            enumerable: true,
            configurable: true,
        })
    }
    return table
}
