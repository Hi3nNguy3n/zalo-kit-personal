import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { invokeZaloApi, splitList } from '../GenericFunctions';

export class ZaloUser implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Zalo User',
		name: 'zaloUser',
		icon: 'file:../zalo.svg',
		group: ['output'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Tìm kiếm, tra cứu, chặn/bỏ chặn người dùng Zalo',
		defaults: { name: 'Zalo User' },
		inputs: ['main'],
		outputs: ['main'],
		credentials: [{ name: 'zaloApi', required: true }],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				options: [
					{ name: 'Find User by Phone', value: 'find', action: 'Find a user by phone number' },
					{ name: 'Get User Info', value: 'getInfo', action: 'Get user info' },
					{ name: 'Block User', value: 'block', action: 'Block a user' },
					{ name: 'Unblock User', value: 'unblock', action: 'Unblock a user' },
				],
				default: 'getInfo',
			},
			{
				displayName: 'Phone Number',
				name: 'phoneNumber',
				type: 'string',
				default: '',
				required: true,
				placeholder: '84901234567',
				displayOptions: { show: { operation: ['find'] } },
			},
			{
				displayName: 'User ID(s)',
				name: 'userId',
				type: 'string',
				default: '',
				required: true,
				placeholder: 'uid1, uid2',
				description: 'Một hoặc nhiều UID, phân tách bằng dấu phẩy (Get User Info chấp nhận nhiều UID)',
				displayOptions: { show: { operation: ['getInfo', 'block', 'unblock'] } },
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const operation = this.getNodeParameter('operation', 0) as string;

		for (let i = 0; i < items.length; i++) {
			try {
				let result: any; // eslint-disable-line @typescript-eslint/no-explicit-any

				if (operation === 'find') {
					const phoneNumber = this.getNodeParameter('phoneNumber', i) as string;
					result = await invokeZaloApi(this, 'findUser', [phoneNumber]);
				} else if (operation === 'getInfo') {
					const userIdList = splitList(this.getNodeParameter('userId', i) as string);
					const userId = userIdList.length === 1 ? userIdList[0] : userIdList;
					result = await invokeZaloApi(this, 'getUserInfo', [userId]);
				} else if (operation === 'block') {
					const userId = this.getNodeParameter('userId', i) as string;
					result = await invokeZaloApi(this, 'blockUser', [userId]);
				} else if (operation === 'unblock') {
					const userId = this.getNodeParameter('userId', i) as string;
					result = await invokeZaloApi(this, 'unblockUser', [userId]);
				}

				returnData.push({ json: { success: true, operation, result }, pairedItem: { item: i } });
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
