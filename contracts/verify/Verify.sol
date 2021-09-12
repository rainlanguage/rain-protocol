// SPDX-License-Identifier: CAL
pragma solidity ^0.6.12;

import "@openzeppelin/contracts/access/AccessControl.sol";

contract Verify is AccessControl {

    event Add(address indexed account, uint256 indexed id);
    event Remove(address indexed account);
    event Approve(uint256 indexed id);
    event Ban(uint256 indexed id);

    bytes32 public constant APPROVER_ADMIN = keccak256("APPROVER_ADMIN");
    bytes32 public constant APPROVER = keccak256("APPROVER");

    bytes32 public constant REMOVER_ADMIN = keccak256("REMOVER_ADMIN");
    bytes32 public constant REMOVER = keccak256("REMOVER");

    bytes32 public constant BANNER_ADMIN = keccak256("BANNER_ADMIN");
    bytes32 public constant BANNER = keccak256("BANNER");

    // account => Verification session ID
    mapping (address => uint256) public ids;

    // Verification session ID => approval
    mapping (uint256 => uint256) public approved;
    mapping (uint256 => uint256) public banned;

    constructor (address admin_) public {
        require(admin_ != address(0), "0_ACCOUNT");
        _setRoleAdmin(APPROVER, APPROVER_ADMIN);
        _setupRole(APPROVER_ADMIN, admin_);
        _setRoleAdmin(REMOVER, REMOVER_ADMIN);
        _setupRole(REMOVER_ADMIN, admin_);
        _setRoleAdmin(BANNER, BANNER_ADMIN);
        _setupRole(BANNER_ADMIN, admin_);
    }

    function add(uint256 id_) external {
        require(id_ != 0, "0_ID");
        require(ids[msg.sender] == 0, "SESSION_EXISTS");
        ids[msg.sender] = id_;
        approved[id_] = uint256(-1);
        banned[id_] = uint256(-1);
        emit Add(msg.sender, id_);
    }

    function remove(address account_) external {
        require(account_ != address(0), "0_ACCOUNT");
        require(hasRole(REMOVER, msg.sender), "ONLY_REMOVER");
        require(ids[account_] != 0, "REMOVED");
        delete(approved[ids[account_]]);
        delete(banned[ids[account_]]);
        delete(ids[account_]);
        emit Remove(account_);
    }

    function approve(uint256 id_) external {
        require(id_ != 0, "0_ID");
        require(hasRole(APPROVER, msg.sender), "ONLY_APPROVER");
        require(banned[id_] > block.number, "APPROVE_BLOCKED");
        require(approved[id_] > block.number, "APPROVED");
        approved[id_] = block.number;
        emit Approve(id_);
    }

    function ban(uint256 id_) external {
        require(id_ != 0, "0_ID");
        require(hasRole(BANNER, msg.sender), "ONLY_BANNER");
        require(banned[id_] != 0, "MISSING_ID");
        require(banned[id_] > block.number, "BANNED");
        banned[id_] = block.number;
        emit Ban(id_);
    }

    function accountApprovedSince(address account_)
        external
        view
        returns(uint256)
    {
        if (banned[ids[account_]] <= block.number) {
            return uint256(-1);
        }
        else if (approved[ids[account_]] <= block.number) {
            return approved[ids[account_]];
        }
        else {
            return uint256(-1);
        }
    }
}