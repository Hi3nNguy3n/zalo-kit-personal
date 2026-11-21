import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { invokeZaloApi } from '../GenericFunctions';

/**
 * Action node: gửi một tin nhắn Zalo (riêng tư hoặc nhóm), gọi trực tiếp
 * zca-js (api.sendMessage) bằng session của credential "Zalo API" - không
 * qua bridge/HTTP nào, chạy ngay trong tiến trình n8n.
 */
export class ZaloSendMessage implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Zalo Send Message',
		name: 'zaloSendMessage',
		icon: 'file:../zalo.svg',
		group: ['output'],
		version: 1,
		subtitle: '={{$parameter["threadId"]}}',
		description: 'Gửi tin nhắn Zalo cá nhân (riêng tư hoặc nhóm)',
		defaults: {
			name: 'Zalo Send Message',
		},
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'zaloApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Thread ID',
				name: 'threadId',
				type: 'string',
				default: '',
				required: true,
				placeholder: 'UID người dùng hoặc ID nhóm Zalo',
				description: 'Người dùng hoặc nhóm Zalo cần gửi tin tới (thường lấy từ node Zalo Message Trigger phía trước: threadId)',
			},
			{
				displayName: 'Thread Type',
				name: 'threadType',
				type: 'options',
				options: [
					{ name: 'User (Riêng Tư)', value: 0 },
					{ name: 'Group (Nhóm)', value: 1 },
				],
				default: 0,
				description: 'Loại cuộc trò chuyện Zalo cần gửi tới',
			},
			{
				displayName: 'Message',
				name: 'message',
				type: 'string',
				typeOptions: { rows: 4 },
				default: '',
				required: true,
				description: 'Nội dung tin nhắn sẽ gửi lên Zalo',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			const threadId = this.getNodeParameter('threadId', i) as string;
			const threadType = this.getNodeParameter('threadType', i) as number;
			const message = this.getNodeParameter('message', i) as string;

			try {
				const result = await invokeZaloApi(this, 'sendMessage', [message, threadId, threadType]);

				returnData.push({
					json: { success: true, threadId, threadType, result },
					pairedItem: { item: i },
				});
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { success: false, error: (error as Error).message },
						pairedItem: { item: i },
					});
					continue;
				}
				throw error;
			}
		}

		return [returnData];
	}
}
