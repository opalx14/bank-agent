// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IBankGateway, IPortalTypes} from "../interfaces/IPortalTypes.sol";

/// @title BankGateway
/// @notice Side-2 (Bank & PayOS NAPAS 247 Portal) anti-replay settlement oracle on Avalanche Fuji.
contract BankGateway is IBankGateway {
    error UnauthorizedAttestor();
    error InvalidBankAttestation();
    error BankRefAlreadyUsed(bytes32 bankRefCommitment);

    event AttestorUpdated(address indexed attestor, bool allowed);
    event BankSettlementAttested(
        bytes32 indexed bankRefCommitment,
        bytes32 indexed orderCommitment,
        address indexed attestor,
        uint64 attestedAt
    );

    address public owner;
    mapping(address => bool) public authorizedAttestors;
    mapping(bytes32 => bool) public usedBankRefs;
    mapping(bytes32 => IPortalTypes.BankAttestationRecord) private attestations;
    uint256 public totalSettlementsAttested;

    modifier onlyOwner() {
        if (msg.sender != owner) revert UnauthorizedAttestor();
        _;
    }

    modifier onlyAttestor() {
        if (msg.sender != owner && !authorizedAttestors[msg.sender]) {
            revert UnauthorizedAttestor();
        }
        _;
    }

    constructor(address initialAttestor) {
        owner = msg.sender;
        authorizedAttestors[msg.sender] = true;
        if (initialAttestor != address(0)) {
            authorizedAttestors[initialAttestor] = true;
            emit AttestorUpdated(initialAttestor, true);
        }
    }

    function setAttestor(address attestor, bool allowed) external onlyOwner {
        authorizedAttestors[attestor] = allowed;
        emit AttestorUpdated(attestor, allowed);
    }

    function attestBankSettlement(
        bytes32 bankRefCommitment,
        bytes32 orderCommitment
    ) external onlyAttestor {
        if (bankRefCommitment == bytes32(0) || orderCommitment == bytes32(0)) {
            revert InvalidBankAttestation();
        }
        if (usedBankRefs[bankRefCommitment]) {
            revert BankRefAlreadyUsed(bankRefCommitment);
        }

        uint64 nowTs = uint64(block.timestamp);
        usedBankRefs[bankRefCommitment] = true;
        attestations[bankRefCommitment] = IPortalTypes.BankAttestationRecord({
            bankRefCommitment: bankRefCommitment,
            orderCommitment: orderCommitment,
            attestor: msg.sender,
            attestedAt: nowTs
        });
        totalSettlementsAttested += 1;

        emit BankSettlementAttested(
            bankRefCommitment,
            orderCommitment,
            msg.sender,
            nowTs
        );
    }

    function isBankRefSettled(
        bytes32 bankRefCommitment,
        bytes32 orderCommitment
    ) external view returns (bool) {
        return (
            orderCommitment != bytes32(0) &&
            usedBankRefs[bankRefCommitment] &&
            attestations[bankRefCommitment].orderCommitment == orderCommitment
        );
    }

    function getBankAttestation(
        bytes32 bankRefCommitment
    ) external view returns (IPortalTypes.BankAttestationRecord memory) {
        return attestations[bankRefCommitment];
    }
}
