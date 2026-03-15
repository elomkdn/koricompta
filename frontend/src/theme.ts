import type { ThemeConfig } from 'antd';

export const PRIMARY = '#1a56db';
export const SIDEBAR_BG = '#0f172a';
export const CONTENT_BG = '#f1f5f9';
export const BORDER = '#e2e8f0';
export const TEXT_PRIMARY = '#0f172a';
export const TEXT_SECONDARY = '#64748b';
export const SUCCESS = '#059669';
export const WARNING = '#d97706';
export const DANGER = '#dc2626';

export const antTheme: ThemeConfig = {
  token: {
    colorPrimary: PRIMARY,
    colorSuccess: SUCCESS,
    colorWarning: WARNING,
    colorError: DANGER,
    borderRadius: 8,
    borderRadiusSM: 6,
    fontFamily: "'Inter Variable', Inter, -apple-system, sans-serif",
    fontSize: 13,
    colorBgLayout: CONTENT_BG,
    colorBgContainer: '#ffffff',
    colorBorder: BORDER,
    colorTextBase: TEXT_PRIMARY,
    colorTextSecondary: TEXT_SECONDARY,
    boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
    boxShadowSecondary: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
  },
  components: {
    Table: {
      headerBg: '#f8fafc',
      headerColor: TEXT_SECONDARY,
      rowHoverBg: '#f8fafc',
      borderColor: BORDER,
      headerSplitColor: BORDER,
    },
    Card: {
      paddingLG: 20,
    },
    Button: {
      borderRadius: 6,
      fontWeight: 500,
    },
    Input: {
      borderRadius: 6,
    },
    Select: {
      borderRadius: 6,
    },
    Modal: {
      borderRadiusLG: 12,
    },
    Tabs: {
      inkBarColor: PRIMARY,
      itemActiveColor: PRIMARY,
      itemSelectedColor: PRIMARY,
    },
    Menu: {
      darkItemBg: SIDEBAR_BG,
      darkItemSelectedBg: 'rgba(26,86,219,0.15)',
    },
    Tag: {
      borderRadiusSM: 4,
    },
  },
};
