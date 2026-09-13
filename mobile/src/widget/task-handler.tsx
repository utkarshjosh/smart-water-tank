import type { WidgetTaskHandlerProps } from 'react-native-android-widget';

import { TankWidget } from '@/widget/TankWidget';
import { pickTank, readWidgetState } from '@/widget/state';

/**
 * Entry point for every widget render, registered in index.js.
 *
 * This runs in a headless JS context: no React tree, no providers, no network.
 * It reads the cached blob and draws. Deliberately synchronous and cheap —
 * Android gives a widget update a short window and kills slow ones.
 */
export async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  const widgetInfo = props.widgetInfo;

  if (widgetInfo.widgetName !== 'Tank') return;

  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED':
    case 'WIDGET_CLICK': {
      const state = readWidgetState();
      // `deviceId` arrives once a configuration activity exists (phase 5).
      // Until then — and for the single-tank household this is built for —
      // the only tank is the right answer.
      const bound = (widgetInfo as { deviceId?: string }).deviceId;
      props.renderWidget(<TankWidget tank={pickTank(state, bound)} />);
      return;
    }
    case 'WIDGET_DELETED':
      return;
    default:
      return;
  }
}
