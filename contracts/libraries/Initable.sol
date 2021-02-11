// contracts/GLDToken.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

abstract contract Initable {
    bool private _initialized = false;

    modifier onlyInit() {
        require(_initialized, "ERR_ONLY_INIT");
        _;
    }

    modifier onlyNotInit() {
        require(!_initialized, "ERR_ONLY_NOT_INIT");
        _;
    }

    modifier withInit() {
        require(!_initialized, "ERR_ONLY_NOT_INIT");
        _;
        _initialized = true;
    }
}