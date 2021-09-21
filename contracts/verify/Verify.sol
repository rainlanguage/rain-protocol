// SPDX-License-Identifier: CAL
pragma solidity ^0.6.12;

pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/access/AccessControl.sol";

// Important: This enum is order sensitive.
// Remove does not have a state as all data is deleted.
enum Status {
    Nil,
    Added,
    Approved,
    Banned
}

struct State {
    Status status;
    uint32 since;
}

contract Verify is AccessControl {

    event Add(address indexed account, uint256 indexed id);
    event Approve(uint256 indexed id);
    event Ban(uint256 indexed id);
    event Remove(address indexed account);

    bytes32 public constant APPROVER_ADMIN = keccak256("APPROVER_ADMIN");
    bytes32 public constant APPROVER = keccak256("APPROVER");

    bytes32 public constant REMOVER_ADMIN = keccak256("REMOVER_ADMIN");
    bytes32 public constant REMOVER = keccak256("REMOVER");

    bytes32 public constant BANNER_ADMIN = keccak256("BANNER_ADMIN");
    bytes32 public constant BANNER = keccak256("BANNER");

    // account => Verification session ID
    mapping (address => uint256) public ids;

    // Verification session ID => state
    mapping (uint256 => State) public states;

    constructor (address admin_) public {
        require(admin_ != address(0), "0_ACCOUNT");
        _setRoleAdmin(APPROVER, APPROVER_ADMIN);
        _setupRole(APPROVER_ADMIN, admin_);
        _setRoleAdmin(REMOVER, REMOVER_ADMIN);
        _setupRole(REMOVER_ADMIN, admin_);
        _setRoleAdmin(BANNER, BANNER_ADMIN);
        _setupRole(BANNER_ADMIN, admin_);
    }

    function state(address account_) external view returns (State memory) {
        return states[ids[account_]];
    }

    function add(uint256 id_) external {
        require(ids[msg.sender] == 0, "OVERWRITE_ID");
        require(states[id_].status == Status.Nil, "CURRENT_STATUS");
        ids[msg.sender] = id_;
        states[id_] = State (
            Status.Added,
            uint32(block.number)
        );
        emit Add(msg.sender, id_);
    }

    function remove(address account_) external {
        require(hasRole(REMOVER, msg.sender), "ONLY_REMOVER");
        delete(states[ids[account_]]);
        delete(ids[account_]);
        emit Remove(account_);
    }

    function approve(uint256 id_) external {
        require(hasRole(APPROVER, msg.sender), "ONLY_APPROVER");
        require(states[id_].status > Status.Nil, "CURRENT_STATUS");
        require(states[id_].status < Status.Approved, "CURRENT_STATUS");
        states[id_] = State(
            Status.Approved,
            uint32(block.number)
        );
        emit Approve(id_);
    }

    function ban(uint256 id_) external {
        require(id_ != 0, "0_ID");
        require(hasRole(BANNER, msg.sender), "ONLY_BANNER");
        require(states[id_].status > Status.Nil, "CURRENT_STATUS");
        require(states[id_].status < Status.Banned, "CURRENT_STATUS");
        states[id_] = State(
            Status.Banned,
            uint32(block.number)
        );
        emit Ban(id_);
    }
}