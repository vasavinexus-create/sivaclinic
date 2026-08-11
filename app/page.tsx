"use client";

import { useMemo, useState } from "react";
import {
  Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, Bell, Boxes, CalendarDays,
  ChevronDown, CircleDollarSign, ClipboardPlus, CreditCard, FileText, LayoutDashboard,
  Menu, PackagePlus, Pill, Plus, Search, Settings, ShoppingCart, Stethoscope, Users,
  Wallet, X, CheckCircle2, Clock3, IndianRupee, TrendingUp, UserRoundPlus, ScanLine,
  Minus, Trash2, Printer, Download, ShieldCheck
} from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Patient = { id: string; name: string; mobile: string; age: number; gender: string; lastVisit: string; balance: number };
type Product = { id: string; name: string; batch: string; expiry: string; stock: number; rate: number; mrp: number; gst: number };

const patients: Patient[] = [
  { id: "PAT-000184", name: "Meenakshi R", mobile: "98421 77340", age: 46, gender: "Female", lastVisit: "Today, 10:20 AM", balance: 300 },
  { id: "PAT-000183", name: "Arun Kumar", mobile: "97885 42091", age: 31, gender: "Male", lastVisit: "Today, 9:45 AM", balance: 0 },
  { id: "PAT-000179", name: "Lakshmi S", mobile: "94432 15680", age: 62, gender: "Female", lastVisit: "10 Aug 2026", balance: 400 },
  { id: "PAT-000171", name: "Ravi Chandran", mobile: "90031 88312", age: 54, gender: "Male", lastVisit: "08 Aug 2026", balance: 0 },
];

const products: Product[] = [
  { id: "PRD-104", name: "Dolo 650 Tablet", batch: "DL2408A", expiry: "May 2027", stock: 84, rate: 28.5, mrp: 33.6, gst: 12 },
  { id: "PRD-058", name: "Azithral 500 Tablet", batch: "AZ1156", expiry: "Nov 2027", stock: 42, rate: 113, mrp: 132.5, gst: 12 },
  { id: "PRD-211", name: "Pantocid 40 Tablet", batch: "PT0924", expiry: "Feb 2027", stock: 18, rate: 142, mrp: 165, gst: 12 },
  { id: "PRD-304", name: "Alex Cough Syrup 100ml", batch: "ALX702", expiry: "Dec 2026", stock: 12, rate: 108, mrp: 126, gst: 12 },
];

const trend = [
  { day: "05 Aug", pharmacy: 18400, clinic: 6200 }, { day: "06 Aug", pharmacy: 22100, clinic: 7800 },
  { day: "07 Aug", pharmacy: 19800, clinic: 7200 }, { day: "08 Aug", pharmacy: 28400, clinic: 9100 },
  { day: "09 Aug", pharmacy: 24200, clinic: 8400 }, { day: "10 Aug", pharmacy: 31900, clinic: 10600 },
  { day: "11 Aug", pharmacy: 28750, clinic: 9600 },
];

const menu = [
  { label: "Dashboard", icon: LayoutDashboard },
  { title: "CLINIC" }, { label: "Patients", icon: Users }, { label: "New Patient", icon: UserRoundPlus },
  { label: "Consultation", icon: Stethoscope }, { label: "Patient History", icon: FileText }, { label: "Doctors", icon: Activity },
  { title: "PHARMACY" }, { label: "Billing", icon: ShoppingCart }, { label: "Sales", icon: CircleDollarSign },
  { label: "Products", icon: Pill }, { label: "Inventory", icon: Boxes }, { label: "Expiry Alerts", icon: AlertTriangle },
  { title: "PURCHASES & ACCOUNTS" }, { label: "New Purchase", icon: PackagePlus }, { label: "Suppliers", icon: ClipboardPlus },
  { label: "Cash Book", icon: Wallet }, { label: "Expenses", icon: CreditCard }, { label: "Reports", icon: TrendingUp },
  { title: "ADMINISTRATION" }, { label: "Users & Roles", icon: ShieldCheck }, { label: "Settings", icon: Settings },
];

