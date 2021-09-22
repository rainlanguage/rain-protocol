// SPDX-License-Identifier: CAL
pragma solidity ^0.6.12;

abstract contract RainCompiler {
    uint8 constant OPCODE_NOOP = 0;
    uint8 constant OPCODE_INT = 1;
    uint8 constant OPCODE_ADDRESS = 2;

    address public immutable addressZero;
    address public immutable addressOne;
    address public immutable addressTwo;
    address public immutable addressThree;
    address public immutable addressFour;
    address public immutable addressFive;
    address public immutable addressSix;
    address public immutable addressSeven;

    uint256 public immutable intZero;
    uint256 public immutable intOne;
    uint256 public immutable intTwo;
    uint256 public immutable intThree;
    uint256 public immutable intFour;
    uint256 public immutable intFive;
    uint256 public immutable intSix;
    uint256 public immutable intSeven;

    uint256 public immutable compiledStack;

    constructor(
        bytes memory source_
    )
    public {
        address[8] memory addresses_;
        uint ai_ = 0;
        uint256[8] memory ints_;
        uint ii_ = 0;
        uint8 currentOp_ = OPCODE_NOOP;
        uint256 stack_ = 0;
        uint si_ = 0;
        for (uint i_ = 0; i_ < source_.length; i_++) {
            if (currentOp_ == OPCODE_NOOP) {
                currentOp_ = uint8(source_[i_]);
            }
            else if (currentOp_ == OPCODE_INT) {
                uint256 int_ = 0;
                for (uint j_ = 0; j_ < 32; j_++) {
                    int_ = int_ | uint256(uint8(source_[i_ + j_] << 32 - j_));
                }
                i_ = i_ + 32;
                currentOp_ = OPCODE_NOOP;
                ints_[ii_] = int_;
                ii_++;
            }
            else if (currentOp_ == OPCODE_ADDRESS) {
                bytes20 currentAddressBytes20_ = 0;
                for (uint b_ = 0; b_ < 20; b_++) {
                    currentAddressBytes20_ = currentAddressBytes20_
                        | bytes20(source_[i_ + b_] << 20 - b_);
                }
                i_ = i_ + 20;
                currentOp_ = OPCODE_NOOP;

                addresses_[ai_] = address(currentAddressBytes20_);
                ai_++;

                stack_ = stack_
                    | uint256(uint256(uint8(currentOp_) << 4 | ai_) << si_);
                si_ = si_ + 8;
            }
            else {
                stack_ = stack_
                    | uint256(
                        uint256(uint8(currentOp_) << 4
                        | uint8(source_[i_])
                    ) << si_);
                si_ = si_ + 8;
                currentOp_ = OPCODE_NOOP;
            }
        }

        addressZero = addresses_[0];
        addressOne = addresses_[1];
        addressTwo = addresses_[2];
        addressThree = addresses_[3];
        addressFour = addresses_[4];
        addressFive = addresses_[5];
        addressSix = addresses_[6];
        addressSeven = addresses_[7];

        intZero = ints_[0];
        intOne = ints_[1];
        intTwo = ints_[2];
        intThree = ints_[3];
        intFour = ints_[4];
        intFive = ints_[5];
        intSix = ints_[6];
        intSeven = ints_[7];

        compiledStack = stack_;
    }

    function runCompiled(
        bytes memory addressData_,
        bytes memory dispatchData_
    ) internal view returns (uint256) {
        uint256[8] memory addressInts_;
        if (addressZero != address(0)) {
            addressInts_[0] = runCompiledAddressToInt(
                addressZero,
                addressData_
            );
        }
        if (addressOne != address(0)) {
            addressInts_[1] = runCompiledAddressToInt(
                addressOne,
                addressData_
            );
        }
        if (addressTwo != address(0)) {
            addressInts_[2] = runCompiledAddressToInt(
                addressTwo,
                addressData_
            );
        }
        if (addressThree != address(0)) {
            addressInts_[3] = runCompiledAddressToInt(
                addressThree,
                addressData_
            );
        }
        if (addressFour != address(0)) {
            addressInts_[4] = runCompiledAddressToInt(
                addressFour,
                addressData_
            );
        }
        if (addressFive != address(0)) {
            addressInts_[5] = runCompiledAddressToInt(
                addressFive,
                addressData_
            );
        }
        if (addressSix != address(0)) {
            addressInts_[6] = runCompiledAddressToInt(
                addressSix,
                addressData_
            );
        }
        if (addressSeven != address(0)) {
            addressInts_[7] = runCompiledAddressToInt(
                addressSeven,
                addressData_
            );
        }

        uint256[8] memory ints_ = [
            intZero,
            intOne,
            intTwo,
            intThree,
            intFour,
            intFive,
            intSix,
            intSeven
        ];

        uint8 currentOpcode_ = OPCODE_NOOP;
        uint8 currentOpcodeValue_ = 0;
        uint256[16] memory outputStack_;
        uint256 oi_ = 0;

        for (uint256 si_ = 0; si_ < 32; si_++) {
            currentOpcode_ = uint8((compiledStack >> si_ * 8) & 0xFF00);
            currentOpcodeValue_ = uint8((compiledStack >> si_ * 8) & 0x00FF);
            if (currentOpcode_ == OPCODE_NOOP) {
                break;
            }
            else if (currentOpcode_ == OPCODE_INT) {
                outputStack_[oi_] = ints_[currentOpcodeValue_];
                oi_++;
            }
            else if (currentOpcode_ == OPCODE_ADDRESS) {
                outputStack_[oi_] = addressInts_[currentOpcodeValue_];
                oi_++;
            }
            else {
                uint256[] memory args_ = new uint256[](currentOpcodeValue_);
                for (uint256 j_ = 0; j_ < currentOpcodeValue_; j_++) {
                    args_[j_] = outputStack_[oi_ - currentOpcodeValue_ + j_];
                }
                outputStack_[oi_ - currentOpcodeValue_] = runCompiledDispatch(
                    currentOpcode_,
                    args_,
                    dispatchData_
                );
                oi_ = oi_ - currentOpcodeValue_;
            }
        }

        return outputStack_[0];
    }

    function runCompiledAddressToInt(
        address compiledAddress_,
        bytes memory data_
    )
    internal
    virtual
    view
    returns (uint256) { }

    function runCompiledDispatch(
        uint8 opcode_,
        uint256[] memory args_,
        bytes memory data_
    )
    internal
    virtual
    view
    returns (uint256) { }
}
