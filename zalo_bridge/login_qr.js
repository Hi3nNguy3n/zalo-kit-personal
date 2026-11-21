// Chạy MỘT LẦN để đăng nhập Zalo bằng cách quét mã QR:
//   node login_qr.js
// Sau khi quét thành công, thông tin đăng nhập (cookie/imei/userAgent) sẽ được
// lưu vào file zalo_session.json để bot.js tái sử dụng mà không cần quét lại.
import { Zalo, LoginQRCallbackEventType } from "zca-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SESSION_FILE = path.join(__dirname, "zalo_session.json");
const QR_FILE = path.join(__dirname, "zalo_qr.png");

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

async function main() {
  const zalo = new Zalo();

  console.log("🔐 Đang khởi tạo mã QR đăng nhập Zalo...");

  await zalo.loginQR({ userAgent: USER_AGENT, qrPath: QR_FILE }, (event) => {
    switch (event.type) {
      case LoginQRCallbackEventType.QRCodeGenerated:
        event.actions.saveToFile(QR_FILE);
        console.log("✅ Đã tạo mã QR!");
        console.log(`👉 Mở ảnh sau và quét bằng app Zalo trên điện thoại: ${QR_FILE}`);
        console.log("   (Zalo app > biểu tượng QR góc trên > Quét mã QR)");
        break;

      case LoginQRCallbackEventType.QRCodeExpired:
        console.log("⌛ Mã QR đã hết hạn, đang tạo mã mới...");
        event.actions.retry();
        break;

      case LoginQRCallbackEventType.QRCodeScanned:
        console.log(`📱 Đã quét bởi: ${event.data?.display_name || "???"}. Vui lòng xác nhận đăng nhập trên điện thoại...`);
        break;

      case LoginQRCallbackEventType.QRCodeDeclined:
        console.log("❌ Đăng nhập đã bị từ chối trên điện thoại. Hãy chạy lại lệnh này để thử lại.");
        break;

      case LoginQRCallbackEventType.GotLoginInfo: {
        const { cookie, imei, userAgent } = event.data;
        fs.writeFileSync(
          SESSION_FILE,
          JSON.stringify({ cookie, imei, userAgent }, null, 2),
          "utf-8"
        );
        console.log(`💾 Đã lưu session đăng nhập vào: ${SESSION_FILE}`);
        break;
      }
    }
  });

  console.log("🎉 Đăng nhập Zalo thành công! Giờ bạn có thể chạy: npm start (hoặc node bot.js)");
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Lỗi khi đăng nhập Zalo bằng QR:", err);
  process.exit(1);
});
