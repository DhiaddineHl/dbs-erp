/* Barèmes de mesures clients — dossiers techniques réels des donneurs d'ordre,
 * repris tels quels de PilotPro. Ils servent de référentiel de départ : les
 * inspections s'y apparient automatiquement par référence de modèle. */

export type BaremeSeed = {
  nom: string;
  client: string;
  refs: string[];
  tailles: string[];
  points: { label: string; tolerance: number; valeurs: Record<string, number> }[];
};

export const BAREMES_CLIENTS: BaremeSeed[] = [
  {
    nom: "GERARD DAREL — DEC51C Chemisier (E144)",
    client: "GÉRARD DAREL",
    refs: [
      "DEC51C",
      "E144"
    ],
    tailles: [
      "0",
      "1",
      "2",
      "3",
      "4"
    ],
    points: [
      {
        label: "1/2 largeur poitrine à 3 cm de l'emmanchure",
        tolerance: 1,
        valeurs: {
          "0": 49,
          "1": 52,
          "2": 55,
          "3": 58,
          "4": 61
        }
      },
      {
        label: "1/2 largeur bas",
        tolerance: 1,
        valeurs: {
          "0": 50.5,
          "1": 53.5,
          "2": 56.5,
          "3": 59.5,
          "4": 62.5
        }
      },
      {
        label: "1/2 longueur encolure",
        tolerance: 0.4,
        valeurs: {
          "0": 20.9,
          "1": 21.7,
          "2": 22.5,
          "3": 23.3,
          "4": 24.1
        }
      },
      {
        label: "Longueur épaule",
        tolerance: 0.2,
        valeurs: {
          "0": 18.62,
          "1": 19.06,
          "2": 19.5,
          "3": 19.94,
          "4": 20.38
        }
      },
      {
        label: "Longueur emmanchure",
        tolerance: 0.9,
        valeurs: {
          "0": 46.9,
          "1": 48.7,
          "2": 50.5,
          "3": 52.3,
          "4": 54.1
        }
      },
      {
        label: "Longueur manche avec poignet",
        tolerance: 0.3,
        valeurs: {
          "0": 52.3,
          "1": 52.9,
          "2": 53.5,
          "3": 54.1,
          "4": 54.7
        }
      },
      {
        label: "1/2 biceps sous l'emmanchure",
        tolerance: 0.4,
        valeurs: {
          "0": 23.4,
          "1": 24.2,
          "2": 25,
          "3": 25.8,
          "4": 26.6
        }
      },
      {
        label: "1/2 largeur bas de manche (poignet fermé)",
        tolerance: 0.2,
        valeurs: {
          "0": 9.95,
          "1": 10.35,
          "2": 10.75,
          "3": 11.15,
          "4": 11.55
        }
      },
      {
        label: "Longueur côté sous emmanchure",
        tolerance: 0.5,
        valeurs: {
          "0": 32.5,
          "1": 32.5,
          "2": 32.5,
          "3": 32.5,
          "4": 32.5
        }
      },
      {
        label: "Longueur milieu dos sans col",
        tolerance: 0.5,
        valeurs: {
          "0": 72,
          "1": 72.75,
          "2": 73.5,
          "3": 74.25,
          "4": 75
        }
      },
      {
        label: "Carrure dos à 12 cm de l'encolure",
        tolerance: 0.7,
        valeurs: {
          "0": 47.9,
          "1": 49.7,
          "2": 51.5,
          "3": 53.3,
          "4": 55.1
        }
      }
    ]
  },
  {
    nom: "PABLO — PER70 Robe (E678)",
    client: "PABLO",
    refs: [
      "PER70",
      "E678"
    ],
    tailles: [
      "34",
      "36",
      "38",
      "40",
      "42",
      "44",
      "46"
    ],
    points: [
      {
        label: "1/2 largeur poitrine à 3 cm de l'emmanchure",
        tolerance: 1,
        valeurs: {
          "34": 48,
          "36": 50,
          "38": 52,
          "40": 54,
          "42": 56,
          "44": 58,
          "46": 60
        }
      },
      {
        label: "1/2 largeur découpe taille devant",
        tolerance: 0.5,
        valeurs: {
          "34": 20,
          "36": 21,
          "38": 22,
          "40": 23,
          "42": 24,
          "44": 25,
          "46": 26
        }
      },
      {
        label: "Largeur découpe taille dos",
        tolerance: 0.5,
        valeurs: {
          "34": 35.5,
          "36": 37.5,
          "38": 39.5,
          "40": 41.5,
          "42": 43.5,
          "44": 45.5,
          "46": 47.5
        }
      },
      {
        label: "1/2 largeur bas",
        tolerance: 1,
        valeurs: {
          "34": 67.5,
          "36": 69.5,
          "38": 71.5,
          "40": 73.5,
          "42": 75.5,
          "44": 77.5,
          "46": 79.5
        }
      },
      {
        label: "1/2 longueur encolure devant avec patte",
        tolerance: 0.25,
        valeurs: {
          "34": 24.4,
          "36": 24.7,
          "38": 25,
          "40": 25.3,
          "42": 25.6,
          "44": 25.9,
          "46": 26.2
        }
      },
      {
        label: "1/2 longueur encolure dos",
        tolerance: 0.5,
        valeurs: {
          "34": 9.6,
          "36": 9.8,
          "38": 10,
          "40": 10.2,
          "42": 10.4,
          "44": 10.6,
          "46": 10.8
        }
      },
      {
        label: "Longueur épaule",
        tolerance: 0.2,
        valeurs: {
          "34": 9.9,
          "36": 10.2,
          "38": 10.5,
          "40": 10.8,
          "42": 11.1,
          "44": 11.4,
          "46": 11.7
        }
      },
      {
        label: "Longueur emmanchure",
        tolerance: 0.9,
        valeurs: {
          "34": 46.2,
          "36": 48.1,
          "38": 50,
          "40": 51.9,
          "42": 53.8,
          "44": 55.7,
          "46": 57.6
        }
      },
      {
        label: "Longueur manche avec poignet",
        tolerance: 0.5,
        valeurs: {
          "34": 25.2,
          "36": 25.6,
          "38": 26,
          "40": 26.4,
          "42": 26.8,
          "44": 27.2,
          "46": 27.6
        }
      },
      {
        label: "1/2 biceps sous l'emmanchure",
        tolerance: 0.5,
        valeurs: {
          "34": 19.34,
          "36": 20.17,
          "38": 21,
          "40": 21.83,
          "42": 22.66,
          "44": 23.49,
          "46": 24.32
        }
      },
      {
        label: "1/2 largeur bas de manche (poignet fermé)",
        tolerance: 0.5,
        valeurs: {
          "34": 13.3,
          "36": 13.8,
          "38": 14.3,
          "40": 14.8,
          "42": 15.3,
          "44": 15.8,
          "46": 16.3
        }
      },
      {
        label: "Longueur côté sous emmanchure",
        tolerance: 1,
        valeurs: {
          "34": 95,
          "36": 95,
          "38": 95,
          "40": 95,
          "42": 95,
          "44": 95,
          "46": 95
        }
      },
      {
        label: "Longueur milieu dos sans col",
        tolerance: 1,
        valeurs: {
          "34": 117.5,
          "36": 118,
          "38": 118.5,
          "40": 119,
          "42": 119.5,
          "44": 120,
          "46": 120.5
        }
      },
      {
        label: "Carrure dos à 12 cm de l'encolure",
        tolerance: 0.5,
        valeurs: {
          "34": 35.5,
          "36": 36.5,
          "38": 37.5,
          "40": 38.5,
          "42": 39.5,
          "44": 40.5,
          "46": 41.5
        }
      },
      {
        label: "Hauteur fente devant",
        tolerance: 0.5,
        valeurs: {
          "34": 31.5,
          "36": 31.5,
          "38": 31.5,
          "40": 31.5,
          "42": 31.5,
          "44": 31.5,
          "46": 31.5
        }
      },
      {
        label: "Smock bas manche fini",
        tolerance: 0,
        valeurs: {
          "34": 26,
          "36": 27,
          "38": 28,
          "40": 29,
          "42": 30,
          "44": 31,
          "46": 32
        }
      },
      {
        label: "Smock taille dos",
        tolerance: 0,
        valeurs: {
          "34": 15.25,
          "36": 15.75,
          "38": 16.25,
          "40": 16.75,
          "42": 17.25,
          "44": 17.75,
          "46": 18.25
        }
      }
    ]
  },
  {
    nom: "PABLO — PEC58B Chemisier sequins (E669)",
    client: "PABLO",
    refs: [
      "PEC58B",
      "E669"
    ],
    tailles: [
      "T0",
      "T1",
      "T2",
      "T3",
      "T4"
    ],
    points: [
      {
        label: "1/2 largeur poitrine à 3 cm de l'emmanchure",
        tolerance: 1,
        valeurs: {
          "T0": 48.6,
          "T1": 51.6,
          "T2": 54.6,
          "T3": 57.6,
          "T4": 60.6
        }
      },
      {
        label: "1/2 largeur bas",
        tolerance: 1,
        valeurs: {
          "T0": 49.2,
          "T1": 52.2,
          "T2": 55.2,
          "T3": 58.2,
          "T4": 61.2
        }
      },
      {
        label: "1/2 longueur encolure",
        tolerance: 0.4,
        valeurs: {
          "T0": 21.4,
          "T1": 22.2,
          "T2": 23,
          "T3": 23.8,
          "T4": 24.6
        }
      },
      {
        label: "Longueur épaule",
        tolerance: 0.2,
        valeurs: {
          "T0": 8.7,
          "T1": 9.1,
          "T2": 9.5,
          "T3": 9.9,
          "T4": 10.3
        }
      },
      {
        label: "Longueur emmanchure",
        tolerance: 1,
        valeurs: {
          "T0": 43.9,
          "T1": 46.7,
          "T2": 49.5,
          "T3": 52.3,
          "T4": 55.1
        }
      },
      {
        label: "Longueur manche avec poignet",
        tolerance: 0.3,
        valeurs: {
          "T0": 58.4,
          "T1": 59,
          "T2": 59.6,
          "T3": 60.2,
          "T4": 60.8
        }
      },
      {
        label: "1/2 biceps sous l'emmanchure",
        tolerance: 0.5,
        valeurs: {
          "T0": 15.82,
          "T1": 17.01,
          "T2": 18.2,
          "T3": 19.39,
          "T4": 20.58
        }
      },
      {
        label: "1/2 largeur bas de manche (poignet fermé)",
        tolerance: 0.3,
        valeurs: {
          "T0": 10.7,
          "T1": 11.1,
          "T2": 11.5,
          "T3": 11.9,
          "T4": 12.3
        }
      },
      {
        label: "Longueur côté sous emmanchure",
        tolerance: 0.5,
        valeurs: {
          "T0": 34.5,
          "T1": 34.5,
          "T2": 34.5,
          "T3": 34.5,
          "T4": 34.5
        }
      },
      {
        label: "Longueur milieu dos sans col",
        tolerance: 0.5,
        valeurs: {
          "T0": 56.4,
          "T1": 57.15,
          "T2": 57.9,
          "T3": 59.65,
          "T4": 60.4
        }
      },
      {
        label: "Carrure dos à 12 cm de l'encolure",
        tolerance: 0.75,
        valeurs: {
          "T0": 36.9,
          "T1": 38.2,
          "T2": 39.5,
          "T3": 40.8,
          "T4": 42.1
        }
      }
    ]
  },
  {
    nom: "PABLO — PEC27 Chemisier sequins doublé (E667)",
    client: "PABLO",
    refs: [
      "PEC27",
      "E667"
    ],
    tailles: [
      "0",
      "1",
      "2",
      "3",
      "4"
    ],
    points: [
      {
        label: "1/2 largeur poitrine à 10 cm au-dessus de la poche",
        tolerance: 1,
        valeurs: {
          "0": 47.2,
          "1": 50.2,
          "2": 53.2,
          "3": 56.2,
          "4": 59.2
        }
      },
      {
        label: "1/2 largeur bas",
        tolerance: 1,
        valeurs: {
          "0": 47.5,
          "1": 50.5,
          "2": 53.5,
          "3": 56.5,
          "4": 59.5
        }
      },
      {
        label: "1/2 longueur encolure devant avec patte",
        tolerance: 0.25,
        valeurs: {
          "0": 22.6,
          "1": 23.1,
          "2": 23.6,
          "3": 24.1,
          "4": 24.6
        }
      },
      {
        label: "1/2 longueur encolure dos",
        tolerance: 0.5,
        valeurs: {
          "0": 9.2,
          "1": 9.5,
          "2": 9.8,
          "3": 10.1,
          "4": 10.4
        }
      },
      {
        label: "Longueur manche avec poignet",
        tolerance: 0.5,
        valeurs: {
          "0": 35.5,
          "1": 37,
          "2": 38.5,
          "3": 40,
          "4": 41.5
        }
      },
      {
        label: "1/2 largeur bas de manche (poignet fermé)",
        tolerance: 0.5,
        valeurs: {
          "0": 18.3,
          "1": 18.8,
          "2": 19.3,
          "3": 19.8,
          "4": 20.3
        }
      },
      {
        label: "Longueur côté sous emmanchure",
        tolerance: 1,
        valeurs: {
          "0": 37.5,
          "1": 37.5,
          "2": 37.5,
          "3": 37.5,
          "4": 37.5
        }
      },
      {
        label: "Longueur milieu dos sans col",
        tolerance: 1,
        valeurs: {
          "0": 57.3,
          "1": 58.05,
          "2": 58.8,
          "3": 59.55,
          "4": 60.3
        }
      },
      {
        label: "Carrure dos à 12 cm de l'encolure",
        tolerance: 0.5,
        valeurs: {
          "0": 80.5,
          "1": 84,
          "2": 87.5,
          "3": 91,
          "4": 94.5
        }
      },
      {
        label: "Longueur milieu devant",
        tolerance: 1,
        valeurs: {
          "0": 38.5,
          "1": 39.25,
          "2": 40,
          "3": 40.75,
          "4": 41.5
        }
      }
    ]
  },
  {
    nom: "GERARD DAREL — DEC54 Chemisier carreaux (E085)",
    client: "GÉRARD DAREL",
    refs: [
      "DEC54",
      "E085"
    ],
    tailles: [
      "T0",
      "T1",
      "T2",
      "T3",
      "T4"
    ],
    points: [
      {
        label: "1/2 largeur poitrine à 3 cm de l'emmanchure",
        tolerance: 1,
        valeurs: {
          "T0": 50,
          "T1": 53,
          "T2": 56,
          "T3": 59,
          "T4": 62
        }
      },
      {
        label: "1/2 largeur bas",
        tolerance: 1,
        valeurs: {
          "T0": 48,
          "T1": 51,
          "T2": 54,
          "T3": 57,
          "T4": 60
        }
      },
      {
        label: "1/2 longueur encolure",
        tolerance: 0.5,
        valeurs: {
          "T0": 21.9,
          "T1": 22.7,
          "T2": 23.5,
          "T3": 24.3,
          "T4": 25.1
        }
      },
      {
        label: "Longueur épaule sur couture empiècement",
        tolerance: 0.3,
        valeurs: {
          "T0": 13.64,
          "T1": 14.07,
          "T2": 14.5,
          "T3": 14.93,
          "T4": 15.36
        }
      },
      {
        label: "Longueur emmanchure",
        tolerance: 0.75,
        valeurs: {
          "T0": 48.8,
          "T1": 51.4,
          "T2": 54,
          "T3": 56.6,
          "T4": 59.2
        }
      },
      {
        label: "Longueur manche avec poignet",
        tolerance: 0.5,
        valeurs: {
          "T0": 58.8,
          "T1": 59.4,
          "T2": 60,
          "T3": 60.6,
          "T4": 61.2
        }
      },
      {
        label: "1/2 biceps sous l'emmanchure",
        tolerance: 0.5,
        valeurs: {
          "T0": 18.22,
          "T1": 19.36,
          "T2": 20.5,
          "T3": 21.64,
          "T4": 22.78
        }
      },
      {
        label: "1/2 largeur bas de manche (poignet fermé)",
        tolerance: 0.3,
        valeurs: {
          "T0": 11.2,
          "T1": 11.6,
          "T2": 12,
          "T3": 12.4,
          "T4": 12.8
        }
      },
      {
        label: "Longueur côté sous emmanchure",
        tolerance: 0.5,
        valeurs: {
          "T0": 24.5,
          "T1": 24.5,
          "T2": 24.5,
          "T3": 24.5,
          "T4": 24.5
        }
      },
      {
        label: "Longueur milieu dos sans col",
        tolerance: 0.5,
        valeurs: {
          "T0": 55.5,
          "T1": 56.25,
          "T2": 57,
          "T3": 57.75,
          "T4": 58.5
        }
      },
      {
        label: "Carrure dos à 12 cm de l'encolure",
        tolerance: 0.75,
        valeurs: {
          "T0": 39.5,
          "T1": 41,
          "T2": 42.5,
          "T3": 44,
          "T4": 45.5
        }
      },
      {
        label: "Largeur poche",
        tolerance: 0.25,
        valeurs: {
          "T0": 12.5,
          "T1": 12.5,
          "T2": 12.5,
          "T3": 12.5,
          "T4": 12.5
        }
      },
      {
        label: "Hauteur poche (côté)",
        tolerance: 0.25,
        valeurs: {
          "T0": 12,
          "T1": 12,
          "T2": 12,
          "T3": 12,
          "T4": 12
        }
      },
      {
        label: "Largeur rabat",
        tolerance: 0.25,
        valeurs: {
          "T0": 13,
          "T1": 13,
          "T2": 13,
          "T3": 13,
          "T4": 13
        }
      },
      {
        label: "Longueur milieu devant",
        tolerance: 0.5,
        valeurs: {
          "T0": 46.2,
          "T1": 46.6,
          "T2": 47,
          "T3": 47.4,
          "T4": 47.8
        }
      }
    ]
  },
  {
    nom: "ANTONELLE — J05E23 Jupe MINOIS",
    client: "ANTONELLE",
    refs: [
      "J05E23",
      "MINOIS"
    ],
    tailles: [
      "38",
      "40",
      "42",
      "44",
      "46"
    ],
    points: [
      {
        label: "1/2 taille",
        tolerance: 0.5,
        valeurs: {
          "38": 38,
          "40": 40,
          "42": 42,
          "44": 44,
          "46": 47
        }
      },
      {
        label: "1/2 hanche",
        tolerance: 0.5,
        valeurs: {
          "38": 51.7,
          "40": 53.7,
          "42": 55.7,
          "44": 57.7,
          "46": 60.7
        }
      },
      {
        label: "1/2 bas",
        tolerance: 0.5,
        valeurs: {
          "38": 83,
          "40": 85,
          "42": 87,
          "44": 89,
          "46": 92
        }
      },
      {
        label: "Longueur milieu dos",
        tolerance: 1,
        valeurs: {
          "38": 79.2,
          "40": 79.2,
          "42": 79.2,
          "44": 79.2,
          "46": 79.2
        }
      },
      {
        label: "Hauteur ceinture",
        tolerance: 0.2,
        valeurs: {
          "38": 3.5,
          "40": 3.5,
          "42": 3.5,
          "44": 3.5,
          "46": 3.5
        }
      },
      {
        label: "Ouverture zip",
        tolerance: 0.5,
        valeurs: {
          "38": 0,
          "40": 0,
          "42": 0,
          "44": 0,
          "46": 0
        }
      }
    ]
  }
];
