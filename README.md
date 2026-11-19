# OpalX GO — Bank Agent

> **3-Gateway VietQR-to-Avalanche Guarantee & Pure-AVAX Settlement Infrastructure**

OpalX GO là nền tảng đối soát thanh toán B2B **non-custodial** tách biệt 3 cổng chuyên biệt (**Doanh Nghiệp** / **Ngân Hàng** / **OpalXGo Core**), sử dụng **100% native AVAX** trên **Avalanche Fuji C-Chain (`43113`)** cho tài sản ký quỹ, phí xác minh và bằng chứng giao dịch thật trên Snowtrace (loại bỏ hoàn toàn USDC), cùng giao diện thuần **Tailwind CSS v4** (`src/styles/tailwind.css`, không dùng `globals.css`).

---

## Kiến Trúc 3 Cổng Độc Lập (3-Gateway Domain Separation)

### 1. Enterprise Gateway (`/enterprise`, `/scan`, `EnterpriseGateway.sol`)
- **Smart Contract**: [`EnterpriseGateway.sol`](contracts/src/enterprise/EnterpriseGateway.sol) — `0xaE97E6Bd5e581D2AFFa6364bdc5975f9eF3f86CB`
- Tạo đơn **VietQR Động** chuẩn EMVCo (`CRC-16/CCITT-FALSE`), PNG DataURL và deeplink `https://dl.vietqr.io/pay`.
- Phân tích XML Hóa đơn Điện tử **Thông tư 78 (`TT78_XML`)**; luồng trích xuất AI (`AI_BOUNDED_PROPOSAL`) luôn đặt `signatureValid: false`.
- Tự động in **Phiếu Mã Bảo Chứng** chuẩn máy in nhiệt `58mm`/`80mm` & AirPrint bằng pure Tailwind `print:*`.

### 2. Bank Gateway (`/bank`, `BankGateway.sol`)
- **Smart Contract**: [`BankGateway.sol`](contracts/src/bank/BankGateway.sol) — `0xF786333845a1b373b455D8f419b42291F821e721`
- Phân loại minh bạch **Tài khoản Demo (`[SANDBOX]`)** và **Tài khoản Thực tế Trực tiếp (`[LIVE BANK]`)** qua `/api/account-mode`.
- Xác thực webhook **PayOS (`HMAC-SHA256` constant-time)** + khóa chống phát lại `usedBankRefs[bankRefCommitment]` on-chain (**0 PII**).

### 3. OpalXGo Core (`/opalx`, `/verify/[id]`, `OpalXGoCore.sol`)
- **Smart Contract**: [`OpalXGoCore.sol`](contracts/src/opalx/OpalXGoCore.sol) — `0xF83BbE11F98c47423cC343823b15a1028175fe4B`
- **Rust WASM Policy Kernel** (`crates/opalx-guard`): quyết định tất định `ALLOW | REQUIRE_APPROVAL | DENY`, chống wash-trade vòng lặp `A -> B -> ... -> A`.
- Quỹ dự phòng **thuần AVAX** (`0.005 AVAX` thật trên Fuji), khóa ký quỹ AVAX theo đơn, thu phí đối soát `0.00001 AVAX/lượt` (`settleVerificationFee`), chấm điểm uy tín B2B (`STANDARD` → `SILVER_NET15` → `GOLD_NET30`) và **CFO Kill Switch** (`pause()`/`unpause()`).

---

## Roadmap Phát Triển

Xem chi tiết 4 giai đoạn tại [docs/ROADMAP.md](docs/ROADMAP.md) hoặc trang tương tác [/roadmap](/roadmap).

---

## Routes & API Endpoints

- **Web Pages**: `/`, `/enterprise`, `/bank`, `/opalx`, `/scan`, `/roadmap`, `/verify/[id]` (`/dashboard` chuyển hướng về `/opalx`).
- **APIs**:
  - `GET /api/account-mode` — Trạng thái Demo `[SANDBOX]` vs Live `[LIVE BANK]` & Avalanche Fuji AVAX Faucet.
  - `GET /api/orders`, `POST /api/orders/create` — Tạo đơn VietQR & đăng ký `EnterpriseGateway`.
  - `POST /api/sandbox/simulate-bank` — Mô phỏng 5 kịch bản đối soát `[SANDBOX]`.
  - `POST /api/webhooks/payos` — Webhook PayOS thật (`HMAC-SHA256`) cấp chứng thư `[LIVE BANK]`.
  - `GET /api/guarantees`, `GET /api/guarantees/[id]` — Sổ chứng thư & kiểm chứng RPC Fuji `43113`.
  - `GET /api/treasury/status` — Theo dõi dự trữ, ký quỹ, phí pool thuần AVAX & hạn mức 24h.
  - `GET / POST /api/avax/settle-fee` — Thanh toán phí xác minh bằng native `AVAX` (`0.00001 AVAX`).
  - `GET / POST /api/policy/kill-switch` — Bật/tắt tạm dừng khẩn cấp `OpalXGoCore`.
  - `GET /api/agent-card` — Metadata chuẩn `ERC-8004` (`settlementCurrency: "AVAX"`).

---

## Kiểm Thử & Vận Hành Local

```bash
bun install
cp .env.example .env.local
cargo test --manifest-path crates/opalx-guard/Cargo.toml
forge test --root contracts -vv
bun test
bun run test:e2e
bun run eval
bun run typecheck && bun run build
bun run dev
```
