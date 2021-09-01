## `PCToken`






### `constructor(string tokenSymbol, string tokenName)` (public)

Base token constructor




### `allowance(address owner, address spender) → uint256` (external)

Getter for allowance: amount spender will be allowed to spend on behalf of owner




### `balanceOf(address account) → uint256` (external)

Getter for current account balance




### `approve(address spender, uint256 amount) → bool` (external)

Approve owner (sender) to spend a certain amount


emits an Approval event


### `increaseApproval(address spender, uint256 amount) → bool` (external)

Increase the amount the spender is allowed to spend on behalf of the owner (sender)


emits an Approval event


### `decreaseApproval(address spender, uint256 amount) → bool` (external)

Decrease the amount the spender is allowed to spend on behalf of the owner (sender)


emits an Approval event
If you try to decrease it below the current limit, it's just set to zero (not an error)


### `transfer(address recipient, uint256 amount) → bool` (external)

Transfer the given amount from sender (caller) to recipient


_move emits a Transfer event if successful


### `transferFrom(address sender, address recipient, uint256 amount) → bool` (external)

Transfer the given amount from sender to recipient


_move emits a Transfer event if successful; may also emit an Approval event


### `totalSupply() → uint256` (external)

Getter for the total supply


declared external for gas optimization


### `name() → string` (external)



Returns the name of the token.
     We allow the user to set this name (as well as the symbol).
     Alternatives are 1) A fixed string (original design)
                      2) A fixed string plus the user-defined symbol
                         return string(abi.encodePacked(NAME, "-", _symbol));

### `symbol() → string` (external)



Returns the symbol of the token, usually a shorter version of the
name.

### `decimals() → uint8` (external)



Returns the number of decimals used to get its user representation.
For example, if `decimals` equals `2`, a balance of `505` tokens should
be displayed to a user as `5,05` (`505 / 10 ** 2`).

Tokens usually opt for a value of 18, imitating the relationship between
Ether and Wei. This is the value {ERC20} uses, unless {_setupDecimals} is
called.

NOTE: This information is only used for _display_ purposes: it in
no way affects any of the arithmetic of the contract, including
{IERC20-balanceOf} and {IERC20-transfer}.

### `_mint(uint256 amount)` (internal)





### `_burn(uint256 amount)` (internal)





### `_move(address sender, address recipient, uint256 amount)` (internal)





### `_push(address recipient, uint256 amount)` (internal)





### `_pull(address sender, uint256 amount)` (internal)






### `Approval(address owner, address spender, uint256 value)`





### `Transfer(address from, address to, uint256 value)`





