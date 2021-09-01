## `SafeApprove`



Perhaps to address the known ERC20 race condition issue
     See https://github.com/crytic/not-so-smart-contracts/tree/master/race_condition
     Some tokens - notably KNC - only allow approvals to be increased from 0


### `safeApprove(contract IERC20 token, address spender, uint256 amount) → bool` (internal)

handle approvals of tokens that require approving from a base of 0





