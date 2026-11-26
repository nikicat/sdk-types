import { chainTable } from './chainTable'

/** @deprecated Use the chain's `gasToken` (Chain) instead; kept for the packages that still use it. */
export const GAS_TOKEN = chainTable((chain) => chain.gasToken)
