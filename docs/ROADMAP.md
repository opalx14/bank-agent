# Roadmap Phát Triển Dự Án OpalX GO (Pure-AVAX 3-Gateway Architecture)

Dự án **OpalX GO / Bank Agent** tách biệt hoàn toàn 3 cổng theo trách nhiệm từng bên và sử dụng **100% native AVAX** trên **Avalanche Fuji (`43113`)** làm nhiên liệu ký quỹ, phí xác minh và bằng chứng giao dịch on-chain (loại bỏ hoàn toàn phụ thuộc USDC / Faucet ngoài).

---

## Giai đoạn 1 (Hiện tại — Hoàn thành cốt lõi Hackathon & PoC Thật)
**Tên giai đoạn**: *Kiến Trúc 3 Cổng Độc Lập & Chứng Thực AVAX Fuji*

- **Enterprise Gateway (`EnterpriseGateway.sol` · `/enterprise`, `/scan`)**
  - Tạo đơn thanh toán VietQR động (EMVCo CRC-16, PNG DataURL, `dl.vietqr.io`).
  - Phân tích XML Hóa đơn Điện tử Thông tư 78 (`TT78_XML`) và bóc tách có kiểm soát AI (`AI_BOUNDED_PROPOSAL` luôn `signatureValid: false`).
  - Ghi cam kết `orderCommitment` + `invoiceCommitment` (0 PII) lên `EnterpriseGateway.sol`.
  - In **Phiếu Mã Bảo Chứng** chuẩn máy in nhiệt `58mm`/`80mm` & AirPrint qua pure Tailwind CSS `print:*`.
- **Bank Gateway (`BankGateway.sol` · `/bank`)**
  - Phân loại minh bạch **Tài khoản Demo (`[SANDBOX]`)** và **Tài khoản Thực tế Trực tiếp (`[LIVE BANK]`)**.
  - Kiểm tra chữ ký webhook `PayOS HMAC-SHA256` (`timingSafeEqual`) + khóa chống replay `bankRefCommitment` trên `BankGateway.sol`.
- **OpalXGo Core (`OpalXGoCore.sol` · `/opalx`, `/verify/[id]`, `/roadmap`)**
  - Policy Kernel tất định **Rust WASM** (`crates/opalx-guard`) thực thi đối soát 3 chiều + chống vòng lặp rửa giao dịch (`A -> B -> ... -> A`) với `40/40` eval cases (`100.0%` adversarial precision).
  - Quỹ dự phòng **thuần AVAX** (`0.005 AVAX` seed thật trên Fuji), khóa/giải phóng tài sản bảo chứng, thu phí đối soát `0.00001 AVAX/lượt` và **CFO Kill Switch**.
  - Frontend **100% Tailwind CSS v4** (không dùng `globals.css`), cấu trúc module hóa nhỏ gọn `<= 220` dòng/file.

---

## Giai đoạn 2 (Quý 1/2027) — PayOS Live Đa Ngân Hàng & CFO Passkey Biometric
- Tích hợp webhook PayOS Production đa ngân hàng thương mại Việt Nam (`MB Bank`, `VCB`, `Techcombank`, `BIDV`).
- Bổ sung xác thực **WebAuthn Passkey P-256** cho CFO khi phê duyệt các đơn giá trị cao (`REQUIRE_APPROVAL`) và kích hoạt/mở khóa Vault Kill Switch.
- Đối chiếu chữ ký số XML trực tiếp theo chứng thư số CA Tổng cục Thuế.

---

## Giai đoạn 3 (Quý 2–3/2027) — Quỹ Thanh Khoản AVAX & Hạn Mức Tín Chỉ B2B Net-30
- Tích lũy điểm uy tín `enterpriseReputationCredits` on-chain chỉ từ giao dịch `[LIVE BANK]` thật (chặn cộng điểm từ `[SANDBOX]`).
- Tự động mở khóa hạn mức công nợ xuyên biên giới `SILVER_NET15` (`>= 30đ`) và `GOLD_NET30` (`>= 100đ`) được bảo lãnh bằng dự trữ AVAX.

---

## Giai đoạn 4 (Quý 4/2027) — Avalanche L1 Doanh Nghiệp & Mainnet Audit
- Kiểm toán bảo mật độc lập toàn bộ 3 hợp đồng `EnterpriseGateway`, `BankGateway`, `OpalXGoCore`.
- Triển khai **Avalanche L1 riêng** tối ưu cho doanh nghiệp SME Việt Nam tuân thủ Nghị định bảo vệ dữ liệu cá nhân (`0 PII on-chain`).
