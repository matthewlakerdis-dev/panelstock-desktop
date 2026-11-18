(function () {
  "use strict";
  window.createReportsPage = function (React) {
    const {createElement: h, useEffect, useState} = React;
    return function ReportsPage({renderStockExport, activity, catalogue, damage, dateRanges, email, recipients, loadQa, QaReport, ActiveOrdersReportButton, loadOrders, download}) {
      const [stockExportOpen, setStockExportOpen] = useState(false);
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
      const [qaItem, setQaItem] = useState("");
      const [qaReport, setQaReport] = useState(null);
      useEffect(() => {
        if (selection !== "qa") return;
        let active = true;
        loadQa().then(result => {
          if (active) setQa({items:(result.items || []).filter(item => item.latest), checklists:result.checklists || {}});
        }).catch(error => {
          if (active) {
            setQa({items:[]});
            setStatus({ok:false, message:error.message});
          }
        });
        return () => {active = false;};
      }, [selection, loadQa]);
      const selectedQaItem = qa?.items.find(item => item.id === qaItem);
      const reports = [
        {id: "stock", label: "Stock on hand"},
        {id: "activity", label: "Stock activity and audit", formats: activity},
        {id: "catalogue", label: "Material catalogue", formats: catalogue},
        {id: "damage", label: "Stock damage", run: () => damage(range)},
        {id: "m2", label: "Production m²", run: () => download(`m2-${period}-${product}`, {from, to, format:"pdf"})},
        {id: "cnc-tracker", label: "CNC tracker"},
        {id: "cnc-daily", label: "CNC daily production"},
        {id: "cnc-weekly", label: "CNC weekly production"},
        {id: "cnc-monthly", label: "CNC monthly production"},
        {id: "site-orders", label: "Site Orders progress"},
        ...(ActiveOrdersReportButton ? [{id: "active-orders", label: "Active Site Orders PDF"}] : []),
        {id: "qa", label: "QA inspection history", run: () => setQaReport(selectedQaItem)},
        {id: "email", label: "Stock and CNC email report", run: email}
      ];
      const report = reports.find(item => item.id === selection);
      const isEmail = selection === "email";
      const isQa = selection === "qa";
      const isActiveOrders = selection === "active-orders";
      const canRun = report && !busy && (!isEmail || recipients.length > 0) && (!isQa || selectedQaItem);
      const selectClass = "block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
      const field = (label, props, options) => h("label", {className:"block space-y-2 text-sm font-semibold text-slate-800"},
        h("span", null, label), h("select", {...props, disabled:busy, className:selectClass}, options));
      const periodField = {daily:["date","YYYY-MM-DD"], weekly:["week","YYYY-Www"], monthly:["month","YYYY-MM"]}[period];
      const periodBound = (label, value, onChange) =>
        h("label", {className:"block space-y-2 text-sm font-semibold text-slate-800"},
          h("span", null, label),
          h("input", {key:period, type:periodField[0], placeholder:periodField[1], value, disabled:busy, className:selectClass,
            onChange:event => {onChange(event.target.value); setStatus(null);}}));
      async function run(event) {
        event.preventDefault();
        if (!canRun || isActiveOrders) return;
        if (selection === "stock") {
          setStockExportOpen(true);
          return;
        }
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
          field("Report", {value:selection, onChange:event => {setSelection(event.target.value); setStatus(null); setQa(null); setQaItem(""); setOrders(null);}}, [
            h("option", {key:"", value:""}, "Choose a report"),
            ...reports.map(item => h("option", {key:item.id, value:item.id}, item.label))
          ]),
          selection === "m2" && field("Product", {value:product, onChange:event => {setProduct(event.target.value); setStatus(null);}},
            [["all", "Panels and gates"], ["panels", "Panels only"], ["gates", "Gates only"]].map(([value, label]) => h("option", {key:value, value}, label))),
          selection === "m2" && field("Group by", {value:period, onChange:event => {setPeriod(event.target.value); setFrom(""); setTo(""); setStatus(null);}},
            [["daily", "Daily"], ["weekly", "Weekly"], ["monthly", "Monthly"]].map(([value, label]) => h("option", {key:value, value}, label))),
          selection === "m2" && h("div", {className:"grid gap-4 sm:grid-cols-2"},
            periodBound("From " + periodField[0], from, setFrom), periodBound("To " + periodField[0], to, setTo)),
          report?.formats && field("Format", {value:format, onChange:event => {setFormat(event.target.value); setStatus(null);}}, [
            h("option", {key:"pdf", value:"pdf"}, "PDF"),
            h("option", {key:"csv", value:"csv"}, "CSV")
          ]),
          selection === "damage" && field("Date range", {value:range, onChange:event => {setRange(event.target.value); setStatus(null);}},
            dateRanges.map(item => h("option", {key:item.id, value:item.id}, item.label))),
          isQa && (qa?.items.length ? field("Inspected item", {value:qaItem, onChange:event => setQaItem(event.target.value)}, [
            h("option", {key:"", value:""}, "Choose an item"),
            ...qa.items.map(item => h("option", {key:item.id, value:item.id},
              [item.project, item.orderNumber && "Order " + item.orderNumber, item.sheetNumber && "Sheet " + item.sheetNumber, item.reference].filter(Boolean).join(" · ")))
          ]) : !status && h("p", {role:"status", className:"text-sm text-slate-600"}, qa ? "No completed inspections found." : "Loading inspected items…")),
          isEmail && h("p", {className:"text-sm text-slate-600"}, recipients.length
            ? "Recipients: " + recipients.join(", ")
            : "Add and save recipients in Email Reports settings before sending."),
          !isActiveOrders && h("button", {type:"submit", disabled:!canRun, className:"rounded-lg bg-cyan-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"},
            busy ? "Running…" : isEmail ? "Send email report" : selection === "m2" ? "Download PDF" : selection === "stock" ? "Open export options" : "Run report"),
          status && h("p", {role:"status", className:status.ok ? "text-sm text-green-700" : "text-sm text-red-700"}, status.message)),
        stockExportOpen && renderStockExport(() => setStockExportOpen(false)),
        isActiveOrders && h("div", {className:"mt-4"},
          orders ? h(ActiveOrdersReportButton, {orders}) : !status && h("p", {role:"status", className:"text-sm text-slate-600"}, "Loading active orders…")));
    };
  };
})();
