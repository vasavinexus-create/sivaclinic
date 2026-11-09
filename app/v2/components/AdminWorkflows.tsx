"use client";

import { FormEvent, useEffect, useState } from "react";
import { CheckCircle2, LoaderCircle } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { Organization, Profile, Row } from "../lib/types";
import { Field, FormPanel } from "./controls";

import { useOrganization } from "../lib/useOrganization";
import { mutate } from "swr";

export function SettingsWorkflow({ profile, onOrganizationChange, notify }: { profile: Profile; onOrganizationChange?: (organization: Organization | null) => void; notify: (message: string) => void }) {
  const { data: org, error: orgError } = useOrganization(profile.organization_id);
  const [saving, setSaving] = useState(false);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    try {
      const payload = {
        clinic_name: form.get("clinic_name"),
        pharmacy_name: form.get("pharmacy_name"),
        phone: form.get("phone"),
        address: form.get("address"),
        gst_number: form.get("gst_number"),
        drug_license_number: form.get("drug_license_number"),
        sales_gst_mode: form.get("sales_gst_mode"),
        sales_discount_percent: Number(form.get("sales_discount_percent") || 0),
        gemini_api_key: form.get("gemini_api_key"),
        groq_api_key: form.get("groq_api_key"),
        gemini_model: form.get("gemini_model") || "gemini-3.6-flash"
      };

      const res = await supabase!.from("organizations").update(payload).eq("id", profile.organization_id).select().single();
      
      if (res.error) throw new Error(res.error.message || "Failed to save settings");
      
      mutate(`org:${profile.organization_id}`);
      if (onOrganizationChange) onOrganizationChange(res.data as any);
      notify("Settings updated");
    } catch (e: any) {
      notify(e.message || "Failed to update settings");
    } finally {
      setSaving(false);
    }
  };

  if (orgError) return <div className="error-box">Failed to load settings</div>;

  return <FormPanel title="Settings" subtitle="Native V2 clinic settings & AI configuration" onSubmit={save}><div className="form-grid"><Field name="clinic_name" label="Clinic name" required defaultValue={org?.clinic_name||""}/><Field name="pharmacy_name" label="Pharmacy name" defaultValue={org?.pharmacy_name||""}/><Field name="phone" label="Phone" defaultValue={org?.phone||""}/><Field name="address" label="Address" defaultValue={org?.address||""}/><Field name="gst_number" label="GST number" defaultValue={org?.gst_number||""}/><Field name="drug_license_number" label="Drug license" defaultValue={org?.drug_license_number||""}/><Field name="gemini_api_key" label="Gemini API Key (AI Import)" type="password" defaultValue={org?.gemini_api_key||""}/><Field name="groq_api_key" label="Groq API Key (Free Vision)" type="password" defaultValue={org?.groq_api_key||""}/><label className="field"><span>Gemini model</span><select name="gemini_model" defaultValue={org?.gemini_model || "gemini-3.6-flash"}><option value="gemini-3.6-flash">Gemini 3.6 Flash</option><option value="gemini-2.5-flash">Gemini 2.5 Flash</option><option value="gemini-3.6-flash-lite">Gemini 3.6 Flash Lite</option></select></label><label className="field"><span>Sales GST mode</span><select name="sales_gst_mode" defaultValue={org?.sales_gst_mode || "price_plus_gst"}><option value="price_plus_gst">Price + GST</option><option value="price_only">Price only</option></select></label><Field name="sales_discount_percent" label="Billing discount %" type="number" defaultValue={org?.sales_discount_percent || 0}/></div><div className="auth-message">Billing rate = MRP / retail count, rounded up, then this discount is applied when a purchase batch has no own discount.</div><div className="form-actions"><button className="primary" disabled={saving}>{saving ? <LoaderCircle className="spin"/> : <CheckCircle2 size={16}/>} Save settings</button></div></FormPanel>;
}

export function UsersRolesWorkflow({ notify }: { notify: (message: string) => void }) {
  const [saving, setSaving] = useState(false);
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase) return;
    const form = new FormData(event.currentTarget);
    setSaving(true);
    const { error } = await supabase.rpc("upsert_user_invite_username", { p_username: form.get("username"), p_password: String(form.get("password") || ""), p_full_name: form.get("full_name"), p_role: form.get("role"), p_doctor_id: null });
    setSaving(false);
    notify(error?.message || "Login access created");
    if (!error) event.currentTarget.reset();
  };
  return <FormPanel title="Users & Roles" subtitle="Native V2 login creation; detailed permissions remain in register page" onSubmit={save}><div className="form-grid"><Field name="full_name" label="Full name" required/><Field name="username" label="Username" required/><Field name="password" label="Password" type="password" required/><label className="field"><span>Role <b>*</b></span><select name="role" required defaultValue="doctor"><option value="admin">admin</option><option value="doctor">doctor</option><option value="receptionist">receptionist</option><option value="pharmacist">pharmacist</option><option value="accountant">accountant</option><option value="store_manager">store_manager</option></select></label></div><div className="form-actions"><button className="primary" disabled={saving}>{saving ? <LoaderCircle className="spin"/> : <CheckCircle2 size={16}/>} Create login</button></div></FormPanel>;
}


export function ClinicManagementWorkflow({ notify }: { notify: (message: string) => void }) {
  const [saving, setSaving] = useState(false);
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase) return;
    const form = new FormData(event.currentTarget);
    setSaving(true);
    const { error } = await supabase.rpc("create_clinic_with_admin", {
      p_clinic_name: form.get("clinic_name"),
      p_admin_email: form.get("admin_email"),
      p_admin_name: form.get("admin_name"),
      p_phone: form.get("phone") || null
    });
    setSaving(false);
    if (error) { notify(error.message); return; }
    notify("Clinic created and admin login invite saved");
    event.currentTarget.reset();
  };
  return <FormPanel title="Clinic Management" subtitle="Software owner area for creating clinics and first admin logins" onSubmit={save}><div className="form-grid"><Field name="clinic_name" label="Hospital / clinic name" required/><Field name="phone" label="Phone"/><Field name="admin_name" label="Clinic admin name" required/><Field name="admin_email" label="Clinic admin email" type="email" required/></div><div className="form-actions"><button className="primary" disabled={saving}>{saving ? <LoaderCircle className="spin"/> : <CheckCircle2 size={16}/>} Create clinic</button></div></FormPanel>;
}
