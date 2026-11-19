// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {EnterpriseGateway} from "../src/enterprise/EnterpriseGateway.sol";
import {BankGateway} from "../src/bank/BankGateway.sol";
import {OpalXGoCore} from "../src/opalx/OpalXGoCore.sol";

address constant HEVM_ADDRESS = address(uint160(uint256(keccak256("hevm cheat code"))));

interface Vm {
    function startBroadcast() external;
    function stopBroadcast() external;
    function envOr(string calldata name, address defaultValue) external view returns (address value);
    function envOr(string calldata name, uint256 defaultValue) external view returns (uint256 value);
}

/// @notice Pure-AVAX deployment entrypoint for the 3 OpalX GO gateways on Avalanche Fuji (43113).
contract DeploySystemScript {
    Vm private constant vm = Vm(HEVM_ADDRESS);

    function run()
        external
        returns (EnterpriseGateway enterpriseGateway, BankGateway bankGateway, OpalXGoCore opalxCore)
    {
        address operator = vm.envOr("OPALX_ENTERPRISE_OPERATOR", address(0));
        address attestor = vm.envOr("OPALX_BANK_ATTESTOR", address(0));
        address guardian = vm.envOr("OPALX_CORE_GUARDIAN", address(0));
        uint256 dailyCapWei = vm.envOr("OPALX_DAILY_CAP_WEI", uint256(0.5 ether));
        uint256 seedReserveWei = vm.envOr("OPALX_SEED_RESERVE_WEI", uint256(5_000_000_000_000_000));

        vm.startBroadcast();
        enterpriseGateway = new EnterpriseGateway(operator);
        bankGateway = new BankGateway(attestor);
        opalxCore = new OpalXGoCore(
            address(enterpriseGateway),
            address(bankGateway),
            guardian,
            dailyCapWei
        );
        if (seedReserveWei > 0) {
            opalxCore.depositAvaxReserve{value: seedReserveWei}();
        }
        vm.stopBroadcast();
    }
}
