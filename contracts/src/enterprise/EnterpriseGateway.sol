// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IEnterpriseGateway, IPortalTypes} from "../interfaces/IPortalTypes.sol";

/// @title EnterpriseGateway
/// @notice Side-1 (Enterprise Portal) zero-PII commitment registry on Avalanche Fuji (43113).
contract EnterpriseGateway is IEnterpriseGateway {
    error UnauthorizedOperator();
    error InvalidOrderInput();
    error OrderAlreadyRegistered(bytes32 orderCommitment);

    event OperatorUpdated(address indexed operator, bool allowed);
    event EnterpriseOrderRegistered(
        bytes32 indexed orderCommitment,
        bytes32 invoiceCommitment,
        address indexed enterprise,
        uint64 registeredAt
    );

    address public owner;
    mapping(address => bool) public authorizedOperators;
    mapping(bytes32 => IPortalTypes.EnterpriseOrderRecord) private orders;
    uint256 public totalOrdersRegistered;

    modifier onlyOwner() {
        if (msg.sender != owner) revert UnauthorizedOperator();
        _;
    }

    modifier onlyOperator() {
        if (msg.sender != owner && !authorizedOperators[msg.sender]) {
            revert UnauthorizedOperator();
        }
        _;
    }

    constructor(address initialOperator) {
        owner = msg.sender;
        authorizedOperators[msg.sender] = true;
        if (initialOperator != address(0)) {
            authorizedOperators[initialOperator] = true;
            emit OperatorUpdated(initialOperator, true);
        }
    }

    function setOperator(address operator, bool allowed) external onlyOwner {
        authorizedOperators[operator] = allowed;
        emit OperatorUpdated(operator, allowed);
    }

    function registerEnterpriseOrder(
        bytes32 orderCommitment,
        bytes32 invoiceCommitment,
        address enterprise
    ) external onlyOperator {
        if (orderCommitment == bytes32(0) || enterprise == address(0)) {
            revert InvalidOrderInput();
        }
        if (orders[orderCommitment].registeredAt != 0) {
            revert OrderAlreadyRegistered(orderCommitment);
        }

        uint64 nowTs = uint64(block.timestamp);
        orders[orderCommitment] = IPortalTypes.EnterpriseOrderRecord({
            orderCommitment: orderCommitment,
            invoiceCommitment: invoiceCommitment,
            enterprise: enterprise,
            registeredAt: nowTs
        });
        totalOrdersRegistered += 1;

        emit EnterpriseOrderRegistered(
            orderCommitment,
            invoiceCommitment,
            enterprise,
            nowTs
        );
    }

    function isOrderRegistered(bytes32 orderCommitment) external view returns (bool) {
        return orders[orderCommitment].registeredAt != 0;
    }

    function getEnterpriseOrder(
        bytes32 orderCommitment
    ) external view returns (IPortalTypes.EnterpriseOrderRecord memory) {
        return orders[orderCommitment];
    }
}
