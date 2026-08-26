import enAuth from './locales/en/auth.json';
import enCatalog from './locales/en/catalog.json';
import enCharts from './locales/en/charts.json';
import enCommon from './locales/en/common.json';
import enEmployees from './locales/en/employees.json';
import enErrors from './locales/en/errors.json';
import enNavigation from './locales/en/navigation.json';
import enOffline from './locales/en/offline.json';
import enOrders from './locales/en/orders.json';
import enPrinter from './locales/en/printer.json';
import enProducts from './locales/en/products.json';
import enSales from './locales/en/sales.json';
import enSettings from './locales/en/settings.json';
import enStatus from './locales/en/status.json';
import enSync from './locales/en/sync.json';
import esAuth from './locales/es/auth.json';
import esCatalog from './locales/es/catalog.json';
import esCharts from './locales/es/charts.json';
import esCommon from './locales/es/common.json';
import esEmployees from './locales/es/employees.json';
import esErrors from './locales/es/errors.json';
import esNavigation from './locales/es/navigation.json';
import esOffline from './locales/es/offline.json';
import esOrders from './locales/es/orders.json';
import esPrinter from './locales/es/printer.json';
import esProducts from './locales/es/products.json';
import esSales from './locales/es/sales.json';
import esSettings from './locales/es/settings.json';
import esStatus from './locales/es/status.json';
import esSync from './locales/es/sync.json';
import frAuth from './locales/fr/auth.json';
import frCatalog from './locales/fr/catalog.json';
import frCharts from './locales/fr/charts.json';
import frCommon from './locales/fr/common.json';
import frEmployees from './locales/fr/employees.json';
import frErrors from './locales/fr/errors.json';
import frNavigation from './locales/fr/navigation.json';
import frOffline from './locales/fr/offline.json';
import frOrders from './locales/fr/orders.json';
import frPrinter from './locales/fr/printer.json';
import frProducts from './locales/fr/products.json';
import frSales from './locales/fr/sales.json';
import frSettings from './locales/fr/settings.json';
import frStatus from './locales/fr/status.json';
import frSync from './locales/fr/sync.json';
import hiAuth from './locales/hi/auth.json';
import hiCatalog from './locales/hi/catalog.json';
import hiCharts from './locales/hi/charts.json';
import hiCommon from './locales/hi/common.json';
import hiEmployees from './locales/hi/employees.json';
import hiErrors from './locales/hi/errors.json';
import hiNavigation from './locales/hi/navigation.json';
import hiOffline from './locales/hi/offline.json';
import hiOrders from './locales/hi/orders.json';
import hiPrinter from './locales/hi/printer.json';
import hiProducts from './locales/hi/products.json';
import hiSales from './locales/hi/sales.json';
import hiSettings from './locales/hi/settings.json';
import hiStatus from './locales/hi/status.json';
import hiSync from './locales/hi/sync.json';
import ptBRAuth from './locales/pt-BR/auth.json';
import ptBRCatalog from './locales/pt-BR/catalog.json';
import ptBRCharts from './locales/pt-BR/charts.json';
import ptBRCommon from './locales/pt-BR/common.json';
import ptBREmployees from './locales/pt-BR/employees.json';
import ptBRErrors from './locales/pt-BR/errors.json';
import ptBRNavigation from './locales/pt-BR/navigation.json';
import ptBROffline from './locales/pt-BR/offline.json';
import ptBROrders from './locales/pt-BR/orders.json';
import ptBRPrinter from './locales/pt-BR/printer.json';
import ptBRProducts from './locales/pt-BR/products.json';
import ptBRSales from './locales/pt-BR/sales.json';
import ptBRSettings from './locales/pt-BR/settings.json';
import ptBRStatus from './locales/pt-BR/status.json';
import ptBRSync from './locales/pt-BR/sync.json';
import zhAuth from './locales/zh/auth.json';
import zhCatalog from './locales/zh/catalog.json';
import zhCharts from './locales/zh/charts.json';
import zhCommon from './locales/zh/common.json';
import zhEmployees from './locales/zh/employees.json';
import zhErrors from './locales/zh/errors.json';
import zhNavigation from './locales/zh/navigation.json';
import zhOffline from './locales/zh/offline.json';
import zhOrders from './locales/zh/orders.json';
import zhPrinter from './locales/zh/printer.json';
import zhProducts from './locales/zh/products.json';
import zhSales from './locales/zh/sales.json';
import zhSettings from './locales/zh/settings.json';
import zhStatus from './locales/zh/status.json';
import zhSync from './locales/zh/sync.json';

export const I18N_NAMESPACES = [
  'common',
  'auth',
  'navigation',
  'orders',
  'sales',
  'products',
  'employees',
  'charts',
  'settings',
  'sync',
  'printer',
  'offline',
  'status',
  'errors',
  'catalog',
] as const;

export const resources = {
  en: { auth: enAuth, catalog: enCatalog, charts: enCharts, common: enCommon, employees: enEmployees, errors: enErrors, navigation: enNavigation, offline: enOffline, orders: enOrders, printer: enPrinter, products: enProducts, sales: enSales, settings: enSettings, status: enStatus, sync: enSync },
  'pt-BR': { auth: ptBRAuth, catalog: ptBRCatalog, charts: ptBRCharts, common: ptBRCommon, employees: ptBREmployees, errors: ptBRErrors, navigation: ptBRNavigation, offline: ptBROffline, orders: ptBROrders, printer: ptBRPrinter, products: ptBRProducts, sales: ptBRSales, settings: ptBRSettings, status: ptBRStatus, sync: ptBRSync },
  es: { auth: esAuth, catalog: esCatalog, charts: esCharts, common: esCommon, employees: esEmployees, errors: esErrors, navigation: esNavigation, offline: esOffline, orders: esOrders, printer: esPrinter, products: esProducts, sales: esSales, settings: esSettings, status: esStatus, sync: esSync },
  fr: { auth: frAuth, catalog: frCatalog, charts: frCharts, common: frCommon, employees: frEmployees, errors: frErrors, navigation: frNavigation, offline: frOffline, orders: frOrders, printer: frPrinter, products: frProducts, sales: frSales, settings: frSettings, status: frStatus, sync: frSync },
  zh: { auth: zhAuth, catalog: zhCatalog, charts: zhCharts, common: zhCommon, employees: zhEmployees, errors: zhErrors, navigation: zhNavigation, offline: zhOffline, orders: zhOrders, printer: zhPrinter, products: zhProducts, sales: zhSales, settings: zhSettings, status: zhStatus, sync: zhSync },
  hi: { auth: hiAuth, catalog: hiCatalog, charts: hiCharts, common: hiCommon, employees: hiEmployees, errors: hiErrors, navigation: hiNavigation, offline: hiOffline, orders: hiOrders, printer: hiPrinter, products: hiProducts, sales: hiSales, settings: hiSettings, status: hiStatus, sync: hiSync },
} as const;
