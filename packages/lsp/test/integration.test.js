import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { Buffer } from "node:buffer";
import process from "node:process";
import { clearTimeout, setTimeout } from "node:timers";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const serverPath = join(packageRoot, "out", "server.js");
const messageSeparator = Buffer.from("\r\n\r\n");

function encodeMessage(message) {
  const body = Buffer.from(JSON.stringify(message), "utf8");
  return Buffer.concat([
    Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, "ascii"),
    body,
  ]);
}

function createProtocolClient(server) {
  let buffer = Buffer.alloc(0);
  const messages = [];
  const waiters = [];
  let streamError;

  const rejectWaiters = (error) => {
    streamError = error;
    while (waiters.length > 0) {
      waiters.shift().reject(error);
    }
  };

  const publish = (message) => {
    const waiter = waiters.shift();
    if (waiter) {
      waiter.resolve(message);
    } else {
      messages.push(message);
    }
  };

  server.stdout.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);

    while (true) {
      const headerEnd = buffer.indexOf(messageSeparator);
      if (headerEnd === -1) {
        return;
      }

      const headers = buffer.subarray(0, headerEnd).toString("ascii");
      const lengthMatch = headers.match(/^Content-Length: (\d+)$/);
      if (!lengthMatch) {
        rejectWaiters(
          new Error(`Invalid LSP response headers: ${JSON.stringify(headers)}`),
        );
        return;
      }

      const bodyLength = Number(lengthMatch[1]);
      const messageEnd = headerEnd + messageSeparator.length + bodyLength;
      if (buffer.length < messageEnd) {
        return;
      }

      const bodyStart = headerEnd + messageSeparator.length;
      const body = buffer.subarray(bodyStart, messageEnd).toString("utf8");
      buffer = buffer.subarray(messageEnd);

      try {
        publish(JSON.parse(body));
      } catch (error) {
        rejectWaiters(error);
        return;
      }
    }
  });

  server.stdout.on("error", rejectWaiters);
  server.on("error", rejectWaiters);

  return {
    notify(method, params) {
      server.stdin.write(encodeMessage({ jsonrpc: "2.0", method, params }));
    },
    async request(id, method, params) {
      server.stdin.write(encodeMessage({ jsonrpc: "2.0", id, method, params }));

      if (streamError) {
        throw streamError;
      }
      if (messages.length > 0) {
        return messages.shift();
      }

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error(`Timed out waiting for response to ${method}`));
        }, 2000);
        waiters.push({
          resolve: (message) => {
            clearTimeout(timeout);
            resolve(message);
          },
          reject: (error) => {
            clearTimeout(timeout);
            reject(error);
          },
        });
      });
    },
  };
}

test("built stdio server returns a UTF-16 hover range", async () => {
  await execFileAsync(process.execPath, ["scripts/build.mjs"], {
    cwd: packageRoot,
  });

  const server = spawn(process.execPath, [serverPath, "--stdio"], {
    cwd: packageRoot,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const client = createProtocolClient(server);

  try {
    const initialize = await client.request(1, "initialize", {
      processId: null,
      rootUri: null,
      capabilities: {},
    });

    assert.equal(initialize.jsonrpc, "2.0");
    assert.equal(initialize.id, 1);
    assert.equal(initialize.result.capabilities.textDocumentSync, 2);
    assert.equal(initialize.result.capabilities.hoverProvider, true);

    client.notify("initialized", {});
    const uri = "file:///workspace/example.txt";
    client.notify("textDocument/didOpen", {
      textDocument: {
        uri,
        languageId: "plaintext",
        version: 1,
        text: '😀 "hello",',
      },
    });

    const knownHover = await client.request(2, "textDocument/hover", {
      textDocument: { uri },
      position: { line: 0, character: 6 },
    });

    assert.deepEqual(knownHover.result, {
      contents: { kind: "markdown", value: "**hello**: 你好" },
      range: {
        start: { line: 0, character: 4 },
        end: { line: 0, character: 9 },
      },
    });

    const unopenedHover = await client.request(3, "textDocument/hover", {
      textDocument: { uri: "file:///workspace/unopened.txt" },
      position: { line: 0, character: 1 },
    });
    assert.equal(unopenedHover.result, null);

    const emptyPositionHover = await client.request(4, "textDocument/hover", {
      textDocument: { uri },
      position: { line: 0, character: 9 },
    });
    assert.equal(emptyPositionHover.result, null);
  } finally {
    server.kill();
  }
});
