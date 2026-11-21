import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { invokeZaloApi } from '../GenericFunctions';

export class ZaloTag implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Zalo Tag',
		name: 'zaloTag',
		icon: 'file:../zalo.svg',
		group: ['output'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Quản lý nhãn (label/tag) phân loại hội thoại Zalo',
		defaults: { name: 'Zalo Tag' },
		inputs: ['main'],
		outputs: ['main'],
		credentials: [{ name: 'zaloApi', required: true }],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				options: [
					{ name: 'Get Labels', value: 'getLabels', action: 'Get all labels' },
					{ name: 'Update Labels', value: 'updateLabels', action: 'Update labels' },
				],
				default: 'getLabels',
			},
			{
				displayName: 'Version',
				name: 'version',
				type: 'number',
				default: 0,
				required: true,
				description: 'Lấy từ kết quả của "Get Labels" (tránh ghi đè chồng chéo nếu nhãn đã bị đổi ở nơi khác)',
				displayOptions: { show: { operation: ['updateLabels'] } },
			},
			{
				displayName: 'Label Data (JSON)',
				name: 'labelData',
				type: 'json',
				default: '[]',
				required: true,
				description: 'Mảng label data lấy từ kết quả "Get Labels", đã sửa đổi (thêm/xoá/đổi tên nhãn)',
				displayOptions: { show: { operation: ['updateLabels'] } },
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

				if (operation === 'getLabels') {
					result = await invokeZaloApi(this, 'getLabels', []);
				} else if (operation === 'updateLabels') {
					const version = this.getNodeParameter('version', i) as number;
					const labelDataRaw = this.getNodeParameter('labelData', i) as string | object;
					const labelData = typeof labelDataRaw === 'string' ? JSON.parse(labelDataRaw) : labelDataRaw;
					result = await invokeZaloApi(this, 'updateLabels', [{ labelData, version }]);
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
