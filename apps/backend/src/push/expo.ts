import { Expo, type ExpoPushMessage, type ExpoPushTicket } from "expo-server-sdk";
import { ResponderModel } from "../db/models/responder.js";

export type PushMessage = {
	title: string;
	body: string;
	data?: Record<string, unknown>;
};

export type SendPushResult = {
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

export type ExpoPushClientOptions = {
	accessToken?: string;
	logger?: PushLogger;
};

// Wraps expo-server-sdk so the rest of the backend can fan out push
// notifications by responder id without thinking about chunking, token validity,
// or the underlying HTTP client. Look-up of pushTokens reads directly from the
// Responder document; mobile-side registration of those tokens lives in AD-12.
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
