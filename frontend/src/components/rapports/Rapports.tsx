import React, { useState, useCallback } from 'react';
import {
  Tabs, Table, Button, Space, Alert, Spin, Typography, Card,
  Row, Col, Statistic, Divider, Tag, Select,
} from 'antd';
import {
  DownloadOutlined, ReloadOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type {
  Societe, ExerciceComptable,
  BalanceData, LigneBalance,
  BilanData, CompteResultatData,
} from '../../types';
import { rapportsApi, grandLivreAuxiliaireApi, tiersApi } from '../../services/api';
import type { Tiers } from '../../types';

const { Title, Text } = Typography;

// ---- Utilitaires ----

function fmt(val: string | number | undefined): string {
  if (val === undefined || val === null) return '—';
  const n = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(n)) return '—';
  return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}

function num(val: string | undefined): number {
  if (!val) return 0;
  return parseFloat(val) || 0;
}

function isPositif(val: string | undefined): boolean {
  return num(val) >= 0;
}

const STYLE_TOTAL: React.CSSProperties = {
  fontWeight: 700,
  background: '#f0f2f5',
};

const STYLE_SECTION: React.CSSProperties = {
  fontWeight: 600,
  background: '#e6f4ff',
  color: '#1a3c5e',
};

const STYLE_SOUS_TOTAL: React.CSSProperties = {
  fontWeight: 600,
  background: '#fafafa',
};

// ============================================================
// ONGLET BALANCE
// ============================================================

interface BalanceTabProps {
  societe: Societe;
  exercice: ExerciceComptable;
}

function BalanceTab({ societe, exercice }: BalanceTabProps) {
  const [data, setData] = useState<BalanceData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const charger = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await rapportsApi.balance(societe.id, exercice.id);
      setData(res.data);
    } catch {
      setError('Erreur lors du chargement de la balance.');
    } finally {
      setLoading(false);
    }
  }, [societe.id, exercice.id]);

  const colonnes: ColumnsType<LigneBalance> = [
    { title: 'N° Compte', dataIndex: 'numero', key: 'numero', width: 120 },
    { title: 'Intitulé', dataIndex: 'intitule', key: 'intitule' },
    {
      title: 'Débit cumulé', dataIndex: 'total_debit', key: 'total_debit',
      align: 'right', width: 150,
      render: (v) => fmt(v),
    },
    {
      title: 'Crédit cumulé', dataIndex: 'total_credit', key: 'total_credit',
      align: 'right', width: 150,
      render: (v) => fmt(v),
    },
    {
      title: 'Solde débiteur', dataIndex: 'solde_debiteur', key: 'solde_debiteur',
      align: 'right', width: 150,
      render: (v) => num(v) > 0 ? <Text strong>{fmt(v)}</Text> : <Text type="secondary">—</Text>,
    },
    {
      title: 'Solde créditeur', dataIndex: 'solde_crediteur', key: 'solde_crediteur',
      align: 'right', width: 150,
      render: (v) => num(v) > 0 ? <Text strong>{fmt(v)}</Text> : <Text type="secondary">—</Text>,
    },
  ];

  const summary = data ? (
    <Table.Summary.Row style={STYLE_TOTAL}>
      <Table.Summary.Cell index={0} colSpan={2}>
        <Text strong>TOTAUX</Text>
      </Table.Summary.Cell>
      <Table.Summary.Cell index={2} align="right">
        <Text strong>{fmt(data.total_debit)}</Text>
      </Table.Summary.Cell>
      <Table.Summary.Cell index={3} align="right">
        <Text strong>{fmt(data.total_credit)}</Text>
      </Table.Summary.Cell>
      <Table.Summary.Cell index={4} align="right">
        <Text strong>{fmt(data.total_solde_debiteur)}</Text>
      </Table.Summary.Cell>
      <Table.Summary.Cell index={5} align="right">
        <Text strong>{fmt(data.total_solde_crediteur)}</Text>
      </Table.Summary.Cell>
    </Table.Summary.Row>
  ) : undefined;

  const equilibree = data
    ? Math.abs(num(data.total_debit) - num(data.total_credit)) < 0.01
    : null;

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<ReloadOutlined />} onClick={charger} loading={loading}>
          Générer la balance
        </Button>
        {data && (
          <Button
            icon={<DownloadOutlined />}
            href={rapportsApi.exportBalance(societe.id, exercice.id)}
            download
          >
            Export Excel
          </Button>
        )}
      </Space>

      {error && <Alert type="error" message={error} style={{ marginBottom: 12 }} />}

      {data && (
        <>
          <Alert
            type={equilibree ? 'success' : 'error'}
            message={
              equilibree
                ? 'Balance équilibrée — Total débits = Total crédits'
                : 'Attention : la balance n\'est pas équilibrée !'
            }
            style={{ marginBottom: 12 }}
            showIcon
          />
          <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
            {data.lignes.length} compte(s) mouvementé(s)
          </Text>
        </>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48 }}><Spin size="large" /></div>
      ) : data ? (
        <Table
          dataSource={data.lignes}
          columns={colonnes}
          rowKey="numero"
          size="small"
          pagination={{ pageSize: 50, showSizeChanger: true, showTotal: (t) => `${t} comptes` }}
          summary={() => summary}
          bordered
        />
      ) : (
        <Card style={{ textAlign: 'center', color: '#999' }}>
          Cliquez sur "Générer la balance" pour afficher les données.
        </Card>
      )}
    </div>
  );
}

