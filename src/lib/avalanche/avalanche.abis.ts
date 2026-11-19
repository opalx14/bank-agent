import { parseAbi } from "viem";

export const ENTERPRISE_GATEWAY_ABI = parseAbi([
  "function owner() view returns (address)",
  "function authorizedOperators(address) view returns (bool)",
  "function totalOrdersRegistered() view returns (uint256)",
  "function registerEnterpriseOrder(bytes32 orderCommitment, bytes32 invoiceCommitment, address enterprise)",
  "function isOrderRegistered(bytes32 orderCommitment) view returns (bool)",
  "function getEnterpriseOrder(bytes32 orderCommitment) view returns ((bytes32 orderCommitment, bytes32 invoiceCommitment, address enterprise, uint64 registeredAt))",
]);

export const BANK_GATEWAY_ABI = parseAbi([
  "function owner() view returns (address)",
  "function authorizedAttestors(address) view returns (bool)",
  "function usedBankRefs(bytes32 bankRefCommitment) view returns (bool)",
  "function totalSettlementsAttested() view returns (uint256)",
  "function attestBankSettlement(bytes32 bankRefCommitment, bytes32 orderCommitment)",
  "function isBankRefSettled(bytes32 bankRefCommitment, bytes32 orderCommitment) view returns (bool)",
  "function getBankAttestation(bytes32 bankRefCommitment) view returns ((bytes32 bankRefCommitment, bytes32 orderCommitment, address attestor, uint64 attestedAt))",
]);

export const OPALX_CORE_ABI = parseAbi([
  "function guardian() view returns (address)",
  "function paused() view returns (bool)",
  "function totalReserveWei() view returns (uint256)",
  "function lockedCollateralWei() view returns (uint256)",
  "function protocolFeePoolWei() view returns (uint256)",
  "function dailyCapWei() view returns (uint256)",
  "function spentInWindowWei() view returns (uint256)",
  "function minVerificationFeeWei() view returns (uint256)",
  "function totalGuaranteesIssued() view returns (uint256)",
  "function availableReserveWei() view returns (uint256)",
  "function remainingDailyAllowanceWei() view returns (uint256)",
  "function enterpriseReputationCredits(address) view returns (uint256)",
  "function getEnterpriseCreditTier(address) view returns (uint8)",
  "function depositAvaxReserve() payable",
  "function pause()",
  "function unpause()",
  "function issueGuarantee(bytes32 guaranteeId, bytes32 orderCommitment, bytes32 bankRefCommitment, bytes32 invoiceCommitment, address enterprise, uint256 collateralWei, bool sandbox)",
  "function releaseGuaranteeCollateral(bytes32 guaranteeId)",
  "function revokeGuarantee(bytes32 guaranteeId, bytes32 reasonHash)",
  "function settleVerificationFee(bytes32 guaranteeId) payable",
  "function verifyGuarantee(bytes32 guaranteeId) view returns (bool valid, (bytes32 guaranteeId, bytes32 orderCommitment, bytes32 bankRefCommitment, bytes32 invoiceCommitment, address enterprise, uint256 collateralWei, uint64 issuedAt, bool revoked, bool sandbox) record)",
  "error UnauthorizedGuardian()",
  "error CorePaused()",
  "error InvalidInput()",
  "error EnterpriseOrderMissing(bytes32 orderCommitment)",
  "error BankSettlementMissing(bytes32 bankRefCommitment, bytes32 orderCommitment)",
  "error GuaranteeAlreadyExists(bytes32 guaranteeId)",
  "error GuaranteeNotFound(bytes32 guaranteeId)",
  "error InsufficientAvaxReserve(uint256 requested, uint256 available)",
  "error DailyCapExceeded(uint256 requested, uint256 remaining)",
  "error FeeTooLow(uint256 sent, uint256 required)",
]);
