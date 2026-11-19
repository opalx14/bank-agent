// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {EnterpriseGateway} from "../src/enterprise/EnterpriseGateway.sol";
import {BankGateway} from "../src/bank/BankGateway.sol";
import {IPortalTypes} from "../src/interfaces/IPortalTypes.sol";

interface VmTest {
    function prank(address msgSender) external;
    function expectRevert(bytes4 revertData) external;
    function expectRevert(bytes calldata revertData) external;
}

contract GatewaysTest {
    VmTest private constant vm = VmTest(address(uint160(uint256(keccak256("hevm cheat code")))));

    EnterpriseGateway private enterpriseGateway;
    BankGateway private bankGateway;

    address private operator = address(0xA11CE);
    address private attestor = address(0xB44E);
    address private enterpriseAddr = address(0xE101);
    address private outsider = address(0xDEAD);

    function setUp() public {
        enterpriseGateway = new EnterpriseGateway(operator);
        bankGateway = new BankGateway(attestor);
    }

    function testEnterpriseOrderLifecycle() public {
        bytes32 orderCommit = keccak256("ORDER_20260001");
        bytes32 invoiceCommit = keccak256("INVOICE_TT78_001");

        vm.prank(operator);
        enterpriseGateway.registerEnterpriseOrder(orderCommit, invoiceCommit, enterpriseAddr);

        assert(enterpriseGateway.isOrderRegistered(orderCommit));
        assert(enterpriseGateway.totalOrdersRegistered() == 1);

        IPortalTypes.EnterpriseOrderRecord memory record = enterpriseGateway.getEnterpriseOrder(orderCommit);
        assert(record.enterprise == enterpriseAddr);
        assert(record.invoiceCommitment == invoiceCommit);
        assert(record.registeredAt > 0);
    }

    function testEnterpriseRejectsDuplicateAndUnauthorized() public {
        bytes32 orderCommit = keccak256("ORDER_DUP");

        vm.prank(outsider);
        vm.expectRevert(EnterpriseGateway.UnauthorizedOperator.selector);
        enterpriseGateway.registerEnterpriseOrder(orderCommit, bytes32(0), enterpriseAddr);

        vm.prank(operator);
        enterpriseGateway.registerEnterpriseOrder(orderCommit, bytes32(0), enterpriseAddr);

        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(EnterpriseGateway.OrderAlreadyRegistered.selector, orderCommit)
        );
        enterpriseGateway.registerEnterpriseOrder(orderCommit, bytes32(0), enterpriseAddr);
    }

    function testBankAttestationAntiReplay() public {
        bytes32 orderCommit = keccak256("ORDER_20260002");
        bytes32 bankRef = keccak256("FT_PAYOS_9988");

        vm.prank(attestor);
        bankGateway.attestBankSettlement(bankRef, orderCommit);

        assert(bankGateway.usedBankRefs(bankRef));
        assert(bankGateway.isBankRefSettled(bankRef, orderCommit));
        assert(!bankGateway.isBankRefSettled(bankRef, keccak256("OTHER_ORDER")));
        assert(bankGateway.totalSettlementsAttested() == 1);

        vm.prank(attestor);
        vm.expectRevert(abi.encodeWithSelector(BankGateway.BankRefAlreadyUsed.selector, bankRef));
        bankGateway.attestBankSettlement(bankRef, keccak256("OTHER_ORDER"));
    }

    function testBankRejectsUnauthorizedAttestor() public {
        vm.prank(outsider);
        vm.expectRevert(BankGateway.UnauthorizedAttestor.selector);
        bankGateway.attestBankSettlement(keccak256("FT_1"), keccak256("ORD_1"));
    }
}
