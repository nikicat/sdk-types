import JSBI from 'jsbi'

import type { BigintIsh } from '../constants'
import { ONE } from '../constants'
import type { PriceBreakdown, Trade } from '../entities'
import { Fraction, Percent } from '../entities'

// converts a basis points value to a sdk percent
export function basisPointsToPercent(num: number): Percent {
    return new Percent(JSBI.BigInt(Math.floor(num)), JSBI.BigInt(10000))
}

export function getMinAmount(slippage: number, amount: BigintIsh): JSBI {
    const slippageTolerance = basisPointsToPercent(slippage)
    return new Fraction(ONE).subtract(slippageTolerance).multiply(amount).quotient
}

/** @deprecated Use `trade.priceBreakdown(dexFee)` (Trade) instead. */
export function computeTradePriceBreakdown(trade: Trade, dexFee: number): PriceBreakdown {
    return trade.priceBreakdown(dexFee)
}
