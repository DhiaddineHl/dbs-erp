/* Plain reference data (no "use client") — safe to import from server code and
   the seed script as well as the client store. */

export const CLIENTS_DB: Record<string, { nom: string; adresse: string; livraison: string; marque: string }> = {
  gerard_darel: {
    nom: "ds fashion",
    adresse: "130 Rue Reaumur\n75002 Paris\nFrance",
    livraison: "Sed Logistique-BAT A2 porte13\nGERARD DAREL\n1 Rue Jean Jaures\n95670 MARLY LA VILLE",
    marque: "GÉRARD DAREL",
  },
  claudie_pierlot: {
    nom: "CALLITHEA",
    adresse: "15 Rue des Drapiers\nActipole Metz Borny\n57075 Metz\nFrance",
    livraison: "CLAUDIE PIERLOT - MARLY MC\n1 Rue Jules Vallee\n95670 MARLY LA VILLE",
    marque: "CLAUDIE PIERLOT",
  },
  souleiado: {
    nom: "SOULEÏADO",
    adresse: "39 Rue Charles Demery\n13150 Tarascon\nFrance",
    livraison: "SOULEÏADO - Zac du Roubian\n18 Rue des Charpentiers\n13150 Tarascon sur Rhone",
    marque: "SOULEÏADO",
  },
  bonpoint: {
    nom: "BONPOINT SAS",
    adresse: "62 Av. D IENA\n75116 Paris\nFrance",
    livraison: "Deret Logistique - Pour Bonpoint\n16 Rue des Sablons Quai 23+24\n45140 Ormes France",
    marque: "BONPOINT",
  },
  vanessa_bruno: {
    nom: "Solune SAS",
    adresse: "8- Rue de la Pierre Levée, 75011\nParis-France\nFR57823863113",
    livraison: "LOGISTIQUE NC - RECEPTION VANESSA BRUNO\n17 RUE DU NOYER A LA MALICE\n95380 LOUVRES France",
    marque: "VANESSA BRUNO",
  },
  bash: {
    nom: "BASH",
    adresse: "29-35 Rue Pastourelle\n75003 Paris\nFrance\nRCS: 449 158 898 — VAT N°FR42449158898",
    livraison: "BASH LOGISTIQUE\nZAC de la Butte aux Bergers\n11, Av. du Noyer a la Malice\n95380 LOUVRES France",
    marque: "BA&SH",
  },
  antonelle: {
    nom: "Nouvelle Uja",
    adresse: "Zac de l'ourcq-Local 103\n100 Av. du General Leclerc\n93500 Pantin-France",
    livraison: "ANTONELLE/UJA - Pantin Logistique\n100 Av. du General Leclerc\nNiveau1-Cellule 6\n93500 Pantin-France",
    marque: "ANTONELLE",
  },
  patrick: {
    nom: "PATRICK CONFECTION",
    adresse: "Dar Chaabane El Fehri\nNabeul\nMF:1115787P/A/M/000",
    livraison: "Dar Chaabane El Fehri, Nabeul",
    marque: "PATRICK CONFECTION",
  },
};

export const CLIENT_NAMES: Record<string, string> = {
  gerard_darel: "GÉRARD DAREL",
  claudie_pierlot: "CLAUDIE PIERLOT",
  souleiado: "SOULEÏADO",
  bonpoint: "BONPOINT",
  vanessa_bruno: "VANESSA BRUNO",
  bash: "BA&SH",
  antonelle: "ANTONELLE",
  patrick: "PATRICK CONFECTION",
  zapa: "ZAPA",
  lb_fashion: "LB FASHION",
  autre: "AUTRE",
};

export const FACONNIERS = ["SAJ", "KMZ", "ANIRATEX", "IDEAL", "TWINTEX", "Patrick Confection", "Autre"];

export const MOIS_FR: Record<string, string> = {
  "01": "Janvier", "02": "Février", "03": "Mars", "04": "Avril", "05": "Mai", "06": "Juin",
  "07": "Juillet", "08": "Août", "09": "Septembre", "10": "Octobre", "11": "Novembre", "12": "Décembre",
};
