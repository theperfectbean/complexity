import { useState, useEffect } from 'react';
import MainPage from './pages/MainPage';
import ServicePage from './pages/ServicePage';
import HealthPage from './pages/HealthPage';
import { applyTheme, getTheme } from './lib/theme';

interface Route {
  path: string;
  params: Record<string, string>;
}

function getRoute(): Route {
  const hash = window.location.hash.slice(1) || '/';
  const svcMatch = hash.match(/^\/services\/(.+)$/);
  if (svcMatch) return { path: '/services/:name', params: { name: svcMatch[1] } };
  if (hash === '/health') return { path: '/health', params: {} };
  return { path: '/', params: {} };
}

// Initialise theme before first render
applyTheme(getTheme());

export default function App() {
  const [route, setRoute] = useState<Route>(getRoute);

  useEffect(() => {
    const handler = () => setRoute(getRoute());
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  if (route.path === '/services/:name' && route.params.name) {
    return <ServicePage name={route.params.name} />;
  }
  if (route.path === '/health') {
    return <HealthPage />;
  }
  return <MainPage />;
}
