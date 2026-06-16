import {
  type LucideIcon,
  Target,
  AlertCircle,
  TrendingUp,
  Building2,
  Package,
  Handshake,
  Layers,
  Boxes,
  Scissors,
  PencilRuler,
  FlaskConical,
  BarChart3,
  CalendarRange,
  Factory,
  ClipboardList,
  PackageCheck,
  Warehouse,
  FileText,
  Banknote,
  Archive,
  SearchCheck,
  ListChecks,
  Settings,
} from "lucide-react";

export type NavItem = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  /** Static demo badge count (UI only — wired to data later) */
  badge?: number;
};

export type NavGroup = {
  label: string;
  /** Workflow stage 1..5 for colored accent */
  stage?: 1 | 2 | 3 | 4 | 5;
  items: NavItem[];
};

export const NAV_STRUCTURE: NavGroup[] = [
  {
    label: "Pilotage",
    items: [
      { id: "cockpit", label: "Cockpit", href: "/cockpit", icon: Target },
      { id: "alertes", label: "Alertes", href: "/alertes", icon: AlertCircle, badge: 3 },
      { id: "stats", label: "Statistiques", href: "/stats", icon: TrendingUp },
    ],
  },
  {
    label: "1 · Commande client",
    stage: 1,
    items: [
      { id: "clients", label: "Clients", href: "/clients", icon: Building2 },
      { id: "commandes", label: "Commandes", href: "/commandes", icon: Package, badge: 2 },
      { id: "facon", label: "Façonniers", href: "/facon", icon: Handshake },
    ],
  },
  {
    label: "2 · Réception matières",
    stage: 2,
    items: [
      { id: "tissus", label: "Tissus reçus", href: "/tissus", icon: Layers, badge: 4 },
      { id: "fournitures", label: "Fournitures", href: "/fournitures", icon: Boxes },
    ],
  },
  {
    label: "3 · Préparation",
    stage: 3,
    items: [
      { id: "coupe", label: "Service Coupe", href: "/coupe", icon: Scissors },
      { id: "be", label: "Bureau d'Études", href: "/be", icon: PencilRuler, badge: 1 },
    ],
  },
  {
    label: "Méthodes",
    items: [
      { id: "gammes", label: "Gammes & SAM", href: "/gammes", icon: FlaskConical },
      { id: "capacite", label: "Capacité & Costing", href: "/capacite", icon: BarChart3 },
      { id: "ordonnancement", label: "Ordonnancement", href: "/ordonnancement", icon: CalendarRange },
    ],
  },
  {
    label: "4 · Production",
    stage: 4,
    items: [
      { id: "gpao_prod", label: "GPAO Production", href: "/gpao_prod", icon: Factory },
      { id: "ofs", label: "Ordres fabrication", href: "/ofs", icon: ClipboardList },
      { id: "br", label: "Réception ST", href: "/br", icon: PackageCheck },
    ],
  },
  {
    label: "5 · Magasin & Export",
    stage: 5,
    items: [
      { id: "magasin", label: "Produits finis", href: "/magasin", icon: Warehouse },
      { id: "bl", label: "Bons livraison", href: "/bl", icon: FileText },
      { id: "factures", label: "Factures HT", href: "/factures", icon: Banknote, badge: 1 },
      { id: "archives", label: "Archives", href: "/archives", icon: Archive },
    ],
  },
  {
    label: "Qualité & Outils",
    items: [
      { id: "qrqc", label: "QRQC / 5M", href: "/qrqc", icon: SearchCheck },
      { id: "actions", label: "Plans d'actions", href: "/actions", icon: ListChecks, badge: 2 },
      { id: "parametres", label: "Paramètres", href: "/parametres", icon: Settings },
    ],
  },
];

/** Flat lookup of every page by id (for titles / subtitles). */
export const PAGE_META: Record<
  string,
  { label: string; subtitle: string; icon: LucideIcon }
> = {
  cockpit: { label: "Cockpit", subtitle: "Vue d'ensemble", icon: Target },
};

const SUBTITLES: Record<string, string> = {
  cockpit: "Vue d'ensemble",
  alertes: "Détection automatique des anomalies",
  stats: "Analyses CA, marges, performance",
  clients: "Répertoire clients — base de la facturation",
  commandes: "Commandes clients — prix, marges, tailles, OF",
  facon: "Référentiel des façonniers",
  tissus: "Contrôle réception → libération coupe",
  fournitures: "Boutons, fermetures, étiquettes…",
  coupe: "Planning coupe — commandes au tissu libéré",
  be: "Têtes de série → OK PRO client",
  gammes: "Décomposition opératoire + temps standards",
  capacite: "Capacité ligne, coût MO, délais",
  ordonnancement: "Ordre de lancement & équilibrage de charge",
  gpao_prod: "Suivi journalier, chaînes, modèles, rendement",
  ofs: "Suivi production par OF et chaîne",
  br: "Bons de réception façonniers, contrôle qualité",
  magasin: "Réception PF → préparation → expédition",
  bl: "BL export — imprimables, liés aux commandes",
  factures: "DBS Facturation 2026",
  archives: "Commandes livrées, délais réels",
  qrqc: "Résolution rapide de problèmes qualité",
  actions: "Suivi des actions correctives",
  parametres: "Configuration · données · comptes",
};

for (const group of NAV_STRUCTURE) {
  for (const item of group.items) {
    PAGE_META[item.id] = {
      label: item.label,
      subtitle: SUBTITLES[item.id] ?? "",
      icon: item.icon,
    };
  }
}
