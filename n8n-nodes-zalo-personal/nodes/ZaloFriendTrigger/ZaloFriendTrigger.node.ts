import type {
	ITriggerFunctions,
	ITriggerResponse,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { getZaloApi, ensureListenerStarted, type ZaloApiCredential } from '../ZaloSession';

interface ZaloFriendEvent {
	type?: number;
	data?: unknown;
	threadId?: string;
	isSelf?: boolean;
}

const FRIEND_EVENT_TYPE_NAMES: Record<number, string> = {
	0: 'ADD',
	1: 'REMOVE',
	2: 'REQUEST',
	3: 'UNDO_REQUEST',
	4: 'REJECT_REQUEST',
	5: 'SEEN_FRIEND_REQUEST',
	6: 'BLOCK',
	7: 'UNBLOCK',
	8: 'BLOCK_CALL',
	9: 'UNBLOCK_CALL',
	10: 'PIN_UNPIN',
	11: 'PIN_CREATE',
	12: 'UNKNOWN',
};

/**
 * Trigger node: kích hoạt workflow khi có sự kiện liên quan đến bạn bè Zalo
 * (lời mời kết bạn, được chấp nhận, bị huỷ kết bạn, bị chặn...). Dùng chung
 * session (api) với node Zalo Message Trigger nếu cùng 1 credential - chỉ
 * đăng nhập 1 lần, gắn thêm handler vào listener đã có.
 */
export class ZaloFriendTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Zalo Friend Trigger',
		name: 'zaloFriendTrigger',
		icon: 'file:../zalo.svg',
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["eventType"]}}',
		description: 'Kích hoạt workflow khi có sự kiện bạn bè Zalo (lời mời kết bạn, chấp nhận, chặn...)',
		defaults: { name: 'Zalo Friend Trigger' },
		inputs: [],
		outputs: ['main'],
		credentials: [{ name: 'zaloApi', required: true }],
		properties: [
			{
				displayName: 'Event Type',
				name: 'eventType',
				type: 'options',
				options: [
					{ name: 'Tất cả', value: 'all' },
					{ name: 'Lời mời kết bạn (REQUEST)', value: '2' },
					{ name: 'Đồng ý kết bạn (ADD)', value: '0' },
					{ name: 'Huỷ kết bạn (REMOVE)', value: '1' },
					{ name: 'Huỷ lời mời (UNDO_REQUEST)', value: '3' },
					{ name: 'Từ chối lời mời (REJECT_REQUEST)', value: '4' },
					{ name: 'Chặn (BLOCK)', value: '6' },
					{ name: 'Bỏ chặn (UNBLOCK)', value: '7' },
				],
				default: 'all',
				description: 'Chỉ kích hoạt workflow với loại sự kiện này, hoặc "Tất cả"',
			},
		],
	};

	async trigger(this: ITriggerFunctions): Promise<ITriggerResponse> {
		const credential = (await this.getCredentials('zaloApi')) as unknown as ZaloApiCredential;
		const eventTypeFilter = this.getNodeParameter('eventType') as string;

		const api = await getZaloApi(credential);

		const handler = (event: ZaloFriendEvent) => {
			if (eventTypeFilter !== 'all' && String(event.type) !== eventTypeFilter) return;

			this.emit([
				[
					{
						json: {
							type: event.type ?? null,
							typeName: FRIEND_EVENT_TYPE_NAMES[event.type ?? -1] ?? 'UNKNOWN',
							data: event.data ?? null,
							threadId: event.threadId ?? null,
							isSelf: event.isSelf ?? false,
						},
					},
				],
			]);
		};

		api.listener.on('friend_event', handler);
		ensureListenerStarted(credential, api);

		async function closeFunction() {
			api.listener.off('friend_event', handler);
		}

		return { closeFunction };
	}
}
