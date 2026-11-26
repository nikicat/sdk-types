import { getAddress } from '@ethersproject/address'
import JSBI from 'jsbi'
import invariant from 'tiny-invariant'

import type { BigintIsh } from './constants'
import { ONE, SOLIDITY_TYPE_MAXIMA, SolidityType, THREE, TWO, ZERO } from './constants'
import type { EvmAddress, TokenAddress } from './crosschain/types'

export function validateSolidityTypeInstance(value: JSBI, solidityType: SolidityType): void {
    invariant(JSBI.greaterThanOrEqual(value, ZERO), `${value} is not a ${solidityType}.`)
    invariant(JSBI.lessThanOrEqual(value, SOLIDITY_TYPE_MAXIMA[solidityType]), `${value} is not a ${solidityType}.`)
}

/** An EVM address, checksummed; the empty address (a gas token's) as it is. Errors for anything else. */
export function validateAndParseAddress(address: string): TokenAddress {
    if (address === '') {
        return address
    }

    try {
        // getAddress gives a checksummed 0x address or throws, but types it as a string.
        return getAddress(address) as EvmAddress
    } catch (error) {
        invariant(false, `${address} is not a valid address.`)
    }
}

export function parseBigintIsh(bigintIsh: BigintIsh): JSBI {
    return bigintIsh instanceof JSBI
        ? bigintIsh
        : typeof bigintIsh === 'bigint'
          ? JSBI.BigInt(bigintIsh.toString())
          : JSBI.BigInt(bigintIsh)
}

// mock the on-chain sqrt function
export function sqrt(y: JSBI): JSBI {
    validateSolidityTypeInstance(y, SolidityType.uint256)
    let z: JSBI = ZERO
    let x: JSBI
    if (JSBI.greaterThan(y, THREE)) {
        z = y
        x = JSBI.add(JSBI.divide(y, TWO), ONE)
        while (JSBI.lessThan(x, z)) {
            z = x
            x = JSBI.divide(JSBI.add(JSBI.divide(y, x), x), TWO)
        }
    } else if (JSBI.notEqual(y, ZERO)) {
        z = ONE
    }
    return z
}

/** `compute`, remembering what it gave for each pair of arguments. */
export function memoize2<A, B, V>(compute: (a: A, b: B) => V): (a: A, b: B) => V {
    const values = new Map<A, Map<B, V>>()
    return (a, b) => {
        let withA = values.get(a)
        if (!withA) {
            withA = new Map()
            values.set(a, withA)
        }
        if (!withA.has(b)) withA.set(b, compute(a, b))
        return withA.get(b) as V
    }
}

/** The first `n` of `items` in the order of `comparator`; of equal items, the earlier comes first. */
export function bestOf<T>(items: Iterable<T>, n: number, comparator: (a: T, b: T) => number): T[] {
    const best: T[] = []
    for (const item of items) sortedInsert(best, item, n, comparator)
    return best
}

// given an array of items sorted by `comparator`, insert an item into its sort index and constrain the size to
// `maxSize` by removing the last item
export function sortedInsert<T>(items: T[], add: T, maxSize: number, comparator: (a: T, b: T) => number): T | null {
    invariant(maxSize > 0, 'MAX_SIZE_ZERO')
    // this is an invariant because the interface cannot return multiple removed items if items.length exceeds maxSize
    invariant(items.length <= maxSize, 'ITEMS_SIZE')

    // short circuit first item add
    if (items.length === 0) {
        items.push(add)
        return null
    } else {
        const isFull = items.length === maxSize
        // short circuit if full and the additional item does not come before the last item
        if (isFull && comparator(items[items.length - 1], add) <= 0) {
            return add
        }

        let lo = 0,
            hi = items.length

        while (lo < hi) {
            const mid = (lo + hi) >>> 1
            if (comparator(items[mid], add) <= 0) {
                lo = mid + 1
            } else {
                hi = mid
            }
        }
        items.splice(lo, 0, add)
        return isFull ? items.pop()! : null
    }
}
