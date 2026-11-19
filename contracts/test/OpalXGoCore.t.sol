// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {EnterpriseGateway} from "../src/enterprise/EnterpriseGateway.sol";
import {BankGateway} from "../src/bank/BankGateway.sol";
import {OpalXGoCore} from "../src/opalx/OpalXGoCore.sol";
import {IPortalTypes} from "../src/interfaces/IPortalTypes.sol";

interface VmCoreTest {
    function prank(address msgSender) external;
    function warp(uint256 newTimestamp) external;
    function deal(address account, uint256 newBalance) external;
    function expectRevert(bytes4 revertData) external;
    function expectRevert(bytes calldata revertData) external;
}

contract OpalXGoCoreTest {
    VmCoreTest private constant vm =
        VmCoreTest(address(uint160(uint256(keccak256("hevm cheat code")))));

    EnterpriseGateway private enterpriseGateway;
    BankGateway private bankGateway;
    OpalXGoCore private core;

    address private enterpriseAddr = address(0xE202);
    address private verifierPayer = address(0xF001);

    function setUp() public {
        enterpriseGateway = new EnterpriseGateway(address(this));
        bankGateway = new BankGateway(address(this));
        core = new OpalXGoCore(
            address(enterpriseGateway),
            address(bankGateway),
            address(this),
            0.05 ether
        );
        core.depositAvaxReserve{value: 0.02 ether}();
        vm.deal(verifierPayer, 1 ether);
    }

    function testCrossGatewayGuaranteeAndVerificationFee() public {
        bytes32 orderCommit = keccak256("ORD_VALID");
        bytes32 invoiceCommit = keccak256("INV_VALID");
        bytes32 bankRef = keccak256("FT_VALID");
        bytes32 guaranteeId = keccak256("OPX-2026-0001");

        enterpriseGateway.registerEnterpriseOrder(orderCommit, invoiceCommit, enterpriseAddr);
        bankGateway.attestBankSettlement(bankRef, orderCommit);

        core.issueGuarantee(
            guaranteeId,
            orderCommit,
            bankRef,
            invoiceCommit,
            enterpriseAddr,
            0.005 ether,
            false
        );

        (bool valid, IPortalTypes.GuaranteeCertificateRecord memory rec) = core.verifyGuarantee(guaranteeId);
        assert(valid);
        assert(!rec.sandbox);
        assert(rec.collateralWei == 0.005 ether);
        assert(core.lockedCollateralWei() == 0.005 ether);
        assert(core.availableReserveWei() == 0.015 ether);
        assert(core.enterpriseReputationCredits(enterpriseAddr) == 10);

        vm.prank(verifierPayer);
        core.settleVerificationFee{value: 0.00001 ether}(guaranteeId);
        assert(core.protocolFeePoolWei() == 0.00001 ether);

        core.releaseGuaranteeCollateral(guaranteeId);
        assert(core.lockedCollateralWei() == 0);
        assert(core.availableReserveWei() == 0.02 ether);
    }

    function testBlocksMissingCrossGatewayProof() public {
        bytes32 orderCommit = keccak256("ORD_NO_BANK");
        enterpriseGateway.registerEnterpriseOrder(orderCommit, bytes32(0), enterpriseAddr);

        vm.expectRevert(
            abi.encodeWithSelector(
                OpalXGoCore.BankSettlementMissing.selector,
                keccak256("FT_UNATTESTED"),
                orderCommit
            )
        );
        core.issueGuarantee(
            keccak256("OPX-FAIL"),
            orderCommit,
            keccak256("FT_UNATTESTED"),
            bytes32(0),
            enterpriseAddr,
            0.001 ether,
            false
        );
    }

    function testPauseBlocksIssuanceAndFeeAndRevokeUnlocksCollateral() public {
        bytes32 orderCommit = keccak256("ORD_KILL");
        bytes32 bankRef = keccak256("FT_KILL");
        bytes32 guaranteeId = keccak256("OPX-KILL");

        enterpriseGateway.registerEnterpriseOrder(orderCommit, bytes32(0), enterpriseAddr);
        bankGateway.attestBankSettlement(bankRef, orderCommit);

        core.pause();
        vm.expectRevert(OpalXGoCore.CorePaused.selector);
        core.issueGuarantee(guaranteeId, orderCommit, bankRef, bytes32(0), enterpriseAddr, 0.001 ether, true);

        core.unpause();
        core.issueGuarantee(guaranteeId, orderCommit, bankRef, bytes32(0), enterpriseAddr, 0.002 ether, true);
        assert(core.enterpriseReputationCredits(enterpriseAddr) == 0);

        core.revokeGuarantee(guaranteeId, keccak256("FRAUD_AUDIT"));
        (bool validAfterRevoke, IPortalTypes.GuaranteeCertificateRecord memory revRec) =
            core.verifyGuarantee(guaranteeId);
        assert(!validAfterRevoke);
        assert(revRec.revoked);
        assert(core.lockedCollateralWei() == 0);
    }

    function testDailyWindowRollsAndCreditTierAdvances() public {
        for (uint256 i = 0; i < 10; i++) {
            bytes32 ord = keccak256(abi.encodePacked("ORD", i));
            bytes32 bank = keccak256(abi.encodePacked("BANK", i));
            bytes32 gid = keccak256(abi.encodePacked("GID", i));
            enterpriseGateway.registerEnterpriseOrder(ord, bytes32(0), enterpriseAddr);
            bankGateway.attestBankSettlement(bank, ord);
            core.issueGuarantee(gid, ord, bank, bytes32(0), enterpriseAddr, 0.001 ether, false);
        }
        assert(core.getEnterpriseCreditTier(enterpriseAddr) == 2);

        vm.warp(block.timestamp + 1 days + 1);
        assert(core.remainingDailyAllowanceWei() == 0.05 ether);
    }
}
