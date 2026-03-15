import React, { useState } from 'react';
import { Form, Input, Button, Alert } from 'antd';
import { CheckOutlined, UserOutlined, LockOutlined } from '@ant-design/icons';

interface Props {
  onLogin: (username: string, password: string) => Promise<void>;
}

export default function LoginPage({ onLogin }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const onSubmit = async (values: { username: string; password: string }) => {
    setLoading(true);
    setError('');
    try {
      await onLogin(values.username, values.password);
    } catch {
      setError('Identifiants incorrects.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: "'Inter Variable', sans-serif" }}>
      {/* Left branding panel */}
      <div style={{
        flex: '0 0 480px',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '48px', color: '#fff',
      }}>
        <img src="/logo.svg" style={{ width: 64, height: 64, marginBottom: 24 }} alt="KoriCompta" />
        <h1 style={{ fontSize: 32, fontWeight: 700, margin: '0 0 8px', textAlign: 'center' }}>KoriCompta</h1>
        <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.6)', textAlign: 'center', marginBottom: 48 }}>
          La comptabilité SYSCOHADA<br />au bout des doigts
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%' }}>
          {[
            'Plan comptable OHADA complet',
            'Rapports financiers conformes',
            'Gestion multi-sociétés & multi-utilisateurs',
          ].map(text => (
            <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%',
                background: 'rgba(26,86,219,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <CheckOutlined style={{ color: '#60a5fa', fontSize: 12 }} />
              </div>
              <span style={{ color: 'rgba(255,255,255,0.75)', fontSize: 14 }}>{text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Right login panel */}
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#f8fafc', padding: 32,
      }}>
        <div style={{ width: '100%', maxWidth: 400 }}>
          <h2 style={{ fontSize: 24, fontWeight: 700, color: '#0f172a', margin: '0 0 8px' }}>Bienvenue</h2>
          <p style={{ color: '#64748b', marginBottom: 32, fontSize: 14 }}>
            Connectez-vous à votre espace comptable
          </p>

          <Form onFinish={onSubmit} layout="vertical" size="large">
            <Form.Item name="username" rules={[{ required: true, message: 'Identifiant requis' }]}>
              <Input
                prefix={<UserOutlined style={{ color: '#94a3b8' }} />}
                placeholder="Identifiant"
                style={{ borderRadius: 8 }}
                autoFocus
              />
            </Form.Item>
            <Form.Item name="password" rules={[{ required: true, message: 'Mot de passe requis' }]}>
              <Input.Password
                prefix={<LockOutlined style={{ color: '#94a3b8' }} />}
                placeholder="Mot de passe"
                style={{ borderRadius: 8 }}
              />
            </Form.Item>
            {error && (
              <Alert
                type="error"
                message={error}
                style={{ marginBottom: 16, borderRadius: 8 }}
              />
            )}
            <Button
              type="primary"
              htmlType="submit"
              block
              loading={loading}
              style={{ height: 44, fontSize: 15, fontWeight: 600, borderRadius: 8 }}
            >
              Se connecter
            </Button>
          </Form>

          <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: 12, marginTop: 40 }}>
            KoriCompta v1.0 — SYSCOHADA
          </p>
        </div>
      </div>
    </div>
  );
}
