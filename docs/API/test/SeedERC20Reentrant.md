## `SeedERC20Reentrant`






### `addReentrantTarget(contract SeedERC20 seedERC20Contract_)` (external)

Set the contract to attempt to reenter.




### `setMethodTarget(enum SeedERC20Reentrant.Method methodTarget_)` (external)

Set the method to attempt to reenter.




### `_beforeTokenTransfer(address sender_, address receiver_, uint256 amount_)` (internal)



Hook that is called before any transfer of tokens. This includes
minting and burning.
Calling conditions:
- when `from` and `to` are both non-zero, `amount` of ``from``'s tokens
will be to transferred to `to`.
- when `from` is zero, `amount` tokens will be minted for `to`.
- when `to` is zero, `amount` of ``from``'s tokens will be burned.
- `from` and `to` are never both zero.
To learn more about hooks, head to xref:ROOT:extending-contracts.adoc#using-hooks[Using Hooks].


