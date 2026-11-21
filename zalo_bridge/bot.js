// Tiến trình chạy liên tục: đăng nhập Zalo bằng session đã lưu (zalo_session.json),
// lắng nghe tin nhắn đến và forward sang backend Python, đồng thời mở cổng HTTP
// để Python gọi lại gửi tin nhắn trả lời cho người dùng Zalo.
//   node bot.js  (hoặc: npm start)
import { Zalo } from "zca-js";
import fs from "fs";
import path from "path";
import http from "http";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const SESSION_FILE = path.join(__dirname, "zalo_session.json");
const BRIDGE_PORT = Number(process.env.ZALO_BRIDGE_PORT || 8098);
const PYTHON_WEBHOOK_URL = process.env.ZALO_PYTHON_WEBHOOK_URL || "http://localhost:8087/incoming";

function loadSession() {
  if (!fs.existsSync(SESSION_FILE)) {
    console.error('❌ Chưa có session Zalo đã lưu. Hãy chạy "node login_qr.js" để quét QR đăng nhập trước.');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(SESSION_FILE, "utf-8"));
}

async function main() {
  const { cookie, imei, userAgent } = loadSession();
  const zalo = new Zalo();

  console.log("🚀 Đang đăng nhập Zalo bằng session đã lưu...");
  const api = await zalo.login({ cookie, imei, userAgent });
  console.log(`✅ Đăng nhập Zalo thành công!`);

  api.listener.on("message", async (message) => {
    try {
      if (message.isSelf) return; // Không tự trả lời tin nhắn của chính mình
      const isPlainText = typeof message.data.content === "string";
      if (!isPlainText) return;

      const payload = {
        msgId: message.data.msgId,
        senderId: message.data.uidFrom,
        threadId: message.threadId,
        threadType: message.type, // 0 = User (riêng tư), 1 = Group (nhóm)
        text: message.data.content,
      };

      const res = await fetch(PYTHON_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        console.error(`⚠️ Webhook Python phản hồi lỗi (status ${res.status}) cho msgId=${payload.msgId}`);
      }
    } catch (err) {
      console.error("❌ Lỗi khi forward tin nhắn Zalo sang Python:", err);
    }
  });

  api.listener.start();
  console.log("👂 Đang lắng nghe tin nhắn Zalo...");

  const server = http.createServer((req, res) => {
    if (req.method === "GET" && (req.url === "/" || req.url === "/status")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "online", service: "Zalo Bridge (zca-js)" }));
      return;
    }

    if (req.method === "POST" && req.url === "/send") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", async () => {
        try {
          const { threadId, threadType, msg } = JSON.parse(body || "{}");
          if (!threadId || !msg) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Thiếu threadId hoặc msg" }));
            return;
          }
          await api.sendMessage({ msg }, threadId, threadType ?? 0);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "success" }));
        } catch (err) {
          console.error("❌ Lỗi khi gửi tin nhắn Zalo:", err);
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
  });

  server.listen(BRIDGE_PORT, () => {
    console.log(`🌐 Zalo Bridge HTTP server đang chạy tại cổng ${BRIDGE_PORT} (nhận lệnh gửi tin từ Python)`);
  });
}

main().catch((err) => {
  console.error("❌ Lỗi khởi động Zalo Bridge:", err);
  process.exit(1);
});
