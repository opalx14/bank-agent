import { bindings, defineConfig, defineWorker } from "cf/config";

export default defineConfig({
  accountId: "0160c064607e260584a145f9a3b125e3",
  worker: defineWorker({
    name: "bankagent",
    entrypoint: "./worker/index.ts",
    compatibilityDate: "2026-11-19",
    compatibilityFlags: ["nodejs_compat"],
    domains: ["bankagent.opalx14.com"],
    assets: {
      htmlHandling: "none",
      notFoundHandling: "none",
      runWorkerFirst: ["/*", "!/_next/static/*", "!/*/_next/static/*"],
    },
    env: {
      ASSETS: bindings.assets(),
      OPALX_LEDGER_KV: bindings.kv({
        id: "026c4e4eb4e944a0a22927e319ce2f79",
      }),
      NEXT_PUBLIC_APP_ORIGIN: bindings.text("https://bankagent.opalx14.com"),
      NEXT_PUBLIC_AVALANCHE_CHAIN_ID: bindings.text("43113"),
      NEXT_PUBLIC_ENTERPRISE_GATEWAY_ADDRESS: bindings.text(
        "0xae97e6bd5e581d2affa6364bdc5975f9ef3f86cb",
      ),
      NEXT_PUBLIC_BANK_GATEWAY_ADDRESS: bindings.text(
        "0xf786333845a1b373b455d8f419b42291f821e721",
      ),
      NEXT_PUBLIC_OPALX_CORE_ADDRESS: bindings.text(
        "0xf83bbe11f98c47423cc343823b15a1028175fe4b",
      ),
      AVALANCHE_FUJI_RPC_URL: bindings.text(
        "https://api.avax-test.network/ext/bc/C/rpc",
      ),
      OPALX_SANDBOX_MODE: bindings.text("true"),
      OPALX_LIVE_MERCHANT_NAME: bindings.text("CONG TY TNHH OPALX VIETNAM"),
      OPALX_LIVE_MERCHANT_TAX_ID: bindings.text("0312345678"),
      OPALX_VIETQR_BANK_BIN: bindings.text("970422"),
      OPALX_VIETQR_BANK_NAME: bindings.text("MB Bank"),
      OPALX_LIVE_ENTERPRISE_ADDRESS: bindings.text(
        "0x78BF34e40C66b5B3Ed5f14612b927239BAC88676",
      ),
    },
  }),
});
