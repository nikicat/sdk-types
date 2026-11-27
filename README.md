# @symbiosis/sdk-types

Web3-light shared layer for Symbiosis — the **types, configs, and entities** used by both the app client and the API. It deliberately bundles **no heavy chain libraries** (ethers / tronweb / @solana / @ton / @chainflip stay out), so it's a lightweight SDK that's safe to ship in the browser client.

## Layout (`src/`)

- **`entities/`** — core value objects: `Token`, `TokenAmount`, `Chain`, `Pair`, `Route`, `Trade`, plus the `fractions/` math (`Fraction`, `Percent`, `Price`).
- **`crosschain/config/`** — per-environment configs (`mainnet` / `testnet` / `dev` / `beta`) and their cached pool/token data.
- **`crosschain/chainData.ts`** — each chain's own data, the same in every deployment (`CHAIN_DATA`; `chainData(id)` for one).
- **`crosschain/deployment.ts`** — `Deployment` and `DeployedChain`.
- **`crosschain/deployedToken.ts`** — `DeployedToken`, `SyntheticToken` and `OmniPool`.
- **`crosschain/`** — shared API DTO types (`types.ts`), chain constants & labels, trade types/helpers, Tron types, and the deprecated `Symbiosis` client.
- **`crypto/`** — pure address helpers (e.g. `tronAddress`, base58 ↔ EVM).
- **root** — `constants.ts` (`ChainId`, …), `utils.ts`, `errors.ts`, and the `index.ts` barrel.

## Deployments and chains (0.1.0)

A deployment's data is plain: `Config` → `ChainConfig` (with the chain's own data in `chain: ChainData`), and the
config cache's tokens and pools. Objects are built from it: `Deployment.named(name)` for a shipped one (`mainnet`,
`beta`, `testnet`, `dev`), or `new Deployment(config, cacheData)` for one's own, such as a test's local chains or a
config with a consumer's own overrides. Its chains carry the behaviour that used to read global tables, such as
`chain.pairAddress(a, b)`. A `PairGraph` finds the best trades through Uniswap V2 pairs:
`new PairGraph(chain, pairs).bestTradesExactIn(amountIn, tokenOut)`, or `bestTradesExactOut`. A token carries its
chain (`new Token(chain, data)`, `token.chain`), so it wraps itself: `token.wrapped` and `amount.wrapped`.

A token keeps its address in EIP-55 form (`TokenAddress`), so `token.equals` and a deployment's lookups compare
addresses exactly. An address from outside, such as a user's, goes through `chain.parseAddress`, which also
takes the chain's own checksum (`EvmChainData.addressChecksum`), because that chain's explorers and wallets show
addresses in it. A token's address goes through `chain.parseAddress` too when sdk-types knows the token's chain,
and a gas token keeps its empty address. Addresses are not simply lowercased, because that would drop the checksum's
check for typos.

A deployment's tokens (`DeployedToken`, `SyntheticToken`) and omni pools (`OmniPool`) are objects linked to each
other. A token holds its synthetics, and a synthetic holds its original. A token does not refer to its pool, so the
deployment finds the pool: `deployment.omniPoolOf(token)`. The class docs in `crosschain/deployedToken.ts` describe
their members, such as `OmniPool.transitTokens(chainId)` and `transitToken(chainId)`.

The objects give the data and the relations, not every consumer's rule. A deployment's chain (`DeployedChain`)
carries the deployment's setup as `config` (`chain.config.dexFee`, `chain.config.rpc`, …). Every `Chain` has its
kind (`chain.kind`). A deployment with other RPCs or limits is a `new Deployment` of that config.

A deployment's token and pool data (`ConfigCacheData`) is parsed, not cast. `parseConfigCacheData(json)` errors on
data that does not fit. It gives the ids their branded types, and its EVM addresses come out in EIP-55 form.
It errors on two tokens with one id, on a pool that lists a token twice, on a token with only one of `originalId` and
`chainFromId`, and on a mixed-case EVM address without a valid EIP-55 checksum. It takes no chain's own checksum, since
the cache is generated. It drops the keys it does not know.

### Upgrading from 0.0.x

Most of 0.0.x keeps working. What 0.1.0 replaces stays as a deprecated wrapper over the shipped deployments' data.
It gives what it gave before, except where the sections below say otherwise. Each one's `@deprecated` doc names its
replacement. These are deprecated:

- The global tables: `WETH`, `GAS_TOKEN`, `MULTICALL_ADDRESSES`, `FACTORY_ADDRESS`, `INIT_CODE_HASH`,
  `COINGECKO_PLATFORMS`, `COINGECKO_GAS_TOKEN_IDS` and `chains`.
- The functions that read them: `getChainById`, `isFakeWETH`, `wrappedToken`, `wrappedAmount` and `Pair.getAddress`.
- The router and fee collector tables: `ONCHAIN_SWAP_ROUTERS`, `ONCHAIN_ZERO_FEE_SWAP_ROUTERS`, `MULTICALL_ROUTER_V2`,
  `LEGACY_FEE_COLLECTOR_ADDRESSES` and `LEGACY_ZERO_FEE_COLLECTOR_ADDRESSES`. Their getters are deprecated too:
  `getOnchainSwapRouter`, `getOnchainZeroFeeSwapRouter`, `getLegacyFeeCollector` and `getApprovableMetaRouter`.
  Also the types `ApprovableMetaRouter` and `OnchainSwapRouter`, whose replacement is `GatewayRouter`.
