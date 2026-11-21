# Zalo Integration Kit (độc lập, dùng để nối vào bất kỳ Agent nào)

Bộ công cụ cho phép một Agent (Python) tự động trả lời tin nhắn Zalo cá nhân
(riêng tư + nhóm), đăng nhập bằng cách **quét mã QR** (không cần copy cookie tay).

Vì Zalo không có API bot chính thức cho tài khoản cá nhân, hệ thống gồm 2 tiến
trình chạy song song:

```
Zalo app (điện thoại) ⇄ zalo_bridge/bot.js (Node.js, lib zca-js, giữ kết nối Zalo Web)
                              │  HTTP nội bộ
                              ▼
                        zalo_server.py (Python, aiohttp)
                              │
                              ▼
                     Agent của bạn (thay vào ở đầu file zalo_server.py)
```

## Cấu trúc
```
zalo_integration_kit/
├── zalo_bridge/
│   ├── package.json
│   ├── login_qr.js      # Chạy 1 lần để quét QR đăng nhập
│   └── bot.js            # Chạy liên tục: lắng nghe + gửi tin Zalo thật
├── zalo_server.py        # Server Python, nối Zalo vào Agent của bạn
├── .env.example
└── .gitignore
```

## 1. Cài đặt Zalo Bridge (Node.js ≥ 18)
```bash
cd zalo_bridge
npm install
```

## 2. Đăng nhập Zalo bằng quét mã QR (chỉ cần làm 1 lần)
```bash
node login_qr.js
```
- Mở file ảnh `zalo_bridge/zalo_qr.png` vừa được tạo ra.
- Trên điện thoại: mở app Zalo → biểu tượng QR góc trên bên phải → **Quét mã QR** → quét ảnh đó.
- Sau khi xác nhận trên điện thoại, cookie/imei/userAgent được lưu tự động vào
  `zalo_bridge/zalo_session.json`. **Không commit file này** (đã có trong `.gitignore`)
  vì nó tương đương quyền đăng nhập tài khoản Zalo của bạn.
- Mã QR hết hạn → tool tự tạo mã mới. Bị từ chối trên điện thoại → chạy lại `node login_qr.js`.

## 3. Chạy Zalo Bridge (giữ kết nối + lắng nghe tin nhắn)
```bash
node bot.js
# hoặc: npm start
```
Tiến trình này phải chạy liên tục. Khi có tin nhắn Zalo mới, nó forward sang
`zalo_server.py` (qua biến `ZALO_PYTHON_WEBHOOK_URL`).

## 4. Nối vào Agent của bạn (`zalo_server.py`)
Mở `zalo_server.py`, phần đầu file có khối:
```python
try:
    from agent_core import process_agent_message
    import chat_history_manager as chm
    _HAS_REAL_AGENT = True
except ImportError:
    _HAS_REAL_AGENT = False
    def process_agent_message(text: str, session_id: str) -> str:
        return f"[DEMO - chưa nối agent] Bạn vừa nói: {text}"
```
Thay 2 import đó bằng agent thật của bạn, miễn đáp ứng đúng 1 interface:

```python
def process_agent_message(text: str, session_id: str) -> str:
    """text: nội dung người dùng gửi qua Zalo.
    session_id: định danh hội thoại (vd: "zalo_<uid>" cho chat riêng,
                "zalo_group_<thread_id>" cho nhóm).
    return: câu trả lời (str) để gửi ngược lại Zalo."""
    ...
```

Nếu agent của bạn không cần quản lý session riêng, có thể bỏ qua/xoá hàm
`ensure_session(...)` — nó chỉ là optional hook, không bắt buộc.

Nếu **chưa kịp nối agent**, cứ chạy thẳng `zalo_server.py` — nó tự dùng bot
echo demo để bạn test luồng QR login + nhận/gửi tin trước.

## 5. Chạy Zalo Server (Python)
```bash
pip install aiohttp python-dotenv   # nếu agent của bạn chưa có 2 package này
cp .env.example .env
python zalo_server.py
```
Server nhận tin nhắn forward từ Bridge, gọi `process_agent_message` lấy câu
trả lời, rồi gọi lại Bridge (`ZALO_BRIDGE_URL`) để gửi trả lời thật trên Zalo.

## 6. Biến môi trường (`.env`)
| Biến | Ý nghĩa | Mặc định |
|---|---|---|
| `ZALO_SERVER_HOST` / `ZALO_SERVER_PORT` | Địa chỉ server Python lắng nghe | `0.0.0.0` / `8087` |
| `ZALO_BRIDGE_PORT` | Cổng HTTP của Bridge Node.js | `8098` |
| `ZALO_BRIDGE_URL` | Python gọi sang Bridge để gửi tin | `http://localhost:8098` |
| `ZALO_PYTHON_WEBHOOK_URL` | Bridge gọi sang Python khi có tin nhắn mới | `http://localhost:8087/incoming` |

File `.env` cần đặt ở cùng thư mục với `zalo_server.py` **và** được `bot.js`
đọc qua đường dẫn tương đối `../env` — nếu bạn đổi cấu trúc thư mục, sửa dòng
`dotenv.config({ path: ... })` ở đầu `zalo_bridge/bot.js` cho khớp.

## 7. Endpoint có sẵn trong `zalo_server.py`
- `GET /` , `GET /status` — kiểm tra server còn sống.
- `POST /incoming` — Bridge gọi vào đây khi có tin nhắn Zalo mới (không cần tự gọi tay).
- `POST /send` — gọi endpoint này để **chủ động** gửi tin nhắn Zalo từ nơi khác:
  ```json
  { "thread_id": "<uid hoặc group id>", "thread_type": 0, "text": "Nội dung" }
  ```
  (`thread_type`: `0` = tin riêng, `1` = tin nhóm)

## Lưu ý quan trọng
- `zca-js` là thư viện Zalo cá nhân **không chính thức**, có rủi ro bị Zalo giới
  hạn/khoá tài khoản nếu dùng sai mục đích (spam, gửi hàng loạt, bot hoá quá mức...).
  Chỉ dùng cho tài khoản bạn sở hữu và với mục đích hỗ trợ trả lời hợp lý.
- `zalo_bridge/zalo_session.json` chứa cookie đăng nhập — bảo mật như mật khẩu,
  không chia sẻ, không commit lên Git.
