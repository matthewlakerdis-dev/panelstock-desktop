(function () {
  "use strict";

  function createRequest(workerUrl) {
    return async function request(path, options = {}) {
      const init = { ...options };
      if (init.body !== undefined) {
        init.headers = { ...init.headers, "Content-Type": "application/json" };
        init.body = JSON.stringify(init.body);
      }
      const response = await window.PanelStock.apiFetch(workerUrl + path, init);
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        const error = new Error(result?.error || "The chart request failed. Please try again.");
        error.status = response.status;
        throw error;
      }
      if (!result || !Array.isArray(result.positions)) {
        throw new Error("PanelStock returned an unreadable chart. Please try again.");
      }
      return result;
    };
  }

  function group(map, key, person) {
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(person);
  }

  function organise(positions) {
    const byId = new Map(positions.map(person => [person.id, person]));
    const names = new Map();
    const reports = new Map();
    const displayReports = new Map();
    const cycles = new Set();
    const seen = new Set();
    for (const person of positions) {
      group(names, person.name, person);
      group(reports, person.managerId, person);
      const path = new Set();
      let id = person.id;
      while (byId.has(id) && !seen.has(id)) {
        seen.add(id);
        path.add(id);
        id = byId.get(id).managerId;
      }
      // Historic employee profiles may contain a loop. Show each participant
      // at the top with its saved supervisor so an administrator can repair it.
      if (path.has(id)) {
        let cycleId = id;
        do {
          cycles.add(cycleId);
          cycleId = byId.get(cycleId).managerId;
        } while (cycleId !== id);
      }
    }
    for (const person of positions) {
      const managerId = byId.has(person.managerId) && !cycles.has(person.id) ? person.managerId : null;
      group(displayReports, managerId, person);
    }
    function nameOf(person) {
      return names.get(person.name).length > 1 ? person.name + " (" + person.id + ")" : person.name;
    }
    return { byId, reports, displayReports, cycles, nameOf };
  }

  function excludedSupervisors(chart, id) {
    const excluded = new Set();
    const pending = [...chart.cycles, id];
    while (pending.length) {
      const next = pending.pop();
      if (excluded.has(next)) continue;
      excluded.add(next);
      for (const report of chart.reports.get(next) || []) pending.push(report.id);
    }
    return excluded;
  }

  function create(React) {
    const { createElement: h, useState, useEffect, useMemo, useRef } = React;

    function StaffChart({ request }) {
      const [data, setData] = useState(null);
      const [attempt, setAttempt] = useState(0);
      const [error, setError] = useState("");
      const [notice, setNotice] = useState("");
      const [draft, setDraft] = useState(null);
      const [busy, setBusy] = useState(false);
      const [conflict, setConflict] = useState("");
      const titleInput = useRef(null);
      const section = useRef(null);
      const returnFocusId = useRef(null);
      const chart = useMemo(() => organise(data?.positions || []), [data]);

      useEffect(() => {
        let active = true;
        setData(null);
        setError("");
        request("/org-chart").then(result => {
          if (active) setData(result);
        }).catch(err => {
          if (active) setError(err.message || "Could not load the chart.");
        });
        return () => { active = false; };
      }, [request, attempt]);

      useEffect(() => {
        if (draft) {
          titleInput.current?.focus();
        } else if (returnFocusId.current) {
          // A reporting-line change remounts the card in its new branch.
          const button = Array.from(section.current.querySelectorAll("[data-oc-edit]"))
            .find(item => item.dataset.ocEdit === returnFocusId.current);
          (button || section.current)?.focus();
          returnFocusId.current = null;
        }
      }, [draft?.id]);

      const current = draft && chart.byId.get(draft.id);
      const excluded = draft && excludedSupervisors(chart, draft.id);
      const invalidManager = draft?.managerId && (!chart.byId.has(draft.managerId) || excluded.has(draft.managerId));
      const keepExisting = invalidManager && current?.managerId === draft.managerId;
      const needsSupervisorChoice = invalidManager && !keepExisting;
      const editing = !!draft;

      function beginEdit(person) {
        setConflict("");
        setError("");
        setNotice("");
        setDraft({ id: person.id, name: chart.nameOf(person), title: person.title, managerId: person.managerId });
      }

      function closeEditor(message) {
        returnFocusId.current = draft.id;
        setDraft(null);
        setConflict("");
        setError("");
        setNotice(message);
      }

      async function reloadConflict() {
        setBusy(true);
        setError("");
        try {
          setData(await request("/org-chart"));
          setConflict("review");
        } catch (err) {
          setError(err.message || "Could not reload the chart.");
        } finally {
          setBusy(false);
        }
      }

      async function save(event) {
        event.preventDefault();
        if (!current || busy || needsSupervisorChoice || conflict === "reload") return;
        setBusy(true);
        setError("");
        try {
          const result = await request("/org-chart", {
            method: "POST",
            body: {
              id: current.id, title: draft.title.trim(), managerId: draft.managerId,
              previous: { title: current.title, managerId: current.managerId }
            }
          });
          setData(result);
          closeEditor("Changes saved for " + draft.name + ".");
        } catch (err) {
          if (err.status === 409 || err.status === 404) setConflict("reload");
          else setError(err.message || "Could not save your changes.");
        } finally {
          setBusy(false);
        }
      }

      function supervisorName(id) {
        if (!id) return "No supervisor";
        return chart.byId.has(id) ? chart.nameOf(chart.byId.get(id)) : "Unavailable supervisor (" + id + ")";
      }

      function personCard(person, deep) {
        const circular = chart.cycles.has(person.id);
        const missing = person.managerId && !chart.byId.has(person.managerId);
        return h("div", { className: "oc-node" },
          h("div", { className: "oc-person" },
            h("strong", null, chart.nameOf(person)),
            h("span", null, person.title || "Job title not set"),
            (circular || missing) && h("small", { className: "oc-issue" }, circular
              ? "Circular reporting line with " + supervisorName(person.managerId)
              : supervisorName(person.managerId)),
            !circular && !missing && h("small", { className: deep ? "oc-supervisor" : "oc-sr" },
              person.managerId ? "Reports to " + supervisorName(person.managerId) : "No supervisor")),
          h("button", {
            type: "button", className: "oc-edit", "data-oc-edit": person.id, disabled: !!editing,
            "aria-label": "Edit " + chart.nameOf(person), onClick: () => beginEdit(person)
          }, "Edit"));
      }

      // Flatten deep branches to avoid exhausting the JS stack. Keep the first
      // four levels of connector lines and label the supervisor on deeper rows.
      function branch(start, includeRoot) {
        const rows = [];
        const pending = [{ person: start, rails: [], depth: 0, last: true }];
        while (pending.length) {
          const { person, rails, depth, last } = pending.pop();
          if (includeRoot || depth) {
            rows.push(h("li", { key: person.id, className: "oc-row" },
              rails.map((continues, index) => {
                const elbow = index === depth - 1;
                return h("span", {
                  key: index, "aria-hidden": true,
                  className: "oc-rail" + (elbow ? (last ? " oc-end" : " oc-fork") : continues ? " oc-line" : "")
                });
              }),
              personCard(person, depth > 4)));
          }
          const children = chart.displayReports.get(person.id) || [];
          const nextRails = rails.slice();
          if (depth > 0 && depth <= 4) nextRails[depth - 1] = !last;
          if (depth < 4) nextRails.push(true);
          for (let i = children.length - 1; i >= 0; i--) {
            pending.push({ person: children[i], rails: nextRails, depth: depth + 1, last: i === children.length - 1 });
          }
        }
        return h("ul", { className: "oc-list", "aria-label": "Team of " + chart.nameOf(start) }, rows);
      }

      function team(person) {
        const direct = chart.displayReports.get(person.id) || [];
        const columns = direct.length === 2 || direct.length === 3;
        return h("li", { className: "oc-team" + (direct.length ? " oc-has-team" : "") + (columns ? " oc-columns" : ""), key: person.id },
          h("div", { className: "oc-lead" }, personCard(person, false)),
          columns
            ? h("ul", { className: "oc-lanes", "aria-label": "Direct reports to " + chart.nameOf(person), style: { "--oc-count": direct.length } },
                direct.map(child => h("li", { key: child.id, className: "oc-lane" }, branch(child, true))))
            : direct.length > 0 && branch(person, false));
      }

      function editor() {
        return h("form", { className: "oc-editor", onSubmit: save, "aria-label": "Edit reporting details" },
          h("h3", null, "Edit " + draft.name),
          conflict === "reload" && h("div", { className: "oc-warning", role: "alert" },
            h("p", null, "The chart changed since you opened it. Load the latest chart to review your draft."),
            h("button", { type: "button", className: "oc-secondary", disabled: busy, onClick: reloadConflict }, "Load latest chart")),
          conflict === "review" && h("div", { className: "oc-warning", role: "status" },
            current
              ? "Review your draft. The saved job title is “" + (current.title || "Not set") + "” and the saved supervisor is “" + supervisorName(current.managerId) + "”."
              : "This person is no longer on the active staff list."),
          h("div", { className: "oc-fields" },
            h("label", null, "Job title", h("input", {
              ref: titleInput, maxLength: 100, type: "text", value: draft.title, disabled: busy,
              onChange: event => setDraft({ ...draft, title: event.target.value })
            })),
            h("label", null, "Reports to", h("select", {
              value: draft.managerId || "", disabled: busy,
              onChange: event => setDraft({ ...draft, managerId: event.target.value || null })
            },
            h("option", { value: "" }, "No supervisor"),
            invalidManager && h("option", { value: draft.managerId, disabled: true },
              keepExisting ? supervisorName(draft.managerId) + " (existing reporting line)" : "Choose a valid supervisor"),
            data.positions.filter(person => !excluded.has(person.id)).map(person =>
              h("option", { key: person.id, value: person.id }, chart.nameOf(person)))))),
          error && h("p", { className: "oc-error", role: "alert" }, error),
          h("div", { className: "oc-actions" },
            h("button", { type: "submit", className: "oc-primary", disabled: busy || !current || needsSupervisorChoice || conflict === "reload" }, busy ? "Working…" : "Save changes"),
            h("button", { type: "button", className: "oc-secondary", disabled: busy, onClick: () => closeEditor("") }, "Cancel")));
      }

      return h("section", { ref: section, tabIndex: -1, className: "oc", "aria-label": "Lennox Facades organisational chart" },
        h("header", { className: "oc-header" }, h("p", { className: "oc-org" }, "Lennox Facades"), h("h2", null, "Organisational chart"),
          data?.positions.length > 0 && h("p", { className: "oc-help" }, "Choose Edit beside a staff member to set their job title and supervisor.")),
        !data && (error
          ? h("div", { className: "oc-state" }, h("p", { role: "alert", className: "oc-error" }, error),
              h("button", { type: "button", className: "oc-secondary", onClick: () => setAttempt(attempt + 1) }, "Try again"))
          : h("p", { role: "status" }, "Loading chart…")),
        editing && editor(),
        h("div", { role: "status", className: "oc-notice" }, notice),
        data && !data.positions.length && h("p", { className: "oc-state" }, "No active staff are listed for Lennox Facades."),
        data?.positions.length > 0 && h("ul", { className: "oc-forest", "aria-label": "Reporting structure" },
          (chart.displayReports.get(null) || []).map(team)));
    }

    return function OrgChart({ isAdmin, request }) {
      return isAdmin ? h(StaffChart, { request }) : null;
    };
  }

  window.PanelStockOrgChart = { create, createRequest };
})();
