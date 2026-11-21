import type { ICredentialType, INodeProperties } from 'n8n-workflow';

/**
 * Credential lưu session đăng nhập Zalo cá nhân (cookie/imei/userAgent) - lấy
 * từ node "Zalo Login" (Operation: Complete Login). Mỗi tài khoản Zalo (hoặc
 * mỗi user n8n) tạo một credential riêng của loại này -> dùng được nhiều tài
 * khoản Zalo song song, mỗi node chọn credential tương ứng với tài khoản cần dùng.
 */
export class ZaloApi implements ICredentialType {
	name = 'zaloApi';

	displayName = 'Zalo API';

	documentationUrl = '';

	properties: INodeProperties[] = [
		{
			displayName: 'Cookie (JSON)',
			name: 'cookie',
			type: 'string',
			typeOptions: { password: true, rows: 4 },
			default: '',
			description:
				'Giá trị "cookie" lấy từ kết quả Operation "Complete Login" của node Zalo Login (dạng JSON array, copy nguyên văn)',
		},
		{
			displayName: 'IMEI',
			name: 'imei',
			type: 'string',
			default: '',
			description: 'Giá trị "imei" lấy từ kết quả Operation "Complete Login" của node Zalo Login',
		},
		{
			displayName: 'User Agent',
			name: 'userAgent',
			type: 'string',
			default: '',
			description: 'Giá trị "userAgent" lấy từ kết quả Operation "Complete Login" của node Zalo Login',
		},
	];
}
