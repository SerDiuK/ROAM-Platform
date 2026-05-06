import * as Notifications from "expo-notifications";
import * as React from "react";

const DISPATCH_TYPE = "dispatch.created";

// Wires Notifications listeners → useDispatchInbox.showFor.
//
// Foreground: `addNotificationReceivedListener` fires while the app is open.
// Background tap: `addNotificationResponseReceivedListener` fires when a user
// taps the notification from the OS shade — the OS rehydrates us with the
// data payload. We also poll `getLastNotificationResponseAsync` once on mount
// in case the app was launched cold from a tap (the listener is registered
// after the OS dispatched the response and would otherwise miss it).
//
// Token-bearing pushes go through `data: { type: 'dispatch.created',
// dispatchId }` — see backend `dispatchRouter.confirm`.
type Props = {
	onDispatch: (dispatchId: string) => void;
};

export function DispatchNotifications({ onDispatch }: Props): null {
	// Stash the latest callback so the listeners (registered once) always call
	// through to the current state owner without re-subscribing on every render.
	const onDispatchRef = React.useRef(onDispatch);
	onDispatchRef.current = onDispatch;

	React.useEffect(() => {
		const handle = (
			notification: Notifications.Notification | Notifications.NotificationResponse,
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
		const tapSub = Notifications.addNotificationResponseReceivedListener(handle);

		// Cold-launch case: the OS already delivered a response before our
		// listener attached. Pull it once so the sheet opens on resume.
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
