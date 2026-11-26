# @symbiosis/sdk-types

Web3-light shared layer for Symbiosis — the **types, configs, and entities** used by both the app client and the API. It deliberately bundles **no heavy chain libraries** (ethers / tronweb / @solana / @ton / @chainflip stay out), so it's a lightweight SDK that's safe to ship in the browser client.

## Layout (`src/`)

- **`entities/`** — core value objects: `Token`, `TokenAmount`, `Chain`, `Pair`, `Route`, `Trade`, plus the `fractions/` math (`Fraction`, `Percent`, `Price`).
- **`crosschain/config/`** — per-environment configs (`mainnet` / `testnet` / `dev` / `beta`) and their cached pool/token data.
- **`crosschain/chainData.ts`** — each chain's own data (`CHAIN_DATA`, a list; `chainData(id)` for one): name, gas token, WETH, Multicall, Uniswap V2 factory, CoinGecko ids, in the order of the old global chain list. The configs reference it.
- **`crosschain/deployment.ts`** — `Deployment`, the object over one config and its cached data: its chains (`DeployedChain`, a `Chain` with the deployment's `config` on it), tokens and omni pools.
- **`crosschain/deployedToken.ts`** — `DeployedToken`, `SyntheticToken` and `OmniPool`, which a `Deployment` builds and links once.
- **`crosschain/`** — shared API DTO types (`types.ts`), chain constants & labels, trade types/helpers, Tron types, and the deprecated `Symbiosis` client.
- **`crypto/`** — pure address helpers (e.g. `tronAddress`, base58 ↔ EVM).
- **root** — `constants.ts` (`ChainId`, …), `utils.ts`, `errors.ts`, and the `index.ts` barrel.
## Deployments and chains (0.1.0)

A deployment's data is plain: `Config` → `ChainConfig` (with the chain's own data in `chain: ChainData`), and the
config cache's tokens and pools. Objects are built from it: `Deployment.named(name)` for a shipped one (`mainnet`,
`beta`, `testnet`, `dev`), or `new Deployment(config, cacheData)` for one's own, such as a test's local chains or a
config with a consumer's own overrides. Its chains carry the behaviour that used to read global tables, such as `chain.pairAddress(a, b)`. A recipient's
address on a partner route's chain (Monero, Litecoin, XRP, …) has a quick check for forms, a free function of the
chain id: `isValidRecipientAddress(chainId, address)`. It checks the format only; where an address is sent onward, it
is parsed there (`normalizeRecipientAddress`, which nothing called, is deprecated). The best trades through Uniswap V2 pairs are a `PairGraph`'s:
`new PairGraph(chain, pairs).bestTradesExactIn(amountIn, tokenOut)` (and `bestTradesExactOut`) gives `{ trades, errors }`,
the trades best first and, for each pair the amount cannot start through, why. A token carries its chain (`new Token(chain, data)`,
`token.chain`), so it wraps itself: `token.wrapped`, `amount.wrapped`.

A deployment's tokens and pools are objects with their relations: `deployment.tokens()`, `deployment.token(token)` (the
deployment's own token for one parsed from a request or a log); every `DeployedToken` has its
`synthetics` and `syntheticOn(chainId)`, and a `SyntheticToken` its `original` (a synthetic can have synthetics of its
own); an `OmniPool` (an `OmniPoolConfig`, from `deployment.omniPools()`) has its `tokens`, `has(token)`,
`indexOf(token)`, and the tokens that enter it from a chain, `transitTokens(chainId)` (the originals there of its
synthetics, in the pool's order) and `transitToken(chainId)` (the one of them, an error when there is none or more
than one). A token does not know its pool, one at most:
`deployment.omniPoolOf(token)` finds it.

The objects give the data and the relations, not every consumer's rule. A chain's setup is its `config`
(`chain.config.dexFee`, `chain.config.rpc`, …); the kind is `chain.kind`;
a deployment with other RPCs or limits is a `new Deployment` of that config.

A deployment's token and pool data (`ConfigCacheData`) is parsed, not cast: `parseConfigCacheData(json)` (or
`configCacheDataSchema`, a zod schema) errors on data that does not fit, and gives the ids their branded types.

