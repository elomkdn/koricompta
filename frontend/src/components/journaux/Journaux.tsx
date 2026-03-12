import React, { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, Select, Space, Tag, Popconfirm, message } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import type { Societe, Journal } from '../../types';
import { journalApi } from '../../services/api';

const TYPE_LABELS: Record<string, string> = {
  achat: 'Achats', vente: 'Ventes', banque: 'Banque',
  caisse: 'Caisse', od: 'OD', an: 'À Nouveau',
};
const TYPE_COLORS: Record<string, string> = {
  achat: 'orange', vente: 'green', banque: 'blue',
  caisse: 'cyan', od: 'purple', an: 'default',
};

interface Props { societe: Societe; }

export default function Journaux({ societe }: Props) {
  const [journaux, setJournaux] = useState<Journal[]>([]);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Journal | null>(null);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const res = await journalApi.list(societe.id);
      setJournaux(res.data.results ?? res.data);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [societe.id]);

  const openNew = () => { setEditing(null); form.resetFields(); setModal(true); };
  const openEdit = (j: Journal) => { setEditing(j); form.setFieldsValue(j); setModal(true); };

  const handleSave = async (values: object) => {
    try {
      if (editing) await journalApi.update(editing.id, values);
      else await journalApi.create({ ...values, societe: societe.id });
      message.success(editing ? 'Journal modifié' : 'Journal créé');
      setModal(false);
      load();
    } catch { message.error("Erreur lors de l'enregistrement"); }
  };

  const handleDelete = async (id: number) => {
    try {
      await journalApi.delete(id);
      message.success('Journal supprimé');
      load();
    } catch { message.error('Impossible de supprimer (des pièces sont associées)'); }
  };

  const columns = [
    { title: 'Code', dataIndex: 'code', key: 'code', width: 80 },
    { title: 'Intitulé', dataIndex: 'intitule', key: 'intitule' },
    {
      title: 'Type', dataIndex: 'type_journal', key: 'type_journal', width: 130,
      render: (t: string) => <Tag color={TYPE_COLORS[t]}>{TYPE_LABELS[t] ?? t}</Tag>,
    },
    {
      title: 'Statut', dataIndex: 'actif', key: 'actif', width: 80,
      render: (a: boolean) => <Tag color={a ? 'green' : 'default'}>{a ? 'Actif' : 'Inactif'}</Tag>,
    },
    {
      title: '', key: 'actions', width: 90,
      render: (_: unknown, r: Journal) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          <Popconfirm title="Supprimer ce journal ?" onConfirm={() => handleDelete(r.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={openNew}>Nouveau journal</Button>
      </div>
      <Table dataSource={journaux} columns={columns} rowKey="id" loading={loading} size="small" pagination={false} />
      <Modal title={editing ? 'Modifier le journal' : 'Nouveau journal'} open={modal}
        onCancel={() => setModal(false)} onOk={() => form.submit()} okText={editing ? 'Modifier' : 'Créer'}>
        <Form form={form} layout="vertical" onFinish={handleSave} style={{ marginTop: 16 }}>
          <Form.Item name="code" label="Code" rules={[{ required: true }]}>
            <Input placeholder="ex: ACH" />
          </Form.Item>
          <Form.Item name="intitule" label="Intitulé" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="type_journal" label="Type" rules={[{ required: true }]}>
            <Select options={Object.entries(TYPE_LABELS).map(([v, l]) => ({ value: v, label: l }))} />
          </Form.Item>
          <Form.Item name="actif" label="Statut" initialValue={true}>
            <Select options={[{ value: true, label: 'Actif' }, { value: false, label: 'Inactif' }]} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
