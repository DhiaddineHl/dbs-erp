-- Les fiches QRQC de l'ancien PilotPro notaient la cause 5M sous forme de code
-- (« main_oeuvre », « matiere »…) : la 0035 ne reconnaissait que les libellés
-- et les a laissées en « cause » libre. On les range dans la famille 5M.
UPDATE "qc_action_corrective"
SET "cause5m" = CASE lower(trim("cause"))
    WHEN 'main_oeuvre' THEN 'Main d''œuvre'
    WHEN 'main oeuvre' THEN 'Main d''œuvre'
    WHEN 'mo' THEN 'Main d''œuvre'
    WHEN 'machine' THEN 'Machine'
    WHEN 'matiere' THEN 'Matière'
    WHEN 'methode' THEN 'Méthode'
    WHEN 'milieu' THEN 'Milieu'
  END,
  "cause" = ''
WHERE "cause5m" = ''
  AND lower(trim("cause")) IN ('main_oeuvre', 'main oeuvre', 'mo', 'machine', 'matiere', 'methode', 'milieu');