// ============================================================
// ONGLET GRAND LIVRE
// ============================================================

function GrandLivreTab({ societe, exercice }: { societe: Societe; exercice: ExerciceComptable }) {
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const charger = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await rapportsApi.grandLivre(societe.id, exercice.id);
      setData(res.data);
    } catch {
      setError('Erreur lors du chargement du grand livre.');
    } finally {
      setLoading(false);
    }
  }, [societe.id, exercice.id]);

  const colonnes: ColumnsType<any> = [
    { title: 'Date', dataIndex: 'date', key: 'date', width: 100 },
    { title: 'Journal', dataIndex: 'journal', key: 'journal', width: 80 },
    { title: 'Pièce', dataIndex: 'piece', key: 'piece', width: 100 },
    { title: 'Libellé', dataIndex: 'libelle', key: 'libelle' },
    { title: 'Débit', dataIndex: 'debit', key: 'debit', align: 'right' as const, width: 130, render: (v: string) => num(v) > 0 ? fmt(v) : '—' },
    { title: 'Crédit', dataIndex: 'credit', key: 'credit', align: 'right' as const, width: 130, render: (v: string) => num(v) > 0 ? fmt(v) : '—' },
    {
      title: 'Solde', dataIndex: 'solde_progressif', key: 'solde_progressif',
      align: 'right' as const, width: 130,
      render: (v: string) => (
        <Text type={num(v) >= 0 ? undefined : 'danger'}>{fmt(v)}</Text>
      ),
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<ReloadOutlined />} onClick={charger} loading={loading}>
          Générer le grand livre
        </Button>
        {data && (
          <Button
            icon={<DownloadOutlined />}
            href={rapportsApi.exportGrandLivre(societe.id, exercice.id)}
            download
          >
            Export Excel
          </Button>
        )}
      </Space>

      {error && <Alert type="error" message={error} style={{ marginBottom: 12 }} />}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48 }}><Spin size="large" /></div>
      ) : data ? (
        <div>
          {(data.comptes as any[]).map((compte: any) => (
            <Card
              key={compte.numero}
              size="small"
              style={{ marginBottom: 16 }}
              title={
                <Space>
                  <Text strong>{compte.numero}</Text>
                  <Text>{compte.intitule}</Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Solde ouverture : {fmt(compte.solde_initial)}
                  </Text>
                </Space>
              }
              extra={
                <Space>
                  <Text>Débit : <Text strong>{fmt(compte.total_debit)}</Text></Text>
                  <Divider type="vertical" />
                  <Text>Crédit : <Text strong>{fmt(compte.total_credit)}</Text></Text>
                  <Divider type="vertical" />
                  <Text>Solde final : <Text strong type={num(compte.solde_final) >= 0 ? undefined : 'danger'}>{fmt(compte.solde_final)}</Text></Text>
                </Space>
              }
            >
              <Table
                dataSource={compte.lignes}
                columns={colonnes}
                rowKey={(r, i) => `${compte.numero}-${i}`}
                size="small"
                pagination={false}
                bordered={false}
              />
            </Card>
          ))}
        </div>
      ) : (
        <Card style={{ textAlign: 'center', color: '#999' }}>
          Cliquez sur "Générer le grand livre" pour afficher les données.
        </Card>
      )}
    </div>
  );
}

