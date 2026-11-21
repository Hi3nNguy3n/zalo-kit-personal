import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { invokeZaloApi, splitList } from '../GenericFunctions';

export class ZaloGroup implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Zalo Group',
		name: 'zaloGroup',
		icon: 'file:../zalo.svg',
		group: ['output'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Quản lý nhóm Zalo (tạo nhóm, thêm/xoá thành viên, đổi tên...)',
		defaults: { name: 'Zalo Group' },
		inputs: ['main'],
		outputs: ['main'],
		credentials: [{ name: 'zaloApi', required: true }],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				options: [
					{ name: 'Create Group', value: 'create', action: 'Create a new group' },
					{ name: 'Get Group Info', value: 'getInfo', action: 'Get group info' },
					{ name: 'Add Member', value: 'addMember', action: 'Add a member to the group' },
					{ name: 'Remove Member', value: 'removeMember', action: 'Remove a member from the group' },
					{ name: 'Change Group Name', value: 'changeName', action: 'Change the group name' },
					{ name: 'Leave Group', value: 'leave', action: 'Leave the group' },
				],
				default: 'getInfo',
			},
			{
				displayName: 'Group Name',
				name: 'name',
				type: 'string',
				default: '',
				required: true,
				displayOptions: { show: { operation: ['create'] } },
			},
			{
				displayName: 'Member IDs',
				name: 'members',
				type: 'string',
				default: '',
				required: true,
				placeholder: 'uid1, uid2, uid3',
				description: 'Danh sách UID thành viên, phân tách bằng dấu phẩy',
				displayOptions: { show: { operation: ['create'] } },
			},
			{
				displayName: 'Group ID',
				name: 'groupId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: { show: { operation: ['getInfo', 'addMember', 'removeMember', 'changeName', 'leave'] } },
			},
			{
				displayName: 'Member ID(s)',
				name: 'memberId',
				type: 'string',
				default: '',
				required: true,
				placeholder: 'uid1, uid2',
				description: 'Một hoặc nhiều UID, phân tách bằng dấu phẩy',
				displayOptions: { show: { operation: ['addMember', 'removeMember'] } },
			},
			{
				displayName: 'New Group Name',
				name: 'newName',
				type: 'string',
				default: '',
				required: true,
				displayOptions: { show: { operation: ['changeName'] } },
			},
			{
				displayName: 'Silent (không thông báo)',
				name: 'silent',
				type: 'boolean',
				default: false,
				displayOptions: { show: { operation: ['leave'] } },
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
					const name = this.getNodeParameter('name', i) as string;
					const members = splitList(this.getNodeParameter('members', i) as string);
					result = await invokeZaloApi(this, 'createGroup', [{ name, members }]);
				} else if (operation === 'getInfo') {
					const groupId = this.getNodeParameter('groupId', i) as string;
					result = await invokeZaloApi(this, 'getGroupInfo', [groupId]);
				} else if (operation === 'addMember') {
					const groupId = this.getNodeParameter('groupId', i) as string;
					const memberId = splitList(this.getNodeParameter('memberId', i) as string);
					result = await invokeZaloApi(this, 'addUserToGroup', [memberId, groupId]);
				} else if (operation === 'removeMember') {
					const groupId = this.getNodeParameter('groupId', i) as string;
					const memberId = splitList(this.getNodeParameter('memberId', i) as string);
					result = await invokeZaloApi(this, 'removeUserFromGroup', [memberId, groupId]);
				} else if (operation === 'changeName') {
					const groupId = this.getNodeParameter('groupId', i) as string;
					const newName = this.getNodeParameter('newName', i) as string;
					result = await invokeZaloApi(this, 'changeGroupName', [newName, groupId]);
				} else if (operation === 'leave') {
					const groupId = this.getNodeParameter('groupId', i) as string;
					const silent = this.getNodeParameter('silent', i) as boolean;
					result = await invokeZaloApi(this, 'leaveGroup', [groupId, silent]);
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
