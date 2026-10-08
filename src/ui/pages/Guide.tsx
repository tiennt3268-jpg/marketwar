import { Card } from '../components';

export default function Guide() {
  return (
    <div className="stack">
      <h1>Hướng dẫn chơi Market Wars</h1>
      <Card title="1. Mục tiêu">
        <p>Bạn điều hành một doanh nghiệp cà phê hòa tan Việt Nam (vốn $5M, nhà máy 300.000 hộp/quý, thương hiệu 20/100). Mọi đội xuất phát giống hệt nhau và cạnh tranh trực tiếp tại 🇨🇳 Trung Quốc, 🇯🇵 Nhật Bản, 🇺🇸 Hoa Kỳ, 🇬🇧 Anh. Điểm cuối cùng = Lợi nhuận luỹ kế 30% · Thị phần toàn cầu 25% · ROIC 20% · Thương hiệu 15% · Khả năng chống chịu 10%.</p>
        <p className="muted">Nguyên tắc cốt lõi: <b>bạn chọn hành động, không chọn kết quả.</b> Chất lượng, chất lượng cảm nhận, định vị (Premium/Value/Economy/Overpriced/Niche), thị phần, lợi nhuận đều do engine tính.</p>
      </Card>
      <div className="grid g2">
        <Card title="2. Một vòng (một quý) điển hình">
          <ol style={{ margin: 0, paddingLeft: 18 }}>
            <li><b>Thông tin thị trường</b>: đọc môi trường vĩ mô, mua nghiên cứu để biết khẩu vị phân khúc.</li>
            <li><b>Product Lab</b>: thiết kế công thức (robusta/arabica, rang, đường, kem, sấy, bao bì). Công thức mới có hiệu lực từ vòng sau.</li>
            <li><b>Chiến lược</b>: chọn nước, phương thức thâm nhập (xuất khẩu → licensing → JV → greenfield/mua lại), quy mô, đối tác.</li>
            <li><b>Marketing</b>: giá theo nội tệ, khuyến mãi, phân khúc mục tiêu, kênh quảng cáo, thông điệp, độ phủ phân phối, dịch vụ, nhân sự.</li>
            <li><b>Sản xuất & Logistics</b>: sản lượng, thuê ngoài, mở rộng công suất, gửi hàng (sea/air/multimodal, Incoterms, bảo hiểm), dán nhãn tuân thủ.</li>
            <li><b>Tài chính</b>: vay USD/VND, hedge tỷ giá, bảo hiểm rủi ro chính trị, cổ tức.</li>
            <li><b>Kiểm tra & Nộp</b>. Game Master xử lý vòng và công bố kết quả.</li>
          </ol>
        </Card>
        <Card title="3. Khách hàng chọn mua thế nào?">
          <p>Mỗi nước có 4 phân khúc (Budget, Mainstream, Premium, Health-conscious) với điểm lý tưởng về độ đậm, độ mượt, độ ngọt, hương thơm, tính lành mạnh và trọng số riêng cho giá, chất lượng, thương hiệu, bao bì, bền vững, tiện lợi, niềm tin.</p>
          <p>Engine tính <b>utility</b> cho từng SKU × phân khúc, rồi dùng <b>multinomial logit</b> có “outside option” (khách không mua). Nếu bạn hết hàng, một phần khách chuyển sang đối thủ, phần còn lại bỏ đi. Giá được quy đổi về hộp chuẩn 200 g.</p>
          <p className="muted small">Độ phủ phân phối thấp làm giảm mạnh khả năng khách tìm thấy sản phẩm (ln coverage trong utility).</p>
        </Card>
      </div>
      <div className="grid g2">
        <Card title="4. Mẹo chiến lược">
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>Vòng đầu: xuất khẩu gián tiếp vào được ngay nhưng mất 20% cho trung gian; xuất khẩu trực tiếp mất 1 vòng chuẩn bị.</li>
            <li>Đừng quên <b>gửi hàng</b> – không có tồn kho tại nước sở tại thì không bán được (trừ licensing/franchising, nơi đối tác tự sản xuất).</li>
            <li>Nhãn chưa bản địa hoá ⇒ hải quan dễ giữ hàng (đặc biệt Nhật, Anh, Mỹ).</li>
            <li>Hết hàng = mất khách và giảm hài lòng; tồn kho thừa tốn chi phí lưu kho 1,5%/quý.</li>
            <li>Thương hiệu tích luỹ chậm và hao mòn 10%/quý – quảng cáo đều đặn hiệu quả hơn dồn một lần.</li>
            <li>Trung Quốc có trần sở hữu nước ngoài 70% ⇒ không thể greenfield/mua lại 100%, chỉ JV.</li>
            <li>Kế hoạch vượt tiền mặt sẽ bị từ chối; nếu tiền âm cuối kỳ, bạn phải vay khẩn cấp lãi suất phạt.</li>
          </ul>
        </Card>
        <Card title="5. Tính công bằng & minh bạch">
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>Mọi đội có cùng trạng thái xuất phát (kiểm tra bằng hash).</li>
            <li>Kết quả xác định: cùng dữ liệu đầu vào + seed + phiên bản engine ⇒ cùng kết quả (Game Master có thể chạy lại để kiểm chứng).</li>
            <li>Sổ kế toán kép: mọi bút toán cân; bảng cân đối luôn cân; không có tiền âm “im lặng”.</li>
            <li>Không đội nào thấy quyết định của đội khác trước khi công bố; chỉ thấy kết quả thị trường sau vòng.</li>
            <li>Số liệu quốc gia là giả định phục vụ giảng dạy, không phải thống kê hay luật hiện hành.</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
