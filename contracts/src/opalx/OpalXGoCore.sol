// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IBankGateway, IEnterpriseGateway, IPortalTypes} from "../interfaces/IPortalTypes.sol";

/// @title OpalXGoCore
/// @notice Side-3 (OpalXGo Core) native-AVAX guarantee issuer, collateral vault & kill switch on Fuji.
contract OpalXGoCore {
    error UnauthorizedGuardian();
    error CorePaused();
    error InvalidInput();
    error EnterpriseOrderMissing(bytes32 orderCommitment);
    error BankSettlementMissing(bytes32 bankRefCommitment, bytes32 orderCommitment);
    error GuaranteeAlreadyExists(bytes32 guaranteeId);
    error GuaranteeNotFound(bytes32 guaranteeId);
    error InsufficientAvaxReserve(uint256 requested, uint256 available);
    error DailyCapExceeded(uint256 requested, uint256 remaining);
    error FeeTooLow(uint256 sent, uint256 required);

    event AvaxReserveDeposited(address indexed sender, uint256 amountWei, uint256 totalReserveWei);
    event CorePauseUpdated(bool indexed paused, address indexed guardian);
    event GuaranteeIssued(
        bytes32 indexed guaranteeId,
        address indexed enterprise,
        bytes32 indexed bankRefCommitment,
        uint256 collateralWei,
        bool sandbox
    );
    event CollateralReleased(bytes32 indexed guaranteeId, uint256 amountWei);
    event GuaranteeRevoked(bytes32 indexed guaranteeId, bytes32 reasonHash);
    event VerificationFeeSettled(bytes32 indexed guaranteeId, address indexed payer, uint256 feeWei);

    IEnterpriseGateway public immutable enterpriseGateway;
    IBankGateway public immutable bankGateway;
    address public guardian;

    bool public paused;
    uint256 public totalReserveWei;
    uint256 public lockedCollateralWei;
    uint256 public protocolFeePoolWei;
    uint256 public dailyCapWei;
    uint256 public spentInWindowWei;
    uint64 public windowStart;
    uint256 public minVerificationFeeWei = 0.00001 ether;
    uint256 public totalGuaranteesIssued;

    mapping(bytes32 => IPortalTypes.GuaranteeCertificateRecord) private guarantees;
    mapping(bytes32 => uint256) public guaranteeCollateralWei;
    mapping(address => uint256) public enterpriseReputationCredits;

    modifier onlyGuardian() {
        if (msg.sender != guardian) revert UnauthorizedGuardian();
        _;
    }

    constructor(
        address enterpriseGatewayAddress,
        address bankGatewayAddress,
        address initialGuardian,
        uint256 initialDailyCapWei
    ) {
        if (enterpriseGatewayAddress == address(0) || bankGatewayAddress == address(0)) {
            revert InvalidInput();
        }
        enterpriseGateway = IEnterpriseGateway(enterpriseGatewayAddress);
        bankGateway = IBankGateway(bankGatewayAddress);
        guardian = initialGuardian == address(0) ? msg.sender : initialGuardian;
        dailyCapWei = initialDailyCapWei;
        windowStart = uint64(block.timestamp);
    }

    receive() external payable {
        _recordAvaxDeposit(msg.sender, msg.value);
    }

    function depositAvaxReserve() external payable {
        _recordAvaxDeposit(msg.sender, msg.value);
    }

    function pause() external onlyGuardian {
        paused = true;
        emit CorePauseUpdated(true, msg.sender);
    }

    function unpause() external onlyGuardian {
        paused = false;
        emit CorePauseUpdated(false, msg.sender);
    }

    function setDailyCapWei(uint256 nextDailyCapWei) external onlyGuardian {
        dailyCapWei = nextDailyCapWei;
    }

    function setMinVerificationFeeWei(uint256 nextFeeWei) external onlyGuardian {
        minVerificationFeeWei = nextFeeWei;
    }

    function issueGuarantee(
        bytes32 guaranteeId,
        bytes32 orderCommitment,
        bytes32 bankRefCommitment,
        bytes32 invoiceCommitment,
        address enterprise,
        uint256 collateralWei,
        bool sandbox
    ) external onlyGuardian {
        if (paused) revert CorePaused();
        if (guaranteeId == bytes32(0) || orderCommitment == bytes32(0) || enterprise == address(0)) {
            revert InvalidInput();
        }
        if (guarantees[guaranteeId].issuedAt != 0) revert GuaranteeAlreadyExists(guaranteeId);
        if (!enterpriseGateway.isOrderRegistered(orderCommitment)) {
            revert EnterpriseOrderMissing(orderCommitment);
        }
        if (!bankGateway.isBankRefSettled(bankRefCommitment, orderCommitment)) {
            revert BankSettlementMissing(bankRefCommitment, orderCommitment);
        }

        _rollDailyWindowIfElapsed();
        uint256 remainingCap = dailyCapWei > spentInWindowWei ? dailyCapWei - spentInWindowWei : 0;
        if (collateralWei > remainingCap) revert DailyCapExceeded(collateralWei, remainingCap);

        uint256 available = availableReserveWei();
        if (collateralWei > available) revert InsufficientAvaxReserve(collateralWei, available);

        lockedCollateralWei += collateralWei;
        spentInWindowWei += collateralWei;
        guaranteeCollateralWei[guaranteeId] = collateralWei;
        guarantees[guaranteeId] = IPortalTypes.GuaranteeCertificateRecord({
            guaranteeId: guaranteeId,
            orderCommitment: orderCommitment,
            bankRefCommitment: bankRefCommitment,
            invoiceCommitment: invoiceCommitment,
            enterprise: enterprise,
            collateralWei: collateralWei,
            issuedAt: uint64(block.timestamp),
            revoked: false,
            sandbox: sandbox
        });
        totalGuaranteesIssued += 1;
        if (!sandbox) enterpriseReputationCredits[enterprise] += 10;

        emit GuaranteeIssued(guaranteeId, enterprise, bankRefCommitment, collateralWei, sandbox);
    }

    function releaseGuaranteeCollateral(bytes32 guaranteeId) external onlyGuardian {
        if (guarantees[guaranteeId].issuedAt == 0) revert GuaranteeNotFound(guaranteeId);
        uint256 locked = guaranteeCollateralWei[guaranteeId];
        if (locked > 0) {
            guaranteeCollateralWei[guaranteeId] = 0;
            lockedCollateralWei = lockedCollateralWei >= locked ? lockedCollateralWei - locked : 0;
            emit CollateralReleased(guaranteeId, locked);
        }
    }

    function revokeGuarantee(bytes32 guaranteeId, bytes32 reasonHash) external onlyGuardian {
        if (guarantees[guaranteeId].issuedAt == 0) revert GuaranteeNotFound(guaranteeId);
        guarantees[guaranteeId].revoked = true;
        uint256 locked = guaranteeCollateralWei[guaranteeId];
        if (locked > 0) {
            guaranteeCollateralWei[guaranteeId] = 0;
            lockedCollateralWei = lockedCollateralWei >= locked ? lockedCollateralWei - locked : 0;
        }
        emit GuaranteeRevoked(guaranteeId, reasonHash);
    }

    function settleVerificationFee(bytes32 guaranteeId) external payable {
        if (paused) revert CorePaused();
        if (guarantees[guaranteeId].issuedAt == 0) revert GuaranteeNotFound(guaranteeId);
        if (msg.value < minVerificationFeeWei) revert FeeTooLow(msg.value, minVerificationFeeWei);

        protocolFeePoolWei += msg.value;
        emit VerificationFeeSettled(guaranteeId, msg.sender, msg.value);
    }

    function verifyGuarantee(
        bytes32 guaranteeId
    ) external view returns (bool valid, IPortalTypes.GuaranteeCertificateRecord memory record) {
        record = guarantees[guaranteeId];
        valid = record.issuedAt != 0 && !record.revoked;
    }

    function availableReserveWei() public view returns (uint256) {
        return totalReserveWei > lockedCollateralWei ? totalReserveWei - lockedCollateralWei : 0;
    }

    function remainingDailyAllowanceWei() public view returns (uint256) {
        if (block.timestamp >= uint256(windowStart) + 1 days) return dailyCapWei;
        return dailyCapWei > spentInWindowWei ? dailyCapWei - spentInWindowWei : 0;
    }

    function getEnterpriseCreditTier(address enterprise) external view returns (uint8) {
        uint256 credits = enterpriseReputationCredits[enterprise];
        if (credits >= 100) return 2;
        if (credits >= 30) return 1;
        return 0;
    }

    function _recordAvaxDeposit(address sender, uint256 amountWei) private {
        if (amountWei == 0) revert InvalidInput();
        totalReserveWei += amountWei;
        emit AvaxReserveDeposited(sender, amountWei, totalReserveWei);
    }

    function _rollDailyWindowIfElapsed() private {
        if (block.timestamp >= uint256(windowStart) + 1 days) {
            windowStart = uint64(block.timestamp);
            spentInWindowWei = 0;
        }
    }
}
