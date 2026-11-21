import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { Zalo, LoginQRCallbackEventType } from 'zca-js';

/**
 * Node dùng để ĐĂNG NHẬP ZALO BẰNG QR, chạy THỦ CÔNG trong n8n (bấm
 * "Execute step" từng bước), KHÔNG phải để đặt vào một workflow tự động.
 *
 * Vì một lần "execute()" của n8n trả kết quả MỘT LẦN duy nhất, còn luồng
 * QR login có nhiều giai đoạn trải dài theo thời gian (sinh mã -> người
 * dùng quét -> xác nhận trên điện thoại), node này tách thành 2 Operation
 * chạy riêng từng bước, với trạng thái được giữ trong bộ nhớ của tiến
 * trình n8n (còn sống giữa các lần "Execute step" của CÙNG node này,
 * mất khi n8n restart):
 *
 *   1) "Generate QR"     -> sinh mã QR, trả ảnh QR ngay trong output.
 *   2) "Complete Login"  -> kiểm tra đã quét/xác nhận xong chưa, nếu xong
 *                            trả về cookie/imei/userAgent (session) để copy
 *                            sang zalo_bridge/zalo_session.json cho bot.js dùng.
 */

interface LoginSession {
	// SerializedCookie[] của zca-js - dữ liệu JSON thuần (mảng object), ép kiểu
	// any cho đơn giản vì chỉ truyền qua output của node, không xử lý gì thêm.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	cookie: any;
	imei: string;
	userAgent: string;
}

type LoginStatus =
	| 'idle'
	| 'qr_generated'
	| 'scanned'
	| 'expired'
	| 'declined'
	| 'logged_in'
	| 'error';

interface LoginState {
	status: LoginStatus;
	qrImageBase64?: string;
	displayName?: string;
	session?: LoginSession;
	errorMessage?: string;
}

// Trạng thái module-level: sống trong RAM của tiến trình n8n, chia sẻ giữa
// các lần "Execute step" khác nhau của node này (vì n8n là 1 process chạy
// liên tục, không phải serverless) - KHÔNG persist ra đĩa, mất khi n8n restart.
let state: LoginState = { status: 'idle' };
let loginInFlight = false;

function startLogin(userAgent: string): void {
	if (loginInFlight) return;
	loginInFlight = true;
	state = { status: 'idle' };

	const zalo = new Zalo();

	zalo
		.loginQR({ userAgent }, (event) => {
			switch (event.type) {
				case LoginQRCallbackEventType.QRCodeGenerated:
					state = { status: 'qr_generated', qrImageBase64: event.data.image };
					break;
				case LoginQRCallbackEventType.QRCodeScanned:
					state = {
						...state,
						status: 'scanned',
						displayName: event.data?.display_name,
					};
					break;
				case LoginQRCallbackEventType.QRCodeExpired:
					state = { status: 'expired' };
					break;
				case LoginQRCallbackEventType.QRCodeDeclined:
					state = { status: 'declined' };
					break;
				case LoginQRCallbackEventType.GotLoginInfo:
					state = {
						status: 'logged_in',
						session: {
							cookie: event.data.cookie,
							imei: event.data.imei,
							userAgent: event.data.userAgent,
						},
					};
					break;
			}
		})
		.catch((err: Error) => {
			state = { status: 'error', errorMessage: err.message };
		})
		.finally(() => {
			loginInFlight = false;
		});
}

const STATUS_HINT: Record<LoginStatus, string> = {
	idle: 'Chưa bắt đầu đăng nhập. Hãy chạy node với Operation = "Generate QR" trước.',
	qr_generated: 'Đã tạo mã QR, đang chờ bạn quét bằng app Zalo trên điện thoại.',
	scanned: 'Đã quét QR, đang chờ xác nhận đăng nhập trên điện thoại.',
	expired: 'Mã QR đã hết hạn. Hãy chạy lại Operation = "Generate QR" để tạo mã mới.',
	declined: 'Đăng nhập bị từ chối trên điện thoại. Hãy chạy lại Operation = "Generate QR".',
	logged_in: 'Đã đăng nhập thành công.',
	error: 'Có lỗi xảy ra, hãy chạy lại Operation = "Generate QR".',
};

