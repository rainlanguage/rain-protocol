This is the ERC20 token that is minted and distributed.

During `Phase.ZERO` the token can be traded and so compatible with the
Balancer pool mechanics.

During `Phase.ONE` the token is frozen and no longer able to be traded on
any AMM or transferred directly.

The token can be redeemed during `Phase.ONE` which burns the token in
exchange for pro-rata erc20 tokens held by the `RedeemableERC20` contract
itself.

The token balances can be used indirectly for other claims, promotions and
events as a proof of participation in the original distribution by token
holders.

The token can optionally be restricted by the `Tier` contract to only allow
receipients with a specified membership status.



## Details
`RedeemableERC20` is an ERC20 with 2 phases.

`Phase.ZERO` is the distribution phase where the token can be freely
transfered but not redeemed.
`Phase.ONE` is the redemption phase where the token can be redeemed but no
longer transferred.

Redeeming some amount of `RedeemableERC20` burns the token in exchange for
some other tokens held by the contract. For example, if the
`RedeemableERC20` token contract holds 100 000 USDC then a holder of the
redeemable token can burn some of their tokens to receive a % of that USDC.
If they redeemed (burned) an amount equal to 10% of the redeemable token
supply then they would receive 10 000 USDC.

Up to 8 redeemable tokens can be registered on the redeemable contract.
These will be looped over by default in the `redeem` function. If there is
an error during redemption or more than 8 tokens are to be redeemed, there
is a `redeemSpecific` function that allows the caller to specify exactly
which of the redeemable tokens they want to receive.
Note: The same amount of `RedeemableERC20` is burned, regardless of which
redeemable tokens were specified. Specifying fewer redeemable tokens will
NOT increase the proportion of each that is returned. `redeemSpecific` is
intended as a last resort if the caller cannot resolve issues causing
errors for one or more redeemable tokens during redemption.

`RedeemableERC20` has several owner administrative functions:
- Owner can add senders and receivers that can send/receive tokens even
  during `Phase.ONE`
- Owner can add to the list of redeemable tokens
  - But NOT remove them
  - And everyone can call `redeemSpecific` to override the redeemable list
- Owner can end `Phase.ONE` during `Phase.ZERO` by specifying the address
  of a distributor, which will have any undistributed tokens burned.

The intent is that the redeemable token contract is owned by a `Trust`
contract, NOT an externally owned account. The `Trust` contract will add
the minimum possible senders/receivers to facilitate the AMM trading and
redemption.

The `Trust` will also control access to managing redeemable tokens and
specifying the trading AMM pool as the distributor to burn to end
`Phase.ONE`.

The redeem functions MUST be used to redeem and burn RedeemableERC20s
(NOT regular transfers).

The `redeem` and `redeemSpecific` functions will simply revert if called
outside `Phase.ONE`.
A `Redeem` event is emitted on every redemption (per redeemed token) as
`(redeemer, redeemable, redeemAmount)`.

## Variables
### `bytes32` `SENDER`

### `bytes32` `RECEIVER`

### `bytes32` `DISTRIBUTOR_BURNER`

### `bytes32` `REDEEMABLE_ADDER`

### `uint256` `MINIMUM_INITIAL_SUPPLY`

### `uint8` `MAX_REDEEMABLES`

### `enum ITier.Tier` `minimumTier`


## Events
### `Redeem(address redeemer, address redeemable, uint256[2] redeemAmounts)`

Redeemable token burn amount.





## Functions
### `constructor(struct RedeemableERC20Config config_)` (public)

Mint the full ERC20 token supply and configure basic transfer
restrictions.




### `burnDistributor(address distributorAccount_)` (external)

The admin can burn all tokens of a single address to end `Phase.ZERO`.
The intent is that during `Phase.ZERO` there is some contract
responsible for distributing the tokens.
The admin specifies the distributor to end `Phase.ZERO` and all
undistributed tokens are burned.
The distributor is NOT set during the constructor because it likely
doesn't exist at that point. For example, Balancer needs the paired
erc20 tokens to exist before the trading pool can be built.




### `addRedeemable(contract IERC20 newRedeemable_)` (external)

Admin can add up to 8 redeemables to this contract.
Each redeemable will be sent to token holders when they call redeem
functions in `Phase.ONE` to burn tokens.
If the admin adds a non-compliant or malicious IERC20 address then
token holders can override the list with `redeemSpecific`.




### `getRedeemables() → address[8]` (external)

Public getter for underlying registered redeemables as a fixed sized
array.
The underlying array is dynamic but fixed size return values provide
clear bounds on gas etc.




### `redeemSpecific(contract IERC20[] specificRedeemables_, uint256 redeemAmount_)` (public)

Redeem tokens.
Tokens can be redeemed but NOT transferred during `Phase.ONE`.

Calculate the redeem value of tokens as:

```
( redeemAmount / redeemableErc20Token.totalSupply() )
* token.balanceOf(address(this))
```

This means that the users get their redeemed pro-rata share of the
outstanding token supply burned in return for a pro-rata share of the
current balance of each redeemable token.

I.e. whatever % of redeemable tokens the sender burns is the % of the
current reserve they receive.

Note: Any tokens held by `address(0)` are burned defensively.
      This is because transferring directly to `address(0)` will
      succeed but the `totalSupply` won't reflect it.



### `redeem(uint256 redeemAmount_)` (external)

Default redemption behaviour.
Thin wrapper for `redeemSpecific`.
`msg.sender` specifies an amount of their own redeemable token to
redeem.
Each redeemable token specified by this contract's admin will be sent
to the sender pro-rata.
The sender's tokens are burned in the process.




### `_beforeScheduleNextPhase(uint32 nextPhaseBlock_)` (internal)

Sanity check to ensure `Phase.ONE` is the final phase.




### `_beforeTokenTransfer(address sender_, address receiver_, uint256 amount_)` (internal)

Apply phase sensitive transfer restrictions.
During `Phase.ZERO` only tier requirements apply.
During `Phase.ONE` all transfers except burns are prevented.
If a transfer involves either a sender or receiver with the relevant
`unfreezables` state it will ignore these restrictions.


Hook that is called before any transfer of tokens. This includes
minting and burning.
Calling conditions:
- when `from` and `to` are both non-zero, `amount` of ``from``'s tokens
will be to transferred to `to`.
- when `from` is zero, `amount` tokens will be minted for `to`.
- when `to` is zero, `amount` of ``from``'s tokens will be burned.
- `from` and `to` are never both zero.
To learn more about hooks, head to xref:ROOT:extending-contracts.adoc#using-hooks[Using Hooks].

