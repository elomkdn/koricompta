import React, { useState } from 'react';
import { Form, Input, Button, Alert, Typography } from 'antd';

const { Title, Text } = Typography;

interface Props {
  onLogin: (username: string, password: string) => Promise<void>;
}

export default function LoginPage({ onLogin }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (values: { username: string; password: string }) => {
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
    <div style={{
      minHeight: '100vh',
      background: '#f5f5f5',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <div style={{
        background: '#fff',
        borderRadius: 8,
        padding: '40px 40px 32px',
        width: 360,
        boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <img src="/logo.svg" alt="KoriCompta" style={{ width: 72, height: 72, marginBottom: 12 }} />
          <Title level={3} style={{ margin: 0 }}>KoriCompta</Title>
          <Text type="secondary">Connectez-vous pour continuer</Text>
        </div>

        {error && <Alert message={error} type="error" showIcon style={{ marginBottom: 16 }} />}

        <Form layout="vertical" onFinish={handleSubmit} requiredMark={false}>
          <Form.Item name="username" label="Nom d'utilisateur" rules={[{ required: true }]}>
            <Input size="large" autoFocus />
          </Form.Item>
          <Form.Item name="password" label="Mot de passe" rules={[{ required: true }]}>
            <Input.Password size="large" />
          </Form.Item>
          <Button
            type="primary" htmlType="submit" loading={loading}
            block size="large"
            style={{ marginTop: 8, background: '#1a3a5c', borderColor: '#1a3a5c', height: 42 }}
          >
            Connexion
          </Button>
        </Form>
      </div>
    </div>
  );
}
