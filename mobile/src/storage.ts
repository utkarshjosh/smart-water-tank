import { createMMKV } from 'react-native-mmkv';

/**
 * Synchronous storage. Two separate instances on purpose:
 *
 * - `appStore`  user preferences + the persisted query cache. Cleared on sign-out.
 * - `widgetStore` the single `widget_state` blob the home-screen widget renders
 *   from. Written by the app, the FCM background handler and the background
 *   task; read by the widget task handler, which runs in its own headless JS
 *   context and so cannot reach React state. One shape, several writers,
 *   never a network call in the render path.
 */
export const appStore = createMMKV({ id: 'aquamind.app' });
export const widgetStore = createMMKV({ id: 'aquamind.widget' });
