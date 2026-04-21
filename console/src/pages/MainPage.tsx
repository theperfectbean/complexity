import { useState } from 'react';
import { Activity } from 'lucide-react';
import { ServiceList } from '../components/ServiceList';
import { AgentChat } from '../components/AgentChat';
import { ThemeToggle } from '../components/ThemeToggle';

export default function MainPage() {
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [chatContext, setChatContext] = useState('');

  const handleSelectService = (name: string) => {
    setSelectedService(name);
    setChatContext(`Tell me about the ${name} service`);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-page)', color: 'var(--text)' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1.5rem', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ borderRadius: '0.5rem', padding: '0.375rem', background: 'var(--accent-subtle)' }}>
            <Activity size={18} style={{ color: 'var(--accent-light)' }} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, lineHeight: 1.2 }}>Fleet Console</h1>
            <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--text-secondary)', lineHeight: 1.2 }}>Homelab Infrastructure</p>
          </div>
        </div>
        <nav style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <a href="#/health" style={{ fontSize: '0.85rem', color: 'var(--accent-light)', textDecoration: 'none' }}>Health →</a>
          <ThemeToggle />
        </nav>
      </header>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <div style={{ width: '35%', borderRight: '1px solid var(--border)', overflowY: 'auto', flexShrink: 0 }}>
          <ServiceList selectedService={selectedService} onSelectService={handleSelectService} />
        </div>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <AgentChat
            initialContext={chatContext}
            onContextUsed={() => setChatContext('')}
          />
        </div>
      </div>
    </div>
  );
}
