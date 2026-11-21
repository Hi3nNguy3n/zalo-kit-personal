import os
import json
import logging
import asyncio
import threading
from collections import OrderedDict

from aiohttp import web, ClientSession, ClientTimeout
from dotenv import load_dotenv

# ============================================================================
# ĐIỂM TÍCH HỢP VỚI AGENT CỦA BẠN
# ----------------------------------------------------------------------------
# Thay 2 dòng import dưới đây bằng agent/hệ thống lưu lịch sử chat của bạn.
# Yêu cầu duy nhất: hàm process_agent_message(text, session_id) -> str
#   - text: nội dung tin nhắn người dùng gửi qua Zalo
#   - session_id: chuỗi định danh hội thoại (đã được tạo sẵn ở hàm ensure_session)
#   - trả về: chuỗi câu trả lời để gửi ngược lại Zalo
# Nếu chưa có agent thật, file này vẫn chạy được với một bot echo đơn giản
# (fallback bên dưới) để bạn test nhanh luồng QR login + nhận/gửi tin Zalo.
# ============================================================================
try:
    from agent_core import process_agent_message  # noqa: F401  (thay bằng agent của bạn)
    import chat_history_manager as chm  # noqa: F401  (thay bằng hệ thống lưu session của bạn)
    _HAS_REAL_AGENT = True
except ImportError:
    _HAS_REAL_AGENT = False

    def process_agent_message(text: str, session_id: str) -> str:
        """Fallback echo - THAY BẰNG LỜI GỌI AGENT THẬT CỦA BẠN."""
        return f"[DEMO - chưa nối agent] Bạn vừa nói: {text}"

# Nạp cấu hình từ .env
load_dotenv()

# Cấu hình logging
logging.basicConfig(
    format="%(asctime)s - [%(name)s] - %(levelname)s - %(message)s",
    level=logging.INFO
)
logger = logging.getLogger("ZaloServer")

# Đọc cấu hình từ biến môi trường (không ghi cứng trong mã nguồn)
SERVER_PORT = int(os.getenv("ZALO_SERVER_PORT", "8087"))
SERVER_HOST = os.getenv("ZALO_SERVER_HOST", "0.0.0.0")
# Địa chỉ của Zalo Bridge (Node.js - zalo_bridge/bot.js), nơi thực sự gửi tin nhắn Zalo
ZALO_BRIDGE_URL = os.getenv("ZALO_BRIDGE_URL", "http://localhost:8098")

# Chống xử lý trùng tin nhắn (Zalo redeliver khi mất mạng, bridge restart...)
_PROCESSED_MSG_IDS = OrderedDict()
_PROCESSED_MSG_IDS_LOCK = threading.Lock()
_PROCESSED_MSG_IDS_MAX = 4000


def is_duplicate_message(msg_id):
    """Trả về True nếu msg_id đã được xử lý trước đó."""
    if not msg_id:
        return False
    with _PROCESSED_MSG_IDS_LOCK:
        if msg_id in _PROCESSED_MSG_IDS:
            return True
        _PROCESSED_MSG_IDS[msg_id] = True
        if len(_PROCESSED_MSG_IDS) > _PROCESSED_MSG_IDS_MAX:
            _PROCESSED_MSG_IDS.popitem(last=False)
        return False


def ensure_session(session_id: str, title: str):
    """Đảm bảo session tồn tại trong hệ thống quản lý lịch sử (nếu agent của bạn có khái niệm session).
    Nếu agent của bạn không cần bước này, có thể xoá/bỏ qua hàm này an toàn."""
    if not _HAS_REAL_AGENT:
        return
    sessions = chm.get_all_sessions()
    if any(s["id"] == session_id for s in sessions):
        return
    chm.create_new_session(title=title)
    sessions = chm.get_all_sessions()
    for s in sessions:
        if s.get("title") == title and s["id"] != session_id:
            s["id"] = session_id
            break
    with open(chm.SESSIONS_INDEX_FILE, "w", encoding="utf-8") as f:
        json.dump(sessions, f, ensure_ascii=False, indent=2)


