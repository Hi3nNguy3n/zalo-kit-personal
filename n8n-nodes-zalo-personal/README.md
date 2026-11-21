# n8n-nodes-zalo-personal

Community node package cho n8n, cho phép **nhận** và **gửi** tin nhắn Zalo cá nhân (riêng tư + nhóm) trực tiếp trong workflow n8n — mỗi nghiệp vụ là một node riêng.

Package này đi kèm với [`zalo_integration_kit`](../README.md). Hai node `Zalo Trigger`/`Zalo Send Message` **không** tự nói chuyện với Zalo — chúng gọi vào `zalo_bridge/bot.js` (Node.js, thư viện `zca-js`) đang chạy sẵn, giống cách `zalo_server.py` (bản Python) vẫn làm, chỉ khác là thay `zalo_server.py` bằng chính n8n. Riêng node `Zalo Login` gọi trực tiếp `zca-js` ngay trong n8n (không qua Bridge) chỉ để lấy session đăng nhập.

```
Zalo app (điện thoại)
      │ quét QR                     │ nhận/gửi tin
      ▼                             ▼
[Zalo Login] (chạy thủ công    zalo_bridge/bot.js   (vẫn giữ nguyên, không đổi)
 trong n8n, 1 lần, lấy             │  POST /incoming            ▲  POST /send
 cookie/imei/userAgent)            ▼                            │
      │                     ┌─────────────────────────────────────────────┐
      └── copy session ───▶ │                     n8n                      │
          vào zalo_session   │  [Zalo Trigger]  →  ... logic ...  →  [Zalo Send Message]  │
          .json cho bot.js   └─────────────────────────────────────────────┘
```

## 3 node trong package

### 1. `Zalo Trigger`
- Loại: **Trigger node** (dùng webhook nội bộ của n8n).
- Thay thế hoàn toàn endpoint `POST /incoming` của `zalo_server.py` cũ.
- Mỗi khi có tin nhắn Zalo mới được `bot.js` forward tới, workflow sẽ chạy với dữ liệu:
  ```json
  {
    "msgId": "...",
    "senderId": "...",
    "threadId": "...",
    "threadType": 0,
    "isGroup": false,
    "text": "nội dung tin nhắn"
  }
  ```
- Tuỳ chọn: **Chỉ nhận tin nhắn nhóm**, **Bỏ qua tin nhắn rỗng**.

### 2. `Zalo Send Message`
- Loại: **Action node** thường (đặt ở cuối workflow).
- Thay thế hoàn toàn hàm `reply_to_zalo()` / endpoint `POST /send` của `zalo_server.py` cũ.
- Input: `Thread ID`, `Thread Type` (User/Group), `Message`.
- Cần credential **Zalo Bridge API** (chỉ 1 field: `Bridge URL`, mặc định `http://localhost:8098`).

### 3. `Zalo Login`
- Loại: **Action node, chạy THỦ CÔNG** (bấm "Execute step" từng bước trong editor n8n) — **KHÔNG đặt vào workflow chạy tự động**.
- Gọi trực tiếp thư viện `zca-js` để thực hiện đăng nhập QR ngay trong n8n, không cần SSH vào máy chủ chạy `node login_qr.js` nữa.
- 2 Operation, chạy tuần tự bằng tay:
  1. **Generate QR (Bước 1)** — tạo mã QR mới, trả về **ảnh QR ngay trong output** (binary `data`, xem được trực tiếp trong panel kết quả của n8n). Mở ảnh, quét bằng app Zalo.
  2. **Complete Login (Bước 2)** — chạy lại node (đổi Operation) để kiểm tra: nếu đã quét & xác nhận xong, trả về `cookie` / `imei` / `userAgent` (session). Nếu chưa, trả về trạng thái hiện tại (đang chờ quét / đã quét chờ xác nhận / hết hạn / bị từ chối).
- Trạng thái đăng nhập được giữ **trong RAM của tiến trình n8n**, sống giữa 2 lần Execute step của node này, nhưng **mất khi n8n restart** — nếu n8n restart giữa lúc đang đăng nhập, phải chạy lại từ Bước 1.
- Sau khi có `cookie`/`imei`/`userAgent` ở Bước 2, copy 3 giá trị này vào file `zalo_bridge/zalo_session.json` (đúng format `{ "cookie": [...], "imei": "...", "userAgent": "..." }`) để `zalo_bridge/bot.js` dùng — node này **không tự ghi file**, vì n8n (đặc biệt khi chạy Docker) có thể không có quyền/đường dẫn tới đúng chỗ `bot.js` đang đọc.

## Cài đặt vào n8n

### Cách 1 — Community Nodes trong UI (khi đã publish lên npm)
Settings → Community Nodes → Install → nhập `n8n-nodes-zalo-personal`.

### Cách 2 — Cài local (chưa publish, dùng ngay từ source)
```bash
cd n8n-nodes-zalo-personal
npm install
npm run build

# Trong thư mục custom của n8n (mặc định ~/.n8n/custom):
mkdir -p ~/.n8n/custom && cd ~/.n8n/custom
npm install /đường/dẫn/tới/n8n-nodes-zalo-personal

# Khởi động lại n8n
```

## Thiết lập workflow

1. **Vẫn chạy như cũ, không đổi:**
   ```bash
   cd zalo_bridge
   node login_qr.js   # chỉ 1 lần, quét QR
   node bot.js         # chạy liên tục
   ```
2. Trong n8n, tạo workflow mới, thêm node **Zalo Trigger**.
3. Bấm **Active** workflow, mở node **Zalo Trigger**, copy **Production URL**.
4. Dán URL đó vào biến `ZALO_PYTHON_WEBHOOK_URL` trong `.env` của `zalo_bridge/`, khởi động lại `node bot.js`.
5. Thêm logic xử lý ở giữa (gọi AI Agent bằng node HTTP Request / node AI bất kỳ của n8n).
6. Thêm node **Zalo Send Message** ở cuối, cấu hình:
   - Credential **Zalo Bridge API** → Bridge URL = `http://localhost:8098` (hoặc địa chỉ thật nơi `bot.js` chạy).
   - `Thread ID` = `{{$json.threadId}}` (lấy từ Zalo Trigger).
   - `Thread Type` = `{{$json.threadType}}`.
   - `Message` = câu trả lời từ bước xử lý AI.

## Vì sao "Zalo Login" phải chạy thủ công, không tự động?

Đăng nhập QR cần **con người quét mã bằng điện thoại** — không có cách nào để một workflow chạy tự động (không người giám sát) tự quét QR được. Node `Zalo Login` vẫn cần bạn bấm "Execute step" bằng tay 2 lần (Generate QR, rồi Complete Login sau khi đã quét) — đây là điểm khác biệt duy nhất so với 2 node còn lại, không phải giới hạn của n8n mà là giới hạn vốn có của việc đăng nhập QR.

## Giới hạn / Lưu ý

- `zalo_bridge/bot.js` vẫn phải chạy liên tục (24/7) song song với n8n — package này không thay thế vai trò giữ phiên đăng nhập Zalo của nó.
- `zca-js` là thư viện Zalo cá nhân không chính thức — rủi ro bị Zalo giới hạn/khoá tài khoản nếu dùng sai mục đích. Chỉ dùng cho tài khoản bạn sở hữu.
- Nếu n8n chạy production với nhiều worker, Webhook của `Zalo Trigger` cần trỏ đúng vào instance đang lắng nghe webhook (main process hoặc webhook-specific process).
