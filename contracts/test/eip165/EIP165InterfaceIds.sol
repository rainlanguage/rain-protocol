// SPDX-License-Identifier: CAL
pragma solidity =0.8.19;

import {IInterpreterCallerV1} from "rain.interpreter/interface/deprecated/IInterpreterCallerV1.sol";
import "rain.interpreter/interface/IInterpreterCallerV2.sol";
import "rain.interpreter/interface/IExpressionDeployerV1.sol";
import "rain.interpreter/interface/IInterpreterExternV1.sol";
import "rain.interpreter/interface/IInterpreterV1.sol";
import "rain.interpreter/interface/IInterpreterStoreV1.sol";
import {IERC165Upgradeable as IERC165} from "@openzeppelin/contracts-upgradeable/utils/introspection/IERC165Upgradeable.sol";

contract EIP165InterfaceIds {
    // solhint-disable-next-line const-name-snakecase
    bytes4 public constant IERC165InterfaceId = type(IERC165).interfaceId;

    // solhint-disable-next-line const-name-snakecase
    bytes4 public constant IInterpreterCallerV1InterfaceId =
        type(IInterpreterCallerV1).interfaceId;

    // solhint-disable-next-line const-name-snakecase
    bytes4 public constant IInterpreterCallerV2InterfaceId =
        type(IInterpreterCallerV2).interfaceId;

    // solhint-disable-next-line const-name-snakecase
    bytes4 public constant IExpressionDeployerV1InterfaceId =
        type(IExpressionDeployerV1).interfaceId;

    // solhint-disable-next-line const-name-snakecase
    bytes4 public constant IInterpreterExternV1InterfaceId =
        type(IInterpreterExternV1).interfaceId;

    // solhint-disable-next-line const-name-snakecase
    bytes4 public constant IInterpreterV1InterfaceId =
        type(IInterpreterV1).interfaceId;

    // solhint-disable-next-line const-name-snakecase
    bytes4 public constant IInterpreterStoreV1InterfaceId =
        type(IInterpreterStoreV1).interfaceId;
}
