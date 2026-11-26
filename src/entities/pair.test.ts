import { describe, expect, it } from 'vitest'

import { ChainId } from '../constants'
import { TokenAmount } from './fractions'
import { Pair } from './pair'
import { Token } from './token'

const tokenA = '0x5FbDB2315678afecb367f032d93F642f64180aa3' as const
const tokenB = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512' as const
const local = '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0' as const

const token = (chainId: ChainId, address: `0x${string}`) => new Token({ address, chainId, decimals: 18, symbol: 'T' })
const amount = (chainId: ChainId, address: `0x${string}`, raw: number) =>
    new TokenAmount(token(chainId, address), String(raw))

describe('Pair', () => {
    it('derives a different address on each chain for the same token addresses', () => {
        const onEth = Pair.getAddress(token(ChainId.ETH_MAINNET, tokenA), token(ChainId.ETH_MAINNET, tokenB))
        const onBsc = Pair.getAddress(token(ChainId.BSC_MAINNET, tokenA), token(ChainId.BSC_MAINNET, tokenB))
        expect(onEth).not.toEqual(onBsc)
        expect(Pair.getAddress(token(ChainId.ETH_MAINNET, tokenB), token(ChainId.ETH_MAINNET, tokenA))).toEqual(onEth)
    })

    it('takes the address it is given', () => {
        const pair = new Pair(
            amount(ChainId.ETH_MAINNET, tokenA, 1_000_000),
            amount(ChainId.ETH_MAINNET, tokenB, 1_000_000),
            local
        )
        expect(pair.liquidityToken.address).toEqual(local)
    })

    it('keeps its address in the pair a swap leaves', () => {
        const pair = new Pair(
            amount(ChainId.ETH_MAINNET, tokenA, 1_000_000),
            amount(ChainId.ETH_MAINNET, tokenB, 1_000_000),
            local
        )
        const { pairAfter: afterOutput } = pair.getOutputAmount(amount(ChainId.ETH_MAINNET, tokenA, 1000))
        const { pairAfter: afterInput } = pair.getInputAmount(amount(ChainId.ETH_MAINNET, tokenB, 1000))
        expect(afterOutput.liquidityToken.address).toEqual(local)
        expect(afterInput.liquidityToken.address).toEqual(local)
    })
})
