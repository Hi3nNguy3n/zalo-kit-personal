import { createHash } from 'crypto';
import { Zalo } from 'zca-js';

export interface ZaloApiCredential {
	cookie: string;
	imei: string;
	userAgent: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ZaloApiInstance = any;

/**
 * Cache session Zalo (đăng nhập xong = giữ nguyên api instance) theo TỪNG
 * credential, dùng chung cho mọi node (Trigger, Send Message, Group, User,
 * Poll, Tag) trong cùng 1 tiến trình n8n. Khoá cache dựa trên imei+userAgent
 * (duy nhất theo từng session đăng nhập), KHÔNG dùng 1 biến global duy nhất
 * - nhờ vậy nhiều credential (nhiều tài khoản Zalo / nhiều user n8n) có thể
 * đăng nhập và hoạt động song song, độc lập nhau.
 */
const sessionCache = new Map<string, Promise<ZaloApiInstance>>();
const listenerStartedKeys = new Set<string>();

function sessionKey(credential: ZaloApiCredential): string {
	return createHash('sha256').update(`${credential.imei}:${credential.userAgent}`).digest('hex');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseCookie(cookie: string): any {
	if (typeof cookie !== 'string' || cookie.trim() === '') {
		throw new Error('Credential "Zalo API" thiếu Cookie. Hãy chạy node Zalo Login (Complete Login) để lấy session.');
	}
	try {
		return JSON.parse(cookie);
	} catch {
		throw new Error('Cookie trong credential "Zalo API" không phải JSON hợp lệ. Copy nguyên văn giá trị "cookie" từ kết quả node Zalo Login.');
	}
}

/** Lấy (hoặc đăng nhập mới rồi cache lại) api instance ứng với 1 credential. */
export async function getZaloApi(credential: ZaloApiCredential): Promise<ZaloApiInstance> {
	const key = sessionKey(credential);
	let promise = sessionCache.get(key);

	if (!promise) {
		const cookie = parseCookie(credential.cookie);
		const zalo = new Zalo({ selfListen: true });
		promise = zalo.login({ cookie, imei: credential.imei, userAgent: credential.userAgent });
		// Nếu đăng nhập lỗi, xoá khỏi cache để lần gọi sau được thử lại (không bị kẹt lỗi cũ).
		promise.catch(() => sessionCache.delete(key));
		sessionCache.set(key, promise);
	}

	return promise;
}

/**
 * Đảm bảo listener của 1 session chỉ được .start() đúng 1 lần, dù có nhiều
 * Trigger node (Message Trigger + Friend Trigger) cùng dùng 1 credential và
 * cùng gắn handler vào api.listener của session đó.
 */
export function ensureListenerStarted(credential: ZaloApiCredential, api: ZaloApiInstance): void {
	const key = sessionKey(credential);
	if (listenerStartedKeys.has(key)) return;
	listenerStartedKeys.add(key);
	api.listener.start({ retryOnClose: true });
}
