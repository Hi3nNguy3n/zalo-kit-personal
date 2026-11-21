import type {
	ITriggerFunctions,
	ITriggerResponse,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { getZaloApi, ensureListenerStarted, type ZaloApiCredential } from '../ZaloSession';

interface ZaloMessage {
	isSelf?: boolean;
	threadId?: string;
	type?: number; // 0 = User (riêng tư), 1 = Group (nhóm)
	data?: {
		msgId?: string;
		uidFrom?: string;
		content?: unknown;
	};
}

/**
 * Trigger node: kích hoạt workflow mỗi khi có tin nhắn Zalo mới. Đăng nhập
 * (hoặc dùng lại session đã cache) và lắng nghe NGAY TRONG tiến trình n8n khi
 * workflow được Active - không cần bridge/process ngoài nào cả.
 */
export class ZaloTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Zalo Message Trigger',
		name: 'zaloTrigger',
		icon: 'file:../zalo.svg',
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["groupOnly"] ? "Chỉ tin nhóm" : "Mọi tin nhắn"}}',
		description: 'Kích hoạt workflow khi có tin nhắn Zalo cá nhân mới',
		defaults: {
			name: 'Zalo Message Trigger',
		},
		inputs: [],
		outputs: ['main'],
		credentials: [{ name: 'zaloApi', required: true }],
		properties: [
			{
				displayName: 'Chỉ nhận tin nhắn nhóm',
				name: 'groupOnly',
				type: 'boolean',
				default: false,
				description:
					'Whether to ignore private (1-1) messages and only trigger the workflow for group messages',
			},
			{
				displayName: 'Bỏ qua tin nhắn rỗng',
				name: 'ignoreEmpty',
				type: 'boolean',
				default: true,
				description: 'Whether to ignore events whose text content is empty (non text messages)',
			},
		],
	};

	async trigger(this: ITriggerFunctions): Promise<ITriggerResponse> {
		const credential = (await this.getCredentials('zaloApi')) as unknown as ZaloApiCredential;
		const groupOnly = this.getNodeParameter('groupOnly') as boolean;
		const ignoreEmpty = this.getNodeParameter('ignoreEmpty') as boolean;

		const api = await getZaloApi(credential);

		const handler = (message: ZaloMessage) => {
			const isGroup = message.type === 1;
			const text = typeof message.data?.content === 'string' ? message.data.content : '';

			if (groupOnly && !isGroup) return;
			if (ignoreEmpty && !text) return;

			this.emit([
				[
					{
						json: {
							msgId: message.data?.msgId ?? null,
							senderId: message.data?.uidFrom ?? null,
							threadId: message.threadId ?? null,
							threadType: message.type ?? 0,
							isGroup,
							isSelf: message.isSelf ?? false,
							text,
						},
					},
				],
			]);
		};

		api.listener.on('message', handler);
		ensureListenerStarted(credential, api);

		async function closeFunction() {
			api.listener.off('message', handler);
		}

		return { closeFunction };
	}
}
