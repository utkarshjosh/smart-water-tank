/**
 * Custom entry point.
 *
 * Two things must be registered at module scope, before React mounts, because
 * both can fire when the app is backgrounded or not running at all:
 *
 *   - the home-screen widget's task handler, which renders in its own headless
 *     JS context;
 *   - the push background handlers, which keep widget state fresh from an
 *     alert push and let Acknowledge work straight from the notification.
 *
 * Everything after that is expo-router's normal entry.
 */
const { registerWidgetTaskHandler } = require('react-native-android-widget');
const { widgetTaskHandler } = require('./src/widget/task-handler');
const { registerBackgroundHandlers } = require('./src/push/background');

registerWidgetTaskHandler(widgetTaskHandler);
registerBackgroundHandlers();

require('expo-router/entry');
