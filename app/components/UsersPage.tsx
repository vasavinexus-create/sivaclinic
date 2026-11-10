"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Filter,
  LoaderCircle,
  Pencil,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
  UserRoundPlus,
  Users,
  X,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import {
  allPageLabels,
  clinicPageSections,
  rolePages,
  roleOptions,
  PageSection,
} from "../../lib/page-permissions";
import { Field } from "../v2/components/controls";
import { Profile, Row } from "../v2/lib/types";

function PageHead({
  title,
  subtitle,
  action,
}: {
  title: React.ReactNode;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

function Empty({ text = "No database records found." }: { text?: string }) {
  return (
    <div className="empty">
      <Boxes />
      <h3>{text}</h3>
      <p>Add your first record to begin.</p>
    </div>
  );
}

function ErrorBox({ text }: { text: string }) {
  return (
    <div className="error-box">
      <AlertTriangle />
      {text}
    </div>
  );
}

function Modal({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="modal-wrap">
      <div className="modal">
        <div className="modal-head">
          <div>
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>
          <button className="icon-btn" onClick={onClose}>
            <X size={19} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function LoadingPanel() {
  return (
    <div className="loading-panel">
      <LoaderCircle className="spin" /> Loading database records…
    </div>
  );
}

function useRows(
  table: string,
  organizationId: string,
  select = "*",
  order = "created_at",
  ascending = false
) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!supabase || !organizationId) return;
    setLoading(true);
    let q = supabase
      .from(table)
      .select(select)
      .eq("organization_id", organizationId)
      .limit(10000);
    q = q.order(order, { ascending });
    const { data, error } = await q;
    setRows(data || []);
    setError(error?.message || "");
    setLoading(false);
  }, [table, organizationId, select, order, ascending]);

  useEffect(() => {
    load();
  }, [load]);

  return { rows, loading, error, reload: load };
}

