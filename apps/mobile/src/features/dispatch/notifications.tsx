import * as Notifications from "expo-notifications";
import * as React from "react";

const DISPATCH_TYPE = "dispatch.created";

type Props = {
	onDispatch: (dispatchId: string) => void;
};

export function DispatchNotifications({ onDispatch }: Props): null {
	React.useEffect(() => {
		const handle = (notification: Notifications.Notification): void => {
			const { data } = notification.request.content;
			const dispatchId = data?.dispatchId;
			if (data?.type !== DISPATCH_TYPE) return;
			if (typeof dispatchId !== "string" || dispatchId.length === 0) return;
			onDispatch(dispatchId);
		};
		const handleTap = (response: Notifications.NotificationResponse): void => {
			handle(response.notification);
			Notifications.clearLastNotificationResponse();
		};

		const fgSub = Notifications.addNotificationReceivedListener(handle);
		const tapSub =
			Notifications.addNotificationResponseReceivedListener(handleTap);

		// A cold-launch tap is delivered before the listeners attach, so read it once here.
		const launchResponse = Notifications.getLastNotificationResponse();
		if (launchResponse) handleTap(launchResponse);

		return () => {
			fgSub.remove();
			tapSub.remove();
		};
	}, [onDispatch]);

	return null;
}
