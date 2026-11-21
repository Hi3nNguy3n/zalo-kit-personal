import type { IExecuteFunctions } from 'n8n-workflow';
import { getZaloApi, type ZaloApiCredential } from './ZaloSession';

/**
 * Gọi trực tiếp 1 method của api zca-js (đăng nhập bằng credential "Zalo API"
 * của node), dùng cho các node thao tác (Zalo Group / Zalo User / Zalo Poll /
 * Zalo Tag / Zalo Send Message). Không qua bridge/HTTP nào cả - chạy ngay
 * trong tiến trình n8n.
 */
export async function invokeZaloApi(
	ctx: IExecuteFunctions,
	method: string,
	args: unknown[],
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
	const credential = (await ctx.getCredentials('zaloApi')) as unknown as ZaloApiCredential;
	const api = await getZaloApi(credential);

	if (typeof api[method] !== 'function') {
		throw new Error(`Method không tồn tại trên API Zalo: ${method}`);
	}

	return api[method](...args);
}

/** Tách chuỗi "a, b, c" thành mảng ["a","b","c"], bỏ khoảng trắng và phần tử rỗng. */
export function splitList(value: string): string[] {
	return value
		.split(',')
		.map((v) => v.trim())
		.filter((v) => v.length > 0);
}
