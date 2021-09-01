## `RedeemableERC20`






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
doesn't exist at that point.
For example, Balancer needs the paired erc20 tokens to exist before the
trading pool can be built.




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

`( redeemAmount / redeemableErc20Token.totalSupply() )
* token.balanceOf(address(this))`

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


### `Redeem(address redeemer, address redeemable, uint256[2] redeemAmounts)`

Redeemable token burn amount.



