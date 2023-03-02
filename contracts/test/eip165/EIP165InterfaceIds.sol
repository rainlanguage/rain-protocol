// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

import "../../interpreter/caller/IInterpreterCallerV1.sol";
import "../../interpreter/deploy/IExpressionDeployerV1.sol";
import "../../interpreter/extern/IInterpreterExternV1.sol";
import "../../interpreter/run/IInterpreterV1.sol";
import "../../interpreter/store/IInterpreterStoreV1.sol";
import {IERC165Upgradeable as IERC165} from "@openzeppelin/contracts-upgradeable/utils/introspection/IERC165Upgradeable.sol";

contract EIP165InterfaceIds {
    // solhint-disable-next-line const-name-snakecase
    bytes4 public constant IERC165InterfaceId = type(IERC165).interfaceId;

    // solhint-disable-next-line const-name-snakecase
    bytes4 public constant IInterpreterCallerV1InterfaceId =
        type(IInterpreterCallerV1).interfaceId;

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
