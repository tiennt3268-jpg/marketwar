# ☕ Market Wars – Vietnam Goes Global

Web game mô phỏng chiến lược **thâm nhập thị trường quốc tế** cho doanh nghiệp cà phê hòa tan Việt Nam, xây dựng theo tài liệu *Market Wars 3.1 – SRS & Technical Design*.

Các đội có cùng điều kiện xuất phát ($5M vốn, nhà máy 300.000 hộp/quý, thương hiệu 20/100) và cạnh tranh đồng thời tại 🇨🇳 Trung Quốc, 🇯🇵 Nhật Bản, 🇺🇸 Hoa Kỳ và 🇬🇧 Anh. Người chơi **chọn hành động** (công thức sản phẩm, phương thức thâm nhập, logistics, giá, marketing, tài chính). Engine **tính kết quả** (chất lượng, chất lượng cảm nhận, định vị, thị phần, lợi nhuận).

## Chạy game

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 23 test theo ma trận nghiệm thu T-01…T-27 + Monte Carlo
npm run build      # bản build tĩnh trong dist/ (deploy Netlify bằng netlify.toml)
SINGLE=1 npx vite build   # gói toàn bộ game thành một file HTML duy nhất
```

## Cách chơi (hot-seat, nhiều đội trên một máy)

0. Đăng nhập. Tài khoản Game Master (admin) `tiennt` được cấu hình sẵn trong `src/ui/auth.ts` (chỉ lưu salt + SHA-256 hash, không lưu mật khẩu). Sinh viên tự đăng ký tài khoản kèm hồ sơ (họ tên, MSSV, email, lớp).
1. Game Master tạo **lớp** (tên, mã lớp, học kỳ). Trong lớp làm 3 bước: **(1) Add students to class** — thêm tài khoản sinh viên đã đăng ký vào danh sách lớp (nhập chính xác username/MSSV/email hoặc bấm Add); **(2) Create game**; **(3) Assign students to companies** — chỉ sinh viên có trong danh sách lớp mới gán được. Tạo game trong lớp (chọn số công ty sinh viên/bot và độ khó bot), rồi vào tab **Players & companies** gán mỗi công ty cho đúng **một** tài khoản sinh viên. Sinh viên chỉ thấy lớp/game mình được gán và chỉ điều hành công ty của mình.
   GM có thể đặt **deadline** cho vòng (tự khoá & xử lý khi hết giờ, tự mở vòng mới với deadline kế tiếp theo chu kỳ phút/giờ/ngày) — xử lý khi có người đang mở game, hoặc bắt kịp ngay khi game được mở lại. Thông báo (kết quả vòng, deadline, sự kiện, gán công ty, nộp bài, cảnh báo) hiển thị ở nút **Notifications**. Trang **Round Report** có biểu đồ (bảng xếp hạng, doanh thu, lợi nhuận, thị phần theo nước, xu hướng điểm/lợi nhuận/thị phần, income bridge, cầu vs bán) và xem lại được mọi vòng cũ.
   Sinh viên chưa được gán vào lớp có thể **Play vs bots** với 3 mức Easy / Normal / Hard (độ khó chỉ thay đổi cách bot ra quyết định; mọi công ty vẫn xuất phát giống nhau). Trong game đấu bot, nút *Submit & run round* tự xử lý vòng.
1. Ở sảnh, tạo trò chơi: 2–8 đội, mỗi đội là **người chơi** (có thể đặt PIN) hoặc **bot** (6 chiến lược: price leader, quality differentiator, focused niche, export-first, JV diversifier, conservative).
2. Mỗi đội chọn tên mình ở ô **Viewing as**, ra quyết định trên các trang: Market Intelligence → Product Lab → Strategy & Entry → Marketing & Pricing → Operations & Logistics → Finance & Risk → **Review & Submit**.
3. Chọn **Game Master** → **Lock & process round**. Kết quả được công bố: thị phần, bản đồ định vị, báo cáo tài chính, bảng xếp hạng.
4. Mặc định 2 vòng thử (reset về điểm xuất phát) + 8 vòng tính điểm; mỗi vòng = 1 quý. Game tự lưu trong trình duyệt, có thể xuất/nhập file JSON.

Điểm: Lợi nhuận luỹ kế 30% · Thị phần toàn cầu 25% · ROIC 20% · Thương hiệu 15% · Khả năng chống chịu 10% (chuẩn hoá theo ngưỡng, trọng số chỉnh được).

## Những gì đã hiện thực (đối chiếu SRS)

| Phần SRS | Hiện thực |
|---|---|
| II. Product Lab | BOM theo gram (ràng buộc khối lượng, Robusta+Arabica=100%), rang, sấy spray/freeze, cấp nguyên liệu, đường/kem/hương liệu, bao bì; engine suy ra hương vị, chất lượng, tỷ lệ lỗi, giá thành. Phiên bản sản phẩm (R&D lag 1 vòng, tồn kho cũ giữ công thức & giá vốn). Tối đa 5 SKU. |
| III. Quyết định chiến lược | 7 entry mode (indirect/direct export, licensing, franchising, JV, greenfield, acquisition) với đối tác, quy mô, sở hữu, lead time, trần sở hữu; marketing theo nước (phân khúc mục tiêu, 5 kênh quảng cáo, thông điệp, bản địa hoá, khuyến mãi, trade spend, biên nhà bán lẻ, kênh TMĐT/bán lẻ, tín dụng, dịch vụ, nhân sự); logistics (sea/air/multimodal, economy/standard/express, EXW/FOB/CIF/DAP/DDP, bảo hiểm hàng hoá, nhãn tuân thủ, hải quan, hạn ngạch); tài chính (vay USD/VND ngắn/dài hạn, trả nợ, hedge forward, bảo hiểm rủi ro chính trị, dự trữ tiền mặt, cổ tức); sản xuất (công suất, bảo trì, QC, R&D, innovation → công nghệ freeze-drying, thuê ngoài, đa dạng nguồn cung, nhà máy nước ngoài). |
| IV. Định vị tự động | RPI, perceived quality, perceived value, nhãn Economy / Value for Money / Mainstream / Premium / Overpriced / Niche Specialist; chiến lược suy ra (Cost Leadership, Differentiation…). Nhãn **không** quay lại công thức cầu. |
| V. Ba loại biến | Decision (sanitize whitelist – client không thể gửi quality/position/share), Environment (registry + Game Master), Derived (chỉ engine). Decision Dependency Engine kiểm tra hợp lệ phía “server”. |
| §8 Engine | Brand memory, channel coverage, product fit, utility, **stable multinomial logit + outside option**, phân bổ theo tồn kho có tái phân bổ khi hết hàng, landed cost (CIF), rủi ro sự kiện + bảo hiểm (không hồi tố), FX/hedge, khoản vay, **sổ kế toán kép** (mọi bút toán cân, BCĐKT luôn cân), thuế với chuyển lỗ, phá sản có xử lý. Thứ tự xử lý theo §8.2. Deterministic: cùng input + seed + engine version ⇒ cùng hash. |
| §6 Game Master | Chỉnh biến môi trường theo registry (có chặn min/max, version, audit), bật/tắt & cấu hình sự kiện, tạo sự kiện bằng DSL an toàn (SET/ADD/MULTIPLY/CAP/FLOOR, chỉ biến trong registry), trọng số điểm, chấm điểm học thuật tách khỏi điểm mô phỏng, kiểm tra tái lập vòng. |
| FR-LEARNING | Worksheet PESTEL/CAGE/entry justification theo từng nước; GM xem và chấm rubric. |
| §13 Test | `tests/acceptance.test.ts` (T-01…T-27) và `tests/montecarlo.test.ts` (bot × nhiều seed, kiểm tra bất biến). |

## Cấu trúc mã

```
src/engine/   # engine thuần TypeScript, không phụ thuộc UI – có thể chạy trên server/worker
  types.ts        mô hình dữ liệu (decision / environment / derived, kết quả)
  scenario.ts     kịch bản 4 thị trường (SỐ LIỆU GIẢ ĐỊNH phục vụ giảng dạy), entry-mode rules
  product.ts      Product & Cost Engine (BOM → thuộc tính, giá thành)
  market.ts       utility, softmax ổn định, phân bổ cầu theo tồn kho
  events.ts       variable registry + event DSL
  decisions.ts    mặc định, carry-forward, sanitize, validate (T-03/T-08/T-18…)
  ledger.ts       sổ kép, đóng sổ, lưu chuyển tiền tệ
  engine.ts       xử lý vòng (§8.2), định vị, chấm điểm, bất biến
  bots.ts         6 bot chiến lược
src/ui/       # React UI tiếng Anh (đăng nhập, sảnh, 12 trang đội, Game Master)
tests/        # acceptance + Monte Carlo
```

## Giới hạn của bản này

- Chạy hoàn toàn trên trình duyệt (hot-seat). Phần backend nhiều máy trong SRS (Supabase Auth/Postgres + RLS, Netlify Functions, API REST, ETag/409) **chưa** được dựng; engine đã tách riêng, thuần hàm và deterministic để chuyển sang worker phía server sau này.
- JV dùng **hợp nhất theo tỷ lệ** (proportional consolidation) – đã ghi rõ trong engine; royalty của licensing/franchising không tính doanh số của đối tác vào doanh thu.
- Mọi hệ số quốc gia, thuế suất, sở thích khách hàng là **giả định**, cần hiệu chỉnh và kiểm chứng trước khi dùng như dữ liệu thật.