export class ZaloLogin implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Zalo Login',
		name: 'zaloLogin',
		icon: 'file:../zalo.svg',
		group: ['input'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description:
			'Đăng nhập Zalo cá nhân bằng quét mã QR - CHẠY THỦ CÔNG (Execute step), không đặt vào workflow tự động',
		defaults: { name: 'Zalo Login' },
		inputs: ['main'],
		outputs: ['main'],
		properties: [
			{
				displayName:
					'Node này chỉ để ĐĂNG NHẬP MỘT LẦN, bấm "Execute step" thủ công từng bước, KHÔNG đặt vào workflow chạy tự động. Bước 1: chọn "Generate QR" → Execute step → quét ảnh QR trong kết quả bằng app Zalo. Bước 2: sau khi đã quét & xác nhận trên điện thoại, chọn "Complete Login" → Execute step → tạo 1 credential mới loại "Zalo API" (Credentials > New > Zalo API), copy 3 giá trị cookie/imei/userAgent trong kết quả dán vào đúng 3 field của credential đó. Các node khác (Message Trigger, Send Message, Group, User, Poll, Tag...) chọn credential này để dùng chung session.',
				name: 'notice',
				type: 'notice',
				default: '',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				options: [
					{
						name: 'Generate QR (Bước 1)',
						value: 'generate',
						description: 'Tạo mã QR mới để quét bằng điện thoại',
						action: 'Generate a new QR code to scan',
					},
					{
						name: 'Complete Login (Bước 2)',
						value: 'complete',
						description: 'Kiểm tra trạng thái và lấy session sau khi đã quét/xác nhận',
						action: 'Check status and retrieve the session after scanning',
					},
				],
				default: 'generate',
			},
			{
				displayName: 'User Agent',
				name: 'userAgent',
				type: 'string',
				default:
					'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
				description:
					'User-Agent sẽ được lưu kèm trong session - nên dùng đúng giá trị này khi copy session sang zalo_bridge (zca-js) để tránh bị Zalo nghi ngờ đổi thiết bị',
				displayOptions: { show: { operation: ['generate'] } },
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const operation = this.getNodeParameter('operation', 0) as string;

		if (operation === 'generate') {
			const userAgent = this.getNodeParameter('userAgent', 0) as string;
			startLogin(userAgent);

			// Chờ tối đa ~12s để lấy được ảnh QR đầu tiên (gọi API Zalo lấy mã QR)
			const deadline = Date.now() + 12000;
			while (!state.qrImageBase64 && state.status !== 'error' && Date.now() < deadline) {
				await new Promise((resolve) => setTimeout(resolve, 300));
			}

			if (!state.qrImageBase64) {
				return [
					[
						{
							json: {
								status: state.status,
								message: state.errorMessage ?? 'Không tạo được mã QR, hãy chạy lại node này.',
							},
						},
					],
				];
			}

			const binaryData = await this.helpers.prepareBinaryData(
				Buffer.from(state.qrImageBase64, 'base64'),
				'zalo-qr.png',
				'image/png',
			);

			return [
				[
					{
						json: {
							status: state.status,
							message:
								'Mở ảnh QR dưới đây, quét bằng app Zalo trên điện thoại, rồi chạy lại node này với Operation = "Complete Login".',
						},
						binary: { data: binaryData },
					},
				],
			];
		}

		// operation === 'complete'
		if (state.status === 'logged_in' && state.session) {
			return [
				[
					{
						json: {
							status: 'logged_in',
							// Xuất dạng chuỗi JSON sẵn để copy-paste thẳng vào field "Cookie (JSON)"
							// của credential "Zalo API" (field đó là kiểu string, không phải object).
							cookie: JSON.stringify(state.session.cookie),
							imei: state.session.imei,
							userAgent: state.session.userAgent,
							note: 'Tạo credential mới loại "Zalo API" trong n8n, dán 3 giá trị cookie/imei/userAgent ở trên vào đúng 3 field của credential đó.',
						},
					},
				],
			];
		}

		return [
			[
				{
					json: {
						status: state.status,
						message:
							STATUS_HINT[state.status] + (state.displayName ? ` (quét bởi: ${state.displayName})` : ''),
					},
				},
			],
		];
	}
}
