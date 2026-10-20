import { Tabs } from 'expo-router/js-tabs';
import { colors } from '@majobella/core';
import { TabBar } from '@/components/tab-bar';

export default function TabsLayout() {
  return (
    <Tabs tabBar={(p) => <TabBar {...p} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.paper } }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="revisar" />
      <Tabs.Screen name="clientas" />
      <Tabs.Screen name="dinero" />
      <Tabs.Screen name="mas" />
    </Tabs>
  );
}
