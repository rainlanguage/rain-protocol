## `BalancerSafeMath`



badd and bsub are basically identical to OpenZeppelin SafeMath; mul/div have extra checks


### `badd(uint256 a, uint256 b) → uint256` (internal)

Safe addition


if we are adding b to a, the resulting sum must be greater than a


### `bsub(uint256 a, uint256 b) → uint256` (internal)

Safe unsigned subtraction


Do a signed subtraction, and check that it produces a positive value
     (i.e., a - b is valid if b <= a)


### `bsubSign(uint256 a, uint256 b) → uint256, bool` (internal)

Safe signed subtraction


Do a signed subtraction


### `bmul(uint256 a, uint256 b) → uint256` (internal)

Safe multiplication


Multiply safely (and efficiently), rounding down


### `bdiv(uint256 dividend, uint256 divisor) → uint256` (internal)

Safe division


Divide safely (and efficiently), rounding down


### `bmod(uint256 dividend, uint256 divisor) → uint256` (internal)

Safe unsigned integer modulo


Returns the remainder of dividing two unsigned integers.
     Reverts when dividing by zero.

Counterpart to Solidity's `%` operator. This function uses a `revert`
opcode (which leaves remaining gas untouched) while Solidity uses an
invalid opcode to revert (consuming all remaining gas).



### `bmax(uint256 a, uint256 b) → uint256` (internal)

Safe unsigned integer max


Returns the greater of the two input values



### `bmin(uint256 a, uint256 b) → uint256` (internal)

Safe unsigned integer min


returns b, if b < a; otherwise returns a



### `baverage(uint256 a, uint256 b) → uint256` (internal)

Safe unsigned integer average


Guard against (a+b) overflow by dividing each operand separately



### `sqrt(uint256 y) → uint256 z` (internal)

Babylonian square root implementation


(https://en.wikipedia.org/wiki/Methods_of_computing_square_roots#Babylonian_method)



