import { Tabs, useRouter } from 'expo-router'
import { TabIsland } from '@/ui/rn/TabIsland'
import type { Tab } from '@/ui/state/nav'

export default function TabsLayout() {
  const router = useRouter()

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: '#000000' },
      }}
      tabBar={({ state }) => {
        const routeName = state.routes[state.index]?.name
        const activeTab: Tab = routeName === 'sounds' ? 'sounds' : 'play'
        return (
          <TabIsland
            activeTab={activeTab}
            onSelectTab={(tab) => {
              const target = tab === 'sounds' ? 'sounds' : 'index'
              if (routeName !== target) {
                router.navigate(tab === 'sounds' ? '/sounds' : '/')
              }
            }}
          />
        )
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Play' }} />
      <Tabs.Screen name="sounds" options={{ title: 'Sounds' }} />
    </Tabs>
  )
}
