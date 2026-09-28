export function stoicMcpAppHtml(origin: string) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Stoic Connector</title>
  <style>
    :root{color-scheme:light;--ink:#20231f;--muted:#758075;--line:#e3e8df;--paper:#f5f6f2;--green:#286448;--mint:#e8f2e8;--amber:#f7f0df;font:14px/1.5 Inter,ui-sans-serif,system-ui,-apple-system,sans-serif}
    *{box-sizing:border-box}body{margin:0;background:transparent;color:var(--ink)}button,input,textarea,select{font:inherit}button{cursor:pointer}
    .shell{padding:16px;max-width:900px;margin:auto}.head{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:12px}.brand{font-size:15px;font-weight:650;letter-spacing:-.02em}.brand span{color:var(--green);font-weight:450}.head-actions{display:flex;align-items:center;gap:9px}.status{font-size:11px;color:var(--muted)}
    .button{border:1px solid #ccd8cb;border-radius:7px;background:white;color:var(--green);padding:7px 10px;font-size:11px;font-weight:600}.button.primary{background:var(--green);border-color:var(--green);color:white}.button:disabled{opacity:.5;cursor:default}
    .summary{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 13px}.pill{padding:5px 9px;border:1px solid var(--line);border-radius:20px;background:white;color:#536153;font-size:10px}.grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.1fr);gap:12px}.panel{min-width:0;padding:13px;border:1px solid var(--line);border-radius:10px;background:#fff}.panel h2{margin:0;font-size:12px;font-weight:650}.panel-head{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px}.panel-head select{max-width:55%;padding:6px 8px;border:1px solid var(--line);border-radius:6px;background:white;color:var(--ink);font-size:10px}
    .list{display:grid;gap:8px;max-height:300px;overflow:auto}.card{padding:10px;border:1px solid var(--line);border-radius:8px;background:var(--paper)}.card-top{display:flex;justify-content:space-between;align-items:start;gap:8px}.card strong{font-size:11px}.card p{margin:5px 0 8px;color:#58645a;font-size:10px;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere}.tag{border-radius:4px;padding:3px 6px;background:var(--mint);color:var(--green);font-size:9px;text-transform:capitalize;white-space:nowrap}.tag.blocked,.tag.proposed{background:var(--amber);color:#795927}.actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:7px}.actions .button{padding:5px 7px;font-size:9px}.update-input,textarea,input,select{width:100%;padding:8px;border:1px solid var(--line);border-radius:6px;background:white;color:var(--ink);font-size:10px}textarea{min-height:64px;resize:vertical}.board-list{display:grid;gap:7px;max-height:240px;overflow:auto}.message{padding:8px 9px;border-radius:8px;background:var(--paper);overflow-wrap:anywhere}.message strong{font-size:9px;color:#46644e}.message small{display:block;color:#8b9589;font-size:8px}.message p{margin:5px 0 0;font-size:10px;line-height:1.5;white-space:pre-wrap}.composer{display:grid;gap:7px;margin-top:9px}.form{display:grid;gap:7px}.form-row{display:grid;grid-template-columns:1fr 1fr;gap:7px}.empty{padding:16px 8px;color:#8a948a;font-size:10px;text-align:center}.error{color:#a44837;font-size:10px}.spacer{margin-top:12px}.hidden{display:none!important}
    @media(max-width:620px){.shell{padding:12px}.grid{grid-template-columns:1fr}.head{align-items:flex-start}.status{max-width:140px;text-align:right}.list{max-height:240px}}
  </style>
</head>
<body>
  <main class="shell" id="stoic-app" aria-label="Stoic Connector workspace widget">
    <header class="head"><div class="brand">stoic <span>connector</span></div><div class="head-actions"><span class="status" id="connection-status" role="status">Connecting…</span><button class="button" id="refresh-button" type="button">Refresh</button></div></header>
    <div class="summary" id="workspace-summary"></div>
    <div class="grid">
      <section class="panel"><div class="panel-head"><h2>Agent work</h2><select id="project-select" aria-label="Select project"></select></div><div class="list" id="handoff-list"></div><div class="form spacer hidden" id="new-project-form"><input id="new-project-name" minlength="2" maxlength="100" placeholder="New project name"><button class="button" id="create-project-button" type="button">Create project</button></div><form class="form spacer hidden" id="new-handoff-form"><h2>Assign work</h2><div class="form-row"><input id="handoff-title" minlength="3" maxlength="160" placeholder="Task title" required><select id="assignee-select" aria-label="Assign to"></select></div><textarea id="handoff-goal" minlength="10" maxlength="10000" placeholder="Describe the expected result and constraints" required></textarea><button class="button primary" type="submit">Create handoff</button></form></section>
      <section class="panel"><div class="panel-head"><h2>Project conversation</h2><span class="status" id="board-status"></span></div><div class="board-list" id="board-list"></div><form class="composer" id="message-form"><textarea id="message-body" maxlength="12000" placeholder="Share a question, answer, or project update…" required></textarea><button class="button" type="submit">Post message</button></form></section>
    </div>
    <p class="error hidden" id="error-message" role="alert"></p>
  </main>
  <script type="module" src="${origin}/stoic-mcp-widget.js"></script>
</body>
</html>`;
}
