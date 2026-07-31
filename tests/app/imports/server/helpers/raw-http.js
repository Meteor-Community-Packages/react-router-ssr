import net from 'net';

// Hostile requests have to go out as raw bytes. `fetch`/undici and even
// `http.request` refuse (or silently normalise) a `Host` header containing
// `/`, `\` or a space, so a test built on them would never send what an
// attacker actually sends. We write the request line and headers onto a
// socket ourselves and parse the response by hand.

// Under `meteor test` the --port value is the *proxy* port; PORT is the inner
// HTTP server the tests talk to directly, and ROOT_URL points at the proxy.
export const appPort = () => Number(process.env.PORT) || 3737;

// The host the package falls back to when the client's Host header is missing
// or unusable — the app's own ROOT_URL host, exactly as the fix derives it.
export const rootUrlHost = () => {
  try {
    return new URL(process.env.ROOT_URL).host || 'localhost';
  } catch {
    return 'localhost';
  }
};

const decodeChunked = body => {
  let out = '';
  let rest = body;
  for (;;) {
    const eol = rest.indexOf('\r\n');
    if (eol === -1) break;
    const size = parseInt(rest.slice(0, eol).split(';')[0], 16);
    if (!Number.isFinite(size)) break;
    if (size === 0) break;
    out += rest.slice(eol + 2, eol + 2 + size);
    rest = rest.slice(eol + 2 + size + 2);
  }
  return out;
};

const parseResponse = raw => {
  const split = raw.indexOf('\r\n\r\n');
  if (split === -1) {
    return { complete: false, raw };
  }
  const head = raw.slice(0, split);
  let body = raw.slice(split + 4);

  const [statusLine, ...headerLines] = head.split('\r\n');
  const headers = {};
  for (const line of headerLines) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    headers[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim();
  }

  if ((headers['transfer-encoding'] || '').includes('chunked')) {
    body = decodeChunked(body);
  }

  return {
    complete: true,
    status: Number(statusLine.split(' ')[1]),
    statusLine,
    headers,
    body,
    raw,
  };
};

// Send a request as literal bytes and resolve with the parsed response.
//
// Rejects if the server never finishes the response inside `timeout` — that is
// how the /__cordova hang is detected: a hanging request must FAIL the test,
// never stall the suite.
export const rawRequest = ({
  target,
  method = 'GET',
  headers = {},
  version = 'HTTP/1.1',
  timeout = 5000,
  port = appPort(),
} = {}) => new Promise((resolve, reject) => {
  const socket = net.connect(port, '127.0.0.1');
  socket.setNoDelay(true);

  let raw = '';
  let settled = false;

  const finish = (fn, value) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    socket.destroy();
    fn(value);
  };

  const timer = setTimeout(() => {
    const seen = parseResponse(raw);
    finish(reject, new Error(
      `No complete response for ${method} ${target} within ${timeout}ms. ` +
      (seen.complete
        ? `Headers arrived ("${seen.statusLine}") but the body was never terminated — the response is hung.`
        : `Received ${raw.length} byte(s) and no header terminator — the response is hung.`),
    ));
  }, timeout);

  socket.on('connect', () => {
    const lines = [`${method} ${target} ${version}`];
    for (const [name, value] of Object.entries(headers)) {
      if (value === null || value === undefined) continue;
      lines.push(`${name}: ${value}`);
    }
    lines.push('Connection: close', '', '');
    socket.write(lines.join('\r\n'));
  });

  socket.on('data', chunk => { raw += chunk.toString('binary'); });
  socket.on('end', () => {
    const parsed = parseResponse(raw);
    if (parsed.complete) {
      finish(resolve, parsed);
    } else {
      finish(reject, new Error(`Malformed/empty response for ${method} ${target}: ${JSON.stringify(raw.slice(0, 200))}`));
    }
  });
  socket.on('error', error => finish(reject, error));
});

// Default headers for a normal, well-behaved browser request.
export const browserHeaders = (overrides = {}) => ({
  Host: `localhost:${appPort()}`,
  Accept: 'text/html,application/xhtml+xml',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  ...overrides,
});

const unescapeHtml = text => text
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&#x27;/g, "'")
  .replace(/&amp;/g, '&');

// Pull one of the marker elements the test app's routes render. React escapes
// text content, so undo that before comparing against literal values.
export const marker = (body, id) => {
  const match = body.match(new RegExp(`<pre id="${id}"[^>]*>([\\s\\S]*?)</pre>`));
  return match ? unescapeHtml(match[1]) : null;
};

// mocha starts as soon as Meteor.startup runs, which is *before* the HTTP
// server is listening — without this the first few tests race the boot and fail
// with ECONNREFUSED, which is indistinguishable from a real regression.
let readyPromise = null;
export const waitForServer = ({ attempts = 120, interval = 250 } = {}) => {
  if (!readyPromise) {
    readyPromise = (async () => {
      let lastError;
      for (let i = 0; i < attempts; i += 1) {
        try {
          const res = await rawRequest({ target: '/', headers: browserHeaders(), timeout: 5000 });
          if (res.status === 200) return;
          lastError = new Error(`GET / returned ${res.status}`);
        } catch (error) {
          lastError = error;
        }
        await new Promise(resolve => setTimeout(resolve, interval));
      }
      throw new Error(`App server never became ready: ${lastError && lastError.message}`);
    })();
  }
  return readyPromise;
};