// ============================================================
// ONGLET BILAN (SYSCOHADA)
// ============================================================

interface LigneBilan {
  ref?: string;
  libelle: string;
  montant: string;
  style?: React.CSSProperties;
}

function BilanTab({ societe, exercice }: { societe: Societe; exercice: ExerciceComptable }) {
  const [data, setData] = useState<BilanData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const charger = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await rapportsApi.bilan(societe.id, exercice.id);
      setData(res.data);
    } catch {
      setError('Erreur lors du chargement du bilan.');
    } finally {
      setLoading(false);
    }
  }, [societe.id, exercice.id]);

  const renderSection = (titre: string, lignes: LigneBilan[]) => (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <thead>
        <tr style={{ background: '#1a3c5e', color: '#fff' }}>
          <th style={{ padding: '8px 12px', textAlign: 'left', width: '70%' }}>{titre}</th>
          <th style={{ padding: '8px 12px', textAlign: 'right', width: '30%' }}>Montant</th>
        </tr>
      </thead>
      <tbody>
        {lignes.map((l, i) => (
          <tr key={i} style={{ ...l.style, borderBottom: '1px solid #f0f0f0' }}>
            <td style={{ padding: '6px 12px' }}>{l.libelle}</td>
            <td style={{ padding: '6px 12px', textAlign: 'right', fontFamily: 'monospace' }}>
              {fmt(l.montant)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  const actifLignes = data
    ? ([
        { libelle: 'Actif immobilisé (net)', montant: data.actif.immobilise, style: {} },
        { libelle: 'Stocks', montant: data.actif.stocks, style: {} },
        { libelle: 'Créances clients', montant: data.actif.creances_clients, style: {} },
        { libelle: 'Autres créances', montant: data.actif.autres_creances, style: {} },
        { libelle: 'Trésorerie (actif)', montant: data.actif.tresorerie, style: {} },
        {
          libelle: 'TOTAL ACTIF',
          montant: data.actif.total,
          style: { ...STYLE_TOTAL, fontSize: 14 },
        },
      ] as LigneBilan[])
    : [];

  const passifLignes = data
    ? ([
        { libelle: 'Capitaux propres', montant: data.passif.capitaux_propres, style: {} },
        { libelle: 'Dettes financières', montant: data.passif.dettes_financieres, style: {} },
        { libelle: 'Dettes fournisseurs', montant: data.passif.fournisseurs, style: {} },
        { libelle: 'Dettes fiscales et sociales', montant: data.passif.dettes_fiscales_sociales, style: {} },
        { libelle: 'Autres dettes', montant: data.passif.autres_dettes, style: {} },
        { libelle: 'Trésorerie (passif)', montant: data.passif.tresorerie, style: {} },
        {
          libelle: 'TOTAL PASSIF',
          montant: data.passif.total,
          style: { ...STYLE_TOTAL, fontSize: 14 },
        },
      ] as LigneBilan[])
    : [];

  const equilibre = data
    ? Math.abs(num(data.actif.total) - num(data.passif.total)) < 1
    : null;

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<ReloadOutlined />} onClick={charger} loading={loading}>
          Générer le bilan
        </Button>
      </Space>

      {error && <Alert type="error" message={error} style={{ marginBottom: 12 }} />}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48 }}><Spin size="large" /></div>
      ) : data ? (
        <>
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <Title level={4} style={{ margin: 0 }}>BILAN COMPTABLE — {data.exercice}</Title>
            <Text type="secondary">{societe.nom}</Text>
            {equilibre !== null && (
              <div style={{ marginTop: 8 }}>
                <Tag color={equilibre ? 'green' : 'red'}>
                  {equilibre ? 'Bilan équilibré' : 'Bilan non équilibré'}
                </Tag>
              </div>
            )}
          </div>

          <Row gutter={24}>
            <Col span={12}>
              {renderSection('ACTIF', actifLignes)}
            </Col>
            <Col span={12}>
              {renderSection('PASSIF', passifLignes)}
            </Col>
          </Row>

          <Row gutter={16} style={{ marginTop: 24 }}>
            <Col span={8}>
              <Card size="small">
                <Statistic
                  title="Total Actif"
                  value={num(data.actif.total)}
                  formatter={(v) => fmt(String(v))}
                />
              </Card>
            </Col>
            <Col span={8}>
              <Card size="small">
                <Statistic
                  title="Total Passif"
                  value={num(data.passif.total)}
                  formatter={(v) => fmt(String(v))}
                />
              </Card>
            </Col>
            <Col span={8}>
              <Card size="small">
                <Statistic
                  title="Capitaux propres"
                  value={num(data.passif.capitaux_propres)}
                  formatter={(v) => fmt(String(v))}
                  valueStyle={{ color: num(data.passif.capitaux_propres) >= 0 ? '#3f8600' : '#cf1322' }}
                />
              </Card>
            </Col>
          </Row>
        </>
      ) : (
        <Card style={{ textAlign: 'center', color: '#999' }}>
          Cliquez sur "Générer le bilan" pour afficher les données.
        </Card>
      )}
    </div>
  );
}

