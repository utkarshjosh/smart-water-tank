/**
 * Custom entry point.
 *
 * The home-screen widget runs in its own headless JS context, so its task
 * handler must be registered at module scope before React ever mounts — it can
 * fire when the app is not running at all. Everything else is expo-router's
 * normal entry.
 */
const { registerWidgetTaskHandler } = require('react-native-android-widget');
const { widgetTaskHandler } = require('./src/widget/task-handler');

registerWidgetTaskHandler(widgetTaskHandler);

require('expo-router/entry');
