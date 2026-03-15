import React, { useState, useCallback } from 'react';
import { Table, Button, Tag, Typography, Space } from 'antd';
import { ReloadOutlined, HistoryOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { Societe } from '../../types';
import { auditApi } from '../../services/api';

const { Title } = Typography;

const ACTION_COLORS: Record<string, string> = {
  create: 'green',
  update: 'blue',
  delete: 'red',
  validate: 'cyan',
  force_delete: 'volcano',
};

const ACTION_LABELS: Record<string, string> = {
  create: 'Création',
  update: 'Modification',
  delete: 'Suppression',
  validate: 'Validation',
  force_delete: 'Suppr. forcée',
};

interface Props { societe: Societe; }

export default function AuditLog({ societe }: Props) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await auditApi.list(societe.id);
      setData(res.data);
    } finally {
      setLoading(false);
    }
  }, [societe.id]);

  React.useEffect(() => { load(); }, [load]);

  const columns: ColumnsType<any> = [
    { title: 'Date', dataIndex: 'created_at', key: 'created_at', width: 140 },
    { title: 'Utilisateur', dataIndex: 'utilisateur', key: 'utilisateur', width: 120 },
    {
      title: 'Action', dataIndex: 'action', key: 'action', width: 120,
      render: (a: string) => <Tag color={ACTION_COLORS[a] || 'default'}>{ACTION_LABELS[a] || a}</Tag>,
    },
    { title: 'Modèle', dataIndex: 'modele', key: 'modele', width: 120 },
    { title: 'ID', dataIndex: 'objet_id', key: 'objet_id', width: 60 },
    { title: 'Description', dataIndex: 'description', key: 'description' },
    { title: 'IP', dataIndex: 'ip_address', key: 'ip_address', width: 130 },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Space style={{ marginBottom: 16 }}>
        <HistoryOutlined />
        <Title level={4} style={{ margin: 0 }}>Journal d'audit</Title>
        <Button icon={<ReloadOutlined />} onClick={load} loading={loading} size="small">Actualiser</Button>
      </Space>
      <Table
        dataSource={data}
        columns={columns}
        rowKey="id"
        loading={loading}
        size="small"
        pagination={{ pageSize: 50, showTotal: (t) => `${t} entrées` }}
        bordered
      />
    </div>
  );
}
