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
      if (!result || (path === "/org-chart" && !Array.isArray(result.positions))) {
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

    function StaffAvatar({ person, request, cache }) {
      const { id, name, photoVersion } = person;
      const element = useRef(null);
      const [source, setSource] = useState("");
      useEffect(() => {
        if (!photoVersion) return;
        let active = true;
        let observer;
        function load() {
          observer?.disconnect();
          let entry = cache.get(id);
          if (entry?.version !== photoVersion) {
            const result = request("/org-chart/photos/" + encodeURIComponent(id)).then(photo => {
              const src = photo?.profilePhoto;
              return typeof src === "string" && /^data:image\/(?:jpeg|png|webp);base64,[a-zA-Z0-9+/]+={0,2}$/.test(src) ? src : "";
            }).catch(() => "");
            entry = { version: photoVersion, result };
            cache.set(id, entry);
          }
          entry.result.then(src => { if (active) setSource(src); });
        }
        if (window.IntersectionObserver) {
          observer = new IntersectionObserver(entries => {
            if (entries.some(item => item.isIntersecting)) load();
          }, { rootMargin: "100px" });
          observer.observe(element.current);
        } else {
          load();
        }
        return () => { active = false; observer?.disconnect(); };
      }, [id, photoVersion, request, cache]);

      const initials = (name || id || "?").trim().split(/\s+/).slice(0, 2)
        .map(word => Array.from(word)[0]).join("").toUpperCase();
      return h("span", { ref: element, className: "oc-avatar", "aria-hidden": true },
        source ? h("img", { src: source, alt: "", decoding: "async", onError: () => setSource("") }) : initials);
    }

    function StaffChart({ request }) {
      const [data, setData] = useState(null);
      const [attempt, setAttempt] = useState(0);
      const [error, setError] = useState("");
      const [notice, setNotice] = useState(null);
      const [draft, setDraft] = useState(null);
      const [busy, setBusy] = useState(false);
      const [conflict, setConflict] = useState("");
      const titleInput = useRef(null);
      const section = useRef(null);
      const returnFocusId = useRef(null);
      const chart = useMemo(() => organise(data?.positions || []), [data]);
      const photoCache = useMemo(() => new Map(), [request]);

      useEffect(() => {
        if (!notice) return;
        const timer = setTimeout(() => setNotice(null), 5000);
        return () => clearTimeout(timer);
      }, [notice]);

      useEffect(() => {
        for (const [id, entry] of photoCache) {
          if (chart.byId.get(id)?.photoVersion !== entry.version) photoCache.delete(id);
        }
      }, [chart, photoCache]);

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
        setNotice(null);
        setDraft({ id: person.id, name: chart.nameOf(person), title: person.title, managerId: person.managerId });
      }

      function closeEditor(message) {
        returnFocusId.current = draft.id;
        setDraft(null);
        setConflict("");
        setError("");
        setNotice(message ? { id: draft.id, message } : null);
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

      function personCard(person, deep, teamLead = false) {
        const circular = chart.cycles.has(person.id);
        const missing = person.managerId && !chart.byId.has(person.managerId);
        const reportCount = chart.displayReports.get(person.id)?.length || 0;
        const classes = ["oc-node"];
        if (reportCount) classes.push("oc-with-reports");
        if (draft?.id === person.id) classes.push("oc-selected");
        if (notice?.id === person.id) classes.push("oc-saved");
        const editLabel = "Edit " + chart.nameOf(person);
        return h("div", { className: classes.join(" ") },
          h(StaffAvatar, { key: person.photoVersion || "", person, request, cache: photoCache }),
          h("div", { className: "oc-person" },
            h("strong", null, chart.nameOf(person)),
            h("span", null, person.title || "Job title not set"),
            teamLead && reportCount > 0 && h("small", { className: "oc-report-count" },
              reportCount + (reportCount === 1 ? " direct report" : " direct reports")),
            (circular || missing) && h("small", { className: "oc-issue" }, circular
              ? "Circular reporting line with " + supervisorName(person.managerId)
              : supervisorName(person.managerId)),
            !circular && !missing && h("small", { className: deep ? "oc-supervisor" : "oc-sr" },
              person.managerId ? "Reports to " + supervisorName(person.managerId) : "No supervisor")),
          h("button", {
            type: "button", className: "oc-edit", "data-oc-edit": person.id, disabled: !!editing,
            "aria-label": editLabel, title: editLabel, onClick: () => beginEdit(person)
          }, h("svg", {
            width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
            strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, focusable: false
          }, h("path", { d: "M16 4l4 4M3 21l5-1L21 7a2.8 2.8 0 0 0-4-4L4 16l-1 5Z" }))));
      }

      // Flatten deep branches to avoid exhausting the JS stack. Keep the first
      // four levels of connector lines and label the supervisor on deeper rows.
      function branch(start) {
        const rows = [];
        const pending = [{ person: start, rails: [], depth: 0, last: true }];
        while (pending.length) {
          const { person, rails, depth, last } = pending.pop();
          rows.push(h("li", { key: person.id, className: "oc-row" },
            rails.map((continues, index) => {
              const elbow = index === depth - 1;
              return h("span", {
                key: index, "aria-hidden": true,
                className: "oc-rail" + (elbow ? (last ? " oc-end" : " oc-fork") : continues ? " oc-line" : "")
              });
            }),
            personCard(person, depth > 4)));
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
        let classes = "oc-team";
        if (direct.length) {
          const layout = direct.length === 1 ? "oc-single" : direct.length <= 3 ? "oc-columns" : "oc-many";
          classes += " oc-has-team " + layout;
        }
        return h("li", { className: classes, key: person.id },
          h("div", { className: "oc-lead" }, personCard(person, false, true)),
          direct.length > 0 && h("ul", {
            className: "oc-lanes", "aria-label": "Direct reports to " + chart.nameOf(person), style: { "--oc-count": direct.length }
          }, direct.map(child => h("li", { key: child.id, className: "oc-lane" }, branch(child)))));
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
          data && h("span", { className: "oc-count" }, data.positions.length + (data.positions.length === 1 ? " staff member" : " staff members")),
          h("span", { role: "status", className: "oc-notice" }, notice?.message)),
        !data && (error
          ? h("div", { className: "oc-state" }, h("p", { role: "alert", className: "oc-error" }, error),
              h("button", { type: "button", className: "oc-secondary", onClick: () => setAttempt(attempt + 1) }, "Try again"))
          : h("p", { role: "status" }, "Loading chart…")),
        editing && editor(),
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
