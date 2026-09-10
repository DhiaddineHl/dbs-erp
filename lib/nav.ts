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
  Landmark,
  ClipboardList as ClipboardListIcon,
  FlaskConical,
  BarChart3,
  CalendarRange,
  CalendarDays,
  Factory,
  ClipboardList,
  PackageCheck,
  Warehouse,
  FileText,
  Banknote,
  BookText,
  Archive,
  SearchCheck,
  CalendarClock,
  QrCode,
  ScrollText,
  UsersRound,
  ShieldCheck,
  ShieldOff,
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
  /** Retiré du menu, mais la route, les permissions et le titre de page
   * restent en place : la page se rejoint encore par son URL. */
  masque?: boolean;
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
      { id: "tracabilite", label: "Traçabilité", href: "/tracabilite", icon: SearchCheck },
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
    label: "2 · Préparation & lancement",
    stage: 2,
    items: [
      { id: "dt", label: "Direction Technique", href: "/dt", icon: Landmark },
      { id: "modelisme", label: "Bureau Modélisme", href: "/modelisme", icon: PencilRuler },
      { id: "nomen", label: "Nomenclature", href: "/nomen", icon: ClipboardListIcon },
      { id: "magtissu", label: "Magasin Tissu", href: "/magtissu", icon: Layers },
      { id: "magfour", label: "Magasin Fournitures", href: "/magfour", icon: Boxes },
    ],
  },
  {
    label: "3 · Préparation atelier",
    stage: 3,
    items: [{ id: "coupe", label: "Service Coupe", href: "/coupe", icon: Scissors }],
  },
  {
    label: "Méthodes",
    items: [
      { id: "planning", label: "Planning général", href: "/planning", icon: CalendarDays },
      { id: "gammes", label: "Gammes & SAM", href: "/gammes", icon: FlaskConical, masque: true },
      { id: "capacite", label: "Capacité & Costing", href: "/capacite", icon: BarChart3, masque: true },
      { id: "ordonnancement", label: "Ordonnancement", href: "/ordonnancement", icon: CalendarRange, masque: true },
      { id: "planfacon", label: "Plan façonnier", href: "/planfacon", icon: Handshake },
    ],
  },
  {
    label: "4 · Production",
    stage: 4,
    items: [
      { id: "gpao_prod", label: "GPAO Production", href: "/gpao_prod", icon: Factory },
      { id: "ofs", label: "Ordres fabrication", href: "/ofs", icon: ClipboardList, masque: true },
      { id: "personnel", label: "Personnel", href: "/personnel", icon: UsersRound },
      { id: "operations", label: "Opérations & SAM", href: "/operations", icon: ListChecks },
      { id: "qrouv", label: "QR rendement", href: "/qrouv", icon: QrCode },
      { id: "br", label: "Réception ST", href: "/br", icon: PackageCheck },
    ],
  },
  {
    label: "5 · Magasin & Export",
    stage: 5,
    items: [
      { id: "magasin", label: "Produits finis", href: "/magasin", icon: Warehouse },
      { id: "prevexport", label: "Prévision export", href: "/prevexport", icon: CalendarClock },
      { id: "bl", label: "Bons livraison", href: "/bl", icon: FileText },
      { id: "factures", label: "Factures HT", href: "/factures", icon: Banknote, badge: 1 },
      { id: "grand_livre", label: "Grand Livre Fourn.", href: "/grand_livre", icon: BookText },
      { id: "archives", label: "Archives", href: "/archives", icon: Archive },
    ],
  },
  {
    label: "Qualité & Outils",
    items: [
      { id: "qc", label: "Contrôle Qualité PF", href: "/qc", icon: ShieldCheck },
      { id: "qrqc", label: "QRQC / 5M", href: "/qrqc", icon: SearchCheck },
      { id: "actions", label: "Plans d'actions", href: "/actions", icon: ListChecks, badge: 2 },
      { id: "journal", label: "Journal d'activité", href: "/journal", icon: ScrollText },
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
  // Route hors menu : getLandingPath() (lib/services/permissions.ts) y envoie
  // un rôle qui n'a plus aucun module — pas d'entrée dans NAV_STRUCTURE.
  "sans-acces": { label: "Aucun accès", subtitle: "Ce compte n'a de droit sur aucun module", icon: ShieldOff },
};

const SUBTITLES: Record<string, string> = {
  cockpit: "Vue d'ensemble",
  alertes: "Détection automatique des anomalies",
  stats: "Analyses CA, marges, performance",
  clients: "Répertoire clients — base de la facturation",
  commandes: "Commandes clients — prix, marges, tailles, OF",
  facon: "Référentiel des façonniers",
  dt: "Tête de série, OK production et feu vert de lancement",
  modelisme: "Patronage et tirage des tracés avant coupe",
  nomen: "Consommations tissu et besoins par commande",
  magtissu: "Réception, métrage et contrôle du tissu",
  magfour: "Réception des fournitures par référence",
  coupe: "Planning coupe — commandes au tissu libéré",
  planning: "Carnet de commandes côté planning — affectation, tissu, export",
  gammes: "Décomposition opératoire + temps standards",
  capacite: "Capacité ligne, coût MO, délais",
  ordonnancement: "Ordre de lancement & équilibrage de charge",
  gpao_prod: "Suivi journalier, chaînes, modèles, rendement",
  ofs: "Suivi production par OF et chaîne",
  br: "Bons de réception façonniers, contrôle qualité",
  magasin: "Réception PF → préparation → expédition",
  bl: "BL export — imprimables, liés aux commandes",
  factures: "Registre, encaissements, relances, marges",
  grand_livre: "Comptabilité fournisseurs — comptes, mouvements, échéancier",
  archives: "Commandes livrées, délais réels",
  tracabilite: "Cycle de vie complet d'une commande, imprimable",
  planfacon: "Charge mensuelle par façonnier, reste à produire",
  prevexport: "Échéancier des exports et statut logistique",
  personnel: "Registre de l'atelier, matricules et rattachement aux chaînes",
  operations: "Catalogue des opérations et temps standards",
  qrouv: "QR de rendement par ouvrière, imprimables",
  journal: "Qui a fait quoi, et quand",
  qc: "Inspection produit fini, échantillonnage AQL, barèmes clients",
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
