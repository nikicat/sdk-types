import { getAddress, getCreate2Address as getEvmCreate2Address } from '@ethersproject/address'
import { concat, hexDataSlice, hexZeroPad } from '@ethersproject/bytes'
import { keccak256 as keccak256Bytes } from '@ethersproject/keccak256'
import { keccak256, pack } from '@ethersproject/solidity'
import { toUtf8Bytes } from '@ethersproject/strings'

import { ChainId } from '../constants'
import type { BytesLike, ChainData, EvmAddress, TokenAddress } from '../crosschain/types'
import { memoize2 } from '../utils'

/** The address of a chain's Uniswap V2 pair of two tokens, given by their addresses, the one that sorts first first. */
export type PairAddressOf = (token0: TokenAddress, token1: TokenAddress) => EvmAddress

/**
 * Where a chain's Uniswap V2 pairs are: at the addresses its data lists, or at its factory's CREATE2 addresses, which
 * are remembered, since deriving one costs two hashes.
 */
export function pairAddressesOf(data: ChainData): PairAddressOf {
    const { uniswapV2 } = data
    if ('pairs' in uniswapV2) {
        // checksummed here, as the data's addresses can come in any case
        const known = uniswapV2.pairs.map(({ token0, token1, pair }) => ({
            tokens: [getAddress(token0), getAddress(token1)],
            pair,
        }))
        return (token0, token1) => {
            const found = known.find(({ tokens }) => tokens.includes(token0) && tokens.includes(token1))
            if (!found) throw new Error(`no Uniswap V2 pair of ${token0} and ${token1} on chain ${data.id}`)
            return found.pair
        }
    }
    const create2 =
        data.kind === 'tron'
            ? getTronCreate2Address
            : data.id === ChainId.CRONOS_ZK_MAINNET
              ? getZkCreate2Address
              : (getEvmCreate2Address as (from: EvmAddress, salt: BytesLike, initCodeHash: BytesLike) => EvmAddress)
    return memoize2((token0: TokenAddress, token1: TokenAddress) =>
        create2(
            uniswapV2.factory,
            keccak256(['bytes'], [pack(['address', 'address'], [token0, token1])]),
            uniswapV2.initCodeHash
        )
    )
}

// zkSync Era's CREATE2, whose formula differs from Ethereum's: keccak256(keccak256("zksyncCreate2") ‖ sender ‖ salt ‖
// bytecodeHash ‖ keccak256(constructor input))[12:], `initCodeHash` being the contract's bytecode hash and a pair's
// constructor taking no input.
const ZKSYNC_CREATE2_PREFIX = keccak256Bytes(toUtf8Bytes('zksyncCreate2'))
const EMPTY_INPUT_HASH = keccak256Bytes('0x')

/** A zkSync Era CREATE2 address, such as a Uniswap V2 pair's on a zkSync chain. */
export function getZkCreate2Address(from: EvmAddress, salt: BytesLike, initCodeHash: BytesLike): EvmAddress {
    return getAddress(
        hexDataSlice(
            keccak256Bytes(concat([ZKSYNC_CREATE2_PREFIX, hexZeroPad(from, 32), salt, initCodeHash, EMPTY_INPUT_HASH])),
            12
        )
    ) as EvmAddress
}

// TRON CREATE2 — pure @ethersproject (no tronweb): keccak256(0x41 ‖ from ‖ salt ‖ initCodeHash)[12:].
export function getTronCreate2Address(from: EvmAddress, salt: BytesLike, initCodeHash: BytesLike): EvmAddress {
    return getAddress(
        hexDataSlice(keccak256Bytes(concat(['0x41', getAddress(from), salt, initCodeHash])), 12)
    ) as EvmAddress
}