// ============================================================
// ONGLET COMPTE DE RÉSULTAT (SYSCOHADA)
// ============================================================

interface LigneCR {
  libelle: string;
  montant?: string;
  style?: React.CSSProperties;
  indent?: number;
}

function CompteResultatTab({ societe, exercice }: { societe: Societe; exercice: ExerciceComptable }) {
  const [data, setData] = useState<CompteResultatData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const charger = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await rapportsApi.compteResultat(societe.id, exercice.id);
      setData(res.data);
    } catch {
      setError('Erreur lors du chargement du compte de résultat.');
    } finally {
      setLoading(false);
    }
  }, [societe.id, exercice.id]);

  const lignes: LigneCR[] = data
    ? [
        // --- Activité ordinaire ---
        { libelle: 'ACTIVITÉ ORDINAIRE', style: STYLE_SECTION },
        { libelle: 'Ventes de marchandises', montant: data.produits.ventes_marchandises, indent: 1 },
        { libelle: '(-) Achats de marchandises', montant: data.charges.achats_marchandises, indent: 1 },
        { libelle: '(-) Variation stocks marchandises', montant: data.charges.achats_matieres, indent: 1 },
        {
          libelle: '= MARGE BRUTE SUR MARCHANDISES',
          montant: data.marges.marge_brute_marchandises,
          style: STYLE_SOUS_TOTAL,
        },

        { libelle: 'Ventes de produits / services', montant: data.produits.ventes_produits, indent: 1 },
        { libelle: '(-) Achats matières et fournitures', montant: data.charges.achats_matieres, indent: 1 },
        {
          libelle: '= MARGE BRUTE SUR MATIÈRES',
          montant: data.marges.marge_brute_matieres,
          style: STYLE_SOUS_TOTAL,
        },

        { libelle: 'Produits accessoires', montant: data.produits.produits_accessoires, indent: 1 },
        { libelle: '(-) Transports', montant: data.charges.transports, indent: 1 },
        { libelle: '(-) Services extérieurs', montant: data.charges.services_exterieurs, indent: 1 },
        {
          libelle: '= VALEUR AJOUTÉE',
          montant: data.marges.valeur_ajoutee,
          style: { ...STYLE_SOUS_TOTAL, color: '#1a3c5e' },
        },

        { libelle: '(-) Impôts et taxes', montant: data.charges.impots_taxes, indent: 1 },
        { libelle: '(-) Charges de personnel', montant: data.charges.charges_personnel, indent: 1 },
        {
          libelle: '= EXCÉDENT BRUT D\'EXPLOITATION (EBE)',
          montant: data.marges.ebe,
          style: { ...STYLE_SOUS_TOTAL, color: '#1a3c5e' },
        },

        { libelle: '(+) Autres produits d\'exploitation', montant: data.produits.autres_produits, indent: 1 },
        { libelle: '(+) Reprises de provisions', montant: undefined, indent: 1 },
        { libelle: '(-) Dotations aux amortissements', montant: data.charges.dotations, indent: 1 },
        { libelle: '(-) Autres charges d\'exploitation', montant: data.charges.autres_charges, indent: 1 },
        {
          libelle: '= RÉSULTAT D\'EXPLOITATION',
          montant: data.marges.resultat_exploitation,
          style: { ...STYLE_SOUS_TOTAL, color: '#1a3c5e' },
        },

        // --- Résultat financier ---
        { libelle: 'RÉSULTAT FINANCIER', style: STYLE_SECTION },
        { libelle: '(+) Produits financiers', montant: data.produits.produits_financiers, indent: 1 },
        { libelle: '(-) Charges financières', montant: data.charges.charges_financieres, indent: 1 },
        {
          libelle: '= RÉSULTAT FINANCIER',
          montant: data.marges.resultat_financier,
          style: STYLE_SOUS_TOTAL,
        },

        {
          libelle: '= RÉSULTAT DES ACTIVITÉS ORDINAIRES',
          montant: data.marges.resultat_activites_ordinaires,
          style: { fontWeight: 700, background: '#d6e4ff' },
        },

        // --- HAO ---
        { libelle: 'HORS ACTIVITÉS ORDINAIRES (HAO)', style: STYLE_SECTION },
        { libelle: '(+) Produits HAO', montant: data.produits.produits_hao, indent: 1 },
        { libelle: '(-) Charges HAO', montant: data.charges.charges_hao, indent: 1 },
        {
          libelle: '= RÉSULTAT HAO',
          montant: data.marges.resultat_hao,
          style: STYLE_SOUS_TOTAL,
        },

        // --- Résultat net ---
        { libelle: '(-) Impôt sur le bénéfice', montant: data.charges.impots_benefice, indent: 1 },
        {
          libelle: 'RÉSULTAT NET DE L\'EXERCICE',
          montant: data.marges.resultat_net,
          style: {
            fontWeight: 700,
            fontSize: 14,
            background: num(data.marges.resultat_net) >= 0 ? '#f6ffed' : '#fff2f0',
            color: num(data.marges.resultat_net) >= 0 ? '#3f8600' : '#cf1322',
          },
        },
      ]
    : [];

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<ReloadOutlined />} onClick={charger} loading={loading}>
          Générer le compte de résultat
        </Button>
      </Space>

      {error && <Alert type="error" message={error} style={{ marginBottom: 12 }} />}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48 }}><Spin size="large" /></div>
      ) : data ? (
        <>
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <Title level={4} style={{ margin: 0 }}>
              COMPTE DE RÉSULTAT — {data.exercice}
            </Title>
            <Text type="secondary">{societe.nom}</Text>
          </div>

          <Row gutter={16} style={{ marginBottom: 20 }}>
            <Col span={6}>
              <Card size="small">
                <Statistic
                  title="Total Produits"
                  value={num(data.produits.total)}
                  formatter={(v) => fmt(String(v))}
                  valueStyle={{ color: '#3f8600' }}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <Statistic
                  title="Total Charges"
                  value={num(data.charges.total)}
                  formatter={(v) => fmt(String(v))}
                  valueStyle={{ color: '#cf1322' }}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <Statistic
                  title="Valeur Ajoutée"
                  value={num(data.marges.valeur_ajoutee)}
                  formatter={(v) => fmt(String(v))}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <Statistic
                  title="Résultat Net"
                  value={num(data.marges.resultat_net)}
                  formatter={(v) => fmt(String(v))}
                  valueStyle={{
                    color: num(data.marges.resultat_net) >= 0 ? '#3f8600' : '#cf1322',
                  }}
                  suffix={
                    <Tag color={num(data.marges.resultat_net) >= 0 ? 'green' : 'red'}>
                      {num(data.marges.resultat_net) >= 0 ? 'Bénéfice' : 'Perte'}
                    </Tag>
                  }
                />
              </Card>
            </Col>
          </Row>

          <table style={{ width: '100%', maxWidth: 700, borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#1a3c5e', color: '#fff' }}>
                <th style={{ padding: '8px 12px', textAlign: 'left' }}>
                  COMPTE DE RÉSULTAT — SYSCOHADA
                </th>
                <th style={{ padding: '8px 12px', textAlign: 'right', width: 160 }}>Montant</th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((l, i) => (
                <tr key={i} style={{ ...l.style, borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '5px 12px', paddingLeft: l.indent ? 12 + (l.indent * 16) : 12 }}>
                    {l.libelle}
                  </td>
                  <td style={{ padding: '5px 12px', textAlign: 'right', fontFamily: 'monospace' }}>
                    {l.montant !== undefined
                      ? (
                        <Text
                          type={num(l.montant) < 0 ? 'danger' : undefined}
                          strong={Boolean(l.style?.fontWeight)}
                        >
                          {fmt(l.montant)}
                        </Text>
                      )
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <Card style={{ textAlign: 'center', color: '#999' }}>
          Cliquez sur "Générer le compte de résultat" pour afficher les données.
        </Card>
      )}
    </div>
  );
}

// ============================================================
// GRAND LIVRE AUXILIAIRE
// ============================================================

function GrandLivreAuxiliaireTab({ societe, exercice }: { societe: Societe; exercice: ExerciceComptable }) {
  const [tiers, setTiers] = useState<Tiers[]>([]);
  const [filterTiers, setFilterTiers] = useState<number | undefined>();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    tiersApi.list(societe.id)
      .then(res => setTiers(res.data.results ?? res.data))
      .catch(() => {});
  }, [societe.id]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await grandLivreAuxiliaireApi.get(societe.id, exercice.id, filterTiers);
      setData(res.data);
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [societe.id, exercice.id, filterTiers]);

  const ligneColumns: ColumnsType<any> = [
    { title: 'Date', dataIndex: 'date_piece', key: 'date_piece', width: 100 },
    { title: 'Journal', dataIndex: 'journal_code', key: 'journal_code', width: 75 },
    { title: 'N° Pièce', dataIndex: 'numero_piece', key: 'numero_piece', width: 110 },
    { title: 'Compte', dataIndex: 'compte_numero', key: 'compte_numero', width: 100 },
    { title: 'Libellé', dataIndex: 'libelle', key: 'libelle' },
    { title: 'Débit', dataIndex: 'debit', key: 'debit', width: 120, align: 'right' as const,
      render: (v: string) => Number(v) ? Number(v).toLocaleString('fr-FR', { minimumFractionDigits: 2 }) : '' },
    { title: 'Crédit', dataIndex: 'credit', key: 'credit', width: 120, align: 'right' as const,
      render: (v: string) => Number(v) ? Number(v).toLocaleString('fr-FR', { minimumFractionDigits: 2 }) : '' },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Select
          allowClear showSearch
          placeholder="Filtrer par tiers..."
          style={{ width: 280 }}
          value={filterTiers}
          onChange={(v: number | undefined) => setFilterTiers(v)}
          filterOption={(input: string, option?: { label: string; value: number }) =>
            String(option?.label || '').toLowerCase().includes(input.toLowerCase())}
          options={tiers.map(t => ({ value: t.id, label: `${t.code} — ${t.nom}` }))}
        />
        <Button type="primary" icon={<ReloadOutlined />} loading={loading} onClick={load}>
          Générer
        </Button>
      </Space>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48 }}><Spin size="large" /></div>
      ) : data.length > 0 ? (
        data.map((item: any) => (
          <Card
            key={item.tiers_id}
            size="small"
            style={{ marginBottom: 12 }}
            title={
              <Space>
                <Text strong>{item.tiers_code}</Text>
                <Text>{item.tiers_nom}</Text>
                <Tag color={Number(item.solde) >= 0 ? 'blue' : 'green'}>
                  Solde : {Number(item.solde).toLocaleString('fr-FR', { minimumFractionDigits: 2 })}
                  {Number(item.solde) >= 0 ? ' D' : ' C'}
                </Tag>
              </Space>
            }
          >
            <Table
              dataSource={item.lignes}
              columns={ligneColumns}
              rowKey={(r, i) => `${item.tiers_id}-${i}`}
              pagination={false}
              size="small"
            />
            <Row justify="end" style={{ marginTop: 4, paddingRight: 8 }}>
              <Space>
                <Text type="secondary">Total débit : <Text strong>
                  {Number(item.solde_debit).toLocaleString('fr-FR', { minimumFractionDigits: 2 })}
                </Text></Text>
                <Text type="secondary">Total crédit : <Text strong>
                  {Number(item.solde_credit).toLocaleString('fr-FR', { minimumFractionDigits: 2 })}
                </Text></Text>
              </Space>
            </Row>
          </Card>
        ))
      ) : (
        <Card style={{ textAlign: 'center', color: '#999' }}>
          Cliquez sur "Générer" pour afficher le grand livre auxiliaire.
        </Card>
      )}
    </div>
  );
}