export default function UsersPage({
  profile,
  notify,
}: {
  profile: Profile;
  notify: (s: string) => void;
}) {
  const users = useRows(
    "profiles",
    profile.organization_id,
    "id,organization_id,username,full_name,role,mobile,active,created_at"
  );
  const invites = useRows(
    "user_invites",
    profile.organization_id,
    "id,organization_id,username,full_name,role,doctor_id,accepted_by,active,accepted_at,created_at"
  );
  const doctors = useRows(
    "doctors",
    profile.organization_id,
    "id,organization_id,doctor_id,name,profile_id"
  );

  // Unlinked doctor records for linking dropdown
  const unlinkeddoctors = doctors.rows.filter((d) => !d.profile_id);

  // Organization-wide page permissions map: profile_id -> string[]
  const [orgPermissions, setOrgPermissions] = useState<Record<string, string[]>>({});

  const loadAllPermissions = useCallback(async () => {
    if (!supabase || !profile.organization_id) return;
    const { data, error } = await supabase
      .from("page_permissions")
      .select("profile_id, page_key")
      .eq("organization_id", profile.organization_id);
    if (!error && data) {
      const map: Record<string, string[]> = {};
      for (const row of data) {
        if (!map[row.profile_id]) map[row.profile_id] = [];
        if (row.page_key !== "Clinic Management") {
          map[row.profile_id].push(row.page_key);
        }
      }
      setOrgPermissions(map);
    }
  }, [profile.organization_id]);

  useEffect(() => {
    loadAllPermissions();
  }, [loadAllPermissions]);

  // Selected user for editing permissions
  const [selected, setSelected] = useState<Row | null>(null);
  const [checked, setChecked] = useState<string[]>([]);
  const [permSearch, setPermSearch] = useState("");
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  // Form creation state
  const [createRole, setCreateRole] = useState("doctor");
  const [createCheckedPages, setCreateCheckedPages] = useState<string[]>(
    rolePages["doctor"] || []
  );
  const [createSearch, setCreateSearch] = useState("");
  const [createShowPageConfig, setCreateShowPageConfig] = useState(true);

  // General dialog states
  const [saving, setSaving] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState("");
  const [editingUser, setEditingUser] = useState<Row | null>(null);
  const [editingInvite, setEditingInvite] = useState<Row | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{
    type: "user" | "invite";
    row: Row;
  } | null>(null);

  // When selected user changes, load their permissions
  useEffect(() => {
    if (!selected || !supabase) {
      setChecked([]);
      return;
    }
    supabase
      .from("page_permissions")
      .select("page_key")
      .eq("profile_id", selected.id)
      .then(({ data }) => {
        if (data && data.length > 0) {
          setChecked(
            data
              .map((x) => x.page_key)
              .filter((p: string) => p !== "Clinic Management")
          );
        } else {
          const fallback =
            selected.role === "admin"
              ? allPageLabels
              : rolePages[selected.role] || ["Dashboard"];
          setChecked(fallback.filter((p: string) => p !== "Clinic Management"));
        }
      });
  }, [selected]);

  // Helper to determine enabled pages count for a user
  const getUserPages = useCallback(
    (userId: string, role: string) => {
      if (orgPermissions[userId] && orgPermissions[userId].length > 0) {
        return orgPermissions[userId];
      }
      if (role === "admin") return allPageLabels;
      return rolePages[role] || ["Dashboard"];
    },
    [orgPermissions]
  );

  const checkUsername = async (
    username: string,
    current?: { profileId?: string; inviteId?: string }
  ) => {
    if (!username.trim()) {
      setUsernameStatus("");
      return;
    }
    const { data, error } = await supabase!.rpc("username_available_for_user", {
      p_username: username,
      p_profile_id: current?.profileId || null,
      p_invite_id: current?.inviteId || null,
    });
    setUsernameStatus(
      error
        ? error.message
        : data
        ? "Username available"
        : "Username already used"
    );
  };

  const handleRoleChange = (newRole: string) => {
    setCreateRole(newRole);
    const template =
      newRole === "admin"
        ? [...allPageLabels]
        : rolePages[newRole] || ["Dashboard"];
    setCreateCheckedPages(template.filter((p) => p !== "Clinic Management"));
  };

  // Toggle page in selected user's permissions
  const togglePage = (page: string) => {
    setChecked((prev) =>
      prev.includes(page) ? prev.filter((p) => p !== page) : [...prev, page]
    );
  };

  // Toggle section in selected user's permissions
  const toggleSection = (sectionPages: string[]) => {
    const allSectionChecked = sectionPages.every((p) => checked.includes(p));
    if (allSectionChecked) {
      setChecked((prev) => prev.filter((p) => !sectionPages.includes(p)));
    } else {
      setChecked((prev) => Array.from(new Set([...prev, ...sectionPages])));
    }
  };

  // Toggle page in creation form
  const toggleCreatePage = (page: string) => {
    setCreateCheckedPages((prev) =>
      prev.includes(page) ? prev.filter((p) => p !== page) : [...prev, page]
    );
  };

  // Toggle section in creation form
  const toggleCreateSection = (sectionPages: string[]) => {
    const allSectionChecked = sectionPages.every((p) =>
      createCheckedPages.includes(p)
    );
    if (allSectionChecked) {
      setCreateCheckedPages((prev) =>
        prev.filter((p) => !sectionPages.includes(p))
      );
    } else {
      setCreateCheckedPages((prev) =>
        Array.from(new Set([...prev, ...sectionPages]))
      );
    }
  };

  // Create new user login with user-wise page permissions
  const createLogin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const rawUsername = String(f.get("username") || "").trim();
    const rawPassword = String(f.get("password") || "").trim();
    const fullName = String(f.get("full_name") || "").trim();
    const role = createRole;
    let doctorId = String(f.get("doctor_id") || "");

    if (!rawUsername) {
      notify("Username is required");
      return;
    }
    if (!rawPassword || rawPassword.length < 6) {
      notify("Password must be at least 6 characters");
      return;
    }
    if (createCheckedPages.length === 0) {
      if (
        !confirm(
          "No pages are selected for this user. They will have access to no pages upon login. Continue?"
        )
      ) {
        return;
      }
    }

    setSaving(true);
    const available = await supabase!.rpc("username_available", {
      p_username: rawUsername,
    });
    if (available.error || !available.data) {
      setSaving(false);
      notify(available.error?.message || "Username already used");
      return;
    }

    if (role === "doctor" && !doctorId) {
      const { data: newDoc, error: docErr } = await supabase!
        .from("doctors")
        .insert({
          organization_id: profile.organization_id,
          doctor_id: `DOC-${Date.now().toString().slice(-6)}`,
          name: fullName,
          default_fee: 0,
          active: true,
        })
        .select("id")
        .single();
      if (docErr) {
        setSaving(false);
        notify(docErr.message);
        return;
      }
      doctorId = newDoc.id;
    }

    // Upsert invite
    const { error: inviteErr } = await supabase!.rpc(
      "upsert_user_invite_username",
      {
        p_username: rawUsername,
        p_password: rawPassword,
        p_full_name: fullName,
        p_role: role,
        p_doctor_id: doctorId || null,
      }
    );
    if (inviteErr) {
      setSaving(false);
      notify(inviteErr.message);
      return;
    }

    // Provision the auth user and public.profiles immediately
    await supabase!.rpc("create_pending_username_auth_user", {
      p_username: rawUsername,
      p_password: rawPassword,
    });

    // Query the created profile id to attach page permissions right now
    const { data: createdProf } = await supabase!
      .from("profiles")
      .select("id")
      .ilike("username", rawUsername)
      .single();

    if (createdProf?.id && createCheckedPages.length > 0) {
      await supabase!.rpc("set_page_permissions", {
        p_profile_id: createdProf.id,
        p_pages: createCheckedPages,
      });
    }

    setSaving(false);
    notify(
      `Login created for ${rawUsername} with ${createCheckedPages.length} enabled pages.`
    );
    form.reset();
    setUsernameStatus("");
    setCreateCheckedPages(rolePages["doctor"] || []);
    setCreateRole("doctor");
    users.reload();
    invites.reload();
    doctors.reload();
    loadAllPermissions();
  };

  const savePermissions = async () => {
    if (!selected) return;
    if (checked.length === 0) {
      if (
        !confirm(
          "No pages are selected. This user will have no access to any pages. Continue?"
        )
      ) {
        return;
      }
    }
    setSaving(true);
    const { error } = await supabase!.rpc("set_page_permissions", {
      p_profile_id: selected.id,
      p_pages: checked,
    });
    setSaving(false);
    if (error) {
      notify(error.message);
    } else {
      setOrgPermissions((prev) => ({ ...prev, [selected.id]: checked }));
      notify(
        `Page access updated for ${selected.full_name} (${checked.length} pages enabled).`
      );
    }
  };

  const saveUserEdit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingUser) return;
    const f = new FormData(e.currentTarget);
    setSaving(true);
    const role = String(f.get("role"));
    const fullName = String(f.get("full_name") || "").trim();
    const active = f.get("active") === "true";
    const { error } = await supabase!.rpc("update_profile_login_json", {
      p_payload: {
        profile_id: editingUser.id,
        username: f.get("username"),
        password: String(f.get("password") || ""),
        full_name: fullName,
        role,
        active,
      },
    });
    if (error) {
      setSaving(false);
      notify(error.message);
      return;
    }
    if (role === "doctor") {
      const existingDoc = doctors.rows.find(
        (d) => d.profile_id === editingUser.id
      );
      if (existingDoc) {
        await supabase!
          .from("doctors")
          .update({ name: fullName || existingDoc.name, active })
          .eq("id", existingDoc.id);
      } else {
        await supabase!.from("doctors").insert({
          organization_id: profile.organization_id,
          profile_id: editingUser.id,
          doctor_id: `DOC-${Date.now().toString().slice(-6)}`,
          name: fullName || editingUser.full_name,
          default_fee: 0,
          active,
        });
      }
    }
    setSaving(false);
    notify("User login updated");
    setEditingUser(null);
    setUsernameStatus("");
    users.reload();
    invites.reload();
    doctors.reload();
  };

  const saveInviteEdit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingInvite) return;
    const f = new FormData(e.currentTarget);
    setSaving(true);
    const role = String(f.get("role"));
    const fullName = String(f.get("full_name") || "").trim();
    const active = f.get("active") === "true";
    const { error } = await supabase!.rpc("update_invite_login_json", {
      p_payload: {
        invite_id: editingInvite.id,
        username: f.get("username"),
        password: String(f.get("password") || ""),
        full_name: fullName,
        role,
        active,
      },
    });
    if (error) {
      setSaving(false);
      notify(error.message);
      return;
    }
    if (role === "doctor") {
      const existingDoc = doctors.rows.find(
        (d) =>
          d.id === editingInvite.doctor_id ||
          (editingInvite.accepted_by &&
            d.profile_id === editingInvite.accepted_by)
      );
      if (existingDoc) {
        await supabase!
          .from("doctors")
          .update({
            name: fullName || existingDoc.name,
            active,
            profile_id: editingInvite.accepted_by || existingDoc.profile_id,
          })
          .eq("id", existingDoc.id);
      } else {
        const { data: newDoc } = await supabase!
          .from("doctors")
          .insert({
            organization_id: profile.organization_id,
            profile_id: editingInvite.accepted_by || null,
            doctor_id: `DOC-${Date.now().toString().slice(-6)}`,
            name: fullName || editingInvite.full_name,
            default_fee: 0,
            active,
          })
          .select("id")
          .single();
        if (newDoc) {
          await supabase!
            .from("user_invites")
            .update({ doctor_id: newDoc.id })
            .eq("id", editingInvite.id);
        }
      }
    }
    setSaving(false);
    notify("Login record updated");
    setEditingInvite(null);
    setUsernameStatus("");
    invites.reload();
    doctors.reload();
  };

  const deleteUser = async (user: Row) => {
    setSaving(true);
    await supabase!.from("page_permissions").delete().eq("profile_id", user.id);
    if (user.username) {
      await supabase!.from("user_invites").delete().eq("username", user.username);
    }
    await supabase!.from("user_invites").delete().eq("accepted_by", user.id);
    const docs = await supabase!
      .from("doctors")
      .select("id")
      .eq("profile_id", user.id);
    if (docs.data?.length) {
      for (const doc of docs.data) {
        const { count } = await supabase!
          .from("consultations")
          .select("id", { count: "exact", head: true })
          .eq("doctor_id", doc.id);
        if (!count) {
          await supabase!.from("doctors").delete().eq("id", doc.id);
        } else {
          await supabase!.from("doctors").update({ profile_id: null }).eq("id", doc.id);
        }
      }
    }
    const { error } = await supabase!.from("profiles").delete().eq("id", user.id);
    setSaving(false);
    if (error) {
      notify(error.message);
      return;
    }
    if (selected?.id === user.id) setSelected(null);
    notify(`User ${user.full_name} deleted`);
    users.reload();
    invites.reload();
    doctors.reload();
    loadAllPermissions();
    setConfirmDelete(null);
  };

  const deleteInvite = async (invite: Row) => {
    setSaving(true);
    if (invite.accepted_by) {
      await supabase!
        .from("page_permissions")
        .delete()
        .eq("profile_id", invite.accepted_by);
      const docs = await supabase!
        .from("doctors")
        .select("id")
        .eq("profile_id", invite.accepted_by);
      if (docs.data?.length) {
        for (const doc of docs.data) {
          const { count } = await supabase!
            .from("consultations")
            .select("id", { count: "exact", head: true })
            .eq("doctor_id", doc.id);
          if (!count) {
            await supabase!.from("doctors").delete().eq("id", doc.id);
          } else {
            await supabase!.from("doctors").update({ profile_id: null }).eq("id", doc.id);
          }
        }
      }
      await supabase!.from("profiles").delete().eq("id", invite.accepted_by);
    }
    if (invite.username) {
      await supabase!.from("profiles").delete().eq("username", invite.username);
    }
    const { error } = await supabase!.from("user_invites").delete().eq("id", invite.id);
    setSaving(false);
    if (error) {
      notify(error.message);
      return;
    }
    notify(`Login record for ${invite.full_name} deleted`);
    users.reload();
    invites.reload();
    doctors.reload();
    loadAllPermissions();
    setConfirmDelete(null);
  };

  if (profile.role !== "admin") {
    return (
      <>
        <PageHead
          title="Users & Roles"
          subtitle="Only clinic admins can manage logins and page permissions"
        />
        <ErrorBox text="Clinic admin access is required for this page." />
      </>
    );
  }

  const clinicUsers = users.rows.filter((u) => u.role !== "software_owner");
  const clinicInvites = invites.rows.filter((i) => i.role !== "software_owner");

  return (
    <>
      <PageHead
        title="Users & Roles"
        subtitle="Manage user-wise page configuration and clinic logins"
      />

      <div className="admin-grid">
        {/* Create login access panel with embedded page permissions */}
        <div className="panel form-panel">
          <h2 className="panel-title">Create Login Access</h2>
          <div className="auth-message login-help" style={{ marginBottom: "12px" }}>
            Configure the user's login details and select exactly which pages they can access.
          </div>

          <form onSubmit={createLogin} autoComplete="off">
            <div className="form-grid">
              <Field name="full_name" label="Full name" required />
              <label className="field">
                <span>Username *</span>
                <input
                  name="username"
                  required
                  autoComplete="off"
                  inputMode="text"
                  spellCheck={false}
                  onBlur={(e) => checkUsername(e.currentTarget.value)}
                />
                <small>{usernameStatus}</small>
              </label>
              <label className="field">
                <span>
                  Password <b>*</b>
                </span>
                <input
                  name="password"
                  type="password"
                  required
                  autoComplete="new-password"
                />
              </label>
              <label className="field">
                <span>Role Template *</span>
                <select
                  name="role"
                  required
                  value={createRole}
                  onChange={(e) => handleRoleChange(e.target.value)}
                >
                  {roleOptions.map((r) => (
                    <option key={r} value={r}>
                      {r.replace("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Link doctor profile</span>
                <select name="doctor_id">
                  <option value="">Not a doctor login</option>
                  {unlinkeddoctors.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.doctor_id} - {d.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {/* User-Wise Page Configuration Section inside Create Form */}
            <div
              style={{
                marginTop: "16px",
                padding: "12px",
                border: "1px solid var(--line)",
                borderRadius: "8px",
                background: "#f9fbfa",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "8px",
                  marginBottom: "10px",
                }}
              >
                <div>
                  <strong style={{ fontSize: "12px", color: "var(--ink)" }}>
                    User-Wise Page Configuration
                  </strong>
                  <span
                    style={{
                      display: "block",
                      fontSize: "10px",
                      color: "var(--muted)",
                      marginTop: "2px",
                    }}
                  >
                    Only enabled pages will be visible in the sidebar and accessible.
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span
                    style={{
                      fontSize: "10px",
                      fontWeight: 700,
                      padding: "2px 8px",
                      borderRadius: "10px",
                      background: createCheckedPages.length > 0 ? "#e6f4ea" : "#fce8e6",
                      color: createCheckedPages.length > 0 ? "#137333" : "#c5221f",
                    }}
                  >
                    {createCheckedPages.length} of {allPageLabels.length} pages enabled
                  </span>
                  <button
                    type="button"
                    className="table-edit"
                    style={{ height: "26px", padding: "0 8px" }}
                    onClick={() => setCreateShowPageConfig((prev) => !prev)}
                  >
                    {createShowPageConfig ? "Collapse" : "Expand"}
                  </button>
                </div>
              </div>

              {createShowPageConfig && (
                <>
                  <div
                    style={{
                      display: "flex",
                      gap: "6px",
                      alignItems: "center",
                      flexWrap: "wrap",
                      marginBottom: "10px",
                    }}
                  >
                    <button
                      type="button"
                      className="table-edit"
                      onClick={() =>
                        setCreateCheckedPages(
                          createRole === "admin"
                            ? [...allPageLabels]
                            : rolePages[createRole] || ["Dashboard"]
                        )
                      }
                      title={`Reset to ${createRole} default preset`}
                    >
                      <RotateCcw size={12} /> Reset to {createRole} Preset
                    </button>
                    <button
                      type="button"
                      className="table-edit"
                      onClick={() => setCreateCheckedPages([...allPageLabels])}
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      className="table-edit"
                      onClick={() => setCreateCheckedPages([])}
                    >
                      Clear All
                    </button>
                    <div style={{ position: "relative", flex: 1, minWidth: "140px" }}>
                      <input
                        type="text"
                        placeholder="Search pages…"
                        value={createSearch}
                        onChange={(e) => setCreateSearch(e.target.value)}
                        style={{
                          width: "100%",
                          height: "28px",
                          fontSize: "10px",
                          padding: "0 8px 0 24px",
                          borderRadius: "6px",
                          border: "1px solid var(--line)",
                        }}
                      />
                      <Search
                        size={12}
                        style={{
                          position: "absolute",
                          left: "8px",
                          top: "8px",
                          color: "var(--muted)",
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ maxHeight: "320px", overflowY: "auto", display: "grid", gap: "10px", paddingRight: "4px" }}>
                    {clinicPageSections.map((section) => {
                      const filteredPages = section.pages.filter((p) =>
                        p.toLowerCase().includes(createSearch.toLowerCase())
                      );
                      if (filteredPages.length === 0) return null;
                      const allSectionChecked = section.pages.every((p) =>
                        createCheckedPages.includes(p)
                      );
                      const someSectionChecked = section.pages.some((p) =>
                        createCheckedPages.includes(p)
                      );
                      const countChecked = section.pages.filter((p) =>
                        createCheckedPages.includes(p)
                      ).length;

                      return (
                        <div
                          key={section.title}
                          style={{
                            border: "1px solid #e2ebe7",
                            borderRadius: "6px",
                            padding: "8px",
                            background: "#fff",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              marginBottom: "6px",
                            }}
                          >
                            <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--green)" }}>
                              {section.title}
                              <small
                                style={{
                                  marginLeft: "6px",
                                  fontWeight: 600,
                                  color: "var(--muted)",
                                  fontSize: "9px",
                                }}
                              >
                                ({countChecked}/{section.pages.length})
                              </small>
                            </span>
                            <button
                              type="button"
                              className="table-edit"
                              style={{ height: "22px", padding: "0 6px", fontSize: "9px" }}
                              onClick={() => toggleCreateSection(section.pages)}
                            >
                              {allSectionChecked ? "Deselect" : "Select Section"}
                            </button>
                          </div>
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
                              gap: "5px",
                            }}
                          >
                            {filteredPages.map((page) => (
                              <label
                                key={page}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "6px",
                                  fontSize: "9.5px",
                                  cursor: "pointer",
                                  padding: "4px 6px",
                                  borderRadius: "4px",
                                  background: createCheckedPages.includes(page) ? "#eef6f3" : "#fdfdfd",
                                  border: `1px solid ${createCheckedPages.includes(page) ? "#b8dcce" : "#edf2f0"}`,
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={createCheckedPages.includes(page)}
                                  onChange={() => toggleCreatePage(page)}
                                  style={{ accentColor: "var(--green)" }}
                                />
                                <span style={{ overflowWrap: "anywhere" }}>{page}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            <div className="form-actions" style={{ marginTop: "14px" }}>
              <button className="primary" disabled={saving}>
                {saving ? (
                  <LoaderCircle className="spin" />
                ) : (
                  <UserRoundPlus size={16} />
                )}
                Save Login & Configure Pages
              </button>
            </div>
          </form>
        </div>

        {/* Active users panel */}
        <div className="panel">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "14px",
            }}
          >
            <h2 className="panel-title" style={{ margin: 0 }}>Active Users</h2>
            <span style={{ fontSize: "11px", color: "var(--muted)" }}>
              {clinicUsers.length} user{clinicUsers.length === 1 ? "" : "s"}
            </span>
          </div>

          {users.error ? (
            <ErrorBox text={users.error} />
          ) : users.loading ? (
            <LoadingPanel />
          ) : clinicUsers.length ? (
            <div className="user-list">
              {clinicUsers.map((user) => {
                const userPages = getUserPages(user.id, user.role);
                const isSelected = selected?.id === user.id;

                return (
                  <div
                    key={user.id}
                    className={`user-row ${isSelected ? "selected" : ""}`}
                    onClick={() => setSelected(user)}
                    style={{
                      borderLeft: isSelected ? "4px solid var(--green)" : undefined,
                    }}
                  >
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                        <strong>{user.full_name}</strong>
                        <span
                          style={{
                            fontSize: "9px",
                            fontWeight: 700,
                            padding: "2px 6px",
                            borderRadius: "10px",
                            background: userPages.length > 0 ? "#e6f4ea" : "#fce8e6",
                            color: userPages.length > 0 ? "#137333" : "#c5221f",
                            border: `1px solid ${userPages.length > 0 ? "#ceead6" : "#fad2cf"}`,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "3px",
                          }}
                          title="Configured pages enabled for this user"
                        >
                          <ShieldCheck size={11} /> {userPages.length} pages enabled
                        </span>
                      </div>
                      <small>
                        @{user.username || "needs username"} · {user.role.replace("_", " ")} ·{" "}
                        {user.active ? "Active" : "Inactive"}
                      </small>
                    </span>

                    <div
                      className="user-row-actions"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        className="table-edit"
                        style={
                          isSelected
                            ? {
                                background: "var(--green)",
                                color: "#fff",
                                borderColor: "var(--green)",
                              }
                            : undefined
                        }
                        onClick={() => setSelected(user)}
                        title="Configure enabled pages for this user"
                      >
                        <ShieldCheck size={14} /> Configure Pages
                      </button>
                      <button
                        type="button"
                        className="table-edit"
                        onClick={() => {
                          setEditingUser(user);
                          setUsernameStatus("");
                        }}
                      >
                        <Pencil size={14} /> Edit
                      </button>
                      <button
                        type="button"
                        className="table-edit danger-btn"
                        onClick={() =>
                          setConfirmDelete({ type: "user", row: user })
                        }
                      >
                        <Trash2 size={14} /> Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <Empty text="No users found." />
          )}
        </div>
      </div>

      {/* User-Wise Page Access Configuration Section */}
      {selected ? (
        <div className="panel admin-section" style={{ border: "2px solid #b7dfd2", background: "#fcfffd" }}>
          <div className="permission-head">
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <h2 className="panel-title" style={{ margin: 0 }}>
                  Page Access Configuration: {selected.full_name}
                </h2>
                <span
                  style={{
                    fontSize: "10px",
                    fontWeight: 700,
                    padding: "3px 8px",
                    borderRadius: "12px",
                    background: "#e6f4ea",
                    color: "#137333",
                  }}
                >
                  @{selected.username || "username"} · {selected.role.replace("_", " ")}
                </span>
                <span
                  style={{
                    fontSize: "10px",
                    fontWeight: 700,
                    padding: "3px 8px",
                    borderRadius: "12px",
                    background: checked.length > 0 ? "var(--green)" : "#e53e3e",
                    color: "#fff",
                  }}
                >
                  {checked.length} of {allPageLabels.length} pages enabled
                </span>
              </div>
              <p style={{ marginTop: "4px" }}>
                Only the enabled pages checked below will be visible in the sidebar and accessible by this user.
              </p>
            </div>

            <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
              <button
                type="button"
                className="secondary"
                onClick={() => setSelected(null)}
              >
                Close Editor
              </button>
              <button
                className="primary"
                onClick={savePermissions}
                disabled={saving}
              >
                {saving ? (
                  <LoaderCircle className="spin" />
                ) : (
                  <CheckCircle2 size={16} />
                )}
                Save Permissions
              </button>
            </div>
          </div>

          {/* Quick Toolbar */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "8px",
              padding: "10px",
              background: "#f2f7f5",
              borderRadius: "8px",
              marginBottom: "14px",
            }}
          >
            <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
              <button
                type="button"
                className="table-edit"
                onClick={() =>
                  setChecked(
                    selected.role === "admin"
                      ? [...allPageLabels]
                      : (rolePages[selected.role] || ["Dashboard"]).filter(
                          (p) => p !== "Clinic Management"
                        )
                  )
                }
              >
                <RotateCcw size={12} /> Reset to {selected.role} Template
              </button>
              <button
                type="button"
                className="table-edit"
                onClick={() => setChecked([...allPageLabels])}
              >
                Select All ({allPageLabels.length})
              </button>
              <button
                type="button"
                className="table-edit"
                onClick={() => setChecked([])}
              >
                Clear All
              </button>
            </div>

            <div style={{ position: "relative", minWidth: "200px" }}>
              <input
                type="text"
                placeholder="Filter pages…"
                value={permSearch}
                onChange={(e) => setPermSearch(e.target.value)}
                style={{
                  width: "100%",
                  height: "30px",
                  fontSize: "11px",
                  padding: "0 8px 0 26px",
                  borderRadius: "6px",
                  border: "1px solid var(--line)",
                  background: "#fff",
                }}
              />
              <Search
                size={13}
                style={{
                  position: "absolute",
                  left: "8px",
                  top: "9px",
                  color: "var(--muted)",
                }}
              />
            </div>
          </div>

          {/* Grouped Category Sections */}
          <div style={{ display: "grid", gap: "12px" }}>
            {clinicPageSections.map((section) => {
              const filteredPages = section.pages.filter((p) =>
                p.toLowerCase().includes(permSearch.toLowerCase())
              );
              if (filteredPages.length === 0) return null;
              const allSectionChecked = section.pages.every((p) =>
                checked.includes(p)
              );
              const countChecked = section.pages.filter((p) =>
                checked.includes(p)
              ).length;
              const isCollapsed = collapsedSections[section.title];

              return (
                <div
                  key={section.title}
                  style={{
                    border: "1px solid #d4e5de",
                    borderRadius: "8px",
                    background: "#fff",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "10px 14px",
                      background: "#f7faf9",
                      borderBottom: isCollapsed ? "none" : "1px solid #e3ede8",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        cursor: "pointer",
                      }}
                      onClick={() =>
                        setCollapsedSections((prev) => ({
                          ...prev,
                          [section.title]: !prev[section.title],
                        }))
                      }
                    >
                      {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                      <strong style={{ fontSize: "12px", color: "var(--ink)" }}>
                        {section.title}
                      </strong>
                      <span
                        style={{
                          fontSize: "10px",
                          fontWeight: 700,
                          padding: "1px 7px",
                          borderRadius: "10px",
                          background: countChecked > 0 ? "#e6f4ea" : "#f1f3f4",
                          color: countChecked > 0 ? "#137333" : "#5f6368",
                        }}
                      >
                        {countChecked} / {section.pages.length} enabled
                      </span>
                    </div>

                    <button
                      type="button"
                      className="table-edit"
                      style={{ height: "24px", padding: "0 8px", fontSize: "10px" }}
                      onClick={() => toggleSection(section.pages)}
                    >
                      {allSectionChecked ? "Deselect Section" : "Select Section"}
                    </button>
                  </div>

                  {!isCollapsed && (
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                        gap: "8px",
                        padding: "12px 14px",
                      }}
                    >
                      {filteredPages.map((page) => {
                        const isPageChecked = checked.includes(page);
                        return (
                          <label
                            key={page}
                            className="permission-check"
                            style={{
                              padding: "8px 10px",
                              borderRadius: "6px",
                              border: `1px solid ${isPageChecked ? "#9cc9bc" : "var(--line)"}`,
                              background: isPageChecked ? "#edf7f3" : "#fff",
                              cursor: "pointer",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={isPageChecked}
                              onChange={() => togglePage(page)}
                            />
                            <span>{page}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: "16px",
              paddingTop: "14px",
              borderTop: "1px solid #e2ebe7",
            }}
          >
            <span style={{ fontSize: "11px", color: "var(--muted)" }}>
              Changes will take effect immediately upon saving.
            </span>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                className="secondary"
                onClick={() => setSelected(null)}
              >
                Close
              </button>
              <button
                className="primary"
                onClick={savePermissions}
                disabled={saving}
              >
                {saving ? (
                  <LoaderCircle className="spin" />
                ) : (
                  <CheckCircle2 size={16} />
                )}
                Save Permissions
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div
          className="panel admin-section"
          style={{
            textAlign: "center",
            padding: "24px",
            border: "1px dashed var(--line)",
            background: "#fafcfb",
          }}
        >
          <ShieldCheck size={28} style={{ color: "var(--green)", margin: "0 auto 8px" }} />
          <h3 style={{ margin: "0 0 4px", fontSize: "14px" }}>
            Select a User to Configure Page Access
          </h3>
          <p style={{ margin: 0, fontSize: "11px", color: "var(--muted)" }}>
            Click <strong>Configure Pages</strong> on any active user above to customize the exact pages they can see and access.
          </p>
        </div>
      )}

      {/* Login access records panel */}
      <div className="panel admin-section">
        <h2 className="panel-title">Login Access Records</h2>
        <div className="auth-message login-help">
          Waiting first login means the user is saved and can sign in, but has not opened the app yet.
        </div>
        {invites.error ? (
          <ErrorBox text={invites.error} />
        ) : invites.loading ? (
          <LoadingPanel />
        ) : clinicInvites.length ? (
          <div className="user-list">
            {clinicInvites.map((invite) => {
              const matchedProf = users.rows.find(
                (u) =>
                  (invite.accepted_by && u.id === invite.accepted_by) ||
                  (u.username &&
                    invite.username &&
                    u.username.toLowerCase() === invite.username.toLowerCase())
              );
              const invitePages = matchedProf
                ? getUserPages(matchedProf.id, invite.role)
                : rolePages[invite.role] || ["Dashboard"];

              return (
                <div key={invite.id} className="user-row">
                  <span
                    onClick={() => {
                      setEditingInvite(invite);
                      setUsernameStatus("");
                    }}
                    style={{ flex: 1, minWidth: 0 }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                      <strong>{invite.full_name}</strong>
                      <span
                        style={{
                          fontSize: "9px",
                          fontWeight: 700,
                          padding: "2px 6px",
                          borderRadius: "10px",
                          background: "#f0f4f2",
                          color: "var(--ink)",
                          border: "1px solid #dbe5e1",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "3px",
                        }}
                      >
                        <ShieldCheck size={11} /> {invitePages.length} pages enabled
                      </span>
                    </div>
                    <small>
                      @{invite.username || "needs username"} ·{" "}
                      {invite.role.replace("_", " ")} ·{" "}
                      {invite.active ? "Active" : "Inactive"} ·{" "}
                      {invite.accepted_at ? "Accepted" : "Waiting first login"}
                    </small>
                  </span>
                  <div className="user-row-actions">
                    {matchedProf && (
                      <button
                        type="button"
                        className="table-edit"
                        onClick={() => setSelected(matchedProf)}
                        title="Configure enabled pages"
                      >
                        <ShieldCheck size={14} /> Configure Pages
                      </button>
                    )}
                    <button
                      type="button"
                      className="table-edit"
                      onClick={() => {
                        setEditingInvite(invite);
                        setUsernameStatus("");
                      }}
                    >
                      <Pencil size={14} /> Edit
                    </button>
                    <button
                      type="button"
                      className="table-edit danger-btn"
                      onClick={() =>
                        setConfirmDelete({ type: "invite", row: invite })
                      }
                    >
                      <Trash2 size={14} /> Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <Empty text="No login access records found." />
        )}
      </div>

      {/* Edit active user modal */}
      {editingUser && (
        <Modal
          title={`Edit user ${editingUser.full_name}`}
          subtitle="Assign or change username/password for an existing active user"
          onClose={() => setEditingUser(null)}
        >
          <form onSubmit={saveUserEdit}>
            <div className="form-grid">
              <Field
                name="full_name"
                label="Full name"
                required
                defaultValue={editingUser.full_name}
              />
              <label className="field">
                <span>Username *</span>
                <input
                  name="username"
                  required
                  defaultValue={editingUser.username || ""}
                  onBlur={(e) =>
                    checkUsername(e.currentTarget.value, {
                      profileId: editingUser.id,
                    })
                  }
                />
                <small>{usernameStatus}</small>
              </label>
              <Field
                name="password"
                label="New password (optional)"
                type="password"
              />
              <label className="field">
                <span>Role *</span>
                <select name="role" required defaultValue={editingUser.role}>
                  {roleOptions.map((r) => (
                    <option key={r} value={r}>
                      {r.replace("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Status</span>
                <select
                  name="active"
                  defaultValue={String(editingUser.active)}
                >
                  <option value="true">Active</option>
                  <option value="false">Inactive</option>
                </select>
              </label>
            </div>
            <div className="form-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setEditingUser(null)}
              >
                Cancel
              </button>
              <button className="primary" disabled={saving}>
                {saving ? (
                  <LoaderCircle className="spin" />
                ) : (
                  <CheckCircle2 size={16} />
                )}
                Update User
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit invite modal */}
      {editingInvite && (
        <Modal
          title={`Edit login ${editingInvite.full_name}`}
          subtitle="Edit saved login record. Password is changed only when entered."
          onClose={() => setEditingInvite(null)}
        >
          <form onSubmit={saveInviteEdit}>
            <div className="form-grid">
              <Field
                name="full_name"
                label="Full name"
                required
                defaultValue={editingInvite.full_name}
              />
              <label className="field">
                <span>Username *</span>
                <input
                  name="username"
                  required
                  defaultValue={editingInvite.username || ""}
                  onBlur={(e) =>
                    checkUsername(e.currentTarget.value, {
                      inviteId: editingInvite.id,
                    })
                  }
                />
                <small>{usernameStatus}</small>
              </label>
              <Field
                name="password"
                label="New password (optional)"
                type="password"
              />
              <label className="field">
                <span>Role *</span>
                <select name="role" required defaultValue={editingInvite.role}>
                  {roleOptions.map((r) => (
                    <option key={r} value={r}>
                      {r.replace("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Status</span>
                <select
                  name="active"
                  defaultValue={String(editingInvite.active)}
                >
                  <option value="true">Active</option>
                  <option value="false">Inactive</option>
                </select>
              </label>
            </div>
            <div className="form-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setEditingInvite(null)}
              >
                Cancel
              </button>
              <button className="primary" disabled={saving}>
                {saving ? (
                  <LoaderCircle className="spin" />
                ) : (
                  <CheckCircle2 size={16} />
                )}
                Update Login
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <Modal
          title="Confirm Delete"
          subtitle={`Are you sure you want to delete ${confirmDelete.row.full_name}? This cannot be undone.`}
          onClose={() => setConfirmDelete(null)}
        >
          <div className="form-actions" style={{ marginTop: "1rem" }}>
            <button
              type="button"
              className="secondary"
              onClick={() => setConfirmDelete(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="primary"
              style={{ background: "var(--danger, #e53e3e)" }}
              disabled={saving}
              onClick={() =>
                confirmDelete.type === "user"
                  ? deleteUser(confirmDelete.row)
                  : deleteInvite(confirmDelete.row)
              }
            >
              {saving ? (
                <LoaderCircle className="spin" />
              ) : (
                <Trash2 size={16} />
              )}
              Yes, Delete
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
