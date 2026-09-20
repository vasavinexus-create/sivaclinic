"use client";

import { Database, Wrench } from "lucide-react";
import { v2WorkflowStatus } from "../lib/workflowPages";

export default function WorkflowShell({ pageKey, label }: { pageKey: string; label: string }) {
  return <div>
    <div className="page-head">
      <div><h1>{label}</h1><p>Native V2 workflow implementation required for full V1 parity.</p></div>
    </div>
    <div className="panel v2-pending">
      <Wrench size={34}/>
      <h2>{label} Workflow</h2>
      <p>{v2WorkflowStatus[pageKey] || "This page needs a native V2 workflow component."}</p>
      <p><Database size={16}/> The V2 register/query layer is already separated. The next step is replacing this workflow shell with the transaction form and write logic from V1, using server-side list/search helpers.</p>
    </div>
  </div>;
}
