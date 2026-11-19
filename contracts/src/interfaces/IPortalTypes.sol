// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Shared structs and gateway interfaces across the 3 OpalX GO Avalanche Fuji portals.
interface IPortalTypes {
    struct EnterpriseOrderRecord {
        bytes32 orderCommitment;
        bytes32 invoiceCommitment;
        address enterprise;
        uint64 registeredAt;
    }

    struct BankAttestationRecord {
        bytes32 bankRefCommitment;
        bytes32 orderCommitment;
        address attestor;
        uint64 attestedAt;
    }

    struct GuaranteeCertificateRecord {
        bytes32 guaranteeId;
        bytes32 orderCommitment;
        bytes32 bankRefCommitment;
        bytes32 invoiceCommitment;
        address enterprise;
        uint256 collateralWei;
        uint64 issuedAt;
        bool revoked;
        bool sandbox;
    }
}

interface IEnterpriseGateway {
    function isOrderRegistered(bytes32 orderCommitment) external view returns (bool);

    function getEnterpriseOrder(
        bytes32 orderCommitment
    ) external view returns (IPortalTypes.EnterpriseOrderRecord memory);
}

interface IBankGateway {
    function usedBankRefs(bytes32 bankRefCommitment) external view returns (bool);

    function isBankRefSettled(
        bytes32 bankRefCommitment,
        bytes32 orderCommitment
    ) external view returns (bool);

    function getBankAttestation(
        bytes32 bankRefCommitment
    ) external view returns (IPortalTypes.BankAttestationRecord memory);
}
