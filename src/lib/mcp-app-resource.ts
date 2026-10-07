export function stoicMcpAppHtml(origin: string) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <title>Stoic Connector</title>
  <link rel="stylesheet" href="${origin}/stoic-mcp-widget.css?v=20261007-shadcn-mcp-v3">
</head>
<body>
  <div id="stoic-root"></div>
  <script type="module" src="${origin}/stoic-mcp-widget.js?v=20261007-shadcn-mcp-v3"></script>
</body>
</html>`;
}
