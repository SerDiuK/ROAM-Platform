import { DISPATCH_PUSH_CHANNEL } from "@roam/shared";
import {
	Expo,
	type ExpoPushMessage,
	type ExpoPushTicket,
} from "expo-server-sdk";
import { ResponderModel } from "../db/models/responder.js";

type PushMessage = {
	title: string;
	body: string;
	data?: Record<string, unknown>;
};

type SendPushResult = {
	tickets: ExpoPushTicket[];
	delivered: number;
	skipped: number;
};

export type ExpoPushClient = {
	sendPushToResponders(
		responderIds: string[],
		message: PushMessage,
	): Promise<SendPushResult>;
};

type PushLogger = {
	warn: (obj: object, msg: string) => void;
};

type ExpoPushClientOptions = {
	accessToken?: string;
	logger?: PushLogger;
};

export function createExpoPushClient(
	options: ExpoPushClientOptions = {},
): ExpoPushClient {
	const expo = new Expo({ accessToken: options.accessToken });
	const log: PushLogger = options.logger ?? {
		warn: (obj, msg) => {
			console.warn(msg, obj);
		},
	};

	async function sendPushToResponders(
		responderIds: string[],
		message: PushMessage,
	): Promise<SendPushResult> {
		if (responderIds.length === 0) {
			return { tickets: [], delivered: 0, skipped: 0 };
		}

		const responders = await ResponderModel.find(
			{ _id: { $in: responderIds } },
			{ pushTokens: 1 },
		).lean();

		const validTokens: string[] = [];
		let skipped = 0;
		for (const op of responders) {
			const tokens = op.pushTokens ?? [];
			for (const token of tokens) {
				if (Expo.isExpoPushToken(token)) {
					validTokens.push(token);
				} else {
					skipped += 1;
					log.warn(
						{ responderId: op._id, token },
						"sendPushToResponders: dropping non-Expo push token",
					);
				}
			}
		}

		if (validTokens.length === 0) {
			return { tickets: [], delivered: 0, skipped };
		}

		const messages: ExpoPushMessage[] = validTokens.map((token) => ({
			to: token,
			title: message.title,
			body: message.body,
			data: message.data,
			sound: "default",
			priority: "high",
			channelId: DISPATCH_PUSH_CHANNEL,
		}));

		const chunks = expo.chunkPushNotifications(messages);
		const tickets: ExpoPushTicket[] = [];
		for (const chunk of chunks) {
			const chunkTickets = await expo.sendPushNotificationsAsync(chunk);
			tickets.push(...chunkTickets);
		}

		return { tickets, delivered: validTokens.length, skipped };
	}

	return { sendPushToResponders };
}
