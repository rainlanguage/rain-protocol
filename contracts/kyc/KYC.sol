// SPDX-License-Identifier: CAL
pragma solidity ^0.6.12;

import "@openzeppelin/contracts/access/AccessControl.sol";

contract KYC is AccessControl {

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

    // account => KYC session ID
    mapping (address => uint256) public ids;

    // KYC session ID => approval
    mapping (uint256 => uint256) public approved;
    mapping (uint256 => uint256) public banned;

    constructor () public {
        _setRoleAdmin(APPROVER, APPROVER_ADMIN);
        _setupRole(APPROVER_ADMIN, msg.sender);
        _setRoleAdmin(REMOVER, REMOVER_ADMIN);
        _setupRole(REMOVER_ADMIN, msg.sender);
        _setRoleAdmin(BANNER, BANNER_ADMIN);
        _setupRole(BANNER_ADMIN, msg.sender);
    }

    function add(uint256 id) external {
        require(id != 0, "0_ID");
        require(ids[msg.sender] == 0, "SESSION_EXISTS");
        ids[msg.sender] = id;
        approved[id] = uint256(-1);
        banned[id] = uint256(-1);
    }

    function remove(address account) external {
        require(account != address(0), "0_ACCOUNT");
        require(hasRole(REMOVER, msg.sender), "ONLY_REMOVER");
        require(ids[account] != 0, "REMOVED");
        delete(approved[ids[account]]);
        delete(banned[ids[account]]);
        delete(ids[account]);
        emit Remove(account);
    }

    function approve(uint256 id) external {
        require(id != 0, "0_ID");
        require(hasRole(APPROVER, msg.sender), "ONLY_APPROVER");
        require(banned[id] > block.number, "APPROVE_BLOCKED");
        require(approved[id] > block.number, "APPROVED");
        approved[id] = block.number;
        emit Approve(id);
    }

    function ban(uint256 id) external {
        require(id != 0, "0_ID");
        require(hasRole(BANNER, msg.sender), "ONLY_BANNER");
        require(banned[id] != 0, "MISSING_ID");
        require(banned[id] > block.number, "BANNED");
        banned[id] = block.number;
        emit Ban(id);
    }
}