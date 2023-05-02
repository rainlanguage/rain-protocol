// SPDX-License-Identifier: CAL
pragma solidity =0.8.19;

import {IInterpreterCallerV1} from "rain.interface.interpreter/deprecated/IInterpreterCallerV1.sol";
import "rain.interface.interpreter/IInterpreterCallerV2.sol";
import "rain.interface.interpreter/IExpressionDeployerV1.sol";
import "rain.interface.interpreter/IInterpreterExternV1.sol";
import "rain.interface.interpreter/IInterpreterV1.sol";
import "rain.interface.interpreter/IInterpreterStoreV1.sol";
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
