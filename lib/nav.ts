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
  CalendarDays,
  Factory,
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
  MessageCircle,
} from "lucide-react";

export type NavItem = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  /** Retiré du menu, mais la route, les permissions et le titre de page
   * restent en place : la page se rejoint encore par son URL. */
  masque?: boolean;
  /** Modules fusionnés dans celui-ci : l'entrée reste visible pour un rôle qui
   * avait accès à l'un d'eux (ex. « Réception ST » → Magasin produits finis). */
  aussi?: string[];
};

/** Un rôle voit une entrée s'il a son module, ou l'un des modules fusionnés dedans. */
export const entreeAutorisee = (it: Pick<NavItem, "id" | "aussi">, modules: Record<string, boolean>) =>
  modules[it.id] !== false || (it.aussi ?? []).some((a) => modules[a] === true);

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
      { id: "messagerie", label: "Messagerie", href: "/messagerie", icon: MessageCircle },
      { id: "alertes", label: "Alertes", href: "/alertes", icon: AlertCircle },
      { id: "stats", label: "Statistiques", href: "/stats", icon: TrendingUp },
      { id: "tracabilite", label: "Traçabilité", href: "/tracabilite", icon: SearchCheck },
    ],
  },
  {
    label: "1 · Commande client",
    stage: 1,
    items: [
      { id: "clients", label: "Clients", href: "/clients", icon: Building2 },
      { id: "commandes", label: "Commandes", href: "/commandes", icon: Package },
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
      { id: "planfacon", label: "Plan façonnier", href: "/planfacon", icon: Handshake },
    ],
  },
  {
    label: "4 · Production",
    stage: 4,
    items: [
      { id: "gpao_prod", label: "GPAO Production", href: "/gpao_prod", icon: Factory },
      { id: "personnel", label: "Personnel", href: "/personnel", icon: UsersRound },
      { id: "operations", label: "Opérations & SAM", href: "/operations", icon: ListChecks },
      { id: "qrouv", label: "QR rendement", href: "/qrouv", icon: QrCode },
      /* Fusionné dans « Magasin produits finis » (onglet Réceptions façonniers) :
       * l'adresse /br y redirige, le droit « br » donne toujours accès. */
      { id: "br", label: "Réception ST", href: "/magasin?onglet=receptions", icon: PackageCheck, masque: true },
    ],
  },
  {
    label: "5 · Magasin & Export",
    stage: 5,
    items: [
      { id: "magasin", label: "Magasin produits finis", href: "/magasin", icon: Warehouse, aussi: ["br"] },
      { id: "prevexport", label: "Prévision export", href: "/prevexport", icon: CalendarClock },
      { id: "bl", label: "Bons livraison", href: "/bl", icon: FileText },
      { id: "factures", label: "Factures HT", href: "/factures", icon: Banknote },
      { id: "grand_livre", label: "Grand Livre Fourn.", href: "/grand_livre", icon: BookText },
      { id: "archives", label: "Archives", href: "/archives", icon: Archive },
    ],
  },
  {
    label: "Qualité & Outils",
    items: [
      /* « QRQC / 5M » et « Plans d'actions » sont l'onglet « Actions & QRQC »
       * du contrôle qualité : un rôle qui avait l'un des deux y garde accès. */
      { id: "qc", label: "Qualité & actions", href: "/qc", icon: ShieldCheck, aussi: ["qrqc", "actions"] },
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
  messagerie: "Messages à l'équipe, discussions et groupes",
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
  gpao_prod: "Suivi journalier, chaînes, modèles, rendement",
  br: "Bons de réception façonniers, contrôle qualité",
  magasin: "Entrées (interne, façonniers, retouches) → stock → expéditions",
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
  qc: "Inspections AQL, barèmes clients, actions correctives, QRQC 5M et plans d'actions",
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
