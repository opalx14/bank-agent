//! Deterministic 3-Way Reconciliation & Wash-Trade Guard Kernel (`OpalX GO`).
//! Side-3 authority: AI may parse invoices, but ONLY this kernel (+ on-chain Vault)
//! decides `Allow | RequireApproval | Deny` in fail-closed mode.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PolicyVerdict {
    Allow,
    RequireApproval,
    Deny,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DenyReason {
    None,
    VaultPaused,
    InvalidWebhookSignature,
    MissingOrDuplicateBankRef,
    AmountMismatch,
    InvalidInvoiceXmlSignature,
    WashTradeCycleDetected,
    ExceedsAutoLimitNeedsCfoPasskey,
}

#[derive(Debug, Clone)]
pub struct ThreeWayMatchInput {
    pub order_amount_vnd: u64,
    pub bank_paid_amount_vnd: u64,
    pub invoice_total_vnd: Option<u64>,
    pub webhook_signature_valid: bool,
    pub bank_ref_present: bool,
    pub bank_ref_already_used: bool,
    pub require_invoice_xml: bool,
    pub invoice_xml_signature_valid: bool,
    pub vault_paused: bool,
    pub single_order_auto_limit_vnd: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PolicyDecision {
    pub verdict: PolicyVerdict,
    pub reason: DenyReason,
}

pub const FLAG_WEBHOOK_SIG_VALID: u32 = 1 << 0;
pub const FLAG_BANK_REF_PRESENT: u32 = 1 << 1;
pub const FLAG_BANK_REF_USED: u32 = 1 << 2;
pub const FLAG_REQUIRE_INVOICE_XML: u32 = 1 << 3;
pub const FLAG_INVOICE_XML_SIG_VALID: u32 = 1 << 4;
pub const FLAG_VAULT_PAUSED: u32 = 1 << 5;
pub const FLAG_WASH_TRADE_DETECTED: u32 = 1 << 6;

pub const EVAL_ALLOW: u32 = 0;
pub const EVAL_REQUIRE_APPROVAL: u32 = 1;
pub const EVAL_DENY_VAULT_PAUSED: u32 = 2;
pub const EVAL_DENY_INVALID_SIG: u32 = 3;
pub const EVAL_DENY_BANK_REF: u32 = 4;
pub const EVAL_DENY_AMOUNT_MISMATCH: u32 = 5;
pub const EVAL_DENY_INVOICE_XML: u32 = 6;
pub const EVAL_DENY_WASH_TRADE: u32 = 7;

/// Validates a Vietnamese enterprise tax ID (MST):
/// - 10 ASCII digits (`NNNNNNNNNN`), or
/// - 13-digit branch tax ID (`NNNNNNNNNN-NNN`, 14 bytes with `-` at byte index 10).
pub fn is_valid_vn_tax_id(mst: &str) -> bool {
    let bytes = mst.as_bytes();
    match bytes.len() {
        10 => bytes.iter().all(|b| b.is_ascii_digit()),
        14 => {
            bytes[10] == b'-'
                && bytes[..10].iter().all(|b| b.is_ascii_digit())
                && bytes[11..].iter().all(|b| b.is_ascii_digit())
        }
        _ => false,
    }
}

/// Evaluates fail-closed 3-way reconciliation across Order <-> Bank Webhook <-> TT78 E-Invoice XML.
pub fn evaluate_three_way_match(input: &ThreeWayMatchInput) -> PolicyDecision {
    if input.vault_paused {
        return PolicyDecision {
            verdict: PolicyVerdict::Deny,
            reason: DenyReason::VaultPaused,
        };
    }
    if !input.webhook_signature_valid {
        return PolicyDecision {
            verdict: PolicyVerdict::Deny,
            reason: DenyReason::InvalidWebhookSignature,
        };
    }
    if !input.bank_ref_present || input.bank_ref_already_used {
        return PolicyDecision {
            verdict: PolicyVerdict::Deny,
            reason: DenyReason::MissingOrDuplicateBankRef,
        };
    }
    if input.order_amount_vnd == 0
        || input.bank_paid_amount_vnd == 0
        || input.bank_paid_amount_vnd != input.order_amount_vnd
    {
        return PolicyDecision {
            verdict: PolicyVerdict::Deny,
            reason: DenyReason::AmountMismatch,
        };
    }
    if input.require_invoice_xml {
        if !input.invoice_xml_signature_valid {
            return PolicyDecision {
                verdict: PolicyVerdict::Deny,
                reason: DenyReason::InvalidInvoiceXmlSignature,
            };
        }
        match input.invoice_total_vnd {
            Some(inv_total) if inv_total == input.order_amount_vnd => {}
            _ => {
                return PolicyDecision {
                    verdict: PolicyVerdict::Deny,
                    reason: DenyReason::AmountMismatch,
                };
            }
        }
    }
    if input.order_amount_vnd > input.single_order_auto_limit_vnd {
        return PolicyDecision {
            verdict: PolicyVerdict::RequireApproval,
            reason: DenyReason::ExceedsAutoLimitNeedsCfoPasskey,
        };
    }

    PolicyDecision {
        verdict: PolicyVerdict::Allow,
        reason: DenyReason::None,
    }
}

/// WASM/C FFI entry point mirroring `evaluate_three_way_match` + wash-trade guard.
///
/// Flag bits:
/// - `1 << 0` (1): `webhook_signature_valid`
/// - `1 << 1` (2): `bank_ref_present`
/// - `1 << 2` (4): `bank_ref_already_used`
/// - `1 << 3` (8): `require_invoice_xml`
/// - `1 << 4` (16): `invoice_xml_signature_valid`
/// - `1 << 5` (32): `vault_paused`
/// - `1 << 6` (64): `wash_trade_detected`
#[no_mangle]
pub extern "C" fn opalx_guard_eval(
    order_vnd: u64,
    bank_vnd: u64,
    invoice_vnd: u64,
    flags: u32,
    auto_limit_vnd: u64,
) -> u32 {
    let webhook_signature_valid = (flags & FLAG_WEBHOOK_SIG_VALID) != 0;
    let bank_ref_present = (flags & FLAG_BANK_REF_PRESENT) != 0;
    let bank_ref_already_used = (flags & FLAG_BANK_REF_USED) != 0;
    let require_invoice_xml = (flags & FLAG_REQUIRE_INVOICE_XML) != 0;
    let invoice_xml_signature_valid = (flags & FLAG_INVOICE_XML_SIG_VALID) != 0;
    let vault_paused = (flags & FLAG_VAULT_PAUSED) != 0;
    let wash_trade_detected = (flags & FLAG_WASH_TRADE_DETECTED) != 0;

    if vault_paused {
        return EVAL_DENY_VAULT_PAUSED;
    }
    if !webhook_signature_valid {
        return EVAL_DENY_INVALID_SIG;
    }
    if !bank_ref_present || bank_ref_already_used {
        return EVAL_DENY_BANK_REF;
    }
    if wash_trade_detected {
        return EVAL_DENY_WASH_TRADE;
    }

    let decision = evaluate_three_way_match(&ThreeWayMatchInput {
        order_amount_vnd: order_vnd,
        bank_paid_amount_vnd: bank_vnd,
        invoice_total_vnd: if require_invoice_xml {
            Some(invoice_vnd)
        } else {
            None
        },
        webhook_signature_valid,
        bank_ref_present,
        bank_ref_already_used,
        require_invoice_xml,
        invoice_xml_signature_valid,
        vault_paused,
        single_order_auto_limit_vnd: auto_limit_vnd,
    });

    match (decision.verdict, decision.reason) {
        (PolicyVerdict::Allow, _) => EVAL_ALLOW,
        (PolicyVerdict::RequireApproval, _) => EVAL_REQUIRE_APPROVAL,
        (PolicyVerdict::Deny, DenyReason::VaultPaused) => EVAL_DENY_VAULT_PAUSED,
        (PolicyVerdict::Deny, DenyReason::InvalidWebhookSignature) => EVAL_DENY_INVALID_SIG,
        (PolicyVerdict::Deny, DenyReason::MissingOrDuplicateBankRef) => EVAL_DENY_BANK_REF,
        (PolicyVerdict::Deny, DenyReason::AmountMismatch) => EVAL_DENY_AMOUNT_MISMATCH,
        (PolicyVerdict::Deny, DenyReason::InvalidInvoiceXmlSignature) => EVAL_DENY_INVOICE_XML,
        (PolicyVerdict::Deny, DenyReason::WashTradeCycleDetected) => EVAL_DENY_WASH_TRADE,
        (PolicyVerdict::Deny, _) => EVAL_DENY_AMOUNT_MISMATCH,
    }
}

/// Detects closed A -> B -> ... -> A transfer loops designed to farm reputation credits.
pub fn detect_circular_wash_trade(
    edges: &[(&str, &str)],
    candidate_from: &str,
    candidate_to: &str,
) -> bool {
    if candidate_from == candidate_to {
        return true;
    }

    let mut stack = vec![candidate_to];
    let mut visited = Vec::new();

    while let Some(current) = stack.pop() {
        if current == candidate_from {
            return true;
        }
        if visited.contains(&current) {
            continue;
        }
        visited.push(current);
        for &(src, dst) in edges {
            if src == current {
                stack.push(dst);
            }
        }
    }

    false
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_base_input() -> ThreeWayMatchInput {
        ThreeWayMatchInput {
            order_amount_vnd: 2_000,
            bank_paid_amount_vnd: 2_000,
            invoice_total_vnd: Some(2_000),
            webhook_signature_valid: true,
            bank_ref_present: true,
            bank_ref_already_used: false,
            require_invoice_xml: true,
            invoice_xml_signature_valid: true,
            vault_paused: false,
            single_order_auto_limit_vnd: 50_000_000,
        }
    }

    fn base_flags(require_xml: bool, xml_sig_valid: bool) -> u32 {
        let mut flags = FLAG_WEBHOOK_SIG_VALID | FLAG_BANK_REF_PRESENT;
        if require_xml {
            flags |= FLAG_REQUIRE_INVOICE_XML;
        }
        if xml_sig_valid {
            flags |= FLAG_INVOICE_XML_SIG_VALID;
        }
        flags
    }

    #[test]
    fn allows_valid_three_way_match() {
        let decision = evaluate_three_way_match(&valid_base_input());
        assert_eq!(decision.verdict, PolicyVerdict::Allow);
        assert_eq!(decision.reason, DenyReason::None);
    }

    #[test]
    fn denies_bank_amount_mismatch() {
        let mut input = valid_base_input();
        input.bank_paid_amount_vnd = 1_500;
        let decision = evaluate_three_way_match(&input);
        assert_eq!(decision.verdict, PolicyVerdict::Deny);
        assert_eq!(decision.reason, DenyReason::AmountMismatch);
    }

    #[test]
    fn denies_zero_amounts_and_invoice_mismatch() {
        let mut zero_input = valid_base_input();
        zero_input.order_amount_vnd = 0;
        zero_input.bank_paid_amount_vnd = 0;
        assert_eq!(
            evaluate_three_way_match(&zero_input).reason,
            DenyReason::AmountMismatch
        );

        let mut inv_mismatch = valid_base_input();
        inv_mismatch.invoice_total_vnd = Some(2_500);
        assert_eq!(
            evaluate_three_way_match(&inv_mismatch),
            PolicyDecision {
                verdict: PolicyVerdict::Deny,
                reason: DenyReason::AmountMismatch,
            }
        );
    }

    #[test]
    fn denies_vault_paused_signature_and_replay_in_fail_closed_order() {
        let mut paused = valid_base_input();
        paused.vault_paused = true;
        paused.webhook_signature_valid = false;
        assert_eq!(
            evaluate_three_way_match(&paused).reason,
            DenyReason::VaultPaused
        );

        let mut bad_sig = valid_base_input();
        bad_sig.webhook_signature_valid = false;
        bad_sig.bank_ref_already_used = true;
        assert_eq!(
            evaluate_three_way_match(&bad_sig).reason,
            DenyReason::InvalidWebhookSignature
        );

        let mut dup_ref = valid_base_input();
        dup_ref.bank_ref_already_used = true;
        assert_eq!(
            evaluate_three_way_match(&dup_ref).reason,
            DenyReason::MissingOrDuplicateBankRef
        );

        let mut missing_ref = valid_base_input();
        missing_ref.bank_ref_present = false;
        assert_eq!(
            evaluate_three_way_match(&missing_ref).reason,
            DenyReason::MissingOrDuplicateBankRef
        );
    }

    #[test]
    fn requires_approval_over_auto_limit() {
        let mut input = valid_base_input();
        input.order_amount_vnd = 75_000_000;
        input.bank_paid_amount_vnd = 75_000_000;
        input.invoice_total_vnd = Some(75_000_000);
        let decision = evaluate_three_way_match(&input);
        assert_eq!(decision.verdict, PolicyVerdict::RequireApproval);
        assert_eq!(
            decision.reason,
            DenyReason::ExceedsAutoLimitNeedsCfoPasskey
        );
    }

    #[test]
    fn detects_abc_circular_wash_trade_and_self_loop() {
        let history = [("ENT_A", "ENT_B"), ("ENT_B", "ENT_C"), ("ENT_C", "ENT_E")];
        assert!(detect_circular_wash_trade(&history, "ENT_C", "ENT_A"));
        assert!(detect_circular_wash_trade(&history, "ENT_A", "ENT_A"));
        assert!(!detect_circular_wash_trade(&history, "ENT_C", "ENT_D"));
    }

    #[test]
    fn validates_vietnam_mst_formats() {
        assert!(is_valid_vn_tax_id("0312345678"));
        assert!(is_valid_vn_tax_id("0109876543-001"));
        assert!(!is_valid_vn_tax_id("031234567"));
        assert!(!is_valid_vn_tax_id("03123456789"));
        assert!(!is_valid_vn_tax_id("0312345678001"));
        assert!(!is_valid_vn_tax_id("0312345678_001"));
        assert!(!is_valid_vn_tax_id("031234567A"));
        assert!(!is_valid_vn_tax_id("0312345678-00A"));
        assert!(!is_valid_vn_tax_id(" 0312345678"));
    }

    #[test]
    fn ffi_eval_returns_all_expected_codes_0_through_7() {
        let valid = base_flags(true, true);
        assert_eq!(
            opalx_guard_eval(2_000, 2_000, 2_000, valid, 50_000_000),
            EVAL_ALLOW
        );
        assert_eq!(
            opalx_guard_eval(75_000_000, 75_000_000, 75_000_000, valid, 50_000_000),
            EVAL_REQUIRE_APPROVAL
        );
        assert_eq!(
            opalx_guard_eval(2_000, 2_000, 2_000, valid | FLAG_VAULT_PAUSED, 50_000_000),
            EVAL_DENY_VAULT_PAUSED
        );
        assert_eq!(
            opalx_guard_eval(
                2_000,
                2_000,
                2_000,
                valid & !FLAG_WEBHOOK_SIG_VALID,
                50_000_000
            ),
            EVAL_DENY_INVALID_SIG
        );
        assert_eq!(
            opalx_guard_eval(
                2_000,
                2_000,
                2_000,
                valid & !FLAG_BANK_REF_PRESENT,
                50_000_000
            ),
            EVAL_DENY_BANK_REF
        );
        assert_eq!(
            opalx_guard_eval(2_000, 2_000, 2_000, valid | FLAG_BANK_REF_USED, 50_000_000),
            EVAL_DENY_BANK_REF
        );
        assert_eq!(
            opalx_guard_eval(2_000, 1_999, 2_000, valid, 50_000_000),
            EVAL_DENY_AMOUNT_MISMATCH
        );
        assert_eq!(
            opalx_guard_eval(
                2_000,
                2_000,
                2_000,
                base_flags(true, false),
                50_000_000
            ),
            EVAL_DENY_INVOICE_XML
        );
        assert_eq!(
            opalx_guard_eval(
                2_000,
                1_500,
                2_000,
                valid | FLAG_WASH_TRADE_DETECTED,
                50_000_000
            ),
            EVAL_DENY_WASH_TRADE
        );
        // If invoice XML is not required, mismatched/zero invoice_vnd is ignored and order is allowed.
        assert_eq!(
            opalx_guard_eval(2_000, 2_000, 0, base_flags(false, false), 50_000_000),
            EVAL_ALLOW
        );
    }
}
