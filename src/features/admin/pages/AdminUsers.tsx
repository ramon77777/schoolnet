import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type UserRole = "admin" | "teacher" | "student" | "parent";

type AdminUserRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string | null;
  phone: string | null;
  class_name: string | null;
  auth_created_at: string | null;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  banned_until: string | null;
  is_active: boolean;
};

type ClassOptionRow = {
  id: string;
  name: string;
  school_year: string;
};

type RoleFilter = "all" | UserRole;
type StatusFilter = "all" | "active" | "disabled";

type CreateUserForm = {
  fullName: string;
  email: string;
  role: UserRole;
  phone: string;
  className: string;
  password: string;
};

const EMPTY_CREATE_USER_FORM: CreateUserForm = {
  fullName: "",
  email: "",
  role: "student",
  phone: "",
  className: "",
  password: "",
};

const PAGE_SIZE = 10;

function normalizeRole(role: string | null): UserRole | null {
  if (
    role === "admin" ||
    role === "teacher" ||
    role === "student" ||
    role === "parent"
  ) {
    return role;
  }

  return null;
}

function roleLabel(role: string | null) {
  if (role === "admin") return "Administrateur";
  if (role === "teacher") return "Enseignant";
  if (role === "student") return "Apprenant";
  if (role === "parent") return "Parent / Tuteur";

  return "Non défini";
}

function roleIcon(role: string | null) {
  if (role === "admin") return "🛠️";
  if (role === "teacher") return "👩‍🏫";
  if (role === "student") return "🎓";
  if (role === "parent") return "👨‍👩‍👧";

  return "👤";
}

function roleBadgeClass(role: string | null) {
  if (role === "admin") {
    return "bg-purple-50 text-purple-700 border-purple-200";
  }

  if (role === "teacher") {
    return "bg-blue-50 text-blue-700 border-blue-200";
  }

  if (role === "student") {
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  }

  if (role === "parent") {
    return "bg-amber-50 text-amber-700 border-amber-200";
  }

  return "bg-gray-50 text-gray-600 border-gray-200";
}