### Upgrading from 0.0.x

Most of 0.0.x keeps working as deprecated wrappers over the shipped deployments' data, giving what it gave before:
the global tables and the functions that read them (`WETH`, `GAS_TOKEN`, `MULTICALL_ADDRESSES`, `FACTORY_ADDRESS`,
`COINGECKO_*`, the router tables and getters, `chains`, `getChainById`, `wrappedToken`, `wrappedAmount`,
`isFakeWETH`, `Pair.getAddress`), `Trade.bestTradeExactIn/Out`, `new Token(data)`, `new Route(pairs, …)` without
its chain, `new Pair` without its address, `ConfigCache`, `Symbiosis`, the chain-id functions (`isEvmChainId`,
`isTronChainId`, …), `isTronToken`, `normalizeRecipientAddress`, `chain.disabled` (always false) and
`chain.swappable` (always true; an app keeps both flags in its own type of chain), and the `Id` type (a `number`).
`isValidRecipientAddress` is not deprecated: it is a quick check of an address's format, for forms.

**The compiler reports these.** Each is fixed where it is reported:

- `Chain` is a class built from `ChainData`, not from `ChainConstructor`. A plain object with a chain's fields
  (`{ ...chain, disabled: true }`) is no longer a `Chain`: type it as `ChainMetadata`.
- `chain.evm` is gone: it said true for Solana and Quai. Use `chain.kind === 'evm'`, and decide what Solana and Quai
  should do where `evm` was read.
- A `ChainConfig` holds its chain's data, `chain: ChainData`: for a shipped chain, `chain: chainData(ChainId.X)`.
- `new Route` takes its output token: it is no longer the last token of the path by default.
- `computeTradePriceBreakdown(trade, dexFee)` takes both: no absent trade, and no assumed 0.3% fee.
- The config cache's ids are typed: `TokenId`, `OmniPoolId` and `OmniPoolTokenIndex`, not `number`. Data written by
  hand goes through `parseConfigCacheData`, which checks it and gives the ids their types.
- An omni pool's `address` and `oracle` are `EvmAddress`es (`oracle` was a `string`).
- `token.address` is a `TokenAddress` (`EvmAddress | ''`: the contract's address, or empty for a gas token), not an
  `Address`. A variable that holds a token's address and later another kind of address needs its type written out
  (`let address: Address = token.address`).
- `pair.getOutputAmount(amount)` and `pair.getInputAmount(amount)` give a `PairSwap` (`{ amount, pairAfter }`), not a
  tuple `[amount, pair]`.
- `PAIR_ADDRESS_CACHE` is gone: a pair's address is its chain's (`chain.pairAddress(a, b)`), or passed to
  `new Pair(a, b, address)`.

**Behaviour that changed without a type error.** Check these where they apply:

- A token on a Tron chain has its address checksummed (it kept the case it was given, or lowercase from base58), as
  every other token's already was (WTRX and USDT on Tron, for instance). Compare such addresses case-insensitively, or
  compare tokens with `equals`.
- `isEvmChainId` says false for Stellar, Cardano, Sui and Canton, which it counted as EVM because they were on no
  other list.
- Deployment data is checked when a deployment is built, which the deprecated `Symbiosis` and `ConfigCache` do too
  when given their own data: a token on a chain the deployment has no config for (for `ConfigCache`, one sdk-types
  does not know), an omni pool listed twice, a token (or the synthetics of one original) in two pools, and a config
  whose pools are not the data's, in the data's order, are errors.
- `getZkCreate2Address` derives any zkSync Era pair; it gave `undefined` for a pair of its one factory that it did not
  list.
- The testnet deployment no longer has the Bitcoin Mutiny chain, its BTC config, or the Mutiny and testnet4 BTC tokens
  (mutSymBtc, t4SymBtc, muBTC, and their synthetics), all out of service; its pool's `coinGeckoId` is `bitcoin`, as
  its config says. `ChainId.BTC_MUTINY` and `ChainId.BTC_TESTNET4` stay.

**Dependencies.** 0.1.0 adds `zod` (^4, whose types the published `.d.ts` use for the config cache's schemas) and
`@ethersproject/constants`.
