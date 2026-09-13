import { Tabs } from 'expo-router';
import { BellRinging, Cpu, Drop, SlidersHorizontal, type Icon } from 'phosphor-react-native';
import { StyleSheet } from 'react-native';

import { useAlertFeed } from '@/api/queries';
import { useTheme } from '@/ui/theme';

/**
 * The bottom tab bar. Same icons as the webapp's nav (Drop for tanks, Cpu for
 * devices) so the two products read as one; the active tab fills its glyph
 * exactly as the web tab bar does.
 *
 * The Activity badge is the feed's unacknowledged count — the query is shared
 * with the Activity screen, so this costs no extra request.
 */
const TABS: { name: string; title: string; icon: Icon }[] = [
  { name: 'index', title: 'Tanks', icon: Drop },
  { name: 'alerts', title: 'Activity', icon: BellRinging },
  { name: 'devices', title: 'Devices', icon: Cpu },
  { name: 'settings', title: 'Settings', icon: SlidersHorizontal },
];

export default function TabsLayout() {
  const { colors } = useTheme();
  const feed = useAlertFeed();
  const unacknowledged = feed.data?.pages[0]?.unacknowledged ?? 0;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.background },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          elevation: 0,
        },
        tabBarLabelStyle: styles.label,
        tabBarHideOnKeyboard: true,
      }}
    >
      {TABS.map(({ name, title, icon: TabIcon }) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            title,
            tabBarIcon: ({ focused }) => (
              <TabIcon
                size={22}
                color={focused ? colors.primary : colors.mutedForeground}
                weight={focused ? 'fill' : 'regular'}
              />
            ),
            ...(name === 'alerts' && unacknowledged > 0
              ? {
                  tabBarBadge: unacknowledged,
                  tabBarBadgeStyle: { backgroundColor: colors.warn, color: colors.background },
                }
              : {}),
          }}
        />
      ))}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 11, fontWeight: '500' },
});