function formatDate(value: string | null) {
  if (!value) return "Jamais";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function userDisplayName(user: AdminUserRow) {
  const name = user.full_name?.trim();

  if (name) return name;

  const email = user.email?.trim();

  if (email) return email;

  return "Utilisateur";
}

export default function AdminUsers() {
  const [users, setUsers] = useState<AdminUserRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [statusFilter, setStatusFilter] =
    useState<StatusFilter>("all");

  const [page, setPage] = useState(1);

  // Utilisateur administrateur actuellement connecté.
  // Sert notamment à empêcher l'administrateur de désactiver
  // accidentellement son propre compte.
  const [currentUserId, setCurrentUserId] = useState<string | null>(
    null
  );

  // Gestion des actions Activer / Désactiver
  const [processingUserId, setProcessingUserId] =
    useState<string | null>(null);

  const [actionSuccess, setActionSuccess] =
    useState<string | null>(null);

  const [actionError, setActionError] =
    useState<string | null>(null);

  const [createUserOpen, setCreateUserOpen] = useState(false);

  const [creatingUser, setCreatingUser] = useState(false);

  const [createUserError, setCreateUserError] =
    useState<string | null>(null);

  const [createUserForm, setCreateUserForm] =
    useState<CreateUserForm>(EMPTY_CREATE_USER_FORM);

  // Réinitialisation administrateur du mot de passe.
  const [resetPasswordUser, setResetPasswordUser] =
    useState<AdminUserRow | null>(null);

  const [resetPassword, setResetPassword] = useState("");
  const [resetPasswordConfirm, setResetPasswordConfirm] =
    useState("");

  const [resetPasswordError, setResetPasswordError] =
    useState<string | null>(null);

  const [resettingPassword, setResettingPassword] =
    useState(false);

  const [selectedClassId, setSelectedClassId] = useState("");

  const [classOptions, setClassOptions] = useState<ClassOptionRow[]>([]);
  const [classesLoading, setClassesLoading] = useState(false);
  const [classesError, setClassesError] = useState<string | null>(null);

  const loadUsers = useCallback(async (manualRefresh = false) => {
    try {
      if (manualRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError(null);

      const { data, error: rpcError } = await supabase.rpc(
        "admin_list_users"
      );

      if (rpcError) {
        throw rpcError;
      }

      setUsers((data ?? []) as AdminUserRow[]);
    } catch (err) {
      console.error("[AdminUsers] loadUsers error:", err);

      setError(
        "Impossible de charger les utilisateurs. Vérifiez votre session administrateur puis réessayez."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  // Récupère l'ID du compte connecté.
  useEffect(() => {
    let cancelled = false;

    const loadCurrentUser = async () => {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (cancelled) return;

      if (authError) {
        console.error(
          "[AdminUsers] getCurrentUser error:",
          authError
        );

        setCurrentUserId(null);
        return;
      }

      setCurrentUserId(user?.id ?? null);
    };

    void loadCurrentUser();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setPage(1);
  }, [search, roleFilter, statusFilter]);

  // Masque automatiquement le message de succès.
  useEffect(() => {
    if (!actionSuccess) return;

    const timeout = window.setTimeout(() => {
      setActionSuccess(null);
    }, 4500);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [actionSuccess]);

  const handleToggleUserActive = useCallback(
    async (targetUser: AdminUserRow) => {
      if (processingUserId) {
        return;
      }

      const nextActiveState = !targetUser.is_active;

      // Protection UI supplémentaire.
      if (
        targetUser.id === currentUserId &&
        !nextActiveState
      ) {
        setActionError(
          "Vous ne pouvez pas désactiver votre propre compte administrateur."
        );

        return;
      }

      const displayName = userDisplayName(targetUser);

      const confirmationMessage = nextActiveState
        ? `Voulez-vous réellement réactiver le compte de « ${displayName} » ?`
        : `Voulez-vous réellement désactiver le compte de « ${displayName} » ?\n\nCet utilisateur ne pourra plus se connecter à SchoolNet tant que son compte n'aura pas été réactivé.`;

      const confirmed = window.confirm(confirmationMessage);

      if (!confirmed) {
        return;
      }

      try {
        setProcessingUserId(targetUser.id);
        setActionError(null);
        setActionSuccess(null);

        const { error: rpcError } = await supabase.rpc(
          "admin_set_user_active",
          {
            p_user_id: targetUser.id,
            p_active: nextActiveState,
          }
        );

        if (rpcError) {
          throw rpcError;
        }

        // Mise à jour immédiate de l'interface.
        setUsers((currentUsers) =>
          currentUsers.map((user) =>
            user.id === targetUser.id
              ? {
                  ...user,
                  is_active: nextActiveState,
                  banned_until: nextActiveState
                    ? null
                    : user.banned_until,
                }
              : user
          )
        );

        setActionSuccess(
          nextActiveState
            ? `Le compte de ${displayName} a été réactivé avec succès.`
            : `Le compte de ${displayName} a été désactivé avec succès.`
        );
      } catch (err) {
        console.error(
          "[AdminUsers] handleToggleUserActive error:",
          err
        );

        setActionError(
          targetUser.is_active
            ? "Impossible de désactiver ce compte. Vérifiez vos droits administrateur puis réessayez."
            : "Impossible de réactiver ce compte. Vérifiez vos droits administrateur puis réessayez."
        );
      } finally {
        setProcessingUserId(null);
      }
    },
    [currentUserId, processingUserId]
  );

  const openResetPasswordModal = useCallback(
    (targetUser: AdminUserRow) => {
      setResetPasswordUser(targetUser);
      setResetPassword("");
      setResetPasswordConfirm("");
      setResetPasswordError(null);
    },
    []
  );

  const closeResetPasswordModal = useCallback(() => {
    if (resettingPassword) return;

    setResetPasswordUser(null);
    setResetPassword("");
    setResetPasswordConfirm("");
    setResetPasswordError(null);
  }, [resettingPassword]);

  const handleResetUserPassword = useCallback(async () => {
    if (!resetPasswordUser || resettingPassword) {
      return;
    }

    if (resetPassword.length < 8) {
      setResetPasswordError(
        "Le nouveau mot de passe doit contenir au moins 8 caractères."
      );
      return;
    }

    if (resetPassword !== resetPasswordConfirm) {
      setResetPasswordError(
        "Les deux mots de passe ne correspondent pas."
      );
      return;
    }

    const displayName = userDisplayName(resetPasswordUser);

    try {
      setResettingPassword(true);
      setResetPasswordError(null);
      setActionError(null);
      setActionSuccess(null);

      const { data, error: invokeError } =
        await supabase.functions.invoke(
          "admin-reset-user-password",
          {
            body: {
              user_id: resetPasswordUser.id,
              password: resetPassword,
            },
          }
        );

      if (invokeError) {
        throw invokeError;
      }

      if (!data?.success) {
        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : "Impossible de réinitialiser le mot de passe."
        );
      }

      setResetPasswordUser(null);
      setResetPassword("");
      setResetPasswordConfirm("");

      setActionSuccess(
        `Le mot de passe de ${displayName} a été réinitialisé avec succès.`
      );
    } catch (err) {
      console.error(
        "[AdminUsers] handleResetUserPassword error:",
        err
      );

      setResetPasswordError(
        err instanceof Error
          ? err.message
          : "Impossible de réinitialiser le mot de passe."
      );
    } finally {
      setResettingPassword(false);
    }
  }, [
    resetPassword,
    resetPasswordConfirm,
    resetPasswordUser,
    resettingPassword,
  ]);

  const loadClassOptions = useCallback(async () => {
    try {
      setClassesLoading(true);
      setClassesError(null);

      const { data, error: classesQueryError } = await supabase
        .from("classes")
        .select("id, name, school_year")
        .order("school_year", { ascending: false })
        .order("name", { ascending: true });

      if (classesQueryError) {
        throw classesQueryError;
      }

      setClassOptions((data ?? []) as ClassOptionRow[]);
    } catch (err) {
      console.error("[AdminUsers] loadClassOptions error:", err);

      setClassOptions([]);
      setClassesError(
        "Impossible de charger les classes disponibles."
      );
    } finally {
      setClassesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (
      !createUserOpen ||
      createUserForm.role !== "student"
    ) {
      return;
    }

    void loadClassOptions();
  }, [
    createUserOpen,
    createUserForm.role,
    loadClassOptions,
  ]);

  const closeCreateUserModal = useCallback(() => {
    if (creatingUser) return;

    setCreateUserOpen(false);
    setCreateUserError(null);
    setCreateUserForm(EMPTY_CREATE_USER_FORM);
    setSelectedClassId("");
    setClassesError(null);
  }, [creatingUser]);

  const handleCreateUser = useCallback(async () => {
    if (creatingUser) return;

    const fullName = createUserForm.fullName.trim();
    const email = createUserForm.email.trim().toLowerCase();
    const phone = createUserForm.phone.trim();
    const password = createUserForm.password;

    if (!fullName) {
      setCreateUserError("Le nom complet est obligatoire.");
      return;
    }

    if (!email) {
      setCreateUserError("L’adresse e-mail est obligatoire.");
      return;
    }

    if (password.length < 8) {
      setCreateUserError(
        "Le mot de passe temporaire doit contenir au moins 8 caractères."
      );
      return;
    }

    try {
      setCreatingUser(true);
      setCreateUserError(null);
      setActionError(null);
      setActionSuccess(null);

      const { data, error: invokeError } =
        await supabase.functions.invoke("admin-create-user", {
          body: {
            full_name: fullName,
            email,
            password,
            role: createUserForm.role,
            phone: phone || null,
            class_id:
              createUserForm.role === "student"
                ? selectedClassId || null
                : null,
          },
        });

      if (invokeError) {
        throw invokeError;
      }

      if (!data?.success) {
        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : "Impossible de créer cet utilisateur."
        );
      }

      setCreateUserForm(EMPTY_CREATE_USER_FORM);
      setCreateUserOpen(false);
      setSelectedClassId("");

      await loadUsers(true);

      setActionSuccess(
        typeof data.message === "string"
          ? data.message
          : `L’utilisateur « ${fullName} » a été créé avec succès.`
      );
    } catch (err) {
      console.error("[AdminUsers] handleCreateUser error:", err);

      setCreateUserError(
        err instanceof Error
          ? err.message
          : "Impossible de créer cet utilisateur."
      );
    } finally {
      setCreatingUser(false);
    }
  }, [
    createUserForm,
    creatingUser,
    loadUsers,
    selectedClassId,
  ]);

  const stats = useMemo(() => {
    const result = {
      total: users.length,
      admin: 0,
      teacher: 0,
      student: 0,
      parent: 0,
      active: 0,
      disabled: 0,
    };

    for (const user of users) {
      const role = normalizeRole(user.role);

      if (role) {
        result[role] += 1;
      }

      if (user.is_active) {
        result.active += 1;
      } else {
        result.disabled += 1;
      }
    }

    return result;
  }, [users]);

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("fr");

    return users.filter((user) => {
      const role = normalizeRole(user.role);

      if (roleFilter !== "all" && role !== roleFilter) {
        return false;
      }

      if (statusFilter === "active" && !user.is_active) {
        return false;
      }

      if (statusFilter === "disabled" && user.is_active) {
        return false;
      }

      if (!query) {
        return true;
      }

      const values = [
        user.full_name,
        user.email,
        user.phone,
        user.class_name,
        roleLabel(user.role),
      ];

      return values.some((value) =>
        value?.toLocaleLowerCase("fr").includes(query)
      );
    });
  }, [users, search, roleFilter, statusFilter]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredUsers.length / PAGE_SIZE)
  );

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const paginatedUsers = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    const end = start + PAGE_SIZE;

    return filteredUsers.slice(start, end);
  }, [filteredUsers, page]);

  const firstDisplayed =
    filteredUsers.length === 0
      ? 0
      : (page - 1) * PAGE_SIZE + 1;

  const lastDisplayed = Math.min(
    page * PAGE_SIZE,
    filteredUsers.length
  );

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-xl font-semibold">
            Utilisateurs
          </div>

          <div className="text-sm text-gray-500">
            Gérez et consultez les comptes SchoolNet.
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void loadUsers(true)}
            disabled={refreshing}
            className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {refreshing ? "Actualisation…" : "Actualiser"}
          </button>

          <button
            type="button"
            onClick={() => {
              setCreateUserError(null);
              setCreateUserOpen(true);
            }}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
          >
            + Nouvel utilisateur
          </button>
        </div>
      </div>

      {/* Messages d'action */}
      {actionSuccess && (
        <div className="sn-card border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-start gap-3">
            <div className="text-lg">✅</div>

            <div>
              <div className="font-semibold text-emerald-800">
                Opération réussie
              </div>

              <div className="mt-0.5 text-sm text-emerald-700">
                {actionSuccess}
              </div>
            </div>
          </div>
        </div>
      )}

      {actionError && (
        <div className="sn-card border border-red-200 bg-red-50 p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="text-lg">⚠️</div>

              <div>
                <div className="font-semibold text-red-800">
                  Opération impossible
                </div>

                <div className="mt-0.5 text-sm text-red-700">
                  {actionError}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setActionError(null)}
              className="rounded-lg px-2 py-1 text-sm font-medium text-red-600 transition hover:bg-red-100"
            >
              Fermer
            </button>
          </div>
        </div>
      )}

      {/* KPI */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="sn-card p-5">
          <div className="text-sm text-gray-500">
            Utilisateurs
          </div>

          <div className="mt-2 text-3xl font-bold text-gray-900">
            {stats.total}
          </div>

          <div className="mt-1 text-xs text-gray-500">
            Comptes enregistrés
          </div>
        </div>

        <div className="sn-card p-5">
          <div className="text-sm text-gray-500">
            🎓 Apprenants
          </div>

          <div className="mt-2 text-3xl font-bold text-gray-900">
            {stats.student}
          </div>

          <div className="mt-1 text-xs text-gray-500">
            Profils élèves
          </div>
        </div>

        <div className="sn-card p-5">
          <div className="text-sm text-gray-500">
            👩‍🏫 Enseignants
          </div>

          <div className="mt-2 text-3xl font-bold text-gray-900">
            {stats.teacher}
          </div>

          <div className="mt-1 text-xs text-gray-500">
            Comptes enseignants
          </div>
        </div>

        <div className="sn-card p-5">
          <div className="text-sm text-gray-500">
            👨‍👩‍👧 Parents / Tuteurs
          </div>

          <div className="mt-2 text-3xl font-bold text-gray-900">
            {stats.parent}
          </div>

          <div className="mt-1 text-xs text-gray-500">
            Comptes parents
          </div>
        </div>
      </div>

      {/* État des comptes */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="sn-card p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-gray-400">
            Administrateurs
          </div>

          <div className="mt-1 text-2xl font-semibold">
            {stats.admin}
          </div>
        </div>

        <div className="sn-card border border-emerald-100 bg-emerald-50/50 p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-emerald-600">
            Comptes actifs
          </div>

          <div className="mt-1 text-2xl font-semibold text-emerald-700">
            {stats.active}
          </div>
        </div>

        <div className="sn-card border border-red-100 bg-red-50/50 p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-red-600">
            Comptes désactivés
          </div>

          <div className="mt-1 text-2xl font-semibold text-red-700">
            {stats.disabled}
          </div>
        </div>
      </div>

      {/* Filtres */}
      <div className="sn-card space-y-4 p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="w-full xl:max-w-md">
            <input
              type="search"
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              placeholder="Rechercher un nom, e-mail, téléphone, classe…"
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div className="text-sm text-gray-500">
            {filteredUsers.length} résultat
            {filteredUsers.length > 1 ? "s" : ""}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {(
            [
              ["all", "Tous"],
              ["admin", "Admins"],
              ["teacher", "Enseignants"],
              ["student", "Apprenants"],
              ["parent", "Parents"],
            ] as Array<[RoleFilter, string]>
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setRoleFilter(value)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                roleFilter === value
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          {(
            [
              ["all", "Tous les statuts"],
              ["active", "Actifs"],
              ["disabled", "Désactivés"],
            ] as Array<[StatusFilter, string]>
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setStatusFilter(value)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                statusFilter === value
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Chargement */}
      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="sn-card animate-pulse p-5"
            >
              <div className="h-4 w-1/3 rounded bg-gray-200" />
              <div className="mt-3 h-3 w-1/2 rounded bg-gray-100" />
            </div>
          ))}
        </div>
      )}

      {/* Erreur */}
      {!loading && error && (
        <div className="sn-card border border-red-200 bg-red-50 p-5">
          <div className="font-semibold text-red-700">
            Impossible de charger les utilisateurs
          </div>

          <div className="mt-1 text-sm text-red-600">
            {error}
          </div>

          <button
            type="button"
            onClick={() => void loadUsers()}
            className="mt-4 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
          >
            Réessayer
          </button>
        </div>
      )}

      {/* Aucun résultat */}
      {!loading &&
        !error &&
        filteredUsers.length === 0 && (
          <div className="sn-card p-8 text-center">
            <div className="text-3xl">👥</div>

            <div className="mt-2 font-semibold text-gray-800">
              Aucun utilisateur trouvé
            </div>

            <div className="mt-1 text-sm text-gray-500">
              Modifiez la recherche ou les filtres.
            </div>
          </div>
        )}

      {/* Tableau */}
      {!loading &&
        !error &&
        filteredUsers.length > 0 && (
          <div className="sn-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Utilisateur
                    </th>

                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Rôle
                    </th>

                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Classe
                    </th>

                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Statut
                    </th>

                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Dernière connexion
                    </th>

                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Créé le
                    </th>

                    <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Actions
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-100 bg-white">
                  {paginatedUsers.map((user) => {
                    const isCurrentUser =
                      currentUserId === user.id;

                    const isProcessing =
                      processingUserId === user.id;

                    return (
                      <tr
                        key={user.id}
                        className="transition hover:bg-gray-50/70"
                      >
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 font-semibold text-blue-700">
                              {userDisplayName(user)
                                .charAt(0)
                                .toLocaleUpperCase("fr")}
                            </div>

                            <div className="min-w-0">
                              <div className="font-semibold text-gray-900">
                                {userDisplayName(user)}
                              </div>

                              <div className="truncate text-sm text-gray-500">
                                {user.email ||
                                  "E-mail non renseigné"}
                              </div>

                              {user.phone && (
                                <div className="mt-0.5 text-xs text-gray-400">
                                  {user.phone}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>

                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${roleBadgeClass(
                              user.role
                            )}`}
                          >
                            <span>
                              {roleIcon(user.role)}
                            </span>

                            {roleLabel(user.role)}
                          </span>
                        </td>

                        <td className="px-5 py-4 text-sm text-gray-600">
                          {user.class_name || "—"}
                        </td>

                        <td className="px-5 py-4">
                          {user.is_active ? (
                            <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                              Actif
                            </span>
                          ) : (
                            <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">
                              Désactivé
                            </span>
                          )}
                        </td>

                        <td className="px-5 py-4 text-sm text-gray-600">
                          {formatDate(
                            user.last_sign_in_at
                          )}
                        </td>

                        <td className="px-5 py-4 text-sm text-gray-600">
                          {formatDate(
                            user.auth_created_at
                          )}
                        </td>

                        <td className="px-5 py-4 text-right">
                          {isCurrentUser ? (
                            <span className="inline-flex rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-500">
                              Compte actuel
                            </span>
                          ) : (
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                disabled={
                                  processingUserId !== null ||
                                  resettingPassword
                                }
                                onClick={() =>
                                  openResetPasswordModal(user)
                                }
                                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                🔑 Mot de passe
                              </button>

                              <button
                                type="button"
                                disabled={
                                  isProcessing ||
                                  processingUserId !== null ||
                                  resettingPassword
                                }
                                onClick={() =>
                                  void handleToggleUserActive(user)
                                }
                                className={`inline-flex min-w-[105px] items-center justify-center rounded-xl border px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                                  user.is_active
                                    ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                                    : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                }`}
                              >
                                {isProcessing
                                  ? "Traitement…"
                                  : user.is_active
                                    ? "Désactiver"
                                    : "Réactiver"}
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex flex-col gap-3 border-t border-gray-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-gray-500">
                Affichage {firstDisplayed} à{" "}
                {lastDisplayed} sur{" "}
                {filteredUsers.length}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() =>
                    setPage((current) =>
                      Math.max(1, current - 1)
                    )
                  }
                  className="rounded-xl bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  ← Précédent
                </button>

                <div className="rounded-xl bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-700">
                  Page {page} / {totalPages}
                </div>

                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() =>
                    setPage((current) =>
                      Math.min(
                        totalPages,
                        current + 1
                      )
                    )
                  }
                  className="rounded-xl bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Suivant →
                </button>
              </div>
            </div>
          </div>
        )}

        {createUserOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
              <div className="flex items-start justify-between border-b border-gray-100 px-6 py-5">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">
                    Nouvel utilisateur
                  </h2>

                  <p className="mt-1 text-sm text-gray-500">
                    Créez un compte SchoolNet et attribuez-lui un rôle.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={closeCreateUserModal}
                  disabled={creatingUser}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-xl text-gray-500 transition hover:bg-gray-200 disabled:opacity-50"
                >
                  ×
                </button>
              </div>

              <div className="space-y-5 p-6">
                {createUserError && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {createUserError}
                  </div>
                )}

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Nom complet
                  </label>

                  <input
                    type="text"
                    value={createUserForm.fullName}
                    onChange={(event) =>
                      setCreateUserForm((current) => ({
                        ...current,
                        fullName: event.target.value,
                      }))
                    }
                    placeholder="Ex. Koné Aïcha"
                    disabled={creatingUser}
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-gray-50"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Adresse e-mail
                  </label>

                  <input
                    type="email"
                    value={createUserForm.email}
                    onChange={(event) =>
                      setCreateUserForm((current) => ({
                        ...current,
                        email: event.target.value,
                      }))
                    }
                    placeholder="utilisateur@exemple.com"
                    disabled={creatingUser}
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-gray-50"
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      Rôle
                    </label>

                    <select
                      value={createUserForm.role}
                      onChange={(event) => {
                      const role = event.target.value as UserRole;

                      if (role !== "student") {
                        setSelectedClassId("");
                      }

                      setCreateUserForm((current) => ({
                        ...current,
                        role,
                        className:
                          role === "student"
                            ? current.className
                            : "",
                      }));
                    }}
                      disabled={creatingUser}
                      className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    >
                      <option value="student">Apprenant</option>
                      <option value="teacher">Enseignant</option>
                      <option value="parent">Parent / Tuteur</option>
                      <option value="admin">Administrateur</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      Téléphone
                    </label>

                    <input
                      type="tel"
                      value={createUserForm.phone}
                      onChange={(event) =>
                        setCreateUserForm((current) => ({
                          ...current,
                          phone: event.target.value,
                        }))
                      }
                      placeholder="+225 01 02 03 04 05"
                      disabled={creatingUser}
                      className="w-full rounded-xl border border-gray-200 px-4 py-3 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-gray-50"
                    />
                  </div>
                </div>

                {createUserForm.role === "student" && (
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      Classe
                    </label>

                    <select
                      value={selectedClassId}
                      onChange={(event) => {
                        const classId = event.target.value;

                        const selectedClass = classOptions.find(
                          (item) => item.id === classId
                        );

                        setSelectedClassId(classId);

                        setCreateUserForm((current) => ({
                          ...current,
                          className: selectedClass?.name ?? "",
                        }));
                      }}
                      disabled={creatingUser || classesLoading}
                      className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-gray-50"
                    >
                      <option value="">
                        {classesLoading
                          ? "Chargement des classes..."
                          : "Aucune classe pour le moment"}
                      </option>

                      {classOptions.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} · {item.school_year}
                        </option>
                      ))}
                    </select>

                    {classesError ? (
                      <p className="mt-1 text-xs text-red-600">
                        {classesError}
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-gray-400">
                        Facultatif. Sélectionnez une classe existante de SchoolNet.
                      </p>
                    )}
                  </div>
                )}

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Mot de passe temporaire
                  </label>

                  <input
                    type="password"
                    value={createUserForm.password}
                    onChange={(event) =>
                      setCreateUserForm((current) => ({
                        ...current,
                        password: event.target.value,
                      }))
                    }
                    placeholder="Minimum 8 caractères"
                    disabled={creatingUser}
                    minLength={8}
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-gray-50"
                  />

                  <p className="mt-1 text-xs text-gray-400">
                    Communiquez ce mot de passe à l’utilisateur de manière sécurisée.
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-3 border-t border-gray-100 px-6 py-5">
                <button
                  type="button"
                  onClick={closeCreateUserModal}
                  disabled={creatingUser}
                  className="rounded-xl bg-gray-100 px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-200 disabled:opacity-50"
                >
                  Annuler
                </button>

                <button
                  type="button"
                  onClick={() => void handleCreateUser()}
                  disabled={creatingUser}
                  className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {creatingUser
                    ? "Création en cours…"
                    : "Créer l’utilisateur"}
                </button>
              </div>
            </div>
          </div>
        )}
        {resetPasswordUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl">
              <div className="flex items-start justify-between border-b border-gray-100 px-6 py-5">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">
                    Réinitialiser le mot de passe
                  </h2>

                  <p className="mt-1 text-sm text-gray-500">
                    Définissez un nouveau mot de passe temporaire
                    pour{" "}
                    <span className="font-semibold text-gray-700">
                      {userDisplayName(resetPasswordUser)}
                    </span>
                    .
                  </p>
                </div>

                <button
                  type="button"
                  onClick={closeResetPasswordModal}
                  disabled={resettingPassword}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-xl text-gray-500 transition hover:bg-gray-200 disabled:opacity-50"
                >
                  ×
                </button>
              </div>

              <div className="space-y-5 p-6">
                <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
                  <div className="text-sm font-semibold text-blue-900">
                    {userDisplayName(resetPasswordUser)}
                  </div>

                  <div className="mt-0.5 text-sm text-blue-700">
                    {resetPasswordUser.email}
                  </div>
                </div>

                {resetPasswordError && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {resetPasswordError}
                  </div>
                )}

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Nouveau mot de passe temporaire
                  </label>

                  <input
                    type="password"
                    value={resetPassword}
                    onChange={(event) =>
                      setResetPassword(event.target.value)
                    }
                    placeholder="Minimum 8 caractères"
                    minLength={8}
                    autoComplete="new-password"
                    disabled={resettingPassword}
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-gray-50"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Confirmer le nouveau mot de passe
                  </label>

                  <input
                    type="password"
                    value={resetPasswordConfirm}
                    onChange={(event) =>
                      setResetPasswordConfirm(
                        event.target.value
                      )
                    }
                    placeholder="Saisissez à nouveau le mot de passe"
                    minLength={8}
                    autoComplete="new-password"
                    disabled={resettingPassword}
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-gray-50"
                  />
                </div>

                <p className="text-xs leading-5 text-gray-500">
                  Le mot de passe précédent cessera immédiatement
                  de fonctionner. Communiquez le nouveau mot de passe
                  à l’utilisateur de manière sécurisée.
                </p>
              </div>

              <div className="flex justify-end gap-3 border-t border-gray-100 px-6 py-5">
                <button
                  type="button"
                  onClick={closeResetPasswordModal}
                  disabled={resettingPassword}
                  className="rounded-xl bg-gray-100 px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-200 disabled:opacity-50"
                >
                  Annuler
                </button>

                <button
                  type="button"
                  onClick={() =>
                    void handleResetUserPassword()
                  }
                  disabled={
                    resettingPassword ||
                    resetPassword.length < 8 ||
                    resetPasswordConfirm.length < 8
                  }
                  className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {resettingPassword
                    ? "Réinitialisation…"
                    : "Réinitialiser le mot de passe"}
                </button>
              </div>
            </div>
          </div>
        )}
    </div>
  );
}
