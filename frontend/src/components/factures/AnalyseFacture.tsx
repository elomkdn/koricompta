import React, { useState } from 'react';
import {
  Card, Upload, Button, Table, Form, Input, InputNumber, Select,
  Space, Tag, message, Spin, Alert, Row, Col, Divider, Typography,
} from 'antd';
import { InboxOutlined, CheckOutlined } from '@ant-design/icons';
import type { Societe, ExerciceComptable, Journal } from '../../types';
import { factureApi, journalApi, compteApi, pieceApi } from '../../services/api';
import dayjs from 'dayjs';

const { Dragger } = Upload;
const { Title, Text } = Typography;

interface LigneProposee {
  sens: 'debit' | 'credit';
  compte_numero: string;
  compte_libelle: string;
  libelle: string;
  montant: number;
}

interface Extraction {
  date: string;
  numero_facture: string | null;
  fournisseur: string;
  description: string;
  montant_ht: number;
  taux_tva: number;
  montant_tva: number;
  montant_ttc: number;
}

interface AnalyseResult {
  extraction: Extraction;
  lignes_proposees: LigneProposee[];
}

interface Props {
  societe: Societe;
  exercice: ExerciceComptable;
}

export default function AnalyseFacture({ societe, exercice }: Props) {
  const [analysing, setAnalysing] = useState(false);
  const [result, setResult] = useState<AnalyseResult | null>(null);
  const [journaux, setJournaux] = useState<Journal[]>([]);
  const [comptes, setComptes] = useState<any[]>([]);
  const [journalId, setJournalId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [lignes, setLignes] = useState<LigneProposee[]>([]);
  const [form] = Form.useForm();

  React.useEffect(() => {
    journalApi.list(societe.id).then(r => {
      const jList = r.data.results ?? r.data;
      setJournaux(jList);
      const achat = jList.find((j: Journal) => j.type_journal === 'achat');
      if (achat) setJournalId(achat.id);
    });
    compteApi.list(societe.id).then(r => setComptes(r.data.results ?? r.data));
  }, [societe.id]);

  const handleUpload = async (file: File) => {
    setAnalysing(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append('fichier', file);
      const res = await factureApi.analyser(fd);
      setResult(res.data);
      setLignes(res.data.lignes_proposees);
      form.setFieldsValue({
        date: res.data.extraction.date,
        piece_ref: res.data.extraction.numero_facture || '',
        libelle: `Facture ${res.data.extraction.fournisseur}${res.data.extraction.numero_facture ? ' N°' + res.data.extraction.numero_facture : ''}`,
      });
    } catch (e: any) {
      message.error(e?.response?.data?.error || "Erreur lors de l'analyse");
    } finally {
      setAnalysing(false);
    }
  };

  const findCompteId = (numero: string): number | null => {
    // Try progressively shorter prefixes
    for (let len = numero.length; len >= 2; len--) {
      const prefix = numero.substring(0, len);
      const c = comptes.find((c: any) => c.numero.startsWith(prefix));
      if (c) return c.id;
    }
    return null;
  };

  const handleValider = async () => {
    if (!journalId) { message.error('Sélectionnez un journal'); return; }
    const values = await form.validateFields();
    const lignesApi = lignes.map(l => ({
      compte_id: findCompteId(l.compte_numero),
      libelle: l.libelle,
      debit: l.sens === 'debit' ? l.montant : 0,
      credit: l.sens === 'credit' ? l.montant : 0,
    }));
    const manquants = lignes.filter((l, i) => !lignesApi[i].compte_id);
    if (manquants.length > 0) {
      message.error(`Compte(s) introuvable(s) : ${manquants.map(l => l.compte_numero).join(', ')}`);
      return;
    }
    setSaving(true);
    try {
      await pieceApi.create({
        exercice_id: exercice.id,
        journal_id: journalId,
        date_piece: values.date,
        reference: values.piece_ref,
        libelle: values.libelle,
        lignes: lignesApi,
      });
      message.success('Écriture créée avec succès');
      setResult(null);
      setLignes([]);
      form.resetFields();
    } catch (e: any) {
      message.error("Erreur lors de la création de l'écriture");
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    {
      title: 'Sens', dataIndex: 'sens', width: 80,
      render: (s: string) => <Tag color={s === 'debit' ? 'blue' : 'green'}>{s === 'debit' ? 'Débit' : 'Crédit'}</Tag>,
    },
    { title: 'Compte', dataIndex: 'compte_numero', width: 90 },
    { title: 'Intitulé', dataIndex: 'compte_libelle' },
    { title: 'Libellé', dataIndex: 'libelle' },
    {
      title: 'Montant', dataIndex: 'montant', width: 120, align: 'right' as const,
      render: (v: number) => <Text strong>{v.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}</Text>,
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Title level={4} style={{ marginBottom: 24 }}>Saisie automatique par facture</Title>

      {!result && (
        <Card>
          <Dragger
            accept=".jpg,.jpeg,.png,.webp,.pdf"
            showUploadList={false}
            beforeUpload={file => { handleUpload(file); return false; }}
            disabled={analysing}
            style={{ padding: 24 }}
          >
            {analysing ? (
              <div style={{ padding: 32 }}>
                <Spin size="large" />
                <p style={{ marginTop: 16, color: '#666' }}>Analyse de la facture en cours...</p>
              </div>
            ) : (
              <>
                <p className="ant-upload-drag-icon"><InboxOutlined /></p>
                <p className="ant-upload-text">Glissez une facture ici ou cliquez pour sélectionner</p>
                <p className="ant-upload-hint">Formats supportés : JPEG, PNG, WebP, PDF</p>
              </>
            )}
          </Dragger>
        </Card>
      )}

      {result && (
        <>
          <Alert
            type="success"
            message="Facture analysée"
            description={`${result.extraction.fournisseur} — ${result.extraction.montant_ttc.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} TTC`}
            style={{ marginBottom: 16 }}
            action={
              <Button size="small" onClick={() => { setResult(null); setLignes([]); form.resetFields(); }}>
                Nouvelle facture
              </Button>
            }
          />

          <Card title="Écriture proposée" style={{ marginBottom: 16 }}>
            <Form form={form} layout="vertical">
              <Row gutter={16}>
                <Col span={6}>
                  <Form.Item name="date" label="Date" rules={[{ required: true }]}>
                    <Input />
                  </Form.Item>
                </Col>
                <Col span={6}>
                  <Form.Item name="piece_ref" label="N° facture">
                    <Input />
                  </Form.Item>
                </Col>
                <Col span={6}>
                  <Form.Item label="Journal">
                    <Select
                      value={journalId}
                      onChange={setJournalId}
                      options={journaux.map((j: Journal) => ({ value: j.id, label: `${j.code} — ${j.intitule}` }))}
                    />
                  </Form.Item>
                </Col>
                <Col span={6}>
                  <Form.Item name="libelle" label="Libellé" rules={[{ required: true }]}>
                    <Input />
                  </Form.Item>
                </Col>
              </Row>
            </Form>

            <Divider orientation="left" plain>Lignes comptables</Divider>
            <Table
              dataSource={lignes}
              columns={columns}
              rowKey={(r, i) => String(i)}
              pagination={false}
              size="small"
            />

            <div style={{ marginTop: 16, textAlign: 'right' }}>
              <Space>
                <Button onClick={() => { setResult(null); setLignes([]); form.resetFields(); }}>
                  Annuler
                </Button>
                <Button
                  type="primary"
                  icon={<CheckOutlined />}
                  loading={saving}
                  onClick={handleValider}
                >
                  Valider l'écriture
                </Button>
              </Space>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
