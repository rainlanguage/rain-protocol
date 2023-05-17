// SPDX-License-Identifier: CAL
pragma solidity =0.8.19;

/// @title Fallback
/// A contract to receive ETH with an empty fallback function.
contract Fallback {

    fallback() external payable{} 

    receive() external payable{}
}
