import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { invokeZaloApi, splitList } from '../GenericFunctions';

export class ZaloPoll implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Zalo Poll',
		name: 'zaloPoll',
		icon: 'file:../zalo.svg',
		group: ['output'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Tạo bình chọn (poll), vote, xem chi tiết, khoá poll trong nhóm Zalo',
		defaults: { name: 'Zalo Poll' },
		inputs: ['main'],
		outputs: ['main'],
		credentials: [{ name: 'zaloApi', required: true }],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				options: [
					{ name: 'Create Poll', value: 'create', action: 'Create a poll in a group' },
					{ name: 'Vote', value: 'vote', action: 'Vote on a poll' },
					{ name: 'Get Poll Detail', value: 'getDetail', action: 'Get poll detail' },
					{ name: 'Lock Poll', value: 'lock', action: 'Lock a poll' },
				],
				default: 'create',
			},
			{
				displayName: 'Group ID',
				name: 'groupId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: { show: { operation: ['create'] } },
			},
			{
				displayName: 'Question',
				name: 'question',
				type: 'string',
				default: '',
				required: true,
				displayOptions: { show: { operation: ['create'] } },
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'string',
				default: '',
				required: true,
				placeholder: 'Lựa chọn A, Lựa chọn B, Lựa chọn C',
				description: 'Danh sách lựa chọn, phân tách bằng dấu phẩy',
				displayOptions: { show: { operation: ['create'] } },
			},
			{
				displayName: 'Allow Multiple Choices',
				name: 'allowMultiChoices',
				type: 'boolean',
				default: false,
				displayOptions: { show: { operation: ['create'] } },
			},
			{
				displayName: 'Anonymous',
				name: 'isAnonymous',
				type: 'boolean',
				default: false,
				displayOptions: { show: { operation: ['create'] } },
			},
			{
				displayName: 'Poll ID',
				name: 'pollId',
				type: 'number',
				default: 0,
				required: true,
				displayOptions: { show: { operation: ['vote', 'getDetail', 'lock'] } },
			},
			{
				displayName: 'Option ID(s)',
				name: 'optionId',
				type: 'string',
				default: '',
				required: true,
				placeholder: '1, 2',
				description: 'Một hoặc nhiều option ID, phân tách bằng dấu phẩy',
				displayOptions: { show: { operation: ['vote'] } },
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

				if (operation === 'create') {
					const groupId = this.getNodeParameter('groupId', i) as string;
					const question = this.getNodeParameter('question', i) as string;
					const options = splitList(this.getNodeParameter('options', i) as unknown as string);
					const allowMultiChoices = this.getNodeParameter('allowMultiChoices', i) as boolean;
					const isAnonymous = this.getNodeParameter('isAnonymous', i) as boolean;
					result = await invokeZaloApi(this, 'createPoll', [
						{ question, options, allowMultiChoices, isAnonymous },
						groupId,
					]);
				} else if (operation === 'vote') {
					const pollId = this.getNodeParameter('pollId', i) as number;
					const optionIdList = splitList(this.getNodeParameter('optionId', i) as string).map(Number);
					const optionId = optionIdList.length === 1 ? optionIdList[0] : optionIdList;
					result = await invokeZaloApi(this, 'votePoll', [pollId, optionId]);
				} else if (operation === 'getDetail') {
					const pollId = this.getNodeParameter('pollId', i) as number;
					result = await invokeZaloApi(this, 'getPollDetail', [pollId]);
				} else if (operation === 'lock') {
					const pollId = this.getNodeParameter('pollId', i) as number;
					result = await invokeZaloApi(this, 'lockPoll', [pollId]);
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