// ============================================================
// COMPOSANT PRINCIPAL
// ============================================================

interface Props {
  societe: Societe;
  exercice: ExerciceComptable;
}

export default function Rapports({ societe, exercice }: Props) {
  const items = [
    {
      key: 'balance',
      label: 'Balance',
      children: <BalanceTab societe={societe} exercice={exercice} />,
    },
    {
      key: 'grand-livre',
      label: 'Grand Livre',
      children: <GrandLivreTab societe={societe} exercice={exercice} />,
    },
    {
      key: 'bilan',
      label: 'Bilan',
      children: <BilanTab societe={societe} exercice={exercice} />,
    },
    {
      key: 'compte-resultat',
      label: 'Compte de Résultat',
      children: <CompteResultatTab societe={societe} exercice={exercice} />,
    },
    {
      key: 'grand-livre-auxiliaire',
      label: 'Grand Livre Auxiliaire',
      children: <GrandLivreAuxiliaireTab societe={societe} exercice={exercice} />,
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>Rapports & États Financiers</Title>
        <Text type="secondary">
          {societe.nom} — Exercice {exercice.code}
          {exercice.statut === 'cloture' && (
            <Tag color="red" style={{ marginLeft: 8 }}>Clôturé</Tag>
          )}
        </Text>
      </div>
      <Tabs defaultActiveKey="balance" items={items} type="card" />
    </div>
  );
}