function money(value: number) { return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`; }

export default function Home() {
  const [active, setActive] = useState("Dashboard");
  const [sideOpen, setSideOpen] = useState(false);
  const [modal, setModal] = useState<"patient" | "consult" | "bill" | null>(null);
  const [patient, setPatient] = useState<Patient>(patients[0]);
  const [cart, setCart] = useState<Array<Product & { qty: number }>>([ { ...products[0], qty: 2 }, { ...products[1], qty: 1 } ]);

  const openModule = (label: string) => {
    setActive(label); setSideOpen(false);
    if (label === "New Patient") setModal("patient");
    if (label === "Consultation") setModal("consult");
    if (label === "Billing") setModal("bill");
  };

  return (
    <main className="app-shell">
      <aside className={`sidebar ${sideOpen ? "open" : ""}`}>
        <div className="brand"><div className="brand-mark"><span>+</span></div><div><strong>SivaCare</strong><small>Clinic & Pharmacy</small></div><button className="mobile-close" onClick={() => setSideOpen(false)}><X size={20}/></button></div>
        <nav>{menu.map((item, i) => item.title ? <p className="nav-title" key={i}>{item.title}</p> : (
          <button key={item.label} className={active === item.label ? "nav-item active" : "nav-item"} onClick={() => openModule(item.label!)}>
            {item.icon && <item.icon size={18}/>}<span>{item.label}</span>{item.label === "Expiry Alerts" && <b>4</b>}
          </button>
        ))}</nav>
        <div className="sidebar-user"><div className="avatar">AS</div><div><strong>Arun Siva</strong><span>Administrator</span></div><ChevronDown size={16}/></div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <button className="menu-btn" onClick={() => setSideOpen(true)}><Menu size={22}/></button>
          <div className="global-search"><Search size={18}/><input aria-label="Global search" placeholder="Search patients, medicines, invoices..."/><kbd>⌘ K</kbd></div>
          <div className="top-actions"><button className="icon-btn"><Bell size={19}/><i/></button><div className="org"><span>Siva Clinic & Medicals</span><small>Gingee Branch</small></div><div className="avatar small">AS</div></div>
        </header>

        <div className="content">
          <div className="page-head"><div><p className="eyebrow">TUESDAY, 11 AUGUST 2026</p><h1>Good morning, Arun</h1><p>Here’s what’s happening across your clinic and pharmacy today.</p></div><div className="head-actions"><button className="date-button"><CalendarDays size={17}/> Today <ChevronDown size={15}/></button><button className="primary" onClick={() => setModal("bill")}><Plus size={18}/> New Bill</button></div></div>

          <section className="metrics">
            <Metric icon={Users} label="Today's Patients" value="28" delta="12%" tone="blue"/>
            <Metric icon={Stethoscope} label="Consultations" value="22" sub="6 waiting" tone="violet"/>
            <Metric icon={IndianRupee} label="Doctor Fees" value="₹9,600" delta="8.4%" tone="amber"/>
            <Metric icon={ShoppingCart} label="Pharmacy Sales" value="₹28,750" delta="14.2%" tone="green"/>
            <Metric icon={Wallet} label="Cash Collection" value="₹24,200" sub="UPI ₹10,950" tone="teal"/>
            <Metric icon={AlertTriangle} label="Stock Alerts" value="17" sub="4 expiring soon" tone="red"/>
          </section>

          <section className="grid-main">
            <div className="panel chart-panel"><div className="panel-head"><div><h2>Revenue overview</h2><p>Clinic and pharmacy income</p></div><div className="legend"><span><i className="dot pharmacy"/>Pharmacy</span><span><i className="dot clinic"/>Consultations</span></div></div>
              <div className="chart-totals"><div><small>7-day revenue</small><strong>₹2,31,450</strong><em><ArrowUpRight size={14}/> 11.8% vs last week</em></div></div>
              <div className="chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={trend} margin={{left:-18,right:8,top:8,bottom:0}}><defs><linearGradient id="pharmacy" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#136b5b" stopOpacity={.25}/><stop offset="100%" stopColor="#136b5b" stopOpacity={0}/></linearGradient></defs><CartesianGrid vertical={false} stroke="#edf1ef"/><XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={11}/><YAxis tickLine={false} axisLine={false} fontSize={11} tickFormatter={(v)=>`${v/1000}k`}/><Tooltip formatter={(v)=>money(Number(v))}/><Area type="monotone" dataKey="pharmacy" stroke="#136b5b" strokeWidth={2.5} fill="url(#pharmacy)"/><Area type="monotone" dataKey="clinic" stroke="#d78a43" strokeWidth={2} fill="transparent"/></AreaChart></ResponsiveContainer></div>
            </div>

            <div className="panel queue"><div className="panel-head"><div><h2>Patient queue</h2><p>6 patients waiting</p></div><button>View all</button></div>
              {patients.slice(0,3).map((p,i)=><div className="queue-row" key={p.id}><div className="queue-no">{i+1}</div><div className="patient-info"><strong>{p.name}</strong><span>{p.id} · {p.age} yrs, {p.gender[0]}</span></div><div className={`status ${i===0?'consulting':'waiting'}`}>{i===0?'In consultation':`${12+i*7} min`}</div></div>)}
              <button className="secondary full" onClick={()=>setModal("consult")}><Plus size={16}/> Start consultation</button>
            </div>
          </section>

          <section className="grid-bottom">
            <div className="panel"><div className="panel-head"><div><h2>Inventory attention</h2><p>Items needing action today</p></div><button>Manage stock</button></div>
              <div className="alert-list"><AlertRow tone="red" title="Expired batches" count="3" detail="Blocked from billing"/><AlertRow tone="amber" title="Expiring within 30 days" count="4" detail="₹8,420 stock value"/><AlertRow tone="blue" title="Below reorder level" count="10" detail="Create purchase order"/></div>
            </div>
            <div className="panel"><div className="panel-head"><div><h2>Recent activity</h2><p>Latest clinic operations</p></div><button>Audit log</button></div>
              <div className="activity-list"><ActivityRow icon={CheckCircle2} text="Invoice MED-2026-000418 completed" meta="₹1,260 · Cash · 3 min ago"/><ActivityRow icon={Stethoscope} text="Consultation saved for Meenakshi R" meta="Dr. Kannan · 8 min ago"/><ActivityRow icon={PackagePlus} text="Purchase PUR-2026-000074 received" meta="Sri Murugan Pharma · 21 min ago"/></div>
            </div>
            <div className="panel cash-card"><div className="panel-head"><div><h2>Today’s cash position</h2><p>Live ledger summary</p></div><Wallet size={20}/></div><div className="cash-total"><small>Expected closing cash</small><strong>₹32,480</strong></div><div className="cash-flow"><span><ArrowDownRight/> Cash in <b>₹38,200</b></span><span><ArrowUpRight/> Cash out <b>₹5,720</b></span></div><button className="secondary full">Open daily closing</button></div>
          </section>
        </div>
      </section>
      {sideOpen && <div className="overlay" onClick={()=>setSideOpen(false)}/>} 
      {modal === "patient" && <NewPatient onClose={()=>setModal(null)}/>} 
      {modal === "consult" && <Consultation patient={patient} setPatient={setPatient} onClose={()=>setModal(null)}/>} 
      {modal === "bill" && <Billing patient={patient} setPatient={setPatient} cart={cart} setCart={setCart} onClose={()=>setModal(null)}/>} 
    </main>
  );
}

function Metric({icon:Icon,label,value,delta,sub,tone}:{icon:any,label:string,value:string,delta?:string,sub?:string,tone:string}) { return <div className="metric"><div className={`metric-icon ${tone}`}><Icon size={20}/></div><div className="metric-copy"><span>{label}</span><strong>{value}</strong><small className={delta?"positive":""}>{delta && <ArrowUpRight size={13}/>} {delta || sub}</small></div></div> }
function AlertRow({tone,title,count,detail}:{tone:string,title:string,count:string,detail:string}) { return <div className="alert-row"><span className={`alert-dot ${tone}`}/><div><strong>{title}</strong><small>{detail}</small></div><b>{count}</b></div> }
function ActivityRow({icon:Icon,text,meta}:{icon:any,text:string,meta:string}) { return <div className="activity-row"><div className="activity-icon"><Icon size={17}/></div><div><strong>{text}</strong><small>{meta}</small></div></div> }

function Modal({title,subtitle,onClose,children,wide=false}:{title:string,subtitle:string,onClose:()=>void,children:React.ReactNode,wide?:boolean}) { return <div className="modal-wrap"><div className={`modal ${wide?'wide':''}`}><div className="modal-head"><div><h2>{title}</h2><p>{subtitle}</p></div><button className="icon-btn" onClick={onClose}><X size={20}/></button></div>{children}</div></div> }
function Field({label,placeholder,required,type="text",defaultValue}:{label:string,placeholder?:string,required?:boolean,type?:string,defaultValue?:string}) { return <label className="field"><span>{label}{required&&<b> *</b>}</span><input type={type} placeholder={placeholder} defaultValue={defaultValue}/></label> }

function NewPatient({onClose}:{onClose:()=>void}) { const [saved,setSaved]=useState(false); return <Modal title="Register new patient" subtitle="Patient ID will be generated automatically" onClose={onClose}>{saved?<div className="success-state"><CheckCircle2/><h3>Patient registered</h3><p>PAT-000185 is ready for consultation.</p><button className="primary" onClick={onClose}>Done</button></div>:<form onSubmit={e=>{e.preventDefault();setSaved(true)}}><div className="form-grid"><Field label="Patient name" placeholder="Full name" required/><Field label="Mobile number" placeholder="10-digit mobile" required/><Field label="Address" placeholder="Street and area" required/><Field label="City" placeholder="City"/><Field label="Date of birth" type="date"/><Field label="Gender" placeholder="Female / Male / Other"/><Field label="Blood group" placeholder="e.g. O+"/><Field label="Allergies" placeholder="Known allergies"/></div><label className="field full"><span>Medical notes</span><textarea placeholder="Existing conditions or important notes"/></label><div className="form-actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button className="primary"><UserRoundPlus size={17}/> Register patient</button></div></form>}</Modal> }

function PatientPicker({patient,setPatient}:{patient:Patient,setPatient:(p:Patient)=>void}) { return <div className="patient-picker"><Search size={17}/><select value={patient.id} onChange={e=>setPatient(patients.find(p=>p.id===e.target.value)!)}>{patients.map(p=><option value={p.id} key={p.id}>{p.id} — {p.name} — {p.mobile}</option>)}</select></div> }

function Consultation({patient,setPatient,onClose}:{patient:Patient,setPatient:(p:Patient)=>void,onClose:()=>void}) { const [saved,setSaved]=useState(false); return <Modal wide title="New consultation" subtitle="Record clinical notes and preserve the complete visit history" onClose={onClose}>{saved?<div className="success-state"><CheckCircle2/><h3>Consultation saved</h3><p>The ₹400 doctor fee is pending and available for pharmacy billing.</p><button className="primary" onClick={onClose}>Return to dashboard</button></div>:<form onSubmit={e=>{e.preventDefault();setSaved(true)}}><PatientPicker patient={patient} setPatient={setPatient}/><div className="patient-banner"><div className="avatar large">MR</div><div><strong>{patient.name}</strong><span>{patient.id} · {patient.age} yrs · {patient.mobile}</span></div><div><small>Previous visit</small><b>{patient.lastVisit}</b></div><div><small>Previous fee</small><b>{money(patient.balance||300)}</b></div></div><div className="section-label">CLINICAL DETAILS</div><div className="form-grid"><Field label="Symptoms" placeholder="Fever, cough..." required/><Field label="Diagnosis" placeholder="Provisional diagnosis"/><Field label="Blood pressure" placeholder="120/80"/><Field label="Temperature °F" placeholder="98.6"/><Field label="Weight kg" placeholder="65"/><Field label="Pulse / min" placeholder="72"/></div><label className="field full"><span>Clinical notes</span><textarea placeholder="Examination, observations and advice"/></label><div className="form-grid"><Field label="Follow-up date" type="date"/><Field label="Doctor fee" defaultValue="400" required/></div><label className="upload"><ClipboardPlus/><strong>Add prescription pages</strong><span>JPG, PNG, WEBP or PDF · multiple files supported</span><input type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf"/></label><div className="form-actions"><button type="button" className="secondary" onClick={onClose}>Save draft</button><button className="primary"><CheckCircle2 size={17}/> Save consultation</button></div></form>}</Modal> }

function Billing({patient,setPatient,cart,setCart,onClose}:{patient:Patient,setPatient:(p:Patient)=>void,cart:Array<Product&{qty:number}>,setCart:(v:Array<Product&{qty:number}>)=>void,onClose:()=>void}) {
  const [addFee,setAddFee]=useState(true); const [saved,setSaved]=useState(false); const [productId,setProductId]=useState(products[2].id);
  const medicineTotal=useMemo(()=>cart.reduce((s,p)=>s+p.rate*p.qty,0),[cart]); const tax=medicineTotal*.12; const fee=addFee?patient.balance:0; const grand=Math.round(medicineTotal+tax+fee);
  const updateQty=(id:string,d:number)=>setCart(cart.map(x=>x.id===id?{...x,qty:Math.max(1,x.qty+d)}:x));
  const addProduct=()=>{const p=products.find(x=>x.id===productId)!; if(!cart.some(x=>x.id===p.id))setCart([...cart,{...p,qty:1}])};
  return <Modal wide title="Pharmacy billing" subtitle="Fast FEFO billing with separate clinic revenue" onClose={onClose}>{saved?<div className="success-state"><CheckCircle2/><h3>Invoice MED-2026-000419 completed</h3><p>{money(grand)} received by UPI. Inventory and ledgers are updated.</p><div className="success-actions"><button className="secondary"><Printer size={17}/> Print</button><button className="secondary"><Download size={17}/> PDF</button><button className="primary" onClick={onClose}>Done</button></div></div>:<><div className="billing-top"><PatientPicker patient={patient} setPatient={setPatient}/><button className="scan"><ScanLine size={18}/> Scan barcode</button></div><div className="patient-banner compact"><div><strong>{patient.name}</strong><span>{patient.id} · Latest prescription: Today</span></div>{patient.balance>0?<label className="fee-toggle"><input type="checkbox" checked={addFee} onChange={e=>setAddFee(e.target.checked)}/><span><b>Add pending doctor fee</b><small>{money(patient.balance)} · not previously collected</small></span></label>:<div className="paid-fee"><CheckCircle2/> Doctor fee already collected</div>}</div><div className="product-add"><select value={productId} onChange={e=>setProductId(e.target.value)}>{products.map(p=><option value={p.id} key={p.id}>{p.name} · {p.batch} · Exp {p.expiry}</option>)}</select><button className="secondary" onClick={addProduct}><Plus size={17}/> Add</button></div><div className="bill-table"><div className="bill-row header"><span>Medicine / FEFO batch</span><span>Qty</span><span>Rate</span><span>Amount</span><span/></div>{cart.map(p=><div className="bill-row" key={p.id}><span><strong>{p.name}</strong><small>Batch {p.batch} · Exp {p.expiry} · Stock {p.stock}</small></span><span className="qty"><button onClick={()=>updateQty(p.id,-1)}><Minus/></button><b>{p.qty}</b><button onClick={()=>updateQty(p.id,1)}><Plus/></button></span><span>{money(p.rate)}</span><strong>{money(p.rate*p.qty)}</strong><button className="trash" onClick={()=>setCart(cart.filter(x=>x.id!==p.id))}><Trash2/></button></div>)}</div><div className="billing-foot"><div className="payment"><span>Payment mode</span><div className="payment-modes"><button>Cash</button><button className="selected">UPI</button><button>Card</button><button>Credit</button></div><label><input type="checkbox"/> Print invoice after saving</label></div><div className="totals"><span>Medicine value <b>{money(medicineTotal)}</b></span><span>GST <b>{money(tax)}</b></span>{addFee&&fee>0&&<span>Doctor fee <b>{money(fee)}</b></span>}<strong>Grand total <b>{money(grand)}</b></strong><button className="primary" onClick={()=>setSaved(true)}><CheckCircle2 size={18}/> Complete sale</button></div></div></>}</Modal> }
