


## Variables
### `uint32` `UNINITIALIZED`

### `bytes32` `APPROVER_ADMIN`

### `bytes32` `APPROVER`

### `bytes32` `REMOVER_ADMIN`

### `bytes32` `REMOVER`

### `bytes32` `BANNER_ADMIN`

### `bytes32` `BANNER`

### `mapping(address => struct State)` `states`


## Events
### `Add(address account, uint256 id)`

Emitted when a session ID is first associated with an account.



### `Approve(address account)`

Emitted when a previously added account is approved.



### `Ban(address account)`

Emitted when an added or approved account is banned.



### `Remove(address account)`

Emitted when an account is scrubbed from blockchain state.





## Functions
### `constructor(address admin_)` (public)

Defines RBAC logic for each role under Open Zeppelin.



### `state(address account_) → struct State` (external)

/ Typed accessor into states.



### `statusAtBlock(struct State state_, uint32 blockNumber) → enum Status` (external)

/ Derives a single `Status` from a `State` and a reference block number.



### `add(uint256 id_)` (external)





### `remove(address account_)` (external)





### `approve(address account_)` (external)





### `ban(address account_)` (external)





