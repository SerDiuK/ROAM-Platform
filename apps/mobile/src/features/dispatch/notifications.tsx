import * as Notifications from "expo-notifications";
import * as React from "react";

const DISPATCH_TYPE = "dispatch.created";

type Props = {
	onDispatch: (dispatchId: string) => void;
};

export function DispatchNotifications({ onDispatch }: Props): null {
	const onDispatchRef = React.useRef(onDispatch);
	onDispatchRef.current = onDispatch;

	React.useEffect(() => {
		const handle = (
			notification:
				| Notifications.Notification
				| Notifications.NotificationResponse,
		): void => {
			const content =
				"request" in notification
					? notification.request.content
					: notification.notification.request.content;
			const data = content.data as Record<string, unknown> | undefined;
			if (!data || data.type !== DISPATCH_TYPE) return;
			const dispatchId = data.dispatchId;
			if (typeof dispatchId !== "string" || dispatchId.length === 0) return;
			onDispatchRef.current(dispatchId);
		};

		const fgSub = Notifications.addNotificationReceivedListener(handle);
		const tapSub =
			Notifications.addNotificationResponseReceivedListener(handle);

		// A cold-launch tap is delivered before the listeners attach, so read it once here.
		void Notifications.getLastNotificationResponseAsync().then((response) => {
			if (response) handle(response);
		});

		return () => {
			fgSub.remove();
			tapSub.remove();
		};
	}, []);

	return null;
}