async def reply_to_zalo(thread_id: str, thread_type: int, text: str):
    """Gọi sang Zalo Bridge (Node.js) để thực sự gửi tin nhắn trả lời trên Zalo."""
    try:
        async with ClientSession(timeout=ClientTimeout(total=10)) as session:
            async with session.post(
                f"{ZALO_BRIDGE_URL}/send",
                json={"threadId": thread_id, "threadType": thread_type, "msg": text},
            ) as resp:
                if resp.status != 200:
                    body = await resp.text()
                    logger.error(f"❌ Zalo Bridge trả về lỗi {resp.status} khi gửi tới {thread_id}: {body}")
    except Exception as e:
        logger.error(f"❌ Không gửi được tin nhắn Zalo tới {thread_id}: {e}")


async def handle_incoming(request: web.Request):
    """Nhận tin nhắn Zalo được forward từ Zalo Bridge (Node.js - zalo_bridge/bot.js)."""
    try:
        data = await request.json()
    except Exception:
        return web.json_response({"error": "invalid json"}, status=400)

    msg_id = data.get("msgId")
    sender_id = data.get("senderId")
    thread_id = data.get("threadId")
    thread_type = data.get("threadType", 0)  # 0 = User (riêng tư), 1 = Group (nhóm)
    text = (data.get("text") or "").strip()

    if not text or not thread_id:
        return web.json_response({"status": "ignored"})

    if is_duplicate_message(msg_id):
        logger.warning(f"⚠️ Bỏ qua tin nhắn Zalo trùng lặp (msgId={msg_id})")
        return web.json_response({"status": "duplicate"})

    is_group = thread_type == 1
    session_id = f"zalo_group_{thread_id}" if is_group else f"zalo_{sender_id or thread_id}"
    title = f"Zalo Nhóm: {thread_id}" if is_group else f"Zalo: {sender_id}"
    ensure_session(session_id, title)

    logger.info(f"📩 [Zalo {'nhóm' if is_group else 'riêng tư'}] {sender_id}@{thread_id}: {text}")

    # Chuyển câu hỏi cho Agent xử lý (chạy trong executor vì process_agent_message là hàm đồng bộ)
    loop = asyncio.get_running_loop()
    reply_text = await loop.run_in_executor(None, process_agent_message, text, session_id)

    logger.info(f"[Đã phản hồi Zalo cho {thread_id}]: {reply_text[:120]}...")
    await reply_to_zalo(thread_id, thread_type, reply_text)

    return web.json_response({"status": "ok"})


async def http_status_handler(request):
    """Endpoint HTTP kiểm tra tình trạng hoạt động của Server."""
    return web.json_response({
        "status": "online",
        "service": "Zalo Bot Agent Server",
        "port": SERVER_PORT,
        "bridge_url": ZALO_BRIDGE_URL,
        "message": "Chương trình đang lắng nghe và sẵn sàng xử lý tin nhắn forward từ Zalo Bridge."
    })


async def http_send_message_handler(request):
    """Endpoint HTTP cho phép các dịch vụ khác gửi tin nhắn chủ động tới người dùng/nhóm qua Zalo."""
    try:
        data = await request.json()
        thread_id = data.get("thread_id")
        thread_type = data.get("thread_type", 0)
        text = data.get("text")
        if not thread_id or not text:
            return web.json_response({"error": "Thiếu thread_id hoặc text"}, status=400)

        await reply_to_zalo(thread_id, thread_type, text)
        return web.json_response({"status": "success", "sent_to": thread_id})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


async def main():
    logger.info(f"Đang khởi động Zalo Bot Agent Server trên cổng {SERVER_PORT}...")
    logger.info(f"Zalo Bridge (Node.js) được cấu hình tại: {ZALO_BRIDGE_URL}")

    http_app = web.Application()
    http_app.router.add_get("/", http_status_handler)
    http_app.router.add_get("/status", http_status_handler)
    http_app.router.add_post("/incoming", handle_incoming)
    http_app.router.add_post("/send", http_send_message_handler)

    runner = web.AppRunner(http_app)
    await runner.setup()
    site = web.TCPSite(runner, SERVER_HOST, SERVER_PORT)
    await site.start()
    logger.info(f"🚀 HTTP Server đang lắng nghe cố định tại: http://{SERVER_HOST}:{SERVER_PORT}")
    logger.info("✅ Zalo Bot Agent Server đã sẵn sàng nhận tin nhắn!")

    try:
        while True:
            await asyncio.sleep(3600)
    except (KeyboardInterrupt, SystemExit):
        logger.info("Đang dừng server...")
    finally:
        await runner.cleanup()
        logger.info("Server đã tắt an toàn.")


if __name__ == "__main__":
    asyncio.run(main())
