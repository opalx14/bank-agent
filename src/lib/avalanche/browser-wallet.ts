"use client";

export interface Eip1193Provider {
  request: (args: { method: string; params?: unknown[] | Record<string, unknown> }) => Promise<unknown>;
  isMetaMask?: boolean;
  isAvalanche?: boolean;
  isCore?: boolean;
  isRabby?: boolean;
  isCoinbaseWallet?: boolean;
  isBraveWallet?: boolean;
  providers?: Eip1193Provider[];
}

export interface DiscoveredWallet {
  id: string;
  name: string;
  rdns?: string;
  icon?: string;
  provider: Eip1193Provider;
}

interface Eip6963AnnounceDetail {
  info: { uuid: string; name: string; icon: string; rdns: string };
  provider: Eip1193Provider;
}

const AVALANCHE_FUJI_CHAIN_HEX = "0xa869"; // 43113

function detectLegacyProviderName(provider: Eip1193Provider): string {
  if (provider.isAvalanche || provider.isCore) return "Core Wallet";
  if (provider.isRabby) return "Rabby Wallet";
  if (provider.isCoinbaseWallet) return "Coinbase Wallet";
  if (provider.isBraveWallet) return "Brave Wallet";
  if (provider.isMetaMask) return "MetaMask";
  return "Injected EVM Wallet";
}

/** Discovers installed EIP-6963 wallets plus legacy window.ethereum providers. */
export async function discoverInjectedWallets(timeoutMs = 150): Promise<DiscoveredWallet[]> {
  if (typeof window === "undefined") return [];
  const found: DiscoveredWallet[] = [];
  const seenProviders = new Set<Eip1193Provider>();

  const onAnnounce = (event: Event) => {
    const detail = (event as CustomEvent<Eip6963AnnounceDetail>).detail;
    if (!detail?.provider || seenProviders.has(detail.provider)) return;
    seenProviders.add(detail.provider);
    found.push({
      id: detail.info.uuid || detail.info.rdns || detail.info.name,
      name: detail.info.name || "EVM Wallet",
      rdns: detail.info.rdns,
      icon: detail.info.icon,
      provider: detail.provider,
    });
  };

  window.addEventListener("eip6963:announceProvider", onAnnounce);
  window.dispatchEvent(new Event("eip6963:requestProvider"));
  await new Promise((resolve) => setTimeout(resolve, timeoutMs));
  window.removeEventListener("eip6963:announceProvider", onAnnounce);

  const win = window as typeof window & {
    ethereum?: Eip1193Provider;
    avalanche?: Eip1193Provider;
  };

  const legacyCandidates: Eip1193Provider[] = [];
  if (win.avalanche) legacyCandidates.push(win.avalanche);
  if (win.ethereum) {
    if (Array.isArray(win.ethereum.providers) && win.ethereum.providers.length > 0) {
      legacyCandidates.push(...win.ethereum.providers);
    } else {
      legacyCandidates.push(win.ethereum);
    }
  }

  for (const prov of legacyCandidates) {
    if (!prov || typeof prov.request !== "function" || seenProviders.has(prov)) continue;
    seenProviders.add(prov);
    const name = detectLegacyProviderName(prov);
    found.push({ id: `legacy:${name.toLowerCase().replace(/\s+/g, "-")}`, name, provider: prov });
  }

  return found;
}

function utf8ToHex(text: string): `0x${string}` {
  const bytes = new TextEncoder().encode(text);
  let hex = "0x";
  for (const b of bytes) {
    hex += b.toString(16).padStart(2, "0");
  }
  return hex as `0x${string}`;
}

/** Requests account access from an injected EVM wallet and best-effort switches to Avalanche Fuji (43113). */
export async function connectInjectedAccount(provider: Eip1193Provider): Promise<`0x${string}`> {
  const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[] | undefined;
  const primary = accounts?.[0]?.trim();
  if (!primary || !/^0x[a-fA-F0-9]{40}$/.test(primary)) {
    throw new Error("No EVM account returned by wallet.");
  }

  // Best-effort switch to Avalanche Fuji testnet (non-blocking if user declines).
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: AVALANCHE_FUJI_CHAIN_HEX }],
    });
  } catch (switchErr) {
    const code = (switchErr as { code?: number } | null)?.code;
    if (code === 4902) {
      try {
        await provider.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: AVALANCHE_FUJI_CHAIN_HEX,
              chainName: "Avalanche Fuji C-Chain",
              nativeCurrency: { name: "Avalanche", symbol: "AVAX", decimals: 18 },
              rpcUrls: ["https://api.avax-test.network/ext/bc/C/rpc"],
              blockExplorerUrls: ["https://testnet.snowtrace.io"],
            },
          ],
        });
      } catch {
        // Non-blocking: ECDSA personal_sign works across all EVM chains.
      }
    }
  }

  return primary as `0x${string}`;
}

/** Requests an EIP-191 personal_sign signature for the server challenge message. */
export async function signChallengeWithInjectedWallet(
  provider: Eip1193Provider,
  address: `0x${string}`,
  message: string,
): Promise<`0x${string}`> {
  const hexMessage = utf8ToHex(message);
  try {
    const sig = (await provider.request({
      method: "personal_sign",
      params: [hexMessage, address],
    })) as string;
    if (typeof sig === "string" && sig.startsWith("0x")) {
      return sig as `0x${string}`;
    }
  } catch (err) {
    const code = (err as { code?: number } | null)?.code;
    if (code === 4001) {
      throw new Error("Signature request rejected in wallet.");
    }
    // Some legacy injected wallets expect plain UTF-8 text instead of hex-encoded message.
    const fallbackSig = (await provider.request({
      method: "personal_sign",
      params: [message, address],
    })) as string;
    if (typeof fallbackSig === "string" && fallbackSig.startsWith("0x")) {
      return fallbackSig as `0x${string}`;
    }
    throw err;
  }
  throw new Error("Wallet did not return a valid ECDSA signature.");
}