- The chain-id functions: `isEvmChainId`, `isTronChainId`, `isBtcChainId`, `isTonChainId`, `isSolanaChainId`,
  `isQuaiChainId` and `isPerpChainId`. Also `isTronToken`.
- `new Token(data)` without its chain, `new Route(pairs, input, output)` without its chain, and `new Pair(a, b)`
  without its address. Also `token.chainFrom`.
- `Trade.bestTradeExactIn`, `Trade.bestTradeExactOut` and `computeTradePriceBreakdown`.
- `ConfigCache`, `Symbiosis` and the `Id` type (a `number`).
- `normalizeRecipientAddress`.
- `tokenEquals`.
- `MapWithDefault`, which nothing in the package uses any more. It has no replacement.
- `chain.disabled` (always false) and `chain.swappable` (always true).

`isValidRecipientAddress` is not deprecated.

**The compiler reports these.** Each is fixed where it is reported:

- `new Chain(data)` takes a `ChainData` (`chainData(ChainId.X)` for a shipped chain), not an object of id, name,
  explorer, icons and flags. A plain object with a chain's fields (`{ ...chain, disabled: true }`) is no longer a
  `Chain`: type it as `ChainMetadata`.
- `chain.evm` is gone: it said true for Solana and Quai. Use `chain.kind === 'evm'`, and decide what Solana and Quai
  should do where `evm` was read.
- A `ChainConfig` needs its chain's data in `chain`. For a shipped chain, write `chain: chainData(ChainId.X)`.
- `new Route` takes its output token: it is no longer the last token of the path by default.
- `computeTradePriceBreakdown(trade, dexFee)` needs both arguments.
- The config cache's ids are typed: `TokenId`, `OmniPoolId` and `OmniPoolTokenIndex`, not `number`. Data written by
  hand goes through `parseConfigCacheData`.
- An omni pool's `address` and `oracle` are `EvmAddress`es (`oracle` was a `string`).
- An `ApprovableMetaRouter`'s `gateway` and `executor` are `EvmAddress`es, not `Address`es.
- `token.address` is a `TokenAddress` (`EvmAddress | ''`: the contract's address, or empty for a gas token), not an
  `Address`. A variable that holds a token's address and later another kind of address needs its type written out
  (`let address: Address = token.address`).
- `pair.getOutputAmount(amount)` and `pair.getInputAmount(amount)` give a `PairSwap` (`{ amount, pairAfter }`), not a
  tuple `[amount, pair]`.
- `PAIR_ADDRESS_CACHE` is gone: a pair's address is its chain's (`chain.pairAddress(a, b)`), or passed to
  `new Pair(a, b, address)`.

**Behaviour that changed without a type error.** Check these where they apply:

- A `dexFee` of 0, which many shipped chain configs have, now means no fee in `trade.priceBreakdown(dexFee)` and
  `computeTradePriceBreakdown`. 0.0.x charged 0.3% for a `dexFee` of 0 or none.
- A token on a Tron chain, such as WTRX or USDT on Tron, now has a checksummed address, as every other token already
  had. Before, it kept the case it was given, or was lowercase when given in base58. Compare such addresses
  case-insensitively, or compare tokens with `equals`.
- `isEvmChainId` says false for Stellar, Cardano, Sui and Canton, which it counted as EVM because they were on no
  other list.
- A `Deployment` checks its data when it is built, and errors on data that does not fit. For instance: a token on a
  chain the config lacks, an omni pool listed twice, a token or one original's synthetics in two pools, or a config
  whose pools are not the data's in the data's order.
- The deprecated `Symbiosis` and `ConfigCache` run the same checks on data they are given. For `ConfigCache`, every
  chain must also be one that sdk-types knows.
- `getZkCreate2Address` now derives the address of any zkSync Era pair. 0.0.x knew three pairs of one factory: it
  gave `undefined` for another pair of that factory, and threw for another factory.
- The testnet deployment no longer has the Bitcoin Mutiny chain, its BTC config, or the Mutiny and testnet4 BTC tokens
  (mutSymBtc, t4SymBtc, muBTC, and their synthetics), all out of service; its pool's `coinGeckoId` is `bitcoin`, as
  its config says. `ChainId.BTC_MUTINY` and `ChainId.BTC_TESTNET4` stay.
- The deprecated `chains` is read-only: writing to it, such as with `push` or `sort`, throws. In 0.0.x it was a plain
  array.
- The deprecated router and fee collector tables and their getters give checksummed addresses. 0.0.x gave some of them
  in lowercase, such as those on Tron. Compare such addresses case-insensitively.

**Dependencies.** 0.1.0 adds `zod` (^4) and `@ethersproject/constants`. The published `.d.ts` use zod's types: the
config cache's ids, such as `TokenId`, are zod brands.
