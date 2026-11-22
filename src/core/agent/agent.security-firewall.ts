export interface ThreatVector {
  code: string;
  severity: "ELEVATED" | "CRITICAL";
  detail: string;
  matchedSample: string;
}

export interface PromptFirewallReport {
  blocked: boolean;
  riskScore: number;
  severity: "SAFE" | "ELEVATED" | "CRITICAL";
  vectors: ThreatVector[];
  sanitizedText: string;
}

export interface ToolPolicyVerdict {
  allowed: boolean;
  code: string;
  reason: string;
}

export const FORBIDDEN_PRIVILEGE_TOOLS = [
  "force_mint_guarantee",
  "disable_kill_switch",
  "bypass_wasm_guard",
  "transfer_vault_avax",
  "export_server_key",
] as const;

export const ALLOWED_AGENT_TOOLS = [
  "inspect_fuji_stack",
  "verify_guarantee_onchain",
  "parse_tt78_invoice_safe",
  "run_wasm_policy_kernel",
  "request_x402_audit_quote",
  "audit_agent_wallet_policy",
] as const;

type RuleTuple = [string, "ELEVATED" | "CRITICAL", number, string, RegExp];

const THREAT_RULES: RuleTuple[] = [
  ["INSTRUCTION_OVERRIDE", "CRITICAL", 55, "Prompt attempted to override system or policy instructions.", /\b(ignore\s+(?:all|previous|prior)\s+instructions?|disregard\s+(?:system|policy)|you\s+are\s+now)\b/i],
  ["POLICY_BYPASS_ATTEMPT", "CRITICAL", 60, "Prompt attempted to bypass WASM policy kernel or bank webhook verification.", /\b(bypass\s+wasm|skip\s+(?:bank|webhook|policy)|force\s+allow|override\s+policy|disable\s+kill\s*switch|mint\s+without\s+bank)\b/i],
  ["SECRET_EXFILTRATION", "CRITICAL", 65, "Prompt requested private keys, env secrets, or signing credentials.", /(\bprivate\s*key\b|\bdump\s+env\b|\b(?:PAYOS_CHECKSUM_KEY|OPALX_COMMITMENT_PEPPER|AVALANCHE_ISSUER_PRIVATE_KEY|PRIVY_AGENT_PRIVATE_KEY)\b|\b(?:sk|rk)[_-][a-zA-Z0-9_-]{12,}\b)/i],
  ["FUND_DRAIN_ATTEMPT", "CRITICAL", 65, "Prompt attempted unauthorized AVAX vault transfer or fund drain.", /\b(transfer\s+all\s+avax|drain\s+vault|send\s+vault\s+funds)\b/i],
  ["FAKE_AUTHORITY_CLAIM", "CRITICAL", 50, "Prompt claimed unverified pre-approval or admin override authority.", /\b(pre[-\s]?approved\s+by\s+bank|admin\s+override)\b/i],
  ["FAKE_AUTHORITY_CLAIM", "ELEVATED", 35, "Prompt asserted unverified executive role without Passkey P-256 signature.", /\bi\s+am\s+(?:the\s+)?cfo\b/i],
  ["XML_INJECTION_SPOOF", "CRITICAL", 55, "Detected script tag, ignored-directive XML comment, or spoofed SignatureValue.", /(<script\b|<!--\s*ignore\b|<SignatureValue>\s*(?:bypass|fake|test)\s*<\/SignatureValue>)/i],
];

const LABELED_KEY_RE =
  /(\b(?:private[_ ]?key|privkey|secret[_ ]?key|issuer[_ ]?key|signer[_ ]?key|AVALANCHE_ISSUER_PRIVATE_KEY|PRIVY_AGENT_PRIVATE_KEY)(?:\s*[:=]\s*|\s+is\s+|\s+)["']?)(?:0x)?[a-fA-F0-9]{64}\b/gi;
const ENV_SECRET_RE =
  /(\b(?:PAYOS_CHECKSUM_KEY|PAYOS_API_KEY|OPALX_COMMITMENT_PEPPER|PRIVY_APP_SECRET|OPENAI_API_KEY|OPENROUTER_API_KEY)(?:\s*[:=]\s*|\s+is\s+)["']?)[^\s"']+/gi;
const TOKEN_RE = /\b(?:sk|rk)(?:_[a-zA-Z0-9_-]{10,}|-[a-zA-Z0-9_-]{16,})\b/g;

/** Redacts labeled private keys, env secrets, and sk_/rk_ tokens while preserving tx hashes. */
export function scrubSensitiveTokens(text: string): string {
  return text
    .replace(LABELED_KEY_RE, "$1[REDACTED_KEY]")
    .replace(ENV_SECRET_RE, "$1[REDACTED_SECRET]")
    .replace(TOKEN_RE, "[REDACTED_TOKEN]");
}

/** Scans prompt or XML input for prompt-injection, policy-bypass, and exfiltration vectors. */
export function inspectPromptInjection(rawText: string): PromptFirewallReport {
  const vectors: ThreatVector[] = [];
  let rawScore = 0;

  for (const [code, severity, weight, detail, pattern] of THREAT_RULES) {
    const match = rawText.match(pattern);
    if (!match) continue;
    rawScore += weight;
    vectors.push({
      code,
      severity,
      detail,
      matchedSample: scrubSensitiveTokens(match[0]).slice(0, 80),
    });
  }

  const riskScore = Math.min(100, rawScore);
  const severity: PromptFirewallReport["severity"] =
    riskScore >= 50 ? "CRITICAL" : riskScore > 0 ? "ELEVATED" : "SAFE";
  const sanitizedText = scrubSensitiveTokens(rawText)
    .replace(/<script[\s\S]*?<\/script>/gi, "[REMOVED_SCRIPT]")
    .replace(/<!--\s*ignore[\s\S]*?-->/gi, "[REMOVED_XML_COMMENT]")
    .trim();

  return { blocked: severity === "CRITICAL", riskScore, severity, vectors, sanitizedText };
}

function collectArgStrings(value: unknown, depth = 0): string[] {
  if (depth > 4 || value === null || value === undefined) return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap((v) => collectArgStrings(v, depth + 1));
  if (typeof value === "object") return Object.values(value).flatMap((v) => collectArgStrings(v, depth + 1));
  return [];
}

/** Enforces fail-closed tool allowlist and inspects tool arguments for embedded injection. */
export function validateToolCall(toolName: string, args: Record<string, unknown>): ToolPolicyVerdict {
  const isForbidden = (FORBIDDEN_PRIVILEGE_TOOLS as readonly string[]).includes(toolName);
  const isAllowed = (ALLOWED_AGENT_TOOLS as readonly string[]).includes(toolName);

  if (isForbidden || !isAllowed) {
    return {
      allowed: false,
      code: "PRIVILEGE_ESCALATION_BLOCKED",
      reason: `Tool "${toolName}" is blocked by the OpalX fail-closed privilege allowlist.`,
    };
  }

  if (toolName !== "parse_tt78_invoice_safe") {
    const argText = collectArgStrings(args).join("\n");
    if (argText) {
      const scan = inspectPromptInjection(argText);
      if (scan.blocked) {
        return {
          allowed: false,
          code: "PROMPT_INJECTION_IN_TOOL_ARGS",
          reason: `Blocked unsafe tool arguments (${scan.vectors.map((v) => v.code).join(", ")}).`,
        };
      }
    }
  }

  return { allowed: true, code: "ALLOWED", reason: `Tool "${toolName}" passed allowlist and firewall checks.` };
}
