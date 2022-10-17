// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

import "../../sentinel/LibSentinel.sol";
import "../../vm/runtime/LibVMState.sol";
import "../libraries/LibFlow.sol";
import {ReentrancyGuardUpgradeable as ReentrancyGuard} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "../vm/FlowVM.sol";
import {ERC1155Upgradeable as ERC1155} from "@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol";
import {ERC1155ReceiverUpgradeable as ERC1155Receiver} from "@openzeppelin/contracts-upgradeable/token/ERC1155/utils/ERC1155ReceiverUpgradeable.sol";

uint256 constant RAIN_FLOW_ERC1155_SENTINEL = uint256(
    keccak256(bytes("RAIN_FLOW_ERC1155_SENTINEL")) | SENTINEL_HIGH_BITS
);

struct FlowERC1155Config {
    string uri;
    StateConfig vmStateConfig;
    StateConfig[] flows;
}

struct ERC1155SupplyChange {
    address account;
    uint256 id;
    uint256 amount;
}

struct FlowERC1155IO {
    ERC1155SupplyChange[] mints;
    ERC1155SupplyChange[] burns;
    FlowTransfer flow;
}

SourceIndex constant CAN_TRANSFER_ENTRYPOINT = SourceIndex.wrap(1);

contract FlowERC1155 is ReentrancyGuard, FlowVM, ERC1155 {
    using LibVMState for VMState;
    using LibStackTop for StackTop;
    using LibUint256Array for uint256;

    event Initialize(address sender, FlowERC1155Config config);

    constructor(address vmIntegrity_) FlowVM(vmIntegrity_) {
        _disableInitializers();
    }

    function initialize(FlowERC1155Config calldata config_)
        external
        initializer
    {
        emit Initialize(msg.sender, config_);
        __ReentrancyGuard_init();
        __ERC1155_init(config_.uri);
        _saveVMState(
            CORE_SOURCE_ID,
            config_.vmStateConfig,
            LibUint256Array.arrayFrom(1, 1)
        );
        __FlowVM_init(config_.flows, LibUint256Array.arrayFrom(1, 6));
    }

    /// Needed here to fix Open Zeppelin implementing `supportsInterface` on
    /// multiple base contracts.
    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(ERC1155, ERC1155Receiver)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    /// @inheritdoc ERC1155
    function _beforeTokenTransfer(
        address operator_,
        address from_,
        address to_,
        uint256[] memory ids_,
        uint256[] memory amounts_,
        bytes memory
    ) internal virtual override {
        unchecked {
            VMState memory state_ = _loadVMState(CORE_SOURCE_ID);
            for (uint256 i_ = 0; i_ < ids_.length; i_++) {
                state_.context = LibUint256Array.arrayFrom(
                    uint256(uint160(operator_)),
                    uint256(uint160(from_)),
                    uint256(uint160(to_)),
                    ids_[i_],
                    amounts_[i_]
                );
                require(
                    state_.eval(CAN_TRANSFER_ENTRYPOINT).peek() > 0,
                    "INVALID_TRANSFER"
                );
            }
        }
    }

    function _previewFlow(VMState memory state_)
        internal
        view
        returns (FlowERC1155IO memory)
    {
        uint256[] memory refs_;
        FlowERC1155IO memory flowIO_;
        StackTop stackTop_ = flowStack(state_);
        (stackTop_, refs_) = stackTop_.consumeStructs(
            state_.stackBottom,
            RAIN_FLOW_ERC1155_SENTINEL,
            3
        );
        assembly ("memory-safe") {
            mstore(flowIO_, refs_)
        }
        (stackTop_, refs_) = stackTop_.consumeStructs(
            state_.stackBottom,
            RAIN_FLOW_ERC1155_SENTINEL,
            3
        );
        assembly ("memory-safe") {
            mstore(add(flowIO_, 0x20), refs_)
        }
        flowIO_.flow = LibFlow.stackToFlow(state_.stackBottom, stackTop_);
        return flowIO_;
    }

    function _flow(
        VMState memory state_,
        uint256 flow_,
        uint256 id_
    ) internal virtual nonReentrant returns (FlowERC1155IO memory) {
        unchecked {
            FlowERC1155IO memory flowIO_ = _previewFlow(state_);
            registerFlowTime(IdempotentFlag.wrap(state_.scratch), flow_, id_);
            for (uint256 i_ = 0; i_ < flowIO_.mints.length; i_++) {
                // @todo support data somehow.
                _mint(
                    flowIO_.mints[i_].account,
                    flowIO_.mints[i_].id,
                    flowIO_.mints[i_].amount,
                    ""
                );
            }
            for (uint256 i_ = 0; i_ < flowIO_.burns.length; i_++) {
                _burn(
                    flowIO_.burns[i_].account,
                    flowIO_.burns[i_].id,
                    flowIO_.burns[i_].amount
                );
            }
            LibFlow.flow(flowIO_.flow, address(this), payable(msg.sender));
            return flowIO_;
        }
    }

    function previewFlow(uint256 flow_, uint256 id_)
        external
        view
        virtual
        returns (FlowERC1155IO memory)
    {
        return _previewFlow(_loadFlowState(flow_, id_));
    }

    function flow(uint256 flow_, uint256 id_)
        external
        payable
        virtual
        returns (FlowERC1155IO memory)
    {
        return _flow(_loadFlowState(flow_, id_), flow_, id_);
    }
}
