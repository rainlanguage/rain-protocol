// SPDX-License-Identifier: CAL
pragma solidity =0.8.15;

import "../sentinel/LibSentinel.sol";
import "../interpreter/LibInterpreter.sol";
import "./libraries/LibFlow.sol";
import "./libraries/LibRebase.sol";
import "./FlowCommon.sol";
import {ReentrancyGuardUpgradeable as ReentrancyGuard} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import {ERC1155Upgradeable as ERC1155} from "@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol";

uint256 constant RAIN_FLOW_ERC1155_SENTINEL = uint256(
    keccak256(bytes("RAIN_FLOW_ERC1155_SENTINEL")) | SENTINEL_HIGH_BITS
);

struct FlowERC1155Config {
    string uri;
    StateConfig vmStateConfig;
}

struct ERC1155SelfIO {
    uint256 id;
    uint256 amount;
}

struct FlowERC1155IO {
    ERC1155SelfIO[] mints;
    ERC1155SelfIO[] burns;
    FlowIO flow;
}

SourceIndex constant REBASE_RATIO_ENTRYPOINT = SourceIndex.wrap(0);
SourceIndex constant CAN_TRANSFER_ENTRYPOINT = SourceIndex.wrap(1);
SourceIndex constant CAN_FLOW_ENTRYPOINT = SourceIndex.wrap(2);

contract FlowERC1155 is ReentrancyGuard, ERC1155, FlowCommon {
    using LibInterpreter for InterpreterState;
    using LibRebase for InterpreterState;
    using LibStackTop for StackTop;
    using LibRebase for uint256;
    using LibUint256Array for uint256;
    using LibUint256Array for uint[];

    event Initialize(address sender, FlowERC1155Config config);

    constructor() {
        _disableInitializers();
    }

    function initialize(FlowERC1155Config calldata config_)
        external
        initializer
    {
        __ReentrancyGuard_init();
        __ERC1155_init(config_.uri);
        _deployExpression(config_.expressionDeployer, config_.interpreter, config_.stateConfig, config_.finalMinStacks);
        emit Initialize(msg.sender, config_);
    }

    function _rebaseRatio(InterpreterState memory state_, uint256 id_)
        internal
        view
        returns (uint256)
    {
        state_.context = LibUint256Array.arrayFrom(id_).matrixFrom();
        return state_.rebaseRatio(REBASE_RATIO_ENTRYPOINT);
    }

    function balanceOf(address account_, uint256 id_)
        public
        view
        virtual
        override
        returns (uint256)
    {
        return
            super.balanceOf(account_, id_).rebaseOutput(
                _rebaseRatio(id_)
            );
    }

    function _transferPreflight(
        address from_,
        address to_,
        uint256[] memory ids_,
        uint256[] memory amounts_
    ) internal view virtual returns (uint256[] memory) {
        unchecked {
            IInterpreter interpreter_ = IInterpreter(interpreter);
            address expressionPointer_ = expressionPointer;
            uint[] memory amountsRebased_ = new uint[](amounts_.length);
            // @todo fix memory leak where each iteration we build new context arrays
            // for both rebase and can transfer when we could just reuse them.
            for (uint256 i_ = 0; i_ < ids_.length; i_++) {
                uint256 id_ = ids_[i_];
                uint256 amount_ = amounts_[i_];
                amountsRebased_[i_] = amount_.rebaseInput(
                    _rebaseRatio(id_)
                );

                uint[][] memory context_ = LibUint256Array.arrayFrom(
                    uint256(uint160(from_)),
                    uint256(uint160(to_)),
                    id_,
                    amount_,
                    amountsRebased_[i_]
                ).matrixFrom();
                require(
                    interpreter_.eval(expressionPointer_, CAN_TRANSFER_ENTRYPOINT).peek() > 0,
                    "INVALID_TRANSFER"
                );
            }
            return amountsRebased_;
        }
    }

    function _safeTransferFrom(
        address from_,
        address to_,
        uint256 id_,
        uint256 amount_,
        bytes memory data_
    ) internal virtual override {
        return
            super._safeTransferFrom(
                from_,
                to_,
                id_,
                _transferPreflight(
                    from_,
                    to_,
                    id_.arrayFrom(),
                    amount_.arrayFrom()
                )[0],
                data_
            );
    }

    function _safeBatchTransferFrom(address from_, address to_, uint[] memory ids_, uint[] memory amounts_, bytes memory data_) internal virtual override {
        return super._safeBatchTransferFrom(from_, to_, ids_, _transferPreflight(from_, to_, ids_, amounts_), data_);
    }

    function _previewFlow(address interpreter_, SourceIndex flow_, uint id_) internal view returns (FlowERC1155IO memory flowIO_) {
        uint[] memory stack_ = flowStack(CAN_FLOW_ENTRYPOINT, flow_, id_);
        uint[] memory values_;
        (stack_, values_) = stack_.consumeSentinel(
            RAIN_FLOW_ERC1155_SENTINEL,
            2
        );
        assembly ("memory-safe") {
            mstore(flowIO_, values_)
        }
        (stack_, values_) = stack_.consumeSentinel(
            RAIN_FLOW_ERC1155_SENTINEL,
            2
        );
        assembly ("memory-safe") {
            mstore(add(flowIO_, 0x20), values_)
        }
        flowIO_.flow = LibFlow.stackToFlow(stack_);
    }

    function _flow(
        address interpreter_,
        SourceIndex flow_,
        uint256 id_
    ) internal virtual nonReentrant returns (FlowERC1155IO memory flowIO_) {
        unchecked {
            flowIO_ = _previewFlow(interpreter_, flow_, id_);
            _registerFlowTime(flow_, id_);
            for (uint256 i_ = 0; i_ < flowIO_.mints.length; i_++) {
                // @todo support data somehow.
                _mint(msg.sender, flowIO_.mints[i_].id, flowIO_.mints[i_].amount, "");
            }
            for (uint256 i_ = 0; i_ < flowIO_.burns.length; i_++) {
                _burn(msg.sender, flowIO_.burns[i_].id, flowIO_.burns[i_].amount);
            }
            LibFlow.flow(flowIO_.flow, address(this), payable(msg.sender));
        }
    }

    function previewFlow(SourceIndex flow_, uint256 id_)
        external
        view
        virtual
        returns (FlowERC1155IO memory)
    {
        return _previewFlow(interpreter, flow_, id_);
    }

    function flow(SourceIndex flow_, uint256 id_)
        external
        virtual
        returns (FlowERC1155IO memory)
    {
        return _flow(interpreter, flow_, id_);
    }
}
