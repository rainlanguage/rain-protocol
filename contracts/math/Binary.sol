// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

/// @dev Binary 1
uint constant B_1 = 2 ** 1 - 1;
/// @dev Binary 11
uint constant B_11 = 2 ** 2 - 1;
/// @dev Binary 111
uint constant B_111 = 2 ** 3 - 1;
/// @dev Binary 1111
uint constant B_1111 = 2 ** 4 - 1;
/// @dev Binary 11111
uint constant B_11111 = 2 ** 5 - 1;
/// @dev Binary 111111
uint constant B_111111 = 2 ** 6 - 1;
/// @dev Binary 1111111
uint constant B_1111111 = 2 ** 7 - 1;
/// @dev Binary 11111111
uint constant B_11111111 = 2 ** 8 - 1;

uint constant MASK_1BIT = B_1;
uint constant MASK_2BIT = B_11;
uint constant MASK_3BIT = B_111;
uint constant MASK_4BIT = B_1111;
uint constant MASK_5BIT = B_11111;
uint constant MASK_6BIT = B_111111;
uint constant MASK_7BIT = B_1111111;
uint constant MASK_8BIT = B_11111111;
