import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, Modal, Form, Input, Select, Tag, Space,
  Popconfirm, message, Typography, Drawer,
} from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { userApi, societeApi } from '../../services/api';
import type { User, UserSocieteAccess, Societe } from '../../types';

const { Title } = Typography;

const ROLE_COLOR: Record<string, string> = {
  admin: 'purple',
  comptable: 'blue',
  consultant: 'orange',
};

const ROLE_LABEL: Record<string, string> = {
  admin: 'Administrateur',
  comptable: 'Comptable',
  consultant: 'Consultant',
};

export default function GestionUtilisateurs() {
  const [users, setUsers] = useState<User[]>([]);
  const [accesses, setAccesses] = useState<UserSocieteAccess[]>([]);
  const [societes, setSocietes] = useState<Societe[]>([]);
  const [loading, setLoading] = useState(false);

  // Create user modal
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createForm] = Form.useForm();
  const [createLoading, setCreateLoading] = useState(false);

  // Edit user modal
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editForm] = Form.useForm();
  const [editLoading, setEditLoading] = useState(false);

  // Manage accesses drawer
  const [accessDrawerOpen, setAccessDrawerOpen] = useState(false);
  const [accessUser, setAccessUser] = useState<User | null>(null);
  const [newSocieteId, setNewSocieteId] = useState<number | undefined>(undefined);
  const [addingAccess, setAddingAccess] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [usersRes, accessesRes, societesRes] = await Promise.all([
        userApi.list(),
        userApi.listAccesses(),
        societeApi.list(),
      ]);
      setUsers(usersRes.data.results ?? usersRes.data);
      setAccesses(accessesRes.data.results ?? accessesRes.data);
      setSocietes(societesRes.data.results ?? societesRes.data);
    } catch {
      message.error('Erreur lors du chargement des données');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const getUserAccesses = (userId: number): UserSocieteAccess[] =>
    accesses.filter(a => a.user === userId);

  // Create user
  const handleCreate = async (values: {
    username: string;
    password: string;
    first_name?: string;
    last_name?: string;
    email?: string;
    role: string;
  }) => {
    setCreateLoading(true);
    try {
      await userApi.create(values);
      message.success('Utilisateur créé');
      setCreateModalOpen(false);
      createForm.resetFields();
      await loadData();
    } catch (err: any) {
      const detail = err?.response?.data;
      if (detail && typeof detail === 'object') {
        const msgs = Object.entries(detail)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
          .join(' — ');
        message.error(msgs);
      } else {
        message.error("Erreur lors de la création de l'utilisateur");
      }
    } finally {
      setCreateLoading(false);
    }
  };

  // Edit user
  const openEdit = (user: User) => {
    setEditingUser(user);
    editForm.setFieldsValue({
      first_name: user.first_name,
      last_name: user.last_name,
      email: user.email,
      role: user.role,
    });
    setEditModalOpen(true);
  };

  const handleEdit = async (values: {
    first_name?: string;
    last_name?: string;
    email?: string;
    role: string;
  }) => {
    if (!editingUser) return;
    setEditLoading(true);
    try {
      await userApi.update(editingUser.id, values);
      message.success('Utilisateur modifié');
      setEditModalOpen(false);
      editForm.resetFields();
      setEditingUser(null);
      await loadData();
    } catch {
      message.error("Erreur lors de la modification de l'utilisateur");
    } finally {
      setEditLoading(false);
    }
  };

  // Delete user
  const handleDelete = async (id: number) => {
    try {
      await userApi.delete(id);
      message.success('Utilisateur supprimé');
      await loadData();
    } catch {
      message.error("Erreur lors de la suppression de l'utilisateur");
    }
  };

  // Access management
  const openAccessDrawer = (user: User) => {
    setAccessUser(user);
    setNewSocieteId(undefined);
    setAccessDrawerOpen(true);
  };

  const handleAddAccess = async () => {
    if (!accessUser || !newSocieteId) {
      message.warning('Veuillez sélectionner une société');
      return;
    }
    setAddingAccess(true);
    try {
      await userApi.createAccess({ user: accessUser.id, societe: newSocieteId });
      message.success('Accès ajouté');
      setNewSocieteId(undefined);
      await loadData();
    } catch {
      message.error("Erreur lors de l'ajout de l'accès");
    } finally {
      setAddingAccess(false);
    }
  };

  const handleDeleteAccess = async (accessId: number) => {
    try {
      await userApi.deleteAccess(accessId);
      message.success('Accès révoqué');
      await loadData();
    } catch {
      message.error("Erreur lors de la révocation de l'accès");
    }
  };

  const currentUserAccesses = accessUser ? getUserAccesses(accessUser.id) : [];
  const assignedSocieteIds = new Set(currentUserAccesses.map(a => a.societe));
  const availableSocietes = societes.filter(s => !assignedSocieteIds.has(s.id));

  const columns: ColumnsType<User> = [
    {
      title: "Nom d'utilisateur",
      dataIndex: 'username',
      key: 'username',
      width: 140,
    },
    {
      title: 'Nom complet',
      key: 'fullname',
      width: 180,
      render: (_, r) => [r.first_name, r.last_name].filter(Boolean).join(' ') || '—',
    },
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
    },
    {
      title: 'Rôle',
      dataIndex: 'role',
      key: 'role',
      width: 140,
      render: (role: string) => (
        <Tag color={ROLE_COLOR[role] ?? 'default'}>{ROLE_LABEL[role] ?? role}</Tag>
      ),
    },
    {
      title: 'Sociétés accessibles',
      key: 'societes',
      render: (_, r) => {
        const userAccesses = getUserAccesses(r.id);
        if (userAccesses.length === 0) return <span style={{ color: '#aaa' }}>Aucune</span>;
        return (
          <Space size={4} wrap>
            {userAccesses.map(a => (
              <Tag key={a.id}>{a.societe_nom}</Tag>
            ))}
          </Space>
        );
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 200,
      render: (_, r) => (
        <Space size={4}>
          <Button
            size="small"
            onClick={() => openAccessDrawer(r)}
          >
            Accès
          </Button>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => openEdit(r)}
          >
            Modifier
          </Button>
          <Popconfirm
            title="Supprimer cet utilisateur ?"
            description="Cette action est irréversible."
            onConfirm={() => handleDelete(r.id)}
            okText="Supprimer"
            cancelText="Annuler"
            okButtonProps={{ danger: true }}
          >
            <Button size="small" danger icon={<DeleteOutlined />}>
              Supprimer
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>Gestion des utilisateurs</Title>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setCreateModalOpen(true)}
        >
          Nouvel utilisateur
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={users}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 20, showSizeChanger: false }}
        size="middle"
      />

      {/* Create user modal */}
      <Modal
        title="Nouvel utilisateur"
        open={createModalOpen}
        onCancel={() => { setCreateModalOpen(false); createForm.resetFields(); }}
        onOk={() => createForm.submit()}
        confirmLoading={createLoading}
        okText="Créer"
        cancelText="Annuler"
        destroyOnClose
      >
        <Form
          form={createForm}
          layout="vertical"
          onFinish={handleCreate}
          style={{ marginTop: 16 }}
        >
          <Form.Item
            name="username"
            label="Nom d'utilisateur"
            rules={[{ required: true, message: "Nom d'utilisateur requis" }]}
          >
            <Input autoComplete="off" />
          </Form.Item>
          <Form.Item
            name="password"
            label="Mot de passe"
            rules={[
              { required: true, message: 'Mot de passe requis' },
              { min: 8, message: 'Minimum 8 caractères' },
            ]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Form.Item name="first_name" label="Prénom">
            <Input />
          </Form.Item>
          <Form.Item name="last_name" label="Nom">
            <Input />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[{ type: 'email', message: 'Email invalide' }]}>
            <Input />
          </Form.Item>
          <Form.Item
            name="role"
            label="Rôle"
            rules={[{ required: true, message: 'Rôle requis' }]}
          >
            <Select
              options={[
                { value: 'admin', label: 'Administrateur' },
                { value: 'comptable', label: 'Comptable' },
                { value: 'consultant', label: 'Consultant' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* Edit user modal */}
      <Modal
        title={editingUser ? `Modifier — ${editingUser.username}` : 'Modifier'}
        open={editModalOpen}
        onCancel={() => { setEditModalOpen(false); editForm.resetFields(); setEditingUser(null); }}
        onOk={() => editForm.submit()}
        confirmLoading={editLoading}
        okText="Enregistrer"
        cancelText="Annuler"
        destroyOnClose
      >
        <Form
          form={editForm}
          layout="vertical"
          onFinish={handleEdit}
          style={{ marginTop: 16 }}
        >
          <Form.Item name="first_name" label="Prénom">
            <Input />
          </Form.Item>
          <Form.Item name="last_name" label="Nom">
            <Input />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[{ type: 'email', message: 'Email invalide' }]}>
            <Input />
          </Form.Item>
          <Form.Item
            name="role"
            label="Rôle"
            rules={[{ required: true, message: 'Rôle requis' }]}
          >
            <Select
              options={[
                { value: 'admin', label: 'Administrateur' },
                { value: 'comptable', label: 'Comptable' },
                { value: 'consultant', label: 'Consultant' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* Manage accesses drawer */}
      <Drawer
        title={accessUser ? `Accès de ${accessUser.username}` : 'Accès'}
        open={accessDrawerOpen}
        onClose={() => { setAccessDrawerOpen(false); setAccessUser(null); setNewSocieteId(undefined); }}
        width={420}
      >
        <div style={{ marginBottom: 24 }}>
          <p style={{ fontWeight: 600, marginBottom: 8 }}>Sociétés assignées</p>
          {currentUserAccesses.length === 0 ? (
            <p style={{ color: '#aaa' }}>Aucune société assignée.</p>
          ) : (
            <Space direction="vertical" style={{ width: '100%' }}>
              {currentUserAccesses.map(a => (
                <div
                  key={a.id}
                  style={{
                    display: 'flex', alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 12px',
                    border: '1px solid #f0f0f0',
                    borderRadius: 6,
                    background: '#fafafa',
                  }}
                >
                  <span>{a.societe_nom}</span>
                  <Popconfirm
                    title="Révoquer cet accès ?"
                    onConfirm={() => handleDeleteAccess(a.id)}
                    okText="Révoquer"
                    cancelText="Annuler"
                    okButtonProps={{ danger: true }}
                  >
                    <Button size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                </div>
              ))}
            </Space>
          )}
        </div>

        <div>
          <p style={{ fontWeight: 600, marginBottom: 8 }}>Ajouter un accès</p>
          {availableSocietes.length === 0 ? (
            <p style={{ color: '#aaa' }}>Toutes les sociétés sont déjà assignées.</p>
          ) : (
            <Space style={{ width: '100%' }}>
              <Select
                style={{ width: 240 }}
                placeholder="Sélectionner une société..."
                value={newSocieteId}
                onChange={v => setNewSocieteId(v)}
                options={availableSocietes.map(s => ({ value: s.id, label: s.nom }))}
              />
              <Button
                type="primary"
                icon={<PlusOutlined />}
                loading={addingAccess}
                onClick={handleAddAccess}
              >
                Ajouter
              </Button>
            </Space>
          )}
        </div>
      </Drawer>
    </div>
  );
}
