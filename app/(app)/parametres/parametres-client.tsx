"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Settings, Plus, Pencil, X, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { SectionPanel } from "@/components/shared/section-panel";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NAV_STRUCTURE } from "@/lib/nav";
import { ROLE_KEYS, ROLE_LABELS, type AppRole } from "@/lib/auth/permissions";
import {
  createUserAction,
  deleteUserAction,
  setPrixFaconAction,
  togglePermissionAction,
  updateUserAction,
} from "./actions";

type ManagedUser = { id: string; name: string; email: string; role: string };
type PermMatrix = Record<string, Record<string, boolean>>;

const NON_ADMIN_ROLES = ROLE_KEYS.filter((r) => r !== "admin");

export function ParametresClient({
  users,
  matrix,
  prixFacon,
}: {
  users: ManagedUser[];
  matrix: PermMatrix;
  prixFacon: number;
}) {
  const router = useRouter();
  const [userDialog, setUserDialog] = useState<{ open: boolean; edit: ManagedUser | null }>({ open: false, edit: null });
  const [, startTransition] = useTransition();

  const run = (p: Promise<{ ok: boolean; error?: string }>, okMsg: string) =>
    startTransition(async () => {
      const res = await p;
      if (res.ok) {
        toast.success(okMsg);
        router.refresh();
      } else {
        toast.error(res.error || "Erreur");
      }
    });

  return (
    <>
      <PageHeader
        icon={Settings}
        title="Paramètres"
        description="Configuration, données et permissions par rôle — comptes gérés par Better Auth"
      />

      {/* ── Financier ── */}
      <SectionPanel title="Paramètres financiers" icon="💶">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label className="text-[11px] font-semibold text-secondary-foreground">
              Prix façon DBS par défaut (€/pcs)
            </Label>
            <Input
              type="number"
              step="0.01"
              defaultValue={prixFacon}
              className="bg-card"
              onBlur={(e) => run(setPrixFaconAction(parseFloat(e.target.value) || 3.5), "Paramètre enregistré")}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-[11px] font-semibold text-secondary-foreground">Société</Label>
            <Input value="DBS Fashion — Confection export" disabled className="bg-muted" />
          </div>
        </div>
      </SectionPanel>

      {/* ── Données ── */}
      <SectionPanel title="Données" icon="🗄">
        <p className="text-xs text-muted-foreground">
          Toutes les données — commandes, production (GPAO), facturation, comptes et permissions — sont désormais
          stockées en base PostgreSQL côté serveur et partagées en temps réel entre tous les utilisateurs. Plus aucune
          donnée n&apos;est conservée dans le navigateur ; les sauvegardes sont gérées au niveau de la base de données.
        </p>
      </SectionPanel>

      {/* ── Comptes ── */}
      <SectionPanel
        title="Comptes utilisateurs"
        icon="👥"
        actions={
          <Button size="sm" onClick={() => setUserDialog({ open: true, edit: null })}>
            <Plus className="size-4" /> Ajouter
          </Button>
        }
        flush
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Nom</TableHead>
              <TableHead>Rôle</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-semibold text-brand">{u.email}</TableCell>
                <TableCell>{u.name}</TableCell>
                <TableCell>
                  <StatusBadge tone={u.role === "admin" ? "purple" : "brand"}>
                    {ROLE_LABELS[u.role as AppRole] || u.role}
                  </StatusBadge>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon-sm" onClick={() => setUserDialog({ open: true, edit: u })}>
                      <Pencil className="size-3.5" />
                    </Button>
                    {u.email !== "admin@dbs.local" && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => {
                          if (confirm(`Supprimer « ${u.name} » ?`)) run(deleteUserAction(u.id), "Utilisateur supprimé");
                        }}
                      >
                        <X className="size-3.5 text-[var(--danger-d)]" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SectionPanel>

      {/* ── Permissions ── */}
      <SectionPanel title="Permissions par rôle" icon="🔐">
        <div className="mb-3 flex items-center gap-2">
          <ShieldCheck className="size-4 text-purple" />
          <p className="text-xs text-muted-foreground">
            Cochez les modules accessibles à chaque rôle. L&apos;<b>Administrateur</b> a toujours accès à tout. Les
            changements s&apos;appliquent à la navigation des utilisateurs concernés.
          </p>
        </div>
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Module</TableHead>
                <TableHead className="text-center text-purple">Admin</TableHead>
                {NON_ADMIN_ROLES.map((r) => (
                  <TableHead key={r} className="text-center">
                    {ROLE_LABELS[r]}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {NAV_STRUCTURE.map((grp) => (
                <Fragment key={grp.label}>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableCell
                      colSpan={NON_ADMIN_ROLES.length + 2}
                      className="py-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground"
                    >
                      {grp.label}
                    </TableCell>
                  </TableRow>
                  {grp.items.map((it) => {
                    const Icon = it.icon;
                    return (
                      <TableRow key={it.id}>
                        <TableCell className="flex items-center gap-2 text-[13px]">
                          <Icon className="size-4 text-muted-foreground" />
                          {it.label}
                        </TableCell>
                        <TableCell className="text-center">
                          <Checkbox checked disabled className="mx-auto" />
                        </TableCell>
                        {NON_ADMIN_ROLES.map((r) => (
                          <TableCell key={r} className="text-center">
                            <Checkbox
                              className="mx-auto"
                              checked={matrix[r]?.[it.id] !== false}
                              onCheckedChange={(v) =>
                                run(togglePermissionAction(r, it.id, v === true), "Permission mise à jour")
                              }
                            />
                          </TableCell>
                        ))}
                      </TableRow>
                    );
                  })}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      </SectionPanel>

      <UserDialog
        key={userDialog.edit?.id ?? "new"}
        open={userDialog.open}
        edit={userDialog.edit}
        onClose={() => setUserDialog({ open: false, edit: null })}
        onSubmit={(data) => {
          if (userDialog.edit) {
            run(
              updateUserAction({ userId: userDialog.edit.id, name: data.name, role: data.role, password: data.password || undefined }),
              "Utilisateur enregistré",
            );
          } else {
            run(createUserAction({ email: data.email, password: data.password, name: data.name, role: data.role }), "Utilisateur créé");
          }
          setUserDialog({ open: false, edit: null });
        }}
      />
    </>
  );
}

function UserDialog({
  open,
  edit,
  onClose,
  onSubmit,
}: {
  open: boolean;
  edit: ManagedUser | null;
  onClose: () => void;
  onSubmit: (data: { email: string; password: string; name: string; role: AppRole }) => void;
}) {
  const [email, setEmail] = useState(edit?.email ?? "");
  const [password, setPassword] = useState("");
  const [name, setName] = useState(edit?.name ?? "");
  const [role, setRole] = useState<AppRole>((edit?.role as AppRole) ?? "analyst");

  const submit = () => {
    if (!name.trim()) return toast.error("Le nom est requis");
    if (!edit && (!email.trim() || !password)) return toast.error("Email et mot de passe requis");
    onSubmit({ email: email.trim(), password, name: name.trim(), role });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{edit ? "Modifier l'utilisateur" : "Nouvel utilisateur"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label className="text-[11px]">Email *</Label>
            <Input type="email" value={email} disabled={!!edit} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-[11px]">{edit ? "Nouveau mot de passe" : "Mot de passe *"}</Label>
            <Input
              type="password"
              value={password}
              placeholder={edit ? "(laisser vide = inchangé)" : ""}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label className="text-[11px]">Nom complet *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label className="text-[11px]">Rôle</Label>
            <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_KEYS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={submit}>Enregistrer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
