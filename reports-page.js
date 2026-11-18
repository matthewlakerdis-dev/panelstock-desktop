(function () {
  "use strict";
  window.createReportsPage = function (React) {
    const {createElement: h, useEffect, useState} = React;
    const iso = date => date.toISOString().slice(0,10);
    const dayMs = 86400000;
    const shift = (date,days) => new Date(date.getTime()+days*dayMs);
    const utc = (year,month,day=1) => new Date(Date.UTC(year,month,day));
    const monday = date => shift(date,-((date.getUTCDay()+6)%7));
    const formatDate = (date, options) => date.toLocaleDateString("en-AU",{...options,timeZone:"UTC"});
    const shortDate = date => formatDate(date,{day:"numeric",month:"short",year:"numeric"});
    const weekStart = (year,week) => shift(monday(utc(year,0,4)),(week-1)*7);
    function periodKey(date,period) {
      if(period==="daily")return iso(date);
      if(period==="monthly")return iso(date).slice(0,7);
      const start=monday(date),year=shift(start,3).getUTCFullYear();
      return year+"-W"+String(Math.round((start-weekStart(year,1))/(7*dayMs))+1).padStart(2,"0");
    }
    function periodDate(value,period) {
      if(period==="weekly"){
        const [year,week]=value.split("-W").map(Number);
        return weekStart(year,week);
      }
      return new Date(value+(period==="monthly"?"-01":"")+"T00:00:00Z");
    }
    function periodLabel(value,period) {
      const date=periodDate(value,period);
      if(period==="monthly")return formatDate(date,{month:"long",year:"numeric"});
      if(period==="weekly")return shortDate(date)+" – "+shortDate(shift(date,6));
      return shortDate(date);
    }
    function PeriodDialog({label,value,period,commit,close}) {
      const todayParts=new Intl.DateTimeFormat("en-AU",{timeZone:"Australia/Brisbane",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts();
      const todayPart=type=>Number(todayParts.find(part=>part.type===type).value);
      const today=utc(todayPart("year"),todayPart("month")-1,todayPart("day"));
      const [draft,setDraft]=useState(value||periodKey(today,period));
      const [view,setView]=useState(()=>periodDate(draft,period));
      const dialog=React.useRef(null);
      useEffect(()=>{
        const node=dialog.current;
        if(typeof node.showModal==="function"){
          node.showModal();
          return ()=>node.close();
        }
        node.setAttribute("open","");
        return ()=>node.removeAttribute("open");
      },[]);
      const month=view.getUTCMonth(),year=view.getUTCFullYear();
      const monthly=period==="monthly",weekly=period==="weekly";
      const first=utc(year,month),gridStart=monday(first);
      const move=direction=>setView(monthly?utc(year+direction,month):utc(year,month+direction));
      const choose=(date,content,name,className)=>{
        const key=periodKey(date,period);
        return h("button",{type:"button",key,"aria-label":name,"aria-pressed":draft===key,onClick:()=>setDraft(key),
          className:className+" rounded-lg px-1 py-2 text-sm "+(draft===key?"bg-cyan-800 text-white":"text-slate-700 hover:bg-slate-100")},content);
      };
      const header=monthly?String(year):formatDate(first,{month:"long",year:"numeric"});
      const nav=monthly?"year":"month";
      const action="rounded-lg px-3 py-2 text-sm font-semibold text-cyan-800 hover:bg-slate-100";
      return h("dialog",{ref:dialog,"aria-label":label,onCancel:event=>{event.preventDefault();close();},
        className:"overflow-hidden rounded-xl border border-slate-200 bg-white p-0 shadow-2xl backdrop:bg-slate-900/50",
        style:{position:"fixed",inset:0,margin:"auto",width:"min(420px, calc(100vw - 24px))",maxHeight:"calc(100dvh - 24px)",overflowY:"auto",zIndex:60}},
        h("div",{className:"bg-cyan-800 px-5 py-4 text-white"},
          h("div",{className:"text-xs font-semibold uppercase tracking-wide text-cyan-100"},label),
          h("div",{className:"mt-1 text-xl font-semibold"},periodLabel(draft,period))),
        h("div",{className:"p-4"},
          h("div",{className:"mb-3 flex items-center justify-between"},
            h("strong",{className:"text-sm text-slate-700","aria-live":"polite"},header),
            h("div",{className:"flex gap-1"},
              h("button",{type:"button",className:action,"aria-label":"Previous "+nav,onClick:()=>move(-1)},"‹"),
              h("button",{type:"button",className:action,"aria-label":"Next "+nav,onClick:()=>move(1)},"›"))),
          monthly?h("div",{className:"grid grid-cols-3 gap-2"},Array.from({length:12},(_,i)=>{
            const date=utc(year,i);
            return choose(date,formatDate(date,{month:"short"}),periodLabel(periodKey(date,period),period),"");
          })):weekly?h("div",{className:"grid gap-1"},Array.from({length:Math.ceil(((first-gridStart)/dayMs+utc(year,month+1,0).getUTCDate())/7)},(_,i)=>{
            const date=shift(gridStart,i*7),key=periodKey(date,period);
            return choose(date,h("span",{className:"flex justify-between gap-2 px-2"},h("strong",null,"Week "+Number(key.slice(-2))),h("span",null,periodLabel(key,period))),"Week "+Number(key.slice(-2))+", "+periodLabel(key,period),"text-left");
          })):h("div",{className:"grid grid-cols-7 gap-1 text-center"},
            ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(day=>h("span",{key:day,className:"py-2 text-xs text-slate-500"},day)),
            Array.from({length:42},(_,i)=>{const date=shift(gridStart,i);return choose(date,date.getUTCDate(),shortDate(date),date.getUTCMonth()===month?"":"opacity-60");})),
          h("div",{className:"mt-4 flex flex-wrap justify-between gap-1"},
            h("button",{type:"button",className:action,onClick:()=>commit("")},"Clear"),
            h("button",{type:"button",className:action,onClick:()=>{setView(today);setDraft(periodKey(today,period));}},monthly?"This month":weekly?"This week":"Today"),
            h("button",{type:"button",className:action,onClick:close},"Cancel"),
            h("button",{type:"button",className:"rounded-lg bg-cyan-800 px-4 py-2 text-sm font-semibold text-white",onClick:()=>commit(draft)},"OK"))));
    }
    function PeriodPicker({label,value,onChange,period,disabled}) {
      const [open,setOpen]=useState(false),trigger=React.useRef(null);
      const close=()=>{setOpen(false);requestAnimationFrame(()=>trigger.current?.focus());};
      return h("div",{className:"space-y-2 text-sm font-semibold text-slate-800"},
        h("div",null,label),
        h("button",{ref:trigger,type:"button",disabled,"aria-expanded":open,"aria-label":label+(value?", "+periodLabel(value,period):""),"aria-haspopup":"dialog",
          onClick:()=>setOpen(true),className:"flex w-full items-center justify-between gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm"},
          h("span",null,value?periodLabel(value,period):"Any "+{daily:"date",weekly:"week",monthly:"month"}[period]),h("span",{"aria-hidden":true,className:"text-cyan-800"},"▦")),
        open&&h(PeriodDialog,{label,value,period,close,commit:next=>{onChange(next);close();}}));
    }
    return function ReportsPage({renderStockExport, renderActivityReport, catalogue, renderMaterialCatalogue, damage, dateRanges, email, recipients, loadQa, downloadQaOverview, QaReport, ActiveOrdersReportButton, loadOrders, download}) {
      const [selection, setSelection] = useState("");
      const [format, setFormat] = useState("pdf");
      const [range, setRange] = useState("all");
      const [period, setPeriod] = useState("daily");
      const [from, setFrom] = useState("");
      const [to, setTo] = useState("");
      const [product, setProduct] = useState("all");
      const [busy, setBusy] = useState(false);
      const [status, setStatus] = useState(null);
      const [orders, setOrders] = useState(null);
      useEffect(() => {
        if (selection !== "active-orders") return;
        let active = true;
        loadOrders().then(result => {if (active) setOrders(result);}).catch(error => {
          if (active) setStatus({ok:false, message:error.message});
        });
        return () => {active = false;};
      }, [selection, loadOrders]);
      const [qa, setQa] = useState(null);
      const [qaKind, setQaKind] = useState("panel");
      const [qaProject, setQaProject] = useState("");
      const [qaOrder, setQaOrder] = useState("");
      const [qaItem, setQaItem] = useState("");
      const [qaReport, setQaReport] = useState(null);
      useEffect(() => {
        if (selection !== "qa") return;
        let active = true;
        loadQa().then(result => {
          if (active) setQa({items:result.items || [], gateOrders:result.gateOrders || [], checklists:result.checklists || {}});
        }).catch(error => {
          if (active) {
            setQa({items:[], gateOrders:[]});
            setStatus({ok:false, message:error.message});
          }
        });
        return () => {active = false;};
      }, [selection, loadQa]);
      const kindItems = (qa?.items || []).filter(item => (item.gateOrderId ? "gate" : item.kind) === qaKind);
      const values = entries => [...new Set(entries.filter(Boolean))].sort((a,b)=>a.localeCompare(b,"en-AU",{numeric:true}));
      const orderSources = qaKind === "gate" ? qa?.gateOrders || [] : kindItems;
      const projects = values(orderSources.map(item=>item.project));
      const projectOrders = orderSources.filter(item=>item.project===qaProject&&item.orderNumber);
      const orderChoices = qaKind === "gate"
        ? projectOrders.map(item=>[item.orderId, item.orderNumber+(item.villa?" · "+item.villa:"")])
        : values(projectOrders.map(item=>item.orderNumber)).map(value=>[value,value]);
      const inspectedItems = kindItems.filter(item=>item.latest&&item.project===qaProject&&
        (qaKind==="gate"?item.gateOrderId===qaOrder:item.orderNumber===qaOrder));
      const selectedQaItem = inspectedItems.find(item => item.id === qaItem);
      const changeQa = (setter,value,resetOrder=false) => {
        setter(value);
        if(resetOrder)setQaOrder("");
        setQaItem("");
        setStatus(null);
      };
      async function runQaOverview() {
        if(!qaOrder||busy)return;
        setBusy(true);
        setStatus(null);
        try {
          await downloadQaOverview(qaKind==="gate"?{orderId:qaOrder}:{project:qaProject,orderNumber:qaOrder});
          setStatus({ok:true,message:"QA overview ready. Check your downloads."});
        } catch(error) {
          setStatus({ok:false,message:error.message||"The QA overview could not be downloaded."});
        } finally {
          setBusy(false);
        }
      }
      const reports = [
        {id: "stock", label: "Stock on hand"},
        {id: "activity", label: "Stock activity and audit"},
        {id: "catalogue", label: "Panel Catalogue", formats: catalogue},
        {id: "damage", label: "Stock damage", run: () => damage(range)},
        {id: "materials", label: "Material Catalogue"},
        {id: "m2", label: "Production m²", run: () => download(`m2-${period}-${product}`, {from, to, format:"pdf"})},
        ...(ActiveOrdersReportButton ? [{id: "active-orders", label: "Active Site Orders PDF"}] : []),
        {id: "qa", label: "QA inspection history", run: () => setQaReport(selectedQaItem)},
        {id: "email", label: "Stock and CNC email report", run: email}
      ];
      const report = reports.find(item => item.id === selection);
      const isEmail = selection === "email";
      const isQa = selection === "qa";
      const isMaterials = selection === "materials";
      const isActivity = selection === "activity";
      const isActiveOrders = selection === "active-orders";
      const canRun = report && !busy && (!isEmail || recipients.length > 0) && (!isQa || selectedQaItem);
      const selectClass = "block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
      const field = (label, props, options) => h("label", {className:"block space-y-2 text-sm font-semibold text-slate-800"},
        h("span", null, label), h("select", {...props, disabled:busy, className:selectClass}, options));
      const periodUnit = {daily:"date", weekly:"week", monthly:"month"}[period];
      const periodBound = (label,value,update) => h(PeriodPicker,{key:period+label,label,value,period,disabled:busy,
        onChange:next=>{update(next);setStatus(null);}});
      async function run(event) {
        event.preventDefault();
        if (!canRun || isActiveOrders || isActivity || isMaterials || selection === "stock") return;
        if (isQa) {
          report.run();
          return;
        }
        setBusy(true);
        setStatus(null);
        try {
          const result = await (report.formats ? report.formats[format]() : report.run ? report.run() : download(report.id));
          setStatus(result || {ok:true, message:"Report ready. Check your downloads."});
        } catch (error) {
          setStatus({ok:false, message:error.message || "The report could not be run."});
        } finally {
          setBusy(false);
        }
      }
      if (qaReport) return h(QaReport, {report:qaReport, checklists:qa.checklists, onBack:() => setQaReport(null), backLabel:"Back to Reports"});
      return h("section", {className:"mx-auto max-w-3xl px-4 py-6"},
        h("h1", {className:"mb-4 text-2xl font-bold text-slate-900"}, "Reports"),
        h("form", {onSubmit:run, className:"space-y-4 rounded-xl border border-slate-200 bg-white p-5"},
          field("Report", {value:selection, onChange:event => {setSelection(event.target.value); setStatus(null); setQa(null); setQaKind("panel"); setQaProject(""); setQaOrder(""); setQaItem(""); setOrders(null);}}, [
            h("option", {key:"", value:""}, "Choose a report"),
            ...reports.map(item => h("option", {key:item.id, value:item.id}, item.label))
          ]),
          selection === "m2" && field("Product", {value:product, onChange:event => {setProduct(event.target.value); setStatus(null);}},
            [["all", "Panels and gates"], ["panels", "Panels only"], ["gates", "Gates only"]].map(([value, label]) => h("option", {key:value, value}, label))),
          selection === "m2" && field("Group by", {value:period, onChange:event => {setPeriod(event.target.value); setFrom(""); setTo(""); setStatus(null);}},
            [["daily", "Daily"], ["weekly", "Weekly"], ["monthly", "Monthly"]].map(([value, label]) => h("option", {key:value, value}, label))),
          selection === "m2" && h("div", {className:"grid gap-4 sm:grid-cols-2"},
            periodBound("From " + periodUnit, from, setFrom), periodBound("To " + periodUnit, to, setTo)),
          report?.formats && field("Format", {value:format, onChange:event => {setFormat(event.target.value); setStatus(null);}}, [
            h("option", {key:"pdf", value:"pdf"}, "PDF"),
            h("option", {key:"csv", value:"csv"}, "CSV")
          ]),
          selection === "damage" && field("Date range", {value:range, onChange:event => {setRange(event.target.value); setStatus(null);}},
            dateRanges.map(item => h("option", {key:item.id, value:item.id}, item.label))),
          isQa && (qa ? h("div",{className:"grid gap-4 sm:grid-cols-2"},
            field("Inspection type",{value:qaKind,onChange:event=>{setQaProject("");changeQa(setQaKind,event.target.value,true);}},
              [["panel","Panels"],["gate","Gates"],["metalwork","Other metalwork"]].map(([value,label])=>h("option",{key:value,value},label))),
            field("Project",{value:qaProject,onChange:event=>changeQa(setQaProject,event.target.value,true)},
              [h("option",{key:"",value:""},"Choose a project"),...projects.map(value=>h("option",{key:value,value},value))]),
            qaProject&&field("Order number",{value:qaOrder,onChange:event=>changeQa(setQaOrder,event.target.value)},
              [h("option",{key:"",value:""},"Choose an order"),...orderChoices.map(([value,label])=>h("option",{key:value,value},label))]),
            qaOrder&&field(qaKind==="gate"?"Villa / gate item":qaKind==="panel"?"Panel ID":"Item",{value:qaItem,onChange:event=>setQaItem(event.target.value)},
              [h("option",{key:"",value:""},inspectedItems.length?"Choose an inspected item":"No inspected items"),...inspectedItems.map(item=>h("option",{key:item.id,value:item.id},
                [item.gateOrder?.villa,item.reference,item.sheetNumber&&"Sheet "+item.sheetNumber].filter(Boolean).join(" · ")))]),
            qaOrder&&qaKind!=="metalwork"&&h("button",{type:"button",disabled:busy,onClick:runQaOverview,className:"justify-self-start rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-cyan-800 disabled:opacity-50"},"Download order QA overview PDF"))
            : !status&&h("p",{role:"status",className:"text-sm text-slate-600"},"Loading inspected items…")),
          isEmail && h("p", {className:"text-sm text-slate-600"}, recipients.length
            ? "Recipients: " + recipients.join(", ")
            : "Add and save recipients in Email Reports settings before sending."),
          !isActiveOrders && !isActivity && !isMaterials && selection !== "stock" && h("button", {type:"submit", disabled:!canRun, className:"rounded-lg bg-cyan-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"},
            busy ? "Running…" : isEmail ? "Send email report" : isQa ? "View inspection" : selection === "m2" ? "Download PDF" : "Run report"),
          status && h("p", {role:"status", className:status.ok ? "text-sm text-green-700" : "text-sm text-red-700"}, status.message)),
        selection === "stock" && renderStockExport(),
        isActivity && renderActivityReport(),
        isMaterials && renderMaterialCatalogue(),
        isActiveOrders && h("div", {className:"mt-4"},
          orders ? h(ActiveOrdersReportButton, {orders, inline:true}) : !status && h("p", {role:"status", className:"text-sm text-slate-600"}, "Loading active orders…")));
    };
  };
})();
