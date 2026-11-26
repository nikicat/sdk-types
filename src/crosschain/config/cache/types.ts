import { getAddress } from '@ethersproject/address'
import { z } from 'zod'

import type { ChainId } from '../../../constants'
import { type Address, type EvmAddress, OMNI_POOL_COIN_GECKO_IDS } from '../../types'

// The config cache's data, with the schemas that read it from JSON (parseConfigCacheData). EVM addresses come out
// checksummed, whatever their case in the JSON, so that the objects built from the data can compare them exactly.

const chainIdSchema = z.custom<ChainId>((value) => Number.isInteger(value), 'a chain id')
const evmAddressSchema = z
    .custom<EvmAddress>((value) => typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value), 'an EVM address')
    .transform((address) => getAddress(address) as EvmAddress)
// A token's address: an EVM one, or another chain's (Tron, TON, Bitcoin) as it is; empty for a gas token.
const addressSchema = z.union([
    evmAddressSchema,
    z.custom<Address>(
        (value) => typeof value === 'string' && /^(T\w+|[EU]Q[\w-]+|bc1\w+|[13]\w+|)$/.test(value),
        'an address'
    ),
])

/**
 * A token's id in a deployment's data. It only links the data's entries (a synthetic's original, a pool's tokens);
 * the objects built from the data link them directly.
 */
export const tokenIdSchema = z.number().int().nonnegative().brand<'TokenId'>()
export type TokenId = z.infer<typeof tokenIdSchema>

/** An omni pool's id in a deployment's data. */
export const omniPoolIdSchema = z.number().int().nonnegative().brand<'OmniPoolId'>()
export type OmniPoolId = z.infer<typeof omniPoolIdSchema>

/**
 * A token's index in an omni pool contract, as its swap and `indexToAsset` take it. Not a position in a list: the
 * indexes have gaps where a token left the pool. Get one from the pool (`OmniPool.indexOf`).
 */
export const omniPoolTokenIndexSchema = z.number().int().nonnegative().brand<'OmniPoolTokenIndex'>()
export type OmniPoolTokenIndex = z.infer<typeof omniPoolTokenIndexSchema>

/** @deprecated The data's ids are TokenId and OmniPoolId. */
export type Id = number

// Loose: the JSON carries fields the types leave out (isNative), and the data keeps them.
export const tokenInfoSchema = z.looseObject({
    id: tokenIdSchema,
    originalId: tokenIdSchema.optional(),
    name: z.string().optional(),
    symbol: z.string().optional(),
    address: addressSchema,
    decimals: z.number().int().min(0).max(255),
    chainId: chainIdSchema,
    chainFromId: chainIdSchema.optional(),
    icons: z.object({ large: z.string().optional(), small: z.string().optional() }).optional(),
    userToken: z.boolean().optional(),
    deprecated: z.boolean().optional(),
    origin: z.string().optional(),
    attributes: z.object({ solana: z.string().optional(), ton: z.string().optional() }).optional(),
})
export type TokenInfo = z.infer<typeof tokenInfoSchema>

export const omniPoolTokenSchema = z.object({
    index: omniPoolTokenIndexSchema,
    tokenId: tokenIdSchema,
})
export type OmniPoolToken = z.infer<typeof omniPoolTokenSchema>

export const omniPoolInfoSchema = z.looseObject({
    id: omniPoolIdSchema,
    chainId: chainIdSchema,
    address: evmAddressSchema,
    oracle: evmAddressSchema,
    generalPurpose: z.boolean(),
    coinGeckoId: z.enum(OMNI_POOL_COIN_GECKO_IDS),
    tokens: z.array(omniPoolTokenSchema),
})
export type OmniPoolInfo = z.infer<typeof omniPoolInfoSchema>

export const configCacheDataSchema = z.object({
    tokens: z.array(tokenInfoSchema),
    omniPools: z.array(omniPoolInfoSchema),
})
export type ConfigCacheData = z.infer<typeof configCacheDataSchema>

/** Reads a deployment's config cache data from JSON. Errors listing what does not match. */
export function parseConfigCacheData(json: unknown): ConfigCacheData {
    return configCacheDataSchema.parse(json)
}
