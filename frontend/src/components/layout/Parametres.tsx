import React, { useState, useEffect } from 'react';
import {
  Card, Form, Input, Select, Button, Table, Tag, Modal, DatePicker,
  Popconfirm, Space, message, Typography, Row, Col, Alert,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { Societe, ExerciceComptable } from '../../types';
import { societeApi, exerciceApi } from '../../services/api';
import axios from 'axios';

const { Title } = Typography;

interface Props {
  societe: Societe;
  exercices: ExerciceComptable[];
  exerciceActif: ExerciceComptable;
  onRefresh: () => void;
  onSocieteUpdated: () => void;
}

const Parametres: React.FC<Props> = ({
  societe,
  exercices,
  exerciceActif,
  onRefresh,
  onSocieteUpdated,
}) => {
  const [societeForm] = Form.useForm();
  const [savingSociete, setSavingSociete] = useState(false);
  const [provisioning, setProvisioning] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');

  // Exercice modal
  const [exerciceModalOpen, setExerciceModalOpen] = useState(false);
  const [savingExercice, setSavingExercice] = useState(false);
  const [exerciceForm] = Form.useForm();
  const exerciceCode = Form.useWatch('code', exerciceForm);

  useEffect(() => {
    const val = String(exerciceCode ?? '').trim();
    if (/^\d{4}$/.test(val)) {
      const y = parseInt(val, 10);
      exerciceForm.setFieldsValue({
        libelle: `Exercice ${val}`,
        date_debut: dayjs(`${y}-01-01`),
        date_fin: dayjs(`${y}-12-31`),
      });
    }
  }, [exerciceCode]);

  // Initialize societe form
  React.useEffect(() => {
    societeForm.setFieldsValue({
      nom: societe.nom,
      sigle: (societe as any).sigle,
      forme_juridique: (societe as any).forme_juridique,
      regime_fiscal: (societe as any).regime_fiscal,
      devise: (societe as any).devise,
      adresse: (societe as any).adresse,
      telephone: (societe as any).telephone,
      email: (societe as any).email,
      rccm: (societe as any).rccm,
      nif: (societe as any).nif,
    });
  }, [societe]);

  const handleSaveSociete = async () => {
    let values: any;
    try {
      values = await societeForm.validateFields();
    } catch {
      return;
    }
    setSavingSociete(true);
    try {
      await societeApi.update(societe.id, values);
      message.success('Société mise à jour');
      onSocieteUpdated();
    } catch {
      message.error('Erreur lors de la mise à jour de la société');
    } finally {
      setSavingSociete(false);
    }
  };

  const handleDeleteSociete = async () => {
    try {
      await societeApi.delete(societe.id);
      message.success('Société supprimée');
      window.location.reload();
    } catch {
      message.error('Erreur lors de la suppression');
    } finally {
      setDeleteModalOpen(false);
      setDeleteConfirmName('');
    }
  };

  const handleProvisionner = async () => {
    setProvisioning(true);
    try {
      await societeApi.provisionner(societe.id);
      message.success('Plan comptable OHADA chargé');
      onRefresh();
    } catch {
      message.error('Erreur lors du chargement du plan OHADA');
    } finally {
      setProvisioning(false);
    }
  };

  const handleCloturer = async (id: number) => {
    try {
      await exerciceApi.cloturer(id);
      message.success('Exercice clôturé');
      onRefresh();
    } catch {
      message.error('Erreur lors de la clôture');
    }
  };

  const handleCreateExercice = async () => {
    let values: any;
    try {
      values = await exerciceForm.validateFields();
    } catch {
      return;
    }
    setSavingExercice(true);
    try {
      await axios.post('/api/comptabilite/exercices/', {
        ...values,
        societe: societe.id,
        date_debut: values.date_debut.format('YYYY-MM-DD'),
        date_fin: values.date_fin.format('YYYY-MM-DD'),
      });
      message.success('Exercice créé');
      setExerciceModalOpen(false);
      onRefresh();
    } catch {
      message.error("Erreur lors de la création de l'exercice");
    } finally {
      setSavingExercice(false);
    }
  };

  const exerciceColumns: ColumnsType<ExerciceComptable> = [
    {
      title: 'Code',
      dataIndex: 'code',
      key: 'code',
      width: 100,
    },
    {
      title: 'Libellé',
      dataIndex: 'libelle',
      key: 'libelle',
    },
    {
      title: 'Date début',
      dataIndex: 'date_debut',
      key: 'date_debut',
      width: 110,
    },
    {
      title: 'Date fin',
      dataIndex: 'date_fin',
      key: 'date_fin',
      width: 110,
    },
    {
      title: 'Statut',
      dataIndex: 'statut',
      key: 'statut',
      width: 100,
      render: (s: string) => (
        <Tag color={s === 'ouvert' ? 'green' : 'default'}>
          {s === 'ouvert' ? 'Ouvert' : 'Clôturé'}
        </Tag>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 130,
      render: (_, record) => {
        if (record.statut !== 'ouvert') return null;
        return (
          <Popconfirm
            title="Clôturer cet exercice ?"
            description="Cette action est irréversible. L'exercice ne pourra plus être modifié."
            onConfirm={() => handleCloturer(record.id)}
            okText="Clôturer"
            cancelText="Annuler"
            okButtonProps={{ danger: true }}
          >
            <Button size="small" danger>
              Clôturer
            </Button>
          </Popconfirm>
        );
      },
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Title level={4} style={{ marginBottom: 24 }}>
        Paramètres — {societe.nom}
      </Title>

      {/* Société Card */}
      <Card
        title="Informations de la société"
        style={{ marginBottom: 24 }}
        extra={
          <Space>
            <Popconfirm
              title="Charger le plan OHADA ?"
              description="Cela va créer tous les comptes du plan SYSCOHADA révisé. Les comptes existants ne seront pas écrasés."
              onConfirm={handleProvisionner}
              okText="Charger"
              cancelText="Annuler"
            >
              <Button loading={provisioning} type="default">
                Charger plan OHADA
              </Button>
            </Popconfirm>
            <Button danger onClick={() => { setDeleteConfirmName(''); setDeleteModalOpen(true); }}>
              Supprimer la société
            </Button>
          </Space>
        }
      >
        <Form form={societeForm} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="nom"
                label="Nom de la société"
                rules={[{ required: true, message: 'Nom requis' }]}
              >
                <Input />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="sigle" label="Sigle">
                <Input placeholder="ex: SARL" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="forme_juridique" label="Forme juridique">
                <Select allowClear placeholder="Sélectionner" options={[
                  { value: 'SARL', label: 'SARL' },
                  { value: 'SA',   label: 'SA' },
                  { value: 'SAS',  label: 'SAS' },
                  { value: 'SNC',  label: 'SNC' },
                  { value: 'EI',   label: 'Entreprise individuelle' },
                  { value: 'GIE',  label: 'GIE' },
                  { value: 'ONG',  label: 'ONG' },
                  { value: 'AUTRE',label: 'Autre' },
                ]} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="devise" label="Devise">
                <Input placeholder="XOF" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="regime_fiscal" label="Régime fiscal">
                <Select allowClear placeholder="Sélectionner">
                  <Select.Option value="reel">Réel</Select.Option>
                  <Select.Option value="simplifie">Simplifié</Select.Option>
                  <Select.Option value="micro">Micro-entreprise</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="rccm" label="RCCM">
                <Input placeholder="N° RCCM" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="nif" label="NIF">
                <Input placeholder="N° Identification fiscale" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="telephone" label="Téléphone">
                <Input placeholder="+228 XX XX XX XX" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="email"
                label="Email"
                rules={[{ type: 'email', message: 'Email invalide' }]}
              >
                <Input placeholder="contact@societe.com" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="adresse" label="Adresse">
            <Input.TextArea rows={2} placeholder="Adresse complète" />
          </Form.Item>

          <Form.Item>
            <Button type="primary" loading={savingSociete} onClick={handleSaveSociete}>
              Enregistrer les modifications
            </Button>
          </Form.Item>
        </Form>
      </Card>

      {/* Exercices Card */}
      <Card
        title="Exercices comptables"
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => { exerciceForm.resetFields(); setExerciceModalOpen(true); }}
          >
            Nouvel exercice
          </Button>
        }
      >
        <Table
          columns={exerciceColumns}
          dataSource={exercices}
          rowKey="id"
          pagination={false}
          size="middle"
          rowClassName={record =>
            record.id === exerciceActif.id ? 'ant-table-row-selected' : ''
          }
        />
      </Card>

      {/* New exercice modal */}
      <Modal
        title="Nouvel exercice comptable"
        open={exerciceModalOpen}
        onCancel={() => setExerciceModalOpen(false)}
        onOk={handleCreateExercice}
        confirmLoading={savingExercice}
        okText="Créer"
        cancelText="Annuler"
        width={480}
        destroyOnClose
      >
        <Form form={exerciceForm} layout="vertical" style={{ marginTop: 16 }}>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                name="code"
                label="Code"
                rules={[{ required: true, message: 'Code requis' }]}
              >
                <Input placeholder="2025" />
              </Form.Item>
            </Col>
            <Col span={16}>
              <Form.Item
                name="libelle"
                label="Libellé"
                rules={[{ required: true, message: 'Libellé requis' }]}
              >
                <Input placeholder="Exercice 2025" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="date_debut"
                label="Date de début"
                rules={[{ required: true, message: 'Date requise' }]}
              >
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="date_fin"
                label="Date de fin"
                rules={[{ required: true, message: 'Date requise' }]}
              >
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* Modal double confirmation suppression société */}
      <Modal
        title="Supprimer la société"
        open={deleteModalOpen}
        onCancel={() => { setDeleteModalOpen(false); setDeleteConfirmName(''); }}
        onOk={handleDeleteSociete}
        okText="Supprimer définitivement"
        cancelText="Annuler"
        okButtonProps={{ danger: true, disabled: deleteConfirmName !== societe.nom }}
      >
        <Alert
          type="error"
          message="Action irréversible"
          description="Toutes les données liées à cette société (écritures, comptes, exercices, tiers, immobilisations...) seront définitivement supprimées."
          style={{ marginBottom: 16 }}
        />
        <p>Pour confirmer, saisissez le nom exact de la société : <strong>{societe.nom}</strong></p>
        <Input
          value={deleteConfirmName}
          onChange={e => setDeleteConfirmName(e.target.value)}
          placeholder={societe.nom}
        />
      </Modal>
    </div>
  );
};

export default Parametres;
